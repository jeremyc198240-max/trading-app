import React from "react";
import { Badge } from "@/components/ui/badge";
import { 
  TrendingUp, 
  TrendingDown, 
  Minus,
  Target,
  Shield,
  Crosshair,
  Activity,
  Zap,
  BarChart3,
  Clock,
  ArrowUpRight,
  ArrowDownRight,
  Flame,
  Gauge,
  AlertTriangle,
  CheckCircle,
  Layers
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useQuery } from "@tanstack/react-query";

interface TradeAnalysisPanelProps {
  symbol: string;
  currentPriceOverride?: number;
}

interface FusionData {
  unifiedSignal?: {
    direction: 'bullish' | 'bearish' | 'neutral' | 'none';
    state: 'ACTIVE' | 'INACTIVE' | 'STALE';
    confidence: number;
    entryZone: { low?: number; high?: number; min?: number; max?: number } | null;
    stopLoss: number | null;
    targets: number[];
    priceTargets?: number[];
    rr: number | null;
    currentPrice?: number;
    regime?: string;
    probabilities?: { up: number; chop: number; down: number };
    notes?: string[];
    strikeTargets?: {
      type: 'CALL' | 'PUT' | 'WAIT';
      atm: number;
      aggressive: number;
      conservative: number;
      scalp: number;
    } | null;
  };
  marketHealth?: {
    healthScore?: number;
    healthGrade: string;
    rsi?: { value: number };
    adx?: { value: number };
  };
  mtfConsensus?: {
    alignmentScore: number;
    bullishStack: number;
    bearishStack: number;
    neutralStack: number;
    trendConsensus?: string;
  };
  directionalProbabilities?: {
    up: number;
    down: number;
    chop: number;
  };
  volatilityRegime?: {
    regime: string;
    score: number;
  };
  riskModel?: {
    riskIndex: number;
    failureProb: number;
    factors?: string[];
  };
  corvonaLevels?: {
    H1: number;
    H2: number;
    H3: number;
    H4: number;
    L1: number;
    L2: number;
    L3: number;
    L4: number;
  };
  forecast?: {
    direction: string;
    confidence: number;
    rationale?: string[];
  };
  monsterGate?: number;
  gatingState?: {
    gatingScore: number;
    reasons?: string[];
  };
  narrative?: string[];
}

interface ScannerResult {
  healthScore?: number;
  breakoutSignal?: 'BREAKOUT' | 'BREAKDOWN' | 'SQUEEZE' | 'CONSOLIDATING' | 'EXPANSION' | 'BUILDING' | 'MOMENTUM' | null;
  expansionDirection?: 'bullish' | 'bearish' | null;
  compression?: {
    sparkScore?: number;
    phase?: string;
    rangePct?: string | number;
    triggers?: string[];
  };
  symbol: string;
  momentumStrength: number;
  rsiValue: number;
  breakoutScore: number;
  healthGrade: string;
  volumeSpike: number;
  hasMonsterPlay: boolean;
  patterns: { name: string; type: string; confidence: number }[];
}

interface BestPlayData {
  symbol: string;
  spotPrice: number;
  recommendation: {
    direction: 'CALL' | 'PUT' | 'NEUTRAL';
    setupGrade: 'GOLD' | 'HOT' | 'READY' | 'BUILDING' | 'WAIT';
    confidence: number;
    expectedWinRate: number;
    expectedPL: number;
    reasons: string[];
    contract?: {
      strike: number;
      mid: number;
      bid: number;
      ask: number;
      volume: number;
      delta: number;
      spreadPct: number;
    };
  };
  compression: {
    sparkScore: number;
    phase: string;
    bbWidth: string;
    rangePct: string;
    volRatio: string;
    triggers: string[];
  };
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
    slate: "#94a3b8",
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
  min,
  max,
  color,
  valueLabel,
  reticle = false,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  color: 'cyan' | 'emerald' | 'amber' | 'red';
  valueLabel: string;
  reticle?: boolean;
}) {
  const clamped = Math.max(min, Math.min(max, value));
  const pct = clamp01(max === min ? 0 : (clamped - min) / (max - min));
  const tone = color === 'emerald' ? 'emerald' : color === 'amber' ? 'amber' : color === 'red' ? 'red' : 'cyan';
  const toneColor = toneHex(tone);
  const size = 120;
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
  const bs = Math.max(5, size * 0.1);
  const pb = 2;
  const brackets = [
    `M ${bs + pb} ${pb} L ${pb} ${pb} L ${pb} ${bs + pb}`,
    `M ${size - bs - pb} ${pb} L ${size - pb} ${pb} L ${size - pb} ${bs + pb}`,
    `M ${bs + pb} ${size - pb} L ${pb} ${size - pb} L ${pb} ${size - bs - pb}`,
    `M ${size - bs - pb} ${size - pb} L ${size - pb} ${size - pb} L ${size - pb} ${size - bs - pb}`,
  ];

  return (
    <div
      className="relative overflow-hidden rounded-xl border p-1.5 min-h-[100px]"
      style={{
        borderColor: hexToRgba(toneColor, 0.36),
        background: `linear-gradient(165deg, rgba(2,8,18,0.95), ${hexToRgba(toneColor, 0.1)})`,
        boxShadow: `inset 0 0 18px ${hexToRgba(toneColor, 0.14)}, 0 0 16px ${hexToRgba(toneColor, 0.14)}`,
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
          {pct > 0 && (
            <path
              d={arcPath(-220, fillEnd, radius)}
              fill="none"
              stroke={toneColor}
              strokeWidth="8"
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 10px ${toneColor})`, opacity: 0.24 }}
            />
          )}
          {pct > 0 && (
            <path
              d={arcPath(-220, fillEnd, radius)}
              fill="none"
              stroke={toneColor}
              strokeWidth="5"
              strokeLinecap="round"
              style={{ filter: `drop-shadow(0 0 6px ${toneColor})` }}
            />
          )}
          {pct > 0.02 && (
            <circle
              cx={tipX}
              cy={tipY}
              r="3"
              fill={toneColor}
              style={{ filter: `drop-shadow(0 0 6px ${toneColor}) drop-shadow(0 0 12px ${toneColor})` }}
            />
          )}
          {reticle && pct > 0.02 && (
            <circle cx={tipX} cy={tipY} r="5" fill="none" stroke={hexToRgba(toneColor, 0.85)} strokeWidth="1">
              <animate attributeName="r" values="4;8;4" dur="1.4s" repeatCount="indefinite" />
              <animate attributeName="opacity" values="0.8;0.2;0.8" dur="1.4s" repeatCount="indefinite" />
            </circle>
          )}
          <circle cx={cx} cy={cy} r={radius - 8} fill={hexToRgba(toneColor, 0.08)} />
          <circle cx={cx} cy={cy} r={radius - 8} fill="none" stroke={hexToRgba(toneColor, 0.2)} strokeWidth="0.6" />
          <text
            x={cx}
            y={cy - 2}
            textAnchor="middle"
            dominantBaseline="middle"
            fill={toneColor}
            fontSize="12"
            fontWeight="900"
            fontFamily="monospace"
            style={{ filter: `drop-shadow(0 0 8px ${toneColor})` }}
          >
            {valueLabel}
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
            {pct >= 0.66 ? 'HIGH' : pct <= 0.33 ? 'LOW' : 'MID'}
          </text>
        </svg>
      </div>
      <div className="relative -mt-1 truncate px-2 text-center text-[7px] uppercase tracking-[0.14em] leading-tight text-white/45">
        {label}
      </div>
    </div>
  );
}

function FuturisticLineMeter({
  label,
  value,
  tone,
  display,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'red' | 'amber' | 'violet' | 'cyan' | 'slate';
  display: string;
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
        <span className="text-[10px] font-mono font-black" style={{ color: toneColor }}>{display}</span>
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

export function TradeAnalysisPanel({ symbol, currentPriceOverride }: TradeAnalysisPanelProps) {
  const { data: fusionData, isLoading: fusionLoading } = useQuery<FusionData>({
    queryKey: ['/api/fusion', symbol],
    enabled: !!symbol,
    staleTime: 8000,
    refetchInterval: 15000,
  });

  const { data: bestPlayData } = useQuery<BestPlayData>({
    queryKey: ['/api/best-play', symbol],
    enabled: !!symbol,
    staleTime: 8000,
    refetchInterval: 15000,
  });

  const { data: scannerResults } = useQuery<ScannerResult[]>({
    queryKey: ['/api/scanner/results'],
    staleTime: 10000,
    refetchInterval: 15000,
  });

  const scannerData = scannerResults?.find(r => r.symbol === symbol);

  const formatPrice = (price: number | null | undefined) => {
    if (price === null || price === undefined) return '—';
    return `$${price.toFixed(2)}`;
  };

  const formatPct = (pct: number) => `${(pct * 100).toFixed(0)}%`;
  const normalizePct = (value: number | null | undefined, fallback = 0) => {
    if (value === null || value === undefined || Number.isNaN(value)) return fallback;
    const normalized = value <= 1 ? value * 100 : value;
    return Math.max(0, Math.min(100, Math.round(normalized)));
  };

  if (!symbol) return null;

  if (fusionLoading) {
    return (
      <div className="relative rounded-md animate-pulse" style={{ background: 'linear-gradient(135deg, rgba(6,182,212,0.05) 0%, rgba(15,23,42,0.9) 50%, rgba(6,182,212,0.05) 100%)' }}>
        <div className="absolute inset-0 rounded-md border border-cyan-500/20" />
        <div className="p-3 space-y-2">
          <div className="h-4 w-32 bg-cyan-500/10 rounded" />
          <div className="h-12 bg-cyan-500/5 rounded" />
          <div className="grid grid-cols-4 gap-2">
            <div className="h-10 bg-cyan-500/5 rounded" />
            <div className="h-10 bg-cyan-500/5 rounded" />
            <div className="h-10 bg-cyan-500/5 rounded" />
            <div className="h-10 bg-cyan-500/5 rounded" />
          </div>
        </div>
      </div>
    );
  }

  if (!fusionData?.unifiedSignal) {
    return (
      <div className="relative rounded-md border border-border/30 p-3">
        <div className="text-center text-muted-foreground text-xs py-4">
          <Activity className="w-4 h-4 mx-auto mb-1 animate-pulse" />
          Loading trade data...
        </div>
      </div>
    );
  }

  const { unifiedSignal, marketHealth, mtfConsensus, directionalProbabilities, volatilityRegime, riskModel, corvonaLevels, forecast, gatingState, monsterGate } = fusionData;
  
  const bestPlayDirection = bestPlayData?.recommendation?.direction;
  const inferredActionFromUnified =
    unifiedSignal.direction === 'bullish' ? 'CALL' : unifiedSignal.direction === 'bearish' ? 'PUT' : 'WAIT';
  const tradeAction = bestPlayDirection === 'CALL' || bestPlayDirection === 'PUT' ? bestPlayDirection : inferredActionFromUnified;
  const isBullish = tradeAction === 'CALL';
  const isBearish = tradeAction === 'PUT';
  const isActive = unifiedSignal.state === 'ACTIVE';
  
  const fusionCurrentPrice = unifiedSignal.currentPrice ?? 0;
  const currentPrice =
    typeof currentPriceOverride === 'number' && Number.isFinite(currentPriceOverride) && currentPriceOverride > 0
      ? currentPriceOverride
      : fusionCurrentPrice;
  const targets = (unifiedSignal.priceTargets?.length ? unifiedSignal.priceTargets : unifiedSignal.targets) || [];
  const stopLoss = unifiedSignal.stopLoss;

  const entryZone = unifiedSignal.entryZone;
  const engineEntryLow = entryZone?.low ?? entryZone?.min;
  const engineEntryHigh = entryZone?.high ?? entryZone?.max;
  
  const entryBuffer = currentPrice * 0.002;
  const rawEntryLow = typeof engineEntryLow === 'number' ? engineEntryLow : currentPrice > 0 ? currentPrice - entryBuffer : null;
  const rawEntryHigh = typeof engineEntryHigh === 'number' ? engineEntryHigh : currentPrice > 0 ? currentPrice + entryBuffer : null;
  const entryLow = rawEntryLow === null ? null : Math.round(rawEntryLow * 100) / 100;
  const entryHigh = rawEntryHigh === null ? null : Math.round(rawEntryHigh * 100) / 100;
  
  const probs = directionalProbabilities ?? unifiedSignal.probabilities;
  const upProb = probs?.up ?? 0;
  const downProb = probs?.down ?? 0;
  const chopProb = probs?.chop ?? 0;
  
  const mtfAlign = normalizePct(mtfConsensus?.alignmentScore, 0) / 100;
  const riskIdx = normalizePct(riskModel?.riskIndex, 0) / 100;
  const volRegime = volatilityRegime?.regime ?? 'normal';
  
  const forecastConf = normalizePct(forecast?.confidence, 50) / 100;
  const gScore = normalizePct(gatingState?.gatingScore, 0) / 100;
  const derivedConfidence = Math.round(((forecastConf * 0.4) + (mtfAlign * 0.3) + (gScore * 0.3)) * 100);
  const confidence = normalizePct(unifiedSignal.confidence, derivedConfidence);
  const failureRiskPct = normalizePct(riskModel?.failureProb, 0);
  const failureRisk = failureRiskPct / 100;
  const rrValue = unifiedSignal.rr && unifiedSignal.rr > 0 ? unifiedSignal.rr : 0;
  const rrNormalized = clamp01(rrValue / 3);
  
  const grade = bestPlayData?.recommendation?.setupGrade;
  const monsterPCE = normalizePct(monsterGate, 0) / 100;
  const shouldGlow = isActive && gScore >= 0.8 && monsterPCE >= 0.55 && (grade === 'GOLD' || grade === 'HOT');

  const reasoning: { label: string; type: 'bullish' | 'bearish' | 'neutral' | 'risk' }[] = [];
  
  if (mtfConsensus?.trendConsensus === 'bullish') {
    reasoning.push({ label: `MTF ${formatPct(mtfAlign)} aligned bullish`, type: 'bullish' });
  } else if (mtfConsensus?.trendConsensus === 'bearish') {
    reasoning.push({ label: `MTF ${formatPct(mtfAlign)} aligned bearish`, type: 'bearish' });
  }
  
  if (forecast?.direction === 'up' && forecastConf > 0.6) {
    reasoning.push({ label: `Forecast UP ${formatPct(forecastConf)}`, type: 'bullish' });
  } else if (forecast?.direction === 'down' && forecastConf > 0.6) {
    reasoning.push({ label: `Forecast DOWN ${formatPct(forecastConf)}`, type: 'bearish' });
  }
  
  if (upProb > 0.5) {
    reasoning.push({ label: `${formatPct(upProb)} bullish probability`, type: 'bullish' });
  } else if (downProb > 0.3) {
    reasoning.push({ label: `${formatPct(downProb)} bearish probability`, type: 'bearish' });
  }
  
  if (riskIdx > 0.6) {
    reasoning.push({ label: `High risk ${formatPct(riskIdx)}`, type: 'risk' });
  }
  
  if (volRegime === 'high' || volRegime === 'climax') {
    reasoning.push({ label: `Volatility ${volRegime}`, type: 'risk' });
  }
  
  if (monsterPCE >= 0.55) {
    reasoning.push({ label: `Monster gate ${formatPct(monsterPCE)}`, type: 'bullish' });
  }

  const momentum = scannerData?.momentumStrength ?? 0;
  const rsi = scannerData?.rsiValue ?? marketHealth?.rsi?.value ?? 50;
  const breakoutScore = scannerData?.breakoutScore ?? 0;
  const volumeSpike = scannerData?.volumeSpike ?? 0;
  const compressionPhase = (scannerData?.compression?.phase || '').toUpperCase();
  const rangePctRaw = scannerData?.compression?.rangePct;
  const rangePctValue = typeof rangePctRaw === 'number' ? rangePctRaw : parseFloat(rangePctRaw ?? '0');
  const safeRangePct = Number.isFinite(rangePctValue) ? Math.max(0, rangePctValue) : 0;
  const chopRangeDollars = currentPrice > 0 ? (currentPrice * safeRangePct) / 100 : 0;
  const breakoutTag = String(scannerData?.breakoutSignal || '').toUpperCase();
  const brokeOutsideRange = breakoutTag === 'BREAKOUT' || breakoutTag === 'BREAKDOWN' || breakoutTag === 'EXPANSION';
  const compressionScore = Math.max(0, Math.min(100, 100 - safeRangePct * 45));
  const priceActionGauge = Math.round(Math.max(0, Math.min(100, compressionScore + (brokeOutsideRange ? 20 : 0))));
  const priceActionGlow: 'red' | 'emerald' | 'cyan' | 'amber' = brokeOutsideRange
    ? (breakoutTag === 'BREAKDOWN' ? 'red' : 'emerald')
    : compressionPhase === 'COMPRESSION' || chopRangeDollars <= 2
    ? 'cyan'
    : 'amber';
  const priceActionText = brokeOutsideRange
    ? `CHOP $${chopRangeDollars.toFixed(2)} → ${breakoutTag}`
    : `CHOP $${chopRangeDollars.toFixed(2)} • ${compressionPhase || 'RANGE'}`;
  const trendSpeed = Math.min(
    100,
    Math.max(
      0,
      Math.round(Math.abs(momentum) * 0.55 + breakoutScore * 0.35 + (mtfAlign * 100) * 0.1)
    )
  );
  const entryMid = entryLow !== null && entryHigh !== null ? (entryLow + entryHigh) / 2 : currentPrice;
  const entryDriftPct = currentPrice > 0 && entryLow !== null && entryHigh !== null ? Math.abs(currentPrice - entryMid) / currentPrice * 100 : 0;
  const stopRiskPct = typeof stopLoss === 'number' && currentPrice > 0 ? Math.abs(currentPrice - stopLoss) / currentPrice * 100 : 0;
  const t1RewardPct = typeof targets[0] === 'number' && currentPrice > 0 ? Math.abs(targets[0] - currentPrice) / currentPrice * 100 : 0;
  const highProbContract = normalizePct(bestPlayData?.recommendation?.expectedWinRate ?? bestPlayData?.recommendation?.confidence, confidence);
  const entryFit = clamp01((100 - entryDriftPct * 150) / 100);
  const stopRiskNormalized = clamp01(stopRiskPct / 3);
  const t1RewardNormalized = clamp01(t1RewardPct / 3);
  const highProbNormalized = clamp01(highProbContract / 100);
  const momentumNormalized = clamp01(Math.abs(momentum) / 100);
  const breakoutNormalized = clamp01(breakoutScore / 100);
  const trendSpeedNormalized = clamp01(trendSpeed / 100);
  const confidenceArchColor: 'cyan' | 'emerald' | 'amber' | 'red' =
    confidence >= 72 ? 'emerald' : confidence >= 50 ? 'amber' : confidence >= 35 ? 'cyan' : 'red';
  const targetChipClass = shouldGlow
    ? "border-amber-400/50 bg-amber-500/15 text-amber-200 shadow-[0_0_10px_rgba(251,191,36,0.45)]"
    : isBullish
    ? "border-emerald-400/45 bg-emerald-500/15 text-emerald-200 shadow-[0_0_10px_rgba(16,185,129,0.4)]"
    : isBearish
    ? "border-red-400/45 bg-red-500/15 text-red-200 shadow-[0_0_10px_rgba(239,68,68,0.4)]"
    : "border-cyan-400/45 bg-cyan-500/15 text-cyan-200 shadow-[0_0_10px_rgba(34,211,238,0.4)]";
  const targetValueClass = shouldGlow
    ? "text-amber-200 drop-shadow-[0_0_10px_rgba(251,191,36,0.5)]"
    : isBullish
    ? "text-emerald-200 drop-shadow-[0_0_10px_rgba(16,185,129,0.45)]"
    : isBearish
    ? "text-red-200 drop-shadow-[0_0_10px_rgba(239,68,68,0.45)]"
    : "text-cyan-200 drop-shadow-[0_0_10px_rgba(34,211,238,0.45)]";

  const borderGlowClass = cn(
    "relative rounded-md transition-all duration-500 overflow-hidden",
    shouldGlow && "shadow-[0_0_22px_rgba(251,191,36,0.42),inset_0_0_22px_rgba(251,191,36,0.12)]",
    isBullish && "shadow-[0_0_18px_rgba(16,185,129,0.36),inset_0_0_18px_rgba(16,185,129,0.06)]",
    isBearish && "shadow-[0_0_18px_rgba(239,68,68,0.36),inset_0_0_18px_rgba(239,68,68,0.06)]",
    !shouldGlow && !isBullish && !isBearish && "shadow-[0_0_8px_rgba(100,116,139,0.15)]"
  );

  const borderColorClass = cn(
    "absolute inset-0 rounded-md pointer-events-none",
    isBullish && "border border-emerald-500/55",
    isBearish && "border border-red-500/55",
    !shouldGlow && !isBullish && !isBearish && "border border-border/40"
  );

  return (
    <div className={borderGlowClass} data-testid="trade-analysis-panel">
      <div className={borderColorClass} />
      <div className="absolute inset-0 rounded-md pointer-events-none opacity-40 bg-[radial-gradient(ellipse_at_20%_10%,rgba(34,211,238,0.15),transparent_55%),radial-gradient(ellipse_at_80%_90%,rgba(168,85,247,0.12),transparent_55%)]" />
      <div className="absolute -inset-16 pointer-events-none opacity-25 bg-[conic-gradient(from_180deg_at_50%_50%,rgba(34,211,238,0.22),transparent_20%,rgba(168,85,247,0.18),transparent_55%,rgba(16,185,129,0.2),transparent_85%)] animate-[spin_18s_linear_infinite]" />
      
      <div className="absolute inset-0 rounded-md overflow-hidden pointer-events-none">
        <div className={cn(
          "absolute inset-0 opacity-[0.03]",
          "bg-[repeating-linear-gradient(0deg,transparent,transparent_2px,currentColor_2px,currentColor_3px)]",
          shouldGlow && "text-amber-400",
          !shouldGlow && isBullish && "text-emerald-400",
          !shouldGlow && isBearish && "text-red-400",
          !shouldGlow && !isBullish && !isBearish && "text-slate-400"
        )} />
      </div>

      <div className={cn(
        "h-0.5 rounded-t-md",
        isBullish && "bg-gradient-to-r from-emerald-600 via-emerald-400 to-teal-400",
        isBearish && "bg-gradient-to-r from-red-600 via-red-400 to-rose-400",
        !shouldGlow && !isBullish && !isBearish && "bg-gradient-to-r from-slate-600 via-slate-400 to-slate-600"
      )} />
      
      <div className="relative p-2 space-y-1.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.15em]">
            {shouldGlow && <Flame className="w-3 h-3 text-amber-400 animate-pulse" />}
            <Activity className={cn(
              "w-3 h-3",
              shouldGlow && "text-amber-400",
              !shouldGlow && isBullish && "text-emerald-400",
              !shouldGlow && isBearish && "text-red-400",
              !shouldGlow && !isBullish && !isBearish && "text-muted-foreground"
            )} />
            <span className="text-foreground/80">TRADE</span>
            <span className="text-muted-foreground/50">|</span>
            <span className={cn(
              shouldGlow && "text-amber-400",
              !shouldGlow && isBullish && "text-emerald-400",
              !shouldGlow && isBearish && "text-red-400",
              !shouldGlow && !isBullish && !isBearish && "text-muted-foreground"
            )}>{symbol}</span>
          </div>
          
          <div className="flex items-center gap-1.5">
            <Badge 
              variant="outline"
              className={cn(
                "text-[9px] font-bold px-1.5 py-0",
                isActive 
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                  : "bg-muted/50 text-muted-foreground border-border"
              )}
            >
              {unifiedSignal.state}
            </Badge>
            {bestPlayData?.recommendation && (
              <Badge 
                className={cn(
                  "text-[9px] font-bold px-1.5 py-0",
                  bestPlayData.recommendation.setupGrade === 'GOLD' && "bg-yellow-500/20 text-yellow-400 border-yellow-500/40",
                  bestPlayData.recommendation.setupGrade === 'HOT' && "bg-amber-500/20 text-amber-400 border-amber-500/40",
                  bestPlayData.recommendation.setupGrade === 'READY' && "bg-emerald-500/20 text-emerald-400 border-emerald-500/40",
                  bestPlayData.recommendation.setupGrade === 'BUILDING' && "bg-blue-500/20 text-blue-400 border-blue-500/40",
                  bestPlayData.recommendation.setupGrade === 'WAIT' && "bg-muted/50 text-muted-foreground border-border"
                )}
                data-testid="badge-setup-grade"
              >
                {bestPlayData.recommendation.setupGrade}
              </Badge>
            )}
          </div>
        </div>

        <div className={cn(corvonaLevels && "hidden")}>
        {(() => {
          const direction = bestPlayDirection ?? (isBullish ? 'CALL' : isBearish ? 'PUT' : 'WAIT');
          const almostReady = isActive && (gScore >= 0.7 || monsterPCE >= 0.45) && (grade === 'READY' || grade === 'HOT');
          
          if (shouldGlow) {
            return (
              <div className="relative p-3 rounded overflow-hidden" data-testid="master-signal">
                <div className="absolute inset-0 bg-gradient-to-r from-amber-500/18 via-yellow-500/12 to-orange-500/18" />
                <div className="absolute inset-0 border border-amber-400/50 rounded" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(251,191,36,0.18),transparent_60%)]" />
                <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-amber-400 to-transparent" />
                <div className="relative flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded flex items-center justify-center bg-amber-500/20 shadow-[0_0_12px_rgba(251,191,36,0.45)] animate-pulse">
                      <CheckCircle className="w-5 h-5 text-amber-400" />
                    </div>
                    <div>
                      <div className="text-lg font-black text-amber-300 tracking-tight drop-shadow-[0_0_10px_rgba(251,191,36,0.45)]">
                        TAKE {direction}
                      </div>
                      <div className="text-[10px] text-amber-300/70">
                        {grade} | Gate {Math.round(gScore * 100)}% | Mon {Math.round(monsterPCE * 100)}%
                      </div>
                    </div>
                  </div>
                  {bestPlayData?.recommendation?.contract && (
                    <div className="text-right">
                      <div className="text-xs text-muted-foreground">Strike</div>
                      <div className="text-lg font-bold font-mono text-amber-400">
                        ${bestPlayData.recommendation.contract.strike}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          } else if (almostReady) {
            return (
              <div className="relative p-2.5 rounded overflow-hidden" data-testid="master-signal">
                <div className="absolute inset-0 bg-amber-500/5 border border-amber-500/30 rounded" />
                <div className="relative flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400 flex-shrink-0" />
                  <div>
                    <div className="text-sm font-bold text-amber-400">ALMOST - {direction}</div>
                    <div className="text-[9px] text-amber-300/60">
                      Gate {Math.round(gScore * 100)}% | Mon {Math.round(monsterPCE * 100)}% | {grade}
                    </div>
                  </div>
                </div>
              </div>
            );
          } else {
            return (
              <div className="relative p-2.5 rounded overflow-hidden" data-testid="master-signal">
                <div className="absolute inset-0 bg-muted/20 border border-border/40 rounded" />
                <div className="relative flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-muted-foreground">WAIT - Building</div>
                    <div className="text-[9px] text-muted-foreground/60">
                      {!isActive && 'Inactive | '}
                      {gScore < 0.8 && `Gate ${Math.round(gScore * 100)}% | `}
                      {monsterPCE < 0.55 && `Mon ${Math.round(monsterPCE * 100)}% | `}
                      {grade && grade !== 'GOLD' && grade !== 'HOT' && grade}
                    </div>
                  </div>
                </div>
              </div>
            );
          }
        })()}
        </div>

        <div className={cn("flex items-center gap-2", corvonaLevels && "hidden")}>
          <div className={cn(
            "flex items-center gap-2 p-2 rounded flex-1 relative overflow-hidden border",
            shouldGlow && "bg-amber-500/10",
            !shouldGlow && isBullish && "bg-emerald-500/[0.08]",
            !shouldGlow && isBearish && "bg-red-500/[0.08]",
            !shouldGlow && !isBullish && !isBearish && "bg-muted/20",
            shouldGlow && "border-amber-400/35 shadow-[0_0_14px_rgba(251,191,36,0.24)]",
            !shouldGlow && isBullish && "border-emerald-400/30 shadow-[0_0_12px_rgba(16,185,129,0.22)]",
            !shouldGlow && isBearish && "border-red-400/30 shadow-[0_0_12px_rgba(239,68,68,0.22)]",
            !shouldGlow && !isBullish && !isBearish && "border-border/30"
          )}>
            <div className={cn(
              "absolute inset-0 border rounded",
              shouldGlow && "border-amber-500/30",
              !shouldGlow && isBullish && "border-emerald-500/25",
              !shouldGlow && isBearish && "border-red-500/25",
              !shouldGlow && !isBullish && !isBearish && "border-border/30"
            )} />
            <div className={cn(
              "relative w-9 h-9 rounded flex items-center justify-center",
              shouldGlow && "bg-amber-500/20",
              !shouldGlow && isBullish && "bg-emerald-500/15",
              !shouldGlow && isBearish && "bg-red-500/15",
              !shouldGlow && !isBullish && !isBearish && "bg-muted/30"
            )}>
              {isBullish && <TrendingUp className={cn("w-5 h-5", shouldGlow ? "text-amber-400" : "text-emerald-400")} />}
              {isBearish && <TrendingDown className="w-5 h-5 text-red-400" />}
              {!isBullish && !isBearish && <Minus className="w-5 h-5 text-muted-foreground" />}
            </div>
            <div className="relative">
              <div className={cn(
                "text-lg font-black tracking-tight drop-shadow-[0_0_8px_rgba(255,255,255,0.18)]",
                shouldGlow && "text-amber-400",
                !shouldGlow && isBullish && "text-emerald-400",
                !shouldGlow && isBearish && "text-red-400",
                !shouldGlow && !isBullish && !isBearish && "text-muted-foreground"
              )} data-testid="text-trade-action">
                {tradeAction}
              </div>
              <div className="text-[8px] text-muted-foreground uppercase tracking-[0.15em]">
                0DTE Direction
              </div>
            </div>
          </div>
          
          <div className="text-right">
            <div className="text-[8px] text-muted-foreground uppercase tracking-[0.15em]">Conf</div>
            <div className={cn(
              "text-xl font-black font-mono",
              confidence >= 65 && "text-emerald-400",
              confidence >= 45 && confidence < 65 && "text-amber-400",
              confidence < 45 && "text-red-400"
            )}>
              {confidence}%
            </div>
          </div>
        </div>

        <div className={cn("grid grid-cols-1 gap-1 sm:grid-cols-3", corvonaLevels && "hidden")}>
          <FuturisticLineMeter
            label="Signal Confidence"
            value={confidence / 100}
            tone={confidence >= 70 ? 'emerald' : confidence >= 50 ? 'amber' : 'red'}
            display={`${confidence}%`}
          />
          <FuturisticLineMeter
            label="Failure Risk"
            value={failureRisk}
            tone={failureRisk >= 0.6 ? 'red' : failureRisk >= 0.35 ? 'amber' : 'emerald'}
            display={`${failureRiskPct}%`}
          />
          <FuturisticLineMeter
            label="R:R Strength"
            value={rrNormalized}
            tone={rrValue >= 2 ? 'emerald' : rrValue >= 1 ? 'amber' : rrValue > 0 ? 'red' : 'slate'}
            display={rrValue > 0 ? `1:${rrValue.toFixed(1)}` : '—'}
          />
        </div>

        <div className={cn("flex items-center justify-between rounded-lg border border-border/40 bg-background/35 px-2 py-1.5 text-[10px] uppercase tracking-wider", corvonaLevels && "hidden")}>
          <span className="text-white/45">Signal State</span>
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              unifiedSignal.state === 'ACTIVE' && "border-emerald-500/35 bg-emerald-500/15 text-emerald-300",
              unifiedSignal.state === 'INACTIVE' && "border-amber-500/35 bg-amber-500/15 text-amber-300",
              unifiedSignal.state === 'STALE' && "border-red-500/35 bg-red-500/15 text-red-300"
            )}
          >
            {unifiedSignal.state}
          </Badge>
        </div>

        <div className={cn("relative overflow-hidden rounded-md", corvonaLevels && "hidden")}>
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.14),transparent_60%)]" />
          <FuturisticArchGauge
            label="Confidence Arc"
            value={confidence}
            min={0}
            max={100}
            color={confidenceArchColor}
            valueLabel={`${confidence}%`}
            reticle
          />
        </div>

        <div className={cn("grid grid-cols-1 md:grid-cols-2 gap-1", corvonaLevels && "hidden")}>
          <FuturisticArchGauge
            label="Momentum"
            value={momentum}
            min={-100}
            max={100}
            color={momentum >= 0 ? 'emerald' : 'red'}
            valueLabel={`${momentum > 0 ? '+' : ''}${momentum.toFixed(0)}`}
          />
          <FuturisticArchGauge
            label="RSI"
            value={rsi}
            min={0}
            max={100}
            color={rsi >= 70 ? 'red' : rsi <= 30 ? 'emerald' : 'amber'}
            valueLabel={rsi.toFixed(0)}
          />
          <FuturisticArchGauge
            label="Breakout"
            value={breakoutScore}
            min={0}
            max={100}
            color={breakoutScore >= 70 ? 'emerald' : breakoutScore >= 40 ? 'amber' : 'cyan'}
            valueLabel={`${breakoutScore.toFixed(0)}`}
          />
          <FuturisticArchGauge
            label="Volume"
            value={volumeSpike}
            min={0}
            max={2}
            color={volumeSpike >= 1.5 ? 'emerald' : volumeSpike >= 1 ? 'amber' : 'red'}
            valueLabel={`${volumeSpike > 0 ? volumeSpike.toFixed(1) : '0.0'}x`}
          />
        </div>



        <div className={cn("grid grid-cols-3 gap-1", corvonaLevels && "hidden")}>
          <div className="relative p-1.5 rounded text-center overflow-hidden">
            <div className="absolute inset-0 bg-emerald-500/8 border border-emerald-500/25 rounded shadow-[inset_0_0_8px_rgba(16,185,129,0.16)]" />
            <div className="relative">
              <div className="flex items-center justify-center gap-0.5 text-[8px] text-emerald-400/60 uppercase mb-0.5">
                <ArrowUpRight className="w-2.5 h-2.5" />
                Bull
              </div>
              <div className="font-mono font-black text-sm text-emerald-300 drop-shadow-[0_0_8px_rgba(16,185,129,0.4)]">{formatPct(upProb)}</div>
            </div>
          </div>
          <div className="relative p-1.5 rounded text-center overflow-hidden">
            <div className="absolute inset-0 bg-amber-500/8 border border-amber-500/25 rounded shadow-[inset_0_0_8px_rgba(245,158,11,0.16)]" />
            <div className="relative">
              <div className="flex items-center justify-center gap-0.5 text-[8px] text-amber-400/60 uppercase mb-0.5">
                <BarChart3 className="w-2.5 h-2.5" />
                Chop
              </div>
              <div className="font-mono font-black text-sm text-amber-300 drop-shadow-[0_0_8px_rgba(245,158,11,0.4)]">{formatPct(chopProb)}</div>
            </div>
          </div>
          <div className="relative p-1.5 rounded text-center overflow-hidden">
            <div className="absolute inset-0 bg-red-500/8 border border-red-500/25 rounded shadow-[inset_0_0_8px_rgba(239,68,68,0.16)]" />
            <div className="relative">
              <div className="flex items-center justify-center gap-0.5 text-[8px] text-red-400/60 uppercase mb-0.5">
                <ArrowDownRight className="w-2.5 h-2.5" />
                Bear
              </div>
              <div className="font-mono font-black text-sm text-red-300 drop-shadow-[0_0_8px_rgba(239,68,68,0.42)]">{formatPct(downProb)}</div>
            </div>
          </div>
        </div>

        <div className={cn("grid grid-cols-3 gap-1", corvonaLevels && "hidden")}>
          <div className="relative p-2 rounded overflow-hidden">
            <div className="absolute inset-0 bg-blue-500/[0.08] border border-blue-500/25 rounded" />
            <div className="relative">
              <div className="flex items-center gap-0.5 text-[8px] text-blue-400 uppercase tracking-wider mb-1">
                <Crosshair className="w-2.5 h-2.5" />
                Entry
              </div>
              <div className="font-mono font-semibold text-sm text-blue-300" data-testid="text-entry-zone">
                {formatPrice(entryLow)} - {formatPrice(entryHigh)}
              </div>
              <div className="text-[8px] text-blue-400/50 mt-0.5">±0.2% spot</div>
            </div>
          </div>
          
          <div className="relative p-2 rounded overflow-hidden">
            <div className="absolute inset-0 bg-red-500/[0.08] border border-red-500/25 rounded" />
            <div className="relative">
              <div className="flex items-center gap-0.5 text-[8px] text-red-400 uppercase tracking-wider mb-1">
                <Shield className="w-2.5 h-2.5" />
                Stop
              </div>
              <div className="font-mono font-semibold text-sm text-red-400" data-testid="text-stop-loss">
                {formatPrice(stopLoss)}
              </div>
              {stopLoss && currentPrice > 0 && (
                <div className="text-[8px] text-red-400/50 mt-0.5">
                  {((Math.abs(currentPrice - stopLoss) / currentPrice) * 100).toFixed(1)}% risk
                </div>
              )}
            </div>
          </div>
          
          <div className="relative p-2 rounded overflow-hidden">
            <div className="absolute inset-0 bg-emerald-500/[0.08] border border-emerald-500/25 rounded" />
            <div className="relative">
              <div className="flex items-center gap-0.5 text-[8px] text-emerald-400 uppercase tracking-wider mb-1">
                <Target className="w-2.5 h-2.5" />
                Targets
              </div>
              <div className="space-y-0.5" data-testid="text-targets">
                {targets.length > 0 ? (
                  <>
                    <div className="flex items-center justify-between rounded border border-emerald-500/30 bg-emerald-500/10 px-1 py-0.5">
                      <span className={cn("inline-flex items-center gap-1 rounded-full border px-1 py-0.5 text-[8px] font-black tracking-[0.14em]", targetChipClass)}>
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                        PT1 LOCK
                      </span>
                      <span className={cn("font-mono font-black text-sm", targetValueClass)}>{formatPrice(targets[0])}</span>
                    </div>
                    {targets.length > 1 && (
                      <div className="flex items-center justify-between rounded border border-emerald-500/25 bg-emerald-500/8 px-1 py-0.5">
                        <span className={cn("inline-flex items-center gap-1 rounded-full border px-1 py-0.5 text-[8px] font-black tracking-[0.14em]", targetChipClass)}>
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                          PT2 LOCK
                        </span>
                        <span className={cn("font-mono font-black text-sm", targetValueClass)}>{formatPrice(targets[1])}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <span className="font-mono text-sm text-muted-foreground">—</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {bestPlayData?.recommendation?.contract && (
          <div className={cn(
            "relative p-2.5 rounded overflow-hidden",
            corvonaLevels && "hidden"
          )} data-testid="section-0dte-recommendation">
            <div className={cn(
              "absolute inset-0 rounded border",
              bestPlayData.recommendation.direction === 'CALL' && "bg-gradient-to-r from-emerald-500/10 to-emerald-500/5 border-emerald-500/30",
              bestPlayData.recommendation.direction === 'PUT' && "bg-gradient-to-r from-red-500/10 to-red-500/5 border-red-500/30"
            )} />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.14),transparent_62%)]" />
            <div className="relative">
              <div className="flex items-center gap-1.5 mb-2">
                <Badge 
                  variant="outline"
                  className={cn(
                    "text-[9px] font-black px-1.5 py-0",
                    bestPlayData.recommendation.direction === 'CALL' && "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
                    bestPlayData.recommendation.direction === 'PUT' && "bg-red-500/20 text-red-400 border-red-500/30"
                  )}
                >
                  0DTE {bestPlayData.recommendation.direction}S
                </Badge>
                <span className="text-[8px] text-muted-foreground uppercase tracking-wider">Best Play</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5">
                <div className="text-center p-1.5 rounded bg-background/50 border border-border/30">
                  <div className="text-[8px] text-muted-foreground uppercase mb-0.5">Strike</div>
                  <div className={cn(
                    "font-mono font-bold text-sm",
                    bestPlayData.recommendation.direction === 'CALL' ? "text-emerald-400" : "text-red-400"
                  )}>
                    ${bestPlayData.recommendation.contract.strike}
                  </div>
                  <div className="text-[7px] text-muted-foreground">{'\u03B4'}{bestPlayData.recommendation.contract.delta?.toFixed(2)}</div>
                </div>
                <div className="text-center p-1.5 rounded bg-background/50 border border-border/30">
                  <div className="text-[8px] text-muted-foreground uppercase mb-0.5">Entry</div>
                  <div className={cn(
                    "font-mono font-bold text-sm",
                    bestPlayData.recommendation.direction === 'CALL' ? "text-emerald-400" : "text-red-400"
                  )}>
                    ${bestPlayData.recommendation.contract.mid?.toFixed(2)}
                  </div>
                  <div className="text-[7px] text-muted-foreground">Spd {bestPlayData.recommendation.contract.spreadPct?.toFixed(1)}%</div>
                </div>
                <div className="text-center p-1.5 rounded bg-background/50 border border-amber-500/20">
                  <div className="text-[8px] text-amber-400 uppercase mb-0.5">Vol</div>
                  <div className="font-mono font-bold text-sm text-amber-400">
                    {bestPlayData.recommendation.contract.volume?.toLocaleString()}
                  </div>
                  <div className="text-[7px] text-muted-foreground">Liq</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {corvonaLevels && (
          <div className="relative flex flex-row items-stretch rounded-xl overflow-visible mt-1 mb-0.5 border border-cyan-500/25 bg-gradient-to-br from-slate-950/95 via-slate-900/85 to-cyan-950/35 shadow-[0_0_20px_rgba(34,211,238,0.2),inset_0_0_16px_rgba(34,211,238,0.1)]" style={{ minHeight: 112 }} data-testid="section-pivots-futuristic">
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute left-0 right-0 top-1 h-[1px] bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent animate-pulse" />
              <div className="absolute left-2 top-2 w-2 h-2 border-l border-t border-cyan-300/70" />
              <div className="absolute right-2 top-2 w-2 h-2 border-r border-t border-cyan-300/70" />
            </div>
            {/* Left: Support as vertical neon meter */}
            <div className="flex flex-col justify-between items-center pr-2 relative z-10">
              {["L4", "L3", "L2", "L1"].map((level) => {
                const broken = currentPrice < corvonaLevels[level as keyof typeof corvonaLevels];
                return (
                <div key={level} className="flex flex-col items-center mb-1.5">
                  <div className={cn(
                    "w-2 h-10 rounded-full border-2 relative overflow-hidden",
                    broken
                      ? "bg-gradient-to-b from-red-900 via-red-500/70 to-red-300/80 border-red-400 shadow-[0_0_12px_3px_rgba(248,113,113,0.7)]"
                      : isBearish
                      ? "bg-gradient-to-b from-red-950 via-red-600/60 to-red-300/75 border-red-400 shadow-[0_0_10px_2px_rgba(248,113,113,0.6)]"
                      : isBullish
                      ? "bg-gradient-to-b from-emerald-950 via-emerald-600/60 to-emerald-300/75 border-emerald-400 shadow-[0_0_10px_2px_rgba(16,185,129,0.6)]"
                      : "bg-gradient-to-b from-cyan-900 via-cyan-500/60 to-cyan-300/80 border-cyan-400 shadow-[0_0_8px_2px_rgba(34,211,238,0.5)]"
                  )}>
                    <div
                      className={cn(
                        "absolute left-0 right-0 bottom-0 animate-pulse",
                        broken ? "bg-red-300/70" : isBullish ? "bg-emerald-300/65" : isBearish ? "bg-red-300/65" : "bg-cyan-400/60"
                      )}
                      style={{ height: broken || isBullish || isBearish ? '100%' : '0%' }}
                    />
                  </div>
                  <div className={cn("text-[8px] font-mono mt-1", broken ? "text-red-300" : isBearish ? "text-red-300" : isBullish ? "text-emerald-300" : "text-cyan-300")}>{level}</div>
                  <div className={cn("text-[8px] font-mono", broken ? "text-red-100" : isBearish ? "text-red-100" : isBullish ? "text-emerald-100" : "text-cyan-100")}>{formatPrice(corvonaLevels[level as keyof typeof corvonaLevels])}</div>
                </div>
              )})}
            </div>
            {/* Center: Current price and digital readout */}
            <div className="flex-1 flex flex-col items-center justify-center px-1.5 relative z-0">
              <div className="w-full relative overflow-hidden rounded-lg border border-cyan-400/40 bg-gradient-to-br from-slate-950/95 via-cyan-950/35 to-slate-950/95 p-1.5 shadow-[0_0_20px_rgba(34,211,238,0.28),inset_0_0_14px_rgba(34,211,238,0.16)]">
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute left-0 right-0 top-2 h-[1px] bg-gradient-to-r from-transparent via-cyan-300/65 to-transparent" />
                  <div className="absolute left-0 right-0 bottom-2 h-[1px] bg-gradient-to-r from-transparent via-fuchsia-300/55 to-transparent" />
                  <div className="absolute top-0 bottom-0 left-1/2 w-[1px] -translate-x-1/2 bg-gradient-to-b from-transparent via-cyan-300/30 to-transparent" />
                  <div className="absolute left-1 top-1 w-2 h-2 border-l border-t border-cyan-300/70" />
                  <div className="absolute right-1 top-1 w-2 h-2 border-r border-t border-cyan-300/70" />
                </div>
                <div className="grid grid-cols-[auto_1fr_auto] items-center gap-1 mb-1">
                  <div className={cn("text-lg font-black drop-shadow-[0_0_10px_rgba(255,255,255,0.18)]", isBullish ? "text-emerald-400" : isBearish ? "text-red-400" : "text-amber-400")}>{tradeAction}</div>
                  <div className="text-center text-3xl font-black font-mono text-cyan-100 drop-shadow-[0_0_14px_rgba(34,211,238,0.75)] tracking-tight">{formatPrice(currentPrice)}</div>
                  <div className={cn("text-lg font-black font-mono", confidence >= 65 ? "text-emerald-400" : confidence >= 45 ? "text-amber-400" : "text-red-400")}>{confidence}%</div>
                </div>

                <div className="mb-1 grid grid-cols-3 gap-1">
                  <div className="rounded border border-fuchsia-500/30 bg-fuchsia-500/10 p-1 text-center">
                    <div className="text-[8px] uppercase text-fuchsia-300">Gate</div>
                    <div className="text-[10px] font-mono font-black text-fuchsia-100">{Math.round(gScore * 100)}%</div>
                  </div>
                  <div className="rounded border border-cyan-500/30 bg-cyan-500/10 p-1 text-center">
                    <div className="text-[8px] uppercase text-cyan-300">Monster</div>
                    <div className="text-[10px] font-mono font-black text-cyan-100">{Math.round(monsterPCE * 100)}%</div>
                  </div>
                  <div className="rounded border border-amber-500/30 bg-amber-500/10 p-1 text-center">
                    <div className="text-[8px] uppercase text-amber-300">Grade</div>
                    <div className="text-[10px] font-mono font-black text-amber-100">{grade ?? 'WAIT'}</div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-1 mb-1">
                  <div className="rounded border border-blue-500/30 bg-blue-500/10 p-1">
                    <div className="text-[9px] uppercase text-blue-300">Entry</div>
                    <div className="text-sm font-mono font-black text-blue-200">{formatPrice(entryLow)}-{formatPrice(entryHigh)}</div>
                  </div>
                  <div className="rounded border border-red-500/30 bg-red-500/10 p-1">
                    <div className="text-[9px] uppercase text-red-300">Stop</div>
                    <div className="text-sm font-mono font-black text-red-200">{formatPrice(stopLoss)}</div>
                  </div>
                  <div className="rounded border border-emerald-500/30 bg-emerald-500/10 p-1">
                    <div className="text-[9px] uppercase text-emerald-300">PT Targets</div>
                    <div className="mt-0.5 space-y-0.5">
                      <div className="flex items-center justify-between rounded border border-emerald-500/30 bg-emerald-500/10 px-1 py-0.5">
                        <span className={cn("inline-flex items-center gap-1 rounded-full border px-1 py-0.5 text-[8px] font-black tracking-[0.14em]", targetChipClass)}>
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                          PT1
                        </span>
                        <span className={cn("text-[11px] font-mono font-black", targetValueClass)}>{targets[0] ? formatPrice(targets[0]) : '—'}</span>
                      </div>
                      <div className="flex items-center justify-between rounded border border-emerald-500/25 bg-emerald-500/8 px-1 py-0.5">
                        <span className={cn("inline-flex items-center gap-1 rounded-full border px-1 py-0.5 text-[8px] font-black tracking-[0.14em]", targetChipClass)}>
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
                          PT2
                        </span>
                        <span className={cn("text-[11px] font-mono font-black", targetValueClass)}>{targets[1] ? formatPrice(targets[1]) : '—'}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-1 mb-1">
                  <FuturisticLineMeter
                    label="Entry Fit"
                    value={entryFit}
                    tone="cyan"
                    display={`${entryDriftPct.toFixed(2)}%`}
                  />
                  <FuturisticLineMeter
                    label="Stop Risk"
                    value={stopRiskNormalized}
                    tone={stopRiskPct > 1.5 ? 'red' : 'amber'}
                    display={`${stopRiskPct.toFixed(2)}%`}
                  />
                  <FuturisticLineMeter
                    label="PT Strength"
                    value={t1RewardNormalized}
                    tone={t1RewardPct > 1.5 ? 'emerald' : 'amber'}
                    display={`${t1RewardPct.toFixed(2)}%`}
                  />
                  <FuturisticLineMeter
                    label="High-Prob"
                    value={highProbNormalized}
                    tone={highProbContract >= 70 ? 'emerald' : highProbContract >= 50 ? 'amber' : 'red'}
                    display={`${Math.round(highProbContract)}%`}
                  />
                </div>

                <div className="grid grid-cols-4 gap-1 mb-1">
                  <FuturisticLineMeter
                    label="Price Action"
                    value={priceActionGauge / 100}
                    tone={priceActionGlow}
                    display={priceActionText}
                  />
                  <FuturisticLineMeter
                    label="MOM Gauge"
                    value={momentumNormalized}
                    tone={momentum >= 0 ? 'emerald' : 'red'}
                    display={`${momentum > 0 ? '+' : ''}${momentum.toFixed(0)}`}
                  />
                  <FuturisticLineMeter
                    label="BRK Gauge"
                    value={breakoutNormalized}
                    tone={breakoutScore >= 60 ? 'emerald' : breakoutScore >= 40 ? 'amber' : 'red'}
                    display={`${breakoutScore.toFixed(0)}%`}
                  />
                  <FuturisticLineMeter
                    label="Trend Speed"
                    value={trendSpeedNormalized}
                    tone={trendSpeed >= 65 ? 'emerald' : trendSpeed >= 40 ? 'amber' : 'red'}
                    display={`${trendSpeed}%`}
                  />
                </div>

                {bestPlayData?.recommendation?.contract && (
                  <div className="rounded border border-amber-500/35 bg-amber-500/10 p-1 mb-1">
                    <div className="text-[8px] uppercase tracking-wider text-amber-300 mb-0.5">High Probability Contract</div>
                    <div className="grid grid-cols-3 gap-1">
                      <div>
                        <div className="text-[8px] text-muted-foreground">Strike</div>
                        <div className="text-xs font-mono font-bold text-amber-200">${bestPlayData.recommendation.contract.strike}</div>
                      </div>
                      <div>
                        <div className="text-[8px] text-muted-foreground">Entry</div>
                        <div className="text-xs font-mono font-bold text-amber-200">${bestPlayData.recommendation.contract.mid?.toFixed(2)}</div>
                      </div>
                      <div>
                        <div className="text-[8px] text-muted-foreground">Volume</div>
                        <div className="text-xs font-mono font-bold text-amber-200">{bestPlayData.recommendation.contract.volume?.toLocaleString()}</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-4 gap-1">
                  <div className="rounded border border-cyan-500/25 bg-cyan-500/8 p-1 text-center">
                    <div className="text-[7px] text-cyan-300">MOM</div>
                    <div className={cn("text-[10px] font-mono font-bold", momentum >= 0 ? "text-emerald-300" : "text-red-300")}>{momentum > 0 ? '+' : ''}{momentum.toFixed(0)}</div>
                  </div>
                  <div className="rounded border border-amber-500/25 bg-amber-500/8 p-1 text-center">
                    <div className="text-[7px] text-amber-300">RSI</div>
                    <div className="text-[10px] font-mono font-bold text-amber-200">{rsi.toFixed(0)}</div>
                  </div>
                  <div className="rounded border border-purple-500/25 bg-purple-500/8 p-1 text-center">
                    <div className="text-[7px] text-fuchsia-300">BRK</div>
                    <div className="text-[10px] font-mono font-bold text-fuchsia-200">{breakoutScore.toFixed(0)}</div>
                  </div>
                  <div className="rounded border border-sky-500/25 bg-sky-500/8 p-1 text-center">
                    <div className="text-[7px] text-sky-300">VOL</div>
                    <div className="text-[10px] font-mono font-bold text-sky-200">{volumeSpike.toFixed(1)}x</div>
                  </div>
                </div>
              </div>
            </div>
            {/* Right: Resistance as vertical neon meter */}
            <div className="flex flex-col justify-between items-center pl-2 relative z-10">
              {["H1", "H2", "H3", "H4"].map((level) => {
                const broken = currentPrice > corvonaLevels[level as keyof typeof corvonaLevels];
                return (
                <div key={level} className="flex flex-col items-center mb-1.5">
                  <div className={cn(
                    "w-2 h-10 rounded-full border-2 relative overflow-hidden",
                    broken
                      ? "bg-gradient-to-b from-emerald-900 via-emerald-500/70 to-emerald-300/80 border-emerald-400 shadow-[0_0_12px_3px_rgba(16,185,129,0.75)]"
                      : isBullish
                      ? "bg-gradient-to-b from-emerald-950 via-emerald-600/60 to-emerald-300/75 border-emerald-400 shadow-[0_0_10px_2px_rgba(16,185,129,0.6)]"
                      : isBearish
                      ? "bg-gradient-to-b from-red-950 via-red-600/60 to-red-300/75 border-red-400 shadow-[0_0_10px_2px_rgba(248,113,113,0.6)]"
                      : "bg-gradient-to-b from-fuchsia-900 via-fuchsia-500/60 to-fuchsia-300/80 border-fuchsia-400 shadow-[0_0_8px_2px_rgba(232,121,249,0.5)]"
                  )}>
                    <div
                      className={cn(
                        "absolute left-0 right-0 top-0 animate-pulse",
                        broken ? "bg-emerald-300/75" : isBullish ? "bg-emerald-300/65" : isBearish ? "bg-red-300/65" : "bg-fuchsia-400/60"
                      )}
                      style={{ height: broken || isBullish || isBearish ? '100%' : '0%' }}
                    />
                  </div>
                  <div className={cn("text-[8px] font-mono mt-1", broken ? "text-emerald-300" : isBullish ? "text-emerald-300" : isBearish ? "text-red-300" : "text-fuchsia-300")}>{level}</div>
                  <div className={cn("text-[8px] font-mono", broken ? "text-emerald-100" : isBullish ? "text-emerald-100" : isBearish ? "text-red-100" : "text-fuchsia-100")}>{formatPrice(corvonaLevels[level as keyof typeof corvonaLevels])}</div>
                </div>
              )})}
            </div>
          </div>
        )}

        {reasoning.length > 0 && (
          <div className={cn("space-y-1", corvonaLevels && "hidden")}>
            <div className="text-[8px] font-bold uppercase tracking-[0.15em] text-muted-foreground">
              Reasoning
            </div>
            <div className="flex flex-wrap gap-1">
              {reasoning.map((r, i) => (
                <Badge 
                  key={i} 
                  variant="outline" 
                  className={cn(
                    "text-[8px] px-1.5 py-0",
                    r.type === 'bullish' && "bg-emerald-500/10 text-emerald-400 border-emerald-500/25",
                    r.type === 'bearish' && "bg-red-500/10 text-red-400 border-red-500/25",
                    r.type === 'risk' && "bg-amber-500/10 text-amber-400 border-amber-500/25",
                    r.type === 'neutral' && "bg-muted/50 text-muted-foreground border-border"
                  )}
                >
                  {r.type === 'bullish' && <CheckCircle className="w-2 h-2 mr-0.5" />}
                  {r.type === 'bearish' && <TrendingDown className="w-2 h-2 mr-0.5" />}
                  {r.type === 'risk' && <AlertTriangle className="w-2 h-2 mr-0.5" />}
                  {r.label}
                </Badge>
              ))}
            </div>
          </div>
        )}




      </div>
    </div>
  );
}