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

function hexToRgba(hex: string, alpha: number): string {
  const raw = hex.replace('#', '').trim();
  const expanded = raw.length === 3 ? raw.split('').map((ch) => ch + ch).join('') : raw;
  if (expanded.length !== 6) return `rgba(34, 211, 238, ${Math.max(0, Math.min(1, alpha))})`;

  const int = Number.parseInt(expanded, 16);
  const r = (int >> 16) & 255;
  const g = (int >> 8) & 255;
  const b = int & 255;
  const a = Math.max(0, Math.min(1, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
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

interface RadialGaugeProps {
  value: number;
  min?: number;
  max?: number;
  label: string;
  color?: string;
  bg?: string;
  size?: number;
}

function RadialGauge({ value, min = 0, max = 100, label, color = "#0ff", bg = "#222", size = 26 }: RadialGaugeProps) {
  const range = max - min === 0 ? 1 : max - min;
  const clampedValue = Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
  const pct = Math.max(0, Math.min(1, (clampedValue - min) / range));
  const dialSize = Math.max(52, Math.round(size * 1.75));
  const radius = dialSize / 2 - 10;
  const outerRadius = dialSize / 2 - 3;
  const cx = dialSize / 2;
  const cy = dialSize / 2;
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

  const fillEnd = -220 + 260 * pct;
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

  const brackets = [
    `M 8 2 L 2 2 L 2 8`,
    `M ${dialSize - 8} 2 L ${dialSize - 2} 2 L ${dialSize - 2} 8`,
    `M 8 ${dialSize - 2} L 2 ${dialSize - 2} L 2 ${dialSize - 8}`,
    `M ${dialSize - 8} ${dialSize - 2} L ${dialSize - 2} ${dialSize - 2} L ${dialSize - 2} ${dialSize - 8}`,
  ];

  const roundedValue = Math.round(clampedValue);
  const valueText = Math.abs(roundedValue) >= 1000 ? `${(roundedValue / 1000).toFixed(1)}k` : `${roundedValue}`;

  return (
    <div className="flex flex-col items-center gap-0.5" style={{ width: dialSize + 8 }}>
      <div
        className="relative overflow-hidden rounded-lg border px-1 py-0.5"
        style={{
          borderColor: hexToRgba(color, 0.38),
          background: `linear-gradient(165deg, ${hexToRgba(color, 0.14)}, rgba(2, 8, 18, 0.8))`,
          boxShadow: `inset 0 0 16px ${hexToRgba(color, 0.14)}, 0 0 12px ${hexToRgba(color, 0.22)}`,
        }}
      >
        <svg width={dialSize} height={dialSize} viewBox={`0 0 ${dialSize} ${dialSize}`}>
          {brackets.map((d, i) => (
            <path key={i} d={d} fill="none" stroke={hexToRgba(color, 0.5)} strokeWidth="1.2" strokeLinecap="square" />
          ))}
          <circle cx={cx} cy={cy} r={outerRadius - 1} fill="none" stroke={hexToRgba(color, 0.14)} strokeWidth="0.6" />
          {ticks.map(({ x1, y1, x2, y2, active }, i) => (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={active ? hexToRgba(color, 0.92) : 'rgba(255,255,255,0.08)'}
              strokeWidth={i === 0 || i === 8 ? '1.5' : '0.85'}
              strokeLinecap="round"
            />
          ))}
          <path d={arcPath(-220, 40, radius)} fill="none" stroke={hexToRgba(bg, 0.55)} strokeWidth="7" strokeLinecap="round" strokeDasharray="4 3" />
          {pct > 0 && (
            <path
              d={arcPath(-220, fillEnd, radius)}
              fill="none"
              stroke={color}
              strokeWidth="8"
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 9px ${color})`, opacity: 0.24 }}
            />
          )}
          {pct > 0 && (
            <path
              d={arcPath(-220, fillEnd, radius)}
              fill="none"
              stroke={color}
              strokeWidth="5"
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 6px ${color})` }}
            />
          )}
          {pct > 0.02 && (
            <circle
              cx={tipX}
              cy={tipY}
              r="3"
              fill={color}
              style={{ filter: `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 12px ${color})` }}
            />
          )}
          <circle cx={cx} cy={cy} r={radius - 8} fill={hexToRgba(color, 0.08)} />
          <circle cx={cx} cy={cy} r={radius - 8} fill="none" stroke={hexToRgba(color, 0.2)} strokeWidth="0.6" />
          <text
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={color}
            fontSize="10.5"
            fontWeight="900"
            fontFamily="monospace"
            style={{ filter: `drop-shadow(0 0 7px ${color})` }}
          >
            {valueText}
          </text>
          <text
            x={cx}
            y={cy + 8}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="rgba(255,255,255,0.28)"
            fontSize="5"
            fontWeight="700"
            letterSpacing="1.2"
          >
            {pct >= 0.65 ? 'HIGH' : pct <= 0.35 ? 'LOW' : 'MID'}
          </text>
        </svg>
      </div>
      <span className="text-[7px] font-black tracking-[0.18em] uppercase text-white/35">{label}</span>
    </div>
  );
}

function CompressionHudArc({ value, phase, color }: { value: number; phase?: string; color: string }) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const pct = clamped / 100;
  const phaseLabel = (phase || 'N/A').toUpperCase();

  const sx = 14;
  const sy = 42;
  const qx = 74;
  const qy = 8;
  const ex = 134;
  const ey = 42;
  const path = `M ${sx} ${sy} Q ${qx} ${qy} ${ex} ${ey}`;

  const pointAt = (t: number) => {
    const u = Math.max(0, Math.min(1, t));
    const inv = 1 - u;
    return {
      x: inv * inv * sx + 2 * inv * u * qx + u * u * ex,
      y: inv * inv * sy + 2 * inv * u * qy + u * u * ey,
    };
  };

  const tip = pointAt(pct);
  const ticks = Array.from({ length: 9 }, (_, i) => pointAt(i / 8));
  const brackets = [
    'M 8 2 L 2 2 L 2 8',
    'M 140 2 L 146 2 L 146 8',
    'M 8 54 L 2 54 L 2 48',
    'M 140 54 L 146 54 L 146 48',
  ];

  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        className="relative w-full max-w-[178px] overflow-hidden rounded-lg border px-1 py-1"
        style={{
          borderColor: hexToRgba(color, 0.42),
          background: `linear-gradient(165deg, ${hexToRgba(color, 0.15)}, rgba(2, 8, 18, 0.82))`,
          boxShadow: `inset 0 0 16px ${hexToRgba(color, 0.14)}, 0 0 14px ${hexToRgba(color, 0.2)}`,
        }}
      >
        <svg viewBox="0 0 148 56" className="h-[56px] w-full">
          {brackets.map((d, i) => (
            <path key={i} d={d} fill="none" stroke={hexToRgba(color, 0.5)} strokeWidth="1.2" strokeLinecap="square" />
          ))}
          {ticks.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={i === 0 || i === 8 ? '1.4' : '1'} fill={hexToRgba(color, i / 8 <= pct ? 0.75 : 0.22)} />
          ))}
          <path d={path} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="7" strokeLinecap="round" strokeDasharray="4 3" />
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${Math.max(1, pct * 100)} 100`}
            style={{ opacity: 0.24, filter: `drop-shadow(0 0 10px ${color})` }}
          />
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth="4.8"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${Math.max(1, pct * 100)} 100`}
            style={{ filter: `drop-shadow(0 0 6px ${color})` }}
          />
          <circle cx={tip.x} cy={tip.y} r="3.4" fill={color} style={{ filter: `drop-shadow(0 0 6px ${color}) drop-shadow(0 0 12px ${color})` }} />
          <text
            x="74"
            y="30"
            textAnchor="middle"
            dominantBaseline="middle"
            fill={color}
            fontSize="12"
            fontWeight="900"
            fontFamily="monospace"
            style={{ filter: `drop-shadow(0 0 8px ${color})` }}
          >
            {Math.round(clamped)}%
          </text>
          <text x="74" y="41" textAnchor="middle" fill="rgba(255,255,255,0.35)" fontSize="5.8" fontWeight="700" letterSpacing="1.2">
            {phaseLabel}
          </text>
        </svg>
      </div>
      <div className="flex w-full max-w-[178px] items-center justify-between text-[8px] font-mono">
        <span style={{ color: hexToRgba(color, 0.65) }}>0</span>
        <span className="font-black tracking-[0.16em]" style={{ color: hexToRgba(color, 0.88) }}>ARCH</span>
        <span style={{ color: hexToRgba(color, 0.65) }}>100</span>
      </div>
    </div>
  );
}

function MetaBreakoutGaugeStrip({
  readinessValue,
  trendStrength,
  unlockAligned,
  unlockGoal,
  buyVotes,
  sellVotes,
}: {
  readinessValue: number;
  trendStrength: number;
  unlockAligned: number;
  unlockGoal: number;
  buyVotes: number;
  sellVotes: number;
}) {
  const unlockPct = Math.max(0, Math.min(100, (unlockAligned / 6) * 100));
  const trendColor = trendStrength >= 60 ? '#10b981' : trendStrength <= 40 ? '#ef4444' : '#22d3ee';
  const unlockColor = unlockAligned >= unlockGoal ? '#10b981' : unlockAligned >= unlockGoal - 1 ? '#f59e0b' : '#22d3ee';

  return (
    <div className="mb-0.5 flex w-full flex-wrap items-start justify-center gap-1.5 px-1">
      <RadialGauge value={readinessValue} min={0} max={100} label="READ" color="#22d3ee" bg="#0f172a" size={38} />
      <RadialGauge value={trendStrength} min={0} max={100} label="CONF" color={trendColor} bg="#0f172a" size={38} />
      <RadialGauge value={unlockPct} min={0} max={100} label="UNLK" color={unlockColor} bg="#0f172a" size={38} />
      <RadialGauge value={buyVotes} min={0} max={6} label="BUY" color="#10b981" bg="#0f172a" size={38} />
      <RadialGauge value={sellVotes} min={0} max={6} label="SELL" color="#ef4444" bg="#0f172a" size={38} />
    </div>
  );
}

function CandlePressureArch({ tf, score }: { tf: string; score: number | null }) {
  const safeScore = score === null ? 50 : Math.max(0, Math.min(100, Math.round(score)));
  const pressure = getPressureState(score);
  const isBuy = pressure === 'BUY';
  const isSell = pressure === 'SELL';
  const color = isBuy ? '#10b981' : isSell ? '#ef4444' : '#22d3ee';

  return (
    <div
      className="rounded-xl border px-1.5 py-1 flex flex-col items-center"
      style={{
        borderColor: hexToRgba(color, 0.42),
        background: `linear-gradient(165deg, ${hexToRgba(color, 0.14)}, rgba(2, 8, 18, 0.84))`,
        boxShadow: `inset 0 0 16px ${hexToRgba(color, 0.14)}, 0 0 14px ${hexToRgba(color, 0.2)}`,
      }}
    >
      <div className="mb-0.5 flex w-full items-center justify-between px-1">
        <span className="text-[10px] font-black uppercase tracking-[0.14em]" style={{ color: hexToRgba(color, 0.9) }}>
          {tf.toUpperCase()}
        </span>
        <span className="text-[9px] font-mono font-bold" style={{ color: hexToRgba(color, 0.78) }}>
          {pressure}
        </span>
      </div>
      <CompressionHudArc value={safeScore} phase={pressure} color={color} />
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
          refetchInterval: 30000,
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
  const buyVotes = pressureByTf.filter((p) => p.state === 'BUY').length;
  const sellVotes = pressureByTf.filter((p) => p.state === 'SELL').length;
  const neutralVotes = pressureByTf.length - buyVotes - sellVotes;
  const unlockGoal = metaSignal?.active ? 4 : 5;
  const triggerArmed = unlockAligned >= unlockGoal && readiness.value >= 60;
  const hasDirectionalMajority = buyVotes >= 4 || sellVotes >= 4;
  const directionalPressure = buyVotes > sellVotes ? 'BUY PRESSURE' : sellVotes > buyVotes ? 'SELL PRESSURE' : 'MIXED FLOW';
  const pressureColor =
    buyVotes > sellVotes ? 'text-emerald-300 border-emerald-400/45 bg-emerald-500/10' :
    sellVotes > buyVotes ? 'text-red-300 border-red-400/45 bg-red-500/10' :
    'text-cyan-300 border-cyan-400/45 bg-cyan-500/10';

  const stopDistancePct =
    metaSignal?.stopLoss != null && currentPrice != null && currentPrice > 0
      ? (Math.abs(currentPrice - metaSignal.stopLoss) / currentPrice) * 100
      : null;
  const riskReward =
    metaSignal?.targetPrimary != null && metaSignal?.stopLoss != null && currentPrice != null
      ? Math.abs(metaSignal.targetPrimary - currentPrice) / Math.max(Math.abs(currentPrice - metaSignal.stopLoss), 0.0001)
      : null;

  const intradayCue =
    !hasDirectionalMajority
      ? 'Mixed pressure. Let 5m and 15m align before committing size.'
      : !triggerArmed
      ? `Setup building. Wait for at least ${unlockGoal}/6 unlock and readiness >= 60.`
      : metaSignal?.bias === 'bullish'
      ? 'Momentum favorable. Prefer pullback entries above invalidation.'
      : metaSignal?.bias === 'bearish'
      ? 'Downside pressure active. Favor failed-bounce or breakdown entries.'
      : 'No directional bias edge. Keep risk tighter or stay flat.';

  const panelBias = metaSignal?.bias ?? 'neutral';
  const panelTone =
    panelBias === 'bullish' ? '#10b981' : panelBias === 'bearish' ? '#ef4444' : '#22d3ee';
  const trendArchColor = panelBias === 'bullish' ? '#10b981' : panelBias === 'bearish' ? '#ef4444' : '#22d3ee';
  const panelTopBar =
    panelBias === 'bullish'
      ? 'from-emerald-600 via-teal-400 to-cyan-500'
      : panelBias === 'bearish'
      ? 'from-red-700 via-rose-500 to-orange-400'
      : 'from-cyan-600 via-blue-500 to-indigo-500';

  if (!metaSignal || !metaSignal.active) {
    const inactiveBias = metaSignal?.bias ?? 'neutral';
    const inactiveConfig = biasConfig[inactiveBias];
    const InactiveIcon = inactiveConfig.icon;
    const inactivePlayConfig = playTypeConfig[metaSignal?.playType || 'none'] || playTypeConfig.none;

    return (
      <Card
        className={cn(
          "relative overflow-hidden rounded-2xl border mb-1 backdrop-blur-md transition-all duration-300",
          inactiveBias === 'bullish' && "border-emerald-400/52",
          inactiveBias === 'bearish' && "border-red-400/52",
          inactiveBias === 'neutral' && "border-cyan-400/52"
        )}
        style={{
          background: "linear-gradient(150deg,#07080d 0%,#0b0d18 58%,#05070d 100%)",
          boxShadow: `0 0 30px ${panelTone}2a, inset 0 0 30px ${panelTone}14`,
        }}
        data-testid="card-meta-signal"
      >
        <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.007) 3px,rgba(255,255,255,0.007) 4px)" }} />
        <div className="pointer-events-none absolute inset-0 opacity-18" style={{ backgroundImage: `linear-gradient(${panelTone}20 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,0.08) 1px,transparent 1px)`, backgroundSize: "22px 22px" }} />
        <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r", panelTopBar)} />
        <div className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l border-t" style={{ borderColor: panelTone + "66" }} />
        <div className="pointer-events-none absolute right-2 bottom-2 h-3 w-3 border-r border-b" style={{ borderColor: panelTone + "4d" }} />
        <div className="pointer-events-none absolute right-2 top-2 text-[8px] tracking-[0.18em] font-mono" style={{ color: panelTone + "aa" }}>META HUD</div>

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
        <CardContent className="relative z-20 p-1">
          <div className="flex w-full flex-col items-start text-left">
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
            <div className="flex flex-col items-center justify-center">
              <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-200">Readiness Arch</div>
              <CompressionHudArc value={readiness.value} phase={readiness.state} color="#22d3ee" />
              <div className="mt-0.5 flex w-full max-w-[178px] items-center justify-between text-[8px] font-mono tracking-wider text-cyan-300/80">
                <span>WAIT</span>
                <span>BUILD</span>
                <span>READY</span>
                <span>NOW</span>
              </div>
              <span className="mt-0.5 text-[10px] font-mono text-cyan-200">STATE {readiness.state}</span>
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

            <div className="flex flex-col items-center justify-center">
              <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: hexToRgba(trendArchColor, 0.9) }}>
                Trend Strength Arch
              </div>
              <CompressionHudArc value={trendStrength} phase={inactiveConfig.label} color={trendArchColor} />
              <div className="mt-0.5 flex w-full max-w-[178px] items-center justify-between text-[8px] font-mono tracking-wider" style={{ color: hexToRgba(trendArchColor, 0.74) }}>
                <span>0</span>
                <span>25</span>
                <span>50</span>
                <span>75</span>
                <span>100</span>
              </div>
              <span className={cn("mt-0.5 text-[10px] font-mono font-bold", inactiveConfig.color)}>Confluence {Math.round(metaSignal?.strength ?? 0)}%</span>
            </div>
          </div>

          <MetaBreakoutGaugeStrip
            readinessValue={readiness.value}
            trendStrength={trendStrength}
            unlockAligned={unlockAligned}
            unlockGoal={unlockGoal}
            buyVotes={buyVotes}
            sellVotes={sellVotes}
          />

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

          <div className="w-full rounded-xl border border-cyan-400/45 bg-gradient-to-br from-slate-950/95 via-cyan-950/22 to-slate-950/95 p-1 relative overflow-hidden" style={{ boxShadow: 'inset 0 0 20px rgba(34,211,238,0.10), 0 0 14px rgba(34,211,238,0.12)' }}>
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute left-0 right-0 top-1 h-[1px] bg-gradient-to-r from-transparent via-cyan-300/55 to-transparent" />
              <div className="absolute left-2 top-2 w-2.5 h-2.5 border-l border-t border-cyan-300/60" />
              <div className="absolute right-2 bottom-2 w-2.5 h-2.5 border-r border-b border-cyan-300/50" />
            </div>
            <div className="mb-1 flex items-center justify-between gap-1">
              <span className="text-[10px] font-mono text-cyan-200 tracking-[0.18em]">INTRADAY DECISION RAIL</span>
              <span className={cn('text-[9px] font-mono px-1.5 py-0.5 rounded border', pressureColor)}>{directionalPressure}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-1 mb-1">
              <div className="rounded border border-cyan-400/30 bg-slate-950/65 px-1.5 py-1">
                <div className="text-[8px] text-cyan-300/85 font-mono tracking-wider uppercase">Unlock</div>
                <div className="text-[11px] font-mono font-black text-cyan-100">{unlockAligned}/6</div>
                <div className="text-[8px] text-slate-400">Goal {unlockGoal}/6</div>
              </div>
              <div className="rounded border border-cyan-400/30 bg-slate-950/65 px-1.5 py-1">
                <div className="text-[8px] text-cyan-300/85 font-mono tracking-wider uppercase">Vote Mix</div>
                <div className="text-[10px] font-mono text-emerald-300">BUY {buyVotes}</div>
                <div className="text-[10px] font-mono text-red-300">SELL {sellVotes}</div>
                <div className="text-[8px] text-slate-400">NEUT {neutralVotes}</div>
              </div>
              <div className="rounded border border-cyan-400/30 bg-slate-950/65 px-1.5 py-1">
                <div className="text-[8px] text-cyan-300/85 font-mono tracking-wider uppercase">Risk Frame</div>
                <div className="text-[10px] font-mono text-cyan-100">Stop {stopDistancePct == null ? '--' : `${stopDistancePct.toFixed(2)}%`}</div>
                <div className="text-[10px] font-mono text-cyan-100">R:R {riskReward == null ? '--' : `1:${riskReward.toFixed(1)}`}</div>
              </div>
            </div>
            <div className="rounded border border-cyan-400/25 bg-slate-950/70 px-2 py-1 text-[10px] text-cyan-100/90">
              {intradayCue}
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
        </CardContent>
      </Card>
    );
  }

  const config = biasConfig[metaSignal.bias];
  const BiasIcon = config.icon;
  const playConfig = playTypeConfig[metaSignal.playType] || playTypeConfig.none;
  const PlayIcon = playConfig.icon;

  return (
    <Card
      className={cn(
        "relative overflow-hidden rounded-2xl border backdrop-blur-md transition-all duration-300",
        panelBias === 'bullish'
          ? "border-emerald-400/52"
          : panelBias === 'bearish'
          ? "border-red-400/52"
          : "border-cyan-400/52"
      )}
      data-testid="card-meta-signal"
      style={{
        background: "linear-gradient(150deg,#07080d 0%,#0b0d18 58%,#05070d 100%)",
        boxShadow: `0 0 30px ${panelTone}2a, inset 0 0 30px ${panelTone}14`,
      }}
    >
      <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.007) 3px,rgba(255,255,255,0.007) 4px)" }} />
      <div className="pointer-events-none absolute inset-0 opacity-18" style={{ backgroundImage: `linear-gradient(${panelTone}20 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,0.08) 1px,transparent 1px)`, backgroundSize: "22px 22px" }} />
      <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r", panelTopBar)} />
      <div className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l border-t" style={{ borderColor: panelTone + "66" }} />
      <div className="pointer-events-none absolute right-2 bottom-2 h-3 w-3 border-r border-b" style={{ borderColor: panelTone + "4d" }} />
      <div className="pointer-events-none absolute right-2 top-2 text-[8px] tracking-[0.18em] font-mono" style={{ color: panelTone + "aa" }}>META HUD</div>

      <CardHeader
        className="relative z-20 py-1 px-2.5 border-b overflow-hidden"
        style={{
          borderColor: panelTone + '42',
          background: `linear-gradient(135deg,${panelTone}16,rgba(2,6,23,0.88) 58%)`,
          boxShadow: `inset 0 0 18px ${panelTone}18, 0 0 20px ${panelTone}20`,
        }}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute left-0 right-0 top-1 h-[1px]" style={{ background: `linear-gradient(90deg,transparent,${panelTone}88,transparent)` }} />
          <div className="absolute left-2 top-2 w-2 h-2 border-l border-t" style={{ borderColor: panelTone + '66' }} />
          <div className="absolute right-2 top-2 w-2 h-2 border-r border-t" style={{ borderColor: panelTone + '66' }} />
        </div>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
            <div className="p-1 rounded-md border" style={{ backgroundColor: panelTone + '20', borderColor: panelTone + '44' }}>
              <Crosshair className="w-3.5 h-3.5" style={{ color: panelTone }} />
            </div>
            <span style={{ color: panelTone }}>Meta Signal</span>
            {(symbol || timeframe) && (
              <div className="ml-2 flex items-center gap-1">
                {symbol && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border" style={{ borderColor: panelTone + '4d', color: panelTone, backgroundColor: panelTone + '12' }}>{symbol}</span>}
                {timeframe && <span className="text-[9px] font-mono px-1.5 py-0.5 rounded border" style={{ borderColor: panelTone + '38', color: panelTone + 'dd' }}>{timeframe.toUpperCase()}</span>}
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
      
      <CardContent className="relative z-20 p-1 space-y-0.5">
        <div className={cn("rounded-xl p-0.5 bg-gradient-to-br border", config.gradient)} style={{ borderColor: panelTone + '48', boxShadow: `inset 0 0 22px ${panelTone}1a, 0 0 14px ${panelTone}20` }}>
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
            <div className="flex flex-col items-center justify-center">
              <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide text-cyan-200">Readiness Arch</div>
              <CompressionHudArc value={readiness.value} phase={readiness.state} color="#22d3ee" />
              <div className="mt-0.5 flex w-full max-w-[178px] items-center justify-between text-[8px] font-mono tracking-wider text-cyan-300/80">
                <span>WAIT</span>
                <span>BUILD</span>
                <span>READY</span>
                <span>NOW</span>
              </div>
              <span className="mt-0.5 text-[10px] font-mono text-cyan-200">STATE {readiness.state}</span>
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

            <div className="flex flex-col items-center justify-center">
              <div className="mb-0.5 text-[10px] font-bold uppercase tracking-wide" style={{ color: hexToRgba(trendArchColor, 0.9) }}>
                Trend Strength Arch
              </div>
              <CompressionHudArc value={trendStrength} phase={config.label} color={trendArchColor} />
              <div className="mt-0.5 flex w-full max-w-[178px] items-center justify-between text-[8px] font-mono tracking-wider" style={{ color: hexToRgba(trendArchColor, 0.74) }}>
                <span>0</span>
                <span>25</span>
                <span>50</span>
                <span>75</span>
                <span>100</span>
              </div>
              <span className={cn("mt-0.5 text-[10px] font-mono font-bold", config.color)}>Confluence {Math.round(metaSignal.strength)}%</span>
            </div>
          </div>

          <MetaBreakoutGaugeStrip
            readinessValue={readiness.value}
            trendStrength={trendStrength}
            unlockAligned={unlockAligned}
            unlockGoal={unlockGoal}
            buyVotes={buyVotes}
            sellVotes={sellVotes}
          />

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

          <div className="w-full rounded-xl border border-cyan-400/45 bg-gradient-to-br from-slate-950/95 via-cyan-950/22 to-slate-950/95 p-1 relative overflow-hidden" style={{ boxShadow: 'inset 0 0 20px rgba(34,211,238,0.10), 0 0 14px rgba(34,211,238,0.12)' }}>
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute left-0 right-0 top-1 h-[1px] bg-gradient-to-r from-transparent via-cyan-300/55 to-transparent" />
              <div className="absolute left-2 top-2 w-2.5 h-2.5 border-l border-t border-cyan-300/60" />
              <div className="absolute right-2 bottom-2 w-2.5 h-2.5 border-r border-b border-cyan-300/50" />
            </div>
            <div className="mb-1 flex items-center justify-between gap-1">
              <span className="text-[10px] font-mono text-cyan-200 tracking-[0.18em]">INTRADAY DECISION RAIL</span>
              <span className={cn('text-[9px] font-mono px-1.5 py-0.5 rounded border', pressureColor)}>{directionalPressure}</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-1 mb-1">
              <div className="rounded border border-cyan-400/30 bg-slate-950/65 px-1.5 py-1">
                <div className="text-[8px] text-cyan-300/85 font-mono tracking-wider uppercase">Unlock</div>
                <div className="text-[11px] font-mono font-black text-cyan-100">{unlockAligned}/6</div>
                <div className="text-[8px] text-slate-400">Goal {unlockGoal}/6</div>
              </div>
              <div className="rounded border border-cyan-400/30 bg-slate-950/65 px-1.5 py-1">
                <div className="text-[8px] text-cyan-300/85 font-mono tracking-wider uppercase">Vote Mix</div>
                <div className="text-[10px] font-mono text-emerald-300">BUY {buyVotes}</div>
                <div className="text-[10px] font-mono text-red-300">SELL {sellVotes}</div>
                <div className="text-[8px] text-slate-400">NEUT {neutralVotes}</div>
              </div>
              <div className="rounded border border-cyan-400/30 bg-slate-950/65 px-1.5 py-1">
                <div className="text-[8px] text-cyan-300/85 font-mono tracking-wider uppercase">Risk Frame</div>
                <div className="text-[10px] font-mono text-cyan-100">Stop {stopDistancePct == null ? '--' : `${stopDistancePct.toFixed(2)}%`}</div>
                <div className="text-[10px] font-mono text-cyan-100">R:R {riskReward == null ? '--' : `1:${riskReward.toFixed(1)}`}</div>
              </div>
            </div>
            <div className="rounded border border-cyan-400/25 bg-slate-950/70 px-2 py-1 text-[10px] text-cyan-100/90">
              {intradayCue}
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
