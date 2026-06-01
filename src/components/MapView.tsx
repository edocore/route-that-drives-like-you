import maplibregl, { type Map as MLMap } from 'maplibre-gl';
import { useEffect, useRef } from 'react';
import type { Endpoint, RouteCandidate } from '../types';
import { bboxOf } from '../lib/geo';

const BASEMAP =
  'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

const RANK_COLORS = ['#22d3ee', '#818cf8', '#f472b6', '#fbbf24'];

export interface MapViewProps {
  routes: RouteCandidate[];
  selectedId: string | null;
  origin?: Endpoint;
  destination?: Endpoint;
  /** Live A* search frontier coords as [lon,lat] pairs (optional). */
  frontier?: [number, number][];
  visited?: [number, number][];
  onSelect: (id: string) => void;
}

export function MapView({
  routes,
  selectedId,
  origin,
  destination,
  frontier,
  visited,
  onSelect,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MLMap | null>(null);
  const isLoadedRef = useRef(false);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: BASEMAP,
      center: [10, 45],
      zoom: 4,
      attributionControl: { compact: true },
    });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.on('load', () => {
      isLoadedRef.current = true;
      // Pre-create empty sources/layers for routes
      for (let i = 0; i < 4; i++) {
        const id = `route-${i}`;
        map.addSource(id, {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: [] },
        });
        // Casing
        map.addLayer({
          id: `${id}-casing`,
          type: 'line',
          source: id,
          paint: {
            'line-color': '#0b1020',
            'line-width': 8,
            'line-opacity': 0.6,
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
        // Stroke
        map.addLayer({
          id: `${id}-stroke`,
          type: 'line',
          source: id,
          paint: {
            'line-color': RANK_COLORS[i] ?? '#22d3ee',
            'line-width': 5,
            'line-opacity': 0.95,
          },
          layout: { 'line-cap': 'round', 'line-join': 'round' },
        });
        map.on('click', `${id}-stroke`, () => {
          // Will be re-bound by the route-update effect when mapping ID -> route
        });
        map.on('mouseenter', `${id}-stroke`, () => {
          map.getCanvas().style.cursor = 'pointer';
        });
        map.on('mouseleave', `${id}-stroke`, () => {
          map.getCanvas().style.cursor = '';
        });
      }
      // A* visualizer layers
      map.addSource('astar-visited', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'astar-visited',
        type: 'circle',
        source: 'astar-visited',
        paint: {
          'circle-radius': 2,
          'circle-color': '#f472b6',
          'circle-opacity': 0.3,
        },
      });
      map.addSource('astar-frontier', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'astar-frontier',
        type: 'circle',
        source: 'astar-frontier',
        paint: {
          'circle-radius': 4,
          'circle-color': '#fbbf24',
          'circle-opacity': 0.9,
          'circle-stroke-color': '#0b1020',
          'circle-stroke-width': 1,
        },
      });

      // Endpoint markers source
      map.addSource('endpoints', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      });
      map.addLayer({
        id: 'endpoints-circle',
        type: 'circle',
        source: 'endpoints',
        paint: {
          'circle-radius': 7,
          'circle-color': [
            'match',
            ['get', 'kind'],
            'origin',
            '#34d399',
            'destination',
            '#f87171',
            '#22d3ee',
          ],
          'circle-stroke-color': '#0b1020',
          'circle-stroke-width': 2,
        },
      });
      map.addLayer({
        id: 'endpoints-label',
        type: 'symbol',
        source: 'endpoints',
        layout: {
          'text-field': ['get', 'label'],
          'text-size': 12,
          'text-offset': [0, -1.5],
          'text-anchor': 'bottom',
        },
        paint: {
          'text-color': '#e6ecff',
          'text-halo-color': '#0b1020',
          'text-halo-width': 1.5,
        },
      });
    });
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Keep route sources in sync with the selected/ranked routes.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    for (let i = 0; i < 4; i++) {
      const src = map.getSource(`route-${i}`);
      if (!src || src.type !== 'geojson') continue;
      const route = routes[i];
      if (!route) {
        (src as maplibregl.GeoJSONSource).setData({
          type: 'FeatureCollection',
          features: [],
        });
        continue;
      }
      const isSelected = route.id === selectedId;
      const color = RANK_COLORS[route.rank - 1] ?? '#22d3ee';
      map.setPaintProperty(`route-${i}-stroke`, 'line-color', color);
      map.setPaintProperty(
        `route-${i}-stroke`,
        'line-width',
        isSelected ? 7 : 4,
      );
      map.setPaintProperty(
        `route-${i}-stroke`,
        'line-opacity',
        isSelected ? 1 : 0.5,
      );
      map.setPaintProperty(
        `route-${i}-casing`,
        'line-width',
        isSelected ? 12 : 7,
      );
      (src as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: route.geometry,
            properties: { id: route.id },
          },
        ],
      });
    }
  }, [routes, selectedId]);

  // Bind click handlers to actual route IDs
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    const handlers: Array<{ layer: string; fn: () => void }> = [];
    for (let i = 0; i < 4; i++) {
      const route = routes[i];
      if (!route) continue;
      const layer = `route-${i}-stroke`;
      const fn = () => onSelect(route.id);
      map.on('click', layer, fn);
      handlers.push({ layer, fn });
    }
    return () => {
      for (const h of handlers) map.off('click', h.layer, h.fn);
    };
  }, [routes, onSelect]);

  // Endpoint markers
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    const src = map.getSource('endpoints');
    if (!src || src.type !== 'geojson') return;
    const features: GeoJSON.Feature[] = [];
    if (origin)
      features.push({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [origin.lon, origin.lat] },
        properties: { kind: 'origin', label: origin.label },
      });
    if (destination)
      features.push({
        type: 'Feature',
        geometry: {
          type: 'Point',
          coordinates: [destination.lon, destination.lat],
        },
        properties: { kind: 'destination', label: destination.label },
      });
    (src as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features,
    });
  }, [origin, destination]);

  // Fit map to selected route bounds when routes change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current || routes.length === 0) return;
    const allCoords: [number, number][] = [];
    for (const r of routes) {
      for (const c of r.geometry.coordinates) {
        allCoords.push([c[0], c[1]]);
      }
    }
    if (allCoords.length === 0) return;
    const [minLon, minLat, maxLon, maxLat] = bboxOf(allCoords);
    map.fitBounds(
      [
        [minLon, minLat],
        [maxLon, maxLat],
      ],
      { padding: 60, duration: 800 },
    );
  }, [routes.length]);

  // A* visualizer updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !isLoadedRef.current) return;
    const visSrc = map.getSource('astar-visited');
    const frSrc = map.getSource('astar-frontier');
    if (visSrc && visSrc.type === 'geojson') {
      (visSrc as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: (visited ?? []).map((c) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: c },
          properties: {},
        })),
      });
    }
    if (frSrc && frSrc.type === 'geojson') {
      (frSrc as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: (frontier ?? []).map((c) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: c },
          properties: {},
        })),
      });
    }
  }, [frontier, visited]);

  return <div className="absolute inset-0" ref={containerRef} />;
}
