import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

interface EdgeAlert {
  id: string;
  signal: string;
  edgeScore?: number;
  confidence?: number;
  leadMinutes?: number;
  triggerProbability?: number;
  patternState?: string;
  patternScore?: number;
  scanTime?: number;
  state?: string;
  direction?: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function computeAlertWeight(alert: EdgeAlert): number {
  const confidence = clamp(alert.confidence ?? 0, 0, 100);
  const edgeScore = clamp(alert.edgeScore ?? 0, 0, 100);
  const trigger = clamp(alert.triggerProbability ?? 0, 0, 100);
  const patternScore = clamp(alert.patternScore ?? 1, 0.5, 2);
  const ageMinutes = Number.isFinite(alert.scanTime ?? NaN)
    ? Math.max(0, (Date.now() - (alert.scanTime ?? 0)) / 1000 / 60)
    : 0;

  const recencyBonus = clamp(1.05 - Math.min(ageMinutes, 30) / 120, 0.75, 1.05);
  const stateBonus = String(alert.patternState ?? alert.state ?? "").toLowerCase().includes("executed")
    ? 1.22
    : String(alert.patternState ?? alert.state ?? "").toLowerCase().includes("ready")
    ? 1.12
    : String(alert.patternState ?? alert.state ?? "").toLowerCase().includes("arming")
    ? 1.08
    : 1;

  const signalBonus = String(alert.signal ?? "").toUpperCase().includes("BREAK")
    ? 1.08
    : 1;

  return (
    confidence * 0.38 +
    trigger * 0.28 +
    edgeScore * 0.22 +
    patternScore * 18 * 0.12
  ) * recencyBonus * stateBonus * signalBonus;
}

function pickTopAlert(alerts: EdgeAlert[] | undefined) {
  if (!alerts || alerts.length === 0) return null;
  return alerts.reduce((best, cur) => {
    if (!best) return cur;
    return computeAlertWeight(cur) > computeAlertWeight(best) ? cur : best;
  }, alerts[0]);
}

function RingGauge({ value, label, color, size = 52 }: { value: number; label: string; color: string; size?: number }) {
  const pct = clamp(value, 0, 100) / 100;
  const radius = size / 2 - 12;
  const center = size / 2;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const arc = (start: number, end: number) => {
    const s = toRad(start);
    const e = toRad(end);
    const x1 = center + radius * Math.cos(s);
    const y1 = center + radius * Math.sin(s);
    const x2 = center + radius * Math.cos(e);
    const y2 = center + radius * Math.sin(e);
    return `M ${x1} ${y1} A ${radius} ${radius} 0 ${end - start > 180 ? 1 : 0} 1 ${x2} ${y2}`;
  };

  const start = -220;
  const end = -40;
  const fillEnd = start + (end - start) * pct;
  const tickCount = 7;
  const ticks = Array.from({ length: tickCount }, (_, idx) => {
    const deg = start + ((end - start) / (tickCount - 1)) * idx;
    const outer = center + (radius + 3) * Math.cos(toRad(deg));
    const inner = center + (radius - 4) * Math.cos(toRad(deg));
    return { x1: inner, y1: center + (radius - 4) * Math.sin(toRad(deg)), x2: outer, y2: center + (radius + 3) * Math.sin(toRad(deg)), active: deg <= fillEnd };
  });

  return (
    <div className="chronos-ring-gauge" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={center} cy={center} r={radius + 2} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="1.4" />
        {ticks.map((tick, index) => (
          <line
            key={index}
            x1={tick.x1}
            y1={tick.y1}
            x2={tick.x2}
            y2={tick.y2}
            stroke={tick.active ? color : "rgba(255,255,255,0.1)"}
            strokeWidth={index === 0 || index === tickCount - 1 ? 1.6 : 1}
            strokeLinecap="round"
          />
        ))}
        <path d={arc(start, end)} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" strokeLinecap="round" strokeDasharray="4 4" />
        {pct > 0 && <path d={arc(start, fillEnd)} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round" style={{ filter: `drop-shadow(0 0 10px ${color}55)` }} />}
        {pct > 0.02 && <circle cx={center + radius * Math.cos(toRad(fillEnd))} cy={center + radius * Math.sin(toRad(fillEnd))} r="3.2" fill={color} />}
        <circle cx={center} cy={center} r={radius - 8} fill="rgba(0,0,0,0.18)" />
        <text x={center} y={center - 2} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize="11" fontWeight="800" fontFamily="monospace">
          {Math.round(clamp(value, 0, 100))}
        </text>
        <text x={center} y={center + 11} textAnchor="middle" dominantBaseline="middle" fill="rgba(255,255,255,0.38)" fontSize="7" fontWeight="700" letterSpacing="0.16em">
          {label}
        </text>
      </svg>
    </div>
  );
}

export default function ChronosBadge() {
  const { data: results } = useQuery<any[]>({
    queryKey: ["/api/scanner/results"],
    refetchInterval: 30000,
    staleTime: 3000,
  });

  const alertsFromRuntime = useMemo<EdgeAlert[] | undefined>(() => {
    if (Array.isArray(results) && results.length > 0) {
      return results.map((r) => ({
        id: r.symbol ?? r.id ?? "",
        signal: r.breakoutSignal ?? r.edgeEngine?.signal ?? "WAIT",
        edgeScore: r.edgeEngine?.edgeScore ?? r.breakoutScore,
        confidence: r.edgeEngine?.confidence,
        leadMinutes: r.edgeEngine?.leadMinutes,
        triggerProbability: r.edgeEngine?.triggerProbability,
        patternState: r.edgeEngine?.state ?? r.patternState,
        patternScore: r.edgeEngine?.patternScore ?? r.patternScore,
        scanTime: r.scanTime ?? r.edgeEngine?.timestamp ?? Date.now(),
        state: r.edgeEngine?.state,
        direction: r.edgeEngine?.direction,
      }));
    }

    const fromWindow = (window as any).__chronosAlerts;
    if (Array.isArray(fromWindow)) return fromWindow as EdgeAlert[];

    try {
      const raw = localStorage.getItem("chronos_alerts");
      if (raw) return JSON.parse(raw) as EdgeAlert[];
    } catch {
      // ignore malformed fallback
    }

    return undefined;
  }, [results]);

  const top = useMemo(() => pickTopAlert(alertsFromRuntime), [alertsFromRuntime]);

  const [remainingSec, setRemainingSec] = useState<number | null>(null);

  useEffect(() => {
    if (!top) {
      setRemainingSec(null);
      return;
    }

    const computeRemaining = () => {
      const scan = Number(top.scanTime ?? Date.now());
      const leadMs = (Number(top.leadMinutes ?? 0) || 0) * 60 * 1000;
      const target = scan + leadMs;
      const rem = Math.max(0, Math.round((target - Date.now()) / 1000));
      setRemainingSec(rem);
    };

    computeRemaining();
    const intervalId = setInterval(computeRemaining, 1000);
    return () => clearInterval(intervalId);
  }, [top]);

  if (!top) return null;

  const signalText = String(top.signal ?? "WAIT").replace(/_/g, " ").toUpperCase();
  const stateText = String(top.patternState ?? top.state ?? "STANDBY").replace(/_/g, " ").toUpperCase();
  const scanAgeMinutes = Math.round(Math.max(0, (Date.now() - (top.scanTime ?? Date.now())) / 60000));
  const signalLabel = signalText !== "WAIT" ? signalText : top.direction?.toUpperCase() ?? "WAIT";

  const confidence = clamp(top.confidence ?? 0, 0, 100);
  const edgeScore = clamp(top.edgeScore ?? 0, 0, 100);
  const trigger = clamp(top.triggerProbability ?? 0, 0, 100);
  const patternScore = clamp(top.patternScore ?? 1, 0.5, 2);
  const phaseMultiplier = stateText.includes("EXECUTED")
    ? 1.18
    : stateText.includes("READY")
    ? 1.12
    : stateText.includes("ARMING")
    ? 1.08
    : 1;
  const recencyMultiplier = clamp(1.02 - Math.min(scanAgeMinutes, 30) / 120, 0.82, 1.02);
  const compositeScore = clamp(Math.round((confidence * 0.42 + trigger * 0.28 + edgeScore * 0.2 + patternScore * 18 * 0.1) * phaseMultiplier * recencyMultiplier), 0, 100);

  const isBullish = signalText.includes("UP") || signalText.includes("CALL") || signalText === "BREAK_UP" || top.direction === "bullish";
  const isBearish = signalText.includes("DOWN") || signalText.includes("PUT") || signalText === "BREAK_DOWN" || top.direction === "bearish";
  const isExecuteWindow = stateText.includes("TRIGGERED") || stateText.includes("EXECUTE") || (trigger >= 70 && confidence >= 75 && (top.leadMinutes ?? 0) <= 12);
  const alertLevel = isExecuteWindow ? "EXECUTE" : stateText.includes("READY") ? "ARM" : stateText.includes("BUILD") || stateText.includes("PREP") ? "WATCH" : "STANDBY";

  const themeColor = isBullish ? "#22c55e" : isBearish ? "#f97316" : "#38bdf8";

  const formatRemaining = (seconds: number | null) => {
    if (seconds == null) return `${top.leadMinutes ?? "-"}m`;
    if (seconds <= 0) return "0:00";
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={`chronos-badge z-[9999] pointer-events-auto ${isExecuteWindow ? "execute" : "active"} ${isBullish ? "bull" : isBearish ? "bear" : "neutral"}`}
      title={`${top.id} • ${signalLabel} • lead ${top.leadMinutes ?? "-"}m • ${edgeScore} / ${confidence}`}
      role="status"
    >
      <div className="chronos-badge-mark" aria-hidden>
        <span>⚡</span>
      </div>
      <div className="chronos-badge-body">
        <div className="chronos-badge-title-row">
          <span className="chronos-badge-title">{top.id?.toUpperCase() ?? "CHRONOS"}</span>
          <span className="chronos-badge-signal">{signalLabel}</span>
        </div>
        <div className="chronos-badge-subrow">
          <span>{stateText}</span>
          <span>Lead {formatRemaining(remainingSec)}</span>
          <span>{scanAgeMinutes}m ago</span>
        </div>
        <div className="chronos-badge-status-row">
          <span className="chronos-badge-pulse" style={{ borderColor: themeColor }}>
            {alertLevel}
          </span>
          <span className="chronos-badge-score">{compositeScore}%</span>
        </div>
        <div className="chronos-gauge-grid">
          <RingGauge label="CONF" value={confidence} color="#60a5fa" size={48} />
          <RingGauge label="EDGE" value={edgeScore} color="#22c55e" size={48} />
          <RingGauge label="TRIG" value={trigger} color="#fb7185" size={48} />
        </div>
        <div className="chronos-metric-strip">
          <div className="metric-pill">Pattern ×{patternScore.toFixed(2)}</div>
          <div className="metric-pill">Signal {stateText.slice(0, 6)}</div>
          <div className="metric-pill">Score {compositeScore}</div>
        </div>
      </div>
      <style>{`
        .chronos-badge{display:inline-flex;align-items:stretch;gap:0.7rem;padding:10px 12px;border-radius:1.25rem;background:linear-gradient(135deg,rgba(5,10,20,0.96),rgba(6,12,24,0.92));color:#f8fafc;font-weight:700;box-shadow:0 16px 40px rgba(0,0,0,0.28);backdrop-filter:blur(14px);border:1px solid rgba(255,255,255,0.08);max-width:min(100%,340px);}
        .chronos-badge-mark{display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:999px;background:rgba(255,255,255,0.08);box-shadow:0 0 0 1px rgba(255,255,255,0.05);font-size:14px;flex-shrink:0;}
        .chronos-badge-body{display:flex;flex-direction:column;gap:5px;min-width:0;flex:1;}
        .chronos-badge-title-row{display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;}
        .chronos-badge-title{font-size:0.74rem;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#f8fafc;}
        .chronos-badge-signal{font-size:0.66rem;font-weight:700;text-transform:uppercase;color:rgba(248,250,252,0.8);letter-spacing:0.12em;}
        .chronos-badge-subrow{display:flex;flex-wrap:wrap;gap:0.55rem;font-size:0.64rem;color:rgba(248,250,252,0.72);}
        .chronos-badge-status-row{display:flex;align-items:center;justify-content:space-between;gap:0.6rem;}
        .chronos-badge-pulse{display:inline-flex;align-items:center;justify-content:center;padding:0.2rem 0.5rem;border-radius:999px;border:1px solid #7dd3fc;background:rgba(96,165,250,0.08);color:#e2e8f0;font-size:0.62rem;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;}
        .chronos-badge-score{font-size:0.84rem;font-weight:900;color:#f8fafc;}
        .chronos-gauge-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;padding-top:0.2rem;}
        .chronos-ring-gauge{display:flex;align-items:center;justify-content:center;}
        .chronos-metric-strip{display:flex;flex-wrap:wrap;gap:6px;padding-top:0.45rem;}
        .metric-pill{font-size:0.64rem;font-weight:700;padding:4px 8px;border-radius:999px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.08);color:rgba(248,250,252,0.78);}
        .chronos-badge.execute{animation:pulse 1.4s infinite;}
        .chronos-badge.bull{background:linear-gradient(135deg,rgba(16,185,129,0.18),rgba(6,182,212,0.1));border-color:rgba(16,185,129,0.18);}
        .chronos-badge.bear{background:linear-gradient(135deg,rgba(239,68,68,0.16),rgba(251,113,133,0.1));border-color:rgba(239,68,68,0.2);}
        .chronos-badge.neutral{background:linear-gradient(135deg,rgba(56,189,248,0.14),rgba(148,163,184,0.08));border-color:rgba(56,189,248,0.18);}
        @keyframes pulse{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.25px);}}
      `}</style>
    </div>
  );
}
