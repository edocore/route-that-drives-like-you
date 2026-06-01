import { Sparkles, FileText } from 'lucide-react';
import { cn, formatDuration } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import type { RouteCandidate } from '@/types';

const RANK_BG: Record<number, string> = {
  1: 'bg-[#22d3ee]',
  2: 'bg-[#818cf8]',
  3: 'bg-[#f472b6]',
  4: 'bg-amber-400',
};

interface Props {
  route: RouteCandidate;
  best: RouteCandidate;
  selected: boolean;
  onSelect: () => void;
}

export function RouteCard({ route, best, selected, onSelect }: Props) {
  const dt = Math.round(route.stats.durationMin - best.stats.durationMin);
  const deltaText = dt <= 0 ? 'fastest' : `+${dt} min`;

  return (
    <Card
      onClick={onSelect}
      className={cn(
        'cursor-pointer rounded-none border-x-0 border-t-0 border-b border-border bg-transparent shadow-none transition-colors hover:bg-secondary/40',
        selected && 'bg-secondary/60 border-l-4 border-l-primary pl-[calc(1rem-3px)]',
      )}
    >
      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              'flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-[#0b1020]',
              RANK_BG[route.rank] ?? 'bg-primary',
            )}
          >
            {route.rank}
          </div>
          <div className="flex-1 font-semibold text-foreground">
            {route.label}
          </div>
          <div className="font-mono text-[11px] text-muted-foreground">
            {deltaText} · {route.score.toFixed(2)}
          </div>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          <Stat label="Time" value={formatDuration(route.stats.durationMin)} />
          <Stat label="Distance" value={`${Math.round(route.stats.distanceKm)} km`} />
          <Stat label="Toll" value={`€${route.stats.tollEur.toFixed(2)}`} />
          <Stat label="Fuel" value={`€${route.stats.fuelEur.toFixed(2)}`} />
          <Stat label="Climb" value={`${route.stats.elevationGainM} m`} />
          <Stat label="Highway" value={`${route.stats.highwaySharePct}%`} />
          <Stat label="Curves" value={route.stats.curvinessIndex.toFixed(2)} />
          <Stat
            label="Unlit/dark"
            value={`${route.stats.unlitKmAfterSunset.toFixed(0)} km`}
          />
        </div>

        <div className="space-y-1.5">
          {route.summarySource === 'pending' ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              <span>Generating explanation…</span>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {route.summary}
            </p>
          )}
          {route.summarySource !== 'pending' && (
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
              {route.summarySource === 'hf' ? (
                <>
                  <Sparkles className="h-3 w-3" />
                  AI summary
                </>
              ) : (
                <>
                  <FileText className="h-3 w-3" />
                  Template summary
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border/60 bg-secondary/40 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="font-mono text-xs font-semibold text-foreground">
        {value}
      </div>
    </div>
  );
}
