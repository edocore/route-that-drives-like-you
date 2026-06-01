import { CULTURE_PRESETS } from '../data/culture';
import { vehicleSummary } from '../data/vehicles';
import type { Profile, RouteCandidate } from '../types';
import { experienceLabel, styleLabel } from './weights';

export function buildSummaryPrompt(args: {
  route: RouteCandidate;
  candidates: RouteCandidate[];
  profile: Profile;
  index: number;
  total: number;
  fastest: RouteCandidate;
}): string {
  const { route, candidates, profile, index, total, fastest } = args;
  const dt = Math.round(route.stats.durationMin - fastest.stats.durationMin);
  const deltaStr = dt <= 0 ? 'fastest option' : `+${dt} min vs fastest`;

  const culture = CULTURE_PRESETS[profile.culture].label;
  const altTable = candidates
    .filter((c) => c.id !== route.id)
    .map(
      (c) =>
        `  - ${c.label}: ${Math.round(c.stats.durationMin)} min, €${c.stats.tollEur.toFixed(2)} tolls, ${c.stats.elevationGainM} m climb, ${c.stats.highwaySharePct}% highway`,
    )
    .join('\n');

  return `You are a concise travel-route explainer. Given a route's stats and a driver
profile, write 2–3 sentences (max 60 words) explaining why this route fits
the driver. Lead with the headline tradeoff. Use plain English. No emojis.
No bullet points.

Driver profile:
- Style: ${styleLabel(profile.styleScore)} (${profile.styleScore}/100)
- Experience: ${experienceLabel(profile.yearsDriving, profile.kmPerYear)}
- Culture: ${culture}
- Vehicle: ${vehicleSummary(profile.vehicle)}

Route option ${index + 1} of ${total} (${route.label}):
- Distance: ${route.stats.distanceKm.toFixed(0)} km
- Estimated time: ${Math.round(route.stats.durationMin)} min (${deltaStr})
- Toll cost: €${route.stats.tollEur.toFixed(2)}
- Fuel cost: €${route.stats.fuelEur.toFixed(2)}
- Elevation gain: ${route.stats.elevationGainM} m
- Highway share: ${route.stats.highwaySharePct}%
- Curviness index: ${route.stats.curvinessIndex}
- Unlit km after sunset at ETA: ${route.stats.unlitKmAfterSunset} km

Other options for context:
${altTable}

Write the explainer now:`;
}
