# RouteFit — Engineering Handoff

*The route that drives like you.*

> Status: spec for v1 prototype. Owner: Edoardo (PM). Audience: solo builder (you + Claude / contractor / yourself in a fresh session).

---

## 1. TL;DR

A web app that takes a driving trip (≥ 50 km, A → B) and re-ranks candidate routes against a **personalization profile** — driving style, experience, driving culture, vehicle — instead of the single "fastest" default that mainstream maps optimize for. Routes come from OpenStreetMap-based open routing (OpenRouteService); a small custom A\* visualizer is included as a "show your work" portfolio layer. AI-generated route summaries via Hugging Face Inference API (free tier).

**Why this exists (portfolio framing):** Most map services optimize one cost function. Real drivers care about cost, hills, night driving, tolls, and how confident they feel on the road. The product-sense artifact is the *cost function and how the user steers it* — not the map.

---

## 2. Problem statement

"Fastest" is a lazy default. The same A → B has multiple correct answers depending on:

- **Driver:** style (cautious ↔ assertive), experience, where they learned to drive.
- **Vehicle:** fuel cost, hill penalty, toll class.
- **Conditions:** time of day, sunset, road lighting, elevation, curviness, traffic variance.

Mainstream maps know almost none of this about the user. Result: the suggestion is generic. RouteFit personalizes the ranking.

---

## 3. Target user & JTBD

**Primary user:** licensed driver planning a longer trip (commute home > 50 km, weekend drive, intercity, airport run).

**JTBD:** *"Pick the route that fits why I'm driving and how I drive — not just the clock."*

**Out of scope for v1:** biking, walking, transit, multi-stop optimization, real-time re-routing during the drive, mobile-native app, account system.

---

## 4. Product scope (v1)

| In | Out |
|---|---|
| Driving only | Bike, walk, transit |
| Single A → B | Multi-stop / waypoints |
| ≥ 50 km trips (UI nudges if shorter) | Urban < 5 km |
| Single profile per session (URL-encoded) | Accounts, saved profiles |
| Web (desktop + responsive) | Native mobile |
| 3 demo trips bookmarked | Global coverage QA |
| Static personalization → live re-rank | Learned weights from trip history |

---

## 5. Personalization model

The profile is the product. Four inputs, all overridable as sliders after first set.

### 5.1 Inputs

| Input | Captured via | Drives |
|---|---|---|
| **Driving style** | 3 scenario questions, each 4 options. Answer maps to score 0–100 (cautious ↔ assertive). | `w_time` ↑, `w_curve` ↓, highway preference |
| **Experience** | Years driving (dropdown buckets) + km/year (buckets) | Night-driving penalty, secondary-road tolerance |
| **Driving culture** | Country/city dropdown w/ named presets | Baseline shift on style; lane-discipline assumptions |
| **Vehicle** | Class (small / mid / SUV / EV) + fuel (diesel / gas / EV) + displacement bucket | Fuel cost per km, hill penalty, toll class |

### 5.2 Scenario questions (driving style)

Each question = 4 multiple-choice options scored 0 / 33 / 66 / 100. Average the three.

1. *"Empty highway, dry, speed limit 130 km/h. You drive…"* → 110 / 130 / 145 / 160
2. *"Two-lane road, slow truck ahead, dashed line, oncoming visible 400m out. You…"* → wait / wait until clearer / overtake now / floor it
3. *"Curvy mountain road, no traffic. You take corners…"* → well below limit / at limit / at the racing line / push it

### 5.3 Driving-culture presets (examples)

| Preset | Style baseline shift | Notes |
|---|---|---|
| Rome / Naples | +15 assertive | Dense, improvisational |
| Swiss Plateau | −15 assertive | Strict lane discipline |
| German Autobahn | +10 assertive, +20 highway preference | Comfortable at high speed |
| NYC | +10 assertive, −10 highway pref | Surface street confidence |
| LA | +0, +25 highway pref | Freeway-default |
| Rural UK | −5, +0 | Narrow-road tolerance |
| (default) | 0 | When unknown |

These are **opinionated defaults, fully overridable**. Document this honestly in the README — the point is to make personalization legible, not to claim cultural truth.

### 5.4 Vehicle → cost lookups

Ship a JSON table: `{class, fuel, displacement} → {liters_per_100km, hill_penalty_factor, toll_class}`. Hand-tuned. Documented as an estimate.

---

## 6. Cost function (the math)

All terms normalized 0–1 across the candidate set, then weighted sum. Lower = better.

```
score = w_time   · time_norm
      + w_toll   · toll_cost_norm
      + w_fuel   · fuel_cost_norm
      + w_hill   · elevation_gain_norm
      + w_night  · unlit_km_after_sunset_norm
      + w_curve  · curviness_norm
      − w_hwy    · highway_share        // negative weight = prefers highway
```

**Default weight derivation** (pseudocode, see `src/profile/weights.ts`):

```ts
function profileToWeights(p: Profile): Weights {
  const style = p.styleScore;          // 0..100
  const exp   = p.experienceScore;     // 0..100
  const cult  = CULTURE_PRESETS[p.culture];
  const veh   = VEHICLE_TABLE[p.vehicle];

  return {
    w_time:  0.4 + 0.003 * style,                   // assertive → values time more
    w_toll:  0.2,                                   // baseline; user-tunable
    w_fuel:  0.15 * veh.fuelCostFactor,
    w_hill:  0.1  * veh.hillPenalty,
    w_night: 0.2  * (1 - exp/100),                  // less experience → bigger night penalty
    w_curve: 0.2  * (1 - style/100),                // assertive tolerates curves
    w_hwy:   0.2  + cult.highwayPrefShift,
  };
}
```

Sliders bind to these weights directly. Re-rank is **client-side, instant, no API calls**.

---

## 7. Routing architecture

### 7.1 Baseline (always on)

**OpenRouteService** (free tier: 2,000 req/day, no credit card).

```
POST https://api.openrouteservice.org/v2/directions/driving-car/geojson
{
  "coordinates": [[lon1, lat1], [lon2, lat2]],
  "alternative_routes": { "target_count": 3, "share_factor": 0.6, "weight_factor": 1.4 },
  "elevation": true,
  "extra_info": ["surface", "tollways", "roadaccessrestrictions", "waytype"],
  "instructions": false
}
```

Returns 3 candidates with elevation profile, toll segments, road class. Re-rank client-side using the cost function.

### 7.2 "Show your work" mode (portfolio layer)

Toggle on the route detail panel: **"See the algorithm think."**

- Pre-compute a small OSM subgraph for each demo trip using Python `osmnx`, export to JSON (~1–5 MB per trip).
- Implement A\* in TypeScript in the browser. Heuristic = great-circle distance × min-cost-per-km.
- Visualize frontier expansion on MapLibre as it runs (animated layer).
- Side-by-side with ORS result. Discuss differences in a tooltip.

**Honest README line:**
> Production maps use GNN-based ETAs trained on billions of trips (DeepMind / Google, 2021). RouteFit uses graph search over OSM with a personalized cost function — same algorithmic family (Dijkstra / A\*), a fraction of the data, and full transparency.

### 7.3 Geocoding

Nominatim (public OSM, rate-limited to 1 req/sec). Cache results in `localStorage` keyed by query string.

---

## 8. Exogenous inputs

| Signal | Source | Cost | Honesty caveat |
|---|---|---|---|
| Elevation per segment | ORS inline (`elevation: true`) | Free | Real |
| Sunset / sunrise at ETA | `suncalc` npm package, offline | Free | Real |
| Lit road segments | OSM `lit=yes` tag + road-class fallback | Free | Coverage varies wildly by country — disclose |
| Tolls | OSM `toll=yes` segments × regional €/km table | Free | Hand-maintained for IT / FR / CH / DE only in v1 |
| Fuel price | User input + regional default JSON | Free | User can override |
| Traffic variance proxy | 3 ORS calls at different departure times → std-dev | Free (3× quota cost) | Not real-time; document |
| Weather (optional) | Open-Meteo, no key | Free | Used only to flag rain on mountain passes |

---

## 9. AI summary — Hugging Face Inference API

### 9.1 Why HF Inference API

- Free tier, no credit card.
- Token created at huggingface.co/settings/tokens.
- Serverless — no infra to manage.
- Generous on small models; rate-limited but fine for a demo.
- Lets us swap models without changing the integration.

### 9.2 Model choice

Recommended (in order):

1. **`meta-llama/Llama-3.2-3B-Instruct`** — fast, small, good at structured prose.
2. **`mistralai/Mistral-7B-Instruct-v0.3`** — fallback if Llama gated.
3. **`Qwen/Qwen2.5-7B-Instruct`** — second fallback.

Some models are gated — accept license on HF page once with the same token. Verify the chosen model is available on the serverless Inference API at build time (HF rotates which models are hosted).

### 9.3 Endpoint

```
POST https://api-inference.huggingface.co/models/{MODEL_ID}
Authorization: Bearer {HF_TOKEN}
Content-Type: application/json
```

**Token must live server-side.** Use a Vercel serverless function (`/api/summarize`) — never ship the token to the browser.

### 9.4 Request shape

```json
{
  "inputs": "<full prompt string with route stats and profile>",
  "parameters": {
    "max_new_tokens": 120,
    "temperature": 0.4,
    "return_full_text": false
  },
  "options": {
    "wait_for_model": true,
    "use_cache": true
  }
}
```

`wait_for_model: true` handles cold-start (HF spins models down). First call may take 10–20s; subsequent are fast.

### 9.5 Prompt template

```
You are a concise travel-route explainer. Given a route's stats and a driver
profile, write 2–3 sentences (max 60 words) explaining why this route fits
the driver. Lead with the headline tradeoff. Use plain English. No emojis.
No bullet points.

Driver profile:
- Style: {style_label} ({style_score}/100)
- Experience: {experience_label}
- Culture: {culture}
- Vehicle: {vehicle_summary}

Route option {n} of {total}:
- Distance: {distance_km} km
- Estimated time: {duration_min} min ({delta_vs_fastest} vs fastest)
- Toll cost: €{toll_eur}
- Fuel cost: €{fuel_eur}
- Elevation gain: {elev_m} m
- Highway share: {hwy_pct}%
- Curviness index: {curve_idx}
- Unlit km after sunset at ETA: {unlit_km} km

Other options for context:
{compact_table_of_alternatives}

Write the explainer now:
```

### 9.6 Response handling

```ts
const r = await fetch(`https://api-inference.huggingface.co/models/${MODEL_ID}`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${process.env.HF_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ inputs: prompt, parameters: { ... }, options: { wait_for_model: true } }),
});

if (!r.ok) {
  // 503 = model loading; 429 = rate-limited. Fall back to template explainer.
  return templateSummary(routeStats, profile);
}

const data = await r.json();
// Response shape varies by model: text-generation returns [{ generated_text: "..." }]
const text = Array.isArray(data) ? data[0]?.generated_text : data?.generated_text;
return text?.trim() ?? templateSummary(routeStats, profile);
```

### 9.7 Caching

Cache key: `sha256(routeGeometry + profileWeights + modelId)`. Store in:

- **Vercel KV** (free tier, no CC) for shared cache across visitors, OR
- **In-memory Map** in the serverless function (warm starts) + browser `localStorage` for the user's own session.

Start with in-memory + localStorage. Upgrade to KV only if the demo is getting traffic.

### 9.8 Fallback

Always ship a template-based explainer as the floor. Driven from the same route stats, no AI. Example:

```
"12 min slower than the fastest option, but €4.20 cheaper in tolls,
180m less climbing, and you'll be off mountain roads 22 min before sunset."
```

If HF returns an error, returns empty, or takes > 8s, render the template instead. The AI version is icing — the product must work without it.

---

## 10. Tech stack

| Layer | Pick | Notes |
|---|---|---|
| Frontend | React + Vite + TypeScript | |
| Map | MapLibre GL JS + CARTO Voyager basemap | No token, no CC |
| Baseline routing | OpenRouteService | Key in serverless function only |
| Custom routing demo | A\* in TS over precomputed OSM JSON | `osmnx` to generate, ship as static asset |
| Geocoding | Nominatim + localStorage cache | Respect 1 req/sec |
| Sun calc | `suncalc` npm | Offline |
| Weather (opt) | Open-Meteo | No key |
| AI summary | Hugging Face Inference API | Server-side only |
| State / sharing | URL params (profile + endpoints encoded) | Routes are shareable links |
| Backend | Vercel serverless functions | Hide ORS + HF tokens |
| Hosting | Vercel free tier | Auto-deploy from GitHub |
| Repo | Public GitHub | README is the portfolio artifact |

---

## 11. Data model (TypeScript types)

```ts
type Profile = {
  styleScore: number;          // 0..100
  experienceScore: number;     // 0..100
  culture: CultureKey;
  vehicle: VehicleKey;
  weights: Weights;            // derived; user-overridable
};

type Weights = {
  w_time: number;
  w_toll: number;
  w_fuel: number;
  w_hill: number;
  w_night: number;
  w_curve: number;
  w_hwy: number;
};

type RouteCandidate = {
  id: string;
  geometry: GeoJSON.LineString;
  stats: {
    distanceKm: number;
    durationMin: number;
    elevationGainM: number;
    highwaySharePct: number;
    curvinessIndex: number;
    tollEur: number;
    fuelEur: number;
    unlitKmAfterSunset: number;
  };
  score: number;               // computed client-side
  rank: number;
  summary: string;             // AI or template
  summarySource: 'hf' | 'template';
};
```

---

## 12. API surface (serverless functions)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/route` | POST | Proxies to ORS, returns 3 candidates + extras |
| `/api/summarize` | POST | Calls HF, returns AI summary; falls back to template on error |
| `/api/geocode` | GET | Proxies Nominatim w/ caching headers |

Each function reads its key from `process.env.{ORS_TOKEN, HF_TOKEN}`.

---

## 13. UI flow

1. **Landing.** Origin + destination inputs, "Plan trip" CTA. Three demo trips pre-loaded as buttons.
2. **Profile gate (first time only).** 3 scenario questions + experience + culture + vehicle. Skip-able with "Use defaults."
3. **Results page.**
   - Map with all 3 candidate routes color-coded.
   - Right panel: ranked list, each card = stats + AI/template summary + "select" button.
   - Sliders (collapsed by default) for each weight. Moving a slider re-ranks instantly.
   - "Show your work" toggle → A\* visualization mode (only on demo trips).
4. **Share.** URL encodes endpoints + profile. Copy-link button.

---

## 14. Build plan (3 weekends)

### W1 — Skeleton
- Vite + React + MapLibre rendering basemap.
- `/api/route` proxy to ORS, request 3 alternatives.
- Render 3 routes, hard-coded weights.
- Template-based explainer.
- Geocoder input.

**Done when:** paste two cities, see 3 ranked routes with stats and templated text.

### W2 — Profile + exogenous
- Scenario questionnaire UI.
- `profileToWeights` mapping + sliders.
- Toll / fuel / lighting / sunset enrichment in route enrichment step.
- URL state encoding for sharing.

**Done when:** changing a slider re-ranks live; shareable URL recreates the trip.

### W3 — Polish + portfolio layer
- HF Inference API integration via `/api/summarize` + caching + fallback.
- A\* visualization mode for 3 demo trips.
- README written as PRD (see §15).
- 30-second screen recording embedded at top of README.
- Deploy to Vercel.

**Done when:** repo is public, README reads like a product doc, demo link works from a clean browser.

---

## 15. README structure (the actual portfolio artifact)

The README *is* the portfolio piece. Structure:

1. **One-line pitch** + 30s loom embed.
2. **Live demo link** + 3 pre-loaded trip links.
3. **Problem.** "Fastest is a lazy default" framing.
4. **Who it's for.** JTBD statement.
5. **How it works.** Cost function table + profile-mapping diagram.
6. **Personalization model.** The 4 inputs and how they map to weights. Be explicit.
7. **Algorithm.** ORS baseline + custom A\* visualizer. Note on GNN-based production systems.
8. **Honest limits.** What's faked: tolls hand-tuned for 4 countries, lighting from OSM tags, no real-time traffic, culture presets are opinionated defaults.
9. **What I'd build next with real data.** Live traffic via Roads API, streetlight datasets from city open-data portals (Milan, NYC, London publish these), user trip history → learned weights, EV charging stops.
10. **Stack.** Brief.
11. **Run locally.** `pnpm i && pnpm dev`, env vars listed.

§9 (what's next) is what closes the loop for recruiters — it shows the gap between prototype and product is understood.

---

## 16. Demo trips (bookmarked in UI)

Pick three with strong personalization signal:

| Trip | Why it's a good demo |
|---|---|
| **Rome → Florence** (~280 km) | Toll vs no-toll diverges sharply (A1 vs SS2/SR2). Strong fuel/time tradeoff. |
| **Zurich → Milan via Gotthard** (~280 km) | Tunnel vs Pass option. Massive elevation difference. Sunset/lighting matters on the pass. |
| **LA → Las Vegas** (~430 km) | Highway-share extreme. Night driving on I-15 is a real consideration. |

Each pre-loads a different profile to show the system in action (e.g., Rome→Florence with "Roman driver, mid-gas car" picks A1; same trip with "Swiss driver, small diesel, low experience" picks the longer no-toll route).

---

## 17. What is explicitly faked — disclose in README

- **Tolls** are estimated from OSM `toll=yes` segments × hand-tuned regional rates (IT/FR/CH/DE only).
- **Fuel cost** uses regional defaults the user can override.
- **Lighting** is OSM `lit=yes` where present; elsewhere falls back to road-class heuristic.
- **Traffic variance** is computed from 3 ORS calls at different departure hours, not real telemetry.
- **Culture presets** are opinionated defaults, not empirically validated.
- **Vehicle table** is hand-tuned, not pulled from a live database.

The point of disclosing these is to show the candidate (you) understands the difference between a working prototype and a production system. **Don't hide the seams — label them.**

---

## 18. Open questions for the builder

1. Should "Show your work" A\* mode run live on any trip, or only demo trips? (Recommendation: demo trips only — graph generation for arbitrary pairs is too slow client-side.)
2. Default unit system: metric or auto-detect from browser locale? (Recommendation: auto-detect, user-toggleable.)
3. Profile persistence: URL only, or `localStorage` too? (Recommendation: localStorage for return visitors, URL params override.)
4. Do we want an analytics ping (e.g., Plausible free tier) to see what trips visitors run? Useful for portfolio storytelling later.

---

## 19. Environment variables

```
ORS_TOKEN=<openrouteservice api key>
HF_TOKEN=<huggingface read token>
HF_MODEL_ID=meta-llama/Llama-3.2-3B-Instruct
NOMINATIM_USER_AGENT=routefit-demo (contact@your-email)
```

All read server-side only. `.env.example` committed to repo with placeholders.

---

## 20. Appendix — example HF Inference API call

**Request:**

```bash
curl https://api-inference.huggingface.co/models/meta-llama/Llama-3.2-3B-Instruct \
  -H "Authorization: Bearer $HF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "inputs": "You are a concise travel-route explainer...\n\nDriver profile:\n- Style: assertive (78/100)\n- Experience: 12 years, ~25k km/year\n- Culture: Rome\n- Vehicle: 1.5L diesel hatchback\n\nRoute option 2 of 3:\n- Distance: 295 km\n- Estimated time: 198 min (+14 min vs fastest)\n- Toll cost: €0.00\n- Fuel cost: €18.40\n- Elevation gain: 420 m\n- Highway share: 38%\n- Curviness index: 0.42\n- Unlit km after sunset at ETA: 8 km\n\nWrite the explainer now:",
    "parameters": { "max_new_tokens": 120, "temperature": 0.4, "return_full_text": false },
    "options": { "wait_for_model": true, "use_cache": true }
  }'
```

**Expected response:**

```json
[{ "generated_text": "14 minutes slower than the toll route, but you save €12 in tolls and stay on the SS2 — a road that suits an assertive driver who's comfortable on secondary roads. You'll hit a short stretch of unlit road near Orvieto right around sunset; not a problem with your experience, but worth noting." }]
```

---

*End of handoff.*
