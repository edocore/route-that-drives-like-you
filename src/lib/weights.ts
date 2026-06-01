import { CULTURE_PRESETS } from '../data/culture';
import { lookupVehicle } from '../data/vehicles';
import type { Profile, Weights } from '../types';

/** Convert a Profile into the default weight vector. Sliders override per-key. */
export function profileToWeights(p: Profile): Weights {
  const style = clamp(p.styleScore, 0, 100);
  const exp = clamp(p.experienceScore, 0, 100);
  const cult = CULTURE_PRESETS[p.culture];
  const veh = lookupVehicle(p.vehicle);

  // Apply culture style shift (clamped to keep weights in plausible range)
  const styleAdj = clamp(style + cult.styleShift, 0, 100);

  return {
    w_time: 0.4 + 0.003 * styleAdj, // 0.4..0.7
    w_toll: 0.2,
    w_fuel: 0.15 * veh.fuelCostFactor,
    w_hill: 0.1 * veh.hillPenalty,
    w_night: 0.2 * (1 - exp / 100),
    w_curve: 0.2 * (1 - styleAdj / 100),
    w_hwy: 0.2 + cult.highwayPrefShift,
  };
}

export function styleLabel(score: number): string {
  if (score < 25) return 'cautious';
  if (score < 50) return 'measured';
  if (score < 75) return 'confident';
  return 'assertive';
}

export function experienceLabel(years: number, kmYear: number): string {
  if (years < 2) return `new driver (${years}y)`;
  if (years < 6) return `intermediate (${years}y, ~${formatKm(kmYear)} km/yr)`;
  return `experienced (${years}y, ~${formatKm(kmYear)} km/yr)`;
}

export function experienceScore(years: number, kmYear: number): number {
  // Saturating combination — 10 years and 30k km/year tops out near 100.
  const yScore = Math.min(years / 10, 1) * 60;
  const kmScore = Math.min(kmYear / 30000, 1) * 40;
  return Math.round(yScore + kmScore);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function formatKm(km: number): string {
  if (km >= 1000) return `${(km / 1000).toFixed(0)}k`;
  return String(km);
}

export const DEFAULT_PROFILE: Profile = {
  styleScore: 50,
  experienceScore: 60,
  yearsDriving: 8,
  kmPerYear: 15000,
  culture: 'default',
  vehicle: { class: 'mid', fuel: 'gas', displacement: 'mid' },
};
