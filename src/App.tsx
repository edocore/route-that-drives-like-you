import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertCircle,
  Edit3,
  Eye,
  Info,
  Link2,
  Sliders,
  UserCircle,
} from 'lucide-react';
import { CULTURE_PRESETS } from '@/data/culture';
import { DEMO_TRIPS, findDemoTrip } from '@/data/demoTrips';
import { vehicleSummary } from '@/data/vehicles';
import { fetchRoutes, fetchSummary } from '@/lib/api';
import { runAStarVisualizer, type AStarStep } from '@/lib/astar';
import { enrichRoute } from '@/lib/enrich';
import { buildSummaryPrompt } from '@/lib/prompt';
import { scoreCandidates } from '@/lib/score';
import { templateSummary } from '@/lib/templateSummary';
import { getShareUrl, readUrlState, writeUrlState } from '@/lib/urlState';
import {
  DEFAULT_PROFILE,
  experienceLabel,
  profileToWeights,
  styleLabel,
} from '@/lib/weights';
import type { Endpoint, Profile, RouteCandidate, Weights } from '@/types';
import { EndpointBar } from '@/components/EndpointBar';
import { MapView } from '@/components/MapView';
import { ProfileGate } from '@/components/ProfileGate';
import { RouteCard } from '@/components/RouteCard';
import { WeightSliders } from '@/components/WeightSliders';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Spinner } from '@/components/ui/spinner';
import { Toaster, toast } from '@/components/ui/sonner';

const PROFILE_STORAGE_KEY = 'routefit:profile:v1';

export function App() {
  const initialUrl = useMemo(() => readUrlState(), []);

  const initialProfile = useMemo<Profile>(() => {
    if (initialUrl.profile) return initialUrl.profile;
    if (initialUrl.demo) {
      const t = findDemoTrip(initialUrl.demo);
      if (t) return t.profile;
    }
    try {
      const stored = localStorage.getItem(PROFILE_STORAGE_KEY);
      if (stored) return JSON.parse(stored);
    } catch {
      /* ignore */
    }
    return DEFAULT_PROFILE;
  }, [initialUrl]);

  const [profile, setProfile] = useState<Profile>(initialProfile);
  const [showGate, setShowGate] = useState<boolean>(() => {
    if (initialUrl.profile || initialUrl.demo) return false;
    return !localStorage.getItem(PROFILE_STORAGE_KEY);
  });

  const [origin, setOrigin] = useState<Endpoint | undefined>(initialUrl.origin);
  const [destination, setDestination] = useState<Endpoint | undefined>(
    initialUrl.destination,
  );

  const [weights, setWeights] = useState<Weights>(() =>
    initialUrl.weights ?? profileToWeights(initialProfile),
  );
  const [weightsTouched, setWeightsTouched] = useState<boolean>(
    !!initialUrl.weights,
  );

  const [rawRoutes, setRawRoutes] = useState<RouteCandidate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [astarOn, setAstarOn] = useState(false);
  const [astarStep, setAstarStep] = useState<AStarStep | null>(null);

  useEffect(() => {
    if (!weightsTouched) {
      setWeights(profileToWeights(profile));
    }
  }, [profile, weightsTouched]);

  useEffect(() => {
    try {
      localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile));
    } catch {
      /* ignore */
    }
  }, [profile]);

  useEffect(() => {
    writeUrlState({
      origin,
      destination,
      profile,
      weights: weightsTouched ? weights : undefined,
    });
  }, [origin, destination, profile, weights, weightsTouched]);

  const ranked = useMemo(
    () => scoreCandidates(rawRoutes, weights),
    [rawRoutes, weights],
  );

  const generateSummaries = useCallback(
    async (candidates: RouteCandidate[], p: Profile) => {
      const fastest = [...candidates].sort(
        (a, b) => a.stats.durationMin - b.stats.durationMin,
      )[0];
      const ctx = {
        styleLabel: styleLabel(p.styleScore),
        experienceLabel: experienceLabel(p.yearsDriving, p.kmPerYear),
      };

      setRawRoutes((prev) =>
        prev.map((r) => ({
          ...r,
          summary: templateSummary(r, fastest, ctx),
          summarySource: 'template',
        })),
      );

      await Promise.all(
        candidates.map(async (c, i) => {
          const prompt = buildSummaryPrompt({
            route: c,
            candidates,
            profile: p,
            index: i,
            total: candidates.length,
            fastest,
          });
          const text = await fetchSummary(prompt);
          if (!text) return;
          setRawRoutes((prev) =>
            prev.map((r) =>
              r.id === c.id
                ? { ...r, summary: text, summarySource: 'hf' }
                : r,
            ),
          );
        }),
      );
    },
    [],
  );

  const planTrip = useCallback(
    async (o: Endpoint, d: Endpoint) => {
      setLoading(true);
      setError(null);
      setRawRoutes([]);
      setSelectedId(null);
      setOrigin(o);
      setDestination(d);
      try {
        const data = await fetchRoutes(
          { lat: o.lat, lon: o.lon },
          { lat: d.lat, lon: d.lon },
        );
        const departureISO = new Date(Date.now() + 30 * 60_000).toISOString();
        const enriched = data.features.map((f, i) =>
          enrichRoute({
            feature: f as Parameters<typeof enrichRoute>[0]['feature'],
            profile,
            departureISO,
            index: i,
          }),
        );
        setRawRoutes(enriched);
        if (enriched.length > 0) setSelectedId(enriched[0].id);
        void generateSummaries(enriched, profile);
      } catch (e) {
        setError((e as Error).message);
        toast.error('Routing failed', {
          description: (e as Error).message,
        });
      } finally {
        setLoading(false);
      }
    },
    [profile, generateSummaries],
  );

  useEffect(() => {
    const demoKey = initialUrl.demo;
    if (demoKey) {
      const t = findDemoTrip(demoKey);
      if (t) {
        setProfile(t.profile);
        setWeights(profileToWeights(t.profile));
        setWeightsTouched(false);
        void planTrip(t.origin, t.destination);
        return;
      }
    }
    if (initialUrl.origin && initialUrl.destination) {
      void planTrip(initialUrl.origin, initialUrl.destination);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onWeightsChange = (next: Weights) => {
    setWeights(next);
    setWeightsTouched(true);
  };

  const resetWeights = () => {
    setWeights(profileToWeights(profile));
    setWeightsTouched(false);
  };

  const runDemo = (demoKey: string) => {
    const t = findDemoTrip(demoKey);
    if (!t) return;
    setProfile(t.profile);
    setWeightsTouched(false);
    setWeights(profileToWeights(t.profile));
    setShowGate(false);
    void planTrip(t.origin, t.destination);
  };

  const selectedRoute = ranked.find((r) => r.id === selectedId) ?? ranked[0];

  useEffect(() => {
    if (!astarOn || !origin || !destination) {
      setAstarStep(null);
      return;
    }
    let cancelled = false;
    void runAStarVisualizer({
      origin,
      destination,
      onStep: (s) => {
        if (!cancelled) setAstarStep(s);
      },
    });
    return () => {
      cancelled = true;
    };
  }, [astarOn, origin, destination]);

  const copyShareLink = async () => {
    const url = getShareUrl({
      origin,
      destination,
      profile,
      weights: weightsTouched ? weights : undefined,
    });
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Link copied', {
        description: 'Anyone with this URL gets your endpoints + profile.',
      });
    } catch {
      window.prompt('Copy link:', url);
    }
  };

  return (
    <div className="flex h-screen w-screen flex-col bg-background">
      {/* Topbar */}
      <header className="flex flex-wrap items-center gap-4 border-b border-border bg-card px-5 py-3">
        <div className="flex items-center gap-2.5">
          <BrandLogo />
          <div className="flex items-baseline gap-2">
            <span className="font-bold tracking-tight">RouteFit</span>
            <span className="text-xs text-muted-foreground">
              route that drives like you
            </span>
          </div>
        </div>

        <EndpointBar
          origin={origin}
          destination={destination}
          onChange={planTrip}
          loading={loading}
        />

        <div className="flex flex-wrap items-center gap-1.5">
          {DEMO_TRIPS.map((t) => (
            <Button
              key={t.key}
              variant="outline"
              size="sm"
              className="rounded-full border-border bg-secondary/40 text-xs"
              onClick={() => runDemo(t.key)}
            >
              {t.title}
            </Button>
          ))}
        </div>
      </header>

      {/* Main */}
      <div className="grid flex-1 min-h-0 grid-cols-1 lg:grid-cols-[1fr_440px]">
        {/* Map */}
        <div className="relative min-h-0 h-[60vh] lg:h-auto">
          <MapView
            routes={ranked}
            selectedId={selectedRoute?.id ?? null}
            origin={origin}
            destination={destination}
            frontier={astarStep?.frontier}
            visited={astarStep?.visited}
            onSelect={setSelectedId}
          />
          {ranked.length === 0 && !loading && (
            <div className="pointer-events-none absolute left-3 top-3 max-w-sm rounded-md border border-border bg-card/85 px-3 py-2 text-xs text-muted-foreground shadow-md backdrop-blur">
              <Info className="mr-1.5 inline h-3.5 w-3.5" />
              Pick a demo trip or enter origin + destination to see ranked routes.
            </div>
          )}
          {astarOn && astarStep && (
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-md border border-border bg-card/85 px-3 py-2 text-xs text-muted-foreground shadow-md backdrop-blur">
              <Activity className="mr-1.5 inline h-3.5 w-3.5 text-amber-400" />
              A* search · visited {astarStep.visited.length} · frontier{' '}
              {astarStep.frontier.length}
              {astarStep.done && ' · done'}
            </div>
          )}
        </div>

        {/* Side panel */}
        <ScrollArea className="border-t lg:border-l lg:border-t-0 border-border bg-background">
          <div className="flex flex-col">
            {/* Profile summary */}
            <PanelSection
              icon={<UserCircle className="h-3.5 w-3.5" />}
              title="Profile"
            >
              <ProfileSummary
                profile={profile}
                onEdit={() => setShowGate(true)}
              />
            </PanelSection>

            {error && (
              <div className="px-4 pb-3">
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-xs text-destructive">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              </div>
            )}

            <Separator />

            {/* Ranked routes */}
            <PanelSection
              icon={<Activity className="h-3.5 w-3.5" />}
              title={`Ranked routes${ranked.length ? ` · ${ranked.length}` : ''}`}
              padContent={false}
            >
              {ranked.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner />
                      Pulling routes from OpenStreetMap…
                    </span>
                  ) : (
                    'No routes yet.'
                  )}
                </div>
              ) : (
                <div>
                  {ranked.map((r) => (
                    <RouteCard
                      key={r.id}
                      route={r}
                      best={ranked[0]}
                      selected={r.id === selectedRoute?.id}
                      onSelect={() => setSelectedId(r.id)}
                    />
                  ))}
                </div>
              )}
            </PanelSection>

            <Separator />

            {/* Cost-function weights */}
            <PanelSection
              icon={<Sliders className="h-3.5 w-3.5" />}
              title="Cost-function weights"
            >
              <WeightSliders
                weights={weights}
                onChange={onWeightsChange}
                onReset={resetWeights}
              />
              <Separator className="my-3" />
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-start gap-2">
                  <Eye className="mt-0.5 h-3.5 w-3.5 text-muted-foreground" />
                  <div className="space-y-0.5">
                    <div className="text-sm">Show your work</div>
                    <div className="text-[11px] text-muted-foreground">
                      Animate A* search frontier on the map.
                    </div>
                  </div>
                </div>
                <Switch
                  checked={astarOn}
                  onCheckedChange={setAstarOn}
                />
              </div>
            </PanelSection>

            <Separator />

            {/* Share */}
            <PanelSection
              icon={<Link2 className="h-3.5 w-3.5" />}
              title="Share"
            >
              <Button
                variant="outline"
                size="sm"
                onClick={copyShareLink}
                className="w-full"
              >
                <Link2 className="h-3.5 w-3.5" />
                Copy shareable link
              </Button>
              <p className="mt-2 text-[11px] text-muted-foreground/80">
                The URL encodes endpoints + profile + slider overrides.
              </p>
            </PanelSection>

            <Separator />

            {/* About */}
            <PanelSection
              icon={<Info className="h-3.5 w-3.5" />}
              title="About"
            >
              <p className="text-xs leading-relaxed text-muted-foreground">
                Routes from OpenRouteService over OSM. Rankings re-computed
                client-side. Tolls, lighting, and culture presets are openly
                approximated — see README.
              </p>
            </PanelSection>
          </div>
        </ScrollArea>
      </div>

      <ProfileGate
        open={showGate}
        initial={profile}
        onComplete={(p) => {
          setProfile(p);
          setWeightsTouched(false);
          setWeights(profileToWeights(p));
          setShowGate(false);
          if (origin && destination) void planTrip(origin, destination);
        }}
        onSkip={() => setShowGate(false)}
      />
      <Toaster />
    </div>
  );
}

function PanelSection({
  icon,
  title,
  children,
  padContent = true,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  padContent?: boolean;
}) {
  return (
    <section className={padContent ? 'p-4' : 'pb-2'}>
      <h3
        className={
          padContent
            ? 'mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'
            : 'mb-1 px-4 pt-4 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground'
        }
      >
        {icon}
        {title}
      </h3>
      {children}
    </section>
  );
}

function ProfileSummary({
  profile,
  onEdit,
}: {
  profile: Profile;
  onEdit: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <ProfileField label="Style">
          <Badge variant="default" className="font-medium">
            {styleLabel(profile.styleScore)} · {profile.styleScore}
          </Badge>
        </ProfileField>
        <ProfileField label="Experience">
          <span className="text-foreground">
            {experienceLabel(profile.yearsDriving, profile.kmPerYear)}
          </span>
        </ProfileField>
        <ProfileField label="Culture">
          <span className="text-foreground">
            {CULTURE_PRESETS[profile.culture].label}
          </span>
        </ProfileField>
        <ProfileField label="Vehicle">
          <span className="text-foreground">{vehicleSummary(profile.vehicle)}</span>
        </ProfileField>
      </div>
      <Button variant="outline" size="sm" className="w-full" onClick={onEdit}>
        <Edit3 className="h-3.5 w-3.5" />
        Edit profile
      </Button>
    </div>
  );
}

function ProfileField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-secondary/30 px-2.5 py-2">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-0.5 text-xs font-medium leading-snug">{children}</div>
    </div>
  );
}

function BrandLogo() {
  return (
    <svg
      width={28}
      height={28}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <circle cx={32} cy={32} r={30} fill="#0f172a" />
      <path
        d="M14 44 Q24 14 32 30 Q40 46 50 20"
        stroke="#22d3ee"
        strokeWidth={5}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
