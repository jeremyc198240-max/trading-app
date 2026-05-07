import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowRight, Brain, Cpu, Minimize2, Orbit, Radar, Shield, Sparkles, Target, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { deriveCompressionSignal, type CompressionState } from "@/lib/compressionSignal";
import type { AnalysisPayload, Timeframe } from "@shared/schema";

interface CompressionStatusCardProps {
  symbol: string;
  timeframe: Timeframe;
  marketHealth: AnalysisPayload["marketHealth"] | null | undefined;
  trendExhaustion: AnalysisPayload["trendExhaustion"] | null | undefined;
  tactical: AnalysisPayload["tactical"] | null | undefined;
  directionalBias: AnalysisPayload["directionalBias"];
}

interface CompressionAiResponse {
  symbol: string;
  timeframe: string;
  aiScore: number;
  modelProbability: number;
  confidenceBand: "low" | "medium" | "high";
  decision: "HOLD" | "PREPARE" | "ENTER";
  direction: "CALL" | "PUT" | "NEUTRAL";
  reasons: string[];
  deltaPlan: {
    targetMin: number;
    targetMax: number;
    liveDelta: number | null;
    inBand: boolean | null;
  };
  priors: {
    symbolWinRate: number | null;
    timeframeWinRate: number | null;
  };
  mlPrediction?: number;
  mlCalibratedConfidence?: number;
  mlStableConfidence?: number;
  mlFreshness?: number;
  mlPatternScore?: number;
  mlRegimeProbabilities?: {
    low: number;
    high: number;
    chop: number;
  };
  training: {
    sampleCount: number;
    positiveRate: number;
    trainedAt: number;
    validation?: {
      sampleCount: number;
      accuracy: number;
      brier: number;
      baselineBrier: number;
      improvementVsBaseline: number;
      accepted: boolean;
      walkForward?: {
        folds: number;
        avgAccuracy: number;
        avgBrier: number;
        avgBaselineBrier: number;
        avgImprovementVsBaseline: number;
        minImprovementVsBaseline: number;
        avgPositiveRate: number;
      } | null;
    } | null;
    config?: {
      prepareThreshold?: number;
      enterThreshold?: number;
      deployedSource?: "candidate" | "cached" | "prior";
      thresholdDiagnostics?: {
        targetEnterPrecision: number;
        targetPreparePrecision: number;
        enter: {
          threshold: number;
          precision: number;
          recall: number;
          signalRate: number;
        };
        prepare: {
          threshold: number;
          precision: number;
          recall: number;
          signalRate: number;
        };
      };
    } | null;
  };
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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function GaugeDial({
  label,
  value,
  display,
  tone,
  testId,
}: {
  label: string;
  value: number;
  display: string;
  tone: 'emerald' | 'red' | 'amber' | 'violet' | 'cyan' | 'slate';
  testId?: string;
}) {
  const clamped = clamp01(value / 100);
  const color = toneHex(tone);
  const fillAngle = clamped * 240;

  return (
    <div
      className="rounded-3xl border p-3 bg-slate-950/80"
      style={{
        borderColor: hexToRgba(color, 0.3),
        boxShadow: `0 0 18px ${hexToRgba(color, 0.08)}`,
      }}
    >
      <div className="mx-auto mb-2 h-20 w-20 rounded-full bg-slate-900/90 relative overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: `conic-gradient(${color} 0deg ${fillAngle}deg, rgba(148,163,184,0.08) ${fillAngle}deg 360deg)`,
          }}
        />
        <div className="absolute inset-3 rounded-full bg-slate-950/95 border border-white/5" />
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[9px] uppercase tracking-[0.22em] text-slate-400">{label}</span>
          <span className="mt-1 text-lg font-semibold text-white" data-testid={testId}>{display}</span>
        </div>
      </div>
      <div className="h-1 rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${Math.round(clamped * 100)}%`,
            background: `linear-gradient(90deg, ${hexToRgba(color, 0.96)}, ${hexToRgba(color, 0.45)})`,
          }}
        />
      </div>
    </div>
  );
}

function ProbabilityBar({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'emerald' | 'red' | 'amber' | 'violet' | 'cyan' | 'slate';
}) {
  const color = toneHex(tone);
  const clamped = Math.max(0, Math.min(100, value));
  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-3">
      <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-slate-400">
        <span>{label}</span>
        <span className="font-semibold text-white">{clamped.toFixed(0)}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-slate-800 overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            width: `${clamped}%`,
            background: `linear-gradient(90deg, ${hexToRgba(color, 0.95)}, ${hexToRgba(color, 0.4)})`,
            boxShadow: `0 0 8px ${hexToRgba(color, 0.2)}`,
          }}
        />
      </div>
    </div>
  );
}

function stateClasses(state: CompressionState): { badge: string; bar: string; text: string } {
  if (state === "NOW") {
    return {
      badge: "bg-amber-500/15 border-amber-400/45 text-amber-300",
      bar: "from-amber-500 to-orange-400",
      text: "text-amber-200",
    };
  }

  if (state === "READY") {
    return {
      badge: "bg-cyan-500/15 border-cyan-400/45 text-cyan-300",
      bar: "from-cyan-500 to-sky-400",
      text: "text-cyan-200",
    };
  }

  if (state === "PREPARE") {
    return {
      badge: "bg-blue-500/15 border-blue-400/45 text-blue-300",
      bar: "from-blue-500 to-indigo-400",
      text: "text-blue-200",
    };
  }

  return {
    badge: "bg-slate-500/10 border-slate-400/35 text-slate-300",
    bar: "from-slate-500 to-slate-400",
    text: "text-slate-200",
  };
}

function useAnimatedTicker(target: number, decimals = 0, durationMs = 720): string {
  const [display, setDisplay] = useState(target);
  const frameRef = useRef<number | null>(null);
  const valueRef = useRef(target);

  useEffect(() => {
    const end = Number.isFinite(target) ? target : 0;
    const start = valueRef.current;
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = start + (end - start) * eased;
      setDisplay(next);

      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
        return;
      }

      valueRef.current = end;
    };

    if (frameRef.current != null) {
      cancelAnimationFrame(frameRef.current);
    }

    frameRef.current = requestAnimationFrame(tick);

    return () => {
      if (frameRef.current != null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [durationMs, target]);

  return display.toFixed(decimals);
}

export function CompressionStatusCard({
  symbol,
  timeframe,
  marketHealth,
  trendExhaustion,
  tactical,
  directionalBias,
}: CompressionStatusCardProps) {
  const previousStateRef = useRef<CompressionState>("WAIT");

  const signal = useMemo(() => {
    return deriveCompressionSignal({
      bbSqueeze: marketHealth?.bollingerBands?.squeeze,
      rangeCompression: trendExhaustion?.rangeCompression,
      atrPercent: marketHealth?.atr?.percent,
      previousState: previousStateRef.current,
    });
  }, [marketHealth?.atr?.percent, marketHealth?.bollingerBands?.squeeze, trendExhaustion?.rangeCompression]);

  useEffect(() => {
    previousStateRef.current = signal.state;
  }, [signal.state]);

  const tone = stateClasses(signal.state);
  const meterWidth = Math.max(4, Math.min(100, signal.score));

  const { data: aiData } = useQuery<CompressionAiResponse>({
    queryKey: ["/api/compression-ai", symbol, timeframe],
    enabled: Boolean(symbol),
    staleTime: 15000,
    refetchInterval: 20000,
    retry: false,
  });

  const entryPlan = useMemo(() => {
    const biasLabel = directionalBias === "bullish" ? "LONG" : directionalBias === "bearish" ? "SHORT" : "NEUTRAL";

    if (signal.state === "NOW") {
      return {
        action: `${biasLabel} trigger armed`,
        detail: "Enter on breakout candle close with volume confirmation.",
        risk: "Use tighter invalidation and partials at first extension.",
      };
    }

    if (signal.state === "READY") {
      return {
        action: `${biasLabel} setup close`,
        detail: "Wait for break of compression boundary then execute.",
        risk: "Do not front-run. Let the break prove itself.",
      };
    }

    if (signal.state === "PREPARE") {
      return {
        action: "Build watchlist plan",
        detail: "Track trigger level and preload strike candidates.",
        risk: "Probe size only if momentum confirms.",
      };
    }

    return {
      action: "No entry yet",
      detail: "Compression not mature enough for a clean trigger.",
      risk: "Preserve capital until state improves.",
    };
  }, [directionalBias, signal.state]);

  const lowDeltaTarget = useMemo(() => {
    if (signal.state === "NOW") return { min: 0.22, max: 0.3, label: "attack" };
    if (signal.state === "READY") return { min: 0.18, max: 0.26, label: "balanced" };
    if (signal.state === "PREPARE") return { min: 0.14, max: 0.22, label: "starter" };
    return { min: 0.1, max: 0.16, label: "scout" };
  }, [signal.state]);

  const optionSide = tactical?.otm?.type
    ? tactical.otm.type.toUpperCase()
    : directionalBias === "bullish"
      ? "CALL"
      : directionalBias === "bearish"
        ? "PUT"
        : "CALL/PUT";

  const optionDelta = tactical?.otm?.delta;
  const optionDeltaText = Number.isFinite(optionDelta) ? Number(optionDelta).toFixed(2) : "--";
  const lowDeltaInBand =
    Number.isFinite(optionDelta) &&
    Number(optionDelta) >= lowDeltaTarget.min &&
    Number(optionDelta) <= lowDeltaTarget.max;

  const aiTone = aiData?.decision === "ENTER"
    ? "text-emerald-300"
    : aiData?.decision === "PREPARE"
      ? "text-cyan-300"
      : "text-slate-300";

  const aiDeltaBand = aiData?.deltaPlan ?? {
    targetMin: lowDeltaTarget.min,
    targetMax: lowDeltaTarget.max,
    liveDelta: Number.isFinite(optionDelta) ? Number(optionDelta) : null,
    inBand: lowDeltaInBand,
  };

  const neuralPct = Math.max(0, Math.min(100, aiData?.modelProbability ?? signal.score));
  const positiveRatePct = Math.max(0, Math.min(100, (aiData?.training.positiveRate ?? 0) * 100));
  const compressionPct = Math.max(0, Math.min(100, signal.score));
  const rangePct = Math.max(0, Math.min(100, (trendExhaustion?.rangeCompression ?? 0) * 100));
  const atrPct = Number.isFinite(marketHealth?.atr?.percent) ? Number(marketHealth?.atr?.percent) : 0;
  const atrNormalized = Math.max(0, Math.min(100, atrPct * 8));
  const mlPredictionPct = Math.max(0, Math.min(100, aiData?.mlPrediction ?? neuralPct));
  const mlStableConfidencePct = Math.max(0, Math.min(100, aiData?.mlStableConfidence ?? neuralPct));
  const mlFreshnessPct = Math.max(0, Math.min(100, aiData?.mlFreshness ?? 0));
  const mlPatternScorePct = Math.max(0, Math.min(100, aiData?.mlPatternScore ?? 0));
  const regimeProbs = aiData?.mlRegimeProbabilities ?? { low: 34, high: 33, chop: 33 };
  const railValues = [compressionPct, neuralPct, rangePct, atrNormalized, positiveRatePct];
  const decisionLabel = aiData?.decision ?? "CALCULATING";
  const directionLabel = aiData?.direction ?? optionSide;
  const threatLevel = neuralPct >= 76 ? "LOW" : neuralPct >= 58 ? "MODERATE" : "ELEVATED";
  const threatTone = threatLevel === "LOW" ? "text-emerald-300" : threatLevel === "MODERATE" ? "text-amber-300" : "text-rose-300";
  const streamValues = useMemo(() => {
    const seed = Math.max(20, neuralPct);
    return Array.from({ length: 24 }, (_, idx) => {
      const wave = Math.sin((idx + seed / 8) * 0.78) * 18 + Math.cos((idx + compressionPct / 10) * 0.45) * 10;
      return Math.max(8, Math.min(100, 42 + wave));
    });
  }, [compressionPct, neuralPct]);
  const wf = aiData?.training.validation?.walkForward;
  const thresholdDiag = aiData?.training.config?.thresholdDiagnostics;
  const decisionToneClass =
    decisionLabel === "ENTER" ? "ncx-live--enter" : decisionLabel === "PREPARE" ? "ncx-live--prepare" : "ncx-live--hold";
  const confidenceToneClass =
    aiData?.confidenceBand === "high" ? "ncx-confidence--high" : aiData?.confidenceBand === "medium" ? "ncx-confidence--mid" : "ncx-confidence--low";
  const headerStateClass =
    decisionLabel === "ENTER" ? "ncx-state--enter" : decisionLabel === "PREPARE" ? "ncx-state--prepare" : "ncx-state--hold";
  const animatedProb = useAnimatedTicker(neuralPct, 0, 760);
  const animatedScore = useAnimatedTicker(Number(aiData?.aiScore ?? signal.score), 0, 700);
  const animatedSamples = useAnimatedTicker(aiData?.training.sampleCount ?? 0, 0, 840);
  const animatedEnterThreshold = useAnimatedTicker(aiData?.training.config?.enterThreshold ?? 0, 2, 760);
  const reactiveStyle = {
    "--ncx-prob": `${neuralPct}`,
    "--ncx-wave-speed": `${Math.max(0.95, 2.6 - neuralPct / 60).toFixed(2)}s`,
    "--ncx-glow": neuralPct >= 78
      ? "rgba(16, 185, 129, 0.52)"
      : neuralPct >= 60
        ? "rgba(34, 211, 238, 0.46)"
        : "rgba(244, 63, 94, 0.44)",
  } as CSSProperties;

  return (
    <Card className={cn("ncx-core group relative overflow-hidden border-cyan-300/40", decisionToneClass, confidenceToneClass)} style={reactiveStyle}>
      <div className="ncx-core__noise" />
      <div className="ncx-core__beam" />
      <div className={cn("relative h-0.5 bg-gradient-to-r", tone.bar)} />

      <CardHeader className="relative px-4 pb-2 pt-2.5">
        <CardTitle className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <div className="ncx-core__badge">
              <Minimize2 className="h-4 w-4 text-cyan-100" />
            </div>
            <div className="min-w-0 space-y-0.5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-200/85">Neural Compression Grid</div>
              <div className="text-[17px] font-semibold leading-tight text-cyan-50">Quantum Breakout Reactor</div>
              <div className="text-[10px] font-mono tracking-[0.12em] text-cyan-300/65">SYNTHETIC REGIME INFERENCE / LIVE ADAPTIVE FLOW</div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="ncx-core__tf">{timeframe.toUpperCase()}</span>
            <span className="ncx-core__live" />
          </div>
        </CardTitle>
        <div className={cn("ncx-core__statebar", headerStateClass)}>
          <div className="ncx-core__statepill">
            <span className="ncx-core__statedot" />
            DECISION {decisionLabel}
          </div>
          <div className="ncx-core__statepill">CONF {aiData?.confidenceBand?.toUpperCase() ?? "SYNC"}</div>
          <div className="ncx-core__statepill">THREAT {threatLevel}</div>
        </div>
      </CardHeader>

      <CardContent className="relative space-y-3 px-4 pb-3">
        <section className="ncx-core__hero">
          <div className="ncx-core__hero-grid">
            <div className="ncx-core__cell ncx-core__cell--cyan">
              <div className="ncx-core__label">Inference Score</div>
              <div className="ncx-core__value">
                <Brain className="h-4 w-4 text-cyan-300" />
                {animatedScore}
              </div>
            </div>
            <div className="ncx-core__cell ncx-core__cell--emerald">
              <div className="ncx-core__label">Decision Matrix</div>
              <div className={cn("ncx-core__value", aiTone)}>{decisionLabel}</div>
            </div>
            <div className="ncx-core__cell ncx-core__cell--sky">
              <div className="ncx-core__label">Direction</div>
              <div className="ncx-core__value text-sky-100">{directionLabel}</div>
            </div>
            <div className="ncx-core__cell ncx-core__cell--amber">
              <div className="ncx-core__label">Signal State</div>
              <div className="ncx-core__value text-amber-200">{signal.state}</div>
            </div>
          </div>

          <div className="ncx-reactor-wrap">
            <div
              className="ncx-reactor"
              style={{ background: `conic-gradient(rgba(34,211,238,0.96) ${neuralPct}%, rgba(2,6,23,0.7) ${neuralPct}% 100%)` }}
            >
              <div className="ncx-reactor__middle">
                <div className="text-[9px] uppercase tracking-[0.17em] text-cyan-300/70">Model Prob</div>
                <div className="text-xl font-semibold leading-none text-cyan-50 tabular-nums">{animatedProb}%</div>
                <div className="mt-1 text-[10px] font-mono text-cyan-200/70">CMP {signal.score}</div>
              </div>
            </div>
          </div>
        </section>

        <section className="ncx-telemetry">
          <div className="ncx-telemetry__header">Telemetry Spectrum</div>
          <div className="ncx-telemetry__rails">
            {railValues.map((value, index) => (
              <div key={`rail-${index}`} className="ncx-telemetry__rail">
                <div className="ncx-telemetry__fill" style={{ height: `${Math.max(8, value)}%` }} />
              </div>
            ))}
          </div>
          <div className="ncx-telemetry__labels">
            <span>CMP</span>
            <span>ML</span>
            <span>RNG</span>
            <span>ATR</span>
            <span>PR+</span>
          </div>
        </section>

        <section className="ncx-stream">
          <div className="ncx-stream__header">
            <div className="flex items-center gap-1.5">
              <Activity className="h-3.5 w-3.5 text-cyan-300" />
              <span>Signal Waveform</span>
            </div>
            <span className="text-[10px] text-cyan-200/70">latency-safe synthetic rail</span>
          </div>
          <div className="ncx-stream__bars">
            {streamValues.map((value, index) => (
              <div key={`stream-${index}`} className="ncx-stream__bar" style={{ height: `${value}%` }} />
            ))}
          </div>
        </section>

        <section className="grid gap-2 md:grid-cols-4">
          <GaugeDial
            label="Regime Score"
            value={mlPredictionPct}
            display={`${mlPredictionPct.toFixed(0)}%`}
            tone="emerald"
          />
          <GaugeDial
            label="Stable Confidence"
            value={mlStableConfidencePct}
            display={`${mlStableConfidencePct.toFixed(0)}%`}
            tone="cyan"
          />
          <GaugeDial
            label="Freshness Signal"
            value={mlFreshnessPct}
            display={`${mlFreshnessPct.toFixed(0)}%`}
            tone="amber"
          />
          <GaugeDial
            label="Pattern Score"
            value={mlPatternScorePct}
            display={`${mlPatternScorePct.toFixed(0)}%`}
            tone="violet"
          />
        </section>

        <section className="grid gap-2 md:grid-cols-3">
          <ProbabilityBar label="Low Regime" value={regimeProbs.low} tone="emerald" />
          <ProbabilityBar label="High Regime" value={regimeProbs.high} tone="red" />
          <ProbabilityBar label="Chop Regime" value={regimeProbs.chop} tone="violet" />
        </section>

        <div className="flex items-center justify-between gap-3 rounded-md border border-cyan-500/30 bg-slate-900/50 px-2.5 py-2">
          <div className="flex items-center gap-2.5">
            <Badge variant="outline" className={cn("text-[10px] font-bold tracking-wide", tone.badge)}>
              {signal.state}
            </Badge>
            <span className={cn("text-xs font-medium", tone.text)}>{signal.reasons[0] ?? "Waiting for tighter structure"}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-mono text-cyan-100">
            <Zap className="h-3 w-3" />
            DELTA GRID {aiDeltaBand.targetMin.toFixed(2)}-{aiDeltaBand.targetMax.toFixed(2)}
          </div>
        </div>

        <div className="h-2 overflow-hidden rounded-full border border-cyan-500/30 bg-slate-950/80">
          <div className={cn("h-full rounded-full bg-gradient-to-r transition-all duration-500", tone.bar)} style={{ width: `${meterWidth}%` }} />
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          <div className="ncx-strip ncx-strip--emerald">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-emerald-300">
              <Target className="h-3 w-3" />
              Entry Protocol
            </div>
            <div className="text-xs font-semibold text-emerald-100">{aiData?.decision === "ENTER" ? `${aiData.direction} ${aiData.decision}` : entryPlan.action}</div>
            <div className="mt-1 text-[11px] text-emerald-100/85">{entryPlan.detail}</div>
            <div className="mt-1 text-[10px] text-emerald-200/70">{entryPlan.risk}</div>
            {aiData?.reasons?.length ? <div className="mt-2 text-[10px] text-emerald-200/80 line-clamp-2">{aiData.reasons.slice(0, 2).join(" • ")}</div> : null}
          </div>

          <div className="ncx-strip ncx-strip--cyan">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.13em] text-cyan-300">
              <Radar className="h-3 w-3" />
              Low Delta Routing
            </div>
            <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-100">
              <span>{optionSide}</span>
              <ArrowRight className="h-3 w-3 text-cyan-300/75" />
              <span>Delta {aiDeltaBand.targetMin.toFixed(2)}-{aiDeltaBand.targetMax.toFixed(2)}</span>
            </div>
            <div className="mt-1 text-[11px] text-cyan-100/85">
              Live: {aiDeltaBand.liveDelta != null ? aiDeltaBand.liveDelta.toFixed(2) : optionDeltaText}
              {aiDeltaBand.inBand != null && (
                <span className={cn("ml-2 font-semibold", aiDeltaBand.inBand ? "text-emerald-300" : "text-amber-300")}>{aiDeltaBand.inBand ? "IN BAND" : "ADJUST"}</span>
              )}
            </div>
            <div className="mt-1 text-[10px] text-cyan-200/70">
              Mode: {lowDeltaTarget.label.toUpperCase()} {tactical?.otm?.strike ? `| Strike ${tactical.otm.strike.toFixed(2)}` : ""} {tactical?.otm?.dte ? `| ${tactical.otm.dte}DTE` : ""}
            </div>
          </div>
        </div>

        <div className="grid gap-2 md:grid-cols-3">
          <div className="ncx-chip ncx-chip--status">
            <div className="ncx-chip__label">
              <Orbit className="h-3 w-3 text-cyan-300" />
              Threat Monitor
            </div>
            <div className={cn("ncx-chip__value", threatTone)}>{threatLevel}</div>
          </div>
          <div className="ncx-chip ncx-chip--status">
            <div className="ncx-chip__label">
              <Cpu className="h-3 w-3 text-cyan-300" />
              Confidence Band
            </div>
            <div className="ncx-chip__value text-cyan-100">{aiData?.confidenceBand?.toUpperCase() ?? "SYNCING"}</div>
          </div>
          <div className="ncx-chip ncx-chip--status">
            <div className="ncx-chip__label">
              <Zap className="h-3 w-3 text-cyan-300" />
              Tactical Side
            </div>
            <div className="ncx-chip__value text-cyan-100">{directionLabel}</div>
          </div>
        </div>

        <section className="ncx-lab">
          <div className="ncx-lab__title">Model Validation Lab</div>
          <div className="ncx-lab__grid">
            <div className="ncx-lab__cell">
              <div className="ncx-lab__label">Walk-Forward</div>
              <div className="ncx-lab__value">{wf?.folds ?? "--"} folds</div>
              <div className="ncx-lab__sub">Acc {wf ? `${(wf.avgAccuracy * 100).toFixed(1)}%` : "--"}</div>
            </div>
            <div className="ncx-lab__cell">
              <div className="ncx-lab__label">WF Brier Gain</div>
              <div className="ncx-lab__value">{wf ? `${(wf.avgImprovementVsBaseline * 100).toFixed(2)}bp` : "--"}</div>
              <div className="ncx-lab__sub">Min {wf ? `${(wf.minImprovementVsBaseline * 100).toFixed(2)}bp` : "--"}</div>
            </div>
            <div className="ncx-lab__cell">
              <div className="ncx-lab__label">Enter Threshold</div>
              <div className="ncx-lab__value tabular-nums">{aiData?.training.config?.enterThreshold != null ? animatedEnterThreshold : "--"}</div>
              <div className="ncx-lab__sub">P {thresholdDiag ? `${(thresholdDiag.enter.precision * 100).toFixed(0)}%` : "--"}</div>
            </div>
            <div className="ncx-lab__cell">
              <div className="ncx-lab__label">Prepare Threshold</div>
              <div className="ncx-lab__value">{aiData?.training.config?.prepareThreshold ?? "--"}</div>
              <div className="ncx-lab__sub">P {thresholdDiag ? `${(thresholdDiag.prepare.precision * 100).toFixed(0)}%` : "--"}</div>
            </div>
          </div>
        </section>

        <div className="grid grid-cols-2 gap-2 text-[10px] md:grid-cols-4">
          <div className="ncx-chip">BB: {marketHealth?.bollingerBands?.squeeze ? "SQUEEZE" : "OPEN"}</div>
          <div className="ncx-chip">Range: {Number.isFinite(trendExhaustion?.rangeCompression) ? `${Math.round((trendExhaustion?.rangeCompression ?? 0) * 100)}%` : "--"}</div>
          <div className="ncx-chip">Win prior: {aiData?.priors.symbolWinRate != null ? `${(aiData.priors.symbolWinRate * 100).toFixed(0)}%` : "--"}</div>
          <div className="ncx-chip">Samples: {aiData?.training.sampleCount != null ? animatedSamples : "--"} | {aiData?.training.config?.deployedSource ?? "--"}</div>
        </div>

        <div className="ncx-note">
          <Sparkles className="h-3 w-3 text-cyan-300/85" />
          <Shield className="h-3 w-3 text-slate-300/85" />
          Trained from live breakout history. Highest quality setups occur when decision aligns with READY/NOW and low-delta remains in band.
        </div>
      </CardContent>
    </Card>
  );
}
