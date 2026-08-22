import { OHLC, MarketHealthIndicators, TimeframePatternIntel } from '../fusion';

export interface InstitutionalSignatureResult {
  signatureScore: number; // 0-1
  likelyAction: 'accumulate' | 'distribute' | 'neutral';
  clues: string[];
  confidence?: number;
}

export function analyzeInstitutionalSignature(ohlcByTF: Partial<Record<string, OHLC[]>>, marketHealth: MarketHealthIndicators, timeframes: TimeframePatternIntel[]): InstitutionalSignatureResult {
  const clues: string[] = [];
  const sweepDetected = timeframes.some(t =>
    (t.allPatterns || []).some(p => p.category === 'liquidity' && p.name.toLowerCase().includes('sweep'))
  );
  if (sweepDetected) clues.push('sweep');

  const vwapSlope = marketHealth.vwapSlope?.value ?? 0;
  const slopeStrength = Math.max(0, Math.min(1, Math.abs(vwapSlope) / 0.0022));
  if (slopeStrength > 0.35) clues.push(vwapSlope >= 0 ? 'vwap_up' : 'vwap_down');

  const rsi = marketHealth.rsi?.value ?? 50;
  const adx = marketHealth.adx?.value ?? 20;
  const breadth = marketHealth.breadth?.value ?? 0.5;
  const orderflow = marketHealth.orderflow?.value ?? 0;

  const htfTrend = timeframes.find(t => t.timeframe === '4h' || t.timeframe === '1D')?.trendBias ?? 'neutral';
  if (htfTrend !== 'neutral') clues.push(`htf_${htfTrend}`);

  const ltfTrend = timeframes.find(t => t.timeframe === '15m' || t.timeframe === '5m')?.trendBias ?? 'neutral';
  if (ltfTrend !== 'neutral') clues.push(`ltf_${ltfTrend}`);

  const trendAgreement = htfTrend !== 'neutral' && htfTrend === ltfTrend ? 1 : htfTrend === 'neutral' || ltfTrend === 'neutral' ? 0.55 : 0.2;
  const biasScore =
    (vwapSlope >= 0 ? 1 : -1) * 0.24 +
    ((rsi - 50) / 50) * 0.22 +
    (orderflow) * 0.2 +
    ((breadth - 0.5) * 2) * 0.14 +
    ((trendAgreement - 0.5) * 2) * 0.2;

  const action: 'accumulate' | 'distribute' | 'neutral' =
    biasScore > 0.1 ? 'accumulate' :
    biasScore < -0.1 ? 'distribute' :
    'neutral';

  const score = Math.max(0, Math.min(1,
    slopeStrength * 0.24 +
    Math.max(0, Math.min(1, adx / 35)) * 0.2 +
    Math.max(0, Math.min(1, Math.abs(rsi - 50) / 20)) * 0.16 +
    Math.max(0, Math.min(1, Math.abs(orderflow))) * 0.14 +
    trendAgreement * 0.16 +
    (sweepDetected ? 0.1 : 0)
  ));

  return {
    signatureScore: score,
    likelyAction: action,
    clues,
    confidence: Math.max(0, Math.min(1, score * (0.75 + Math.min(1, adx / 50) * 0.25))),
  };
}
