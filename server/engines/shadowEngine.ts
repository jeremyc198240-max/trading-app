import { OHLC, MarketHealthIndicators, TimeframePatternIntel } from '../fusion';

export interface ShadowResult {
  shadowBias: 'bull' | 'bear' | 'neutral';
  score: number;
}

export function analyzeShadow(ohlcByTF: Partial<Record<string, OHLC[]>>, marketHealth: MarketHealthIndicators, timeframes: TimeframePatternIntel[]): ShadowResult {
  const slope = marketHealth.vwapSlope?.value ?? 0;
  const bias = slope > 0.0005 ? 'bull' : slope < -0.0005 ? 'bear' : 'neutral';
  return { shadowBias: bias, score: Math.min(1, Math.abs(slope) * 500) };
}
