import type { VercelRequest, VercelResponse } from '@vercel/node';

interface RouteRequestBody {
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
}

const ORS_URL =
  'https://api.openrouteservice.org/v2/directions/driving-car/geojson';

/**
 * The public ORS endpoint caps each segment between consecutive coordinates
 * at ~100 km (server-side, regardless of plan). For longer trips we insert
 * via-points along the great-circle so each leg stays under the cap.
 *
 * Multi-coordinate requests do NOT return `alternative_routes`. We instead
 * generate 3 *real* alternatives by varying ORS options:
 *   A: recommended (default)
 *   B: avoid_features ["tollways"] (the no-toll alternative)
 *   C: preference "shortest" (less highway-heavy)
 */
const SEGMENT_CAP_KM = 90; // safety margin under the 100 km server cap
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

/** Return [origin, via..., destination] coordinate list with no leg > 90 km. */
function buildCoordinates(
  origin: { lat: number; lon: number },
  destination: { lat: number; lon: number },
): number[][] {
  const total = haversineKm(origin, destination);
  const segments = Math.max(1, Math.ceil(total / SEGMENT_CAP_KM));
  const coords: number[][] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    coords.push([
      origin.lon + (destination.lon - origin.lon) * t,
      origin.lat + (destination.lat - origin.lat) * t,
    ]);
  }
  return coords;
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

interface ORSFeature {
  geometry: ORSGeometry;
  properties: {
    summary: { distance: number; duration: number };
    ascent?: number;
    descent?: number;
    extras?: Record<string, { values: number[][] }>;
  };
  type: 'Feature';
}

interface ORSFeatureCollection {
  type: 'FeatureCollection';
  features: ORSFeature[];
  bbox?: [number, number, number, number];
}

async function callORS(
  token: string,
  coords: number[][],
  opts: VariantOptions,
): Promise<{ ok: true; feature: ORSFeature } | { ok: false; status: number; detail: string }> {
  const body: Record<string, unknown> = {
    coordinates: coords,
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

/** Deduplicate features that came back identical (same distance to within 1 km AND same duration to within 30 s). */
function dedupe(features: ORSFeature[]): ORSFeature[] {
  const out: ORSFeature[] = [];
  for (const f of features) {
    const dup = out.find(
      (g) =>
        Math.abs(g.properties.summary.distance - f.properties.summary.distance) < 1000 &&
        Math.abs(g.properties.summary.duration - f.properties.summary.duration) < 30,
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

  const coords = buildCoordinates(body.origin, body.destination);

  try {
    const results = await Promise.all(
      VARIANTS.map((v) => callORS(token, coords, v)),
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
