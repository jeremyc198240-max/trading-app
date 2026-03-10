import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Activity,
  Target,
  AlertTriangle,
  Layers,
  Zap,
  ChevronRight,
  Shield,
  Clock,
  Lock,
  Unlock,
  RotateCcw,
  Compass,
  Gauge,
  Timer
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

interface FusionPanelProps {
  symbol: string;
}

interface TimeframePatternIntel {
  timeframe: string;
  primary: {
    name: string;
    type: 'bullish' | 'bearish' | 'neutral';
    category: string;
    confidence: number;
    completeness: number;
    bias: 'up' | 'down' | 'neutral';
    instruction: string;
  } | null;
  regimeBias: 'trending' | 'ranging' | 'compressing' | 'expanding';
  structuralCompression: number;
  volatilityExpansionProb: number;
}

interface GatingState {
  directionalBias: 'bullish' | 'bearish' | 'neutral';
  originalBias: 'bullish' | 'bearish' | 'neutral';
  regimeCap: 'high' | 'expanding' | 'normal' | 'range';
  metaAllowed: boolean;
  riskOverride: boolean;
  monsterConflict: boolean;
  exhaustionActive: boolean;
  compressionActive: boolean;
  lateMove: boolean;
  reasons: string[];
  gatingScore: number;
}

interface BreakoutLifecycle {
  state: 'PRE' | 'IN_ZONE' | 'POST_LATE';
  zoneLow: number;
  zoneHigh: number;
  lateMoveSide: 'bullish' | 'bearish' | 'none';
  tolerance: number;
}

interface ExhaustionCluster {
  active: boolean;
  rsiOversold: boolean;
  stochOversold: boolean;
  trendExhausted: boolean;
  volumeFading: boolean;
  reasons: string[];
}

interface CompressionCluster {
  active: boolean;
  bbSqueezeActive: boolean;
  keltnerBreakoutSide: 'upper' | 'lower' | 'none';
  healthLow: boolean;
  reasons: string[];
}

interface MonsterGateDecision {
  value: number;
  direction: 'calls' | 'puts' | 'none';
  allowedAggression: boolean;
  maxRegime: 'high' | 'expanding' | 'normal' | 'range';
  conflict: boolean;
  conflictReason: string | null;
}

interface EMACloudTrend {
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  compression: boolean;
  exhaustion: boolean;
  flip: boolean;
  volatilityRegime: 'low' | 'normal' | 'high';
}

interface CorvonaLevels {
  H3: number;
  H4: number;
  L3: number;
  L4: number;
}

interface ReversalSignal {
  reversalSignal: boolean;
  reversalDirection: 'up' | 'down' | 'none';
  reversalConfidence: number;
  reversalType: string | null;
  reversalReasons: string[];
}

interface GatedReversalAlert {
  alert: boolean;
  direction: 'bullish' | 'bearish' | 'neutral';
  score: number;
  patterns: Array<{
    name: string;
    type: 'bullish' | 'bearish' | 'neutral';
    category: string;
    confidence: number;
    description: string;
  }>;
  gated: boolean;
  gatingReasons: string[];
  mtfAligned: boolean;
  trendStrength: number;
  volatilityFavorable: boolean;
}

interface TargetProgress {
  target1Hit: boolean;
  target2Hit: boolean;
  target1Price?: number;
  target2Price?: number;
}

interface UnifiedMetaSignal {
  currentPrice: number;
  direction: 'bullish' | 'bearish' | 'neutral';
  setupGrade?: 'GOLD' | 'HOT' | 'READY' | 'BUILDING' | 'WAIT' | string;
  recommendedAction?: string;
  state?: string;
  entryZone?: { min: number; max: number };
  stopLoss?: number;
  priceTargets?: number[];
  rr?: number | null;
  regime: string;
  probabilities: { up: number; down: number; chop: number };
  fusionBias: string;
  breakoutLifecycle: {
    state: 'PRE' | 'IN_ZONE' | 'POST_LATE';
    zoneLow: number;
    zoneHigh: number;
    lateMoveSide: 'bullish' | 'bearish' | 'none';
    tolerance: number;
  };
  riskModel: {
    riskIndex: number;
    failureProb: number;
    factors: string[];
  };
  targetProgress: TargetProgress;
  status: 'active' | 'expired' | 'invalidated' | 'stale' | 'awaiting' | 'target_hit' | 'completed';
  confidence: number;
  notes: string[];
  zoneLow: number;
  zoneHigh: number;
  priceActionSafety?: {
    contradiction: boolean;
    contradictionSeverity?: 'severe' | 'moderate' | 'mild';
    momentumDirection?: string;
    momentumStrength?: number;
    candleConsistency?: number;
    safetyAction?: 'force_wait' | 'reduce_confidence' | 'none';
    confidenceMultiplier?: number;
  };
}

interface FusionSnapshot {
  timestamp: number;
  symbol: string;
  timeframes: TimeframePatternIntel[];
  mtfConsensus: {
    bullishStack: number;
    bearishStack: number;
    neutralStack: number;
    alignmentScore: number;
    conflictLevel: number;
    trendConsensus: 'bullish' | 'bearish' | 'neutral';
  };
  forecast: {
    direction: 'up' | 'down' | 'chop';
    confidence: number;
    expectedMovePct: number;
    expectedBarsMin: number;
    expectedBarsMax: number;
    rationale: string[];
  };
  directionalProbabilities: {
    up: number;
    down: number;
    chop: number;
  };
  expectedMove: {
    pct: number;
    dollars: number;
    confidence: number;
  };
  breakoutZones: {
    upper: number;
    lower: number;
    invalidation: number;
    retest: number;
  };
  volatilityRegime: {
    regime: 'low' | 'expanding' | 'high' | 'transition' | 'climax';
    score: number;
  };
  riskModel: {
    riskIndex: number;
    failureProb: number;
    factors: string[];
  };
  confidenceBreakdown: {
    pattern: number;
    mtf: number;
    health: number;
    vol: number;
    orderflow: number;
    trend: number;
  };
  narrative: string[];
  monsterGate: number;
  otmBias: 'calls' | 'puts' | 'none';
  marketHealth: {
    healthGrade: string;
    healthScore: number;
  };
  gatingState?: GatingState;
  breakoutLifecycle?: BreakoutLifecycle;
  exhaustionCluster?: ExhaustionCluster;
  compressionCluster?: CompressionCluster;
  monsterGateDecision?: MonsterGateDecision;
  emaTrend?: EMACloudTrend;
  corvonaLevels?: CorvonaLevels;
  reversalSignal?: ReversalSignal;
  gatedReversalAlert?: GatedReversalAlert;
  unifiedSignal?: UnifiedMetaSignal;
}

const biasColors = {
  bullish: "text-emerald-400",
  bearish: "text-red-400",
  neutral: "text-muted-foreground"
};

const biasIcons = {
  bullish: TrendingUp,
  bearish: TrendingDown,
  neutral: Minus
};

const signalStatusColors: Record<string, string> = {
  active: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  expired: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  invalidated: "bg-red-500/20 text-red-400 border-red-500/30",
  stale: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  awaiting: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  target_hit: "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  completed: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

const regimeColors: Record<string, string> = {
  low: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  transition: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  expanding: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  high: "bg-red-500/20 text-red-400 border-red-500/30",
  climax: "bg-purple-500/20 text-purple-400 border-purple-500/30"
};

function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function formatPrice(value: number | undefined): string {
  if (!value || value === 0) return "—";
  return `$${value.toFixed(2)}`;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function toneHex(tone: 'emerald' | 'red' | 'amber' | 'violet' | 'cyan' | 'slate') {
  return {
    emerald: "#10b981",
    red: "#ef4444",
    amber: "#f59e0b",
    violet: "#a855f7",
    cyan: "#22d3ee",
    slate: "#94a3b8"
  }[tone];
}

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace('#', '').trim();
  const expanded = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw;
  if (expanded.length !== 6) return `rgba(148,163,184,${Math.max(0, Math.min(1, alpha))})`;

  const int = Number.parseInt(expanded, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r},${g},${b},${a})`;
}

function FuturisticArchGauge({
  label,
  value,
  display,
  tone,
  testId,
  compact = true,
  variant = 'telemetry'
}: {
  label: string;
  value: number;
  display: string;
  tone: 'emerald' | 'red' | 'amber' | 'violet' | 'cyan' | 'slate';
  testId?: string;
  compact?: boolean;
  variant?: 'command' | 'telemetry';
}) {
  const clamped = clamp01(value);
  const toneColor = toneHex(tone);
  const size = compact ? 90 : 124;
  const radius = size / 2 - 14;
  const outerRadius = size / 2 - 5;
  const cx = size / 2;
  const cy = size / 2;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const arcPath = (start: number, end: number, r: number) => {
    const s = toRad(start);
    const e = toRad(end);
    const x1 = cx + r * Math.cos(s);
    const y1 = cy + r * Math.sin(s);
    const x2 = cx + r * Math.cos(e);
    const y2 = cy + r * Math.sin(e);
    return `M ${x1} ${y1} A ${r} ${r} 0 ${end - start > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };

  const fillEnd = -220 + 260 * clamped;
  const tipX = cx + radius * Math.cos(toRad(fillEnd));
  const tipY = cy + radius * Math.sin(toRad(fillEnd));
  const ticks = Array.from({ length: 9 }, (_, i) => {
    const deg = -220 + (260 / 8) * i;
    const rad = toRad(deg);
    return {
      x1: cx + (outerRadius - 4) * Math.cos(rad),
      y1: cy + (outerRadius - 4) * Math.sin(rad),
      x2: cx + outerRadius * Math.cos(rad),
      y2: cy + outerRadius * Math.sin(rad),
      active: deg <= fillEnd,
    };
  });

  const bs = Math.max(5, size * 0.1);
  const pb = 2;
  const brackets = [
    `M ${bs + pb} ${pb} L ${pb} ${pb} L ${pb} ${bs + pb}`,
    `M ${size - bs - pb} ${pb} L ${size - pb} ${pb} L ${size - pb} ${bs + pb}`,
    `M ${bs + pb} ${size - pb} L ${pb} ${size - pb} L ${pb} ${size - bs - pb}`,
    `M ${size - bs - pb} ${size - pb} L ${size - pb} ${size - pb} L ${size - pb} ${size - bs - pb}`,
  ];

  return (
    <div className={cn(
      "relative overflow-hidden rounded-xl border min-h-[100px]",
      compact ? "p-1.5" : "p-2.5"
    )}
      style={{
        borderColor: hexToRgba(toneColor, variant === 'command' ? 0.48 : 0.36),
        background: variant === 'command'
          ? `linear-gradient(160deg, ${hexToRgba(toneColor, 0.16)}, rgba(2,8,18,0.88) 62%)`
          : `linear-gradient(165deg, rgba(2,8,18,0.95), ${hexToRgba(toneColor, 0.1)})`,
        boxShadow: `inset 0 0 18px ${hexToRgba(toneColor, 0.14)}, 0 0 16px ${hexToRgba(toneColor, variant === 'command' ? 0.24 : 0.14)}`,
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.006) 3px,rgba(255,255,255,0.006) 4px)" }} />
      <div className="pointer-events-none absolute inset-0 opacity-45" style={{ background: `radial-gradient(circle at 50% 35%, ${hexToRgba(toneColor, 0.16)}, transparent 60%)` }} />
      <div className="relative flex justify-center">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {brackets.map((d, i) => (
            <path key={i} d={d} fill="none" stroke={hexToRgba(toneColor, 0.55)} strokeWidth="1.2" strokeLinecap="square" />
          ))}
          <circle cx={cx} cy={cy} r={outerRadius - 1} fill="none" stroke={hexToRgba(toneColor, 0.16)} strokeWidth="0.6" />
          {ticks.map(({ x1, y1, x2, y2, active }, i) => (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={active ? hexToRgba(toneColor, 0.92) : 'rgba(255,255,255,0.08)'}
              strokeWidth={i === 0 || i === 8 ? '1.5' : '0.85'}
              strokeLinecap="round"
            />
          ))}
          <path d={arcPath(-220, 40, radius)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="7" strokeLinecap="round" strokeDasharray="4 3" />
          {clamped > 0 && (
            <path
              d={arcPath(-220, fillEnd, radius)}
              fill="none"
              stroke={toneColor}
              strokeWidth="8"
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 10px ${toneColor})`, opacity: 0.24 }}
            />
          )}
          {clamped > 0 && (
            <path
              d={arcPath(-220, fillEnd, radius)}
              fill="none"
              stroke={toneColor}
              strokeWidth="5"
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 6px ${toneColor})` }}
            />
          )}
          {clamped > 0.02 && (
            <circle
              cx={tipX}
              cy={tipY}
              r="3"
              fill={toneColor}
              style={{ filter: `drop-shadow(0 0 6px ${toneColor}) drop-shadow(0 0 12px ${toneColor})` }}
            />
          )}
          <circle cx={cx} cy={cy} r={radius - 8} fill={hexToRgba(toneColor, 0.08)} />
          <circle cx={cx} cy={cy} r={radius - 8} fill="none" stroke={hexToRgba(toneColor, 0.2)} strokeWidth="0.6" />
          <text
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={toneColor}
            fontSize={compact ? "12" : "14"}
            fontWeight="900"
            fontFamily="monospace"
            style={{ filter: `drop-shadow(0 0 8px ${toneColor})` }}
            data-testid={testId}
          >
            {display}
          </text>
          <text
            x={cx}
            y={cy + 9}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(255,255,255,0.3)"
            fontSize="5"
            fontWeight="700"
            letterSpacing="1.2"
          >
            {clamped >= 0.66 ? 'HIGH' : clamped <= 0.33 ? 'LOW' : 'MID'}
          </text>
        </svg>
      </div>
      <div className={cn(
        "relative -mt-1 uppercase tracking-[0.14em] text-center truncate px-2 leading-tight text-white/45",
        compact ? "text-[7px]" : "text-[9px]"
      )}>{label}</div>
    </div>
  );
}

function FuturisticLineMeter({
  label,
  value,
  tone,
  display,
  testId,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'red' | 'amber' | 'violet' | 'cyan' | 'slate';
  display: string;
  testId?: string;
}) {
  const clamped = clamp01(value);
  const toneColor = toneHex(tone);
  const segments = 18;
  const activeSegments = Math.max(0, Math.min(segments, Math.round(clamped * segments)));

  return (
    <div
      className="rounded-lg border p-1.5"
      style={{
        borderColor: hexToRgba(toneColor, 0.36),
        background: `linear-gradient(180deg, ${hexToRgba(toneColor, 0.12)}, rgba(2,8,18,0.72))`,
        boxShadow: `inset 0 0 14px ${hexToRgba(toneColor, 0.12)}`,
      }}
    >
      <div className="mb-1 flex items-end justify-between">
        <span className="text-[9px] font-bold uppercase tracking-[0.14em] text-white/55">{label}</span>
        <span className="text-[10px] font-mono font-black" style={{ color: toneColor }} data-testid={testId}>{display}</span>
      </div>
      <div className="flex h-[8px] gap-[2px]">
        {Array.from({ length: segments }).map((_, i) => {
          const active = i < activeSegments;
          const segColor = i < 6 ? '#ef4444' : i < 12 ? '#f59e0b' : '#10b981';
          const isTip = active && i === activeSegments - 1;
          return (
            <div
              key={i}
              className="flex-1 rounded-[2px]"
              style={{
                backgroundColor: active ? hexToRgba(segColor, 0.92) : 'rgba(255,255,255,0.05)',
                boxShadow: isTip ? `0 0 6px ${toneColor}, 0 0 12px ${hexToRgba(toneColor, 0.4)}` : active ? `0 0 3px ${hexToRgba(segColor, 0.35)}` : 'none',
              }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex items-center justify-between text-[8px] font-mono text-white/45">
        <span>LOW</span>
        <span style={{ color: hexToRgba(toneColor, 0.85) }}>MID</span>
        <span>HIGH</span>
      </div>
    </div>
  );
}

export function FusionPanel({ symbol }: FusionPanelProps) {
  const { data, isLoading, error } = useQuery<FusionSnapshot>({
    queryKey: ['/api/fusion', symbol],
    enabled: !!symbol,
    refetchInterval: 15000,
    staleTime: 10000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });

  if (isLoading) {
    return (
      <Card className="group relative overflow-hidden border border-indigo-400/35 bg-background/60 backdrop-blur-sm shadow-lg shadow-indigo-500/10" data-testid="card-fusion-panel">
        <div className="h-1 bg-gradient-to-r from-indigo-500/50 via-purple-500/50 to-pink-500/50" />
        <CardHeader className="py-3 px-4 border-b border-border/50 bg-gradient-to-r from-indigo-500/10 via-transparent to-purple-500/10">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
            <div className="p-1 rounded-md bg-indigo-500/20">
              <Layers className="w-4 h-4" />
            </div>
            Fusion Engine
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-muted rounded w-3/4"></div>
            <div className="h-4 bg-muted rounded w-1/2"></div>
            <div className="h-4 bg-muted rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="group relative overflow-hidden border border-indigo-400/30 bg-background/60 backdrop-blur-sm shadow-lg shadow-indigo-500/10" data-testid="card-fusion-panel">
        <div className="h-1 bg-gradient-to-r from-indigo-500/50 via-purple-500/50 to-pink-500/50" />
        <CardHeader className="py-3 px-4 border-b border-border/50 bg-gradient-to-r from-indigo-500/10 via-transparent to-purple-500/10">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Fusion Engine
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground text-center">Unable to load fusion data</p>
        </CardContent>
      </Card>
    );
  }

  const mtfConsensus = data.mtfConsensus ?? { bullishStack: 0, bearishStack: 0, neutralStack: 0, alignmentScore: 0, conflictLevel: 0, trendConsensus: 'neutral' as const };
  const forecast = data.forecast ?? { direction: 'chop' as const, confidence: 0, expectedMovePct: 0, expectedBarsMin: 0, expectedBarsMax: 0, rationale: [] };
  const volatilityRegime = data.volatilityRegime ?? { regime: 'low' as const, score: 0 };
  const directionalProbabilities = data.directionalProbabilities ?? { up: 0.33, down: 0.33, chop: 0.34 };
  const expectedMove = data.expectedMove ?? { pct: 0, dollars: 0, confidence: 0 };
  const breakoutZones = data.breakoutZones ?? { upper: 0, lower: 0, invalidation: 0, retest: 0 };
  const riskModel = data.riskModel ?? { riskIndex: 0, failureProb: 0, factors: [] };
  const timeframes = data.timeframes ?? [];
  const narrative = data.narrative ?? [];
  const monsterGate = data.monsterGate ?? 0;
  const otmBias = data.otmBias ?? 'none';
  const gatingState = data.gatingState;
  const breakoutLifecycle = data.breakoutLifecycle;
  const emaTrend = data.emaTrend;
  const corvonaLevels = data.corvonaLevels;
  const reversalSignal = data.reversalSignal;
  const gatedReversalAlert = data.gatedReversalAlert;
  const unifiedSignal = data.unifiedSignal;
  const rrValue = unifiedSignal?.rr && unifiedSignal.rr > 0 ? unifiedSignal.rr : 0;
  const rrNormalized = clamp01(rrValue / 3);
  const rrStrengthPct = Math.round(rrNormalized * 100);

  const TrendIcon = biasIcons[mtfConsensus.trendConsensus];

  return (
    <Card className="group relative overflow-hidden border border-indigo-400/35 shadow-[0_0_44px_rgba(99,102,241,0.14)] bg-background/60 backdrop-blur-sm" data-testid="card-fusion-panel">
      <div className="h-1 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />
      <CardHeader className="py-3 px-4 border-b border-border/50 bg-gradient-to-r from-indigo-500/10 via-transparent to-purple-500/10">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-sm font-semibold uppercase tracking-wider text-indigo-400 flex items-center gap-2">
            <div className="p-1 rounded-md bg-indigo-500/20">
              <Layers className="w-4 h-4" />
            </div>
            Fusion Engine (Multi-TF)
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge 
              variant="outline" 
              className={cn("text-xs", regimeColors[volatilityRegime.regime])}
            >
              {volatilityRegime.regime.toUpperCase()}
            </Badge>
            <Badge 
              variant="outline"
              className={cn(
                "text-xs",
                mtfConsensus.trendConsensus === 'bullish' && "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                mtfConsensus.trendConsensus === 'bearish' && "bg-red-500/10 text-red-400 border-red-500/30"
              )}
            >
              <TrendIcon className="w-3 h-3 mr-1" />
              {mtfConsensus.trendConsensus.toUpperCase()}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 space-y-4">
        {unifiedSignal && (
          <div className={cn(
            "p-2.5 rounded-xl border-2 space-y-2.5 relative overflow-hidden",
            unifiedSignal.direction === 'bullish' && "border-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.4),inset_0_0_50px_rgba(34,197,94,0.25)] bg-gradient-to-br from-emerald-500/20 via-emerald-500/5 to-transparent",
            unifiedSignal.direction === 'bearish' && "border-yellow-400 shadow-[0_0_30px_rgba(250,204,21,0.4),inset_0_0_50px_rgba(239,68,68,0.25)] bg-gradient-to-br from-red-500/20 via-red-500/5 to-transparent",
            unifiedSignal.direction === 'neutral' && "bg-muted/30 border-border/50"
          )} data-testid="unified-signal">
            <div className="absolute inset-0 pointer-events-none opacity-60 bg-[radial-gradient(circle_at_20%_10%,rgba(250,204,21,0.18),transparent_45%),radial-gradient(circle_at_80%_90%,rgba(59,130,246,0.14),transparent_50%)]" />
            <div className="absolute inset-0 pointer-events-none opacity-20 bg-[linear-gradient(transparent_0%,rgba(255,255,255,0.08)_50%,transparent_100%)]" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                <div className={cn(
                  "p-1 rounded-md",
                  unifiedSignal.direction === 'bullish' && "bg-emerald-500/20",
                  unifiedSignal.direction === 'bearish' && "bg-red-500/20",
                  unifiedSignal.direction === 'neutral' && "bg-muted/50"
                )}>
                  <Target className={cn(
                    "w-4 h-4",
                    unifiedSignal.direction === 'bullish' && "text-emerald-400",
                    unifiedSignal.direction === 'bearish' && "text-red-400",
                    unifiedSignal.direction === 'neutral' && "text-muted-foreground"
                  )} />
                </div>
                <span className="text-sm font-semibold">Unified Signal</span>
                <Badge 
                  variant="outline"
                  className={cn(
                    "text-xs font-bold",
                    unifiedSignal.setupGrade === 'GOLD' && "bg-yellow-500/20 text-yellow-400 border-yellow-500/50 animate-pulse shadow-lg shadow-yellow-500/20",
                    unifiedSignal.setupGrade === 'HOT' && "bg-orange-500/20 text-orange-400 border-orange-500/30",
                    unifiedSignal.setupGrade === 'READY' && "bg-blue-500/20 text-blue-400 border-blue-500/30",
                    unifiedSignal.setupGrade === 'BUILDING' && "bg-slate-500/20 text-slate-400 border-slate-500/30",
                    unifiedSignal.setupGrade === 'WAIT' && "bg-muted/50 text-muted-foreground"
                  )}
                  data-testid="badge-setup-grade"
                >
                  {unifiedSignal.setupGrade === 'GOLD' && '🏆 '}
                  {unifiedSignal.setupGrade === 'HOT' && '🔥 '}
                  {unifiedSignal.setupGrade === 'READY' && '✅ '}
                  {unifiedSignal.setupGrade || 'WAIT'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Badge 
                  variant="outline" 
                  className={cn("text-xs", signalStatusColors[unifiedSignal.status])}
                  data-testid="badge-unified-status"
                >
                  {unifiedSignal.status.toUpperCase()}
                </Badge>
                <Badge 
                  variant="outline"
                  className={cn(
                    "text-xs font-bold",
                    unifiedSignal.direction === 'bullish' && "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
                    unifiedSignal.direction === 'bearish' && "bg-red-500/10 text-red-400 border-red-500/30"
                  )}
                  data-testid="badge-unified-direction"
                >
                  {unifiedSignal.direction === 'bullish' && <TrendingUp className="w-3 h-3 mr-1" />}
                  {unifiedSignal.direction === 'bearish' && <TrendingDown className="w-3 h-3 mr-1" />}
                  {unifiedSignal.direction === 'bullish' ? 'CALL' : unifiedSignal.direction === 'bearish' ? 'PUT' : 'WAIT'}
                </Badge>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
              <FuturisticArchGauge
                label="Confidence"
                value={unifiedSignal.confidence}
                display={formatPct(unifiedSignal.confidence)}
                tone={unifiedSignal.confidence >= 0.75 ? 'emerald' : unifiedSignal.confidence >= 0.5 ? 'amber' : 'red'}
                testId="text-confidence-pct"
                variant="command"
              />
              <FuturisticArchGauge
                label="Risk"
                value={riskModel.riskIndex}
                display={formatPct(riskModel.riskIndex)}
                tone={riskModel.riskIndex > 0.6 ? 'red' : riskModel.riskIndex > 0.3 ? 'amber' : 'emerald'}
                variant="command"
              />
              <FuturisticArchGauge
                label="Gate"
                value={monsterGate}
                display={formatPct(monsterGate)}
                tone={monsterGate >= 0.7 ? 'emerald' : monsterGate >= 0.45 ? 'amber' : 'violet'}
                variant="command"
              />
            </div>

            {unifiedSignal.priceActionSafety?.contradiction && (
              <div className={cn(
                "flex items-center gap-2 p-2 rounded-lg text-xs border",
                unifiedSignal.priceActionSafety.contradictionSeverity === 'severe' && "bg-red-500/15 border-red-500/40 text-red-400",
                unifiedSignal.priceActionSafety.contradictionSeverity === 'moderate' && "bg-amber-500/15 border-amber-500/40 text-amber-400",
                unifiedSignal.priceActionSafety.contradictionSeverity === 'mild' && "bg-yellow-500/10 border-yellow-500/30 text-yellow-400"
              )} data-testid="safety-warning">
                <Shield className="w-4 h-4 flex-shrink-0" />
                <div className="flex-1">
                  <div className="font-semibold">
                    {unifiedSignal.priceActionSafety.contradictionSeverity === 'severe' ? 'SAFETY OVERRIDE' :
                     unifiedSignal.priceActionSafety.contradictionSeverity === 'moderate' ? 'CAUTION' : 'NOTE'}
                    {' '}&mdash;{' '}Price pushing {unifiedSignal.priceActionSafety.momentumDirection}
                  </div>
                  <div className="text-[10px] opacity-80 mt-0.5">
                    Momentum: {unifiedSignal.priceActionSafety.momentumStrength}% | 
                    Candle consistency: {unifiedSignal.priceActionSafety.candleConsistency}%
                    {unifiedSignal.priceActionSafety.safetyAction === 'force_wait' && ' | Signal forced to WAIT'}
                    {unifiedSignal.priceActionSafety.safetyAction === 'reduce_confidence' && ` | Confidence reduced ${Math.round((1 - (unifiedSignal.priceActionSafety.confidenceMultiplier ?? 1)) * 100)}%`}
                  </div>
                </div>
              </div>
            )}

            {unifiedSignal.priceActionSafety && !unifiedSignal.priceActionSafety.contradiction && (unifiedSignal.priceActionSafety.momentumStrength ?? 0) >= 30 && (
              <div className="flex items-center gap-2 p-2 rounded-lg text-xs bg-emerald-500/10 border border-emerald-500/20" data-testid="safety-aligned">
                <Shield className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span className="text-emerald-400">
                  Price momentum aligned ({unifiedSignal.priceActionSafety.momentumStrength}% {unifiedSignal.priceActionSafety.momentumDirection})
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500/10 to-cyan-500/5 border border-cyan-500/30 shadow-[0_0_14px_rgba(34,211,238,0.15)]">
                <div className="text-[10px] text-muted-foreground uppercase tracking-wider mb-0.5">Entry Zone</div>
                <div className="font-mono font-semibold" data-testid="text-unified-entry">
                  {unifiedSignal.entryZone 
                    ? `${formatPrice(unifiedSignal.entryZone.min)} - ${formatPrice(unifiedSignal.entryZone.max)}`
                    : '—'
                  }
                </div>
              </div>
              <div className="p-2 rounded-lg bg-gradient-to-br from-red-500/15 to-red-500/5 border border-red-500/35 shadow-[0_0_14px_rgba(248,113,113,0.2)]">
                <div className="text-[10px] text-red-400 uppercase tracking-wider mb-0.5">Stop Loss (-28% prem)</div>
                <div className="font-mono font-semibold text-red-400" data-testid="text-unified-sl">
                  {formatPrice(unifiedSignal.stopLoss)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500/18 to-cyan-500/5 border border-cyan-500/35 shadow-[0_0_16px_rgba(34,211,238,0.2)]">
                <div className="text-[10px] text-cyan-400 uppercase tracking-wider mb-0.5">T1 (+30% prem)</div>
                <div className="font-mono font-semibold text-cyan-400" data-testid="text-unified-t1">
                  {unifiedSignal.priceTargets && unifiedSignal.priceTargets.length > 0 
                    ? formatPrice(unifiedSignal.priceTargets[0])
                    : '—'
                  }
                </div>
              </div>
              <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500/18 to-emerald-500/5 border border-emerald-500/35 shadow-[0_0_16px_rgba(52,211,153,0.2)]">
                <div className="text-[10px] text-emerald-400 uppercase tracking-wider mb-0.5">T2 (+50% prem)</div>
                <div className="font-mono font-semibold text-emerald-400" data-testid="text-unified-t2">
                  {unifiedSignal.priceTargets && unifiedSignal.priceTargets.length > 1 
                    ? formatPrice(unifiedSignal.priceTargets[1])
                    : '—'
                  }
                </div>
              </div>
              <div className="p-2 rounded-lg bg-gradient-to-br from-purple-500/18 to-purple-500/5 border border-purple-500/35 shadow-[0_0_16px_rgba(192,132,252,0.2)]">
                <div className="text-[10px] text-purple-400 uppercase tracking-wider mb-0.5">T3 (+75% prem)</div>
                <div className="font-mono font-semibold text-purple-400" data-testid="text-unified-t3">
                  {unifiedSignal.priceTargets && unifiedSignal.priceTargets.length > 2 
                    ? formatPrice(unifiedSignal.priceTargets[2])
                    : '—'
                  }
                </div>
              </div>
            </div>

            {unifiedSignal.targetProgress && (unifiedSignal.targetProgress.target1Price || unifiedSignal.targetProgress.target2Price) && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Targets:</span>
                <div className="flex items-center gap-1">
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-[10px] px-1.5",
                      unifiedSignal.targetProgress.target1Hit 
                        ? "bg-cyan-500/20 text-cyan-400 border-cyan-500/30" 
                        : "bg-muted/50 text-muted-foreground"
                    )}
                    data-testid="badge-target1"
                  >
                    T1 {unifiedSignal.targetProgress.target1Hit ? "✓" : "○"}
                  </Badge>
                  <Badge 
                    variant="outline" 
                    className={cn(
                      "text-[10px] px-1.5",
                      unifiedSignal.targetProgress.target2Hit 
                        ? "bg-purple-500/20 text-purple-400 border-purple-500/30" 
                        : "bg-muted/50 text-muted-foreground"
                    )}
                    data-testid="badge-target2"
                  >
                    T2 {unifiedSignal.targetProgress.target2Hit ? "✓" : "○"}
                  </Badge>
                </div>
                {unifiedSignal.targetProgress.target2Price && (
                  <span className="text-muted-foreground ml-auto font-mono">
                    T2: {formatPrice(unifiedSignal.targetProgress.target2Price)}
                  </span>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
              <FuturisticLineMeter
                label="Signal Confidence"
                value={unifiedSignal.confidence}
                tone={unifiedSignal.confidence >= 0.7 ? 'emerald' : unifiedSignal.confidence >= 0.5 ? 'amber' : 'red'}
                display={formatPct(unifiedSignal.confidence)}
                testId="text-unified-confidence"
              />
              <FuturisticLineMeter
                label="Failure Risk"
                value={riskModel.failureProb}
                tone={riskModel.failureProb > 0.6 ? 'red' : riskModel.failureProb > 0.35 ? 'amber' : 'emerald'}
                display={formatPct(riskModel.failureProb)}
              />
              <FuturisticLineMeter
                label="R:R Strength"
                value={rrNormalized}
                tone={rrValue >= 2 ? 'emerald' : rrValue >= 1 ? 'amber' : rrValue > 0 ? 'red' : 'slate'}
                display={rrValue > 0 ? `1:${rrValue.toFixed(1)}` : '—'}
                testId="badge-unified-rr"
              />
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border/40 bg-background/35 px-2 py-1.5 text-[10px] uppercase tracking-wider">
              <span className="text-white/45">Signal State</span>
              <Badge variant="outline" className={cn("text-[10px]", signalStatusColors[unifiedSignal.status])}>
                {(unifiedSignal.state || 'ACTIVE').toUpperCase()}
              </Badge>
            </div>

            {unifiedSignal.notes && unifiedSignal.notes.length > 0 && (
              <div className="text-[10px] text-muted-foreground p-2 rounded-lg bg-muted/20 border border-border/30">
                {unifiedSignal.notes.slice(0, 2).join(' • ')}
              </div>
            )}
          </div>
        )}

        <div className="relative overflow-hidden rounded-xl border border-violet-500/35 bg-gradient-to-br from-indigo-950/20 via-violet-950/10 to-cyan-950/10 p-2">
          <div className="pointer-events-none absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_50%_0%,rgba(139,92,246,0.25),transparent_56%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(129,140,248,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(56,189,248,0.18)_1px,transparent_1px)] [background-size:26px_26px]" />
          <div className="relative h-0.5 mb-2 bg-gradient-to-r from-violet-500 via-indigo-400 to-cyan-400" />
          <div className="relative mb-2 flex items-center justify-between text-[10px] uppercase tracking-wider">
            <span className="inline-flex items-center gap-1.5 font-semibold text-violet-300">
              <Compass className="h-3 w-3" />
              Forecast Matrix
            </span>
            <span className="rounded-md border border-violet-400/30 bg-violet-500/10 px-1.5 py-0.5 font-mono text-violet-200">MTF + Move</span>
          </div>
          <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5">
            <FuturisticArchGauge
              label="MTF Alignment"
              value={mtfConsensus.alignmentScore}
              display={formatPct(mtfConsensus.alignmentScore)}
              tone={mtfConsensus.alignmentScore >= 0.7 ? 'emerald' : mtfConsensus.alignmentScore >= 0.5 ? 'amber' : 'red'}
              testId="text-mtf-alignment"
              variant="telemetry"
            />
            <FuturisticArchGauge
              label="Forecast Conf"
              value={forecast.confidence}
              display={formatPct(forecast.confidence)}
              tone={forecast.confidence >= 0.7 ? 'emerald' : forecast.confidence >= 0.5 ? 'amber' : 'violet'}
              testId="text-forecast-confidence"
              variant="telemetry"
            />
            <FuturisticArchGauge
              label="Exp Move"
              value={Math.min(Math.abs(expectedMove.pct), 1)}
              display={formatPct(expectedMove.pct)}
              tone={Math.abs(expectedMove.pct) >= 0.01 ? 'cyan' : 'slate'}
              testId="text-expected-move"
              variant="telemetry"
            />
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-cyan-500/35 bg-gradient-to-br from-slate-900/40 via-cyan-950/10 to-blue-950/10 p-2 space-y-1.5">
          <div className="pointer-events-none absolute inset-0 opacity-25 bg-[radial-gradient(circle_at_20%_0%,rgba(6,182,212,0.22),transparent_52%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(34,211,238,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(59,130,246,0.16)_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="relative h-0.5 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500" />
          <div className="relative flex items-center justify-between text-sm">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
              <Gauge className="h-3 w-3" />
              Directional Probabilities
            </span>
            <span className="rounded-md border border-cyan-400/30 bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-mono text-cyan-200">Flow Bias</span>
          </div>
          <div className="relative grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 text-xs">
            <FuturisticArchGauge
              label="Up Prob"
              value={directionalProbabilities.up}
              display={formatPct(directionalProbabilities.up)}
              tone="emerald"
              testId="text-prob-up"
              variant="telemetry"
            />
            <FuturisticArchGauge
              label="Chop Prob"
              value={directionalProbabilities.chop}
              display={formatPct(directionalProbabilities.chop)}
              tone="slate"
              testId="text-prob-chop"
              variant="telemetry"
            />
            <FuturisticArchGauge
              label="Down Prob"
              value={directionalProbabilities.down}
              display={formatPct(directionalProbabilities.down)}
              tone="red"
              testId="text-prob-down"
              variant="telemetry"
            />
          </div>
        </div>

        <div className="relative overflow-hidden rounded-xl border border-cyan-500/35 bg-gradient-to-br from-slate-900/40 via-cyan-950/10 to-blue-950/15" data-testid="tf-stack-panel">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(6,182,212,0.16),transparent_52%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(34,211,238,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.18)_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="h-0.5 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500" />
          <div className="relative p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded-md bg-cyan-500/20 shadow-lg shadow-cyan-500/10">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-400">TF Stack</span>
              </div>
              <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/30 border border-border/30">
                <div className="flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3 text-emerald-400" />
                  <span className="font-mono text-sm font-bold text-emerald-400">{mtfConsensus.bullishStack}</span>
                </div>
                <span className="text-muted-foreground/50 mx-0.5">/</span>
                <span className="font-mono text-sm text-muted-foreground">{mtfConsensus.neutralStack}</span>
                <span className="text-muted-foreground/50 mx-0.5">/</span>
                <div className="flex items-center gap-0.5">
                  <TrendingDown className="w-3 h-3 text-red-400" />
                  <span className="font-mono text-sm font-bold text-red-400">{mtfConsensus.bearishStack}</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px]">
              <div className="rounded-md border border-emerald-500/25 bg-emerald-500/10 px-2 py-1.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="uppercase tracking-wide text-emerald-300/90">Alignment</span>
                  <span className="font-mono text-emerald-300">{formatPct(mtfConsensus.alignmentScore)}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-emerald-950/40">
                  <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-cyan-400" style={{ width: `${Math.min(100, mtfConsensus.alignmentScore * 100)}%` }} />
                </div>
              </div>
              <div className="rounded-md border border-red-500/25 bg-red-500/10 px-2 py-1.5">
                <div className="mb-1 flex items-center justify-between">
                  <span className="uppercase tracking-wide text-red-300/90">Conflict</span>
                  <span className="font-mono text-red-300">{formatPct(mtfConsensus.conflictLevel)}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-red-950/40">
                  <div className="h-full rounded-full bg-gradient-to-r from-red-500 to-orange-400" style={{ width: `${Math.min(100, mtfConsensus.conflictLevel * 100)}%` }} />
                </div>
              </div>
            </div>
            <div className="grid grid-cols-6 gap-1.5">
              {timeframes.map((tf: any) => {
                const bias = tf.trendBias ?? 'neutral';
                const tfConfidence = Math.max(0, Math.min(1, tf.primary?.confidence ?? 0));
                return (
                  <div 
                    key={tf.timeframe}
                    className={cn(
                      "relative overflow-hidden rounded-lg text-center py-2 px-1 border transition-all duration-200",
                      bias === 'bullish' && "bg-gradient-to-b from-emerald-500/35 via-emerald-500/15 to-emerald-500/5 border-emerald-400/55 shadow-lg shadow-emerald-500/15",
                      bias === 'bearish' && "bg-gradient-to-b from-red-500/35 via-red-500/15 to-red-500/5 border-red-400/55 shadow-lg shadow-red-500/15",
                      bias === 'neutral' && "bg-gradient-to-b from-muted/45 to-muted/20 border-border/55"
                    )}
                    data-testid={`tf-${tf.timeframe}`}
                  >
                    {bias !== 'neutral' && (
                      <div className={cn(
                        "absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-b",
                        bias === 'bullish' && "bg-emerald-400",
                        bias === 'bearish' && "bg-red-400"
                      )} />
                    )}
                    <div className={cn(
                      "font-bold text-xs",
                      bias === 'bullish' && "text-emerald-400",
                      bias === 'bearish' && "text-red-400",
                      bias === 'neutral' && "text-muted-foreground"
                    )}>{tf.timeframe}</div>
                    <div className={cn(
                      "text-[8px] truncate mt-0.5 font-medium",
                      bias === 'bullish' && "text-emerald-400/70",
                      bias === 'bearish' && "text-red-400/70",
                      bias === 'neutral' && "text-muted-foreground/70"
                    )}>
                      {bias === 'bullish' ? 'Bull' : bias === 'bearish' ? 'Bear' : 'Flat'}
                    </div>
                    <div className="mt-1 h-0.5 w-full overflow-hidden rounded-full bg-black/20">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          bias === 'bullish' && "bg-emerald-400/80",
                          bias === 'bearish' && "bg-red-400/80",
                          bias === 'neutral' && "bg-cyan-300/60"
                        )}
                        style={{ width: `${Math.max(6, tfConfidence * 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-3 rounded-lg bg-muted/20 border border-border/50 space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Breakout Zones</div>
          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            <div className="flex items-center justify-between p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
              <span className="text-muted-foreground">Upper</span>
              <span className="text-emerald-400 font-bold" data-testid="text-breakout-upper">
                {formatPrice(breakoutZones.upper)}
              </span>
            </div>
            <div className="flex items-center justify-between p-2 rounded-lg bg-red-500/10 border border-red-500/30">
              <span className="text-muted-foreground">Lower</span>
              <span className="text-red-400 font-bold" data-testid="text-breakout-lower">
                {formatPrice(breakoutZones.lower)}
              </span>
            </div>
          </div>
        </div>

        <div className="p-3 rounded-lg border space-y-2" style={{
          background: riskModel.riskIndex > 0.6 ? 'rgba(239, 68, 68, 0.1)' : 
                      riskModel.riskIndex > 0.3 ? 'rgba(245, 158, 11, 0.1)' : 
                      'rgba(16, 185, 129, 0.1)',
          borderColor: riskModel.riskIndex > 0.6 ? 'rgba(239, 68, 68, 0.3)' : 
                       riskModel.riskIndex > 0.3 ? 'rgba(245, 158, 11, 0.3)' : 
                       'rgba(16, 185, 129, 0.3)'
        }}>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-1">
              <AlertTriangle className={cn(
                "w-4 h-4",
                riskModel.riskIndex > 0.6 && "text-red-400",
                riskModel.riskIndex <= 0.6 && riskModel.riskIndex > 0.3 && "text-amber-400",
                riskModel.riskIndex <= 0.3 && "text-emerald-400"
              )} />
              <span className="text-[10px] font-semibold uppercase tracking-wider">Risk Model</span>
            </span>
            <Badge 
              variant="outline" 
              className={cn(
                "text-xs font-bold",
                riskModel.riskIndex > 0.6 && "bg-red-500/20 text-red-400 border-red-500/30",
                riskModel.riskIndex <= 0.6 && riskModel.riskIndex > 0.3 && "bg-amber-500/20 text-amber-400 border-amber-500/30",
                riskModel.riskIndex <= 0.3 && "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
              )}
            >
              {formatPct(riskModel.riskIndex)} Risk
            </Badge>
          </div>
          <div className="relative h-2 w-full overflow-hidden rounded-full bg-muted/30">
            <div 
              className={cn(
                "h-full rounded-full transition-all duration-500",
                riskModel.riskIndex > 0.6 && "bg-gradient-to-r from-red-600 to-red-400",
                riskModel.riskIndex <= 0.6 && riskModel.riskIndex > 0.3 && "bg-gradient-to-r from-amber-600 to-amber-400",
                riskModel.riskIndex <= 0.3 && "bg-gradient-to-r from-emerald-600 to-emerald-400"
              )}
              style={{ width: `${Math.min(100, riskModel.riskIndex * 100)}%` }}
            />
          </div>
          {riskModel.factors.length > 0 && (
            <div className="text-[10px] text-muted-foreground">
              {riskModel.factors.slice(0, 2).join(' • ')}
            </div>
          )}
        </div>

        {monsterGate > 0 && (
          <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-amber-500/10 via-transparent to-yellow-500/10 border border-amber-500/30">
            <div className="flex items-center gap-2">
              <div className="p-1 rounded-md bg-amber-500/20">
                <Zap className="w-4 h-4 text-amber-400" />
              </div>
              <span className="text-sm text-amber-400 font-semibold">Monster Gate</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-amber-400" data-testid="text-monster-gate">
                {formatPct(monsterGate)}
              </span>
              {otmBias !== 'none' && (
                <Badge className={cn(
                  "text-xs",
                  otmBias === 'calls' && "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
                  otmBias === 'puts' && "bg-red-500/20 text-red-400 border-red-500/30"
                )}>
                  {otmBias.toUpperCase()}
                </Badge>
              )}
            </div>
          </div>
        )}

        {gatingState && (
          <div className="relative overflow-hidden rounded-lg border border-violet-500/30" data-testid="gating-state">
            <div className="absolute inset-0 bg-gradient-to-br from-violet-500/10 via-transparent to-purple-500/5" />
            <div className="h-0.5 bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500" />
            <div className="relative p-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-md bg-gradient-to-br from-violet-500/30 to-purple-500/20 shadow-lg shadow-violet-500/20 border border-violet-500/30">
                    <Shield className="w-4 h-4 text-violet-400 drop-shadow-[0_0_4px_rgba(139,92,246,0.5)]" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold uppercase tracking-wider text-violet-400 drop-shadow-[0_0_6px_rgba(139,92,246,0.4)]">Monster State v2</span>
                    <span className="text-[9px] text-muted-foreground">Gating Score: <span className="font-mono text-violet-400">{((gatingState.gatingScore || 0) * 100).toFixed(0)}%</span></span>
                  </div>
                </div>
                <Badge 
                  variant="outline"
                  className={cn(
                    "text-xs font-bold px-3 py-1",
                    gatingState.metaAllowed && "bg-gradient-to-r from-emerald-500/20 to-emerald-500/10 text-emerald-400 border-emerald-500/40 shadow-lg shadow-emerald-500/20",
                    !gatingState.metaAllowed && "bg-gradient-to-r from-red-500/20 to-red-500/10 text-red-400 border-red-500/40 shadow-lg shadow-red-500/20"
                  )}
                  data-testid="badge-meta-signal"
                >
                  {gatingState.metaAllowed ? <Unlock className="w-3 h-3 mr-1 drop-shadow-[0_0_3px_rgba(52,211,153,0.5)]" /> : <Lock className="w-3 h-3 mr-1 drop-shadow-[0_0_3px_rgba(248,113,113,0.5)]" />}
                  {gatingState.metaAllowed ? 'UNLOCKED' : 'GATED'}
                </Badge>
              </div>

              <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-violet-500 via-purple-500 to-fuchsia-500 transition-all duration-500 shadow-lg shadow-violet-500/30"
                  style={{ width: `${(gatingState.gatingScore || 0) * 100}%` }}
                />
              </div>
            
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="relative overflow-hidden rounded-lg border border-border/50" data-testid="gating-bias">
                  <div className={cn(
                    "h-0.5",
                    gatingState.directionalBias === 'bullish' && "bg-gradient-to-r from-emerald-500 to-emerald-400",
                    gatingState.directionalBias === 'bearish' && "bg-gradient-to-r from-red-500 to-red-400",
                    gatingState.directionalBias === 'neutral' && "bg-gradient-to-r from-slate-500 to-slate-400"
                  )} />
                  <div className={cn(
                    "p-2.5 bg-gradient-to-br",
                    gatingState.directionalBias === 'bullish' && "from-emerald-500/10 to-transparent",
                    gatingState.directionalBias === 'bearish' && "from-red-500/10 to-transparent",
                    gatingState.directionalBias === 'neutral' && "from-muted/40 to-muted/20"
                  )}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Compass className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Bias</span>
                      </div>
                      <div className={cn(
                        "flex items-center gap-1.5 font-bold",
                        gatingState.directionalBias === 'bullish' && "text-emerald-400",
                        gatingState.directionalBias === 'bearish' && "text-red-400",
                        gatingState.directionalBias === 'neutral' && "text-muted-foreground"
                      )} data-testid="text-gating-bias">
                        {gatingState.directionalBias === 'bullish' && <TrendingUp className="w-3.5 h-3.5 drop-shadow-[0_0_3px_rgba(52,211,153,0.5)]" />}
                        {gatingState.directionalBias === 'bearish' && <TrendingDown className="w-3.5 h-3.5 drop-shadow-[0_0_3px_rgba(248,113,113,0.5)]" />}
                        {gatingState.directionalBias === 'neutral' && <Minus className="w-3.5 h-3.5" />}
                        <span className={cn(
                          gatingState.directionalBias === 'bullish' && "drop-shadow-[0_0_4px_rgba(52,211,153,0.4)]",
                          gatingState.directionalBias === 'bearish' && "drop-shadow-[0_0_4px_rgba(248,113,113,0.4)]"
                        )}>{gatingState.directionalBias.toUpperCase()}</span>
                        {gatingState.directionalBias !== gatingState.originalBias && (
                          <span className="text-muted-foreground/60 text-[10px] font-normal ml-1">
                            ({gatingState.originalBias})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="relative overflow-hidden rounded-lg border border-border/50" data-testid="gating-regime-cap">
                  <div className={cn(
                    "h-0.5",
                    gatingState.regimeCap === 'high' && "bg-gradient-to-r from-red-500 to-red-400",
                    gatingState.regimeCap === 'expanding' && "bg-gradient-to-r from-amber-500 to-amber-400",
                    gatingState.regimeCap === 'normal' && "bg-gradient-to-r from-emerald-500 to-emerald-400",
                    gatingState.regimeCap === 'range' && "bg-gradient-to-r from-cyan-500 to-cyan-400"
                  )} />
                  <div className={cn(
                    "p-2.5 bg-gradient-to-br",
                    gatingState.regimeCap === 'high' && "from-red-500/10 to-transparent",
                    gatingState.regimeCap === 'expanding' && "from-amber-500/10 to-transparent",
                    gatingState.regimeCap === 'normal' && "from-emerald-500/10 to-transparent",
                    gatingState.regimeCap === 'range' && "from-cyan-500/10 to-transparent"
                  )}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Gauge className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Regime</span>
                      </div>
                      <span className={cn(
                        "font-mono font-bold",
                        gatingState.regimeCap === 'high' && "text-red-400 drop-shadow-[0_0_4px_rgba(248,113,113,0.4)]",
                        gatingState.regimeCap === 'expanding' && "text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.4)]",
                        gatingState.regimeCap === 'normal' && "text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.4)]",
                        gatingState.regimeCap === 'range' && "text-cyan-400 drop-shadow-[0_0_4px_rgba(34,211,238,0.4)]"
                      )} data-testid="text-regime-cap">{gatingState.regimeCap.toUpperCase()}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5" data-testid="gating-flags">
              {gatingState.riskOverride && (
                <Badge variant="outline" className="text-[10px] bg-gradient-to-r from-red-500/20 to-red-500/10 text-red-400 border-red-500/30 shadow-sm shadow-red-500/20" data-testid="badge-risk-override">
                  <AlertTriangle className="w-2.5 h-2.5 mr-1" />
                  Risk Override
                </Badge>
              )}
              {gatingState.monsterConflict && (
                <Badge variant="outline" className="text-[10px] bg-gradient-to-r from-orange-500/20 to-orange-500/10 text-orange-400 border-orange-500/30 shadow-sm shadow-orange-500/20" data-testid="badge-monster-conflict">
                  <Zap className="w-2.5 h-2.5 mr-1" />
                  Monster Conflict
                </Badge>
              )}
              {gatingState.exhaustionActive && (
                <Badge variant="outline" className="text-[10px] bg-gradient-to-r from-purple-500/20 to-purple-500/10 text-purple-400 border-purple-500/30 shadow-sm shadow-purple-500/20" data-testid="badge-exhaustion">
                  <TrendingDown className="w-2.5 h-2.5 mr-1" />
                  Exhaustion
                </Badge>
              )}
              {gatingState.compressionActive && (
                <Badge variant="outline" className="text-[10px] bg-gradient-to-r from-blue-500/20 to-blue-500/10 text-blue-400 border-blue-500/30 shadow-sm shadow-blue-500/20" data-testid="badge-compression">
                  <Layers className="w-2.5 h-2.5 mr-1" />
                  Compression
                </Badge>
              )}
              {gatingState.lateMove && (
                <Badge variant="outline" className="text-[10px] bg-gradient-to-r from-yellow-500/20 to-yellow-500/10 text-yellow-400 border-yellow-500/30 shadow-sm shadow-yellow-500/20" data-testid="badge-late-move">
                  <Clock className="w-2.5 h-2.5 mr-1" />
                  Late Move
                </Badge>
              )}
              </div>

              {breakoutLifecycle && (
              <div className="relative overflow-hidden rounded-lg border border-border/50" data-testid="breakout-lifecycle">
                <div className={cn(
                  "h-0.5",
                  breakoutLifecycle.state === 'PRE' && "bg-gradient-to-r from-blue-500 to-blue-400",
                  breakoutLifecycle.state === 'IN_ZONE' && "bg-gradient-to-r from-emerald-500 to-emerald-400",
                  breakoutLifecycle.state === 'POST_LATE' && "bg-gradient-to-r from-red-500 to-red-400"
                )} />
                <div className={cn(
                  "flex items-center justify-between p-2.5 text-xs bg-gradient-to-br",
                  breakoutLifecycle.state === 'PRE' && "from-blue-500/10 to-transparent",
                  breakoutLifecycle.state === 'IN_ZONE' && "from-emerald-500/10 to-transparent",
                  breakoutLifecycle.state === 'POST_LATE' && "from-red-500/10 to-transparent"
                )}>
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <Timer className="w-3.5 h-3.5" />
                    Breakout Lifecycle
                  </span>
                  <Badge 
                    variant="outline"
                    className={cn(
                      "text-[10px] font-bold shadow-sm",
                      breakoutLifecycle.state === 'PRE' && "bg-gradient-to-r from-blue-500/20 to-blue-500/10 text-blue-400 border-blue-500/30 shadow-blue-500/20",
                      breakoutLifecycle.state === 'IN_ZONE' && "bg-gradient-to-r from-emerald-500/20 to-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-emerald-500/20",
                      breakoutLifecycle.state === 'POST_LATE' && "bg-gradient-to-r from-red-500/20 to-red-500/10 text-red-400 border-red-500/30 shadow-red-500/20"
                    )}
                    data-testid="badge-lifecycle-state"
                  >
                    {breakoutLifecycle.state.replace('_', ' ')}
                  </Badge>
                </div>
              </div>
            )}

            {emaTrend && (
              <div className="relative overflow-hidden rounded-lg border border-border/50" data-testid="ema-trend">
                <div className={cn(
                  "h-0.5",
                  emaTrend.direction === 'bullish' && "bg-gradient-to-r from-emerald-500 to-emerald-400",
                  emaTrend.direction === 'bearish' && "bg-gradient-to-r from-red-500 to-red-400",
                  emaTrend.direction === 'neutral' && "bg-gradient-to-r from-slate-500 to-slate-400"
                )} />
                <div className={cn(
                  "p-2.5 text-xs space-y-2 bg-gradient-to-br",
                  emaTrend.direction === 'bullish' && "from-emerald-500/10 to-transparent",
                  emaTrend.direction === 'bearish' && "from-red-500/10 to-transparent",
                  emaTrend.direction === 'neutral' && "from-muted/40 to-transparent"
                )}>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground flex items-center gap-1.5">
                      <Activity className="w-3.5 h-3.5" />
                      EMA Cloud
                    </span>
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="outline"
                        className={cn(
                          "text-[10px] font-bold shadow-sm",
                          emaTrend.direction === 'bullish' && "bg-gradient-to-r from-emerald-500/20 to-emerald-500/10 text-emerald-400 border-emerald-500/30 shadow-emerald-500/20",
                          emaTrend.direction === 'bearish' && "bg-gradient-to-r from-red-500/20 to-red-500/10 text-red-400 border-red-500/30 shadow-red-500/20",
                          emaTrend.direction === 'neutral' && "bg-muted/50 text-muted-foreground border-muted"
                        )}
                        data-testid="badge-ema-direction"
                      >
                        {emaTrend.direction.toUpperCase()}
                      </Badge>
                      <span className={cn(
                        "font-mono font-bold text-sm",
                        emaTrend.direction === 'bullish' && "text-emerald-400 drop-shadow-[0_0_4px_rgba(52,211,153,0.4)]",
                        emaTrend.direction === 'bearish' && "text-red-400 drop-shadow-[0_0_4px_rgba(248,113,113,0.4)]",
                        emaTrend.direction === 'neutral' && "text-muted-foreground"
                      )}>{emaTrend.strength.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="h-1 rounded-full bg-muted/50 overflow-hidden">
                    <div 
                      className={cn(
                        "h-full transition-all duration-500",
                        emaTrend.direction === 'bullish' && "bg-gradient-to-r from-emerald-500 to-emerald-400",
                        emaTrend.direction === 'bearish' && "bg-gradient-to-r from-red-500 to-red-400",
                        emaTrend.direction === 'neutral' && "bg-gradient-to-r from-slate-500 to-slate-400"
                      )}
                      style={{ width: `${Math.min(emaTrend.strength, 100)}%` }}
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {emaTrend.compression && (
                      <Badge variant="outline" className="text-[9px] bg-gradient-to-r from-purple-500/20 to-purple-500/10 text-purple-400 border-purple-500/30 shadow-sm shadow-purple-500/20" data-testid="badge-ema-compression">
                        <Layers className="w-2 h-2 mr-1" />
                        Compression
                      </Badge>
                    )}
                    {emaTrend.exhaustion && (
                      <Badge variant="outline" className="text-[9px] bg-gradient-to-r from-orange-500/20 to-orange-500/10 text-orange-400 border-orange-500/30 shadow-sm shadow-orange-500/20" data-testid="badge-ema-exhaustion">
                        <AlertTriangle className="w-2 h-2 mr-1" />
                        Exhaustion
                      </Badge>
                    )}
                    {emaTrend.flip && (
                      <Badge variant="outline" className="text-[9px] bg-gradient-to-r from-cyan-500/20 to-cyan-500/10 text-cyan-400 border-cyan-500/30 shadow-sm shadow-cyan-500/20" data-testid="badge-ema-flip">
                        <RotateCcw className="w-2 h-2 mr-1" />
                        Flip
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
            )}

            {corvonaLevels && (
              <div className="p-2 rounded-lg bg-muted/30 border border-border/50 text-xs" data-testid="corvona-levels">
                <div className="flex items-center gap-1 mb-1 text-muted-foreground">
                  <Target className="w-3 h-3" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider">Corvona Pivots</span>
                </div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
                  <div className="flex justify-between">
                    <span className="text-emerald-400 font-semibold">H4:</span>
                    <span className="font-mono">{formatPrice(corvonaLevels.H4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-400 font-semibold">L4:</span>
                    <span className="font-mono">{formatPrice(corvonaLevels.L4)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-emerald-400/70">H3:</span>
                    <span className="font-mono">{formatPrice(corvonaLevels.H3)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-red-400/70">L3:</span>
                    <span className="font-mono">{formatPrice(corvonaLevels.L3)}</span>
                  </div>
                </div>
              </div>
            )}

            {reversalSignal?.reversalSignal && (
              <div className="p-2 rounded-lg bg-muted/30 border border-border/50 text-xs space-y-1" data-testid="reversal-signal">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground flex items-center gap-1">
                    <RotateCcw className="w-3 h-3" />
                    Reversal Signal
                  </span>
                  <div className="flex items-center gap-1">
                    <Badge 
                      variant="outline"
                      className={cn(
                        "text-[10px] font-semibold",
                        reversalSignal.reversalDirection === 'up' && "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                        reversalSignal.reversalDirection === 'down' && "bg-red-500/10 text-red-400 border-red-500/20"
                      )}
                      data-testid="badge-reversal-direction"
                    >
                      {reversalSignal.reversalDirection.toUpperCase()}
                    </Badge>
                    <span className="text-muted-foreground font-mono">{reversalSignal.reversalConfidence}%</span>
                  </div>
                </div>
                {reversalSignal.reversalType && (
                  <Badge variant="outline" className="text-[9px] bg-cyan-500/10 text-cyan-400 border-cyan-500/20" data-testid="badge-reversal-type">
                    {reversalSignal.reversalType.replace(/_/g, ' ').toUpperCase()}
                  </Badge>
                )}
                {reversalSignal.reversalReasons.length > 0 && (
                  <div className="text-[9px] text-muted-foreground">
                    {reversalSignal.reversalReasons.slice(0, 2).join(' • ')}
                  </div>
                )}
              </div>
            )}

            {gatedReversalAlert?.alert && (
              <div 
                className={cn(
                  "p-3 rounded-lg border text-xs space-y-2",
                  gatedReversalAlert.gated 
                    ? "bg-gradient-to-br from-amber-500/10 via-transparent to-transparent border-amber-500/30" 
                    : gatedReversalAlert.direction === 'bullish'
                      ? "bg-gradient-to-br from-emerald-500/10 via-transparent to-transparent border-emerald-500/30"
                      : gatedReversalAlert.direction === 'bearish'
                        ? "bg-gradient-to-br from-red-500/10 via-transparent to-transparent border-red-500/30"
                        : "bg-muted/30 border-border"
                )} 
                data-testid="gated-reversal-alert"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RotateCcw className={cn(
                      "w-4 h-4",
                      gatedReversalAlert.gated 
                        ? "text-amber-400" 
                        : gatedReversalAlert.direction === 'bullish'
                          ? "text-emerald-400"
                          : "text-red-400"
                    )} />
                    <span className="font-semibold uppercase tracking-wide">
                      Reversal Alert
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant="outline"
                      className={cn(
                        "text-[10px] font-semibold",
                        gatedReversalAlert.direction === 'bullish' && "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
                        gatedReversalAlert.direction === 'bearish' && "bg-red-500/20 text-red-400 border-red-500/30",
                        gatedReversalAlert.direction === 'neutral' && "bg-muted text-muted-foreground border-border"
                      )}
                      data-testid="badge-reversal-alert-direction"
                    >
                      {gatedReversalAlert.direction.toUpperCase()}
                    </Badge>
                    <span className={cn(
                      "font-mono font-bold",
                      gatedReversalAlert.score >= 80 ? "text-emerald-400" : 
                      gatedReversalAlert.score >= 60 ? "text-amber-400" : "text-muted-foreground"
                    )}>
                      {gatedReversalAlert.score}%
                    </span>
                  </div>
                </div>

                {gatedReversalAlert.gated && (
                  <div className="flex items-center gap-1 text-amber-400">
                    <Lock className="w-3 h-3" />
                    <span className="text-[10px] font-semibold">GATED</span>
                    <span className="text-[9px] text-muted-foreground ml-1">
                      {gatedReversalAlert.gatingReasons.slice(0, 2).join(' • ')}
                    </span>
                  </div>
                )}

                {!gatedReversalAlert.gated && (
                  <div className="flex items-center gap-1 text-emerald-400">
                    <Unlock className="w-3 h-3" />
                    <span className="text-[10px] font-semibold">ACTIVE</span>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2 text-[10px]">
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">MTF:</span>
                    <span className={gatedReversalAlert.mtfAligned ? "text-emerald-400 font-semibold" : "text-red-400 font-semibold"}>
                      {gatedReversalAlert.mtfAligned ? 'ALIGNED' : 'CONFLICT'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Trend:</span>
                    <span className="font-mono font-semibold">{Math.round(gatedReversalAlert.trendStrength)}%</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">Vol:</span>
                    <span className={gatedReversalAlert.volatilityFavorable ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>
                      {gatedReversalAlert.volatilityFavorable ? 'OK' : 'SQUEEZE'}
                    </span>
                  </div>
                </div>

                {gatedReversalAlert.patterns.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {gatedReversalAlert.patterns.slice(0, 3).map((p, i) => (
                      <Badge 
                        key={i}
                        variant="outline" 
                        className={cn(
                          "text-[9px]",
                          p.type === 'bullish' && "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
                          p.type === 'bearish' && "bg-red-500/10 text-red-400 border-red-500/20"
                        )}
                        data-testid={`badge-reversal-pattern-${i}`}
                      >
                        {p.name.replace(/_/g, ' ').toUpperCase()} ({Math.round(p.confidence)}%)
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            )}

            {gatingState.reasons.length > 0 && (
              <div className="text-[10px] text-muted-foreground p-2 rounded-lg bg-muted/20 border border-border/30">
                {gatingState.reasons.slice(0, 2).join(' • ')}
              </div>
            )}
            </div>
          </div>
        )}

        <div className="text-xs text-muted-foreground space-y-1 pt-3 border-t border-border/50">
          {narrative.slice(0, 3).map((line, i) => (
            <p key={i} className="flex items-start gap-1">
              <ChevronRight className="w-3 h-3 mt-0.5 flex-shrink-0 text-indigo-400" />
              {line}
            </p>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
