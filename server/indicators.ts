import { CONFIG } from './config';

interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time?: number;
}

export interface GammaSummary { 
  maxAbsGammaStrike: number | null; 
}

export interface MarketBreadth {
  advanceDecline: number;
  newHighsLows: number;
  composite: number;
  contribution: number;
}

export interface OrderflowData {
  tickImbalance: number;
  volumeDelta: number;
  contribution: number;
}

export interface MarketHealthIndicators {
  rsi: { value: number; signal: 'overbought' | 'oversold' | 'neutral'; contribution: number };
  macd: { value: number; signal: number; histogram: number; trend: 'bullish' | 'bearish' | 'neutral'; contribution: number };
  adx: { value: number; plusDI: number; minusDI: number; trendStrength: 'weak' | 'moderate' | 'strong'; contribution: number };
  obv: { value: number; trend: 'bullish' | 'bearish' | 'neutral'; contribution: number };
  cmf: { value: number; signal: 'accumulation' | 'distribution' | 'neutral'; contribution: number };
  atr: { value: number; percent: number };
  bollingerBands: { upper: number; middle: number; lower: number; squeeze: boolean; percentB: number; contribution: number };
  keltnerChannel: { upper: number; middle: number; lower: number; breakout: 'upper' | 'lower' | null; contribution: number };
  stochastic: { k: number; d: number; signal: 'overbought' | 'oversold' | 'neutral'; contribution: number };
  vwapSlope: { value: number; trend: 'bullish' | 'bearish' | 'neutral'; contribution: number };
  ivChange: { value: number; signal: 'elevated' | 'low' | 'neutral'; contribution: number };
  orderflow: OrderflowData;
  gamma: GammaSummary & { contribution: number };
  breadth: MarketBreadth;
  overallHealth: number;
  healthGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  contributors: { name: string; value: number }[];
}

function computeSMA(data: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      result.push(0);
    } else {
      const sum = data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0);
      result.push(sum / period);
    }
  }
  return result;
}

function computeEMA(data: number[], period: number): number[] {
  if (data.length < period) return data.map(() => 0);
  const k = 2 / (period + 1);
  const result: number[] = [];
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += data[i];
    result.push(0);
  }
  result[period - 1] = sum / period;
  for (let i = period; i < data.length; i++) {
    result.push(data[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

export function computeRSI(ohlc: OHLC[], period: number = 14): { value: number; signal: 'overbought' | 'oversold' | 'neutral'; contribution: number } {
  if (ohlc.length < period + 1) return { value: 50, signal: 'neutral', contribution: 0 };
  
  const closes = ohlc.map(c => c.close);
  const gains: number[] = [];
  const losses: number[] = [];
  
  for (let i = 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    gains.push(change > 0 ? change : 0);
    losses.push(change < 0 ? Math.abs(change) : 0);
  }
  
  let avgGain = gains.slice(0, period).reduce((a, b) => a + b, 0) / period;
  let avgLoss = losses.slice(0, period).reduce((a, b) => a + b, 0) / period;
  
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
  }
  
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  
  let signal: 'overbought' | 'oversold' | 'neutral' = 'neutral';
  let contribution = 0;
  
  if (rsi >= 70) { signal = 'overbought'; contribution = -((rsi - 70) / 30) * 6; }
  else if (rsi <= 30) { signal = 'oversold'; contribution = ((30 - rsi) / 30) * 6; }
  else { contribution = ((rsi - 50) / 20) * 3; }
  
  return { value: Math.round(rsi * 100) / 100, signal, contribution };
}

export function computeMACD(ohlc: OHLC[], fast: number = 12, slow: number = 26, signal: number = 9): { value: number; signal: number; histogram: number; trend: 'bullish' | 'bearish' | 'neutral'; contribution: number } {
  const closes = ohlc.map(c => c.close);
  if (closes.length < slow + signal) return { value: 0, signal: 0, histogram: 0, trend: 'neutral', contribution: 0 };
  
  const emaFast = computeEMA(closes, fast);
  const emaSlow = computeEMA(closes, slow);
  
  const macdLine = emaFast.map((f, i) => f - emaSlow[i]);
  const signalLine = computeEMA(macdLine.slice(slow - 1), signal);
  
  const lastMACD = macdLine[macdLine.length - 1];
  const lastSignal = signalLine[signalLine.length - 1];
  const histogram = lastMACD - lastSignal;
  
  let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let contribution = 0;
  
  if (histogram > 0 && lastMACD > 0) { trend = 'bullish'; contribution = Math.min(histogram * 10, 6); }
  else if (histogram < 0 && lastMACD < 0) { trend = 'bearish'; contribution = Math.max(histogram * 10, -6); }
  else { contribution = histogram * 5; }
  
  return { value: Math.round(lastMACD * 100) / 100, signal: Math.round(lastSignal * 100) / 100, histogram: Math.round(histogram * 100) / 100, trend, contribution };
}

export function computeADX(ohlc: OHLC[], period: number = 14): { value: number; plusDI: number; minusDI: number; trendStrength: 'weak' | 'moderate' | 'strong'; contribution: number } {
  if (ohlc.length < period * 2) return { value: 25, plusDI: 25, minusDI: 25, trendStrength: 'weak', contribution: 0 };
  
  const tr: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];
  
  for (let i = 1; i < ohlc.length; i++) {
    const high = ohlc[i].high;
    const low = ohlc[i].low;
    const prevHigh = ohlc[i - 1].high;
    const prevLow = ohlc[i - 1].low;
    const prevClose = ohlc[i - 1].close;
    
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }
  
  const smoothTR = computeEMA(tr, period);
  const smoothPlusDM = computeEMA(plusDM, period);
  const smoothMinusDM = computeEMA(minusDM, period);
  
  const plusDI = smoothPlusDM.map((dm, i) => smoothTR[i] ? (dm / smoothTR[i]) * 100 : 0);
  const minusDI = smoothMinusDM.map((dm, i) => smoothTR[i] ? (dm / smoothTR[i]) * 100 : 0);
  
  const dx = plusDI.map((pdi, i) => {
    const sum = pdi + minusDI[i];
    return sum ? Math.abs(pdi - minusDI[i]) / sum * 100 : 0;
  });
  
  const adx = computeEMA(dx.slice(period), period);
  
  const lastADX = adx[adx.length - 1] || 25;
  const lastPlusDI = plusDI[plusDI.length - 1] || 25;
  const lastMinusDI = minusDI[minusDI.length - 1] || 25;
  
  let trendStrength: 'weak' | 'moderate' | 'strong' = 'weak';
  if (lastADX >= 50) trendStrength = 'strong';
  else if (lastADX >= 25) trendStrength = 'moderate';
  
  const diDiff = lastPlusDI - lastMinusDI;
  const contribution = (lastADX / 100) * (diDiff > 0 ? 8 : -8);
  
  return { value: Math.round(lastADX * 10) / 10, plusDI: Math.round(lastPlusDI * 10) / 10, minusDI: Math.round(lastMinusDI * 10) / 10, trendStrength, contribution };
}

export function computeOBV(ohlc: OHLC[]): { value: number; trend: 'bullish' | 'bearish' | 'neutral'; contribution: number } {
  if (ohlc.length < 10) return { value: 0, trend: 'neutral', contribution: 0 };
  
  let obv = 0;
  const obvSeries: number[] = [0];
  
  for (let i = 1; i < ohlc.length; i++) {
    if (ohlc[i].close > ohlc[i - 1].close) {
      obv += ohlc[i].volume;
    } else if (ohlc[i].close < ohlc[i - 1].close) {
      obv -= ohlc[i].volume;
    }
    obvSeries.push(obv);
  }
  
  const recentOBV = obvSeries.slice(-5);
  const obvSlope = (recentOBV[recentOBV.length - 1] - recentOBV[0]) / Math.max(Math.abs(recentOBV[0]), 1);
  
  let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let contribution = 0;
  
  if (obvSlope > 0.1) { trend = 'bullish'; contribution = Math.min(obvSlope * 10, 6); }
  else if (obvSlope < -0.1) { trend = 'bearish'; contribution = Math.max(obvSlope * 10, -6); }
  
  return { value: obv, trend, contribution };
}

export function computeCMF(ohlc: OHLC[], period: number = 20): { value: number; signal: 'accumulation' | 'distribution' | 'neutral'; contribution: number } {
  if (ohlc.length < period) return { value: 0, signal: 'neutral', contribution: 0 };
  
  const window = ohlc.slice(-period);
  let mfvSum = 0;
  let volumeSum = 0;
  
  for (const candle of window) {
    const range = candle.high - candle.low;
    const mfMultiplier = range === 0 ? 0 : ((candle.close - candle.low) - (candle.high - candle.close)) / range;
    mfvSum += mfMultiplier * candle.volume;
    volumeSum += candle.volume;
  }
  
  const cmf = volumeSum === 0 ? 0 : mfvSum / volumeSum;
  
  let signal: 'accumulation' | 'distribution' | 'neutral' = 'neutral';
  let contribution = 0;
  
  if (cmf > 0.1) { signal = 'accumulation'; contribution = cmf * 60; }
  else if (cmf < -0.1) { signal = 'distribution'; contribution = cmf * 60; }
  else { contribution = cmf * 30; }
  
  return { value: Math.round(cmf * 1000) / 1000, signal, contribution: Math.min(6, Math.max(-6, contribution)) };
}

export function computeATR(ohlc: OHLC[], period: number = 14): { value: number; percent: number } {
  if (ohlc.length < period + 1) return { value: 0, percent: 0 };
  
  const tr: number[] = [];
  for (let i = 1; i < ohlc.length; i++) {
    const high = ohlc[i].high;
    const low = ohlc[i].low;
    const prevClose = ohlc[i - 1].close;
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  
  const atr = computeEMA(tr, period);
  const lastATR = atr[atr.length - 1];
  const lastClose = ohlc[ohlc.length - 1].close;
  
  return { value: Math.round(lastATR * 100) / 100, percent: Math.round((lastATR / lastClose) * 10000) / 100 };
}

export function computeBollingerBands(ohlc: OHLC[], period: number = 20, stdDev: number = 2): { upper: number; middle: number; lower: number; squeeze: boolean; percentB: number; contribution: number } {
  const closes = ohlc.map(c => c.close);
  if (closes.length < period) return { upper: 0, middle: 0, lower: 0, squeeze: false, percentB: 50, contribution: 0 };
  
  const window = closes.slice(-period);
  const sma = window.reduce((a, b) => a + b, 0) / period;
  const variance = window.reduce((sum, val) => sum + Math.pow(val - sma, 2), 0) / period;
  const std = Math.sqrt(variance);
  
  const upper = sma + stdDev * std;
  const lower = sma - stdDev * std;
  const lastClose = closes[closes.length - 1];
  const bandwidth = (upper - lower) / sma;
  const squeeze = bandwidth < 0.02;
  const percentB = ((lastClose - lower) / (upper - lower)) * 100;
  
  let contribution = 0;
  if (squeeze) contribution = 7;
  else if (percentB > 80) contribution = -((percentB - 80) / 20) * 5;
  else if (percentB < 20) contribution = ((20 - percentB) / 20) * 5;
  
  return { upper: Math.round(upper * 100) / 100, middle: Math.round(sma * 100) / 100, lower: Math.round(lower * 100) / 100, squeeze, percentB: Math.round(percentB * 10) / 10, contribution };
}

export function computeKeltnerChannel(ohlc: OHLC[], emaPeriod: number = 20, atrPeriod: number = 10, atrMult: number = 2): { upper: number; middle: number; lower: number; breakout: 'upper' | 'lower' | null; contribution: number } {
  const closes = ohlc.map(c => c.close);
  if (ohlc.length < Math.max(emaPeriod, atrPeriod) + 1) return { upper: 0, middle: 0, lower: 0, breakout: null, contribution: 0 };
  
  const ema = computeEMA(closes, emaPeriod);
  const middle = ema[ema.length - 1];
  
  const atr = computeATR(ohlc, atrPeriod);
  const upper = middle + atrMult * atr.value;
  const lower = middle - atrMult * atr.value;
  
  const lastClose = closes[closes.length - 1];
  let breakout: 'upper' | 'lower' | null = null;
  let contribution = 0;
  
  if (lastClose > upper) { breakout = 'upper'; contribution = 7; }
  else if (lastClose < lower) { breakout = 'lower'; contribution = -7; }
  
  return { upper: Math.round(upper * 100) / 100, middle: Math.round(middle * 100) / 100, lower: Math.round(lower * 100) / 100, breakout, contribution };
}

export function computeStochastic(ohlc: OHLC[], kPeriod: number = 14, dPeriod: number = 3): { k: number; d: number; signal: 'overbought' | 'oversold' | 'neutral'; contribution: number } {
  if (ohlc.length < kPeriod + dPeriod) return { k: 50, d: 50, signal: 'neutral', contribution: 0 };
  
  const kValues: number[] = [];
  
  for (let i = kPeriod - 1; i < ohlc.length; i++) {
    const window = ohlc.slice(i - kPeriod + 1, i + 1);
    const highestHigh = Math.max(...window.map(c => c.high));
    const lowestLow = Math.min(...window.map(c => c.low));
    const currentClose = ohlc[i].close;
    
    const k = highestHigh === lowestLow ? 50 : ((currentClose - lowestLow) / (highestHigh - lowestLow)) * 100;
    kValues.push(k);
  }
  
  const dValues = computeSMA(kValues, dPeriod);
  const lastK = kValues[kValues.length - 1];
  const lastD = dValues[dValues.length - 1];
  
  let signal: 'overbought' | 'oversold' | 'neutral' = 'neutral';
  let contribution = 0;
  
  if (lastK > 80 && lastD > 80) { signal = 'overbought'; contribution = -((lastK - 80) / 20) * 5; }
  else if (lastK < 20 && lastD < 20) { signal = 'oversold'; contribution = ((20 - lastK) / 20) * 5; }
  else { contribution = ((lastK - 50) / 50) * 2; }
  
  return { k: Math.round(lastK * 10) / 10, d: Math.round(lastD * 10) / 10, signal, contribution };
}

export function computeVWAPSlope(vwapSeries: number[]): { value: number; trend: 'bullish' | 'bearish' | 'neutral'; contribution: number } {
  if (vwapSeries.length < 10) return { value: 0, trend: 'neutral', contribution: 0 };
  
  const recent = vwapSeries.slice(-10);
  const slope = (recent[recent.length - 1] - recent[0]) / Math.max(Math.abs(recent[0]), 1);
  
  let trend: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let contribution = 0;
  
  if (slope > 0.001) { trend = 'bullish'; contribution = Math.min(slope * 10000, 18); }
  else if (slope < -0.001) { trend = 'bearish'; contribution = Math.max(slope * 10000, -18); }
  
  return { value: Math.round(slope * 10000) / 10, trend, contribution };
}

export function computeIVChange(ohlc: OHLC[]): { value: number; signal: 'elevated' | 'low' | 'neutral'; contribution: number } {
  const atr = computeATR(ohlc, 14);
  const historicalVol = atr.percent;
  
  const impliedChange = (historicalVol - 1.5) / 1.5;
  
  let signal: 'elevated' | 'low' | 'neutral' = 'neutral';
  let contribution = 0;
  
  if (impliedChange > 0.3) { signal = 'elevated'; contribution = -impliedChange * CONFIG.WEIGHTS.ivChange; }
  else if (impliedChange < -0.3) { signal = 'low'; contribution = Math.abs(impliedChange) * CONFIG.WEIGHTS.ivChange; }
  
  return { value: Math.round(historicalVol * 100) / 100, signal, contribution: Math.max(-CONFIG.WEIGHTS.ivChange, Math.min(CONFIG.WEIGHTS.ivChange, contribution)) };
}

export function computeOrderflowProxy(ohlc: OHLC[], lookback: number = 10): OrderflowData {
  if (ohlc.length < lookback + 1) return { tickImbalance: 0, volumeDelta: 0, contribution: 0 };
  
  const slice = ohlc.slice(-lookback);
  let tickScore = 0;
  let volumeDelta = 0;
  
  for (let i = 1; i < slice.length; i++) {
    const diff = slice[i].close - slice[i - 1].close;
    tickScore += diff > 0 ? 1 : diff < 0 ? -1 : 0;
    volumeDelta += diff * slice[i].volume;
  }
  
  const normalizedDelta = volumeDelta / Math.max(Math.abs(volumeDelta), 1);
  const contribution = (tickScore / lookback) * CONFIG.WEIGHTS.orderflow;
  
  return { 
    tickImbalance: Math.round(tickScore * 100) / 100, 
    volumeDelta: Math.round(normalizedDelta * 100) / 100, 
    contribution: Math.max(-CONFIG.WEIGHTS.orderflow, Math.min(CONFIG.WEIGHTS.orderflow, contribution)) 
  };
}

export function computeGammaSummary(lastPrice: number, gammaStrikes: number[] | null = null): GammaSummary & { contribution: number } {
  if (!gammaStrikes || gammaStrikes.length === 0) {
    return { maxAbsGammaStrike: null, contribution: 0 };
  }
  
  const maxAbsGammaStrike = Math.max(...gammaStrikes.map(Math.abs));
  const contribution = lastPrice > maxAbsGammaStrike ? CONFIG.WEIGHTS.gamma : -CONFIG.WEIGHTS.gamma / 2;
  
  return { maxAbsGammaStrike, contribution };
}

export function computeMarketBreadth(ohlc: OHLC[]): MarketBreadth {
  if (ohlc.length < 20) return { advanceDecline: 0, newHighsLows: 0, composite: 50, contribution: 0 };
  
  const recent = ohlc.slice(-20);
  let advances = 0;
  let declines = 0;
  
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].close > recent[i - 1].close) advances++;
    else if (recent[i].close < recent[i - 1].close) declines++;
  }
  
  const advanceDecline = (advances - declines) / Math.max(advances + declines, 1);
  
  const highest = Math.max(...recent.map(c => c.high));
  const lowest = Math.min(...recent.map(c => c.low));
  const lastClose = recent[recent.length - 1].close;
  const newHighsLows = (lastClose - lowest) / Math.max(highest - lowest, 1);
  
  const composite = Math.round((advanceDecline + 1) * 25 + newHighsLows * 50);
  const contribution = (advanceDecline * CONFIG.WEIGHTS.breadth);
  
  return { 
    advanceDecline: Math.round(advanceDecline * 100) / 100, 
    newHighsLows: Math.round(newHighsLows * 100) / 100, 
    composite,
    contribution: Math.max(-CONFIG.WEIGHTS.breadth, Math.min(CONFIG.WEIGHTS.breadth, contribution))
  };
}

export function computeMarketHealth(ohlc: OHLC[], vwapSeries: number[], lastPrice?: number): MarketHealthIndicators {
  const rsi = computeRSI(ohlc);
  const macd = computeMACD(ohlc);
  const adx = computeADX(ohlc);
  const obv = computeOBV(ohlc);
  const cmf = computeCMF(ohlc);
  const atr = computeATR(ohlc);
  const bollingerBands = computeBollingerBands(ohlc);
  const keltnerChannel = computeKeltnerChannel(ohlc);
  const stochastic = computeStochastic(ohlc);
  const vwapSlope = computeVWAPSlope(vwapSeries);
  const ivChange = computeIVChange(ohlc);
  const orderflow = computeOrderflowProxy(ohlc);
  const gamma = computeGammaSummary(lastPrice ?? ohlc[ohlc.length - 1]?.close ?? 0);
  const breadth = computeMarketBreadth(ohlc);
  
  const contributors: { name: string; value: number }[] = [
    { name: 'RSI', value: rsi.contribution },
    { name: 'MACD', value: macd.contribution },
    { name: 'ADX', value: adx.contribution },
    { name: 'OBV', value: obv.contribution },
    { name: 'CMF', value: cmf.contribution },
    { name: 'Bollinger', value: bollingerBands.contribution },
    { name: 'Keltner', value: keltnerChannel.contribution },
    { name: 'Stochastic', value: stochastic.contribution },
    { name: 'VWAP Slope', value: vwapSlope.contribution },
    { name: 'IV Change', value: ivChange.contribution },
    { name: 'Orderflow', value: orderflow.contribution },
    { name: 'Gamma', value: gamma.contribution },
    { name: 'Breadth', value: breadth.contribution },
  ].filter(c => Math.abs(c.value) > 0.5)
   .sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
  
  const totalContribution = 
    rsi.contribution + 
    macd.contribution + 
    adx.contribution + 
    obv.contribution + 
    cmf.contribution + 
    bollingerBands.contribution + 
    keltnerChannel.contribution + 
    stochastic.contribution + 
    vwapSlope.contribution + 
    ivChange.contribution +
    orderflow.contribution +
    gamma.contribution +
    breadth.contribution;
  
  const normalizedHealth = Math.max(0, Math.min(100, 50 + totalContribution));
  
  let healthGrade: 'A' | 'B' | 'C' | 'D' | 'F' = 'C';
  if (normalizedHealth >= 80) healthGrade = 'A';
  else if (normalizedHealth >= 65) healthGrade = 'B';
  else if (normalizedHealth >= 50) healthGrade = 'C';
  else if (normalizedHealth >= 35) healthGrade = 'D';
  else healthGrade = 'F';
  
  return {
    rsi,
    macd,
    adx,
    obv,
    cmf,
    atr,
    bollingerBands,
    keltnerChannel,
    stochastic,
    vwapSlope,
    ivChange,
    orderflow,
    gamma,
    breadth,
    overallHealth: Math.round(normalizedHealth),
    healthGrade,
    contributors
  };
}
