import type { PatternResult } from './patterns';
import type {
  DrawablePattern,
  PatternGeometry,
  GeometryPoint,
  GeometryLine,
  PatternLifecycle,
  BreakoutValidation,
} from '@shared/schema';

export const TIMEFRAME_GEOMETRY: Record<string, { swing: number, wick: number, slope: number, touch: number }> = {
  "1m":  { swing: 1.0, wick: 1.0, slope: 1.0, touch: 1.0 },
  "5m":  { swing: 1.2, wick: 1.2, slope: 1.1, touch: 1.1 },
  "15m": { swing: 1.5, wick: 1.4, slope: 1.2, touch: 1.2 },
  "30m": { swing: 1.8, wick: 1.6, slope: 1.3, touch: 1.3 },
  "1h":  { swing: 2.2, wick: 1.8, slope: 1.4, touch: 1.4 },
  "4h":  { swing: 3.0, wick: 2.2, slope: 1.6, touch: 1.6 },
  "1D":  { swing: 4.0, wick: 2.8, slope: 1.8, touch: 1.8 }
};

interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time?: number;
}

function avgRangeSlice(ohlc: OHLC[], start: number, end: number): number {
  let sum = 0;
  const s = Math.max(0, start);
  const e = Math.min(ohlc.length - 1, end);
  for (let i = s; i <= e; i++) sum += ohlc[i].high - ohlc[i].low;
  return sum / Math.max(1, e - s + 1);
}

function trendlineY(slope: number, intercept: number, x: number): number {
  return slope * x + intercept;
}

function calcTrendline(points: { x: number; y: number }[]): { slope: number; intercept: number } {
  const n = points.length;
  if (n < 2) return { slope: 0, intercept: points[0]?.y ?? 0 };
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumX2 += p.x * p.x;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

function findLocalMaxima(ohlc: OHLC[], lookback = 5, timeframe = "5m"): number[] {
  const scale = TIMEFRAME_GEOMETRY[timeframe] ?? TIMEFRAME_GEOMETRY["5m"];
  const scaledLookback = Math.max(1, Math.floor(lookback * scale.swing));
  const maxima: number[] = [];
  for (let i = scaledLookback; i < ohlc.length - scaledLookback; i++) {
    let isMax = true;
    for (let j = i - scaledLookback; j <= i + scaledLookback; j++) {
      if (j !== i && ohlc[j].high >= ohlc[i].high) { isMax = false; break; }
    }
    if (isMax) maxima.push(i);
  }
  return maxima;
}

function findLocalMinima(ohlc: OHLC[], lookback = 5, timeframe = "5m"): number[] {
  const scale = TIMEFRAME_GEOMETRY[timeframe] ?? TIMEFRAME_GEOMETRY["5m"];
  const scaledLookback = Math.max(1, Math.floor(lookback * scale.swing));
  const minima: number[] = [];
  for (let i = scaledLookback; i < ohlc.length - scaledLookback; i++) {
    let isMin = true;
    for (let j = i - scaledLookback; j <= i + scaledLookback; j++) {
      if (j !== i && ohlc[j].low <= ohlc[i].low) { isMin = false; break; }
    }
    if (isMin) minima.push(i);
  }
  return minima;
}

function validateBreakout(
  pattern: PatternResult,
  ohlc: OHLC[],
  breakoutLevel: number,
  rsiValue?: number
): BreakoutValidation {
  const lastIdx = ohlc.length - 1;
  const isBull = pattern.type === 'bullish';
  const lastCandle = ohlc[lastIdx];
  
  // 1. Structure Break (SB)
  // Candle closes beyond level + small threshold
  const threshold = breakoutLevel * 0.0005; // 0.05% threshold
  const closeBeyondLevel = isBull 
    ? lastCandle.close > breakoutLevel + threshold
    : lastCandle.close < breakoutLevel - threshold;

  // 2. Impulse Check (IC)
  // Body >= 50% of range + close in direction
  const range = lastCandle.high - lastCandle.low;
  const body = Math.abs(lastCandle.close - lastCandle.open);
  const bodyRatio = range > 0 ? body / range : 0;
  const directionalClose = isBull ? lastCandle.close > lastCandle.open : lastCandle.close < lastCandle.open;
  const impulseBody = bodyRatio >= 0.5 && directionalClose;

  // 3. Momentum Check (MG)
  // RSI > 50 for longs / < 50 for shorts
  // If RSI is not provided, we consider it failed to maintain strictness
  const momentumAlign = rsiValue !== undefined 
    ? (isBull ? rsiValue > 50 : rsiValue < 50)
    : false;

  // 4. Invalidation (IL)
  // Price must not have returned inside structure (simplification: last close must stay beyond level)
  const notInvalidated = closeBeyondLevel;
  const bodyCloseStrong = impulseBody;
  // We currently use momentum alignment as the strict confirmation proxy.
  const volumeConfirm = momentumAlign;
  const holdAboveLevel = notInvalidated;

  let score = 0;
  if (closeBeyondLevel) score += 40;
  if (impulseBody) score += 30;
  if (momentumAlign) score += 30;

  // STRICT REQUIREMENT: ALL 4 conditions must pass
  const confirmed = closeBeyondLevel && bodyCloseStrong && volumeConfirm && holdAboveLevel;

  let reason = '';
  if (!closeBeyondLevel) reason = 'SB failed: No close beyond structure level';
  else if (!impulseBody) reason = 'IC failed: Breakout lacks impulse (body < 50% range)';
  else if (!momentumAlign) reason = 'MG failed: Momentum (RSI) not aligned';
  else if (!notInvalidated) reason = 'IL failed: Price returned inside structure';
  else reason = 'Strict Breakout Confirmed (SB+IC+MG+IL)';

  return { 
    confirmed, 
    score, 
    checks: { closeBeyondLevel, volumeConfirm, holdAboveLevel, bodyCloseStrong }, 
    reason 
  };
}

function deriveLifecycle(
  pattern: PatternResult,
  ohlc: OHLC[],
  breakoutLevel: number | null,
  invalidationLevel: number | null
): PatternLifecycle {
  const lastIdx = ohlc.length - 1;
  const lastClose = ohlc[lastIdx].close;
  const age = lastIdx - pattern.endIndex;

  if (age > 50) return 'expired';

  if (invalidationLevel !== null) {
    const isBearishInvalidation = pattern.type === 'bullish'
      ? lastClose < invalidationLevel
      : lastClose > invalidationLevel;
    if (isBearishInvalidation) return 'failed';
  }

  if (breakoutLevel !== null) {
    const isBreaking = pattern.type === 'bullish'
      ? lastClose > breakoutLevel * 0.998 && lastClose < breakoutLevel * 1.005
      : lastClose < breakoutLevel * 1.002 && lastClose > breakoutLevel * 0.995;
    if (isBreaking) return 'breaking';
  }

  if (pattern.endIndex >= lastIdx - 2) return 'forming';

  return 'valid';
}

function segmentExtremes(ohlc: OHLC[], start: number, end: number, segments: number, mode: 'high' | 'low'): { x: number; y: number }[] {
  const span = end - start;
  const segLen = Math.max(2, Math.floor(span / segments));
  const result: { x: number; y: number }[] = [];

  for (let s = 0; s < segments; s++) {
    const segStart = start + s * segLen;
    const segEnd = s === segments - 1 ? end : Math.min(start + (s + 1) * segLen - 1, end);
    let bestIdx = segStart;
    let bestVal = mode === 'high' ? ohlc[segStart].high : ohlc[segStart].low;
    for (let i = segStart; i <= segEnd; i++) {
      const val = mode === 'high' ? ohlc[i].high : ohlc[i].low;
      if (mode === 'high' ? val > bestVal : val < bestVal) {
        bestVal = val;
        bestIdx = i;
      }
    }
    result.push({ x: bestIdx, y: bestVal });
  }

  return result;
}

function filterOutliers(points: { x: number; y: number }[], oppositePoints: { x: number; y: number }[], mode: 'high' | 'low'): { x: number; y: number }[] {
  if (points.length <= 2 || oppositePoints.length === 0) return points;

  const oppBound = mode === 'low'
    ? Math.min(...oppositePoints.map(p => p.y))
    : Math.max(...oppositePoints.map(p => p.y));

  const filtered = points.filter(p => {
    if (mode === 'low') return p.y < oppBound;
    return p.y > oppBound;
  });

  return filtered.length >= 2 ? filtered : points;
}

function findTouchPoints(ohlc: OHLC[], s: number, e: number, trend: { slope: number; intercept: number }, mode: 'high' | 'low', count: number, timeframe = "5m"): { x: number; y: number }[] {
  const scale = TIMEFRAME_GEOMETRY[timeframe] ?? TIMEFRAME_GEOMETRY["5m"];
  const deviations: { idx: number; val: number; absDev: number }[] = [];
  const minSpacing = Math.max(3, Math.floor(((e - s) / (count + 1)) * scale.touch));

  for (let i = s; i <= e; i++) {
    const price = mode === 'high' ? ohlc[i].high : ohlc[i].low;
    const lineVal = trendlineY(trend.slope, trend.intercept, i);
    deviations.push({ idx: i, val: price, absDev: Math.abs(price - lineVal) });
  }

  deviations.sort((a, b) => a.absDev - b.absDev);

  const result: { x: number; y: number }[] = [];
  for (const d of deviations) {
    const tooClose = result.some(r => Math.abs(r.x - d.idx) < minSpacing);
    if (!tooClose) {
      result.push({ x: d.idx, y: d.val });
      if (result.length >= count) break;
    }
  }

  return result.sort((a, b) => a.x - b.x);
}

function findBoundaryAnchor(ohlc: OHLC[], from: number, to: number, mode: 'high' | 'low'): { x: number; y: number } {
  let bestIdx = from;
  let bestVal = mode === 'high' ? ohlc[from].high : ohlc[from].low;
  for (let i = from; i <= to; i++) {
    const val = mode === 'high' ? ohlc[i].high : ohlc[i].low;
    if (mode === 'high' ? val > bestVal : val < bestVal) {
      bestVal = val;
      bestIdx = i;
    }
  }
  return { x: bestIdx, y: bestVal };
}

function collectSwingHighs(ohlc: OHLC[], start: number, end: number, minCount: number, timeframe = "5m"): { x: number; y: number }[] {
  const scale = TIMEFRAME_GEOMETRY[timeframe] ?? TIMEFRAME_GEOMETRY["5m"];
  const span = end - start;
  const lb = Math.max(2, Math.floor((span / (minCount * 3)) * scale.swing));
  const minSpacing = Math.max(2, Math.floor((span / (minCount + 2)) * scale.swing));
  const candidates: { x: number; y: number }[] = [];

  for (let i = start; i <= end; i++) {
    let isSwing = true;
    for (let j = Math.max(start, i - lb); j <= Math.min(end, i + lb); j++) {
      if (j !== i && ohlc[j].high >= ohlc[i].high) { isSwing = false; break; }
    }
    if (isSwing) candidates.push({ x: i, y: ohlc[i].high });
  }

  if (candidates.length < minCount) {
    const all: { x: number; y: number }[] = [];
    for (let i = start; i <= end; i++) all.push({ x: i, y: ohlc[i].high });
    all.sort((a, b) => b.y - a.y);
    const used = new Set(candidates.map(c => c.x));
    for (const p of all) {
      if (used.has(p.x)) continue;
      const tooClose = candidates.some(c => Math.abs(c.x - p.x) < minSpacing);
      if (tooClose) continue;
      candidates.push(p);
      used.add(p.x);
      if (candidates.length >= minCount) break;
    }
  }

  return candidates.sort((a, b) => a.x - b.x);
}

function collectSwingLows(ohlc: OHLC[], start: number, end: number, minCount: number, timeframe = "5m"): { x: number; y: number }[] {
  const scale = TIMEFRAME_GEOMETRY[timeframe] ?? TIMEFRAME_GEOMETRY["5m"];
  const span = end - start;
  const lb = Math.max(2, Math.floor((span / (minCount * 3)) * scale.swing));
  const minSpacing = Math.max(2, Math.floor((span / (minCount + 2)) * scale.swing));
  const candidates: { x: number; y: number }[] = [];

  for (let i = start; i <= end; i++) {
    let isSwing = true;
    for (let j = Math.max(start, i - lb); j <= Math.min(end, i + lb); j++) {
      if (j !== i && ohlc[j].low <= ohlc[i].low) { isSwing = false; break; }
    }
    if (isSwing) candidates.push({ x: i, y: ohlc[i].low });
  }

  if (candidates.length < minCount) {
    const all: { x: number; y: number }[] = [];
    for (let i = start; i <= end; i++) all.push({ x: i, y: ohlc[i].low });
    all.sort((a, b) => a.y - b.y);
    const used = new Set(candidates.map(c => c.x));
    for (const p of all) {
      if (used.has(p.x)) continue;
      const tooClose = candidates.some(c => Math.abs(c.x - p.x) < minSpacing);
      if (tooClose) continue;
      candidates.push(p);
      used.add(p.x);
      if (candidates.length >= minCount) break;
    }
  }

  return candidates.sort((a, b) => a.x - b.x);
}

function fitUpperEnvelope(ohlc: OHLC[], start: number, end: number): { slope: number; intercept: number } {
  const swings = collectSwingHighs(ohlc, start, end, 3);
  if (swings.length >= 2) {
    const fit = calcTrendline(swings);
    let maxAbove = 0;
    for (let i = start; i <= end; i++) {
      const residual = ohlc[i].high - trendlineY(fit.slope, fit.intercept, i);
      if (residual > maxAbove) maxAbove = residual;
    }
    return { slope: fit.slope, intercept: fit.intercept + maxAbove };
  }
  const pts: { x: number; y: number }[] = [];
  for (let i = start; i <= end; i++) pts.push({ x: i, y: ohlc[i].high });
  const fit = calcTrendline(pts);
  let maxAbove = 0;
  for (const p of pts) {
    const residual = p.y - trendlineY(fit.slope, fit.intercept, p.x);
    if (residual > maxAbove) maxAbove = residual;
  }
  return { slope: fit.slope, intercept: fit.intercept + maxAbove };
}

function fitLowerEnvelope(ohlc: OHLC[], start: number, end: number): { slope: number; intercept: number } {
  const swings = collectSwingLows(ohlc, start, end, 3);
  if (swings.length >= 2) {
    const fit = calcTrendline(swings);
    let maxBelow = 0;
    for (let i = start; i <= end; i++) {
      const residual = trendlineY(fit.slope, fit.intercept, i) - ohlc[i].low;
      if (residual > maxBelow) maxBelow = residual;
    }
    return { slope: fit.slope, intercept: fit.intercept - maxBelow };
  }
  const pts: { x: number; y: number }[] = [];
  for (let i = start; i <= end; i++) pts.push({ x: i, y: ohlc[i].low });
  const fit = calcTrendline(pts);
  let maxBelow = 0;
  for (const p of pts) {
    const residual = trendlineY(fit.slope, fit.intercept, p.x) - p.y;
    if (residual > maxBelow) maxBelow = residual;
  }
  return { slope: fit.slope, intercept: fit.intercept - maxBelow };
}

function tightestIntercept(
  ohlc: OHLC[], s: number, e: number,
  slope: number, side: 'high' | 'low'
): number {
  if (side === 'high') {
    let maxIntercept = -Infinity;
    for (let i = s; i <= e; i++) {
      const needed = ohlc[i].high - slope * i;
      if (needed > maxIntercept) maxIntercept = needed;
    }
    return maxIntercept;
  } else {
    let minIntercept = Infinity;
    for (let i = s; i <= e; i++) {
      const needed = ohlc[i].low - slope * i;
      if (needed < minIntercept) minIntercept = needed;
    }
    return minIntercept;
  }
}

function anchorTrendline(
  ohlc: OHLC[], s: number, e: number, side: 'high' | 'low', timeframe = "5m"
): { slope: number; intercept: number } {
  const scale = TIMEFRAME_GEOMETRY[timeframe] ?? TIMEFRAME_GEOMETRY["5m"];
  const span = e - s;
  const swings = side === 'high'
    ? collectSwingHighs(ohlc, s, e, 4, timeframe)
    : collectSwingLows(ohlc, s, e, 4, timeframe);

  if (swings.length < 2) {
    const val = side === 'high'
      ? Math.max(...ohlc.slice(s, e + 1).map(c => c.high))
      : Math.min(...ohlc.slice(s, e + 1).map(c => c.low));
    return { slope: 0, intercept: val };
  }

  let bestSlope = 0, bestIntercept = 0, bestScore = -Infinity;

  for (let i = 0; i < swings.length; i++) {
    for (let j = i + 1; j < swings.length; j++) {
      const p1 = swings[i], p2 = swings[j];
      if (p2.x === p1.x) continue;
      const slope = (p2.y - p1.y) / (p2.x - p1.x);
      const intercept = tightestIntercept(ohlc, s, e, slope, side);

      let totalDist = 0;
      let touchCount = 0;
      const atr = ohlc.slice(s, e + 1).reduce((a, c) => a + (c.high - c.low), 0) / Math.max(1, span);
      const touchThreshold = atr * 0.4 * scale.touch;

      for (let k = s; k <= e; k++) {
        const lineY = trendlineY(slope, intercept, k);
        const dist = side === 'high'
          ? lineY - ohlc[k].high
          : ohlc[k].low - lineY;
        totalDist += dist;
        if (dist < touchThreshold) touchCount++;
      }

      const avgDist = totalDist / (span + 1);
      const score = touchCount * 10 - avgDist;

      if (score > bestScore) {
        bestScore = score;
        bestSlope = slope;
        bestIntercept = intercept;
      }
    }
  }

  return { slope: bestSlope, intercept: bestIntercept };
}

function buildTwoTrendlineGeometry(
  ohlc: OHLC[],
  pattern: PatternResult,
  extend: number = 5,
  timeframe = "5m"
): PatternGeometry {
  const s = pattern.startIndex;
  const e = pattern.endIndex;
  const span = e - s;

  const name = pattern.name.toLowerCase();
  const maxH = Math.max(...ohlc.slice(s, e + 1).map(c => c.high));
  const minL = Math.min(...ohlc.slice(s, e + 1).map(c => c.low));
  const priceRange = maxH - minL;

  const isFalling = name.includes('falling') || name.includes('descending');
  const isRising = name.includes('rising') || name.includes('ascending');

  const rReg = fitUpperEnvelope(ohlc, s, e);
  const sReg = fitLowerEnvelope(ohlc, s, e);
  const rAnch = anchorTrendline(ohlc, s, e, 'high');
  const sAnch = anchorTrendline(ohlc, s, e, 'low');

  const pickTighter = (
    a: { slope: number; intercept: number },
    b: { slope: number; intercept: number },
    side: 'high' | 'low'
  ) => {
    let aDist = 0, bDist = 0;
    for (let i = s; i <= e; i++) {
      const aY = trendlineY(a.slope, a.intercept, i);
      const bY = trendlineY(b.slope, b.intercept, i);
      if (side === 'high') {
        aDist += aY - ohlc[i].high;
        bDist += bY - ohlc[i].high;
      } else {
        aDist += ohlc[i].low - aY;
        bDist += ohlc[i].low - bY;
      }
    }
    return aDist <= bDist ? a : b;
  };

  let { slope: rSlope, intercept: rIntercept } = pickTighter(rReg, rAnch, 'high');
  let { slope: sSlope, intercept: sIntercept } = pickTighter(sReg, sAnch, 'low');

  if (isFalling) {
    if (rSlope > 0) rSlope = -priceRange / Math.max(span, 1) * 0.5;
    if (sSlope > 0) sSlope = rSlope * 0.4;
  } else if (isRising) {
    if (sSlope < 0) sSlope = priceRange / Math.max(span, 1) * 0.5;
    if (rSlope < 0) rSlope = sSlope * 0.4;
  }

  rIntercept = tightestIntercept(ohlc, s, e, rSlope, 'high');
  sIntercept = tightestIntercept(ohlc, s, e, sSlope, 'low');

  const rAtMid = trendlineY(rSlope, rIntercept, Math.floor((s + e) / 2));
  const sAtMid = trendlineY(sSlope, sIntercept, Math.floor((s + e) / 2));

  if (rAtMid <= sAtMid) {
    const mid = (rAtMid + sAtMid) / 2;
    const offset = (sAtMid - rAtMid) / 2 || (0.1 * (Math.abs(rAtMid) || 1));
    rIntercept += (mid + offset - rAtMid);
    sIntercept += (mid - offset - sAtMid);
  }

  const isWedge = name.includes('wedge');
  const isTriangle = name.includes('triangle');
  if ((isWedge || isTriangle) && span > 3) {
    const rAtS = trendlineY(rSlope, rIntercept, s);
    const sAtS = trendlineY(sSlope, sIntercept, s);
    const rAtE = trendlineY(rSlope, rIntercept, e);
    const sAtE = trendlineY(sSlope, sIntercept, e);
    const gapStart = rAtS - sAtS;
    const gapEnd = rAtE - sAtE;

    if (gapEnd >= gapStart) {
      const adjust = (gapEnd - gapStart + priceRange * 0.05) / Math.max(span, 1);
      rSlope -= adjust * 0.5;
      sSlope += adjust * 0.5;
      rIntercept = tightestIntercept(ohlc, s, e, rSlope, 'high');
      sIntercept = tightestIntercept(ohlc, s, e, sSlope, 'low');
    } else if (gapStart > 0 && gapEnd > 0) {
      const convergenceRatio = gapEnd / gapStart;
      const targetConvergence = isWedge ? 0.35 : 0.5;
      if (convergenceRatio > targetConvergence + 0.05) {
        const totalSlopeDelta = (gapEnd - gapStart * targetConvergence) / span;
        if (isFalling) {
          rSlope -= totalSlopeDelta * 0.7;
          sSlope += totalSlopeDelta * 0.3;
          if (sSlope > 0) sSlope = Math.min(sSlope, -0.001);
        } else if (isRising) {
          rSlope -= totalSlopeDelta * 0.3;
          sSlope += totalSlopeDelta * 0.7;
          if (rSlope < 0) rSlope = Math.max(rSlope, 0.001);
        } else {
          rSlope -= totalSlopeDelta * 0.5;
          sSlope += totalSlopeDelta * 0.5;
        }
        rIntercept = tightestIntercept(ohlc, s, e, rSlope, 'high');
        sIntercept = tightestIntercept(ohlc, s, e, sSlope, 'low');
      }
    }
  }

  const extEnd = Math.min(e + extend, ohlc.length - 1);

  const resistanceLine: GeometryLine = {
    start: { x: s, y: trendlineY(rSlope, rIntercept, s) },
    end: { x: extEnd, y: trendlineY(rSlope, rIntercept, extEnd) },
    style: 'solid',
  };
  const supportLine: GeometryLine = {
    start: { x: s, y: trendlineY(sSlope, sIntercept, s) },
    end: { x: extEnd, y: trendlineY(sSlope, sIntercept, extEnd) },
    style: 'solid',
  };

  const rTrend = { slope: rSlope, intercept: rIntercept };
  const sTrend = { slope: sSlope, intercept: sIntercept };

  const highTouches = findTouchPoints(ohlc, s, e, rTrend, 'high', 3);
  const lowTouches = findTouchPoints(ohlc, s, e, sTrend, 'low', 3);

  const cleanHigh = highTouches.length > 2
    ? [highTouches[0], highTouches[highTouches.length - 1]]
    : highTouches;

  const cleanLow = lowTouches.length > 2
    ? [lowTouches[0], lowTouches[lowTouches.length - 1]]
    : lowTouches;

  const points: GeometryPoint[] = [
    ...cleanHigh.map(p => ({ ...p, label: 'R' })),
    ...cleanLow.map(p => ({ ...p, label: 'S' })),
  ];

  const breakoutLevel = pattern.type === 'bullish'
    ? trendlineY(rSlope, rIntercept, e)
    : trendlineY(sSlope, sIntercept, e);

  const invalidationLevel = pattern.type === 'bullish'
    ? trendlineY(sSlope, sIntercept, e)
    : trendlineY(rSlope, rIntercept, e);

  return {
    points,
    lines: [resistanceLine, supportLine],
    breakoutLevel,
    invalidationLevel,
  };
}

function findPeaksInRange(ohlc: OHLC[], start: number, end: number, count: number, timeframe = "5m"): number[] {
  const scale = TIMEFRAME_GEOMETRY[timeframe] ?? TIMEFRAME_GEOMETRY["5m"];
  const span = end - start;
  const lb = Math.max(3, Math.floor((span / (count * 2.5)) * scale.swing));
  const minSpacing = Math.max(3, Math.floor((span / (count + 1)) * scale.swing));

  const candidates: { idx: number; val: number }[] = [];
  for (let i = start + lb; i <= end - Math.min(lb, 2); i++) {
    let isPeak = true;
    for (let j = Math.max(start, i - lb); j <= Math.min(end, i + lb); j++) {
      if (j !== i && ohlc[j].high >= ohlc[i].high) { isPeak = false; break; }
    }
    if (isPeak) candidates.push({ idx: i, val: ohlc[i].high });
  }

  if (candidates.length < count) {
    const sorted = [];
    for (let i = start; i <= end; i++) sorted.push({ idx: i, val: ohlc[i].high });
    sorted.sort((a, b) => b.val - a.val);
    const used = new Set(candidates.map(c => c.idx));
    for (const s of sorted) {
      if (used.has(s.idx)) continue;
      const tooClose = candidates.some(c => Math.abs(c.idx - s.idx) < minSpacing);
      if (tooClose) continue;
      candidates.push(s);
      used.add(s.idx);
      if (candidates.length >= count) break;
    }
  }

  candidates.sort((a, b) => a.idx - b.idx);
  if (candidates.length > count) {
    candidates.sort((a, b) => b.val - a.val);
    return candidates.slice(0, count).sort((a, b) => a.idx - b.idx).map(c => c.idx);
  }
  return candidates.map(c => c.idx);
}

function findTroughsInRange(ohlc: OHLC[], start: number, end: number, count: number, timeframe = "5m"): number[] {
  const scale = TIMEFRAME_GEOMETRY[timeframe] ?? TIMEFRAME_GEOMETRY["5m"];
  const span = end - start;
  const lb = Math.max(3, Math.floor((span / (count * 2.5)) * scale.swing));
  const minSpacing = Math.max(3, Math.floor((span / (count + 1)) * scale.swing));

  const candidates: { idx: number; val: number }[] = [];
  for (let i = start + lb; i <= end - Math.min(lb, 2); i++) {
    let isTrough = true;
    for (let j = Math.max(start, i - lb); j <= Math.min(end, i + lb); j++) {
      if (j !== i && ohlc[j].low <= ohlc[i].low) { isTrough = false; break; }
    }
    if (isTrough) candidates.push({ idx: i, val: ohlc[i].low });
  }

  if (candidates.length < count) {
    const sorted = [];
    for (let i = start; i <= end; i++) sorted.push({ idx: i, val: ohlc[i].low });
    sorted.sort((a, b) => a.val - b.val);
    const used = new Set(candidates.map(c => c.idx));
    for (const s of sorted) {
      if (used.has(s.idx)) continue;
      const tooClose = candidates.some(c => Math.abs(c.idx - s.idx) < minSpacing);
      if (tooClose) continue;
      candidates.push(s);
      used.add(s.idx);
      if (candidates.length >= count) break;
    }
  }

  candidates.sort((a, b) => a.idx - b.idx);
  if (candidates.length > count) {
    candidates.sort((a, b) => a.val - b.val);
    return candidates.slice(0, count).sort((a, b) => a.idx - b.idx).map(c => c.idx);
  }
  return candidates.map(c => c.idx);
}

function buildDoubleTopGeometry(ohlc: OHLC[], pattern: PatternResult, timeframe = "5m"): PatternGeometry {
  const scale = TIMEFRAME_GEOMETRY[timeframe] ?? TIMEFRAME_GEOMETRY["5m"];
  const peaks = findPeaksInRange(ohlc, pattern.startIndex, pattern.endIndex, 2, timeframe);

  if (peaks.length < 2) {
    return buildCandlestickGeometry(ohlc, pattern);
  }

  const peak1Idx = peaks[0];
  const peak2Idx = peaks[1];
  const peak1 = ohlc[peak1Idx].high;
  const peak2 = ohlc[peak2Idx].high;

  const avgR = avgRangeSlice(ohlc, pattern.startIndex, pattern.endIndex);
  const vScale = avgR * 0.4 * scale.wick;

  const troughCandidates = findTroughsInRange(ohlc, peak1Idx, peak2Idx, 1, timeframe);
  const neckline = troughCandidates.length > 0 ? ohlc[troughCandidates[0]].low : Math.min(...ohlc.slice(peak1Idx, peak2Idx + 1).map(c => c.low));

  const points: GeometryPoint[] = [
    { x: peak1Idx, y: peak1, label: 'Top 1' },
    { x: peak2Idx, y: peak2, label: 'Top 2' },
  ];

  const necklineLine: GeometryLine = {
    start: { x: pattern.startIndex, y: neckline },
    end: { x: Math.min(pattern.endIndex + 5, ohlc.length - 1), y: neckline },
    style: 'dashed',
  };

  const resistanceLine: GeometryLine = {
    start: { x: peak1Idx, y: peak1 },
    end: { x: peak2Idx, y: peak2 },
    style: 'solid',
  };

  return {
    points,
    lines: [resistanceLine, necklineLine],
    breakoutLevel: neckline,
    invalidationLevel: Math.max(peak1, peak2),
  };
}

function buildDoubleBottomGeometry(ohlc: OHLC[], pattern: PatternResult, timeframe = "5m"): PatternGeometry {
  const scale = TIMEFRAME_GEOMETRY[timeframe] ?? TIMEFRAME_GEOMETRY["5m"];
  const troughs = findTroughsInRange(ohlc, pattern.startIndex, pattern.endIndex, 2, timeframe);

  if (troughs.length < 2) {
    return buildCandlestickGeometry(ohlc, pattern);
  }

  const trough1Idx = troughs[0];
  const trough2Idx = troughs[1];
  const trough1 = ohlc[trough1Idx].low;
  const trough2 = ohlc[trough2Idx].low;

  const avgR = avgRangeSlice(ohlc, pattern.startIndex, pattern.endIndex);
  const vScale = avgR * 0.4 * scale.wick;

  const peakCandidates = findPeaksInRange(ohlc, trough1Idx, trough2Idx, 1, timeframe);
  const neckline = peakCandidates.length > 0 ? ohlc[peakCandidates[0]].high : Math.max(...ohlc.slice(trough1Idx, trough2Idx + 1).map(c => c.high));

  const points: GeometryPoint[] = [
    { x: trough1Idx, y: trough1, label: 'Bottom 1' },
    { x: trough2Idx, y: trough2, label: 'Bottom 2' },
  ];

  const necklineLine: GeometryLine = {
    start: { x: pattern.startIndex, y: neckline },
    end: { x: Math.min(pattern.endIndex + 5, ohlc.length - 1), y: neckline },
    style: 'dashed',
  };

  const supportLine: GeometryLine = {
    start: { x: trough1Idx, y: trough1 },
    end: { x: trough2Idx, y: trough2 },
    style: 'solid',
  };

  return {
    points,
    lines: [supportLine, necklineLine],
    breakoutLevel: neckline,
    invalidationLevel: Math.min(trough1, trough2),
  };
}

function buildTripleTopGeometry(ohlc: OHLC[], pattern: PatternResult, timeframe = "5m"): PatternGeometry {
  const scale = TIMEFRAME_GEOMETRY[timeframe] ?? TIMEFRAME_GEOMETRY["5m"];
  const peaks = findPeaksInRange(ohlc, pattern.startIndex, pattern.endIndex, 3, timeframe);

  if (peaks.length < 3) {
    return buildDoubleTopGeometry(ohlc, pattern, timeframe);
  }

  const p1 = peaks[0], p2 = peaks[1], p3 = peaks[2];
  const h1 = ohlc[p1].high, h2 = ohlc[p2].high, h3 = ohlc[p3].high;

  const t1Candidates = findTroughsInRange(ohlc, p1, p2, 1, timeframe);
  const t2Candidates = findTroughsInRange(ohlc, p2, p3, 1, timeframe);

  const neckline = Math.min(
    t1Candidates.length > 0 ? ohlc[t1Candidates[0]].low : Math.min(...ohlc.slice(p1, p2 + 1).map(c => c.low)),
    t2Candidates.length > 0 ? ohlc[t2Candidates[0]].low : Math.min(...ohlc.slice(p2, p3 + 1).map(c => c.low))
  );

  const points: GeometryPoint[] = [
    { x: p1, y: h1, label: 'Top 1' },
    { x: p2, y: h2, label: 'Top 2' },
    { x: p3, y: h3, label: 'Top 3' },
  ];

  const resistanceLine: GeometryLine = {
    start: { x: p1, y: (h1 + h2 + h3) / 3 },
    end: { x: p3, y: (h1 + h2 + h3) / 3 },
    style: 'solid',
  };

  const necklineLine: GeometryLine = {
    start: { x: pattern.startIndex, y: neckline },
    end: { x: Math.min(pattern.endIndex + 5, ohlc.length - 1), y: neckline },
    style: 'dashed',
  };

  return {
    points,
    lines: [resistanceLine, necklineLine],
    breakoutLevel: neckline,
    invalidationLevel: Math.max(h1, h2, h3),
  };
}

function buildTripleBottomGeometry(ohlc: OHLC[], pattern: PatternResult, timeframe = "5m"): PatternGeometry {
  const scale = TIMEFRAME_GEOMETRY[timeframe] ?? TIMEFRAME_GEOMETRY["5m"];
  const troughs = findTroughsInRange(ohlc, pattern.startIndex, pattern.endIndex, 3, timeframe);

  if (troughs.length < 3) {
    return buildDoubleBottomGeometry(ohlc, pattern, timeframe);
  }

  const t1 = troughs[0], t2 = troughs[1], t3 = troughs[2];
  const l1 = ohlc[t1].low, l2 = ohlc[t2].low, l3 = ohlc[t3].low;

  const p1Candidates = findPeaksInRange(ohlc, t1, t2, 1, timeframe);
  const p2Candidates = findPeaksInRange(ohlc, t2, t3, 1, timeframe);

  const neckline = Math.max(
    p1Candidates.length > 0 ? ohlc[p1Candidates[0]].high : Math.max(...ohlc.slice(t1, t2 + 1).map(c => c.high)),
    p2Candidates.length > 0 ? ohlc[p2Candidates[0]].high : Math.max(...ohlc.slice(t2, t3 + 1).map(c => c.high))
  );

  const points: GeometryPoint[] = [
    { x: t1, y: l1, label: 'Bot 1' },
    { x: t2, y: l2, label: 'Bot 2' },
    { x: t3, y: l3, label: 'Bot 3' },
  ];

  const supportLine: GeometryLine = {
    start: { x: t1, y: (l1 + l2 + l3) / 3 },
    end: { x: t3, y: (l1 + l2 + l3) / 3 },
    style: 'solid',
  };

  const necklineLine: GeometryLine = {
    start: { x: pattern.startIndex, y: neckline },
    end: { x: Math.min(pattern.endIndex + 5, ohlc.length - 1), y: neckline },
    style: 'dashed',
  };

  return {
    points,
    lines: [supportLine, necklineLine],
    breakoutLevel: neckline,
    invalidationLevel: Math.min(l1, l2, l3),
  };
}

function buildHeadAndShouldersGeometry(ohlc: OHLC[], pattern: PatternResult, timeframe = "5m"): PatternGeometry {
  const scale = TIMEFRAME_GEOMETRY[timeframe] ?? TIMEFRAME_GEOMETRY["5m"];
  const allPeaks = new Set<number>();
  for (const lb of [3, 5, 7]) {
    const p = findPeaksInRange(ohlc, pattern.startIndex, pattern.endIndex, Math.max(3, Math.ceil((pattern.endIndex - pattern.startIndex) / (lb * 3))), timeframe);
    p.forEach(idx => allPeaks.add(idx));
  }
  const peaks = Array.from(allPeaks).sort((a, b) => a - b);

  if (peaks.length < 3) {
    return buildTwoTrendlineGeometry(ohlc, pattern, 5, timeframe);
  }

  const avgR = avgRangeSlice(ohlc, pattern.startIndex, pattern.endIndex);
  const minProminence = avgR * 0.3 * scale.swing;

  let ls = -1, head = -1, rs = -1;
  let bestHeadProminence = -Infinity;
  for (let i = 0; i < peaks.length; i++) {
    for (let j = i + 1; j < peaks.length; j++) {
      for (let k = j + 1; k < peaks.length; k++) {
        const hVal = ohlc[peaks[j]].high;
        const lVal = ohlc[peaks[i]].high;
        const rVal = ohlc[peaks[k]].high;
        if (hVal > lVal && hVal > rVal) {
          const shoulderRatio = rVal / lVal;
          if (shoulderRatio < 0.75 || shoulderRatio > 1.25) continue;
          if (rVal > hVal) continue;
          const prominence = hVal - Math.max(lVal, rVal);
          if (prominence < minProminence) continue;
          if (prominence > bestHeadProminence) {
            bestHeadProminence = prominence;
            ls = peaks[i]; head = peaks[j]; rs = peaks[k];
          }
        }
      }
    }
  }

  if (ls < 0 || head < 0 || rs < 0) {
    return buildTwoTrendlineGeometry(ohlc, pattern, 5, timeframe);
  }

  let trough1Idx = -1, trough1Val = Infinity;
  for (let i = ls + 2; i < head - 1; i++) {
    const isSwing = ohlc[i].low <= ohlc[i - 1].low && ohlc[i].low <= ohlc[i - 2].low && ohlc[i].low <= ohlc[i + 1].low;
    if (isSwing && ohlc[i].low < trough1Val) { trough1Val = ohlc[i].low; trough1Idx = i; }
  }
  if (trough1Idx < 0) {
    for (let i = ls + 1; i < head; i++) { if (ohlc[i].low < trough1Val) { trough1Val = ohlc[i].low; trough1Idx = i; } }
  }
  if (trough1Idx < 0) { trough1Idx = Math.round((ls + head) / 2); trough1Val = ohlc[trough1Idx].low; }

  let trough2Idx = -1, trough2Val = Infinity;
  for (let i = head + 2; i < rs - 1; i++) {
    const isSwing = ohlc[i].low <= ohlc[i - 1].low && ohlc[i].low <= ohlc[i - 2].low && ohlc[i].low <= ohlc[i + 1].low;
    if (isSwing && ohlc[i].low < trough2Val) { trough2Val = ohlc[i].low; trough2Idx = i; }
  }
  if (trough2Idx < 0) {
    for (let i = head + 1; i < rs; i++) { if (ohlc[i].low < trough2Val) { trough2Val = ohlc[i].low; trough2Idx = i; } }
  }
  if (trough2Idx < 0) { trough2Idx = Math.round((head + rs) / 2); trough2Val = ohlc[trough2Idx].low; }

  const neckSlope = (trough2Idx !== trough1Idx) ? (trough2Val - trough1Val) / (trough2Idx - trough1Idx) : 0;
  const neckExtendEnd = Math.min(pattern.endIndex + 8, ohlc.length - 1);
  const neckEndY = trough1Val + neckSlope * (neckExtendEnd - trough1Idx);
  const neckStartX = Math.max(pattern.startIndex, ls - 2);
  const neckStartY = trough1Val + neckSlope * (neckStartX - trough1Idx);

  const breakoutY = trough1Val + neckSlope * (rs - trough1Idx);

  const points: GeometryPoint[] = [
    { x: ls, y: ohlc[ls].high, label: 'LS' },
    { x: trough1Idx, y: trough1Val, label: 'NL' },
    { x: head, y: ohlc[head].high, label: 'Head' },
    { x: trough2Idx, y: trough2Val, label: 'NL' },
    { x: rs, y: ohlc[rs].high, label: 'RS' },
  ];

  const outline1: GeometryLine = { start: { x: ls, y: ohlc[ls].high }, end: { x: trough1Idx, y: trough1Val }, style: 'solid' };
  const outline2: GeometryLine = { start: { x: trough1Idx, y: trough1Val }, end: { x: head, y: ohlc[head].high }, style: 'solid' };
  const outline3: GeometryLine = { start: { x: head, y: ohlc[head].high }, end: { x: trough2Idx, y: trough2Val }, style: 'solid' };
  const outline4: GeometryLine = { start: { x: trough2Idx, y: trough2Val }, end: { x: rs, y: ohlc[rs].high }, style: 'solid' };

  const necklineLine: GeometryLine = {
    start: { x: neckStartX, y: neckStartY },
    end: { x: neckExtendEnd, y: neckEndY },
    style: 'dashed',
  };

  return {
    points,
    lines: [outline1, outline2, outline3, outline4, necklineLine],
    breakoutLevel: breakoutY,
    invalidationLevel: ohlc[head].high,
  };
}

function buildInverseHeadAndShouldersGeometry(ohlc: OHLC[], pattern: PatternResult, timeframe = "5m"): PatternGeometry {
  const scale = TIMEFRAME_GEOMETRY[timeframe] ?? TIMEFRAME_GEOMETRY["5m"];
  const allTroughs = new Set<number>();
  for (const lb of [3, 5, 7]) {
    const t = findTroughsInRange(ohlc, pattern.startIndex, pattern.endIndex, Math.max(3, Math.ceil((pattern.endIndex - pattern.startIndex) / (lb * 3))), timeframe);
    t.forEach(idx => allTroughs.add(idx));
  }
  const troughs = Array.from(allTroughs).sort((a, b) => a - b);

  if (troughs.length < 3) {
    return buildTwoTrendlineGeometry(ohlc, pattern, 5, timeframe);
  }

  const avgR = avgRangeSlice(ohlc, pattern.startIndex, pattern.endIndex);
  const minProminence = avgR * 0.3 * scale.swing;

  let ls = -1, head = -1, rs = -1;
  let bestHeadProminence = -Infinity;
  for (let i = 0; i < troughs.length; i++) {
    for (let j = i + 1; j < troughs.length; j++) {
      for (let k = j + 1; k < troughs.length; k++) {
        const hVal = ohlc[troughs[j]].low;
        const lVal = ohlc[troughs[i]].low;
        const rVal = ohlc[troughs[k]].low;
        if (hVal < lVal && hVal < rVal) {
          const shoulderRatio = rVal / lVal;
          if (shoulderRatio < 0.75 || shoulderRatio > 1.25) continue;
          if (rVal < hVal) continue;
          const prominence = Math.min(lVal, rVal) - hVal;
          if (prominence < minProminence) continue;
          if (prominence > bestHeadProminence) {
            bestHeadProminence = prominence;
            ls = troughs[i]; head = troughs[j]; rs = troughs[k];
          }
        }
      }
    }
  }

  if (ls < 0 || head < 0 || rs < 0) {
    return buildTwoTrendlineGeometry(ohlc, pattern, 5, timeframe);
  }

  let peak1Idx = -1, peak1Val = -Infinity;
  for (let i = ls + 2; i < head - 1; i++) {
    const isSwing = ohlc[i].high >= ohlc[i - 1].high && ohlc[i].high >= ohlc[i - 2].high && ohlc[i].high >= ohlc[i + 1].high;
    if (isSwing && ohlc[i].high > peak1Val) { peak1Val = ohlc[i].high; peak1Idx = i; }
  }
  if (peak1Idx < 0) {
    for (let i = ls + 1; i < head; i++) { if (ohlc[i].high > peak1Val) { peak1Val = ohlc[i].high; peak1Idx = i; } }
  }
  if (peak1Idx < 0) { peak1Idx = Math.round((ls + head) / 2); peak1Val = ohlc[peak1Idx].high; }

  let peak2Idx = -1, peak2Val = -Infinity;
  for (let i = head + 2; i < rs - 1; i++) {
    const isSwing = ohlc[i].high >= ohlc[i - 1].high && ohlc[i].high >= ohlc[i - 2].high && ohlc[i].high >= ohlc[i + 1].high;
    if (isSwing && ohlc[i].high > peak2Val) { peak2Val = ohlc[i].high; peak2Idx = i; }
  }
  if (peak2Idx < 0) {
    for (let i = head + 1; i < rs; i++) { if (ohlc[i].high > peak2Val) { peak2Val = ohlc[i].high; peak2Idx = i; } }
  }
  if (peak2Idx < 0) { peak2Idx = Math.round((head + rs) / 2); peak2Val = ohlc[peak2Idx].high; }

  const neckSlope = (peak2Idx !== peak1Idx) ? (peak2Val - peak1Val) / (peak2Idx - peak1Idx) : 0;
  const neckExtendEnd = Math.min(pattern.endIndex + 8, ohlc.length - 1);
  const neckEndY = peak1Val + neckSlope * (neckExtendEnd - peak1Idx);
  const neckStartX = Math.max(pattern.startIndex, ls - 2);
  const neckStartY = peak1Val + neckSlope * (neckStartX - peak1Idx);

  const breakoutY = peak1Val + neckSlope * (rs - peak1Idx);

  const points: GeometryPoint[] = [
    { x: ls, y: ohlc[ls].low, label: 'LS' },
    { x: peak1Idx, y: peak1Val, label: 'NL' },
    { x: head, y: ohlc[head].low, label: 'Head' },
    { x: peak2Idx, y: peak2Val, label: 'NL' },
    { x: rs, y: ohlc[rs].low, label: 'RS' },
  ];

  const outline1: GeometryLine = { start: { x: ls, y: ohlc[ls].low }, end: { x: peak1Idx, y: peak1Val }, style: 'solid' };
  const outline2: GeometryLine = { start: { x: peak1Idx, y: peak1Val }, end: { x: head, y: ohlc[head].low }, style: 'solid' };
  const outline3: GeometryLine = { start: { x: head, y: ohlc[head].low }, end: { x: peak2Idx, y: peak2Val }, style: 'solid' };
  const outline4: GeometryLine = { start: { x: peak2Idx, y: peak2Val }, end: { x: rs, y: ohlc[rs].low }, style: 'solid' };

  const necklineLine: GeometryLine = {
    start: { x: neckStartX, y: neckStartY },
    end: { x: neckExtendEnd, y: neckEndY },
    style: 'dashed',
  };

  return {
    points,
    lines: [outline1, outline2, outline3, outline4, necklineLine],
    breakoutLevel: breakoutY,
    invalidationLevel: ohlc[head].low,
  };
}

function buildFlagGeometry(ohlc: OHLC[], pattern: PatternResult, timeframe = "5m"): PatternGeometry {
  const scale = TIMEFRAME_GEOMETRY[timeframe] ?? TIMEFRAME_GEOMETRY["5m"];
  const flagpoleStart = pattern.startIndex;
  const totalSpan = pattern.endIndex - flagpoleStart;
  const maxPoleLen = Math.max(3, Math.floor(totalSpan * 0.6));
  const minFlagLen = Math.max(3, Math.floor(3 * scale.swing));
  const minPoleLen = Math.max(2, Math.floor(2 * scale.swing));
  const isBull = pattern.type === 'bullish';
  const isPennant = (pattern.name || '').toLowerCase().includes('pennant');

  let flagpoleEnd = flagpoleStart;
  let consecutiveSmall = 0;
  for (let i = flagpoleStart + 1; i <= pattern.endIndex; i++) {
    if (i - flagpoleStart >= maxPoleLen) break;

    const curr = ohlc[i];
    const body = Math.abs(curr.close - curr.open);
    const range = curr.high - curr.low;
    const bodyRatio = body / Math.max(range, 0.0001);

    const isDirectional = isBull
      ? curr.close > curr.open
      : curr.close < curr.open;

    if (bodyRatio < 0.25 || (!isDirectional && bodyRatio < 0.4)) {
      consecutiveSmall++;
      if (consecutiveSmall >= Math.max(2, Math.floor(2 * scale.swing))) {
        flagpoleEnd = i - consecutiveSmall;
        break;
      }
    } else {
      consecutiveSmall = 0;
      flagpoleEnd = i;
    }
  }

  if (flagpoleEnd - flagpoleStart < minPoleLen) {
    flagpoleEnd = Math.min(flagpoleStart + minPoleLen, pattern.endIndex - minFlagLen);
  }
  if (flagpoleEnd <= flagpoleStart) {
    flagpoleEnd = flagpoleStart + 1;
  }

  if (pattern.endIndex - flagpoleEnd < minFlagLen) {
    flagpoleEnd = Math.max(flagpoleStart + 1, pattern.endIndex - minFlagLen);
  }

  const flagStart = flagpoleEnd + 1;
  const flagEnd = pattern.endIndex;

  if (flagStart > flagEnd || flagStart >= ohlc.length) {
    const mid = Math.floor((flagpoleStart + pattern.endIndex) / 2);
    const safePoleEnd = Math.max(flagpoleStart + 1, mid);
    const pS = isBull ? ohlc[flagpoleStart].low : ohlc[flagpoleStart].high;
    const pE = isBull ? ohlc[safePoleEnd].high : ohlc[safePoleEnd].low;
    return {
      points: [
        { x: flagpoleStart, y: pS, label: 'Pole Start' },
        { x: safePoleEnd, y: pE, label: 'Pole End' },
      ],
      lines: [{
        start: { x: flagpoleStart, y: pS },
        end: { x: safePoleEnd, y: pE },
        style: 'solid',
      }],
      breakoutLevel: pE,
      invalidationLevel: pS,
    };
  }

  const poleStartY = isBull ? ohlc[flagpoleStart].low : ohlc[flagpoleStart].high;
  const poleEndY = isBull ? ohlc[flagpoleEnd].high : ohlc[flagpoleEnd].low;

  const poleLine: GeometryLine = {
    start: { x: flagpoleStart, y: poleStartY },
    end: { x: flagpoleEnd, y: poleEndY },
    style: 'solid',
  };

  const bodyTops: { x: number; y: number }[] = [];
  const bodyBots: { x: number; y: number }[] = [];
  for (let i = flagStart; i <= flagEnd; i++) {
    bodyTops.push({ x: i, y: Math.max(ohlc[i].open, ohlc[i].close) });
    bodyBots.push({ x: i, y: Math.min(ohlc[i].open, ohlc[i].close) });
  }

  const highTrend = calcTrendline(bodyTops);
  const lowTrend = calcTrendline(bodyBots);

  if (isPennant) {
    const gapStart = trendlineY(highTrend.slope, highTrend.intercept, flagStart)
                   - trendlineY(lowTrend.slope, lowTrend.intercept, flagStart);
    const gapEnd = trendlineY(highTrend.slope, highTrend.intercept, flagEnd)
                 - trendlineY(lowTrend.slope, lowTrend.intercept, flagEnd);
    if (gapEnd >= gapStart || gapEnd <= 0) {
      const topFirst = Math.max(ohlc[flagStart].open, ohlc[flagStart].close);
      const botFirst = Math.min(ohlc[flagStart].open, ohlc[flagStart].close);
      const topLast = Math.max(ohlc[flagEnd].open, ohlc[flagEnd].close);
      const botLast = Math.min(ohlc[flagEnd].open, ohlc[flagEnd].close);
      const apex = (topLast + botLast) / 2;
      const flagSpan = flagEnd - flagStart;
      if (flagSpan > 0) {
        highTrend.slope = (apex + (topLast - botLast) * 0.15 - topFirst) / flagSpan;
        highTrend.intercept = topFirst - highTrend.slope * flagStart;
        lowTrend.slope = (apex - (topLast - botLast) * 0.15 - botFirst) / flagSpan;
        lowTrend.intercept = botFirst - lowTrend.slope * flagStart;
      }
    }
  } else {
    const tighten = 0.15;
    const bodyTopStart = Math.max(ohlc[flagStart].open, ohlc[flagStart].close);
    const bodyBotStart = Math.min(ohlc[flagStart].open, ohlc[flagStart].close);
    highTrend.intercept -= tighten * (bodyTopStart - trendlineY(highTrend.slope, highTrend.intercept, flagStart));
    lowTrend.intercept += tighten * (trendlineY(lowTrend.slope, lowTrend.intercept, flagStart) - bodyBotStart);
  }

  const topAtStart = trendlineY(highTrend.slope, highTrend.intercept, flagStart);
  const botAtStart = trendlineY(lowTrend.slope, lowTrend.intercept, flagStart);
  const topAtEnd = trendlineY(highTrend.slope, highTrend.intercept, flagEnd);
  const botAtEnd = trendlineY(lowTrend.slope, lowTrend.intercept, flagEnd);

  if (topAtStart <= botAtStart || topAtEnd <= botAtEnd) {
    let maxBody = -Infinity, minBody = Infinity;
    for (let i = flagStart; i <= flagEnd; i++) {
      const bt = Math.max(ohlc[i].open, ohlc[i].close);
      const bb = Math.min(ohlc[i].open, ohlc[i].close);
      if (bt > maxBody) maxBody = bt;
      if (bb < minBody) minBody = bb;
    }
    const pad = (maxBody - minBody) * 0.05;
    if (isPennant) {
      const mid = (maxBody + minBody) / 2;
      const halfGap = (maxBody - minBody) / 2 + pad;
      highTrend.slope = -halfGap * 0.6 / Math.max(1, flagEnd - flagStart);
      highTrend.intercept = (mid + halfGap) - highTrend.slope * flagStart;
      lowTrend.slope = halfGap * 0.6 / Math.max(1, flagEnd - flagStart);
      lowTrend.intercept = (mid - halfGap) - lowTrend.slope * flagStart;
    } else {
      highTrend.slope = 0;
      highTrend.intercept = maxBody + pad;
      lowTrend.slope = 0;
      lowTrend.intercept = minBody - pad;
    }
  }

  const extEnd = Math.min(flagEnd + Math.floor(3 * scale.swing), ohlc.length - 1);

  const flagTop: GeometryLine = {
    start: { x: flagStart, y: trendlineY(highTrend.slope, highTrend.intercept, flagStart) },
    end: { x: extEnd, y: trendlineY(highTrend.slope, highTrend.intercept, extEnd) },
    style: 'dashed',
  };
  const flagBottom: GeometryLine = {
    start: { x: flagStart, y: trendlineY(lowTrend.slope, lowTrend.intercept, flagStart) },
    end: { x: extEnd, y: trendlineY(lowTrend.slope, lowTrend.intercept, extEnd) },
    style: 'dashed',
  };

  const breakoutLevel = isBull
    ? trendlineY(highTrend.slope, highTrend.intercept, pattern.endIndex)
    : trendlineY(lowTrend.slope, lowTrend.intercept, pattern.endIndex);

  const invalidationLevel = isBull
    ? trendlineY(lowTrend.slope, lowTrend.intercept, pattern.endIndex)
    : trendlineY(highTrend.slope, highTrend.intercept, pattern.endIndex);

  return {
    points: [
      { x: flagpoleStart, y: poleStartY, label: 'Pole Start' },
      { x: flagpoleEnd, y: poleEndY, label: 'Pole End' },
    ],
    lines: [poleLine, flagTop, flagBottom],
    breakoutLevel,
    invalidationLevel,
  };
}

function fitQuadraticDraw(values: number[]): { a: number; b: number; c: number; r2: number } {
  const n = values.length;
  if (n < 3) return { a: 0, b: 0, c: values[0] ?? 0, r2: 0 };

  let sumX = 0, sumX2 = 0, sumX3 = 0, sumX4 = 0;
  let sumY = 0, sumXY = 0, sumX2Y = 0;

  for (let i = 0; i < n; i++) {
    const x = i, x2 = x * x, x3 = x2 * x, x4 = x3 * x, y = values[i];
    sumX += x; sumX2 += x2; sumX3 += x3; sumX4 += x4;
    sumY += y; sumXY += x * y; sumX2Y += x2 * y;
  }

  const S00 = n, S10 = sumX, S20 = sumX2, S30 = sumX3, S40 = sumX4;
  const SY0 = sumY, SY1 = sumXY, SY2 = sumX2Y;

  const det = S00 * (S20 * S40 - S30 * S30)
            - S10 * (S10 * S40 - S20 * S30)
            + S20 * (S10 * S30 - S20 * S20);

  if (Math.abs(det) < 1e-12) return { a: 0, b: 0, c: sumY / n, r2: 0 };

  const c = (SY0 * (S20 * S40 - S30 * S30) - SY1 * (S10 * S40 - S20 * S30) + SY2 * (S10 * S30 - S20 * S20)) / det;
  const b = (S00 * (SY1 * S40 - SY2 * S30) - S10 * (SY0 * S40 - SY2 * S20) + S20 * (SY0 * S30 - SY1 * S20)) / det;
  const a = (S00 * (S20 * SY2 - S30 * SY1) - S10 * (S10 * SY2 - S30 * SY0) + S20 * (S10 * SY1 - S20 * SY0)) / det;

  const yMean = sumY / n;
  let ssTot = 0, ssRes = 0;
  for (let i = 0; i < n; i++) {
    const predicted = a * i * i + b * i + c;
    ssRes += (values[i] - predicted) ** 2;
    ssTot += (values[i] - yMean) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;

  return { a, b, c, r2 };
}

function buildRoundedTopGeometry(ohlc: OHLC[], pattern: PatternResult, timeframe = "5m"): PatternGeometry {
  const scale = TIMEFRAME_GEOMETRY[timeframe] ?? TIMEFRAME_GEOMETRY["5m"];
  const s = pattern.startIndex;
  const e = pattern.endIndex;
  const span = e - s;
  if (span < 3) return buildCandlestickGeometry(ohlc, pattern);

  const slice = ohlc.slice(s, e + 1);
  const sliceHighs = slice.map(c => c.high);
  const peakHigh = Math.max(...sliceHighs);
  const peakIdx = s + sliceHighs.indexOf(peakHigh);
  const supportLevel = Math.min(ohlc[s].low, ohlc[e].low);

  const avgR = slice.reduce((sum, c) => sum + (c.high - c.low), 0) / slice.length;
  const pad = avgR * 0.3 * scale.wick;

  const quad = fitQuadraticDraw(sliceHighs);

  const numSegs = Math.max(24, span * 2);
  const lines: GeometryLine[] = [];

  for (let k = 0; k < numSegs; k++) {
    const t1 = k / numSegs;
    const t2 = (k + 1) / numSegs;
    const localX1 = t1 * (slice.length - 1);
    const localX2 = t2 * (slice.length - 1);
    const y1 = quad.a * localX1 * localX1 + quad.b * localX1 + quad.c + pad;
    const y2 = quad.a * localX2 * localX2 + quad.b * localX2 + quad.c + pad;

    lines.push({
      start: { x: s + t1 * span, y: y1 },
      end: { x: s + t2 * span, y: y2 },
      style: 'solid',
    });
  }

  lines.push({
    start: { x: s, y: supportLevel },
    end: { x: Math.min(e + 5, ohlc.length - 1), y: supportLevel },
    style: 'dashed',
  });

  return {
    points: [{ x: peakIdx, y: peakHigh, label: 'Peak' }],
    lines,
    breakoutLevel: supportLevel,
    invalidationLevel: peakHigh,
  };
}

function buildRoundedBottomGeometry(ohlc: OHLC[], pattern: PatternResult, timeframe = "5m"): PatternGeometry {
  const scale = TIMEFRAME_GEOMETRY[timeframe] ?? TIMEFRAME_GEOMETRY["5m"];
  const s = pattern.startIndex;
  const e = pattern.endIndex;
  const span = e - s;
  if (span < 3) return buildCandlestickGeometry(ohlc, pattern);

  const slice = ohlc.slice(s, e + 1);
  const sliceLows = slice.map(c => c.low);
  const troughLow = Math.min(...sliceLows);
  const troughIdx = s + sliceLows.indexOf(troughLow);
  const resistanceLevel = Math.max(ohlc[s].high, ohlc[e].high);

  const avgR = slice.reduce((sum, c) => sum + (c.high - c.low), 0) / slice.length;
  const pad = avgR * 0.3 * scale.wick;

  const quad = fitQuadraticDraw(sliceLows);

  const numSegs = Math.max(24, span * 2);
  const lines: GeometryLine[] = [];

  for (let k = 0; k < numSegs; k++) {
    const t1 = k / numSegs;
    const t2 = (k + 1) / numSegs;
    const localX1 = t1 * (slice.length - 1);
    const localX2 = t2 * (slice.length - 1);
    const y1 = quad.a * localX1 * localX1 + quad.b * localX1 + quad.c - pad;
    const y2 = quad.a * localX2 * localX2 + quad.b * localX2 + quad.c - pad;

    lines.push({
      start: { x: s + t1 * span, y: y1 },
      end: { x: s + t2 * span, y: y2 },
      style: 'solid',
    });
  }

  lines.push({
    start: { x: s, y: resistanceLevel },
    end: { x: Math.min(e + 5, ohlc.length - 1), y: resistanceLevel },
    style: 'dashed',
  });

  return {
    points: [{ x: troughIdx, y: troughLow, label: 'Trough' }],
    lines,
    breakoutLevel: resistanceLevel,
    invalidationLevel: troughLow,
  };
}

function buildCandlestickGeometry(ohlc: OHLC[], pattern: PatternResult): PatternGeometry {
  const s = pattern.startIndex;
  const e = pattern.endIndex;
  const rangeHigh = Math.max(...ohlc.slice(s, e + 1).map(c => c.high));
  const rangeLow = Math.min(...ohlc.slice(s, e + 1).map(c => c.low));

  const highIdx = ohlc.slice(s, e + 1).findIndex(c => c.high === rangeHigh) + s;
  const lowIdx = ohlc.slice(s, e + 1).findIndex(c => c.low === rangeLow) + s;

  const points: GeometryPoint[] = [
    { x: highIdx, y: rangeHigh, label: 'H' },
    { x: lowIdx, y: rangeLow, label: 'L' },
  ];

  return {
    points,
    lines: [{
      start: { x: s, y: rangeHigh },
      end: { x: e, y: rangeHigh },
      style: 'dashed',
    }, {
      start: { x: s, y: rangeLow },
      end: { x: e, y: rangeLow },
      style: 'dashed',
    }],
    breakoutLevel: pattern.type === 'bullish' ? rangeHigh : (pattern.type === 'bearish' ? rangeLow : null),
    invalidationLevel: pattern.type === 'bullish' ? rangeLow : (pattern.type === 'bearish' ? rangeHigh : null),
  };
}

const CANDLESTICK_PATTERN_NAMES = new Set([
  'hammer', 'hanging man', 'inverted hammer', 'shooting star',
  'doji', 'dragonfly doji', 'gravestone doji',
  'bullish engulfing', 'bearish engulfing',
  'bullish harami', 'bearish harami',
  'morning star', 'evening star',
  'three white soldiers', 'three black crows',
  'three inside up', 'three inside down',
  'three outside up', 'three outside down',
  'bullish kicker', 'bearish kicker',
  'bullish belt hold', 'bearish belt hold',
  'bullish abandoned baby', 'bearish abandoned baby',
  'bullish tri-star doji', 'bearish tri-star doji',
  'piercing pattern', 'dark cloud cover',
  'tweezer top', 'tweezer bottom',
]);

function isCandlestickPattern(name: string): boolean {
  return CANDLESTICK_PATTERN_NAMES.has(name.toLowerCase());
}

function buildCandlestickMarkerGeometry(ohlc: OHLC[], pattern: PatternResult): PatternGeometry {
  const s = pattern.startIndex;
  const e = pattern.endIndex;
  const slice = ohlc.slice(s, e + 1);
  if (slice.length === 0) return { points: [], lines: [], breakoutLevel: null, invalidationLevel: null };

  const rangeHigh = Math.max(...slice.map(c => c.high));
  const rangeLow = Math.min(...slice.map(c => c.low));
  const isBullish = pattern.type === 'bullish';

  const signalCandle = ohlc[e];
  const markerIdx = e;
  const markerY = isBullish ? signalCandle.low : signalCandle.high;
  const arrowTipY = isBullish ? rangeLow : rangeHigh;

  const name = pattern.name.toLowerCase();
  let label = pattern.name;
  if (name === 'bullish engulfing' || name === 'bearish engulfing') label = 'Engulfing';
  else if (name === 'bullish harami' || name === 'bearish harami') label = 'Harami';
  else if (name === 'bullish kicker' || name === 'bearish kicker') label = 'Kicker';
  else if (name === 'bullish belt hold' || name === 'bearish belt hold') label = 'Belt Hold';
  else if (name === 'bullish abandoned baby' || name === 'bearish abandoned baby') label = 'Abandoned Baby';
  else if (name === 'bullish tri-star doji' || name === 'bearish tri-star doji') label = 'Tri-Star';
  else if (name === 'three inside up' || name === 'three inside down') label = '3 Inside';
  else if (name === 'three outside up' || name === 'three outside down') label = '3 Outside';
  else if (name === 'three white soldiers') label = '3 Soldiers';
  else if (name === 'three black crows') label = '3 Crows';

  const points: GeometryPoint[] = [
    { x: markerIdx, y: arrowTipY, label },
  ];

  for (let i = s; i <= e; i++) {
    points.push({ x: i, y: isBullish ? ohlc[i].low : ohlc[i].high, label: '' });
  }

  return {
    points,
    lines: [],
    breakoutLevel: isBullish ? rangeHigh : rangeLow,
    invalidationLevel: isBullish ? rangeLow : rangeHigh,
  };
}

function buildBreakOfStructureGeometry(ohlc: OHLC[], pattern: PatternResult): PatternGeometry {
  const s = pattern.startIndex;
  const e = pattern.endIndex;
  const isBearish = pattern.type === 'bearish';

  const swingLevel = isBearish
    ? Math.min(...ohlc.slice(s, e + 1).map(c => c.low))
    : Math.max(...ohlc.slice(s, e + 1).map(c => c.high));

  const swingIdx = isBearish
    ? s + ohlc.slice(s, e + 1).findIndex(c => c.low === swingLevel)
    : s + ohlc.slice(s, e + 1).findIndex(c => c.high === swingLevel);

  const extend = Math.min(e + 10, ohlc.length - 1);

  return {
    points: [{ x: swingIdx, y: swingLevel, label: isBearish ? 'BOS' : 'BOS' }],
    lines: [{
      start: { x: s, y: swingLevel },
      end: { x: extend, y: swingLevel },
      style: 'solid',
    }],
    breakoutLevel: swingLevel,
    invalidationLevel: isBearish
      ? Math.max(...ohlc.slice(s, e + 1).map(c => c.high))
      : Math.min(...ohlc.slice(s, e + 1).map(c => c.low)),
  };
}

function buildNR7Geometry(ohlc: OHLC[], pattern: PatternResult): PatternGeometry {
  const e = pattern.endIndex;
  const candle = ohlc[e];
  const s = Math.max(0, e - 6);
  const rangeHigh = candle.high;
  const rangeLow = candle.low;
  const extend = Math.min(e + 5, ohlc.length - 1);

  return {
    points: [{ x: e, y: (rangeHigh + rangeLow) / 2, label: 'NR7' }],
    lines: [
      { start: { x: s, y: rangeHigh }, end: { x: extend, y: rangeHigh }, style: 'dashed' },
      { start: { x: s, y: rangeLow }, end: { x: extend, y: rangeLow }, style: 'dashed' },
    ],
    breakoutLevel: rangeHigh,
    invalidationLevel: rangeLow,
  };
}

function buildVolatilitySqueezeGeometry(ohlc: OHLC[], pattern: PatternResult): PatternGeometry {
  const s = pattern.startIndex;
  const e = pattern.endIndex;
  const rangeHigh = Math.max(...ohlc.slice(s, e + 1).map(c => c.high));
  const rangeLow = Math.min(...ohlc.slice(s, e + 1).map(c => c.low));
  const extend = Math.min(e + 5, ohlc.length - 1);

  return {
    points: [{ x: Math.round((s + e) / 2), y: (rangeHigh + rangeLow) / 2, label: 'Squeeze' }],
    lines: [
      { start: { x: s, y: rangeHigh }, end: { x: extend, y: rangeHigh }, style: 'dashed' },
      { start: { x: s, y: rangeLow }, end: { x: extend, y: rangeLow }, style: 'dashed' },
    ],
    breakoutLevel: rangeHigh,
    invalidationLevel: rangeLow,
  };
}

function buildOrderBlockGeometry(ohlc: OHLC[], pattern: PatternResult): PatternGeometry {
  const e = pattern.endIndex;
  const candle = ohlc[e];
  const isBullish = pattern.type === 'bullish';
  const zoneHigh = candle.high;
  const zoneLow = candle.low;
  const extend = Math.min(e + 5, ohlc.length - 1);

  const points: GeometryPoint[] = [
    { x: Math.round((e + extend) / 2), y: (zoneHigh + zoneLow) / 2, label: 'OB' },
  ];

  const lines: GeometryLine[] = [
    { start: { x: e, y: zoneHigh }, end: { x: extend, y: zoneHigh }, style: 'dashed' },
    { start: { x: e, y: zoneLow }, end: { x: extend, y: zoneLow }, style: 'dashed' },
    { start: { x: e, y: zoneHigh }, end: { x: e, y: zoneLow }, style: 'solid' },
    { start: { x: extend, y: zoneHigh }, end: { x: extend, y: zoneLow }, style: 'solid' },
  ];

  return {
    points,
    lines,
    breakoutLevel: isBullish ? zoneHigh : zoneLow,
    invalidationLevel: isBullish ? zoneLow : zoneHigh,
    fill: {
      points: [
        { x: e, y: zoneHigh },
        { x: extend, y: zoneHigh },
        { x: extend, y: zoneLow },
        { x: e, y: zoneLow },
      ],
      opacity: 0.15,
    },
  };
}

function buildBreakerBlockGeometry(ohlc: OHLC[], pattern: PatternResult): PatternGeometry {
  const e = pattern.endIndex;
  const candle = ohlc[e];
  const isBullish = pattern.type === 'bullish';
  const zoneHigh = candle.high;
  const zoneLow = candle.low;
  const extend = Math.min(e + 5, ohlc.length - 1);

  const points: GeometryPoint[] = [
    { x: Math.round((e + extend) / 2), y: (zoneHigh + zoneLow) / 2, label: 'Breaker' },
  ];

  const lines: GeometryLine[] = [
    { start: { x: e, y: zoneHigh }, end: { x: extend, y: zoneHigh }, style: 'solid' },
    { start: { x: e, y: zoneLow }, end: { x: extend, y: zoneLow }, style: 'solid' },
    { start: { x: e, y: zoneHigh }, end: { x: e, y: zoneLow }, style: 'dashed' },
    { start: { x: extend, y: zoneHigh }, end: { x: extend, y: zoneLow }, style: 'dashed' },
  ];

  return {
    points,
    lines,
    breakoutLevel: isBullish ? zoneHigh : zoneLow,
    invalidationLevel: isBullish ? zoneLow : zoneHigh,
    fill: {
      points: [
        { x: e, y: zoneHigh },
        { x: extend, y: zoneHigh },
        { x: extend, y: zoneLow },
        { x: e, y: zoneLow },
      ],
      opacity: 0.1,
    },
  };
}

function buildLiquiditySweepGeometry(ohlc: OHLC[], pattern: PatternResult): PatternGeometry {
  const e = pattern.endIndex;
  const name = pattern.name.toLowerCase();
  const isHigh = name.includes('high') || pattern.type === 'bearish';
  const isGrab = name.includes('grab');
  const candle = ohlc[e];
  const sweepLevel = isHigh ? candle.high : candle.low;
  const extend = Math.min(e + 10, ohlc.length - 1);

  const points: GeometryPoint[] = [
    { x: e, y: sweepLevel, label: isGrab ? 'Grab' : 'Sweep' },
  ];

  const lines: GeometryLine[] = [
    { start: { x: Math.max(0, e - 3), y: sweepLevel }, end: { x: extend, y: sweepLevel }, style: 'dashed' },
  ];

  return {
    points,
    lines,
    breakoutLevel: isHigh ? sweepLevel : null,
    invalidationLevel: isHigh ? null : sweepLevel,
  };
}

function buildBOSCHOCHGeometry(ohlc: OHLC[], pattern: PatternResult): PatternGeometry {
  const s = pattern.startIndex;
  const e = pattern.endIndex;
  const name = pattern.name.toLowerCase();
  const isBearish = pattern.type === 'bearish';
  const isCHOCH = name.includes('choch');

  const swingLevel = isBearish
    ? Math.min(...ohlc.slice(s, e + 1).map(c => c.low))
    : Math.max(...ohlc.slice(s, e + 1).map(c => c.high));

  const swingIdx = isBearish
    ? s + ohlc.slice(s, e + 1).findIndex(c => c.low === swingLevel)
    : s + ohlc.slice(s, e + 1).findIndex(c => c.high === swingLevel);

  const extend = Math.min(e + 10, ohlc.length - 1);
  const label = isCHOCH ? 'CHOCH' : 'BOS';

  const points: GeometryPoint[] = [
    { x: swingIdx, y: swingLevel, label },
    { x: e, y: isBearish ? ohlc[e].low : ohlc[e].high, label: '' },
  ];

  const lines: GeometryLine[] = [
    { start: { x: s, y: swingLevel }, end: { x: extend, y: swingLevel }, style: 'solid' },
    { start: { x: e, y: swingLevel }, end: { x: e, y: isBearish ? ohlc[e].low : ohlc[e].high }, style: 'dashed' },
  ];

  return {
    points,
    lines,
    breakoutLevel: swingLevel,
    invalidationLevel: isBearish
      ? Math.max(...ohlc.slice(s, e + 1).map(c => c.high))
      : Math.min(...ohlc.slice(s, e + 1).map(c => c.low)),
  };
}

function buildSwingPointGeometry(ohlc: OHLC[], pattern: PatternResult): PatternGeometry {
  const name = pattern.name.toLowerCase();
  const e = pattern.endIndex;
  const s = pattern.startIndex;

  const points: GeometryPoint[] = [];

  if (name.includes('higher high') && name.includes('higher low')) {
    const hh = Math.max(...ohlc.slice(s, e + 1).map(c => c.high));
    const hhIdx = s + ohlc.slice(s, e + 1).findIndex(c => c.high === hh);
    const hl = Math.min(...ohlc.slice(s, e + 1).map(c => c.low));
    const hlIdx = s + ohlc.slice(s, e + 1).findIndex(c => c.low === hl);
    points.push({ x: hhIdx, y: hh, label: 'HH' });
    points.push({ x: hlIdx, y: hl, label: 'HL' });
  } else if (name.includes('lower high') && name.includes('lower low')) {
    const lh = Math.max(...ohlc.slice(s, e + 1).map(c => c.high));
    const lhIdx = s + ohlc.slice(s, e + 1).findIndex(c => c.high === lh);
    const ll = Math.min(...ohlc.slice(s, e + 1).map(c => c.low));
    const llIdx = s + ohlc.slice(s, e + 1).findIndex(c => c.low === ll);
    points.push({ x: lhIdx, y: lh, label: 'LH' });
    points.push({ x: llIdx, y: ll, label: 'LL' });
  }

  const maxPrice = Math.max(...ohlc.slice(s, e + 1).map(c => c.high));
  const minPrice = Math.min(...ohlc.slice(s, e + 1).map(c => c.low));

  return {
    points,
    lines: [],
    breakoutLevel: pattern.type === 'bullish' ? maxPrice : minPrice,
    invalidationLevel: pattern.type === 'bullish' ? minPrice : maxPrice,
  };
}

function buildVolumeClimaxGeometry(ohlc: OHLC[], pattern: PatternResult): PatternGeometry {
  const e = pattern.endIndex;
  const candle = ohlc[e];
  const isBullish = pattern.type === 'bullish';
  const climaxLevel = isBullish ? candle.high : candle.low;
  const extend = Math.min(e + 10, ohlc.length - 1);

  const points: GeometryPoint[] = [
    { x: e, y: climaxLevel, label: 'Climax' },
  ];

  const lines: GeometryLine[] = [
    { start: { x: e, y: climaxLevel }, end: { x: extend, y: climaxLevel }, style: 'solid' },
  ];

  return {
    points,
    lines,
    breakoutLevel: isBullish ? candle.high : candle.low,
    invalidationLevel: isBullish ? candle.low : candle.high,
  };
}

function buildEMACompressionGeometry(ohlc: OHLC[], pattern: PatternResult): PatternGeometry {
  const s = pattern.startIndex;
  const e = pattern.endIndex;
  const isBullish = pattern.type === 'bullish';
  const rangeHigh = Math.max(...ohlc.slice(s, e + 1).map(c => c.high));
  const rangeLow = Math.min(...ohlc.slice(s, e + 1).map(c => c.low));

  const points: GeometryPoint[] = [
    { x: e, y: isBullish ? ohlc[e].high : ohlc[e].low, label: 'Snap' },
    { x: Math.round((s + e) / 2), y: (rangeHigh + rangeLow) / 2, label: 'EMA Compress' },
  ];

  const lines: GeometryLine[] = [
    { start: { x: s, y: rangeHigh }, end: { x: e, y: rangeHigh }, style: 'dashed' },
    { start: { x: s, y: rangeLow }, end: { x: e, y: rangeLow }, style: 'dashed' },
  ];

  return {
    points,
    lines,
    breakoutLevel: isBullish ? rangeHigh : rangeLow,
    invalidationLevel: isBullish ? rangeLow : rangeHigh,
    fill: {
      points: [
        { x: s, y: rangeHigh },
        { x: e, y: rangeHigh },
        { x: e, y: rangeLow },
        { x: s, y: rangeLow },
      ],
      opacity: 0.1,
    },
  };
}

function buildVWAPReversalGeometry(ohlc: OHLC[], pattern: PatternResult): PatternGeometry {
  const e = pattern.endIndex;
  const s = pattern.startIndex;
  const isBullish = pattern.type === 'bullish';
  const candle = ohlc[e];
  const vwapLevel = (candle.high + candle.low + candle.close) / 3;
  const extend = Math.min(e + 10, ohlc.length - 1);

  const points: GeometryPoint[] = [
    { x: e, y: isBullish ? candle.close : candle.close, label: isBullish ? 'Reclaim' : 'Loss' },
  ];

  const lines: GeometryLine[] = [
    { start: { x: Math.max(0, s), y: vwapLevel }, end: { x: extend, y: vwapLevel }, style: 'dashed' },
  ];

  return {
    points,
    lines,
    breakoutLevel: isBullish ? candle.high : candle.low,
    invalidationLevel: isBullish ? candle.low : candle.high,
  };
}

function buildInsideOutsideBarGeometry(ohlc: OHLC[], pattern: PatternResult): PatternGeometry {
  const e = pattern.endIndex;
  const s = Math.max(0, e - 1);
  const motherCandle = ohlc[s];
  const insideCandle = ohlc[e];
  if (!motherCandle || !insideCandle) return { points: [], lines: [], breakoutLevel: null, invalidationLevel: null };

  const isInside = pattern.name.toLowerCase().includes('inside');
  const outerHigh = isInside ? motherCandle.high : insideCandle.high;
  const outerLow = isInside ? motherCandle.low : insideCandle.low;

  const points: GeometryPoint[] = [
    { x: e, y: insideCandle.close, label: isInside ? 'Inside' : 'Outside' },
  ];

  const lines: GeometryLine[] = [
    { start: { x: s, y: outerHigh }, end: { x: Math.min(e + 3, ohlc.length - 1), y: outerHigh }, style: 'dashed' },
    { start: { x: s, y: outerLow }, end: { x: Math.min(e + 3, ohlc.length - 1), y: outerLow }, style: 'dashed' },
  ];

  return {
    points,
    lines,
    breakoutLevel: outerHigh,
    invalidationLevel: outerLow,
  };
}

function buildMarubozuGeometry(ohlc: OHLC[], pattern: PatternResult): PatternGeometry {
  const e = pattern.endIndex;
  const candle = ohlc[e];
  if (!candle) return { points: [], lines: [], breakoutLevel: null, invalidationLevel: null };

  const isBullish = pattern.type === 'bullish' || candle.close > candle.open;

  const points: GeometryPoint[] = [
    { x: e, y: isBullish ? candle.high : candle.low, label: 'Marubozu' },
  ];

  return {
    points,
    lines: [],
    breakoutLevel: isBullish ? candle.high : null,
    invalidationLevel: isBullish ? candle.low : candle.high,
  };
}

function buildGapGeometry(ohlc: OHLC[], pattern: PatternResult): PatternGeometry {
  const e = pattern.endIndex;
  const s = Math.max(0, e - 1);
  const prevCandle = ohlc[s];
  const gapCandle = ohlc[e];
  if (!prevCandle || !gapCandle) return { points: [], lines: [], breakoutLevel: null, invalidationLevel: null };

  const isUp = pattern.name.toLowerCase().includes('up');
  const gapTop = isUp ? gapCandle.low : prevCandle.low;
  const gapBottom = isUp ? prevCandle.high : gapCandle.high;
  const extend = Math.min(e + 5, ohlc.length - 1);

  const lines: GeometryLine[] = [
    { start: { x: s, y: gapTop }, end: { x: extend, y: gapTop }, style: 'dashed' },
    { start: { x: s, y: gapBottom }, end: { x: extend, y: gapBottom }, style: 'dashed' },
  ];

  const points: GeometryPoint[] = [
    { x: e, y: (gapTop + gapBottom) / 2, label: isUp ? 'Gap Up' : 'Gap Down' },
  ];

  return {
    points,
    lines,
    breakoutLevel: null,
    invalidationLevel: null,
    fill: {
      points: [
        { x: s, y: gapTop },
        { x: extend, y: gapTop },
        { x: extend, y: gapBottom },
        { x: s, y: gapBottom },
      ],
      opacity: 0.08,
    },
  };
}

function buildSwingFailureGeometry(ohlc: OHLC[], pattern: PatternResult): PatternGeometry {
  const e = pattern.endIndex;
  const s = pattern.startIndex;
  const slice = ohlc.slice(s, e + 1);
  if (slice.length === 0) return { points: [], lines: [], breakoutLevel: null, invalidationLevel: null };

  const isBullish = pattern.type === 'bullish';
  const swingLevel = isBullish ? Math.min(...slice.map(c => c.low)) : Math.max(...slice.map(c => c.high));
  const failCandle = ohlc[e];
  const extend = Math.min(e + 5, ohlc.length - 1);

  const points: GeometryPoint[] = [
    { x: e, y: failCandle.close, label: 'SFP' },
  ];

  const lines: GeometryLine[] = [
    { start: { x: s, y: swingLevel }, end: { x: extend, y: swingLevel }, style: 'dashed' },
  ];

  return {
    points,
    lines,
    breakoutLevel: isBullish ? failCandle.high : failCandle.low,
    invalidationLevel: swingLevel,
  };
}

function buildBreakoutFailureReversalGeometry(ohlc: OHLC[], pattern: PatternResult): PatternGeometry {
  const e = pattern.endIndex;
  const s = pattern.startIndex;
  const slice = ohlc.slice(s, e + 1);
  if (slice.length === 0) return { points: [], lines: [], breakoutLevel: null, invalidationLevel: null };

  const isBullish = pattern.type === 'bullish';
  const breakoutLevel = isBullish ? Math.max(...slice.map(c => c.high)) : Math.min(...slice.map(c => c.low));
  const failCandle = ohlc[e];
  const extend = Math.min(e + 5, ohlc.length - 1);

  const points: GeometryPoint[] = [
    { x: s, y: breakoutLevel, label: 'Breakout' },
    { x: e, y: failCandle.close, label: 'BFR' },
  ];

  const lines: GeometryLine[] = [
    { start: { x: Math.max(0, s - 3), y: breakoutLevel }, end: { x: extend, y: breakoutLevel }, style: 'dashed' },
  ];

  return {
    points,
    lines,
    breakoutLevel: isBullish ? failCandle.high : failCandle.low,
    invalidationLevel: breakoutLevel,
  };
}

function buildSpinningTopDojiGeometry(ohlc: OHLC[], pattern: PatternResult): PatternGeometry {
  const e = pattern.endIndex;
  const candle = ohlc[e];
  if (!candle) return { points: [], lines: [], breakoutLevel: null, invalidationLevel: null };

  const isDoji = pattern.name.toLowerCase().includes('doji');
  const label = isDoji ? 'Doji' : 'Spin';

  const points: GeometryPoint[] = [
    { x: e, y: candle.close, label },
  ];

  return {
    points,
    lines: [],
    breakoutLevel: candle.high,
    invalidationLevel: candle.low,
  };
}

function buildGeometryForPattern(ohlc: OHLC[], pattern: PatternResult, timeframe = "5m"): PatternGeometry {
  const name = pattern.name.toLowerCase();

  if (isCandlestickPattern(name)) return buildCandlestickMarkerGeometry(ohlc, pattern);

  if (name.includes('order block')) return buildOrderBlockGeometry(ohlc, pattern);
  if (name.includes('breaker block')) return buildBreakerBlockGeometry(ohlc, pattern);

  if (name.includes('liquidity sweep') || name.includes('liquidity grab')) return buildLiquiditySweepGeometry(ohlc, pattern);

  if (name.includes('bos') && !name.includes('broadening')) return buildBOSCHOCHGeometry(ohlc, pattern);
  if (name.includes('choch') || name.includes('change of character')) return buildBOSCHOCHGeometry(ohlc, pattern);

  if (name.includes('higher high') || name.includes('lower high') ||
      name.includes('higher low') || name.includes('lower low')) return buildSwingPointGeometry(ohlc, pattern);

  if (name.includes('volume climax')) return buildVolumeClimaxGeometry(ohlc, pattern);
  if (name.includes('ema compression')) return buildEMACompressionGeometry(ohlc, pattern);
  if (name.includes('vwap reversal')) return buildVWAPReversalGeometry(ohlc, pattern);

  if (name.includes('swing failure')) return buildSwingFailureGeometry(ohlc, pattern);
  if (name.includes('breakout failure')) return buildBreakoutFailureReversalGeometry(ohlc, pattern);

  if (name === 'inside bar' || name === 'outside bar') return buildInsideOutsideBarGeometry(ohlc, pattern);
  if (name.includes('marubozu')) return buildMarubozuGeometry(ohlc, pattern);
  if (name === 'spinning top' || name === 'doji') return buildSpinningTopDojiGeometry(ohlc, pattern);
  if (name === 'gap up' || name === 'gap down') return buildGapGeometry(ohlc, pattern);

  if (name.includes('break of structure')) return buildBreakOfStructureGeometry(ohlc, pattern);
  if (name === 'nr7') return buildNR7Geometry(ohlc, pattern);
  if (name.includes('volatility squeeze')) return buildVolatilitySqueezeGeometry(ohlc, pattern);

  if (name.includes('triple top')) return buildTripleTopGeometry(ohlc, pattern, timeframe);
  if (name.includes('triple bottom')) return buildTripleBottomGeometry(ohlc, pattern, timeframe);
  if (name.includes('double top')) return buildDoubleTopGeometry(ohlc, pattern, timeframe);
  if (name.includes('double bottom')) return buildDoubleBottomGeometry(ohlc, pattern, timeframe);
  if (name.includes('head and shoulders') && !name.includes('inverse')) return buildHeadAndShouldersGeometry(ohlc, pattern, timeframe);
  if (name.includes('inverse head')) return buildInverseHeadAndShouldersGeometry(ohlc, pattern, timeframe);
  if (name.includes('flag') || name.includes('pennant')) return buildFlagGeometry(ohlc, pattern, timeframe);

  if (name.includes('rounded top')) return buildRoundedTopGeometry(ohlc, pattern, timeframe);
  if (name.includes('rounded bottom')) return buildRoundedBottomGeometry(ohlc, pattern, timeframe);

  if (name.includes('wedge') || name.includes('triangle') || name.includes('channel') ||
      name.includes('cup') || name.includes('broadening') || name.includes('megaphone')) {
    return buildTwoTrendlineGeometry(ohlc, pattern, 5, timeframe);
  }

  return buildCandlestickGeometry(ohlc, pattern);
}

export function convertToDrawablePatterns(
  patterns: PatternResult[],
  ohlc: OHLC[],
  timeframe = "5m"
): DrawablePattern[] {
  if (!ohlc || ohlc.length === 0) return [];

  const alwaysExclude = new Set<string>([
  ]);

  const singleCandlePatterns = new Set<string>([
  ]);

  return patterns
    .filter(p => {
      const span = p.endIndex - p.startIndex;
      const name = p.name.toLowerCase();
      if (alwaysExclude.has(name)) return false;
      if (singleCandlePatterns.has(name) && span < 3) return false;
      return true;
    })
    .map((pattern, idx) => {
      const safePattern = {
        ...pattern,
        startIndex: Math.max(0, Math.min(pattern.startIndex, ohlc.length - 1)),
        endIndex: Math.max(0, Math.min(pattern.endIndex, ohlc.length - 1)),
      };

      // 3. Momentum Check (MG) - Integrate actual RSI if available
      const rsiValue = (pattern as any).rsiValue; 

      const geometry = buildGeometryForPattern(ohlc, safePattern, timeframe);
      const lifecycle = deriveLifecycle(safePattern, ohlc, geometry.breakoutLevel, geometry.invalidationLevel);

      const validCategory = ['candlestick', 'classical', 'continuation', 'reversal', 'breakout', 'structure', 'volatility', 'gap', 'liquidity'].includes(pattern.category)
        ? pattern.category as DrawablePattern['category']
        : 'classical';

      const bv = (lifecycle === 'breaking' && geometry.breakoutLevel !== null)
        ? validateBreakout(safePattern, ohlc, geometry.breakoutLevel, rsiValue)
        : undefined;

      return {
        id: `${pattern.name.replace(/\s+/g, '_').toLowerCase()}_${idx}`,
        name: pattern.name,
        type: pattern.type,
        category: validCategory,
        confidence: pattern.confidence,
        lifecycle: (lifecycle === 'breaking' && bv && !bv.confirmed) ? 'valid' as PatternLifecycle : lifecycle,
        geometry,
        startIndex: safePattern.startIndex,
        endIndex: safePattern.endIndex,
        pt1: pattern.pt1,
        pt2: pattern.pt2,
        stopLoss: pattern.stopLoss,
        breakoutValidation: bv,
      };
    })
    .filter(p => p.lifecycle !== 'failed' && p.lifecycle !== 'expired');
}
