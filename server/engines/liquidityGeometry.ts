import { OHLC, MarketHealthIndicators, TimeframePatternIntel } from '../fusion';

export interface LiquidityGeometryResult {
  score: number; // 0-1
  patterns: string[];
  details?: Record<string, any>;
}

export function analyzeLiquidityGeometry(ohlcByTF: Partial<Record<string, OHLC[]>>, marketHealth: MarketHealthIndicators, timeframes: TimeframePatternIntel[]): LiquidityGeometryResult {
  // Placeholder: simple heuristic using compression consensus and vwap slope
  const slope = marketHealth.vwapSlope?.value ?? 0;
  const compression = timeframes.reduce((s, t) => s + (t.structuralCompression ?? 0), 0) / Math.max(1, timeframes.length);
  const score = Math.max(0, Math.min(1, compression * 0.7 + Math.abs(slope) * 0.3));

  const patterns: string[] = [];
  if (compression > 0.6) patterns.push('cluster');
  if (Math.abs(slope) > 0.001) patterns.push('directional');

  return { score, patterns, details: { compression, slope } };
}
