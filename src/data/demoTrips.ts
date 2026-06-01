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
    graphAsset: '/graphs/rome-florence.json',
  },
  {
    key: 'zurich-milan',
    title: 'Zurich → Milan via Gotthard',
    origin: { label: 'Zurich', lat: 47.3769, lon: 8.5417 },
    destination: { label: 'Milan', lat: 45.4642, lon: 9.19 },
    profile: {
      styleScore: 35,
      experienceScore: 50,
      yearsDriving: 5,
      kmPerYear: 12000,
      culture: 'swiss-plateau',
      vehicle: { class: 'ev', fuel: 'ev', displacement: 'small' },
    },
    graphAsset: '/graphs/zurich-milan.json',
  },
  {
    key: 'la-vegas',
    title: 'LA → Las Vegas',
    origin: { label: 'Los Angeles', lat: 34.0522, lon: -118.2437 },
    destination: { label: 'Las Vegas', lat: 36.1699, lon: -115.1398 },
    profile: {
      styleScore: 65,
      experienceScore: 70,
      yearsDriving: 9,
      kmPerYear: 20000,
      culture: 'la',
      vehicle: { class: 'mid', fuel: 'gas', displacement: 'mid' },
    },
    graphAsset: '/graphs/la-vegas.json',
  },
];

export function findDemoTrip(key: string): DemoTrip | undefined {
  return DEMO_TRIPS.find((t) => t.key === key);
}
