import type { Endpoint, Profile, Weights } from '../types';

export interface UrlState {
  origin?: Endpoint;
  destination?: Endpoint;
  profile?: Profile;
  weights?: Weights;
  demo?: string;
}

export function readUrlState(): UrlState {
  const params = new URLSearchParams(window.location.search);
  const out: UrlState = {};

  const demo = params.get('demo');
  if (demo) out.demo = demo;

  const o = params.get('o');
  const d = params.get('d');
  if (o) out.origin = decodeEndpoint(o);
  if (d) out.destination = decodeEndpoint(d);

  const p = params.get('p');
  if (p) {
    try {
      out.profile = JSON.parse(atob(p));
    } catch {
      /* ignore malformed */
    }
  }
  const w = params.get('w');
  if (w) {
    try {
      out.weights = JSON.parse(atob(w));
    } catch {
      /* ignore */
    }
  }
  return out;
}

export function writeUrlState(state: UrlState) {
  const params = new URLSearchParams(window.location.search);
  if (state.origin) params.set('o', encodeEndpoint(state.origin));
  else params.delete('o');
  if (state.destination) params.set('d', encodeEndpoint(state.destination));
  else params.delete('d');
  if (state.profile) params.set('p', btoa(JSON.stringify(state.profile)));
  else params.delete('p');
  if (state.weights) params.set('w', btoa(JSON.stringify(state.weights)));
  else params.delete('w');
  if (state.demo) params.set('demo', state.demo);
  else params.delete('demo');

  const url = `${window.location.pathname}?${params.toString()}`;
  window.history.replaceState({}, '', url);
}

function encodeEndpoint(e: Endpoint): string {
  return `${e.lat.toFixed(4)},${e.lon.toFixed(4)},${encodeURIComponent(e.label)}`;
}
function decodeEndpoint(s: string): Endpoint | undefined {
  const parts = s.split(',');
  if (parts.length < 3) return undefined;
  const lat = parseFloat(parts[0]);
  const lon = parseFloat(parts[1]);
  if (Number.isNaN(lat) || Number.isNaN(lon)) return undefined;
  return { lat, lon, label: decodeURIComponent(parts.slice(2).join(',')) };
}

export function getShareUrl(state: UrlState): string {
  const params = new URLSearchParams();
  if (state.origin) params.set('o', encodeEndpoint(state.origin));
  if (state.destination) params.set('d', encodeEndpoint(state.destination));
  if (state.profile) params.set('p', btoa(JSON.stringify(state.profile)));
  if (state.weights) params.set('w', btoa(JSON.stringify(state.weights)));
  return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
}
