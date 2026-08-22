import { OHLC, MarketHealthIndicators, TimeframePatternIntel } from '../fusion';

export interface DisplacementResult {
  displacementScore: number;
  retailDrift: number;
  institutionalMove: number;
}

export function analyzeDisplacement(ohlcByTF: Partial<Record<string, OHLC[]>>, marketHealth: MarketHealthIndicators, timeframes: TimeframePatternIntel[]): DisplacementResult {
  // Placeholder: compare 1m impulse vs 15m trend
  const tf1 = timeframes.find(t => t.timeframe === '1m');
  const tf15 = timeframes.find(t => t.timeframe === '15m');
  const inst = tf15?.primary?.confidence ?? 0;
  const retail = tf1?.primary?.confidence ?? 0;
  const displacementScore = Math.max(0, Math.min(1, Math.abs(inst - retail)));
  return { displacementScore, retailDrift: retail, institutionalMove: inst };
}
