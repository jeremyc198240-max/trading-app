import { OHLC, MarketHealthIndicators, TimeframePatternIntel } from '../fusion';

export interface CycleResult {
  phase: 'accumulation' | 'manipulation' | 'expansion' | 'distribution' | 'reversal' | 'continuation' | 'unknown';
  score: number;
}

export function analyzeCycle(ohlcByTF: Partial<Record<string, OHLC[]>>, marketHealth: MarketHealthIndicators, timeframes: TimeframePatternIntel[]): CycleResult {
  // Placeholder: forward to Intent engine behavior
  const slope = marketHealth.vwapSlope?.value ?? 0;
  if (slope > 0.001) return { phase: 'expansion', score: Math.min(1, slope * 500) };
  if (slope < -0.001) return { phase: 'distribution', score: Math.min(1, Math.abs(slope) * 500) };
  return { phase: 'unknown', score: 0.2 };
}
