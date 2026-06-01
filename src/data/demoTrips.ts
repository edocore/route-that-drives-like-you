import type { DemoTrip } from '../types';

export const DEMO_TRIPS: DemoTrip[] = [
  {
    key: 'rome-florence',
    title: 'Rome → Florence',
    origin: { label: 'Rome', lat: 41.9028, lon: 12.4964 },
    destination: { label: 'Florence', lat: 43.7696, lon: 11.2558 },
    profile: {
      styleScore: 78,
      experienceScore: 80,
      yearsDriving: 12,
      kmPerYear: 25000,
      culture: 'rome',
      vehicle: { class: 'small', fuel: 'diesel', displacement: 'small' },
    },
  },
  {
    key: 'zurich-munich',
    title: 'Zurich → Munich',
    origin: { label: 'Zurich', lat: 47.3769, lon: 8.5417 },
    destination: { label: 'Munich', lat: 48.1351, lon: 11.582 },
    profile: {
      styleScore: 35,
      experienceScore: 50,
      yearsDriving: 5,
      kmPerYear: 12000,
      culture: 'swiss-plateau',
      vehicle: { class: 'ev', fuel: 'ev', displacement: 'small' },
    },
  },
  {
    key: 'nyc-boston',
    title: 'New York City → Boston',
    origin: { label: 'New York City', lat: 40.7128, lon: -74.006 },
    destination: { label: 'Boston', lat: 42.3601, lon: -71.0589 },
    profile: {
      styleScore: 55,
      experienceScore: 70,
      yearsDriving: 9,
      kmPerYear: 18000,
      culture: 'nyc',
      vehicle: { class: 'mid', fuel: 'gas', displacement: 'mid' },
    },
  },
];

export function findDemoTrip(key: string): DemoTrip | undefined {
  return DEMO_TRIPS.find((t) => t.key === key);
}
