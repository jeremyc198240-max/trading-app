import { OHLC } from './fusion';
import { computeEMACloud } from './finance';

export type EMATrendDirection = 'bullish' | 'bearish' | 'neutral';
export type EMAVolRegime = 'low' | 'normal' | 'high';

export interface EMACloudTrend {
  direction: EMATrendDirection;
  strength: number;
  compression: boolean;
  exhaustion: boolean;
  flip: boolean;
  volatilityRegime: EMAVolRegime;
}

function computeEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  ema.push(sum / period);
  for (let i = period; i < prices.length; i++) {
    ema.push(prices[i] * k + ema[ema.length - 1] * (1 - k));
  }
  return ema;
}

function detectCompression(ema9: number[], ema21: number[]): boolean {
  if (ema9.length < 5 || ema21.length < 5) return false;
  const recent9 = ema9.slice(-5);
  const recent21 = ema21.slice(-5);
  const spreads = recent9.map((v, i) => Math.abs(v - recent21[i]));
  const avgSpread = spreads.reduce((a, b) => a + b, 0) / spreads.length;
  const currentSpread = spreads[spreads.length - 1];
  return currentSpread < avgSpread * 0.5;
}

function detectExhaustion(ema9: number[], ema21: number[], closes: number[]): boolean {
  if (ema9.length < 10 || ema21.length < 10 || closes.length < 10) return false;
  const recent9 = ema9.slice(-5);
  const momentum = recent9.map((v, i) => (i > 0 ? v - recent9[i - 1] : 0));
  const decreasingMomentum = momentum.slice(1).every((m, i) => Math.abs(m) < Math.abs(momentum[i]));
  const lastClose = closes[closes.length - 1];
  const lastEma9 = ema9[ema9.length - 1];
  const lastEma21 = ema21[ema21.length - 1];
  const overextended = lastEma9 > lastEma21 
    ? (lastClose - lastEma21) > (lastEma9 - lastEma21) * 2
    : (lastEma21 - lastClose) > (lastEma21 - lastEma9) * 2;
  return decreasingMomentum && overextended;
}

function detectFlip(ema9: number[], ema21: number[]): boolean {
  if (ema9.length < 3 || ema21.length < 3) return false;
  const prev9 = ema9[ema9.length - 2];
  const prev21 = ema21[ema21.length - 2];
  const curr9 = ema9[ema9.length - 1];
  const curr21 = ema21[ema21.length - 1];
  const wasBullish = prev9 > prev21;
  const isBullish = curr9 > curr21;
  return wasBullish !== isBullish;
}

function computeVolatilityRegime(closes: number[]): EMAVolRegime {
  if (closes.length < 20) return 'normal';
  const returns = closes.slice(1).map((c, i) => Math.abs((c - closes[i]) / closes[i]));
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  if (avgReturn > 0.02) return 'high';
  if (avgReturn < 0.005) return 'low';
  return 'normal';
}

function computeStrength(ema9: number[], ema21: number[], trend: 'bullish' | 'bearish' | 'neutral'): number {
  if (ema9.length < 5 || ema21.length < 5) return 50;
  const last9 = ema9[ema9.length - 1];
  const last21 = ema21[ema21.length - 1];
  const spread = Math.abs(last9 - last21) / last21;
  const spreadStrength = Math.min(spread * 1000, 50);
  const recent9 = ema9.slice(-5);
  const momentum = recent9.map((v, i) => (i > 0 ? v - recent9[i - 1] : 0));
  const avgMomentum = momentum.slice(1).reduce((a, b) => a + b, 0) / (momentum.length - 1);
  const momentumStrength = Math.min(Math.abs(avgMomentum) * 100, 50);
  let strength = spreadStrength + momentumStrength;
  if (trend === 'neutral') strength *= 0.5;
  return Math.min(Math.max(strength, 0), 100);
}

export function computeEMACloudTrend(ohlc: OHLC[], timeframe: string): EMACloudTrend | null {
  if (ohlc.length < 21) return null;

  const closes = ohlc.map(c => c.close);
  const ema9 = computeEMA(closes, 9);
  const ema21 = computeEMA(closes, 21);

  if (ema9.length === 0 || ema21.length === 0) return null;

  const last9 = ema9[ema9.length - 1];
  const last21 = ema21[ema21.length - 1];

  const direction: EMATrendDirection = 
    last9 > last21 * 1.001 ? 'bullish' : 
    last9 < last21 * 0.999 ? 'bearish' : 'neutral';

  const compression = detectCompression(ema9, ema21);
  const exhaustion = detectExhaustion(ema9, ema21, closes);
  const flip = detectFlip(ema9, ema21);
  const volatilityRegime = computeVolatilityRegime(closes);
  const strength = computeStrength(ema9, ema21, direction);

  return {
    direction,
    strength,
    compression,
    exhaustion,
    flip,
    volatilityRegime
  };
}
