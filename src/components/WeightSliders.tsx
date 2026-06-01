import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import type { WeightKey, Weights } from '@/types';

const KEYS: { key: WeightKey; label: string; max: number }[] = [
  { key: 'w_time', label: 'Time', max: 1.0 },
  { key: 'w_toll', label: 'Tolls', max: 1.0 },
  { key: 'w_fuel', label: 'Fuel', max: 1.0 },
  { key: 'w_hill', label: 'Hills', max: 1.0 },
  { key: 'w_night', label: 'Night/unlit', max: 1.0 },
  { key: 'w_curve', label: 'Curves', max: 1.0 },
  { key: 'w_hwy', label: 'Highway', max: 1.0 },
];

interface Props {
  weights: Weights;
  onChange: (next: Weights) => void;
  onReset: () => void;
}

export function WeightSliders({ weights, onChange, onReset }: Props) {
  return (
    <div className="space-y-3">
      {KEYS.map(({ key, label, max }) => (
        <div
          key={key}
          className="grid grid-cols-[88px_1fr_44px] items-center gap-3 text-xs"
        >
          <span className="text-muted-foreground">{label}</span>
          <Slider
            min={0}
            max={max}
            step={0.01}
            value={[weights[key]]}
            onValueChange={(v) => onChange({ ...weights, [key]: v[0] })}
          />
          <span className="text-right font-mono text-foreground">
            {weights[key].toFixed(2)}
          </span>
        </div>
      ))}
      <Button
        variant="ghost"
        size="sm"
        onClick={onReset}
        className="mt-1 w-full"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Reset to profile defaults
      </Button>
    </div>
  );
}
