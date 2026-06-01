import type { VercelRequest, VercelResponse } from '@vercel/node';

interface RouteRequestBody {
  origin: { lat: number; lon: number };
  destination: { lat: number; lon: number };
  preference?: 'recommended' | 'fastest' | 'shortest';
}

const ORS_URL =
  'https://api.openrouteservice.org/v2/directions/driving-car/geojson';

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

  const orsBody = {
    coordinates: [
      [body.origin.lon, body.origin.lat],
      [body.destination.lon, body.destination.lat],
    ],
    alternative_routes: {
      target_count: 3,
      share_factor: 0.6,
      weight_factor: 1.4,
    },
    elevation: true,
    extra_info: ['surface', 'tollways', 'roadaccessrestrictions', 'waytype'],
    instructions: false,
    preference: body.preference ?? 'recommended',
  };

  try {
    const r = await fetch(ORS_URL, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
        Accept: 'application/geo+json',
      },
      body: JSON.stringify(orsBody),
    });

    if (!r.ok) {
      const text = await r.text();
      res.status(r.status).json({ error: 'ORS error', detail: text });
      return;
    }

    const data = await r.json();
    res
      .status(200)
      .setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=900')
      .json(data);
  } catch (err) {
    res
      .status(502)
      .json({ error: 'ORS fetch failed', detail: (err as Error).message });
  }
}
