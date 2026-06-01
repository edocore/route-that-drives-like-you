import type { RouteCandidate } from '../types';
import { formatDuration } from './utils';

/** Deterministic 2–3 sentence template summary, used as fallback when HF is cold/down. */
export function templateSummary(
  route: RouteCandidate,
  best: RouteCandidate,
  context: { styleLabel: string; experienceLabel: string },
): string {
  const dt = Math.round(route.stats.durationMin - best.stats.durationMin);
  const dollars = route.stats.tollEur - best.stats.tollEur;
  const fuelDelta = route.stats.fuelEur - best.stats.fuelEur;
  const elevDelta =
    route.stats.elevationGainM - best.stats.elevationGainM;

  const parts: string[] = [];

  if (route.id === best.id) {
    parts.push(
      `Top pick. Fastest of the candidates (${formatDuration(route.stats.durationMin)} over ${Math.round(route.stats.distanceKm)} km).`,
    );
    if (route.stats.tollEur > 0)
      parts.push(`Costs €${route.stats.tollEur.toFixed(2)} in tolls — the price of saved time.`);
    else
      parts.push(`No toll charges, mostly highway (${route.stats.highwaySharePct}%).`);
  } else {
    if (dt > 0)
      parts.push(`${dt} min slower than the fastest option.`);
    const savings: string[] = [];
    if (dollars < -0.5)
      savings.push(`€${Math.abs(dollars).toFixed(2)} less in tolls`);
    if (fuelDelta < -0.5)
      savings.push(`€${Math.abs(fuelDelta).toFixed(2)} less in fuel`);
    if (elevDelta < -50)
      savings.push(`${Math.abs(Math.round(elevDelta))} m less climbing`);
    if (savings.length > 0)
      parts.push(`In return: ${savings.join(', ')}.`);
    else if (route.stats.highwaySharePct > best.stats.highwaySharePct + 10)
      parts.push(`Stays on the highway longer (${route.stats.highwaySharePct}%) — easier on a ${context.styleLabel} driver.`);
    else if (route.stats.curvinessIndex > best.stats.curvinessIndex + 0.05)
      parts.push(`More winding — better suited to a ${context.styleLabel} driver.`);
  }

  if (route.stats.unlitKmAfterSunset > 5)
    parts.push(
      `~${route.stats.unlitKmAfterSunset.toFixed(0)} km of unlit road after sunset at this ETA.`,
    );

  return parts.join(' ');
}
