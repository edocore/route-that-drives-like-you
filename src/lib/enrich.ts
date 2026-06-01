import SunCalc from 'suncalc';
import { lookupVehicle } from '../data/vehicles';
import type {
  Profile,
  RouteCandidate,
  RouteStats,
  VehicleSpec,
} from '../types';
import { curvinessIndex, sampleAlong } from './geo';

/**
 * Hand-tuned regional toll rates (€/km on tolled segments).
 * Coverage: IT / FR / CH / DE only. Anywhere else falls back to a generic rate.
 * Detection is by the rough bbox of the route midpoint — crude but disclosed in README.
 */
interface RegionRate {
  perKm: number;
  fuelPerLiter: number;
  evPerKwh: number;
  label: string;
  bbox: [number, number, number, number]; // minLon, minLat, maxLon, maxLat
}

const REGIONS: RegionRate[] = [
  {
    label: 'IT',
    perKm: 0.085,
    fuelPerLiter: 1.85,
    evPerKwh: 0.45,
    bbox: [6.6, 36.5, 18.8, 47.1],
  },
  {
    label: 'FR',
    perKm: 0.095,
    fuelPerLiter: 1.9,
    evPerKwh: 0.4,
    bbox: [-5.2, 41.3, 9.6, 51.2],
  },
  {
    label: 'CH',
    // Switzerland uses an annual vignette; approximate per-km charge for tunnels (Gotthard etc.)
    perKm: 0.06,
    fuelPerLiter: 1.78,
    evPerKwh: 0.35,
    bbox: [5.9, 45.8, 10.5, 47.8],
  },
  {
    label: 'DE',
    perKm: 0.0, // Autobahn free for cars
    fuelPerLiter: 1.82,
    evPerKwh: 0.42,
    bbox: [5.8, 47.2, 15.1, 55.1],
  },
];

const DEFAULT_REGION: RegionRate = {
  label: 'Default',
  perKm: 0.07,
  fuelPerLiter: 1.65,
  evPerKwh: 0.3,
  bbox: [-180, -90, 180, 90],
};

function detectRegion(midLon: number, midLat: number): RegionRate {
  for (const r of REGIONS) {
    const [minLon, minLat, maxLon, maxLat] = r.bbox;
    if (midLon >= minLon && midLon <= maxLon && midLat >= minLat && midLat <= maxLat) {
      return r;
    }
  }
  return DEFAULT_REGION;
}

interface RawORSExtras {
  // Each entry: [fromIdx, toIdx, value]
  tollways?: { values: number[][] };
  surface?: { values: number[][] };
  waytype?: { values: number[][] };
  roadaccessrestrictions?: { values: number[][] };
}

interface RawORSFeature {
  geometry: GeoJSON.LineString;
  properties: {
    summary: { distance: number; duration: number };
    extras?: RawORSExtras;
    ascent?: number;
    descent?: number;
  };
}

/** Normalize ORS waytype enums to a "highway" share (0..1). */
function highwayShareFromWaytype(
  extras: RawORSExtras | undefined,
  totalCoords: number,
): number {
  if (!extras?.waytype || totalCoords < 2) return 0.4;
  // ORS waytype: 1 state road, 2 road, 3 street, 4 path, 5 track, 6 cycleway, 7 footway, 8 steps, 9 ferry, 10 construction
  // ORS uses different scheme depending on profile; we approximate "highway" as type 0 or 1
  let highwayLen = 0;
  let totalLen = 0;
  for (const [from, to, val] of extras.waytype.values) {
    const len = Math.max(0, to - from);
    totalLen += len;
    if (val === 1 || val === 0) highwayLen += len;
  }
  if (totalLen === 0) return 0.4;
  return highwayLen / totalLen;
}

/** Toll fraction (0..1) of route length carried on tolled segments. */
function tollShareFromExtras(
  extras: RawORSExtras | undefined,
  totalCoords: number,
): number {
  if (!extras?.tollways || totalCoords < 2) return 0;
  let tolledLen = 0;
  let totalLen = 0;
  for (const [from, to, val] of extras.tollways.values) {
    const len = Math.max(0, to - from);
    totalLen += len;
    if (val === 1) tolledLen += len;
  }
  if (totalLen === 0) return 0;
  return tolledLen / totalLen;
}

/** Approx km that fall on unlit segments. We treat secondary/track/path as unlit fallback. */
function unlitShareFromExtras(extras: RawORSExtras | undefined): number {
  if (!extras?.waytype) return 0.4;
  let unlit = 0;
  let total = 0;
  for (const [from, to, val] of extras.waytype.values) {
    const len = Math.max(0, to - from);
    total += len;
    // Treat anything non-highway non-state as likely unlit
    if (val >= 2) unlit += len;
  }
  if (total === 0) return 0.4;
  return unlit / total;
}

interface EnrichInput {
  feature: RawORSFeature;
  profile: Profile;
  departureISO: string;
  /** Index into VARIANT_LABELS for the route's variant intent. */
  index: number;
}

const VARIANT_LABELS = ['Recommended', 'No tolls', 'Shortest', 'Alternative'];

export function enrichRoute({
  feature,
  profile,
  departureISO,
  index,
}: EnrichInput): RouteCandidate {
  const coords = feature.geometry.coordinates as [number, number][];
  const distMeters = feature.properties.summary.distance;
  const durSec = feature.properties.summary.duration;
  const distanceKm = distMeters / 1000;
  const durationMin = durSec / 60;
  const ascent = feature.properties.ascent ?? 0;

  const midLon = coords[Math.floor(coords.length / 2)][0];
  const midLat = coords[Math.floor(coords.length / 2)][1];
  const region = detectRegion(midLon, midLat);

  const veh = lookupVehicle(profile.vehicle);

  const hwyShare = highwayShareFromWaytype(feature.properties.extras, coords.length);
  const tollShare = tollShareFromExtras(feature.properties.extras, coords.length);
  const unlitShare = unlitShareFromExtras(feature.properties.extras);

  const tollEur = tollShare * distanceKm * region.perKm * veh.tollClassMultiplier;
  const fuelEur =
    profile.vehicle.fuel === 'ev'
      ? // EV: ~18 kWh / 100 km baseline scaled by hill penalty
        ((18 * veh.hillPenalty) / 100) * distanceKm * region.evPerKwh
      : (veh.litersPer100km / 100) * distanceKm * region.fuelPerLiter;

  const curveIdx = curvinessIndex(coords, distanceKm);
  const unlitKm = unlitShare * distanceKm;
  const unlitKmAfterSunset = computeUnlitAfterSunset({
    coords,
    distanceKm,
    durationMin,
    departureISO,
    unlitKm,
  });

  const stats: RouteStats = {
    distanceKm,
    durationMin,
    elevationGainM: Math.round(ascent),
    highwaySharePct: Math.round(hwyShare * 100),
    curvinessIndex: Number(curveIdx.toFixed(3)),
    tollEur: Math.round(tollEur * 100) / 100,
    fuelEur: Math.round(fuelEur * 100) / 100,
    unlitKmAfterSunset: Math.round(unlitKmAfterSunset * 10) / 10,
  };

  return {
    id: `route-${index}`,
    label: VARIANT_LABELS[index] ?? `Route ${index + 1}`,
    geometry: feature.geometry,
    stats,
    score: 0,
    rank: 0,
    summary: '',
    summarySource: 'pending',
  };
}

function computeUnlitAfterSunset(args: {
  coords: [number, number][];
  distanceKm: number;
  durationMin: number;
  departureISO: string;
  unlitKm: number;
}): number {
  const { coords, durationMin, departureISO, unlitKm } = args;
  const departure = new Date(departureISO);
  if (Number.isNaN(departure.getTime())) return 0;

  // Sample 6 points along the route, check if local sun is below horizon at the time we'd be there.
  const samples = sampleAlong(coords, [0.1, 0.3, 0.5, 0.7, 0.9, 1.0]);
  let darkFraction = 0;
  for (const s of samples) {
    const t = new Date(
      departure.getTime() + (durationMin * 60_000 * s.cumKm) / s.totalKm,
    );
    const pos = SunCalc.getPosition(t, s.lat, s.lon);
    if (pos.altitude < 0) darkFraction += 1;
  }
  darkFraction /= samples.length;
  return unlitKm * darkFraction;
}

/** Estimate fuel/toll/curviness without ORS extras (for the A* visualizer fallback). */
export function statsFromCoords(
  coords: [number, number][],
  distanceKm: number,
  durationMin: number,
  vehicle: VehicleSpec,
): RouteStats {
  const midLon = coords[Math.floor(coords.length / 2)][0];
  const midLat = coords[Math.floor(coords.length / 2)][1];
  const region = detectRegion(midLon, midLat);
  const veh = lookupVehicle(vehicle);
  const fuelEur =
    vehicle.fuel === 'ev'
      ? ((18 * veh.hillPenalty) / 100) * distanceKm * region.evPerKwh
      : (veh.litersPer100km / 100) * distanceKm * region.fuelPerLiter;

  return {
    distanceKm,
    durationMin,
    elevationGainM: 0,
    highwaySharePct: 0,
    curvinessIndex: Number(curvinessIndex(coords, distanceKm).toFixed(3)),
    tollEur: 0,
    fuelEur: Math.round(fuelEur * 100) / 100,
    unlitKmAfterSunset: 0,
  };
}
