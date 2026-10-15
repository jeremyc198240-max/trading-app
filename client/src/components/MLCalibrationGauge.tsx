import { useQuery } from "@tanstack/react-query";
import { Target, AlertTriangle, CheckCircle, Sparkles, Activity, Zap, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { queryClient } from "@/lib/queryClient";
import type { SmartSignal, UnifiedOptionsPlay } from "@shared/schema";
import { useState, useEffect } from "react";

interface UnifiedSignalSummary {
  unifiedDirection: 'CALL' | 'PUT' | 'WAIT';
  unifiedConfidence: number;
  state?: string;
}

interface PanelTopPlay {
  strike: number;
  premium: number;
  greeks: { delta: number };
  expiration: { label: string };
  expansion: { confidence: number; rrRatio: number };
  score: { total: number; reasons?: string[] };
  side: 'call' | 'put';
}

interface PanelOptionCandidate {
  direction: 'CALLS' | 'PUTS';
  strike: number;
  premium: number;
  target: number;
  rr: number;
  expiration: string;
  confidence: number;
  score: number;
  source: 'Unified' | 'Top play';
}

interface MLCalibrationData {
  calibrationScore: number;
  confidence: number;
  stability: number;
  volatilityPrediction: number;
  lastUpdated: number;
  status: "calibrating" | "stable" | "needs_attention";
  unifiedSignal?: UnifiedSignalSummary | null;
  unifiedOptionsPlay?: UnifiedOptionsPlay | null;
  panelTopPlay?: PanelTopPlay | null;
  panelSummary?: string;
  panelDirection?: 'bullish' | 'bearish' | 'neutral';
  smartSignal?: SmartSignal | null;
}

export function MLCalibrationGauge({ symbol, timeframe }: { symbol?: string; timeframe?: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["ml-calibration", symbol, timeframe],
    queryFn: async ({ signal }): Promise<MLCalibrationData> => {
      const fusionPromise = symbol
        ? queryClient.fetchQuery<any>({
            queryKey: ["/api/fusion", symbol],
            staleTime: 10000,
          })
        : Promise.resolve(null);
      const panelPromise = symbol
        ? queryClient.fetchQuery<any>({
            queryKey: ["/api/monster-panel", symbol, timeframe || "15m"],
            staleTime: 10000,
          })
        : Promise.resolve(null);
      const volatilityPromise = queryClient.fetchQuery<any>({
        queryKey: ["/api/volatility", symbol || "SPY", timeframe || "15m"],
        staleTime: 10000,
      });

      const [calibrationResponse, volatilityData, fusionData, panelData] = await Promise.all([
        fetch("/api/ml/calibration", { signal }),
        volatilityPromise,
        fusionPromise,
        panelPromise,
      ]);

      if (!calibrationResponse.ok) {
        throw new Error("Failed to fetch calibration data");
      }

      const calibrationData = await calibrationResponse.json();
      let volatilityPrediction = 0.015;
      let unifiedSignal: UnifiedSignalSummary | null = null;
      let unifiedOptionsPlay: UnifiedOptionsPlay | null = null;
      let panelTopPlay: PanelTopPlay | null = null;
      let panelSummary = "";
      let panelDirection: 'bullish' | 'bearish' | 'neutral' = 'neutral';
      let smartSignal: SmartSignal | null = null;

      volatilityPrediction = Number(volatilityData?.predictedVolatility) || 0.015;

      if (fusionData) {
        try {
          unifiedSignal = {
            unifiedDirection: String(fusionData?.unifiedSignal?.unifiedDirection ?? "WAIT") as 'CALL' | 'PUT' | 'WAIT',
            unifiedConfidence: Number(fusionData?.unifiedSignal?.unifiedConfidence ?? calibrationData?.calibration?.confidence ?? 0),
            state: fusionData?.unifiedSignal?.state ?? undefined,
          };
          smartSignal = fusionData?.smartSignal ?? null;
        } catch {
          unifiedSignal = null;
          smartSignal = null;
        }
      }

      if (panelData) {
        try {
          unifiedOptionsPlay = panelData.unifiedOptionsPlay ?? null;
          panelTopPlay = panelData.topPlay ?? null;
          panelSummary = String(panelData.summary ?? "");
          panelDirection = String(panelData.direction ?? "neutral") as 'bullish' | 'bearish' | 'neutral';
        } catch {
          unifiedOptionsPlay = null;
          panelTopPlay = null;
          panelSummary = "";
          panelDirection = 'neutral';
        }
      }

      return {
        ...calibrationData.calibration,
        volatilityPrediction,
        unifiedSignal,
        unifiedOptionsPlay,
        panelTopPlay,
        panelSummary,
        panelDirection,
        smartSignal,
      };
    },
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const calibrationData = data || {
    calibrationScore: 75,
    confidence: 82,
    stability: 68,
    volatilityPrediction: 0.015,
    lastUpdated: Date.now(),
    status: "stable" as const,
    unifiedSignal: null,
    unifiedOptionsPlay: null,
    panelTopPlay: null,
    panelSummary: "",
    panelDirection: 'neutral' as const,
    smartSignal: null,
  };

  const fallbackCandidate = (topPlay: PanelTopPlay, panelDirection: 'bullish' | 'bearish' | 'neutral'): PanelOptionCandidate => {
    const direction = topPlay.side === 'call' ? 'CALLS' : 'PUTS';
    const rrValue = Math.max(1, topPlay.expansion.rrRatio || 1);
    const confidence = Math.round(Math.min(100, topPlay.expansion.confidence || 50));

    return {
      direction,
      strike: topPlay.strike,
      premium: topPlay.premium,
      target: Number((topPlay.premium * rrValue).toFixed(2)),
      rr: Number(rrValue.toFixed(2)),
      expiration: topPlay.expiration.label,
      confidence,
      score: topPlay.score.total,
      source: 'Top play',
    };
  };

  const optionPlay: UnifiedOptionsPlay | PanelOptionCandidate | null = calibrationData.unifiedOptionsPlay
    ? { ...calibrationData.unifiedOptionsPlay, source: 'Unified' }
    : calibrationData.panelTopPlay
      ? fallbackCandidate(calibrationData.panelTopPlay, calibrationData.panelDirection ?? 'neutral')
      : null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case "stable": return "text-emerald-300";
      case "needs_attention": return "text-amber-300";
      case "calibrating": return "text-sky-300";
      default: return "text-muted-foreground";
    }
  };

  const formatVolatilityLabel = (volatility: number) => {
    if (volatility <= 0.015) return "Low";
    if (volatility <= 0.03) return "Moderate";
    if (volatility <= 0.05) return "Elevated";
    return "Extreme";
  };

  const getPlayRecommendation = (data: MLCalibrationData) => {
    const { calibrationScore, confidence, stability, volatilityPrediction, unifiedOptionsPlay, panelSummary } = data;

    if (unifiedOptionsPlay) {
      return {
        label: "Unified Option Play",
        hint: `Target ${unifiedOptionsPlay.target.toFixed(2)} with ${unifiedOptionsPlay.direction === 'CALLS' ? 'CALL' : 'PUT'} ${unifiedOptionsPlay.strike.toFixed(0)} exp ${unifiedOptionsPlay.expiration}.`,
        badgeColor: unifiedOptionsPlay.direction === 'CALLS'
          ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/20"
          : "bg-rose-500/10 text-rose-300 border-rose-500/20",
      };
    }

    if (panelSummary) {
      return {
        label: "Top Play Candidate",
        hint: panelSummary,
        badgeColor: "bg-slate-700/10 text-slate-200 border-slate-700/20",
      };
    }

    if (calibrationScore >= 72 && confidence >= 68 && stability >= 62 && volatilityPrediction <= 0.035) {
      return {
        label: "0DTE Readiness",
        hint: "Model is aligned for selective same-day low-delta directional contracts.",
        badgeColor: "bg-cyan-500/10 text-cyan-300 border-cyan-500/20",
      };
    }

    if (calibrationScore >= 65 && confidence >= 60) {
      return {
        label: "Directional Watch",
        hint: "Monitor the waveform and wait for a tighter 0DTE entry with controlled risk.",
        badgeColor: "bg-amber-500/10 text-amber-300 border-amber-500/20",
      };
    }

    return {
      label: "Wait for Setup",
      hint: "Patience is best until ML confidence and volatility conditions improve.",
      badgeColor: "bg-slate-700/60 text-slate-200 border-slate-600/30",
    };
  };

  const SCAN = { background: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(255,255,255,0.009) 3px,rgba(255,255,255,0.009) 4px)" };

  // Arc dial — engine HUD style
  const ArcDial = ({ value, label, hex, size = 72, stateLabel }: { value: number; label: string; hex: string; size?: number; stateLabel?: string }) => {
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
    const fillEnd = -220 + 260 * Math.min(1, v / 100);
    const tipRad = toRad(fillEnd);
    const tipX = cx + r * Math.cos(tipRad);
    const tipY = cy + r * Math.sin(tipRad);
    const numTicks = 9;
    const ticks = Array.from({ length: numTicks }, (_, i) => {
      const deg = -220 + (260 / (numTicks - 1)) * i;
      const rad = toRad(deg); const tickR = outerR - 4;
      return { x1: cx + tickR * Math.cos(rad), y1: cy + tickR * Math.sin(rad), x2: cx + outerR * Math.cos(rad), y2: cy + outerR * Math.sin(rad), active: deg <= fillEnd };
    });
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
          {brackets.map((d, i) => <path key={i} d={d} fill="none" stroke={hex + "55"} strokeWidth="1.2" strokeLinecap="square" />)}
          <circle cx={cx} cy={cy} r={outerR - 1} fill="none" stroke={hex + "18"} strokeWidth="0.5" />
          {ticks.map(({ x1, y1, x2, y2, active }, i) => (
            <line key={i} x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={active ? hex + "dd" : "rgba(255,255,255,0.08)"}
              strokeWidth={i === 0 || i === numTicks - 1 ? "1.5" : "0.8"} strokeLinecap="round" />
          ))}
          <path d={arc(-220, 40, r)} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="7" strokeLinecap="round" strokeDasharray="4 3" />
          {v > 0 && <path d={arc(-220, fillEnd, r)} fill="none" stroke={hex} strokeWidth="9" strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 10px ${hex}cc)`, transition: "all 0.85s cubic-bezier(.4,0,.2,1)", opacity: 0.22 }} />}
          {v > 0 && <path d={arc(-220, fillEnd, r)} fill="none" stroke={hex} strokeWidth="5.5" strokeLinecap="round"
            style={{ filter: `drop-shadow(0 0 5px ${hex}aa)`, transition: "all 0.85s cubic-bezier(.4,0,.2,1)" }} />}
          {v > 2 && <circle cx={tipX} cy={tipY} r="3.5" fill={hex}
            style={{ filter: `drop-shadow(0 0 5px ${hex}) drop-shadow(0 0 12px ${hex}88)`, transition: "all 0.85s cubic-bezier(.4,0,.2,1)" }} />}
          <circle cx={cx} cy={cy} r={r - 9} fill={hex + "08"} />
          <circle cx={cx} cy={cy} r={r - 9} fill="none" stroke={hex + "25"} strokeWidth="0.5" />
          <text x={cx} y={cy - 3} textAnchor="middle" dominantBaseline="middle" fill={hex}
            fontSize={size < 80 ? 13 : 15} fontWeight="900" fontFamily="monospace"
            style={{ filter: `drop-shadow(0 0 6px ${hex}99)` }}>{Math.round(v)}</text>
          <text x={cx} y={cy + 9} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.32)" fontSize="5.5" fontWeight="700" letterSpacing="1.5">
            {stateLabel ?? (v >= 65 ? "BULL" : v <= 35 ? "BEAR" : "NEUT")}
          </text>
        </svg>
        <span className="text-[7px] font-black tracking-widest uppercase text-white/25">{label}</span>
      </div>
    );
  };

  // Bar gauge — LED segmented style
  const BarGauge = ({ name, strength, delay = 0, subtext }: { name: string; strength: number; delay?: number; subtext?: string }) => {
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
  };

  const isBull = calibrationData.unifiedSignal?.unifiedDirection === 'CALL';
  const isBear = calibrationData.unifiedSignal?.unifiedDirection === 'PUT';
  const theme = isBull ? { hex: "#10b981", topBar: "from-emerald-600 via-teal-400 to-cyan-500" } : isBear ? { hex: "#ef4444", topBar: "from-red-700 via-rose-500 to-orange-400" } : { hex: "#f59e0b", topBar: "from-amber-600 via-orange-400 to-yellow-400" };
  const BiasIcon = isBull ? TrendingUp : isBear ? TrendingDown : Minus;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-8 text-muted-foreground">
        <AlertTriangle className="w-8 h-8 mr-2" />
        <p className="text-sm">Calibration data unavailable</p>
      </div>
    );
  }

  return (
    <div
      className={cn("relative overflow-hidden rounded-xl border cursor-default select-none")}
      style={{ borderColor: theme.hex + "30", background: "linear-gradient(135deg,#07080d 0%,#0b0d18 60%,#060710 100%)", boxShadow: `0 0 32px ${theme.hex}14,inset 0 0 28px ${theme.hex}04` }}
    >
      <div className={cn("h-[2px] bg-gradient-to-r", theme.topBar)} />
      <div className="absolute inset-0 pointer-events-none" style={SCAN} />
      <div className="absolute -top-8 -right-8 w-24 h-24 rounded-full pointer-events-none" style={{background: `radial-gradient(circle,${theme.hex}18 0%,transparent 70%)`}} />

      <div className="relative z-10 p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div style={{background: theme.hex + "20", boxShadow: `0 0 8px ${theme.hex}40`}} className="p-1 rounded">
              <Zap className="w-3 h-3" style={{color: theme.hex}} />
            </div>
            <span className="text-[9px] font-black tracking-[0.2em] text-white/45 uppercase">ML Calibration</span>
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-55" style={{backgroundColor: theme.hex + "55"}} />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{backgroundColor: theme.hex}} />
            </span>
          </div>
        </div>

        {/* Bias + Score */}
        <div className="flex items-center gap-3">
          <div style={{background: theme.hex + "10", border: `1px solid ${theme.hex}20`, boxShadow: `0 0 12px ${theme.hex}28`}} className="p-2 rounded-lg">
            <BiasIcon className="w-6 h-6" style={{color: theme.hex}} />
          </div>
          <div className="flex-1">
            <div className="text-xl font-black uppercase leading-none" style={{color: theme.hex, textShadow: `0 0 14px ${theme.hex}65`}}>{calibrationData.unifiedSignal?.unifiedDirection ?? "WAIT"}</div>
            <div className="text-[9px] text-white/28 mt-0.5">{calibrationData.status.replace('_', ' ')}</div>
          </div>
          <div className="text-right">
            <div className="text-[26px] font-black font-mono leading-none" style={{color: theme.hex, textShadow: `0 0 14px ${theme.hex}65`}}>{Math.round(calibrationData.confidence)}%</div>
            <div className="text-[7px] text-white/18 tracking-widest uppercase">confidence</div>
          </div>
        </div>

        {/* Signal dials */}
        <div className="grid grid-cols-2 gap-1 pt-0.5 sm:grid-cols-4">
          <ArcDial value={calibrationData.calibrationScore} label="Calibration" hex={theme.hex} size={68} />
          <ArcDial value={calibrationData.stability} label="Stability" hex={theme.hex} size={68} />
          <ArcDial value={Math.min(100, Math.round(calibrationData.volatilityPrediction * 100))} label="Volatility" hex={theme.hex} size={68} />
          <ArcDial
            value={calibrationData.smartSignal?.probability ?? 0}
            label="Smart Move"
            hex={theme.hex}
            size={68}
            stateLabel={calibrationData.smartSignal?.direction ?? "WAIT"}
          />
        </div>

        {/* Intraday meter strip */}
        <div className="space-y-2 rounded-lg border p-2.5" style={{borderColor: theme.hex + "14", background: theme.hex + "05"}}>
          <div className="text-[8px] font-black tracking-widest uppercase text-white/28">Signal Pulse</div>
          <BarGauge name="ML Score" strength={calibrationData.calibrationScore} subtext={`${calibrationData.status === 'stable' ? '✓ STABLE' : calibrationData.status === 'needs_attention' ? '⚠ CAUTION' : '● CALIBRATING'}`} />
          <BarGauge name="Confidence" strength={calibrationData.confidence} subtext={calibrationData.volatilityPrediction <= 0.035 ? "✓ 0DTE READY" : "● MONITOR"} delay={60} />
          <BarGauge
            name="Historical Reliability"
            strength={calibrationData.smartSignal?.reliability ?? 0}
            subtext={calibrationData.smartSignal ? `${calibrationData.smartSignal.sampleSize} MATCHES · ${calibrationData.smartSignal.status}` : "SYNCING HISTORY"}
            delay={120}
          />
        </div>

        {/* Option play preview */}
        {optionPlay && (
          <div className="rounded-lg border p-2.5 flex items-center gap-3" style={{borderColor: theme.hex + "22", background: theme.hex + "06"}}>
            <div className="shrink-0 text-center">
              <div className="text-[8px] text-white/22 uppercase font-bold tracking-widest">{optionPlay.direction}</div>
              <div className="text-xl font-black font-mono" style={{color: theme.hex, textShadow: `0 0 10px ${theme.hex}45`}}>${optionPlay.strike}</div>
              <div className="text-[7px] text-white/18 font-bold">{optionPlay.expiration}</div>
            </div>
            <div className="flex-1 border-l pl-3" style={{borderColor: theme.hex + "18"}}>
              <div className="text-[8px] text-white/18 font-bold uppercase tracking-widest mb-1">Target → R:R</div>
              <div className="text-[10px] font-black" style={{color: theme.hex}}>${optionPlay.target} → {optionPlay.rr}:1</div>
              <div className="text-[7px] text-white/24 mt-0.5">{optionPlay.source}</div>
            </div>
          </div>
        )}

        {/* Metrics grid */}
        <div className="grid grid-cols-2 gap-2 text-[10px]">
          <div className="rounded-lg border px-3 py-2" style={{borderColor: theme.hex + "16", background: "rgba(0,0,0,0.18)"}}>
            <div className="text-[7px] font-black tracking-widest text-white/20 uppercase">Edge Score</div>
            <div className="text-[12px] font-black font-mono mt-1" style={{color: theme.hex}}>{Math.round((calibrationData.calibrationScore  * 0.36 + calibrationData.confidence * 0.34 + calibrationData.stability * 0.22) / 0.92)}%</div>
          </div>
          <div className="rounded-lg border px-3 py-2" style={{borderColor: theme.hex + "16", background: "rgba(0,0,0,0.18)"}}>
            <div className="text-[7px] font-black tracking-widest text-white/20 uppercase">Last Refresh</div>
            <div className="text-[11px] font-black mt-1 text-slate-100">{new Date(calibrationData.lastUpdated).toLocaleTimeString()}</div>
          </div>
        </div>
      </div>
    </div>
  );
}