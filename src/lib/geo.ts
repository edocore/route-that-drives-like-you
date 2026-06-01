import type { LatLng } from '../types';

const EARTH_R_KM = 6371;

export function haversineKm(a: LatLng, b: LatLng): number {
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

export function bearingDeg(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const dLon = toRad(b.lon - a.lon);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x =
    Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const brng = (Math.atan2(y, x) * 180) / Math.PI;
  return (brng + 360) % 360;
}

export function bboxOf(coords: [number, number][]): [number, number, number, number] {
  let minLon = Infinity,
    minLat = Infinity,
    maxLon = -Infinity,
    maxLat = -Infinity;
  for (const [lon, lat] of coords) {
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLon, minLat, maxLon, maxLat];
}

/** Compute curviness as 1 - (straight-line distance / route distance). 0..~0.6 typical. */
export function curvinessIndex(
  coords: [number, number][],
  routeDistanceKm: number,
): number {
  if (coords.length < 2 || routeDistanceKm < 1) return 0;
  const a = { lon: coords[0][0], lat: coords[0][1] };
  const b = {
    lon: coords[coords.length - 1][0],
    lat: coords[coords.length - 1][1],
  };
  const straight = haversineKm(a, b);
  if (straight < 0.1) return 0;
  const idx = 1 - straight / routeDistanceKm;
  return Math.max(0, Math.min(1, idx));
}

/** Sample positions along a coord polyline at given distance fractions (0..1). */
export function sampleAlong(
  coords: [number, number][],
  fractions: number[],
): { lon: number; lat: number; cumKm: number; totalKm: number }[] {
  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = { lon: coords[i - 1][0], lat: coords[i - 1][1] };
    const b = { lon: coords[i][0], lat: coords[i][1] };
    const d = haversineKm(a, b);
    segLens.push(d);
    total += d;
  }
  const out: { lon: number; lat: number; cumKm: number; totalKm: number }[] = [];
  for (const f of fractions) {
    const target = total * f;
    let acc = 0;
    for (let i = 0; i < segLens.length; i++) {
      if (acc + segLens[i] >= target || i === segLens.length - 1) {
        const remain = target - acc;
        const t = segLens[i] > 0 ? remain / segLens[i] : 0;
        const a = coords[i];
        const b = coords[i + 1] ?? coords[i];
        out.push({
          lon: a[0] + (b[0] - a[0]) * t,
          lat: a[1] + (b[1] - a[1]) * t,
          cumKm: target,
          totalKm: total,
        });
        break;
      }
      acc += segLens[i];
    }
  }
  return out;
}
