import { OHLC, MarketHealthIndicators, TimeframePatternIntel } from '../fusion';

export interface BreakerResult {
  hasBreaker: boolean;
  score: number;
  reasons: string[];
}

export function analyzeBreaker(ohlcByTF: Partial<Record<string, OHLC[]>>, marketHealth: MarketHealthIndicators, timeframes: TimeframePatternIntel[]): BreakerResult {
  // Placeholder: detect sudden large candle breaking recent range
  let breaker = false;
  let reasons: string[] = [];
  for (const tf of timeframes) {
    const p = tf.primary;
    if (!p) continue;
    if (p.confidence > 0.85 && p.category === 'breakout') {
      breaker = true;
      reasons.push(`${tf.timeframe} breakout`);
    }
  }
  return { hasBreaker: breaker, score: breaker ? 1 : 0, reasons };
}
