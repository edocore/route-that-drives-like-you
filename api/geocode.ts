import type { VercelRequest, VercelResponse } from '@vercel/node';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
) {
  const q = (req.query.q as string)?.trim();
  if (!q) {
    res.status(400).json({ error: 'q (query) parameter required' });
    return;
  }

  const ua = process.env.NOMINATIM_USER_AGENT || 'routefit-demo (contact@example.com)';
  const url = `${NOMINATIM}?format=json&limit=5&q=${encodeURIComponent(q)}`;

  try {
    const r = await fetch(url, {
      headers: {
        'User-Agent': ua,
        'Accept-Language': 'en',
      },
    });
    if (!r.ok) {
      res.status(r.status).json({ error: 'Nominatim error' });
      return;
    }
    const data = (await r.json()) as Array<{
      display_name: string;
      lat: string;
      lon: string;
      type: string;
      importance: number;
    }>;

    const results = data.map((d) => ({
      label: d.display_name,
      lat: parseFloat(d.lat),
      lon: parseFloat(d.lon),
      type: d.type,
      importance: d.importance,
    }));

    res
      .status(200)
      .setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800')
      .json({ results });
  } catch (err) {
    res
      .status(502)
      .json({ error: 'Geocode failed', detail: (err as Error).message });
  }
}
