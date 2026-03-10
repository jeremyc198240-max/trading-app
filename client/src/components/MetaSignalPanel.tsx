import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Target, 
  Shield, 
  Crosshair,
  Zap,
  AlertTriangle,
  Activity
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQueries } from "@tanstack/react-query";

interface MetaSignal {
  active: boolean;
  bias: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  playType: 'reversal' | 'continuation' | 'breakout' | 'mean_reversion' | 'none';
  entryZone?: { min: number; max: number };
  stopLoss?: number;
  targetPrimary?: number;
  targetStretch?: number;
  invalidationReason?: string;
}

interface MetaSignalPanelProps {
  metaSignal: MetaSignal | null | undefined;
  currentPrice?: number;
  symbol?: string;
  timeframe?: string;
}

const biasConfig = {
  bullish: {
    icon: TrendingUp,
    label: "BULLISH",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/30",
    gradient: "from-emerald-500/20 via-teal-500/10 to-transparent",
    accent: "bg-emerald-500"
  },
  bearish: {
    icon: TrendingDown,
    label: "BEARISH",
    color: "text-red-400",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
    gradient: "from-red-500/20 via-rose-500/10 to-transparent",
    accent: "bg-red-500"
  },
  neutral: {
    icon: Minus,
    label: "NEUTRAL",
    color: "text-muted-foreground",
    bg: "bg-muted/30",
    border: "border-muted/50",
    gradient: "from-muted/30 via-transparent to-transparent",
    accent: "bg-muted-foreground/50"
  }
};

const playTypeConfig: Record<string, { label: string; icon: typeof Zap; color: string }> = {
  reversal: { label: "Reversal", icon: AlertTriangle, color: "text-amber-400" },
  continuation: { label: "Continuation", icon: TrendingUp, color: "text-cyan-400" },
  breakout: { label: "Breakout", icon: Zap, color: "text-purple-400" },
  mean_reversion: { label: "Mean Rev", icon: Target, color: "text-blue-400" },
  none: { label: "No Setup", icon: Minus, color: "text-muted-foreground" }
};

function formatPrice(value: number | undefined): string {
  if (value === undefined) return "—";
  return `$${value.toFixed(2)}`;
}

type ReadinessState = 'WAIT' | 'BUILD' | 'READY' | 'NOW';
type PressureState = 'BUY' | 'SELL' | 'NEUTRAL';

function getReadiness(metaSignal: MetaSignal | null | undefined): { state: ReadinessState; value: number } {
  if (!metaSignal) return { state: 'WAIT', value: 10 };
  const strength = Math.max(0, Math.min(100, Math.round(metaSignal.strength || 0)));
  if (metaSignal.active && strength >= 70) return { state: 'NOW', value: Math.max(85, strength) };
  if (strength >= 60) return { state: 'READY', value: Math.max(65, strength) };
  if (strength >= 40) return { state: 'BUILD', value: Math.max(45, strength) };
  return { state: 'WAIT', value: Math.max(10, strength) };
}

function getPressureState(score: number | null): PressureState {
  if (score === null) return 'NEUTRAL';
  if (score >= 57) return 'BUY';
  if (score <= 43) return 'SELL';
  return 'NEUTRAL';
}

function toFiniteNumber(value: unknown): number | null {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function biasToVote(value: unknown): -1 | 0 | 1 {
  const text = String(value ?? '').toLowerCase();
  if (text === 'bullish') return 1;
  if (text === 'bearish') return -1;
  return 0;
}

function derivePressureScore(data: any): number | null {
  if (!data) return null;

  const bullishMeter = toFiniteNumber(data?.bullishPower?.meter);
  const candleStrength = toFiniteNumber(data?.candleStrength?.score);

  const biasVotes = [
    biasToVote(data?.tactical?.bias),
    biasToVote(data?.emaCloud?.trend),
    biasToVote(data?.metaSignal?.bias),
  ];

  const voteSum = biasVotes.reduce<number>((sum, value) => sum + value, 0);

  let score = bullishMeter ?? 50;

  // Add directional context so pressure reflects bias, not just raw candle intensity.
  if (bullishMeter === null) {
    score += voteSum * 9;
  } else {
    score += voteSum * 3.5;
  }

  // Candle strength is magnitude; only use it as a secondary amplifier.
  if (candleStrength !== null) {
    const impulse = (candleStrength - 50) * 0.25;
    if (voteSum > 0) score += Math.abs(impulse);
    else if (voteSum < 0) score -= Math.abs(impulse);
    else score += impulse * 0.2;
  }

  return Math.max(0, Math.min(100, score));
}

function CandlePressureArch({ tf, score }: { tf: string; score: number | null }) {
  const safeScore = score === null ? 50 : Math.max(0, Math.min(100, Math.round(score)));
  const pressure = getPressureState(score);
  const isBuy = pressure === 'BUY';
  const isSell = pressure === 'SELL';
  const arcBase = isBuy ? 'rgba(16,185,129,0.30)' : isSell ? 'rgba(248,113,113,0.30)' : 'rgba(56,189,248,0.30)';
  const arcTop = isBuy ? 'rgba(16,185,129,0.95)' : isSell ? 'rgba(248,113,113,0.95)' : 'rgba(56,189,248,0.9)';
  const dot = isBuy ? 'rgb(16,185,129)' : isSell ? 'rgb(248,113,113)' : 'rgb(34,211,238)';

  return (
    <div
      className="rounded-xl border px-2 py-1.5 flex flex-col items-center relative overflow-hidden group"
      style={{
        borderColor: isBuy ? 'rgba(16,185,129,0.55)' : isSell ? 'rgba(248,113,113,0.55)' : 'rgba(34,211,238,0.55)',
        background: 'linear-gradient(160deg, rgba(2,6,23,0.95), rgba(8,47,73,0.45) 52%, rgba(2,6,23,0.95))',
        boxShadow: isBuy
          ? 'inset 0 0 18px rgba(16,185,129,0.16), 0 0 14px rgba(16,185,129,0.22)'
          : isSell
          ? 'inset 0 0 18px rgba(248,113,113,0.16), 0 0 14px rgba(248,113,113,0.22)'
          : 'inset 0 0 18px rgba(34,211,238,0.16), 0 0 14px rgba(34,211,238,0.22)'
      }}
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute left-0 right-0 top-1 h-[1px] bg-gradient-to-r from-transparent via-cyan-300/80 to-transparent animate-pulse" />
        <div className="absolute left-2 top-2 w-2 h-2 border-l border-t border-cyan-300/60" />
        <div className="absolute right-2 top-2 w-2 h-2 border-r border-t border-cyan-300/60" />
        <div className="absolute left-2 bottom-2 w-2 h-2 border-l border-b border-cyan-300/60" />
        <div className="absolute right-2 bottom-2 w-2 h-2 border-r border-b border-cyan-300/60" />
      </div>
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
      <div className="text-[9px] font-mono text-cyan-200 mb-0.5 tracking-[0.18em]">{tf.toUpperCase()}</div>
      <svg width="126" height="40" viewBox="0 0 126 40" className="opacity-100">
        <defs>
          <linearGradient id={`tf-arc-${tf}-base`} x1="0" y1="0" x2="126" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="rgba(15,23,42,0.5)" />
            <stop offset="1" stopColor={arcBase} />
          </linearGradient>
          <linearGradient id={`tf-arc-${tf}-top`} x1="0" y1="0" x2="126" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={arcTop} />
            <stop offset="1" stopColor="rgba(255,255,255,0.92)" />
          </linearGradient>
        </defs>
        <path d="M10,30 Q63,4 116,30" fill="none" stroke={`url(#tf-arc-${tf}-base)`} strokeWidth="7" />
        <path d="M10,30 Q63,4 116,30" fill="none" stroke={`url(#tf-arc-${tf}-top)`} strokeWidth="2.6" />
        <circle
          cx={10 + (106 * safeScore) / 100}
          cy={30 - (26 * safeScore) / 100}
          r="4.1"
          fill={dot}
          style={{ filter: `drop-shadow(0 0 8px ${dot})` }}
        />
        <circle
          cx={10 + (106 * safeScore) / 100}
          cy={30 - (26 * safeScore) / 100}
          r="7"
          fill="none"
          stroke={dot}
          strokeOpacity="0.35"
          strokeWidth="1"
          className="animate-pulse"
        />
      </svg>
      <div className="w-[122px] flex items-center justify-between text-[8px] text-slate-400 font-mono -mt-1">
        <span>0</span><span>50</span><span>100</span>
      </div>
      <div className={cn(
        "text-[9px] font-mono mt-0.5 tracking-[0.12em]",
        isBuy ? "text-emerald-300" : isSell ? "text-red-300" : "text-cyan-300"
      )}>
        {pressure} {safeScore}%
      </div>
    </div>
  );
}

export function MetaSignalPanel({ metaSignal, currentPrice, symbol, timeframe }: MetaSignalPanelProps) {
  const pressureTfs = ['5m', '15m', '30m', '1h', '4h', '1d'];
  const pressureQueries = useQueries({
    queries: symbol
      ? pressureTfs.map((tf) => ({
          queryKey: ["/api/analyze", symbol, tf],
          enabled: !!symbol,
          staleTime: 10000,
          refetchInterval: 15000,
        }))
      : [],
  });

  const pressureByTf = pressureTfs.map((tf, idx) => {
    const data: any = pressureQueries[idx]?.data;
    const score = derivePressureScore(data);
    return { tf, score, state: getPressureState(score) };
  });

  const unlockAligned = pressureByTf.filter((p) => {
    if (!metaSignal) return false;
    if (metaSignal.bias === 'bullish') return p.state === 'BUY';
    if (metaSignal.bias === 'bearish') return p.state === 'SELL';
    return p.state === 'NEUTRAL';
  }).length;

  const readiness = getReadiness(metaSignal);
  const trendStrength = Math.max(0, Math.min(100, Math.round(metaSignal?.strength ?? 0)));

  if (!metaSignal || !metaSignal.active) {
    const inactiveBias = metaSignal?.bias ?? 'neutral';
    const inactiveConfig = biasConfig[inactiveBias];
    const InactiveIcon = inactiveConfig.icon;
    const inactivePlayConfig = playTypeConfig[metaSignal?.playType || 'none'] || playTypeConfig.none;

    return (
      <div
        className={cn(
          "relative overflow-hidden rounded-2xl border-2 mb-1 p-1 flex flex-col items-start justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950",
          inactiveBias === 'bullish' && "border-emerald-400/70 shadow-[0_0_24px_rgba(16,185,129,0.45)]",
          inactiveBias === 'bearish' && "border-red-400/70 shadow-[0_0_24px_rgba(248,113,113,0.45)]",
          inactiveBias === 'neutral' && "border-cyan-400/70 shadow-[0_0_24px_#0ff6]"
        )}
        style={{ backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
        data-testid="card-meta-signal"
      >
        <div
          className="absolute inset-0 pointer-events-none animate-pulse-slow"
          style={{
            background:
              inactiveBias === 'bullish'
                ? 'radial-gradient(circle at 60% 40%, rgba(16,185,129,0.22) 0%, #111a 80%)'
                : inactiveBias === 'bearish'
                ? 'radial-gradient(circle at 60% 40%, rgba(248,113,113,0.22) 0%, #111a 80%)'
                : 'radial-gradient(circle at 60% 40%, #0ff3 0%, #111a 80%)'
          }}
        />
        <div className="relative z-10 flex w-full flex-col items-start text-left">
          <div className="w-full rounded-xl border border-cyan-400/40 bg-gradient-to-br from-slate-950/95 via-cyan-950/25 to-slate-950/95 p-1 mb-0.5 relative overflow-hidden" style={{ boxShadow: 'inset 0 0 14px rgba(34,211,238,0.14), 0 0 12px rgba(34,211,238,0.16)' }}>
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute left-0 right-0 top-1 h-[1px] bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />
              <div className="absolute left-2 top-2 w-2 h-2 border-l border-t border-cyan-300/60" />
              <div className="absolute right-2 top-2 w-2 h-2 border-r border-t border-cyan-300/60" />
            </div>
            {(symbol || timeframe) && (
              <div className="mb-0.5 flex items-center gap-1">
                {symbol && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-cyan-400/40 text-cyan-200 bg-cyan-900/30">{symbol}</span>}
                {timeframe && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-cyan-400/30 text-cyan-300 bg-slate-900/40">{timeframe.toUpperCase()}</span>}
              </div>
            )}
            <span className={cn("text-[11px] font-extrabold uppercase tracking-widest drop-shadow-glow-2050 mb-0.5 flex items-center gap-1", inactiveConfig.color)}>
              <Crosshair className={cn("w-3.5 h-3.5", inactiveConfig.color)} />
              Meta Signal
            </span>
            <div className="mb-0.5 flex w-full items-center justify-between gap-1.5">
              <span className={cn("text-xl font-black font-mono drop-shadow-glow-2050 tracking-tight", inactiveConfig.color)}>INACTIVE</span>
              <span
                className={cn(
                  "text-xs font-bold uppercase tracking-widest px-2.5 py-0.5 rounded-full border shadow-[0_0_8px_rgba(34,211,238,0.25)]",
                  inactiveBias === 'bullish' && "bg-gradient-to-r from-emerald-700/60 to-emerald-900/60 text-emerald-100 border-emerald-400/40",
                  inactiveBias === 'bearish' && "bg-gradient-to-r from-red-700/60 to-red-900/60 text-red-100 border-red-400/40",
                  inactiveBias === 'neutral' && "bg-gradient-to-r from-cyan-700/60 to-cyan-900/60 text-cyan-100 border-cyan-400/40"
                )}
              >
                {inactiveConfig.label}
              </span>
            </div>
            <span className="text-[10px] font-semibold text-slate-300 flex items-center gap-1">
              <InactiveIcon className={cn("w-3.5 h-3.5", inactiveConfig.color)} />
              {inactivePlayConfig.label}
            </span>
          </div>
          <div className="mb-0.5 grid w-full grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-0.5 md:gap-1 items-center">
            <div className="flex flex-col items-center">
              <svg width="192" height="30" viewBox="0 0 192 30" className="opacity-95">
                <path d="M14,24 Q96,3 178,24" fill="none" stroke="rgba(56,189,248,0.35)" strokeWidth="6" />
                <path d="M14,24 Q96,3 178,24" fill="none" stroke="rgba(56,189,248,0.95)" strokeWidth="2.5" />
                <circle
                  cx={14 + (164 * readiness.value) / 100}
                  cy={24 - (20 * readiness.value) / 100}
                  r="4.2"
                  fill="rgb(34,211,238)"
                  style={{ filter: 'drop-shadow(0 0 9px rgba(34,211,238,0.95))' }}
                />
              </svg>
              <div className="-mt-0.5 flex w-[188px] items-center justify-between text-[10px] font-mono tracking-wider text-cyan-300/90">
                <span>WAIT</span>
                <span>BUILD</span>
                <span>READY</span>
                <span>NOW</span>
              </div>
              <span className="mt-0.5 text-[10px] font-mono text-cyan-200">STATE: {readiness.state}</span>
              <span className="text-[9px] font-mono text-cyan-300/80">READINESS ARCH</span>
            </div>

            <div className="flex flex-col items-center justify-center px-1 py-0.5 rounded-lg border border-cyan-400/35 bg-slate-950/60 shadow-[0_0_12px_rgba(34,211,238,0.16)]">
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full border shadow", inactiveConfig.color, inactiveConfig.bg, inactiveConfig.border)}>Confluence</span>
              <span className={cn("mt-0.5 text-[10px] text-center", inactiveConfig.color)}>{metaSignal?.invalidationReason || 'Confluence or regime filters not satisfied'}</span>
              {currentPrice !== undefined && (
                <div className="mt-0.5 text-[10px] text-slate-300 text-center">
                  <span className="text-slate-400">Current Price </span>
                  <span className="font-mono font-bold text-white">{formatPrice(currentPrice)}</span>
                </div>
              )}
              <span className="mt-0.5 text-[9px] text-slate-400 text-center">AI is monitoring for actionable setups...</span>
              <span className="text-[9px] text-cyan-400 font-semibold text-center">Watch: Volume / Momentum / Pattern triggers</span>
            </div>

            <div className="flex flex-col items-center">
              <svg width="192" height="30" viewBox="0 0 192 30" className="opacity-90">
                <path d="M14,24 Q96,3 178,24" fill="none" stroke="rgba(52,211,153,0.30)" strokeWidth="6" />
                <path d="M14,24 Q96,3 178,24" fill="none" stroke="rgba(52,211,153,0.95)" strokeWidth="2.5" />
                <circle
                  cx={14 + (164 * trendStrength) / 100}
                  cy={24 - (20 * trendStrength) / 100}
                  r="4.2"
                  fill="rgb(16,185,129)"
                  style={{ filter: 'drop-shadow(0 0 9px rgba(16,185,129,0.95))' }}
                />
              </svg>
              <div className="-mt-0.5 flex w-[188px] items-center justify-between text-[10px] font-mono tracking-wider text-emerald-300/90">
                <span>0</span>
                <span>25</span>
                <span>50</span>
                <span>75</span>
                <span>100</span>
              </div>
              <span className={cn("mt-0.5 text-[10px] font-mono font-bold", inactiveConfig.color)}>Confluence {Math.round(metaSignal?.strength ?? 0)}%</span>
              <span className="text-[9px] font-mono text-emerald-300/80">TREND STRENGTH ARCH</span>
            </div>
          </div>

          <div className="mb-0.5 w-full rounded-xl border border-cyan-400/50 bg-gradient-to-br from-slate-950/95 via-cyan-950/35 to-slate-950/95 p-1 relative overflow-hidden" style={{ boxShadow: 'inset 0 0 24px rgba(34,211,238,0.14), 0 0 18px rgba(34,211,238,0.18)' }}>
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute left-0 right-0 top-2 h-[1px] bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent animate-pulse" />
              <div className="absolute left-2 top-2 w-3 h-3 border-l border-t border-cyan-300/70" />
              <div className="absolute right-2 top-2 w-3 h-3 border-r border-t border-cyan-300/70" />
              <div className="absolute left-2 bottom-2 w-3 h-3 border-l border-b border-cyan-300/70" />
              <div className="absolute right-2 bottom-2 w-3 h-3 border-r border-b border-cyan-300/70" />
            </div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono text-cyan-200 tracking-[0.18em]">CANDLE PRESSURE MATRIX</span>
              <span className="text-[10px] font-mono text-cyan-100 px-1.5 py-0.5 rounded border border-cyan-300/50 bg-cyan-900/35 shadow-[0_0_10px_rgba(34,211,238,0.3)] animate-pulse">UNLOCK {unlockAligned}/6</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1">
              {pressureByTf.map((p) => (
                <CandlePressureArch key={`inactive-pressure-${p.tf}`} tf={p.tf} score={p.score} />
              ))}
            </div>
          </div>

        </div>
        <style>{`
          .drop-shadow-glow-2050 {
            filter: drop-shadow(0 0 4px #0ff) drop-shadow(0 0 2px #fff);
          }
          @keyframes pulse-slow {
            0% { opacity: 1; }
            50% { opacity: 0.8; }
            100% { opacity: 1; }
          }
          .animate-pulse-slow { animation: pulse-slow 3s infinite; }
        `}</style>
      </div>
    );
  }

  const config = biasConfig[metaSignal.bias];
  const BiasIcon = config.icon;
  const playConfig = playTypeConfig[metaSignal.playType] || playTypeConfig.none;
  const PlayIcon = playConfig.icon;

  return (
    <Card 
      className={cn(
        "overflow-hidden transition-all duration-300",
        metaSignal.active ? "border-cyan-500/30" : "border-border/50"
      )}
      data-testid="card-meta-signal"
      style={{ boxShadow: '0 0 26px rgba(34,211,238,0.16), inset 0 0 20px rgba(34,211,238,0.06)' }}
    >
      <div className={cn(
        "h-1",
        metaSignal.active 
          ? "bg-gradient-to-r from-cyan-600 via-blue-500 to-indigo-500" 
          : "bg-gradient-to-r from-cyan-600/30 via-blue-500/30 to-indigo-500/30"
      )} />
      
      <CardHeader className="py-1 px-2.5 border-b border-cyan-500/30 bg-gradient-to-r from-cyan-500/15 via-transparent to-blue-500/15 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-0 right-0 top-1 h-[1px] bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
          <div className="absolute left-2 top-2 w-2 h-2 border-l border-t border-cyan-300/60" />
          <div className="absolute right-2 top-2 w-2 h-2 border-r border-t border-cyan-300/60" />
        </div>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <div className="p-1 rounded-md bg-cyan-500/20">
              <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
            </div>
            <span className="text-cyan-400">Meta Signal</span>
            {(symbol || timeframe) && (
              <div className="ml-2 flex items-center gap-1">
                {symbol && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-cyan-500/30 text-cyan-300">{symbol}</span>}
                {timeframe && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border border-cyan-500/20 text-cyan-400">{timeframe.toUpperCase()}</span>}
              </div>
            )}
          </CardTitle>
          <div className={cn(
            "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
            metaSignal.active 
              ? `${config.bg} ${config.color} border ${config.border}` 
              : "bg-muted/30 text-muted-foreground"
          )}>
            {metaSignal.active ? "ACTIVE" : "INACTIVE"}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-1 space-y-0.5">
        <div className={cn("rounded-xl p-0.5 bg-gradient-to-br border border-cyan-700/35", config.gradient)} style={{ boxShadow: 'inset 0 0 22px rgba(34,211,238,0.12), 0 0 14px rgba(34,211,238,0.14)' }}>
          <div className="flex items-center justify-between mb-0.5">
            <div className="flex items-center gap-3">
              <div className={cn("p-1.5 rounded-lg", config.bg)}>
                <BiasIcon className={cn("w-5 h-5", config.color)} />
              </div>
              <div>
                <span className={cn("font-black text-base", config.color)} data-testid="text-bias">
                  {config.label}
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <PlayIcon className={cn("w-3 h-3", playConfig.color)} />
                  <span className={cn("text-[11px] font-medium", playConfig.color)}>{playConfig.label}</span>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className={cn("text-2xl font-black font-mono", config.color)} data-testid="text-strength">
                {Math.round(metaSignal.strength)}%
              </div>
              <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Strength</div>
            </div>
          </div>

          <div className="mb-0.5 grid w-full grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-0.5 md:gap-1 items-center">
            <div className="flex flex-col items-center">
              <svg width="192" height="30" viewBox="0 0 192 30" className="opacity-95">
                <path d="M14,24 Q96,3 178,24" fill="none" stroke="rgba(56,189,248,0.35)" strokeWidth="6" />
                <path d="M14,24 Q96,3 178,24" fill="none" stroke="rgba(56,189,248,0.95)" strokeWidth="2.5" />
                <circle
                  cx={14 + (164 * readiness.value) / 100}
                  cy={24 - (20 * readiness.value) / 100}
                  r="4.2"
                  fill="rgb(34,211,238)"
                  style={{ filter: 'drop-shadow(0 0 9px rgba(34,211,238,0.95))' }}
                />
              </svg>
              <div className="-mt-0.5 flex w-[188px] items-center justify-between text-[10px] font-mono tracking-wider text-cyan-300/90">
                <span>WAIT</span>
                <span>BUILD</span>
                <span>READY</span>
                <span>NOW</span>
              </div>
              <span className="mt-0.5 text-[10px] font-mono text-cyan-200">STATE: {readiness.state}</span>
              <span className="text-[9px] font-mono text-cyan-300/80">READINESS ARCH</span>
            </div>

            <div className="flex flex-col items-center justify-center px-1 py-0.5 rounded-lg border border-cyan-400/35 bg-slate-950/60 shadow-[0_0_12px_rgba(34,211,238,0.16)]">
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full border shadow", config.color, config.bg, config.border)}>Confluence</span>
              <span className={cn("mt-0.5 text-[10px] text-center", config.color)}>{metaSignal?.invalidationReason || 'Confluence or regime filters not satisfied'}</span>
              {currentPrice !== undefined && (
                <div className="mt-0.5 text-[10px] text-slate-300 text-center">
                  <span className="text-slate-400">Current Price </span>
                  <span className="font-mono font-bold text-white">{formatPrice(currentPrice)}</span>
                </div>
              )}
              <span className="mt-0.5 text-[9px] text-slate-400 text-center">AI is monitoring for actionable setups...</span>
              <span className="text-[9px] text-cyan-400 font-semibold text-center">Watch: Volume / Momentum / Pattern triggers</span>
            </div>

            <div className="flex flex-col items-center">
              <svg width="192" height="30" viewBox="0 0 192 30" className="opacity-90">
                <path d="M14,24 Q96,3 178,24" fill="none" stroke="rgba(52,211,153,0.30)" strokeWidth="6" />
                <path d="M14,24 Q96,3 178,24" fill="none" stroke="rgba(52,211,153,0.95)" strokeWidth="2.5" />
                <circle
                  cx={14 + (164 * trendStrength) / 100}
                  cy={24 - (20 * trendStrength) / 100}
                  r="4.2"
                  fill="rgb(16,185,129)"
                  style={{ filter: 'drop-shadow(0 0 9px rgba(16,185,129,0.95))' }}
                />
              </svg>
              <div className="-mt-0.5 flex w-[188px] items-center justify-between text-[10px] font-mono tracking-wider text-emerald-300/90">
                <span>0</span>
                <span>25</span>
                <span>50</span>
                <span>75</span>
                <span>100</span>
              </div>
              <span className={cn("mt-0.5 text-[10px] font-mono font-bold", config.color)}>Confluence {Math.round(metaSignal.strength)}%</span>
              <span className="text-[9px] font-mono text-emerald-300/80">TREND STRENGTH ARCH</span>
            </div>
          </div>

          <div className="mb-0.5 w-full rounded-xl border border-cyan-400/50 bg-gradient-to-br from-slate-950/95 via-cyan-950/35 to-slate-950/95 p-1 relative overflow-hidden" style={{ boxShadow: 'inset 0 0 24px rgba(34,211,238,0.14), 0 0 18px rgba(34,211,238,0.18)' }}>
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute left-0 right-0 top-2 h-[1px] bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent animate-pulse" />
              <div className="absolute left-2 top-2 w-3 h-3 border-l border-t border-cyan-300/70" />
              <div className="absolute right-2 top-2 w-3 h-3 border-r border-t border-cyan-300/70" />
              <div className="absolute left-2 bottom-2 w-3 h-3 border-l border-b border-cyan-300/70" />
              <div className="absolute right-2 bottom-2 w-3 h-3 border-r border-b border-cyan-300/70" />
            </div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono text-cyan-200 tracking-[0.18em]">CANDLE PRESSURE MATRIX</span>
              <span className="text-[10px] font-mono text-cyan-100 px-1.5 py-0.5 rounded border border-cyan-300/50 bg-cyan-900/35 shadow-[0_0_10px_rgba(34,211,238,0.3)] animate-pulse">UNLOCK {unlockAligned}/6</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-1">
              {pressureByTf.map((p) => (
                <CandlePressureArch key={`active-pressure-${p.tf}`} tf={p.tf} score={p.score} />
              ))}
            </div>
          </div>
          
          <div className="space-y-1">
            <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
              <div 
                className={cn(
                  "h-full rounded-full transition-all duration-500",
                  metaSignal.bias === "bullish" ? "bg-gradient-to-r from-emerald-600 to-emerald-400" :
                  metaSignal.bias === "bearish" ? "bg-gradient-to-r from-red-600 to-red-400" :
                  "bg-muted-foreground/50"
                )}
                style={{ width: `${metaSignal.strength}%` }}
              />
            </div>
          </div>
        </div>

        {metaSignal.active && (
          <div className="grid grid-cols-2 gap-1.5">
            <div className="p-2 rounded-lg bg-muted/20 border border-border/50 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground uppercase tracking-wider">
                <Target className="w-3 h-3 text-cyan-400" />
                Entry Zone
              </div>
              <div className="font-mono text-sm font-bold" data-testid="text-entry-zone">
                {metaSignal.entryZone 
                  ? `${formatPrice(metaSignal.entryZone.min)} - ${formatPrice(metaSignal.entryZone.max)}`
                  : "—"
                }
              </div>
            </div>

            <div className="p-2 rounded-lg bg-red-500/5 border border-red-500/20 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] text-red-400 uppercase tracking-wider">
                <Shield className="w-3 h-3" />
                Stop Loss
              </div>
              <div className="font-mono text-sm font-bold text-red-400" data-testid="text-stop-loss">
                {formatPrice(metaSignal.stopLoss)}
              </div>
            </div>

            <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-400 uppercase tracking-wider">
                <Crosshair className="w-3 h-3" />
                Target 1
              </div>
              <div className="font-mono text-sm font-bold text-emerald-400" data-testid="text-target-primary">
                {formatPrice(metaSignal.targetPrimary)}
              </div>
            </div>

            <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/20 space-y-1">
              <div className="flex items-center gap-1.5 text-[10px] text-amber-400 uppercase tracking-wider">
                <Zap className="w-3 h-3" />
                Target 2
              </div>
              <div className="font-mono text-sm font-bold text-amber-400">
                {formatPrice(metaSignal.targetStretch)}
              </div>
            </div>
          </div>
        )}

        {!metaSignal.active && metaSignal.invalidationReason && (
          <div className="p-3 rounded-lg bg-muted/20 border border-border/50">
            <p className="text-xs text-muted-foreground text-center italic">
              {metaSignal.invalidationReason}
            </p>
          </div>
        )}

        {currentPrice !== undefined && metaSignal.entryZone && (
          <div className="pt-3 border-t border-border/50">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Current Price</span>
              <span className="font-mono font-bold text-foreground">{formatPrice(currentPrice)}</span>
            </div>
            {metaSignal.stopLoss && metaSignal.targetPrimary && (
              <div className="flex items-center justify-between text-xs mt-2">
                <span className="text-muted-foreground">Risk/Reward</span>
                <div className="px-2 py-0.5 rounded bg-cyan-500/20 border border-cyan-500/30">
                  <span className="font-mono font-bold text-cyan-400">
                    1:{((Math.abs(metaSignal.targetPrimary - currentPrice)) / 
                        (Math.abs(currentPrice - metaSignal.stopLoss))).toFixed(1)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
