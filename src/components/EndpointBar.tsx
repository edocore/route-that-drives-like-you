import { useEffect, useRef, useState } from 'react';
import { ArrowRight, MapPin, Navigation } from 'lucide-react';
import { endpointFromGeocode, geocode, type GeocodeResult } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import type { Endpoint } from '@/types';

interface Props {
  origin?: Endpoint;
  destination?: Endpoint;
  onChange: (origin: Endpoint, destination: Endpoint) => void;
  loading?: boolean;
}

export function EndpointBar({ origin, destination, onChange, loading }: Props) {
  const [oQuery, setOQuery] = useState(origin?.label ?? '');
  const [dQuery, setDQuery] = useState(destination?.label ?? '');
  const [oResults, setOResults] = useState<GeocodeResult[]>([]);
  const [dResults, setDResults] = useState<GeocodeResult[]>([]);
  const [oResolved, setOResolved] = useState<Endpoint | undefined>(origin);
  const [dResolved, setDResolved] = useState<Endpoint | undefined>(destination);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (origin) {
      setOQuery(origin.label);
      setOResolved(origin);
    }
  }, [origin?.lat, origin?.lon]);
  useEffect(() => {
    if (destination) {
      setDQuery(destination.label);
      setDResolved(destination);
    }
  }, [destination?.lat, destination?.lon]);

  const oTimer = useRef<number | null>(null);
  const dTimer = useRef<number | null>(null);

  const lookup = async (
    query: string,
    setResults: (r: GeocodeResult[]) => void,
  ) => {
    if (query.length < 3) {
      setResults([]);
      return;
    }
    try {
      const r = await geocode(query);
      setResults(r);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const onOInput = (v: string) => {
    setOQuery(v);
    setOResolved(undefined);
    if (oTimer.current) window.clearTimeout(oTimer.current);
    oTimer.current = window.setTimeout(() => lookup(v, setOResults), 350);
  };
  const onDInput = (v: string) => {
    setDQuery(v);
    setDResolved(undefined);
    if (dTimer.current) window.clearTimeout(dTimer.current);
    dTimer.current = window.setTimeout(() => lookup(v, setDResults), 350);
  };

  const submit = () => {
    setError(null);
    if (!oResolved || !dResolved) {
      setError('Pick a suggestion for both origin and destination.');
      return;
    }
    onChange(oResolved, dResolved);
  };

  return (
    <div className="flex flex-1 items-start gap-2 max-w-3xl">
      <div className="relative flex-1">
        <Navigation className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Origin (e.g. Rome)"
          value={oQuery}
          onChange={(e) => onOInput(e.target.value)}
          className="pl-8"
        />
        {oResults.length > 0 && !oResolved && (
          <ResultDropdown
            results={oResults}
            onPick={(r) => {
              const ep = endpointFromGeocode(r);
              setOResolved(ep);
              setOQuery(ep.label);
              setOResults([]);
            }}
          />
        )}
      </div>
      <ArrowRight className="mt-2 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="relative flex-1">
        <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Destination (e.g. Florence)"
          value={dQuery}
          onChange={(e) => onDInput(e.target.value)}
          className="pl-8"
        />
        {dResults.length > 0 && !dResolved && (
          <ResultDropdown
            results={dResults}
            onPick={(r) => {
              const ep = endpointFromGeocode(r);
              setDResolved(ep);
              setDQuery(ep.label);
              setDResults([]);
            }}
          />
        )}
      </div>
      <Button variant="gradient" onClick={submit} disabled={loading}>
        {loading ? (
          <>
            <Spinner />
            Routing…
          </>
        ) : (
          'Plan trip'
        )}
      </Button>
      {error && (
        <span className="self-center text-xs text-destructive">{error}</span>
      )}
    </div>
  );
}

function ResultDropdown({
  results,
  onPick,
}: {
  results: GeocodeResult[];
  onPick: (r: GeocodeResult) => void;
}) {
  return (
    <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-60 overflow-y-auto rounded-md border bg-popover shadow-lg">
      {results.map((r, i) => (
        <button
          key={i}
          type="button"
          className="block w-full cursor-pointer truncate px-3 py-2 text-left text-sm text-popover-foreground transition-colors hover:bg-accent/20"
          onClick={() => onPick(r)}
          title={r.label}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}
