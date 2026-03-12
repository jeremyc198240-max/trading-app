import { useMemo, useState, useCallback, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { TrendingUp, ZoomIn, ZoomOut, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { OHLC, DrawablePattern } from "@shared/schema";
import { patternToGeometry } from "@/patterns/patternToGeometry";

interface ExternalPatternSelection {
  name: string;
  startIndex: number;
  endIndex: number;
}

interface PriceChartProps {
  ohlc: OHLC[];
  vwapSeries: number[];
  symbol: string;
  drawablePatterns?: DrawablePattern[];
  externalSelectedPattern?: ExternalPatternSelection | null;
  corvonaLevels?: {
    H1: number;
    H2: number;
    H3: number;
    H4: number;
    L1: number;
    L2: number;
    L3: number;
    L4: number;
    pivot?: number;
    atr?: number;
  };
  liveSpotPrice?: number;
}

const BULL_COLOR = "#00e7ff";
const BULL_WICK_COLOR = "#a2f6ff";
const BEAR_COLOR = "#ff4d57";
const BEAR_WICK_COLOR = "#ff9aa0";
const VWAP_COLOR = "#ffc857";
const GRID_COLOR = "rgba(86, 220, 255, 0.14)";
const AXIS_TEXT_COLOR = "rgba(189, 237, 255, 0.9)";
const PATTERN_COLORS: Record<string, string> = {
  bullish: "#00d4ff",
  bearish: "#ff5e66",
  neutral: "#9d8bff",
};

function formatPrice(v: number): string {
  if (v >= 1000) return `$${v.toFixed(0)}`;
  if (v >= 100) return `$${v.toFixed(1)}`;
  return `$${v.toFixed(2)}`;
}

function formatTime(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function PriceChart({ ohlc, vwapSeries, symbol, drawablePatterns, externalSelectedPattern, corvonaLevels, liveSpotPrice }: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 });
  const [visibleCount, setVisibleCount] = useState(80);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [selectedPatternId, setSelectedPatternId] = useState<string | null>(null);
  const [pendingCenterId, setPendingCenterId] = useState<string | null>(null);

  // Keep chart candles server-stable; live spot is rendered as readout only.
  const updatedOhlc = useMemo(() => ohlc, [ohlc]);

  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const totalCandles = updatedOhlc.length;
  const maxOffset = Math.max(0, totalCandles - visibleCount);

  const viewStartIdx = totalCandles - visibleCount - scrollOffset;
  const dataStartIdx = Math.max(0, viewStartIdx);
  const dataEndIdx = Math.min(totalCandles, viewStartIdx + visibleCount);
  const leftPad = dataStartIdx - viewStartIdx;

  const visibleOhlc = useMemo(() => updatedOhlc.slice(dataStartIdx, dataEndIdx), [updatedOhlc, dataStartIdx, dataEndIdx]);
  const visibleVwap = useMemo(() => vwapSeries.slice(dataStartIdx, dataEndIdx), [vwapSeries, dataStartIdx, dataEndIdx]);

  const allDrawablePatterns = useMemo(() => {
    return (drawablePatterns || []).filter((p) => p.lifecycle !== "expired");
  }, [drawablePatterns]);

  const activePatterns = useMemo(() => {
    return allDrawablePatterns.filter((p) => {
      if (p.lifecycle === "failed") return false;
      if (updatedOhlc.length === 0) return true;
      const scanStart = Math.min(Math.max(0, p.endIndex + 1), updatedOhlc.length);
      const isBull = p.type === "bullish";
      for (let i = scanStart; i < updatedOhlc.length; i++) {
        const candle = updatedOhlc[i];
        if (p.pt1 != null) {
          if (isBull && candle.high >= p.pt1) return false;
          if (!isBull && candle.low <= p.pt1) return false;
        }
        if (p.stopLoss != null) {
          if (isBull && candle.low <= p.stopLoss) return false;
          if (!isBull && candle.high >= p.stopLoss) return false;
        }
      }
      return true;
    });
  }, [allDrawablePatterns, updatedOhlc]);

  const [externallyForcedPattern, setExternallyForcedPattern] = useState<string | null>(null);

  const displayPatterns = useMemo(() => {
    if (externallyForcedPattern) {
      const alreadyIn = activePatterns.some(p => p.id === externallyForcedPattern);
      if (!alreadyIn) {
        const forced = allDrawablePatterns.find(p => p.id === externallyForcedPattern);
        if (forced) return [...activePatterns, forced];
      }
    }
    return activePatterns;
  }, [activePatterns, allDrawablePatterns, externallyForcedPattern]);

  const adjustedPatterns = useMemo(() => {
    return displayPatterns
      .map((p) => ({
        ...p,
        startIndex: p.startIndex - dataStartIdx,
        endIndex: p.endIndex - dataStartIdx,
        geometry: {
          ...p.geometry,
          lines: (p.geometry?.lines || []).map((l) => ({
            ...l,
            start: { ...l.start, x: l.start.x - dataStartIdx },
            end: { ...l.end, x: l.end.x - dataStartIdx },
          })),
          points: (p.geometry?.points || []).map((pt) => ({
            ...pt,
            x: pt.x - dataStartIdx,
          })),
          breakoutLevel: p.geometry?.breakoutLevel ?? null,
          invalidationLevel: p.geometry?.invalidationLevel ?? null,
        },
      }))
      .filter((p) => p.endIndex >= 0 && p.startIndex < visibleOhlc.length);
  }, [displayPatterns, dataStartIdx, visibleOhlc.length]);

  useEffect(() => {
    if (activePatterns.length > 0 && !selectedPatternId) {
      setSelectedPatternId(activePatterns[0].id);
      setPendingCenterId(activePatterns[0].id);
    } else if (displayPatterns.length === 0) {
      setSelectedPatternId(null);
    }
  }, [activePatterns, displayPatterns, selectedPatternId]);

  useEffect(() => {
    if (!pendingCenterId) return;
    const pat = displayPatterns.find(p => p.id === pendingCenterId);
    if (!pat) { setPendingCenterId(null); return; }
    const patMid = Math.floor((pat.startIndex + pat.endIndex) / 2);
    const desiredStart = patMid - Math.floor(visibleCount / 2);
    const newOffset = totalCandles - visibleCount - desiredStart;
    const minAllowed = -Math.floor(visibleCount * 0.4);
    setScrollOffset(Math.max(minAllowed, Math.min(maxOffset, newOffset)));
    setPendingCenterId(null);
  }, [pendingCenterId, displayPatterns, visibleCount, totalCandles, maxOffset]);

  useEffect(() => {
    if (!externalSelectedPattern) {
      setExternallyForcedPattern(null);
      return;
    }
    const match = allDrawablePatterns.find(
      (p) =>
        p.name.toLowerCase() === externalSelectedPattern.name.toLowerCase() &&
        p.startIndex === externalSelectedPattern.startIndex &&
        p.endIndex === externalSelectedPattern.endIndex
    );
    if (match && match.id !== selectedPatternId) {
      setExternallyForcedPattern(match.id);
      setSelectedPatternId(match.id);
      setPendingCenterId(match.id);
    }
  }, [externalSelectedPattern, allDrawablePatterns]);

  const handleSelectPattern = useCallback((patternId: string) => {
    if (selectedPatternId === patternId) {
      setSelectedPatternId(null);
    } else {
      setSelectedPatternId(patternId);
      setPendingCenterId(patternId);
    }
  }, [selectedPatternId]);

  const margin = { top: 16, right: 65, bottom: 24, left: 10 };
  const innerHeight = dimensions.height - margin.top - margin.bottom;
  const chartWidth = dimensions.width - margin.left - margin.right;
  const priceChartHeight = innerHeight * 0.8;
  const volumeChartHeight = innerHeight * 0.15;
  const volumeTopY = margin.top + priceChartHeight + (innerHeight * 0.05);

  const candleSpacing = chartWidth / Math.max(1, visibleCount);
  const candleBodyWidth = Math.max(2, candleSpacing * 0.65);
  const wickWidth = Math.max(1, candleBodyWidth * 0.15);

  // Keep candlesticks faithful to server OHLC and only coerce numeric safety.
  const normalizedOhlc = useMemo(() => {
    return visibleOhlc.map((c) => {
      const open = Number(c.open);
      const close = Number(c.close);
      const high = Math.max(Number(c.high), open, close);
      const low = Math.min(Number(c.low), open, close);
      return { ...c, open, high, low, close };
    });
  }, [visibleOhlc]);

  // Use closed candles for axis scaling when the latest bar is still forming.
  const rangeOhlc = useMemo(() => {
    if (normalizedOhlc.length < 3) return normalizedOhlc;

    const diffs: number[] = [];
    for (let i = 1; i < normalizedOhlc.length; i++) {
      const prevTs = Number(normalizedOhlc[i - 1]?.time);
      const curTs = Number(normalizedOhlc[i]?.time);
      const diff = curTs - prevTs;
      if (Number.isFinite(diff) && diff > 0) {
        diffs.push(diff);
      }
    }

    if (diffs.length === 0) return normalizedOhlc;

    diffs.sort((a, b) => a - b);
    const medianDiffSec = diffs[Math.floor(diffs.length / 2)] ?? 0;
    const lastTs = Number(normalizedOhlc[normalizedOhlc.length - 1]?.time);
    const nowSec = Date.now() / 1000;
    const isInFlight = Number.isFinite(lastTs) && medianDiffSec > 0 && nowSec < (lastTs + medianDiffSec - 2);

    return isInFlight && normalizedOhlc.length > 2
      ? normalizedOhlc.slice(0, -1)
      : normalizedOhlc;
  }, [normalizedOhlc]);

  const selectedPattern = selectedPatternId !== null
    ? adjustedPatterns.find(p => p.id === selectedPatternId) ?? null
    : null;

  const priceRange = useMemo(() => {
    if (rangeOhlc.length === 0) return { min: 0, max: 1 };

    let min = Infinity, max = -Infinity;
    rangeOhlc.forEach((c) => {
      min = Math.min(min, c.low);
      max = Math.max(max, c.high);
    });

    const candleRange = max - min;
    const maxExpansion = candleRange * 0.35;

    const targetPatterns = selectedPattern ? [selectedPattern] : adjustedPatterns.slice(0, 1);
    for (const p of targetPatterns) {
      if (p.pt1 != null) {
        min = Math.min(min, Math.max(p.pt1, max - candleRange - maxExpansion));
        max = Math.max(max, Math.min(p.pt1, min + candleRange + maxExpansion));
      }
      if (p.pt2 != null) {
        min = Math.min(min, Math.max(p.pt2, max - candleRange - maxExpansion));
        max = Math.max(max, Math.min(p.pt2, min + candleRange + maxExpansion));
      }
      if (p.stopLoss != null) {
        min = Math.min(min, Math.max(p.stopLoss, max - candleRange - maxExpansion));
        max = Math.max(max, Math.min(p.stopLoss, min + candleRange + maxExpansion));
      }
    }

    const range = max - min;
    const pad = Math.max(range * 0.08, 0.5);
    return { min: min - pad, max: max + pad };
  }, [rangeOhlc, adjustedPatterns, selectedPattern]);

  const maxVolume = useMemo(() => {
    return Math.max(1, ...visibleOhlc.map((c) => c.volume || 0));
  }, [visibleOhlc]);

  const xForIndex = useCallback(
    (i: number) => margin.left + (leftPad + i) * candleSpacing + candleSpacing / 2,
    [margin.left, candleSpacing, leftPad]
  );

  const yForPrice = useCallback(
    (p: number) => {
      const range = priceRange.max - priceRange.min;
      if (range === 0) return margin.top + priceChartHeight / 2;
      return margin.top + (1 - (p - priceRange.min) / range) * priceChartHeight;
    },
    [priceRange, margin.top, priceChartHeight]
  );

  const handleZoomIn = () => setVisibleCount((v) => Math.max(20, v - 20));
  const handleZoomOut = () => setVisibleCount((v) => Math.min(totalCandles, v + 20));
  const minOffset = -Math.floor(visibleCount * 0.4);
  const handleScrollLeft = () => setScrollOffset((v) => Math.min(maxOffset, v + 20));
  const handleScrollRight = () => setScrollOffset((v) => Math.max(minOffset, v - 20));

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      if (e.deltaY < 0) {
        setScrollOffset((v) => Math.min(maxOffset, v + 5));
      } else {
        setScrollOffset((v) => Math.max(minOffset, v - 5));
      }
    },
    [maxOffset, minOffset]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - margin.left;
      const viewIdx = Math.round(mouseX / candleSpacing - 0.5);
      const dataIdx = viewIdx - leftPad;
      if (dataIdx >= 0 && dataIdx < visibleOhlc.length) {
        setHoveredIndex(dataIdx);
      } else {
        setHoveredIndex(null);
      }
    },
    [margin.left, candleSpacing, leftPad, visibleOhlc.length]
  );

  const hoveredCandle = hoveredIndex !== null ? normalizedOhlc[hoveredIndex] : null;
  const lastCandle = normalizedOhlc.length > 0 ? normalizedOhlc[normalizedOhlc.length - 1] : null;
  const displayCandleRaw = hoveredIndex !== null ? normalizedOhlc[hoveredIndex] : (normalizedOhlc.length > 0 ? normalizedOhlc[normalizedOhlc.length - 1] : null);
  const displayCandle = displayCandleRaw || hoveredCandle || lastCandle;
  const displayClose = Number.isFinite(liveSpotPrice as number)
    ? (liveSpotPrice as number)
    : (displayCandle?.close ?? 0);
  const displayOpen = displayCandle?.open ?? displayClose;
  const closeIsBull = displayClose >= displayOpen;
  const currentVwap = visibleVwap.length > 0 ? visibleVwap[visibleVwap.length - 1] : null;

  const gridLines = useMemo(() => {
    const range = priceRange.max - priceRange.min;
    const step = range / 5;
    const lines: number[] = [];
    for (let i = 0; i <= 5; i++) {
      lines.push(priceRange.min + step * i);
    }
    return lines;
  }, [priceRange]);

  const timeLabels = useMemo(() => {
    const labels: { x: number; text: string }[] = [];
    const step = Math.max(1, Math.floor(visibleOhlc.length / 6));
    for (let i = 0; i < visibleOhlc.length; i += step) {
      labels.push({ x: xForIndex(i), text: formatTime(visibleOhlc[i].time || 0) });
    }
    return labels;
  }, [visibleOhlc, xForIndex]);

  if (visibleOhlc.length === 0) {
    return (
      <Card className="overflow-hidden" data-testid="chart-price-empty">
        <div className="h-0.5 bg-gradient-to-r from-blue-500/50 via-indigo-500/50 to-purple-500/50" />
        <CardHeader className="py-3 px-4 border-b border-border/50">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            Price Chart
          </CardTitle>
        </CardHeader>
        <CardContent className="h-64 flex items-center justify-center">
          <p className="text-muted-foreground">No data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      className="overflow-visible relative rounded-2xl border-0 shadow-2xl"
      style={{
        background: 'radial-gradient(140% 120% at 10% 0%, rgba(0,229,255,0.10) 0%, rgba(6,14,32,0.97) 46%, rgba(7,11,26,0.98) 100%)',
        boxShadow: '0 0 16px 2px rgba(0,231,255,0.09), 0 0 24px rgba(255,77,87,0.04), inset 0 0 0 1px rgba(120,199,255,0.16)',
        border: '1px solid rgba(90,210,255,0.48)',
      }}
      data-testid="chart-price"
    >
      <div className="h-1 bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-500" />
      <CardHeader className="py-3 px-4 border-b border-cyan-300/30 bg-gradient-to-r from-cyan-500/10 via-blue-500/5 to-indigo-500/10">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <CardTitle className="text-sm font-semibold uppercase tracking-wider text-cyan-300 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              {symbol}
            </CardTitle>
            {displayCandle && (
              <div className="flex items-center gap-2 text-xs font-mono" data-testid="ohlc-display">
                <span className="text-muted-foreground">O</span>
                <span className="text-foreground">{formatPrice(displayCandle.open)}</span>
                <span className="text-muted-foreground">H</span>
                <span className="text-cyan-300">{formatPrice(displayCandle.high)}</span>
                <span className="text-muted-foreground">L</span>
                <span className="text-red-300">{formatPrice(displayCandle.low)}</span>
                <span className="text-muted-foreground">C</span>
                <span className={closeIsBull ? "text-cyan-300 font-bold" : "text-red-300 font-bold"}>
                  {formatPrice(displayClose)}
                </span>
                {Number.isFinite(liveSpotPrice as number) && (
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cyan-300/80">LIVE</span>
                )}
                {currentVwap && (
                  <>
                    <span className="text-muted-foreground">VWAP</span>
                    <span className="text-amber-300">{formatPrice(currentVwap)}</span>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-1">
            <Button size="icon" variant="ghost" onClick={handleScrollLeft} data-testid="button-scroll-left" className="text-cyan-200 hover:text-cyan-100 hover:bg-cyan-400/10 border border-cyan-300/15">
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={handleZoomIn} data-testid="button-zoom-in" className="text-cyan-200 hover:text-cyan-100 hover:bg-cyan-400/10 border border-cyan-300/15">
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={handleZoomOut} data-testid="button-zoom-out" className="text-cyan-200 hover:text-cyan-100 hover:bg-cyan-400/10 border border-cyan-300/15">
              <ZoomOut className="w-4 h-4" />
            </Button>
            <Button size="icon" variant="ghost" onClick={handleScrollRight} data-testid="button-scroll-right" className="text-cyan-200 hover:text-cyan-100 hover:bg-cyan-400/10 border border-cyan-300/15">
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {displayPatterns.length > 0 && (
          <div className="mt-2 flex items-center gap-2 flex-wrap" data-testid="pattern-selector">
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Patterns:</span>
            {displayPatterns.map((p, i) => {
              const color = PATTERN_COLORS[p.type] || PATTERN_COLORS.neutral;
              const isSelected = selectedPatternId === p.id;
              return (
                <button
                  key={`psel-${p.id}`}
                  data-testid={`button-pattern-${i}`}
                  onClick={() => handleSelectPattern(p.id)}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium transition-all border backdrop-blur-sm"
                  style={{
                    borderColor: isSelected ? color : "rgba(120, 220, 255, 0.16)",
                    backgroundColor: isSelected ? `${color}1f` : "rgba(8, 20, 45, 0.45)",
                    color: isSelected ? color : "hsl(var(--muted-foreground))",
                    boxShadow: isSelected ? `0 0 8px ${color}33` : "none",
                  }}
                >
                  <span
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                  {p.name}
                  {isSelected && <X className="w-3 h-3 ml-0.5 opacity-60" />}
                </button>
              );
            })}
          </div>
        )}
      </CardHeader>
      <CardContent className="p-2 bg-transparent">
        <div
          ref={containerRef}
          className="w-full rounded-2xl border border-cyan-200/25 shadow-none backdrop-blur-[3px]"
          style={{ height: "480px", background: 'linear-gradient(125deg, rgba(2,12,30,0.97) 0%, rgba(3,20,48,0.95) 48%, rgba(4,10,24,0.97) 100%)' }}
          onWheel={handleWheel}
        >
          <svg
            width={dimensions.width}
            height={dimensions.height}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => setHoveredIndex(null)}
            style={{ display: "block" }}
            data-testid="candlestick-svg"
          >
            <defs>
              <linearGradient id="chartSurface" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(0, 223, 255, 0.06)" />
                <stop offset="45%" stopColor="rgba(14, 42, 86, 0.03)" />
                <stop offset="100%" stopColor="rgba(56, 94, 186, 0.06)" />
              </linearGradient>
              <linearGradient id="chartGridLine" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="rgba(78, 205, 255, 0.12)" />
                <stop offset="50%" stopColor="rgba(0, 231, 255, 0.24)" />
                <stop offset="100%" stopColor="rgba(59, 130, 246, 0.16)" />
              </linearGradient>
              <linearGradient id="volBull" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(0, 231, 255, 0.92)" />
                <stop offset="100%" stopColor="rgba(0, 231, 255, 0.18)" />
              </linearGradient>
              <linearGradient id="volBear" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(255, 77, 87, 0.92)" />
                <stop offset="100%" stopColor="rgba(255, 77, 87, 0.2)" />
              </linearGradient>
              <filter id="candleGlow" x="-90%" y="-90%" width="280%" height="280%">
                <feGaussianBlur stdDeviation="1.8" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <rect
              x={margin.left}
              y={margin.top}
              width={chartWidth}
              height={priceChartHeight + volumeChartHeight + 20}
              fill="url(#chartSurface)"
              opacity={0.95}
            />

            {gridLines.map((price, i) => {
              const y = yForPrice(price);
              return (
                <g key={`grid-${i}`}>
                  <line x1={margin.left} y1={y} x2={margin.left + chartWidth} y2={y} stroke="url(#chartGridLine)" strokeWidth={1} opacity={0.9} />
                  <text x={margin.left + chartWidth + 5} y={y + 3} fill={AXIS_TEXT_COLOR} fontSize={10} fontFamily="JetBrains Mono, monospace">
                    {formatPrice(price)}
                  </text>
                </g>
              );
            })}

            {timeLabels.map((tl, i) => (
              <text
                key={`time-${i}`}
                x={tl.x}
                y={margin.top + priceChartHeight + volumeChartHeight + 30}
                fill={AXIS_TEXT_COLOR}
                fontSize={9}
                textAnchor="middle"
                fontFamily="JetBrains Mono, monospace"
              >
                {tl.text}
              </text>
            ))}

            {selectedPattern && (
              <SelectedPatternOverlay
                pattern={selectedPattern}
                ohlc={visibleOhlc}
                xForIndex={xForIndex}
                yForPrice={yForPrice}
                visibleCount={visibleOhlc.length}
                totalSlots={visibleCount}
                candleSpacing={candleSpacing}
                margin={margin}
                priceChartHeight={priceChartHeight}
              />
            )}

            {normalizedOhlc.map((candle, i) => {
              const cx = xForIndex(i);
              const isBull = candle.close >= candle.open;
              const bodyColor = isBull ? BULL_COLOR : BEAR_COLOR;
              const wickColor = isBull ? BULL_WICK_COLOR : BEAR_WICK_COLOR;
              const yH = yForPrice(candle.high);
              const yL = yForPrice(candle.low);
              const yO = yForPrice(candle.open);
              const yC = yForPrice(candle.close);
              const bodyTop = Math.min(yO, yC);
              const bodyBot = Math.max(yO, yC);
              const bodyH = Math.max(1, bodyBot - bodyTop);
              const inPattern = selectedPattern
                ? i >= selectedPattern.startIndex && i <= selectedPattern.endIndex
                : false;
              const dimmed = selectedPattern && !inPattern;
              return (
                <g key={`candle-${i}`} data-testid={`candle-${i}`}>
                  <line
                    x1={cx}
                    y1={yH}
                    x2={cx}
                    y2={yL}
                    stroke={wickColor}
                    strokeWidth={Math.max(1, wickWidth + 0.35)}
                    opacity={dimmed ? 0.22 : 0.9}
                  />
                  <rect
                    x={cx - candleBodyWidth / 2}
                    y={bodyTop}
                    width={candleBodyWidth}
                    height={bodyH}
                    fill={bodyColor}
                    stroke={wickColor}
                    strokeWidth={candleBodyWidth > 3 ? 1.05 : 0.7}
                    rx={candleBodyWidth > 5 ? 2 : 1}
                    opacity={dimmed ? 0.2 : (hoveredIndex === i ? 0.97 : 0.93)}
                    style={{ filter: `drop-shadow(0 0 3px ${bodyColor})` }}
                  />
                </g>
              );
            })}

            {/* Support Levels (L1-L4) */}
            {/* Draw support/resistance levels if provided */}
            {corvonaLevels && [
              { label: 'L4', value: corvonaLevels.L4, color: '#00bfff' },
              { label: 'L3', value: corvonaLevels.L3, color: '#00e0ff' },
              { label: 'L2', value: corvonaLevels.L2, color: '#00ffe0' },
              { label: 'L1', value: corvonaLevels.L1, color: '#00ff99' },
              { label: 'H1', value: corvonaLevels.H1, color: '#fffa00' },
              { label: 'H2', value: corvonaLevels.H2, color: '#ffd700' },
              { label: 'H3', value: corvonaLevels.H3, color: '#ffb300' },
              { label: 'H4', value: corvonaLevels.H4, color: '#ff7f00' },
            ].map((level, idx) => (
              <g key={`support-level-${level.label}`}>
                <line
                  x1={margin.left}
                  y1={yForPrice(level.value)}
                  x2={margin.left + chartWidth}
                  y2={yForPrice(level.value)}
                  stroke={level.color}
                  strokeWidth={2}
                  opacity={0.7}
                  strokeDasharray="6 4"
                />
                <text
                  x={margin.left + chartWidth - 40}
                  y={yForPrice(level.value) - 4}
                  fill={level.color}
                  fontSize={11}
                  fontWeight={700}
                  fontFamily="JetBrains Mono, monospace"
                  opacity={0.75}
                  style={{ textShadow: `0 0 2px ${level.color}` }}
                >
                  {level.label}
                </text>
              </g>
            ))}

            {!selectedPattern && adjustedPatterns
              .filter(p => p.category === 'candlestick' && (p.geometry?.lines || []).length === 0)
              .map((p) => {
                const mainPt = (p.geometry?.points || []).find(pt => pt.label && pt.label.length > 0);
                if (!mainPt || mainPt.x < 0 || mainPt.x >= visibleOhlc.length) return null;
                const cx = xForIndex(mainPt.x);
                const cy = yForPrice(mainPt.y);
                const bull = p.type === 'bullish';
                const mColor = PATTERN_COLORS[p.type] || PATTERN_COLORS.neutral;
                const dir = bull ? 1 : -1;
                const tipY = cy + dir * 6;
                const sz = 4;
                return (
                  <g key={`cm-${p.id}`} opacity={0.7}>
                    <polygon
                      points={`${cx},${tipY} ${cx - sz},${tipY + dir * sz * 1.8} ${cx + sz},${tipY + dir * sz * 1.8}`}
                      fill={mColor}
                    />
                  </g>
                );
              })}

            {selectedPattern && (() => {
              const p = selectedPattern;
              const psi = Math.max(0, p.startIndex);
              const pei = Math.min(visibleOhlc.length - 1, p.endIndex);
              const pStartX = xForIndex(psi) - candleSpacing / 2;
              const pEndX = xForIndex(pei) + candleSpacing / 2;
              const lineEndX = margin.left + chartWidth;
              const entryHigh = p.geometry?.breakoutLevel;
              const entryLow = p.stopLoss;
              const hasEntryZone = entryHigh != null && entryLow != null;
              return (
                <g key={`targets-${p.id}`}>
                  {hasEntryZone && (
                    <rect
                      x={pEndX}
                      y={yForPrice(Math.max(entryHigh!, entryLow!))}
                      width={lineEndX - pEndX}
                      height={Math.abs(yForPrice(entryLow!) - yForPrice(entryHigh!))}
                      fill={p.type === 'bullish' ? '#10b981' : '#ef4444'}
                      opacity={0.06}
                      data-testid="entry-zone-shading"
                    />
                  )}
                  {p.pt1 != null && (
                    <g>
                      <line
                        x1={pStartX}
                        y1={yForPrice(p.pt1)}
                        x2={lineEndX}
                        y2={yForPrice(p.pt1)}
                        stroke="#10b981"
                        strokeWidth={1.5}
                        strokeDasharray="6 3"
                        opacity={0.85}
                      />
                      <rect
                        x={lineEndX + 2}
                        y={yForPrice(p.pt1) - 8}
                        width={58}
                        height={16}
                        rx={3}
                        fill="#10b981"
                        opacity={0.15}
                      />
                      <text
                        x={lineEndX + 6}
                        y={yForPrice(p.pt1) + 4}
                        fill="#10b981"
                        fontSize={9}
                        fontWeight={700}
                        fontFamily="JetBrains Mono, monospace"
                        opacity={0.85}
                      >
                        PT1 {formatPrice(p.pt1)}
                      </text>
                    </g>
                  )}
                  {p.pt2 != null && (
                    <g>
                      <line
                        x1={pStartX}
                        y1={yForPrice(p.pt2)}
                        x2={lineEndX}
                        y2={yForPrice(p.pt2)}
                        stroke="#06b6d4"
                        strokeWidth={1}
                        strokeDasharray="4 4"
                        opacity={0.7}
                      />
                      <rect
                        x={lineEndX + 2}
                        y={yForPrice(p.pt2) - 8}
                        width={58}
                        height={16}
                        rx={3}
                        fill="#06b6d4"
                        opacity={0.15}
                      />
                      <text
                        x={lineEndX + 6}
                        y={yForPrice(p.pt2) + 4}
                        fill="#06b6d4"
                        fontSize={9}
                        fontWeight={700}
                        fontFamily="JetBrains Mono, monospace"
                        opacity={0.7}
                      >
                        PT2 {formatPrice(p.pt2)}
                      </text>
                    </g>
                  )}
                  {p.stopLoss != null && (
                    <g>
                      <line
                        x1={pStartX}
                        y1={yForPrice(p.stopLoss)}
                        x2={lineEndX}
                        y2={yForPrice(p.stopLoss)}
                        stroke="#ef4444"
                        strokeWidth={1.5}
                        strokeDasharray="4 2"
                        opacity={0.85}
                      />
                      <rect
                        x={lineEndX + 2}
                        y={yForPrice(p.stopLoss) - 8}
                        width={52}
                        height={16}
                        rx={3}
                        fill="#ef4444"
                        opacity={0.15}
                      />
                      <text
                        x={lineEndX + 6}
                        y={yForPrice(p.stopLoss) + 4}
                        fill="#ef4444"
                        fontSize={9}
                        fontWeight={700}
                        fontFamily="JetBrains Mono, monospace"
                        opacity={0.85}
                      >
                        SL {formatPrice(p.stopLoss)}
                      </text>
                    </g>
                  )}
                </g>
              );
            })()}

            {visibleVwap.length > 1 && (
              <path
                d={visibleVwap
                  .map((v, i) => {
                    if (v == null) return "";
                    const x = xForIndex(i);
                    const y = yForPrice(v);
                    return i === 0 || visibleVwap[i - 1] == null ? `M ${x},${y}` : `L ${x},${y}`;
                  })
                  .join(" ")}
                fill="none"
                stroke={VWAP_COLOR}
                strokeWidth={1.5}
                strokeDasharray="5 3"
                opacity={selectedPattern ? 0.3 : 0.7}
              />
            )}

            {visibleOhlc.map((candle, i) => {
              const cx = xForIndex(i);
              const vol = candle.volume || 0;
              const isBull = candle.close >= candle.open;
              const barH = (vol / maxVolume) * volumeChartHeight;
              return (
                <rect
                  key={`vol-${i}`}
                  x={cx - candleBodyWidth / 2}
                  y={volumeTopY + volumeChartHeight - barH}
                  width={candleBodyWidth}
                  height={Math.max(0, barH)}
                  fill={isBull ? "url(#volBull)" : "url(#volBear)"}
                  opacity={0.72}
                  rx={candleBodyWidth > 5 ? 1 : 0}
                />
              );
            })}

            <line
              x1={margin.left}
              y1={volumeTopY}
              x2={margin.left + chartWidth}
              y2={volumeTopY}
              stroke={GRID_COLOR}
              strokeWidth={1}
            />
            <text
              x={margin.left + chartWidth + 5}
              y={volumeTopY + 10}
              fill={AXIS_TEXT_COLOR}
              fontSize={8}
              fontFamily="JetBrains Mono, monospace"
            >
              VOL
            </text>

            {hoveredIndex !== null && hoveredCandle && (
              <>
                <line
                  x1={xForIndex(hoveredIndex)}
                  y1={margin.top}
                  x2={xForIndex(hoveredIndex)}
                  y2={margin.top + priceChartHeight + volumeChartHeight + 15}
                  stroke="rgba(110, 222, 255, 0.8)"
                  strokeWidth={0.8}
                  strokeDasharray="3 3"
                  opacity={0.55}
                />
                <line
                  x1={margin.left}
                  y1={yForPrice(hoveredCandle.close)}
                  x2={margin.left + chartWidth}
                  y2={yForPrice(hoveredCandle.close)}
                  stroke="rgba(110, 222, 255, 0.8)"
                  strokeWidth={0.8}
                  strokeDasharray="3 3"
                  opacity={0.55}
                />
                <rect
                  x={margin.left + chartWidth}
                  y={yForPrice(hoveredCandle.close) - 8}
                  width={55}
                  height={16}
                  fill={hoveredCandle.close >= hoveredCandle.open ? BULL_COLOR : BEAR_COLOR}
                  rx={3}
                  opacity={0.9}
                  style={{ filter: `drop-shadow(0 0 3px ${hoveredCandle.close >= hoveredCandle.open ? BULL_COLOR : BEAR_COLOR})` }}
                />
                <text
                  x={margin.left + chartWidth + 27}
                  y={yForPrice(hoveredCandle.close) + 3}
                  textAnchor="middle"
                  fill="white"
                  fontSize={9}
                  fontWeight={700}
                  fontFamily="JetBrains Mono, monospace"
                >
                  {formatPrice(hoveredCandle.close)}
                </text>
              </>
            )}

            {lastCandle && hoveredIndex === null && (
              <>
                <rect
                  x={margin.left + chartWidth}
                  y={yForPrice(lastCandle.close) - 8}
                  width={55}
                  height={16}
                  fill={lastCandle.close >= lastCandle.open ? BULL_COLOR : BEAR_COLOR}
                  rx={3}
                  opacity={0.86}
                  style={{ filter: `drop-shadow(0 0 2px ${lastCandle.close >= lastCandle.open ? BULL_COLOR : BEAR_COLOR})` }}
                />
                <text
                  x={margin.left + chartWidth + 27}
                  y={yForPrice(lastCandle.close) + 3}
                  textAnchor="middle"
                  fill="white"
                  fontSize={9}
                  fontWeight={700}
                  fontFamily="JetBrains Mono, monospace"
                >
                  {formatPrice(lastCandle.close)}
                </text>
              </>
            )}
          </svg>
        </div>
      </CardContent>
    </Card>
  );
}

function SelectedPatternOverlay({
  pattern,
  ohlc,
  xForIndex,
  yForPrice,
  visibleCount,
  totalSlots,
  candleSpacing,
  margin,
  priceChartHeight,
}: {
  pattern: DrawablePattern & { startIndex: number; endIndex: number };
  ohlc: OHLC[];
  xForIndex: (i: number) => number;
  yForPrice: (p: number) => number;
  visibleCount: number;
  totalSlots: number;
  candleSpacing: number;
  margin: { top: number; right: number; bottom: number; left: number };
  priceChartHeight: number;
}) {
  const [tooltip, setTooltip] = useState<{ x: number; y: number; text: string } | null>(null);
  const geometry = patternToGeometry(ohlc, pattern);
  if (!geometry) return null;
  const color = PATTERN_COLORS[pattern.type] || PATTERN_COLORS.neutral;
  const si = Math.max(0, pattern.startIndex);
  const ei = Math.min(visibleCount - 1, pattern.endIndex);
  const startX = xForIndex(si) - candleSpacing / 2;
  const endX = xForIndex(ei) + candleSpacing / 2;
  const zoneWidth = Math.max(endX - startX, candleSpacing);

  const lines = (geometry.lines || []);
  const points = (geometry.points || []);
  const isCandlestickPattern = lines.length === 0 && points.length > 0;
  const isBullish = pattern.type === 'bullish';

  let fillPath: string | null = null;
  if (!isCandlestickPattern) {
    const solidLines = lines.filter(l => l.style !== 'dashed');
    const dashedLines = lines.filter(l => l.style === 'dashed');
    if (solidLines.length === 2 && dashedLines.length <= 1) {
      const l1 = solidLines[0];
      const l2 = solidLines[1];
      const pts = [
        { x: xForIndex(Math.max(0, Math.min(l1.start.x, visibleCount - 1))), y: yForPrice(l1.start.y) },
        { x: xForIndex(Math.max(0, Math.min(l1.end.x, visibleCount - 1))), y: yForPrice(l1.end.y) },
        { x: xForIndex(Math.max(0, Math.min(l2.end.x, visibleCount - 1))), y: yForPrice(l2.end.y) },
        { x: xForIndex(Math.max(0, Math.min(l2.start.x, visibleCount - 1))), y: yForPrice(l2.start.y) },
      ];
      fillPath = `M ${pts[0].x},${pts[0].y} L ${pts[1].x},${pts[1].y} L ${pts[2].x},${pts[2].y} L ${pts[3].x},${pts[3].y} Z`;
    } else if (solidLines.length > 2 && dashedLines.length === 1) {
      const dashedY = yForPrice(dashedLines[0].start.y);
      const arcPts = solidLines.map(l => ({
        x: xForIndex(Math.max(0, Math.min(l.start.x, visibleCount - 1))),
        y: yForPrice(l.start.y),
      }));
      const lastSolid = solidLines[solidLines.length - 1];
      arcPts.push({
        x: xForIndex(Math.max(0, Math.min(lastSolid.end.x, visibleCount - 1))),
        y: yForPrice(lastSolid.end.y),
      });
      let d = `M ${arcPts[0].x},${arcPts[0].y}`;
      for (let k = 1; k < arcPts.length; k++) d += ` L ${arcPts[k].x},${arcPts[k].y}`;
      d += ` L ${arcPts[arcPts.length - 1].x},${dashedY}`;
      d += ` L ${arcPts[0].x},${dashedY} Z`;
      fillPath = d;
    }
  }

  const mainLabel = points.find(p => p.label && p.label.length > 0);

  return (
    <g data-testid="selected-pattern-overlay">
      <rect
        x={startX}
        y={margin.top}
        width={zoneWidth}
        height={priceChartHeight}
        fill={color}
        opacity={isCandlestickPattern ? 0.08 : 0.04}
      />

      {fillPath && (
        <path
          d={fillPath}
          fill={color}
          opacity={0.1}
          stroke="none"
        />
      )}

      {isCandlestickPattern && mainLabel && (() => {
        const cx = xForIndex(Math.max(0, Math.min(mainLabel.x, visibleCount - 1)));
        const cy = yForPrice(mainLabel.y);
        const arrowLen = 22;
        const arrowDir = isBullish ? 1 : -1;
        const tipY = cy + arrowDir * 8;
        const tailY = tipY + arrowDir * arrowLen;
        const headSize = 5;

        return (
          <g>
            <line
              x1={cx} y1={tailY}
              x2={cx} y2={tipY}
              stroke={color}
              strokeWidth={2.5}
              strokeLinecap="round"
              opacity={0.95}
            />
            <polygon
              points={`${cx},${tipY} ${cx - headSize},${tipY + arrowDir * headSize * 1.5} ${cx + headSize},${tipY + arrowDir * headSize * 1.5}`}
              fill={color}
              opacity={0.95}
            />
            <text
              x={cx}
              y={tailY + arrowDir * 14}
              textAnchor="middle"
              fill={color}
              fontSize={10}
              fontWeight={700}
              fontFamily="Inter, sans-serif"
              opacity={0.95}
            >
              {mainLabel.label}
            </text>
            <circle cx={cx} cy={cy} r={4} fill="none" stroke={color} strokeWidth={2} opacity={0.6} />
          </g>
        );
      })()}

      {!isCandlestickPattern && lines.map((l, li) => {
        const x1 = xForIndex(Math.max(0, Math.min(l.start.x, visibleCount - 1)));
        const y1 = yForPrice(l.start.y);
        const x2 = xForIndex(Math.max(0, Math.min(l.end.x, visibleCount - 1)));
        const y2 = yForPrice(l.end.y);
        return (
          <line
            key={`ol-${li}`}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={color}
            strokeWidth={l.style === "dashed" ? 1.5 : 2.5}
            strokeDasharray={l.style === "dashed" ? "6 4" : "none"}
            strokeLinecap="round"
            opacity={0.9}
          />
        );
      })}

      {!isCandlestickPattern && points
        .filter((pt) => pt.x >= 0 && pt.x < visibleCount)
        .map((pt, pi) => {
          const cx = xForIndex(pt.x);
          const cy = yForPrice(pt.y);
          const tooltipText = `${pt.label || 'Point'}: ${formatPrice(pt.y)}`;
          return (
            <g key={`op-${pi}`}>
              <circle cx={cx} cy={cy} r={5} fill={color} opacity={0.2} />
              <circle cx={cx} cy={cy} r={3} fill={color} stroke="hsl(var(--background))" strokeWidth={1.5} />
              <circle
                cx={cx} cy={cy} r={12}
                fill="transparent"
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setTooltip({ x: cx, y: cy - 24, text: tooltipText })}
                onMouseLeave={() => setTooltip(null)}
              />
              {pt.label && (
                <text
                  x={cx}
                  y={cy - 10}
                  textAnchor="middle"
                  fill={color}
                  fontSize={9}
                  fontWeight={700}
                  fontFamily="Inter, sans-serif"
                >
                  {pt.label}
                </text>
              )}
            </g>
          );
        })}

      {geometry.breakoutLevel != null && (
        <g>
          <line
            x1={startX}
            y1={yForPrice(geometry.breakoutLevel)}
            x2={endX + candleSpacing * 4}
            y2={yForPrice(geometry.breakoutLevel)}
            stroke={color}
            strokeWidth={1.5}
            strokeDasharray="8 4"
            opacity={0.7}
          />
          <text
            x={endX + candleSpacing * 4 + 4}
            y={yForPrice(geometry.breakoutLevel) + 3}
            fill={color}
            fontSize={9}
            fontWeight={600}
            fontFamily="JetBrains Mono, monospace"
          >
            BO {formatPrice(geometry.breakoutLevel)}
          </text>
        </g>
      )}

      {geometry.invalidationLevel != null && (
        <g>
          <line
            x1={startX}
            y1={yForPrice(geometry.invalidationLevel)}
            x2={endX + candleSpacing * 4}
            y2={yForPrice(geometry.invalidationLevel)}
            stroke="#ef4444"
            strokeWidth={1}
            strokeDasharray="3 3"
            opacity={0.6}
          />
          <text
            x={endX + candleSpacing * 4 + 4}
            y={yForPrice(geometry.invalidationLevel) + 3}
            fill="#ef4444"
            fontSize={8}
            fontWeight={600}
            fontFamily="JetBrains Mono, monospace"
            opacity={0.7}
          >
            INV {formatPrice(geometry.invalidationLevel)}
          </text>
        </g>
      )}

      <PatternLabelSVG
        x={(xForIndex(si) + xForIndex(ei)) / 2}
        y={margin.top + 14}
        name={pattern.name}
        lifecycle={pattern.lifecycle}
        color={color}
      />

      {tooltip && (
        <g data-testid="pattern-tooltip">
          <rect
            x={tooltip.x - (tooltip.text.length * 3.5 + 8)}
            y={tooltip.y - 10}
            width={tooltip.text.length * 7 + 16}
            height={20}
            rx={4}
            fill="hsl(var(--card))"
            stroke={color}
            strokeWidth={1}
            opacity={0.95}
          />
          <text
            x={tooltip.x}
            y={tooltip.y + 4}
            textAnchor="middle"
            fill={color}
            fontSize={10}
            fontWeight={600}
            fontFamily="JetBrains Mono, monospace"
          >
            {tooltip.text}
          </text>
        </g>
      )}
    </g>
  );
}

function PatternLabelSVG({ x, y, name, lifecycle, color }: { x: number; y: number; name: string; lifecycle: string; color: string }) {
  const badgeMap: Record<string, string> = {
    forming: "FORMING",
    valid: "ACTIVE",
    breaking: "BREAK",
    failed: "FAIL",
  };
  const badge = badgeMap[lifecycle] || "";
  const label = badge ? `${name}  ${badge}` : name;
  const textWidth = label.length * 5.8 + 16;
  const height = 18;

  return (
    <g>
      <rect
        x={x - textWidth / 2}
        y={y - height / 2}
        width={textWidth}
        height={height}
        rx={4}
        fill={color}
        opacity={0.15}
      />
      <rect
        x={x - textWidth / 2}
        y={y - height / 2}
        width={textWidth}
        height={height}
        rx={4}
        fill="none"
        stroke={color}
        strokeWidth={1}
        opacity={0.5}
      />
      <text
        x={x}
        y={y + 4.5}
        textAnchor="middle"
        fill={color}
        fontSize={10}
        fontWeight={700}
        fontFamily="Inter, sans-serif"
      >
        {label}
      </text>
    </g>
  );
}

export function VolumeChart({ ohlc }: { ohlc: OHLC[] }) {
  return null;
}
