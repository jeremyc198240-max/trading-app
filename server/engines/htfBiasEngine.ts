import { OHLC, MarketHealthIndicators, TimeframePatternIntel } from '../fusion';

export interface HTFBiasResult {
  bias: 'bullish' | 'bearish' | 'neutral';
  score: number; // 0-1
  reasons?: string[];
}

export function analyzeHTFBias(timeframes: TimeframePatternIntel[], marketHealth: MarketHealthIndicators): HTFBiasResult {
  // Heuristic: look at 4h/1D trend and vwap slope
  const tf4h = timeframes.find(t => t.timeframe === '4h');
  const tf1d = timeframes.find(t => t.timeframe === '1D');
  const vwapSlope = marketHealth.vwapSlope?.value ?? 0;
  let score = 0;
  let reasons: string[] = [];

  if (tf1d?.trendBias === 'bullish' || tf4h?.trendBias === 'bullish') {
    score += 0.6;
    reasons.push('HTF trend bullish');
  }
  if (tf1d?.trendBias === 'bearish' || tf4h?.trendBias === 'bearish') {
    score -= 0.6;
    reasons.push('HTF trend bearish');
  }

  // vwapSlope nudges the score
  score += Math.max(-0.3, Math.min(0.3, vwapSlope * 200));

  const bias = score > 0.15 ? 'bullish' : score < -0.15 ? 'bearish' : 'neutral';
  return { bias, score: Math.max(0, Math.min(1, Math.abs(score))), reasons };
}
