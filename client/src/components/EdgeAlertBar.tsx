import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowDownRight, ArrowUpRight, Crosshair, Gauge, Radar, ShieldAlert, Timer, Zap } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type EdgeDirection = "bullish" | "bearish" | "neutral";
type EdgeSignal = "BREAK_UP" | "BREAK_DOWN" | "WAIT";
type EdgeState = "STANDBY" | "ARMING" | "PRIMED" | "TRIGGERED";
type SarBias = "above" | "below" | "neutral";

interface EdgeIndicatorSnapshot {
  rsi: number;
  macdHistogram: number;
  macdTrend: "bullish" | "bearish" | "neutral";
  bbPercentB: number;
  bbSqueeze: boolean;
  stochasticK: number;
  stochasticD: number;
  adx: number;
  tvRsi: number;
  tvAdx: number;
  tvRecommendAll: number;
  momentum: number;
  volumeSpike: number;
  sarBias: SarBias;
}

interface EdgeEngineSnapshot {
  signal: EdgeSignal;
  direction: EdgeDirection;
  state: EdgeState;
  edgeScore: number;
  confidence: number;
  leadMinutes: number;
  triggerProbability: number;
  reasons: string[];
  indicators: EdgeIndicatorSnapshot;
}

interface ScannerResult {
  symbol: string;
  edgeEngine?: EdgeEngineSnapshot;
  breakoutSignal?: string | null;
  priceChangePercent?: number;
}

function scoreTone(score: number): "hot" | "warm" | "cool" {
  if (score >= 80) return "hot";
  if (score >= 65) return "warm";
  return "cool";
}

function stateRank(state: EdgeState): number {
  if (state === "TRIGGERED") return 4;
  if (state === "PRIMED") return 3;
  if (state === "ARMING") return 2;
  return 1;
}

function toneClasses(direction: EdgeDirection): {
  border: string;
  glow: string;
  chip: string;
  text: string;
  subtleText: string;
  accentHex: string;
  glowHex: string;
} {
  if (direction === "bullish") {
    return {
      border: "border-emerald-400/55",
      glow: "shadow-[0_0_28px_rgba(16,185,129,0.22)]",
      chip: "from-emerald-500/35 to-teal-500/35 border-emerald-300/45",
      text: "text-emerald-100",
      subtleText: "text-emerald-200/80",
      accentHex: "#10b981",
      glowHex: "rgba(16,185,129,0.22)",
    };
  }
  if (direction === "bearish") {
    return {
      border: "border-rose-400/55",
      glow: "shadow-[0_0_28px_rgba(244,63,94,0.22)]",
      chip: "from-rose-500/35 to-orange-500/35 border-rose-300/45",
      text: "text-rose-100",
      subtleText: "text-rose-200/80",
      accentHex: "#f43f5e",
      glowHex: "rgba(244,63,94,0.22)",
    };
  }
  return {
    border: "border-cyan-400/45",
    glow: "shadow-[0_0_26px_rgba(34,211,238,0.18)]",
    chip: "from-cyan-500/30 to-sky-500/30 border-cyan-300/40",
    text: "text-cyan-100",
    subtleText: "text-cyan-200/75",
    accentHex: "#22d3ee",
    glowHex: "rgba(34,211,238,0.2)",
  };
}

function HudCrosshair({ accent, className }: { accent: string; className?: string }) {
  return (
    <div className={cn("pointer-events-none absolute", className)}>
      <div className="absolute inset-0 rounded-full border" style={{ borderColor: `${accent}66` }} />
      <div className="absolute inset-[20%] rounded-full border border-dashed" style={{ borderColor: `${accent}4d` }} />
      <div
        className="absolute left-1/2 top-[8%] h-[84%] w-px -translate-x-1/2"
        style={{ background: `linear-gradient(180deg, transparent, ${accent}bb, transparent)` }}
      />
      <div
        className="absolute left-[8%] top-1/2 h-px w-[84%] -translate-y-1/2"
        style={{ background: `linear-gradient(90deg, transparent, ${accent}bb, transparent)` }}
      />
      <div
        className="absolute left-1/2 top-1/2 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/75 bg-white/90"
        style={{ boxShadow: `0 0 8px ${accent}` }}
      />
    </div>
  );
}

function MiniMeter({
  label,
  value,
  min,
  max,
  color,
  accent,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  color: string;
  accent: string;
}) {
  const safe = Number.isFinite(value) ? value : min;
  const pct = Math.max(0, Math.min(100, ((safe - min) / Math.max(1e-6, max - min)) * 100));
  const markerPct = Math.max(4, Math.min(96, pct));
  const zone = pct >= 75 ? "HOT" : pct >= 45 ? "LIVE" : "EARLY";

  return (
    <div
      className="relative overflow-hidden rounded-lg border px-1.5 py-1 shadow-[inset_0_0_10px_rgba(255,255,255,0.05)]"
      style={{
        borderColor: `${accent}58`,
        background: `linear-gradient(148deg, ${accent}1f, rgba(2,6,20,0.84) 62%, rgba(6,10,20,0.95))`,
      }}
    >
      <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] [background-size:12px_12px]" />
      <div className="pointer-events-none absolute inset-y-0 left-0 w-[20%] bg-gradient-to-r from-transparent via-cyan-200/20 to-transparent animate-scan-sweep" />
      <div className="pointer-events-none absolute -right-6 -top-6 h-12 w-12 rounded-full blur-xl" style={{ background: `${accent}45` }} />
      <div className="pointer-events-none absolute left-1 top-1 h-2 w-2 border-l border-t" style={{ borderColor: `${accent}88` }} />
      <div className="pointer-events-none absolute right-1 bottom-1 h-2 w-2 border-r border-b" style={{ borderColor: `${accent}66` }} />
      <HudCrosshair accent={accent} className="right-1 top-1 h-3.5 w-3.5 opacity-80" />
      <div className="relative z-10 mb-0.5 flex items-center justify-between text-[8px] font-bold uppercase tracking-[0.16em] text-slate-300/90">
        <span>{label}</span>
        <div className="flex items-center gap-1">
          <span className="rounded-full border border-white/15 bg-slate-800/65 px-1 py-0.5 text-[7px] font-black tracking-[0.14em] text-slate-100">{zone}</span>
          <span className="font-mono text-[9px] text-slate-100">{safe.toFixed(1)}</span>
        </div>
      </div>

      <div className="relative z-10 h-1.5 w-full overflow-hidden rounded-full border border-white/10 bg-slate-950/75">
        <div className="absolute inset-0 grid grid-cols-10 gap-[2px] px-[2px]">
          {Array.from({ length: 10 }).map((_, idx) => (
            <div key={idx} className="h-full rounded-[1px] bg-white/5" />
          ))}
        </div>
        <div
          className="h-full rounded-full"
          style={{
            width: `${pct}%`,
            background: color,
            boxShadow: `0 0 12px ${accent}`,
          }}
        />
        <div
          className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${markerPct}%` }}
        >
          <div className="relative h-3 w-3">
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/55" />
            <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/55" />
            <div
              className="absolute left-1/2 top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/75 bg-white/95"
              style={{ boxShadow: `0 0 10px ${accent}` }}
            />
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-0.5 flex items-center justify-between text-[7px] font-mono uppercase tracking-[0.16em] text-slate-400/90">
        <span>{Math.round(safe)}</span>
        <span>{Math.round(pct)}%</span>
        <span className="text-slate-500">hud</span>
      </div>
    </div>
  );
}

function EdgeDial({
  value,
  label,
  accent,
  secondary,
}: {
  value: number;
  label: string;
  accent: string;
  secondary?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  const radius = 28;
  const circumference = 2 * Math.PI * radius;
  const dash = (clamped / 100) * circumference;
  const markerAngle = -135 + (clamped / 100) * 270;
  const markerRad = (markerAngle * Math.PI) / 180;
  const markerX = 46 + radius * Math.cos(markerRad);
  const markerY = 46 + radius * Math.sin(markerRad);
  const ticks = Array.from({ length: 24 }, (_, idx) => {
    const angle = -135 + (idx / 23) * 270;
    const rad = (angle * Math.PI) / 180;
    const outer = 38;
    const inner = idx % 3 === 0 ? 34 : 35.5;
    const x1 = 46 + inner * Math.cos(rad);
    const y1 = 46 + inner * Math.sin(rad);
    const x2 = 46 + outer * Math.cos(rad);
    const y2 = 46 + outer * Math.sin(rad);
    const active = idx / 23 <= clamped / 100;
    return { x1, y1, x2, y2, active };
  });

  return (
    <div className="relative flex h-[82px] w-[82px] items-center justify-center overflow-hidden rounded-full border border-white/15 bg-slate-950/75 shadow-[inset_0_0_22px_rgba(255,255,255,0.08)]">
      <div
        className="pointer-events-none absolute -inset-4 rounded-full opacity-35 animate-spin [animation-duration:8s]"
        style={{
          background: `conic-gradient(from 0deg, transparent 0deg, ${accent}66 46deg, transparent 90deg)`,
        }}
      />
      <div className="pointer-events-none absolute inset-0 rounded-full" style={{ boxShadow: `0 0 16px ${accent}66` }} />
      <div className="pointer-events-none absolute left-1 top-1 h-2.5 w-2.5 border-l border-t" style={{ borderColor: `${accent}88` }} />
      <div className="pointer-events-none absolute right-1 bottom-1 h-2.5 w-2.5 border-r border-b" style={{ borderColor: `${accent}66` }} />
      <HudCrosshair accent={accent} className="inset-[13px] opacity-65" />
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 92 92" aria-hidden>
        {ticks.map((tick, idx) => (
          <line
            key={idx}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke={tick.active ? accent : "rgba(255,255,255,0.22)"}
            strokeWidth={idx % 3 === 0 ? 1.4 : 0.9}
            strokeLinecap="round"
            opacity={tick.active ? 0.9 : 0.45}
          />
        ))}
        <circle cx="46" cy="46" r="20" fill="none" stroke="rgba(255,255,255,0.18)" strokeDasharray="2.2 4.2" strokeWidth="1" />
        <line x1="46" y1="14" x2="46" y2="78" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
        <line x1="14" y1="46" x2="78" y2="46" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
        <circle cx="46" cy="46" r={radius} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="5" />
        <circle
          cx="46"
          cy="46"
          r={radius}
          fill="none"
          stroke={accent}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference}`}
          transform="rotate(-90 46 46)"
          style={{ filter: `drop-shadow(0 0 8px ${accent})` }}
        />
        <circle cx={markerX} cy={markerY} r="2.8" fill="white" style={{ filter: `drop-shadow(0 0 8px ${accent})` }} />
      </svg>
      <div className="relative z-10 text-center">
        <div className="font-mono text-[18px] font-black leading-none text-slate-100">{Math.round(clamped)}</div>
        <div className="mt-0.5 text-[7px] font-black uppercase tracking-[0.2em] text-slate-300/80">{label}</div>
        {secondary ? <div className="mt-0.5 text-[7px] font-mono text-slate-400">{secondary}</div> : null}
      </div>
    </div>
  );
}

function TriggerRail({
  probability,
  state,
  accent,
}: {
  probability: number;
  state: EdgeState;
  accent: string;
}) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(probability) ? probability : 0));
  const pctLabel = `${Math.round(pct)}%`;
  const segments = 18;
  const active = Math.round((pct / 100) * segments);
  const markerPct = Math.max(2, Math.min(98, pct));
  const zone = pct >= 80 ? "DETONATE" : pct >= 60 ? "READY" : pct >= 40 ? "ARMING" : "BUILD";

  return (
    <div className="relative rounded-lg border border-white/10 bg-slate-900/45 px-1 py-0.5 shadow-[inset_0_0_12px_rgba(255,255,255,0.04)]">
      <div className="pointer-events-none absolute left-1 top-1 h-2.5 w-2.5 border-l border-t border-white/30" />
      <div className="pointer-events-none absolute right-1 bottom-1 h-2.5 w-2.5 border-r border-b border-white/25" />
      <HudCrosshair accent={accent} className="right-1 top-1 h-[18px] w-[18px] opacity-65" />

      <div className="mb-0.5 flex items-center justify-between gap-1">
        <span className="text-[8px] font-black uppercase tracking-[0.17em] text-slate-300/85">Trigger Rail</span>
        <div className="flex items-center gap-1">
          <span className="rounded-full border border-white/15 bg-slate-800/70 px-1 py-0.5 text-[7px] font-mono uppercase tracking-wider text-slate-200">{state}</span>
          <span className="rounded-full border border-white/15 bg-slate-800/70 px-1 py-0.5 text-[6px] font-black uppercase tracking-[0.16em] text-slate-200">{zone}</span>
          <span
            className="rounded-full border px-1 py-0.5 text-[7px] font-black text-slate-100"
            style={{ borderColor: `${accent}88`, background: `${accent}24`, boxShadow: `0 0 8px ${accent}55` }}
          >
            {pctLabel}
          </span>
        </div>
      </div>

      <div className="relative mb-0.5 h-1 overflow-hidden rounded-full border border-white/10 bg-slate-950/70">
        <div
          className="h-full rounded-full"
          style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${accent}, rgba(255,255,255,0.95))`, boxShadow: `0 0 10px ${accent}` }}
        />
        <div
          className="pointer-events-none absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${markerPct}%` }}
        >
          <div className="relative h-2.5 w-2.5">
            <div className="absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-white/60" />
            <div className="absolute left-0 top-1/2 h-px w-full -translate-y-1/2 bg-white/60" />
            <div
              className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/80 bg-white"
              style={{ boxShadow: `0 0 10px ${accent}` }}
            />
          </div>
        </div>
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[6px] font-mono font-black text-white/80">
          {pctLabel}
        </div>
      </div>

      <div className="grid grid-cols-[repeat(18,minmax(0,1fr))] gap-[2px]">
        {Array.from({ length: segments }).map((_, i) => {
          const on = i < active;
          const alpha = on ? Math.max(0.18, 0.98 - (active - i) * 0.06) : 0.08;
          return (
            <div
              key={i}
              className="h-1 rounded-[2px]"
              style={{
                background: on ? `${accent}${Math.round(alpha * 255).toString(16).padStart(2, "0")}` : "rgba(255,255,255,0.08)",
                boxShadow: on ? `0 0 7px ${accent}` : "none",
              }}
            />
          );
        })}
      </div>
      <div className="mt-0.5 flex items-center justify-between text-[6px] font-mono text-slate-400/80">
        <span>0%</span>
        <span className="uppercase tracking-[0.16em]">trigger</span>
        <span>100%</span>
      </div>
    </div>
  );
}

export function EdgeAlertBar() {
  const { data: results } = useQuery<ScannerResult[]>({
    queryKey: ["/api/scanner/results"],
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const cards = useMemo(() => {
    const list = (results || [])
      .filter((row) => row.edgeEngine && row.edgeEngine.state !== "STANDBY")
      .sort((a, b) => {
        const edgeA = a.edgeEngine as EdgeEngineSnapshot;
        const edgeB = b.edgeEngine as EdgeEngineSnapshot;
        if (stateRank(edgeB.state) !== stateRank(edgeA.state)) return stateRank(edgeB.state) - stateRank(edgeA.state);
        if (edgeB.edgeScore !== edgeA.edgeScore) return edgeB.edgeScore - edgeA.edgeScore;
        return edgeB.triggerProbability - edgeA.triggerProbability;
      });

    return list.slice(0, 3);
  }, [results]);

  if (!cards.length) {
    return (
      <Card className="relative overflow-hidden rounded-2xl border border-cyan-400/35 bg-gradient-to-br from-[#04060d] via-[#050b19] to-[#02030a] p-3 shadow-[0_0_28px_rgba(34,211,238,0.14)]">
        <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(34,211,238,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.12)_1px,transparent_1px)] [background-size:18px_18px]" />
        <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-cyan-500/70 via-sky-400/70 to-fuchsia-500/70" />
        <div className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l border-t border-cyan-300/55" />
        <div className="pointer-events-none absolute right-2 bottom-2 h-3 w-3 border-r border-b border-cyan-300/45" />
        <div className="relative z-10 flex items-center gap-2 text-cyan-200/90">
          <Radar className="h-4 w-4 animate-pulse" />
          <span className="text-xs font-black uppercase tracking-[0.2em]">Edge Engine</span>
          <span className="ml-auto rounded-full border border-cyan-300/40 bg-cyan-500/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-cyan-200/85">arming</span>
        </div>
      </Card>
    );
  }

  return (
    <div className="mb-2 flex flex-wrap gap-2">
      {cards.map((row) => {
        const edge = row.edgeEngine as EdgeEngineSnapshot;
        const tone = toneClasses(edge.direction);
        const toneLevel = scoreTone(edge.edgeScore);
        const isUp = edge.direction === "bullish";
        const stateChip = edge.state === "TRIGGERED"
          ? "from-fuchsia-500/35 to-rose-500/35 border-fuchsia-300/45"
          : edge.state === "PRIMED"
            ? "from-amber-500/35 to-orange-500/35 border-amber-300/45"
            : "from-cyan-500/30 to-sky-500/30 border-cyan-300/35";
        const vectorBars = Array.from({ length: 14 }, (_, i) => {
          const momentumBase = Math.min(1, Math.abs(edge.indicators.momentum) / 100);
          const wave = Math.abs(Math.sin((i + 1) * 0.78 + edge.edgeScore * 0.045));
          return Math.max(0.18, Math.min(1, momentumBase * 0.68 + wave * 0.32));
        });

        return (
          <Card
            key={row.symbol}
            className={cn(
              "relative min-w-[304px] max-w-[420px] overflow-hidden rounded-[16px] border p-1.5 backdrop-blur-md transition-all duration-300 hover:-translate-y-[2px]",
              tone.border,
              tone.glow,
            )}
            style={{
              background: "linear-gradient(150deg,#04050a 0%,#070d1b 58%,#030409 100%)",
              boxShadow: `0 0 30px ${tone.glowHex}, inset 0 0 22px ${tone.accentHex}1f`,
            }}
          >
            <div className="pointer-events-none absolute inset-0 opacity-18 [background-image:linear-gradient(rgba(34,211,238,0.12)_1px,transparent_1px),linear-gradient(90deg,rgba(34,211,238,0.08)_1px,transparent_1px)] [background-size:18px_18px]" />
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
              <div className="absolute left-0 top-[31%] h-[1px] w-full animate-pulse bg-gradient-to-r from-transparent via-white/30 to-transparent" />
              <div className="absolute inset-y-0 left-0 w-[15%] bg-gradient-to-r from-transparent via-cyan-200/15 to-transparent animate-scan-sweep" />
              <div className="absolute -left-10 -top-10 h-32 w-32 rounded-full blur-2xl" style={{ background: `${tone.accentHex}2b` }} />
              <div className="absolute -right-10 bottom-0 h-24 w-24 rounded-full blur-2xl" style={{ background: `${tone.accentHex}1f` }} />
            </div>
            <div className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l border-t" style={{ borderColor: `${tone.accentHex}88` }} />
            <div className="pointer-events-none absolute right-2 bottom-2 h-3 w-3 border-r border-b" style={{ borderColor: `${tone.accentHex}66` }} />
            <HudCrosshair accent={tone.accentHex} className="right-2.5 top-2.5 h-6 w-6 opacity-55" />
            <HudCrosshair accent={tone.accentHex} className="left-2.5 bottom-2.5 h-5 w-5 opacity-35" />

            <div className="relative z-10 space-y-1.5">
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-[90px_1fr]">
                <div
                  className="relative overflow-hidden rounded-xl border p-1.5"
                  style={{
                    borderColor: `${tone.accentHex}66`,
                    background: `linear-gradient(170deg, ${tone.accentHex}14, rgba(3,7,19,0.9))`,
                    boxShadow: `inset 0 0 16px ${tone.accentHex}1f`,
                  }}
                >
                  <div className="pointer-events-none absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] [background-size:10px_10px]" />
                  <div className="relative z-10 flex flex-col items-center gap-1">
                    <EdgeDial
                      value={edge.edgeScore}
                      label="edge"
                      accent={tone.accentHex}
                      secondary={toneLevel === "hot" ? "critical" : toneLevel === "warm" ? "active" : "tracking"}
                    />
                    <span className={cn("rounded-full border bg-gradient-to-r px-1.5 py-0.5 text-[8px] font-black uppercase tracking-[0.16em]", stateChip)}>
                      {edge.state}
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <div
                    className="flex items-center gap-1.5 rounded-xl border px-1.5 py-0.5"
                    style={{
                      borderColor: `${tone.accentHex}59`,
                      background: `linear-gradient(135deg, ${tone.accentHex}1f, rgba(2,6,20,0.86) 60%)`,
                      boxShadow: `inset 0 0 14px ${tone.accentHex}1f, 0 0 14px ${tone.accentHex}1a`,
                    }}
                  >
                    <Zap className="h-3.5 w-3.5" style={{ color: tone.accentHex, filter: `drop-shadow(0 0 8px ${tone.accentHex})` }} />
                    <span className={cn("font-mono text-base font-black tracking-[0.14em]", tone.text)}>{row.symbol}</span>
                    <Crosshair className="h-3 w-3" style={{ color: tone.accentHex, filter: `drop-shadow(0 0 8px ${tone.accentHex})` }} />
                    <span className={cn("rounded-full border bg-gradient-to-r px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.16em]", tone.chip)}>
                      {edge.signal === "BREAK_UP" ? "EDGE UP" : edge.signal === "BREAK_DOWN" ? "EDGE DOWN" : "EDGE WAIT"}
                    </span>
                    <span className="ml-auto text-[7px] font-mono uppercase tracking-[0.2em]" style={{ color: `${tone.accentHex}cc` }}>QUANT EDGE</span>
                  </div>

                  <div className="grid grid-cols-3 gap-1">
                    <div className="rounded-lg border border-white/10 bg-slate-900/55 px-1.5 py-0.5 shadow-[inset_0_0_10px_rgba(255,255,255,0.05)]">
                      <div className="text-[8px] uppercase tracking-[0.14em] text-slate-400">CONF</div>
                      <div className="font-mono text-xs font-black text-slate-100">{edge.confidence}%</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-slate-900/55 px-1.5 py-0.5 shadow-[inset_0_0_10px_rgba(255,255,255,0.05)]">
                      <div className="text-[8px] uppercase tracking-[0.14em] text-slate-400">LEAD</div>
                      <div className="font-mono text-xs font-black text-slate-100">{edge.leadMinutes}m</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-slate-900/55 px-1.5 py-0.5 shadow-[inset_0_0_10px_rgba(255,255,255,0.05)]">
                      <div className="text-[8px] uppercase tracking-[0.14em] text-slate-400">TRG</div>
                      <div className="font-mono text-xs font-black text-slate-100">{edge.triggerProbability}%</div>
                    </div>
                  </div>

                  <TriggerRail probability={edge.triggerProbability} state={edge.state} accent={tone.accentHex} />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-1">
                <MiniMeter label="RSI" value={edge.indicators.rsi} min={0} max={100} color="linear-gradient(90deg,#22d3ee,#0ea5e9)" accent={tone.accentHex} />
                <MiniMeter label="ADX" value={edge.indicators.adx} min={0} max={60} color="linear-gradient(90deg,#a78bfa,#f472b6)" accent={tone.accentHex} />
                <MiniMeter label="Stoch K" value={edge.indicators.stochasticK} min={0} max={100} color="linear-gradient(90deg,#34d399,#10b981)" accent={tone.accentHex} />
                <MiniMeter label="BB %B" value={edge.indicators.bbPercentB} min={0} max={100} color="linear-gradient(90deg,#f59e0b,#fb7185)" accent={tone.accentHex} />
                <MiniMeter label="TV RSI" value={edge.indicators.tvRsi} min={0} max={100} color="linear-gradient(90deg,#38bdf8,#60a5fa)" accent={tone.accentHex} />
                <MiniMeter label="TV ADX" value={edge.indicators.tvAdx} min={0} max={60} color="linear-gradient(90deg,#f97316,#f43f5e)" accent={tone.accentHex} />
              </div>

              <div className="grid grid-cols-1 gap-1 sm:grid-cols-[1.1fr_1fr]">
                <div className="rounded-lg border border-white/10 bg-slate-900/50 px-1.5 py-1">
                  <div className="mb-0.5 flex items-center justify-between text-[8px] font-bold uppercase tracking-[0.16em] text-slate-300/85">
                    <span>Impulse Vector</span>
                    <span className={cn("inline-flex items-center gap-1", tone.subtleText)}>
                      {isUp ? <ArrowUpRight className="h-3 w-3" /> : edge.direction === "bearish" ? <ArrowDownRight className="h-3 w-3" /> : <ShieldAlert className="h-3 w-3" />}
                      {edge.direction.toUpperCase()}
                    </span>
                  </div>
                  <div className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-0.5">
                    {vectorBars.map((bar, i) => (
                      <div key={i} className="flex h-5 items-end rounded-[2px] bg-white/5 p-[1px]">
                        <div
                          className="w-full rounded-[2px]"
                          style={{
                            height: `${Math.round(bar * 100)}%`,
                            background: `linear-gradient(180deg, ${tone.accentHex}, rgba(255,255,255,0.9))`,
                            boxShadow: `0 0 7px ${tone.accentHex}`,
                          }}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div
                  className="rounded-lg border px-1.5 py-1"
                  style={{
                    borderColor: `${tone.accentHex}45`,
                    background: `linear-gradient(140deg, ${tone.accentHex}18, rgba(2,6,20,0.8))`,
                  }}
                >
                  <div className="mb-0.5 flex items-center gap-1.5 text-[8px] font-bold uppercase tracking-[0.16em] text-slate-300/90">
                    <Activity className="h-3 w-3" />
                    Edge Driver Stack
                    <span className="ml-auto inline-flex items-center gap-1 text-[8px] text-slate-400">
                      <Timer className="h-3 w-3" />
                      pre-break
                    </span>
                  </div>
                  <div className="max-h-[28px] overflow-hidden text-[10px] leading-snug text-slate-100/90">
                    {edge.reasons.slice(0, 2).join(" • ")}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-0.5 text-[8px]">
                    <span className="rounded-full border border-white/10 bg-slate-900/50 px-1.5 py-0.5 font-mono text-slate-200">
                      MACD {edge.indicators.macdHistogram >= 0 ? "+" : ""}{edge.indicators.macdHistogram.toFixed(2)}
                    </span>
                    <span className="rounded-full border border-white/10 bg-slate-900/50 px-1.5 py-0.5 font-mono text-slate-200">
                      TV {edge.indicators.tvRecommendAll.toFixed(2)}
                    </span>
                    <span className="rounded-full border border-white/10 bg-slate-900/50 px-1.5 py-0.5 font-mono text-slate-200">
                      VOL x{edge.indicators.volumeSpike.toFixed(2)}
                    </span>
                    <span className="rounded-full border border-white/10 bg-slate-900/50 px-1.5 py-0.5 font-mono text-slate-200">
                      MOM {edge.indicators.momentum >= 0 ? "+" : ""}{edge.indicators.momentum.toFixed(0)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between text-[9px] font-mono">
                <span className={cn("inline-flex items-center gap-1", tone.subtleText)}>Engine state {edge.state}</span>
                <span className="inline-flex items-center gap-1 text-slate-300/80">
                  <Gauge className="h-3 w-3" />
                  breakout signal {String(row.breakoutSignal || "n/a").toUpperCase()}
                </span>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
