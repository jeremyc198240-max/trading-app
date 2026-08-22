import { OHLC, MarketHealthIndicators, TimeframePatternIntel } from '../fusion';

export interface MarketDNAResult {
  fingerprint: Record<string, number>;
  reliability: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

export function analyzeMarketDNA(ohlcByTF: Partial<Record<string, OHLC[]>>, marketHealth: MarketHealthIndicators, timeframes: TimeframePatternIntel[]): MarketDNAResult {
  const tfEntries = Object.entries(ohlcByTF ?? {}).filter(([, candles]) => Array.isArray(candles) && candles.length >= 8);

  const primary = tfEntries[0]?.[1] as OHLC[] | undefined;
  const secondary = tfEntries.find(([, candles]) => (candles as OHLC[]).length >= 16)?.[1] as OHLC[] | undefined;

  const primarySeries = primary ?? [];
  const secondarySeries = secondary ?? primarySeries;

  const scoreTrend = clamp01(((marketHealth.vwapSlope?.value ?? 0) + 1) / 2);
  const scoreMomentum = clamp01(((marketHealth.rsi?.value ?? 50) - 40) / 40);
  const scoreVol = clamp01((marketHealth.adx?.value ?? 0) / 40);
  const scoreBreadth = clamp01(((marketHealth.breadth?.value ?? 0.5) + 0.5) / 1.0);
  const scoreOrderflow = clamp01(((marketHealth.orderflow?.value ?? 0.5) + 0.5) / 1.0);

  const trendBias = (marketHealth.vwapSlope?.value ?? 0) >= 0 ? 1 : -1;
  const momentumBias = (marketHealth.rsi?.value ?? 50) >= 50 ? 1 : -1;

  const primaryDelta = primarySeries.length >= 2
    ? ((primarySeries[primarySeries.length - 1].close - primarySeries[primarySeries.length - 2].close) / Math.max(primarySeries[primarySeries.length - 2].close, 1e-6))
    : 0;
  const secondaryDelta = secondarySeries.length >= 2
    ? ((secondarySeries[secondarySeries.length - 1].close - secondarySeries[secondarySeries.length - 2].close) / Math.max(secondarySeries[secondarySeries.length - 2].close, 1e-6))
    : 0;

  const directionalAgreement = (primaryDelta >= 0 && secondaryDelta >= 0) || (primaryDelta < 0 && secondaryDelta < 0) ? 1 : 0.6;
  const compressionScore = primarySeries.length >= 10
    ? clamp01(1 - Math.min(1, Math.abs(primarySeries[primarySeries.length - 1].close - primarySeries[primarySeries.length - 10].close) / (primarySeries[primarySeries.length - 10].close * 0.03)))
    : 0.5;

  const sweepFreq = clamp01((scoreMomentum * 0.35) + (scoreVol * 0.25) + (compressionScore * 0.2) + (scoreOrderflow * 0.2));
  const institutionalScore = clamp01((scoreTrend * 0.3) + (scoreMomentum * 0.25) + (scoreVol * 0.2) + (scoreBreadth * 0.15) + (directionalAgreement * 0.1));
  const directionalSkew = clamp01(
    0.42 * scoreTrend +
    0.26 * scoreMomentum +
    0.12 * scoreOrderflow +
    0.1 * scoreBreadth +
    0.1 * directionalAgreement
  );
  const institutionalIntent = clamp01(
    institutionalScore * 0.52 +
    directionalSkew * 0.28 +
    scoreOrderflow * 0.12 +
    (1 - compressionScore) * 0.08
  );
  const obReliability = clamp01((institutionalScore * 0.7) + (compressionScore * 0.3));

  return {
    fingerprint: {
      sweepFreq,
      obReliability,
      institutionalScore,
      institutionalIntent,
      trendBias,
      momentumBias,
      compressionScore,
      directionalSkew,
      orderflowScore: scoreOrderflow,
      breadthScore: scoreBreadth,
      volatilityScore: scoreVol,
    },
    reliability: obReliability,
  };
}
