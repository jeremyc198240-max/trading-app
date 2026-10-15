import { useEffect, useState } from "react";
import { Activity, ArrowDownRight, ArrowUpRight, Gauge, Landmark, RefreshCw, ShieldAlert, Waves, Zap } from "lucide-react";
import { fetchMacroSnapshot, type MacroSnapshot } from "@/services/macroSignalsService";

const number = (value: number, suffix = "%") => `${value >= 0 ? "" : "-"}${Math.abs(value).toFixed(2)}${suffix}`;


export function MacroYieldsTab({ timeframe }: { timeframe?: string }) {
  const [snapshot, setSnapshot] = useState<MacroSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const loadSnapshot = async () => {
      if (mounted) setIsRefreshing(true);
      try {
        const data = await fetchMacroSnapshot(timeframe, controller.signal);
        if (mounted) {
          setSnapshot(data);
          setError(null);
        }
      } catch (reason) {
        if (mounted && !controller.signal.aborted) setError(reason instanceof Error ? reason.message : "Macro feed unavailable. Retry when the data provider is online.");
      } finally {
        if (mounted) setIsRefreshing(false);
      }
    };
    void loadSnapshot();
    const intervalId = window.setInterval(() => void loadSnapshot(), 5 * 60 * 1000);
    return () => {
      mounted = false;
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [retryKey, timeframe]);

  if (error) return <div className="warroom-macro__state is-error"><ShieldAlert className="h-5 w-5" /><div><strong>{error}</strong><button type="button" onClick={() => { setError(null); setSnapshot(null); setRetryKey((key) => key + 1); }}>Retry live feed</button></div></div>;
  if (!snapshot) return <div className="warroom-macro__state"><Activity className="h-5 w-5" /><strong>Loading Treasury, credit, and liquidity signals...</strong></div>;

  const macroHealth = Math.round(Math.max(0, Math.min(100, 100 - (snapshot.creditStress.score * 0.45 + snapshot.liquidityStress.score * 0.35 + Math.max(0, -snapshot.yieldSpreads.twoSTen) * 12))));
  const curveTone = snapshot.yieldSpreads.twoSTen >= 0 ? "positive" : "negative";
  const curveMessage = snapshot.yieldSpreads.twoSTen >= 0 ? "Curve is positively sloped" : "Curve remains inverted";
  const observedAt = snapshot.observedAt ? new Date(`${snapshot.observedAt}T12:00:00`) : null;
  const observationAgeDays = observedAt && Number.isFinite(observedAt.getTime()) ? Math.max(0, Math.floor((Date.now() - observedAt.getTime()) / 86_400_000)) : null;
  const feedFresh = observationAgeDays == null || observationAgeDays <= 4;
  const curveYields = [
    { label: "3M", value: snapshot.treasuryYields.threeMonth },
    { label: "2Y", value: snapshot.treasuryYields.twoYear },
    { label: "5Y", value: snapshot.treasuryYields.fiveYear },
    { label: "10Y", value: snapshot.treasuryYields.tenYear },
    { label: "30Y", value: snapshot.treasuryYields.thirtyYear },
  ];
  const curveMin = Math.min(...curveYields.map((point) => point.value));
  const curveMax = Math.max(...curveYields.map((point) => point.value));
  const curveRange = Math.max(0.25, curveMax - curveMin);
  const curvePoints = curveYields.map((point, index) => ({ ...point, x: 10 + index * 125, y: 160 - ((point.value - curveMin) / curveRange) * 120 }));
  const curvePolyline = curvePoints.map((point) => `${point.x},${point.y}`).join(" ");
  const curveFill = `10,180 ${curvePolyline} 510,180`;
  const cards = [
    ["Macro regime", snapshot.regime, snapshot.regime === "Expansion" ? "positive" : snapshot.regime === "Crisis" ? "negative" : "warning", snapshot.regime === "Expansion" ? "RISK-ON" : snapshot.regime === "Crisis" ? "DEFENSIVE" : "CAUTION"],
    ["SPY bias", snapshot.spyBias, snapshot.spyBias === "Bullish" ? "positive" : snapshot.spyBias === "Bearish" ? "negative" : "warning", snapshot.spyBias === "Bullish" ? "UPSIDE" : snapshot.spyBias === "Bearish" ? "DOWNSIDE" : "WAIT"],
    ["Volatility bias", snapshot.volatilityBias, snapshot.volatilityBias === "IV Compression" ? "positive" : "warning", snapshot.volatilityBias === "IV Compression" ? "PREMIUM EASING" : "PREMIUM RISING"],
    ["Credit stress", `${Math.round(snapshot.creditStress.score)}/100`, snapshot.creditStress.score >= 50 ? "negative" : "positive", snapshot.creditStress.label.toUpperCase()],
    ["Liquidity stress", `${Math.round(snapshot.liquidityStress.score)}/100`, snapshot.liquidityStress.score >= 50 ? "negative" : "positive", snapshot.liquidityStress.label.toUpperCase()],
  ];

  return <div className="warroom-macro">
    <div className="warroom-macro__heading"><div><span className="warroom-command-deck__label"><Landmark className="h-3.5 w-3.5" /> Macro tape</span><h3>Yields &amp; Curves</h3></div><div className="warroom-macro__engine-health"><span className={feedFresh ? "is-live" : "is-delayed"}>{isRefreshing ? "SYNCING" : feedFresh ? "FRED ONLINE" : "OBSERVATION DELAY"}</span><small>OBSERVED {snapshot.observedAt ?? "--"}{observationAgeDays != null ? ` · ${observationAgeDays}D OLD` : ""}</small><button type="button" onClick={() => setRetryKey((key) => key + 1)} disabled={isRefreshing} title="Refresh macro engine"><RefreshCw className={isRefreshing ? "is-spinning" : ""} /></button></div></div>
    <div className="warroom-macro__hero">
      <div className="warroom-macro__pulse"><div className="warroom-macro__pulse-ring"><span>MACRO<br />HEALTH</span><strong>{macroHealth}</strong><small>/ 100</small></div><div className="warroom-macro__pulse-orbit" /></div>
      <div className="warroom-macro__hero-copy"><span className="warroom-command-deck__label"><Zap className="h-3.5 w-3.5" /> SPY context engine</span><strong>{snapshot.spyBias.toUpperCase()} <em>·</em> {snapshot.volatilityBias.toUpperCase()}</strong><p>{curveMessage}. Credit is {snapshot.creditStress.label.toLowerCase()} and liquidity is {snapshot.liquidityStress.label.toLowerCase()}. Use this as a regime filter before an existing War Room trigger.</p><div className="warroom-macro__wave" aria-label="Macro signal wave"><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /><i /></div></div>
      <div className={`warroom-macro__curve ${curveTone}`}><span>CURVE SHAPE</span><strong>{snapshot.yieldSpreads.twoSTen >= 0 ? "NORMALIZING" : "INVERTED"}</strong><small>2s10s {number(snapshot.yieldSpreads.twoSTen)}</small><div className="warroom-macro__curve-line"><i /><b /><i /></div></div>
    </div>
    <LiveYieldCurve points={curvePoints} polyline={curvePolyline} fill={curveFill} minimum={curveMin} maximum={curveMax} tone={curveTone} fresh={feedFresh} />
    <div className="warroom-macro__key-grid">
      <MacroValue label="2Y Treasury" value={number(snapshot.treasuryYields.twoYear)} intensity={snapshot.treasuryYields.twoYear / 5} />
      <MacroValue label="10Y Treasury" value={number(snapshot.treasuryYields.tenYear)} intensity={snapshot.treasuryYields.tenYear / 5} />
      <MacroValue label="30Y Treasury" value={number(snapshot.treasuryYields.thirtyYear)} intensity={snapshot.treasuryYields.thirtyYear / 5} />
      <MacroValue label="2s10s" value={number(snapshot.yieldSpreads.twoSTen)} tone={curveTone} intensity={Math.abs(snapshot.yieldSpreads.twoSTen) / 2} />
      <MacroValue label="3M10Y" value={number(snapshot.yieldSpreads.threeM10Y)} tone={snapshot.yieldSpreads.threeM10Y >= 0 ? "positive" : "negative"} intensity={Math.abs(snapshot.yieldSpreads.threeM10Y) / 2} />
      <MacroValue label="10Y real yield" value={number(snapshot.realYields.tenYear)} tone={snapshot.realYields.tenYear >= 0 ? "positive" : "negative"} intensity={Math.abs(snapshot.realYields.tenYear) / 3} />
    </div>
    <div className="warroom-macro__card-grid">{cards.map(([label, value, tone, status]) => <div className={`warroom-macro__signal is-${tone}`} key={label}><div className="warroom-macro__signal-head"><span>{label}</span><i>{status}</i></div><strong>{value}</strong><small>{tone === "negative" ? "ADVERSE TAPE" : tone === "warning" ? "TRANSITION TAPE" : "SUPPORTIVE TAPE"}</small><b className="warroom-macro__signal-beacon" />{(label === "Credit stress" || label === "Liquidity stress") ? <Meter value={label === "Credit stress" ? snapshot.creditStress.score : snapshot.liquidityStress.score} tone={tone} /> : null}</div>)}</div>
    <div className="warroom-macro__detail-grid">
      <div className="warroom-macro__panel warroom-macro__curve-monitor"><div className="warroom-macro__panel-head"><div className="warroom-command-deck__label"><Gauge className="h-3.5 w-3.5" /> Curve monitor</div><span className={`warroom-macro__live-dot ${curveTone}`}>LIVE SHAPE</span></div><div className={`warroom-macro__plot ${curveTone}`}><div className="warroom-macro__plot-axis"><span>+2.0</span><span>+1.0</span><span>0.0</span><span>-1.0</span></div><svg viewBox="0 0 520 190" role="img" aria-label="Treasury yield curve spread plot" preserveAspectRatio="none"><defs><linearGradient id="macro-curve-fill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#22d3ee" stopOpacity=".28" /><stop offset="1" stopColor="#22d3ee" stopOpacity="0" /></linearGradient><filter id="macro-curve-glow"><feGaussianBlur stdDeviation="3" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter></defs><path className="warroom-macro__plot-fill" d="M0 108 C65 72 105 125 170 91 S282 72 350 101 S430 122 520 52 L520 190 L0 190 Z" /><path className="warroom-macro__plot-grid" d="M0 28H520 M0 76H520 M0 124H520 M0 172H520 M86 0V190 M173 0V190 M260 0V190 M347 0V190 M434 0V190" /><path className="warroom-macro__plot-line" d="M0 108 C65 72 105 125 170 91 S282 72 350 101 S430 122 520 52" filter="url(#macro-curve-glow)" /><circle className="is-two" cx="0" cy="108" r="5" /><circle className="is-three" cx="173" cy="91" r="5" /><circle className="is-five" cx="347" cy="101" r="5" /><circle className="is-thirty" cx="520" cy="52" r="5" /></svg><div className="warroom-macro__plot-labels"><span>2Y / 3M</span><span>5Y</span><span>10Y</span><span>30Y</span></div></div><div className="warroom-macro__curve-readout"><div><span>2s10s</span><strong>{number(snapshot.yieldSpreads.twoSTen)}</strong></div><div><span>3M10Y</span><strong>{number(snapshot.yieldSpreads.threeM10Y)}</strong></div><div><span>5s30s</span><strong>{number(snapshot.yieldSpreads.fiveSThirty)}</strong></div></div><div className="warroom-macro__curve-footer"><span>Inflation {number(snapshot.inflation.inflationExpectations ?? 0)}</span><span>HY {number(snapshot.creditSpreads.highYield)}</span><span>IG {number(snapshot.creditSpreads.investmentGrade)}</span></div></div>
      <div className="warroom-macro__panel warroom-macro__playbook"><div className="warroom-command-deck__label"><ArrowUpRight className="h-3.5 w-3.5" /> Day-trade playbook</div>{snapshot.optionsStructures.map((structure, index) => <div className={`warroom-macro__structure is-${structure.stance.toLowerCase()}`} key={structure.name}><div className="warroom-macro__structure-head"><b>0{index + 1}</b><strong>{structure.name}</strong><span>{structure.stance}</span></div><p>{structure.description}</p><div className="warroom-macro__structure-data"><span><i>TRIGGER</i>{structure.trigger}</span><span><i>TIMING</i>{structure.timing}</span><span><i>RISK</i>{structure.risk}</span><span><i>INVALIDATION</i>{structure.invalidation}</span></div></div>)}</div>
    </div>
    <div className="warroom-macro__note"><ArrowDownRight className="h-3.5 w-3.5" /> Macro signals are context, not an entry trigger. Confirm with the existing War Room execution gate.</div>
  </div>;
}

function MacroValue({ label, value, tone = "neutral", intensity = 0.5 }: { label: string; value: string; tone?: "positive" | "negative" | "neutral"; intensity?: number }) {
  const safeIntensity = Math.min(1, Math.max(0.18, intensity));
  return <div className={`warroom-macro__key ${tone}`}><div><span>{label}</span><small>{tone === "negative" ? "RISK" : tone === "positive" ? "SUPPORT" : "RATE"}</small></div><strong>{value}</strong><i className="warroom-macro__key-pulse" style={{ height: `${safeIntensity * 100}%` }} /><b className="warroom-macro__key-spark" style={{ width: `${safeIntensity * 100}%` }} /></div>;
}

function Meter({ value, tone }: { value: number; tone: string }) {
  return <div className={`warroom-macro__meter ${tone}`}><i style={{ width: `${Math.min(100, Math.max(0, value))}%` }} /></div>;
}

function CurveBar({ label, value }: { label: string; value: number }) {
  const width = Math.min(100, Math.max(8, 50 + value * 45));
  return <div className="warroom-macro__curve-bar"><span>{label}</span><i><b className={value >= 0 ? "is-positive" : "is-negative"} style={{ width: `${width}%` }} /></i><strong>{number(value)}</strong></div>;
}

function LiveYieldCurve({ points, polyline, fill, minimum, maximum, tone, fresh }: {
  points: Array<{ label: string; value: number; x: number; y: number }>;
  polyline: string;
  fill: string;
  minimum: number;
  maximum: number;
  tone: "positive" | "negative";
  fresh: boolean;
}) {
  return <div className={`warroom-macro__live-curve ${tone}`}>
    <div className="warroom-macro__panel-head"><div className="warroom-command-deck__label"><Gauge className="h-3.5 w-3.5" /> Live Treasury term structure</div><span className={`warroom-macro__live-dot ${fresh ? tone : "negative"}`}>{fresh ? "FRED CURVE" : "DELAYED"}</span></div>
    <div className="warroom-macro__live-curve-grid">
      <div className="warroom-macro__live-curve-axis"><span>{number(maximum)}</span><span>{number((maximum + minimum) / 2)}</span><span>{number(minimum)}</span></div>
      <svg viewBox="0 0 520 190" role="img" aria-label={`Live Treasury yield curve: ${points.map((point) => `${point.label} ${number(point.value)}`).join(", ")}`} preserveAspectRatio="none">
        <path className="warroom-macro__plot-grid" d="M0 28H520 M0 76H520 M0 124H520 M0 172H520 M10 0V190 M135 0V190 M260 0V190 M385 0V190 M510 0V190" />
        <polygon className="warroom-macro__plot-fill" points={fill} />
        <polyline className="warroom-macro__plot-line" points={polyline} />
        {points.map((point) => <circle key={point.label} cx={point.x} cy={point.y} r="5" />)}
      </svg>
      <div className="warroom-macro__live-curve-labels">{points.map((point) => <span key={point.label}><b>{point.label}</b><small>{number(point.value)}</small></span>)}</div>
    </div>
  </div>;
}
