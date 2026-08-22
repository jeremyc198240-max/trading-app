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

export default function ChronosBadge() {
  const [expanded, setExpanded] = useState(false);

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
      className={`chronos-breakout-card z-[9999] pointer-events-auto ${expanded ? "is-expanded" : ""} ${isExecuteWindow ? "execute" : "active"} ${isBullish ? "bull" : isBearish ? "bear" : "neutral"}`}
      title={`${top.id} • ${signalLabel} • lead ${top.leadMinutes ?? "-"}m • ${edgeScore} / ${confidence}`}
      role="button"
      tabIndex={0}
      onClick={() => setExpanded((value) => !value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          setExpanded((value) => !value);
        }
      }}
    >
      <div className="chronos-breakout-card__header">
        <div className="chronos-breakout-card__brand">
          <div className="chronos-breakout-card__mark" aria-hidden>⚡</div>
          <div className="chronos-breakout-card__title-wrap">
            <span className="chronos-breakout-card__symbol">{top.id?.toUpperCase() ?? "CHRONOS"}</span>
            <span className="chronos-breakout-card__label">MOMENTUM</span>
          </div>
        </div>
        <div className="chronos-breakout-card__score-box">
          <span>{Math.round(compositeScore)}%</span>
        </div>
      </div>

      {expanded && (
        <div className="chronos-breakout-card__dropdown">
          <div className="chronos-breakout-card__meta">
            <span className="chronos-breakout-card__trigger">TRIGGERED</span>
            <span className="chronos-breakout-card__lead">Lead {formatRemaining(remainingSec)}</span>
            <span className="chronos-breakout-card__age">{scanAgeMinutes}m ago</span>
          </div>

          <div className="chronos-breakout-card__action-row">
            <div className="chronos-breakout-card__action" style={{ borderColor: themeColor }}>
              {alertLevel}
            </div>
          </div>

          <div className="chronos-breakout-card__body">
            <div
              className={`warroom-smart-engine is-${isBullish ? "call" : isBearish ? "put" : "neutral"}`}
              aria-label={`Breakout alert ${signalLabel} at ${Math.round(compositeScore)} percent`}
              style={{
                width: "100%",
                minHeight: "9.5rem",
                "--engine-spin-speed": `${Math.max(4.2, 18 - compositeScore * 0.12)}s`,
                "--engine-spin-direction": isBearish ? "reverse" : "normal",
              }}
            >
              <div className="warroom-smart-engine__orbit" style={{ animationDuration: `${Math.max(4.2, 18 - compositeScore * 0.12)}s`, animationDirection: isBearish ? "reverse" : "normal" }}><i /><i /><i /></div>
              <svg viewBox="0 0 180 180" role="img">
                <circle className="warroom-smart-engine__halo" cx="90" cy="90" r="82" />
                <circle className="warroom-smart-engine__track" cx="90" cy="90" r="70" pathLength="100" />
                <circle className="warroom-smart-engine__probability" cx="90" cy="90" r="70" pathLength="100" style={{ strokeDasharray: `${Math.max(12, compositeScore)} ${100 - Math.max(12, compositeScore)}` }} />
                <circle className="warroom-smart-engine__track is-inner" cx="90" cy="90" r="55" pathLength="100" />
                <circle className="warroom-smart-engine__confidence" cx="90" cy="90" r="55" pathLength="100" style={{ strokeDasharray: `${Math.max(18, Math.min(100, confidence))} ${100 - Math.max(18, Math.min(100, confidence))}` }} />
                <circle className="warroom-smart-engine__track is-core" cx="90" cy="90" r="40" pathLength="100" />
                <circle className="warroom-smart-engine__reliability" cx="90" cy="90" r="40" pathLength="100" style={{ strokeDasharray: `${Math.max(12, Math.min(98, trigger))} ${100 - Math.max(12, Math.min(98, trigger))}` }} />
              </svg>
              <div className="warroom-smart-engine__readout">
                <span>{isExecuteWindow ? "EXECUTE" : alertLevel}</span>
                <strong>{Math.round(compositeScore)}</strong>
                <em>{signalLabel}</em>
                <small>{Math.round(trigger)}% trigger</small>
              </div>
            </div>
          </div>

          <div className="chronos-breakout-card__plan">
            <div className="chronos-breakout-card__plan-row">
              <span>PT1</span>
              <strong>{Math.round((compositeScore + 8) / 2)}% target</strong>
            </div>
            <div className="chronos-breakout-card__plan-row">
              <span>STOP</span>
              <strong>{Math.max(12, 100 - Math.round(compositeScore))}% risk</strong>
            </div>
            <div className="chronos-breakout-card__plan-row">
              <span>LEAD</span>
              <strong>{formatRemaining(remainingSec)}</strong>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .chronos-breakout-card{
          position:relative;
          display:inline-flex;
          align-items:center;
          gap:0.35rem;
          padding:0.15rem 0.4rem;
          border-radius:0.6rem;
          border:1px solid rgba(134,239,172,0.28);
          background:
            linear-gradient(135deg, rgba(8, 14, 24, 0.98), rgba(7, 12, 20, 0.96)),
            radial-gradient(circle at 12% 0%, rgba(16,185,129,0.18), transparent 30%);
          box-shadow:
            inset 0 0 12px rgba(16, 185, 129, 0.06),
            0 4px 10px rgba(2, 6, 23, 0.3);
          cursor:pointer;
          transition:transform 180ms ease, box-shadow 180ms ease;
        }
        .chronos-breakout-card:hover{ transform:translateY(-1px); }
        .chronos-breakout-card__dropdown{
          position:absolute;
          top:calc(100% + 0.4rem);
          left:0;
          z-index:9999;
          display:flex;
          flex-direction:column;
          gap:0.55rem;
          width:min(92vw, 340px);
          padding:0.7rem 0.8rem 0.8rem;
          border-radius:1rem;
          border:1px solid rgba(134,239,172,0.28);
          background:
            linear-gradient(135deg, rgba(8, 14, 24, 0.98), rgba(7, 12, 20, 0.96)),
            radial-gradient(circle at 12% 0%, rgba(16,185,129,0.18), transparent 30%);
          box-shadow:
            inset 0 0 24px rgba(16, 185, 129, 0.06),
            0 18px 34px rgba(2, 6, 23, 0.3),
            0 0 26px rgba(34, 211, 238, 0.08);
          backdrop-filter:blur(12px);
          overflow:hidden;
        }
        .chronos-breakout-card__header{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:0.65rem;
        }
        .chronos-breakout-card__brand{
          display:flex;
          align-items:center;
          gap:0.45rem;
          min-width:0;
        }
        .chronos-breakout-card__mark{
          display:grid;
          place-items:center;
          width:1.05rem;
          height:1.05rem;
          border-radius:0.5rem;
          background:radial-gradient(circle, rgba(110,231,183,0.24), rgba(255,255,255,0.04));
          color:#9ae6b4;
          font-size:0.6rem;
          box-shadow:inset 0 0 8px rgba(16,185,129,0.18), 0 0 6px rgba(16,185,129,0.12);
        }
        .chronos-breakout-card__title-wrap{
          display:flex;
          flex-direction:column;
          gap:0.08rem;
          min-width:0;
        }
        .chronos-breakout-card__symbol{
          font-size:0.6rem;
          font-weight:900;
          line-height:1;
          letter-spacing:0.1em;
          text-transform:uppercase;
          color:#f8fafc;
        }
        .chronos-breakout-card__label{
          display:none;
        }
        .chronos-breakout-card__score-box{
          display:grid;
          place-items:center;
          min-width:2.2rem;
          padding:0.08rem 0.32rem;
          border-radius:0.5rem;
          background:linear-gradient(135deg, rgba(16,185,129,0.16), rgba(6,78,59,0.14));
          border:1px solid rgba(52,211,153,0.28);
          box-shadow:inset 0 0 8px rgba(16,185,129,0.1);
        }
        .chronos-breakout-card__score-box span{
          font-family:"JetBrains Mono", monospace;
          font-size:0.6rem;
          font-weight:900;
          color:#a7f3d0;
          letter-spacing:0.04em;
        }
        .chronos-breakout-card__meta{
          display:flex;
          align-items:center;
          flex-wrap:wrap;
          gap:0.45rem;
          font-size:0.55rem;
          color:rgba(248,250,252,0.7);
        }
        .chronos-breakout-card__trigger{
          font-weight:800;
          letter-spacing:0.12em;
          text-transform:uppercase;
          color:#bbf7d0;
        }
        .chronos-breakout-card__lead,
        .chronos-breakout-card__age{ color:rgba(226,232,240,0.8); }
        .chronos-breakout-card__action-row{ display:flex; justify-content:flex-start; }
        .chronos-breakout-card__action{
          display:inline-flex;
          align-items:center;
          justify-content:center;
          padding:0.35rem 0.9rem;
          border-radius:0.7rem;
          border:1px solid rgba(52,211,153,0.7);
          background:linear-gradient(135deg, rgba(16,185,129,0.18), rgba(6,78,59,0.1));
          box-shadow:inset 0 0 14px rgba(16,185,129,0.12), 0 0 14px rgba(16,185,129,0.12);
          color:#dcfce7;
          font-size:0.72rem;
          font-weight:900;
          letter-spacing:0.16em;
          text-transform:uppercase;
        }
        .chronos-breakout-card__body{
          display:flex;
          justify-content:center;
          align-items:center;
        }
        .chronos-breakout-card .warroom-smart-engine {
          position:relative;
          display:grid;
          place-items:center;
          width:100%;
          min-height:9.5rem;
          border-radius:1rem;
          border:1px solid rgba(34,211,238,0.32);
          background:
            radial-gradient(circle at center, rgba(34,211,238,0.18) 0%, rgba(2,8,23,0.2) 40%, rgba(2,8,23,0.92) 100%),
            repeating-conic-gradient(from 0deg, rgba(125,211,252,0.08) 0deg 1deg, transparent 1deg 10deg);
          box-shadow:inset 0 0 28px rgba(34,211,238,0.12), 0 0 18px rgba(34,211,238,0.08);
          overflow:hidden;
        }
        .chronos-breakout-card .warroom-smart-engine svg{
          width:min(92%, 8.6rem);
          height:min(92%, 8.6rem);
          overflow:visible;
          transform:rotate(-90deg);
          filter:drop-shadow(0 0 10px rgba(var(--engine-color), 0.26));
        }
        .chronos-breakout-card .warroom-smart-engine__orbit {
          position:absolute;
          inset:6%;
          border:1px solid rgba(var(--engine-color),0.18);
          border-radius:50%;
          animation:chronos-spin 18s linear infinite reverse;
        }
        .chronos-breakout-card .warroom-smart-engine__orbit i {
          position:absolute;
          width:5px;
          height:5px;
          border-radius:50%;
          background:rgb(var(--engine-color));
          box-shadow:0 0 12px rgb(var(--engine-color));
        }
        .chronos-breakout-card .warroom-smart-engine__orbit i:nth-child(1) { left:49%; top:-3px; }
        .chronos-breakout-card .warroom-smart-engine__orbit i:nth-child(2) { right:4%; bottom:21%; }
        .chronos-breakout-card .warroom-smart-engine__orbit i:nth-child(3) { left:8%; bottom:14%; }
        .chronos-breakout-card .warroom-smart-engine__readout{
          position:absolute;
          inset:0;
          display:grid;
          place-items:center;
          line-height:1;
          text-align:center;
        }
        .chronos-breakout-card .warroom-smart-engine__readout span,
        .chronos-breakout-card .warroom-smart-engine__readout small{
          font-family:"JetBrains Mono", monospace;
          font-size:0.36rem;
          font-weight:800;
          letter-spacing:0.12em;
          text-transform:uppercase;
          color:rgba(207,250,254,0.62);
        }
        .chronos-breakout-card .warroom-smart-engine__readout strong{
          font-family:"JetBrains Mono", monospace;
          font-size:1.5rem;
          font-weight:900;
          color:rgb(var(--engine-color));
          text-shadow:0 0 14px rgba(var(--engine-color),0.8);
        }
        .chronos-breakout-card .warroom-smart-engine__readout em{
          margin:0.06rem 0 0.16rem;
          font-style:normal;
          font-size:0.42rem;
          font-weight:800;
          letter-spacing:0.12em;
          text-transform:uppercase;
          color:white;
        }
        .chronos-breakout-card__plan{
          display:grid;
          gap:0.38rem;
          padding-top:0.15rem;
        }
        .chronos-breakout-card__plan-row{
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:0.4rem;
          padding:0.34rem 0.45rem;
          border-radius:0.65rem;
          border:1px solid rgba(148,163,184,0.12);
          background:rgba(15,23,42,0.42);
        }
        .chronos-breakout-card__plan-row span{
          font-size:0.5rem;
          letter-spacing:0.14em;
          text-transform:uppercase;
          color:rgba(191,219,254,0.72);
        }
        .chronos-breakout-card__plan-row strong{
          font-family:"JetBrains Mono", monospace;
          font-size:0.66rem;
          font-weight:900;
          color:#f8fafc;
        }
        .chronos-breakout-card.execute{ animation:pulse 1.5s ease-in-out infinite; }
        .chronos-breakout-card.bull{ border-color:rgba(16,185,129,0.28); }
        .chronos-breakout-card.bear{ border-color:rgba(251,113,133,0.26); }
        .chronos-breakout-card.neutral{ border-color:rgba(34,211,238,0.24); }
        @keyframes pulse{0%,100%{ box-shadow:inset 0 0 24px rgba(16,185,129,0.06), 0 18px 34px rgba(2, 6, 23, 0.3), 0 0 20px rgba(34,211,238,0.08); } 50%{ box-shadow:inset 0 0 32px rgba(16,185,129,0.12), 0 20px 34px rgba(2, 6, 23, 0.34), 0 0 26px rgba(34,211,238,0.12); } }
        @keyframes chronos-spin{ from{ transform:rotate(0deg); } to{ transform:rotate(360deg); } }
      `}</style>
    </div>
  );
}
