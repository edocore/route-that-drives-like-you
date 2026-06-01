export interface ScenarioOption {
  label: string;
  score: number; // 0..100
}

export interface ScenarioQuestion {
  id: string;
  prompt: string;
  options: ScenarioOption[];
}

export const SCENARIO_QUESTIONS: ScenarioQuestion[] = [
  {
    id: 'highway-speed',
    prompt:
      'Empty highway, dry, speed limit 130 km/h. You drive…',
    options: [
      { label: '110 km/h — relaxed', score: 0 },
      { label: '130 km/h — at the limit', score: 33 },
      { label: '145 km/h — flowing with traffic', score: 66 },
      { label: '160 km/h — making time', score: 100 },
    ],
  },
  {
    id: 'overtake',
    prompt:
      'Two-lane road, slow truck ahead, dashed line, oncoming visible 400 m out. You…',
    options: [
      { label: 'Wait — hold position behind the truck', score: 0 },
      { label: 'Wait until the road is clearer', score: 33 },
      { label: 'Overtake now — there is space', score: 66 },
      { label: 'Floor it past the truck', score: 100 },
    ],
  },
  {
    id: 'mountain-corner',
    prompt: 'Curvy mountain road, no traffic. You take corners…',
    options: [
      { label: 'Well below the limit', score: 0 },
      { label: 'At the posted limit', score: 33 },
      { label: 'On the racing line', score: 66 },
      { label: 'Pushing it — for the joy of it', score: 100 },
    ],
  },
];
