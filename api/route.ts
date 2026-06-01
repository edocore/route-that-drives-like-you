import type { VercelRequest, VercelResponse } from '@vercel/node';

interface RouteRequestBody {
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
}

// /geojson is the only ORS endpoint that returns a FeatureCollection.
// The base /driving-car endpoint returns { routes: [...] } in JSON format
// regardless of the Accept header.
const ORS_URL =
  'https://api.openrouteservice.org/v2/directions/driving-car/geojson';

/**
 * The public ORS endpoint caps the *total approximated route distance*
 * (cumulative sum of great-circle distances between consecutive coordinates
 * in a single request) at 100 km. Multi-coord requests don't help because the
 * cap is on the sum, not per-segment.
 *
 * Workaround: for trips > 90 km we split the great-circle into ≤90 km legs
 * and fire one ORS call per leg. Each call is a 2-coord request, so its
 * approximated distance is below the cap. Then we stitch the geometries,
 * sum the stats, and offset the `extras` indices.
 *
 * Three real alternatives are produced by varying ORS options:
 *   A: recommended (default)
 *   B: avoid_features ["tollways"] (no-toll alternative)
 *   C: preference "shortest" (less highway-heavy)
 *
 * Cost: up to 3 variants × N legs ORS calls per trip. At 2000/day quota,
 * even a 400 km trip (5 legs × 3 variants = 15 calls) gives ~130 trips/day.
 */
const LEG_CAP_KM = 90;
const EARTH_R_KM = 6371;

function haversineKm(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.sqrt(h));
}

async function snapWaypoints(
  token: string,
  waypoints: { lat: number; lon: number }[],
  radius: number,
): Promise<({ lat: number; lon: number } | null)[]> {
  if (waypoints.length === 0) return [];
  try {
    const r = await fetch(
      'https://api.openrouteservice.org/v2/snap/driving-car/json',
      {
        method: 'POST',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          locations: waypoints.map((w) => [w.lon, w.lat]),
          radius,
        }),
      },
    );
    if (!r.ok) return waypoints.map(() => null);
    const data = (await r.json()) as {
      locations: ({ location: [number, number] } | null)[];
    };
    return data.locations.map((loc) =>
      loc ? { lon: loc.location[0], lat: loc.location[1] } : null,
    );
  } catch {
    return waypoints.map(() => null);
  }
}

/**
 * Build leg endpoints by interpolating along the great-circle, then snapping
 * each interpolated point to the nearest road. Origin and destination are
 * always preserved (they came from the user / geocoder and are assumed valid).
 *
 * If a waypoint can't be snapped within 5 km, we perturb it along the
 * great-circle by ±40% of one segment and retry. If that still fails the
 * waypoint is dropped — ORS will then route a longer leg between the
 * remaining anchors, which usually still falls inside the 100 km cap on
 * sparse-road / mountain trips.
 */
async function buildLegEndpoints(
  token: string,
  origin: { lat: number; lon: number },
  destination: { lat: number; lon: number },
): Promise<{ lat: number; lon: number }[]> {
  const total = haversineKm(origin, destination);
  if (total <= LEG_CAP_KM) return [origin, destination];

  const segments = Math.ceil(total / LEG_CAP_KM);
  const interp = (t: number) => ({
    lon: origin.lon + (destination.lon - origin.lon) * t,
    lat: origin.lat + (destination.lat - origin.lat) * t,
  });

  const candidates: { lat: number; lon: number }[] = [];
  for (let i = 1; i < segments; i++) candidates.push(interp(i / segments));

  const snapped = await snapWaypoints(token, candidates, 5000);

  // Retry failed snaps with a perturbation along the great-circle.
  const failedIdx = snapped
    .map((s, i) => (s ? -1 : i))
    .filter((i) => i >= 0);
  if (failedIdx.length > 0) {
    const perturbations: { lat: number; lon: number }[] = [];
    const ownerIdx: number[] = [];
    for (const i of failedIdx) {
      const t = (i + 1) / segments;
      const dt = 0.4 / segments;
      perturbations.push(interp(t + dt), interp(t - dt));
      ownerIdx.push(i, i);
    }
    const retry = await snapWaypoints(token, perturbations, 5000);
    for (let p = 0; p < retry.length; p++) {
      const owner = ownerIdx[p];
      if (retry[p] && !snapped[owner]) snapped[owner] = retry[p];
    }
  }

  const result: { lat: number; lon: number }[] = [origin];
  for (const s of snapped) if (s) result.push(s);
  result.push(destination);
  return result;
}

interface VariantOptions {
  preference?: 'recommended' | 'fastest' | 'shortest';
  avoid_features?: string[];
}

const VARIANTS: VariantOptions[] = [
  { preference: 'recommended' },
  { preference: 'recommended', avoid_features: ['tollways'] },
  { preference: 'shortest' },
];

interface ORSGeometry {
  type: 'LineString';
  coordinates: number[][];
}

interface ORSExtraValues {
  values: number[][];
}

interface ORSFeature {
  type: 'Feature';
  geometry: ORSGeometry;
  properties: {
    summary: { distance: number; duration: number };
    ascent?: number;
    descent?: number;
    extras?: Record<string, ORSExtraValues>;
  };
}

interface ORSFeatureCollection {
  type: 'FeatureCollection';
  features: ORSFeature[];
  bbox?: [number, number, number, number];
}

async function callORSLeg(
  token: string,
  legCoords: number[][],
  opts: VariantOptions,
): Promise<{ ok: true; feature: ORSFeature } | { ok: false; status: number; detail: string }> {
  const body: Record<string, unknown> = {
    coordinates: legCoords,
    elevation: true,
    extra_info: ['surface', 'tollways', 'roadaccessrestrictions', 'waytype'],
    instructions: false,
    preference: opts.preference ?? 'recommended',
  };
  if (opts.avoid_features) {
    body.options = { avoid_features: opts.avoid_features };
  }

  const r = await fetch(ORS_URL, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
      Accept: 'application/geo+json',
    },
    body: JSON.stringify(body),
  });

  if (!r.ok) {
    return { ok: false, status: r.status, detail: await r.text() };
  }
  const raw = await r.text();
  let data: ORSFeatureCollection;
  try {
    data = JSON.parse(raw) as ORSFeatureCollection;
  } catch {
    return {
      ok: false,
      status: 502,
      detail: `ORS returned non-JSON: ${raw.slice(0, 200)}`,
    };
  }
  const feature = data.features?.[0];
  if (!feature) {
    return {
      ok: false,
      status: 502,
      detail: `ORS returned no features. Body: ${raw.slice(0, 300)}`,
    };
  }
  return { ok: true, feature };
}

/** Stitch two ORS features into one. The first coord of `b` should equal the last coord of `a`; we drop it. */
function stitchFeatures(a: ORSFeature, b: ORSFeature): ORSFeature {
  const aCoords = a.geometry.coordinates;
  const bCoords = b.geometry.coordinates;
  // Drop the first coord of b to avoid duplicating the join point
  const merged = aCoords.concat(bCoords.slice(1));

  // Index offset for b's extras: b's index 0 maps to aCoords.length - 1 in merged
  const offset = aCoords.length - 1;

  const mergedExtras: Record<string, ORSExtraValues> = {
    ...(a.properties.extras ?? {}),
  };
  if (b.properties.extras) {
    for (const [key, ext] of Object.entries(b.properties.extras)) {
      const shifted = ext.values.map(([from, to, value]) => [
        from + offset,
        to + offset,
        value,
      ]);
      const existing = mergedExtras[key]?.values ?? [];
      mergedExtras[key] = { values: [...existing, ...shifted] };
    }
  }

  return {
    type: 'Feature',
    geometry: { type: 'LineString', coordinates: merged },
    properties: {
      summary: {
        distance:
          a.properties.summary.distance + b.properties.summary.distance,
        duration:
          a.properties.summary.duration + b.properties.summary.duration,
      },
      ascent: (a.properties.ascent ?? 0) + (b.properties.ascent ?? 0),
      descent: (a.properties.descent ?? 0) + (b.properties.descent ?? 0),
      extras: mergedExtras,
    },
  };
}

/** Build a stitched route for one variant by routing each leg sequentially. */
async function buildVariant(
  token: string,
  legEndpoints: { lat: number; lon: number }[],
  opts: VariantOptions,
): Promise<{ ok: true; feature: ORSFeature } | { ok: false; status: number; detail: string }> {
  let accumulated: ORSFeature | null = null;
  // Use the actual road-snapped end of the previous leg as the start of the next,
  // so the stitched geometry connects without a phantom jump.
  let cursor = legEndpoints[0];
  for (let i = 1; i < legEndpoints.length; i++) {
    const target = legEndpoints[i];
    const result = await callORSLeg(
      token,
      [
        [cursor.lon, cursor.lat],
        [target.lon, target.lat],
      ],
      opts,
    );
    if (!result.ok) return result;
    accumulated = accumulated
      ? stitchFeatures(accumulated, result.feature)
      : result.feature;
    const lastCoord =
      result.feature.geometry.coordinates[
        result.feature.geometry.coordinates.length - 1
      ];
    cursor = { lon: lastCoord[0], lat: lastCoord[1] };
  }
  if (!accumulated) {
    return { ok: false, status: 500, detail: 'no legs produced' };
  }
  return { ok: true, feature: accumulated };
}

function dedupe(features: ORSFeature[]): ORSFeature[] {
  const out: ORSFeature[] = [];
  for (const f of features) {
    const dup = out.find(
      (g) =>
        Math.abs(g.properties.summary.distance - f.properties.summary.distance) < 1500 &&
        Math.abs(g.properties.summary.duration - f.properties.summary.duration) < 60,
    );
    if (!dup) out.push(f);
  }
  return out;
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }
  const token = process.env.ORS_TOKEN;
  if (!token) {
    res.status(500).json({ error: 'ORS_TOKEN not configured on server' });
    return;
  }

  const body = req.body as RouteRequestBody;
  if (!body?.origin || !body?.destination) {
    res.status(400).json({ error: 'origin and destination required' });
    return;
  }

  const legEndpoints = await buildLegEndpoints(token, body.origin, body.destination);

  try {
    const results = await Promise.all(
      VARIANTS.map((v) => buildVariant(token, legEndpoints, v)),
    );

    const successes = results
      .filter((r): r is { ok: true; feature: ORSFeature } => r.ok)
      .map((r) => r.feature);

    if (successes.length === 0) {
      const firstError = results.find((r) => !r.ok) as
        | { ok: false; status: number; detail: string }
        | undefined;
      res.status(firstError?.status ?? 502).json({
        error: 'ORS error',
        detail: firstError?.detail ?? 'all variants failed',
      });
      return;
    }

    const features = dedupe(successes);
    const collection: ORSFeatureCollection = {
      type: 'FeatureCollection',
      features,
    };

    res
      .status(200)
      .setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900')
      .json(collection);
  } catch (err) {
    res
      .status(502)
      .json({ error: 'ORS fetch failed', detail: (err as Error).message });
  }
}
