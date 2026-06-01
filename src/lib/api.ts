import type { Endpoint } from '../types';

export interface ORSFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    geometry: GeoJSON.LineString;
    properties: {
      summary: { distance: number; duration: number };
      ascent?: number;
      descent?: number;
      extras?: Record<string, { values: number[][] }>;
    };
  }>;
  bbox?: [number, number, number, number];
}

export async function fetchRoutes(
  origin: { lat: number; lon: number },
  destination: { lat: number; lon: number },
): Promise<ORSFeatureCollection> {
  const r = await fetch('/api/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ origin, destination }),
  });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`Route API ${r.status}: ${text.slice(0, 200)}`);
  }
  return r.json();
}

export interface SummaryResponse {
  text: string;
  model: string;
  source: 'hf';
}

export async function fetchSummary(prompt: string): Promise<string | null> {
  try {
    const r = await fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    if (!r.ok) return null;
    const data = (await r.json()) as SummaryResponse;
    return data.text || null;
  } catch {
    return null;
  }
}

export interface GeocodeResult {
  label: string;
  lat: number;
  lon: number;
}

const GEO_CACHE_KEY = 'routefit:geocode-cache:v1';

function readGeoCache(): Record<string, GeocodeResult[]> {
  try {
    return JSON.parse(localStorage.getItem(GEO_CACHE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeGeoCache(cache: Record<string, GeocodeResult[]>) {
  try {
    localStorage.setItem(GEO_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* localStorage full or unavailable; ignore */
  }
}

export async function geocode(query: string): Promise<GeocodeResult[]> {
  const q = query.trim();
  if (!q) return [];
  const cache = readGeoCache();
  if (cache[q]) return cache[q];

  const r = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
  if (!r.ok) throw new Error(`Geocode API ${r.status}`);
  const data = (await r.json()) as { results: GeocodeResult[] };
  cache[q] = data.results;
  writeGeoCache(cache);
  return data.results;
}

export function endpointFromGeocode(g: GeocodeResult): Endpoint {
  return {
    label: g.label.split(',').slice(0, 2).join(',').trim(),
    lat: g.lat,
    lon: g.lon,
  };
}
