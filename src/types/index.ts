export type CultureKey =
  | 'default'
  | 'rome'
  | 'swiss-plateau'
  | 'german-autobahn'
  | 'nyc'
  | 'la'
  | 'rural-uk';

export type VehicleClass = 'small' | 'mid' | 'suv' | 'ev';
export type FuelType = 'diesel' | 'gas' | 'ev';
export type DisplacementBucket = 'small' | 'mid' | 'large';

export interface VehicleSpec {
  class: VehicleClass;
  fuel: FuelType;
  displacement: DisplacementBucket;
}

export interface Profile {
  styleScore: number; // 0..100 (cautious ↔ assertive)
  experienceScore: number; // 0..100
  yearsDriving: number;
  kmPerYear: number;
  culture: CultureKey;
  vehicle: VehicleSpec;
}

export interface Weights {
  w_time: number;
  w_toll: number;
  w_fuel: number;
  w_hill: number;
  w_night: number;
  w_curve: number;
  w_hwy: number;
}

export type WeightKey = keyof Weights;

export interface RouteStats {
  distanceKm: number;
  durationMin: number;
  elevationGainM: number;
  highwaySharePct: number; // 0..100
  curvinessIndex: number; // 0..1
  tollEur: number;
  fuelEur: number;
  unlitKmAfterSunset: number;
}

export interface RouteCandidate {
  id: string;
  label: string;
  geometry: GeoJSON.LineString;
  stats: RouteStats;
  score: number;
  rank: number;
  summary: string;
  summarySource: 'hf' | 'template' | 'pending';
}

export interface LatLng {
  lat: number;
  lon: number;
}

export interface Endpoint {
  label: string;
  lat: number;
  lon: number;
}

export interface DemoTrip {
  key: string;
  title: string;
  origin: Endpoint;
  destination: Endpoint;
  profile: Profile;
  /** Optional precomputed graph asset path for "show your work" mode. */
  graphAsset?: string;
}

export interface CulturePreset {
  key: CultureKey;
  label: string;
  styleShift: number; // points added to styleScore baseline (-/+)
  highwayPrefShift: number; // 0..0.4
}

export interface VehicleProfile {
  fuelCostFactor: number; // multiplier on baseline €/km
  hillPenalty: number; // 0..2
  tollClassMultiplier: number; // 1 = car, >1 = SUV/heavy
  litersPer100km: number;
  label: string;
}
