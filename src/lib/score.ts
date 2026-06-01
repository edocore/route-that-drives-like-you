import type { RouteCandidate, RouteStats, Weights } from '../types';

/**
 * Min-max normalize one stat across the candidate set.
 * Returns identity (all 0.5) if all values are equal.
 */
function normalize(values: number[]): number[] {
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max - min < 1e-9) return values.map(() => 0.5);
  return values.map((v) => (v - min) / (max - min));
}

export interface ScoredRoute extends RouteCandidate {}

/**
 * Apply the personalized cost function across a candidate set.
 * Lower score wins. Each term normalized 0..1; w_hwy is subtracted (negative weight).
 */
export function scoreCandidates(
  candidates: RouteCandidate[],
  weights: Weights,
): ScoredRoute[] {
  if (candidates.length === 0) return [];

  const stats = candidates.map((c) => c.stats);
  const time = normalize(stats.map((s) => s.durationMin));
  const toll = normalize(stats.map((s) => s.tollEur));
  const fuel = normalize(stats.map((s) => s.fuelEur));
  const hill = normalize(stats.map((s) => s.elevationGainM));
  const night = normalize(stats.map((s) => s.unlitKmAfterSunset));
  const curve = normalize(stats.map((s) => s.curvinessIndex));
  const hwy = normalize(stats.map((s) => s.highwaySharePct));

  const scored = candidates.map((c, i) => ({
    ...c,
    score:
      weights.w_time * time[i] +
      weights.w_toll * toll[i] +
      weights.w_fuel * fuel[i] +
      weights.w_hill * hill[i] +
      weights.w_night * night[i] +
      weights.w_curve * curve[i] -
      weights.w_hwy * hwy[i],
  }));

  scored.sort((a, b) => a.score - b.score);
  scored.forEach((c, i) => (c.rank = i + 1));
  return scored;
}

export function deltaVsBest(stats: RouteStats, best: RouteStats): string {
  const dt = stats.durationMin - best.durationMin;
  if (dt <= 0.5) return 'fastest';
  return `+${Math.round(dt)} min vs fastest`;
}
