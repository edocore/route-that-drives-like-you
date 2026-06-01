import { useState } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { CULTURE_OPTIONS, CULTURE_PRESETS } from '@/data/culture';
import { SCENARIO_QUESTIONS } from '@/data/scenarios';
import { DEFAULT_PROFILE, experienceScore } from '@/lib/weights';
import { cn } from '@/lib/utils';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  CultureKey,
  DisplacementBucket,
  FuelType,
  Profile,
  VehicleClass,
} from '@/types';

interface Props {
  open: boolean;
  initial?: Profile;
  onComplete: (profile: Profile) => void;
  onSkip: () => void;
}

const VEHICLE_CLASSES: { value: VehicleClass; label: string }[] = [
  { value: 'small', label: 'Small / hatchback' },
  { value: 'mid', label: 'Mid-size sedan' },
  { value: 'suv', label: 'SUV' },
  { value: 'ev', label: 'Electric vehicle' },
];

const FUELS: { value: FuelType; label: string }[] = [
  { value: 'gas', label: 'Petrol' },
  { value: 'diesel', label: 'Diesel' },
  { value: 'ev', label: 'Electric' },
];

const DISPLACEMENTS: { value: DisplacementBucket; label: string }[] = [
  { value: 'small', label: '< 1.5L / small' },
  { value: 'mid', label: '1.5–2.5L / mid' },
  { value: 'large', label: '> 2.5L / large' },
];

const YEAR_BUCKETS = [
  { years: 1, kmYear: 5000, label: '< 2 years, < 5k km/year' },
  { years: 4, kmYear: 10000, label: '2–5 years, ~10k km/year' },
  { years: 8, kmYear: 15000, label: '5–10 years, ~15k km/year' },
  { years: 12, kmYear: 25000, label: '10+ years, ~25k km/year' },
  { years: 20, kmYear: 35000, label: '20+ years, heavy mileage' },
];

export function ProfileGate({ open, initial, onComplete, onSkip }: Props) {
  const start = initial ?? DEFAULT_PROFILE;
  const [styleAnswers, setStyleAnswers] = useState<(number | null)[]>([
    null,
    null,
    null,
  ]);
  const [experienceIdx, setExperienceIdx] = useState(2);
  const [culture, setCulture] = useState<CultureKey>(start.culture);
  const [vClass, setVClass] = useState<VehicleClass>(start.vehicle.class);
  const [fuel, setFuel] = useState<FuelType>(start.vehicle.fuel);
  const [displacement, setDisplacement] = useState<DisplacementBucket>(
    start.vehicle.displacement,
  );

  const allStyleAnswered = styleAnswers.every((a) => a !== null);

  const computeStyleScore = () => {
    const answered = styleAnswers.filter((a): a is number => a !== null);
    if (answered.length === 0) return start.styleScore;
    return Math.round(
      answered.reduce((s, v) => s + v, 0) / answered.length,
    );
  };

  const submit = () => {
    const styleScore = computeStyleScore();
    const yb = YEAR_BUCKETS[experienceIdx];
    const expScore = experienceScore(yb.years, yb.kmYear);
    const fuelKind = vClass === 'ev' ? 'ev' : fuel;
    const profile: Profile = {
      styleScore,
      experienceScore: expScore,
      yearsDriving: yb.years,
      kmPerYear: yb.kmYear,
      culture,
      vehicle: {
        class: vClass,
        fuel: fuelKind,
        displacement,
      },
    };
    onComplete(profile);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onSkip()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Tell me how you drive
          </DialogTitle>
          <DialogDescription>
            Four quick inputs become weights on the cost function. Everything is
            overridable later — sliders are right there.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-2">
          <Section title="1. Three driving moments">
            <div className="space-y-4">
              {SCENARIO_QUESTIONS.map((q, qi) => (
                <div key={q.id} className="space-y-2">
                  <p className="text-sm text-muted-foreground">{q.prompt}</p>
                  <div className="grid gap-2">
                    {q.options.map((opt, oi) => {
                      const selected = styleAnswers[qi] === opt.score;
                      return (
                        <button
                          key={oi}
                          type="button"
                          className={cn(
                            'flex items-center justify-between rounded-md border bg-secondary/40 px-3 py-2 text-left text-sm transition-colors hover:border-primary cursor-pointer',
                            selected
                              ? 'border-primary bg-primary/10'
                              : 'border-border',
                          )}
                          onClick={() => {
                            const next = [...styleAnswers];
                            next[qi] = opt.score;
                            setStyleAnswers(next);
                          }}
                        >
                          <span>{opt.label}</span>
                          {selected && <Check className="h-4 w-4 text-primary" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="2. Experience">
            <div className="grid gap-2">
              {YEAR_BUCKETS.map((b, i) => (
                <button
                  key={i}
                  type="button"
                  className={cn(
                    'flex items-center justify-between rounded-md border bg-secondary/40 px-3 py-2 text-left text-sm transition-colors hover:border-primary cursor-pointer',
                    experienceIdx === i
                      ? 'border-primary bg-primary/10'
                      : 'border-border',
                  )}
                  onClick={() => setExperienceIdx(i)}
                >
                  <span>{b.label}</span>
                  {experienceIdx === i && (
                    <Check className="h-4 w-4 text-primary" />
                  )}
                </button>
              ))}
            </div>
          </Section>

          <Section title="3. Where do you mostly drive?">
            <Select
              value={culture}
              onValueChange={(v) => setCulture(v as CultureKey)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CULTURE_OPTIONS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {CULTURE_PRESETS[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1.5 text-[11px] text-muted-foreground/80">
              Opinionated defaults — fully overridable.
            </p>
          </Section>

          <Section title="4. Vehicle">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Class</Label>
                <Select
                  value={vClass}
                  onValueChange={(v) => {
                    const k = v as VehicleClass;
                    setVClass(k);
                    if (k === 'ev') setFuel('ev');
                    else if (fuel === 'ev') setFuel('gas');
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_CLASSES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Fuel</Label>
                <Select
                  value={fuel}
                  onValueChange={(v) => setFuel(v as FuelType)}
                  disabled={vClass === 'ev'}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FUELS.map((f) => (
                      <SelectItem
                        key={f.value}
                        value={f.value}
                        disabled={vClass === 'ev' && f.value !== 'ev'}
                      >
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="mt-3">
              <Label>Engine size</Label>
              <Select
                value={displacement}
                onValueChange={(v) =>
                  setDisplacement(v as DisplacementBucket)
                }
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DISPLACEMENTS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Section>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onSkip}>
            Use defaults
          </Button>
          <Button
            variant="gradient"
            disabled={!allStyleAnswered}
            onClick={submit}
          >
            {allStyleAnswered ? 'Save profile' : 'Answer all 3 moments'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      {children}
    </div>
  );
}
