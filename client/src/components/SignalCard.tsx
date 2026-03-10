// MetaSignalCard removed: only MetaSignalPanel should be used for meta signal display
import {
  TrendingUp,
  TrendingDown,
  Activity,
  BarChart3,
  Zap,
  Droplets,
  AlertTriangle,
  XCircle,
  Minus,
  Gauge,
  Flame,
  BarChart2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type {
  MomentumDivergence,
  VolumeSpike,
  TrendExhaustion,
  LiquiditySweep,
  BullishPower,
  CandleStrength,
  EMACloud,
  DivergenceWarning,
} from "@shared/schema";

interface SignalCardProps {
  title: string;
  icon: React.ReactNode;
  detected: boolean;
  value?: string | number;
  description?: string | null;
  variant?: "bullish" | "bearish" | "neutral" | "warning";
  percentage?: number;
  meter?: {
    value: number;
    min?: number;
    max?: number;
    tone?: "emerald" | "red" | "amber" | "cyan" | "slate";
  };
}

function NeonArcMeter({
  value,
  min = 0,
  max = 100,
  tone = "cyan",
}: {
  value: number;
  min?: number;
  max?: number;
  tone?: "emerald" | "red" | "amber" | "cyan" | "slate";
}) {
  const normalized = Math.max(0, Math.min(1, (value - min) / Math.max(1e-6, max - min)));
  const percent = Math.round(normalized * 100);
  const r = 29;
  const arc = Math.PI * r;
  const theta = Math.PI * (1 - normalized);
  const needleX = 56 + Math.cos(theta) * 23;
  const needleY = 48 - Math.sin(theta) * 23;

  const toneStyles = {
    emerald: {
      stroke: "stroke-emerald-400",
      glow: "drop-shadow-[0_0_8px_rgba(16,185,129,0.65)]",
      text: "text-emerald-300",
      bg: "bg-emerald-500/10 border-emerald-400/25",
    },
    red: {
      stroke: "stroke-red-400",
      glow: "drop-shadow-[0_0_8px_rgba(248,113,113,0.65)]",
      text: "text-red-300",
      bg: "bg-red-500/10 border-red-400/25",
    },
    amber: {
      stroke: "stroke-amber-400",
      glow: "drop-shadow-[0_0_8px_rgba(251,191,36,0.65)]",
      text: "text-amber-300",
      bg: "bg-amber-500/10 border-amber-400/25",
    },
    cyan: {
      stroke: "stroke-cyan-400",
      glow: "drop-shadow-[0_0_8px_rgba(34,211,238,0.65)]",
      text: "text-cyan-300",
      bg: "bg-cyan-500/10 border-cyan-400/25",
    },
    slate: {
      stroke: "stroke-slate-400",
      glow: "",
      text: "text-slate-300",
      bg: "bg-slate-500/10 border-slate-400/25",
    },
  };

  const palette = toneStyles[tone];

  return (
    <div className={cn("relative h-[72px] w-[112px] rounded-lg border overflow-hidden", palette.bg)}>
      <div className="pointer-events-none absolute -inset-6 opacity-35 animate-gauge-sweep bg-[conic-gradient(from_0deg,transparent_0deg,rgba(34,211,238,0.45)_38deg,transparent_88deg)]" />
      <div className="pointer-events-none absolute inset-0 opacity-40 bg-[radial-gradient(circle_at_50%_0%,rgba(34,211,238,0.22),transparent_58%)]" />
      <div className="pointer-events-none absolute left-2 right-2 top-[8px] h-px bg-gradient-to-r from-transparent via-cyan-300/60 to-transparent" />
      <div className="pointer-events-none absolute left-2 right-2 bottom-[8px] h-px bg-gradient-to-r from-transparent via-fuchsia-300/45 to-transparent" />
      <div className="pointer-events-none absolute inset-y-[10px] left-0 w-[24px] bg-gradient-to-r from-cyan-300/0 via-cyan-300/20 to-cyan-300/0 blur-[1px] animate-scan-sweep" />
      <svg width="112" height="72" viewBox="0 0 112 72" className="relative z-10">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => {
          const a = Math.PI - (Math.PI * i) / 6;
          const x1 = 56 + Math.cos(a) * 33;
          const y1 = 48 - Math.sin(a) * 33;
          const x2 = 56 + Math.cos(a) * 37;
          const y2 = 48 - Math.sin(a) * 37;
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className="stroke-[1.4] stroke-cyan-200/35" />;
        })}
        <path d="M27 48 A29 29 0 0 1 85 48" className="fill-none stroke-[8] stroke-slate-700/45" />
        <path
          d="M27 48 A29 29 0 0 1 85 48"
          className="fill-none stroke-[2] stroke-cyan-300/35 animate-pulse"
          strokeDasharray="4 5"
        />
        <path
          d="M27 48 A29 29 0 0 1 85 48"
          className={cn("fill-none stroke-[6] transition-all duration-500", palette.stroke, palette.glow)}
          style={{
            strokeDasharray: arc,
            strokeDashoffset: arc * (1 - normalized),
          }}
        />
        <line x1="56" y1="48" x2={needleX} y2={needleY} className={cn("stroke-[2.2] transition-all duration-500", palette.stroke, palette.glow)} />
        <circle cx={needleX} cy={needleY} r="2.6" className={cn(palette.stroke, "fill-current", palette.glow)} />
        <circle cx="56" cy="48" r="3.2" className={cn("fill-current", palette.text)} />
      </svg>
      <div className="absolute left-2 bottom-1 text-[8px] font-mono text-slate-300/80">MIN</div>
      <div className="absolute right-2 bottom-1 text-[8px] font-mono text-slate-300/80">MAX</div>
      <div className={cn("absolute inset-x-0 bottom-1 text-center text-[11px] font-mono font-black tracking-wide", palette.text)}>{percent}%</div>
    </div>
  );
}

function SignalCard({
  title,
  icon,
  detected,
  value,
  description,
  variant = "neutral",
  percentage,
  meter,
}: SignalCardProps) {
  const gradients = {
    bullish: "from-emerald-500/20 via-cyan-500/10 to-background",
    bearish: "from-rose-500/20 via-red-500/10 to-background",
    neutral: "from-slate-500/10 via-background to-background",
    warning: "from-amber-500/20 via-orange-500/10 to-background",
  };

  const borderColors = {
    bullish: "border-emerald-400/45",
    bearish: "border-rose-400/45",
    neutral: "border-border/60",
    warning: "border-amber-400/45",
  };

  const accentColors = {
    bullish: "bg-emerald-500",
    bearish: "bg-red-500",
    neutral: "bg-muted-foreground/30",
    warning: "bg-amber-500",
  };

  const textColors = {
    bullish: "text-emerald-400",
    bearish: "text-red-400",
    neutral: "text-muted-foreground",
    warning: "text-amber-400",
  };

  const borderGlow = {
    bullish: "from-emerald-400/0 via-emerald-300/70 to-cyan-300/0",
    bearish: "from-rose-400/0 via-rose-300/70 to-red-300/0",
    neutral: "from-slate-400/0 via-slate-300/45 to-slate-400/0",
    warning: "from-amber-400/0 via-amber-300/70 to-orange-300/0",
  };

  return (
    <Card
      className={cn(
        "group relative overflow-hidden border bg-background/60 backdrop-blur-sm transition-all duration-300",
        detected ? borderColors[variant] : borderColors.neutral,
        detected && variant === "bullish" && "shadow-lg shadow-emerald-500/10",
        detected && variant === "bearish" && "shadow-lg shadow-rose-500/10",
        detected && variant === "warning" && "shadow-lg shadow-amber-500/10",
        "hover:-translate-y-0.5 hover:shadow-xl"
      )}
      data-testid={`card-signal-${title.toLowerCase().replace(/\s+/g, '-')}`}
    >
      <div className={cn("pointer-events-none absolute left-[-30%] top-0 h-[2px] w-[60%] bg-gradient-to-r blur-[0.5px] animate-border-sweep", borderGlow[variant])} />
      <div className={cn("pointer-events-none absolute inset-0 rounded-[inherit] opacity-65 animate-hud-flicker", detected && variant === "bullish" && "shadow-[inset_0_0_26px_rgba(16,185,129,0.18)]", detected && variant === "bearish" && "shadow-[inset_0_0_26px_rgba(244,63,94,0.18)]", detected && variant === "warning" && "shadow-[inset_0_0_26px_rgba(245,158,11,0.18)]", !detected && "shadow-[inset_0_0_18px_rgba(148,163,184,0.14)]")} />
      <div className={cn("h-0.5", detected ? accentColors[variant] : "bg-muted/30")} />
      <div className={cn("bg-gradient-to-br", detected ? gradients[variant] : gradients.neutral)}>
        <CardHeader className="pb-2 pt-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className={cn(
                "p-1.5 rounded-md",
                detected ? `${variant === 'bullish' ? 'bg-emerald-500/20' : variant === 'bearish' ? 'bg-red-500/20' : variant === 'warning' ? 'bg-amber-500/20' : 'bg-muted/50'}` : 'bg-muted/30'
              )}>
                {icon}
              </div>
              <CardTitle className="text-sm font-semibold tracking-wide">{title}</CardTitle>
            </div>
            <div className={cn(
              "inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider",
              detected 
                ? `${variant === 'bullish' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 
                    variant === 'bearish' ? 'bg-red-500/20 text-red-400 border border-red-500/30' : 
                    variant === 'warning' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
                    'bg-muted/50 text-muted-foreground'}`
                : 'bg-muted/30 text-muted-foreground'
            )}>
              <span className={cn("h-1.5 w-1.5 rounded-full", detected ? accentColors[variant] : "bg-muted-foreground/60")} />
              {detected ? "Active" : "Standby"}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pb-3">
          <div className={cn("grid gap-2", meter ? "grid-cols-[1fr_auto] items-end" : "grid-cols-1")}>
            <div>
          {percentage !== undefined && (
            <div className="mb-2">
              <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    "h-full rounded-full transition-all duration-500",
                    variant === 'bullish' ? 'bg-gradient-to-r from-emerald-600 to-emerald-400' :
                    variant === 'bearish' ? 'bg-gradient-to-r from-red-600 to-red-400' :
                    variant === 'warning' ? 'bg-gradient-to-r from-amber-600 to-amber-400' :
                    'bg-muted-foreground/50'
                  )}
                  style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }}
                />
              </div>
            </div>
          )}
          {value !== undefined && (
            <p className={cn("text-2xl font-mono font-bold tracking-tight", textColors[variant])} data-testid="text-signal-value">
              {value}
            </p>
          )}
          {description && (
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed" data-testid="text-signal-description">
              {description}
            </p>
          )}
          {!value && !description && !detected && (
            <p className="text-xs text-muted-foreground/70">No signal detected</p>
          )}
            </div>
            {meter && (
              <NeonArcMeter
                value={meter.value}
                min={meter.min}
                max={meter.max}
                tone={meter.tone}
              />
            )}
          </div>
        </CardContent>
      </div>
    </Card>
  );
}

export function MomentumDivergenceCard({ data }: { data: MomentumDivergence | null }) {
  const slopeRaw = data?.vwapSlope ?? 0;
  const slopeSafe = Number.isFinite(slopeRaw) ? slopeRaw : 0;
  const slopePercent = Math.abs(slopeSafe * 100);
  const hasDivergence = data?.divergence !== null && data?.divergence !== undefined;
  const hasMomentumImpulse = slopePercent >= 0.08;
  const detected = hasDivergence || hasMomentumImpulse;
  const isBullish = slopeSafe > 0;
  const variant: "bullish" | "bearish" | "neutral" = !data ? "neutral" : isBullish ? "bullish" : "bearish";
  
  // Format divergence description for clarity
  const formatDivergence = (div: string | null | undefined) => {
    if (!div) return null;
    const formatted = div.replace(/_/g, " ");
    if (div.includes("bullish")) return `BULLISH: ${formatted}`;
    if (div.includes("bearish")) return `BEARISH: ${formatted}`;
    return formatted;
  };

  return (
    <SignalCard
      title="Momentum"
      icon={<Activity className={cn("w-4 h-4", variant === "bullish" ? "text-emerald-400" : variant === "bearish" ? "text-red-400" : "text-muted-foreground")} />}
      detected={detected}
      value={data ? `VWAP ${isBullish ? '↑' : '↓'} ${slopePercent.toFixed(2)}%` : undefined}
      description={formatDivergence(data?.divergence)}
      variant={variant}
      percentage={Math.min(100, slopePercent * 50)}
      meter={{
        value: Math.min(100, slopePercent * 50),
        min: 0,
        max: 100,
        tone: variant === "bullish" ? "emerald" : variant === "bearish" ? "red" : "slate",
      }}
    />
  );
}

export function VolumeSpikeCard({ data }: { data: VolumeSpike | null }) {
  const detected = data?.isSpike ?? false;
  const avgVolume = data?.avgVolume ?? 0;
  const lastVolume = data?.lastVolume ?? 0;
  const ratio = data && avgVolume > 0 ? (lastVolume / avgVolume) : 0;
  const safeRatio = Number.isFinite(ratio) ? ratio : 0;
  const isHighVolume = ratio >= 1.5;
  const isSpiking = safeRatio >= 2.0;
  const active = detected || isHighVolume;

  return (
    <SignalCard
      title="Volume"
      icon={<BarChart3 className={cn("w-4 h-4", isSpiking ? "text-emerald-400" : isHighVolume ? "text-amber-400" : "text-muted-foreground")} />}
      detected={active}
      value={data ? `${safeRatio.toFixed(1)}x ${isSpiking ? 'SPIKE!' : isHighVolume ? 'ELEVATED' : 'Normal'}` : undefined}
      description={
        data
          ? `Current: ${formatNumber(lastVolume)} | Avg: ${formatNumber(avgVolume)}`
          : undefined
      }
      variant={isSpiking ? "bullish" : isHighVolume ? "warning" : "neutral"}
      percentage={Math.min(100, (safeRatio / 3) * 100)}
      meter={{
        value: Math.min(3, safeRatio),
        min: 0,
        max: 3,
        tone: isSpiking ? "emerald" : isHighVolume ? "amber" : "slate",
      }}
    />
  );
}

export function TrendExhaustionCard({ data }: { data: TrendExhaustion | null }) {
  const hasData = !!data;
  const detected = hasData ? (data?.isExhausted ?? false) : false;
  // Range compression > 0.8 means healthy range, < 0.5 means compressed
  const rangeHealthRaw = data ? data.rangeCompression * 100 : NaN;
  const rangeHealth = Number.isFinite(rangeHealthRaw) ? Math.max(0, Math.min(100, Math.round(rangeHealthRaw))) : null;
  // Volume fade > 1 means increasing volume, < 0.5 means fading
  const volumeHealthRaw = data ? Math.min(data.volumeFade, 2) * 50 : NaN;
  const volumeHealth = Number.isFinite(volumeHealthRaw) ? Math.max(0, Math.min(100, Math.round(volumeHealthRaw))) : null;
  const avgHealth = rangeHealth !== null && volumeHealth !== null ? (rangeHealth + volumeHealth) / 2 : null;
  const isStrong = avgHealth !== null && avgHealth >= 60;
  const isWeak = avgHealth !== null && avgHealth < 40;

  return (
    <SignalCard
      title="Exhaustion"
      icon={<AlertTriangle className={cn("w-4 h-4", !hasData ? "text-muted-foreground" : detected ? "text-red-400" : isWeak ? "text-amber-400" : "text-emerald-400")} />}
      detected={detected}
      value={hasData ? (detected ? "EXHAUSTED!" : isStrong ? "STRONG" : isWeak ? "WEAKENING" : "NORMAL") : undefined}
      description={hasData && rangeHealth !== null && volumeHealth !== null ? `Range: ${rangeHealth}% | Volume: ${volumeHealth}%` : undefined}
      variant={!hasData ? "neutral" : detected ? "bearish" : isWeak ? "warning" : "bullish"}
      percentage={avgHealth ?? undefined}
      meter={avgHealth !== null ? {
        value: avgHealth,
        min: 0,
        max: 100,
        tone: detected ? "red" : isWeak ? "amber" : "emerald",
      } : undefined}
    />
  );
}

export function LiquiditySweepCard({ data }: { data: LiquiditySweep | null | undefined }) {
  const hasData = data !== undefined;
  const detected = data?.detected ?? false;
  const isBullish = data?.type === "low_sweep";
  const sweepType = data?.type === "low_sweep" ? "LOW SWEEP (Bullish)" : data?.type === "high_sweep" ? "HIGH SWEEP (Bearish)" : null;

  return (
    <SignalCard
      title="Liquidity"
      icon={<Droplets className={cn("w-4 h-4", !hasData ? "text-muted-foreground" : detected ? (isBullish ? "text-emerald-400" : "text-red-400") : "text-cyan-400")} />}
      detected={detected}
      value={!hasData ? undefined : detected ? (sweepType ?? "SWEEP") : "NO SWEEP"}
      description={!hasData ? undefined : detected && data?.level ? `Level: $${data.level.toFixed(2)}${data.reclaimed ? ' (Reclaimed!)' : ''}` : "Liquidity stable - no stop hunt detected"}
      variant={!hasData ? "neutral" : detected ? (isBullish ? "bullish" : "bearish") : "neutral"}
    />
  );
}

export function BullishPowerCard({ data }: { data: BullishPower | undefined }) {
  const hasData = typeof data?.meter === "number" && Number.isFinite(data.meter);
  const meterRaw = hasData ? (data?.meter as number) : 0;
  const meter = Math.max(0, Math.min(100, meterRaw));
  const isBullish = meter >= 50;

  return (
    <SignalCard
      title="Power Meter"
      icon={<Zap className={cn("w-4 h-4", !hasData ? "text-muted-foreground" : isBullish ? "text-emerald-400" : "text-red-400")} />}
      detected={hasData}
      value={hasData ? `${meter}` : undefined}
      description={
        !hasData ? undefined :
        meter > 60 ? "Strong bullish pressure" :
        meter > 50 ? "Mild bullish bias" :
        meter > 40 ? "Mild bearish bias" :
        "Strong bearish pressure"
      }
      variant={!hasData ? "neutral" : isBullish ? "bullish" : "bearish"}
      percentage={hasData ? meter : undefined}
      meter={hasData ? {
        value: meter,
        min: 0,
        max: 100,
        tone: isBullish ? "emerald" : "red",
      } : undefined}
    />
  );
}

export function CandleStrengthCard({ data }: { data: CandleStrength | undefined }) {
  const hasData = typeof data?.score === "number" && Number.isFinite(data.score);
  const scoreRaw = hasData ? (data?.score as number) : 0;
  const score = Math.max(0, Math.min(100, scoreRaw));
  const isBullish = score >= 50;

  return (
    <SignalCard
      title="Candle Str."
      icon={
        <Flame className={cn("w-4 h-4", !hasData ? "text-muted-foreground" : score > 60 ? "text-emerald-400" : score < 40 ? "text-red-400" : "text-amber-400")} />
      }
      detected={hasData}
      value={hasData ? `${score}` : undefined}
      description={hasData ? `Body ${((data?.bodyRatio ?? 0) * 100).toFixed(0)}% · Wick ${((data?.wickRatio ?? 0) * 100).toFixed(0)}%` : undefined}
      variant={!hasData ? "neutral" : isBullish ? "bullish" : "bearish"}
      percentage={hasData ? score : undefined}
      meter={hasData ? {
        value: score,
        min: 0,
        max: 100,
        tone: score > 60 ? "emerald" : score < 40 ? "red" : "amber",
      } : undefined}
    />
  );
}

export function EMACloudCard({ data }: { data: EMACloud | null | undefined }) {
  const trend = data?.trend;
  const hasData = !!data && !!trend;
  const isBullish = trend === "bullish";
  const isBearish = trend === "bearish";

  return (
    <SignalCard
      title="EMA Cloud"
      icon={
        <BarChart2 className={cn("w-4 h-4", isBullish ? "text-emerald-400" : isBearish ? "text-red-400" : "text-amber-400")} />
      }
      detected={hasData}
      value={hasData ? trend.charAt(0).toUpperCase() + trend.slice(1) : undefined}
      description={
        hasData && data?.top && data?.bottom
          ? `$${data.bottom.toFixed(2)} - $${data.top.toFixed(2)}`
          : undefined
      }
      variant={!hasData ? "neutral" : isBullish ? "bullish" : isBearish ? "bearish" : "neutral"}
      meter={hasData ? {
        value: isBullish ? 72 : isBearish ? 28 : 50,
        min: 0,
        max: 100,
        tone: isBullish ? "emerald" : isBearish ? "red" : "slate",
      } : undefined}
    />
  );
}

export function FailedVwapCard({
  data,
}: {
  data: { type: string; description: string } | null | undefined;
}) {
  const hasData = data !== undefined;
  const detected = data !== null && data !== undefined;

  return (
    <SignalCard
      title="VWAP Status"
      icon={<XCircle className={cn("w-4 h-4", !hasData ? "text-muted-foreground" : detected ? "text-red-400" : "text-emerald-400")} />}
      detected={detected}
      description={!hasData ? undefined : data?.description ?? "VWAP holding - no failed reclaim"}
      variant={!hasData ? "neutral" : detected ? "bearish" : "bullish"}
    />
  );
}

function formatNumber(num: number): string {
  if (!Number.isFinite(num)) return "0";
  if (num >= 1_000_000) return (num / 1_000_000).toFixed(1) + "M";
  if (num >= 1_000) return (num / 1_000).toFixed(1) + "K";
  return num.toFixed(0);
}

export function DivergenceWarningCard({ data }: { data: DivergenceWarning | null | undefined }) {
  if (!data || data.type === 'none') return null;

  const severityColors = {
    high: {
      bg: "from-red-500/28 via-rose-500/16 to-transparent",
      border: "border-red-400/60",
      text: "text-red-300",
      glow: "shadow-[0_0_22px_rgba(239,68,68,0.36)]",
      chip: "bg-red-500/18 border-red-400/50 text-red-200",
      pulse: "from-red-400/0 via-red-300/55 to-transparent",
    },
    medium: {
      bg: "from-amber-500/24 via-orange-500/12 to-transparent",
      border: "border-amber-400/55",
      text: "text-amber-300",
      glow: "shadow-[0_0_16px_rgba(245,158,11,0.28)]",
      chip: "bg-amber-500/16 border-amber-400/45 text-amber-200",
      pulse: "from-amber-400/0 via-amber-300/45 to-transparent",
    },
    low: {
      bg: "from-blue-500/18 via-cyan-500/8 to-transparent",
      border: "border-blue-400/45",
      text: "text-blue-300",
      glow: "shadow-[0_0_12px_rgba(59,130,246,0.22)]",
      chip: "bg-blue-500/14 border-blue-400/40 text-blue-200",
      pulse: "from-cyan-400/0 via-cyan-300/40 to-transparent",
    }
  };

  const colors = severityColors[data.severity];

  return (
    <Card
      className={cn(
        "col-span-full relative overflow-hidden border backdrop-blur-sm",
        colors.border,
        colors.glow
      )}
      data-testid="card-divergence-warning"
    >
      <div className={cn("h-0.5 bg-gradient-to-r", colors.pulse)} />
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(34,211,238,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(168,85,247,0.08)_1px,transparent_1px)] [background-size:22px_22px]" />
      <div className={cn("absolute inset-0 bg-gradient-to-r", colors.bg)} />
      <div className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l border-t border-cyan-300/45" />
      <div className="pointer-events-none absolute right-2 bottom-2 h-3 w-3 border-r border-b border-violet-300/35" />
      <CardHeader className="relative flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <div className={cn("p-1 rounded-md border", colors.chip)}>
            <AlertTriangle className={cn("w-4 h-4", colors.text)} />
          </div>
          <span className={cn("tracking-wide", colors.text)}>
            {data.severity === 'high' ? 'PROTECTION ALERT' : 'Divergence Warning'}
          </span>
          <span className={cn("text-[10px] font-black uppercase px-2 py-0.5 rounded border", colors.chip)}>
            {data.severity}
          </span>
        </CardTitle>
        <div className="flex items-center gap-2">
          {data.reduceSize && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-red-500/20 text-red-300 border-red-400/45">
              Reduce Size
            </span>
          )}
          {data.tightenStops && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded border bg-amber-500/20 text-amber-300 border-amber-400/45">
              Tighten Stops
            </span>
          )}
        </div>
      </CardHeader>
      <CardContent className="relative pt-0">
        <p className="text-sm text-foreground/85 mb-1.5 leading-relaxed">{data.description}</p>
        <div className={cn("rounded-md border px-2 py-1.5 text-sm font-semibold", colors.chip)}>
          {data.protection}
        </div>
      </CardContent>
    </Card>
  );
}

export function SignalCardsGrid(props: {
  momentumDivergence: MomentumDivergence | null | undefined;
  volumeSpike: VolumeSpike | null | undefined;
  trendExhaustion: TrendExhaustion | null | undefined;
  liquiditySweep: LiquiditySweep | null | undefined;
  bullishPower: BullishPower | undefined;
  candleStrength: CandleStrength | undefined;
  emaCloud: EMACloud | null | undefined;
  failedVwapReclaim: { type: string; description: string } | null | undefined;
  divergenceWarning?: DivergenceWarning | null | undefined;
}) {
  return (
    <div
      className="grid grid-cols-2 md:grid-cols-4 gap-3"
      data-testid="grid-signal-cards"
    >
      <BullishPowerCard data={props.bullishPower} />
      <CandleStrengthCard data={props.candleStrength} />
      <MomentumDivergenceCard data={props.momentumDivergence ?? null} />
      <VolumeSpikeCard data={props.volumeSpike ?? null} />
      <TrendExhaustionCard data={props.trendExhaustion ?? null} />
      <LiquiditySweepCard data={props.liquiditySweep} />
      <EMACloudCard data={props.emaCloud} />
      <FailedVwapCard data={props.failedVwapReclaim} />
    </div>
  );
}
