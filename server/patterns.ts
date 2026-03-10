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

function average(values: number[]): number {
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
  let name = 'Doji';
  let type: PatternResult['type'] = 'neutral';
  let description = 'Indecision candle with very small body.';

  if (upper > body * 2.5 && lower < body * 1.2) {
    name = 'Gravestone Doji';
    type = 'bearish';
    description = 'Potential bearish reversal doji with dominant upper wick.';
  } else if (lower > body * 2.5 && upper < body * 1.2) {
    name = 'Dragonfly Doji';
    type = 'bullish';
    description = 'Potential bullish reversal doji with dominant lower wick.';
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
  const spinBias = inferTrendBias(ohlc);
  const spinBiasUp = spinBias === 'bullish';

  return {
    name: 'Spinning Top',
    type: 'neutral',
    category: 'candlestick',
    confidence: 55,
    description: 'Indecision pattern with small body and relatively long upper and lower wicks',
    startIndex: i,
    endIndex: i,
    pt1: spinBiasUp ? c.close + atr5 : c.close - atr5,
    pt2: spinBiasUp ? c.close + atr5 * 2 : c.close - atr5 * 2,
    stopLoss: spinBiasUp ? c.low : c.high,
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
    category: 'candlestick',
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
        return {
          name: 'Bullish Engulfing',
          type: 'bullish',
          category: 'candlestick',
          confidence: 80,
          description: 'Strong bullish reversal - current candle engulfs previous bearish body',
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
        return {
          name: 'Bearish Engulfing',
          type: 'bearish',
          category: 'candlestick',
          confidence: 80,
          description: 'Strong bearish reversal - current candle engulfs previous bullish body',
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
          name: 'Piercing Pattern',
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
  if (!breakout) return null;

  const stopLoss = isBull
    ? Math.min(...consolidationSlice.map(c => c.low))
    : Math.max(...consolidationSlice.map(c => c.high));

  const pt1 = last.close + (isBull ? pole.move * 0.5 : -pole.move * 0.5);
  const pt2 = last.close + (isBull ? pole.move : -pole.move);

  return {
    name: `${isBull ? 'Bull' : 'Bear'} Flag`,
    type: isBull ? 'bullish' : 'bearish',
    category: 'continuation',
    confidence: 85,
    description: `${isBull ? 'Bullish' : 'Bearish'} continuation pattern with clean impulse and tight consolidation.`,
    startIndex: pole.start,
    endIndex: ohlc.length - 1,
    priceTarget: pt2,
    pt1,
    pt2,
    stopLoss,
    strengthWeight: 0.92
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
  const slice = ohlc.slice(-lookback - 1, -1);

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
    let higherLowCount = 0;
    if (afterLen >= 4) {
      for (let j = afterStart; j < Math.min(afterStart + afterLen, len - 1); j++) {
        if (slice[j + 1].low > slice[j].low) {
          higherLowCount++;
        } else {
          break;
        }
      }
    }
    if (higherLowCount < 3) continue;

    const quadFit = fitQuadratic(lows);
    if (quadFit.a <= 0) continue;
    if (quadFit.r2 < 0.70) continue;

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
      description: `Quadratic saucer bottom (a=${quadFit.a.toFixed(6)}, R²=${quadFit.r2.toFixed(3)}, neckline=${neckline.toFixed(2)}, higherLows=${higherLowCount}${breakConfirmed ? ', BREAK CONFIRMED' : ''})`,
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
    let lowerHighCount = 0;
    if (afterLen >= 4) {
      for (let j = afterStart; j < Math.min(afterStart + afterLen, len - 1); j++) {
        if (slice[j + 1].high < slice[j].high) {
          lowerHighCount++;
        } else {
          break;
        }
      }
    }
    if (lowerHighCount < 3) continue;

    const quadFit = fitQuadratic(highs);
    if (quadFit.a >= 0) continue;
    if (quadFit.r2 < 0.70) continue;

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
      description: `Quadratic dome top (a=${quadFit.a.toFixed(6)}, R²=${quadFit.r2.toFixed(3)}, neckline=${neckline.toFixed(2)}, lowerHighs=${lowerHighCount}${breakConfirmed ? ', BREAK CONFIRMED' : ''})`,
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
];

const STRUCTURAL_DETECTORS: Detector[] = [
  detectSpinningTop,
  detectMarubozu,
  detectInsideBar,
  detectOutsideBar,
  detectGap,
  detectDoubleTop,
  detectDoubleBottom,
  detectAscendingTriangle,
  detectDescendingTriangle,
  detectSymmetricalTriangle,
  detectRisingWedge,
  detectFallingWedge,
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

  const deduped = Array.from(byUniqueKey.values());

  const keep = new Set<number>(deduped.map((_, idx) => idx));
  const byCandlestickEnd = new Map<number, number[]>();

  deduped.forEach((pattern, idx) => {
    if (pattern.category !== 'candlestick') return;
    const arr = byCandlestickEnd.get(pattern.endIndex) ?? [];
    arr.push(idx);
    byCandlestickEnd.set(pattern.endIndex, arr);
  });

  for (const [, indexes] of Array.from(byCandlestickEnd.entries())) {
    const bucket = indexes.map((index: number) => ({ i: index, p: deduped[index] }));
    const bulls = bucket
      .filter((entry: { i: number; p: PatternResult }) => entry.p.type === 'bullish')
      .sort((left: { i: number; p: PatternResult }, right: { i: number; p: PatternResult }) => right.p.confidence - left.p.confidence);
    const bears = bucket
      .filter((entry: { i: number; p: PatternResult }) => entry.p.type === 'bearish')
      .sort((left: { i: number; p: PatternResult }, right: { i: number; p: PatternResult }) => right.p.confidence - left.p.confidence);

    if (bulls.length === 0 || bears.length === 0) continue;

    const bestBull = bulls[0];
    const bestBear = bears[0];
    const diff = Math.abs(bestBull.p.confidence - bestBear.p.confidence);

    if (diff < 10) {
      for (const x of bulls) keep.delete(x.i);
      for (const x of bears) keep.delete(x.i);
      continue;
    }

    const winningType = bestBull.p.confidence > bestBear.p.confidence ? 'bullish' : 'bearish';
    for (const x of bucket) {
      if (x.p.type !== winningType && x.p.type !== 'neutral') {
        keep.delete(x.i);
      }
    }
  }

  const cleaned = deduped.filter((_, idx) => keep.has(idx));

  const keepAfterPolarity = new Set<number>(cleaned.map((_, idx) => idx));
  const byEndCategory = new Map<string, number[]>();

  cleaned.forEach((pattern, idx) => {
    if (pattern.type === 'neutral') return;
    const key = `${pattern.endIndex}|${pattern.category}`;
    const arr = byEndCategory.get(key) ?? [];
    arr.push(idx);
    byEndCategory.set(key, arr);
  });

  for (const [, indexes] of Array.from(byEndCategory.entries())) {
    if (indexes.length < 2) continue;
    const bucket = indexes.map((index: number) => ({ i: index, p: cleaned[index] }));
    const bulls = bucket
      .filter((entry: { i: number; p: PatternResult }) => entry.p.type === 'bullish')
      .sort((left: { i: number; p: PatternResult }, right: { i: number; p: PatternResult }) => right.p.confidence - left.p.confidence);
    const bears = bucket
      .filter((entry: { i: number; p: PatternResult }) => entry.p.type === 'bearish')
      .sort((left: { i: number; p: PatternResult }, right: { i: number; p: PatternResult }) => right.p.confidence - left.p.confidence);

    if (bulls.length === 0 || bears.length === 0) continue;

    const bullTop = bulls[0];
    const bearTop = bears[0];
    const confidenceGap = Math.abs(bullTop.p.confidence - bearTop.p.confidence);

    if (confidenceGap < 8) {
      for (const entry of bulls) keepAfterPolarity.delete(entry.i);
      for (const entry of bears) keepAfterPolarity.delete(entry.i);
      continue;
    }

    const winner = bullTop.p.confidence > bearTop.p.confidence ? 'bullish' : 'bearish';
    for (const entry of bucket) {
      if (entry.p.type !== winner) keepAfterPolarity.delete(entry.i);
    }
  }

  const resolved = cleaned.filter((_, idx) => keepAfterPolarity.has(idx));

  const directionalMax = resolved
    .filter(p => p.type === 'bullish' || p.type === 'bearish')
    .reduce((max, p) => Math.max(max, p.confidence), 0);

  const deNoised = resolved.filter(p => {
    if (p.type !== 'neutral') return true;
    if (p.category !== 'candlestick' && p.category !== 'volatility') return true;
    if (p.confidence >= 68) return true;
    return directionalMax < 68;
  });

  return deNoised.sort((a, b) => {
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

  const tf = (timeframe || '').toLowerCase();
  const candlestickTimeframes = new Set(['1m', '3m', '5m', '10m', '15m', '30m', '45m', '1h', '2h', '4h', '1d', 'daily']);
  if (!timeframe || candlestickTimeframes.has(tf)) {
    const candlestickResults = scanCandlestickPatterns(ohlc);
    results.push(...candlestickResults);
  }

  return postProcessPatternDetections(results, ohlc.length);
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
  detectMarubozu,

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

  // Classical structural reversals
  detectDoubleTop,
  detectDoubleBottom,
  detectRisingWedge,
  detectFallingWedge,

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
