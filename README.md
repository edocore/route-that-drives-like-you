# Route That Drives Like You

**The fastest route isn't always the right route.** This app re-ranks driving routes against a personalization profile — your style, experience, where you learned to drive, and what you drive — instead of optimizing only for time.

> Built as a product-thinking portfolio piece. The repo is the artifact; the README below is the spec.

[**→ Live demo**](https://routefit.vercel.app) · [**Rome → Florence**](https://routefit.vercel.app/?demo=rome-florence) · [**Zurich → Munich**](https://routefit.vercel.app/?demo=zurich-munich) · [**New York City → Boston**](https://routefit.vercel.app/?demo=nyc-boston)

<!-- TODO: embed 30s loom here once deployed -->

---

## The problem

Mainstream maps optimize one cost function — time — and apply it to every trip. But the same A → B has multiple correct answers depending on context:

- A **Roman driver in a 1.5L diesel** weighing tolls vs. fuel on Rome → Florence wants a different answer than a **Swiss driver in a small EV** doing Zurich → Munich.
- A **new driver at sunset** wants to avoid 30 km of unlit mountain road, even at a 15-minute cost.
- A **confident driver who hates curves** wants the boring highway, not the scenic one Google quietly suggests.

These signals exist. Maps services don't ask for them, and don't expose how they're weighed. The result is a single suggestion that's *good on average* and *generic for anyone specific*.

## What this does instead

1. **Asks four things about the driver** (style, experience, driving culture, vehicle).
2. **Maps those answers to weights** in a transparent cost function.
3. **Pulls candidate routes** from OpenRouteService (open-source, OSM-based).
4. **Re-ranks them** against the driver's weights, with sliders to override anything live.
5. **Explains each option in plain English** — why it ranks where it does, what the tradeoff is.

The product-sense flex isn't the map. It's that the cost function is **legible and editable**. Move a slider, watch the ranking change, see why.

## Who it's for

Licensed drivers planning longer trips (commute home > 50 km, weekend drives, intercity, airport runs). Out of scope for v1: biking, walking, transit, multi-stop, real-time re-routing during the drive.

**JTBD:** *"Pick the route that fits why I'm driving and how I drive — not just the clock."*

---

## How it works

### The cost function

All terms normalized 0–1 across the candidate set, then weighted sum. Lower score wins.

```
score = w_time   · time
      + w_toll   · toll_cost
      + w_fuel   · fuel_cost
      + w_hill   · elevation_gain
      + w_night  · unlit_km_after_sunset
      + w_curve  · curviness_index
      − w_hwy    · highway_share         // negative → prefers highway
```

Each weight starts as a function of the driver profile. Each is exposed as a slider in the UI. Re-ranking is client-side and instant — moving a slider doesn't hit any API.

### The personalization model

Four inputs, all overridable after first set.

| Input | Captured via | Drives |
|---|---|---|
| **Driving style** | 3 scenario questions, scored 0–100 (cautious ↔ assertive) | Time weight, curviness tolerance, highway preference |
| **Experience** | Years driving + km/year buckets | Night-driving penalty, secondary-road tolerance |
| **Driving culture** | Country / city dropdown with named presets (Rome, Swiss Plateau, German Autobahn, NYC, LA, rural UK…) | Baseline shift on style and highway preference |
| **Vehicle** | Class + fuel + displacement | Fuel cost per km, hill penalty, toll class |

Driving-culture presets are **opinionated defaults, fully overridable**. The point is to make personalization legible from a cold start, not to claim cultural truth. Move the sliders; the profile is yours.

### The algorithm

- **Baseline routes:** OpenRouteService API (free tier, OSM-based). Returns 3 alternatives with elevation, road class, and toll segments.
- **Re-ranking:** client-side scoring against the cost function above.
- **"Show your work" mode:** for the three demo trips, a custom A\* implementation runs in the browser over a precomputed OSM subgraph and visualizes the search frontier expanding live. Same algorithmic family as production routing, fully transparent.

> Production maps use GNN-based ETAs trained on billions of trips ([DeepMind / Google, 2021](https://deepmind.google/discover/blog/traffic-prediction-with-advanced-graph-neural-networks/)). This project uses graph search over OSM with a personalized cost function — same family (Dijkstra / A\*), a fraction of the data, and the cost function is on screen instead of inside a model.

### AI route summaries

Each ranked option gets a 2–3 sentence plain-English explanation. *"14 minutes slower than the toll route, but you save €12 in tolls and stay on SS2 — a road that suits an assertive driver comfortable on secondary roads. You'll hit a short stretch of unlit road near Orvieto around sunset."*

Generated via Hugging Face Inference API (free tier, server-side) using Llama 3.2 3B Instruct. Falls back to a deterministic template explainer when the API is cold, rate-limited, or unavailable — the product works fully without AI.

---

## What's faked, and what isn't

A prototype is honest about its seams. What's real, what's approximated:

| Signal | Status | Notes |
|---|---|---|
| Routes, distance, ETA | **Real** | OpenRouteService over OSM |
| Elevation per segment | **Real** | ORS inline |
| Sunset / sunrise at ETA | **Real** | `suncalc`, offline |
| Lit road segments | **Approximated** | OSM `lit=yes` tag where present; road-class fallback elsewhere. Coverage varies wildly by country. |
| Tolls | **Approximated** | OSM `toll=yes` segments × hand-tuned regional rates. v1 covers IT / FR / CH / DE only. |
| Fuel cost | **Approximated** | Regional defaults, user-editable |
| Traffic variance | **Proxied** | Std-dev across 3 ORS calls at different departure hours, not real telemetry |
| Culture presets | **Opinionated defaults** | Not empirically validated. Fully overridable. |
| Vehicle table | **Hand-tuned** | Not pulled from a live database |

The point of disclosing these is that I know the gap between this and production. Hiding the seams would be the wrong instinct.

## What I'd build next with real data

If this were a real product, the roadmap is mostly about closing those gaps:

- **Live traffic** via Google Roads API or TomTom (paid) → replace the variance proxy with real probability distributions over ETAs.
- **Streetlight datasets** from city open-data portals — Milan, NYC, London, Paris all publish them — to replace the OSM `lit=yes` heuristic with ground truth in covered cities.
- **Learned weights from trip history.** First five trips set a profile via questionnaire; trips 6+ adjust the weights from observed choices (which route the driver actually picked, where they deviated). The questionnaire becomes a cold-start mechanism, not the long-term model.
- **EV-specific routing.** Charging-stop insertion, battery-aware elevation cost.
- **Multi-driver vehicle profiles.** A household sharing a car has multiple drivers; the profile should be a quick toggle, not a re-questionnaire.

---

## Stack

- **Frontend:** React + Vite + TypeScript
- **Map:** MapLibre GL JS + CARTO Voyager basemap (no token, no card)
- **Routing:** OpenRouteService (free tier) + custom A\* in TS for the visualizer
- **Geocoding:** Nominatim with localStorage cache
- **Sun calc:** `suncalc` (offline)
- **Weather (optional):** Open-Meteo (no key)
- **AI summaries:** Hugging Face Inference API (Llama 3.2 3B Instruct)
- **Backend:** Vercel serverless functions (only to hide API tokens)
- **Hosting:** Vercel free tier

Everything used here is free and requires no credit card. That's a deliberate constraint — the project should be reproducible by anyone reading this README.

## Run it locally

```bash
git clone https://github.com/<your-handle>/route-that-drives-like-you.git
cd route-that-drives-like-you
pnpm install
cp .env.example .env.local
# fill in ORS_TOKEN and HF_TOKEN — see .env.example for where to get them
pnpm dev
```

Required env vars:

```
ORS_TOKEN=<openrouteservice.org api key>
HF_TOKEN=<huggingface.co read token>
HF_MODEL_ID=meta-llama/Llama-3.2-3B-Instruct
NOMINATIM_USER_AGENT=routefit-local (your-email@example.com)
```

All read server-side only. Tokens never reach the browser.
