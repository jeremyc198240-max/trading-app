import type { NormalizedPattern, OHLC } from "@shared/schema";
import { useId } from "react";

interface PatternCardVisualProps {
  candles: OHLC[];
  pattern: NormalizedPattern;
  score?: number;
  grade?: string;
}

interface PreviewCandle extends OHLC {
  sourceIndex: number;
}

const WIDTH = 360;
const HEIGHT = 176;
const PLOT_TOP = 30;
const PLOT_BOTTOM = 142;
const PLOT_LEFT = 12;
const PLOT_RIGHT = 348;

function validCandle(candle: OHLC | undefined): candle is OHLC {
  return Boolean(candle && [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite));
}

function normalizedCandle(candle: OHLC, sourceIndex: number): PreviewCandle {
  return {
    ...candle,
    sourceIndex,
    high: Math.max(candle.high, candle.open, candle.close),
    low: Math.min(candle.low, candle.open, candle.close),
  };
}

function finiteLevel(value: number | null | undefined): value is number {
  return Number.isFinite(value);
}

function compactGeometryLabel(label: string): string {
  const normalized = label.replace(/\s*\(forming\)$/i, "").trim();
  const lower = normalized.toLowerCase();
  if (lower.includes("spinning top")) return "SPIN";
  if (lower.includes("long-legged doji")) return "LONG DOJI";
  if (lower.includes("dragonfly doji")) return "DRAGONFLY";
  if (lower.includes("gravestone doji")) return "GRAVESTONE";
  if (lower.includes("doji")) return "DOJI";
  if (lower.includes("engulfing")) return "ENGULF";
  if (lower.includes("morning star")) return "M STAR";
  if (lower.includes("evening star")) return "E STAR";
  return normalized.length > 14 ? normalized.slice(0, 13).trimEnd() + "." : normalized.toUpperCase();
}

export function PatternCardVisual({ candles, pattern, score, grade }: PatternCardVisualProps) {
  const lastIndex = candles.length - 1;
  const safePatternStart = Number.isFinite(pattern.startIndex) ? Math.floor(pattern.startIndex) : 0;
  const safePatternEnd = Number.isFinite(pattern.endIndex) ? Math.floor(pattern.endIndex) : safePatternStart;
  const patternStart = Math.max(0, Math.min(safePatternStart, lastIndex));
  const patternEnd = Math.max(patternStart, Math.min(safePatternEnd, lastIndex));
  const isCandleSetup = pattern.category === "candlestick" || pattern.category === "gap";
  const geometryPoints = Array.from(pattern.geometry.points.filter((point) =>
    Number.isFinite(point.x) && Number.isFinite(point.y) && point.x >= 0 && point.x <= lastIndex,
  ).reduce((points, point) => {
    const key = `${point.x.toFixed(4)}|${point.y.toFixed(6)}`;
    const existing = points.get(key);
    if (!existing || (!existing.label && point.label)) points.set(key, point);
    return points;
  }, new Map<string, NormalizedPattern["geometry"]["points"][number]>()).values());
  const geometryLines = Array.from(pattern.geometry.lines.filter((line) =>
    [line.start.x, line.start.y, line.end.x, line.end.y].every(Number.isFinite) &&
    Math.max(line.start.x, line.end.x) >= 0 && Math.min(line.start.x, line.end.x) <= lastIndex,
  ).reduce((lines, line) => {
    const start = `${line.start.x.toFixed(4)}|${line.start.y.toFixed(6)}`;
    const end = `${line.end.x.toFixed(4)}|${line.end.y.toFixed(6)}`;
    const key = `${start < end ? `${start}|${end}` : `${end}|${start}`}|${line.style ?? "solid"}`;
    if (!lines.has(key)) lines.set(key, line);
    return lines;
  }, new Map<string, NormalizedPattern["geometry"]["lines"][number]>()).values());
  const clipId = `pattern-plot-${useId().replace(/:/g, "")}`;
  const geometryIndexes = [
    ...geometryPoints.map((point) => point.x),
    ...geometryLines.flatMap((line) => [line.start.x, line.end.x].map((index) => Math.max(0, Math.min(index, lastIndex)))),
  ];
  const geometryStart = geometryIndexes.length ? Math.min(...geometryIndexes) : patternStart;
  const geometryEnd = geometryIndexes.length ? Math.max(...geometryIndexes) : patternEnd;
  const viewStart = Math.max(0, Math.floor(Math.min(isCandleSetup ? patternStart - 2 : patternStart, geometryStart)));
  const viewEnd = Math.min(lastIndex, Math.ceil(Math.max(isCandleSetup ? patternEnd + 1 : patternEnd, geometryEnd)));
  const sourceCandles = candles
    .slice(viewStart, viewEnd + 1)
    .map((candle, offset) => ({ candle, sourceIndex: viewStart + offset }))
    .filter(({ candle }) => validCandle(candle))
    .map(({ candle, sourceIndex }) => normalizedCandle(candle, sourceIndex));

  if (!sourceCandles.length) {
    return <div className="warroom-pattern-visual is-empty">Pattern visual unavailable</div>;
  }

  const stride = Math.max(1, Math.ceil(sourceCandles.length / 34));
  const visibleCandles = sourceCandles.filter((candle, index) =>
    (candle.sourceIndex >= patternStart && candle.sourceIndex <= patternEnd) ||
    index % stride === 0 ||
    index === sourceCandles.length - 1,
  );
  const geometryPrices = [
    ...geometryPoints.map((point) => point.y),
    ...geometryLines.flatMap((line) => [line.start.y, line.end.y]),
  ].filter(Number.isFinite);
  const tradeLevels = [pattern.breakoutLevel, pattern.priceTarget, pattern.stopLoss].filter(finiteLevel);
  const formationPrices = [...sourceCandles.flatMap((candle) => [candle.high, candle.low]), ...geometryPrices];
  const formationLow = Math.min(...formationPrices);
  const formationHigh = Math.max(...formationPrices);
  const formationSpan = Math.max(formationHigh - formationLow, Math.abs(formationHigh) * 0.0005, 0.01);
  const visibleTradeLevels = tradeLevels.filter((level) =>
    level >= formationLow - formationSpan * 0.45 && level <= formationHigh + formationSpan * 0.45);
  const prices = [...formationPrices, ...visibleTradeLevels];
  const rawLow = Math.min(...prices);
  const rawHigh = Math.max(...prices);
  const padding = Math.max((rawHigh - rawLow) * 0.12, Math.abs(rawHigh) * 0.0005, 0.01);
  const minPrice = rawLow - padding;
  const maxPrice = rawHigh + padding;
  const priceRange = Math.max(maxPrice - minPrice, 0.01);
  const indexRange = Math.max(viewEnd - viewStart, 1);
  const x = (index: number) => PLOT_LEFT + ((index - viewStart) / indexRange) * (PLOT_RIGHT - PLOT_LEFT);
  const y = (price: number) => PLOT_TOP + ((maxPrice - price) / priceRange) * (PLOT_BOTTOM - PLOT_TOP);
  const candleWidth = Math.min(isCandleSetup ? 24 : 8, Math.max(3, ((PLOT_RIGHT - PLOT_LEFT) / Math.max(visibleCandles.length, 1)) * 0.55));
  const directionColor = pattern.direction === "bullish" ? "#34d399" : pattern.direction === "bearish" ? "#fb7185" : "#fbbf24";
  const lifecycleLabel = pattern.state === "valid" ? "FORMED" : pattern.state.toUpperCase();
  const setupCount = Math.max(1, patternEnd - patternStart + 1);
  const ageBars = Math.max(0, lastIndex - patternEnd);
  const bandStart = Math.max(PLOT_LEFT, x(patternStart) - candleWidth * 0.8);
  const bandEnd = Math.min(PLOT_RIGHT, x(patternEnd) + candleWidth * 0.8);
  const entry = pattern.breakoutLevel;
  const target = pattern.priceTarget;
  const stop = pattern.stopLoss;
  const riskReward = finiteLevel(entry) && finiteLevel(target) && finiteLevel(stop) && Math.abs(entry - stop) > 0
    ? Math.abs(target - entry) / Math.abs(entry - stop)
    : null;
  const finalScore = Math.round(score ?? pattern.confidence * 0.65 + pattern.quality * 35);
  const projectionStartIndex = Math.min(viewEnd, patternEnd);
  const projectionEndIndex = Math.min(viewEnd, Math.max(projectionStartIndex + 1, viewEnd));
  const projectionStartPrice = sourceCandles.find((candle) => candle.sourceIndex === projectionStartIndex)?.close;
  const targetIsVisible = finiteLevel(target) && target >= minPrice && target <= maxPrice;
  const projectionEndPrice = targetIsVisible
    ? target
    : finiteLevel(projectionStartPrice)
      ? projectionStartPrice + (pattern.direction === "bullish" ? 1 : pattern.direction === "bearish" ? -1 : 0) * priceRange * 0.16
      : null;

  const levelRows = [
    finiteLevel(entry) ? { label: "TRIGGER", price: entry, className: "is-trigger" } : null,
    finiteLevel(target) ? { label: "TARGET", price: target, className: "is-target" } : null,
    finiteLevel(stop) ? { label: "INVALID", price: stop, className: "is-stop" } : null,
  ].filter((level): level is { label: string; price: number; className: string } =>
    Boolean(level && level.price >= minPrice && level.price <= maxPrice));

  return <div className={`warroom-pattern-visual is-${pattern.direction} is-${pattern.state}`}>
    <div className="warroom-pattern-visual__meta">
      <span>{isCandleSetup ? `${setupCount}-CANDLE ${setupCount <= 3 ? "REVERSAL" : "SETUP"}` : "STRUCTURE MAP"} · {ageBars === 0 ? "LATEST" : `${ageBars} BAR${ageBars === 1 ? "" : "S"} AGO`}</span>
      <strong><i />{lifecycleLabel}</strong>
    </div>
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`${pattern.name} ${lifecycleLabel.toLowerCase()} pattern preview`}>
      <defs>
        <clipPath id={clipId}>
          <rect x={PLOT_LEFT} y={PLOT_TOP} width={PLOT_RIGHT - PLOT_LEFT} height={PLOT_BOTTOM - PLOT_TOP} />
        </clipPath>
      </defs>
      {[0, 1, 2, 3].map((row) => {
        const gridY = PLOT_TOP + ((PLOT_BOTTOM - PLOT_TOP) / 3) * row;
        return <line className="warroom-pattern-visual__grid" key={row} x1="0" x2={WIDTH} y1={gridY} y2={gridY} />;
      })}
      <rect className="warroom-pattern-visual__formation-zone" x={bandStart} y={PLOT_TOP} width={Math.max(4, bandEnd - bandStart)} height={PLOT_BOTTOM - PLOT_TOP} />
      <text className="warroom-pattern-visual__zone-label" x={bandStart + 4} y={PLOT_TOP + 10}>DETECTED FORMATION</text>
      {pattern.geometry.fill?.points.length ? <polygon
        className="warroom-pattern-visual__fill"
        points={pattern.geometry.fill.points.map((point) => `${x(point.x)},${y(point.y)}`).join(" ")}
        clipPath={`url(#${clipId})`}
      /> : null}
      {visibleCandles.map((candle) => {
        const candleX = x(candle.sourceIndex);
        const bullish = candle.close >= candle.open;
        const bodyTop = y(Math.max(candle.open, candle.close));
        const bodyHeight = Math.max(2, Math.abs(y(candle.open) - y(candle.close)));
        const inPattern = candle.sourceIndex >= patternStart && candle.sourceIndex <= patternEnd;
        return <g className={`warroom-pattern-visual__candle is-${bullish ? "up" : "down"} ${inPattern ? "is-pattern" : "is-context"}`} key={candle.sourceIndex}>
          <line x1={candleX} x2={candleX} y1={y(candle.high)} y2={y(candle.low)} />
          <rect x={candleX - candleWidth / 2} y={bodyTop} width={candleWidth} height={bodyHeight} />
          {isCandleSetup && inPattern ? <>
            <circle cx={candleX} cy={PLOT_BOTTOM + 9} r="6" />
            <text className="warroom-pattern-visual__candle-step" x={candleX} y={PLOT_BOTTOM + 11} textAnchor="middle">{candle.sourceIndex - patternStart + 1}</text>
          </> : null}
        </g>;
      })}
      <g clipPath={`url(#${clipId})`}>
        {geometryLines.map((line, index) => <line
          className="warroom-pattern-visual__structure"
          key={index}
          x1={x(line.start.x)}
          x2={x(line.end.x)}
          y1={y(line.start.y)}
          y2={y(line.end.y)}
          stroke={directionColor}
          strokeDasharray={pattern.state === "forming" || line.style === "dashed" ? "6 4" : undefined}
        />)}
      </g>
      {geometryPoints.map((point, index) => {
        const pointX = x(point.x);
        const pointY = y(point.y);
        const displayLabel = point.label ? compactGeometryLabel(point.label) : "";
        const labelHalfWidth = Math.max(16, displayLabel.length * 2.4);
        const labelX = Math.max(PLOT_LEFT + labelHalfWidth, Math.min(PLOT_RIGHT - labelHalfWidth, pointX));
        const labelY = Math.max(PLOT_TOP + 8, Math.min(PLOT_BOTTOM - 5, pointY <= PLOT_TOP + 12 ? pointY + 13 : pointY - 7));
        return <g className="warroom-pattern-visual__geometry-point" key={`${point.x}-${point.y}-${index}`}>
          <circle cx={pointX} cy={pointY} r={point.label ? 3.5 : 2.25} stroke={directionColor} />
          {displayLabel ? <text x={labelX} y={labelY} textAnchor="middle"><title>{point.label}</title>{displayLabel}</text> : null}
        </g>;
      })}
      {levelRows.map((level) => <g className={`warroom-pattern-visual__level ${level.className}`} key={level.label}>
        <line x1={PLOT_LEFT} x2={PLOT_RIGHT} y1={y(level.price)} y2={y(level.price)} />
        <rect x={PLOT_RIGHT - 58} y={y(level.price) - 8} width="58" height="11" />
        <text x={PLOT_RIGHT - 3} y={y(level.price)} textAnchor="end">{level.label}</text>
      </g>)}
      {finiteLevel(projectionStartPrice) && finiteLevel(projectionEndPrice) ? <g className="warroom-pattern-visual__projection">
        <line x1={x(projectionStartIndex)} y1={y(projectionStartPrice)} x2={x(projectionEndIndex)} y2={y(projectionEndPrice)} stroke={directionColor} />
        <circle cx={x(projectionEndIndex)} cy={y(projectionEndPrice)} r="3" fill={directionColor} />
      </g> : null}
    </svg>
    <div className="warroom-pattern-visual__readout">
      <div><span>FINAL READ</span><strong>{grade ?? "--"} · {finalScore}</strong></div>
      <div><span>DETECTOR</span><strong>{Math.round(pattern.confidence)}%</strong></div>
      <div><span>GEOMETRY</span><strong>{Math.round(pattern.quality * 100)}%</strong></div>
      <div><span>RISK / REWARD</span><strong>{riskReward == null ? "PENDING" : `${riskReward.toFixed(1)}R`}</strong></div>
    </div>
  </div>;
}