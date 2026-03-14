// --- HUD helpers ---
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

// --- Tactical-style Arc Gauge ---
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

function MomentumHudMeter({ value, rsiValue }: { value: number; rsiValue?: number }) {
  const clamped = Math.max(-100, Math.min(100, Number.isFinite(value) ? value : 0));
  const normalized = Math.round(((clamped + 100) / 200) * 100);
  const segments = 20;
  const activeSegments = Math.max(0, Math.min(segments, Math.round((normalized / 100) * segments)));
  const tone = clamped >= 15 ? '#10b981' : clamped <= -15 ? '#ef4444' : '#f59e0b';
  const biasText = clamped >= 15 ? 'BULLISH' : clamped <= -15 ? 'BEARISH' : 'NEUTRAL';

  return (
    <div
      className="mb-2 rounded-xl border px-2 py-1.5"
      style={{
        borderColor: hexToRgba(tone, 0.4),
        background: `linear-gradient(180deg, ${hexToRgba(tone, 0.14)}, rgba(2, 8, 18, 0.72))`,
        boxShadow: `inset 0 0 14px ${hexToRgba(tone, 0.14)}`,
      }}
    >
      <div className="mb-1 flex items-end justify-between">
        <span className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/55">Momentum Meter</span>
        <span className="text-[10px] font-mono font-black" style={{ color: tone }}>
          {clamped > 0 ? '+' : ''}
          {Math.round(clamped)}
        </span>
      </div>
      <div className="flex gap-[2px] h-[8px]">
        {Array.from({ length: segments }).map((_, i) => {
          const active = i < activeSegments;
          const segColor = i < 7 ? '#ef4444' : i < 13 ? '#f59e0b' : '#10b981';
          const isTip = active && i === activeSegments - 1;
          return (
            <div
              key={i}
              className="flex-1 rounded-[2px]"
              style={{
                backgroundColor: active ? hexToRgba(segColor, 0.92) : 'rgba(255,255,255,0.05)',
                boxShadow: isTip ? `0 0 6px ${tone}, 0 0 12px ${hexToRgba(tone, 0.45)}` : active ? `0 0 3px ${hexToRgba(segColor, 0.4)}` : 'none',
              }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex items-center justify-between text-[8px] font-mono">
        <span className="text-white/45">MACD {clamped > 0 ? '+' : ''}{Math.round(clamped)}</span>
        <span className="font-black tracking-widest" style={{ color: tone }}>{biasText}</span>
        <span className="text-white/45">RSI {rsiValue != null ? Math.round(rsiValue) : '--'}</span>
      </div>
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
import { TrendingUp, TrendingDown, Minus, Activity, Zap, ArrowUpRight, ArrowDownRight, Shield, Crosshair, Layers, GitBranch, Flame } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PatternDetails } from "./PatternDetails";
import { OptionPlayDropdown } from "./OptionPlayDropdown";
import { cn } from "@/lib/utils";
import type { DrawablePattern } from "@shared/schema";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

interface ScannerResult {
  lastIndex?: number;
  scanTime?: number;
  compression?: {
    phase?: string;
    archStrength?: number;
    sparkScore?: number;
  };
  symbol: string;
  breakoutSignal?: 'BREAKOUT' | 'BREAKDOWN' | 'SQUEEZE' | 'CONSOLIDATING' | 'EXPANSION' | 'BUILDING' | 'MOMENTUM' | null;
  expansionDirection?: 'bullish' | 'bearish' | null;
  breakoutScore?: number;
  priceChangePercent?: number;
  momentumStrength?: number;
  rsiValue?: number;
  volumeSpike?: number;
  signalQuality?: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNRELIABLE';
  warnings?: string[];
  tvRsi?: number;
  tvAdx?: number;
  tvRecommendAll?: number;
  tvTrendDirection?: 'bullish' | 'bearish' | 'neutral';
  tvTrendStrength?: number;
  price?: number; // current price
  dailyVolume?: number;
  lastPrice?: number;
  volume?: number;
  strike?: number | string;
  expiration?: string;
  premium?: number;
  patterns?: any[];
  pattern?: string;
  optionPlays?: {
    score?: number;
    openInterest?: number;
    oi?: number;
    open_interest?: number;
    direction?: 'CALL' | 'PUT' | 'NEUTRAL';
    pt?: number;
    target?: number;
    takeProfit?: number;
    targetPrice?: number;
    premium?: number;
    entry?: number;
    mark?: number;
    mid?: number;
    stop?: number;
    stopLoss?: number;
    stopPrice?: number;
    rr?: number;
    riskReward?: number;
    risk_reward?: number;
    riskToReward?: number;
  }[];
  timeframeStack?: {
    primary?: string;
    aggregateScore?: number;
    agreement?: number;
    bias?: 'bullish' | 'bearish' | 'mixed' | 'neutral';
    components?: {
      timeframe?: string;
      breakoutSignal?: string | null;
      breakoutScore?: number;
      momentumStrength?: number;
      direction?: 'bullish' | 'bearish' | 'neutral';
      weight?: number;
    }[];
  };
  preBreakoutSetup?: {
    score?: number;
    traits?: string[];
    preVolumeRatio?: number;
    preRsi?: number;
    preMomentum3?: number;
    preRangeCompression?: number;
    preCloseLocation?: number;
    preNearSessionHigh?: boolean;
    preAboveVwap?: boolean;
    etaMinutes?: number;
  };
}

interface PriceCardFusionSnapshot {
  unifiedSignal?: {
    unifiedDirection?: 'CALL' | 'PUT' | 'WAIT';
    unifiedConfidence?: number;
    confidence?: number;
    setupGrade?: 'GOLD' | 'HOT' | 'READY' | 'BUILDING' | 'WAIT' | string;
    state?: 'ACTIVE' | 'INACTIVE' | 'STALE' | string;
    gatingScore?: number;
    optionBQualified?: boolean;
    notes?: string[];
    recommendedAction?: string;
    priceActionSafety?: {
      contradiction?: boolean;
      contradictionSeverity?: 'severe' | 'moderate' | 'mild' | string;
      safetyAction?: 'force_wait' | 'reduce_confidence' | 'none' | string;
      confidenceMultiplier?: number;
      momentumStrength?: number;
      momentumDirection?: string;
    };
  };
  gatingState?: {
    gatingScore?: number;
    metaAllowed?: boolean;
    reasons?: string[];
  };
}

type AlertMode = 'TREND' | 'BALANCED' | 'CHOPPY';

interface BreakoutThresholdConfig {
  generatedAt?: string;
  source?: 'default' | 'auto-fit';
  modes?: {
    TREND?: { setupScoreMin?: number; setupTraitsMin?: number; requireSweetSpotStack?: boolean };
    BALANCED?: { setupScoreMin?: number; setupTraitsMin?: number; requireSweetSpotStack?: boolean };
    CHOPPY?: { setupScoreMin?: number; setupTraitsMin?: number; requireSweetSpotStack?: boolean };
  };
}

interface BreakoutLogEntry {
  symbol?: string;
  direction?: 'bullish' | 'bearish' | 'neutral' | string;
  breakoutScore?: number;
  priceAtCapture?: number;
  stopLoss?: number;
  targets?: number[];
  outcome?: string;
  timestamp?: number;
}

interface BreakoutLogResponse {
  success?: boolean;
  entries?: BreakoutLogEntry[];
}

interface SymbolLogStats {
  total: number;
  completed: number;
  wins: number;
  losses: number;
  latest?: BreakoutLogEntry;
  latestBullish?: BreakoutLogEntry;
  latestBearish?: BreakoutLogEntry;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number.parseFloat(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getOptionPlayOpenInterest(play: Record<string, unknown> | undefined): number {
  const value =
    toFiniteNumber(play?.openInterest) ??
    toFiniteNumber(play?.oi) ??
    toFiniteNumber(play?.open_interest) ??
    toFiniteNumber(play?.openInt);
  return value != null && value > 0 ? value : 0;
}

function getOptionPlayRiskRewardPercent(play: Record<string, unknown> | undefined): number | null {
  const direct =
    toFiniteNumber(play?.rr) ??
    toFiniteNumber(play?.riskReward) ??
    toFiniteNumber(play?.risk_reward) ??
    toFiniteNumber(play?.riskToReward);
  if (direct != null && direct > 0) {
    return direct <= 20 ? direct * 100 : direct;
  }

  const target =
    toFiniteNumber(play?.pt) ??
    toFiniteNumber(play?.target) ??
    toFiniteNumber(play?.takeProfit) ??
    toFiniteNumber(play?.targetPrice);
  const entry =
    toFiniteNumber(play?.premium) ??
    toFiniteNumber(play?.entry) ??
    toFiniteNumber(play?.mark) ??
    toFiniteNumber(play?.mid);
  const stop =
    toFiniteNumber(play?.stop) ??
    toFiniteNumber(play?.stopLoss) ??
    toFiniteNumber(play?.stopPrice);

  if (target == null || entry == null || stop == null) return null;

  const reward = target - entry;
  const risk = entry - stop;
  if (reward <= 0 || risk <= 0) return null;

  const rrPct = (reward / risk) * 100;
  return Number.isFinite(rrPct) ? rrPct : null;
}

function getAlertDirection(alert: ScannerResult): 'bullish' | 'bearish' {
  if (alert.breakoutSignal === 'BREAKDOWN') return 'bearish';
  if (alert.breakoutSignal === 'EXPANSION' && alert.expansionDirection === 'bearish') return 'bearish';
  if (alert.breakoutSignal === 'MOMENTUM' && (alert.expansionDirection === 'bearish' || (alert.momentumStrength ?? 0) < 0)) return 'bearish';
  if (alert.expansionDirection === 'bearish') return 'bearish';
  return 'bullish';
}

function getStructuralRiskRewardPercent(entry: BreakoutLogEntry | undefined, direction: 'bullish' | 'bearish'): number | null {
  if (!entry) return null;
  const entryPrice = toFiniteNumber(entry.priceAtCapture);
  const stopLoss = toFiniteNumber(entry.stopLoss);
  const targetRaw = Array.isArray(entry.targets) ? entry.targets.find((target) => toFiniteNumber(target) != null) : null;
  const targetPrice = toFiniteNumber(targetRaw);

  if (entryPrice == null || stopLoss == null || targetPrice == null) return null;

  const reward = direction === 'bullish' ? targetPrice - entryPrice : entryPrice - targetPrice;
  const risk = direction === 'bullish' ? entryPrice - stopLoss : stopLoss - entryPrice;
  if (reward <= 0 || risk <= 0) return null;

  const rrPct = (reward / risk) * 100;
  return Number.isFinite(rrPct) ? rrPct : null;
}

interface MetricCardProps {
  label: string;
  value: string | number;
  change?: number;
  prefix?: string;
  suffix?: string;
  trend?: "up" | "down" | "neutral";
}

export function MetricCard({
  label,
  value,
  change,
  prefix = "",
  suffix = "",
  trend,
}: MetricCardProps) {
  const determinedTrend = trend || (change ? (change > 0 ? "up" : change < 0 ? "down" : "neutral") : "neutral");

  const TrendIcon =
    determinedTrend === "up"
      ? TrendingUp
      : determinedTrend === "down"
      ? TrendingDown
      : Minus;

  const trendColor =
    determinedTrend === "up"
      ? "text-emerald-400"
      : determinedTrend === "down"
      ? "text-red-400"
      : "text-muted-foreground";

  return (
    <Card className="relative overflow-hidden rounded-xl border border-cyan-500/30 bg-gradient-to-b from-[#040816]/95 via-[#060d1e]/90 to-[#070f24]/85 shadow-[0_0_24px_rgba(34,211,238,0.14)]" data-testid={`card-metric-${label.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(34,211,238,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(129,140,248,0.14)_1px,transparent_1px)] [background-size:22px_22px]" />
      <div className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l border-t border-cyan-300/45" />
      <div className="pointer-events-none absolute right-2 bottom-2 h-3 w-3 border-r border-b border-violet-300/35" />
      <div className={`h-0.5 ${
        determinedTrend === "up" 
          ? "bg-gradient-to-r from-emerald-600 to-emerald-400" 
          : determinedTrend === "down"
          ? "bg-gradient-to-r from-red-600 to-red-400"
          : "bg-gradient-to-r from-muted to-muted-foreground/30"
      }`} />
      <CardContent className="relative p-4">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-cyan-200/75 mb-1">
          {label}
        </p>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-mono font-bold text-cyan-50 drop-shadow-[0_0_10px_rgba(56,189,248,0.18)]">
            {prefix}
            {typeof value === "number" ? value.toLocaleString() : value}
            {suffix}
          </span>
          {change !== undefined && (
            <span className={cn("flex items-center text-sm font-medium", trendColor)}>
              <TrendIcon className="w-3 h-3 mr-0.5" />
              {Math.abs(change).toFixed(2)}%
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/*
export function PriceCard({
  symbol,
  price,
  change,
  changePercent,
  sectorData,
}: {
  symbol: string;
  price: number;
  change?: number;
  changePercent?: number;
  sectorData?: Array<{
    code: string;
    label: string;
    changePct: number | null;
    live: boolean;
  }>;
}) {
  const isPositive = (change ?? 0) >= 0;
  const gradientClass = isPositive
    ? "from-cyan-500/12 via-blue-500/10 to-teal-500/12"
    : "from-cyan-500/10 via-blue-500/10 to-amber-500/12";
  const borderClass = isPositive ? "border-cyan-500/35" : "border-orange-500/35";
  const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
  const dayMovePct = Number.isFinite(changePercent) ? (changePercent ?? 0) : 0;
  const normalizedMove = clamp01(Math.abs(dayMovePct) / 2.4);

  const sectorModels = [
    { code: 'XLC', label: 'Communication Services' },
    { code: 'XLY', label: 'Consumer Discretionary' },
    { code: 'XLP', label: 'Consumer Staples' },
    { code: 'XLE', label: 'Energy' },
    { code: 'XLF', label: 'Financials' },
    { code: 'XLV', label: 'Health Care' },
    { code: 'XLI', label: 'Industrials' },
    { code: 'XLK', label: 'Information Technology' },
    { code: 'XLB', label: 'Materials' },
    { code: 'XLRE', label: 'Real Estate' },
    { code: 'XLU', label: 'Utilities' },
  ] as const;

  const liveSectorMap = new Map(
    (sectorData ?? []).map((sector) => [sector.code.toUpperCase(), sector]),
  );

  const sectorStates = sectorModels.map((sector, index) => {
    const liveSector = liveSectorMap.get(sector.code);
    if (liveSector && typeof liveSector.changePct === 'number') {
      const value = clamp01((liveSector.changePct + 2) / 4);
      const state = liveSector.changePct >= 0.2 ? 'bull' : liveSector.changePct <= -0.2 ? 'bear' : 'flat';
      return { ...sector, value, state, liveChangePct: liveSector.changePct, isLive: true };
    }

    return { ...sector, value: 0.5, state: 'flat', liveChangePct: null, isLive: false };
  });

  const liveSectorStates = sectorStates.filter(
    (s): s is (typeof sectorStates)[number] & { liveChangePct: number; isLive: true } =>
      s.isLive && typeof s.liveChangePct === 'number',
  );
  const liveSectorCount = liveSectorStates.length;
  const sectorComposite = liveSectorCount > 0
    ? clamp01(liveSectorStates.reduce((sum, s) => sum + s.value, 0) / liveSectorCount)
    : 0.5;
  const bullishSectorCount = liveSectorStates.filter((s) => s.liveChangePct >= 0).length;
  const bearishSectorCount = liveSectorStates.filter((s) => s.liveChangePct < 0).length;
  const priceStrength = clamp01(0.5 + dayMovePct / 4);
  const scannerMomentum = Number.isFinite(scannerSignal?.momentumStrength)
    ? (scannerSignal?.momentumStrength ?? 0)
    : 0;
  const scannerBreakoutScore = Number.isFinite(scannerSignal?.breakoutScore)
    ? (scannerSignal?.breakoutScore ?? 0)
    : 0;
  const scannerVolumeSpike = Number.isFinite(scannerSignal?.volumeSpike)
    ? (scannerSignal?.volumeSpike ?? 1)
    : 1;
  const scannerAgreement = Number.isFinite(scannerSignal?.timeframeStack?.agreement)
    ? (scannerSignal?.timeframeStack?.agreement ?? 50)
    : 50;
  const fastTfComponent =
    scannerSignal?.timeframeStack?.components?.find((component) =>
      String(component?.timeframe ?? '').toLowerCase() === '5m'
    ) ?? scannerSignal?.timeframeStack?.components?.[0];
  const fastMomentum = Number.isFinite(fastTfComponent?.momentumStrength)
    ? (fastTfComponent?.momentumStrength ?? 0)
    : 0;
  const fastDirectionVote =
    fastTfComponent?.direction === 'bullish'
      ? 1
      : fastTfComponent?.direction === 'bearish'
      ? -1
      : 0;

  const signalDirectionVote =
    scannerSignal?.breakoutSignal === 'BREAKOUT'
      ? 1
      : scannerSignal?.breakoutSignal === 'BREAKDOWN'
      ? -1
      : scannerSignal?.breakoutSignal === 'MOMENTUM'
      ? scannerMomentum >= 0
        ? 1
        : -1
      : scannerSignal?.breakoutSignal === 'EXPANSION'
      ? scannerSignal?.expansionDirection === 'bullish'
        ? 1
        : scannerSignal?.expansionDirection === 'bearish'
        ? -1
        : 0
      : 0;

  const momentumImpulse = clamp01(0.5 + (scannerMomentum / 120));
  const fastImpulse = clamp01(0.5 + (fastMomentum / 110));
  const breakoutImpulse = clamp01(scannerBreakoutScore / 100);
  const volumeImpulse = clamp01((scannerVolumeSpike - 0.9) / 1.3);
  const mtfImpulse = clamp01(scannerAgreement / 100);

  const directionalImpulse = signalDirectionVote * 24 + fastDirectionVote * 18;
  let priceActionBalanceRaw =
    (fastImpulse - 0.5) * 170 +
    (momentumImpulse - 0.5) * 85 +
    (volumeImpulse - 0.5) * 42 +
    (breakoutImpulse - 0.45) * 30 +
    (mtfImpulse - 0.5) * 20 +
    directionalImpulse;

  const bullishPushDetected = signalDirectionVote > 0 || fastDirectionVote > 0 || fastMomentum > 8;
  const bearishPushDetected = signalDirectionVote < 0 || fastDirectionVote < 0 || fastMomentum < -8;

  if (bullishPushDetected && priceActionBalanceRaw < 0) {
    priceActionBalanceRaw = priceActionBalanceRaw * 0.35 + 18;
  }
  if (bearishPushDetected && priceActionBalanceRaw > 0) {
    priceActionBalanceRaw = priceActionBalanceRaw * 0.35 - 18;
  }

  const priceActionBalance = Math.max(-100, Math.min(100, Math.round(priceActionBalanceRaw)));
  const buyPressure = Math.max(0, priceActionBalance);
  const sellPressure = Math.max(0, -priceActionBalance);
  const priceActionBias = priceActionBalance > 8 ? 'buy' : priceActionBalance < -8 ? 'sell' : 'neutral';
  const priceActionMagnitude = Math.min(100, Math.abs(priceActionBalance));
  const priceActionNeedleDeg = priceActionBalance * 0.9;
  const slopeGeometryRaw =
    fastMomentum * 0.42 +
    scannerMomentum * 0.28 +
    dayMovePct * 18 +
    signalDirectionVote * 12 +
    fastDirectionVote * 9;
  const slopeGeometryScore = Math.max(-100, Math.min(100, Math.round(slopeGeometryRaw)));
  const slopeGeometryMagnitude = Math.min(100, Math.abs(slopeGeometryScore));
  const slopeAngle = Math.max(
    -45,
    Math.min(
      45,
      Math.round(Math.atan((slopeGeometryScore / 100) * 1.5) * (180 / Math.PI)),
    ),
  );
  const slopeNeedleDeg = slopeAngle * 2;
  const slopeArcPosition = (slopeAngle + 45) / 90;
  const slopeDotX = 22 + (130 - 22) * slopeArcPosition;
  const slopeDotY = 52 - Math.sqrt(Math.max(0, 54 * 54 - Math.pow(slopeDotX - 76, 2)));
  const slopeBias = slopeAngle >= 7 ? 'up' : slopeAngle <= -7 ? 'down' : 'flat';
  const slopeColor = slopeBias === 'up' ? '#4ade80' : slopeBias === 'down' ? '#f59e0b' : '#22d3ee';

  const marketStrength = clamp01(
    (priceStrength * 0.2) +
    (sectorComposite * 0.25) +
    (momentumImpulse * 0.3) +
    (breakoutImpulse * 0.15) +
    (mtfImpulse * 0.1),
  );
  const sectorMeanChangePct = liveSectorCount > 0
    ? liveSectorStates.reduce((sum, s) => sum + (s.liveChangePct ?? 0), 0) / liveSectorCount
    : 0;

  const sectorDispersion = liveSectorCount > 1
    ? clamp01(
        Math.sqrt(
          liveSectorStates.reduce(
            (sum, s) => sum + Math.pow((s.liveChangePct ?? 0) - sectorMeanChangePct, 2),
            0,
          ) / liveSectorCount,
        ) / 2.5,
      )
    : 0;
  const breadthSync = liveSectorCount > 0 ? clamp01(bullishSectorCount / liveSectorCount) : 0.5;
  const sectorPulseBias = sectorComposite >= 0.52 ? 'bullish' : sectorComposite <= 0.48 ? 'bearish' : 'neutral';
  const sectorPulseColor = sectorPulseBias === 'bullish' ? '#4ade80' : sectorPulseBias === 'bearish' ? '#f59e0b' : '#38bdf8';
  const sectorPulseTone = sectorPulseBias === 'bullish' ? 'text-emerald-200' : sectorPulseBias === 'bearish' ? 'text-amber-200' : 'text-cyan-200';
  const sectorPulseArc = Math.PI * 46;
  const sectorPulseNeedle = sectorComposite * 180 - 180;
  const sectorPulsePct = Math.round(sectorComposite * 100);

  const flowEngine = clamp01(
    marketStrength * 0.45 +
    mtfImpulse * 0.25 +
    volumeImpulse * 0.2 +
    momentumImpulse * 0.1,
  );
  const riskPulse = clamp01(
    1 - (
      normalizedMove * 0.3 +
      sectorDispersion * 0.35 +
      Math.max(0, 0.5 - momentumImpulse) * 0.35
    ),
  );
  const breadthEngine = clamp01(breadthSync * 0.75 + mtfImpulse * 0.25);

  const activeEngines = [
    { label: 'Trend Core', value: marketStrength },
    { label: 'Flow Engine', value: flowEngine },
    { label: 'Risk Pulse', value: riskPulse },
    { label: 'Breadth Sync', value: breadthEngine },
  ];
  const leftEngineStack = activeEngines.slice(0, 2);
  const rightEngineStack = activeEngines.slice(2, 4);

  const neonMainColor = marketStrength >= 0.5 ? '#4ade80' : '#f59e0b';
  const neonMiniColor = (value: number) => (value >= 0.5 ? '#4ade80' : '#f59e0b');
  const startX = 48;
  const endX = 112;
  const cy = 40;
  const r = 32;
  const arc = Math.PI * r;
  const dotX = startX + (endX - startX) * marketStrength;
  const dotY = cy - Math.sqrt(Math.max(0, r * r - Math.pow(dotX - 80, 2)));

  return (
    <Card className={cn("relative overflow-hidden rounded-xl", borderClass, "shadow-[0_0_46px_rgba(34,211,238,0.2)] backdrop-blur-sm bg-gradient-to-b from-[#040816]/95 via-[#060d1e]/90 to-[#070f24]/85")} data-testid="card-price">
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(34,211,238,0.2)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.16)_1px,transparent_1px)] [background-size:22px_22px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,rgba(34,211,238,0.2),transparent_48%),radial-gradient(circle_at_85%_100%,rgba(56,189,248,0.16),transparent_46%)]" />
      <div className={`h-1 ${
        isPositive 
          ? "bg-gradient-to-r from-cyan-400 via-emerald-400 to-teal-400" 
          : "bg-gradient-to-r from-cyan-400 via-amber-400 to-orange-400"
      }`} />
      <CardContent className={`p-0`}>
        <div className={`relative p-2.5 bg-gradient-to-br ${gradientClass}`}>
          <div className="pointer-events-none absolute inset-0 opacity-35 bg-[radial-gradient(circle_at_20%_0%,rgba(34,211,238,0.22),transparent_56%)]" />
          <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(34,211,238,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(129,140,248,0.15)_1px,transparent_1px)] [background-size:24px_24px]" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cyan-400/0 via-cyan-300/85 to-sky-400/0" />
          <div className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l border-t border-cyan-300/55" />
          <div className="pointer-events-none absolute right-2 bottom-2 h-3 w-3 border-r border-b border-sky-300/45" />
          <div className="grid grid-cols-1 xl:grid-cols-[auto_152px_auto] items-start gap-2">
            <div className="space-y-1 xl:justify-self-start rounded-lg border border-cyan-400/30 bg-[#0a1329]/70 px-2 py-1 shadow-[0_0_18px_rgba(34,211,238,0.14)]">
              <div className="flex items-center gap-3">
                <div className={`p-1 rounded-lg border ${isPositive ? 'bg-emerald-500/20 border-emerald-400/35' : 'bg-amber-500/20 border-amber-400/35'}`}>
                  <Activity className={`w-3.5 h-3.5 ${isPositive ? 'text-emerald-400' : 'text-amber-400'}`} />
                </div>
                <div>
                  <p className="text-xl font-bold font-mono tracking-tight text-cyan-50 drop-shadow-[0_0_10px_rgba(34,211,238,0.18)]" data-testid="text-symbol">
                    {symbol}
                  </p>
                  <p className="text-[9px] text-cyan-200/70 uppercase tracking-widest">
                    Real-time Quote
                  </p>
                </div>
              </div>
            </div>

            <div className={cn(
              "relative overflow-hidden rounded-lg border px-1.5 py-1",
              marketStrength >= 0.5
                ? "border-emerald-400/55 bg-emerald-950/22 shadow-[inset_0_0_22px_rgba(74,222,128,0.18)]"
                : "border-amber-400/55 bg-amber-950/22 shadow-[inset_0_0_22px_rgba(245,158,11,0.18)]"
            )}>
              <div className="pointer-events-none absolute inset-x-2 top-1 h-px bg-gradient-to-r from-transparent via-cyan-200/50 to-transparent" />
              <svg width="126" height="52" viewBox="0 0 160 74" className="mx-auto -mt-0.5">
                <path d="M 48 40 A 32 32 0 0 1 112 40" stroke="currentColor" strokeWidth="5" className="text-muted/35" fill="none" strokeLinecap="round" />
                <path
                  d="M 48 40 A 32 32 0 0 1 112 40"
                  stroke={neonMainColor}
                  strokeWidth="5"
                  className={cn(
                    marketStrength >= 0.5
                      ? "drop-shadow-[0_0_10px_rgba(74,222,128,0.85)]"
                      : "drop-shadow-[0_0_10px_rgba(245,158,11,0.85)]"
                  )}
                  fill="none"
                  strokeLinecap="round"
                  strokeDasharray={arc}
                  strokeDashoffset={arc * (1 - marketStrength)}
                />
                <circle cx={dotX} cy={dotY} r="2.2" fill={neonMainColor} className={cn(
                  marketStrength >= 0.5
                    ? "drop-shadow-[0_0_10px_rgba(74,222,128,0.9)]"
                    : "drop-shadow-[0_0_10px_rgba(245,158,11,0.9)]"
                )} />
                <text
                  x="80"
                  y="24"
                  textAnchor="middle"
                  fill={neonMainColor}
                  className={cn(
                    "text-[15px] font-black font-mono",
                    marketStrength >= 0.5
                      ? "drop-shadow-[0_0_12px_rgba(74,222,128,0.95)]"
                      : "drop-shadow-[0_0_12px_rgba(245,158,11,0.95)]"
                  )}
                >
                  {Math.round(marketStrength * 100)}
                </text>
              </svg>
              <div className={cn("mt-0.5 text-center text-[8px] uppercase tracking-wider", marketStrength >= 0.5 ? "text-emerald-200/90" : "text-amber-200/90")}>Market Strength</div>
            </div>
            
            <div className="text-right space-y-1 xl:justify-self-end rounded-lg border border-cyan-400/30 bg-[#0a1329]/70 px-2 py-1 shadow-[0_0_18px_rgba(59,130,246,0.14)]">
              <div className="flex items-baseline justify-end gap-1">
                <span className="text-muted-foreground text-sm">$</span>
                <p className="text-2xl font-mono font-black tracking-tight text-cyan-50 drop-shadow-[0_0_12px_rgba(56,189,248,0.2)]" data-testid="text-price">
                  {price.toFixed(2)}
                </p>
              </div>
              {change !== undefined && changePercent !== undefined && (
                <div
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2 py-1 rounded-lg backdrop-blur-sm",
                    isPositive 
                      ? "bg-emerald-500/18 border border-emerald-400/40 shadow-[0_0_14px_rgba(16,185,129,0.18)]" 
                      : "bg-amber-500/18 border border-amber-400/40 shadow-[0_0_14px_rgba(245,158,11,0.18)]"
                  )}
                  data-testid="text-price-change"
                >
                  {isPositive ? (
                    <TrendingUp className={`w-3.5 h-3.5 text-emerald-400`} />
                  ) : (
                    <TrendingDown className={`w-3.5 h-3.5 text-amber-400`} />
                  )}
                  <span className={`text-[12px] font-mono font-bold ${isPositive ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {isPositive ? "+" : ""}{change.toFixed(2)}
                  </span>
                  <span className={`text-[12px] font-mono font-medium ${isPositive ? 'text-emerald-400/80' : 'text-amber-400/80'}`}>
                    ({isPositive ? "+" : ""}{changePercent.toFixed(2)}%)
                  </span>
                </div>
              )}
            </div>
          </div>

          <div className="relative mt-2.5 origin-top scale-y-[0.8] rounded-xl border border-cyan-400/45 bg-[#081124]/85 p-2.5 shadow-[inset_0_0_38px_rgba(34,211,238,0.12),0_0_24px_rgba(129,140,248,0.12)]">
            <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-cyan-500/0 via-cyan-300/80 to-indigo-400/0" />
            <div className="pointer-events-none absolute inset-0 opacity-28 bg-[radial-gradient(circle_at_12%_0%,rgba(6,182,212,0.24),transparent_48%),radial-gradient(circle_at_88%_100%,rgba(129,140,248,0.18),transparent_45%)]" />
            <div className="mb-1.5 flex items-center justify-between text-[9px] uppercase tracking-wider">
              <span className="inline-flex items-center gap-1.5 font-semibold text-cyan-300">
                <Layers className="h-3 w-3" />
                SPY Engine Monitor
              </span>
              <span className={cn(
                "rounded-md px-1.5 py-0.5 font-mono font-bold",
                marketStrength >= 0.5
                  ? "border border-emerald-400/45 bg-emerald-500/18 text-emerald-200 drop-shadow-[0_0_10px_rgba(74,222,128,0.55)]"
                  : "border border-amber-400/45 bg-amber-500/18 text-amber-200 drop-shadow-[0_0_10px_rgba(245,158,11,0.55)]"
              )}>
                {Math.round(marketStrength * 100)}% Strength
              </span>
            </div>

            <div className="space-y-1.5">
              <div className={cn(
                "rounded-md border p-1.5",
                sectorPulseBias === 'bullish'
                  ? "border-emerald-300/45 bg-[linear-gradient(120deg,rgba(6,28,24,0.78),rgba(3,16,18,0.5))] shadow-[0_0_22px_rgba(74,222,128,0.22)]"
                  : sectorPulseBias === 'bearish'
                  ? "border-amber-300/45 bg-[linear-gradient(120deg,rgba(34,20,8,0.78),rgba(18,12,6,0.56))] shadow-[0_0_22px_rgba(245,158,11,0.2)]"
                  : "border-cyan-300/45 bg-[linear-gradient(120deg,rgba(8,20,34,0.78),rgba(6,12,20,0.6))] shadow-[0_0_22px_rgba(56,189,248,0.22)]"
              )}>
                <div className={cn(
                  "mb-1.5 flex items-center justify-between text-[9px] uppercase tracking-wider",
                  sectorPulseBias === 'bullish' ? "text-emerald-200/85" : sectorPulseBias === 'bearish' ? "text-amber-200/85" : "text-cyan-200/85"
                )}>
                  <span>SPY Sectors · Fused Pulse</span>
                  <span className={cn(
                    "rounded border px-1.5 py-0.5 text-[8px] font-mono font-bold tracking-[0.08em]",
                    sectorPulseBias === 'bullish'
                      ? "border-emerald-400/40 bg-emerald-500/18 text-emerald-200"
                      : sectorPulseBias === 'bearish'
                      ? "border-amber-400/40 bg-amber-500/18 text-amber-200"
                      : "border-cyan-400/40 bg-cyan-500/18 text-cyan-200"
                  )}>
                    {sectorPulseBias.toUpperCase()}
                  </span>
                </div>
                <div className={cn(
                  "relative overflow-hidden rounded-lg border p-2.5",
                  sectorPulseBias === 'bullish'
                    ? "border-emerald-400/45 bg-emerald-500/10 shadow-[inset_0_0_30px_rgba(74,222,128,0.14),0_0_22px_rgba(74,222,128,0.18)]"
                    : sectorPulseBias === 'bearish'
                    ? "border-amber-400/45 bg-amber-500/10 shadow-[inset_0_0_30px_rgba(245,158,11,0.14),0_0_22px_rgba(245,158,11,0.18)]"
                    : "border-cyan-400/45 bg-cyan-500/8 shadow-[inset_0_0_30px_rgba(56,189,248,0.12),0_0_22px_rgba(56,189,248,0.18)]"
                )}>
                  <div className={cn(
                    "pointer-events-none absolute inset-0 opacity-35 [background-size:18px_18px]",
                    sectorPulseBias === 'bullish'
                      ? "[background-image:linear-gradient(rgba(74,222,128,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(16,185,129,0.10)_1px,transparent_1px)]"
                      : sectorPulseBias === 'bearish'
                      ? "[background-image:linear-gradient(rgba(245,158,11,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(245,158,11,0.10)_1px,transparent_1px)]"
                      : "[background-image:linear-gradient(rgba(56,189,248,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.10)_1px,transparent_1px)]"
                  )} />
                  <div className={cn(
                    "pointer-events-none absolute inset-0 opacity-35",
                    sectorPulseBias === 'bullish'
                      ? "bg-[radial-gradient(circle_at_12%_18%,rgba(74,222,128,0.28),transparent_45%),radial-gradient(circle_at_88%_82%,rgba(16,185,129,0.22),transparent_45%)]"
                      : sectorPulseBias === 'bearish'
                      ? "bg-[radial-gradient(circle_at_12%_18%,rgba(245,158,11,0.28),transparent_45%),radial-gradient(circle_at_88%_82%,rgba(251,191,36,0.22),transparent_45%)]"
                      : "bg-[radial-gradient(circle_at_12%_18%,rgba(56,189,248,0.26),transparent_45%),radial-gradient(circle_at_88%_82%,rgba(34,211,238,0.18),transparent_45%)]"
                  )} />
                  <div className={cn(
                    "pointer-events-none absolute -inset-[24%] opacity-30 animate-aurora-drift",
                    sectorPulseBias === 'bullish'
                      ? "bg-[radial-gradient(circle,rgba(74,222,128,0.28)_0%,transparent_58%)]"
                      : sectorPulseBias === 'bearish'
                      ? "bg-[radial-gradient(circle,rgba(245,158,11,0.28)_0%,transparent_58%)]"
                      : "bg-[radial-gradient(circle,rgba(56,189,248,0.24)_0%,transparent_58%)]"
                  )} />
                  <div className={cn(
                    "pointer-events-none absolute left-2 top-2 h-2.5 w-2.5 border-l border-t",
                    sectorPulseBias === 'bullish' ? "border-emerald-200/70" : sectorPulseBias === 'bearish' ? "border-amber-200/70" : "border-cyan-200/70"
                  )} />
                  <div className={cn(
                    "pointer-events-none absolute right-2 top-2 h-2.5 w-2.5 border-r border-t",
                    sectorPulseBias === 'bullish' ? "border-emerald-200/70" : sectorPulseBias === 'bearish' ? "border-amber-200/70" : "border-cyan-200/70"
                  )} />
                  <div className={cn(
                    "pointer-events-none absolute inset-y-0 left-0 w-[14%] bg-gradient-to-r to-transparent animate-scan-sweep",
                    sectorPulseBias === 'bullish'
                      ? "from-emerald-300/0 via-emerald-300/18"
                      : sectorPulseBias === 'bearish'
                      ? "from-amber-300/0 via-amber-300/18"
                      : "from-cyan-300/0 via-cyan-300/18"
                  )} />

                  <div className="relative z-10 space-y-2">
                    <div className="grid grid-cols-1 xl:grid-cols-[150px_auto_150px] gap-2 items-center">
                      <div className="space-y-1">
                        {leftEngineStack.map((engine) => (
                          <div
                            key={engine.label}
                            className={cn(
                              "relative rounded-md border px-1.5 py-1.5 overflow-hidden",
                              engine.value >= 0.5
                                ? "border-emerald-300/60 bg-[linear-gradient(135deg,rgba(16,185,129,0.2),rgba(4,16,18,0.35))] shadow-[inset_0_0_16px_rgba(74,222,128,0.16),0_0_18px_rgba(74,222,128,0.32)]"
                                : "border-red-300/60 bg-[linear-gradient(135deg,rgba(239,68,68,0.2),rgba(20,8,12,0.35))] shadow-[inset_0_0_16px_rgba(248,113,113,0.16),0_0_18px_rgba(248,113,113,0.32)]"
                            )}
                          >
                            <div className={cn(
                              "pointer-events-none absolute inset-0 opacity-30",
                              engine.value >= 0.5
                                ? "bg-[radial-gradient(circle_at_12%_18%,rgba(74,222,128,0.35),transparent_42%)]"
                                : "bg-[radial-gradient(circle_at_12%_18%,rgba(248,113,113,0.35),transparent_42%)]"
                            )} />
                            <svg width="122" height="46" viewBox="0 0 136 60" className="mx-auto">
                              <path d="M 34 42 A 34 34 0 0 1 102 42" stroke="currentColor" strokeWidth="8" className="text-slate-950/70" fill="none" strokeLinecap="round" />
                              <path d="M 30 38 A 30 30 0 0 1 90 38" stroke="currentColor" strokeWidth="3.5" className="text-slate-400/15" fill="none" strokeLinecap="round" />
                              <path
                                d="M 30 38 A 30 30 0 0 1 90 38"
                                stroke={neonMiniColor(engine.value)}
                                strokeWidth="3.5"
                                className={cn(
                                  engine.value >= 0.5
                                    ? "drop-shadow-[0_0_8px_rgba(74,222,128,0.9)]"
                                    : "drop-shadow-[0_0_8px_rgba(248,113,113,0.9)]"
                                )}
                                fill="none"
                                strokeLinecap="round"
                                strokeDasharray={Math.PI * 30}
                                strokeDashoffset={(Math.PI * 30) * (1 - engine.value)}
                              />
                              <text
                                x="60"
                                y="22"
                                textAnchor="middle"
                                fill={neonMiniColor(engine.value)}
                                className={cn(
                                  "text-[13px] font-mono font-black",
                                  engine.value >= 0.5
                                    ? "drop-shadow-[0_0_8px_rgba(74,222,128,0.95)]"
                                    : "drop-shadow-[0_0_8px_rgba(248,113,113,0.95)]"
                                )}
                              >
                                {Math.round(engine.value * 100)}
                              </text>
                            </svg>
                            <div className={cn(
                              "-mt-0.5 text-[8px] uppercase tracking-wide text-center truncate",
                              engine.value >= 0.5 ? "text-emerald-100" : "text-red-100"
                            )}>{engine.label}</div>
                          </div>
                              const sectorStates = sectorModels.map((sector) => {
                      </div>
                                const liveChangePct = typeof liveSector?.changePct === 'number' ? liveSector.changePct : null;
                                const value = liveChangePct === null ? null : clamp01((liveChangePct + 2) / 4);
                                const state =
                                  liveChangePct === null
                                    ? 'na'
                                    : liveChangePct >= 0.2
                                    ? 'bull'
                                    : liveChangePct <= -0.2
                                    ? 'bear'
                                    : 'flat';
                                return { ...sector, value, state, liveChangePct, isLive: liveChangePct !== null };
                              : sectorPulseBias === 'bearish'
                              ? "border-amber-300/55 bg-[linear-gradient(165deg,rgba(34,20,8,0.96),rgba(18,12,6,0.84))] shadow-[inset_0_10px_18px_rgba(245,158,11,0.08),inset_0_-12px_20px_rgba(0,0,0,0.5),0_0_30px_rgba(245,158,11,0.34)]"
                              : "border-cyan-300/45 bg-[linear-gradient(165deg,rgba(12,24,38,0.97),rgba(6,12,16,0.86))] shadow-[inset_0_10px_18px_rgba(56,189,248,0.08),inset_0_-12px_20px_rgba(0,0,0,0.5),0_0_26px_rgba(56,189,248,0.24)]"
                                (s): s is (typeof sectorStates)[number] & { liveChangePct: number; value: number; isLive: true } =>
                                  s.isLive && typeof s.liveChangePct === 'number' && typeof s.value === 'number',
                              "pointer-events-none absolute inset-x-3 top-2 h-[2px] rounded-full",
                              sectorPulseBias === 'bullish' ? "bg-emerald-300/35" : sectorPulseBias === 'bearish' ? "bg-amber-300/35" : "bg-cyan-300/30"
                              const sectorCompositeLive = liveSectorCount > 0
                            <div className={cn(
                                : null;
                              sectorPulseBias === 'bullish' ? "rounded-full bg-emerald-300/28" : sectorPulseBias === 'bearish' ? "rounded-full bg-amber-300/28" : "rounded-full bg-cyan-300/24"
                            )} />
                            <div className={cn("pointer-events-none absolute left-1.5 top-1.5 h-2.5 w-2.5 border-l border-t", sectorPulseBias === 'bullish' ? "border-emerald-300/80" : sectorPulseBias === 'bearish' ? "border-amber-300/80" : "border-cyan-300/75")} />
                              const sectorMeanChangePct = liveSectorCount > 0
                                ? liveSectorStates.reduce((sum, s) => sum + s.liveChangePct, 0) / liveSectorCount
                                : 0;

                              const sectorDispersion = liveSectorCount > 1
                                ? clamp01(
                                    Math.sqrt(
                                      liveSectorStates.reduce(
                                        (sum, s) => sum + Math.pow(s.liveChangePct - sectorMeanChangePct, 2),
                                        0,
                                      ) / liveSectorCount,
                                    ) / 2.5,
                                  )
                                : null;
                              const breadthSync = liveSectorCount > 0 ? clamp01(bullishSectorCount / liveSectorCount) : null;
                              const liveMomentum = clamp01(0.5 + dayMovePct / 3.2);
                              const sectorComposite = sectorCompositeLive ?? 0;

                              const marketStrengthInputs = [priceStrength, liveMomentum, sectorCompositeLive, breadthSync].filter(
                                (value): value is number => typeof value === 'number',
                              );
                              const marketStrength = marketStrengthInputs.length > 0
                                ? clamp01(marketStrengthInputs.reduce((sum, value) => sum + value, 0) / marketStrengthInputs.length)
                                : priceStrength;

                              const flowInputs = [sectorCompositeLive, breadthSync, liveMomentum].filter(
                                (value): value is number => typeof value === 'number',
                              );
                              const flowEngine = flowInputs.length > 0
                                ? clamp01(flowInputs.reduce((sum, value) => sum + value, 0) / flowInputs.length)
                                : liveMomentum;

                              const riskInputs = [normalizedMove, ...(typeof sectorDispersion === 'number' ? [sectorDispersion] : [])];
                              const riskPulse = clamp01(1 - riskInputs.reduce((sum, value) => sum + value, 0) / riskInputs.length);
                              const breadthEngine = breadthSync ?? priceStrength;

                              const sectorDirectionImpulse = sectorCompositeLive == null ? 0 : (sectorCompositeLive - 0.5) * 130;
                              const breadthImpulse = breadthSync == null ? 0 : (breadthSync - 0.5) * 110;
                              const priceActionBalanceRaw = dayMovePct * 24 + sectorDirectionImpulse + breadthImpulse;
                              const priceActionBalance = Math.max(-100, Math.min(100, Math.round(priceActionBalanceRaw)));
                              const buyPressure = Math.max(0, priceActionBalance);
                              const sellPressure = Math.max(0, -priceActionBalance);
                              const priceActionBias = priceActionBalance > 8 ? 'buy' : priceActionBalance < -8 ? 'sell' : 'neutral';
                              const priceActionMagnitude = Math.min(100, Math.abs(priceActionBalance));
                              const priceActionNeedleDeg = priceActionBalance * 0.9;

                              const slopeGeometryRaw = dayMovePct * 14 + sectorDirectionImpulse * 0.45 + breadthImpulse * 0.35;
                              const slopeGeometryScore = Math.max(-100, Math.min(100, Math.round(slopeGeometryRaw)));
                              const slopeGeometryMagnitude = Math.min(100, Math.abs(slopeGeometryScore));
                              const slopeAngle = Math.max(-45, Math.min(45, Math.round(Math.atan((slopeGeometryScore / 100) * 1.5) * (180 / Math.PI))));
                              const slopeNeedleDeg = slopeAngle * 2;
                              const slopeArcPosition = (slopeAngle + 45) / 90;
                              const slopeDotX = 22 + (130 - 22) * slopeArcPosition;
                              const slopeDotY = 52 - Math.sqrt(Math.max(0, 54 * 54 - Math.pow(slopeDotX - 76, 2)));
                              const slopeBias = slopeAngle >= 7 ? 'up' : slopeAngle <= -7 ? 'down' : 'flat';
                              const slopeColor = slopeBias === 'up' ? '#4ade80' : slopeBias === 'down' ? '#f59e0b' : '#22d3ee';
                              const sectorPulseBias = sectorCompositeLive == null ? 'neutral' : sectorCompositeLive >= 0.52 ? 'bullish' : sectorCompositeLive <= 0.48 ? 'bearish' : 'neutral';
                              <span className="text-amber-200/90">Sell {sellPressure}</span>
                              <span className={cn(
                                priceActionBias === 'buy'
                              const sectorPulsePct = sectorCompositeLive == null ? null : Math.round(sectorCompositeLive * 100);
                              ? "border-amber-400/45 bg-black shadow-[inset_0_0_18px_rgba(245,158,11,0.12),0_0_14px_rgba(245,158,11,0.16)]"
                              : "border-cyan-400/40 bg-black shadow-[inset_0_0_18px_rgba(34,211,238,0.1),0_0_12px_rgba(34,211,238,0.14)]"
                          )}>
                            <div className="mb-0.5 flex items-center justify-between text-[7px] font-mono uppercase tracking-[0.12em]">
                              <span className="text-cyan-200/85">Slope Geometry</span>
                              <span className={cn(
                                "rounded border px-1.5 py-0.5",
                                slopeBias === 'up'
                                  ? "border-emerald-400/45 bg-emerald-500/16 text-emerald-200"
                                  : slopeBias === 'down'
                                  ? "border-amber-400/45 bg-amber-500/16 text-amber-200"
                                  : "border-cyan-400/45 bg-cyan-500/14 text-cyan-200"
                              )}>
                                {slopeGeometryMagnitude}%
                              </span>
                            </div>
                            <svg width="136" height="68" viewBox="0 0 152 72" className="mx-auto">
                              <path d="M 22 52 A 54 54 0 0 1 130 52" fill="none" stroke="rgba(71,85,105,0.5)" strokeWidth="9" strokeLinecap="round" />
                              <path d="M 22 52 A 54 54 0 0 1 76 6" fill="none" stroke="rgba(245,158,11,0.3)" strokeWidth="5" strokeLinecap="round" />
                              <path d="M 76 6 A 54 54 0 0 1 130 52" fill="none" stroke="rgba(74,222,128,0.3)" strokeWidth="5" strokeLinecap="round" />
                              <path
                                d="M 22 52 A 54 54 0 0 1 130 52"
                                fill="none"
                                stroke={slopeColor}
                                strokeWidth="6"
                                strokeLinecap="round"
                                strokeDasharray={Math.PI * 54}
                                strokeDashoffset={Math.PI * 54 * (1 - slopeArcPosition)}
                                className={cn(
                                  slopeBias === 'up'
                                    ? "drop-shadow-[0_0_10px_rgba(74,222,128,0.9)]"
                                    : slopeBias === 'down'
                                    ? "drop-shadow-[0_0_10px_rgba(245,158,11,0.9)]"
                                    : "drop-shadow-[0_0_10px_rgba(34,211,238,0.9)]"
                                )}
                              />

                              {[0, 1, 2, 3, 4].map((i) => {
                                const angle = (-180 + i * 45) * (Math.PI / 180);
                                const x1 = 76 + Math.cos(angle) * 44;
                                const y1 = 52 + Math.sin(angle) * 44;
                                const x2 = 76 + Math.cos(angle) * 50;
                                const y2 = 52 + Math.sin(angle) * 50;
                                return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="rgba(148,163,184,0.45)" strokeWidth="1.2" />;
                              })}

                              <g transform={`rotate(${slopeNeedleDeg} 76 52)`}>
                                <line x1="76" y1="52" x2="76" y2="14" stroke={slopeColor} strokeWidth="2.4" strokeLinecap="round" />
                                <line x1="76" y1="52" x2="76" y2="14" stroke={slopeColor} strokeWidth="6" strokeLinecap="round" opacity="0.22" />
                              </g>

                              <circle cx={slopeDotX} cy={slopeDotY} r="2.2" fill={slopeColor} className={cn(
                                slopeBias === 'up'
                                  ? "drop-shadow-[0_0_10px_rgba(74,222,128,0.9)]"
                                  : slopeBias === 'down'
                                  ? "drop-shadow-[0_0_10px_rgba(245,158,11,0.9)]"
                                  : "drop-shadow-[0_0_10px_rgba(34,211,238,0.9)]"
                              )} />
                              <circle cx="76" cy="52" r="3.8" fill={slopeColor} />
                              <circle cx="76" cy="52" r="8" fill={slopeColor} opacity="0.2" />

                              <text x="18" y="66" textAnchor="middle" className="fill-amber-200/85 text-[8px] font-mono">-45°</text>
                              <text x="76" y="66" textAnchor="middle" className="fill-cyan-200/85 text-[8px] font-mono">0°</text>
                              <text x="134" y="66" textAnchor="middle" className="fill-emerald-200/85 text-[8px] font-mono">+45°</text>
                            </svg>
                            <div className="mt-0.5 flex items-center justify-center text-[7px] font-mono uppercase tracking-[0.1em]">
                              <span className={cn(
                                "px-1.5 py-0.5 rounded border",
                                slopeBias === 'up'
                                  ? "border-emerald-400/45 bg-emerald-500/16 text-emerald-200"
                                  : slopeBias === 'down'
                                  ? "border-amber-400/45 bg-amber-500/16 text-amber-200"
                                  : "border-cyan-400/45 bg-cyan-500/14 text-cyan-200"
                              )}>
                                Angle {slopeAngle > 0 ? `+${slopeAngle}` : slopeAngle}°
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1">
                        {rightEngineStack.map((engine) => (
                          <div
                            key={engine.label}
                            className={cn(
                              "relative rounded-md border px-1.5 py-1.5 overflow-hidden",
                              engine.value >= 0.5
                                ? "border-emerald-300/60 bg-[linear-gradient(135deg,rgba(16,185,129,0.2),rgba(4,16,18,0.35))] shadow-[inset_0_0_16px_rgba(74,222,128,0.16),0_0_18px_rgba(74,222,128,0.32)]"
                                : "border-amber-300/60 bg-[linear-gradient(135deg,rgba(245,158,11,0.2),rgba(20,12,4,0.35))] shadow-[inset_0_0_16px_rgba(245,158,11,0.16),0_0_18px_rgba(245,158,11,0.32)]"
                            )}
                            <div className="pointer-events-none absolute inset-x-2 top-1 h-px bg-gradient-to-r from-transparent via-cyan-100/45 to-transparent" />
                          >
                            <div className={cn(
                              "pointer-events-none absolute inset-0 opacity-30",
                              engine.value >= 0.5
                                : "bg-[radial-gradient(circle_at_12%_18%,rgba(245,158,11,0.35),transparent_42%)]"
                                : "bg-[radial-gradient(circle_at_12%_18%,rgba(248,113,113,0.35),transparent_42%)]"
                            )} />
                            <svg width="122" height="46" viewBox="0 0 136 60" className="mx-auto">
                              <path d="M 34 42 A 34 34 0 0 1 102 42" stroke="currentColor" strokeWidth="8" className="text-slate-950/70" fill="none" strokeLinecap="round" />
                              <path d="M 30 38 A 30 30 0 0 1 90 38" stroke="currentColor" strokeWidth="3.5" className="text-slate-400/15" fill="none" strokeLinecap="round" />
                              <path
                                d="M 30 38 A 30 30 0 0 1 90 38"
                                stroke={neonMiniColor(engine.value)}
                                strokeWidth="3.5"
                                className={cn(
                                  engine.value >= 0.5
                                    ? "drop-shadow-[0_0_8px_rgba(74,222,128,0.9)]"
                                    : "drop-shadow-[0_0_8px_rgba(245,158,11,0.9)]"
                                )}
                                fill="none"
                                strokeLinecap="round"
                                strokeDasharray={Math.PI * 30}
                                strokeDashoffset={(Math.PI * 30) * (1 - engine.value)}
                              />
                              <text
                                x="60"
                                y="22"
                                textAnchor="middle"
                                fill={neonMiniColor(engine.value)}
                                className={cn(
                                  "text-[13px] font-mono font-black",
                                  engine.value >= 0.5
                                    ? "drop-shadow-[0_0_8px_rgba(74,222,128,0.95)]"
                                    : "drop-shadow-[0_0_8px_rgba(245,158,11,0.95)]"
                                )}
                              >
                                {Math.round(engine.value * 100)}
                              </text>
                            </svg>
                            <div className={cn(
                              "-mt-0.5 text-[8px] uppercase tracking-wide text-center truncate",
                              engine.value >= 0.5 ? "text-emerald-100" : "text-amber-100"
                            )}>{engine.label}</div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-center">
                      <div className="rounded-md border border-red-400/35 bg-red-500/12 px-2 py-1">
                        <div className="text-[8px] uppercase tracking-wider text-red-200/80">Bearish</div>
                        <div className="text-[14px] font-mono font-black text-red-200">{bearishSectorCount}</div>
                      </div>
                      <div className={cn(
                        "rounded-md border px-2 py-1.5 text-center",
                        sectorPulseBias === 'bullish'
                          ? "border-emerald-400/30 bg-emerald-500/10"
                          : sectorPulseBias === 'bearish'
                          ? "border-indigo-400/30 bg-indigo-500/10"
                          : "border-violet-400/30 bg-violet-500/10"
                      )}>
                        <div className={cn("text-[12px] font-mono font-black tracking-[0.12em] uppercase", sectorPulseTone)}>
                          Sector Trend {sectorPulseBias}
                        </div>
                        <div className={cn(
                          "text-[10px] font-mono mt-0.5",
                          sectorPulseBias === 'bullish'
                            ? "text-emerald-200/85"
                            : sectorPulseBias === 'bearish'
                            ? "text-red-200/85"
                            : "text-violet-200/85"
                        )}>
                          {liveSectorCount}/{sectorStates.length} sectors live
                        </div>
                      </div>
                      <div className="rounded-md border border-emerald-400/35 bg-emerald-500/12 px-2 py-1">
                        <div className="text-[8px] uppercase tracking-wider text-emerald-200/80">Bullish</div>
                        <div className="text-[14px] font-mono font-black text-emerald-200">{bullishSectorCount}</div>
                      </div>
                    </div>

                    <div className="rounded-md border border-slate-700/40 bg-slate-950/30 px-2 py-1">
                      <div className="flex flex-wrap gap-1">
                        {sectorStates.map((sector) => (
                          <span
                            key={sector.code}
                            className={cn(
                              "rounded px-1 py-0.5 text-[8px] font-mono",
                              !sector.isLive
                                ? "bg-slate-500/20 text-slate-300"
                                : sector.value >= 0.5
                                ? "bg-emerald-500/20 text-emerald-200"
                                : "bg-red-500/20 text-red-200"
                            )}
                            title={
                              sector.isLive && typeof sector.liveChangePct === 'number'
                                ? `${sector.label} ${sector.liveChangePct >= 0 ? '+' : ''}${sector.liveChangePct.toFixed(2)}%`
                                : `${sector.label} no live data`
                            }
                          >
                            {sector.code}{' '}
                            {sector.isLive && typeof sector.liveChangePct === 'number'
                              ? `${sector.liveChangePct >= 0 ? '+' : ''}${sector.liveChangePct.toFixed(1)}%`
                              : Math.round(sector.value * 100)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

*/

export function PriceCard({
  symbol,
  price,
  change,
  changePercent,
  intradayChange,
  intradayChangePercent,
  sectorData,
}: {
  symbol: string;
  price: number;
  change?: number;
  changePercent?: number;
  intradayChange?: number;
  intradayChangePercent?: number;
  sectorData?: Array<{
    code: string;
    label: string;
    changePct: number | null;
    live: boolean;
  }>;
}) {
  const isPositive = (change ?? 0) >= 0;
  const gradientClass = isPositive
    ? "from-cyan-500/12 via-blue-500/10 to-teal-500/12"
    : "from-cyan-500/10 via-blue-500/10 to-amber-500/12";
  const borderClass = isPositive ? "border-cyan-500/35" : "border-orange-500/35";

  const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

  const { data: scannerResults } = useQuery<ScannerResult[]>({
    queryKey: ["/api/scanner/results"],
    enabled: !!symbol,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const { data: fusionSnapshot } = useQuery<PriceCardFusionSnapshot>({
    queryKey: ["/api/fusion", symbol],
    enabled: !!symbol,
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const normalizePercentValue = (value: number | undefined | null): number | null => {
    if (!Number.isFinite(value)) return null;
    const numeric = value as number;
    return Math.round(Math.abs(numeric) <= 1 ? numeric * 100 : numeric);
  };

  const scannerSignal = scannerResults?.find(
    (result) => String(result.symbol ?? "").toUpperCase() === symbol.toUpperCase(),
  );

  const unifiedSignal = fusionSnapshot?.unifiedSignal;
  const unifiedDirectionRaw = String(unifiedSignal?.unifiedDirection ?? "WAIT").toUpperCase();
  const unifiedDirection: "CALL" | "PUT" | "WAIT" =
    unifiedDirectionRaw === "CALL" ? "CALL" : unifiedDirectionRaw === "PUT" ? "PUT" : "WAIT";
  const unifiedConfidence = (() => {
    const preferred = normalizePercentValue(unifiedSignal?.unifiedConfidence);
    if (preferred != null) return Math.max(0, Math.min(100, preferred));
    const fallback = normalizePercentValue(unifiedSignal?.confidence);
    return fallback == null ? null : Math.max(0, Math.min(100, fallback));
  })();
  const unifiedStateRaw = String(unifiedSignal?.state ?? "").toUpperCase();
  const unifiedState: "ACTIVE" | "STALE" | "INACTIVE" =
    unifiedStateRaw === "ACTIVE"
      ? "ACTIVE"
      : unifiedStateRaw === "STALE"
      ? "STALE"
      : "INACTIVE";
  const unifiedSetupGradeRaw = String(unifiedSignal?.setupGrade ?? "WAIT").toUpperCase();
  const unifiedSetupGrade: "GOLD" | "HOT" | "READY" | "BUILDING" | "WAIT" =
    unifiedSetupGradeRaw === "GOLD"
      ? "GOLD"
      : unifiedSetupGradeRaw === "HOT"
      ? "HOT"
      : unifiedSetupGradeRaw === "READY"
      ? "READY"
      : unifiedSetupGradeRaw === "BUILDING"
      ? "BUILDING"
      : "WAIT";
  const unifiedGatingRaw = normalizePercentValue(
    (unifiedSignal?.gatingScore as number | undefined) ?? fusionSnapshot?.gatingState?.gatingScore,
  );
  const unifiedGatingScore =
    unifiedGatingRaw == null ? null : Math.max(0, Math.min(100, unifiedGatingRaw));
  const unifiedNotes = Array.isArray(unifiedSignal?.notes) ? unifiedSignal.notes : [];
  const unifiedActionText = String(unifiedSignal?.recommendedAction ?? "")
    .replace(/\s+/g, " ")
    .trim();
  const unifiedSafety = unifiedSignal?.priceActionSafety;
  const unifiedSafetyForceWait =
    unifiedSafety?.safetyAction === "force_wait" ||
    (unifiedSafety?.contradiction === true &&
      String(unifiedSafety?.contradictionSeverity ?? "").toLowerCase() === "severe");
  const unifiedSafetyMultiplier = Number.isFinite(unifiedSafety?.confidenceMultiplier)
    ? Math.max(0.4, Math.min(1, unifiedSafety?.confidenceMultiplier ?? 1))
    : 1;

  const scannerMomentumSigned = Number.isFinite(scannerSignal?.momentumStrength)
    ? (scannerSignal?.momentumStrength ?? 0)
    : 0;
  const scannerMomentumAbs = Math.abs(scannerMomentumSigned);
  const scannerBreakoutScore = Number.isFinite(scannerSignal?.breakoutScore)
    ? (scannerSignal?.breakoutScore ?? 0)
    : 0;
  const scannerVolumeSpike = Number.isFinite(scannerSignal?.volumeSpike)
    ? (scannerSignal?.volumeSpike ?? 1)
    : 1;
  const scannerSignalType = String(scannerSignal?.breakoutSignal ?? "").toUpperCase();
  const scannerSignalQualityRaw = String(scannerSignal?.signalQuality ?? "LOW").toUpperCase();
  const scannerSignalQuality: "HIGH" | "MEDIUM" | "LOW" | "UNRELIABLE" =
    scannerSignalQualityRaw === "HIGH"
      ? "HIGH"
      : scannerSignalQualityRaw === "MEDIUM"
      ? "MEDIUM"
      : scannerSignalQualityRaw === "UNRELIABLE"
      ? "UNRELIABLE"
      : "LOW";
  const scannerWarnings = Array.isArray(scannerSignal?.warnings) ? scannerSignal.warnings : [];
  const scannerWarningSet = new Set(
    scannerWarnings.map((warning) => String(warning ?? "").toUpperCase()),
  );
  const scannerCriticalWarningCount = [
    "TV_TREND_CONFLICT",
    "TV_RECOMMEND_OPPOSE",
    "TV_LOW_ADX",
    "WEAK_DIRECTIONAL_MOMENTUM",
    "CONFLICT_MOMENTUM",
    "LOW_VOLUME",
    "TREND_CONFLICT",
    "WEAK_TIME_WINDOW",
  ].filter((warning) => scannerWarningSet.has(warning)).length;
  const scannerScanAgeSec = Number.isFinite(scannerSignal?.scanTime)
    ? Math.max(0, Math.round((Date.now() - (scannerSignal?.scanTime ?? 0)) / 1000))
    : null;
  const scannerIsStale = scannerScanAgeSec != null && scannerScanAgeSec > 120;
  const tvRsi = Number.isFinite(scannerSignal?.tvRsi) ? (scannerSignal?.tvRsi ?? 0) : null;
  const tvAdx = Number.isFinite(scannerSignal?.tvAdx) ? (scannerSignal?.tvAdx ?? 0) : null;
  const tvRecommendAll = Number.isFinite(scannerSignal?.tvRecommendAll)
    ? (scannerSignal?.tvRecommendAll ?? 0)
    : null;
  const tvTrendDirection = String(scannerSignal?.tvTrendDirection ?? "neutral").toLowerCase();
  const tvTrendStrength = Number.isFinite(scannerSignal?.tvTrendStrength)
    ? Math.max(0, Math.min(100, scannerSignal?.tvTrendStrength ?? 0))
    : 0;
  const tvTrendBias =
    tvTrendDirection === "bullish" ? 1 : tvTrendDirection === "bearish" ? -1 : 0;
  const tvConflictActive =
    scannerWarningSet.has("TV_TREND_CONFLICT") || scannerWarningSet.has("TV_RECOMMEND_OPPOSE");
  const scannerDirectionalBreakout =
    scannerSignalType === "BREAKOUT" ||
    scannerSignalType === "BREAKDOWN" ||
    scannerSignalType === "EXPANSION";
  const scannerMomentumBreakout = scannerSignalType === "MOMENTUM" && scannerMomentumAbs >= 18;
  const scannerSignalBoost =
    scannerDirectionalBreakout
      ? 1
      : scannerMomentumBreakout
      ? 0.8
      : scannerSignalType === "BUILDING"
      ? 0.45
      : scannerSignalType === "SQUEEZE"
      ? 0.35
      : 0;
  
  // Use INTRADAY change for gauges (slope geometry, price action, sector pulse)
  // This ensures pre-market price gaps don't skew the intraday sentiment
  const intradayMovePct = Number.isFinite(intradayChangePercent) ? (intradayChangePercent ?? 0) : null;
  const sessionMovePct = Number.isFinite(changePercent) ? (changePercent ?? 0) : 0;
  const scannerMomentumPct = Math.max(-1.6, Math.min(1.6, scannerMomentumSigned / 30));
  const baseMovePct = intradayMovePct ?? sessionMovePct;
  const dayMovePct =
    Math.abs(scannerMomentumSigned) >= 10
      ? baseMovePct * 0.7 + scannerMomentumPct * 0.3
      : baseMovePct;
  const normalizedMove = clamp01(Math.abs(dayMovePct) / 2.4);

  const sectorModels = [
    { code: "XLC", label: "Communication Services" },
    { code: "XLY", label: "Consumer Discretionary" },
    { code: "XLP", label: "Consumer Staples" },
    { code: "XLE", label: "Energy" },
    { code: "XLF", label: "Financials" },
    { code: "XLV", label: "Health Care" },
    { code: "XLI", label: "Industrials" },
    { code: "XLK", label: "Information Technology" },
    { code: "XLB", label: "Materials" },
    { code: "XLRE", label: "Real Estate" },
    { code: "XLU", label: "Utilities" },
  ] as const;

  const liveSectorMap = new Map(
    (sectorData ?? []).map((sector) => [sector.code.toUpperCase(), sector]),
  );

  const sectorStates = sectorModels.map((sector) => {
    const liveSector = liveSectorMap.get(sector.code);
    const liveChangePct = typeof liveSector?.changePct === "number" ? liveSector.changePct : null;
    const value = liveChangePct === null ? null : clamp01((liveChangePct + 2) / 4);
    const state =
      liveChangePct === null
        ? "na"
        : liveChangePct >= 0.2
        ? "bull"
        : liveChangePct <= -0.2
        ? "bear"
        : "flat";

    return {
      ...sector,
      value,
      state,
      liveChangePct,
      isLive: liveChangePct !== null,
    };
  });

  const liveSectorStates = sectorStates.filter(
    (
      sector,
    ): sector is (typeof sectorStates)[number] & {
      liveChangePct: number;
      value: number;
      isLive: true;
    } => sector.isLive && typeof sector.liveChangePct === "number" && typeof sector.value === "number",
  );

  const liveSectorCount = liveSectorStates.length;
  const totalSectorCount = sectorModels.length;
  const hasLiveSectorFeed = liveSectorCount > 0;
  const sectorCompositeLive =
    liveSectorCount > 0
      ? clamp01(liveSectorStates.reduce((sum, sector) => sum + sector.value, 0) / liveSectorCount)
      : null;
  const sectorCompositeForViz = sectorCompositeLive ?? 0.5;

  const bullishSectorCount = liveSectorStates.filter((sector) => sector.liveChangePct >= 0).length;
  const bearishSectorCount = liveSectorStates.filter((sector) => sector.liveChangePct < 0).length;

  const breadthSync = liveSectorCount > 0 ? clamp01(bullishSectorCount / liveSectorCount) : null;
  const sectorMeanChangePct =
    liveSectorCount > 0
      ? liveSectorStates.reduce((sum, sector) => sum + sector.liveChangePct, 0) / liveSectorCount
      : 0;
  const sectorDispersion =
    liveSectorCount > 1
      ? clamp01(
          Math.sqrt(
            liveSectorStates.reduce(
              (sum, sector) => sum + Math.pow(sector.liveChangePct - sectorMeanChangePct, 2),
              0,
            ) / liveSectorCount,
          ) / 2.5,
        )
      : null;

  const priceStrength = clamp01(0.5 + dayMovePct / 4);
  const liveMomentum = clamp01(0.5 + dayMovePct / 3.2);
  const scannerBreakoutHeat = clamp01(scannerBreakoutScore / 100);
  const scannerMomentumHeat = clamp01(scannerMomentumAbs / 45);
  const scannerVolumeHeat = clamp01((scannerVolumeSpike - 0.85) / 1.2);
  const scannerQualityHeat =
    scannerSignalQuality === "HIGH"
      ? 0.95
      : scannerSignalQuality === "MEDIUM"
      ? 0.72
      : scannerSignalQuality === "LOW"
      ? 0.48
      : 0.2;
  const fusionConfidenceHeat =
    unifiedConfidence == null ? null : clamp01((unifiedConfidence - 8) / 92);
  const fusionStateHeat =
    unifiedState === "ACTIVE"
      ? fusionConfidenceHeat ?? 0.65
      : unifiedState === "STALE"
      ? 0.38
      : 0.14;
  const warningRiskPenalty = clamp01(scannerCriticalWarningCount / 5);
  const safetyRiskPenalty = unifiedSafetyForceWait ? 1 : unifiedSafety?.contradiction ? 0.68 : 0;

  const marketStrengthInputs = [
    priceStrength,
    liveMomentum,
    sectorCompositeLive,
    breadthSync,
    scannerBreakoutHeat,
    scannerQualityHeat,
    fusionConfidenceHeat,
  ].filter(
    (value): value is number => typeof value === "number",
  );
  const marketStrength =
    marketStrengthInputs.length > 0
      ? clamp01(marketStrengthInputs.reduce((sum, value) => sum + value, 0) / marketStrengthInputs.length)
      : priceStrength;

  const flowInputs = [
    liveMomentum,
    sectorCompositeLive,
    breadthSync,
    scannerMomentumHeat,
    scannerVolumeHeat,
    unifiedState === "ACTIVE" ? fusionStateHeat : null,
  ].filter(
    (value): value is number => typeof value === "number",
  );
  const flowEngine =
    flowInputs.length > 0
      ? clamp01(flowInputs.reduce((sum, value) => sum + value, 0) / flowInputs.length)
      : liveMomentum;

  const riskInputs = [
    normalizedMove,
    ...(typeof sectorDispersion === "number" ? [sectorDispersion] : []),
    warningRiskPenalty,
    safetyRiskPenalty,
    scannerIsStale ? 0.35 : 0,
  ];
  const riskPulse = clamp01(1 - riskInputs.reduce((sum, value) => sum + value, 0) / riskInputs.length);
  const breadthEngine = breadthSync ?? priceStrength;

  const sectorDirectionImpulse = sectorCompositeLive == null ? 0 : (sectorCompositeLive - 0.5) * 40;
  const breadthImpulse = breadthSync == null ? 0 : (breadthSync - 0.5) * 32;

  // Price geometry is the primary driver with moderate sector/breadth confirmation
  // Increased responsiveness: 48x multiplier gives ±24 for 0.5% moves, ±96 for 2% moves
  const priceActionBalanceRaw = dayMovePct * 48 + sectorDirectionImpulse * 0.15 + breadthImpulse * 0.12;
  const priceActionBalance = Math.max(-100, Math.min(100, Math.round(priceActionBalanceRaw)));
  const buyPressure = Math.max(0, priceActionBalance);
  const sellPressure = Math.max(0, -priceActionBalance);
  const priceActionBias = priceActionBalance > 8 ? "buy" : priceActionBalance < -8 ? "sell" : "neutral";
  const priceActionMagnitude = Math.min(100, Math.abs(priceActionBalance));
  const priceActionNeedleDeg = priceActionBalance * 0.9;
  // Buy = emerald, Sell = red (matches TacticalAdvicePanel color system)
  const priceActionColor =
    priceActionBias === "buy" ? "#10b981" : priceActionBias === "sell" ? "#ef4444" : "#22d3ee";

  // Slope geometry emphasizes rate of change with faster response to momentum shifts
  const slopeGeometryRaw = dayMovePct * 60 + sectorDirectionImpulse * 0.2 + breadthImpulse * 0.15;
  const slopeGeometryScore = Math.max(-100, Math.min(100, Math.round(slopeGeometryRaw)));
  const slopeGeometryMagnitude = Math.min(100, Math.abs(slopeGeometryScore));

  // ── SLOPE ANGLE (linear ±100 → ±45°, no atan compression) ──────────────
  const slopeAngle = Math.max(-45, Math.min(45, Math.round(slopeGeometryScore * 0.45)));
  const slopeNeedleDeg = slopeAngle * 2;
  const slopeArcPosition = (slopeAngle + 45) / 90;
  const slopeDotX = 22 + (130 - 22) * slopeArcPosition;
  const slopeDotY = 58 - Math.sqrt(Math.max(0, 54 * 54 - Math.pow(slopeDotX - 76, 2)));
  const slopeBias = slopeAngle >= 7 ? "up" : slopeAngle <= -7 ? "down" : "flat";
  const slopeColor = slopeBias === "up" ? "#10b981" : slopeBias === "down" ? "#ef4444" : "#22d3ee";

  // ── SECTOR PULSE ──────────────────────────────────────────────────────
  const sectorPulseBias =
    sectorCompositeLive == null
      ? "neutral"
      : sectorCompositeLive >= 0.52
      ? "bullish"
      : sectorCompositeLive <= 0.48
      ? "bearish"
      : "neutral";
  // Bull = emerald, bear = red — matches TacticalAdvicePanel color system
  const sectorPulseColor =
    sectorPulseBias === "bullish" ? "#10b981" : sectorPulseBias === "bearish" ? "#ef4444" : "#38bdf8";
  const sectorPulseTone =
    sectorPulseBias === "bullish" ? "text-emerald-300" : sectorPulseBias === "bearish" ? "text-red-300" : "text-cyan-300";
  const sectorPulseNeedle = sectorCompositeForViz * 180 - 180;
  const sectorPulsePct = sectorCompositeLive == null ? null : Math.round(sectorCompositeLive * 100);

  // ── EXPLOSION / SURGE DETECTION ──────────────────────────────────────
  const breadthEdge = breadthSync == null ? null : Math.abs(breadthSync - 0.5) * 2;
  const sectorAlignScore =
    typeof sectorDispersion === "number" ? clamp01(1 - sectorDispersion * 1.2) : null;

  const scannerDirectionBias =
    scannerSignalType === "BREAKOUT"
      ? 1
      : scannerSignalType === "BREAKDOWN"
      ? -1
      : scannerSignalType === "EXPANSION"
      ? scannerSignal?.expansionDirection === "bullish"
        ? 1
        : scannerSignal?.expansionDirection === "bearish"
        ? -1
        : 0
      : scannerMomentumSigned >= 8
      ? 1
      : scannerMomentumSigned <= -8
      ? -1
      : 0;
  const fusionDirectionBias =
    unifiedDirection === "CALL" ? 1 : unifiedDirection === "PUT" ? -1 : 0;
  const directionalAgreement =
    scannerDirectionBias === 0 || fusionDirectionBias === 0
      ? 0.52
      : scannerDirectionBias === fusionDirectionBias
      ? 1
      : 0.12;
  const tvDirectionalAgreement =
    scannerDirectionBias === 0 || tvTrendBias === 0
      ? 0.5
      : scannerDirectionBias === tvTrendBias
      ? 1
      : 0.18;

  const triggerPulse = clamp01(
    normalizedMove * 0.32 +
      scannerBreakoutHeat * 0.27 +
      scannerMomentumHeat * 0.18 +
      scannerVolumeHeat * 0.11 +
      scannerSignalBoost * 0.12,
  );

  const participationPulse = clamp01(
    (breadthEdge ?? 0.36) * 0.46 +
      (sectorAlignScore ?? 0.42) * 0.34 +
      (hasLiveSectorFeed ? clamp01(liveSectorCount / totalSectorCount) : 0.15) * 0.2,
  );

  const confirmationPulse = clamp01(
    scannerQualityHeat * 0.4 +
      directionalAgreement * 0.24 +
      tvDirectionalAgreement * 0.18 +
      (unifiedState === "ACTIVE" ? 0.88 : unifiedState === "STALE" ? 0.55 : 0.22) * 0.18,
  );

  const explosionPenalty = clamp01(
    warningRiskPenalty * 0.46 +
      safetyRiskPenalty * 0.34 +
      (scannerIsStale ? 0.16 : 0) +
      (tvConflictActive ? 0.1 : 0),
  );

  let surgeHeat = clamp01(
    triggerPulse * 0.44 +
      participationPulse * 0.26 +
      confirmationPulse * 0.22 +
      directionalAgreement * 0.08 -
      explosionPenalty * 0.32,
  );

  if (
    (scannerDirectionalBreakout || scannerMomentumBreakout) &&
    scannerBreakoutScore >= 62 &&
    scannerMomentumAbs >= 16 &&
    confirmationPulse >= 0.46
  ) {
    surgeHeat = Math.max(surgeHeat, 0.76);
  } else if (
    (scannerDirectionalBreakout || scannerMomentumBreakout || scannerSignalType === "BUILDING") &&
    scannerBreakoutScore >= 48 &&
    scannerMomentumAbs >= 12
  ) {
    surgeHeat = Math.max(surgeHeat, 0.56);
  }

  if (unifiedSafetyForceWait && surgeHeat < 0.9) {
    surgeHeat *= 0.84;
  }

  const surgeThreshold = Math.max(
    0.6,
    Math.min(0.78, 0.69 + explosionPenalty * 0.08 - confirmationPulse * 0.06),
  );
  const buildingThreshold = Math.max(0.38, surgeThreshold - 0.2);
  const surgeColor = surgeHeat >= surgeThreshold ? "#f43f5e" : surgeHeat >= buildingThreshold ? "#f59e0b" : "#22d3ee";
  const surgeLabel = surgeHeat >= surgeThreshold ? "SURGE" : surgeHeat >= buildingThreshold ? "BUILDING" : "CALM";
  const isSurging = surgeHeat >= surgeThreshold;

  // ── CALL / PUT SIGNAL (all from live data only) ───────────────────────
  // Score range: -6 to +6 → normalized to -100…+100
  let cpRawScore = 0;
  // 1. Intraday price action (always real — derived from live price feed)
  cpRawScore += priceActionBias === "buy" ? 2 : priceActionBias === "sell" ? -2 : 0;
  // 2. Slope geometry (derived from intraday % — always real)
  cpRawScore += slopeBias === "up" ? 1.5 : slopeBias === "down" ? -1.5 : 0;
  // 2b. Scanner momentum adds short-horizon direction context.
  if (scannerMomentumAbs >= 8) {
    cpRawScore += Math.max(-1.4, Math.min(1.4, scannerMomentumSigned / 22));
  }
  // 3. Sector composite (only when live sectors are available)
  if (sectorCompositeLive != null) {
    cpRawScore += sectorPulseBias === "bullish" ? 1.5 : sectorPulseBias === "bearish" ? -1.5 : 0;
  }
  // 4. Breadth (only when live sectors available)
  if (breadthSync != null) {
    cpRawScore += breadthSync >= 0.65 ? 1 : breadthSync <= 0.35 ? -1 : 0;
  }

  // 5. Scanner quality and warnings (reflects calibrated breakout reliability)
  const scannerQualityBias =
    scannerSignalQuality === "HIGH"
      ? 1
      : scannerSignalQuality === "MEDIUM"
      ? 0.45
      : scannerSignalQuality === "UNRELIABLE"
      ? -1.35
      : 0;
  cpRawScore += scannerQualityBias;
  cpRawScore -= Math.min(1.8, scannerCriticalWarningCount * 0.48);
  if (scannerIsStale) cpRawScore *= 0.82;

  // 6. TradingView trend context (EMA/MACD/ADX/RSI/recommendation)
  if (tvTrendBias !== 0) {
    cpRawScore += tvTrendBias * Math.max(0.28, clamp01(tvTrendStrength / 100) * 1.25);
  }
  if (tvRecommendAll != null) {
    cpRawScore += Math.max(-0.9, Math.min(0.9, tvRecommendAll * 0.95));
  }
  if (tvAdx != null) {
    if (tvAdx < 16) cpRawScore -= 0.8;
    else if (tvAdx >= 24) cpRawScore += 0.35;
  }
  if (tvRsi != null) {
    if (priceActionBias === "buy" && tvRsi >= 72) cpRawScore -= 0.55;
    else if (priceActionBias === "sell" && tvRsi <= 28) cpRawScore -= 0.55;
  }

  // 7. Unified fusion state/confidence (audit-calibrated in backend)
  if (unifiedDirection === "CALL" || unifiedDirection === "PUT") {
    const fusionBias = unifiedDirection === "CALL" ? 1 : -1;
    const fusionEdge = clamp01(((unifiedConfidence ?? 0) - 42) / 42);
    cpRawScore += fusionBias * fusionEdge * 2.1;
  }
  if (unifiedState === "INACTIVE") {
    cpRawScore *= 0.58;
  } else if (unifiedState === "STALE") {
    cpRawScore *= 0.8;
  }
  if (unifiedGatingScore != null) {
    if (unifiedGatingScore >= 75) cpRawScore *= 1.08;
    else if (unifiedGatingScore <= 40) cpRawScore *= 0.84;
  }

  // Prevent false bullish/bearish bias when momentum strongly disagrees with aggregate drivers.
  if (scannerMomentumSigned <= -16 && cpRawScore > 0) {
    cpRawScore *= 0.45;
  } else if (scannerMomentumSigned >= 16 && cpRawScore < 0) {
    cpRawScore *= 0.45;
  }
  // Surge amplifier — explosive conditions sharpen the signal
  if (isSurging && !unifiedSafetyForceWait) cpRawScore *= 1.2;
  if (unifiedSafetyMultiplier < 1) cpRawScore *= unifiedSafetyMultiplier;
  if (unifiedSafetyForceWait) cpRawScore *= 0.45;

  const hasMomentumSignal = scannerMomentumAbs >= 8;
  const hasFusionBias = unifiedDirection === "CALL" || unifiedDirection === "PUT";
  const cpMaxScore = sectorCompositeLive != null && breadthSync != null
    ? hasMomentumSignal
      ? hasFusionBias
        ? 10.2
        : 8.6
      : hasFusionBias
      ? 9
      : 7.2
    : hasMomentumSignal
    ? hasFusionBias
      ? 7.2
      : 5.6
    : hasFusionBias
    ? 6.1
    : 4.2;
  const callPutScore = Math.max(-100, Math.min(100, Math.round((cpRawScore / cpMaxScore) * 100)));
  const qualityThresholdOffset =
    scannerSignalQuality === "HIGH"
      ? -5
      : scannerSignalQuality === "MEDIUM"
      ? -1
      : scannerSignalQuality === "LOW"
      ? 4
      : 10;
  const warningThresholdOffset = Math.min(12, scannerCriticalWarningCount * 3);
  const unifiedThresholdOffset =
    unifiedState === "ACTIVE" && (unifiedConfidence ?? 0) >= 72
      ? -6
      : unifiedState === "STALE"
      ? 7
      : unifiedState === "INACTIVE"
      ? 13
      : 0;
  const dynamicThreshold = Math.max(
    46,
    Math.min(78, 55 + qualityThresholdOffset + warningThresholdOffset + unifiedThresholdOffset),
  );
  let callPutSignal: "CALL" | "PUT" | "NO TRADE" =
    callPutScore >= dynamicThreshold
      ? "CALL"
      : callPutScore <= -dynamicThreshold
      ? "PUT"
      : "NO TRADE";
  const hardFusionConflict =
    (callPutSignal === "CALL" && unifiedDirection === "PUT" && (unifiedConfidence ?? 0) >= 65) ||
    (callPutSignal === "PUT" && unifiedDirection === "CALL" && (unifiedConfidence ?? 0) >= 65);
  if (hardFusionConflict) callPutSignal = "NO TRADE";
  if (unifiedSafetyForceWait && Math.abs(callPutScore) < 88) callPutSignal = "NO TRADE";
  if (scannerSignalQuality === "UNRELIABLE" && Math.abs(callPutScore) < 85) callPutSignal = "NO TRADE";
  const absCpScore = Math.abs(callPutScore);
  const cpStrength =
    absCpScore >= Math.max(72, dynamicThreshold + 14)
      ? "HIGH"
      : absCpScore >= Math.max(42, dynamicThreshold - 8)
      ? "MOD"
      : "LOW";
  const callPutColor = callPutSignal === "CALL" ? "#10b981" : callPutSignal === "PUT" ? "#ef4444" : "#f59e0b";
  const cpBorder = callPutSignal === "CALL" ? "border-emerald-400/55" : callPutSignal === "PUT" ? "border-red-400/55" : "border-amber-400/45";
  const cpBg = callPutSignal === "CALL" ? "#020f06" : callPutSignal === "PUT" ? "#0f0202" : "#0b0905";
  const cpTopBar = callPutSignal === "CALL" ? "from-emerald-600 via-teal-400 to-cyan-500" : callPutSignal === "PUT" ? "from-red-700 via-rose-500 to-orange-400" : "from-amber-600 via-orange-400 to-yellow-400";
  const fusionDirectionColor =
    unifiedDirection === "CALL"
      ? "#10b981"
      : unifiedDirection === "PUT"
      ? "#ef4444"
      : "#38bdf8";
  const fusionStateColor =
    unifiedState === "ACTIVE" ? "#10b981" : unifiedState === "STALE" ? "#f59e0b" : "#ef4444";
  const setupGradeColor =
    unifiedSetupGrade === "GOLD"
      ? "#facc15"
      : unifiedSetupGrade === "HOT"
      ? "#f97316"
      : unifiedSetupGrade === "READY"
      ? "#22d3ee"
      : unifiedSetupGrade === "BUILDING"
      ? "#94a3b8"
      : "#64748b";
  const scannerQualityColor =
    scannerSignalQuality === "HIGH"
      ? "#10b981"
      : scannerSignalQuality === "MEDIUM"
      ? "#f59e0b"
      : scannerSignalQuality === "LOW"
      ? "#fb7185"
      : "#ef4444";
  const tvTrendLabel = tvTrendBias > 0 ? "BULL" : tvTrendBias < 0 ? "BEAR" : "NEUT";
  const tvToneColor = tvTrendBias > 0 ? "#10b981" : tvTrendBias < 0 ? "#ef4444" : "#38bdf8";
  const scannerWarningSummary = scannerWarnings.slice(0, 2).join(" | ");
  const decisionIntel = unifiedActionText || unifiedNotes.slice(0, 2).join(" | ");
  const scannerWarningText =
    scannerWarningSummary.length > 88
      ? `${scannerWarningSummary.slice(0, 85)}...`
      : scannerWarningSummary;
  const decisionIntelText =
    decisionIntel.length > 132 ? `${decisionIntel.slice(0, 129)}...` : decisionIntel;
  const optionBQualified = unifiedSignal?.optionBQualified === true;

  const activeEngines = [
    { label: "Trend Core", value: marketStrength },
    { label: "Flow Engine", value: flowEngine },
    { label: "Risk Pulse", value: riskPulse },
    { label: "Breadth Sync", value: breadthEngine },
  ];
  const leftEngineStack = activeEngines.slice(0, 2);
  const rightEngineStack = activeEngines.slice(2, 4);

  // Market strength inherits the directional color
  const neonMainColor = callPutSignal === "CALL" ? "#10b981" : callPutSignal === "PUT" ? "#ef4444" : "#f59e0b";
  const neonMiniColor = (value: number) => value >= 0.65 ? "#10b981" : value <= 0.35 ? "#ef4444" : "#f59e0b";
  const startX = 48;
  const endX = 112;
  const cy = 40;
  const r = 32;
  const arc = Math.PI * r;
  const dotX = startX + (endX - startX) * marketStrength;
  const dotY = cy - Math.sqrt(Math.max(0, r * r - Math.pow(dotX - 80, 2)));
  const meterPanelScanline =
    "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.007) 3px,rgba(255,255,255,0.007) 4px)";
  const meterPanelBaseBg =
    `linear-gradient(160deg,${callPutColor}12,rgba(4,9,18,0.95) 52%,rgba(3,7,14,0.96) 100%)`;

  const renderMiniGauge = (engine: { label: string; value: number }) => {
    const mc = neonMiniColor(engine.value);
    const v = engine.value * 100;
    const sz = 72; const r_g = 25; const outerR_g = 32; const cx_g = 36; const cy_g = 36;
    const toR_g = (d: number) => (d * Math.PI) / 180;
    const ap_g = (s: number, e: number, ra: number) => {
      const sr = toR_g(s); const er = toR_g(e);
      return `M ${cx_g + ra * Math.cos(sr)} ${cy_g + ra * Math.sin(sr)} A ${ra} ${ra} 0 ${e - s > 180 ? 1 : 0} 1 ${cx_g + ra * Math.cos(er)} ${cy_g + ra * Math.sin(er)}`;
    };
    const fillEnd_g = -220 + 260 * Math.min(1, v / 100);
    const tipX_g = cx_g + r_g * Math.cos(toR_g(fillEnd_g));
    const tipY_g = cy_g + r_g * Math.sin(toR_g(fillEnd_g));
    const numT_g = 9;
    const gTicks = Array.from({ length: numT_g }, (_, i) => {
      const deg = -220 + (260 / (numT_g - 1)) * i;
      const rad = toR_g(deg);
      return { x1: cx_g + (outerR_g - 4) * Math.cos(rad), y1: cy_g + (outerR_g - 4) * Math.sin(rad), x2: cx_g + outerR_g * Math.cos(rad), y2: cy_g + outerR_g * Math.sin(rad), active: deg <= fillEnd_g };
    });
    const bs_g = 6; const pb_g = 2;
    const bkts_g = [
      `M ${bs_g + pb_g} ${pb_g} L ${pb_g} ${pb_g} L ${pb_g} ${bs_g + pb_g}`,
      `M ${sz - bs_g - pb_g} ${pb_g} L ${sz - pb_g} ${pb_g} L ${sz - pb_g} ${bs_g + pb_g}`,
      `M ${bs_g + pb_g} ${sz - pb_g} L ${pb_g} ${sz - pb_g} L ${pb_g} ${sz - bs_g - pb_g}`,
      `M ${sz - bs_g - pb_g} ${sz - pb_g} L ${sz - pb_g} ${sz - pb_g} L ${sz - pb_g} ${sz - bs_g - pb_g}`,
    ];
    return (
      <div
        key={engine.label}
        className="relative w-[84px] overflow-hidden rounded-lg border px-1 py-1"
        style={{
          borderColor: mc + "56",
          background: `linear-gradient(158deg,${callPutColor}10,${mc}0f,rgba(3,7,14,0.95))`,
          boxShadow: `inset 0 0 18px ${callPutColor}16, inset 0 0 14px ${mc}14, 0 0 16px ${mc}20`,
        }}
      >
        <div className="pointer-events-none absolute inset-0 opacity-10" style={{ backgroundImage: meterPanelScanline }} />
        <div className="pointer-events-none absolute inset-x-2 top-1 h-px" style={{ background: `linear-gradient(90deg,transparent,${mc}66,transparent)` }} />
        <div className="pointer-events-none absolute left-1.5 top-1.5 h-2.5 w-2.5 border-l border-t" style={{ borderColor: callPutColor + "58" }} />
        <div className="pointer-events-none absolute right-1.5 bottom-1.5 h-2.5 w-2.5 border-r border-b" style={{ borderColor: callPutColor + "3a" }} />
        <svg width={sz} height={sz} viewBox={`0 0 ${sz} ${sz}`} className="relative z-10 mx-auto">
          {bkts_g.map((d, i) => <path key={i} d={d} fill="none" stroke={mc + "55"} strokeWidth="1.2" strokeLinecap="square" />)}
          <circle cx={cx_g} cy={cy_g} r={outerR_g - 1} fill="none" stroke={mc + "18"} strokeWidth="0.5" />
          {gTicks.map(({ x1, y1, x2, y2, active }, i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={active ? mc + "dd" : "rgba(255,255,255,0.08)"}
              strokeWidth={i === 0 || i === numT_g - 1 ? "1.5" : "0.8"} strokeLinecap="round" />
          ))}
          <path d={ap_g(-220, 40, r_g)} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" strokeLinecap="round" strokeDasharray="4 3" />
          {v > 0 && <path d={ap_g(-220, fillEnd_g, r_g)} fill="none" stroke={mc} strokeWidth="9" strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 10px ${mc}cc)`, opacity: 0.22 }} />}
          {v > 0 && <path d={ap_g(-220, fillEnd_g, r_g)} fill="none" stroke={mc} strokeWidth="5.5" strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 5px ${mc}aa)` }} />}
          {v > 2 && <circle cx={tipX_g} cy={tipY_g} r="3.5" fill={mc}
            style={{ filter: `drop-shadow(0 0 5px ${mc}) drop-shadow(0 0 12px ${mc}88)` }} />}
          <circle cx={cx_g} cy={cy_g} r={r_g - 9} fill={mc + "08"} />
          <circle cx={cx_g} cy={cy_g} r={r_g - 9} fill="none" stroke={mc + "25"} strokeWidth="0.5" />
          <text x={cx_g} y={cy_g - 3} textAnchor="middle" dominantBaseline="middle" fill={mc}
            fontSize="13" fontWeight="900" fontFamily="monospace"
            style={{ filter: `drop-shadow(0 0 6px ${mc}99)` }}>{Math.round(v)}</text>
          <text x={cx_g} y={cy_g + 9} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.32)"
            fontSize="5.5" fontWeight="700" letterSpacing="1.5">
            {v >= 65 ? "BULL" : v <= 35 ? "BEAR" : "NEUT"}
          </text>
        </svg>
        <div className="relative z-10 mt-0.5 text-center text-[7px] font-black tracking-widest uppercase" style={{ color: mc + "bb" }}>
          {engine.label}
        </div>
      </div>
    );
  };

  return (
    <Card className={cn("relative overflow-hidden rounded-2xl", cpBorder, "backdrop-blur-md")} data-testid="card-price"
      style={{ background: "linear-gradient(145deg,#06080f 0%,#0a0f1f 58%,#05070d 100%)", boxShadow: `0 0 34px ${callPutColor}20, inset 0 0 34px ${callPutColor}08` }}>
      {/* Scanline overlay — matching TacticalAdvicePanel */}
      <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.007) 3px,rgba(255,255,255,0.007) 4px)" }} />
      <div className="pointer-events-none absolute -top-8 -right-8 w-32 h-32 rounded-full" style={{ background: `radial-gradient(circle,${callPutColor}12 0%,transparent 70%)` }} />
      <div className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l border-t" style={{ borderColor: callPutColor + "66" }} />
      <div className="pointer-events-none absolute right-2 bottom-2 h-3 w-3 border-r border-b" style={{ borderColor: callPutColor + "40" }} />
      {/* Top bar matches signal direction */}
      <div className={cn("h-[2px] bg-gradient-to-r", cpTopBar)} />

      <CardContent className="p-0">
        <div className="relative p-2.5" style={{ background: `linear-gradient(165deg,${cpBg},rgba(3,6,14,0.95))` }}>
          <div className="pointer-events-none absolute inset-0 opacity-22" style={{ backgroundImage: `linear-gradient(rgba(${callPutSignal === "CALL" ? "16,185,129" : callPutSignal === "PUT" ? "239,68,68" : "245,158,11"},0.12) 1px,transparent 1px),linear-gradient(90deg,rgba(${callPutSignal === "CALL" ? "16,185,129" : callPutSignal === "PUT" ? "239,68,68" : "245,158,11"},0.10) 1px,transparent 1px)`, backgroundSize: "24px 24px" }} />
          <div className="pointer-events-none absolute left-1.5 top-1.5 h-3 w-3 border-l border-t" style={{ borderColor: callPutColor + "55" }} />
          <div className="pointer-events-none absolute right-1.5 bottom-1.5 h-3 w-3 border-r border-b" style={{ borderColor: callPutColor + "35" }} />

          <div className="grid grid-cols-1 xl:grid-cols-[auto_178px_auto] items-start gap-2">
            {/* Symbol + CALL/PUT badge */}
            <div className="xl:justify-self-start rounded-lg border px-2 py-1.5" style={{ borderColor: callPutColor + "30", background: callPutColor + "08" }}>
              <div className="flex items-center gap-2.5">
                <div className="p-1 rounded-lg border" style={{ backgroundColor: callPutColor + "20", borderColor: callPutColor + "35" }}>
                  <Activity className="w-3.5 h-3.5" style={{ color: callPutColor }} />
                </div>
                <div>
                  <p className="text-xl font-bold font-mono tracking-tight text-white/90" style={{ textShadow: `0 0 10px ${callPutColor}22` }} data-testid="text-symbol">{symbol}</p>
                  <p className="text-[9px] text-white/35 uppercase tracking-widest">Real-time · Live</p>
                </div>
              </div>
              {/* CALL / PUT badge */}
              <div className="mt-1.5 flex items-center gap-2">
                <div className="relative flex-1 rounded-md border px-2 py-1.5 text-center"
                  style={{ borderColor: callPutColor + "55", background: callPutColor + "12",
                    boxShadow: `0 0 16px ${callPutColor}28, inset 0 0 12px ${callPutColor}0a` }}>
                  {isSurging && (
                    <span className="absolute -top-1 -right-1 flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: surgeColor }} />
                      <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: surgeColor }} />
                    </span>
                  )}
                  <div className="text-[22px] font-black font-mono leading-none tracking-wider"
                    style={{ color: callPutColor, textShadow: `0 0 16px ${callPutColor}88` }}>
                    {callPutSignal}
                  </div>
                  <div className="flex items-center justify-center gap-1.5 mt-0.5">
                    <span className="text-[8px] font-black tracking-widest uppercase" style={{ color: callPutColor + "aa" }}>{cpStrength}</span>
                    <span className="text-[8px] font-mono" style={{ color: callPutColor + "66" }}>·</span>
                    <span className="text-[8px] font-mono" style={{ color: callPutColor + "88" }}>{callPutScore > 0 ? "+" : ""}{callPutScore}</span>
                    <span className="text-[8px] font-mono" style={{ color: callPutColor + "66" }}>·</span>
                    <span className="text-[8px] font-mono" style={{ color: callPutColor + "88" }}>T{dynamicThreshold}</span>
                    {unifiedConfidence != null && (
                      <>
                        <span className="text-[8px] font-mono" style={{ color: callPutColor + "66" }}>·</span>
                        <span className="text-[8px] font-mono" style={{ color: callPutColor + "88" }}>F{unifiedConfidence}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="relative overflow-hidden rounded-lg border px-2 py-1.5" style={{ borderColor: callPutColor + "55", background: callPutColor + "08", boxShadow: `inset 0 0 22px ${callPutColor}0f` }}>
              {/* ArcDial-style 260° gauge matching TacticalAdvicePanel */}
              {(() => {
                const v_ms = marketStrength * 100;
                const sz_ms = 92; const r_ms = 33; const outerR_ms = 41; const cx_ms = 46; const cy_ms = 46;
                const toR_ms = (d: number) => (d * Math.PI) / 180;
                const ap_ms = (s: number, e: number, ra: number) => {
                  const sr = toR_ms(s); const er = toR_ms(e);
                  return `M ${cx_ms + ra * Math.cos(sr)} ${cy_ms + ra * Math.sin(sr)} A ${ra} ${ra} 0 ${e - s > 180 ? 1 : 0} 1 ${cx_ms + ra * Math.cos(er)} ${cy_ms + ra * Math.sin(er)}`;
                };
                const fillEnd_ms = -220 + 260 * Math.min(1, v_ms / 100);
                const tipX_ms = cx_ms + r_ms * Math.cos(toR_ms(fillEnd_ms));
                const tipY_ms = cy_ms + r_ms * Math.sin(toR_ms(fillEnd_ms));
                const numT_ms = 9;
                const mTicks = Array.from({ length: numT_ms }, (_, i) => {
                  const deg = -220 + (260 / (numT_ms - 1)) * i;
                  const rad = toR_ms(deg);
                  return { x1: cx_ms + (outerR_ms - 4) * Math.cos(rad), y1: cy_ms + (outerR_ms - 4) * Math.sin(rad), x2: cx_ms + outerR_ms * Math.cos(rad), y2: cy_ms + outerR_ms * Math.sin(rad), active: deg <= fillEnd_ms };
                });
                const bs_ms = 8; const pb_ms = 2;
                const bkts_ms = [
                  `M ${bs_ms + pb_ms} ${pb_ms} L ${pb_ms} ${pb_ms} L ${pb_ms} ${bs_ms + pb_ms}`,
                  `M ${sz_ms - bs_ms - pb_ms} ${pb_ms} L ${sz_ms - pb_ms} ${pb_ms} L ${sz_ms - pb_ms} ${bs_ms + pb_ms}`,
                  `M ${bs_ms + pb_ms} ${sz_ms - pb_ms} L ${pb_ms} ${sz_ms - pb_ms} L ${pb_ms} ${sz_ms - bs_ms - pb_ms}`,
                  `M ${sz_ms - bs_ms - pb_ms} ${sz_ms - pb_ms} L ${sz_ms - pb_ms} ${sz_ms - pb_ms} L ${sz_ms - pb_ms} ${sz_ms - bs_ms - pb_ms}`,
                ];
                return (
                  <svg width={sz_ms} height={sz_ms} viewBox={`0 0 ${sz_ms} ${sz_ms}`} className="mx-auto">
                    {bkts_ms.map((d, i) => <path key={i} d={d} fill="none" stroke={neonMainColor + "55"} strokeWidth="1.2" strokeLinecap="square" />)}
                    <circle cx={cx_ms} cy={cy_ms} r={outerR_ms - 1} fill="none" stroke={neonMainColor + "18"} strokeWidth="0.5" />
                    {mTicks.map(({ x1, y1, x2, y2, active }, i) => (
                      <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke={active ? neonMainColor + "dd" : "rgba(255,255,255,0.08)"}
                        strokeWidth={i === 0 || i === numT_ms - 1 ? "1.5" : "0.8"} strokeLinecap="round" />
                    ))}
                    <path d={ap_ms(-220, 40, r_ms)} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" strokeLinecap="round" strokeDasharray="4 3" />
                    {v_ms > 0 && <path d={ap_ms(-220, fillEnd_ms, r_ms)} fill="none" stroke={neonMainColor} strokeWidth="9" strokeLinecap="round"
                      style={{ filter: `drop-shadow(0 0 10px ${neonMainColor}cc)`, opacity: 0.22 }} />}
                    {v_ms > 0 && <path d={ap_ms(-220, fillEnd_ms, r_ms)} fill="none" stroke={neonMainColor} strokeWidth="5.5" strokeLinecap="round"
                      style={{ filter: `drop-shadow(0 0 5px ${neonMainColor}aa)` }} />}
                    {v_ms > 2 && <circle cx={tipX_ms} cy={tipY_ms} r="3.5" fill={neonMainColor}
                      style={{ filter: `drop-shadow(0 0 5px ${neonMainColor}) drop-shadow(0 0 12px ${neonMainColor}88)` }} />}
                    <circle cx={cx_ms} cy={cy_ms} r={r_ms - 9} fill={neonMainColor + "08"} />
                    <circle cx={cx_ms} cy={cy_ms} r={r_ms - 9} fill="none" stroke={neonMainColor + "25"} strokeWidth="0.5" />
                    <text x={cx_ms} y={cy_ms - 3} textAnchor="middle" dominantBaseline="middle" fill={neonMainColor}
                      fontSize="17" fontWeight="900" fontFamily="monospace"
                      style={{ filter: `drop-shadow(0 0 8px ${neonMainColor}99)` }}>{Math.round(v_ms)}</text>
                    <text x={cx_ms} y={cy_ms + 11.5} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.32)"
                      fontSize="6" fontWeight="700" letterSpacing="1.5">
                      {v_ms >= 65 ? "BULL" : v_ms <= 35 ? "BEAR" : "NEUT"}
                    </text>
                  </svg>
                );
              })()}
              <div className={cn("mt-0.5 text-center text-[9px] uppercase tracking-wider font-black")} style={{ color: neonMainColor }}>Market Strength
              </div>
            </div>

            {/* Price + intraday change */}
            <div className="text-right xl:justify-self-end rounded-lg border px-2 py-1" style={{ borderColor: callPutColor + "28", background: callPutColor + "06" }}>
              <div className="flex items-baseline justify-end gap-1">
                <span className="text-muted-foreground text-sm">$</span>
                <p className="text-2xl font-mono font-black tracking-tight text-cyan-50 drop-shadow-[0_0_12px_rgba(56,189,248,0.2)]" data-testid="text-price">
                  {price.toFixed(2)}
                </p>
              </div>
              {change !== undefined && changePercent !== undefined && (
                <div className={cn("inline-flex items-center gap-1.5 px-2 py-1 rounded-lg",
                    isPositive ? "bg-emerald-500/15 border border-emerald-400/35" : "bg-red-500/15 border border-red-400/35")}
                  data-testid="text-price-change">
                  {isPositive ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" /> : <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
                  <span className={`text-[12px] font-mono font-bold ${isPositive ? "text-emerald-400" : "text-red-400"}`}>{isPositive ? "+" : ""}{change.toFixed(2)}</span>
                  <span className={`text-[12px] font-mono font-medium ${isPositive ? "text-emerald-400/80" : "text-red-400/80"}`}>({isPositive ? "+" : ""}{changePercent.toFixed(2)}%)</span>
                </div>
              )}
            </div>
          </div>

          <div
            className="relative mt-2 overflow-hidden rounded-2xl border p-2.5 backdrop-blur-md transition-all duration-300"
            style={{
              borderColor: callPutColor + "63",
              background: "linear-gradient(150deg,#07080d 0%,#0b0d18 58%,#05070d 100%)",
              boxShadow: `0 0 30px ${callPutColor}2a, inset 0 0 30px ${callPutColor}16`,
            }}
          >
            <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.007) 3px,rgba(255,255,255,0.007) 4px)" }} />
            <div className="pointer-events-none absolute inset-0 opacity-18" style={{ backgroundImage: `linear-gradient(${callPutColor}24 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,0.08) 1px,transparent 1px)`, backgroundSize: "22px 22px" }} />
            <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r", cpTopBar)} />
            <div className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l border-t" style={{ borderColor: callPutColor + "66" }} />
            <div className="pointer-events-none absolute right-2 bottom-2 h-3 w-3 border-r border-b" style={{ borderColor: callPutColor + "4d" }} />
            <div className="pointer-events-none absolute right-2 top-2 text-[8px] tracking-[0.18em] font-mono" style={{ color: callPutColor + "aa" }}>ENGINE HUD</div>

            <div
              className="relative z-20 mb-1 mt-0.5 flex items-center gap-2 rounded-xl border px-2 py-1"
              style={{
                borderColor: callPutColor + "52",
                background: `linear-gradient(135deg,${callPutColor}1c,rgba(2,6,23,0.88) 58%)`,
                boxShadow: `inset 0 0 18px ${callPutColor}1f, 0 0 20px ${callPutColor}26`,
              }}
            >
              <Flame className="w-4 h-4" style={{ color: callPutColor, filter: `drop-shadow(0 0 7px ${callPutColor})` }} />
              <span className="font-mono text-[13px] font-black tracking-[0.12em] uppercase" style={{ color: callPutColor, textShadow: `0 0 10px ${callPutColor}88` }}>
                SPY Engine Monitor
              </span>
              <span className="ml-auto text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-gradient-to-r border"
                style={{ borderColor: callPutColor + "45", backgroundColor: callPutColor + "18", color: callPutColor }}>
                {callPutSignal}
              </span>
              <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-cyan-400/40 text-cyan-200 bg-cyan-500/10">
                {cpStrength}
              </span>
              <span className="rounded-md px-1.5 py-0.5 font-mono font-black text-[9px] tracking-widest border"
                style={{ color: callPutColor, borderColor: callPutColor + "45", backgroundColor: callPutColor + "15", textShadow: `0 0 10px ${callPutColor}55` }}>
                {Math.round(marketStrength * 100)}%
              </span>
            </div>

            <div className="relative z-20 mb-1.5 grid grid-cols-1 xl:grid-cols-3 gap-1.5">
              <div className="rounded-lg border px-2 py-1" style={{ borderColor: fusionDirectionColor + "45", background: fusionDirectionColor + "10" }}>
                <div className="flex items-center justify-between text-[7px] font-bold tracking-[0.16em] uppercase" style={{ color: fusionDirectionColor + "cc" }}>
                  <span>Fusion</span>
                  <span>{unifiedState}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="text-[11px] font-black font-mono tracking-wider" style={{ color: fusionDirectionColor }}>
                    {unifiedDirection}
                  </span>
                  {unifiedConfidence != null && (
                    <span className="text-[9px] font-mono" style={{ color: fusionDirectionColor + "cc" }}>
                      {unifiedConfidence}%
                    </span>
                  )}
                  <span className="ml-auto rounded border px-1.5 py-0.5 text-[8px] font-black tracking-widest"
                    style={{ borderColor: setupGradeColor + "55", color: setupGradeColor, backgroundColor: setupGradeColor + "18" }}>
                    {unifiedSetupGrade}
                  </span>
                  {optionBQualified && (
                    <span className="rounded border px-1 py-0.5 text-[7px] font-black tracking-wider border-cyan-400/45 text-cyan-200 bg-cyan-500/14">
                      OPTION B
                    </span>
                  )}
                </div>
              </div>

              <div className="rounded-lg border px-2 py-1" style={{ borderColor: scannerQualityColor + "45", background: scannerQualityColor + "10" }}>
                <div className="flex items-center justify-between text-[7px] font-bold tracking-[0.16em] uppercase" style={{ color: scannerQualityColor + "cc" }}>
                  <span>Scanner</span>
                  <span>{scannerSignalType || "IDLE"}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="text-[11px] font-black font-mono" style={{ color: scannerQualityColor }}>
                    {scannerSignalQuality}
                  </span>
                  <span className="text-[8px] font-mono" style={{ color: scannerQualityColor + "cc" }}>
                    W{scannerCriticalWarningCount}
                  </span>
                  <span className="ml-auto text-[8px] font-mono" style={{ color: scannerQualityColor + "aa" }}>
                    {scannerScanAgeSec == null
                      ? "LIVE"
                      : scannerIsStale
                      ? `STALE ${scannerScanAgeSec}s`
                      : `${scannerScanAgeSec}s`}
                  </span>
                </div>
              </div>

              <div className="rounded-lg border px-2 py-1" style={{ borderColor: tvToneColor + "45", background: tvToneColor + "10" }}>
                <div className="flex items-center justify-between text-[7px] font-bold tracking-[0.16em] uppercase" style={{ color: tvToneColor + "cc" }}>
                  <span>TradingView</span>
                  <span>{tvConflictActive ? "CONFLICT" : "ALIGNED"}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5">
                  <span className="text-[11px] font-black font-mono" style={{ color: tvToneColor }}>
                    {tvTrendLabel}
                  </span>
                  <span className="text-[8px] font-mono" style={{ color: tvToneColor + "cc" }}>
                    ADX {tvAdx == null ? "--" : Math.round(tvAdx)}
                  </span>
                  <span className="ml-auto text-[8px] font-mono" style={{ color: tvToneColor + "cc" }}>
                    REC {tvRecommendAll == null ? "--" : tvRecommendAll.toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* ── EXPLOSION ALERT BANNER (compact, top of engine, when surging) ── */}
            {surgeHeat >= 0.45 && (
              <div className="relative mb-1.5 overflow-hidden rounded-lg border px-3 py-2"
                style={{ borderColor: surgeColor + (isSurging ? "99" : "55"), background: isSurging ? surgeColor + "15" : surgeColor + "08",
                  boxShadow: isSurging ? `0 0 22px ${surgeColor}45, inset 0 0 18px ${surgeColor}10` : "none" }}>
                {isSurging && <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.007) 3px,rgba(255,255,255,0.007) 4px)" }} />}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {isSurging && (
                      <span className="relative flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ backgroundColor: surgeColor }} />
                        <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: surgeColor }} />
                      </span>
                    )}
                    <span className="text-[9px] font-black tracking-[0.2em] uppercase" style={{ color: surgeColor }}>⚡ {isSurging ? "EXPLOSIVE MOVE" : "BUILDING"}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    {/* CALL/PUT prominent badge in surge banner */}
                    <div className="rounded border px-3 py-1" style={{ borderColor: callPutColor + "66", background: callPutColor + "18" }}>
                      <span className="text-[18px] font-black font-mono tracking-[0.12em]" style={{ color: callPutColor, textShadow: `0 0 12px ${callPutColor}99` }}>
                        {callPutSignal}
                      </span>
                    </div>
                    <span className="text-[9px] font-black px-2 py-1 rounded border" style={{ color: surgeColor, borderColor: surgeColor + "45", background: surgeColor + "12" }}>
                      {surgeLabel}
                    </span>
                  </div>
                </div>
                {/* Surge heat mini-bar */}
                <div className="mt-1.5 flex gap-[1.5px] h-[5px]">
                  {Array.from({ length: 16 }).map((_, i) => {
                    const active = i < Math.round(surgeHeat * 16);
                    return <div key={i} className="flex-1 h-full rounded-[1px]"
                      style={{ backgroundColor: active ? (i < 7 ? "#22d3ee" : i < 11 ? "#f59e0b" : "#f43f5e") + "ee" : "rgba(255,255,255,0.04)" }} />;
                  })}
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <div className={cn(
                "relative overflow-hidden rounded-xl border p-1.5",
                sectorPulseBias === "bullish"
                  ? "border-emerald-400/45 bg-[linear-gradient(120deg,rgba(6,28,24,0.78),rgba(3,16,18,0.5))] shadow-[0_0_22px_rgba(16,185,129,0.22)]"
                  : sectorPulseBias === "bearish"
                  ? "border-red-400/45 bg-[linear-gradient(120deg,rgba(34,6,6,0.78),rgba(18,4,4,0.56))] shadow-[0_0_22px_rgba(239,68,68,0.2)]"
                  : "border-cyan-300/45 bg-[linear-gradient(120deg,rgba(8,20,34,0.78),rgba(6,12,20,0.6))] shadow-[0_0_22px_rgba(56,189,248,0.18)]",
              )}>
                <div className="pointer-events-none absolute inset-0 opacity-12" style={{ backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.007) 3px,rgba(255,255,255,0.007) 4px)" }} />
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
                <div className={cn("mb-1 flex items-center justify-between text-[8px] uppercase tracking-wider", sectorPulseBias === "bullish" ? "text-emerald-300/85" : sectorPulseBias === "bearish" ? "text-red-300/85" : "text-cyan-300/85")}>
                  <span>SPY Sectors · Live Pulse</span>
                  <div className="flex items-center gap-1">
                    <span className={cn(
                      "rounded border px-1.5 py-0.5 text-[7px] font-mono font-black tracking-[0.08em]",
                      sectorPulseBias === "bullish"
                        ? "border-emerald-400/40 bg-emerald-500/18 text-emerald-300"
                        : sectorPulseBias === "bearish"
                        ? "border-red-400/40 bg-red-500/18 text-red-300"
                        : "border-cyan-400/40 bg-cyan-500/18 text-cyan-300",
                    )}>
                      {hasLiveSectorFeed ? sectorPulseBias.toUpperCase() : "NO DATA"}
                    </span>
                    <span className="rounded border border-cyan-400/35 bg-cyan-500/10 px-1.5 py-0.5 text-[7px] font-mono font-black tracking-[0.08em] text-cyan-200">
                      LIVE {liveSectorCount}/{totalSectorCount}
                    </span>
                  </div>
                </div>

                <div className="relative z-10 space-y-1.5">
                  <div className="grid grid-cols-1 xl:grid-cols-[88px_auto_88px] gap-1.5 items-center">
                    <div className="flex flex-col items-center gap-1.5">{leftEngineStack.map(renderMiniGauge)}</div>

                    <div className="flex justify-center">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 items-stretch">
                        {(() => {
                          const toRsp = (d: number) => d * Math.PI / 180;
                          const arsp = (s: number, e: number, r: number) => {
                            const sr = toRsp(s); const er = toRsp(e);
                            return `M ${76 + r * Math.cos(sr)} ${68 + r * Math.sin(sr)} A ${r} ${r} 0 ${(e - s) > 180 ? 1 : 0} 1 ${76 + r * Math.cos(er)} ${68 + r * Math.sin(er)}`;
                          };
                          const hasSpData = sectorCompositeLive != null;
                          const spVal = sectorCompositeLive ?? 0;
                          const spFE = -220 + 260 * Math.min(1, spVal);
                          const spTX = 76 + 46 * Math.cos(toRsp(spFE));
                          const spTY = 68 + 46 * Math.sin(toRsp(spFE));
                          const spTicks = Array.from({ length: 9 }, (_, i) => {
                            const deg = -220 + (260 / 8) * i;
                            const rad = toRsp(deg);
                            return {
                              x1: 76 + 52 * Math.cos(rad),
                              y1: 68 + 52 * Math.sin(rad),
                              x2: 76 + 57 * Math.cos(rad),
                              y2: 68 + 57 * Math.sin(rad),
                              active: hasSpData && deg <= spFE,
                            };
                          });
                          const spBkts = [`M 10 3 L 3 3 L 3 10`, `M 142 3 L 149 3 L 149 10`, `M 10 107 L 3 107 L 3 100`, `M 142 107 L 149 107 L 149 100`];
                          return (
                            <div className="relative overflow-hidden rounded-lg px-2 py-1"
                              style={{
                                border: `1px solid ${sectorPulseColor}56`,
                                background: meterPanelBaseBg,
                                boxShadow: `inset 0 0 22px ${callPutColor}14, inset 0 0 18px ${sectorPulseColor}12, 0 0 24px ${sectorPulseColor}22`,
                              }}>
                              <div className="pointer-events-none absolute inset-0 opacity-10" style={{ backgroundImage: meterPanelScanline }} />
                              <div className="pointer-events-none absolute left-1.5 top-1.5 h-2.5 w-2.5 border-l border-t" style={{ borderColor: callPutColor + "58" }} />
                              <div className="pointer-events-none absolute right-1.5 bottom-1.5 h-2.5 w-2.5 border-r border-b" style={{ borderColor: callPutColor + "3a" }} />
                              <div className="pointer-events-none absolute inset-x-2 top-1 h-px" style={{ background: `linear-gradient(90deg,transparent,${sectorPulseColor}55,transparent)` }} />
                              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[32%]" style={{ background: `linear-gradient(0deg,${sectorPulseColor}07,transparent)` }} />
                              <div className="mb-0.5 text-center text-[8px] font-mono uppercase tracking-[0.18em]" style={{ color: sectorPulseColor + "99" }}>Sector Pulse</div>
                              <svg width="146" height="106" viewBox="0 0 152 110" className="mx-auto">
                                {spBkts.map((d, i) => <path key={i} d={d} fill="none" stroke={sectorPulseColor + "50"} strokeWidth="1.3" strokeLinecap="square" />)}
                                <circle cx="76" cy="68" r="56" fill="none" stroke={sectorPulseColor + "10"} strokeWidth="0.6" />
                                {spTicks.map(({ x1, y1, x2, y2, active }, ti) => (
                                  <line key={ti} x1={x1} y1={y1} x2={x2} y2={y2}
                                    stroke={active ? sectorPulseColor + "dd" : "rgba(255,255,255,0.08)"}
                                    strokeWidth={ti === 0 || ti === 8 ? "1.6" : "0.9"} strokeLinecap="round" />
                                ))}
                                <path d={arsp(-220, 40, 46)} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" strokeLinecap="round" strokeDasharray="4 3" />
                                {hasSpData && spVal > 0 && <>
                                  <path d={arsp(-220, spFE, 46)} fill="none" stroke={sectorPulseColor} strokeWidth="11" strokeLinecap="round" opacity={0.22} style={{ filter: `drop-shadow(0 0 14px ${sectorPulseColor}cc)` }} />
                                  <path d={arsp(-220, spFE, 46)} fill="none" stroke={sectorPulseColor} strokeWidth="5.5" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${sectorPulseColor}aa)` }} />
                                </>}
                                {hasSpData && spVal > 0.02 && <circle cx={spTX} cy={spTY} r="4.5" fill={sectorPulseColor} style={{ filter: `drop-shadow(0 0 7px ${sectorPulseColor}) drop-shadow(0 0 16px ${sectorPulseColor}88)` }} />}
                                <circle cx="76" cy="68" r="37" fill={sectorPulseColor + "07"} />
                                <circle cx="76" cy="68" r="37" fill="none" stroke={sectorPulseColor + "22"} strokeWidth="0.6" />
                                <text x="76" y="63" textAnchor="middle" dominantBaseline="middle" fill={sectorPulseColor}
                                  fontSize="21" fontWeight="900" fontFamily="monospace" style={{ filter: `drop-shadow(0 0 10px ${sectorPulseColor}99)` }}>
                                  {sectorPulsePct == null ? "--" : sectorPulsePct}
                                </text>
                                <text x="76" y="76" textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.28)"
                                  fontSize="7.8" fontWeight="700" letterSpacing="1.5">
                                  {hasSpData
                                    ? sectorPulseBias === "bullish"
                                      ? "BULL"
                                      : sectorPulseBias === "bearish"
                                      ? "BEAR"
                                      : "NEUT"
                                    : "NO DATA"}
                                </text>
                              </svg>
                            </div>
                          );
                        })()}

                        {(() => {
                          const toRpa = (d: number) => d * Math.PI / 180;
                          const arpa = (s: number, e: number, r: number) => {
                            const sr = toRpa(s); const er = toRpa(e);
                            return `M ${76 + r * Math.cos(sr)} ${68 + r * Math.sin(sr)} A ${r} ${r} 0 ${(e - s) > 180 ? 1 : 0} 1 ${76 + r * Math.cos(er)} ${68 + r * Math.sin(er)}`;
                          };
                          const paVal = priceActionMagnitude / 100;
                          const paFE = -220 + 260 * Math.min(1, paVal);
                          const paTX = 76 + 46 * Math.cos(toRpa(paFE));
                          const paTY = 68 + 46 * Math.sin(toRpa(paFE));
                          const paTicks = Array.from({ length: 9 }, (_, i) => {
                            const deg = -220 + (260 / 8) * i;
                            const rad = toRpa(deg);
                            return { x1: 76 + 52 * Math.cos(rad), y1: 68 + 52 * Math.sin(rad), x2: 76 + 57 * Math.cos(rad), y2: 68 + 57 * Math.sin(rad), active: deg <= paFE };
                          });
                          const paBkts = [`M 10 3 L 3 3 L 3 10`, `M 142 3 L 149 3 L 149 10`, `M 10 107 L 3 107 L 3 100`, `M 142 107 L 149 107 L 149 100`];
                          const paNum = priceActionBias === "buy" ? `+${priceActionMagnitude}` : priceActionBias === "sell" ? `-${priceActionMagnitude}` : "0";
                          const paDir = priceActionBias === "buy" ? "BUY" : priceActionBias === "sell" ? "SELL" : "NEUT";
                          return (
                            <div className="relative overflow-hidden rounded-lg px-2 py-1"
                              style={{
                                border: `1px solid ${priceActionColor}56`,
                                background: meterPanelBaseBg,
                                boxShadow: `inset 0 0 22px ${callPutColor}14, inset 0 0 18px ${priceActionColor}12, 0 0 24px ${priceActionColor}22`,
                              }}>
                              <div className="pointer-events-none absolute inset-0 opacity-10" style={{ backgroundImage: meterPanelScanline }} />
                              <div className="pointer-events-none absolute left-1.5 top-1.5 h-2.5 w-2.5 border-l border-t" style={{ borderColor: callPutColor + "58" }} />
                              <div className="pointer-events-none absolute right-1.5 bottom-1.5 h-2.5 w-2.5 border-r border-b" style={{ borderColor: callPutColor + "3a" }} />
                              <div className="pointer-events-none absolute inset-x-2 top-1 h-px" style={{ background: `linear-gradient(90deg,transparent,${priceActionColor}55,transparent)` }} />
                              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[32%]" style={{ background: `linear-gradient(0deg,${priceActionColor}07,transparent)` }} />
                              <div className="mb-0.5 text-center text-[8px] font-mono uppercase tracking-[0.18em]" style={{ color: priceActionColor + "99" }}>Price Action</div>
                              <svg width="146" height="106" viewBox="0 0 152 110" className="mx-auto">
                                {paBkts.map((d, i) => <path key={i} d={d} fill="none" stroke={priceActionColor + "50"} strokeWidth="1.3" strokeLinecap="square" />)}
                                <circle cx="76" cy="68" r="56" fill="none" stroke={priceActionColor + "10"} strokeWidth="0.6" />
                                {paTicks.map(({ x1, y1, x2, y2, active }, ti) => (
                                  <line key={ti} x1={x1} y1={y1} x2={x2} y2={y2}
                                    stroke={active ? priceActionColor + "dd" : "rgba(255,255,255,0.08)"}
                                    strokeWidth={ti === 0 || ti === 8 ? "1.6" : "0.9"} strokeLinecap="round" />
                                ))}
                                <path d={arpa(-220, 40, 46)} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" strokeLinecap="round" strokeDasharray="4 3" />
                                {paVal > 0 && <>
                                  <path d={arpa(-220, paFE, 46)} fill="none" stroke={priceActionColor} strokeWidth="11" strokeLinecap="round" opacity={0.22} style={{ filter: `drop-shadow(0 0 14px ${priceActionColor}cc)` }} />
                                  <path d={arpa(-220, paFE, 46)} fill="none" stroke={priceActionColor} strokeWidth="5.5" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${priceActionColor}aa)` }} />
                                </>}
                                {paVal > 0.02 && <circle cx={paTX} cy={paTY} r="4.5" fill={priceActionColor} style={{ filter: `drop-shadow(0 0 7px ${priceActionColor}) drop-shadow(0 0 16px ${priceActionColor}88)` }} />}
                                <circle cx="76" cy="68" r="37" fill={priceActionColor + "07"} />
                                <circle cx="76" cy="68" r="37" fill="none" stroke={priceActionColor + "22"} strokeWidth="0.6" />
                                <text x="76" y="63" textAnchor="middle" dominantBaseline="middle" fill={priceActionColor}
                                  fontSize="21" fontWeight="900" fontFamily="monospace" style={{ filter: `drop-shadow(0 0 10px ${priceActionColor}99)` }}>
                                  {paNum}
                                </text>
                                <text x="76" y="76" textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.28)"
                                  fontSize="7.8" fontWeight="700" letterSpacing="1.5">
                                  {paDir}
                                </text>
                              </svg>
                            </div>
                          );
                        })()}

                        {(() => {
                          const toRsg = (d: number) => d * Math.PI / 180;
                          const arsg = (s: number, e: number, r: number) => {
                            const sr = toRsg(s); const er = toRsg(e);
                            return `M ${76 + r * Math.cos(sr)} ${68 + r * Math.sin(sr)} A ${r} ${r} 0 ${(e - s) > 180 ? 1 : 0} 1 ${76 + r * Math.cos(er)} ${68 + r * Math.sin(er)}`;
                          };
                          const sgVal = slopeGeometryMagnitude / 100;
                          const sgFE = -220 + 260 * Math.min(1, sgVal);
                          const sgTX = 76 + 46 * Math.cos(toRsg(sgFE));
                          const sgTY = 68 + 46 * Math.sin(toRsg(sgFE));
                          const sgTicks = Array.from({ length: 9 }, (_, i) => {
                            const deg = -220 + (260 / 8) * i;
                            const rad = toRsg(deg);
                            return { x1: 76 + 52 * Math.cos(rad), y1: 68 + 52 * Math.sin(rad), x2: 76 + 57 * Math.cos(rad), y2: 68 + 57 * Math.sin(rad), active: deg <= sgFE };
                          });
                          const sgBkts = [`M 10 3 L 3 3 L 3 10`, `M 142 3 L 149 3 L 149 10`, `M 10 107 L 3 107 L 3 100`, `M 142 107 L 149 107 L 149 100`];
                          const sgDir = slopeBias === "up" ? "UP" : slopeBias === "down" ? "DOWN" : "FLAT";
                          return (
                            <div className="relative overflow-hidden rounded-lg px-2 py-1"
                              style={{
                                border: `1px solid ${slopeColor}56`,
                                background: meterPanelBaseBg,
                                boxShadow: `inset 0 0 22px ${callPutColor}14, inset 0 0 18px ${slopeColor}12, 0 0 24px ${slopeColor}22`,
                              }}>
                              <div className="pointer-events-none absolute inset-0 opacity-10" style={{ backgroundImage: meterPanelScanline }} />
                              <div className="pointer-events-none absolute left-1.5 top-1.5 h-2.5 w-2.5 border-l border-t" style={{ borderColor: callPutColor + "58" }} />
                              <div className="pointer-events-none absolute right-1.5 bottom-1.5 h-2.5 w-2.5 border-r border-b" style={{ borderColor: callPutColor + "3a" }} />
                              <div className="pointer-events-none absolute inset-x-2 top-1 h-px" style={{ background: `linear-gradient(90deg,transparent,${slopeColor}55,transparent)` }} />
                              <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-[32%]" style={{ background: `linear-gradient(0deg,${slopeColor}07,transparent)` }} />
                              <div className="mb-0.5 flex items-center justify-between text-[8px] font-mono uppercase tracking-[0.14em]">
                                <span style={{ color: slopeColor + "99" }}>Slope Geo</span>
                                <span className="font-black rounded border px-1 py-0.5 text-[9px]" style={{ color: slopeColor, borderColor: slopeColor + "40", backgroundColor: slopeColor + "15" }}>
                                  {slopeAngle > 0 ? "+" : ""}{slopeAngle}°
                                </span>
                              </div>
                              <svg width="146" height="106" viewBox="0 0 152 110" className="mx-auto">
                                {sgBkts.map((d, i) => <path key={i} d={d} fill="none" stroke={slopeColor + "50"} strokeWidth="1.3" strokeLinecap="square" />)}
                                <circle cx="76" cy="68" r="56" fill="none" stroke={slopeColor + "10"} strokeWidth="0.6" />
                                {sgTicks.map(({ x1, y1, x2, y2, active }, ti) => (
                                  <line key={ti} x1={x1} y1={y1} x2={x2} y2={y2}
                                    stroke={active ? slopeColor + "dd" : "rgba(255,255,255,0.08)"}
                                    strokeWidth={ti === 0 || ti === 8 ? "1.6" : "0.9"} strokeLinecap="round" />
                                ))}
                                <path d={arsg(-220, 40, 46)} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" strokeLinecap="round" strokeDasharray="4 3" />
                                {sgVal > 0 && <>
                                  <path d={arsg(-220, sgFE, 46)} fill="none" stroke={slopeColor} strokeWidth="11" strokeLinecap="round" opacity={0.22} style={{ filter: `drop-shadow(0 0 14px ${slopeColor}cc)` }} />
                                  <path d={arsg(-220, sgFE, 46)} fill="none" stroke={slopeColor} strokeWidth="5.5" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 6px ${slopeColor}aa)` }} />
                                </>}
                                {sgVal > 0.02 && <circle cx={sgTX} cy={sgTY} r="4.5" fill={slopeColor} style={{ filter: `drop-shadow(0 0 7px ${slopeColor}) drop-shadow(0 0 16px ${slopeColor}88)` }} />}
                                <circle cx="76" cy="68" r="37" fill={slopeColor + "07"} />
                                <circle cx="76" cy="68" r="37" fill="none" stroke={slopeColor + "22"} strokeWidth="0.6" />
                                <text x="76" y="63" textAnchor="middle" dominantBaseline="middle" fill={slopeColor}
                                  fontSize="21" fontWeight="900" fontFamily="monospace" style={{ filter: `drop-shadow(0 0 10px ${slopeColor}99)` }}>
                                  {slopeGeometryMagnitude}%
                                </text>
                                <text x="76" y="76" textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.28)"
                                  fontSize="7.8" fontWeight="700" letterSpacing="1.5">
                                  {sgDir}
                                </text>
                              </svg>
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="flex flex-col items-center gap-1.5">{rightEngineStack.map(renderMiniGauge)}</div>
                  </div>

                  {/* ── SECTOR BREADTH BAR ── */}
                  {liveSectorCount > 0 && (
                    <div className="flex items-center gap-2 px-1">
                      <div className="flex flex-col items-center" style={{ minWidth: 26 }}>
                        <span className="text-[17px] font-black font-mono leading-none" style={{ color: "#ef4444", textShadow: "0 0 12px #ef444440" }}>{bearishSectorCount}</span>
                        <span className="text-[5.5px] tracking-[0.16em] uppercase" style={{ color: "#ef444455" }}>BEAR</span>
                      </div>
                      <div className="flex-1 space-y-0.5">
                        <div className="flex gap-[2px] h-[6px]">
                          {Array.from({ length: liveSectorCount }).map((_, i) => {
                            const st = i < bearishSectorCount ? "bear" : i >= liveSectorCount - bullishSectorCount ? "bull" : "neut";
                            return (
                              <div key={i} className="flex-1 rounded-[1px]"
                                style={{
                                  backgroundColor: st === "bear" ? "#ef444470" : st === "bull" ? "#10b98165" : "rgba(255,255,255,0.05)",
                                  boxShadow: (st === "bear" && i === bearishSectorCount - 1) ? "0 0 5px #ef4444" : (st === "bull" && i === liveSectorCount - bullishSectorCount) ? "0 0 5px #10b981" : "none",
                                }} />
                            );
                          })}
                        </div>
                        <div className="flex justify-between text-[6px] font-mono">
                          <span style={{ color: "#ef444460" }}>{Math.round(bearishSectorCount / liveSectorCount * 100)}% BEAR</span>
                          <span className="text-white/14">BREADTH</span>
                          <span style={{ color: "#10b98160" }}>BULL {Math.round(bullishSectorCount / liveSectorCount * 100)}%</span>
                        </div>
                      </div>
                      <div className="flex flex-col items-center" style={{ minWidth: 26 }}>
                        <span className="text-[17px] font-black font-mono leading-none" style={{ color: "#10b981", textShadow: "0 0 12px #10b98140" }}>{bullishSectorCount}</span>
                        <span className="text-[5.5px] tracking-[0.16em] uppercase" style={{ color: "#10b98155" }}>BULL</span>
                      </div>
                    </div>
                  )}

                  {/* ── EXPLOSION DETECTOR ── */}
                  <div className="relative overflow-hidden rounded-xl border px-3 py-2"
                    style={{
                      borderColor: surgeColor + "4d",
                      background: `linear-gradient(150deg,${surgeColor}16,rgba(4,9,18,0.96) 58%,rgba(3,7,14,0.97) 100%)`,
                      boxShadow: surgeHeat >= surgeThreshold
                        ? `0 0 22px ${surgeColor}40, inset 0 0 16px ${callPutColor}14, inset 0 0 14px ${surgeColor}12`
                        : `inset 0 0 14px ${callPutColor}12`,
                    }}>
                    <div className="pointer-events-none absolute inset-0 opacity-10" style={{ backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.007) 3px,rgba(255,255,255,0.007) 4px)" }} />
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg,transparent,${surgeColor}55,transparent)` }} />
                    <div className="pointer-events-none absolute left-1.5 top-1.5 h-2.5 w-2.5 border-l border-t" style={{ borderColor: callPutColor + "58" }} />
                    <div className="pointer-events-none absolute right-1.5 bottom-1.5 h-2.5 w-2.5 border-r border-b" style={{ borderColor: callPutColor + "3a" }} />
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[8px] font-black tracking-[0.2em] uppercase" style={{ color: surgeColor }}>
                        ⚡ Explosion Detector
                      </span>
                      <span className="rounded border px-1.5 py-0.5 text-[9px] font-black font-mono tracking-widest"
                        style={{ borderColor: surgeColor + "55", backgroundColor: surgeColor + "12", color: surgeColor,
                          textShadow: surgeHeat >= 0.45 ? `0 0 8px ${surgeColor}88` : "none" }}>
                        {surgeLabel}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-2">
                      {[
                        {
                          label: "Trigger Stack",
                          value: triggerPulse,
                          desc:
                            scannerDirectionalBreakout
                              ? `${scannerSignalType} stack armed`
                              : scannerMomentumBreakout
                              ? "Momentum trigger armed"
                              : normalizedMove >= 0.45
                              ? "Range expansion rising"
                              : "Awaiting trigger",
                        },
                        {
                          label: "Participation",
                          value: participationPulse,
                          desc:
                            !hasLiveSectorFeed
                              ? "Awaiting live sectors"
                              : participationPulse >= 0.68
                              ? "Breadth and sectors expanding"
                              : "Participation mixed",
                        },
                        {
                          label: "Confirmation",
                          value: confirmationPulse,
                          desc:
                            confirmationPulse >= 0.68
                              ? "Scanner/Fusion/TV aligned"
                              : tvConflictActive
                              ? "Trend conflict in stack"
                              : `Fusion ${unifiedState.toLowerCase()}`,
                        },
                        {
                          label: "Risk Drag",
                          value: explosionPenalty,
                          desc:
                            explosionPenalty >= 0.55
                              ? "Warnings constraining release"
                              : explosionPenalty >= 0.3
                              ? "Minor drag active"
                              : "Low drag",
                        },
                      ].map(({ label, value, desc }) => {
                        const metricValue = value ?? 0;
                        const barColor = metricValue >= 0.7 ? "#f43f5e" : metricValue >= 0.45 ? "#f59e0b" : "#22d3ee";
                        const segs = 16;
                        const filled = Math.round(metricValue * segs);
                        return (
                          <div
                            key={label}
                            className="relative space-y-1 overflow-hidden rounded-md border px-1.5 py-1"
                            style={{
                              borderColor: barColor + "45",
                              background: `linear-gradient(145deg,${callPutColor}16,rgba(2,8,18,0.9))`,
                              boxShadow: `inset 0 0 12px ${barColor}16`,
                            }}
                          >
                            <div className="pointer-events-none absolute inset-0 opacity-[0.09]" style={{ backgroundImage: meterPanelScanline }} />
                            <div className="pointer-events-none absolute inset-x-1.5 top-0.5 h-px" style={{ background: `linear-gradient(90deg,transparent,${barColor}55,transparent)` }} />
                            <div className="relative z-10 flex justify-between text-[7px] font-bold uppercase tracking-wider">
                              <span className="text-white/35">{label}</span>
                              <span style={{ color: barColor }}>{value == null ? "--" : Math.round(metricValue * 100)}</span>
                            </div>
                            <div className="relative z-10 flex gap-[1.5px] h-[8px]">
                              {Array.from({ length: segs }).map((_, i) => {
                                const active = i < filled;
                                const isLast = active && i === filled - 1;
                                const sc = i < 5 ? "#22d3ee" : i < 9 ? "#f59e0b" : "#f43f5e";
                                return (
                                  <div key={i} className="flex-1 h-full rounded-[1.5px]"
                                    style={{
                                      backgroundColor: active ? sc + "ee" : "rgba(255,255,255,0.04)",
                                      boxShadow: isLast ? `0 0 6px ${barColor}, 0 0 12px ${barColor}44` : "none",
                                    }} />
                                );
                              })}
                            </div>
                            <div className="relative z-10 min-h-[20px] text-[7px] leading-tight text-white/22" style={{ color: barColor + "aa" }}>{desc}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {(decisionIntelText || scannerWarningText) && (
                    <div
                      className="relative overflow-hidden rounded-xl border px-2.5 py-1.5"
                      style={{
                        borderColor: callPutColor + "45",
                        background: `linear-gradient(135deg,${callPutColor}12,rgba(2,8,20,0.82))`,
                        boxShadow: `inset 0 0 16px ${callPutColor}18`,
                      }}
                    >
                      <div className="mb-1 flex items-center gap-1.5 text-[7px] font-black tracking-[0.18em] uppercase" style={{ color: callPutColor + "bb" }}>
                        <Shield className="w-3 h-3" />
                        Decision Feed
                        {unifiedGatingScore != null && (
                          <span className="ml-auto text-[8px] font-mono" style={{ color: callPutColor + "bb" }}>
                            GATE {unifiedGatingScore}%
                          </span>
                        )}
                      </div>
                      {decisionIntelText && (
                        <div className="text-[8px] leading-snug" style={{ color: callPutColor + "cc" }}>
                          {decisionIntelText}
                        </div>
                      )}
                      {scannerWarningText && (
                        <div className="mt-0.5 text-[7px] font-mono text-rose-200/75">
                          WARN: {scannerWarningText}
                        </div>
                      )}
                    </div>
                  )}


                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function BreakoutAlertBar({
  drawablePatterns,
}: {
  drawablePatterns?: DrawablePattern[];
  marketHealth?: any;
}) {
  const cardHoldRef = useRef<Map<string, { until: number; direction: 'bullish' | 'bearish' | 'neutral' }>>(new Map());
  const lastVisibleSymbolsRef = useRef<Set<string>>(new Set());
  const directionLockRef = useRef<Map<string, { until: number; direction: 'bullish' | 'bearish' | 'neutral' }>>(new Map());

  const { data: results } = useQuery<ScannerResult[]>({
    queryKey: ["/api/scanner/results"],
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const { data: thresholdConfig } = useQuery<BreakoutThresholdConfig>({
    queryKey: ["/api/scanner/breakout-thresholds"],
    refetchInterval: 15 * 60 * 1000,
    staleTime: 5 * 60 * 1000,
  });

  const { data: breakoutLog } = useQuery<BreakoutLogResponse>({
    queryKey: ["/api/scanner/breakout-log?hours=24&limit=1500"],
    refetchInterval: 60 * 1000,
    staleTime: 30 * 1000,
  });

  const symbolLogStats = (() => {
    const entries = Array.isArray(breakoutLog?.entries) ? breakoutLog.entries : [];
    const map = new Map<string, SymbolLogStats>();

    for (const row of entries) {
      const symbol = String(row.symbol ?? '').trim().toUpperCase();
      if (!symbol) continue;

      let stats = map.get(symbol);
      if (!stats) {
        stats = { total: 0, completed: 0, wins: 0, losses: 0 };
        map.set(symbol, stats);
      }

      stats.total += 1;

      const outcome = String(row.outcome ?? '').toLowerCase();
      if (outcome && outcome !== 'pending' && outcome !== 'open') {
        stats.completed += 1;
        if (outcome.startsWith('win')) stats.wins += 1;
        else if (outcome === 'loss') stats.losses += 1;
      }

      const rowTs = toFiniteNumber(row.timestamp) ?? 0;
      const latestTs = toFiniteNumber(stats.latest?.timestamp) ?? -1;
      if (rowTs >= latestTs) stats.latest = row;

      const direction = String(row.direction ?? '').toLowerCase();
      if (direction === 'bullish') {
        const latestBullishTs = toFiniteNumber(stats.latestBullish?.timestamp) ?? -1;
        if (rowTs >= latestBullishTs) stats.latestBullish = row;
      } else if (direction === 'bearish') {
        const latestBearishTs = toFiniteNumber(stats.latestBearish?.timestamp) ?? -1;
        if (rowTs >= latestBearishTs) stats.latestBearish = row;
      }
    }

    return map;
  })();

  type AlertTuning = {
    mode: AlertMode;
    optionScoreMin: number;
    optionOiMin: number;
    hardVolMin: number;
    hardMomentumMin: number;
    softVolMin: number;
    softMomentumMin: number;
    rrMin: number;
  };

  const tuning: AlertTuning = (() => {
    const universe = results || [];
    const total = universe.length;
    if (total === 0) {
      return {
        mode: 'BALANCED',
        optionScoreMin: 55,
        optionOiMin: 150,
        hardVolMin: 1.15,
        hardMomentumMin: 18,
        softVolMin: 1.4,
        softMomentumMin: 24,
        rrMin: 1.2,
      };
    }

    const breakoutLike = universe.filter((r) =>
      r.breakoutSignal === 'BREAKOUT' ||
      r.breakoutSignal === 'BREAKDOWN' ||
      r.breakoutSignal === 'EXPANSION'
    ).length;

    const momentumActive = universe.filter((r) => Math.abs(r.momentumStrength ?? 0) >= 26).length;
    const breadth = breakoutLike / total;
    const momentumBreadth = momentumActive / total;

    if (breadth >= 0.35 || momentumBreadth >= 0.55) {
      return {
        mode: 'TREND',
        optionScoreMin: 50,
        optionOiMin: 100,
        hardVolMin: 1.05,
        hardMomentumMin: 14,
        softVolMin: 1.25,
        softMomentumMin: 20,
        rrMin: 1.05,
      };
    }

    if (breadth <= 0.12 && momentumBreadth <= 0.28) {
      return {
        mode: 'CHOPPY',
        optionScoreMin: 60,
        optionOiMin: 220,
        hardVolMin: 1.25,
        hardMomentumMin: 22,
        softVolMin: 1.55,
        softMomentumMin: 30,
        rrMin: 1.35,
      };
    }

    return {
      mode: 'BALANCED',
      optionScoreMin: 55,
      optionOiMin: 150,
      hardVolMin: 1.15,
      hardMomentumMin: 18,
      softVolMin: 1.4,
      softMomentumMin: 24,
      rrMin: 1.2,
    };
  })();

  const marketPushMode = (() => {
    const universe = results || [];
    if (universe.length === 0) return false;

    const majorSymbols = new Set(['SPY', 'QQQ', 'IWM', 'DIA']);
    const majors = universe.filter((r) => majorSymbols.has(String(r.symbol || '').toUpperCase()));
    const sample = majors.length > 0 ? majors : universe;
    const sampleSize = Math.max(1, sample.length);

    const strongDayMoveCount = sample.filter((r) => Math.abs(r.priceChangePercent ?? 0) >= 0.8).length;
    const strongMomentumCount = sample.filter((r) => Math.abs(r.momentumStrength ?? 0) >= 18).length;
    const expansionLikeCount = sample.filter((r) => {
      const signal = String(r.breakoutSignal || '').toUpperCase();
      return signal === 'BREAKOUT' || signal === 'BREAKDOWN' || signal === 'EXPANSION' || signal === 'MOMENTUM';
    }).length;

    const momentumBreadth = strongMomentumCount / sampleSize;
    const expansionBreadth = expansionLikeCount / sampleSize;

    return strongDayMoveCount >= 1 && (momentumBreadth >= 0.4 || expansionBreadth >= 0.35);
  })();

  const getSetupStage = (alert: ScannerResult): 'READY' | 'SETUP DEVELOPING' => {
    const signal = alert.breakoutSignal;
    const momentumAbs = Math.abs(alert.momentumStrength ?? 0);
    const volumeSpike = alert.volumeSpike ?? 1;
    const phase = String(alert.compression?.phase || '').toUpperCase();
    const setupScore = alert.preBreakoutSetup?.score ?? 0;
    const etaMinutes = alert.preBreakoutSetup?.etaMinutes;
    const setupTraits = alert.preBreakoutSetup?.traits ?? [];
    const hasRepeatPattern =
      setupTraits.includes('REPEAT_PATTERN_3W') ||
      setupTraits.includes('REPEAT_PATTERN_MATCH');
    const isTvDerivedFallback = (alert.warnings ?? []).includes('TV_DERIVED_NO_OHLC');
    const setupSignal = signal === 'BUILDING' || signal === 'SQUEEZE' || signal === 'CONSOLIDATING';
    const softSignal = signal === 'EXPANSION' || signal === 'MOMENTUM';

    const imminentLeadSetup =
      etaMinutes != null &&
      etaMinutes <= 5 &&
      (signal === 'BUILDING' || signal === 'SQUEEZE' || signal === 'CONSOLIDATING');

    if (
      !imminentLeadSetup &&
      (
        (hasRepeatPattern && (setupSignal || softSignal)) ||
        (isTvDerivedFallback && (setupSignal || softSignal))
      )
    ) {
      return 'SETUP DEVELOPING';
    }

    const expandingNow =
      signal === 'EXPANSION' ||
      signal === 'BREAKOUT' ||
      signal === 'BREAKDOWN' ||
      (signal === 'MOMENTUM' && momentumAbs >= 20) ||
      (volumeSpike >= 1.2 && momentumAbs >= 20 && phase !== 'WAIT') ||
      imminentLeadSetup ||
      (setupScore >= 76 && momentumAbs >= 14 && volumeSpike >= 1.0 && (phase === 'PREPARE' || phase === 'READY' || phase === 'NOW'));

    return expandingNow ? 'READY' : 'SETUP DEVELOPING';
  };

  const isSetupStartingTight = (alert: ScannerResult): boolean => {
    const signal = String(alert.breakoutSignal || '').toUpperCase();
    const phase = String(alert.compression?.phase || '').toUpperCase();
    const setupScore = alert.preBreakoutSetup?.score ?? 0;
    const setupTraits = alert.preBreakoutSetup?.traits?.length ?? 0;
    const etaMinutes = alert.preBreakoutSetup?.etaMinutes;
    const momentumAbs = Math.abs(alert.momentumStrength ?? 0);
    const volumeSpike = alert.volumeSpike ?? 1;
    const breakoutScore = alert.breakoutScore ?? 0;
    const bestPlay = alert.optionPlays?.[0] as Record<string, unknown> | undefined;
    const optionScore = toFiniteNumber(bestPlay?.score) ?? 0;
    const optionOi = getOptionPlayOpenInterest(bestPlay);

    const expansionSignal =
      signal === 'BREAKOUT' ||
      signal === 'BREAKDOWN' ||
      signal === 'EXPANSION' ||
      signal === 'MOMENTUM';

    if (expansionSignal) return false;

    const setupSignal =
      signal === 'BUILDING' ||
      signal === 'SQUEEZE' ||
      signal === 'CONSOLIDATING' ||
      signal === '';

    const setupPhase = phase === 'PREPARE' || phase === 'READY';

    // Option data is optional — don't gate on it when unavailable
    const hasOptionData = !!bestPlay && (optionScore > 0 || optionOi > 0);
    const optionGate = !hasOptionData || (optionScore >= 50 && optionOi >= 100);
    const hasSetupModel = !!alert.preBreakoutSetup;
    const etaGate = etaMinutes == null || etaMinutes <= 10;

    return (
      getSetupStage(alert) === 'SETUP DEVELOPING' &&
      (setupSignal || setupPhase) &&
      (setupScore >= 62 || !hasSetupModel) &&
      (setupTraits >= 3 || !hasSetupModel) &&
      etaGate &&
      momentumAbs >= 10 &&
      momentumAbs <= 32 &&
      volumeSpike >= 1.0 &&
      breakoutScore >= 38 &&
      breakoutScore <= 74 &&
      optionGate
    );
  };

  const isExpansionDetected = (alert: ScannerResult): boolean => {
    const signal = String(alert.breakoutSignal || '').toUpperCase();
    const momentumAbs = Math.abs(alert.momentumStrength ?? 0);
    const breakoutScore = alert.breakoutScore ?? 0;
    const dayMoveAbsPct = Math.abs(alert.priceChangePercent ?? 0);
    const volumeSpike = alert.volumeSpike ?? 1;
    const minMomentum = marketPushMode ? 14 : 18;
    const minBreakoutScore = marketPushMode ? 44 : 52;
    const minDayMove = marketPushMode ? 0.45 : 0.6;
    const minVolumeSpike = marketPushMode ? 0.9 : 0.95;

    const directionalExpansionSignal =
      signal === 'BREAKOUT' ||
      signal === 'BREAKDOWN' ||
      signal === 'EXPANSION' ||
      (signal === 'MOMENTUM' && momentumAbs >= minMomentum) ||
      (marketPushMode && dayMoveAbsPct >= minDayMove && momentumAbs >= minMomentum);

    if (!directionalExpansionSignal) return false;

    return (
      breakoutScore >= minBreakoutScore ||
      momentumAbs >= minMomentum ||
      (dayMoveAbsPct >= minDayMove && volumeSpike >= minVolumeSpike)
    );
  };

  const isLegitExpansionPlay = (alert: ScannerResult): boolean => {
    const signal = String(alert.breakoutSignal || '').toUpperCase();
    const momentumAbs = Math.abs(alert.momentumStrength ?? 0);
    const breakoutScore = alert.breakoutScore ?? 0;
    const dayMoveAbsPct = Math.abs(alert.priceChangePercent ?? 0);
    const volumeSpike = alert.volumeSpike ?? 1;
    const stackAgreement = alert.timeframeStack?.agreement ?? 0;
    const stackBias = alert.timeframeStack?.bias ?? 'neutral';
    const direction =
      signal === 'BREAKDOWN' ||
      (signal === 'EXPANSION' && alert.expansionDirection === 'bearish') ||
      (signal === 'MOMENTUM' && (alert.expansionDirection === 'bearish' || (alert.momentumStrength ?? 0) < 0))
        ? 'bearish'
        : 'bullish';

    const stackConflict =
      stackAgreement >= 55 && (
        (direction === 'bullish' && stackBias === 'bearish') ||
        (direction === 'bearish' && stackBias === 'bullish')
      );
    if (stackConflict) return false;

    const compressionStrength = Number.isFinite(alert.compression?.archStrength)
      ? (alert.compression?.archStrength as number)
      : Number.isFinite(alert.compression?.sparkScore)
        ? (alert.compression?.sparkScore as number)
        : 0;

    const strongMove = dayMoveAbsPct >= 0.9 && momentumAbs >= 22;
    const hasStackData = !!alert.timeframeStack;
    // When no timeframe stack data, allow strong signals through on breakout score + momentum alone
    const structureOk = hasStackData
      ? (stackAgreement >= 50 && breakoutScore >= 48 && momentumAbs >= 16)
      : (breakoutScore >= 48 && momentumAbs >= 16);
    const compressionOk = compressionStrength >= 14 || String(alert.compression?.phase || '').toUpperCase() !== 'WAIT';
    const volumeOk = volumeSpike >= 0.9 || strongMove;

    return structureOk && compressionOk && volumeOk;
  };

  // Show cards for structural signals; enforce option quality only when option data is present.
  function isActionablePlay(alert: ScannerResult) {
    const signal = alert.breakoutSignal;
    const momentumAbs = Math.abs(alert.momentumStrength ?? 0);
    const stackAgreement = alert.timeframeStack?.agreement ?? 0;
    const stackBias = alert.timeframeStack?.bias ?? 'neutral';
    const breakoutScore = alert.breakoutScore ?? 0;
    const volumeSpike = alert.volumeSpike ?? 1;
    const dayMoveAbsPct = Math.abs(alert.priceChangePercent ?? 0);

    const isDirectionalBreakout =
      signal === 'BREAKOUT' ||
      signal === 'BREAKDOWN' ||
      signal === 'EXPANSION' ||
      signal === 'MOMENTUM';

    const likelyLong =
      signal === 'BREAKOUT' ||
      (signal === 'EXPANSION' && alert.expansionDirection !== 'bearish') ||
      (signal === 'MOMENTUM' && (alert.expansionDirection === 'bullish' || (alert.momentumStrength ?? 0) > 0));
    const likelyShort =
      signal === 'BREAKDOWN' ||
      (signal === 'EXPANSION' && alert.expansionDirection === 'bearish') ||
      (signal === 'MOMENTUM' && (alert.expansionDirection === 'bearish' || (alert.momentumStrength ?? 0) < 0));

    const stackConflict =
      stackAgreement >= 55 && (
        (likelyLong && stackBias === 'bearish') ||
        (likelyShort && stackBias === 'bullish')
      );

    // Strong move override: show alert cards even if options data is missing/thin.
    // This prevents major market moves (like large SPY intraday pops) from being silently filtered out.
    const hasStackData = !!alert.timeframeStack;
    const strongMoveOverride =
      isDirectionalBreakout &&
      !stackConflict &&
      (breakoutScore >= 58 || momentumAbs >= 30 || dayMoveAbsPct >= 0.8) &&
      momentumAbs >= 20 &&
      volumeSpike >= 1.0 &&
      (hasStackData ? stackAgreement >= 45 : true);
    if (strongMoveOverride) return true;

    // --- 0DTE/2DTE Enhanced Logic ---
    const bestPlay = alert.optionPlays?.[0] as Record<string, unknown> | undefined;
    const bestPlayScore = toFiniteNumber(bestPlay?.score) ?? 0;
    const bestPlayOpenInterest = getOptionPlayOpenInterest(bestPlay);
    const bestPlayDirection = String(bestPlay?.direction ?? '').toUpperCase();
    const hasOptionData = !!bestPlay && (bestPlayScore > 0 || bestPlayOpenInterest > 0 || bestPlayDirection.length > 0);
    if (hasOptionData && (bestPlayScore < tuning.optionScoreMin || bestPlayOpenInterest < tuning.optionOiMin)) return false;

    const stackAggregateScore = alert.timeframeStack?.aggregateScore ?? 0;

    const isHardBreakout =
      alert.breakoutSignal === 'BREAKOUT' ||
      alert.breakoutSignal === 'BREAKDOWN' ||
      (alert.breakoutSignal === 'EXPANSION' && Math.abs(alert.momentumStrength ?? 0) >= 20);

    if (alert.timeframeStack) {
      const requiredAgreement = tuning.mode === 'TREND' ? 48 : tuning.mode === 'BALANCED' ? 56 : 64;
      const requiredStackScore = tuning.mode === 'TREND' ? 48 : tuning.mode === 'BALANCED' ? 54 : 60;
      if (stackAgreement < requiredAgreement || stackAggregateScore < requiredStackScore) return false;
    }

    const stackDirectionalConflict =
      hasOptionData &&
      stackAgreement >= 55 && (
        (stackBias === 'bullish' && bestPlayDirection === 'PUT') ||
        (stackBias === 'bearish' && bestPlayDirection === 'CALL')
      );
    if (stackDirectionalConflict) return false;

    const setupScore = alert.preBreakoutSetup?.score ?? 0;
    const setupTraitCount = alert.preBreakoutSetup?.traits?.length ?? 0;
    const setupTraits = alert.preBreakoutSetup?.traits ?? [];
    const hasSweetSpotStack = setupTraits.includes('SWEET_SPOT_STACK');
    const setupModeConfig = thresholdConfig?.modes?.[tuning.mode] ??
      (tuning.mode === 'TREND'
        ? { setupScoreMin: 68, setupTraitsMin: 4, requireSweetSpotStack: false }
        : tuning.mode === 'BALANCED'
          ? { setupScoreMin: 78, setupTraitsMin: 5, requireSweetSpotStack: true }
          : { setupScoreMin: 76, setupTraitsMin: 5, requireSweetSpotStack: true });
    const requiredSetupScore = setupModeConfig.setupScoreMin ?? 68;
    const requiredSetupTraits = setupModeConfig.setupTraitsMin ?? 4;
    if (setupModeConfig.requireSweetSpotStack && !hasSweetSpotStack) return false;
    if (setupScore < requiredSetupScore || setupTraitCount < requiredSetupTraits) return false;

    // Require volume + momentum, but use adaptive bars for confirmed breakouts
    if (isHardBreakout) {
      if ((alert.volumeSpike ?? 1) < tuning.hardVolMin) return false;
      if (Math.abs(alert.momentumStrength ?? 0) < tuning.hardMomentumMin) return false;
    } else {
      if ((alert.volumeSpike ?? 1) < tuning.softVolMin) return false;
      if (Math.abs(alert.momentumStrength ?? 0) < tuning.softMomentumMin) return false;
    }

    // Require fresh structural pattern unless breakout signal is already explicit
    const recentPattern = alert.patterns?.some(
      (p: { name?: string; endIndex?: number }) => ['BOS', 'NR7', 'INSIDE BAR', 'BREAKOUT'].some(tag => (p.name || '').toUpperCase().includes(tag)) && (alert.lastIndex ? (p.endIndex ?? 0) > alert.lastIndex - 6 : true)
    );
    if (!recentPattern && !isHardBreakout) return false;

    // No major conflict (e.g., bearish pattern on bullish alert)
    const hasConflict = alert.patterns?.some(
      (p: { type?: string }) => (p.type === 'bearish' && bestPlayDirection === 'CALL') || (p.type === 'bullish' && bestPlayDirection === 'PUT')
    );
    if (hasConflict) return false;

    // Risk/reward filter: PT/Stop must be at least 1.5:1
    if (hasOptionData) {
      const rrPct = getOptionPlayRiskRewardPercent(bestPlay);
      if (rrPct == null) return false;
      const rrRatio = rrPct / 100;
      if (!Number.isFinite(rrRatio) || rrRatio < tuning.rrMin) return false;
    }

    // Show alert for compression/squeeze if MACD is flat and RSI is oversold/overbought
    const macdFlat = Math.abs(alert.momentumStrength ?? 0) < 8;
    const rsiExtreme = (alert.rsiValue ?? 50) < 32 || (alert.rsiValue ?? 50) > 68;
    if ((alert.breakoutSignal === 'SQUEEZE' || alert.breakoutSignal === 'CONSOLIDATING') && macdFlat && rsiExtreme) {
      return true;
    }
    return true;
  }
  const getSignalQualityRank = (quality: ScannerResult['signalQuality']): 0 | 1 | 2 | 3 => {
    if (quality === 'HIGH') return 3;
    if (quality === 'MEDIUM') return 2;
    if (quality === 'LOW') return 1;
    return 0;
  };

  const getSymbolEdge = (alert: ScannerResult): { winRate: number | null; sample: number } => {
    const stats = symbolLogStats.get(String(alert.symbol ?? '').toUpperCase());
    if (!stats || stats.completed <= 0) return { winRate: null, sample: 0 };
    return {
      winRate: stats.wins / stats.completed,
      sample: stats.completed,
    };
  };

  const getSetupOdds = (alert: ScannerResult): number => {
    const breakoutScore = Math.max(0, Math.min(100, alert.breakoutScore ?? 0));
    const momentumAbs = Math.max(0, Math.min(100, Math.abs(alert.momentumStrength ?? 0)));
    const volumeEdge = Math.max(0, Math.min(100, ((alert.volumeSpike ?? 1) - 0.85) * 100));
    const compressionStrength = Number.isFinite(alert.compression?.archStrength)
      ? (alert.compression?.archStrength as number)
      : Number.isFinite(alert.compression?.sparkScore)
        ? (alert.compression?.sparkScore as number)
        : 0;

    const qualityRank = getSignalQualityRank(alert.signalQuality);
    const qualityBoost =
      qualityRank === 3
        ? 9
        : qualityRank === 2
          ? 2
          : qualityRank === 1
            ? -10
            : -18;

    const { winRate, sample } = getSymbolEdge(alert);
    const edgeBoost =
      winRate == null || sample < 20
        ? 0
        : Math.max(-8, Math.min(8, Math.round((winRate - 0.54) * 45)));

    const stagePenalty = getSetupStage(alert) === 'SETUP DEVELOPING' ? 4 : 0;

    const raw =
      breakoutScore * 0.52 +
      momentumAbs * 0.23 +
      volumeEdge * 0.15 +
      Math.max(0, Math.min(100, compressionStrength)) * 0.10 +
      qualityBoost +
      edgeBoost -
      stagePenalty;

    return Math.max(0, Math.min(100, Math.round(raw)));
  };

  const isHighChanceSetup = (alert: ScannerResult, setupOdds: number): boolean => {
    const qualityRank = getSignalQualityRank(alert.signalQuality);
    if (qualityRank < 2) return false;

    const stage = getSetupStage(alert);
    const momentumAbs = Math.abs(alert.momentumStrength ?? 0);
    const volumeSpike = alert.volumeSpike ?? 1;
    const breakoutScore = alert.breakoutScore ?? 0;
    const { winRate, sample } = getSymbolEdge(alert);

    const baseOddsMin = stage === 'READY' ? 68 : 74;
    const edgePenalty = sample >= 28 && winRate != null && winRate < 0.5 ? 6 : 0;
    if (setupOdds < baseOddsMin + edgePenalty) return false;

    if (stage === 'READY') {
      if (breakoutScore < 64 && momentumAbs < 24) return false;
      if (volumeSpike < (marketPushMode ? 0.95 : 1.05) && momentumAbs < 30) return false;
    } else {
      if (breakoutScore < 66) return false;
      if (momentumAbs < 18) return false;
      if (volumeSpike < 1.05) return false;
    }

    return true;
  };

  const getLegacyCardDirection = (alert: ScannerResult): 'bullish' | 'bearish' | 'neutral' => {
    const signal = String(alert.breakoutSignal ?? '').toUpperCase();
    if (signal === 'BREAKOUT') return 'bullish';
    if (signal === 'BREAKDOWN') return 'bearish';
    if (signal === 'EXPANSION' || signal === 'MOMENTUM' || signal === 'BUILDING') {
      if (alert.expansionDirection === 'bullish') return 'bullish';
      if (alert.expansionDirection === 'bearish') return 'bearish';
      const momentum = alert.momentumStrength ?? 0;
      if (momentum >= 0) return 'bullish';
      return 'bearish';
    }
    return 'neutral';
  };

  const getLegacyCardScore = (alert: ScannerResult): number => {
    const breakoutScore = Math.max(0, Math.min(100, alert.breakoutScore ?? 0));
    const momentumAbs = Math.max(0, Math.min(100, Math.abs(alert.momentumStrength ?? 0)));
    const volumeSpike = Math.max(0, alert.volumeSpike ?? 1);
    const dayMoveAbsPct = Math.abs(alert.priceChangePercent ?? 0);
    const rsi = alert.rsiValue ?? 50;
    const signal = String(alert.breakoutSignal ?? '').toUpperCase();

    let score =
      breakoutScore * 0.58 +
      momentumAbs * 0.24 +
      Math.max(0, (volumeSpike - 1) * 28) +
      Math.min(12, dayMoveAbsPct * 12);

    if (signal === 'BREAKOUT' || signal === 'BREAKDOWN') score += 8;
    if (signal === 'EXPANSION') score += 10;
    if (signal === 'MOMENTUM') score += 6;
    if ((signal === 'BREAKOUT' || signal === 'BREAKDOWN' || signal === 'EXPANSION') && (rsi >= 60 || rsi <= 40)) {
      score += 4;
    }

    const qualityRank = getSignalQualityRank(alert.signalQuality);
    if (qualityRank === 3) score += 6;
    else if (qualityRank === 2) score += 2;
    else if (qualityRank === 1) score -= 8;
    else score -= 14;

    return Math.max(0, Math.min(100, Math.round(score)));
  };

  const isLegacyBreakoutCard = (alert: ScannerResult, legacyScore: number): boolean => {
    const signal = String(alert.breakoutSignal ?? '').toUpperCase();
    const qualityRank = getSignalQualityRank(alert.signalQuality);
    const momentumAbs = Math.abs(alert.momentumStrength ?? 0);
    const volumeSpike = alert.volumeSpike ?? 1;
    const breakoutScore = alert.breakoutScore ?? 0;
    const dayMove = alert.priceChangePercent ?? 0;
    const direction = getLegacyCardDirection(alert);
    const warningSet = new Set((alert.warnings ?? []).map((warning) => String(warning ?? '').toUpperCase()));

    const isDirectionalSignal =
      signal === 'BREAKOUT' ||
      signal === 'BREAKDOWN' ||
      signal === 'EXPANSION' ||
      signal === 'MOMENTUM' ||
      signal === 'BUILDING';
    if (!isDirectionalSignal) return false;
    if (qualityRank === 0) return false;
    if (legacyScore < 58) return false;

    const hardConflict =
      warningSet.has('TREND_CONFLICT') ||
      warningSet.has('TV_TREND_CONFLICT') ||
      warningSet.has('CONFLICT_MOMENTUM') ||
      warningSet.has('TV_RECOMMEND_OPPOSE');
    if (hardConflict && legacyScore < 76) return false;
    if (warningSet.has('LATE_PHASE_UNCONFIRMED') && legacyScore < 74) return false;

    const todayBullish = dayMove > 0.1;
    const todayBearish = dayMove < -0.1;
    if (direction === 'bullish' && todayBearish && legacyScore < 78) return false;
    if (direction === 'bearish' && todayBullish && legacyScore < 78) return false;

    if (signal === 'BREAKOUT' || signal === 'BREAKDOWN' || signal === 'EXPANSION') {
      if (momentumAbs < 18) return false;
      if (volumeSpike < 1.1 && breakoutScore < 72) return false;
    } else if (signal === 'MOMENTUM') {
      if (momentumAbs < 30) return false;
      if (volumeSpike < 1.0 && Math.abs(dayMove) < 0.45) return false;
    } else if (signal === 'BUILDING') {
      if (legacyScore < 64) return false;
      if (momentumAbs < 16 || volumeSpike < 1.15) return false;
    }

    if (qualityRank < 2 && legacyScore < 72) return false;
    return true;
  };

  const isPrepareCompressionAlert = (alert: ScannerResult, legacyScore: number): boolean => {
    const signal = String(alert.breakoutSignal ?? '').toUpperCase();
    const phase = String(alert.compression?.phase ?? '').toUpperCase();
    const qualityRank = getSignalQualityRank(alert.signalQuality);
    const breakoutScore = alert.breakoutScore ?? 0;
    const compressionStrength = Number.isFinite(alert.compression?.archStrength)
      ? (alert.compression?.archStrength as number)
      : Number.isFinite(alert.compression?.sparkScore)
        ? (alert.compression?.sparkScore as number)
        : 0;
    const momentumAbs = Math.abs(alert.momentumStrength ?? 0);
    const volumeSpike = alert.volumeSpike ?? 1;
    const dayMoveAbsPct = Math.abs(alert.priceChangePercent ?? 0);
    const setupScore = alert.preBreakoutSetup?.score ?? 0;
    const setupTraits = alert.preBreakoutSetup?.traits?.length ?? 0;
    const etaMinutes = alert.preBreakoutSetup?.etaMinutes;

    const warningSet = new Set((alert.warnings ?? []).map((warning) => String(warning ?? '').toUpperCase()));
    const hardConflict = warningSet.has('CONFLICT_MOMENTUM');
    const trendConflict = warningSet.has('TREND_CONFLICT') || warningSet.has('TV_TREND_CONFLICT');
    const recommendOpposed = warningSet.has('TV_RECOMMEND_OPPOSE');

    const isPreparePhase = phase === 'WAIT' || phase === 'PREPARE' || phase === 'READY';
    const isPrepareSignal = signal === 'BUILDING' || signal === 'SQUEEZE' || signal === 'CONSOLIDATING';
    if (!isPreparePhase || !isPrepareSignal) return false;
    if (qualityRank < 1) return false;
    if (hardConflict) return false;

    if (etaMinutes != null && etaMinutes <= 5 && setupScore >= 70 && setupTraits >= 3) {
      return true;
    }

    const lowCompression = compressionStrength < 45;
    const midCompression = compressionStrength >= 45 && compressionStrength < 65;
    const lowVolume = volumeSpike < 1.0;
    const midVolume = volumeSpike >= 1.0 && volumeSpike < 1.3;
    const highVolume = volumeSpike >= 1.3;
    const mom15To34 = momentumAbs >= 15 && momentumAbs < 35;
    const mom35To54 = momentumAbs >= 35 && momentumAbs < 55;
    const mom55Plus = momentumAbs >= 55;

    // Recurrence-backed profiles from the 2-8 minute lead study.
    const profileWaitLowVolMomentum = phase === 'WAIT' && lowCompression && lowVolume && mom55Plus;
    const profileReadyLowVolMomentum = phase === 'READY' && midCompression && lowVolume && mom55Plus;
    const profilePrepareHighVolMomentum = phase === 'PREPARE' && lowCompression && highVolume && (mom35To54 || mom55Plus);
    const profileReadyHighVolControlledMomentum =
      phase === 'READY' && midCompression && highVolume && mom35To54;

    const badReadyWeakMomentumHighVol =
      phase === 'READY' && midCompression && highVolume && mom15To34;

    if (badReadyWeakMomentumHighVol && legacyScore < 70) return false;

    let profileScore = 0;
    if (profileWaitLowVolMomentum) profileScore += 5;
    if (profileReadyLowVolMomentum) profileScore += 4;
    if (profilePrepareHighVolMomentum) profileScore += 4;
    if (profileReadyHighVolControlledMomentum) profileScore += 3;

    if (phase === 'WAIT') profileScore += 1;
    if (phase === 'PREPARE' || phase === 'READY') profileScore += 1;
    if (lowCompression) profileScore += 2;
    else if (midCompression) profileScore += 1;

    if (mom55Plus) profileScore += 2;
    else if (mom35To54) profileScore += 1;

    if (lowVolume) profileScore += 1;
    if (midVolume) profileScore += 1;
    if (highVolume && phase === 'PREPARE' && momentumAbs >= 35) profileScore += 1;

    if (breakoutScore >= 46) profileScore += 1;
    if (legacyScore >= 52) profileScore += 1;
    if (dayMoveAbsPct >= 0.45) profileScore += 1;

    if (trendConflict && profileScore < 9 && legacyScore < 66) return false;
    if (recommendOpposed && profileScore < 10 && legacyScore < 68) return false;
    if (qualityRank === 1 && profileScore < 10) return false;

    const strongProfileMatch =
      profileWaitLowVolMomentum ||
      profileReadyLowVolMomentum ||
      profilePrepareHighVolMomentum ||
      profileReadyHighVolControlledMomentum;

    if (!strongProfileMatch && profileScore < 9) return false;
    if (legacyScore < 50 && breakoutScore < 44 && profileScore < 11) return false;
    return true;
  };

  const getRecentLogAgeMs = (alert: ScannerResult): number | null => {
    const symbolStats = symbolLogStats.get(String(alert.symbol ?? '').toUpperCase());
    const latestTs = toFiniteNumber(symbolStats?.latest?.timestamp);
    if (latestTs == null || latestTs <= 0) return null;
    return Math.max(0, Date.now() - latestTs);
  };

  const nowTs = Date.now();
  const CARD_HYSTERESIS_MS = 4 * 60 * 1000;
  const DIRECTION_FLIP_LOCK_MS = 3 * 60 * 1000;
  for (const [symbol, hold] of cardHoldRef.current.entries()) {
    if (!hold || hold.until <= nowTs) {
      cardHoldRef.current.delete(symbol);
    }
  }
  for (const [symbol, lock] of directionLockRef.current.entries()) {
    if (!lock || lock.until <= nowTs) {
      directionLockRef.current.delete(symbol);
    }
  }

  const MAX_STICKY_LOG_AGE_MS = 8 * 60 * 1000;
  const MAX_VISIBLE_ALERTS = 3;
  const monitoredAlerts = (results || [])
    .map((alert) => {
      const setupOdds = getSetupOdds(alert);
      const legacyScore = getLegacyCardScore(alert);
      const qualityRank = getSignalQualityRank(alert.signalQuality);
      const recentLogAgeMs = getRecentLogAgeMs(alert);
      const symbolUpper = String(alert.symbol ?? '').toUpperCase();
      const direction = getLegacyCardDirection(alert);
      const hold = cardHoldRef.current.get(symbolUpper);
      const signal = String(alert.breakoutSignal ?? '').toUpperCase();
      const prepareCompressionAlert = isPrepareCompressionAlert(alert, legacyScore);
      const stickyFromRecentLog =
        recentLogAgeMs != null &&
        recentLogAgeMs <= MAX_STICKY_LOG_AGE_MS &&
        qualityRank >= 2 &&
        legacyScore >= 54;
      const passesLegacyGate = isLegacyBreakoutCard(alert, legacyScore);

      const passesCurrentGate = passesLegacyGate || stickyFromRecentLog || prepareCompressionAlert;
      const hardInvalidation =
        qualityRank === 0 ||
        (signal === 'BUILDING' && Math.abs(alert.momentumStrength ?? 0) < 10 && (alert.breakoutScore ?? 0) < 46);
      const holdDirectionConflict =
        !!hold &&
        hold.direction !== 'neutral' &&
        direction !== 'neutral' &&
        hold.direction !== direction;

      const directionLock = directionLockRef.current.get(symbolUpper);
      const directionFlipConflict =
        !!directionLock &&
        directionLock.until > nowTs &&
        directionLock.direction !== 'neutral' &&
        direction !== 'neutral' &&
        directionLock.direction !== direction;
      const displayDirection = directionFlipConflict
        ? directionLock.direction
        : direction;

      const holdActive =
        !!hold &&
        hold.until > nowTs &&
        !hardInvalidation &&
        qualityRank >= 1;

      if (passesCurrentGate) {
        cardHoldRef.current.set(symbolUpper, {
          until: nowTs + CARD_HYSTERESIS_MS,
          direction,
        });
      } else if (hold && !holdActive) {
        cardHoldRef.current.delete(symbolUpper);
      }

      if (displayDirection !== 'neutral' && (passesCurrentGate || holdActive)) {
        directionLockRef.current.set(symbolUpper, {
          until: nowTs + DIRECTION_FLIP_LOCK_MS,
          direction: displayDirection,
        });
      }

      const wasVisibleLastCycle = lastVisibleSymbolsRef.current.has(symbolUpper);

      return {
        symbolUpper,
        alert,
        setupOdds,
        legacyScore,
        displayDirection,
        directionFlipConflict,
        prepareCompressionAlert,
        passesCurrentGate,
        holdActive,
        wasVisibleLastCycle,
        stickyFromRecentLog,
        include: passesCurrentGate || holdActive,
      };
    })
    .filter((row) => row.include)
    .slice()
    .sort((a, b) => {
      if (a.prepareCompressionAlert !== b.prepareCompressionAlert) return a.prepareCompressionAlert ? -1 : 1;
      if (a.passesCurrentGate !== b.passesCurrentGate) return a.passesCurrentGate ? -1 : 1;
      if (a.holdActive !== b.holdActive) return a.holdActive ? -1 : 1;
      if (a.wasVisibleLastCycle !== b.wasVisibleLastCycle) return a.wasVisibleLastCycle ? -1 : 1;
      if (b.legacyScore !== a.legacyScore) return b.legacyScore - a.legacyScore;
      if (a.stickyFromRecentLog !== b.stickyFromRecentLog) return a.stickyFromRecentLog ? -1 : 1;
      if (b.setupOdds !== a.setupOdds) return b.setupOdds - a.setupOdds;
      return (b.alert.breakoutScore || 0) - (a.alert.breakoutScore || 0);
    });

  // Pin previously visible cards while their hold is active, then fill remaining slots.
  const pinnedAlerts = Array.from(lastVisibleSymbolsRef.current)
    .map((symbolUpper) => monitoredAlerts.find((row) => row.symbolUpper === symbolUpper))
    .filter((row): row is NonNullable<typeof row> => !!row && (row.holdActive || row.passesCurrentGate));
  const pinnedSymbolSet = new Set(pinnedAlerts.map((row) => row.symbolUpper));
  const monitoredAlertsStable = [
    ...pinnedAlerts,
    ...monitoredAlerts.filter((row) => !pinnedSymbolSet.has(row.symbolUpper)),
  ]
    .slice(0, MAX_VISIBLE_ALERTS);

  useEffect(() => {
    const next = new Set<string>();
    for (const row of monitoredAlertsStable) {
      next.add(String(row.alert.symbol ?? '').toUpperCase());
    }
    lastVisibleSymbolsRef.current = next;
  }, [monitoredAlertsStable]);

  if (monitoredAlertsStable.length > 0) {
    return (
      <div className="flex flex-wrap gap-2 mb-3">
        {monitoredAlertsStable.map(({ alert, setupOdds, prepareCompressionAlert, displayDirection }) => {
          const momentumStrength = alert.momentumStrength ?? 0;
          const isBearish = displayDirection === 'bearish';
          const isLong = !isBearish;
          const alertColor = isLong ? '#10b981' : '#ef4444';
          const alertGlow = isLong ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)';
          const alertTopBar = isLong
            ? 'from-emerald-600 via-teal-400 to-cyan-500'
            : 'from-red-700 via-rose-500 to-orange-400';
          const signalTag = prepareCompressionAlert
            ? ((alert.preBreakoutSetup?.etaMinutes != null && alert.preBreakoutSetup.etaMinutes <= 5)
              ? 'BREAKOUT <=5M'
              : 'PREPARE ALERT')
            : isExpansionDetected(alert)
              ? (marketPushMode ? 'LIVE PUSH' : 'EXPANSION DETECTED')
              : 'SETUP STARTING';
          const setupStage = getSetupStage(alert);
          const compressionStrength = Number.isFinite(alert.compression?.archStrength)
            ? (alert.compression?.archStrength as number)
            : Number.isFinite(alert.compression?.sparkScore)
              ? (alert.compression?.sparkScore as number)
              : 0;
          const volumeValue = alert.dailyVolume ?? alert.volume;
          const volumeElevated = (alert.volumeSpike ?? 0) > 1.2;
          const topPlay = alert.optionPlays?.[0] as Record<string, unknown> | undefined;
          const optionOpenInterest = getOptionPlayOpenInterest(topPlay);
          const optionRrPct = getOptionPlayRiskRewardPercent(topPlay);
          const symbolStats = symbolLogStats.get(String(alert.symbol ?? '').toUpperCase());
          const symbolWinRatePct =
            symbolStats && symbolStats.completed > 0
              ? (symbolStats.wins / symbolStats.completed) * 100
              : null;
          const alertDirection = getAlertDirection(alert);
          const latestDirectionalLog =
            alertDirection === 'bearish'
              ? (symbolStats?.latestBearish ?? symbolStats?.latest)
              : (symbolStats?.latestBullish ?? symbolStats?.latest);
          const structuralRrPct = getStructuralRiskRewardPercent(latestDirectionalLog, alertDirection);
          const oiGaugeValue = optionOpenInterest > 0 ? optionOpenInterest : (symbolWinRatePct ?? 0);
          const oiGaugeMax = optionOpenInterest > 0 ? 5000 : 100;
          const oiGaugeLabel = optionOpenInterest > 0 ? 'OI' : 'WR';
          const rrGaugeValue = optionRrPct ?? structuralRrPct ?? 0;
          const rrGaugeLabel = optionRrPct != null ? 'R/R' : structuralRrPct != null ? 'S/R' : 'R/R';
          const rrGaugeColor = optionRrPct != null ? '#22d3ee' : structuralRrPct != null ? '#38bdf8' : '#64748b';
          const symbolSampleCount = symbolStats?.completed ?? 0;

          // Reasoning logic for user-friendly explanation
          const reasoningParts: string[] = [];
          const vol = alert.volumeSpike ?? alert.volume ?? 0;
          const mom = alert.momentumStrength ?? 0;
          const rsi = alert.rsiValue ?? 0;
          const compressionPhase = String(alert.compression?.phase || '').toUpperCase();
          const setupScore = alert.preBreakoutSetup?.score ?? 0;
          const etaMinutes = alert.preBreakoutSetup?.etaMinutes;
          const setupTraits = alert.preBreakoutSetup?.traits?.length ?? 0;

          if (etaMinutes != null && etaMinutes <= 5) {
            reasoningParts.push(`Lead model flags breakout risk within ~${etaMinutes} minutes.`);
          }
          if (setupScore > 0) {
            reasoningParts.push(`Pre-breakout setup score ${Math.round(setupScore)} with ${setupTraits} structural traits.`);
          }
          if (compressionPhase === 'PREPARE' || compressionPhase === 'READY' || compressionPhase === 'NOW') {
            reasoningParts.push(`Compression phase ${compressionPhase} with spark ${Math.round(compressionStrength)} supports release conditions.`);
          }
          if (vol >= 1.2 && Math.abs(mom) >= 20) {
            reasoningParts.push('Volume and momentum are aligned with directional expansion criteria.');
          }
          if (Math.abs(mom) >= 35) {
            reasoningParts.push('Momentum is elevated enough to reduce false-start risk.');
          }
          if (Array.isArray(alert.patterns) && alert.patterns.some((p) => {
            const name = (typeof p === 'string' ? p : p?.name || '').toUpperCase();
            return name.includes('BOS') || name.includes('CHOCH');
          })) {
            reasoningParts.push('Detected BOS/CHOCH structure confirmation.');
          }
          if (isLong && vol > 1.2 && mom > 20 && rsi > 50) {
            reasoningParts.push('Bullish confluence: volume, momentum, and RSI are aligned.');
          } else if (!isLong && vol > 1.2 && mom < -20 && rsi < 50) {
            reasoningParts.push('Bearish confluence: volume, momentum, and RSI are aligned.');
          }
          if ((alert.timeframeStack?.agreement ?? 0) >= 60) {
            reasoningParts.push(`Multi-timeframe alignment ${Math.round(alert.timeframeStack?.agreement ?? 0)}% (${alert.timeframeStack?.bias || 'neutral'} bias).`);
          }
          if (Array.isArray(alert.warnings) && alert.warnings.length > 0) {
            const keyWarning = alert.warnings[0];
            if (typeof keyWarning === 'string' && keyWarning.trim()) {
              reasoningParts.push(`Risk flag to watch: ${keyWarning}.`);
            }
          }

          const reasoning = reasoningParts.length > 0
            ? reasoningParts.join(' ')
            : 'Setup is active with directional pressure; monitor trigger confirmation and risk controls.';

          return (
            <Card
              key={alert.symbol}
              className={cn(
                "min-w-[340px] max-w-[420px] p-2 rounded-2xl border flex flex-col justify-between backdrop-blur-md transition-all duration-300 relative overflow-hidden hover:-translate-y-[2px]",
                isLong
                  ? "border-emerald-400/52"
                  : "border-red-400/52"
              )}
              style={{
                background: "linear-gradient(150deg,#07080d 0%,#0b0d18 58%,#05070d 100%)",
                boxShadow: `0 0 30px ${alertGlow}, inset 0 0 30px ${alertColor}14`,
              }}
            >
              <div className="pointer-events-none absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.007) 3px,rgba(255,255,255,0.007) 4px)" }} />
              <div className="pointer-events-none absolute inset-0 opacity-18" style={{ backgroundImage: `linear-gradient(${isLong ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.15)'} 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,0.08) 1px,transparent 1px)`, backgroundSize: '22px 22px' }} />
              <div className={cn("pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r", alertTopBar)} />
              <div className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l border-t" style={{ borderColor: alertColor + '66' }} />
              <div className="pointer-events-none absolute right-2 bottom-2 h-3 w-3 border-r border-b" style={{ borderColor: alertColor + '4d' }} />
              <div className="pointer-events-none absolute right-2 top-2 text-[8px] tracking-[0.18em] font-mono" style={{ color: alertColor + 'aa' }}>ALERT HUD</div>

              <div
                className="relative z-20 mb-1 mt-0.5 flex items-center gap-2 rounded-xl border px-2 py-1"
                style={{
                  borderColor: alertColor + '52',
                  background: `linear-gradient(135deg,${alertColor}1c,rgba(2,6,23,0.88) 58%)`,
                  boxShadow: `inset 0 0 18px ${alertColor}1f, 0 0 20px ${alertColor}26`,
                }}
              >
                <Flame className={cn("w-5 h-5", isLong ? "text-emerald-300" : "text-red-300")} style={{ filter: `drop-shadow(0 0 8px ${alertColor})` }} />
                <span className={cn("font-mono text-xl font-black tracking-[0.14em]", isLong ? "text-emerald-100" : "text-red-100")} style={{ textShadow: `0 0 10px ${alertColor}88` }}>{alert.symbol}</span>
                <span className={cn("text-[11px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-gradient-to-r shadow-lg border ml-auto",
                  isLong
                    ? "from-emerald-400/30 to-emerald-600/40 text-emerald-100 border-emerald-400/45"
                    : "from-red-400/30 to-red-600/40 text-red-100 border-red-400/45"
                )}>{isLong ? "LONG" : "SHORT"}</span>
                <span className={cn(
                  "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border",
                  tuning.mode === 'TREND' && "border-emerald-400/45 text-emerald-200 bg-emerald-500/10",
                  tuning.mode === 'BALANCED' && "border-cyan-400/45 text-cyan-200 bg-cyan-500/10",
                  tuning.mode === 'CHOPPY' && "border-amber-400/45 text-amber-200 bg-amber-500/10"
                )}>
                  {tuning.mode}
                </span>
                <span
                  className={cn(
                    "text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border",
                    setupStage === 'READY'
                      ? "border-emerald-400/60 text-emerald-100 bg-emerald-500/20"
                      : "border-cyan-400/55 text-cyan-100 bg-cyan-500/18"
                  )}
                >
                  {setupStage}
                </span>
                {!!alert.timeframeStack && (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-fuchsia-400/45 text-fuchsia-200 bg-fuchsia-500/10">
                    MTF {Math.round(alert.timeframeStack.agreement ?? 0)}%
                  </span>
                )}
                {!!alert.preBreakoutSetup && (
                  <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-emerald-400/45 text-emerald-200 bg-emerald-500/10">
                    SETUP {Math.round(alert.preBreakoutSetup.score ?? 0)}
                  </span>
                )}
                <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border border-cyan-400/40 text-cyan-200 bg-cyan-500/10">
                  {signalTag}
                </span>
                <span className="text-[10px] font-mono text-amber-300/95 px-1.5 py-0.5 rounded border border-amber-400/30 bg-amber-500/10">
                  B {Math.round(alert.breakoutScore ?? 0)}
                </span>
                <span className="text-[10px] font-mono text-sky-200/95 px-1.5 py-0.5 rounded border border-sky-400/30 bg-sky-500/10">
                  ODDS {setupOdds}%
                </span>
              </div>

              <details className="mb-1 mt-0.5 rounded-xl border px-2 py-1 text-[11px] font-mono text-slate-100 shadow-sm"
                style={{ borderColor: alertColor + '30', backgroundColor: 'rgba(7,12,24,0.82)' }}>
                <summary className="cursor-pointer select-none font-bold" style={{ color: alertColor + 'cc' }}>Why this setup status?</summary>
                <div className="mt-1 pl-1">{reasoning}</div>
              </details>

              <div className="relative mb-1 mt-1 flex w-full flex-col gap-0 rounded-xl border px-1 py-1"
                style={{ borderColor: alertColor + '55', backgroundColor: alertColor + '12', boxShadow: `inset 0 0 20px ${alertColor}14` }}>
                <div className="absolute inset-0 pointer-events-none z-0">
                  <div className="h-full w-full animate-pulse rounded-2xl" style={{ background: `radial-gradient(circle at 20% 18%,${alertColor}22,transparent 58%)`, opacity: 0.7 }} />
                  <div className="absolute left-1/2 top-0 h-full w-2 blur-2xl animate-glow" style={{ background: alertColor + '24', transform: 'translateX(-50%)' }} />
                </div>
                <div className="w-full z-10">
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: alertColor + 'd0' }}>Compression Arch</span>
                    <span className={cn("font-mono text-[13px] font-black", compressionStrength > 60 ? "text-emerald-200" : compressionStrength < 40 ? "text-red-200" : "text-slate-400")}>{compressionStrength.toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-center">
                    <CompressionHudArc value={compressionStrength} phase={alert.compression?.phase} color={alertColor} />
                  </div>
                </div>
                {setupStage === 'SETUP DEVELOPING' ? (
                  <div className="text-[12px] text-cyan-200 font-mono mt-1 text-center neon-text">
                    SETUP DEVELOPING: monitoring compression and waiting for expansion trigger.
                  </div>
                ) : setupOdds >= 70 ? (
                  <div className="text-[12px] text-emerald-200 font-mono mt-1 text-center neon-text">
                    READY: high-probability expansion setup validated.
                  </div>
                ) : (
                  <div className="text-[12px] text-amber-300 font-mono mt-1 text-center neon-text">
                    READY market structure, waiting for stronger confluence.
                  </div>
                )}
                {/* Holographic overlay */}
                <div className="absolute inset-0 pointer-events-none z-20">
                  <div className="w-full h-full animate-holo-glow rounded-2xl" style={{ background: `linear-gradient(130deg,${alertColor}1a,rgba(34,211,238,0.08),transparent)` }} />
                </div>
              </div>
              <div className="mb-1 flex items-center justify-between rounded-lg border px-2 py-1"
                style={{ borderColor: alertColor + '30', backgroundColor: 'rgba(8,12,20,0.58)' }}>
                <div className="flex min-w-0 items-center gap-1.5">
                  <span className={cn("font-mono text-[13px] font-extrabold tracking-tight", isLong ? "text-emerald-300" : "text-red-300")} style={{ textShadow: `0 0 10px ${alertColor}66` }}>{alert.symbol}</span>
                  <span
                    className={cn(
                      "inline-flex items-center rounded border px-1.5 py-0.5 text-[8px] font-mono font-bold uppercase tracking-wider",
                      volumeElevated
                        ? "border-cyan-400/45 bg-cyan-500/16 text-cyan-200"
                        : "border-amber-400/40 bg-amber-500/14 text-amber-200"
                    )}
                  >
                    VOL {volumeValue !== undefined ? volumeValue.toLocaleString() : '--'}
                  </span>
                </div>
                <span className={cn("text-[9px] font-black uppercase tracking-widest px-1 py-0.5 rounded-full bg-gradient-to-r shadow-md border border-slate-700",
                  isLong ? "from-emerald-400/30 to-emerald-600/40 text-emerald-200" : "from-red-400/30 to-red-600/40 text-red-200"
                )}>{isLong ? "LONG" : "SHORT"}</span>
              </div>
              <div className="mb-1 flex w-full flex-wrap items-start justify-center gap-1.5 px-1">
                <RadialGauge
                  value={alert.volumeSpike !== undefined ? Math.min(200, alert.volumeSpike * 100) : 0}
                  min={0}
                  max={200}
                  label="VOL"
                  color={
                    momentumStrength > 0 ? "#10b981" :
                    momentumStrength < 0 ? "#ef4444" :
                    "#22d3ee"
                  }
                  bg="#0f172a"
                  size={38}
                />
                <RadialGauge
                  value={alert.rsiValue !== undefined ? alert.rsiValue : 50}
                  min={0}
                  max={100}
                  label="RSI"
                  color="#f59e0b"
                  bg="#0f172a"
                  size={38}
                />
                <RadialGauge
                  value={alert.momentumStrength !== undefined ? Math.max(-100, Math.min(100, alert.momentumStrength)) : 0}
                  min={-100}
                  max={100}
                  label="MACD"
                  color={momentumStrength > 0 ? "#10b981" : momentumStrength < 0 ? "#ef4444" : "#94a3b8"}
                  bg="#0f172a"
                  size={38}
                />
                <RadialGauge
                  value={alert.momentumStrength !== undefined ? Math.abs(alert.momentumStrength) : 0}
                  min={0}
                  max={100}
                  label="MOM"
                  color={momentumStrength > 0 ? "#10b981" : momentumStrength < 0 ? "#ef4444" : "#94a3b8"}
                  bg="#0f172a"
                  size={38}
                />
                {/* New: OI Gauge */}
                <RadialGauge
                  value={oiGaugeValue}
                  min={0}
                  max={oiGaugeMax}
                  label={oiGaugeLabel}
                  color={optionOpenInterest > 0 ? "#22d3ee" : "#38bdf8"}
                  bg="#0f172a"
                  size={38}
                />
                {/* New: RR Gauge */}
                <RadialGauge
                  value={rrGaugeValue}
                  min={0}
                  max={400}
                  label={rrGaugeLabel}
                  color={rrGaugeColor}
                  bg="#0f172a"
                  size={38}
                />
                {/* New: Pattern Confluence Arch (visual only) */}
                <RadialGauge
                  value={alert.patterns?.length || 0}
                  min={0}
                  max={5}
                  label="PAT"
                  color="#a855f7"
                  bg="#0f172a"
                  size={38}
                />
              </div>
              {/* Option Play Recommendation (always visible if present) */}
              {/* Option Play Dropdown (only visible on click) */}
              <OptionPlayDropdown optionPlays={alert.optionPlays || []} />

              {(symbolWinRatePct != null || structuralRrPct != null) && (
                <div
                  className="mb-1 mt-1 flex items-center justify-between rounded-lg border px-2 py-1 text-[9px] font-mono"
                  style={{ borderColor: alertColor + '2e', backgroundColor: 'rgba(8,12,20,0.52)' }}
                >
                  <span className="text-slate-200/80">
                    24h WR <span className="font-black text-cyan-200">{symbolWinRatePct != null ? `${Math.round(symbolWinRatePct)}%` : '--'}</span>
                  </span>
                  <span className="text-slate-300/80">N {symbolSampleCount}</span>
                  <span className="text-slate-200/80">
                    S/R <span className="font-black text-sky-200">{structuralRrPct != null ? `${(structuralRrPct / 100).toFixed(2)}x` : '--'}</span>
                  </span>
                </div>
              )}

              {/* Momentum Meter — segmented Tactical-style HUD */}
              <MomentumHudMeter value={alert.momentumStrength ?? 0} rsiValue={alert.rsiValue} />
              {/* Pattern Name (if present) */}
              {alert.pattern && (
                <div className="flex items-center justify-center mb-1">
                  <span className="text-[9px] font-mono font-bold text-blue-300 bg-blue-900/40 px-1.5 py-0.5 rounded-full shadow-sm tracking-wide">{alert.pattern}</span>
                </div>
              )}
              <div className="flex items-center flex-wrap justify-between gap-1 mt-1 text-[10px]">
                {/* MACD */}
                <div className={cn(
                  "flex flex-col items-center px-1",
                  (alert.momentumStrength || 0) > 30 ? "text-emerald-400" :
                  (alert.momentumStrength || 0) > 0 ? "text-lime-400" :
                  (alert.momentumStrength || 0) < -30 ? "text-red-400" :
                  (alert.momentumStrength || 0) < 0 ? "text-orange-400" :
                  "text-slate-400"
                )}>
                  <span className="font-bold">MACD</span>
                  <span>{(alert.momentumStrength || 0) > 0 ? '+' : ''}{(alert.momentumStrength || 0).toFixed(0)}</span>
                </div>
                {/* VOL EXP */}
                <div className={cn(
                  "flex flex-col items-center px-1",
                  (alert.volumeSpike || 0) >= 1.5 ? "text-cyan-400" :
                  (alert.volumeSpike || 0) >= 1.25 ? "text-blue-400" :
                  "text-slate-400"
                )}>
                  <span className="font-bold">VOL EXP</span>
                  <span>{((alert.volumeSpike || 0) * 10).toFixed(0)}%</span>
                </div>
                {/* RSI */}
                <div className={cn(
                  "flex flex-col items-center px-1",
                  alert.rsiValue !== undefined && isLong && alert.rsiValue > 50 ? "text-emerald-400" :
                  alert.rsiValue !== undefined && !isLong && alert.rsiValue < 50 ? "text-red-400" :
                  "text-amber-400"
                )}>
                  <span className="font-bold">RSI</span>
                  <span>{alert.rsiValue !== undefined ? alert.rsiValue.toFixed(0) : "—"}</span>
                </div>
                {/* MOM */}
                <div className="flex flex-col items-center px-1 text-sky-400">
                  <span className="font-bold">MOM</span>
                  <span>{(alert.momentumStrength || 0).toFixed(0)}</span>
                </div>
                {/* OPTION PLAY (strike, expiration, premium) */}
                {alert.strike !== undefined && (
                  <div className="flex flex-col items-center px-1 text-fuchsia-400">
                    <span className="font-bold">STRK</span>
                    <span>{alert.strike}</span>
                  </div>
                )}
                {alert.expiration && (
                  <div className="flex flex-col items-center px-1 text-fuchsia-300">
                    <span className="font-bold">EXP</span>
                    <span>{alert.expiration}</span>
                  </div>
                )}
                {alert.premium !== undefined && (
                  <div className="flex flex-col items-center px-1 text-rose-300">
                    <span className="font-bold">PREM</span>
                    <span>{alert.premium}</span>
                  </div>
                )}
              </div>
              {/* All Data Dropdown (details/summary) */}
              <details className="mt-2 bg-slate-900/80 rounded-xl p-1.5 text-[10px] border border-slate-800 text-slate-200 shadow-inner">
                <summary className="cursor-pointer font-bold text-cyan-300 select-none">Show All Data</summary>
                <div className="mt-1">
                  {Object.entries(alert).map(([key, value]) => (
                    <div key={key} className="flex justify-between border-b border-muted/20 last:border-b-0 py-0.5 px-1">
                      <span className="font-semibold text-muted-foreground mr-2 truncate" style={{maxWidth:'80px'}}>{key}</span>
                      <span className="text-foreground font-mono truncate" style={{maxWidth:'100px'}}>{typeof value === 'number' ? value.toFixed(4) : String(value)}</span>
                    </div>
                  ))}
                </div>
              </details>

              {/* Pattern Details Toggle */}
              {alert.patterns && Array.isArray(alert.patterns) && alert.patterns.length > 0 && (
                <div className="mt-1">
                  <PatternDetails patterns={alert.patterns} />
                </div>
              )}
            </Card>
          );
        })}
      </div>
    );
  }

  // If no alerts, render nothing
  return null;
}

interface GapData {
  index: number;
  direction: 'up' | 'down';
  gapTop: number;
  gapBottom: number;
  gapSize: number;
  gapPercent: number;
  fillPercent: number;
  filled: boolean;
  fillIndex: number | null;
}

interface GapAnalysisData {
  gaps: GapData[];
  totalGaps: number;
  filledCount: number;
  unfilledCount: number;
  avgFillPercent: number;
  activeGap: GapData | null;
}

function formatGapPrice(v: number): string {
  if (v >= 1000) return `$${v.toFixed(0)}`;
  if (v >= 100) return `$${v.toFixed(1)}`;
  return `$${v.toFixed(2)}`;
}

export function GapAnalysisCard({ data }: { data?: GapAnalysisData }) {
  if (!data || data.totalGaps === 0) return null;

  const active = data.activeGap;
  const fillRate = data.totalGaps > 0 ? Math.round((data.filledCount / data.totalGaps) * 100) : 0;

  return (
    <Card className="relative overflow-hidden rounded-xl border border-cyan-500/30 bg-gradient-to-b from-[#040816]/95 via-[#060d1e]/90 to-[#070f24]/85 shadow-[0_0_24px_rgba(34,211,238,0.14)]" data-testid="gap-analysis-card">
      <div className="pointer-events-none absolute inset-0 opacity-22 [background-image:linear-gradient(rgba(34,211,238,0.14)_1px,transparent_1px),linear-gradient(90deg,rgba(129,140,248,0.12)_1px,transparent_1px)] [background-size:22px_22px]" />
      <div className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l border-t border-cyan-300/45" />
      <div className="pointer-events-none absolute right-2 bottom-2 h-3 w-3 border-r border-b border-violet-300/35" />
      <div className="h-0.5 bg-gradient-to-r from-cyan-500/0 via-cyan-300/85 to-violet-400/0" />
      <CardHeader className="relative py-3 px-4 border-b border-cyan-500/25 bg-gradient-to-r from-cyan-500/10 via-transparent to-violet-500/10">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-cyan-300 flex items-center gap-2">
          <Activity className="w-4 h-4" />
          Gap Detection & Fill
        </CardTitle>
      </CardHeader>
      <CardContent className="relative p-4 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="text-center rounded-md border border-cyan-500/20 bg-cyan-500/8 py-1.5">
            <div className="text-lg font-mono font-bold text-cyan-100" data-testid="text-total-gaps">{data.totalGaps}</div>
            <div className="text-[10px] text-cyan-100/65 uppercase tracking-wider">Gaps Found</div>
          </div>
          <div className="text-center rounded-md border border-emerald-500/25 bg-emerald-500/8 py-1.5">
            <div className="text-lg font-mono font-bold text-emerald-400" data-testid="text-filled-gaps">{data.filledCount}</div>
            <div className="text-[10px] text-emerald-200/65 uppercase tracking-wider">Filled</div>
          </div>
          <div className="text-center rounded-md border border-amber-500/25 bg-amber-500/8 py-1.5">
            <div className="text-lg font-mono font-bold text-amber-400" data-testid="text-unfilled-gaps">{data.unfilledCount}</div>
            <div className="text-[10px] text-amber-200/65 uppercase tracking-wider">Unfilled</div>
          </div>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Fill Rate</span>
            <span className="text-xs font-mono font-bold">{fillRate}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-black/30 border border-cyan-500/20 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-violet-500 to-purple-400 transition-all duration-500"
              style={{ width: `${fillRate}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Avg Fill</span>
            <span className="text-xs font-mono font-bold">{data.avgFillPercent}%</span>
          </div>
        </div>

        {active && (
          <div
            className={cn(
              "rounded-md border p-3",
              active.direction === 'up'
                ? "border-emerald-500/30 bg-emerald-500/5"
                : "border-red-500/30 bg-red-500/5"
            )}
            data-testid="active-gap-detail"
          >
            <div className="flex items-center gap-2 mb-2">
              {active.direction === 'up'
                ? <ArrowUpRight className="w-4 h-4 text-emerald-400" />
                : <ArrowDownRight className="w-4 h-4 text-red-400" />}
              <span className="text-xs font-bold uppercase tracking-wider">
                Active Gap {active.direction === 'up' ? 'Up' : 'Down'}
              </span>
              <Badge
                variant="outline"
                className={cn(
                  "text-[9px] ml-auto",
                  active.fillPercent >= 75 ? "border-amber-500/40 text-amber-400" :
                  active.fillPercent >= 25 ? "border-blue-500/40 text-blue-400" :
                  "border-muted text-muted-foreground"
                )}
              >
                {active.fillPercent.toFixed(1)}% Filled
              </Badge>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground">Gap Range</span>
                <span className="text-xs font-mono">
                  {formatGapPrice(active.gapBottom)} — {formatGapPrice(active.gapTop)}
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground">Gap Size</span>
                <span className="text-xs font-mono">
                  {formatGapPrice(active.gapSize)} ({active.gapPercent}%)
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-black/30 border border-cyan-500/20 overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    active.direction === 'up'
                      ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                      : "bg-gradient-to-r from-red-500 to-rose-400"
                  )}
                  style={{ width: `${Math.min(100, active.fillPercent)}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {data.gaps.length > 0 && (
          <div className="space-y-1">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Recent Gaps</span>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {data.gaps.slice().reverse().slice(0, 5).map((g, i) => (
                <div
                  key={`gap-${i}`}
                  className="flex items-center gap-2 text-[11px] font-mono py-1 px-2 rounded border border-cyan-500/18 bg-cyan-500/7"
                  data-testid={`gap-row-${i}`}
                >
                  {g.direction === 'up'
                    ? <ArrowUpRight className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                    : <ArrowDownRight className="w-3 h-3 text-red-400 flex-shrink-0" />}
                  <span className="text-muted-foreground min-w-0 truncate">
                    {formatGapPrice(g.gapBottom)}–{formatGapPrice(g.gapTop)}
                  </span>
                  <span className="ml-auto flex-shrink-0">
                    {g.filled ? (
                      <span className="text-emerald-400">Filled</span>
                    ) : (
                      <span className="text-amber-400">{g.fillPercent.toFixed(0)}%</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface OrderBlockData {
  type: 'bullish' | 'bearish';
  startIndex: number;
  endIndex: number;
  high: number;
  low: number;
  originIndex: number;
  strength: number;
}

interface StructureEventData {
  type: 'BOS' | 'CHOCH';
  index: number;
  direction: 'bullish' | 'bearish';
  description: string;
}

interface LiquidityEventData {
  type: string;
  index: number;
  price: number;
  description: string;
}

interface SMCAnalysisProps {
  orderBlocks?: OrderBlockData[];
  breakerBlocks?: OrderBlockData[];
  structureEvents?: StructureEventData[];
  liquidityEvents?: LiquidityEventData[];
}

function formatSmcPrice(v: number): string {
  if (v >= 1000) return `$${v.toFixed(0)}`;
  if (v >= 100) return `$${v.toFixed(1)}`;
  return `$${v.toFixed(2)}`;
}

function computeSmcBias(props: SMCAnalysisProps): {
  bias: 'bullish' | 'bearish' | 'neutral';
  score: number;
  bullScore: number;
  bearScore: number;
  netFlow: number;
  confidenceTier: 'LOW' | 'MED' | 'HIGH';
  summary: string;
  recommendation: string;
} {
  let bull = 0;
  let bear = 0;
  const obs = props.orderBlocks || [];
  const bbs = props.breakerBlocks || [];
  const se = props.structureEvents || [];
  const le = props.liquidityEvents || [];

  const recencyBoost = (idx: number, total: number): number => {
    if (total <= 1) return 1;
    return 0.85 + (idx / (total - 1)) * 0.35;
  };

  obs.forEach((ob, idx) => {
    const weight = (0.9 + Math.min(1.2, ob.strength / 100)) * recencyBoost(idx, obs.length);
    if (ob.type === 'bullish') bull += weight;
    else bear += weight;
  });

  bbs.forEach((bb, idx) => {
    const weight = (0.8 + Math.min(1.1, bb.strength / 120)) * recencyBoost(idx, bbs.length);
    if (bb.type === 'bullish') bull += weight;
    else bear += weight;
  });

  se.forEach((event, idx) => {
    const base = event.type === 'CHOCH' ? 1.25 : 1.05;
    const weight = base * recencyBoost(idx, se.length);
    if (event.direction === 'bullish') bull += weight;
    else bear += weight;
  });

  le.forEach((event, idx) => {
    const text = `${event.type} ${event.description}`.toLowerCase();
    const weight = 0.8 * recencyBoost(idx, le.length);
    if (text.includes('sell-side') || text.includes('sell side') || text.includes('sweep low')) {
      bull += weight;
    } else if (text.includes('buy-side') || text.includes('buy side') || text.includes('sweep high')) {
      bear += weight;
    }
  });

  const total = bull + bear;
  if (total === 0) {
    return {
      bias: 'neutral',
      score: 0,
      bullScore: 0,
      bearScore: 0,
      netFlow: 0,
      confidenceTier: 'LOW',
      summary: 'No active smart-money events detected.',
      recommendation: 'Stand by for fresh structure/liquidity confirmation.'
    };
  }

  const delta = bull - bear;
  const score = Math.round(Math.abs(bull - bear) / total * 100);
  const confidenceTier: 'LOW' | 'MED' | 'HIGH' = score >= 65 ? 'HIGH' : score >= 35 ? 'MED' : 'LOW';
  const bias = bull > bear ? 'bullish' : bear > bull ? 'bearish' : 'neutral';

  const summary =
    bias === 'bullish'
      ? `Bull-side smart-money pressure leads by ${Math.abs(delta).toFixed(1)} points.`
      : bias === 'bearish'
      ? `Bear-side smart-money pressure leads by ${Math.abs(delta).toFixed(1)} points.`
      : 'Bull and bear pressure are balanced.';

  const recommendation =
    bias === 'bullish'
      ? confidenceTier === 'HIGH'
        ? 'Lean long on pullbacks into bullish OB/BB zones.'
        : 'Prefer selective long setups; wait for cleaner BOS continuation.'
      : bias === 'bearish'
      ? confidenceTier === 'HIGH'
        ? 'Lean short on rallies into bearish OB/BB zones.'
        : 'Prefer selective short setups; wait for cleaner CHOCH/BOS confirmation.'
      : 'Remain neutral until structure and liquidity align.';

  return {
    bias,
    score,
    bullScore: Math.round(bull * 10) / 10,
    bearScore: Math.round(bear * 10) / 10,
    netFlow: Math.round(delta * 10) / 10,
    confidenceTier,
    summary,
    recommendation,
  };
}

export function SMCAnalysisCard(props: SMCAnalysisProps) {
  const obs = props.orderBlocks || [];
  const bbs = props.breakerBlocks || [];
  const se = props.structureEvents || [];
  const le = props.liquidityEvents || [];

  const total = obs.length + bbs.length + se.length + le.length;
  if (total === 0) return null;

  const { bias, score, bullScore, bearScore, netFlow, confidenceTier, summary, recommendation } = computeSmcBias(props);

  const biasConfig = {
    bullish: { color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/30", label: "Bullish" },
    bearish: { color: "text-red-400", bg: "bg-red-500/10", border: "border-red-500/30", label: "Bearish" },
    neutral: { color: "text-muted-foreground", bg: "bg-muted/30", border: "border-border/50", label: "Neutral" },
  };
  const bc = biasConfig[bias];
  const sideTotal = Math.max(0.0001, bullScore + bearScore);
  const bullPct = Math.round((bullScore / sideTotal) * 100);
  const bearPct = Math.round((bearScore / sideTotal) * 100);
  const structureBias = (() => {
    if (se.length === 0) return 'Mixed';
    const lookback = se.slice(-5);
    const up = lookback.filter((event) => event.direction === 'bullish').length;
    const down = lookback.length - up;
    if (up > down) return 'Bull Structure';
    if (down > up) return 'Bear Structure';
    return 'Mixed';
  })();

  const recentOBs = obs.slice(-4);
  const recentBBs = bbs.slice(-3);
  const recentSE = se.slice(-4);
  const recentLE = le.slice(-4);

  return (
    <Card className="overflow-hidden relative border-cyan-500/35 bg-gradient-to-b from-[#040816]/95 via-[#060d1e]/90 to-[#070f24]/85 shadow-[0_0_30px_rgba(34,211,238,0.16)]" data-testid="smc-analysis-card">
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(34,211,238,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(99,102,241,0.14)_1px,transparent_1px)] [background-size:22px_22px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_0%,rgba(34,211,238,0.18),transparent_46%),radial-gradient(circle_at_90%_100%,rgba(168,85,247,0.14),transparent_44%)]" />
      <div className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l border-t border-cyan-300/45" />
      <div className="pointer-events-none absolute right-2 bottom-2 h-3 w-3 border-r border-b border-violet-300/35" />
      <div className="h-0.5 bg-gradient-to-r from-cyan-400/0 via-cyan-300/90 to-violet-400/0" />
      <CardHeader className="relative py-3 px-4 border-b border-cyan-500/30 bg-gradient-to-r from-cyan-500/10 via-transparent to-blue-500/10">
        <CardTitle className="text-sm font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-2 flex-wrap">
          <Shield className="w-4 h-4" />
          Smart Money Analysis
          <Badge variant="outline" className="text-[9px] border-cyan-400/40 text-cyan-200 bg-cyan-500/12">
            ENGINE ON
          </Badge>
          <Badge
            variant="outline"
            className={cn("text-[9px] ml-auto", bc.border, bc.color)}
            data-testid="smc-bias-badge"
          >
            {bc.label} {score > 0 ? `${score}%` : ''}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="relative p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2 py-1.5 shadow-[0_0_12px_rgba(34,211,238,0.12)]">
            <div className="text-[9px] uppercase tracking-wider text-cyan-200/70">Flow Vector</div>
            <div className={cn("text-[13px] font-mono font-bold", netFlow >= 0 ? "text-emerald-300" : "text-red-300")}>
              {netFlow >= 0 ? '+' : ''}{netFlow.toFixed(1)}
            </div>
          </div>
          <div className="rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2 py-1.5 shadow-[0_0_12px_rgba(34,211,238,0.12)]">
            <div className="text-[9px] uppercase tracking-wider text-cyan-200/70">Confluence</div>
            <div className={cn(
              "text-[13px] font-mono font-bold",
              confidenceTier === 'HIGH' ? "text-emerald-300" : confidenceTier === 'MED' ? "text-amber-300" : "text-slate-300"
            )}>
              {confidenceTier}
            </div>
          </div>
          <div className="rounded-md border border-cyan-400/30 bg-cyan-500/10 px-2 py-1.5 shadow-[0_0_12px_rgba(34,211,238,0.12)]">
            <div className="text-[9px] uppercase tracking-wider text-cyan-200/70">Structure Regime</div>
            <div className="text-[12px] font-mono font-semibold text-cyan-100 truncate">{structureBias}</div>
          </div>
        </div>

        <div className="rounded-lg border border-cyan-500/25 bg-cyan-500/8 p-2">
          <div className="flex items-center justify-between text-[9px] uppercase tracking-wider mb-1">
            <span className="text-emerald-300">Bull {bullPct}%</span>
            <span className="text-red-300">Bear {bearPct}%</span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-900/70">
            <div className="h-full bg-gradient-to-r from-emerald-400 via-cyan-300 to-red-400" style={{ width: `${Math.max(4, Math.min(100, bullPct))}%` }} />
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] font-mono text-cyan-100/80">
            <span>B {bullScore.toFixed(1)}</span>
            <span>R {bearScore.toFixed(1)}</span>
          </div>
          <div className="mt-1.5 rounded border border-cyan-500/18 bg-slate-900/45 px-2 py-1 text-[10px] text-cyan-100/85">
            <div className="truncate">{summary}</div>
            <div className="mt-0.5 truncate text-cyan-200/70">{recommendation}</div>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-2">
          <div className="text-center rounded-md border border-cyan-400/25 bg-cyan-500/8 py-1.5">
            <div className="text-lg font-mono font-bold text-cyan-100" data-testid="text-smc-ob-count">{obs.length}</div>
            <div className="text-[9px] text-cyan-100/65 uppercase tracking-wider">OB</div>
          </div>
          <div className="text-center rounded-md border border-cyan-400/25 bg-cyan-500/8 py-1.5">
            <div className="text-lg font-mono font-bold text-cyan-100" data-testid="text-smc-bb-count">{bbs.length}</div>
            <div className="text-[9px] text-cyan-100/65 uppercase tracking-wider">Breaker</div>
          </div>
          <div className="text-center rounded-md border border-cyan-400/25 bg-cyan-500/8 py-1.5">
            <div className="text-lg font-mono font-bold text-cyan-100" data-testid="text-smc-structure-count">{se.length}</div>
            <div className="text-[9px] text-cyan-100/65 uppercase tracking-wider">BOS/CHOCH</div>
          </div>
          <div className="text-center rounded-md border border-cyan-400/25 bg-cyan-500/8 py-1.5">
            <div className="text-lg font-mono font-bold text-cyan-100" data-testid="text-smc-liq-count">{le.length}</div>
            <div className="text-[9px] text-cyan-100/65 uppercase tracking-wider">Liquidity</div>
          </div>
        </div>

        {recentOBs.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Layers className="w-3 h-3 text-cyan-400" />
              <span className="text-[10px] text-cyan-100/70 uppercase tracking-wider">Order Blocks</span>
            </div>
            <div className="space-y-1">
              {recentOBs.map((ob, i) => (
                <div
                  key={`ob-${i}`}
                  className={cn(
                    "flex items-center gap-2 text-[11px] font-mono py-1.5 px-2 rounded border",
                    ob.type === 'bullish'
                      ? "border-emerald-500/20 bg-emerald-500/5"
                      : "border-red-500/20 bg-red-500/5"
                  )}
                  data-testid={`smc-ob-${i}`}
                >
                  {ob.type === 'bullish'
                    ? <ArrowUpRight className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                    : <ArrowDownRight className="w-3 h-3 text-red-400 flex-shrink-0" />}
                  <span className={ob.type === 'bullish' ? "text-emerald-400" : "text-red-400"}>
                    {ob.type === 'bullish' ? 'Bull' : 'Bear'}
                  </span>
                  <span className="text-cyan-100/65">
                    {formatSmcPrice(ob.low)} — {formatSmcPrice(ob.high)}
                  </span>
                  <span className="ml-auto text-cyan-100/75 text-[10px]">
                    {ob.strength}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {recentBBs.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Crosshair className="w-3 h-3 text-sky-400" />
              <span className="text-[10px] text-cyan-100/70 uppercase tracking-wider">Breaker Blocks</span>
            </div>
            <div className="space-y-1">
              {recentBBs.map((bb, i) => (
                <div
                  key={`bb-${i}`}
                  className={cn(
                    "flex items-center gap-2 text-[11px] font-mono py-1.5 px-2 rounded border",
                    bb.type === 'bullish'
                      ? "border-emerald-500/20 bg-emerald-500/5"
                      : "border-red-500/20 bg-red-500/5"
                  )}
                  data-testid={`smc-bb-${i}`}
                >
                  {bb.type === 'bullish'
                    ? <ArrowUpRight className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                    : <ArrowDownRight className="w-3 h-3 text-red-400 flex-shrink-0" />}
                  <span className={bb.type === 'bullish' ? "text-emerald-400" : "text-red-400"}>
                    {bb.type === 'bullish' ? 'Bull' : 'Bear'}
                  </span>
                  <span className="text-cyan-100/65">
                    {formatSmcPrice(bb.low)} — {formatSmcPrice(bb.high)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {recentSE.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <GitBranch className="w-3 h-3 text-blue-400" />
              <span className="text-[10px] text-cyan-100/70 uppercase tracking-wider">Structure Events</span>
            </div>
            <div className="space-y-1">
              {recentSE.map((ev, i) => (
                <div
                  key={`se-${i}`}
                  className="flex items-center gap-2 text-[11px] font-mono py-1.5 px-2 rounded bg-cyan-500/6 border border-cyan-500/18"
                  data-testid={`smc-structure-${i}`}
                >
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[9px] px-1.5",
                      ev.type === 'BOS' ? "border-blue-500/40 text-blue-400" : "border-amber-500/40 text-amber-400"
                    )}
                  >
                    {ev.type}
                  </Badge>
                  {ev.direction === 'bullish'
                    ? <ArrowUpRight className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                    : <ArrowDownRight className="w-3 h-3 text-red-400 flex-shrink-0" />}
                  <span className="text-cyan-100/65 truncate min-w-0">
                    {ev.description}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {recentLE.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5">
              <Zap className="w-3 h-3 text-amber-400" />
              <span className="text-[10px] text-cyan-100/70 uppercase tracking-wider">Liquidity Events</span>
            </div>
            <div className="space-y-1">
              {recentLE.map((ev, i) => (
                <div
                  key={`le-${i}`}
                  className="flex items-center gap-2 text-[11px] font-mono py-1.5 px-2 rounded bg-cyan-500/6 border border-cyan-500/18"
                  data-testid={`smc-liq-${i}`}
                >
                  <Zap className="w-3 h-3 text-amber-400 flex-shrink-0" />
                  <span className="text-cyan-100/65 truncate min-w-0">
                    {ev.description}
                  </span>
                  <span className="ml-auto flex-shrink-0 text-[10px]">
                    {formatSmcPrice(ev.price)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
