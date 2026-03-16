import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Clock3, Radar, Target, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type EdgeSignal = "BREAK_UP" | "BREAK_DOWN" | "WAIT";
type EdgeState = "STANDBY" | "ARMING" | "PRIMED" | "TRIGGERED";

interface EdgeTuningSampleSummary {
  edgeSampleCount: number;
  symbolCount: number;
  breakoutAlertCount: number;
  total: number;
  completed: number;
  wins: number;
  losses: number;
  missed: number;
  pending: number;
  winRate: number;
}

interface EdgeTuningQuality {
  avgEdgeScore: number;
  avgConfidence: number;
  avgTriggerProbability: number;
  avgLeadMinutes: number;
}

interface EdgeTuningIndicatorMeans {
  rsi: number;
  adx: number;
  stochK: number;
  bbPercentB: number;
  tvRsi: number;
  tvAdx: number;
  momentum: number;
  volumeSpike: number;
}

interface EdgeTuningMix {
  signal: Record<EdgeSignal, number>;
  state: Record<EdgeState, number>;
}

interface EdgeTuningReason {
  reason: string;
  count: number;
}

interface EdgeTuning2dEntry {
  rolledAt: number;
  windowHours: number;
  windowStart: number;
  windowEnd: number;
  sample: EdgeTuningSampleSummary;
  quality: EdgeTuningQuality;
  indicatorMeans: EdgeTuningIndicatorMeans;
  mix: EdgeTuningMix;
  topReasons: EdgeTuningReason[];
}

interface EdgeTuning2dResponse {
  success: boolean;
  latest: EdgeTuning2dEntry | null;
  currentWindow: EdgeTuning2dEntry | null;
  entries: EdgeTuning2dEntry[];
  timestamp: number;
}

function safeNumber(value: unknown, fallback = 0): number {
  return Number.isFinite(value as number) ? Number(value) : fallback;
}

function formatPercent(value: number): string {
  return `${safeNumber(value).toFixed(1)}%`;
}

function formatAgo(timestampMs: number): string {
  if (!Number.isFinite(timestampMs)) return "--";
  const diffMs = Date.now() - timestampMs;
  if (diffMs < 60_000) return "just now";
  if (diffMs < 3_600_000) return `${Math.round(diffMs / 60_000)}m ago`;
  if (diffMs < 86_400_000) return `${Math.round(diffMs / 3_600_000)}h ago`;
  return `${Math.round(diffMs / 86_400_000)}d ago`;
}

function formatStateLabel(state: EdgeState): string {
  if (state === "STANDBY") return "Standby";
  if (state === "ARMING") return "Arming";
  if (state === "PRIMED") return "Primed";
  return "Triggered";
}

export function EdgeTuningCard() {
  const { data, isLoading } = useQuery<EdgeTuning2dResponse>({
    queryKey: ["/api/scanner/edge-tuning/2d", "limit=20"],
    refetchInterval: 30_000,
    staleTime: 10_000,
    retry: false,
  });

  const entries = data?.entries ?? [];
  const snapshot = data?.currentWindow ?? data?.latest ?? null;
  const latest = entries[0] ?? null;
  const previous = entries[1] ?? null;

  const trend = useMemo(() => {
    if (!latest || !previous) {
      return { label: "Bootstrapping", tone: "border-cyan-500/40 text-cyan-200 bg-cyan-500/10" };
    }

    const delta = safeNumber(latest.quality.avgEdgeScore) - safeNumber(previous.quality.avgEdgeScore);
    if (delta >= 1) {
      return { label: "Improving", tone: "border-emerald-500/40 text-emerald-200 bg-emerald-500/10" };
    }
    if (delta <= -1) {
      return { label: "Cooling", tone: "border-rose-500/40 text-rose-200 bg-rose-500/10" };
    }
    return { label: "Stable", tone: "border-amber-500/40 text-amber-200 bg-amber-500/10" };
  }, [latest, previous]);

  const stateRows: Array<{ key: EdgeState; value: number; pct: number }> = useMemo(() => {
    if (!snapshot) return [];

    const total = Math.max(1, safeNumber(snapshot.sample.edgeSampleCount));
    const order: EdgeState[] = ["TRIGGERED", "PRIMED", "ARMING", "STANDBY"];
    return order.map((state) => {
      const value = safeNumber(snapshot.mix.state[state]);
      return {
        key: state,
        value,
        pct: (value / total) * 100,
      };
    });
  }, [snapshot]);

  const topReasons = snapshot?.topReasons?.slice(0, 3) ?? [];

  return (
    <Card
      className="relative overflow-hidden border border-amber-500/28 bg-gradient-to-b from-[#120e03]/96 via-[#151106]/90 to-[#120f08]/86 shadow-[0_0_32px_rgba(251,191,36,0.16)]"
      data-testid="card-edge-tuning-2d"
    >
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.18),transparent_55%)]" />
      <div className="h-0.5 bg-gradient-to-r from-amber-500/80 via-orange-500/70 to-cyan-500/65" />

      <CardHeader className="relative py-3 px-4 border-b border-amber-500/20 bg-gradient-to-r from-amber-500/12 via-transparent to-orange-500/12">
        <CardTitle className="text-sm font-semibold uppercase tracking-[0.14em] text-amber-200 flex items-center gap-2">
          <Radar className="w-4 h-4" />
          Edge Tuning 48H
          <Badge className={`ml-auto text-[10px] font-mono ${trend.tone}`}>{trend.label}</Badge>
        </CardTitle>
      </CardHeader>

      <CardContent className="relative p-4 space-y-3">
        {isLoading && !snapshot ? (
          <div className="animate-pulse space-y-2" data-testid="edge-tuning-loading">
            <div className="h-10 rounded-lg border border-amber-500/20 bg-amber-500/10" />
            <div className="h-16 rounded-lg border border-amber-500/20 bg-amber-500/10" />
          </div>
        ) : snapshot ? (
          <>
            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <div className="rounded-lg border border-amber-500/28 bg-black/25 p-2">
                <div className="text-amber-200/70 uppercase tracking-wider text-[10px]">Samples</div>
                <div className="mt-0.5 text-amber-100 font-semibold">
                  {safeNumber(snapshot.sample.edgeSampleCount).toLocaleString()}
                </div>
                <div className="text-amber-200/60 text-[10px]">{safeNumber(snapshot.sample.symbolCount)} symbols</div>
              </div>
              <div className="rounded-lg border border-emerald-500/28 bg-emerald-500/8 p-2">
                <div className="text-emerald-200/70 uppercase tracking-wider text-[10px]">Win Rate</div>
                <div className="mt-0.5 text-emerald-100 font-semibold">{formatPercent(snapshot.sample.winRate)}</div>
                <div className="text-emerald-200/60 text-[10px]">
                  {safeNumber(snapshot.sample.wins)}W / {safeNumber(snapshot.sample.losses)}L
                </div>
              </div>
              <div className="rounded-lg border border-cyan-500/28 bg-cyan-500/8 p-2">
                <div className="text-cyan-200/70 uppercase tracking-wider text-[10px] flex items-center gap-1">
                  <Activity className="w-3 h-3" /> Score
                </div>
                <div className="mt-0.5 text-cyan-100 font-semibold">{safeNumber(snapshot.quality.avgEdgeScore).toFixed(1)}</div>
                <div className="text-cyan-200/60 text-[10px]">Confidence {formatPercent(snapshot.quality.avgConfidence)}</div>
              </div>
              <div className="rounded-lg border border-violet-500/28 bg-violet-500/8 p-2">
                <div className="text-violet-200/70 uppercase tracking-wider text-[10px] flex items-center gap-1">
                  <Target className="w-3 h-3" /> Trigger
                </div>
                <div className="mt-0.5 text-violet-100 font-semibold">
                  {formatPercent(snapshot.quality.avgTriggerProbability)}
                </div>
                <div className="text-violet-200/60 text-[10px]">Lead {safeNumber(snapshot.quality.avgLeadMinutes).toFixed(1)}m</div>
              </div>
            </div>

            <div className="rounded-lg border border-amber-500/22 bg-black/20 p-2.5" data-testid="edge-tuning-state-mix">
              <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.12em] text-amber-200/75">
                <TrendingUp className="w-3 h-3" /> State Mix
              </div>
              <div className="space-y-1.5">
                {stateRows.map((row) => (
                  <div key={row.key}>
                    <div className="mb-0.5 flex items-center justify-between text-[10px] text-amber-100/85">
                      <span>{formatStateLabel(row.key)}</span>
                      <span>{row.value} ({formatPercent(row.pct)})</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-black/45 border border-amber-500/20 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-500/80 to-orange-400/80"
                        style={{ width: `${Math.max(0, Math.min(100, row.pct))}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-cyan-500/20 bg-cyan-500/5 p-2.5 space-y-2" data-testid="edge-tuning-top-reasons">
              <div className="text-[10px] uppercase tracking-[0.12em] text-cyan-200/75">Top Reasons</div>
              {topReasons.length ? (
                <div className="flex flex-wrap gap-1.5">
                  {topReasons.map((reason) => (
                    <Badge key={`${reason.reason}-${reason.count}`} className="text-[10px] bg-cyan-500/15 text-cyan-100 border border-cyan-500/30">
                      {reason.count}x {reason.reason}
                    </Badge>
                  ))}
                </div>
              ) : (
                <div className="text-[11px] text-cyan-200/70">No reason frequency data yet.</div>
              )}
            </div>

            <div className="flex items-center justify-between text-[10px] text-amber-100/70 pt-0.5">
              <span className="inline-flex items-center gap-1">
                <Clock3 className="w-3 h-3" />
                Updated {formatAgo(snapshot.rolledAt)}
              </span>
              <span>
                {new Date(snapshot.windowStart).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                {" "}to{" "}
                {new Date(snapshot.windowEnd).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            </div>
          </>
        ) : (
          <div className="rounded-lg border border-dashed border-amber-500/35 bg-black/20 p-3 text-sm text-amber-100/80" data-testid="edge-tuning-empty">
            Waiting for edge samples to accumulate in the 48-hour tuning window.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
