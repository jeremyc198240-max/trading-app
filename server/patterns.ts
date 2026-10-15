interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time?: number;
}

export interface PatternResult {
  name: string;
  type: 'bullish' | 'bearish' | 'neutral';
  category: 'candlestick' | 'classical' | 'continuation' | 'reversal' | 'breakout' | 'structure' | 'volatility' | 'gap' | 'liquidity';
  confidence: number;
  description: string;
  startIndex: number;
  endIndex: number;
  priceTarget?: number;
  pt1?: number;
  pt2?: number;
  stopLoss?: number;
  confirmationTF?: string;
  strengthWeight?: number;
}

/* =========================
   Core helpers
   ========================= */

function bodySize(c: OHLC): number {
  return Math.abs(c.close - c.open);
}

function totalRange(c: OHLC): number {
  return c.high - c.low;
}

function upperWick(c: OHLC): number {
  return c.high - Math.max(c.open, c.close);
}

function lowerWick(c: OHLC): number {
  return Math.min(c.open, c.close) - c.low;
}

function isBullish(c: OHLC): boolean {
  return c.close > c.open;
}

function isBearish(c: OHLC): boolean {
  return c.close < c.open;
}

function avgBody(ohlc: OHLC[], lookback: number = 10): number {
  const slice = ohlc.slice(-lookback);
  if (!slice.length) return 0;
  return slice.reduce((sum, c) => sum + bodySize(c), 0) / slice.length;
}

function avgRange(ohlc: OHLC[], lookback: number = 10): number {
  const slice = ohlc.slice(-lookback);
  if (!slice.length) return 0;
  return slice.reduce((sum, c) => sum + totalRange(c), 0) / slice.length;
}

export function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function computeATR5(ohlc: OHLC[]): number {
  if (ohlc.length < 6) return avgRange(ohlc);
  let sum = 0;
  for (let i = ohlc.length - 5; i < ohlc.length; i++) {
    const prev = ohlc[i - 1];
    const curr = ohlc[i];
    const tr = Math.max(curr.high - curr.low, Math.abs(curr.high - prev.close), Math.abs(curr.low - prev.close));
    sum += tr;
  }
  return sum / 5;
}

function nearestSwingHigh(ohlc: OHLC[], lookback: number = 10): number {
  const slice = ohlc.slice(-lookback);
  return Math.max(...slice.map(c => c.high));
}

function nearestSwingLow(ohlc: OHLC[], lookback: number = 10): number {
  const slice = ohlc.slice(-lookback);
  return Math.min(...slice.map(c => c.low));
}

function trendSlope(ohlc: OHLC[], length: number): number {
  if (ohlc.length < 2) return 0;
  const slice = ohlc.slice(-length);
  if (slice.length < 2) return 0;
  const n = slice.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    const x = i;
    const y = slice[i].close;
    sumX += x;
    sumY += y;
    sumXY += x * y;
    sumX2 += x * x;
  }
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

function inferTrendBias(ohlc: OHLC[]): 'bullish' | 'bearish' | 'neutral' {
  if (ohlc.length < 6) return 'neutral';

  const baseline = ohlc.length > 12 ? ohlc.slice(0, -1) : ohlc;
  const short = trendSlope(baseline, 10);
  const mid = trendSlope(baseline, 30);

  const rangeNorm = avgRange(baseline, Math.min(20, baseline.length)) || avgRange(baseline, 10) || 1;
  const shortNorm = short / rangeNorm;
  const midNorm = mid / rangeNorm;
  const threshold = 0.03;

  if (shortNorm > threshold && midNorm > threshold) return 'bullish';
  if (shortNorm < -threshold && midNorm < -threshold) return 'bearish';
  return 'neutral';
}

function avgVolume(ohlc: OHLC[], lookback: number = 20): number {
  const slice = ohlc.slice(-lookback);
  if (!slice.length) return 0;
  return slice.reduce((sum, c) => sum + c.volume, 0) / slice.length;
}

function computeVWAP(ohlc: OHLC[]): number {
  if (!ohlc.length) return 0;
  let pvSum = 0;
  let vSum = 0;
  for (const c of ohlc) {
    const typical = (c.high + c.low + c.close) / 3;
    pvSum += typical * c.volume;
    vSum += c.volume;
  }
  return vSum === 0 ? ohlc[ohlc.length - 1].close : pvSum / vSum;
}

function ema(values: number[], length: number): number {
  if (!values.length) return 0;
  const k = 2 / (length + 1);
  let emaVal = values[0];
  for (let i = 1; i < values.length; i++) {
    emaVal = values[i] * k + emaVal * (1 - k);
  }
  return emaVal;
}

/* =========================
   Local extrema helpers
   ========================= */

function findLocalMaxima(ohlc: OHLC[], lookback: number = 5): number[] {
  const maxima: number[] = [];
  for (let i = lookback; i < ohlc.length - lookback; i++) {
    let isMax = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && ohlc[j].high >= ohlc[i].high) {
        isMax = false;
        break;
      }
    }
    if (isMax) maxima.push(i);
  }
  return maxima;
}

function findLocalMinima(ohlc: OHLC[], lookback: number = 5): number[] {
  const minima: number[] = [];
  for (let i = lookback; i < ohlc.length - lookback; i++) {
    let isMin = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j !== i && ohlc[j].low <= ohlc[i].low) {
        isMin = false;
        break;
      }
    }
    if (isMin) minima.push(i);
  }
  return minima;
}

function calculateTrendline(points: { x: number; y: number }[]): { slope: number; intercept: number } {
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

/* =========================
   Candlestick patterns
   ========================= */

export function detectHammer(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 5) return null;
  const i = ohlc.length - 1;
  const c = ohlc[i];
  const range = totalRange(c);
  if (range < 0.001) return null;

  const body = bodySize(c);
  const lower = lowerWick(c);
  const upper = upperWick(c);

  const isHammer = lower >= body * 2 && upper < body * 0.5 && body / range < 0.4;
  const trend = inferTrendBias(ohlc);
  const inDowntrend = trend === 'bearish';

  if (isHammer && inDowntrend) {
    return {
      name: 'Hammer',
      type: 'bullish',
      category: 'candlestick',
      confidence: 75,
      description: 'Bullish reversal signal with long lower wick after a decline',
      startIndex: i,
      endIndex: i,
      pt1: c.high + range * 0.5,
      pt2: c.high + range,
      stopLoss: c.low,
      strengthWeight: 75 / 100
    };
  }
  return null;
}

export function detectHangingMan(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 5) return null;
  const i = ohlc.length - 1;
  const c = ohlc[i];
  const range = totalRange(c);
  if (range < 0.001) return null;

  const body = bodySize(c);
  const lower = lowerWick(c);
  const upper = upperWick(c);

  const isHM = lower >= body * 2 && upper < body * 0.5 && body / range < 0.4;
  const trend = inferTrendBias(ohlc);
  const inUptrend = trend === 'bullish';

  if (isHM && inUptrend) {
    return {
      name: 'Hanging Man',
      type: 'bearish',
      category: 'candlestick',
      confidence: 70,
      description: 'Bearish reversal signal with long lower shadow at the top of an uptrend',
      startIndex: i,
      endIndex: i,
      pt1: c.low - range * 0.5,
      pt2: c.low - range,
      stopLoss: c.high,
      strengthWeight: 70 / 100
    };
  }
  return null;
}

export function detectInvertedHammer(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 5) return null;
  const i = ohlc.length - 1;
  const c = ohlc[i];

  const range = totalRange(c);
  if (range < 0.001) return null;

  const body = bodySize(c);
  const upper = upperWick(c);
  const lower = lowerWick(c);

  const isInvertedHammer =
    upper >= body * 2 &&
    lower < body * 0.5 &&
    body / range < 0.4;

  const trend = inferTrendBias(ohlc);
  const inDowntrend = trend === 'bearish';

  if (isInvertedHammer && inDowntrend) {
    return {
      name: 'Inverted Hammer',
      type: 'bullish',
      category: 'candlestick',
      confidence: 70,
      description: 'Bullish reversal signal with long upper wick after a decline',
      startIndex: i,
      endIndex: i,
      pt1: c.high + range * 0.5,
      pt2: c.high + range,
      stopLoss: c.low,
      strengthWeight: 70 / 100
    };
  }

  return null;
}

export function detectShootingStar(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 5) return null;
  const i = ohlc.length - 1;
  const c = ohlc[i];

  const range = totalRange(c);
  if (range < 0.001) return null;

  const body = bodySize(c);
  const upper = upperWick(c);
  const lower = lowerWick(c);

  const isShootingStar =
    upper >= body * 2 &&
    lower < body * 0.5 &&
    body / range < 0.4;

  const trend = inferTrendBias(ohlc);
  const inUptrend = trend === 'bullish';

  if (isShootingStar && inUptrend) {
    return {
      name: 'Shooting Star',
      type: 'bearish',
      category: 'candlestick',
      confidence: 70,
      description: 'Bearish reversal signal with long upper wick at the top of an uptrend',
      startIndex: i,
      endIndex: i,
      pt1: c.low - range * 0.5,
      pt2: c.low - range,
      stopLoss: c.high,
      strengthWeight: 70 / 100
    };
  }

  return null;
}

export function detectBullishBeltHold(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 3) return null;
  const i = ohlc.length - 1;
  const c = ohlc[i];

  const range = totalRange(c);
  if (range < 0.001) return null;

  const body = bodySize(c);
  const upper = upperWick(c);

  const opensAtLow = Math.abs(c.open - c.low) < range * 0.05;
  const strongBody = body / range > 0.6;

  const isBeltHold =
    isBullish(c) &&
    opensAtLow &&
    upper < body * 0.3 &&
    strongBody;

  const trend = inferTrendBias(ohlc);
  const inDowntrend = trend === 'bearish';

  if (isBeltHold && inDowntrend) {
    return {
      name: 'Bullish Belt Hold',
      type: 'bullish',
      category: 'candlestick',
      confidence: 75,
      description: 'Bullish reversal - opens at low and drives upward with strong body',
      startIndex: i,
      endIndex: i,
      pt1: c.high + range * 0.5,
      pt2: c.high + range,
      stopLoss: c.low,
      strengthWeight: 75 / 100
    };
  }

  return null;
}

export function detectBearishBeltHold(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 3) return null;
  const i = ohlc.length - 1;
  const c = ohlc[i];

  const range = totalRange(c);
  if (range < 0.001) return null;

  const body = bodySize(c);
  const lower = lowerWick(c);

  const opensAtHigh = Math.abs(c.open - c.high) < range * 0.05;
  const strongBody = body / range > 0.6;

  const isBeltHold =
    isBearish(c) &&
    opensAtHigh &&
    lower < body * 0.3 &&
    strongBody;

  const trend = inferTrendBias(ohlc);
  const inUptrend = trend === 'bullish';

  if (isBeltHold && inUptrend) {
    return {
      name: 'Bearish Belt Hold',
      type: 'bearish',
      category: 'candlestick',
      confidence: 75,
      description: 'Bearish reversal - opens at high and sells off with strong body',
      startIndex: i,
      endIndex: i,
      pt1: c.low - range * 0.5,
      pt2: c.low - range,
      stopLoss: c.high,
      strengthWeight: 75 / 100
    };
  }

  return null;
}

export function detectThreeInsideUp(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 4) return null;
  const i = ohlc.length - 1;
  const first = ohlc[i - 2];
  const second = ohlc[i - 1];
  const third = ohlc[i];

  const avgB = avgBody(ohlc.slice(0, -1));
  const firstStrongBearish = isBearish(first) && bodySize(first) > avgB * 0.8;

  const secondSmall = bodySize(second) < avgB * 0.6;
  const secondBullish = isBullish(second);
  const secondInside =
    Math.max(second.open, second.close) < Math.max(first.open, first.close) &&
    Math.min(second.open, second.close) > Math.min(first.open, first.close);

  const thirdBullish = isBullish(third);
  const firstMid = (first.open + first.close) / 2;
  const thirdClosesAboveMid = third.close > firstMid;

  const trend = inferTrendBias(ohlc);
  const inDowntrend = trend === 'bearish';

  if (firstStrongBearish && secondSmall && secondBullish && secondInside && thirdBullish && thirdClosesAboveMid && inDowntrend) {
    return {
      name: 'Three Inside Up',
      type: 'bullish',
      category: 'candlestick',
      confidence: 75,
      description: 'Bullish reversal - small bullish candle inside prior bearish, followed by strong bullish confirmation',
      startIndex: i - 2,
      endIndex: i,
      pt1: Math.max(first.high, second.high, third.high),
      pt2: Math.max(first.high, second.high, third.high) + (Math.max(first.high, second.high, third.high) - Math.min(first.low, second.low, third.low)),
      stopLoss: Math.min(first.low, second.low, third.low),
      strengthWeight: 75 / 100
    };
  }

  return null;
}

export function detectThreeInsideDown(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 4) return null;
  const i = ohlc.length - 1;
  const first = ohlc[i - 2];
  const second = ohlc[i - 1];
  const third = ohlc[i];

  const avgB = avgBody(ohlc.slice(0, -1));
  const firstStrongBullish = isBullish(first) && bodySize(first) > avgB * 0.8;

  const secondSmall = bodySize(second) < avgB * 0.6;
  const secondBearish = isBearish(second);
  const secondInside =
    Math.max(second.open, second.close) < Math.max(first.open, first.close) &&
    Math.min(second.open, second.close) > Math.min(first.open, first.close);

  const thirdBearish = isBearish(third);
  const firstMid = (first.open + first.close) / 2;
  const thirdClosesBelowMid = third.close < firstMid;

  const trend = inferTrendBias(ohlc);
  const inUptrend = trend === 'bullish';

  if (firstStrongBullish && secondSmall && secondBearish && secondInside && thirdBearish && thirdClosesBelowMid && inUptrend) {
    return {
      name: 'Three Inside Down',
      type: 'bearish',
      category: 'candlestick',
      confidence: 75,
      description: 'Bearish reversal - small bearish candle inside prior bullish, followed by strong bearish confirmation',
      startIndex: i - 2,
      endIndex: i,
      pt1: Math.min(first.low, second.low, third.low),
      pt2: Math.min(first.low, second.low, third.low) - (Math.max(first.high, second.high, third.high) - Math.min(first.low, second.low, third.low)),
      stopLoss: Math.max(first.high, second.high, third.high),
      strengthWeight: 75 / 100
    };
  }

  return null;
}

export function detectThreeOutsideUp(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 5) return null;
  const i = ohlc.length - 1;
  const first = ohlc[i - 2];
  const second = ohlc[i - 1];
  const third = ohlc[i];

  const avg = avgBody(ohlc.slice(0, -1));
  const firstBearish = isBearish(first) && bodySize(first) > avg * 0.3;

  const secondBullish = isBullish(second) && bodySize(second) > avg * 0.8;
  const secondEngulfsFirst =
    second.open < first.close &&
    second.close > first.open;

  const thirdBullish = isBullish(third);
  const thirdClosesHigher = third.close > second.close;

  const trend = inferTrendBias(ohlc);
  const inDowntrend = trend === 'bearish';

  if (firstBearish && secondBullish && secondEngulfsFirst && thirdBullish && thirdClosesHigher && inDowntrend) {
    return {
      name: 'Three Outside Up',
      type: 'bullish',
      category: 'candlestick',
      confidence: 80,
      description: 'Bullish reversal - bullish engulfing followed by further bullish confirmation',
      startIndex: i - 2,
      endIndex: i,
      pt1: Math.max(first.high, second.high, third.high),
      pt2: Math.max(first.high, second.high, third.high) + (Math.max(first.high, second.high, third.high) - Math.min(first.low, second.low, third.low)),
      stopLoss: Math.min(first.low, second.low, third.low),
      strengthWeight: 80 / 100
    };
  }

  return null;
}

export function detectThreeOutsideDown(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 5) return null;
  const i = ohlc.length - 1;
  const first = ohlc[i - 2];
  const second = ohlc[i - 1];
  const third = ohlc[i];

  const avg = avgBody(ohlc.slice(0, -1));
  const firstBullish = isBullish(first) && bodySize(first) > avg * 0.3;

  const secondBearish = isBearish(second) && bodySize(second) > avg * 0.8;
  const secondEngulfsFirst =
    second.open > first.close &&
    second.close < first.open;

  const thirdBearish = isBearish(third);
  const thirdClosesLower = third.close < second.close;

  const trend = inferTrendBias(ohlc);
  const inUptrend = trend === 'bullish';

  if (firstBullish && secondBearish && secondEngulfsFirst && thirdBearish && thirdClosesLower && inUptrend) {
    return {
      name: 'Three Outside Down',
      type: 'bearish',
      category: 'candlestick',
      confidence: 80,
      description: 'Bearish reversal - bearish engulfing followed by further bearish confirmation',
      startIndex: i - 2,
      endIndex: i,
      pt1: Math.min(first.low, second.low, third.low),
      pt2: Math.min(first.low, second.low, third.low) - (Math.max(first.high, second.high, third.high) - Math.min(first.low, second.low, third.low)),
      stopLoss: Math.max(first.high, second.high, third.high),
      strengthWeight: 80 / 100
    };
  }

  return null;
}

export function detectBullishKicker(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 3) return null;
  const i = ohlc.length - 1;
  const prev = ohlc[i - 1];
  const curr = ohlc[i];

  const prevBearish = isBearish(prev);
  const currBullish = isBullish(curr);

  const gapUp = curr.open > prev.high;
  const strongBodyCurr = bodySize(curr) > avgBody(ohlc.slice(0, -1)) * 0.8;

  const trend = inferTrendBias(ohlc);
  const inDowntrend = trend === 'bearish';

  if (prevBearish && currBullish && gapUp && strongBodyCurr && inDowntrend) {
    return {
      name: 'Bullish Kicker',
      type: 'bullish',
      category: 'candlestick',
      confidence: 85,
      description: 'Powerful bullish reversal - sharp gap up from prior bearish candle with strong bullish follow-through',
      startIndex: i - 1,
      endIndex: i,
      pt1: Math.max(prev.high, curr.high),
      pt2: Math.max(prev.high, curr.high) + (Math.max(prev.high, curr.high) - Math.min(prev.low, curr.low)),
      stopLoss: Math.min(prev.low, curr.low),
      strengthWeight: 85 / 100
    };
  }

  return null;
}

export function detectBearishKicker(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 3) return null;
  const i = ohlc.length - 1;
  const prev = ohlc[i - 1];
  const curr = ohlc[i];

  const prevBullish = isBullish(prev);
  const currBearish = isBearish(curr);

  const gapDown = curr.open < prev.low;
  const strongBodyCurr = bodySize(curr) > avgBody(ohlc.slice(0, -1)) * 0.8;

  const trend = inferTrendBias(ohlc);
  const inUptrend = trend === 'bullish';

  if (prevBullish && currBearish && gapDown && strongBodyCurr && inUptrend) {
    return {
      name: 'Bearish Kicker',
      type: 'bearish',
      category: 'candlestick',
      confidence: 85,
      description: 'Powerful bearish reversal - sharp gap down from prior bullish candle with strong bearish follow-through',
      startIndex: i - 1,
      endIndex: i,
      pt1: Math.min(prev.low, curr.low),
      pt2: Math.min(prev.low, curr.low) - (Math.max(prev.high, curr.high) - Math.min(prev.low, curr.low)),
      stopLoss: Math.max(prev.high, curr.high),
      strengthWeight: 85 / 100
    };
  }

  return null;
}

export function detectBullishAbandonedBaby(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 4) return null;
  const i = ohlc.length - 1;
  const first = ohlc[i - 2];
  const middle = ohlc[i - 1];
  const last = ohlc[i];

  const rangeFirst = totalRange(first);
  const rangeMiddle = totalRange(middle);
  const rangeLast = totalRange(last);
  if (rangeFirst < 0.001 || rangeMiddle < 0.001 || rangeLast < 0.001) return null;

  const avgB = avgBody(ohlc.slice(0, -1));

  const firstBearish = isBearish(first) && bodySize(first) > avgB * 0.7;
  const middleDoji = bodySize(middle) / rangeMiddle < 0.1;
  const lastBullish = isBullish(last) && bodySize(last) > avgB * 0.7;

  const gapDown1 = middle.high < first.low;
  const gapUp2 = last.low > middle.high;

  const trend = inferTrendBias(ohlc);
  const inDowntrend = trend === 'bearish';

  if (firstBearish && middleDoji && lastBullish && gapDown1 && gapUp2 && inDowntrend) {
    return {
      name: 'Bullish Abandoned Baby',
      type: 'bullish',
      category: 'candlestick',
      confidence: 80,
      description: 'Bullish reversal - gap down doji isolated between bearish and bullish candles',
      startIndex: i - 2,
      endIndex: i,
      pt1: Math.max(first.high, middle.high, last.high),
      pt2: Math.max(first.high, middle.high, last.high) + (Math.max(first.high, middle.high, last.high) - Math.min(first.low, middle.low, last.low)),
      stopLoss: Math.min(first.low, middle.low, last.low),
      strengthWeight: 80 / 100
    };
  }

  return null;
}

export function detectBearishAbandonedBaby(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 4) return null;
  const i = ohlc.length - 1;
  const first = ohlc[i - 2];
  const middle = ohlc[i - 1];
  const last = ohlc[i];

  const rangeFirst = totalRange(first);
  const rangeMiddle = totalRange(middle);
  const rangeLast = totalRange(last);
  if (rangeFirst < 0.001 || rangeMiddle < 0.001 || rangeLast < 0.001) return null;

  const avgB = avgBody(ohlc.slice(0, -1));

  const firstBullish = isBullish(first) && bodySize(first) > avgB * 0.7;
  const middleDoji = bodySize(middle) / rangeMiddle < 0.1;
  const lastBearish = isBearish(last) && bodySize(last) > avgB * 0.7;

  const gapUp1 = middle.low > first.high;
  const gapDown2 = last.high < middle.low;

  const trend = inferTrendBias(ohlc);
  const inUptrend = trend === 'bullish';

  if (firstBullish && middleDoji && lastBearish && gapUp1 && gapDown2 && inUptrend) {
    return {
      name: 'Bearish Abandoned Baby',
      type: 'bearish',
      category: 'candlestick',
      confidence: 80,
      description: 'Bearish reversal - gap up doji isolated between bullish and bearish candles',
      startIndex: i - 2,
      endIndex: i,
      pt1: Math.min(first.low, middle.low, last.low),
      pt2: Math.min(first.low, middle.low, last.low) - (Math.max(first.high, middle.high, last.high) - Math.min(first.low, middle.low, last.low)),
      stopLoss: Math.max(first.high, middle.high, last.high),
      strengthWeight: 80 / 100
    };
  }

  return null;
}

export function detectTriStarDoji(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 5) return null;
  const i = ohlc.length - 1;
  const c1 = ohlc[i - 2];
  const c2 = ohlc[i - 1];
  const c3 = ohlc[i];

  const r1 = totalRange(c1);
  const r2 = totalRange(c2);
  const r3 = totalRange(c3);
  if (r1 < 0.001 || r2 < 0.001 || r3 < 0.001) return null;

  const isDoji1 = bodySize(c1) / r1 < 0.1;
  const isDoji2 = bodySize(c2) / r2 < 0.1;
  const isDoji3 = bodySize(c3) / r3 < 0.1;

  if (!(isDoji1 && isDoji2 && isDoji3)) return null;

  const gapUp1 = c2.low > c1.high;
  const gapDown1 = c2.high < c1.low;
  const gapUp2 = c3.low > c2.high;
  const gapDown2 = c3.high < c2.low;

  const trend = inferTrendBias(ohlc);

  if (trend === 'bearish' && gapDown1 && gapUp2) {
    return {
      name: 'Bullish Tri-Star Doji',
      type: 'bullish',
      category: 'candlestick',
      confidence: 75,
      description: 'Rare bullish reversal - three dojis with final gap signaling exhaustion of downtrend',
      startIndex: i - 2,
      endIndex: i,
      pt1: Math.max(c1.high, c2.high, c3.high),
      pt2: Math.max(c1.high, c2.high, c3.high) + (Math.max(c1.high, c2.high, c3.high) - Math.min(c1.low, c2.low, c3.low)),
      stopLoss: Math.min(c1.low, c2.low, c3.low),
      strengthWeight: 75 / 100
    };
  }

  if (trend === 'bullish' && gapUp1 && gapDown2) {
    return {
      name: 'Bearish Tri-Star Doji',
      type: 'bearish',
      category: 'candlestick',
      confidence: 75,
      description: 'Rare bearish reversal - three dojis with final gap signaling exhaustion of uptrend',
      startIndex: i - 2,
      endIndex: i,
      pt1: Math.min(c1.low, c2.low, c3.low),
      pt2: Math.min(c1.low, c2.low, c3.low) - (Math.max(c1.high, c2.high, c3.high) - Math.min(c1.low, c2.low, c3.low)),
      stopLoss: Math.max(c1.high, c2.high, c3.high),
      strengthWeight: 75 / 100
    };
  }

  return null;
}

export function detectDoji(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 2) return null;
  const i = ohlc.length - 1;
  const c = ohlc[i];
  const range = totalRange(c);
  if (range < 0.001) return null;

  const body = bodySize(c);
  const upper = upperWick(c);
  const lower = lowerWick(c);
  const isDoji = body / range < 0.1;
  if (!isDoji) return null;

  const atr5 = computeATR5(ohlc);
  let name = 'Standard Doji';
  let type: PatternResult['type'] = 'neutral';
  let description = 'Indecision candle with very small body.';

  if (upper >= range * 0.6 && lower <= range * 0.1) {
    name = 'Gravestone Doji';
    type = 'bearish';
    description = 'Potential bearish reversal doji with dominant upper wick.';
  } else if (lower >= range * 0.6 && upper <= range * 0.1) {
    name = 'Dragonfly Doji';
    type = 'bullish';
    description = 'Potential bullish reversal doji with dominant lower wick.';
  } else if (upper >= range * 0.35 && lower >= range * 0.35) {
    name = 'Long-Legged Doji';
    description = 'Long-legged doji showing strong two-sided rejection and indecision.';
  }

  const trendBias = inferTrendBias(ohlc);
  const biasUp = trendBias === 'bullish';
  const pt1 = type === 'bullish'
    ? c.high + range * 0.5
    : type === 'bearish'
      ? c.low - range * 0.5
      : (biasUp ? c.close + atr5 : c.close - atr5);
  const pt2 = type === 'bullish'
    ? c.high + range
    : type === 'bearish'
      ? c.low - range
      : (biasUp ? c.close + atr5 * 2 : c.close - atr5 * 2);
  const stopLoss = type === 'bullish'
    ? c.low
    : type === 'bearish'
      ? c.high
      : (biasUp ? c.low : c.high);

  return {
    name,
    type,
    category: 'candlestick',
    confidence: 60,
    description,
    startIndex: i,
    endIndex: i,
    pt1,
    pt2,
    stopLoss,
    strengthWeight: 0.6
  };
}

export function detectSpinningTop(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 2) return null;
  const i = ohlc.length - 1;
  const c = ohlc[i];
  const range = totalRange(c);
  if (range < 0.001) return null;

  const body = bodySize(c);
  const upper = upperWick(c);
  const lower = lowerWick(c);

  const isSpinning = body / range < 0.3 && upper > body * 0.5 && lower > body * 0.5;
  if (!isSpinning) return null;

  const atr5 = computeATR5(ohlc);
  const type: PatternResult['type'] = isBullish(c) ? 'bullish' : 'bearish';

  return {
    name: `Spinning Top (${type === 'bullish' ? 'Bullish' : 'Bearish'})`,
    type,
    category: 'candlestick',
    confidence: 55,
    description: 'Indecision pattern with small body and relatively long upper and lower wicks',
    startIndex: i,
    endIndex: i,
    pt1: type === 'bullish' ? c.close + atr5 : c.close - atr5,
    pt2: type === 'bullish' ? c.close + atr5 * 2 : c.close - atr5 * 2,
    stopLoss: type === 'bullish' ? c.low : c.high,
    strengthWeight: 55 / 100
  };
}

export function detectMarubozu(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 2) return null;
  const i = ohlc.length - 1;
  const c = ohlc[i];
  const range = totalRange(c);
  if (range < 0.001) return null;

  const body = bodySize(c);
  const upper = upperWick(c);
  const lower = lowerWick(c);

  const isMarubozu = body / range > 0.9 && upper < range * 0.05 && lower < range * 0.05;
  if (!isMarubozu) return null;

  const type = isBullish(c) ? 'bullish' : 'bearish';

  return {
    name: `${type === 'bullish' ? 'Bullish' : 'Bearish'} Marubozu`,
    type,
    category: 'continuation',
    confidence: 70,
    description: `Strong ${type} momentum candle with almost no wicks`,
    startIndex: i,
    endIndex: i,
    pt1: type === 'bullish' ? c.high + range * 0.5 : c.low - range * 0.5,
    pt2: type === 'bullish' ? c.high + range : c.low - range,
    stopLoss: type === 'bullish' ? c.low : c.high,
    strengthWeight: 70 / 100
  };
}

export function detectBullishEngulfing(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 5) return null;
  const i = ohlc.length - 1;
  const curr = ohlc[i];
  const prev = ohlc[i - 1];

  const avg = avgBody(ohlc.slice(0, -1));
  const prevHasMeaningfulBody = bodySize(prev) > avg * 0.3;
  const currIsStrong = bodySize(curr) > avg * 0.8;

  if (isBullish(curr) && isBearish(prev) && prevHasMeaningfulBody && currIsStrong) {
    if (curr.open < prev.close && curr.close > prev.open) {
      const trend = inferTrendBias(ohlc);
      if (trend === 'bearish') {
        const lastEngulfingBottom = curr.open < prev.low
          && inferTrendBias(ohlc.slice(0, -2)) === 'bearish';
        return {
          name: lastEngulfingBottom ? 'Last Engulfing Bottom' : 'Bullish Engulfing',
          type: 'bullish',
          category: 'candlestick',
          confidence: 80,
          description: lastEngulfingBottom
            ? 'A bullish candle gaps lower and engulfs the final bearish candle of a decline.'
            : 'Strong bullish reversal - current candle engulfs previous bearish body',
          startIndex: i - 1,
          endIndex: i,
          pt1: Math.max(prev.high, curr.high),
          pt2: Math.max(prev.high, curr.high) + (Math.max(prev.high, curr.high) - Math.min(prev.low, curr.low)),
          stopLoss: Math.min(prev.low, curr.low),
          strengthWeight: 80 / 100
        };
      }
    }
  }
  return null;
}

export function detectBearishEngulfing(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 5) return null;
  const i = ohlc.length - 1;
  const curr = ohlc[i];
  const prev = ohlc[i - 1];

  const avg = avgBody(ohlc.slice(0, -1));
  const prevHasMeaningfulBody = bodySize(prev) > avg * 0.3;
  const currIsStrong = bodySize(curr) > avg * 0.8;

  if (isBearish(curr) && isBullish(prev) && prevHasMeaningfulBody && currIsStrong) {
    if (curr.open > prev.close && curr.close < prev.open) {
      const trend = inferTrendBias(ohlc);
      if (trend === 'bullish') {
        const lastEngulfingTop = curr.open > prev.high
          && inferTrendBias(ohlc.slice(0, -2)) === 'bullish';
        return {
          name: lastEngulfingTop ? 'Last Engulfing Top' : 'Bearish Engulfing',
          type: 'bearish',
          category: 'candlestick',
          confidence: 80,
          description: lastEngulfingTop
            ? 'A bearish candle gaps higher and engulfs the final bullish candle of an advance.'
            : 'Strong bearish reversal - current candle engulfs previous bullish body',
          startIndex: i - 1,
          endIndex: i,
          pt1: Math.min(prev.low, curr.low),
          pt2: Math.min(prev.low, curr.low) - (Math.max(prev.high, curr.high) - Math.min(prev.low, curr.low)),
          stopLoss: Math.max(prev.high, curr.high),
          strengthWeight: 80 / 100
        };
      }
    }
  }
  return null;
}

export function detectHarami(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 5) return null;
  const i = ohlc.length - 1;
  const curr = ohlc[i];
  const prev = ohlc[i - 1];

  const currBody = bodySize(curr);
  const prevBody = bodySize(prev);
  const avg = avgBody(ohlc.slice(0, -1));
  if (currBody > prevBody * 0.5) return null;
  if (prevBody < avg * 0.7) return null;

  const inside =
    Math.max(curr.open, curr.close) < Math.max(prev.open, prev.close) &&
    Math.min(curr.open, curr.close) > Math.min(prev.open, prev.close);

  if (!inside) return null;

  const trend = inferTrendBias(ohlc);

  if (isBearish(prev) && isBullish(curr) && trend === 'bearish') {
    return {
      name: 'Bullish Harami',
      type: 'bullish',
      category: 'candlestick',
      confidence: 65,
      description: 'Potential bullish reversal - small bullish candle inside prior bearish body',
      startIndex: i - 1,
      endIndex: i,
      pt1: Math.max(prev.high, curr.high),
      pt2: Math.max(prev.high, curr.high) + (Math.max(prev.high, curr.high) - Math.min(prev.low, curr.low)),
      stopLoss: Math.min(prev.low, curr.low),
      strengthWeight: 65 / 100
    };
  }

  if (isBullish(prev) && isBearish(curr) && trend === 'bullish') {
    return {
      name: 'Bearish Harami',
      type: 'bearish',
      category: 'candlestick',
      confidence: 65,
      description: 'Potential bearish reversal - small bearish candle inside prior bullish body',
      startIndex: i - 1,
      endIndex: i,
      pt1: Math.min(prev.low, curr.low),
      pt2: Math.min(prev.low, curr.low) - (Math.max(prev.high, curr.high) - Math.min(prev.low, curr.low)),
      stopLoss: Math.max(prev.high, curr.high),
      strengthWeight: 65 / 100
    };
  }

  return null;
}

export function detectMorningStar(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 6) return null;
  const i = ohlc.length - 1;
  const first = ohlc[i - 2];
  const middle = ohlc[i - 1];
  const last = ohlc[i];

  const avg = avgBody(ohlc.slice(0, -1));
  const firstBearish = isBearish(first) && bodySize(first) > avg * 0.8;
  const middleSmall = bodySize(middle) < avg * 0.3;
  const lastBullish = isBullish(last) && bodySize(last) > avg * 0.5;
  const lastClosesIntoFirst = last.close > (first.open + first.close) / 2;

  const middleBodyCenter = (middle.open + middle.close) / 2;
  const gapDown = middleBodyCenter < first.close;

  const trend = inferTrendBias(ohlc);
  const inDowntrend = trend === 'bearish';

  if (firstBearish && middleSmall && lastBullish && lastClosesIntoFirst && gapDown && inDowntrend) {
    return {
      name: 'Morning Star',
      type: 'bullish',
      category: 'candlestick',
      confidence: 80,
      description: 'Strong three-candle bullish reversal pattern',
      startIndex: i - 2,
      endIndex: i,
      pt1: Math.max(first.high, middle.high, last.high),
      pt2: Math.max(first.high, middle.high, last.high) + (Math.max(first.high, middle.high, last.high) - Math.min(first.low, middle.low, last.low)),
      stopLoss: Math.min(first.low, middle.low, last.low),
      strengthWeight: 80 / 100
    };
  }
  return null;
}

export function detectEveningStar(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 6) return null;
  const i = ohlc.length - 1;
  const first = ohlc[i - 2];
  const middle = ohlc[i - 1];
  const last = ohlc[i];

  const avg = avgBody(ohlc.slice(0, -1));
  const firstBullish = isBullish(first) && bodySize(first) > avg * 0.8;
  const middleSmall = bodySize(middle) < avg * 0.3;
  const lastBearish = isBearish(last) && bodySize(last) > avg * 0.5;
  const lastClosesIntoFirst = last.close < (first.open + first.close) / 2;

  const middleBodyCenter = (middle.open + middle.close) / 2;
  const gapUp = middleBodyCenter > first.close;

  const trend = inferTrendBias(ohlc);
  const inUptrend = trend === 'bullish';

  if (firstBullish && middleSmall && lastBearish && lastClosesIntoFirst && gapUp && inUptrend) {
    return {
      name: 'Evening Star',
      type: 'bearish',
      category: 'candlestick',
      confidence: 80,
      description: 'Strong three-candle bearish reversal pattern',
      startIndex: i - 2,
      endIndex: i,
      pt1: Math.min(first.low, middle.low, last.low),
      pt2: Math.min(first.low, middle.low, last.low) - (Math.max(first.high, middle.high, last.high) - Math.min(first.low, middle.low, last.low)),
      stopLoss: Math.max(first.high, middle.high, last.high),
      strengthWeight: 80 / 100
    };
  }
  return null;
}

export function detectThreeWhiteSoldiers(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 5) return null;
  const i = ohlc.length - 1;
  const c1 = ohlc[i - 2];
  const c2 = ohlc[i - 1];
  const c3 = ohlc[i];

  const avg = avgBody(ohlc.slice(0, -1));
  const allBullish = isBullish(c1) && isBullish(c2) && isBullish(c3);
  const allStrong = bodySize(c1) > avg * 0.5 && bodySize(c2) > avg * 0.5 && bodySize(c3) > avg * 0.5;
  const progressiveHighs = c2.close > c1.close && c3.close > c2.close;
  const smallWicks =
    upperWick(c1) < bodySize(c1) * 0.3 &&
    upperWick(c2) < bodySize(c2) * 0.3 &&
    upperWick(c3) < bodySize(c3) * 0.3;

  if (allBullish && allStrong && progressiveHighs && smallWicks) {
    return {
      name: 'Three White Soldiers',
      type: 'bullish',
      category: 'candlestick',
      confidence: 85,
      description: 'Strong bullish continuation with three consecutive strong bullish candles',
      startIndex: i - 2,
      endIndex: i,
      pt1: Math.max(c1.high, c2.high, c3.high),
      pt2: Math.max(c1.high, c2.high, c3.high) + (Math.max(c1.high, c2.high, c3.high) - Math.min(c1.low, c2.low, c3.low)),
      stopLoss: Math.min(c1.low, c2.low, c3.low),
      strengthWeight: 85 / 100
    };
  }
  return null;
}

export function detectThreeBlackCrows(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 5) return null;
  const i = ohlc.length - 1;
  const c1 = ohlc[i - 2];
  const c2 = ohlc[i - 1];
  const c3 = ohlc[i];

  const avg = avgBody(ohlc.slice(0, -1));
  const allBearish = isBearish(c1) && isBearish(c2) && isBearish(c3);
  const allStrong = bodySize(c1) > avg * 0.5 && bodySize(c2) > avg * 0.5 && bodySize(c3) > avg * 0.5;
  const progressiveLows = c2.close < c1.close && c3.close < c2.close;
  const smallWicks =
    lowerWick(c1) < bodySize(c1) * 0.3 &&
    lowerWick(c2) < bodySize(c2) * 0.3 &&
    lowerWick(c3) < bodySize(c3) * 0.3;

  if (allBearish && allStrong && progressiveLows && smallWicks) {
    return {
      name: 'Three Black Crows',
      type: 'bearish',
      category: 'candlestick',
      confidence: 85,
      description: 'Strong bearish continuation with three consecutive strong bearish candles',
      startIndex: i - 2,
      endIndex: i,
      pt1: Math.min(c1.low, c2.low, c3.low),
      pt2: Math.min(c1.low, c2.low, c3.low) - (Math.max(c1.high, c2.high, c3.high) - Math.min(c1.low, c2.low, c3.low)),
      stopLoss: Math.max(c1.high, c2.high, c3.high),
      strengthWeight: 85 / 100
    };
  }
  return null;
}

export function detectInsideBar(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 3) return null;
  const i = ohlc.length - 1;
  const curr = ohlc[i];
  const prev = ohlc[i - 1];

  if (curr.high < prev.high && curr.low > prev.low) {
    return {
      name: 'Inside Bar',
      type: 'neutral',
      category: 'candlestick',
      confidence: 60,
      description: 'Consolidation pattern - current bar trades within previous bar range',
      startIndex: i - 1,
      endIndex: i,
      pt1: prev.high,
      pt2: prev.high + (prev.high - prev.low),
      stopLoss: prev.low,
      strengthWeight: 0.6
    };
  }
  return null;
}

export function detectOutsideBar(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 3) return null;
  const i = ohlc.length - 1;
  const curr = ohlc[i];
  const prev = ohlc[i - 1];

  if (curr.high > prev.high && curr.low < prev.low) {
    const type = isBullish(curr) ? 'bullish' : 'bearish';
    return {
      name: 'Outside Bar',
      type,
      category: 'candlestick',
      confidence: 65,
      description: `${type === 'bullish' ? 'Bullish' : 'Bearish'} expansion - current bar engulfs previous range`,
      startIndex: i - 1,
      endIndex: i,
      pt1: type === 'bullish' ? Math.max(prev.high, curr.high) : Math.min(prev.low, curr.low),
      pt2: type === 'bullish' ? Math.max(prev.high, curr.high) + (Math.max(prev.high, curr.high) - Math.min(prev.low, curr.low)) : Math.min(prev.low, curr.low) - (Math.max(prev.high, curr.high) - Math.min(prev.low, curr.low)),
      stopLoss: type === 'bullish' ? curr.low : curr.high,
      strengthWeight: 65 / 100
    };
  }
  return null;
}

export function detectPiercingPattern(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 5) return null;
  const i = ohlc.length - 1;
  const curr = ohlc[i];
  const prev = ohlc[i - 1];
  const avg = avgBody(ohlc.slice(0, -1));

  if (isBearish(prev) && isBullish(curr) && bodySize(prev) > avg * 0.5 && bodySize(curr) > avg * 0.5) {
    const prevMid = (prev.open + prev.close) / 2;
    if (curr.open < prev.low && curr.close > prevMid && curr.close < prev.open) {
      const trend = inferTrendBias(ohlc);
      if (trend === 'bearish') {
        return {
          name: 'Piercing Line',
          type: 'bullish',
          category: 'candlestick',
          confidence: 70,
          description: 'Bullish reversal - gaps down then closes above midpoint of prior candle',
          startIndex: i - 1,
          endIndex: i,
          pt1: Math.max(prev.high, curr.high),
          pt2: Math.max(prev.high, curr.high) + (Math.max(prev.high, curr.high) - Math.min(prev.low, curr.low)),
          stopLoss: Math.min(prev.low, curr.low),
          strengthWeight: 70 / 100
        };
      }
    }
  }
  return null;
}

export function detectDarkCloudCover(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 5) return null;
  const i = ohlc.length - 1;
  const curr = ohlc[i];
  const prev = ohlc[i - 1];
  const avg = avgBody(ohlc.slice(0, -1));

  if (isBullish(prev) && isBearish(curr) && bodySize(prev) > avg * 0.5 && bodySize(curr) > avg * 0.5) {
    const prevMid = (prev.open + prev.close) / 2;
    if (curr.open > prev.high && curr.close < prevMid && curr.close > prev.open) {
      const trend = inferTrendBias(ohlc);
      if (trend === 'bullish') {
        return {
          name: 'Dark Cloud Cover',
          type: 'bearish',
          category: 'candlestick',
          confidence: 70,
          description: 'Bearish reversal - gaps up then closes below midpoint of prior candle',
          startIndex: i - 1,
          endIndex: i,
          pt1: Math.min(prev.low, curr.low),
          pt2: Math.min(prev.low, curr.low) - (Math.max(prev.high, curr.high) - Math.min(prev.low, curr.low)),
          stopLoss: Math.max(prev.high, curr.high),
          strengthWeight: 70 / 100
        };
      }
    }
  }
  return null;
}

export function detectTweezers(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 5) return null;
  const i = ohlc.length - 1;
  const curr = ohlc[i];
  const prev = ohlc[i - 1];
  const tol = avgRange(ohlc) * 0.02;
  const avg = avgBody(ohlc.slice(0, -1));
  const bothHaveBodies = bodySize(curr) > avg * 0.3 && bodySize(prev) > avg * 0.3;
  if (!bothHaveBodies) return null;

  const trend = inferTrendBias(ohlc);

  if (Math.abs(curr.high - prev.high) < tol && isBearish(curr) && isBullish(prev) && trend === 'bullish') {
    return {
      name: 'Tweezer Top',
      type: 'bearish',
      category: 'candlestick',
      confidence: 65,
      description: 'Bearish reversal - matching highs followed by bearish candle',
      startIndex: i - 1,
      endIndex: i,
      pt1: Math.min(prev.low, curr.low),
      pt2: Math.min(prev.low, curr.low) - (Math.max(prev.high, curr.high) - Math.min(prev.low, curr.low)),
      stopLoss: Math.max(prev.high, curr.high),
      strengthWeight: 65 / 100
    };
  }

  if (Math.abs(curr.low - prev.low) < tol && isBullish(curr) && isBearish(prev) && trend === 'bearish') {
    return {
      name: 'Tweezer Bottom',
      type: 'bullish',
      category: 'candlestick',
      confidence: 65,
      description: 'Bullish reversal - matching lows followed by bullish candle',
      startIndex: i - 1,
      endIndex: i,
      pt1: Math.max(prev.high, curr.high),
      pt2: Math.max(prev.high, curr.high) + (Math.max(prev.high, curr.high) - Math.min(prev.low, curr.low)),
      stopLoss: Math.min(prev.low, curr.low),
      strengthWeight: 65 / 100
    };
  }

  return null;
}

function makeCandlePattern(
  ohlc: OHLC[],
  count: number,
  name: string,
  type: PatternResult['type'],
  category: PatternResult['category'],
  confidence: number,
  description: string,
): PatternResult {
  const endIndex = ohlc.length - 1;
  const startIndex = Math.max(0, endIndex - count + 1);
  const candles = ohlc.slice(startIndex, endIndex + 1);
  const high = Math.max(...candles.map(candle => candle.high));
  const low = Math.min(...candles.map(candle => candle.low));
  const height = Math.max(high - low, computeATR5(ohlc));

  return {
    name,
    type,
    category,
    confidence,
    description,
    startIndex,
    endIndex,
    pt1: type === 'bullish' ? high + height * 0.5 : low - height * 0.5,
    pt2: type === 'bullish' ? high + height : low - height,
    stopLoss: type === 'bullish' ? low : high,
    strengthWeight: confidence / 100,
  };
}

function samePrice(left: number, right: number, tolerance: number): boolean {
  return Math.abs(left - right) <= tolerance;
}

export function detectHomingPigeon(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 6 || inferTrendBias(ohlc) !== 'bearish') return null;
  const previous = ohlc[ohlc.length - 2];
  const current = ohlc[ohlc.length - 1];
  const insideBody = Math.max(current.open, current.close) < previous.open
    && Math.min(current.open, current.close) > previous.close;
  if (!isBearish(previous) || !isBearish(current) || !insideBody || bodySize(current) >= bodySize(previous) * 0.65) return null;
  return makeCandlePattern(ohlc, 2, 'Homing Pigeon', 'bullish', 'candlestick', 67, 'Bullish reversal setup with a small bearish body contained inside the prior bearish body.');
}

export function detectMatchingLowHigh(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 6) return null;
  const previous = ohlc[ohlc.length - 2];
  const current = ohlc[ohlc.length - 1];
  const tolerance = Math.max(avgRange(ohlc, 10) * 0.08, Math.abs(current.close) * 0.0002);
  const trend = inferTrendBias(ohlc);

  if (trend === 'bearish' && isBearish(previous) && isBearish(current) && samePrice(previous.close, current.close, tolerance)) {
    return makeCandlePattern(ohlc, 2, 'Matching Low', 'bullish', 'candlestick', 65, 'Bullish reversal setup with two bearish candles closing at matching support.');
  }
  if (trend === 'bullish' && isBullish(previous) && isBullish(current) && samePrice(previous.close, current.close, tolerance)) {
    return makeCandlePattern(ohlc, 2, 'Matching High', 'bearish', 'candlestick', 65, 'Bearish reversal setup with two bullish candles closing at matching resistance.');
  }
  return null;
}

export function detectStickSandwich(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 7) return null;
  const first = ohlc[ohlc.length - 3];
  const middle = ohlc[ohlc.length - 2];
  const last = ohlc[ohlc.length - 1];
  const tolerance = Math.max(avgRange(ohlc, 10) * 0.1, Math.abs(last.close) * 0.0002);
  const trend = inferTrendBias(ohlc);

  if (trend === 'bearish' && isBearish(first) && isBullish(middle) && isBearish(last)
      && samePrice(first.close, last.close, tolerance) && middle.close > first.open) {
    return makeCandlePattern(ohlc, 3, 'Stick Sandwich (Bullish)', 'bullish', 'candlestick', 72, 'Bullish reversal with matching bearish closes surrounding a bullish candle.');
  }
  if (trend === 'bullish' && isBullish(first) && isBearish(middle) && isBullish(last)
      && samePrice(first.close, last.close, tolerance) && middle.close < first.open) {
    return makeCandlePattern(ohlc, 3, 'Stick Sandwich (Bearish)', 'bearish', 'candlestick', 72, 'Bearish reversal with matching bullish closes surrounding a bearish candle.');
  }
  return null;
}

export function detectDeliberationPattern(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 7 || inferTrendBias(ohlc) !== 'bullish') return null;
  const first = ohlc[ohlc.length - 3];
  const second = ohlc[ohlc.length - 2];
  const third = ohlc[ohlc.length - 1];
  const firstTwoStrong = isBullish(first) && isBullish(second)
    && second.close > first.close && bodySize(second) >= bodySize(first) * 0.7;
  const hesitation = isBullish(third) && third.open >= second.close - avgRange(ohlc, 10) * 0.1
    && bodySize(third) <= bodySize(second) * 0.45;
  if (!firstTwoStrong || !hesitation) return null;
  return makeCandlePattern(ohlc, 3, 'Deliberation Pattern', 'bearish', 'candlestick', 64, 'Bearish reversal warning as a strong advance stalls on a small third bullish candle.');
}

export function detectConcealingBabySwallow(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 8 || inferTrendBias(ohlc) !== 'bearish') return null;
  const [first, second, third, fourth] = ohlc.slice(-4);
  const firstTwoMarubozu = [first, second].every(candle => isBearish(candle)
    && bodySize(candle) / Math.max(totalRange(candle), 1e-9) >= 0.8);
  const thirdGapDown = isBearish(third) && third.high < second.low && upperWick(third) >= bodySize(third) * 0.25;
  const fourthEngulfsThird = isBearish(fourth) && fourth.open > third.high && fourth.close < third.low;
  if (!firstTwoMarubozu || !thirdGapDown || !fourthEngulfsThird) return null;
  return makeCandlePattern(ohlc, 4, 'Concealing Baby Swallow', 'bearish', 'continuation', 76, 'Bearish continuation pattern whose final engulfing candle can precede downside exhaustion.');
}

export function detectBreakaway(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 9) return null;
  const [first, second, third, fourth, fifth] = ohlc.slice(-5);
  const trend = inferTrendBias(ohlc.slice(0, -4));

  if (trend === 'bearish' && isBearish(first) && second.high < first.low
      && third.high <= second.high && fourth.low <= third.low && isBullish(fifth)
      && fifth.close > second.open && fifth.close < first.open) {
    return makeCandlePattern(ohlc, 5, 'Breakaway (Bullish)', 'bullish', 'gap', 78, 'Five-candle bullish breakaway reversal that closes back into the initial downside gap.');
  }
  if (trend === 'bullish' && isBullish(first) && second.low > first.high
      && third.low >= second.low && fourth.high >= third.high && isBearish(fifth)
      && fifth.close < second.open && fifth.close > first.open) {
    return makeCandlePattern(ohlc, 5, 'Breakaway (Bearish)', 'bearish', 'gap', 78, 'Five-candle bearish breakaway reversal that closes back into the initial upside gap.');
  }
  return null;
}

export function detectTasukiGap(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 6) return null;
  const [first, second, third] = ohlc.slice(-3);
  if (isBullish(first) && isBullish(second) && second.low > first.high && isBearish(third)
      && third.open < second.close && third.close > first.high && third.close < second.low) {
    return makeCandlePattern(ohlc, 3, 'Tasuki Gap (Bullish)', 'bullish', 'gap', 70, 'Bullish continuation gap partially filled by a bearish third candle without closing the gap.');
  }
  if (isBearish(first) && isBearish(second) && second.high < first.low && isBullish(third)
      && third.open > second.close && third.close < first.low && third.close > second.high) {
    return makeCandlePattern(ohlc, 3, 'Tasuki Gap (Bearish)', 'bearish', 'gap', 70, 'Bearish continuation gap partially filled by a bullish third candle without closing the gap.');
  }
  return null;
}

function detectRequestedReversalVariants(ohlc: OHLC[]): PatternResult[] {
  if (ohlc.length < 8) return [];

  const index = ohlc.length - 1;
  const first = ohlc[index - 2];
  const previous = ohlc[index - 1];
  const current = ohlc[index];
  const prior = ohlc.slice(0, -2);
  const trend = inferTrendBias(prior);
  const baselineBody = Math.max(avgBody(prior, 10), Math.abs(current.close) * 0.0001);
  const tolerance = Math.max(avgRange(prior, 10) * 0.12, Math.abs(current.close) * 0.0002);
  const previousMid = (previous.open + previous.close) / 2;
  const previousBodyHigh = Math.max(previous.open, previous.close);
  const previousBodyLow = Math.min(previous.open, previous.close);
  const currentBodyHigh = Math.max(current.open, current.close);
  const currentBodyLow = Math.min(current.open, current.close);
  const previousLong = bodySize(previous) >= baselineBody * 0.8;
  const previousGapDown = current.open < previous.low - tolerance * 0.25;
  const previousGapUp = current.open > previous.high + tolerance * 0.25;
  const results: PatternResult[] = [];

  const add = (
    name: string,
    direction: 'bullish' | 'bearish',
    confidence: number,
    description: string,
    count: number = 2,
    category: PatternResult['category'] = 'candlestick',
  ) => results.push(makeCandlePattern(ohlc, count, name, direction, category, confidence, description));

  if (trend === 'bearish' && isBullish(previous) && isBullish(current)
      && bodySize(previous) >= baselineBody * 0.75 && bodySize(current) >= baselineBody * 0.75
      && lowerWick(previous) <= bodySize(previous) * 0.12
      && lowerWick(current) <= bodySize(current) * 0.12
      && current.close > previous.high) {
    add('Bullish Belt Hold Pair', 'bullish', 62, 'Two strong bullish belt-hold candles appear after a decline, with the second closing above the first high.');
  }
  if (trend === 'bullish' && isBearish(previous) && isBearish(current)
      && bodySize(previous) >= baselineBody * 0.75 && bodySize(current) >= baselineBody * 0.75
      && upperWick(previous) <= bodySize(previous) * 0.12
      && upperWick(current) <= bodySize(current) * 0.12
      && current.close < previous.low) {
    add('Bearish Belt Hold Pair', 'bearish', 62, 'Two strong bearish belt-hold candles appear after an advance, with the second closing below the first low.');
  }
  if (trend === 'bearish' && isBearish(first) && first.high < prior[prior.length - 2].low
      && current.low > previous.high && isBullish(current)) {
    add('Island Reversal Bottom (2-candle interpretation)', 'bullish', 72, 'A downside-gap island is isolated by a subsequent upside gap and bullish close.', 3, 'gap');
  }
  if (trend === 'bullish' && isBullish(first) && first.low > prior[prior.length - 2].high
      && current.high < previous.low && isBearish(current)) {
    add('Island Reversal Top (2-candle interpretation)', 'bearish', 72, 'An upside-gap island is isolated by a subsequent downside gap and bearish close.', 3, 'gap');
  }

  if (trend === 'bearish' && isBearish(previous) && previousLong) {
    if (bodySize(current) <= baselineBody * 0.12
        && currentBodyLow > previousBodyLow && currentBodyHigh < previousBodyHigh) {
      add('Bullish Harami Cross', 'bullish', 64, 'A doji is contained inside a long bearish body after a decline; reversal is unconfirmed.');
    }
    if (isBullish(current) && previousGapDown && samePrice(current.close, previous.close, tolerance)) {
      if (current.open < previous.low - tolerance) {
        add('Bullish Counterattack', 'bullish', 66, 'A bullish candle gaps below the prior low and closes near the prior bearish close.');
      } else {
        add('Bullish Meeting Lines', 'bullish', 62, 'A bullish candle opens lower and recovers to the prior bearish close.');
      }
    }
    if (isBullish(current) && previousGapDown) {
      if (current.close > previous.high) {
        add('Bullish Window Reversal', 'bullish', 70, 'A downside gap is fully reclaimed by the bullish candle.', 2, 'gap');
      } else if (current.close > previousMid) {
        add('Bullish Gap Reversal', 'bullish', 68, 'A bullish candle gaps below the prior low and recovers above its midpoint.', 2, 'gap');
      }
    }
    if (isBullish(current) && previousGapDown && current.close <= previous.low + tolerance
        && current.close >= previous.low - tolerance) {
      add('On-Neck Pattern (weak bullish reversal candidate)', 'bullish', 52, 'Weak reversal candidate: after a downside gap, the bullish close returns to the prior low.');
    } else if (isBullish(current) && previousGapDown
        && current.close > previous.low + tolerance && current.close < previous.close) {
      add('In-Neck Pattern (weak bullish reversal candidate)', 'bullish', 54, 'Weak reversal candidate: the bullish close recovers just above the prior low but remains below the prior close.');
    } else if (isBullish(current) && previousGapDown
        && current.close >= previous.close && current.close < previousMid) {
      add('Thrusting Pattern (bullish variation)', 'bullish', 56, 'Weak reversal candidate: the bullish candle enters the lower half of the prior bearish body.');
    }
    if (isBearish(first) && isBearish(previous)
        && samePrice(first.close, previous.close, tolerance)
        && isBullish(current) && current.close > Math.max(first.high, previous.high)) {
      add('Matching Low Plus Confirmation', 'bullish', 70, 'Two bearish candles hold matching closes and a bullish third candle closes above both highs.', 3);
    }
    if (isBearish(first) && isBearish(previous) && previous.high < first.low
        && isBullish(current) && current.open < previous.close
        && current.close > previous.high && current.close < first.low) {
      add('Bullish Tasuki Reversal', 'bullish', 68, 'A bullish third candle recovers part of a downside gap after a selloff.', 3, 'gap');
    }
  }

  if (trend === 'bullish' && isBullish(previous) && previousLong) {
    if (isBullish(previous) && isBullish(current)
        && currentBodyHigh < previousBodyHigh && currentBodyLow > previousBodyLow
        && bodySize(current) < bodySize(previous) * 0.6) {
      add('Descending Hawk', 'bearish', 62, 'A smaller bullish candle remains inside the prior bullish candle near the end of an advance.');
    }
    if (bodySize(current) <= baselineBody * 0.12
        && currentBodyLow > previousBodyLow && currentBodyHigh < previousBodyHigh) {
      add('Bearish Harami Cross', 'bearish', 64, 'A doji is contained inside a long bullish body after an advance; reversal is unconfirmed.');
    }
    if (isBearish(current) && previousGapUp && samePrice(current.close, previous.close, tolerance)) {
      if (current.open > previous.high + tolerance) {
        add('Bearish Counterattack', 'bearish', 66, 'A bearish candle gaps above the prior high and closes near the prior bullish close.');
      } else {
        add('Bearish Meeting Lines', 'bearish', 62, 'A bearish candle opens higher and sells back to the prior bullish close.');
      }
    }
    if (isBearish(current) && previousGapUp) {
      if (current.close < previous.low) {
        add('Bearish Window Reversal', 'bearish', 70, 'An upside gap is fully rejected by the bearish candle.', 2, 'gap');
      } else if (current.close < previousMid) {
        add('Bearish Gap Reversal', 'bearish', 68, 'A bearish candle gaps above the prior high and closes below its midpoint.', 2, 'gap');
      }
    }
    if (isBullish(previous) && isBearish(current)
        && previousLong && isBullish(first)
        && current.open > previous.close && current.open <= previous.high
        && current.close < previousMid && current.close > previous.open) {
      add('Delayed Dark Cloud Cover', 'bearish', 64, 'A bearish candle opens within the prior bullish range and later closes below its midpoint.');
    }
    if (isBearish(current) && previousGapUp && current.close >= previous.high - tolerance
        && current.close <= previous.high + tolerance) {
      add('Bearish Neckline Pattern', 'bearish', 52, 'Weak reversal candidate: after an upside gap, the bearish close returns to the prior high.');
    } else if (isBearish(current) && previousGapUp
        && current.close < previous.high - tolerance && current.close > previous.close) {
      add('Bearish On-Neck Variation', 'bearish', 54, 'Weak reversal candidate: the bearish close slips just below the prior high but remains above the prior close.');
    } else if (isBearish(current) && previousGapUp
        && current.close <= previous.close && current.close > previousMid) {
      add('Bearish Thrusting Variation', 'bearish', 56, 'Weak reversal candidate: the bearish candle enters the upper half of the prior bullish body.');
    }
    if (isBullish(first) && isBullish(previous)
        && samePrice(first.close, previous.close, tolerance)
        && isBearish(current) && current.close < Math.min(first.low, previous.low)) {
      add('Matching High Plus Confirmation', 'bearish', 70, 'Two bullish candles hold matching closes and a bearish third candle closes below both lows.', 3);
    }
    if (isBullish(first) && isBullish(previous) && previous.low > first.high
        && isBearish(current) && current.open > previous.close
        && current.close < previous.low && current.close > first.high) {
      add('Bearish Tasuki Reversal', 'bearish', 68, 'A bearish third candle rejects part of an upside gap after a rally.', 3, 'gap');
    }
  }

  if (trend === 'bearish' && isBearish(previous)
      && bodySize(previous) >= baselineBody * 0.8
      && bodySize(current) <= baselineBody * 0.12
      && current.high < previous.low) {
    add('Doji Star Bottom', 'bullish', 58, 'A small doji gaps below a long bearish candle; reversal requires confirmation.');
  }
  if (trend === 'bullish' && isBullish(previous)
      && bodySize(previous) >= baselineBody * 0.8
      && bodySize(current) <= baselineBody * 0.12
      && current.low > previous.high) {
    add('Doji Star Top', 'bearish', 58, 'A small doji gaps above a long bullish candle; reversal requires confirmation.');
  }

  return results;
}

export function detectGapTwoCrowsAndMethods(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 7) return null;
  const lastThree = ohlc.slice(-3);
  const [first, second, third] = lastThree;
  if (inferTrendBias(ohlc) === 'bullish' && isBullish(first) && isBearish(second) && isBearish(third)
      && second.low > first.high && third.open > second.open && third.close < second.close && third.close > first.close) {
    return makeCandlePattern(ohlc, 3, 'Upside Gap Two Crows', 'bearish', 'gap', 74, 'Bearish reversal with two bearish candles holding above an upside gap after an advance.');
  }

  if (ohlc.length >= 8) {
    const [a, b, c, d] = ohlc.slice(-4);
    if (inferTrendBias(ohlc) === 'bearish' && isBearish(a) && isBearish(b) && b.high < a.low
        && isBullish(c) && c.close < a.low && isBearish(d) && d.close < b.low) {
      return makeCandlePattern(ohlc, 4, 'Downside Gap Three Methods', 'bearish', 'gap', 75, 'Bearish continuation with a downside gap, failed recovery, and renewed breakdown.');
    }
  }
  return null;
}

export function detectSideBySideLines(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 6) return null;
  const [first, second, third] = ohlc.slice(-3);
  const tolerance = avgRange(ohlc, 10) * 0.12;
  if (second.low > first.high && isBullish(second) && isBullish(third)
      && samePrice(second.open, third.open, tolerance) && samePrice(second.close, third.close, tolerance)) {
    return makeCandlePattern(ohlc, 3, 'Side-by-Side White Lines', 'bullish', 'gap', 68, 'Bullish continuation with two similar white candles holding above an upside gap.');
  }
  if (second.high < first.low && isBearish(second) && isBearish(third)
      && samePrice(second.open, third.open, tolerance) && samePrice(second.close, third.close, tolerance)) {
    return makeCandlePattern(ohlc, 3, 'Side-by-Side Black Lines', 'bearish', 'gap', 68, 'Bearish continuation with two similar black candles holding below a downside gap.');
  }
  return null;
}

export function detectThreeStarsInSouth(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 7 || inferTrendBias(ohlc) !== 'bearish') return null;
  const [first, second, third] = ohlc.slice(-3);
  const contracting = isBearish(first) && isBearish(second) && bodySize(second) < bodySize(first)
    && second.low > first.low && lowerWick(first) > bodySize(first) * 0.5;
  const finalSmall = bodySize(third) < bodySize(second) * 0.6 && third.low > second.low && third.high < second.high;
  if (!contracting || !finalSmall) return null;
  return makeCandlePattern(ohlc, 3, 'Three Stars in the South', 'bullish', 'candlestick', 72, 'Bullish reversal as three bearish candles contract and stop making lower lows.');
}

export function detectThreeMountains(ohlc: OHLC[]): PatternResult | null {
  const tripleTop = detectTripleTop(ohlc);
  if (!tripleTop) return null;
  return {
    ...tripleTop,
    name: 'Three Mountains',
    category: 'reversal',
    description: 'Bearish long-form reversal with three comparable mountain peaks and a support break.',
  };
}

export function detectTowerReversal(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 10) return null;
  const candles = ohlc.slice(-7);
  const first = candles[0];
  const last = candles[candles.length - 1];
  const middle = candles.slice(1, -1);
  const averageBody = avgBody(ohlc.slice(0, -1), 10);
  const middleBody = average(middle.map(bodySize));

  if (inferTrendBias(ohlc) === 'bearish' && isBearish(first) && bodySize(first) > averageBody * 1.1
      && middleBody < bodySize(first) * 0.55 && isBullish(last) && bodySize(last) > averageBody) {
    return makeCandlePattern(ohlc, 7, 'Tower Bottom', 'bullish', 'candlestick', 76, 'Bullish tower reversal with a selloff, basing candles, and a strong recovery candle.');
  }
  if (inferTrendBias(ohlc) === 'bullish' && isBullish(first) && bodySize(first) > averageBody * 1.1
      && middleBody < bodySize(first) * 0.55 && isBearish(last) && bodySize(last) > averageBody) {
    return makeCandlePattern(ohlc, 7, 'Tower Top', 'bearish', 'candlestick', 76, 'Bearish tower reversal with a rally, distribution candles, and a strong selloff candle.');
  }
  return null;
}

export function detectLadderReversal(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 9) return null;
  const [one, two, three, four, five] = ohlc.slice(-5);
  if (inferTrendBias(ohlc) === 'bearish' && [one, two, three].every(isBearish)
      && two.close < one.close && three.close < two.close && lowerWick(four) > bodySize(four)
      && isBullish(five) && five.open > four.open && five.close > four.high) {
    return makeCandlePattern(ohlc, 5, 'Ladder Bottom', 'bullish', 'candlestick', 75, 'Bullish five-candle ladder reversal confirmed by a strong final recovery candle.');
  }
  if (inferTrendBias(ohlc) === 'bullish' && [one, two, three].every(isBullish)
      && two.close > one.close && three.close > two.close && upperWick(four) > bodySize(four)
      && isBearish(five) && five.open < four.open && five.close < four.low) {
    return makeCandlePattern(ohlc, 5, 'Ladder Top', 'bearish', 'candlestick', 75, 'Bearish five-candle ladder reversal confirmed by a strong final selloff candle.');
  }
  return null;
}

export function detectThreeMethods(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 7) return null;
  const [first, second, third, fourth, fifth] = ohlc.slice(-5);
  const middle = [second, third, fourth];
  const middleInsideFirst = middle.every(candle => candle.high < first.high && candle.low > first.low);

  if (isBullish(first) && middle.every(isBearish) && middleInsideFirst && isBullish(fifth) && fifth.close > first.high) {
    return makeCandlePattern(ohlc, 5, 'Rising Three Methods', 'bullish', 'continuation', 80, 'Bullish continuation after three controlled pullback candles remain inside the impulse range.');
  }
  if (isBearish(first) && middle.every(isBullish) && middleInsideFirst && isBearish(fifth) && fifth.close < first.low) {
    return makeCandlePattern(ohlc, 5, 'Falling Three Methods', 'bearish', 'continuation', 80, 'Bearish continuation after three controlled rebound candles remain inside the impulse range.');
  }
  return null;
}

export function detectTasukiContinuation(ohlc: OHLC[]): PatternResult | null {
  const tasuki = detectTasukiGap(ohlc);
  if (!tasuki) return null;
  return {
    ...tasuki,
    name: tasuki.type === 'bullish' ? 'Upside Tasuki' : 'Downside Tasuki',
    category: 'continuation',
  };
}

export function detectSeparatingLines(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 6) return null;
  const previous = ohlc[ohlc.length - 2];
  const current = ohlc[ohlc.length - 1];
  const tolerance = avgRange(ohlc, 10) * 0.1;
  const trend = inferTrendBias(ohlc);

  if (trend === 'bullish' && isBearish(previous) && isBullish(current)
      && samePrice(previous.open, current.open, tolerance) && bodySize(current) >= bodySize(previous) * 0.8) {
    return makeCandlePattern(ohlc, 2, 'Separating Lines (Bullish)', 'bullish', 'continuation', 70, 'Bullish continuation as opposite-colored candles share an opening level and trend resumes.');
  }
  if (trend === 'bearish' && isBullish(previous) && isBearish(current)
      && samePrice(previous.open, current.open, tolerance) && bodySize(current) >= bodySize(previous) * 0.8) {
    return makeCandlePattern(ohlc, 2, 'Separating Lines (Bearish)', 'bearish', 'continuation', 70, 'Bearish continuation as opposite-colored candles share an opening level and trend resumes.');
  }
  return null;
}

/* =========================
   Gaps
   ========================= */

export function detectGap(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 3) return null;
  const i = ohlc.length - 1;
  const curr = ohlc[i];
  const prev = ohlc[i - 1];

  const gapSize = avgRange(ohlc) * 0.5;

  if (curr.low > prev.high && curr.low - prev.high > gapSize) {
    return {
      name: 'Gap Up',
      type: 'bullish',
      category: 'gap',
      confidence: 60,
      description: 'Bullish gap - price opened above previous high',
      startIndex: i - 1,
      endIndex: i,
      pt1: curr.high,
      pt2: curr.high + (curr.low - prev.high),
      stopLoss: prev.high,
      strengthWeight: 0.6
    };
  }

  if (curr.high < prev.low && prev.low - curr.high > gapSize) {
    return {
      name: 'Gap Down',
      type: 'bearish',
      category: 'gap',
      confidence: 60,
      description: 'Bearish gap - price opened below previous low',
      startIndex: i - 1,
      endIndex: i,
      pt1: curr.low,
      pt2: curr.low - (prev.low - curr.high),
      stopLoss: prev.low,
      strengthWeight: 0.6
    };
  }

  return null;
}

export interface GapInfo {
  index: number;
  direction: 'up' | 'down';
  gapTop: number;
  gapBottom: number;
  gapSize: number;
  gapPercent: number;
  fillPercent: number;
  filled: boolean;
  fillIndex: number | null;
}

export interface GapAnalysis {
  gaps: GapInfo[];
  totalGaps: number;
  filledCount: number;
  unfilledCount: number;
  avgFillPercent: number;
  activeGap: GapInfo | null;
}

export function analyzeGaps(ohlc: OHLC[]): GapAnalysis {
  if (ohlc.length < 3) {
    return { gaps: [], totalGaps: 0, filledCount: 0, unfilledCount: 0, avgFillPercent: 0, activeGap: null };
  }

  const minGapSize = avgRange(ohlc) * 0.3;
  const gaps: GapInfo[] = [];

  for (let i = 1; i < ohlc.length; i++) {
    const prev = ohlc[i - 1];
    const curr = ohlc[i];

    let direction: 'up' | 'down' | null = null;
    let gapTop = 0;
    let gapBottom = 0;

    if (curr.low > prev.high && curr.low - prev.high > minGapSize) {
      direction = 'up';
      gapTop = curr.low;
      gapBottom = prev.high;
    } else if (curr.high < prev.low && prev.low - curr.high > minGapSize) {
      direction = 'down';
      gapTop = prev.low;
      gapBottom = curr.high;
    }

    if (!direction) continue;

    const gapSize = gapTop - gapBottom;
    const gapPercent = (gapSize / ((gapTop + gapBottom) / 2)) * 100;

    let fillPercent = 0;
    let filled = false;
    let fillIndex: number | null = null;

    for (let j = i + 1; j < ohlc.length; j++) {
      const candle = ohlc[j];
      if (direction === 'up') {
        const penetration = Math.max(0, gapTop - candle.low);
        const pct = Math.min(100, (penetration / gapSize) * 100);
        if (pct > fillPercent) {
          fillPercent = pct;
          if (pct >= 100 && !filled) {
            filled = true;
            fillIndex = j;
          }
        }
      } else {
        const penetration = Math.max(0, candle.high - gapBottom);
        const pct = Math.min(100, (penetration / gapSize) * 100);
        if (pct > fillPercent) {
          fillPercent = pct;
          if (pct >= 100 && !filled) {
            filled = true;
            fillIndex = j;
          }
        }
      }
    }

    gaps.push({
      index: i,
      direction,
      gapTop,
      gapBottom,
      gapSize,
      gapPercent: Math.round(gapPercent * 100) / 100,
      fillPercent: Math.round(fillPercent * 10) / 10,
      filled,
      fillIndex,
    });
  }

  const filledCount = gaps.filter(g => g.filled).length;
  const unfilledCount = gaps.length - filledCount;
  const avgFillPercent = gaps.length > 0
    ? Math.round(gaps.reduce((s, g) => s + g.fillPercent, 0) / gaps.length * 10) / 10
    : 0;

  const unfilled = gaps.filter(g => !g.filled);
  const activeGap = unfilled.length > 0 ? unfilled[unfilled.length - 1] : null;

  return {
    gaps: gaps.slice(-10),
    totalGaps: gaps.length,
    filledCount,
    unfilledCount,
    avgFillPercent,
    activeGap,
  };
}

/* =========================
   Classical patterns
   ========================= */

export function detectDoubleTop(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 20) return null;
  const maxima = findLocalMaxima(ohlc);
  if (maxima.length < 2) return null;

  const tolerance = avgRange(ohlc) * 0.03;
  const last = maxima[maxima.length - 1];
  const prev = maxima[maxima.length - 2];

  if (Math.abs(ohlc[last].high - ohlc[prev].high) < tolerance && last - prev >= 5) {
    const neckline = Math.min(...ohlc.slice(prev, last + 1).map(c => c.low));
    const lastClose = ohlc[ohlc.length - 1].close;

    if (lastClose < neckline) {
      return {
        name: 'Double Top',
        type: 'bearish',
        category: 'reversal',
        confidence: 75,
        description: 'Bearish reversal - two peaks at similar level with neckline break',
        startIndex: prev,
        endIndex: ohlc.length - 1,
        priceTarget: neckline - (ohlc[last].high - neckline),
        pt1: neckline,
        pt2: neckline - (ohlc[last].high - neckline),
        stopLoss: ohlc[last].high,
        strengthWeight: 0.75
      };
    }
  }
  return null;
}

export function detectDoubleBottom(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 20) return null;
  const minima = findLocalMinima(ohlc, 5);
  if (minima.length < 2) return null;

  const ar = avgRange(ohlc, 20);
  const tolerance = Math.max(ar * 0.14, average(ohlc.slice(-40).map(c => c.close)) * 0.003);
  const last = minima[minima.length - 1];
  const prev = minima[minima.length - 2];
  const span = last - prev;
  if (span < 6) return null;

  const priorTrend = inferTrendBias(ohlc.slice(Math.max(0, prev - 20), prev + 1));
  if (priorTrend === 'bullish') return null;

  if (Math.abs(ohlc[last].low - ohlc[prev].low) < tolerance) {
    const neckline = Math.max(...ohlc.slice(prev, last + 1).map(c => c.high));
    const lastClose = ohlc[ohlc.length - 1].close;
    const valleyLow = Math.min(ohlc[prev].low, ohlc[last].low);
    const measuredMove = neckline - valleyLow;
    if (measuredMove < ar * 0.9) return null;

    const breakoutConfirmed = lastClose > neckline + ar * 0.08;
    const nearBreakout = lastClose > neckline - ar * 0.22 && ohlc[ohlc.length - 1].close > ohlc[ohlc.length - 2].close;
    if (!breakoutConfirmed && !nearBreakout) return null;

    const confidence = breakoutConfirmed ? 77 : 69;
    return {
      name: 'Double Bottom',
      type: 'bullish',
      category: 'reversal',
      confidence,
      description: breakoutConfirmed
        ? 'Bullish reversal - two troughs at similar support with neckline breakout'
        : 'Double bottom forming - support holding and price approaching neckline',
      startIndex: prev,
      endIndex: ohlc.length - 1,
      priceTarget: neckline + measuredMove,
      pt1: neckline,
      pt2: neckline + measuredMove,
      stopLoss: valleyLow - ar * 0.08,
      strengthWeight: confidence / 100
    };
  }
  return null;
}

export function detectHeadAndShoulders(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 25) return null;

  const priorLen = Math.min(20, Math.floor(ohlc.length * 0.3));
  const priorStart = ohlc[0].close;
  const priorEnd = ohlc[Math.max(0, priorLen - 1)].close;
  if (priorEnd <= priorStart * 0.98) return null;

  for (const lb of [3, 5, 7]) {
    const maxima = findLocalMaxima(ohlc, lb);
    if (maxima.length < 3) continue;
    for (let g = 0; g <= Math.min(2, maxima.length - 3); g++) {
      const li = maxima.length - 3 - g;
      if (li < 0) continue;
      const leftShoulder = maxima[li];
      const head = maxima[li + 1];
      const rightShoulder = maxima[li + 2];
      if (rightShoulder < ohlc.length - 30) continue;

      const headHigh = ohlc[head].high;
      const leftHigh = ohlc[leftShoulder].high;
      const rightHigh = ohlc[rightShoulder].high;

      const headHigher = headHigh > leftHigh && headHigh > rightHigh;
      if (!headHigher) continue;

      const shoulderRatio = rightHigh / leftHigh;
      if (shoulderRatio < 0.75 || shoulderRatio > 1.25) continue;

      const headProminence = headHigh - Math.max(leftHigh, rightHigh);
      if (headProminence < avgRange(ohlc, 20) * 0.3) continue;

      if (rightHigh > headHigh) continue;

      let swingLow1Idx = -1, swingLow1Val = Infinity;
      for (let i = leftShoulder + 2; i < head - 1; i++) {
        const isSwing = ohlc[i].low <= ohlc[i - 1].low && ohlc[i].low <= ohlc[i - 2].low &&
                         ohlc[i].low <= ohlc[i + 1].low;
        if (isSwing && ohlc[i].low < swingLow1Val) {
          swingLow1Val = ohlc[i].low;
          swingLow1Idx = i;
        }
      }
      if (swingLow1Idx < 0) {
        for (let i = leftShoulder + 1; i < head; i++) {
          if (ohlc[i].low < swingLow1Val) { swingLow1Val = ohlc[i].low; swingLow1Idx = i; }
        }
      }
      if (swingLow1Idx < 0) { swingLow1Idx = Math.round((leftShoulder + head) / 2); swingLow1Val = ohlc[swingLow1Idx].low; }

      let swingLow2Idx = -1, swingLow2Val = Infinity;
      for (let i = head + 2; i < rightShoulder - 1; i++) {
        const isSwing = ohlc[i].low <= ohlc[i - 1].low && ohlc[i].low <= ohlc[i - 2].low &&
                         ohlc[i].low <= ohlc[i + 1].low;
        if (isSwing && ohlc[i].low < swingLow2Val) {
          swingLow2Val = ohlc[i].low;
          swingLow2Idx = i;
        }
      }
      if (swingLow2Idx < 0) {
        for (let i = head + 1; i < rightShoulder; i++) {
          if (ohlc[i].low < swingLow2Val) { swingLow2Val = ohlc[i].low; swingLow2Idx = i; }
        }
      }
      if (swingLow2Idx < 0) { swingLow2Idx = Math.round((head + rightShoulder) / 2); swingLow2Val = ohlc[swingLow2Idx].low; }

      const neckSlope = (swingLow2Idx !== swingLow1Idx) ? (swingLow2Val - swingLow1Val) / (swingLow2Idx - swingLow1Idx) : 0;
      const neckAtCurrent = swingLow1Val + neckSlope * (ohlc.length - 1 - swingLow1Idx);
      const neckAtRS = swingLow1Val + neckSlope * (rightShoulder - swingLow1Idx);
      const lastClose = ohlc[ohlc.length - 1].close;
      const tolerance = avgRange(ohlc, 20) * 0.25;
      const broken = lastClose < neckAtCurrent;
      const nearNeckline = lastClose < neckAtCurrent + tolerance * 0.5;
      if (broken || nearNeckline) {
        const measuredMove = headHigh - Math.min(swingLow1Val, swingLow2Val);
        return {
          name: 'Head and Shoulders',
          type: 'bearish',
          category: 'reversal',
          confidence: broken ? 80 : 68,
          description: broken
            ? 'Classic bearish reversal - left shoulder, head, right shoulder with neckline break'
            : 'Head and shoulders forming - price approaching neckline support',
          startIndex: leftShoulder,
          endIndex: ohlc.length - 1,
          priceTarget: neckAtRS - measuredMove,
          pt1: neckAtRS,
          pt2: neckAtRS - measuredMove,
          stopLoss: rightHigh,
          strengthWeight: broken ? 0.8 : 0.68
        };
      }
    }
  }
  return null;
}

export function detectInverseHeadAndShoulders(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 25) return null;

  const priorLen = Math.min(20, Math.floor(ohlc.length * 0.3));
  const priorStart = ohlc[0].close;
  const priorEnd = ohlc[Math.max(0, priorLen - 1)].close;
  if (priorEnd >= priorStart * 1.02) return null;

  for (const lb of [3, 5, 7]) {
    const minima = findLocalMinima(ohlc, lb);
    if (minima.length < 3) continue;
    for (let g = 0; g <= Math.min(2, minima.length - 3); g++) {
      const li = minima.length - 3 - g;
      if (li < 0) continue;
      const leftShoulder = minima[li];
      const head = minima[li + 1];
      const rightShoulder = minima[li + 2];
      if (rightShoulder < ohlc.length - 30) continue;

      const headLow = ohlc[head].low;
      const leftLow = ohlc[leftShoulder].low;
      const rightLow = ohlc[rightShoulder].low;

      const headLower = headLow < leftLow && headLow < rightLow;
      if (!headLower) continue;

      const shoulderRatio = rightLow / leftLow;
      if (shoulderRatio < 0.75 || shoulderRatio > 1.25) continue;

      const headProminence = Math.min(leftLow, rightLow) - headLow;
      if (headProminence < avgRange(ohlc, 20) * 0.3) continue;

      if (rightLow < headLow) continue;

      let swingHigh1Idx = -1, swingHigh1Val = -Infinity;
      for (let i = leftShoulder + 2; i < head - 1; i++) {
        const isSwing = ohlc[i].high >= ohlc[i - 1].high && ohlc[i].high >= ohlc[i - 2].high &&
                         ohlc[i].high >= ohlc[i + 1].high;
        if (isSwing && ohlc[i].high > swingHigh1Val) {
          swingHigh1Val = ohlc[i].high;
          swingHigh1Idx = i;
        }
      }
      if (swingHigh1Idx < 0) {
        for (let i = leftShoulder + 1; i < head; i++) {
          if (ohlc[i].high > swingHigh1Val) { swingHigh1Val = ohlc[i].high; swingHigh1Idx = i; }
        }
      }
      if (swingHigh1Idx < 0) { swingHigh1Idx = Math.round((leftShoulder + head) / 2); swingHigh1Val = ohlc[swingHigh1Idx].high; }

      let swingHigh2Idx = -1, swingHigh2Val = -Infinity;
      for (let i = head + 2; i < rightShoulder - 1; i++) {
        const isSwing = ohlc[i].high >= ohlc[i - 1].high && ohlc[i].high >= ohlc[i - 2].high &&
                         ohlc[i].high >= ohlc[i + 1].high;
        if (isSwing && ohlc[i].high > swingHigh2Val) {
          swingHigh2Val = ohlc[i].high;
          swingHigh2Idx = i;
        }
      }
      if (swingHigh2Idx < 0) {
        for (let i = head + 1; i < rightShoulder; i++) {
          if (ohlc[i].high > swingHigh2Val) { swingHigh2Val = ohlc[i].high; swingHigh2Idx = i; }
        }
      }
      if (swingHigh2Idx < 0) { swingHigh2Idx = Math.round((head + rightShoulder) / 2); swingHigh2Val = ohlc[swingHigh2Idx].high; }

      const neckSlope = (swingHigh2Idx !== swingHigh1Idx) ? (swingHigh2Val - swingHigh1Val) / (swingHigh2Idx - swingHigh1Idx) : 0;
      const neckAtCurrent = swingHigh1Val + neckSlope * (ohlc.length - 1 - swingHigh1Idx);
      const neckAtRS = swingHigh1Val + neckSlope * (rightShoulder - swingHigh1Idx);
      const lastClose = ohlc[ohlc.length - 1].close;
      const tolerance = avgRange(ohlc, 20) * 0.25;
      const broken = lastClose > neckAtCurrent;
      const nearNeckline = lastClose > neckAtCurrent - tolerance * 0.5;
      if (broken || nearNeckline) {
        const measuredMove = Math.max(swingHigh1Val, swingHigh2Val) - headLow;
        return {
          name: 'Inverse Head and Shoulders',
          type: 'bullish',
          category: 'reversal',
          confidence: broken ? 80 : 68,
          description: broken
            ? 'Classic bullish reversal - inverted head and shoulders with neckline break'
            : 'Inverse head and shoulders forming - price approaching neckline resistance',
          startIndex: leftShoulder,
          endIndex: ohlc.length - 1,
          priceTarget: neckAtRS + measuredMove,
          pt1: neckAtRS,
          pt2: neckAtRS + measuredMove,
          stopLoss: rightLow,
          strengthWeight: broken ? 0.8 : 0.68
        };
      }
    }
  }
  return null;
}

export function detectAscendingTriangle(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 20) return null;
  const maxima = findLocalMaxima(ohlc);
  const minima = findLocalMinima(ohlc);
  if (maxima.length < 2 || minima.length < 2) return null;

  const highPoints = maxima.slice(-3).map(i => ({ x: i, y: ohlc[i].high }));
  const lowPoints = minima.slice(-3).map(i => ({ x: i, y: ohlc[i].low }));

  const highTrend = calculateTrendline(highPoints);
  const lowTrend = calculateTrendline(lowPoints);

  const flatResistance = Math.abs(highTrend.slope) < 0.005;
  const risingSupport = lowTrend.slope > 0.01;

  if (flatResistance && risingSupport) {
    return {
      name: 'Ascending Triangle',
      type: 'bullish',
      category: 'continuation',
      confidence: 70,
      description: 'Bullish continuation - flat resistance with rising support',
      startIndex: Math.min(...maxima.slice(-3), ...minima.slice(-3)),
      endIndex: ohlc.length - 1,
      pt1: average(highPoints.map(p => p.y)),
      pt2: average(highPoints.map(p => p.y)) + (average(highPoints.map(p => p.y)) - Math.min(...lowPoints.map(p => p.y))),
      stopLoss: Math.min(...lowPoints.map(p => p.y)),
      strengthWeight: 0.7
    };
  }
  return null;
}

export function detectDescendingTriangle(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 20) return null;
  const maxima = findLocalMaxima(ohlc);
  const minima = findLocalMinima(ohlc);
  if (maxima.length < 2 || minima.length < 2) return null;

  const highPoints = maxima.slice(-3).map(i => ({ x: i, y: ohlc[i].high }));
  const lowPoints = minima.slice(-3).map(i => ({ x: i, y: ohlc[i].low }));

  const highTrend = calculateTrendline(highPoints);
  const lowTrend = calculateTrendline(lowPoints);

  const fallingResistance = highTrend.slope < -0.01;
  const flatSupport = Math.abs(lowTrend.slope) < 0.005;

  if (fallingResistance && flatSupport) {
    return {
      name: 'Descending Triangle',
      type: 'bearish',
      category: 'continuation',
      confidence: 70,
      description: 'Bearish continuation - falling resistance with flat support',
      startIndex: Math.min(...maxima.slice(-3), ...minima.slice(-3)),
      endIndex: ohlc.length - 1,
      pt1: average(lowPoints.map(p => p.y)),
      pt2: average(lowPoints.map(p => p.y)) - (Math.max(...highPoints.map(p => p.y)) - average(lowPoints.map(p => p.y))),
      stopLoss: Math.max(...highPoints.map(p => p.y)),
      strengthWeight: 0.7
    };
  }
  return null;
}

export function detectSymmetricalTriangle(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 20) return null;
  const maxima = findLocalMaxima(ohlc);
  const minima = findLocalMinima(ohlc);
  if (maxima.length < 2 || minima.length < 2) return null;

  const highPoints = maxima.slice(-3).map(i => ({ x: i, y: ohlc[i].high }));
  const lowPoints = minima.slice(-3).map(i => ({ x: i, y: ohlc[i].low }));

  const highTrend = calculateTrendline(highPoints);
  const lowTrend = calculateTrendline(lowPoints);

  const converging = highTrend.slope < -0.005 && lowTrend.slope > 0.005;
  const symmetrical = Math.abs(Math.abs(highTrend.slope) - Math.abs(lowTrend.slope)) < 0.01;

  if (converging && symmetrical) {
    return {
      name: 'Symmetrical Triangle',
      type: 'neutral',
      category: 'continuation',
      confidence: 65,
      description: 'Consolidation pattern - converging trendlines suggest imminent breakout',
      startIndex: Math.min(...maxima.slice(-3), ...minima.slice(-3)),
      endIndex: ohlc.length - 1,
      pt1: ohlc[ohlc.length - 1].close + computeATR5(ohlc),
      pt2: ohlc[ohlc.length - 1].close + computeATR5(ohlc) * 2,
      stopLoss: ohlc[ohlc.length - 1].close - computeATR5(ohlc),
      strengthWeight: 0.65
    };
  }
  return null;
}

export function detectRisingWedge(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 30) return null;

  // 1. Find real swing highs/lows
  const maxima = findLocalMaxima(ohlc, 5);
  const minima = findLocalMinima(ohlc, 5);
  if (maxima.length < 2 || minima.length < 2) return null;

  const swingHighs = maxima.slice(-3).map(i => ({ x: i, y: ohlc[i].high }));
  const swingLows  = minima.slice(-3).map(i => ({ x: i, y: ohlc[i].low }));

  if (swingHighs.length < 2 || swingLows.length < 2) return null;

  // 2. Compute slopes from actual swing points
  const upperSlope = (swingHighs[1].y - swingHighs[0].y) / (swingHighs[1].x - swingHighs[0].x);
  const lowerSlope = (swingLows[1].y - swingLows[0].y) / (swingLows[1].x - swingLows[0].x);

  // 3. Both trendlines must be rising
  if (upperSlope <= 0 || lowerSlope <= 0) return null;

  // 4. Lower slope MUST be greater than upper slope (convergence)
  if (lowerSlope <= upperSlope) return null;

  // 5. Slopes must differ meaningfully (avoid parallel channels)
  const slopeDiff = Math.abs(lowerSlope - upperSlope);
  if (slopeDiff < 0.0005) return null;

  // 6. Lines must converge (gap shrinking)
  const startIdx = Math.min(swingHighs[0].x, swingLows[0].x);
  const endIdx   = Math.max(swingHighs[1].x, swingLows[1].x);

  const gapStart = (upperSlope * startIdx + swingHighs[0].y) -
                   (lowerSlope * startIdx + swingLows[0].y);

  const gapEnd   = (upperSlope * endIdx + swingHighs[1].y) -
                   (lowerSlope * endIdx + swingLows[1].y);

  if (gapStart <= 0 || gapEnd <= 0) return null;
  if (gapEnd >= gapStart * 0.75) return null; // must shrink significantly

  // 7. Compression check (swing ranges must shrink)
  const firstRange = swingHighs[0].y - swingLows[0].y;
  const lastRange  = swingHighs[swingHighs.length - 1].y - swingLows[swingLows.length - 1].y;

  if (lastRange >= firstRange * 0.9) return null;

  // --- VALID RISING WEDGE ---
  const endIndex = ohlc.length - 1;

  return {
    name: "Rising Wedge",
    type: "bearish",
    category: "reversal",
    confidence: 70,
    description: "Bearish reversal - converging upward trendlines suggest weakening momentum",
    startIndex: startIdx,
    endIndex,
    pt1: ohlc[endIndex].low - computeATR5(ohlc),
    pt2: ohlc[endIndex].low - computeATR5(ohlc) * 2,
    stopLoss: Math.max(...ohlc.slice(-10).map(x => x.high)),
    strengthWeight: 0.7
  };
}

export function detectFallingWedge(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 20) return null;
  const maxima = findLocalMaxima(ohlc);
  const minima = findLocalMinima(ohlc);
  if (maxima.length < 2 || minima.length < 2) return null;

  const highPoints = maxima.slice(-3).map(i => ({ x: i, y: ohlc[i].high }));
  const lowPoints = minima.slice(-3).map(i => ({ x: i, y: ohlc[i].low }));

  const highTrend = calculateTrendline(highPoints);
  const lowTrend = calculateTrendline(lowPoints);

  const bothFalling = highTrend.slope < 0 && lowTrend.slope < 0;
  const converging = highTrend.slope > lowTrend.slope;

  if (bothFalling && converging) {
    const startIdx = Math.min(...maxima.slice(-3), ...minima.slice(-3));
    const endIdx = ohlc.length - 1;
    const gapStart = (highTrend.slope * startIdx + highTrend.intercept) - (lowTrend.slope * startIdx + lowTrend.intercept);
    const gapEnd = (highTrend.slope * endIdx + highTrend.intercept) - (lowTrend.slope * endIdx + lowTrend.intercept);

    if (gapStart <= 0 || gapEnd <= 0 || gapEnd >= gapStart * 0.85) return null;

    return {
      name: 'Falling Wedge',
      type: 'bullish',
      category: 'reversal',
      confidence: 70,
      description: 'Bullish reversal - converging downward trendlines suggest weakening selling pressure',
      startIndex: startIdx,
      endIndex: endIdx,
      pt1: ohlc[ohlc.length - 1].high + computeATR5(ohlc),
      pt2: ohlc[ohlc.length - 1].high + computeATR5(ohlc) * 2,
      stopLoss: Math.min(...ohlc.slice(-10).map(x => x.low)),
      strengthWeight: 0.7
    };
  }
  return null;
}

export function detectDiamondTop(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 28) return null;

  const lastIndex = ohlc.length - 1;
  const averageRange = Math.max(avgRange(ohlc, 20), Math.abs(ohlc[lastIndex].close) * 0.0001);
  const windowLengths = [18, 22, 26, 30];

  for (const windowLength of windowLengths) {
    const startIndex = lastIndex - windowLength + 1;
    if (startIndex < 8) continue;

    const priorStart = Math.max(0, startIndex - 12);
    const priorRise = ohlc[startIndex].close - ohlc[priorStart].close;
    if (priorRise < averageRange * 1.25) continue;

    const slice = ohlc.slice(startIndex, lastIndex + 1);
    const shoulderLength = Math.max(4, Math.floor(slice.length * 0.25));
    const left = slice.slice(0, shoulderLength);
    const middle = slice.slice(shoulderLength, slice.length - shoulderLength);
    const right = slice.slice(-shoulderLength);
    if (middle.length < 6) continue;

    const envelopeWidth = (candles: OHLC[]) =>
      Math.max(...candles.map(candle => candle.high)) - Math.min(...candles.map(candle => candle.low));
    const leftWidth = envelopeWidth(left);
    const middleWidth = envelopeWidth(middle);
    const rightWidth = envelopeWidth(right);

    if (middleWidth < leftWidth * 1.25 || middleWidth < rightWidth * 1.35) continue;
    if (rightWidth > middleWidth * 0.72) continue;

    const middleOffset = startIndex + shoulderLength;
    const peakOffset = middle.findIndex(candle => candle.high === Math.max(...middle.map(candle => candle.high)));
    const troughOffset = middle.findIndex(candle => candle.low === Math.min(...middle.map(candle => candle.low)));
    const peakIndex = middleOffset + peakOffset;
    const troughIndex = middleOffset + troughOffset;
    if (Math.abs(peakIndex - troughIndex) < 2) continue;

    const leftCenter = average(left.slice(0, 3).map(candle => (candle.high + candle.low) / 2));
    const rightBase = right.slice(0, Math.max(2, right.length - 1));
    const rightCenter = average(rightBase.map(candle => (candle.high + candle.low) / 2));
    const peak = ohlc[peakIndex].high;
    const trough = ohlc[troughIndex].low;
    if (peak - Math.max(leftCenter, rightCenter) < averageRange * 0.8) continue;
    if (Math.min(leftCenter, rightCenter) - trough < averageRange * 0.8) continue;

    const rightNeckIndex = Math.max(troughIndex + 1, lastIndex - 1);
    if (rightNeckIndex >= lastIndex) continue;
    const rightNeckLow = Math.min(ohlc[rightNeckIndex].open, ohlc[rightNeckIndex].close);
    const supportSlope = (rightNeckLow - trough) / Math.max(1, rightNeckIndex - troughIndex);
    const projectedSupport = trough + supportSlope * (lastIndex - troughIndex);
    const last = ohlc[lastIndex];
    const formed = isBearish(last) && last.close < projectedSupport - averageRange * 0.05;
    const height = peak - trough;
    const confidence = formed ? 82 : 68;

    return {
      name: formed ? 'Diamond Top' : 'Diamond Top (forming)',
      type: 'bearish',
      category: 'reversal',
      confidence,
      description: formed
        ? 'Diamond top confirmed by a bearish break below the contracting support boundary.'
        : 'Diamond top forming as volatility expands and then contracts after an advance.',
      startIndex,
      endIndex: lastIndex,
      priceTarget: projectedSupport - height,
      pt1: projectedSupport - height * 0.5,
      pt2: projectedSupport - height,
      stopLoss: peak,
      strengthWeight: confidence / 100,
    };
  }

  return null;
}

export function detectFlag(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 20) return null;

  const ar = avgRange(ohlc, 20);

  // 1. Detect dynamic pole using momentum + swing structure
  function detectPole() {
    const lookback = Math.min(60, ohlc.length - 1);
    let bestStart = null;
    let bestEnd = null;
    let bestMove = 0;

    for (let i = ohlc.length - lookback; i < ohlc.length - 5; i++) {
      for (let j = i + 3; j < ohlc.length - 2; j++) {
        const move = ohlc[j].close - ohlc[i].close;
        const dist = Math.abs(move);

        // Require real impulse
        if (dist < ar * 2.2) continue;

        // Require monotonic-ish movement
        const slice = ohlc.slice(i, j + 1);
        const greenRatio = slice.filter(c => c.close > c.open).length / slice.length;
        const redRatio = slice.filter(c => c.close < c.open).length / slice.length;
        const directionalRatio = move >= 0 ? greenRatio : redRatio;
        if (directionalRatio < 0.55) continue;

        if (dist > Math.abs(bestMove)) {
          bestMove = move;
          bestStart = i;
          bestEnd = j;
        }
      }
    }

    if (bestStart === null) return null;

    return {
      start: bestStart,
      end: bestEnd,
      move: bestMove,
      isBull: bestMove > 0
    };
  }

  const pole = detectPole();
  if (!pole) return null;
  if (pole.end == null) return null;

  // 2. Detect consolidation window (flag start)
  const poleEnd = pole.end;
  const flagStart = poleEnd + 1;
  if (flagStart >= ohlc.length - 3) return null;

  const fullFlagSlice = ohlc.slice(flagStart);
  const consolidationSlice = fullFlagSlice.length > 4 ? fullFlagSlice.slice(0, -1) : fullFlagSlice;
  if (consolidationSlice.length < 3) return null;
  const flagRanges = consolidationSlice.map(c => totalRange(c));

  // Require volatility contraction
  const avgFlagRange = average(flagRanges);
  if (avgFlagRange > Math.abs(pole.move) * 0.35) return null;

  const poleSlice = ohlc.slice(pole.start, poleEnd + 1);
  const poleTop = Math.max(...poleSlice.map(c => c.high));
  const poleBottom = Math.min(...poleSlice.map(c => c.low));
  const consHigh = Math.max(...consolidationSlice.map(c => c.high));
  const consLow = Math.min(...consolidationSlice.map(c => c.low));
  const retrace = pole.isBull
    ? (poleTop - consLow) / Math.max(Math.abs(pole.move), 1e-6)
    : (consHigh - poleBottom) / Math.max(Math.abs(pole.move), 1e-6);
  if (retrace > 0.66) return null;

  // 3. Build swing-filtered highs/lows for clean channel geometry
  function getSwings(data: OHLC[], type: 'high' | 'low') {
    const arr = [];
    for (let i = 1; i < data.length - 1; i++) {
      if (type === 'high') {
        if (data[i].high > data[i - 1].high && data[i].high > data[i + 1].high) {
          arr.push({ x: i, y: data[i].high });
        }
      } else {
        if (data[i].low < data[i - 1].low && data[i].low < data[i + 1].low) {
          arr.push({ x: i, y: data[i].low });
        }
      }
    }
    return arr;
  }

  const swingHighs = getSwings(consolidationSlice, 'high');
  const swingLows = getSwings(consolidationSlice, 'low');

  if (swingHighs.length < 2 || swingLows.length < 2) return null;

  const upperTL = calculateTrendline(swingHighs);
  const lowerTL = calculateTrendline(swingLows);

  // 4. Validate counter-trend channel
  const isBull = pole.isBull;
  const slopesDown = upperTL.slope < 0 && lowerTL.slope < 0;
  const slopesUp = upperTL.slope > 0 && lowerTL.slope > 0;

  if (isBull && !slopesDown) return null;
  if (!isBull && !slopesUp) return null;

  // Require parallelism
  if (Math.abs(upperTL.slope - lowerTL.slope) > ar * 0.02) return null;

  // 5. Breakout + invalidation
  const last = ohlc[ohlc.length - 1];
  const lastX = consolidationSlice.length;

  const upperAtLast = upperTL.slope * lastX + upperTL.intercept;
  const lowerAtLast = lowerTL.slope * lastX + lowerTL.intercept;

  const breakout = isBull ? last.close > upperAtLast : last.close < lowerAtLast;

  const stopLoss = isBull
    ? Math.min(...consolidationSlice.map(c => c.low))
    : Math.max(...consolidationSlice.map(c => c.high));

  const pt1 = last.close + (isBull ? pole.move * 0.5 : -pole.move * 0.5);
  const pt2 = last.close + (isBull ? pole.move : -pole.move);

  return {
    name: `${isBull ? 'Bull' : 'Bear'} Flag`,
    type: isBull ? 'bullish' : 'bearish',
    category: 'continuation',
    confidence: breakout ? 85 : 68,
    description: breakout
      ? `${isBull ? 'Bullish' : 'Bearish'} continuation pattern with clean impulse, tight consolidation, and confirmed break.`
      : `${isBull ? 'Bullish' : 'Bearish'} flag is forming after a clean impulse; wait for the channel boundary to break.`,
    startIndex: pole.start,
    endIndex: ohlc.length - 1,
    priceTarget: pt2,
    pt1,
    pt2,
    stopLoss,
    strengthWeight: breakout ? 0.92 : 0.68
  };
}


export function detectChannelUp(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 20) return null;
  const maxima = findLocalMaxima(ohlc);
  const minima = findLocalMinima(ohlc);
  if (maxima.length < 2 || minima.length < 2) return null;

  const highPoints = maxima.slice(-3).map(i => ({ x: i, y: ohlc[i].high }));
  const lowPoints = minima.slice(-3).map(i => ({ x: i, y: ohlc[i].low }));

  const highTrend = calculateTrendline(highPoints);
  const lowTrend = calculateTrendline(lowPoints);

  const parallel = Math.abs(highTrend.slope - lowTrend.slope) < 0.01;
  const rising = highTrend.slope > 0 && lowTrend.slope > 0;

  if (parallel && rising) {
    return {
      name: 'Channel Up',
      type: 'bullish',
      category: 'continuation',
      confidence: 65,
      description: 'Bullish trend channel with parallel rising support and resistance',
      startIndex: Math.min(...maxima.slice(-3), ...minima.slice(-3)),
      endIndex: ohlc.length - 1,
      pt1: ohlc[ohlc.length - 1].high + computeATR5(ohlc),
      pt2: ohlc[ohlc.length - 1].high + computeATR5(ohlc) * 2,
      stopLoss: Math.min(...ohlc.slice(-10).map(x => x.low)),
      strengthWeight: 0.65
    };
  }
  return null;
}

export function detectChannelDown(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 20) return null;
  const maxima = findLocalMaxima(ohlc);
  const minima = findLocalMinima(ohlc);
  if (maxima.length < 2 || minima.length < 2) return null;

  const highPoints = maxima.slice(-3).map(i => ({ x: i, y: ohlc[i].high }));
  const lowPoints = minima.slice(-3).map(i => ({ x: i, y: ohlc[i].low }));

  const highTrend = calculateTrendline(highPoints);
  const lowTrend = calculateTrendline(lowPoints);

  const parallel = Math.abs(highTrend.slope - lowTrend.slope) < 0.01;
  const falling = highTrend.slope < 0 && lowTrend.slope < 0;

  if (parallel && falling) {
    return {
      name: 'Channel Down',
      type: 'bearish',
      category: 'continuation',
      confidence: 65,
      description: 'Bearish trend channel with parallel falling support and resistance',
      startIndex: Math.min(...maxima.slice(-3), ...minima.slice(-3)),
      endIndex: ohlc.length - 1,
      pt1: ohlc[ohlc.length - 1].low - computeATR5(ohlc),
      pt2: ohlc[ohlc.length - 1].low - computeATR5(ohlc) * 2,
      stopLoss: Math.max(...ohlc.slice(-10).map(x => x.high)),
      strengthWeight: 0.65
    };
  }
  return null;
}

export function detectCupAndHandle(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 40) return null;

  const minima = findLocalMinima(ohlc, 3);
  const maxima = findLocalMaxima(ohlc, 3);
  if (minima.length < 1 || maxima.length < 2) return null;

  const cupBottom = minima[minima.length - 1];
  const leftRim = maxima.find(m => m < cupBottom);
  const rightRim = maxima.find(m => m > cupBottom);

  if (leftRim == null || rightRim == null) return null;

  const leftHigh = ohlc[leftRim].high;
  const rightHigh = ohlc[rightRim].high;
  const bottomLow = ohlc[cupBottom].low;

  const rimsMatch = Math.abs(leftHigh - rightHigh) < avgRange(ohlc) * 0.05;
  const cupDepth = (leftHigh + rightHigh) / 2 - bottomLow;
  const validCup = cupDepth > avgRange(ohlc) * 2;

  if (rimsMatch && validCup) {
    const handleArea = ohlc.slice(rightRim);
    const handleLow = Math.min(...handleArea.map(c => c.low));
    const handleValid = handleLow > bottomLow && handleLow < rightHigh;

    if (handleValid && handleArea.length >= 3) {
      return {
        name: 'Cup and Handle',
        type: 'bullish',
        category: 'continuation',
        confidence: 80,
        description: 'Bullish continuation - rounded bottom with handle consolidation',
        startIndex: leftRim,
        endIndex: ohlc.length - 1,
        priceTarget: rightHigh + cupDepth,
        pt1: rightHigh,
        pt2: rightHigh + cupDepth,
        stopLoss: handleLow,
        strengthWeight: 0.8
      };
    }
  }
  return null;
}

/* =========================
   Volatility / regime patterns
   ========================= */

export function detectVolatilitySqueeze(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 30) return null;
  const ranges = ohlc.map(totalRange);
  const recent = ranges.slice(-10);
  const allAvg = average(ranges.slice(-20));
  const recentAvg = average(recent);
  if (!allAvg) return null;

  if (recentAvg < allAvg * 0.6) {
    return {
      name: 'Volatility Squeeze',
      type: 'neutral',
      category: 'volatility',
      confidence: 65,
      description: 'Compressed volatility regime - potential for expansion',
      startIndex: ohlc.length - recent.length,
      endIndex: ohlc.length - 1,
      pt1: ohlc[ohlc.length - 1].close + computeATR5(ohlc),
      pt2: ohlc[ohlc.length - 1].close + computeATR5(ohlc) * 2,
      stopLoss: ohlc[ohlc.length - 1].close - computeATR5(ohlc),
      strengthWeight: 0.65
    };
  }
  return null;
}

export function detectSwingFailurePattern(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 10) return null;
  const i = ohlc.length - 1;
  const c = ohlc[i];

  const maxima = findLocalMaxima(ohlc, 3);
  const minima = findLocalMinima(ohlc, 3);
  const lastMax = maxima[maxima.length - 1];
  const lastMin = minima[minima.length - 1];

  const tol = avgRange(ohlc) * 0.1;

  if (lastMax !== undefined && i === lastMax) {
    const priorHigh = Math.max(...ohlc.slice(0, lastMax).map(x => x.high));
    const swept = c.high > priorHigh + tol;
    const closeBackInside = c.close < priorHigh;
    const trend = inferTrendBias(ohlc);
    if (swept && closeBackInside && trend === 'bullish') {
      return {
        name: 'Bearish Swing Failure Pattern',
        type: 'bearish',
        category: 'liquidity',
        confidence: 80,
        description: 'Liquidity sweep above prior highs followed by close back below – bearish reversal',
        startIndex: lastMax,
        endIndex: i,
        pt1: c.low,
        pt2: c.low - (priorHigh - c.low),
        stopLoss: c.high,
        strengthWeight: 0.8
      };
    }
  }

  if (lastMin !== undefined && i === lastMin) {
    const priorLow = Math.min(...ohlc.slice(0, lastMin).map(x => x.low));
    const swept = c.low < priorLow - tol;
    const closeBackInside = c.close > priorLow;
    const trend = inferTrendBias(ohlc);
    if (swept && closeBackInside && trend === 'bearish') {
      return {
        name: 'Bullish Swing Failure Pattern',
        type: 'bullish',
        category: 'liquidity',
        confidence: 80,
        description: 'Liquidity sweep below prior lows followed by close back above – bullish reversal',
        startIndex: lastMin,
        endIndex: i,
        pt1: c.high,
        pt2: c.high + (c.high - priorLow),
        stopLoss: c.low,
        strengthWeight: 0.8
      };
    }
  }

  return null;
}

export function detectBreakoutFailureReversal(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 25) return null;
  const i = ohlc.length - 1;
  const lookback = 20;
  // The range must end before the breakout candle; including `prev` makes a close above its own high impossible.
  const slice = ohlc.slice(-lookback - 2, -2);

  const rangeHigh = Math.max(...slice.map(c => c.high));
  const rangeLow = Math.min(...slice.map(c => c.low));

  const prev = ohlc[i - 1];
  const curr = ohlc[i];

  const brokeUp = prev.close > rangeHigh;
  const failedUp = brokeUp && curr.close < rangeHigh;

  const brokeDown = prev.close < rangeLow;
  const failedDown = brokeDown && curr.close > rangeLow;

  const trend = inferTrendBias(ohlc);

  if (failedUp && trend === 'bullish') {
    return {
      name: 'Bearish Breakout Failure Reversal',
      type: 'bearish',
      category: 'reversal',
      confidence: 75,
      description: 'Failed upside breakout – price closes back inside prior range',
      startIndex: ohlc.length - lookback - 1,
      endIndex: i,
      pt1: rangeLow,
      pt2: rangeLow - (rangeHigh - rangeLow) * 0.5,
      stopLoss: rangeHigh,
      strengthWeight: 0.75
    };
  }

  if (failedDown && trend === 'bearish') {
    return {
      name: 'Bullish Breakout Failure Reversal',
      type: 'bullish',
      category: 'reversal',
      confidence: 75,
      description: 'Failed downside breakout – price closes back inside prior range',
      startIndex: ohlc.length - lookback - 1,
      endIndex: i,
      pt1: rangeHigh,
      pt2: rangeHigh + (rangeHigh - rangeLow) * 0.5,
      stopLoss: rangeLow,
      strengthWeight: 0.75
    };
  }

  return null;
}

export function detectLiquidityGrabReversal(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 6) return null;
  const i = ohlc.length - 1;
  const c = ohlc[i];

  const recent = ohlc.slice(-6, -1);
  const priorHigh = Math.max(...recent.map(x => x.high));
  const priorLow = Math.min(...recent.map(x => x.low));
  const tol = avgRange(ohlc) * 0.05;

  const sweepHigh = c.high > priorHigh + tol && c.close < priorHigh;
  const sweepLow = c.low < priorLow - tol && c.close > priorLow;

  const trend = inferTrendBias(ohlc);

  if (sweepHigh && trend === 'bullish') {
    return {
      name: 'Bearish Liquidity Grab',
      type: 'bearish',
      category: 'liquidity',
      confidence: 70,
      description: 'Wick takes liquidity above recent highs then closes back below',
      startIndex: i,
      endIndex: i
    };
  }

  if (sweepLow && trend === 'bearish') {
    return {
      name: 'Bullish Liquidity Grab',
      type: 'bullish',
      category: 'liquidity',
      confidence: 70,
      description: 'Wick takes liquidity below recent lows then closes back above',
      startIndex: i,
      endIndex: i
    };
  }

  return null;
}

export function detectVolumeClimaxReversal(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 10) return null;
  const i = ohlc.length - 1;
  const c = ohlc[i];

  const avgVol = avgVolume(ohlc, 20);
  if (avgVol === 0) return null;

  const isClimax = c.volume > avgVol * 2.5;

  const trend = inferTrendBias(ohlc);
  const body = bodySize(c);
  const upper = upperWick(c);
  const lower = lowerWick(c);

  if (!isClimax) return null;

  if (trend === 'bullish' && upper > body * 1.5 && isBearish(c)) {
    return {
      name: 'Bearish Volume Climax Reversal',
      type: 'bearish',
      category: 'volatility',
      confidence: 75,
      description: 'High volume blow-off top with long upper wick after an uptrend',
      startIndex: i,
      endIndex: i
    };
  }

  if (trend === 'bearish' && lower > body * 1.5 && isBullish(c)) {
    return {
      name: 'Bullish Volume Climax Reversal',
      type: 'bullish',
      category: 'volatility',
      confidence: 75,
      description: 'High volume capitulation low with long lower wick after a downtrend',
      startIndex: i,
      endIndex: i
    };
  }

  return null;
}

export function detectVWAPReversal(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 15) return null;
  const i = ohlc.length - 1;
  const c = ohlc[i];

  const vwap = computeVWAP(ohlc);
  const prev = ohlc[i - 1];

  const wasBelow = prev.close < vwap;
  const nowAbove = c.close > vwap;
  const wasAbove = prev.close > vwap;
  const nowBelow = c.close < vwap;

  const trend = inferTrendBias(ohlc);

  if (wasBelow && nowAbove && trend === 'bearish') {
    return {
      name: 'Bullish VWAP Reversal',
      type: 'bullish',
      category: 'reversal',
      confidence: 70,
      description: 'Price reclaims VWAP from below after a downtrend',
      startIndex: i - 1,
      endIndex: i
    };
  }

  if (wasAbove && nowBelow && trend === 'bullish') {
    return {
      name: 'Bearish VWAP Reversal',
      type: 'bearish',
      category: 'reversal',
      confidence: 70,
      description: 'Price loses VWAP from above after an uptrend',
      startIndex: i - 1,
      endIndex: i
    };
  }

  return null;
}

export function detectEMACompressionSnapReversal(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 30) return null;
  const closes = ohlc.map(c => c.close);
  const short = ema(closes.slice(-20), 9);
  const mid = ema(closes.slice(-20), 21);
  const long = ema(closes.slice(-20), 50);

  const i = ohlc.length - 1;
  const c = ohlc[i];

  const compressed = Math.max(short, mid, long) - Math.min(short, mid, long) < avgRange(ohlc) * 0.2;

  const strongMove = Math.abs(c.close - ohlc[i - 1].close) > avgRange(ohlc) * 0.8;

  const trend = inferTrendBias(ohlc);

  if (!compressed || !strongMove) return null;

  if (trend === 'bearish' && c.close > Math.max(short, mid, long)) {
    return {
      name: 'Bullish EMA Compression Snap',
      type: 'bullish',
      category: 'reversal',
      confidence: 75,
      description: 'Bullish reversal after EMA compression and strong upside snap',
      startIndex: i - 1,
      endIndex: i
    };
  }

  if (trend === 'bullish' && c.close < Math.min(short, mid, long)) {
    return {
      name: 'Bearish EMA Compression Snap',
      type: 'bearish',
      category: 'reversal',
      confidence: 75,
      description: 'Bearish reversal after EMA compression and strong downside snap',
      startIndex: i - 1,
      endIndex: i
    };
  }

  return null;
}

export function detectBullPennant(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 15) return null;
  const ar = avgRange(ohlc, 20);
  const windowConfigs = [
    { total: 15, poleLen: 5, consLen: 10 },
    { total: 20, poleLen: 8, consLen: 12 },
    { total: 25, poleLen: 10, consLen: 15 },
    { total: 30, poleLen: 12, consLen: 18 },
  ];
  for (const cfg of windowConfigs) {
    if (ohlc.length < cfg.total) continue;
    const poleStart = ohlc.length - cfg.total;
    const poleEnd = poleStart + cfg.poleLen - 1;
    const consStart = poleEnd + 1;
    const consEnd = Math.min(consStart + cfg.consLen - 1, ohlc.length - 1);
    if (consStart >= ohlc.length || consEnd - consStart + 1 < Math.max(6, cfg.consLen - 3)) continue;

    const poleMove = ohlc[poleEnd].close - ohlc[poleStart].close;
    if (poleMove <= 0 || poleMove < ar * 2.2) continue;

    const poleSlice = ohlc.slice(poleStart, poleEnd + 1);
    const poleBullRatio = poleSlice.filter(c => c.close > c.open).length / Math.max(1, poleSlice.length);
    if (poleBullRatio < 0.58) continue;

    const consolidation = ohlc.slice(consStart, consEnd + 1);
    const poleTop = Math.max(...ohlc.slice(poleStart, poleEnd + 1).map(c => c.high));
    const consLow = Math.min(...consolidation.map(c => c.low));
    const consHigh = Math.max(...consolidation.map(c => c.high));
    const retrace = (poleTop - consLow) / Math.max(poleMove, 1e-6);
    const poleRange = Math.max(...poleSlice.map(c => c.high)) - Math.min(...poleSlice.map(c => c.low));
    const consRange = consHigh - consLow;

    if (retrace > 0.68) continue;
    if (consRange > poleRange * 0.62) continue;
    if (consHigh > poleTop + ar * 0.25) continue;

    const highs = consolidation.map((c, j) => ({ x: j, y: c.high }));
    const lows = consolidation.map((c, j) => ({ x: j, y: c.low }));
    const upperTL = calculateTrendline(highs);
    const lowerTL = calculateTrendline(lows);
    const converging = upperTL.slope < 0 && lowerTL.slope > 0;
    const semiConverging = (upperTL.slope < 0 && Math.abs(lowerTL.slope) < ar * 0.15) ||
                 (lowerTL.slope > 0 && Math.abs(upperTL.slope) < ar * 0.15);
    if (!converging && !semiConverging) continue;

    const gapStart = (upperTL.slope * 0 + upperTL.intercept) - (lowerTL.slope * 0 + lowerTL.intercept);
    const gapEndX = consolidation.length - 1;
    const gapEnd = (upperTL.slope * gapEndX + upperTL.intercept) - (lowerTL.slope * gapEndX + lowerTL.intercept);
    if (gapStart <= 0 || gapEnd <= 0 || gapEnd >= gapStart * 0.92) continue;

    const recentTrend = inferTrendBias(ohlc.slice(Math.max(0, poleStart), ohlc.length));
    if (recentTrend === 'bearish') continue;

    const last = consolidation[consolidation.length - 1];
    const consMid = (consHigh + consLow) / 2;
    if (last.close < consMid - ar * 0.05) continue;

    return {
      name: 'Bull Pennant',
      type: 'bullish',
      category: 'continuation',
      confidence: converging ? 72 : 65,
      description: 'Consolidation with converging trendlines after strong upward move',
      startIndex: poleStart,
      endIndex: ohlc.length - 1,
      priceTarget: ohlc[ohlc.length - 1].close + poleMove,
      pt1: ohlc[ohlc.length - 1].close + poleMove * 0.5,
      pt2: ohlc[ohlc.length - 1].close + poleMove,
      stopLoss: Math.min(...consolidation.map(c => c.low)),
      strengthWeight: converging ? 0.72 : 0.65
    };
  }
  return null;
}

export function detectBearPennant(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 15) return null;
  const ar = avgRange(ohlc, 20);
  const windowConfigs = [
    { total: 15, poleLen: 5, consLen: 10 },
    { total: 20, poleLen: 8, consLen: 12 },
    { total: 25, poleLen: 10, consLen: 15 },
    { total: 30, poleLen: 12, consLen: 18 },
  ];
  for (const cfg of windowConfigs) {
    if (ohlc.length < cfg.total) continue;
    const poleStart = ohlc.length - cfg.total;
    const poleEnd = poleStart + cfg.poleLen - 1;
    const consStart = poleEnd + 1;
    const consEnd = Math.min(consStart + cfg.consLen - 1, ohlc.length - 1);
    if (consStart >= ohlc.length || consEnd - consStart + 1 < Math.max(6, cfg.consLen - 3)) continue;

    const poleMove = ohlc[poleStart].close - ohlc[poleEnd].close;
    if (poleMove <= 0 || poleMove < ar * 2.0) continue;

    const poleSlice = ohlc.slice(poleStart, poleEnd + 1);
    const poleBearRatio = poleSlice.filter(c => c.close < c.open).length / Math.max(1, poleSlice.length);
    if (poleBearRatio < 0.58) continue;

    const consolidation = ohlc.slice(consStart, consEnd + 1);
    const poleBottom = Math.min(...ohlc.slice(poleStart, poleEnd + 1).map(c => c.low));
    const poleTop = Math.max(...ohlc.slice(poleStart, poleEnd + 1).map(c => c.high));
    const consLow = Math.min(...consolidation.map(c => c.low));
    const consHigh = Math.max(...consolidation.map(c => c.high));
    const retrace = (consHigh - poleBottom) / Math.max(poleMove, 1e-6);
    const poleRange = Math.max(...poleSlice.map(c => c.high)) - Math.min(...poleSlice.map(c => c.low));
    const consRange = consHigh - consLow;

    if (retrace > 0.62) continue;
    if (consRange > poleRange * 0.62) continue;
    if (consLow < poleBottom - ar * 0.25) continue;

    const highs = consolidation.map((c, j) => ({ x: j, y: c.high }));
    const lows = consolidation.map((c, j) => ({ x: j, y: c.low }));
    const upperTL = calculateTrendline(highs);
    const lowerTL = calculateTrendline(lows);
    const converging = upperTL.slope < 0 && lowerTL.slope > 0;
    const semiConverging = (upperTL.slope < 0 && Math.abs(lowerTL.slope) < ar * 0.15) ||
                 (lowerTL.slope > 0 && Math.abs(upperTL.slope) < ar * 0.15);
    if (!converging && !semiConverging) continue;

    const gapStart = (upperTL.slope * 0 + upperTL.intercept) - (lowerTL.slope * 0 + lowerTL.intercept);
    const gapEndX = consolidation.length - 1;
    const gapEnd = (upperTL.slope * gapEndX + upperTL.intercept) - (lowerTL.slope * gapEndX + lowerTL.intercept);
    if (gapStart <= 0 || gapEnd <= 0 || gapEnd >= gapStart * 0.92) continue;

    const recentTrend = inferTrendBias(ohlc.slice(Math.max(0, poleStart), ohlc.length));
    if (recentTrend === 'bullish') continue;

    const last = consolidation[consolidation.length - 1];
    const consMid = (consHigh + consLow) / 2;
    if (last.close > consMid + ar * 0.05) continue;
    if (last.close > poleTop - poleMove * 0.35) continue;

    return {
      name: 'Bear Pennant',
      type: 'bearish',
      category: 'continuation',
      confidence: converging ? 72 : 65,
      description: 'Consolidation with converging trendlines after strong downward move',
      startIndex: poleStart,
      endIndex: ohlc.length - 1,
      priceTarget: ohlc[ohlc.length - 1].close - poleMove,
      pt1: ohlc[ohlc.length - 1].close - poleMove * 0.5,
      pt2: ohlc[ohlc.length - 1].close - poleMove,
      stopLoss: Math.max(...consolidation.map(c => c.high)),
      strengthWeight: converging ? 0.72 : 0.65
    };
  }
  return null;
}

export function detectHorizontalChannel(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 20) return null;
  const lookback = Math.min(30, ohlc.length);
  const slice = ohlc.slice(-lookback);
  const highs = slice.map(c => c.high);
  const lows = slice.map(c => c.low);
  const resistance = Math.max(...highs);
  const support = Math.min(...lows);
  const range = resistance - support;
  if (range < 0.001) return null;
  const avgR = avgRange(ohlc, lookback);
  if (range < avgR * 1.5) return null;
  const highPoints = slice.map((c, j) => ({ x: j, y: c.high }));
  const lowPoints = slice.map((c, j) => ({ x: j, y: c.low }));
  const upperTL = calculateTrendline(highPoints);
  const lowerTL = calculateTrendline(lowPoints);
  const isFlat = Math.abs(upperTL.slope) < avgR * 0.015 && Math.abs(lowerTL.slope) < avgR * 0.015;
  if (!isFlat) return null;
  let rTouches = 0, sTouches = 0;
  let lastRT = -3, lastST = -3;
  for (let j = 0; j < slice.length; j++) {
    if (slice[j].high > resistance - range * 0.04 && j - lastRT >= 3) { rTouches++; lastRT = j; }
    if (slice[j].low < support + range * 0.04 && j - lastST >= 3) { sTouches++; lastST = j; }
  }
  if (rTouches < 2 || sTouches < 2) return null;
  return {
    name: 'Horizontal Channel',
    type: 'neutral',
    category: 'continuation',
    confidence: 65,
    description: `Price oscillating between flat support (${support.toFixed(2)}) and resistance (${resistance.toFixed(2)})`,
    startIndex: ohlc.length - lookback,
    endIndex: ohlc.length - 1,
    pt1: resistance,
    pt2: resistance + range * 0.5,
    stopLoss: support,
    strengthWeight: 0.65
  };
}

export function detectTripleTop(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 30) return null;
  const maxima = findLocalMaxima(ohlc, 5);
  if (maxima.length < 3) return null;
  const tops = maxima.slice(-4);
  if (tops.length < 3) return null;
  const candidates = tops.slice(-3);
  const prices = candidates.map(idx => ohlc[idx].high);
  const avg = average(prices);
  const tolerance = avgRange(ohlc) * 0.15;
  const allNear = prices.every(p => Math.abs(p - avg) < tolerance);
  if (!allNear) return null;
  const span = candidates[2] - candidates[0];
  if (span < 8) return null;
  for (let k = 0; k < 2; k++) {
    const valley = Math.min(...ohlc.slice(candidates[k], candidates[k+1] + 1).map(c => c.low));
    if (valley > avg - tolerance * 0.5) return null;
  }
  const i = ohlc.length - 1;
  const lastClose = ohlc[i].close;
  if (lastClose >= avg) return null;
  return {
    name: 'Triple Top',
    type: 'bearish',
    category: 'breakout',
    confidence: 80,
    description: 'Three peaks at similar resistance level suggesting bearish reversal',
    startIndex: candidates[0],
    endIndex: i,
    priceTarget: lastClose - (avg - lastClose)
  };
}

export function detectTripleBottom(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 30) return null;
  const minima = findLocalMinima(ohlc, 5);
  if (minima.length < 3) return null;
  const candidates = minima.slice(-3);
  const prices = candidates.map(idx => ohlc[idx].low);
  const avg = average(prices);
  const ar = avgRange(ohlc, 20);
  const tolerance = Math.max(ar * 0.16, average(ohlc.slice(-60).map(c => c.close)) * 0.0035);
  const allNear = prices.every(p => Math.abs(p - avg) < tolerance);
  if (!allNear) return null;
  const span = candidates[2] - candidates[0];
  if (span < 10) return null;

  const priorTrend = inferTrendBias(ohlc.slice(Math.max(0, candidates[0] - 25), candidates[0] + 1));
  if (priorTrend === 'bullish') return null;

  const peak1 = Math.max(...ohlc.slice(candidates[0], candidates[1] + 1).map(c => c.high));
  const peak2 = Math.max(...ohlc.slice(candidates[1], candidates[2] + 1).map(c => c.high));
  if (peak1 < avg + tolerance * 0.7 || peak2 < avg + tolerance * 0.7) return null;
  const neckline = Math.max(peak1, peak2);

  const floor = Math.min(...prices);
  const measuredMove = neckline - floor;
  if (measuredMove < ar) return null;

  const i = ohlc.length - 1;
  const lastClose = ohlc[i].close;
  const breakoutConfirmed = lastClose > neckline + ar * 0.08;
  const nearBreakout = lastClose > neckline - ar * 0.24 && ohlc[i].close > ohlc[Math.max(0, i - 1)].close;
  if (!breakoutConfirmed && !nearBreakout) return null;

  const confidence = breakoutConfirmed ? 82 : 72;
  return {
    name: 'Triple Bottom',
    type: 'bullish',
    category: 'reversal',
    confidence,
    description: breakoutConfirmed
      ? 'Triple bottom confirmed - three support holds with neckline breakout'
      : 'Triple bottom forming - repeated support holds near neckline',
    startIndex: candidates[0],
    endIndex: i,
    priceTarget: neckline + measuredMove,
    pt1: neckline,
    pt2: neckline + measuredMove,
    stopLoss: floor - ar * 0.08,
    strengthWeight: confidence / 100,
  };
}

function fitQuadratic(values: number[]): { a: number; b: number; c: number; r2: number } {
  const n = values.length;
  if (n < 3) return { a: 0, b: 0, c: values[0] ?? 0, r2: 0 };

  let sumX = 0, sumX2 = 0, sumX3 = 0, sumX4 = 0;
  let sumY = 0, sumXY = 0, sumX2Y = 0;

  for (let i = 0; i < n; i++) {
    const x = i;
    const x2 = x * x;
    const x3 = x2 * x;
    const x4 = x3 * x;
    const y = values[i];
    sumX += x;
    sumX2 += x2;
    sumX3 += x3;
    sumX4 += x4;
    sumY += y;
    sumXY += x * y;
    sumX2Y += x2 * y;
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

function countDirectionalProgress(
  values: number[],
  startIndex: number,
  direction: 'higher' | 'lower',
  tolerance: number,
): number {
  let count = 0;
  for (let index = startIndex; index < values.length - 1; index++) {
    const change = values[index + 1] - values[index];
    if (direction === 'higher' ? change >= -tolerance : change <= tolerance) count++;
  }
  return count;
}

export function detectRoundedBottom(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 20) return null;
  for (const len of [20, 30, 40, 50, 60]) {
    if (ohlc.length < len) continue;
    const startIdx = ohlc.length - len;
    const slice = ohlc.slice(startIdx);

    const lows = slice.map(c => c.low);
    const troughLocalIdx = lows.indexOf(Math.min(...lows));

    const windowHalf = Math.max(4, Math.floor(len * 0.15));
    const windowStart = Math.max(0, troughLocalIdx - windowHalf);
    const windowEnd = Math.min(len - 1, troughLocalIdx + windowHalf);
    let troughIdx = windowStart;
    for (let j = windowStart; j <= windowEnd; j++) {
      if (slice[j].low < slice[troughIdx].low) troughIdx = j;
    }

    if (troughIdx < 3 || troughIdx > len - 4) continue;

    let isSurrounded = true;
    const lb = Math.min(4, troughIdx, len - 1 - troughIdx);
    for (let j = troughIdx - lb; j <= troughIdx + lb; j++) {
      if (j !== troughIdx && slice[j].low < slice[troughIdx].low) { isSurrounded = false; break; }
    }
    if (!isSurrounded) continue;

    const beforeLen = troughIdx;
    if (beforeLen >= 6) {
      const segSize = Math.floor(beforeLen / 3);
      const slopes: number[] = [];
      for (let seg = 0; seg < 3; seg++) {
        const segStart = seg * segSize;
        const segEnd = Math.min((seg + 1) * segSize, beforeLen);
        if (segEnd - segStart < 2) continue;
        let sX = 0, sY = 0, sXY = 0, sX2 = 0;
        const sN = segEnd - segStart;
        for (let j = segStart; j < segEnd; j++) {
          const x = j - segStart;
          sX += x; sY += slice[j].low; sXY += x * slice[j].low; sX2 += x * x;
        }
        const d = sN * sX2 - sX * sX;
        slopes.push(d !== 0 ? (sN * sXY - sX * sY) / d : 0);
      }
      if (slopes.length >= 2) {
        const allNeg = slopes.every(s => s <= 0.001 * Math.abs(slice[0].low));
        if (!allNeg) continue;
      }
    }

    const afterStart = troughIdx + 1;
    const afterLen = len - afterStart;
    const reversalTolerance = Math.max(avgRange(slice, Math.min(10, len)) * 0.15, Math.abs(slice[troughIdx].low) * 0.0002);
    const higherLowCount = countDirectionalProgress(lows, troughIdx, 'higher', reversalTolerance);
    const requiredHigherLows = Math.max(2, Math.floor((afterLen - 1) * 0.45));
    if (higherLowCount < requiredHigherLows) continue;

    const quadFit = fitQuadratic(lows);
    if (quadFit.a <= 0) continue;
    if (quadFit.r2 < 0.40) continue;

    const neckline = Math.max(slice[0].high, slice[len - 1].high);
    const troughLow = slice[troughIdx].low;
    const lastClose = slice[len - 1].close;
    const recovery = lastClose - troughLow;
    const depth = neckline - troughLow;

    let confidence = 55;
    if (quadFit.r2 >= 0.90) confidence += 15;
    else if (quadFit.r2 >= 0.80) confidence += 10;
    else confidence += 5;
    if (higherLowCount >= 5) confidence += 10;
    else if (higherLowCount >= 4) confidence += 7;
    else confidence += 4;
    if (depth > 0 && recovery / depth >= 0.7) confidence += 8;
    else if (depth > 0 && recovery / depth >= 0.4) confidence += 4;
    confidence = Math.min(92, Math.max(50, confidence));

    const breakConfirmed = lastClose > neckline;

    return {
      name: 'Rounded Bottom',
      type: 'bullish',
      category: 'breakout',
      confidence,
      description: `Rounded bottom ${breakConfirmed ? 'confirmed' : 'forming'} (a=${quadFit.a.toFixed(6)}, R²=${quadFit.r2.toFixed(3)}, neckline=${neckline.toFixed(2)}, higherLows=${higherLowCount}${breakConfirmed ? ', BREAK CONFIRMED' : ''})`,
      startIndex: startIdx,
      endIndex: ohlc.length - 1,
      priceTarget: neckline + (neckline - troughLow),
      stopLoss: troughLow,
      strengthWeight: confidence / 100,
    };
  }
  return null;
}

export function detectRoundedTop(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 20) return null;
  for (const len of [20, 30, 40, 50, 60]) {
    if (ohlc.length < len) continue;
    const startIdx = ohlc.length - len;
    const slice = ohlc.slice(startIdx);

    const highs = slice.map(c => c.high);
    const peakLocalIdx = highs.indexOf(Math.max(...highs));

    const windowHalf = Math.max(4, Math.floor(len * 0.15));
    const windowStart = Math.max(0, peakLocalIdx - windowHalf);
    const windowEnd = Math.min(len - 1, peakLocalIdx + windowHalf);
    let peakIdx = windowStart;
    for (let j = windowStart; j <= windowEnd; j++) {
      if (slice[j].high > slice[peakIdx].high) peakIdx = j;
    }

    if (peakIdx < 3 || peakIdx > len - 4) continue;

    let isSurrounded = true;
    const lb = Math.min(4, peakIdx, len - 1 - peakIdx);
    for (let j = peakIdx - lb; j <= peakIdx + lb; j++) {
      if (j !== peakIdx && slice[j].high > slice[peakIdx].high) { isSurrounded = false; break; }
    }
    if (!isSurrounded) continue;

    const beforeLen = peakIdx;
    if (beforeLen >= 6) {
      const segSize = Math.floor(beforeLen / 3);
      const slopes: number[] = [];
      for (let seg = 0; seg < 3; seg++) {
        const segStart = seg * segSize;
        const segEnd = Math.min((seg + 1) * segSize, beforeLen);
        if (segEnd - segStart < 2) continue;
        let sX = 0, sY = 0, sXY = 0, sX2 = 0;
        const sN = segEnd - segStart;
        for (let j = segStart; j < segEnd; j++) {
          const x = j - segStart;
          sX += x; sY += slice[j].high; sXY += x * slice[j].high; sX2 += x * x;
        }
        const d = sN * sX2 - sX * sX;
        slopes.push(d !== 0 ? (sN * sXY - sX * sY) / d : 0);
      }
      if (slopes.length >= 2) {
        const allPos = slopes.every(s => s >= -0.001 * Math.abs(slice[0].high));
        if (!allPos) continue;
        let decelerating = false;
        for (let k = 1; k < slopes.length; k++) {
          if (slopes[k] < slopes[k - 1]) { decelerating = true; break; }
        }
        if (!decelerating && slopes.length >= 3) continue;
      }
    }

    const afterStart = peakIdx + 1;
    const afterLen = len - afterStart;
    const reversalTolerance = Math.max(avgRange(slice, Math.min(10, len)) * 0.15, Math.abs(slice[peakIdx].high) * 0.0002);
    const lowerHighCount = countDirectionalProgress(highs, peakIdx, 'lower', reversalTolerance);
    const requiredLowerHighs = Math.max(2, Math.floor((afterLen - 1) * 0.45));
    if (lowerHighCount < requiredLowerHighs) continue;

    const quadFit = fitQuadratic(highs);
    if (quadFit.a >= 0) continue;
    if (quadFit.r2 < 0.40) continue;

    const neckline = Math.min(slice[0].low, slice[len - 1].low);
    const peakHigh = slice[peakIdx].high;
    const lastClose = slice[len - 1].close;
    const decline = peakHigh - lastClose;
    const height = peakHigh - neckline;

    let confidence = 55;
    if (quadFit.r2 >= 0.90) confidence += 15;
    else if (quadFit.r2 >= 0.80) confidence += 10;
    else confidence += 5;
    if (lowerHighCount >= 5) confidence += 10;
    else if (lowerHighCount >= 4) confidence += 7;
    else confidence += 4;
    if (height > 0 && decline / height >= 0.7) confidence += 8;
    else if (height > 0 && decline / height >= 0.4) confidence += 4;
    confidence = Math.min(92, Math.max(50, confidence));

    const breakConfirmed = lastClose < neckline;

    return {
      name: 'Rounded Top',
      type: 'bearish',
      category: 'breakout',
      confidence,
      description: `Rounded top ${breakConfirmed ? 'confirmed' : 'forming'} (a=${quadFit.a.toFixed(6)}, R²=${quadFit.r2.toFixed(3)}, neckline=${neckline.toFixed(2)}, lowerHighs=${lowerHighCount}${breakConfirmed ? ', BREAK CONFIRMED' : ''})`,
      startIndex: startIdx,
      endIndex: ohlc.length - 1,
      priceTarget: neckline - (peakHigh - neckline),
      stopLoss: peakHigh,
      strengthWeight: confidence / 100,
    };
  }
  return null;
}

export function detectBroadeningFormation(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 20) return null;
  const lookback = Math.min(30, ohlc.length);
  const slice = ohlc.slice(-lookback);
  const highs = slice.map((c, j) => ({ x: j, y: c.high }));
  const lows = slice.map((c, j) => ({ x: j, y: c.low }));
  const upperTL = calculateTrendline(highs);
  const lowerTL = calculateTrendline(lows);
  if (upperTL.slope <= 0 || lowerTL.slope >= 0) return null;
  const earlyRange = slice[0].high - slice[0].low;
  const lateRange = slice[slice.length - 1].high - slice[slice.length - 1].low;
  if (lateRange < earlyRange * 1.3) return null;
  return {
    name: 'Broadening Formation',
    type: 'neutral',
    category: 'breakout',
    confidence: 65,
    description: 'Expanding trendlines (megaphone) indicating increasing volatility and uncertainty',
    startIndex: ohlc.length - lookback,
    endIndex: ohlc.length - 1
  };
}

export function detectNR7(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 7) return null;
  const i = ohlc.length - 1;
  const currentRange = totalRange(ohlc[i]);
  for (let j = 1; j < 7; j++) {
    if (totalRange(ohlc[i - j]) <= currentRange) return null;
  }
  return {
    name: 'NR7',
    type: 'neutral',
    category: 'volatility',
    confidence: 65,
    description: 'Narrowest range of last 7 bars - volatility expansion likely imminent',
    startIndex: i - 6,
    endIndex: i,
    pt1: ohlc[i].close + computeATR5(ohlc),
    pt2: ohlc[i].close + computeATR5(ohlc) * 2,
    stopLoss: ohlc[i].close - computeATR5(ohlc),
    strengthWeight: 0.65
  };
}

export function detectHigherHighHigherLow(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 20) return null;
  const maxima = findLocalMaxima(ohlc, 4);
  const minima = findLocalMinima(ohlc, 4);
  if (maxima.length < 3 || minima.length < 3) return null;
  const recentMax = maxima.slice(-3);
  const recentMin = minima.slice(-3);
  const hh = ohlc[recentMax[2]].high > ohlc[recentMax[1]].high && ohlc[recentMax[1]].high > ohlc[recentMax[0]].high;
  const hl = ohlc[recentMin[2]].low > ohlc[recentMin[1]].low && ohlc[recentMin[1]].low > ohlc[recentMin[0]].low;
  if (!hh || !hl) return null;
  const ar = avgRange(ohlc);
  const hhDiff1 = ohlc[recentMax[1]].high - ohlc[recentMax[0]].high;
  const hhDiff2 = ohlc[recentMax[2]].high - ohlc[recentMax[1]].high;
  if (hhDiff1 < ar * 0.3 || hhDiff2 < ar * 0.3) return null;
  return {
    name: 'Higher High / Higher Low',
    type: 'bullish',
    category: 'structure',
    confidence: 75,
    description: 'Consecutive higher highs and higher lows confirming bullish trend structure',
    startIndex: Math.min(recentMax[0], recentMin[0]),
    endIndex: ohlc.length - 1
  };
}

export function detectLowerHighLowerLow(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 20) return null;
  const maxima = findLocalMaxima(ohlc, 4);
  const minima = findLocalMinima(ohlc, 4);
  if (maxima.length < 3 || minima.length < 3) return null;
  const recentMax = maxima.slice(-3);
  const recentMin = minima.slice(-3);
  const lh = ohlc[recentMax[2]].high < ohlc[recentMax[1]].high && ohlc[recentMax[1]].high < ohlc[recentMax[0]].high;
  const ll = ohlc[recentMin[2]].low < ohlc[recentMin[1]].low && ohlc[recentMin[1]].low < ohlc[recentMin[0]].low;
  if (!lh || !ll) return null;
  const ar = avgRange(ohlc);
  const lhDiff1 = ohlc[recentMax[0]].high - ohlc[recentMax[1]].high;
  const lhDiff2 = ohlc[recentMax[1]].high - ohlc[recentMax[2]].high;
  if (lhDiff1 < ar * 0.3 || lhDiff2 < ar * 0.3) return null;
  return {
    name: 'Lower High / Lower Low',
    type: 'bearish',
    category: 'structure',
    confidence: 75,
    description: 'Consecutive lower highs and lower lows confirming bearish trend structure',
    startIndex: Math.min(recentMax[0], recentMin[0]),
    endIndex: ohlc.length - 1
  };
}

export function detectBOS(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 15) return null;
  const i = ohlc.length - 1;
  const maxima = findLocalMaxima(ohlc.slice(0, -1), 3);
  const minima = findLocalMinima(ohlc.slice(0, -1), 3);
  const c = ohlc[i];
  if (maxima.length >= 2) {
    const lastSwingHigh = ohlc[maxima[maxima.length - 1]].high;
    if (c.close > lastSwingHigh && inferTrendBias(ohlc) === 'bullish') {
      return {
        name: 'Bullish Break of Structure',
        type: 'bullish',
        category: 'structure',
        confidence: 72,
        description: 'Price breaks above prior swing high confirming bullish structure continuation',
        startIndex: maxima[maxima.length - 1],
        endIndex: i
      };
    }
  }
  if (minima.length >= 2) {
    const lastSwingLow = ohlc[minima[minima.length - 1]].low;
    if (c.close < lastSwingLow && inferTrendBias(ohlc) === 'bearish') {
      return {
        name: 'Bearish Break of Structure',
        type: 'bearish',
        category: 'structure',
        confidence: 72,
        description: 'Price breaks below prior swing low confirming bearish structure continuation',
        startIndex: minima[minima.length - 1],
        endIndex: i
      };
    }
  }
  return null;
}

export function detectCHOCH(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 15) return null;
  const i = ohlc.length - 1;
  const c = ohlc[i];
  const maxima = findLocalMaxima(ohlc.slice(0, -1), 3);
  const minima = findLocalMinima(ohlc.slice(0, -1), 3);
  const trend = inferTrendBias(ohlc.slice(0, -5));
  if (trend === 'bearish' && maxima.length >= 1) {
    const lastSwingHigh = ohlc[maxima[maxima.length - 1]].high;
    if (c.close > lastSwingHigh) {
      return {
        name: 'Bullish CHoCH',
        type: 'bullish',
        category: 'structure',
        confidence: 75,
        description: 'Change of Character - price breaks above swing high during downtrend signaling potential reversal',
        startIndex: maxima[maxima.length - 1],
        endIndex: i
      };
    }
  }
  if (trend === 'bullish' && minima.length >= 1) {
    const lastSwingLow = ohlc[minima[minima.length - 1]].low;
    if (c.close < lastSwingLow) {
      return {
        name: 'Bearish CHoCH',
        type: 'bearish',
        category: 'structure',
        confidence: 75,
        description: 'Change of Character - price breaks below swing low during uptrend signaling potential reversal',
        startIndex: minima[minima.length - 1],
        endIndex: i
      };
    }
  }
  return null;
}

export function detectLiquidityGrab(ohlc: OHLC[]): PatternResult | null {
  if (ohlc.length < 15) return null;
  const i = ohlc.length - 1;
  const c = ohlc[i];
  const lookback = Math.min(20, ohlc.length - 1);
  const priorSlice = ohlc.slice(i - lookback, i);
  const priorHigh = Math.max(...priorSlice.map(x => x.high));
  const priorLow = Math.min(...priorSlice.map(x => x.low));
  if (c.high > priorHigh && c.close < priorHigh && isBearish(c)) {
    return {
      name: 'Bearish Liquidity Grab',
      type: 'bearish',
      category: 'structure',
      confidence: 73,
      description: 'Price swept above prior highs (stop hunt) then reversed back below - bearish liquidity sweep',
      startIndex: i - 1,
      endIndex: i,
      stopLoss: c.high
    };
  }
  if (c.low < priorLow && c.close > priorLow && isBullish(c)) {
    return {
      name: 'Bullish Liquidity Grab',
      type: 'bullish',
      category: 'structure',
      confidence: 73,
      description: 'Price swept below prior lows (stop hunt) then reversed back above - bullish liquidity sweep',
      startIndex: i - 1,
      endIndex: i,
      stopLoss: c.low
    };
  }
  return null;
}

function createAdvancedPattern(
  name: string,
  type: PatternResult['type'],
  category: PatternResult['category'],
  confidence: number,
  description: string,
  startIndex: number,
  endIndex: number,
  rangeHigh: number,
  rangeLow: number,
  atr: number,
): PatternResult {
  const bullish = type === 'bullish';
  const bearish = type === 'bearish';
  return {
    name,
    type,
    category,
    confidence,
    description,
    startIndex,
    endIndex,
    priceTarget: bullish ? rangeHigh + (rangeHigh - rangeLow) : bearish ? rangeLow - (rangeHigh - rangeLow) : undefined,
    pt1: bullish ? rangeHigh + atr : bearish ? rangeLow - atr : rangeHigh,
    pt2: bullish ? rangeHigh + atr * 2 : bearish ? rangeLow - atr * 2 : rangeLow,
    stopLoss: bullish ? rangeLow : bearish ? rangeHigh : undefined,
    strengthWeight: confidence / 100,
  };
}

export function detectAdvancedStructuralPatterns(ohlc: OHLC[]): PatternResult[] {
  if (ohlc.length < 16) return [];

  const results: PatternResult[] = [];
  const seen = new Set<string>();
  const endIndex = ohlc.length - 1;
  const lookback = Math.min(24, ohlc.length - 1);
  const startIndex = endIndex - lookback;
  const structure = ohlc.slice(startIndex, endIndex);
  const current = ohlc[endIndex];
  const previous = ohlc[endIndex - 1];
  const atr = Math.max(computeATR5(ohlc), current.close * 0.0001);
  const rangeHigh = Math.max(...structure.map(candle => candle.high));
  const rangeLow = Math.min(...structure.map(candle => candle.low));
  const preBreakStructure = structure.slice(0, -1);
  const preBreakHigh = Math.max(...preBreakStructure.map(candle => candle.high));
  const preBreakLow = Math.min(...preBreakStructure.map(candle => candle.low));
  const rangeWidth = Math.max(rangeHigh - rangeLow, atr);
  const upper = calculateTrendline(structure.map((candle, index) => ({ x: index, y: candle.high })));
  const lower = calculateTrendline(structure.map((candle, index) => ({ x: index, y: candle.low })));
  const firstWidth = Math.max(atr * 0.1, upper.intercept - lower.intercept);
  const lastX = structure.length - 1;
  const lastWidth = Math.max(atr * 0.1, (upper.slope * lastX + upper.intercept) - (lower.slope * lastX + lower.intercept));
  const widthRatio = lastWidth / firstWidth;
  const slopeTolerance = atr * 0.035;
  const parallelTolerance = atr * 0.08;
  const upperFlat = Math.abs(upper.slope) <= slopeTolerance;
  const lowerFlat = Math.abs(lower.slope) <= slopeTolerance;
  const parallel = Math.abs(upper.slope - lower.slope) <= parallelTolerance;
  const priorRanges = structure.map(totalRange);
  const earlyRange = average(priorRanges.slice(0, Math.max(4, Math.floor(priorRanges.length / 2))));
  const lateRange = average(priorRanges.slice(-Math.max(4, Math.floor(priorRanges.length / 2))));
  const trend = inferTrendBias(structure);
  const buffer = atr * 0.08;
  const brokeUp = current.close > rangeHigh + buffer;
  const brokeDown = current.close < rangeLow - buffer;
  const priorBrokeUp = previous.close > preBreakHigh + buffer;
  const priorBrokeDown = previous.close < preBreakLow - buffer;
  const failedUp = priorBrokeUp && current.close < preBreakHigh;
  const failedDown = priorBrokeDown && current.close > preBreakLow;
  const averagePriorVolume = Math.max(1, average(structure.slice(-12).map(candle => candle.volume)));
  const volumeRatio = current.volume / averagePriorVolume;
  const latestRangeRatio = totalRange(current) / Math.max(earlyRange, atr * 0.1);
  const contractingTriangle = upper.slope < -slopeTolerance && lower.slope > slopeTolerance && widthRatio < 0.76;
  const expandingTriangle = upper.slope > slopeTolerance && lower.slope < -slopeTolerance && widthRatio > 1.24;
  const directionalChannel = parallel && ((upper.slope > slopeTolerance && lower.slope > slopeTolerance) || (upper.slope < -slopeTolerance && lower.slope < -slopeTolerance));
  const sameDirection = Math.sign(upper.slope) === Math.sign(lower.slope) && !upperFlat && !lowerFlat;
  const contractingWedge = sameDirection && widthRatio < 0.76;

  const push = (
    name: string,
    type: PatternResult['type'],
    category: PatternResult['category'],
    confidence: number,
    description: string,
  ) => {
    if (seen.has(name)) return;
    seen.add(name);
    results.push(createAdvancedPattern(name, type, category, confidence, description, startIndex, endIndex, rangeHigh, rangeLow, atr));
  };

  if (contractingTriangle) {
    push('Contracting Triangle', 'neutral', 'continuation', 70, 'Converging resistance and support are compressing toward an apex.');
    if (trend !== 'neutral') push('Running Triangle', trend, 'continuation', 68, `Triangle compression is holding inside a ${trend} directional run.`);
  } else if (expandingTriangle) {
    push('Expanding Triangle', 'neutral', 'breakout', 67, 'Diverging boundaries show an expanding triangle and rising two-sided volatility.');
  } else if (parallel && upper.slope > slopeTolerance && lower.slope > slopeTolerance) {
    push('Ascending Channel', 'bullish', 'continuation', 68, 'Parallel rising boundaries define an ascending channel.');
    push('Parallel Channel', 'bullish', 'continuation', 64, 'Upper and lower channel boundaries remain parallel.');
  } else if (parallel && upper.slope < -slopeTolerance && lower.slope < -slopeTolerance) {
    push('Descending Channel', 'bearish', 'continuation', 68, 'Parallel falling boundaries define a descending channel.');
    push('Parallel Channel', 'bearish', 'continuation', 64, 'Upper and lower channel boundaries remain parallel.');
  } else if (upperFlat && lowerFlat) {
    push('Horizontal Channel', 'neutral', 'structure', 66, 'Price is rotating between stable horizontal support and resistance.');
    push('Box Range', 'neutral', 'structure', 64, 'Repeated containment defines a tradable box range.');
  } else if (parallel && widthRatio > 1.2) {
    push('Expanding Channel', trend, 'breakout', 65, 'Parallel directional boundaries are expanding as volatility increases.');
  } else if (parallel && widthRatio < 0.8) {
    push('Contracting Channel', trend, 'continuation', 67, 'Parallel directional boundaries are narrowing into compression.');
  }

  if (contractingWedge) {
    push('Contracting Wedge', trend === 'bullish' ? 'bearish' : trend === 'bearish' ? 'bullish' : 'neutral', 'reversal', 69, 'Same-direction boundaries are converging into a reversal wedge.');
    if (lastWidth <= atr * 1.4) push('Terminal Wedge', trend === 'bullish' ? 'bearish' : 'bullish', 'reversal', 72, 'A mature wedge has compressed near its terminal apex.');
  }
  if (sameDirection && widthRatio > 1.25) {
    push('Broadening Wedge', trend === 'bullish' ? 'bearish' : trend === 'bearish' ? 'bullish' : 'neutral', 'reversal', 66, 'Same-direction boundaries are diverging into a broadening wedge.');
  }

  const recentWidth = Math.max(...structure.slice(-8).map(candle => candle.high)) - Math.min(...structure.slice(-8).map(candle => candle.low));
  const priorWidth = Math.max(...structure.slice(0, -8).map(candle => candle.high)) - Math.min(...structure.slice(0, -8).map(candle => candle.low));
  if (recentWidth < priorWidth * 0.62 || lateRange < earlyRange * 0.68) {
    push('Compression Range', 'neutral', 'volatility', 68, 'Range and candle width are contracting ahead of a volatility release.');
    if (recentWidth <= atr * 2.4) push('Micro-Range', 'neutral', 'structure', 66, 'The latest candles are confined to an unusually narrow micro-range.');
  }
  if (recentWidth > priorWidth * 1.35 || lateRange > earlyRange * 1.35) {
    push('Expansion Range', trend, 'volatility', 65, 'Range width is expanding relative to the preceding structure.');
  }
  if ((upperFlat && lowerFlat) || recentWidth <= atr * 4) {
    const closePosition = (current.close - rangeLow) / rangeWidth;
    if (closePosition >= 0.62 && trend !== 'bearish') push('Accumulation Range', 'bullish', 'structure', 63, 'Contained trade is holding in the upper range with constructive accumulation.');
    if (closePosition <= 0.38 && trend !== 'bullish') push('Distribution Range', 'bearish', 'structure', 63, 'Contained trade is holding in the lower range with distribution pressure.');
  }

  if (brokeUp) {
    push('Breakout', 'bullish', 'breakout', volumeRatio >= 1.35 ? 82 : 72, 'Price closed above established resistance.');
    push('Range Breakout', 'bullish', 'breakout', volumeRatio >= 1.35 ? 84 : 74, 'Price escaped the recent range above resistance.');
    push('Channel Breakout', 'bullish', 'breakout', 72, 'Price closed above the projected upper channel boundary.');
    if (contractingTriangle) push('Triangle Breakout → Continuation', 'bullish', 'continuation', 80, 'Price confirmed above a contracting triangle boundary.');
    if (contractingWedge) push('Wedge Breakout', 'bullish', 'breakout', 80, 'Price confirmed above the wedge resistance boundary.');
    if (upperFlat && lowerFlat) push('Bullish Rectangle Breakout', 'bullish', 'breakout', 79, 'Price confirmed above a rectangular consolidation.');
    if (volumeRatio >= 1.35) push('Volume Expansion Breakout', 'bullish', 'volatility', 86, 'Upside range break is confirmed by expanding volume.');
  }
  if (brokeDown) {
    push('Breakdown', 'bearish', 'breakout', volumeRatio >= 1.35 ? 82 : 72, 'Price closed below established support.');
    push('Range Breakdown', 'bearish', 'breakout', volumeRatio >= 1.35 ? 84 : 74, 'Price escaped the recent range below support.');
    push('Channel Breakdown', 'bearish', 'breakout', 72, 'Price closed below the projected lower channel boundary.');
    if (contractingTriangle) push('Triangle Breakdown → Continuation', 'bearish', 'continuation', 80, 'Price confirmed below a contracting triangle boundary.');
    if (contractingWedge) push('Wedge Breakdown', 'bearish', 'breakout', 80, 'Price confirmed below the wedge support boundary.');
    if (upperFlat && lowerFlat) push('Bearish Rectangle Breakdown', 'bearish', 'breakout', 79, 'Price confirmed below a rectangular consolidation.');
    if (volumeRatio >= 1.35) push('Volume Expansion Breakout', 'bearish', 'volatility', 86, 'Downside range break is confirmed by expanding volume.');
  }
  if (failedUp) {
    push('Failed Breakout', 'bearish', 'reversal', 80, 'An upside break failed and price closed back inside the prior range.');
    push('Trap Move (Bull Trap)', 'bearish', 'liquidity', 82, 'Buyers were trapped above resistance before price reclaimed the range.');
    push('Range Fakeout', 'bearish', 'reversal', 78, 'The upside range break failed on the following candle.');
    push('Triangle Fakeout → Reversal', 'bearish', 'reversal', 76, 'An upside compression break failed and reversed through the boundary.');
    if (contractingWedge) {
      push('Wedge Fakeout', 'bearish', 'reversal', 79, 'An upside wedge break failed and returned inside the structure.');
      push('Wedge Throw-Over', 'bearish', 'reversal', 77, 'Price briefly exceeded wedge resistance before rejecting the throw-over.');
      push('Wedge Failure → Opposite Reversal', 'bearish', 'reversal', 81, 'The bullish wedge break failed and reversed in the opposite direction.');
    }
    if (directionalChannel) push('Channel Fakeout', 'bearish', 'reversal', 77, 'An upside channel break failed and returned inside.');
    push('Range Reversal', 'bearish', 'reversal', 76, 'The range extension rejected and reversed toward the opposite boundary.');
  }
  if (failedDown) {
    push('Failed Breakdown', 'bullish', 'reversal', 80, 'A downside break failed and price closed back inside the prior range.');
    push('Trap Move (Bear Trap)', 'bullish', 'liquidity', 82, 'Sellers were trapped below support before price reclaimed the range.');
    push('Range Fakeout', 'bullish', 'reversal', 78, 'The downside range break failed on the following candle.');
    push('Triangle Fakeout → Reversal', 'bullish', 'reversal', 76, 'A downside compression break failed and reversed through the boundary.');
    if (contractingWedge) {
      push('Wedge Fakeout', 'bullish', 'reversal', 79, 'A downside wedge break failed and returned inside the structure.');
      push('Wedge Failure → Opposite Reversal', 'bullish', 'reversal', 81, 'The bearish wedge break failed and reversed in the opposite direction.');
    }
    if (directionalChannel) push('Channel Fakeout', 'bullish', 'reversal', 77, 'A downside channel break failed and returned inside.');
    push('Range Reversal', 'bullish', 'reversal', 76, 'The range extension rejected and reversed toward the opposite boundary.');
  }
  if (priorBrokeUp && current.low <= preBreakHigh + buffer && current.close > preBreakHigh) {
    push('Range Flip', 'bullish', 'structure', 78, 'Prior resistance held as support on the breakout retest.');
  } else if (priorBrokeDown && current.high >= preBreakLow - buffer && current.close < preBreakLow) {
    push('Range Flip', 'bearish', 'structure', 78, 'Prior support held as resistance on the breakdown retest.');
  }

  const rejectionBody = Math.max(bodySize(current), atr * 0.05);
  const bullishRejection = lowerWick(current) > rejectionBody * 1.4 && isBullish(current);
  const bearishRejection = upperWick(current) > rejectionBody * 1.4 && isBearish(current);
  if (contractingTriangle && (bullishRejection || bearishRejection) && lastWidth <= atr * 1.5) {
    push('Triangle Apex Reversal', bullishRejection ? 'bullish' : 'bearish', 'reversal', 73, 'Price rejected the compressed triangle apex before a sustained break.');
  }
  if (directionalChannel && ((trend === 'bullish' && bearishRejection) || (trend === 'bearish' && bullishRejection))) {
    push('Channel Exhaustion Reversal', trend === 'bullish' ? 'bearish' : 'bullish', 'reversal', 74, 'A rejection at the channel extreme signals directional exhaustion.');
  }
  if ((bullishRejection || bearishRejection) && latestRangeRatio >= 1.65) {
    const type = bullishRejection ? 'bullish' : 'bearish';
    push('Volatility Expansion Reversal', type, 'volatility', 75, 'An expanded-range candle rejected its extreme and reversed direction.');
    push('ATR Spike Reversal', type, 'volatility', 74, 'A true-range spike ended with a directional rejection.');
  }
  if ((bullishRejection || bearishRejection) && volumeRatio >= 2) {
    push('Climax Volume Reversal', bullishRejection ? 'bullish' : 'bearish', 'volatility', 80, 'Climactic volume combined with wick rejection signals exhaustion.');
  }

  const recentCloses = structure.slice(-8).map(candle => candle.close);
  const recentVolumes = structure.slice(-8).map(candle => candle.volume);
  const priceSlope = recentCloses.at(-1)! - recentCloses[0];
  const volumeSlope = recentVolumes.at(-1)! - recentVolumes[0];
  if (Math.abs(priceSlope) >= atr * 1.2 && volumeSlope < -averagePriorVolume * 0.2) {
    push('Volume Divergence Reversal', priceSlope > 0 ? 'bearish' : 'bullish', 'volatility', 71, 'Price extended while participation contracted, warning of a reversal.');
    push('Volatility Divergence Reversal', priceSlope > 0 ? 'bearish' : 'bullish', 'volatility', 69, 'Directional price expansion is diverging from volatility participation.');
  }
  if (trend !== 'neutral' && volumeRatio < 0.65 && latestRangeRatio < 0.75) {
    push('Volume Exhaustion', trend === 'bullish' ? 'bearish' : 'bullish', 'volatility', 67, 'Trend participation and candle range are fading together.');
    push('Volatility Exhaustion Reversal', trend === 'bullish' ? 'bearish' : 'bullish', 'volatility', 66, 'Range contraction at a directional extreme warns of exhaustion.');
  }

  if (lateRange < earlyRange * 0.62 && (bullishRejection || bearishRejection)) {
    const type = bullishRejection ? 'bullish' : 'bearish';
    push('Volatility Compression Reversal', type, 'volatility', 70, 'A compressed volatility regime is reversing from a rejected extreme.');
    push('ATR Collapse Reversal', type, 'volatility', 68, 'Collapsed true range is resolving through a directional rejection.');
    push('BB Squeeze Reversal', type, 'volatility', 70, 'Squeeze conditions are resolving through a reversal candle.');
  }

  const closes = structure.map(candle => candle.close);
  const closeMean = average(closes);
  const closeDeviation = Math.sqrt(average(closes.map(close => (close - closeMean) ** 2)));
  const upperBand = closeMean + closeDeviation * 2;
  const lowerBand = closeMean - closeDeviation * 2;
  const localAtr = Math.max(atr, average(structure.map(totalRange)));
  const ema20 = ema([...closes, current.close], Math.min(20, closes.length + 1));
  const upperKeltner = ema20 + localAtr * 1.5;
  const lowerKeltner = ema20 - localAtr * 1.5;
  if (previous.high > upperBand && current.close < upperBand && bearishRejection) {
    push('Bollinger Band M-Top', 'bearish', 'volatility', 76, 'Price rejected an upper-band extension and closed back inside the envelope.');
  }
  if (previous.low < lowerBand && current.close > lowerBand && bullishRejection) {
    push('Bollinger Band W-Bottom', 'bullish', 'volatility', 76, 'Price rejected a lower-band extension and closed back inside the envelope.');
  }
  if ((previous.high > upperKeltner && current.close < upperKeltner) || (previous.low < lowerKeltner && current.close > lowerKeltner)) {
    push('Keltner Channel Reversal', previous.high > upperKeltner ? 'bearish' : 'bullish', 'volatility', 72, 'Price rejected a Keltner channel extension and returned inside.');
  }

  for (let index = Math.max(2, ohlc.length - 10); index < endIndex; index += 1) {
    const bullishGapLow = ohlc[index - 2].high;
    const bullishGapHigh = ohlc[index].low;
    if (bullishGapHigh > bullishGapLow && current.low <= bullishGapHigh && current.close > bullishGapHigh && isBullish(current)) {
      push('Fair Value Gap Reversal', 'bullish', 'liquidity', 74, 'Price mitigated a bullish fair-value gap and rejected higher.');
      break;
    }
    const bearishGapHigh = ohlc[index - 2].low;
    const bearishGapLow = ohlc[index].high;
    if (bearishGapLow < bearishGapHigh && current.high >= bearishGapLow && current.close < bearishGapLow && isBearish(current)) {
      push('Fair Value Gap Reversal', 'bearish', 'liquidity', 74, 'Price mitigated a bearish fair-value gap and rejected lower.');
      break;
    }
  }

  const priorBody = bodySize(previous);
  const typicalBody = Math.max(avgBody(structure, 12), atr * 0.05);
  const previousMidpoint = (previous.open + previous.close) / 2;
  if (priorBody >= typicalBody * 1.8 && ((isBullish(previous) && isBearish(current) && current.close < previousMidpoint) || (isBearish(previous) && isBullish(current) && current.close > previousMidpoint))) {
    push('Displacement Reversal', isBullish(current) ? 'bullish' : 'bearish', 'liquidity', 76, 'A large displacement candle was rejected through its midpoint.');
  }

  const blockSearch = ohlc.slice(Math.max(0, endIndex - 8), endIndex - 1);
  for (let offset = blockSearch.length - 1; offset >= 1; offset -= 1) {
    const block = blockSearch[offset];
    const impulse = blockSearch[offset + 1] ?? previous;
    const bullishBlock = isBearish(block) && isBullish(impulse) && bodySize(impulse) >= typicalBody * 1.5;
    const bearishBlock = isBullish(block) && isBearish(impulse) && bodySize(impulse) >= typicalBody * 1.5;
    const touchedBody = current.low <= Math.max(block.open, block.close) && current.high >= Math.min(block.open, block.close);
    if (!touchedBody) continue;
    if (bullishBlock && isBullish(current) && current.close > Math.max(block.open, block.close)) {
      push('Mitigation Block Reversal', 'bullish', 'liquidity', 73, 'Price revisited a bullish origin block and rejected higher.');
      push('Order Block Reversal (Bullish)', 'bullish', 'liquidity', 74, 'A bullish order block held on mitigation.');
      break;
    }
    if (bearishBlock && isBearish(current) && current.close < Math.min(block.open, block.close)) {
      push('Mitigation Block Reversal', 'bearish', 'liquidity', 73, 'Price revisited a bearish origin block and rejected lower.');
      push('Order Block Reversal (Bearish)', 'bearish', 'liquidity', 74, 'A bearish order block held on mitigation.');
      break;
    }
  }
  if (bullishRejection || bearishRejection) {
    push('Rejection Block Reversal', bullishRejection ? 'bullish' : 'bearish', 'liquidity', 68, 'A pronounced wick rejected a recent structural extreme.');
  }

  const reversalWindow = ohlc.slice(-16);
  const reversalStart = ohlc.length - reversalWindow.length;
  const lowIndex = reversalWindow.findIndex(candle => candle.low === Math.min(...reversalWindow.map(item => item.low)));
  const highIndex = reversalWindow.findIndex(candle => candle.high === Math.max(...reversalWindow.map(item => item.high)));
  if (lowIndex >= 3 && lowIndex <= reversalWindow.length - 4) {
    const fall = reversalWindow[0].close - reversalWindow[lowIndex].low;
    const rebound = current.close - reversalWindow[lowIndex].low;
    if (fall >= atr * 2 && rebound >= fall * 0.65) {
      results.push(createAdvancedPattern('V-Bottom', 'bullish', 'reversal', 76, 'A sharp selloff reversed with a comparably strong recovery leg.', reversalStart, endIndex, rangeHigh, reversalWindow[lowIndex].low, atr));
    }
  }
  if (highIndex >= 3 && highIndex <= reversalWindow.length - 4) {
    const rise = reversalWindow[highIndex].high - reversalWindow[0].close;
    const decline = reversalWindow[highIndex].high - current.close;
    if (rise >= atr * 2 && decline >= rise * 0.65) {
      results.push(createAdvancedPattern('V-Top', 'bearish', 'reversal', 76, 'A sharp advance reversed with a comparably strong decline leg.', reversalStart, endIndex, reversalWindow[highIndex].high, rangeLow, atr));
    }
  }

  const localLows = findLocalMinima(reversalWindow, 2);
  const localHighs = findLocalMaxima(reversalWindow, 2);
  if (localLows.length >= 2) {
    const [first, second] = localLows.slice(-2);
    const equalLows = Math.abs(reversalWindow[first].low - reversalWindow[second].low) <= atr * 0.55;
    const separated = second - first >= 4;
    const firstSharp = totalRange(reversalWindow[first]) > average(reversalWindow.slice(Math.max(0, second - 2), Math.min(reversalWindow.length, second + 3)).map(totalRange)) * 1.2;
    if (equalLows && separated && firstSharp && current.close > reversalWindow[second].high) {
      results.push(createAdvancedPattern('Adam & Eve Bottom', 'bullish', 'reversal', 75, 'A sharp first trough and rounded second trough completed above local resistance.', reversalStart + first, endIndex, rangeHigh, Math.min(reversalWindow[first].low, reversalWindow[second].low), atr));
    }
  }
  if (localHighs.length >= 2) {
    const [first, second] = localHighs.slice(-2);
    const equalHighs = Math.abs(reversalWindow[first].high - reversalWindow[second].high) <= atr * 0.55;
    const separated = second - first >= 4;
    const firstSharp = totalRange(reversalWindow[first]) > average(reversalWindow.slice(Math.max(0, second - 2), Math.min(reversalWindow.length, second + 3)).map(totalRange)) * 1.2;
    if (equalHighs && separated && firstSharp && current.close < reversalWindow[second].low) {
      results.push(createAdvancedPattern('Adam & Eve Top', 'bearish', 'reversal', 75, 'A sharp first peak and rounded second peak completed below local support.', reversalStart + first, endIndex, Math.max(reversalWindow[first].high, reversalWindow[second].high), rangeLow, atr));
    }
  }

  const thirds = Math.max(4, Math.floor(structure.length / 3));
  const leftWidth = Math.max(...structure.slice(0, thirds).map(candle => candle.high)) - Math.min(...structure.slice(0, thirds).map(candle => candle.low));
  const middleWidth = Math.max(...structure.slice(thirds, -thirds).map(candle => candle.high)) - Math.min(...structure.slice(thirds, -thirds).map(candle => candle.low));
  const rightWidth = Math.max(...structure.slice(-thirds).map(candle => candle.high)) - Math.min(...structure.slice(-thirds).map(candle => candle.low));
  if (trend === 'bearish' && middleWidth > leftWidth * 1.2 && rightWidth < middleWidth * 0.72) {
    push('Diamond Bottom', 'bullish', 'reversal', current.close > rangeLow + rangeWidth * 0.55 ? 78 : 67, 'Volatility expanded and contracted after a decline, forming a diamond-bottom reversal.');
  }

  return results;
}

function deriveRequestedPatternVariants(patterns: PatternResult[], ohlc: OHLC[]): PatternResult[] {
  const aliases: PatternResult[] = [];
  const addAlias = (pattern: PatternResult, name: string, category = pattern.category, description?: string) => {
    if (patterns.some(candidate => candidate.name === name) || aliases.some(candidate => candidate.name === name)) return;
    aliases.push({ ...pattern, name, category, description: description ?? pattern.description });
  };

  for (const pattern of patterns) {
    if (pattern.name === 'Bull Flag') {
      addAlias(pattern, 'Ascending Flag');
      addAlias(pattern, 'Channel Flag (Bullish)');
      const move = ohlc[pattern.endIndex]?.close / Math.max(ohlc[pattern.startIndex]?.close ?? 1, 1) - 1;
      if (move >= 0.08) addAlias(pattern, 'High-Tight Flag');
    } else if (pattern.name === 'Bear Flag') {
      addAlias(pattern, 'Descending Flag');
      addAlias(pattern, 'Channel Flag (Bearish)');
      const move = ohlc[pattern.endIndex]?.close / Math.max(ohlc[pattern.startIndex]?.close ?? 1, 1) - 1;
      if (move <= -0.08) addAlias(pattern, 'Low-Tight Flag');
    } else if (pattern.name === 'Falling Wedge') {
      addAlias(pattern, 'Falling Wedge (Bullish Reversal)');
    } else if (pattern.name === 'Rising Wedge') {
      addAlias(pattern, 'Rising Wedge (Bearish Reversal)');
    } else if (pattern.name === 'Channel Up') {
      addAlias(pattern, 'Ascending Channel');
    } else if (pattern.name === 'Channel Down') {
      addAlias(pattern, 'Descending Channel');
    } else if (pattern.name === 'Head and Shoulders') {
      addAlias(pattern, 'Head & Shoulders');
    } else if (pattern.name === 'Inverse Head and Shoulders') {
      addAlias(pattern, 'Inverse Head & Shoulders');
    } else if (pattern.name === 'Rounded Top') {
      addAlias(pattern, 'Rounding Top');
    } else if (pattern.name === 'Rounded Bottom') {
      addAlias(pattern, 'Rounding Bottom');
    } else if (pattern.name === 'Cup and Handle') {
      addAlias(pattern, 'Cup & Handle (bullish reversal)', 'reversal');
    } else if (pattern.name === 'Bullish Tri-Star Doji') {
      addAlias(pattern, 'Tri-Star Doji (Bullish)', 'candlestick');
    } else if (pattern.name === 'Bearish Tri-Star Doji') {
      addAlias(pattern, 'Tri-Star Doji (Bearish)', 'candlestick');
    } else if (pattern.name === 'Broadening Formation') {
      addAlias(pattern, pattern.type === 'bearish' ? 'Broadening Top' : pattern.type === 'bullish' ? 'Broadening Bottom' : 'Expanding Triangle', 'reversal');
    } else if (pattern.name.includes('Swing Failure Pattern')) {
      addAlias(pattern, 'Swing Failure Pattern (SFP)', 'liquidity');
      addAlias(pattern, 'Stop Hunt', 'liquidity');
      addAlias(pattern, 'Stop-Hunt Reversal', 'liquidity');
      addAlias(pattern, 'Stop-Run Reversal', 'liquidity');
      addAlias(pattern, pattern.type === 'bullish' ? 'Equal Lows Sweep' : 'Equal Highs Sweep', 'liquidity');
      addAlias(pattern, 'Donchian Channel Reversal', 'volatility');
    } else if (pattern.name === 'Bearish Breakout Failure Reversal') {
      if (patterns.some(candidate => candidate.name === 'Bull Flag')) addAlias(pattern, 'Bullish Flag Failure → Reversal', 'reversal');
      if (patterns.some(candidate => candidate.name.includes('Wedge'))) addAlias(pattern, 'Wedge Failure → Opposite Reversal', 'reversal');
      addAlias(pattern, 'Range Break Reversal', 'volatility');
    } else if (pattern.name === 'Bullish Breakout Failure Reversal') {
      if (patterns.some(candidate => candidate.name === 'Bear Flag')) addAlias(pattern, 'Bearish Flag Failure → Reversal', 'reversal');
      if (patterns.some(candidate => candidate.name.includes('Wedge'))) addAlias(pattern, 'Wedge Failure → Opposite Reversal', 'reversal');
      addAlias(pattern, 'Range Break Reversal', 'volatility');
    } else if (pattern.name.includes('Liquidity Grab')) {
      addAlias(pattern, 'Liquidity Grab', 'liquidity');
      addAlias(pattern, pattern.type === 'bullish' ? 'Liquidity Sweep (Bullish)' : 'Liquidity Sweep (Bearish)', 'liquidity');
      addAlias(pattern, pattern.type === 'bullish' ? 'Breaker Block (Bullish)' : 'Breaker Block (Bearish)', 'liquidity', 'A swept structure failed and is acting as a reversal breaker.');
    } else if (pattern.name.includes('Volume Climax Reversal')) {
      addAlias(pattern, 'Climax Volume Reversal', 'volatility');
    } else if (pattern.name === 'Double Top') {
      addAlias(pattern, 'Bollinger Band M-Top', 'volatility');
    } else if (pattern.name === 'Double Bottom') {
      addAlias(pattern, 'Bollinger Band W-Bottom', 'volatility');
    }
  }

  return aliases;
}

/* =========================
   Unified runner
   ========================= */

type Detector = (ohlc: OHLC[]) => PatternResult | null;

const CANDLESTICK_DETECTORS: Detector[] = [
  detectHammer,
  detectHangingMan,
  detectInvertedHammer,
  detectShootingStar,
  detectDoji,
  detectBullishEngulfing,
  detectBearishEngulfing,
  detectHarami,
  detectMorningStar,
  detectEveningStar,
  detectThreeWhiteSoldiers,
  detectThreeBlackCrows,
  detectPiercingPattern,
  detectDarkCloudCover,
  detectTweezers,
  detectBullishBeltHold,
  detectBearishBeltHold,
  detectThreeInsideUp,
  detectThreeInsideDown,
  detectThreeOutsideUp,
  detectThreeOutsideDown,
  detectBullishKicker,
  detectBearishKicker,
  detectBullishAbandonedBaby,
  detectBearishAbandonedBaby,
  detectTriStarDoji,
  detectSpinningTop,
  detectMarubozu,
  detectHomingPigeon,
  detectMatchingLowHigh,
  detectStickSandwich,
  detectDeliberationPattern,
  detectConcealingBabySwallow,
  detectBreakaway,
  detectTasukiGap,
  detectGapTwoCrowsAndMethods,
  detectSideBySideLines,
  detectThreeStarsInSouth,
  detectThreeMountains,
  detectTowerReversal,
  detectLadderReversal,
  detectThreeMethods,
  detectTasukiContinuation,
  detectSeparatingLines,
];

const STRUCTURAL_DETECTORS: Detector[] = [
  detectInsideBar,
  detectOutsideBar,
  detectGap,
  detectDoubleTop,
  detectDoubleBottom,
  detectHeadAndShoulders,
  detectInverseHeadAndShoulders,
  detectAscendingTriangle,
  detectDescendingTriangle,
  detectSymmetricalTriangle,
  detectRisingWedge,
  detectFallingWedge,
  detectDiamondTop,
  detectFlag,
  detectChannelUp,
  detectChannelDown,
  detectCupAndHandle,
  detectVolatilitySqueeze,
  detectSwingFailurePattern,
  detectBreakoutFailureReversal,
  detectLiquidityGrabReversal,
  detectVolumeClimaxReversal,
  detectVWAPReversal,
  detectEMACompressionSnapReversal,
  detectBullPennant,
  detectBearPennant,
  detectHorizontalChannel,
  detectTripleTop,
  detectTripleBottom,
  detectRoundedBottom,
  detectRoundedTop,
  detectBroadeningFormation,
  detectNR7,
  detectHigherHighHigherLow,
  detectLowerHighLowerLow,
  detectBOS,
  detectCHOCH,
  detectLiquidityGrab
];

const DETECTORS: Detector[] = [...CANDLESTICK_DETECTORS, ...STRUCTURAL_DETECTORS];

function scanCandlestickPatterns(ohlc: OHLC[]): PatternResult[] {
  const results: PatternResult[] = [];
  if (ohlc.length < 10) return results;

  const seen = new Set<string>();

  for (let end = ohlc.length; end >= ohlc.length - 4 && end > 5; end--) {
    const slice = ohlc.slice(0, end);
    for (const detector of CANDLESTICK_DETECTORS) {
      const res = detector(slice);
      if (!res) continue;
      const key = `${res.name}_${res.startIndex}_${res.endIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(res);
    }
    for (const res of detectRequestedReversalVariants(slice)) {
      const key = `${res.name}_${res.startIndex}_${res.endIndex}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push(res);
    }
  }

  return results;
}

function normalizePatternIndices(pattern: PatternResult, ohlcLength: number): PatternResult | null {
  if (!Number.isFinite(pattern.confidence)) return null;
  if (!pattern.name || pattern.name.trim().length === 0) return null;
  if (!Number.isFinite(pattern.startIndex) || !Number.isFinite(pattern.endIndex)) return null;

  const maxIdx = Math.max(0, ohlcLength - 1);
  const start = Math.max(0, Math.min(pattern.startIndex, maxIdx));
  const end = Math.max(0, Math.min(pattern.endIndex, maxIdx));

  return {
    ...pattern,
    startIndex: Math.min(start, end),
    endIndex: Math.max(start, end),
    confidence: Math.max(0, Math.min(100, pattern.confidence))
  };
}

function staleWindowByCategory(category: PatternResult['category']): number {
  if (category === 'candlestick') return 6;
  if (category === 'gap' || category === 'volatility') return 14;
  return 32;
}

function postProcessPatternDetections(patterns: PatternResult[], ohlcLength: number): PatternResult[] {
  if (patterns.length === 0) return [];

  const lastIdx = Math.max(0, ohlcLength - 1);

  const normalized = patterns
    .map(p => normalizePatternIndices(p, ohlcLength))
    .filter((p): p is PatternResult => !!p)
    .filter(p => p.endIndex >= lastIdx - staleWindowByCategory(p.category));

  const byUniqueKey = new Map<string, PatternResult>();
  for (const pattern of normalized) {
    const key = `${pattern.name}|${pattern.type}|${pattern.startIndex}|${pattern.endIndex}`;
    const existing = byUniqueKey.get(key);
    if (!existing || pattern.confidence > existing.confidence) {
      byUniqueKey.set(key, pattern);
    }
  }

  return Array.from(byUniqueKey.values()).sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    const lenA = a.endIndex - a.startIndex;
    const lenB = b.endIndex - b.startIndex;
    return lenB - lenA;
  });
}

export function detectAllPatterns(ohlc: OHLC[], timeframe?: string): PatternResult[] {
  const results: PatternResult[] = [];

  for (const detector of STRUCTURAL_DETECTORS) {
    const res = detector(ohlc);
    if (res) results.push(res);
  }
  results.push(...detectAdvancedStructuralPatterns(ohlc));

  const tf = (timeframe || '').toLowerCase();
  const candlestickTimeframes = new Set(['1m', '3m', '5m', '10m', '15m', '30m', '45m', '1h', '2h', '4h', '1d', 'daily']);
  if (!timeframe || candlestickTimeframes.has(tf)) {
    const candlestickResults = scanCandlestickPatterns(ohlc);
    results.push(...candlestickResults);
  }

  results.push(...deriveRequestedPatternVariants(results, ohlc));

  return postProcessPatternDetections(results, ohlc.length);
}

export function detectFormingCandlestickPatterns(ohlc: OHLC[]): PatternResult[] {
  if (ohlc.length < 3) return [];

  const index = ohlc.length - 1;
  const current = ohlc[index];
  const previous = ohlc[index - 1];
  const baseline = ohlc.slice(Math.max(0, index - 10), index);
  const typicalRange = Math.max(avgRange(baseline), current.close * 0.0001);
  const range = totalRange(current);
  if (!Number.isFinite(range) || range <= 0) return [];

  const body = bodySize(current);
  const upper = Math.max(0, upperWick(current));
  const lower = Math.max(0, lowerWick(current));
  const closePosition = (current.close - current.low) / range;
  const results: PatternResult[] = [];

  if (lower >= Math.max(body * 1.2, typicalRange * 0.3) && closePosition >= 0.45) {
    const confidence = Math.min(68, Math.round(52 + Math.min(16, (lower / typicalRange) * 10)));
    results.push({
      name: 'Bullish Wick Rejection (forming)',
      type: 'bullish',
      category: 'candlestick',
      confidence,
      description: 'Lower-wick rejection is developing on the active candle; wait for the candle to close before confirmation.',
      startIndex: index,
      endIndex: index,
      pt1: current.high + typicalRange * 0.5,
      pt2: current.high + typicalRange,
      stopLoss: current.low,
      strengthWeight: confidence / 100,
    });
  }

  if (upper >= Math.max(body * 1.2, typicalRange * 0.3) && closePosition <= 0.55) {
    const confidence = Math.min(68, Math.round(52 + Math.min(16, (upper / typicalRange) * 10)));
    results.push({
      name: 'Bearish Wick Rejection (forming)',
      type: 'bearish',
      category: 'candlestick',
      confidence,
      description: 'Upper-wick rejection is developing on the active candle; wait for the candle to close before confirmation.',
      startIndex: index,
      endIndex: index,
      pt1: current.low - typicalRange * 0.5,
      pt2: current.low - typicalRange,
      stopLoss: current.high,
      strengthWeight: confidence / 100,
    });
  }

  const previousMidpoint = (previous.open + previous.close) / 2;
  const bullishEngulfmentDeveloping = isBearish(previous) && isBullish(current)
    && current.open <= previous.close + typicalRange * 0.1
    && current.close > previousMidpoint;
  const bearishEngulfmentDeveloping = isBullish(previous) && isBearish(current)
    && current.open >= previous.close - typicalRange * 0.1
    && current.close < previousMidpoint;

  if (bullishEngulfmentDeveloping) {
    results.push({
      name: 'Bullish Engulfing (forming)',
      type: 'bullish',
      category: 'candlestick',
      confidence: 60,
      description: 'The active candle has reclaimed the prior bearish body midpoint and is developing a bullish engulfing pattern.',
      startIndex: index - 1,
      endIndex: index,
      pt1: Math.max(previous.high, current.high) + typicalRange * 0.5,
      pt2: Math.max(previous.high, current.high) + typicalRange,
      stopLoss: Math.min(previous.low, current.low),
      strengthWeight: 0.6,
    });
  }

  if (bearishEngulfmentDeveloping) {
    results.push({
      name: 'Bearish Engulfing (forming)',
      type: 'bearish',
      category: 'candlestick',
      confidence: 60,
      description: 'The active candle has lost the prior bullish body midpoint and is developing a bearish engulfing pattern.',
      startIndex: index - 1,
      endIndex: index,
      pt1: Math.min(previous.low, current.low) - typicalRange * 0.5,
      pt2: Math.min(previous.low, current.low) - typicalRange,
      stopLoss: Math.max(previous.high, current.high),
      strengthWeight: 0.6,
    });
  }

  return results.sort((left, right) => right.confidence - left.confidence);
}

/* =========================
   Reversal detector registry
   ========================= */

const reversalDetectors: Array<(ohlc: OHLC[]) => PatternResult | null> = [
  // Single-candle reversals
  detectHammer,
  detectHangingMan,
  detectInvertedHammer,
  detectShootingStar,
  detectDoji,
  detectSpinningTop,

  // Two/three-candle candlestick reversals
  detectBullishEngulfing,
  detectBearishEngulfing,
  detectHarami,
  detectMorningStar,
  detectEveningStar,
  detectPiercingPattern,
  detectDarkCloudCover,
  detectTweezers,
  detectThreeInsideUp,
  detectThreeInsideDown,
  detectThreeOutsideUp,
  detectThreeOutsideDown,
  detectBullishKicker,
  detectBearishKicker,
  detectBullishBeltHold,
  detectBearishBeltHold,
  detectBullishAbandonedBaby,
  detectBearishAbandonedBaby,
  detectTriStarDoji,
  detectHomingPigeon,
  detectMatchingLowHigh,
  detectStickSandwich,
  detectDeliberationPattern,
  detectBreakaway,
  detectThreeStarsInSouth,
  detectThreeMountains,
  detectTowerReversal,
  detectLadderReversal,

  // Classical structural reversals
  detectDoubleTop,
  detectDoubleBottom,
  detectRisingWedge,
  detectFallingWedge,
  detectDiamondTop,

  // Liquidity / structural reversals
  detectSwingFailurePattern,
  detectBreakoutFailureReversal,
  detectLiquidityGrabReversal,

  // Volatility / regime reversals
  detectVolumeClimaxReversal,
  detectVWAPReversal,
  detectEMACompressionSnapReversal,

  // Classical structural reversals (new)
  detectTripleTop,
  detectTripleBottom,
  detectRoundedBottom,
  detectRoundedTop,

  // SMC / structural reversals (new)
  detectCHOCH,
  detectLiquidityGrab
];

export function detectReversals(ohlc: OHLC[]): PatternResult[] {
  const results: PatternResult[] = [];

  for (const detector of reversalDetectors) {
    const res = detector(ohlc);
    if (res) results.push(res);
  }

  return postProcessPatternDetections(results, ohlc.length);
}

/* =========================
   Fusion State & Weighting
   ========================= */

// MTF Consensus from Fusion Engine
export interface MTFConsensus {
  bullishStack: number;
  bearishStack: number;
  neutralStack: number;
  alignmentScore: number;
  conflictLevel: number;
  compressionConsensus: number;
  volatilityConsensus: number;
  trendConsensus: 'bullish' | 'bearish' | 'neutral';
}

// EMA Cloud Trend
export interface EMACloudTrend {
  direction: 'bullish' | 'bearish' | 'neutral';
  strength: number;
  compression: boolean;
  exhaustion: boolean;
  flip: boolean;
  volatilityRegime: 'low' | 'normal' | 'medium' | 'high';
}

// Volatility Regime
export interface VolatilityRegime {
  regime: 'low' | 'high' | 'expanding' | 'transition' | 'climax';
  score: number;
}

// Market Health
export interface MarketHealthIndicators {
  healthScore: number;
  healthGrade: string;
  rsi?: { value: number };
  macd?: { value: number };
  adx?: { value: number };
  vwapSlope?: { value: number };
  ivChange?: { value: number };
  orderflow?: { value: number };
  gamma?: { value: number };
  breadth?: { value: number };
  contributors?: string[];
}

// Breakout Lifecycle
export interface BreakoutLifecycle {
  state: 'PRE' | 'IN_ZONE' | 'BREAKOUT_UP' | 'BREAKOUT_DOWN' | 'POST_CONFIRM' | 'POST_LATE' | 'UNKNOWN';
  zoneLow: number;
  zoneHigh: number;
  lateMoveSide: 'bullish' | 'bearish' | 'none';
  tolerance: number;
}

// Risk Model
export interface RiskModel {
  riskIndex: number;
  failureProb: number;
  factors: string[];
}

// Monster Gate Decision
export interface MonsterGateDecision {
  value: number;
  direction: 'calls' | 'puts' | 'none';
  allowedAggression: boolean;
  maxRegime: 'swing' | 'day' | 'scalp' | 'range' | 'expanding' | 'high' | 'normal';
  conflict: boolean;
  conflictReason: string | null;
}

// Gating State
export interface GatingState {
  directionalBias: 'bullish' | 'bearish' | 'neutral';
  originalBias: 'bullish' | 'bearish' | 'neutral';
  regimeCap: 'swing' | 'day' | 'scalp' | 'range' | 'expanding' | 'high' | 'normal';
  metaAllowed: boolean;
  riskOverride: boolean;
  monsterConflict: boolean;
  exhaustionActive: boolean;
  compressionActive: boolean;
  lateMove: boolean;
  reasons: string[];
  gatingScore: number;
}

// Reversal Signal from reversalEngine
export interface ReversalSignal {
  reversalSignal: boolean;
  reversalDirection: 'bullish' | 'bearish' | 'up' | 'down' | 'none';
  reversalConfidence: number;
  reversalType: string | null;
  reversalReasons: string[];
}

// Full Fusion State for reversal alert system
export interface PatternFusionState {
  mtfConsensus: MTFConsensus;
  emaTrend: EMACloudTrend | undefined;
  volatilityRegime: VolatilityRegime;
  marketHealth: MarketHealthIndicators;
  breakoutLifecycle: BreakoutLifecycle;
  riskModel: RiskModel;
  monsterGateDecision: MonsterGateDecision;
  gatingState: GatingState;
}

// Legacy FusionState for backward compatibility
export interface FusionState {
  mtfBias: 'bullish' | 'bearish' | 'neutral';
  volatility: 'expanding' | 'contracting' | 'normal';
  riskModel: 'favorable' | 'unfavorable' | 'neutral';
  breakoutLifecycle: 'none' | 'attempt' | 'failed_breakout' | 'confirmed_breakout';
  trendStrength: number;
}

// Helper to convert PatternFusionState to legacy FusionState
function toLegacyFusionState(pfs: PatternFusionState): FusionState {
  const volRegime = pfs.volatilityRegime.regime;
  let volatility: 'expanding' | 'contracting' | 'normal' = 'normal';
  if (volRegime === 'expanding' || volRegime === 'high' || volRegime === 'climax') volatility = 'expanding';
  else if (volRegime === 'low') volatility = 'contracting';

  let riskModel: 'favorable' | 'unfavorable' | 'neutral' = 'neutral';
  if (pfs.riskModel.riskIndex < 40) riskModel = 'favorable';
  else if (pfs.riskModel.riskIndex > 70) riskModel = 'unfavorable';

  let breakoutLifecycle: 'none' | 'attempt' | 'failed_breakout' | 'confirmed_breakout' = 'none';
  if (pfs.breakoutLifecycle.state === 'POST_LATE' && pfs.breakoutLifecycle.lateMoveSide !== 'none') {
    breakoutLifecycle = 'failed_breakout';
  } else if (pfs.breakoutLifecycle.state === 'IN_ZONE') {
    breakoutLifecycle = 'attempt';
  } else if (pfs.breakoutLifecycle.state === 'POST_CONFIRM') {
    breakoutLifecycle = 'confirmed_breakout';
  }

  return {
    mtfBias: pfs.mtfConsensus.trendConsensus,
    volatility,
    riskModel,
    breakoutLifecycle,
    trendStrength: pfs.mtfConsensus.alignmentScore * 100
  };
}

export function applyFusionWeighting(
  pattern: PatternResult,
  fusion: FusionState
): PatternResult {
  let weight = 1;

  if (fusion.mtfBias === pattern.type) weight += 0.4;

  if (fusion.trendStrength > 60 && pattern.type === fusion.mtfBias) weight += 0.2;

  if (fusion.volatility === 'expanding') weight += 0.1;

  if (fusion.riskModel === 'favorable') weight += 0.15;

  if (fusion.breakoutLifecycle === 'failed_breakout') weight += 0.35;

  return {
    ...pattern,
    confidence: Math.min(100, Math.round(pattern.confidence * weight))
  };
}

/* =========================
   Reversal Consensus Engine
   ========================= */

export interface ReversalConsensus {
  direction: 'bullish' | 'bearish' | 'neutral';
  reversalScore: number;
  components: {
    candlestick: number;
    structural: number;
    fusionBias: number;
  };
  patterns: PatternResult[];
}

export function computeReversalConsensus(
  patterns: PatternResult[],
  fusion: FusionState
): ReversalConsensus {
  if (patterns.length === 0) {
    return {
      direction: 'neutral',
      reversalScore: 0,
      components: { candlestick: 0, structural: 0, fusionBias: 0 },
      patterns: []
    };
  }

  const bullish = patterns.filter(p => p.type === 'bullish');
  const bearish = patterns.filter(p => p.type === 'bearish');

  const bullScore = bullish.reduce((s, p) => s + p.confidence, 0);
  const bearScore = bearish.reduce((s, p) => s + p.confidence, 0);

  const direction = bullScore > bearScore ? 'bullish' : bearScore > bullScore ? 'bearish' : 'neutral';

  const candlestickScore = patterns
    .filter(p => p.category === 'candlestick')
    .reduce((s, p) => s + p.confidence, 0);

  const structuralScore = patterns
    .filter(p => p.category === 'liquidity' || p.category === 'volatility' || p.category === 'reversal')
    .reduce((s, p) => s + p.confidence, 0);

  const fusionBiasScore =
    fusion.mtfBias === direction ? 25 : fusion.mtfBias === 'neutral' ? 10 : 0;

  const total =
    candlestickScore * 0.4 +
    structuralScore * 0.45 +
    fusionBiasScore;

  return {
    direction,
    reversalScore: Math.min(100, Math.round(total)),
    components: {
      candlestick: Math.round(candlestickScore),
      structural: Math.round(structuralScore),
      fusionBias: fusionBiasScore
    },
    patterns
  };
}

/* =========================
   Fusion-Aware Reversal Scanner
   ========================= */

export function scanFusionReversals(
  ohlc: OHLC[],
  fusion: FusionState
): ReversalConsensus {
  const raw = detectReversals(ohlc);

  const weighted = raw.map(p => applyFusionWeighting(p, fusion));

  return computeReversalConsensus(weighted, fusion);
}

export interface ReversalAlert {
  alert: boolean;
  direction: 'bullish' | 'bearish' | 'neutral';
  score: number;
  patterns: PatternResult[];
  gated: boolean;
  gatingReasons: string[];
  mtfAligned: boolean;
  trendStrength: number;
  volatilityFavorable: boolean;
}

export interface FusionReversalAlertParams {
  reversalSignal: ReversalSignal;
  fusionState: PatternFusionState;
}

export function fusionReversalAlert(params: FusionReversalAlertParams): ReversalAlert {
  const { reversalSignal, fusionState } = params;
  
  // Convert to legacy format for weighting/consensus
  const legacyState = toLegacyFusionState(fusionState);
  
  // Default non-alert response
  const noAlert: ReversalAlert = {
    alert: false,
    direction: 'neutral',
    score: 0,
    patterns: [],
    gated: true,
    gatingReasons: ['No reversal signal'],
    mtfAligned: false,
    trendStrength: fusionState.mtfConsensus.alignmentScore * 100,
    volatilityFavorable: false
  };

  // If no reversal signal, return early
  if (!reversalSignal.reversalSignal || reversalSignal.reversalDirection === 'none') {
    return noAlert;
  }

  // Map direction: 'up' -> 'bullish', 'down' -> 'bearish'
  const rawDir = reversalSignal.reversalDirection;
  const direction: 'bullish' | 'bearish' | 'neutral' = 
    rawDir === 'bullish' || rawDir === 'up' ? 'bullish' : 
    rawDir === 'bearish' || rawDir === 'down' ? 'bearish' : 'neutral';

  // Build pattern list from reversal signal
  const patterns: PatternResult[] = [];
  if (reversalSignal.reversalType) {
    patterns.push({
      name: reversalSignal.reversalType,
      type: direction === 'bullish' ? 'bullish' : direction === 'bearish' ? 'bearish' : 'neutral',
      category: 'reversal',
      confidence: reversalSignal.reversalConfidence,
      description: reversalSignal.reversalReasons.join('; '),
      startIndex: 0,
      endIndex: 0
    });
  }
  const score = reversalSignal.reversalConfidence;

  // Gating checks using full fusion state
  const gatingReasons: string[] = [];

  // Gate 1: MTF alignment check
  const mtfAligned = direction === fusionState.mtfConsensus.trendConsensus;
  if (!mtfAligned && fusionState.mtfConsensus.trendConsensus !== 'neutral') {
    gatingReasons.push('MTF bias conflict');
  }

  // Gate 2: Trend strength check (require > 40% for reversal signals)
  const trendStrength = fusionState.mtfConsensus.alignmentScore * 100;
  if (trendStrength < 40) {
    gatingReasons.push('Weak trend alignment');
  }

  // Gate 3: Volatility check (expanding or normal is favorable)
  const volRegime = fusionState.volatilityRegime.regime;
  const volatilityFavorable = volRegime !== 'low';
  if (!volatilityFavorable) {
    gatingReasons.push('Low volatility regime');
  }

  // Gate 4: Risk model check
  if (fusionState.riskModel.riskIndex > 70) {
    gatingReasons.push('High risk environment');
  }

  // Gate 5: Breakout lifecycle check - failed breakouts boost score
  if (fusionState.breakoutLifecycle.state === 'POST_LATE' && 
      fusionState.breakoutLifecycle.lateMoveSide !== 'none') {
    // Failed breakout is good for reversal - don't gate
  }

  // Gate 6: Gating state check
  if (!fusionState.gatingState.metaAllowed) {
    gatingReasons.push('Meta signal gated');
  }

  // Determine if gated (blocked by gates)
  const gated = gatingReasons.length > 0;

  // Only trigger alert if score >= 70
  if (score < 70) {
    return {
      ...noAlert,
      direction,
      score,
      patterns,
      gatingReasons: ['Score below threshold (70)'],
      trendStrength,
      volatilityFavorable
    };
  }

  return {
    alert: true,
    direction,
    score,
    patterns,
    gated,
    gatingReasons,
    mtfAligned,
    trendStrength,
    volatilityFavorable
  };
}

/* =========================
   Extended engine types
   ========================= */

export type Bias = 'bullish' | 'bearish' | 'neutral';

export interface ContextSnapshot {
  trendBias: Bias;
  shortSlope: number;
  midSlope: number;
  atr: number;
  volatilityRatio: number;
  volatilityRegime: 'compressed' | 'normal' | 'expanded';
  avgRange: number;
  avgBody: number;
  volumeTrend?: 'rising' | 'falling' | 'flat';
  supportZones: number[];
  resistanceZones: number[];
  equalHighs: number[];
  equalLows: number[];
  fvgZones: { startIndex: number; endIndex: number; high: number; low: number; direction: Bias }[];
  premiumDiscount?: 'premium' | 'discount' | 'equilibrium';
}

export interface LiquidityEvent {
  type:
    | 'liquidity_sweep_high'
    | 'liquidity_sweep_low'
    | 'equal_highs_liquidity'
    | 'equal_lows_liquidity'
    | 'fvg_fill'
    | 'liquidity_void'
    | 'stop_run_high'
    | 'stop_run_low';
  index: number;
  price: number;
  strength: number;
  description: string;
}

export interface StructureEvent {
  type: 'BOS' | 'CHOCH';
  direction: Bias;
  index: number;
  level: number;
  description: string;
}

export interface OrderBlock {
  type: 'bullish' | 'bearish';
  startIndex: number;
  endIndex: number;
  high: number;
  low: number;
  originIndex: number;
  strength: number;
}

export interface BreakerBlock {
  type: 'bullish' | 'bearish';
  startIndex: number;
  endIndex: number;
  high: number;
  low: number;
  originIndex: number;
  strength: number;
}

export interface SequenceEvent {
  name: string;
  direction: Bias;
  confidence: number;
  startIndex: number;
  endIndex: number;
  steps: string[];
}

export interface ConfluenceScore {
  bias: Bias;
  score: number;
  components: {
    label: string;
    weight: number;
    contribution: number;
  }[];
}

export interface MetaSignal {
  active: boolean;
  bias: Bias;
  strength: number;
  playType: 'reversal' | 'continuation' | 'breakout' | 'mean_reversion' | 'none';
  entryZone?: { min: number; max: number };
  stopLoss?: number;
  targetPrimary?: number;
  targetStretch?: number;
  invalidationReason?: string;
  contributingPatterns: PatternResult[];
  contributingSequences: SequenceEvent[];
  context: ContextSnapshot;
  confluence: ConfluenceScore;
  liquidityEvents: LiquidityEvent[];
  structureEvents: StructureEvent[];
  orderBlocks: OrderBlock[];
  breakerBlocks: BreakerBlock[];
}

export interface EngineOutput {
  metaSignal: MetaSignal;
  patterns: PatternResult[];
  context: ContextSnapshot;
  liquidityEvents: LiquidityEvent[];
  structureEvents: StructureEvent[];
  orderBlocks: OrderBlock[];
  breakerBlocks: BreakerBlock[];
  sequences: SequenceEvent[];
}

/* =========================
   Core context engine
   ========================= */

function computeATR(ohlc: OHLC[], period = 14): number {
  if (ohlc.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < ohlc.length; i++) {
    const curr = ohlc[i];
    const prev = ohlc[i - 1];
    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close)
    );
    trs.push(tr);
  }
  return average(trs.slice(-period));
}

function computeVolatilityRegime(ohlc: OHLC[]): {
  ratio: number;
  regime: ContextSnapshot['volatilityRegime'];
} {
  if (ohlc.length < 30) return { ratio: 1, regime: 'normal' };
  const ranges = ohlc.map(totalRange);
  const recent = ranges.slice(-10);
  const base = ranges.slice(-30, -10);
  const recentAvg = average(recent);
  const baseAvg = average(base);
  if (!baseAvg) return { ratio: 1, regime: 'normal' };
  const ratio = recentAvg / baseAvg;
  let regime: ContextSnapshot['volatilityRegime'] = 'normal';
  if (ratio < 0.7) regime = 'compressed';
  else if (ratio > 1.3) regime = 'expanded';
  return { ratio, regime };
}

function computeVolumeTrend(ohlc: OHLC[]): ContextSnapshot['volumeTrend'] {
  if (!ohlc.length) return 'flat';
  const vols = ohlc.map(c => c.volume);
  const recent = vols.slice(-20);
  if (recent.length < 5) return 'flat';
  const first = average(recent.slice(0, Math.floor(recent.length / 2)));
  const last = average(recent.slice(Math.floor(recent.length / 2)));
  if (last > first * 1.15) return 'rising';
  if (last < first * 0.85) return 'falling';
  return 'flat';
}

function computeSRZones(ohlc: OHLC[], lookback = 50, toleranceFactor = 0.25): {
  support: number[];
  resistance: number[];
} {
  if (ohlc.length < lookback) lookback = ohlc.length;
  const slice = ohlc.slice(-lookback);
  const avgR = avgRange(slice);
  const tol = avgR * toleranceFactor;
  const support: number[] = [];
  const resistance: number[] = [];

  for (let i = 2; i < slice.length - 2; i++) {
    const c = slice[i];
    const isSupport =
      c.low <= slice[i - 1].low + tol &&
      c.low <= slice[i - 2].low + tol &&
      c.low <= slice[i + 1].low + tol &&
      c.low <= slice[i + 2].low + tol;
    const isResistance =
      c.high >= slice[i - 1].high - tol &&
      c.high >= slice[i - 2].high - tol &&
      c.high >= slice[i + 1].high - tol &&
      c.high >= slice[i + 2].high - tol;

    if (isSupport) support.push(c.low);
    if (isResistance) resistance.push(c.high);
  }

  const dedupe = (levels: number[]) => {
    const out: number[] = [];
    for (const lvl of levels.sort((a, b) => a - b)) {
      if (!out.length || Math.abs(lvl - out[out.length - 1]) > avgR * 0.5) out.push(lvl);
    }
    return out;
  };

  return {
    support: dedupe(support),
    resistance: dedupe(resistance)
  };
}

function detectEqualHighsLows(ohlc: OHLC[], toleranceFactor = 0.1): {
  equalHighs: number[];
  equalLows: number[];
} {
  const equalHighs: number[] = [];
  const equalLows: number[] = [];
  const avgR = avgRange(ohlc);
  const tol = avgR * toleranceFactor;
  for (let i = 2; i < ohlc.length; i++) {
    const h1 = ohlc[i - 1].high;
    const h2 = ohlc[i].high;
    if (Math.abs(h1 - h2) <= tol) equalHighs.push(i);

    const l1 = ohlc[i - 1].low;
    const l2 = ohlc[i].low;
    if (Math.abs(l1 - l2) <= tol) equalLows.push(i);
  }
  return { equalHighs, equalLows };
}

function detectFVGs(ohlc: OHLC[]): ContextSnapshot['fvgZones'] {
  const zones: ContextSnapshot['fvgZones'] = [];
  if (ohlc.length < 3) return zones;
  for (let i = 2; i < ohlc.length; i++) {
    const c0 = ohlc[i - 2];
    const c1 = ohlc[i - 1];
    const c2 = ohlc[i];

    if (c0.high < c2.low && c1.low > c0.high && c1.high < c2.low) {
      zones.push({
        startIndex: i - 2,
        endIndex: i,
        high: c2.low,
        low: c0.high,
        direction: 'bullish'
      });
    }

    if (c0.low > c2.high && c1.high < c0.low && c1.low > c2.high) {
      zones.push({
        startIndex: i - 2,
        endIndex: i,
        high: c0.low,
        low: c2.high,
        direction: 'bearish'
      });
    }
  }
  return zones;
}

function computePremiumDiscount(ohlc: OHLC[]): ContextSnapshot['premiumDiscount'] {
  if (ohlc.length < 20) return 'equilibrium';
  const slice = ohlc.slice(-50);
  const highs = slice.map(c => c.high);
  const lows = slice.map(c => c.low);
  const maxH = Math.max(...highs);
  const minL = Math.min(...lows);
  const mid = (maxH + minL) / 2;
  const last = slice[slice.length - 1].close;
  if (last > mid * 1.01) return 'premium';
  if (last < mid * 0.99) return 'discount';
  return 'equilibrium';
}

export function buildContext(ohlc: OHLC[]): ContextSnapshot {
  const shortSlope = trendSlope(ohlc, 10);
  const midSlope = trendSlope(ohlc, 30);
  const trendBias = inferTrendBias(ohlc);
  const atr = computeATR(ohlc, 14);
  const { ratio: volatilityRatio, regime: volatilityRegime } = computeVolatilityRegime(ohlc);
  const avgR = avgRange(ohlc, 14);
  const avgB = avgBody(ohlc, 14);
  const volumeTrend = computeVolumeTrend(ohlc);
  const { support, resistance } = computeSRZones(ohlc);
  const { equalHighs, equalLows } = detectEqualHighsLows(ohlc);
  const fvgZones = detectFVGs(ohlc);
  const premiumDiscount = computePremiumDiscount(ohlc);

  return {
    trendBias,
    shortSlope,
    midSlope,
    atr,
    volatilityRatio,
    volatilityRegime,
    avgRange: avgR,
    avgBody: avgB,
    volumeTrend,
    supportZones: support,
    resistanceZones: resistance,
    equalHighs,
    equalLows,
    fvgZones,
    premiumDiscount
  };
}

/* =========================
   Liquidity / ICT engine
   ========================= */

function detectLiquidityEvents(ohlc: OHLC[], ctx: ContextSnapshot): LiquidityEvent[] {
  const events: LiquidityEvent[] = [];
  const avgR = ctx.avgRange || avgRange(ohlc);

  for (const idx of ctx.equalHighs) {
    const level = ohlc[idx].high;
    const later = ohlc.slice(idx + 1);
    const sweepIndex = later.findIndex(c => c.high > level + avgR * 0.05);
    if (sweepIndex >= 0) {
      events.push({
        type: 'liquidity_sweep_high',
        index: idx + 1 + sweepIndex,
        price: later[sweepIndex].high,
        strength: 70,
        description: 'Sweep of equal highs liquidity'
      });
    }
  }

  for (const idx of ctx.equalLows) {
    const level = ohlc[idx].low;
    const later = ohlc.slice(idx + 1);
    const sweepIndex = later.findIndex(c => c.low < level - avgR * 0.05);
    if (sweepIndex >= 0) {
      events.push({
        type: 'liquidity_sweep_low',
        index: idx + 1 + sweepIndex,
        price: later[sweepIndex].low,
        strength: 70,
        description: 'Sweep of equal lows liquidity'
      });
    }
  }

  for (const zone of ctx.fvgZones) {
    const after = ohlc.slice(zone.endIndex + 1);
    for (let i = 0; i < after.length; i++) {
      const c = after[i];
      const filled =
        (zone.direction === 'bullish' && c.low <= zone.high && c.high >= zone.low) ||
        (zone.direction === 'bearish' && c.high >= zone.low && c.low <= zone.high);
      if (filled) {
        events.push({
          type: 'fvg_fill',
          index: zone.endIndex + 1 + i,
          price: (zone.high + zone.low) / 2,
          strength: 60,
          description: `FVG fill in ${zone.direction} zone`
        });
        break;
      }
    }
  }

  for (let i = 1; i < ohlc.length; i++) {
    const c = ohlc[i];
    const prev = ohlc[i - 1];
    const r = totalRange(c);
    if (r > avgR * 2 && Math.min(c.high, prev.high) - Math.max(c.low, prev.low) < avgR * 0.2) {
      events.push({
        type: 'liquidity_void',
        index: i,
        price: (c.high + c.low) / 2,
        strength: 65,
        description: 'Large displacement candle creating a liquidity void'
      });
    }
  }

  return events;
}

/* =========================
   Structure: BOS / CHOCH
   ========================= */

function detectStructureEvents(ohlc: OHLC[], ctx: ContextSnapshot): StructureEvent[] {
  const events: StructureEvent[] = [];
  const maxima = findLocalMaxima(ohlc, 3);
  const minima = findLocalMinima(ohlc, 3);
  if (maxima.length < 2 || minima.length < 2) return events;

  const lastHighIdx = maxima[maxima.length - 1];
  const prevHighIdx = maxima[maxima.length - 2];
  const lastLowIdx = minima[minima.length - 1];
  const prevLowIdx = minima[minima.length - 2];

  const lastHigh = ohlc[lastHighIdx].high;
  const prevHigh = ohlc[prevHighIdx].high;
  const lastLow = ohlc[lastLowIdx].low;
  const prevLow = ohlc[prevLowIdx].low;

  const tol = ctx.avgRange * 0.2;

  if (lastHigh > prevHigh + tol && lastLow > prevLow + tol) {
    events.push({
      type: 'BOS',
      direction: 'bullish',
      index: Math.max(lastHighIdx, lastLowIdx),
      level: lastHigh,
      description: 'Bullish break of structure with higher high and higher low'
    });
  }

  if (lastLow < prevLow - tol && lastHigh < prevHigh - tol) {
    events.push({
      type: 'BOS',
      direction: 'bearish',
      index: Math.max(lastHighIdx, lastLowIdx),
      level: lastLow,
      description: 'Bearish break of structure with lower low and lower high'
    });
  }

  const lastSwingUp = lastHighIdx > lastLowIdx;
  const prevSwingUp = prevHighIdx > prevLowIdx;
  if (lastSwingUp !== prevSwingUp) {
    const dir: Bias = lastSwingUp ? 'bullish' : 'bearish';
    const level = lastSwingUp ? lastHigh : lastLow;
    events.push({
      type: 'CHOCH',
      direction: dir,
      index: Math.max(lastHighIdx, lastLowIdx),
      level,
      description: 'Change of character in swing structure'
    });
  }

  return events;
}

/* =========================
   Order blocks & breaker blocks
   ========================= */

function detectOrderBlocks(ohlc: OHLC[], ctx: ContextSnapshot): OrderBlock[] {
  const blocks: OrderBlock[] = [];
  const avgR = ctx.avgRange || avgRange(ohlc);

  for (let i = 2; i < ohlc.length - 2; i++) {
    const c = ohlc[i];

    if (isBearish(c)) {
      const next = ohlc[i + 1];
      const move = next.close - c.low;
      if (move > avgR * 1.5 && next.close > c.high) {
        blocks.push({
          type: 'bullish',
          startIndex: i,
          endIndex: i,
          high: c.high,
          low: c.low,
          originIndex: i + 1,
          strength: 70
        });
      }
    }

    if (isBullish(c)) {
      const next = ohlc[i + 1];
      const move = c.high - next.close;
      if (move > avgR * 1.5 && next.close < c.low) {
        blocks.push({
          type: 'bearish',
          startIndex: i,
          endIndex: i,
          high: c.high,
          low: c.low,
          originIndex: i + 1,
          strength: 70
        });
      }
    }
  }

  return blocks;
}

function detectBreakerBlocks(ohlc: OHLC[], orderBlocks: OrderBlock[]): BreakerBlock[] {
  const breakers: BreakerBlock[] = [];
  for (const ob of orderBlocks) {
    const after = ohlc.slice(ob.originIndex + 1);
    let brokenIndex = -1;
    if (ob.type === 'bullish') {
      brokenIndex = after.findIndex(c => c.close < ob.low);
      if (brokenIndex >= 0) {
        breakers.push({
          type: 'bearish',
          startIndex: ob.startIndex,
          endIndex: ob.endIndex,
          high: ob.high,
          low: ob.low,
          originIndex: ob.originIndex + 1 + brokenIndex,
          strength: ob.strength - 10
        });
      }
    } else {
      brokenIndex = after.findIndex(c => c.close > ob.high);
      if (brokenIndex >= 0) {
        breakers.push({
          type: 'bullish',
          startIndex: ob.startIndex,
          endIndex: ob.endIndex,
          high: ob.high,
          low: ob.low,
          originIndex: ob.originIndex + 1 + brokenIndex,
          strength: ob.strength - 10
        });
      }
    }
  }
  return breakers;
}

/* =========================
   Sequencing engine
   ========================= */

function buildSequences(
  patterns: PatternResult[],
  liquidity: LiquidityEvent[],
  structure: StructureEvent[],
  ctx: ContextSnapshot
): SequenceEvent[] {
  const seqs: SequenceEvent[] = [];

  const sweeps = liquidity.filter(
    e => e.type === 'liquidity_sweep_high' || e.type === 'liquidity_sweep_low'
  );
  const marubozu = patterns.filter(p => p.name.includes('Marubozu'));
  const bos = structure.filter(e => e.type === 'BOS');

  if (sweeps.length && marubozu.length && bos.length) {
    const lastSweep = sweeps[sweeps.length - 1];
    const disp = marubozu.find(p => p.startIndex > lastSweep.index);
    const bosAfter = bos.find(e => e.index > (disp?.endIndex ?? lastSweep.index));
    if (disp && bosAfter) {
      const dir: Bias =
        lastSweep.type === 'liquidity_sweep_low' && bosAfter.direction === 'bullish'
          ? 'bullish'
          : lastSweep.type === 'liquidity_sweep_high' && bosAfter.direction === 'bearish'
          ? 'bearish'
          : 'neutral';
      if (dir !== 'neutral') {
        seqs.push({
          name: 'Sweep → Displacement → BOS',
          direction: dir,
          confidence: 80,
          startIndex: lastSweep.index,
          endIndex: bosAfter.index,
          steps: [
            `Liquidity sweep (${lastSweep.type})`,
            `Displacement candle (${disp.name})`,
            `Break of structure (${bosAfter.direction})`
          ]
        });
      }
    }
  }

  const squeeze = patterns.find(p => p.name === 'Volatility Squeeze');
  const breakout = patterns.find(
    p =>
      p.category === 'continuation' &&
      (p.name.includes('Triangle') || p.name.includes('Flag') || p.name.includes('Channel'))
  );
  if (squeeze && breakout && breakout.startIndex > squeeze.endIndex) {
    const dir: Bias =
      ctx.trendBias !== 'neutral' ? ctx.trendBias : breakout.type === 'bullish' ? 'bullish' : 'bearish';
    seqs.push({
      name: 'Compression → Breakout',
      direction: dir,
      confidence: 70,
      startIndex: squeeze.startIndex,
      endIndex: breakout.endIndex,
      steps: ['Volatility compression', `Breakout pattern (${breakout.name})`]
    });
  }

  return seqs;
}

/* =========================
   Confluence engine
   ========================= */

function buildConfluence(
  ctx: ContextSnapshot,
  patterns: PatternResult[],
  liquidity: LiquidityEvent[],
  structure: StructureEvent[],
  sequences: SequenceEvent[],
  ohlcLength: number
): ConfluenceScore {
  const components: ConfluenceScore['components'] = [];

  let trendScore = 0;
  if (ctx.trendBias === 'bullish') trendScore = 20;
  else if (ctx.trendBias === 'bearish') trendScore = 20;
  components.push({
    label: 'Trend bias',
    weight: 20,
    contribution: trendScore
  });

  let volScore = 0;
  if (ctx.volatilityRegime === 'compressed') volScore = 10;
  else if (ctx.volatilityRegime === 'expanded') volScore = 5;
  components.push({
    label: 'Volatility regime',
    weight: 10,
    contribution: volScore
  });

  const liqScore = Math.min(liquidity.length * 5, 20);
  components.push({
    label: 'Liquidity events',
    weight: 20,
    contribution: liqScore
  });

  const bosBull = structure.some(e => e.type === 'BOS' && e.direction === 'bullish');
  const bosBear = structure.some(e => e.type === 'BOS' && e.direction === 'bearish');
  let structScore = 0;
  if (bosBull || bosBear) structScore = 20;
  components.push({
    label: 'Structure (BOS/CHOCH)',
    weight: 20,
    contribution: structScore
  });

  const seqScore = Math.min(sequences.reduce((s, q) => s + q.confidence / 5, 0), 20);
  components.push({
    label: 'Pattern sequences',
    weight: 20,
    contribution: seqScore
  });

  const strongPatterns = patterns.filter(p => p.confidence >= 80);
  const patScore = Math.min(strongPatterns.length * 5, 10);
  components.push({
    label: 'High-confidence patterns',
    weight: 10,
    contribution: patScore
  });

  const totalWeight = components.reduce((s, c) => s + c.weight, 0) || 1;
  const baseScore =
    (components.reduce((s, c) => s + c.contribution, 0) / totalWeight) * 100;

  let bias: Bias = 'neutral';

  const latestEventIndex = Math.max(
    ohlcLength - 1,
    ...patterns.map(p => Number.isFinite(p.endIndex) ? p.endIndex : 0),
    ...structure.map(s => Number.isFinite(s.index) ? s.index : 0),
    ...sequences.map(s => Number.isFinite(s.endIndex) ? s.endIndex : 0)
  );

  const recencyWeight = (eventIndex: number): number => {
    const age = Math.max(0, latestEventIndex - eventIndex);
    if (age <= 6) return 1;
    if (age <= 15) return 0.72;
    if (age <= 30) return 0.45;
    return 0.22;
  };

  const bullStructureSignals = structure
    .filter(e => e.direction === 'bullish')
    .reduce((sum, e) => sum + recencyWeight(e.index), 0);
  const bearStructureSignals = structure
    .filter(e => e.direction === 'bearish')
    .reduce((sum, e) => sum + recencyWeight(e.index), 0);

  const bullSequenceSignals = sequences
    .filter(s => s.direction === 'bullish')
    .reduce((sum, s) => sum + (s.confidence / 100) * recencyWeight(s.endIndex), 0);
  const bearSequenceSignals = sequences
    .filter(s => s.direction === 'bearish')
    .reduce((sum, s) => sum + (s.confidence / 100) * recencyWeight(s.endIndex), 0);

  const slopeNormBase = Math.max(ctx.avgRange, 1e-6);
  const slopeMomentum = (ctx.shortSlope * 0.65 + ctx.midSlope * 0.35) / slopeNormBase;
  const momentumBullBonus = slopeMomentum > 0.06 ? Math.min(1.2, slopeMomentum * 4) : 0;
  const momentumBearBonus = slopeMomentum < -0.06 ? Math.min(1.2, Math.abs(slopeMomentum) * 4) : 0;

  const bullSignals =
    (ctx.trendBias === 'bullish' ? 1 : 0) +
    (bosBull ? 0.7 : 0) +
    bullStructureSignals +
    bullSequenceSignals +
    momentumBullBonus;
  const bearSignals =
    (ctx.trendBias === 'bearish' ? 1 : 0) +
    (bosBear ? 0.7 : 0) +
    bearStructureSignals +
    bearSequenceSignals +
    momentumBearBonus;

  if (bullSignals > bearSignals) bias = 'bullish';
  else if (bearSignals > bullSignals) bias = 'bearish';

  const slopeStrength = Math.max(0, Math.min(1, Math.abs(slopeMomentum) / 0.12));
  const directionalAlign =
    bias === 'neutral'
      ? 0.5
      : (bias === 'bullish' && slopeMomentum > 0) || (bias === 'bearish' && slopeMomentum < 0)
      ? 1
      : 0.35;

  const volumeAlign =
    ctx.volumeTrend === 'flat'
      ? 0.7
      : (ctx.volumeTrend === 'rising' && bias === 'bullish') || (ctx.volumeTrend === 'falling' && bias === 'bearish')
      ? 1
      : 0.5;

  const impulseScore = Math.max(
    0,
    Math.min(100, slopeStrength * 65 + directionalAlign * 20 + volumeAlign * 15),
  );

  const score = Math.max(0, Math.min(100, baseScore * 0.68 + impulseScore * 0.32));

  components.push({
    label: 'Live impulse blend',
    weight: 0,
    contribution: impulseScore,
  });

  return {
    bias,
    score,
    components
  };
}

/* =========================
   Meta-signal engine
   ========================= */

function pickPlayType(
  bias: Bias,
  patterns: PatternResult[],
  sequences: SequenceEvent[],
  ctx: ContextSnapshot
): MetaSignal['playType'] {
  const hasReversal = patterns.some(p => p.category === 'reversal');
  const hasContinuation = patterns.some(p => p.category === 'continuation');
  const hasBreakout = patterns.some(
    p =>
      p.category === 'breakout' ||
      p.name.includes('Triangle') ||
      p.name.includes('Flag') ||
      p.name.includes('Channel')
  ) || sequences.some(s => s.name === 'Compression → Breakout');

  if (hasReversal && ctx.trendBias !== 'neutral' && bias !== ctx.trendBias) return 'reversal';
  if (hasContinuation && bias === ctx.trendBias) return 'continuation';
  if (hasBreakout) return 'breakout';
  return 'none';
}

function computeEntryStopTarget(
  ohlc: OHLC[],
  bias: Bias,
  ctx: ContextSnapshot,
  orderBlocks: OrderBlock[],
  structure: StructureEvent[]
): {
  entryZone?: { min: number; max: number };
  stopLoss?: number;
  targetPrimary?: number;
  targetStretch?: number;
} {
  if (bias === 'neutral') return {};

  const last = ohlc[ohlc.length - 1];
  const atr = ctx.atr || avgRange(ohlc);

  const ob = orderBlocks
    .filter(b => b.type === bias)
    .sort((a, b) => Math.abs(((a.high + a.low) / 2) - last.close) - Math.abs(((b.high + b.low) / 2) - last.close))[0];

  let entryZone: { min: number; max: number } | undefined;
  let stopLoss: number | undefined;
  let targetPrimary: number | undefined;
  let targetStretch: number | undefined;

  if (ob) {
    const mid = (ob.high + ob.low) / 2;
    if (bias === 'bullish') {
      entryZone = { min: ob.low, max: ob.high };
      stopLoss = ob.low - atr * 0.5;
      targetPrimary = mid + atr * 2;
      targetStretch = mid + atr * 3;
    } else {
      entryZone = { min: ob.low, max: ob.high };
      stopLoss = ob.high + atr * 0.5;
      targetPrimary = mid - atr * 2;
      targetStretch = mid - atr * 3;
    }
  } else {
    if (bias === 'bullish') {
      entryZone = { min: last.close - atr * 0.25, max: last.close + atr * 0.25 };
      stopLoss = last.close - atr;
      targetPrimary = last.close + atr * 2;
      targetStretch = last.close + atr * 3;
    } else {
      entryZone = { min: last.close - atr * 0.25, max: last.close + atr * 0.25 };
      stopLoss = last.close + atr;
      targetPrimary = last.close - atr * 2;
      targetStretch = last.close - atr * 3;
    }
  }

  return { entryZone, stopLoss, targetPrimary, targetStretch };
}

function buildMetaInvalidationReason(params: {
  bias: Bias;
  strength: number;
  playType: MetaSignal['playType'];
  volatilityRegime: ContextSnapshot['volatilityRegime'];
  expansionBlocked: boolean;
}): string {
  const reasons: string[] = [];
  const { bias, strength, playType, volatilityRegime, expansionBlocked } = params;

  if (bias === 'neutral') reasons.push('No directional bias');
  if (strength < 55) reasons.push(`Confluence too low (${Math.round(strength)} < 55)`);
  if (playType === 'none') reasons.push('No qualifying play type');
  if (expansionBlocked && volatilityRegime === 'expanded') reasons.push('Expanded volatility requires stronger confluence');

  return reasons.length > 0 ? reasons.join(' • ') : 'Confluence or regime filters not satisfied';
}

export function buildMetaSignal(ohlc: OHLC[], timeframe?: string): EngineOutput {
  const context = buildContext(ohlc);
  const patterns = detectAllPatterns(ohlc, timeframe);
  const liquidityEvents = detectLiquidityEvents(ohlc, context);
  const structureEvents = detectStructureEvents(ohlc, context);
  const orderBlocks = detectOrderBlocks(ohlc, context);
  const breakerBlocks = detectBreakerBlocks(ohlc, orderBlocks);
  const sequences = buildSequences(patterns, liquidityEvents, structureEvents, context);
  const confluence = buildConfluence(context, patterns, liquidityEvents, structureEvents, sequences, ohlc.length);

  const bias = confluence.bias;
  const strength = confluence.score;

  const playType = pickPlayType(bias, patterns, sequences, context);

  const { entryZone, stopLoss, targetPrimary, targetStretch } = computeEntryStopTarget(
    ohlc,
    bias,
    context,
    orderBlocks,
    structureEvents
  );

  const expansionBlocked = context.volatilityRegime === 'expanded' && strength < 70;

  const active =
    bias !== 'neutral' &&
    strength >= 55 &&
    playType !== 'none' &&
    !expansionBlocked;

  const metaSignal: MetaSignal = {
    active,
    bias,
    strength,
    playType,
    entryZone,
    stopLoss,
    targetPrimary,
    targetStretch,
    invalidationReason: active
      ? undefined
      : buildMetaInvalidationReason({
          bias,
          strength,
          playType,
          volatilityRegime: context.volatilityRegime,
          expansionBlocked
        }),
    contributingPatterns: patterns.filter(p => p.confidence >= 70),
    contributingSequences: sequences,
    context,
    confluence,
    liquidityEvents,
    structureEvents,
    orderBlocks,
    breakerBlocks
  };

  return {
    metaSignal,
    patterns,
    context,
    liquidityEvents,
    structureEvents,
    orderBlocks,
    breakerBlocks,
    sequences
  };
}

/* =========================
   Public API
   ========================= */

export function analyzeMarket(ohlc: OHLC[], timeframe?: string): EngineOutput {
  return buildMetaSignal(ohlc, timeframe);
}
