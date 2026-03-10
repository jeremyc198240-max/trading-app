import { OHLC } from './fusion';

export interface MTFReversalSignal {
  hasReversal: boolean;
  direction: 'bullish' | 'bearish' | 'none';
  pattern30m: string | null;
  patterns5m: string[];
  confidence: number;
  confluenceScore: number;
  reasons: string[];
  entryZone: { min: number; max: number } | null;
  stopLoss: number | null;
}

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

function inferTrendBias(ohlc: OHLC[], lookback = 10): 'bullish' | 'bearish' | 'neutral' {
  if (ohlc.length < lookback) return 'neutral';
  const recent = ohlc.slice(-lookback);
  const first = recent[0].close;
  const last = recent[recent.length - 1].close;
  const changePct = ((last - first) / first) * 100;
  
  if (changePct > 0.3) return 'bullish';
  if (changePct < -0.3) return 'bearish';
  return 'neutral';
}

function detectHammerPattern(ohlc: OHLC[]): { found: boolean; confidence: number } {
  if (ohlc.length < 5) return { found: false, confidence: 0 };
  
  const last = ohlc[ohlc.length - 1];
  const range = totalRange(last);
  if (range < 0.001) return { found: false, confidence: 0 };
  
  const body = bodySize(last);
  const lower = lowerWick(last);
  const upper = upperWick(last);
  
  const isHammer = lower >= body * 2 && upper < body * 0.5 && body / range < 0.4;
  const trend = inferTrendBias(ohlc);
  const inDowntrend = trend === 'bearish';
  
  if (isHammer && inDowntrend) {
    const conf = Math.min(85, 65 + (lower / body) * 5);
    return { found: true, confidence: conf };
  }
  
  return { found: false, confidence: 0 };
}

function detectShootingStarPattern(ohlc: OHLC[]): { found: boolean; confidence: number } {
  if (ohlc.length < 5) return { found: false, confidence: 0 };
  
  const last = ohlc[ohlc.length - 1];
  const range = totalRange(last);
  if (range < 0.001) return { found: false, confidence: 0 };
  
  const body = bodySize(last);
  const upper = upperWick(last);
  const lower = lowerWick(last);
  
  const isShootingStar = upper >= body * 2 && lower < body * 0.5 && body / range < 0.4;
  const trend = inferTrendBias(ohlc);
  const inUptrend = trend === 'bullish';
  
  if (isShootingStar && inUptrend) {
    const conf = Math.min(85, 65 + (upper / body) * 5);
    return { found: true, confidence: conf };
  }
  
  return { found: false, confidence: 0 };
}

function detect5mConfirmationPatterns(ohlc: OHLC[], expectedDirection: 'bullish' | 'bearish'): {
  patterns: string[];
  confirmationScore: number;
} {
  const patterns: string[] = [];
  let score = 0;
  
  if (ohlc.length < 5) return { patterns, confirmationScore: 0 };
  
  const last = ohlc[ohlc.length - 1];
  const prev = ohlc[ohlc.length - 2];
  const prev2 = ohlc[ohlc.length - 3];
  
  if (!last || !prev) return { patterns, confirmationScore: 0 };
  
  const range = totalRange(last);
  const body = bodySize(last);
  const upper = upperWick(last);
  const lower = lowerWick(last);
  
  if (expectedDirection === 'bullish') {
    if (isBullish(last) && last.close > prev.open && last.open < prev.close && isBearish(prev)) {
      patterns.push('Bullish Engulfing (5m)');
      score += 25;
    }
    
    if (lower >= body * 2 && upper < body * 0.5 && body / range < 0.4) {
      patterns.push('Hammer (5m)');
      score += 20;
    }
    
    if (isBullish(last) && body > range * 0.6) {
      patterns.push('Strong Bullish Candle (5m)');
      score += 15;
    }
    
    if (last.close > prev.high) {
      patterns.push('Higher High (5m)');
      score += 15;
    }
    
    if (prev2 && isBearish(prev2) && body < prev2.high - prev2.low && isBullish(last)) {
      patterns.push('Morning Star forming (5m)');
      score += 20;
    }
    
    if (last.low > prev.low && last.high > prev.high) {
      patterns.push('Higher Low + Higher High (5m)');
      score += 15;
    }
  } else {
    if (isBearish(last) && last.close < prev.open && last.open > prev.close && isBullish(prev)) {
      patterns.push('Bearish Engulfing (5m)');
      score += 25;
    }
    
    if (upper >= body * 2 && lower < body * 0.5 && body / range < 0.4) {
      patterns.push('Shooting Star (5m)');
      score += 20;
    }
    
    if (isBearish(last) && body > range * 0.6) {
      patterns.push('Strong Bearish Candle (5m)');
      score += 15;
    }
    
    if (last.close < prev.low) {
      patterns.push('Lower Low (5m)');
      score += 15;
    }
    
    if (prev2 && isBullish(prev2) && body < prev2.high - prev2.low && isBearish(last)) {
      patterns.push('Evening Star forming (5m)');
      score += 20;
    }
    
    if (last.low < prev.low && last.high < prev.high) {
      patterns.push('Lower High + Lower Low (5m)');
      score += 15;
    }
  }
  
  return { patterns, confirmationScore: Math.min(score, 100) };
}

export function computeMTFReversal(params: {
  ohlc30m: OHLC[];
  ohlc5m: OHLC[];
  currentPrice: number;
}): MTFReversalSignal {
  const { ohlc30m, ohlc5m, currentPrice } = params;
  
  const reasons: string[] = [];
  let pattern30m: string | null = null;
  let direction: 'bullish' | 'bearish' | 'none' = 'none';
  let baseConfidence = 0;
  
  const hammerResult = detectHammerPattern(ohlc30m);
  if (hammerResult.found) {
    pattern30m = 'Hammer (30m)';
    direction = 'bullish';
    baseConfidence = hammerResult.confidence;
    reasons.push('Hammer detected on 30m in downtrend - bullish reversal setup');
  }
  
  if (!pattern30m) {
    const shootingStarResult = detectShootingStarPattern(ohlc30m);
    if (shootingStarResult.found) {
      pattern30m = 'Shooting Star (30m)';
      direction = 'bearish';
      baseConfidence = shootingStarResult.confidence;
      reasons.push('Shooting Star detected on 30m in uptrend - bearish reversal setup');
    }
  }
  
  if (!pattern30m || direction === 'none') {
    return {
      hasReversal: false,
      direction: 'none',
      pattern30m: null,
      patterns5m: [],
      confidence: 0,
      confluenceScore: 0,
      reasons: ['No hammer/shooting star pattern detected on 30m'],
      entryZone: null,
      stopLoss: null
    };
  }
  
  const confirmation = detect5mConfirmationPatterns(ohlc5m, direction as 'bullish' | 'bearish');
  
  const hasConfirmation = confirmation.confirmationScore >= 20;
  
  if (hasConfirmation) {
    reasons.push(`5m confirmation: ${confirmation.patterns.join(', ')}`);
    // HIGH CONVICTION: 5m strong candle off a major level or after "selling weak" signal
    const last5m = ohlc5m[ohlc5m.length - 1];
    if (direction === 'bullish' && last5m && isBullish(last5m) && bodySize(last5m) / totalRange(last5m) > 0.7) {
      baseConfidence += 15;
      reasons.push('Strong 5m impulse candle detected - high conviction');
    }
  } else {
    reasons.push('Awaiting 5m confirmation patterns');
  }
  
  const confluenceScore = Math.min(100, Math.round(
    (baseConfidence * 0.6) + (confirmation.confirmationScore * 0.4)
  ));
  
  const finalConfidence = hasConfirmation 
    ? Math.min(90, baseConfidence + (confirmation.confirmationScore * 0.3))
    : baseConfidence * 0.7;
  
  const last30m = ohlc30m[ohlc30m.length - 1];
  let entryZone: { min: number; max: number } | null = null;
  let stopLoss: number | null = null;
  
  if (direction === 'bullish' && last30m) {
    const entryPoint = last30m.close;
    entryZone = {
      min: Math.round((entryPoint * 0.998) * 100) / 100,
      max: Math.round((entryPoint * 1.002) * 100) / 100
    };
    stopLoss = Math.round((last30m.low * 0.995) * 100) / 100;
    reasons.push(`Entry zone: $${entryZone.min} - $${entryZone.max}`);
    reasons.push(`Stop loss below 30m low: $${stopLoss}`);
  } else if (direction === 'bearish' && last30m) {
    const entryPoint = last30m.close;
    entryZone = {
      min: Math.round((entryPoint * 0.998) * 100) / 100,
      max: Math.round((entryPoint * 1.002) * 100) / 100
    };
    stopLoss = Math.round((last30m.high * 1.005) * 100) / 100;
    reasons.push(`Entry zone: $${entryZone.min} - $${entryZone.max}`);
    reasons.push(`Stop loss above 30m high: $${stopLoss}`);
  }
  
  const hasReversal = hasConfirmation && confluenceScore >= 50;
  
  return {
    hasReversal,
    direction: hasReversal ? direction : 'none',
    pattern30m,
    patterns5m: confirmation.patterns,
    confidence: Math.round(finalConfidence),
    confluenceScore,
    reasons,
    entryZone: hasReversal ? entryZone : null,
    stopLoss: hasReversal ? stopLoss : null
  };
}
