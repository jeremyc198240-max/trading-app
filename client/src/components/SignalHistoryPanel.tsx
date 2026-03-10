import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { History, Trophy, Flame, TrendingUp, TrendingDown, Clock, Target, XCircle, CheckCircle, Crown } from "lucide-react";

interface SignalRecord {
  id: string;
  timestamp: number;
  symbol: string;
  price: number;
  direction: 'CALL' | 'PUT' | 'WAIT';
  grade: 'GOLD' | 'HOT' | 'READY' | 'WAIT';
  confidence: number;
  targets?: {
    t1?: number;
    t2?: number;
    t3?: number;
    stopLoss?: number;
  };
  monsterDirection?: string;
  outcome?: 'win' | 'loss' | 'pending';
  priceDelta?: number;
  hitTarget?: 'T1' | 'T2' | 'T3' | 'STOP';
}

interface DailySummary {
  totalSignals: number;
  goldSignals: number;
  hotSignals: number;
  callSignals: number;
  putSignals: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;
  avgConfidence: number;
}

interface SignalHistoryData {
  symbol: string;
  history: SignalRecord[];
  summary: DailySummary;
  timestamp: number;
}

interface SignalMetricsData {
  symbol: string;
  metrics: {
    sample: {
      completedSignals: number;
    };
    expectancy: {
      avgR: number;
      profitFactor: number;
    };
    rates: {
      winRate: number;
    };
    timing: {
      avgResolutionMins: number;
      byTarget: {
        T1: { count: number };
        T2: { count: number };
        T3: { count: number };
      };
    };
  };
}

interface SignalHistoryPanelProps {
  symbol: string;
}

interface DailyTuningSourceSummary {
  total: number;
  completed: number;
  wins: number;
  losses: number;
  missed: number;
  pending: number;
  winRate: number;
}

interface DailyTuningEntry {
  date: string;
  rolledAt: number;
  favoredSystem: 'scanner' | 'fusion' | 'tie' | 'none';
  bySource: {
    scanner: DailyTuningSourceSummary;
    fusion: DailyTuningSourceSummary;
  };
}

interface DailyTuningLogData {
  success: boolean;
  entries: DailyTuningEntry[];
  count: number;
  timestamp: number;
}

interface LiveTuningData {
  success: boolean;
  snapshot: {
    lookbackHours: number;
    scanner: DailyTuningSourceSummary;
    fusion: DailyTuningSourceSummary;
  };
  timestamp: number;
}

export function SignalHistoryPanel({ symbol }: SignalHistoryPanelProps) {
  const { data, isLoading } = useQuery<SignalHistoryData>({
    queryKey: ["/api/signal-history", symbol],
    enabled: !!symbol,
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const { data: metricsData } = useQuery<SignalMetricsData>({
    queryKey: ["/api/signal-history", symbol, "metrics?hours=24"],
    enabled: !!symbol,
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const { data: dailyTuningData } = useQuery<DailyTuningLogData>({
    queryKey: ["/api/signal-history/daily-tuning", "limit=7"],
    refetchInterval: 15000,
    staleTime: 10000,
  });

  const { data: liveTuningData } = useQuery<LiveTuningData>({
    queryKey: ["/api/signal-history/live-tuning"],
    refetchInterval: 15000,
    staleTime: 10000,
  });

  if (isLoading || !data) {
    return (
      <Card className="relative overflow-hidden border-violet-500/25 bg-gradient-to-b from-slate-950/95 via-slate-900/95 to-slate-950/95 shadow-[0_0_30px_rgba(139,92,246,0.18)]" data-testid="card-signal-history-loading">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,rgba(168,85,247,0.16),transparent_55%)]" />
        <div className="h-0.5 bg-gradient-to-r from-violet-500/80 via-fuchsia-500/70 to-cyan-500/70" />
        <CardHeader className="relative py-3 px-4 border-b border-violet-500/20 bg-gradient-to-r from-violet-500/10 via-transparent to-cyan-500/10">
          <CardTitle className="text-sm font-semibold uppercase tracking-[0.14em] text-violet-300 flex items-center gap-2">
            <History className="w-4 h-4" />
            Signal History
          </CardTitle>
        </CardHeader>
        <CardContent className="relative p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-16 bg-violet-500/10 rounded-lg border border-violet-400/20" />
            <div className="h-24 bg-violet-500/10 rounded-lg border border-violet-400/20" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const { history, summary } = data;
  const metrics = metricsData?.metrics;
  const completedCount = metrics?.sample.completedSignals ?? 0;
  const avgR = metrics?.expectancy.avgR ?? 0;
  const profitFactorRaw = metrics?.expectancy.profitFactor ?? 0;
  const profitFactor = Number.isFinite(profitFactorRaw) ? Math.min(profitFactorRaw, 999) : 0;
  const winRate24h = metrics?.rates.winRate ?? 0;
  const avgMinutes = metrics?.timing.avgResolutionMins ?? 0;
  const t1Hits = metrics?.timing.byTarget.T1.count ?? 0;
  const t2Hits = metrics?.timing.byTarget.T2.count ?? 0;
  const t3Hits = metrics?.timing.byTarget.T3.count ?? 0;
  const hitDenominator = completedCount > 0 ? completedCount : 1;
  const t1Rate = (t1Hits / hitDenominator) * 100;
  const t2Rate = (t2Hits / hitDenominator) * 100;
  const t3Rate = (t3Hits / hitDenominator) * 100;
  const latestTuning = dailyTuningData?.entries?.[0];

  const liveScanner = liveTuningData?.snapshot?.scanner;
  const liveFusion = liveTuningData?.snapshot?.fusion;
  const liveScannerDecisive = (liveScanner?.wins ?? 0) + (liveScanner?.losses ?? 0);
  const liveFusionDecisive = (liveFusion?.wins ?? 0) + (liveFusion?.losses ?? 0);
  const liveFavoredSystem: 'scanner' | 'fusion' | 'tie' | 'none' =
    liveScannerDecisive === 0 && liveFusionDecisive === 0
      ? 'none'
      : Math.abs((liveScanner?.winRate ?? 0) - (liveFusion?.winRate ?? 0)) < 2
      ? 'tie'
      : (liveScanner?.winRate ?? 0) > (liveFusion?.winRate ?? 0)
      ? 'scanner'
      : 'fusion';

  const intelDateLabel = latestTuning
    ? latestTuning.date
    : `LIVE ${liveTuningData?.snapshot?.lookbackHours ?? 8}H`;

  const intelFavored = latestTuning?.favoredSystem ?? liveFavoredSystem;
  const scannerIntel = latestTuning?.bySource.scanner ?? liveScanner;
  const fusionIntel = latestTuning?.bySource.fusion ?? liveFusion;

  const favoredTone = intelFavored === 'scanner'
    ? 'border-emerald-500/45 text-emerald-300 bg-emerald-500/15'
    : intelFavored === 'fusion'
    ? 'border-cyan-500/45 text-cyan-300 bg-cyan-500/15'
    : intelFavored === 'tie'
    ? 'border-violet-500/45 text-violet-300 bg-violet-500/15'
    : 'border-slate-500/45 text-slate-300 bg-slate-500/15';

  const quality =
    avgR >= 0.8 && profitFactor >= 1.6 && winRate24h >= 68
      ? { label: 'ELITE', tone: 'good' as const }
      : avgR >= 0.25 && profitFactor >= 1.1 && winRate24h >= 52
      ? { label: 'SOLID', tone: 'warn' as const }
      : completedCount === 0
      ? { label: 'NO DATA', tone: 'neutral' as const }
      : { label: 'WEAK', tone: 'bad' as const };

  return (
    <Card className="relative overflow-hidden border-violet-500/30 bg-gradient-to-b from-slate-950/95 via-slate-900/95 to-slate-950/95 shadow-[0_0_30px_rgba(139,92,246,0.22)]" data-testid="card-signal-history">
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,rgba(217,70,239,0.18),transparent_52%)]" />
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_bottom_left,rgba(6,182,212,0.14),transparent_48%)]" />
      <div className="h-0.5 bg-gradient-to-r from-violet-500/90 via-fuchsia-500/80 to-cyan-500/80" />
      <CardHeader className="relative py-3 px-4 border-b border-violet-500/25 bg-gradient-to-r from-violet-500/15 via-transparent to-cyan-500/12">
        <CardTitle className="text-sm font-semibold uppercase tracking-[0.14em] text-violet-300 flex items-center gap-2">
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-md border border-violet-400/35 bg-violet-500/15 shadow-[0_0_10px_rgba(168,85,247,0.45)]">
            <History className="w-3.5 h-3.5 text-violet-200" />
          </span>
          Signal History
          <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-normal text-cyan-300/90">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.9)]" />
            Today • {symbol}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="relative p-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          <StatCard
            label="Total"
            value={summary.totalSignals}
            icon={<Clock className="w-3.5 h-3.5" />}
            color="text-slate-400"
          />
          <StatCard
            label="GOLD"
            value={summary.goldSignals}
            icon={<Trophy className="w-3.5 h-3.5" />}
            color="text-yellow-400"
          />
          <StatCard
            label="HOT"
            value={summary.hotSignals}
            icon={<Flame className="w-3.5 h-3.5" />}
            color="text-orange-400"
          />
          <StatCard
            label="Win Rate"
            value={`${summary.winRate.toFixed(0)}%`}
            icon={summary.winRate >= 70 ? <CheckCircle className="w-3.5 h-3.5" /> : <Target className="w-3.5 h-3.5" />}
            color={summary.winRate >= 70 ? "text-emerald-400" : summary.winRate >= 50 ? "text-amber-400" : "text-slate-400"}
          />
          <StatCard
            label="Wins"
            value={summary.wins}
            icon={<TrendingUp className="w-3.5 h-3.5" />}
            color="text-emerald-400"
          />
          <StatCard
            label="Losses"
            value={summary.losses}
            icon={<TrendingDown className="w-3.5 h-3.5" />}
            color="text-red-400"
          />
        </div>

        <div className="rounded-lg border border-cyan-500/25 bg-gradient-to-r from-cyan-500/10 via-violet-500/8 to-fuchsia-500/10 p-2.5 shadow-[0_0_20px_rgba(34,211,238,0.16)]">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] uppercase tracking-[0.14em] text-cyan-300/90">Engine Metrics • 24H</div>
            <div className="flex items-center gap-2">
              <EngineQualityBadge label={quality.label} tone={quality.tone} />
              <div className="text-[10px] text-slate-400">Completed: {completedCount}</div>
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <MetricPill
              label="Avg R"
              value={avgR.toFixed(2)}
              tone={avgR >= 0.5 ? 'good' : avgR >= 0 ? 'warn' : 'bad'}
            />
            <MetricPill
              label="PF"
              value={profitFactor >= 999 ? '∞' : profitFactor.toFixed(2)}
              tone={profitFactor >= 1.4 ? 'good' : profitFactor >= 1 ? 'warn' : 'bad'}
            />
            <MetricPill
              label="Win %"
              value={`${winRate24h.toFixed(0)}%`}
              tone={winRate24h >= 65 ? 'good' : winRate24h >= 50 ? 'warn' : 'bad'}
            />
            <MetricPill
              label="Avg Mins"
              value={avgMinutes > 0 ? avgMinutes.toFixed(0) : '--'}
              tone={avgMinutes > 0 && avgMinutes <= 25 ? 'good' : avgMinutes > 0 && avgMinutes <= 45 ? 'warn' : 'neutral'}
            />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <TargetPill label="T1" value={t1Rate} />
            <TargetPill label="T2" value={t2Rate} />
            <TargetPill label="T3" value={t3Rate} />
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-fuchsia-500/30 bg-gradient-to-r from-slate-950/85 via-fuchsia-950/20 to-cyan-950/20 p-3 shadow-[0_0_28px_rgba(217,70,239,0.18)]">
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top_right,rgba(217,70,239,0.18),transparent_50%)]" />
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_bottom_left,rgba(34,211,238,0.14),transparent_45%)]" />
          <div className="absolute inset-x-2 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-300/80 to-transparent" />
          <div className="relative flex items-center justify-between gap-2 mb-2">
            <div className="text-[10px] uppercase tracking-[0.14em] text-fuchsia-200/90">Daily Tuning Intel</div>
            <div className="text-[10px] text-cyan-200/80">
              {intelDateLabel}
            </div>
          </div>

          {(latestTuning || liveTuningData?.success) ? (
            <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="rounded-lg border border-violet-500/30 bg-black/30 p-2">
                <div className="text-[9px] uppercase tracking-[0.12em] text-slate-300/80 mb-1">Favored System</div>
                <div className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] uppercase tracking-[0.12em] font-semibold ${favoredTone}`}>
                  {(intelFavored === 'scanner' || intelFavored === 'fusion') && <Crown className="w-3 h-3" />}
                  {intelFavored === 'none' ? 'No Edge' : intelFavored}
                </div>
              </div>
              <div className={`rounded-lg border border-cyan-500/25 bg-black/30 p-2 ${intelFavored === 'scanner' ? 'shadow-[0_0_20px_rgba(34,211,238,0.28)] animate-pulse' : ''}`}>
                <div className="text-[9px] uppercase tracking-[0.12em] text-cyan-200/80 mb-1">Scanner WR</div>
                <div className="text-sm font-mono font-semibold text-cyan-100 inline-flex items-center gap-1.5">
                  {scannerIntel?.winRate?.toFixed(0) ?? '0'}%
                  {intelFavored === 'scanner' && <Crown className="w-3 h-3 text-cyan-300" />}
                </div>
                <div className="text-[9px] text-slate-400 mt-0.5">{scannerIntel?.wins ?? 0}W / {scannerIntel?.losses ?? 0}L</div>
              </div>
              <div className={`rounded-lg border border-emerald-500/25 bg-black/30 p-2 ${intelFavored === 'fusion' ? 'shadow-[0_0_20px_rgba(16,185,129,0.28)] animate-pulse' : ''}`}>
                <div className="text-[9px] uppercase tracking-[0.12em] text-emerald-200/80 mb-1">Fusion WR</div>
                <div className="text-sm font-mono font-semibold text-emerald-100 inline-flex items-center gap-1.5">
                  {fusionIntel?.winRate?.toFixed(0) ?? '0'}%
                  {intelFavored === 'fusion' && <Crown className="w-3 h-3 text-emerald-300" />}
                </div>
                <div className="text-[9px] text-slate-400 mt-0.5">{fusionIntel?.wins ?? 0}W / {fusionIntel?.losses ?? 0}L</div>
              </div>
            </div>
          ) : (
            <div className="relative rounded-lg border border-dashed border-fuchsia-500/35 bg-black/25 p-2 text-[11px] text-fuchsia-200/80">
              Daily archive not available yet. It populates after the first NY date rollover.
            </div>
          )}
        </div>

        {history.length > 0 ? (
          <div className="space-y-2">
            <div className="text-[11px] font-medium text-cyan-300/85 uppercase tracking-[0.14em]">Recent Signals</div>
            <div className="max-h-56 overflow-y-auto rounded-lg border border-violet-500/25 bg-black/25 backdrop-blur-sm p-1.5 space-y-1.5">
              {history.slice(0, 15).map((signal) => (
                <SignalRow key={signal.id} signal={signal} />
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-cyan-200/70 text-sm rounded-lg border border-dashed border-violet-500/30 bg-black/20 backdrop-blur-sm">
            No GOLD/HOT signals today. Only high-quality trades are tracked.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function StatCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  return (
    <div className="relative flex flex-col items-center justify-center p-3 rounded-lg border border-violet-500/25 bg-gradient-to-b from-violet-500/12 via-slate-900/60 to-slate-950/60 shadow-[inset_0_1px_0_rgba(255,255,255,0.04),0_0_18px_rgba(139,92,246,0.18)]">
      <div className="absolute inset-x-2 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
      <div className="mb-1.5 rounded-full border border-cyan-400/30 bg-cyan-500/10 p-1 shadow-[0_0_12px_rgba(34,211,238,0.35)]">
        <div className={`${color} drop-shadow-[0_0_8px_rgba(34,211,238,0.45)]`}>{icon}</div>
      </div>
      <div className="text-lg leading-none font-bold font-mono text-slate-100">{value}</div>
      <div className="mt-1 text-[10px] text-slate-400 uppercase tracking-[0.14em]">{label}</div>
    </div>
  );
}

function MetricPill({ label, value, tone }: { label: string; value: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }) {
  const toneClass = tone === 'good'
    ? 'border-emerald-500/35 text-emerald-300 bg-emerald-500/10'
    : tone === 'warn'
    ? 'border-amber-500/35 text-amber-300 bg-amber-500/10'
    : tone === 'bad'
    ? 'border-red-500/35 text-red-300 bg-red-500/10'
    : 'border-cyan-500/30 text-cyan-300 bg-cyan-500/10';

  return (
    <div className={`rounded-md border px-2 py-1.5 ${toneClass}`}>
      <div className="text-[9px] uppercase tracking-[0.12em] text-slate-300/80">{label}</div>
      <div className="text-sm font-mono font-semibold leading-none mt-1">{value}</div>
    </div>
  );
}

function TargetPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-violet-500/25 bg-violet-500/10 px-2 py-1.5">
      <div className="text-[9px] uppercase tracking-[0.12em] text-violet-200/80">{label} Hit</div>
      <div className="text-xs font-mono font-semibold text-violet-100 mt-1">{value.toFixed(0)}%</div>
    </div>
  );
}

function EngineQualityBadge({ label, tone }: { label: string; tone: 'good' | 'warn' | 'bad' | 'neutral' }) {
  const toneClass = tone === 'good'
    ? 'border-emerald-500/45 text-emerald-300 bg-emerald-500/15'
    : tone === 'warn'
    ? 'border-amber-500/45 text-amber-300 bg-amber-500/15'
    : tone === 'bad'
    ? 'border-red-500/45 text-red-300 bg-red-500/15'
    : 'border-cyan-500/35 text-cyan-300 bg-cyan-500/12';

  return (
    <div className={`rounded-md border px-2 py-1 text-[9px] uppercase tracking-[0.12em] font-semibold ${toneClass}`}>
      {label}
    </div>
  );
}

function SignalRow({ signal }: { signal: SignalRecord }) {
  const time = new Date(signal.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  const getGradeBadge = () => {
    if (signal.grade === 'GOLD') {
      return (
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-yellow-500/10 border-yellow-500/30 text-yellow-300 shadow-[0_0_12px_rgba(250,204,21,0.2)]">
          <span className="mr-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-yellow-500/20">
            <Trophy className="w-2 h-2" />
          </span>
          GOLD
        </Badge>
      );
    }
    if (signal.grade === 'HOT') {
      return (
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-orange-500/10 border-orange-500/30 text-orange-300 shadow-[0_0_12px_rgba(251,146,60,0.2)]">
          <span className="mr-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-orange-500/20">
            <Flame className="w-2 h-2" />
          </span>
          HOT
        </Badge>
      );
    }
    if (signal.grade === 'READY') {
      return (
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-blue-500/10 border-blue-500/30 text-blue-400">
          READY
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-slate-500/10 border-slate-500/30 text-slate-400">
        WAIT
      </Badge>
    );
  };

  const getOutcomeBadge = () => {
    if (signal.outcome === 'win') {
      return (
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-emerald-500/10 border-emerald-500/30 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]">
          <span className="mr-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500/20">
            <CheckCircle className="w-2 h-2" />
          </span>
          {signal.hitTarget || 'WIN'}
        </Badge>
      );
    }
    if (signal.outcome === 'loss') {
      return (
        <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-red-500/10 border-red-500/30 text-red-300 shadow-[0_0_12px_rgba(239,68,68,0.2)]">
          <span className="mr-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-red-500/20">
            <XCircle className="w-2 h-2" />
          </span>
          STOP
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-[9px] px-1.5 py-0 h-4 bg-slate-500/10 border-slate-500/30 text-slate-300/70">
        <span className="mr-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-slate-500/20">
          <Clock className="w-2 h-2" />
        </span>
        PENDING
      </Badge>
    );
  };

  const priceDeltaDisplay = signal.priceDelta !== undefined 
    ? `${signal.priceDelta >= 0 ? '+' : ''}$${signal.priceDelta.toFixed(2)}`
    : '--';

  const directionBarClass =
    signal.direction === 'CALL'
      ? 'bg-emerald-400/70 shadow-[0_0_10px_rgba(16,185,129,0.7)]'
      : signal.direction === 'PUT'
      ? 'bg-red-400/70 shadow-[0_0_10px_rgba(248,113,113,0.7)]'
      : 'bg-slate-400/60 shadow-[0_0_8px_rgba(148,163,184,0.6)]';

  return (
    <div className="relative grid grid-cols-[44px_52px_auto_1fr_42px_auto] items-center gap-2 p-2.5 rounded-md border border-violet-500/20 bg-gradient-to-r from-violet-500/10 via-slate-900/40 to-cyan-500/10 hover:border-violet-400/45 transition-colors" data-testid={`row-signal-${signal.id}`}>
      <div className={`absolute left-0 top-1/2 h-7 w-0.5 -translate-y-1/2 rounded-r ${directionBarClass}`} />
      <div className="text-[10px] font-mono text-slate-400">{time}</div>

      <div className={`inline-flex items-center justify-center gap-1 text-[10px] font-bold rounded px-1.5 py-0.5 border text-center ${signal.direction === 'CALL' ? 'text-emerald-300 border-emerald-500/30 bg-emerald-500/10 shadow-[0_0_10px_rgba(16,185,129,0.2)]' : signal.direction === 'PUT' ? 'text-red-300 border-red-500/30 bg-red-500/10 shadow-[0_0_10px_rgba(239,68,68,0.2)]' : 'text-slate-300 border-slate-500/30 bg-slate-500/10'}`}>
        {signal.direction === 'CALL' ? <TrendingUp className="w-2.5 h-2.5" /> : signal.direction === 'PUT' ? <TrendingDown className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
        <span>{signal.direction}</span>
      </div>

      {getGradeBadge()}

      <div className="flex-1 text-right">
        <span className="text-xs font-mono text-slate-300">${signal.price.toFixed(2)}</span>
        <span className={`text-xs font-mono ml-2 ${signal.priceDelta !== undefined && signal.priceDelta >= 0 ? 'text-emerald-400' : signal.priceDelta !== undefined && signal.priceDelta < 0 ? 'text-red-400' : 'text-muted-foreground'}`}>
          {priceDeltaDisplay}
        </span>
      </div>

      <div className="text-xs font-mono text-cyan-300/85 text-right">
        {signal.confidence.toFixed(0)}%
      </div>

      {getOutcomeBadge()}
    </div>
  );
}
