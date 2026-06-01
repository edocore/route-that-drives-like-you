import type { VehicleProfile, VehicleSpec } from '../types';

/**
 * Hand-tuned vehicle table. Lookup key is `${class}-${fuel}-${displacement}`.
 * If a specific combo isn't present we fall back to the class-fuel default.
 */
const TABLE: Record<string, VehicleProfile> = {
  // small / diesel
  'small-diesel-small': {
    label: 'Small diesel hatchback',
    fuelCostFactor: 0.7,
    hillPenalty: 0.8,
    tollClassMultiplier: 1,
    litersPer100km: 4.5,
  },
  'small-diesel-mid': {
    label: 'Small diesel',
    fuelCostFactor: 0.8,
    hillPenalty: 0.9,
    tollClassMultiplier: 1,
    litersPer100km: 5.2,
  },
  // small / gas
  'small-gas-small': {
    label: 'Small petrol',
    fuelCostFactor: 0.9,
    hillPenalty: 1.0,
    tollClassMultiplier: 1,
    litersPer100km: 5.5,
  },
  'small-gas-mid': {
    label: 'Compact petrol',
    fuelCostFactor: 1.0,
    hillPenalty: 1.0,
    tollClassMultiplier: 1,
    litersPer100km: 6.2,
  },
  // mid / gas
  'mid-gas-mid': {
    label: 'Mid-size petrol',
    fuelCostFactor: 1.1,
    hillPenalty: 1.2,
    tollClassMultiplier: 1,
    litersPer100km: 7.5,
  },
  'mid-gas-large': {
    label: 'Mid-size large engine',
    fuelCostFactor: 1.3,
    hillPenalty: 1.3,
    tollClassMultiplier: 1,
    litersPer100km: 8.8,
  },
  'mid-diesel-mid': {
    label: 'Mid-size diesel',
    fuelCostFactor: 0.9,
    hillPenalty: 1.1,
    tollClassMultiplier: 1,
    litersPer100km: 6.4,
  },
  // SUV
  'suv-gas-mid': {
    label: 'SUV petrol',
    fuelCostFactor: 1.4,
    hillPenalty: 1.6,
    tollClassMultiplier: 1.3,
    litersPer100km: 9.2,
  },
  'suv-diesel-mid': {
    label: 'SUV diesel',
    fuelCostFactor: 1.1,
    hillPenalty: 1.4,
    tollClassMultiplier: 1.3,
    litersPer100km: 7.6,
  },
  'suv-gas-large': {
    label: 'Large SUV',
    fuelCostFactor: 1.7,
    hillPenalty: 1.8,
    tollClassMultiplier: 1.3,
    litersPer100km: 11.0,
  },
  // EV — fuel modeled as electricity
  'ev-ev-small': {
    label: 'Small EV',
    fuelCostFactor: 0.4,
    hillPenalty: 0.6,
    tollClassMultiplier: 1,
    litersPer100km: 0,
  },
  'ev-ev-mid': {
    label: 'Mid EV',
    fuelCostFactor: 0.5,
    hillPenalty: 0.8,
    tollClassMultiplier: 1,
    litersPer100km: 0,
  },
  'ev-ev-large': {
    label: 'Large EV',
    fuelCostFactor: 0.7,
    hillPenalty: 1.0,
    tollClassMultiplier: 1,
    litersPer100km: 0,
  },
};

const CLASS_DEFAULT: Record<string, VehicleProfile> = {
  small: TABLE['small-gas-mid'],
  mid: TABLE['mid-gas-mid'],
  suv: TABLE['suv-gas-mid'],
  ev: TABLE['ev-ev-mid'],
};

export function lookupVehicle(spec: VehicleSpec): VehicleProfile {
  const key = `${spec.class}-${spec.fuel}-${spec.displacement}`;
  return TABLE[key] ?? CLASS_DEFAULT[spec.class] ?? TABLE['mid-gas-mid'];
}

export function vehicleSummary(spec: VehicleSpec): string {
  return lookupVehicle(spec).label;
}
