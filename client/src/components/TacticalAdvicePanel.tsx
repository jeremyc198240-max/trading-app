import { useState, useEffect } from "react";
import {
  TrendingUp, TrendingDown, Minus, X, Zap, Target, Shield,
  AlertTriangle, CheckCircle2, Activity, DollarSign, ArrowUpRight,
  ArrowDownRight, Clock, Lock, ChevronRight, Radio, Crosshair,
  BarChart2, Layers, Eye,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { TacticalAdvice } from "@shared/schema";

interface TacticalAdvicePanelProps {
  tactical: TacticalAdvice;
  directionScore: number;
}

// Theme
const TH = {
  bullish: { color: "text-emerald-400", hex: "#10b981", topBar: "from-emerald-600 via-teal-400 to-cyan-500", badgeBg: "bg-emerald-500/15 border-emerald-500/30 text-emerald-300", bg: "bg-emerald-500/10", border: "border-emerald-500/30" },
  bearish: { color: "text-red-400",     hex: "#ef4444", topBar: "from-red-700 via-rose-500 to-orange-400",   badgeBg: "bg-red-500/15 border-red-500/30 text-red-300",         bg: "bg-red-500/10",    border: "border-red-500/30"    },
  neutral: { color: "text-amber-400",   hex: "#f59e0b", topBar: "from-amber-600 via-orange-400 to-yellow-400", badgeBg: "bg-amber-500/15 border-amber-500/30 text-amber-300", bg: "bg-amber-500/10",  border: "border-amber-500/30"  },
} as const;

const STRAT: Record<string, { label: string; tagline: string; summary: string; risk: string; reward: string; rrRatio: string; timeframe: string }> = {
  AGGRESSIVE_LONG:   { label: "Aggressive Long",   tagline: "Full-conviction bullish position",  summary: "Multiple strong signals stacking bullish. Trend, volume, and structure all agree. High-conviction 0DTE or 1DTE ATM call — size to your max risk tolerance and let it breathe. Trail your stop above VWAP.", risk: "Premium paid", reward: "Unlimited upside", rrRatio: "1:3+", timeframe: "Same session" },
  CALL_DEBIT_SPREAD: { label: "Call Debit Spread", tagline: "Defined-risk bullish play",         summary: "Bullish bias confirmed but conviction is moderate. A call debit spread lets you profit from the move while capping your worst-case loss to the net debit paid. Buy ATM, sell 1-2 strikes OTM.",           risk: "Net debit paid", reward: "Spread width − debit", rrRatio: "1:1.5", timeframe: "1–2 sessions" },
  NEUTRAL:           { label: "No Trade — Wait",   tagline: "No directional edge detected",      summary: "Signals are mixed or cancelling. There is no reliable directional edge right now. Stay flat, preserve capital, and wait for a clean setup to develop before committing any premium.",                      risk: "None", reward: "Capital preserved", rrRatio: "WAIT", timeframe: "Next trigger" },
  PUT_DEBIT_SPREAD:  { label: "Put Debit Spread",  tagline: "Defined-risk bearish play",         summary: "Bearish signals confirmed but risk control matters. Put debit spread positions you to profit from a downside move while capping max loss at the net debit paid. Buy ATM, sell 1-2 strikes below.",       risk: "Net debit paid", reward: "Spread width − debit", rrRatio: "1:1.5", timeframe: "1–2 sessions" },
  AGGRESSIVE_SHORT:  { label: "Aggressive Short",  tagline: "Full-conviction bearish position",  summary: "Strong bearish alignment across volume, trend, and momentum. Buy ATM or slightly OTM puts for full downside capture. Size appropriately, trail stops above VWAP or prior candle highs.",                 risk: "Premium paid", reward: "Max downside capture", rrRatio: "1:3+", timeframe: "Same session" },
};

const ACTION_ICONS = [Target, ArrowDownRight, Shield, CheckCircle2, AlertTriangle];
const SCAN = { background: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.009) 3px,rgba(255,255,255,0.009) 4px)" };

// Arc dial component — futuristic HUD style
function ArcDial({ value, label, hex, size = 72 }: { value: number; label: string; hex: string; size?: number }) {
  const [v, setV] = useState(0);
  useEffect(() => { const t = setTimeout(() => setV(value), 130); return () => clearTimeout(t); }, [value]);
  const r = size / 2 - 11; const outerR = size / 2 - 4; const cx = size / 2; const cy = size / 2;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const arc = (start: number, end: number, radius: number) => {
    const s = toRad(start); const e = toRad(end);
    const x1 = cx + radius * Math.cos(s); const y1 = cy + radius * Math.sin(s);
    const x2 = cx + radius * Math.cos(e); const y2 = cy + radius * Math.sin(e);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${end - start > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };
  const dialHex = v >= 65 ? "#10b981" : v <= 35 ? "#ef4444" : "#f59e0b";
  const fillEnd = -220 + 260 * Math.min(1, v / 100);
  const tipRad = toRad(fillEnd);
  const tipX = cx + r * Math.cos(tipRad);
  const tipY = cy + r * Math.sin(tipRad);
  // Tick marks spaced evenly around the arc
  const numTicks = 9;
  const ticks = Array.from({ length: numTicks }, (_, i) => {
    const deg = -220 + (260 / (numTicks - 1)) * i;
    const rad = toRad(deg); const tickR = outerR - 4;
    return { x1: cx + tickR * Math.cos(rad), y1: cy + tickR * Math.sin(rad), x2: cx + outerR * Math.cos(rad), y2: cy + outerR * Math.sin(rad), active: deg <= fillEnd };
  });
  // Corner bracket decorations (targeting reticle style)
  const bs = Math.max(4, size * 0.09); const pb = 2;
  const brackets = [
    `M ${bs + pb} ${pb} L ${pb} ${pb} L ${pb} ${bs + pb}`,
    `M ${size - bs - pb} ${pb} L ${size - pb} ${pb} L ${size - pb} ${bs + pb}`,
    `M ${bs + pb} ${size - pb} L ${pb} ${size - pb} L ${pb} ${size - bs - pb}`,
    `M ${size - bs - pb} ${size - pb} L ${size - pb} ${size - pb} L ${size - pb} ${size - bs - pb}`,
  ];
  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Corner brackets */}
        {brackets.map((d, i) => <path key={i} d={d} fill="none" stroke={dialHex + "55"} strokeWidth="1.2" strokeLinecap="square" />)}
        {/* Outer thin ring */}
        <circle cx={cx} cy={cy} r={outerR - 1} fill="none" stroke={dialHex + "18"} strokeWidth="0.5" />
        {/* Tick marks */}
        {ticks.map(({ x1, y1, x2, y2, active }, i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={active ? dialHex + "dd" : "rgba(255,255,255,0.08)"}
            strokeWidth={i === 0 || i === numTicks - 1 ? "1.5" : "0.8"} strokeLinecap="round" />
        ))}
        {/* Segmented background arc track */}
        <path d={arc(-220, 40, r)} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" strokeLinecap="round" strokeDasharray="4 3" />
        {/* Outer glow layer */}
        {v > 0 && <path d={arc(-220, fillEnd, r)} fill="none" stroke={dialHex} strokeWidth="9" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 10px ${dialHex}cc)`, transition: "all 0.85s cubic-bezier(.4,0,.2,1)", opacity: 0.22 }} />}
        {/* Main fill arc */}
        {v > 0 && <path d={arc(-220, fillEnd, r)} fill="none" stroke={dialHex} strokeWidth="5.5" strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 5px ${dialHex}aa)`, transition: "all 0.85s cubic-bezier(.4,0,.2,1)" }} />}
        {/* Bright tip dot with bloom */}
        {v > 2 && <circle cx={tipX} cy={tipY} r="3.5" fill={dialHex}
          style={{ filter: `drop-shadow(0 0 5px ${dialHex}) drop-shadow(0 0 12px ${dialHex}88)`, transition: "all 0.85s cubic-bezier(.4,0,.2,1)" }} />}
        {/* Inner glow fill + ring */}
        <circle cx={cx} cy={cy} r={r - 9} fill={dialHex + "08"} />
        <circle cx={cx} cy={cy} r={r - 9} fill="none" stroke={dialHex + "25"} strokeWidth="0.5" />
        {/* Value text */}
        <text x={cx} y={cy - 3} textAnchor="middle" dominantBaseline="middle" fill={dialHex}
          fontSize={size < 80 ? 13 : 15} fontWeight="900" fontFamily="monospace"
          style={{ filter: `drop-shadow(0 0 6px ${dialHex}99)` }}>{Math.round(v)}</text>
        <text x={cx} y={cy + 9} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.32)" fontSize="5.5" fontWeight="700" letterSpacing="1.5">
          {v >= 65 ? "BULL" : v <= 35 ? "BEAR" : "NEUT"}
        </text>
      </svg>
      <span className="text-[7px] font-black tracking-widest uppercase text-white/25">{label}</span>
    </div>
  );
}

// Probability ring
function ProbRing({ prob, size = 76, hex }: { prob: number; size?: number; hex: string }) {
  const [a, setA] = useState(0);
  useEffect(() => { const t = setTimeout(() => setA(prob), 220); return () => clearTimeout(t); }, [prob]);
  const r = size / 2 - 10; const circ = 2 * Math.PI * r;
  const outerR = size / 2 - 3; const cx = size / 2; const cy = size / 2;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const ticks = Array.from({ length: 8 }, (_, i) => {
    const rad = toRad(i * 45);
    return { x1: cx + (outerR - 4) * Math.cos(rad), y1: cy + (outerR - 4) * Math.sin(rad), x2: cx + outerR * Math.cos(rad), y2: cy + outerR * Math.sin(rad) };
  });
  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute inset-0">
        <circle cx={cx} cy={cy} r={outerR - 1} fill="none" stroke={hex + "18"} strokeWidth="0.5" />
        {ticks.map(({ x1, y1, x2, y2 }, i) => (
          <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={hex + "50"} strokeWidth={i % 2 === 0 ? "1.2" : "0.7"} strokeLinecap="round" />
        ))}
      </svg>
      <svg width={size} height={size} className="absolute inset-0 -rotate-90">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" strokeDasharray="4 3"/>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={hex} strokeWidth="9"
          strokeDasharray={`${(a/100)*circ} ${circ}`} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 10px ${hex}cc)`, transition: "stroke-dasharray 1s cubic-bezier(.4,0,.2,1)", opacity: 0.25 }}/>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={hex} strokeWidth="6"
          strokeDasharray={`${(a/100)*circ} ${circ}`} strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 6px ${hex}99)`, transition: "stroke-dasharray 1s cubic-bezier(.4,0,.2,1)" }}/>
      </svg>
      <div className="absolute inset-0 rounded-full" style={{ background: `radial-gradient(circle,${hex}10 0%,transparent 65%)` }} />
      <div className="flex flex-col items-center z-10">
        <span className="text-sm font-black font-mono" style={{ color: hex, textShadow: `0 0 14px ${hex}88` }}>{a}%</span>
        <span className="text-[6px] font-black tracking-widest text-white/22 uppercase">ITM</span>
      </div>
    </div>
  );
}

// Bar gauge — LED segmented style
function BarGauge({ name, strength, delay = 0, subtext }: { name: string; strength: number; delay?: number; subtext?: string }) {
  const [w, setW] = useState(0);
  useEffect(() => { const t = setTimeout(() => setW(strength), 80 + delay); return () => clearTimeout(t); }, [strength, delay]);
  const hex = strength >= 65 ? "#10b981" : strength <= 35 ? "#ef4444" : "#f59e0b";
  const lbl = strength >= 65 ? "BULL" : strength <= 35 ? "BEAR" : "NEUT";
  const tc  = strength >= 65 ? "text-emerald-400" : strength <= 35 ? "text-red-400" : "text-amber-400";
  const totalSegs = 20;
  const filledSegs = Math.round((w / 100) * totalSegs);
  return (
    <div className="space-y-1.5">
      <div className="flex items-end justify-between">
        <div><span className="text-[9px] font-bold tracking-wider text-white/40 uppercase">{name}</span>{subtext && <span className="ml-2 text-[8px] text-white/18">{subtext}</span>}</div>
        <div className="flex items-center gap-1.5"><span className={cn("text-[8px] font-black tracking-widest", tc)}>{lbl}</span><span className={cn("text-[11px] font-black font-mono w-6 text-right", tc)}>{strength}</span></div>
      </div>
      <div className="flex gap-[2px] h-[10px]">
        {Array.from({ length: totalSegs }).map((_, i) => {
          const active = i < filledSegs;
          const isLast = active && i === filledSegs - 1;
          const segHex = i < 7 ? "#ef4444" : i < 13 ? "#f59e0b" : "#10b981";
          return (
            <div key={i} className="flex-1 h-full rounded-[2px]"
              style={{
                transition: `background-color 0.4s ease, box-shadow 0.4s ease`,
                transitionDelay: `${delay + i * 18}ms`,
                backgroundColor: active ? segHex + "ee" : "rgba(255,255,255,0.04)",
                boxShadow: isLast ? `0 0 8px ${hex}, 0 0 18px ${hex}55` : active ? `0 0 3px ${segHex}44` : "none",
              }} />
          );
        })}
      </div>
    </div>
  );
}

// Indicator pill
function IndPill({ label, value, confirms, hex }: { label: string; value: string; confirms: boolean; hex: string }) {
  return (
    <div className="relative flex flex-col items-center gap-0.5 px-2 py-2.5 rounded-xl overflow-hidden"
      style={{
        border: `1px solid ${confirms ? hex + "45" : "rgba(255,255,255,0.07)"}`,
        background: confirms ? `linear-gradient(160deg,${hex}12,${hex}04)` : "rgba(0,0,0,0.2)",
        boxShadow: confirms ? `inset 0 0 14px ${hex}0a, 0 0 10px ${hex}18` : "none",
      }}>
      {/* Corner bracket marks */}
      <svg className="absolute top-0 left-0 w-full h-full pointer-events-none" viewBox="0 0 100 100" preserveAspectRatio="none">
        <path d="M10 2 L2 2 L2 10" fill="none" stroke={confirms ? hex + "65" : "rgba(255,255,255,0.10)"} strokeWidth="1.5" strokeLinecap="square"/>
        <path d="M90 2 L98 2 L98 10" fill="none" stroke={confirms ? hex + "65" : "rgba(255,255,255,0.10)"} strokeWidth="1.5" strokeLinecap="square"/>
        <path d="M10 98 L2 98 L2 90" fill="none" stroke={confirms ? hex + "65" : "rgba(255,255,255,0.10)"} strokeWidth="1.5" strokeLinecap="square"/>
        <path d="M90 98 L98 98 L98 90" fill="none" stroke={confirms ? hex + "65" : "rgba(255,255,255,0.10)"} strokeWidth="1.5" strokeLinecap="square"/>
      </svg>
      <span className="text-[7px] font-black tracking-[0.2em] uppercase" style={{ color: confirms ? hex + "cc" : "rgba(255,255,255,0.22)" }}>{label}</span>
      <div className="w-full h-px" style={{ background: confirms ? `linear-gradient(90deg,transparent,${hex}50,transparent)` : "rgba(255,255,255,0.04)" }} />
      <span className="text-[15px] font-black font-mono leading-none mt-0.5"
        style={{ color: confirms ? hex : "rgba(255,255,255,0.35)", textShadow: confirms ? `0 0 12px ${hex}88` : "none" }}>{value}</span>
      {/* LED confirm strip */}
      <div className="flex gap-[2px] mt-1.5">
        {[0,1,2].map(i => (
          <div key={i} className="h-[3px] w-3 rounded-full"
            style={{ backgroundColor: confirms ? hex + "ee" : "rgba(255,255,255,0.07)", boxShadow: confirms ? `0 0 5px ${hex}` : "none" }} />
        ))}
      </div>
    </div>
  );
}

// Section header
function Section({ label, icon: Icon, hex, children }: { label: string; icon: React.ElementType; hex: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2.5">
      <div className="flex items-center gap-2">
        <div className="p-0.5 rounded" style={{ backgroundColor: hex + "20" }}><Icon className="w-2.5 h-2.5" style={{ color: hex }} /></div>
        <span className="text-[9px] font-black tracking-[0.2em] text-white/28 uppercase">{label}</span>
        <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg,${hex}25,transparent)` }} />
      </div>
      {children}
    </div>
  );
}

// Main panel
export function TacticalAdvicePanel({ tactical, directionScore }: TacticalAdvicePanelProps) {
  const [open, setOpen] = useState(false);
  const isBull = tactical.bias === "bullish";
  const isBear = tactical.bias === "bearish";
  const theme  = isBull ? TH.bullish : isBear ? TH.bearish : TH.neutral;
  const BiasIcon = isBull ? TrendingUp : isBear ? TrendingDown : Minus;
  const meta   = STRAT[tactical.strategy] ?? STRAT.NEUTRAL;
  const dots   = tactical.confidence === "high" ? 3 : tactical.confidence === "medium" ? 2 : 1;
  const normSc = Math.min(100, Math.max(0, ((directionScore + 50) / 100) * 100));
  const clamp01 = (n: number) => Math.max(0, Math.min(100, n));
  const defaultRsi = clamp01(50 + directionScore * 0.9);
  const defaultMacd = Math.max(-3, Math.min(3, directionScore / 12));
  const defaultBb = clamp01(50 + directionScore * 0.8);
  const defaultAdx = clamp01(28 + Math.abs(directionScore) * 1.8);
  const defaultMomentum = clamp01(50 + directionScore * 1.4);

  const fallbackIndicators = {
    agreementPct: clamp01(40 + Math.abs(directionScore) * 1.6),
    confirmCount: Math.round(clamp01(40 + Math.abs(directionScore) * 1.6) / 33.34),
    totalChecks: 3,
    rsi: {
      value: defaultRsi,
      signal: defaultRsi >= 70 ? "overbought" : defaultRsi <= 30 ? "oversold" : "neutral",
      confirms: isBull ? defaultRsi >= 50 : isBear ? defaultRsi <= 50 : Math.abs(defaultRsi - 50) <= 8,
    },
    macd: {
      histogram: defaultMacd,
      trend: defaultMacd > 0.15 ? "bullish" : defaultMacd < -0.15 ? "bearish" : "neutral",
      confirms: isBull ? defaultMacd >= 0 : isBear ? defaultMacd <= 0 : Math.abs(defaultMacd) < 0.25,
    },
    bb: {
      percentB: defaultBb,
      squeeze: Math.abs(directionScore) < 12,
      confirms: isBull ? defaultBb >= 50 : isBear ? defaultBb <= 50 : Math.abs(defaultBb - 50) <= 10,
    },
    atr: {
      value: tactical.atrValue ?? 4.2,
      percent: tactical.atrValue ? Math.max(0.35, tactical.atrValue / 10) : 0.75,
    },
    adx: {
      value: defaultAdx,
      trendStrength: defaultAdx >= 50 ? "strong" : defaultAdx >= 25 ? "moderate" : "weak",
    },
    momentum: {
      score: defaultMomentum,
      trend: defaultMomentum >= 60 ? "bullish" : defaultMomentum <= 40 ? "bearish" : "neutral",
      confirms: isBull ? defaultMomentum >= 50 : isBear ? defaultMomentum <= 50 : Math.abs(defaultMomentum - 50) <= 8,
    },
  };

  const rawIndicators = tactical.indicators as any;
  const ind = rawIndicators
    ? {
        ...fallbackIndicators,
        ...rawIndicators,
        rsi: { ...fallbackIndicators.rsi, ...(rawIndicators.rsi ?? {}) },
        macd: { ...fallbackIndicators.macd, ...(rawIndicators.macd ?? {}) },
        bb: { ...fallbackIndicators.bb, ...(rawIndicators.bb ?? {}) },
        atr: { ...fallbackIndicators.atr, ...(rawIndicators.atr ?? {}) },
        adx: { ...fallbackIndicators.adx, ...(rawIndicators.adx ?? {}) },
        momentum: { ...fallbackIndicators.momentum, ...(rawIndicators.momentum ?? {}) },
      }
    : fallbackIndicators;

  const tacticalContributors = tactical.contributors && tactical.contributors.length > 0
    ? tactical.contributors
    : [
        { name: "Momentum", value: ind.momentum.score, strength: ind.momentum.score },
        { name: "RSI", value: ind.rsi.value, strength: ind.rsi.value },
        { name: "MACD", value: clamp01(50 + ind.macd.histogram * 16), strength: clamp01(50 + ind.macd.histogram * 16) },
        { name: "Bollinger", value: ind.bb.percentB, strength: ind.bb.percentB },
        { name: "ADX", value: ind.adx.value, strength: ind.adx.value },
      ];

  const historyCalibration = tactical.historyCalibration;
  const tradePlan = tactical.tradePlan;
  const otm = tactical.otm;
  const otmTarget = otm
    ? (typeof (otm as any).targetPrice === "number"
        ? (otm as any).targetPrice
        : Number((otm.type === "call" ? otm.strike + Math.max(1.2, ind.atr.value * 0.8) : otm.strike - Math.max(1.2, ind.atr.value * 0.8)).toFixed(2)))
    : undefined;
  const otmStop = otm
    ? (typeof (otm as any).stopPrice === "number"
        ? (otm as any).stopPrice
        : Number((otm.type === "call" ? otm.strike - Math.max(0.8, ind.atr.value * 0.55) : otm.strike + Math.max(0.8, ind.atr.value * 0.55)).toFixed(2)))
    : undefined;
  const otmRationale = otm
    ? ((otm as any).rationale ?? `${otm.type.toUpperCase()} setup aligned with current tactical bias and intraday momentum.`)
    : undefined;
  const agree  = ind?.agreementPct ?? 0;
  const agreeColor = agree >= 67 ? "#10b981" : agree >= 34 ? "#f59e0b" : "#ef4444";
  const expansionScore = clamp01(Math.round((ind.momentum.score * 0.35) + (ind.adx.value * 0.25) + (ind.bb.squeeze ? 88 : ind.bb.percentB * 0.18) + ((100 - Math.min(100, ind.atr.percent * 25)) * 0.22)));
  const expansionState = expansionScore >= 70 ? "READY" : expansionScore >= 45 ? "BUILDING" : "WAIT";
  const planConfidenceColor = tradePlan?.confidenceLabel === "high"
    ? "text-emerald-400"
    : tradePlan?.confidenceLabel === "medium"
      ? "text-amber-400"
      : "text-red-400";
  const historyEdgeColor = historyCalibration?.edge === "positive"
    ? "text-emerald-400"
    : historyCalibration?.edge === "negative"
      ? "text-red-400"
      : "text-amber-400";

  return (
    <>
      {/* ────────────── COLLAPSED CARD ────────────── */}
      <div
        className={cn("relative overflow-hidden rounded-xl border cursor-pointer select-none transition-all duration-300 hover:scale-[1.005]", theme.border)}
        style={{ background: "linear-gradient(135deg,#07080d 0%,#0b0d18 60%,#060710 100%)", boxShadow: `0 0 32px ${theme.hex}14,inset 0 0 28px ${theme.hex}04` }}
        onClick={() => setOpen(true)} data-testid="panel-tactical-advice"
        role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(true)}
      >
        <div className={cn("h-[2px] bg-gradient-to-r", theme.topBar)} />
        <div className="absolute inset-0 pointer-events-none" style={SCAN} />
        <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full pointer-events-none" style={{ background: `radial-gradient(circle,${theme.hex}18 0%,transparent 70%)` }} />

        <div className="relative z-10 p-4 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={cn("p-1 rounded", theme.bg)} style={{ boxShadow: `0 0 8px ${theme.hex}40` }}><Zap className={cn("w-3 h-3", theme.color)} /></div>
              <span className="text-[9px] font-black tracking-[0.2em] text-white/45 uppercase">AI Tactical</span>
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-55" style={{ backgroundColor: theme.hex + "55" }} />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ backgroundColor: theme.hex }} />
              </span>
            </div>
            <div className={cn("px-2 py-0.5 rounded text-[8px] font-black tracking-widest border uppercase", theme.badgeBg)} data-testid="badge-vol-regime">
              {tactical.volRegime === "elevated" ? "⚡ ELEVATED" : "● NORMAL"}
            </div>
          </div>

          {/* Bias + Score */}
          <div className="flex items-center gap-3">
            <div className={cn("p-2 rounded-lg border", theme.bg, theme.border)} style={{ boxShadow: `0 0 12px ${theme.hex}28` }}>
              <BiasIcon className={cn("w-6 h-6", theme.color)} />
            </div>
            <div className="flex-1">
              <div className={cn("text-xl font-black uppercase leading-none", theme.color)} style={{ textShadow: `0 0 14px ${theme.hex}65` }} data-testid="text-bias">{tactical.bias}</div>
              <div className="text-[9px] text-white/28 mt-0.5" data-testid="text-strategy">{meta.label}</div>
            </div>
            <div className="text-right">
              <div className={cn("text-[26px] font-black font-mono leading-none", theme.color)} style={{ textShadow: `0 0 14px ${theme.hex}65` }}>{directionScore > 0 ? "+" : ""}{directionScore}</div>
              <div className="text-[7px] text-white/18 tracking-widest uppercase">score</div>
            </div>
          </div>

          {/* 3 Signal Dials */}
          {tacticalContributors.length > 0 && (
            <div className="grid grid-cols-3 gap-1 pt-0.5">
              {tacticalContributors.slice(0, 3).map((c) => (
                <ArcDial key={c.name} value={c.strength ?? 50} label={c.name.split(" ")[0]} hex={theme.hex} size={68} />
              ))}
            </div>
          )}

          {/* Intraday meter strip */}
          <div className="space-y-2 rounded-lg border p-2.5" style={{ borderColor: theme.hex + "14", background: theme.hex + "05" }}>
            <div className="text-[8px] font-black tracking-widest uppercase text-white/28">Momentum · RSI · MACD · Bollinger · ADX</div>
            <div className="grid grid-cols-2 gap-2">
              <BarGauge name="Momentum" strength={ind.momentum.score} subtext={ind.momentum.trend} />
              <BarGauge name="RSI" strength={ind.rsi.value} subtext={ind.rsi.signal} delay={60} />
              <BarGauge name="MACD" strength={clamp01(50 + ind.macd.histogram * 16)} subtext={ind.macd.trend} delay={120} />
              <BarGauge name="Bollinger" strength={ind.bb.percentB} subtext={ind.bb.squeeze ? "squeeze" : "active"} delay={180} />
            </div>
            <BarGauge name="ADX Trend" strength={ind.adx.value} subtext={ind.adx.trendStrength} delay={240} />
          </div>

          {/* Indicator pills */}
          {ind && (
            <div className="grid grid-cols-3 gap-1.5">
              <IndPill label="RSI" value={ind.rsi.value.toFixed(0)} confirms={ind.rsi.confirms} hex={theme.hex} />
              <IndPill label="MACD" value={ind.macd.histogram >= 0 ? `+${ind.macd.histogram.toFixed(2)}` : ind.macd.histogram.toFixed(2)} confirms={ind.macd.confirms} hex={theme.hex} />
              <IndPill label="BB%" value={`${ind.bb.percentB.toFixed(0)}%`} confirms={ind.bb.confirms} hex={theme.hex} />
            </div>
          )}

          {/* Agreement bar */}
          {ind && (
            <div className="space-y-1">
              <div className="flex justify-between text-[8px]">
                <span className="text-white/22 font-bold uppercase tracking-wider">Indicator Agreement</span>
                <span className="font-black" style={{ color: agreeColor }}>{agree}%  {agree >= 67 ? "✓ confirmed" : agree >= 34 ? "⚠ partial" : "✗ conflicting"}</span>
              </div>
              <div className="flex gap-[2px] h-[6px] w-full">
                {Array.from({ length: 12 }).map((_, i) => {
                  const active = (i / 12) * 100 < agree;
                  const segHex = i < 4 ? "#ef4444" : i < 8 ? "#f59e0b" : "#10b981";
                  const isEdge = active && Math.ceil((agree / 100) * 12) - 1 === i;
                  return (
                    <div key={i} className="flex-1 h-full rounded-[2px]"
                      style={{ backgroundColor: active ? segHex + "ee" : "rgba(255,255,255,0.05)", boxShadow: isEdge ? `0 0 7px ${agreeColor}, 0 0 14px ${agreeColor}55` : "none" }} />
                  );
                })}
              </div>
            </div>
          )}

          {/* Direction slider */}
          <div className="space-y-1.5">
            <div className="flex justify-between text-[7px] font-bold tracking-widest uppercase">
              <span className="text-red-400/55">Bear</span><span className="text-white/22">Direction</span><span className="text-emerald-400/55">Bull</span>
            </div>
            <div className="relative h-[8px] w-full rounded-full overflow-hidden">
              <div className="absolute inset-0 rounded-full" style={{ background: "linear-gradient(90deg,#ef444428 0%,#f59e0b18 50%,#10b98128 100%)" }} />
              <div className="absolute inset-0 rounded-full" style={{ boxShadow: "inset 0 1px 2px rgba(0,0,0,0.5)" }} />
              {[25, 50, 75].map(pct => (
                <div key={pct} className="absolute top-0 w-px h-full" style={{ left: `${pct}%`, background: "rgba(255,255,255,0.10)" }} />
              ))}
              <div className="absolute top-1/2 -translate-y-1/2 h-[11px] w-[11px] rounded-full transition-all duration-500"
                style={{ left: `calc(${normSc}% - 5.5px)`, background: theme.hex, boxShadow: `0 0 8px ${theme.hex}, 0 0 20px ${theme.hex}55, inset 0 0 4px rgba(255,255,255,0.25)` }} />
            </div>
          </div>

          {/* Confidence + entry window */}
          <div className="flex items-center gap-2">
            <span className="text-[7px] text-white/18 uppercase tracking-widest font-bold">Conf</span>
            {[1,2,3].map(d => (
              <div key={d} className="relative w-6 h-2 rounded-[2px] overflow-hidden"
                style={d <= dots
                  ? { background: `linear-gradient(90deg,${theme.hex}88,${theme.hex}ff)`, boxShadow: `0 0 7px ${theme.hex}88, 0 0 14px ${theme.hex}33` }
                  : { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}>
                {d <= dots && <div className="absolute inset-0" style={{ background: "linear-gradient(90deg,transparent 40%,rgba(255,255,255,0.2))" }} />}
              </div>
            ))}
            <span className={cn("text-[8px] font-black uppercase tracking-widest ml-1", theme.color)}>{tactical.confidence}</span>
            {tactical.entryWindow && (
              <span className="ml-auto text-[7px] text-white/18 truncate max-w-[110px]">{tactical.entryWindow.split("—")[0].trim()}</span>
            )}
          </div>

          {/* Smart plan preview */}
          {tradePlan && (
            <div className="rounded-lg border p-2.5 space-y-1.5" style={{ borderColor: theme.hex + "22", background: theme.hex + "06" }}>
              <div className="flex items-center justify-between">
                <span className="text-[8px] text-white/22 font-black uppercase tracking-widest">Smart Plan</span>
                <span className={cn("text-[8px] font-black uppercase tracking-widest", planConfidenceColor)}>{tradePlan.confidencePct}% {tradePlan.confidenceLabel}</span>
              </div>
              <div className="text-[9px] text-white/42 font-medium">
                Entry ${tradePlan.entry.toFixed(2)} • Stop ${tradePlan.stop.toFixed(2)} • T1 {tradePlan.targets[0] !== undefined ? `$${tradePlan.targets[0].toFixed(2)}` : "-"}
              </div>
              <div className="text-[8px] font-bold" style={{ color: theme.hex }}>{tradePlan.riskRewardLabel}</div>
            </div>
          )}

          {/* OTM quick preview */}
          {otm && (
            <div className="rounded-lg border p-2.5 flex items-center gap-3" style={{ borderColor: theme.hex + "22", background: theme.hex + "06" }}>
              <div className="shrink-0 text-center">
                <div className="text-[8px] text-white/22 uppercase font-bold tracking-widest">{otm.type.toUpperCase()} STRIKE</div>
                <div className="text-xl font-black font-mono" style={{ color: theme.hex, textShadow: `0 0 10px ${theme.hex}45` }}>${otm.strike}</div>
                <div className="text-[7px] text-white/18 font-bold">Δ {otm.delta} · {otm.dte === 0 ? "0DTE" : `${otm.dte}DTE`}</div>
              </div>
              <div className="flex-1 border-l pl-3" style={{ borderColor: theme.hex + "18" }}>
                <div className="text-[8px] text-white/18 font-bold uppercase tracking-widest mb-1">Prob ITM</div>
                <div className="flex gap-[2px] h-[6px] w-full">
                  {Array.from({ length: 10 }).map((_, i) => {
                    const active = (i / 10) * 100 < (100 - otm.probability);
                    const isEdge = active && Math.ceil(((100 - otm.probability) / 100) * 10) - 1 === i;
                    return (
                      <div key={i} className="flex-1 h-full rounded-[2px]"
                        style={{ backgroundColor: active ? theme.hex + "ee" : "rgba(255,255,255,0.05)", boxShadow: isEdge ? `0 0 8px ${theme.hex}, 0 0 16px ${theme.hex}44` : "none" }} />
                    );
                  })}
                </div>
                <div className="text-[9px] font-black mt-0.5" style={{ color: theme.hex, textShadow: `0 0 8px ${theme.hex}66` }}>{100 - otm.probability}% ITM</div>
              </div>
              <ProbRing prob={100 - otm.probability} size={52} hex={theme.hex} />
            </div>
          )}

          {/* Top note */}
          {tactical.notes[0] && (
            <div className="text-[9px] text-white/32 border-l-2 pl-2 leading-relaxed font-medium" style={{ borderColor: theme.hex + "45" }}>{tactical.notes[0]}</div>
          )}

          {/* CTA */}
          <div className={cn("w-full flex items-center justify-center gap-2 py-3 rounded-xl border transition-all group mt-1", theme.bg, theme.border)}
            style={{ boxShadow: `0 0 18px ${theme.hex}15` }}>
            <Radio className={cn("w-3 h-3 animate-pulse", theme.color)} />
            <span className={cn("text-[9px] font-black tracking-[0.2em] uppercase", theme.color)}>Open Full Briefing</span>
            <ChevronRight className={cn("w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5", theme.color)} />
          </div>
        </div>
      </div>

      {/* ────────────── FULL DIALOG ────────────── */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="p-0 border-0 bg-transparent shadow-none max-w-[680px] w-full focus:outline-none [&>button]:hidden">
          <div className={cn("relative overflow-hidden rounded-2xl border", theme.border)}
            style={{ background: "linear-gradient(145deg,#070810 0%,#0c0e1a 55%,#07090f 100%)", boxShadow: `0 0 80px ${theme.hex}16,0 40px 80px rgba(0,0,0,0.9)` }}>
            <div className="absolute inset-0 pointer-events-none" style={SCAN} />
            <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full pointer-events-none" style={{ background: `radial-gradient(circle,${theme.hex}16 0%,transparent 70%)` }} />
            <div className="absolute -bottom-12 -left-12 w-36 h-36 rounded-full pointer-events-none" style={{ background: `radial-gradient(circle,${theme.hex}0c 0%,transparent 70%)` }} />
            <div className={cn("h-[2px] bg-gradient-to-r", theme.topBar)} />

            <div className="relative z-10">
              {/* Header bar */}
              <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: theme.hex + "16" }}>
                <div className="flex items-center gap-3">
                  <div className={cn("p-1.5 rounded-lg", theme.bg)} style={{ boxShadow: `0 0 12px ${theme.hex}45` }}>
                    <Zap className={cn("w-4 h-4", theme.color)} />
                  </div>
                  <div>
                    <div className="text-[8px] font-black tracking-[0.3em] text-white/28 uppercase">AI Engine · Intraday</div>
                    <div className={cn("text-sm font-black tracking-wider uppercase", theme.color)}>Full Tactical Briefing</div>
                  </div>
                </div>
                <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/8 transition-colors">
                  <X className="w-3.5 h-3.5 text-white/38" />
                </button>
              </div>

              <div className="px-5 pb-6 space-y-6 max-h-[82vh] overflow-y-auto">

                {/* ── BIAS HERO ── */}
                <div className="pt-4">
                  <div className="relative rounded-2xl p-4 border overflow-hidden"
                    style={{ borderColor: theme.hex + "22", background: `linear-gradient(135deg,${theme.hex}0e 0%,transparent 70%)` }}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className={cn("p-3 rounded-xl border", theme.bg, theme.border)} style={{ boxShadow: `0 0 24px ${theme.hex}38` }}>
                          <BiasIcon className={cn("w-8 h-8", theme.color)} />
                        </div>
                        <div>
                          <div className={cn("text-3xl font-black capitalize tracking-tight", theme.color)} style={{ textShadow: `0 0 24px ${theme.hex}65` }} data-testid="text-bias">{tactical.bias}</div>
                          <div className="text-xs text-white/32 font-semibold mt-0.5">{meta.tagline}</div>
                          {tactical.entryWindow && (
                            <div className="mt-1.5 flex items-center gap-1.5 text-[9px] text-white/22 font-bold">
                              <Clock className="w-2.5 h-2.5" />{tactical.entryWindow}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className={cn("text-[30px] font-black font-mono tabular-nums leading-none", theme.color)} style={{ textShadow: `0 0 20px ${theme.hex}65` }}>{directionScore > 0 ? "+" : ""}{directionScore}</div>
                        <div className="text-[7px] text-white/18 tracking-widest uppercase mt-0.5">signal score</div>
                        <div className="flex items-center gap-1 mt-2 justify-end">
                          {[1,2,3].map(d => (
                            <div key={d} className="w-5 h-1.5 rounded-full" style={d <= dots ? { background: theme.hex, boxShadow: `0 0 4px ${theme.hex}` } : { backgroundColor: "rgba(255,255,255,0.06)" }} />
                          ))}
                        </div>
                        <div className={cn("text-[9px] font-black uppercase tracking-widest mt-0.5", theme.color)}>{tactical.confidence} conviction</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── AI ANALYSIS ── */}
                <Section label="AI Trade Analysis" icon={Eye} hex={theme.hex}>
                  <div className="rounded-xl p-4 border text-[11px] leading-relaxed text-white/58 font-medium"
                    style={{ borderColor: theme.hex + "15", background: theme.hex + "05" }}>
                    {meta.summary}
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    {[
                      { label: "Max Risk", value: meta.risk, icon: Lock },
                      { label: "Max Profit", value: meta.reward, icon: isBull ? ArrowUpRight : ArrowDownRight },
                      { label: "R : R", value: meta.rrRatio, big: true },
                    ].map(({ label, value, icon: Icon, big }: any) => (
                      <div key={label} className="flex flex-col items-center gap-1 p-2.5 rounded-xl border text-center"
                        style={{ borderColor: theme.hex + (big ? "38" : "1a"), background: theme.hex + (big ? "0c" : "06") }}>
                        {Icon && <Icon className="w-3 h-3" style={{ color: theme.hex }} />}
                        <span className="text-[7px] font-bold text-white/18 uppercase tracking-widest">{label}</span>
                        {big
                          ? <span className="text-xl font-black" style={{ color: theme.hex, textShadow: `0 0 12px ${theme.hex}55` }}>{value}</span>
                          : <span className="text-[9px] font-black text-white/38 text-center leading-tight">{value}</span>}
                      </div>
                    ))}
                  </div>
                </Section>

                {/* ── SMART INTRADAY PLAN ── */}
                {tradePlan && (
                  <Section label="Smart Intraday Plan" icon={Target} hex={theme.hex}>
                    <div className="rounded-2xl border p-3.5 space-y-3" style={{ borderColor: theme.hex + "26", background: theme.hex + "08" }}>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                        {[
                          { label: "Entry", value: `$${tradePlan.entry.toFixed(2)}` },
                          { label: "Stop", value: `$${tradePlan.stop.toFixed(2)}` },
                          { label: "Target 1", value: tradePlan.targets[0] !== undefined ? `$${tradePlan.targets[0].toFixed(2)}` : "-" },
                          { label: "Target 2", value: tradePlan.targets[1] !== undefined ? `$${tradePlan.targets[1].toFixed(2)}` : "-" },
                          { label: "Target 3", value: tradePlan.targets[2] !== undefined ? `$${tradePlan.targets[2].toFixed(2)}` : "-" },
                        ].map(({ label, value }) => (
                          <div key={label} className="rounded-xl border px-2.5 py-2 text-center" style={{ borderColor: theme.hex + "20", background: "rgba(0,0,0,0.16)" }}>
                            <div className="text-[7px] font-black tracking-widest text-white/22 uppercase">{label}</div>
                            <div className="text-[12px] font-black font-mono mt-0.5" style={{ color: theme.hex }}>{value}</div>
                          </div>
                        ))}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="rounded-xl border px-3 py-2" style={{ borderColor: theme.hex + "16", background: "rgba(0,0,0,0.18)" }}>
                          <div className="text-[7px] font-black tracking-widest text-white/20 uppercase">Entry Zone</div>
                          <div className="text-[11px] font-black mt-0.5" style={{ color: theme.hex }}>
                            ${tradePlan.entryZoneLow.toFixed(2)} to ${tradePlan.entryZoneHigh.toFixed(2)}
                          </div>
                        </div>
                        <div className="rounded-xl border px-3 py-2" style={{ borderColor: theme.hex + "16", background: "rgba(0,0,0,0.18)" }}>
                          <div className="text-[7px] font-black tracking-widest text-white/20 uppercase">Risk Reward Ladder</div>
                          <div className="text-[11px] font-black mt-0.5" style={{ color: theme.hex }}>{tradePlan.riskRewardLabel}</div>
                        </div>
                      </div>

                      <div className="rounded-xl border px-3 py-3 space-y-1.5" style={{ borderColor: theme.hex + "18", background: "rgba(0,0,0,0.18)" }}>
                        <div className="flex items-center justify-between">
                          <span className="text-[8px] font-black tracking-widest text-white/22 uppercase">Execution Confidence</span>
                          <span className={cn("text-[10px] font-black uppercase tracking-wider", planConfidenceColor)}>
                            {tradePlan.confidencePct}% {tradePlan.confidenceLabel}
                          </span>
                        </div>
                        <div className="text-[10px] text-white/48">{tradePlan.timeline}</div>
                        <div className="text-[10px] text-white/58 leading-relaxed">{tradePlan.positionSizing}</div>
                      </div>

                      {tradePlan.confidenceReasons.length > 0 && (
                        <ul className="space-y-1.5">
                          {tradePlan.confidenceReasons.slice(0, 4).map((reason, idx) => (
                            <li key={idx} className="flex items-start gap-2 text-[10px] text-white/50 leading-relaxed">
                              <span className="mt-1 w-1.5 h-1.5 rounded-full" style={{ background: theme.hex }} />
                              {reason}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </Section>
                )}

                {/* ── OTM STRIKE PICKER ── */}
                {otm && (
                  <Section label="Recommended OTM Strike" icon={Crosshair} hex={theme.hex}>
                    <div className="rounded-2xl border overflow-hidden" style={{ borderColor: theme.hex + "28" }}>
                      <div className="flex items-center justify-between px-4 py-3" style={{ background: `linear-gradient(90deg,${theme.hex}10,${theme.hex}05)` }}>
                        <div>
                          <div className="text-[8px] text-white/22 font-bold uppercase tracking-widest">{otm.type.toUpperCase()} OPTION · {otm.dte === 0 ? "0DTE" : `${otm.dte}DTE`}</div>
                          <div className="flex items-baseline gap-2 mt-0.5">
                            <span className="text-[10px] text-white/28 font-bold">Strike</span>
                            <span className="text-3xl font-black font-mono" style={{ color: theme.hex, textShadow: `0 0 16px ${theme.hex}55` }}>${otm.strike}</span>
                          </div>
                        </div>
                        <ProbRing prob={100 - otm.probability} size={80} hex={theme.hex} />
                      </div>
                      <div className="grid grid-cols-3 border-t" style={{ borderColor: theme.hex + "12" }}>
                        {[{ l: "Delta", v: `${otm.delta}` }, { l: "Target", v: `$${otmTarget}` }, { l: "Stop", v: `$${otmStop}` }].map(({ l, v }, i) => (
                          <div key={l} className={cn("flex flex-col items-center py-2.5 gap-0.5", i > 0 ? "border-l" : "")} style={{ borderColor: theme.hex + "12" }}>
                            <span className="text-[7px] font-bold text-white/18 uppercase tracking-widest">{l}</span>
                            <span className="text-[12px] font-black font-mono" style={{ color: theme.hex }}>{v}</span>
                          </div>
                        ))}
                      </div>
                      <div className="px-4 py-3 border-t text-[10px] leading-relaxed text-white/42 font-medium" style={{ borderColor: theme.hex + "10", background: "rgba(0,0,0,0.18)" }}>
                        {otmRationale}
                      </div>
                    </div>
                  </Section>
                )}

                {/* ── SIGNAL DIALS ── */}
                {tacticalContributors.length > 0 && (
                  <Section label="Signal Strength Dials" icon={Activity} hex={theme.hex}>
                    <div className="rounded-xl border p-4 space-y-4" style={{ borderColor: theme.hex + "12", background: theme.hex + "04" }}>
                      <div className="grid grid-cols-3 gap-4 justify-items-center">
                        {tacticalContributors.slice(0, 3).map((c) => (
                          <ArcDial key={c.name} value={c.strength ?? 50} label={c.name.split(" ")[0]} hex={theme.hex} size={96} />
                        ))}
                      </div>
                      {tacticalContributors.length > 3 && (
                        <div className="grid grid-cols-3 gap-4 justify-items-center">
                          {tacticalContributors.slice(3).map((c) => (
                            <ArcDial key={c.name} value={c.strength ?? 50} label={c.name.split(" ")[0]} hex={theme.hex} size={82} />
                          ))}
                        </div>
                      )}
                      <div className="space-y-2.5 pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.06)" }}>
                        {tacticalContributors.map((c, i) => (
                          <BarGauge key={c.name} name={c.name} strength={c.strength ?? 50} delay={i * 70} />
                        ))}
                      </div>
                    </div>
                  </Section>
                )}

                {/* ── INDICATOR CONFIRMATION ── */}
                {ind && (
                  <Section label="Indicator Confirmation (RSI · MACD · BB)" icon={BarChart2} hex={theme.hex}>
                    <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: theme.hex + "12", background: theme.hex + "04" }}>
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-[9px] text-white/28 font-bold uppercase tracking-widest">Agreement</span>
                          <div className="text-xs font-black mt-0.5" style={{ color: agreeColor }}>
                            {agree >= 67 ? "✓ All indicators confirm" : agree >= 34 ? "⚠ Partial confirmation" : "✗ Conflicting signals"} ({ind.confirmCount ?? Math.round((agree / 100) * 3)}/{ind.totalChecks ?? 3})
                          </div>
                        </div>
                        <div className="text-2xl font-black font-mono" style={{ color: agreeColor }}>{agree}%</div>
                      </div>
                      <div className="flex gap-[2px] h-[8px] w-full">
                        {Array.from({ length: 15 }).map((_, i) => {
                          const active = (i / 15) * 100 < agree;
                          const segHex = i < 5 ? "#ef4444" : i < 10 ? "#f59e0b" : "#10b981";
                          const isEdge = active && Math.ceil((agree / 100) * 15) - 1 === i;
                          return (
                            <div key={i} className="flex-1 h-full rounded-[2px]"
                              style={{
                                transition: `background-color 0.6s ease, box-shadow 0.6s ease`,
                                transitionDelay: `${i * 40}ms`,
                                backgroundColor: active ? segHex + "ee" : "rgba(255,255,255,0.05)",
                                boxShadow: isEdge ? `0 0 8px ${agreeColor}, 0 0 16px ${agreeColor}55` : "none",
                              }} />
                          );
                        })}
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <IndPill label="RSI" value={`${ind.rsi.value.toFixed(1)}`} confirms={ind.rsi.confirms} hex={theme.hex} />
                        <IndPill label="MACD" value={ind.macd.histogram >= 0 ? `+${ind.macd.histogram.toFixed(2)}` : ind.macd.histogram.toFixed(2)} confirms={ind.macd.confirms} hex={theme.hex} />
                        <IndPill label="BB%" value={`${ind.bb.percentB.toFixed(0)}%`} confirms={ind.bb.confirms} hex={theme.hex} />
                      </div>
                      <div className="space-y-1.5 border-t pt-2.5" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                        {[
                          { left: `RSI ${ind.rsi.value.toFixed(1)} — ${ind.rsi.signal}`, ok: ind.rsi.confirms },
                          { left: `MACD hist ${ind.macd.histogram >= 0 ? "+" : ""}${ind.macd.histogram.toFixed(2)} — ${ind.macd.trend}`, ok: ind.macd.confirms },
                          { left: `BB %B ${ind.bb.percentB.toFixed(0)}%${ind.bb.squeeze ? " — SQUEEZE ⚡" : ""}`, ok: ind.bb.confirms },
                        ].map(({ left, ok }) => (
                          <div key={left} className="flex items-center justify-between text-[10px]">
                            <span className="text-white/28">{left}</span>
                            <span className={ok ? "text-emerald-400 font-bold" : "text-red-400 font-bold"}>{ok ? "✓ Confirms" : "✗ Caution"}</span>
                          </div>
                        ))}
                        <div className="flex items-center justify-between text-[9px] text-white/20 pt-0.5 border-t" style={{ borderColor: "rgba(255,255,255,0.04)" }}>
                          <span>ATR ${ind.atr.value.toFixed(2)} ({ind.atr.percent.toFixed(2)}%)</span>
                          <span>ADX {ind.adx.value.toFixed(1)} — {ind.adx.trendStrength} trend</span>
                        </div>
                      </div>
                      {ind.bb.squeeze && (
                        <div className="flex items-start gap-2 p-2.5 rounded-lg border border-yellow-500/18 bg-yellow-500/5">
                          <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0 mt-0.5" />
                          <span className="text-[10px] text-yellow-300/55 leading-relaxed">Bollinger Band <strong className="text-yellow-300">squeeze active</strong> — volatility compression building. Expect an explosive directional move. Let the squeeze break first, then follow the breakout direction.</span>
                        </div>
                      )}
                    </div>
                  </Section>
                )}

                {/* ── INTRADAY EXPANSION ALERTS ── */}
                <Section label="Intraday Expansion Alerts" icon={AlertTriangle} hex={theme.hex}>
                  <div className="rounded-xl border p-3 space-y-3" style={{ borderColor: theme.hex + "16", background: theme.hex + "05" }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[8px] text-white/24 font-black tracking-widest uppercase">Expansion Readiness</div>
                        <div className={cn("text-sm font-black tracking-wide", expansionState === "READY" ? "text-emerald-400" : expansionState === "BUILDING" ? "text-amber-400" : "text-red-400")}>{expansionState}</div>
                      </div>
                      <ArcDial value={expansionScore} label="EXP" hex={theme.hex} size={78} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <BarGauge name="Momentum" strength={ind.momentum.score} subtext={ind.momentum.trend} />
                      <BarGauge name="RSI" strength={ind.rsi.value} subtext={ind.rsi.signal} delay={80} />
                      <BarGauge name="MACD" strength={clamp01(50 + ind.macd.histogram * 16)} subtext={ind.macd.trend} delay={120} />
                      <BarGauge name="Bollinger" strength={ind.bb.percentB} subtext={ind.bb.squeeze ? "squeeze" : "flow"} delay={160} />
                    </div>
                    <div className="text-[10px] text-white/42 leading-relaxed">
                      {expansionState === "READY"
                        ? "Expansion conditions are aligned for an intraday directional burst. Favor confirmation entries with defined risk."
                        : expansionState === "BUILDING"
                          ? "Pressure is building. Wait for breakout confirmation and volume follow-through before pressing size."
                          : "No expansion edge yet. Stay selective and avoid forcing entries until gauges improve."}
                    </div>
                  </div>
                </Section>

                    {/* ── HISTORY CALIBRATION ── */}
                    {historyCalibration && (
                      <Section label="History Calibration" icon={Activity} hex={theme.hex}>
                        <div className="rounded-xl border p-3 space-y-2.5" style={{ borderColor: theme.hex + "16", background: theme.hex + "05" }}>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            {[
                              { label: "Samples", value: `${historyCalibration.sampleSize}` },
                              { label: "Decisive Win", value: `${historyCalibration.decisiveWinRate.toFixed(1)}%` },
                              { label: "Avg R", value: historyCalibration.avgR >= 0 ? `+${historyCalibration.avgR.toFixed(2)}R` : `${historyCalibration.avgR.toFixed(2)}R` },
                              {
                                label: "Conf Adj",
                                value: `${historyCalibration.confidenceAdjustment >= 0 ? "+" : ""}${historyCalibration.confidenceAdjustment}`,
                              },
                            ].map(({ label, value }) => (
                              <div key={label} className="rounded-lg border p-2 text-center" style={{ borderColor: theme.hex + "14", background: "rgba(0,0,0,0.14)" }}>
                                <div className="text-[7px] font-black tracking-widest text-white/22 uppercase">{label}</div>
                                <div className="text-[11px] font-black mt-1" style={{ color: theme.hex }}>{value}</div>
                              </div>
                            ))}
                          </div>
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="text-white/34">Current historical edge</span>
                            <span className={cn("font-black uppercase tracking-widest", historyEdgeColor)}>{historyCalibration.edge}</span>
                          </div>
                          <div className="text-[10px] text-white/44 leading-relaxed">
                            Confidence is slightly adjusted by recent resolved outcomes so beginner guidance does not overstate weak setups.
                          </div>
                        </div>
                      </Section>
                    )}

                {/* ── ACTIVE SIGNALS ── */}
                {tactical.notes.length > 0 && (
                  <Section label="Active Signals" icon={Zap} hex={theme.hex}>
                    <ul className="space-y-1.5" data-testid="list-notes">
                      {tactical.notes.map((note, i) => (
                        <li key={i} className="flex items-start gap-2.5 text-[10px] text-white/52 leading-relaxed">
                          <span className="w-4 h-4 rounded-full shrink-0 flex items-center justify-center text-[7px] font-black border"
                            style={{ borderColor: theme.hex + "45", color: theme.hex, backgroundColor: theme.hex + "12" }}>{i + 1}</span>
                          {note}
                        </li>
                      ))}
                    </ul>
                  </Section>
                )}

                {/* ── MISSION OBJECTIVES ── */}
                {tactical.actionPlan && tactical.actionPlan.length > 0 && (
                  <Section label="Mission Objectives" icon={Target} hex={theme.hex}>
                    <ol className="space-y-2">
                      {tactical.actionPlan.map((step, i) => {
                        const Icon = ACTION_ICONS[i] ?? CheckCircle2;
                        return (
                          <li key={i} className="flex items-start gap-3 p-3 rounded-xl border"
                            style={{ borderColor: theme.hex + "18", background: `linear-gradient(90deg,${theme.hex}08 0%,transparent 100%)` }}>
                            <div className={cn("p-1.5 rounded-lg border shrink-0 mt-0.5", theme.bg, theme.border)} style={{ boxShadow: `0 0 8px ${theme.hex}25` }}>
                              <Icon className={cn("w-3 h-3", theme.color)} />
                            </div>
                            <div>
                              <div className="text-[8px] font-black tracking-widest text-white/18 uppercase mb-0.5">Step {i + 1}</div>
                              <div className="text-[11px] text-white/62 leading-relaxed font-medium">{step}</div>
                            </div>
                          </li>
                        );
                      })}
                    </ol>
                  </Section>
                )}

                {/* ── KEY LEVELS ── */}
                {tactical.keyLevel && tactical.atrValue && (
                  <Section label="Key Price Levels" icon={Layers} hex={theme.hex}>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { label: "Mid Range", value: `$${tactical.keyLevel}` },
                        { label: "ATR", value: `$${tactical.atrValue}` },
                        { label: "Hold To", value: meta.timeframe },
                      ].map(({ label, value }) => (
                        <div key={label} className="flex flex-col items-center gap-1 p-2.5 rounded-xl border text-center"
                          style={{ borderColor: theme.hex + "18", background: theme.hex + "06" }}>
                          <span className="text-[7px] font-bold text-white/18 uppercase tracking-widest">{label}</span>
                          <span className="text-[12px] font-black" style={{ color: theme.hex }}>{value}</span>
                        </div>
                      ))}
                    </div>
                  </Section>
                )}

                {/* ── VOL WARNING ── */}
                {tactical.volRegime === "elevated" && (
                  <div className="flex items-start gap-3 p-3.5 rounded-xl border border-yellow-500/22 bg-yellow-500/6">
                    <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-[9px] font-black tracking-widest text-yellow-400 uppercase mb-1">⚡ Elevated Volatility Regime</div>
                      <div className="text-[10px] text-yellow-300/52 leading-relaxed">Options premiums are inflated. Use <strong className="text-yellow-300">spreads over naked options</strong> to define risk. Reduce position size 20–25%, and widen stops by 0.5× ATR to avoid noise shakeouts.</div>
                    </div>
                  </div>
                )}

              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
