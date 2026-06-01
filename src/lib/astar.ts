import type { LatLng } from '../types';
import { haversineKm } from './geo';

/**
 * "Show your work" A* visualizer.
 *
 * Generates a deterministic synthetic graph between origin and destination on the fly:
 * a hex-shaped grid of nodes laid over the bounding box, with neighbor edges and a few
 * randomized cost perturbations to make the search non-trivial. Same algorithmic
 * family as production routing (Dijkstra / A*); the point is to make the frontier
 * visible, not to compute a real road route.
 *
 * For demo trips listed in DEMO_TRIPS, this could be swapped for a precomputed OSM
 * subgraph (osmnx export) — see README §"What I'd build next".
 */
export interface AStarStep {
  visited: [number, number][]; // closed set node positions
  frontier: [number, number][]; // open set node positions
  done: boolean;
  /** Final path coordinates, only set when done. */
  path?: [number, number][];
}

interface RunArgs {
  origin: LatLng;
  destination: LatLng;
  /** Resolution: nodes per side. Higher = more steps, slower visual. */
  resolution?: number;
  /** Step delay in ms between yielded frames. */
  stepDelayMs?: number;
  onStep: (s: AStarStep) => void;
}

export async function runAStarVisualizer({
  origin,
  destination,
  resolution = 28,
  stepDelayMs = 35,
  onStep,
}: RunArgs): Promise<void> {
  const minLat = Math.min(origin.lat, destination.lat);
  const maxLat = Math.max(origin.lat, destination.lat);
  const minLon = Math.min(origin.lon, destination.lon);
  const maxLon = Math.max(origin.lon, destination.lon);
  // Pad the bbox so paths don't crawl the edge.
  const padLat = (maxLat - minLat) * 0.3 || 0.05;
  const padLon = (maxLon - minLon) * 0.3 || 0.05;
  const bb = {
    minLat: minLat - padLat,
    maxLat: maxLat + padLat,
    minLon: minLon - padLon,
    maxLon: maxLon + padLon,
  };

  const cols = resolution;
  const rows = Math.max(8, Math.round(resolution * ((bb.maxLat - bb.minLat) / (bb.maxLon - bb.minLon))));
  const nodeId = (r: number, c: number) => r * cols + c;
  const nodeCoord = (r: number, c: number): [number, number] => [
    bb.minLon + (c / (cols - 1)) * (bb.maxLon - bb.minLon),
    bb.minLat + (r / (rows - 1)) * (bb.maxLat - bb.minLat),
  ];
  const total = rows * cols;

  // Seeded "terrain" multiplier so cost varies smoothly. Deterministic from endpoints.
  const seed = Math.abs(
    Math.round((origin.lat + destination.lon) * 1000) % 1000,
  );
  const noise = (r: number, c: number) =>
    1 +
    0.4 *
      Math.sin((r + seed) * 0.7) *
      Math.cos((c + seed * 1.3) * 0.5) +
    0.2 * Math.cos(r * 0.31 + c * 0.27);

  const startC = Math.round(
    ((origin.lon - bb.minLon) / (bb.maxLon - bb.minLon)) * (cols - 1),
  );
  const startR = Math.round(
    ((origin.lat - bb.minLat) / (bb.maxLat - bb.minLat)) * (rows - 1),
  );
  const goalC = Math.round(
    ((destination.lon - bb.minLon) / (bb.maxLon - bb.minLon)) * (cols - 1),
  );
  const goalR = Math.round(
    ((destination.lat - bb.minLat) / (bb.maxLat - bb.minLat)) * (rows - 1),
  );
  const startId = nodeId(startR, startC);
  const goalId = nodeId(goalR, goalC);

  const goalCoord = nodeCoord(goalR, goalC);
  const heuristic = (r: number, c: number) => {
    const [lon, lat] = nodeCoord(r, c);
    return haversineKm({ lat, lon }, { lat: goalCoord[1], lon: goalCoord[0] });
  };

  const gScore = new Float64Array(total).fill(Infinity);
  const fScore = new Float64Array(total).fill(Infinity);
  const cameFrom = new Int32Array(total).fill(-1);
  const inOpen = new Uint8Array(total);
  const closed = new Uint8Array(total);
  gScore[startId] = 0;
  fScore[startId] = heuristic(startR, startC);
  // Simple priority queue (array-based; fine at this scale).
  const open: number[] = [startId];
  inOpen[startId] = 1;

  const popLowest = () => {
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (fScore[open[i]] < fScore[open[bestIdx]]) bestIdx = i;
    }
    const id = open[bestIdx];
    open.splice(bestIdx, 1);
    inOpen[id] = 0;
    return id;
  };

  // 8-connectivity
  const neighbors = (r: number, c: number): { r: number; c: number }[] => {
    const out: { r: number; c: number }[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue;
        out.push({ r: nr, c: nc });
      }
    }
    return out;
  };

  const visitedCoords: [number, number][] = [];

  const yieldFrame = (done: boolean, path?: [number, number][]) => {
    const frontier: [number, number][] = open.map((id) => {
      const r = Math.floor(id / cols);
      const c = id % cols;
      return nodeCoord(r, c);
    });
    onStep({ visited: visitedCoords.slice(), frontier, done, path });
  };

  let stepCount = 0;
  while (open.length > 0) {
    const currentId = popLowest();
    const cr = Math.floor(currentId / cols);
    const cc = currentId % cols;

    if (closed[currentId]) continue;
    closed[currentId] = 1;
    visitedCoords.push(nodeCoord(cr, cc));

    if (currentId === goalId) {
      const path: [number, number][] = [];
      let cur = currentId;
      while (cur !== -1) {
        const r = Math.floor(cur / cols);
        const c = cur % cols;
        path.push(nodeCoord(r, c));
        cur = cameFrom[cur];
      }
      path.reverse();
      yieldFrame(true, path);
      return;
    }

    for (const { r: nr, c: nc } of neighbors(cr, cc)) {
      const nid = nodeId(nr, nc);
      if (closed[nid]) continue;
      const stepCost =
        haversineKm(
          { lat: nodeCoord(cr, cc)[1], lon: nodeCoord(cr, cc)[0] },
          { lat: nodeCoord(nr, nc)[1], lon: nodeCoord(nr, nc)[0] },
        ) * noise(nr, nc);
      const tentative = gScore[currentId] + stepCost;
      if (tentative < gScore[nid]) {
        cameFrom[nid] = currentId;
        gScore[nid] = tentative;
        fScore[nid] = tentative + heuristic(nr, nc);
        if (!inOpen[nid]) {
          open.push(nid);
          inOpen[nid] = 1;
        }
      }
    }

    stepCount++;
    if (stepCount % 8 === 0) {
      yieldFrame(false);
      await sleep(stepDelayMs);
    }
  }
  yieldFrame(true);
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}
