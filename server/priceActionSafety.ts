import type { OHLC } from './fusion';

export interface PriceActionSafety {
  momentumDirection: 'bullish' | 'bearish' | 'neutral';
  momentumStrength: number;
  recentTrendScore: number;
  candleConsistency: number;
  contradiction: boolean;
  contradictionSeverity: 'none' | 'mild' | 'moderate' | 'severe';
  safetyAction: 'allow' | 'reduce_confidence' | 'force_wait';
  confidenceMultiplier: number;
  reasons: string[];
}

function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function computePriceActionSafety(params: {
  recentOhlc: OHLC[];
  signalDirection: 'CALL' | 'PUT' | 'WAIT';
  currentPrice: number;
}): PriceActionSafety {
  const { recentOhlc, signalDirection, currentPrice } = params;

  const result: PriceActionSafety = {
    momentumDirection: 'neutral',
    momentumStrength: 0,
    recentTrendScore: 0,
    candleConsistency: 0,
    contradiction: false,
    contradictionSeverity: 'none',
    safetyAction: 'allow',
    confidenceMultiplier: 1.0,
    reasons: []
  };

  if (recentOhlc.length < 5 || signalDirection === 'WAIT') {
    return result;
  }

  const lookback = Math.min(10, recentOhlc.length);
  const candles = recentOhlc.slice(-lookback);

  let greenCount = 0;
  let redCount = 0;
  let totalBodySize = 0;
  let bullishBodySum = 0;
  let bearishBodySum = 0;

  for (const c of candles) {
    const body = c.close - c.open;
    const absBody = Math.abs(body);
    totalBodySize += absBody;

    if (body > 0) {
      greenCount++;
      bullishBodySum += absBody;
    } else if (body < 0) {
      redCount++;
      bearishBodySum += absBody;
    }
  }

  const greenRatio = greenCount / candles.length;
  const redRatio = redCount / candles.length;

  const netBodyBias = totalBodySize > 0
    ? (bullishBodySum - bearishBodySum) / totalBodySize
    : 0;

  const firstClose = candles[0].close;
  const lastClose = candles[candles.length - 1].close;
  const priceChangePct = firstClose > 0
    ? ((lastClose - firstClose) / firstClose) * 100
    : 0;

  const hlhCount = countHigherLowsHigherHighs(candles);
  const lhllCount = countLowerHighsLowerLows(candles);
  const structureScore = (hlhCount - lhllCount) / Math.max(1, candles.length - 1);

  const trendScore = clamp(
    netBodyBias * 0.35 +
    structureScore * 0.35 +
    (priceChangePct / 0.5) * 0.30,
    -1, 1
  );

  result.recentTrendScore = Math.round(trendScore * 100);

  if (trendScore > 0.15) {
    result.momentumDirection = 'bullish';
    result.momentumStrength = Math.round(trendScore * 100);
  } else if (trendScore < -0.15) {
    result.momentumDirection = 'bearish';
    result.momentumStrength = Math.round(Math.abs(trendScore) * 100);
  } else {
    result.momentumDirection = 'neutral';
    result.momentumStrength = Math.round(Math.abs(trendScore) * 100);
  }

  result.candleConsistency = Math.round(
    Math.max(greenRatio, redRatio) * 100
  );

  const signalIsBullish = signalDirection === 'CALL';
  const signalIsBearish = signalDirection === 'PUT';

  const hasContradiction =
    (signalIsBullish && result.momentumDirection === 'bearish') ||
    (signalIsBearish && result.momentumDirection === 'bullish');

  if (hasContradiction) {
    result.contradiction = true;
    const severity = result.momentumStrength;

    if (severity >= 60 && result.candleConsistency >= 70) {
      result.contradictionSeverity = 'severe';
      result.safetyAction = 'force_wait';
      result.confidenceMultiplier = 0.0;
      result.reasons.push(
        `SAFETY: Price strongly pushing ${result.momentumDirection} (${severity}%) contradicts ${signalDirection} signal`
      );
      result.reasons.push(
        `${result.candleConsistency}% candle consistency against signal - forcing WAIT`
      );
    } else if (severity >= 40 && result.candleConsistency >= 60) {
      result.contradictionSeverity = 'moderate';
      result.safetyAction = 'reduce_confidence';
      result.confidenceMultiplier = 0.5;
      result.reasons.push(
        `CAUTION: Price momentum ${result.momentumDirection} (${severity}%) conflicts with ${signalDirection}`
      );
      result.reasons.push(
        `Confidence reduced 50% - wait for momentum to align before entry`
      );
    } else if (severity >= 20) {
      result.contradictionSeverity = 'mild';
      result.safetyAction = 'reduce_confidence';
      result.confidenceMultiplier = 0.75;
      result.reasons.push(
        `NOTE: Mild price drift ${result.momentumDirection} vs ${signalDirection} signal - slight confidence reduction`
      );
    }

    const recentCandles = candles.slice(-3);
    const consecutiveTrend = recentCandles.every(c =>
      result.momentumDirection === 'bullish' ? c.close > c.open : c.close < c.open
    );
    if (consecutiveTrend && result.contradictionSeverity !== 'severe') {
      result.contradictionSeverity = result.contradictionSeverity === 'moderate' ? 'severe' : 'moderate';
      if (result.contradictionSeverity === 'severe') {
        result.safetyAction = 'force_wait';
        result.confidenceMultiplier = 0.0;
        result.reasons.push(
          `Last 3 candles all ${result.momentumDirection} - escalated to WAIT`
        );
      } else {
        result.confidenceMultiplier = Math.min(result.confidenceMultiplier, 0.6);
        result.reasons.push(
          `Last 3 candles trending ${result.momentumDirection} against signal`
        );
      }
    }
  } else if (result.momentumDirection !== 'neutral' && result.momentumStrength >= 30) {
    result.reasons.push(
      `Price momentum aligns with ${signalDirection} (${result.momentumStrength}% ${result.momentumDirection})`
    );
    result.confidenceMultiplier = Math.min(1.1, 1 + result.momentumStrength * 0.001);
  }

  return result;
}

function countHigherLowsHigherHighs(candles: OHLC[]): number {
  let count = 0;
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].low > candles[i - 1].low && candles[i].high > candles[i - 1].high) {
      count++;
    }
  }
  return count;
}

function countLowerHighsLowerLows(candles: OHLC[]): number {
  let count = 0;
  for (let i = 1; i < candles.length; i++) {
    if (candles[i].high < candles[i - 1].high && candles[i].low < candles[i - 1].low) {
      count++;
    }
  }
  return count;
}
