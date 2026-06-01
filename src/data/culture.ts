import type { CultureKey, CulturePreset } from '../types';

export const CULTURE_PRESETS: Record<CultureKey, CulturePreset> = {
  default: {
    key: 'default',
    label: 'No preset',
    styleShift: 0,
    highwayPrefShift: 0,
  },
  rome: {
    key: 'rome',
    label: 'Rome / Naples',
    styleShift: 15,
    highwayPrefShift: 0,
  },
  'swiss-plateau': {
    key: 'swiss-plateau',
    label: 'Swiss Plateau',
    styleShift: -15,
    highwayPrefShift: 0.05,
  },
  'german-autobahn': {
    key: 'german-autobahn',
    label: 'German Autobahn',
    styleShift: 10,
    highwayPrefShift: 0.2,
  },
  nyc: {
    key: 'nyc',
    label: 'New York City',
    styleShift: 10,
    highwayPrefShift: -0.1,
  },
  la: {
    key: 'la',
    label: 'Los Angeles',
    styleShift: 0,
    highwayPrefShift: 0.25,
  },
  'rural-uk': {
    key: 'rural-uk',
    label: 'Rural UK',
    styleShift: -5,
    highwayPrefShift: 0,
  },
};

export const CULTURE_OPTIONS: CultureKey[] = [
  'default',
  'rome',
  'swiss-plateau',
  'german-autobahn',
  'nyc',
  'la',
  'rural-uk',
];
