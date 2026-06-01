import type { VercelRequest, VercelResponse } from '@vercel/node';

interface RouteRequestBody {
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
}

// Use the base directions endpoint with Accept: application/geo+json.
// The legacy /geojson suffix is being deprecated and rejects requests in
// some account configurations.
const ORS_URL =
  'https://api.openrouteservice.org/v2/directions/driving-car';

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

function buildLegEndpoints(
  origin: { lat: number; lon: number },
  destination: { lat: number; lon: number },
): { lat: number; lon: number }[] {
  const total = haversineKm(origin, destination);
  const segments = Math.max(1, Math.ceil(total / LEG_CAP_KM));
  const points: { lat: number; lon: number }[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    points.push({
      lon: origin.lon + (destination.lon - origin.lon) * t,
      lat: origin.lat + (destination.lat - origin.lat) * t,
    });
  }
  return points;
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
  const data = (await r.json()) as ORSFeatureCollection;
  const feature = data.features?.[0];
  if (!feature) {
    return { ok: false, status: 502, detail: 'ORS returned no features' };
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

  const legEndpoints = buildLegEndpoints(body.origin, body.destination);

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
