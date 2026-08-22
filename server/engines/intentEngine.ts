import { OHLC, MarketHealthIndicators, TimeframePatternIntel } from '../fusion';

export interface IntentResult {
  intent: 'accumulation' | 'manipulation' | 'expansion' | 'distribution' | 'reversal' | 'continuation' | 'unknown';
  confidence: number;
}

export function analyzeIntent(ohlcByTF: Partial<Record<string, OHLC[]>>, marketHealth: MarketHealthIndicators, timeframes: TimeframePatternIntel[]): IntentResult {
  // Placeholder: derive from vwapSlope
  const slope = marketHealth.vwapSlope?.value ?? 0;
  if (slope > 0.001) return { intent: 'accumulation', confidence: Math.min(1, slope * 500) };
  if (slope < -0.001) return { intent: 'distribution', confidence: Math.min(1, Math.abs(slope) * 500) };
  return { intent: 'unknown', confidence: 0.2 };
}
