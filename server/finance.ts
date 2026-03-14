import { computeMetaEngine, type SessionSplit } from "./metaEngine";
import { computeMarketHealth, type MarketHealthIndicators } from './indicators';
import { getSignalMetrics, type SignalMetrics } from './signalHistory';

type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time?: number;
  timeMs?: number;
}

interface MomentumDivergence {
  vwapSlope: number;
  divergence: string | null;
}

interface VolumeSpike {
  lastVolume: number;
  avgVolume: number;
  isSpike: boolean;
}

interface TrendExhaustion {
  rangeCompression: number;
  volumeFade: number;
  isExhausted: boolean;
}

interface BullishPower {
  rawScore: number;
  meter: number;
}

interface CandleStrength {
  score: number;
  bodyRatio: number;
  wickRatio: number;
}

interface EMACloud {
  trend: 'bullish' | 'bearish' | 'neutral';
  top?: number;
  bottom?: number;
}

interface LiquiditySweep {
  detected: boolean;
  type: 'high_sweep' | 'low_sweep' | null;
  level: number | null;
  reclaimed: boolean | null;
  description: string | null;
  sweepSize?: number | null;
  sweepSizePct?: number | null;
}

interface TacticalContributor {
  name: string;
  value: number;
  strength?: number;
}

interface TacticalIndicators {
  agreementPct: number;
  confirmCount?: number;
  totalChecks?: number;
  rsi: {
    value: number;
    signal: 'overbought' | 'oversold' | 'neutral';
    confirms: boolean;
  };
  macd: {
    histogram: number;
    trend: 'bullish' | 'bearish' | 'neutral';
    confirms: boolean;
  };
  bb: {
    percentB: number;
    squeeze: boolean;
    confirms: boolean;
  };
  atr: {
    value: number;
    percent: number;
  };
  adx: {
    value: number;
    trendStrength: 'weak' | 'moderate' | 'strong';
  };
  momentum?: {
    score: number;
    trend: 'bullish' | 'bearish' | 'neutral';
    confirms: boolean;
  };
}

interface TacticalOtm {
  type: 'call' | 'put';
  strike: number;
  delta: number;
  dte: number;
  probability: number;
  targetPrice?: number;
  stopPrice?: number;
  rationale?: string;
}

interface TacticalHistoryCalibration {
  sampleSize: number;
  decisiveWinRate: number;
  avgR: number;
  edge: 'positive' | 'neutral' | 'negative';
  confidenceAdjustment: number;
}

interface TacticalTradePlan {
  entry: number;
  entryZoneLow: number;
  entryZoneHigh: number;
  stop: number;
  targets: number[];
  rrLadder: number[];
  riskRewardLabel: string;
  confidencePct: number;
  confidenceLabel: 'low' | 'medium' | 'high';
  confidenceReasons: string[];
  positionSizing: string;
  timeline: string;
}

interface TacticalAdvice {
  strategy: string;
  bias: 'bullish' | 'bearish' | 'neutral';
  confidence: 'low' | 'medium' | 'high';
  volRegime: 'normal' | 'elevated';
  notes: string[];
  directionScore: number;
  contributors?: TacticalContributor[];
  indicators?: TacticalIndicators;
  entryWindow?: string;
  actionPlan?: string[];
  keyLevel?: number;
  atrValue?: number;
  otm?: TacticalOtm;
  historyCalibration?: TacticalHistoryCalibration;
  tradePlan?: TacticalTradePlan;
}

const CONFIG = {
  WEIGHTS: {
    bullishPower: 20,
    candleStrength: 8,
    momentumDivergence: 10,
    volumeSpike: 6,
    failedVwap: 12,
    exhaustion: 10,
    emaCloud: 15,
    gamma: 4,
    liquiditySweepBase: 12
  },
  SWEEP_BUFFER_PCT: 0.001
};

const clampNum = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export function assignGrade(overall: number, trendConfidence: number, volumeConfidence: number, patternConfidence: number, marketConfidence: number, signals: any) {
  const roundedOverall = Math.round(overall);
  let grade: Grade = 'C';

  if (roundedOverall >= 80) grade = 'A';
  else if (roundedOverall >= 65) grade = 'B';
  else if (roundedOverall >= 50) grade = 'C';
  else if (roundedOverall >= 35) grade = 'D';
  else grade = 'F';

  return {
    overall: roundedOverall,
    trendConfidence: Math.round(trendConfidence),
    volumeConfidence: Math.round(volumeConfidence),
    patternConfidence: Math.round(patternConfidence),
    marketConfidence: Math.round(marketConfidence),
    grade,
    signals
  };
}

export function computeVWAPSeries(ohlc: OHLC[]): number[] {
  if (ohlc.length === 0) return [];
  const vwapSeries: number[] = [];
  let cumVol = 0;
  let cumTpVol = 0;
  for (const candle of ohlc) {
    const typicalPrice = (candle.high + candle.low + candle.close) / 3.0;
    cumVol += candle.volume;
    cumTpVol += typicalPrice * candle.volume;
    vwapSeries.push(cumVol === 0 ? 0 : cumTpVol / cumVol);
  }
  return vwapSeries;
}

export function detectMomentumDivergence(lastPrice: number, vwapSeries: number[]): MomentumDivergence | null {
  if (vwapSeries.length < 5) return null;
  const vwapLast = vwapSeries[vwapSeries.length - 1];
  const vwapPrev = vwapSeries[vwapSeries.length - 5];
  const vwapSlope = (vwapLast - vwapPrev) / Math.max(Math.abs(vwapPrev), 1e-6);
  
  // Calculate distance from VWAP as percentage
  const vwapDistance = (lastPrice - vwapLast) / vwapLast;
  const isExtended = Math.abs(vwapDistance) > 0.003; // Extended > 0.3% from VWAP
  
  let divergence: string | null = null;
  
  // Bearish divergence: price above VWAP but VWAP falling or flat
  if (lastPrice > vwapLast && vwapSlope <= 0) {
    divergence = isExtended 
      ? "bearish_divergence_extended" // Price extended above falling VWAP - high risk
      : "price_above_vwap_but_vwap_flat_or_down";
  }
  // Bullish divergence: price below VWAP but VWAP rising or flat  
  else if (lastPrice < vwapLast && vwapSlope >= 0) {
    divergence = isExtended
      ? "bullish_divergence_extended" // Price extended below rising VWAP - potential bounce
      : "price_below_vwap_but_vwap_flat_or_up";
  }
  // Price tracking VWAP closely but extended
  else if (isExtended && vwapSlope > 0.001) {
    divergence = "extended_above_rising_vwap"; // Momentum intact but extended
  }
  else if (isExtended && vwapSlope < -0.001) {
    divergence = "extended_below_falling_vwap"; // Downtrend extended
  }
  
  return { vwapSlope, divergence };
}

// Enhanced divergence analysis with protection recommendations
export interface DivergenceWarning {
  type: 'bullish_divergence' | 'bearish_divergence' | 'volume_divergence' | 'exhaustion_warning' | 'none';
  severity: 'low' | 'medium' | 'high';
  description: string;
  protection: string;
  reduceSize: boolean;
  tightenStops: boolean;
}

export function analyzeDivergenceRisk(
  ohlc: OHLC[],
  vwapSeries: number[],
  momentumDiv: MomentumDivergence | null,
  volumeSpike: VolumeSpike | null,
  exhaustion: TrendExhaustion | null
): DivergenceWarning {
  const warnings: DivergenceWarning[] = [];
  
  // Check momentum divergence
  if (momentumDiv?.divergence) {
    if (momentumDiv.divergence.includes('bearish_divergence')) {
      warnings.push({
        type: 'bearish_divergence',
        severity: momentumDiv.divergence.includes('extended') ? 'high' : 'medium',
        description: 'Price extended above VWAP while VWAP declining - bearish divergence',
        protection: 'Consider taking profits or tightening stops on longs',
        reduceSize: true,
        tightenStops: true
      });
    } else if (momentumDiv.divergence.includes('bullish_divergence')) {
      warnings.push({
        type: 'bullish_divergence', 
        severity: momentumDiv.divergence.includes('extended') ? 'high' : 'medium',
        description: 'Price below rising VWAP - potential bullish divergence/bounce setup',
        protection: 'Watch for VWAP reclaim before new longs',
        reduceSize: false,
        tightenStops: true
      });
    }
  }
  
  // Check volume divergence (price moving but volume declining)
  if (ohlc.length >= 10) {
    const recent5 = ohlc.slice(-5);
    const prev5 = ohlc.slice(-10, -5);
    const recentAvgVol = recent5.filter(c => c.volume > 0).reduce((s, c) => s + c.volume, 0) / 5;
    const prevAvgVol = prev5.filter(c => c.volume > 0).reduce((s, c) => s + c.volume, 0) / 5;
    const priceChange = recent5[recent5.length - 1].close - prev5[0].close;
    
    // Price rising but volume declining = bearish volume divergence
    if (priceChange > 0 && recentAvgVol < prevAvgVol * 0.7 && prevAvgVol > 0) {
      warnings.push({
        type: 'volume_divergence',
        severity: recentAvgVol < prevAvgVol * 0.5 ? 'high' : 'medium',
        description: 'Price rising on declining volume - weak buying pressure',
        protection: 'Reduce position size, set tighter stops',
        reduceSize: true,
        tightenStops: true
      });
    }
    // Price falling but volume declining = potential reversal
    else if (priceChange < 0 && recentAvgVol < prevAvgVol * 0.7 && prevAvgVol > 0) {
      warnings.push({
        type: 'volume_divergence',
        severity: 'low',
        description: 'Price falling on declining volume - selling pressure weakening',
        protection: 'Watch for reversal signals',
        reduceSize: false,
        tightenStops: false
      });
    }
  }
  
  // Check exhaustion
  if (exhaustion?.isExhausted) {
    warnings.push({
      type: 'exhaustion_warning',
      severity: 'high',
      description: 'Trend exhaustion detected - range compression with volume fade',
      protection: 'Avoid new positions, wait for breakout confirmation',
      reduceSize: true,
      tightenStops: true
    });
  }
  
  // Return highest severity warning
  if (warnings.length === 0) {
    return {
      type: 'none',
      severity: 'low',
      description: 'No significant divergence detected',
      protection: 'Normal trading conditions',
      reduceSize: false,
      tightenStops: false
    };
  }
  
  // Sort by severity and return most critical
  const severityOrder = { high: 3, medium: 2, low: 1 };
  warnings.sort((a, b) => severityOrder[b.severity] - severityOrder[a.severity]);
  return warnings[0];
}

export function detectVolumeSpike(ohlc: OHLC[], lookback: number = 30, spikeFactor: number = 2.0): VolumeSpike | null {
  if (ohlc.length < lookback + 1) return null;
  
  // Filter candles with actual volume data for averaging
  const candlesWithVolume = ohlc.filter(c => c.volume > 0);
  if (candlesWithVolume.length === 0) {
    // No volume data available - return neutral state
    return { lastVolume: 0, avgVolume: 0, isSpike: false };
  }
  
  // Use only candles with volume for averaging (last 30 with volume)
  const recentWithVolume = candlesWithVolume.slice(-lookback);
  const avgVol = recentWithVolume.reduce((sum, c) => sum + c.volume, 0) / recentWithVolume.length;
  
  // Use the most recent candle with actual volume
  const lastVol = candlesWithVolume[candlesWithVolume.length - 1].volume;
  
  const isSpike = lastVol > spikeFactor * avgVol;
  return { lastVolume: lastVol, avgVolume: avgVol, isSpike };
}

export function detectFailedVWAPReclaim(ohlc: OHLC[], vwapSeries: number[]): { type: string; description: string } | null {
  if (ohlc.length < 3 || vwapSeries.length < 3) return null;
  const last = ohlc[ohlc.length - 1];
  const prev = ohlc[ohlc.length - 2];
  const vwapLast = vwapSeries[vwapSeries.length - 1];
  const wasBelow = prev.close < vwapLast;
  const wickedAbove = last.high > vwapLast;
  const closedBelow = last.close < vwapLast;
  if (wasBelow && wickedAbove && closedBelow) {
    return { type: "failed_vwap_reclaim", description: "Liquidity sweep above VWAP then close back below" };
  }
  return null;
}

export function detectTrendExhaustion(ohlc: OHLC[], lookback: number = 10): TrendExhaustion | null {
  if (ohlc.length < lookback + 2) return null;
  
  // Filter candles with actual volume for volume-based exhaustion detection
  const candlesWithVolume = ohlc.filter(c => c.volume > 0);
  
  // For range compression, use all candles (price data is always valid)
  const allWindow = ohlc.slice(-lookback);
  const ranges = allWindow.map(c => c.high - c.low);
  const rangeFirst = ranges[0] || 1e-6;
  const rangeLast = ranges[ranges.length - 1] || rangeFirst;
  const rangeTrend = rangeLast / Math.max(rangeFirst, 1e-6);
  
  // For volume fade, use only candles with volume data
  let volTrend = 1.0; // Default to no fade if insufficient volume data
  if (candlesWithVolume.length >= lookback) {
    const volWindow = candlesWithVolume.slice(-lookback);
    const vols = volWindow.map(c => c.volume);
    const volFirst = vols[0] || 1e-6;
    const volLast = vols[vols.length - 1] || volFirst;
    volTrend = volLast / Math.max(volFirst, 1e-6);
  } else if (candlesWithVolume.length >= 2) {
    // Minimal volume data - compare first and last available
    const volFirst = candlesWithVolume[0].volume || 1e-6;
    const volLast = candlesWithVolume[candlesWithVolume.length - 1].volume || volFirst;
    volTrend = volLast / Math.max(volFirst, 1e-6);
  }
  
  const exhaustion = rangeTrend < 0.6 && volTrend < 0.6;
  return { rangeCompression: rangeTrend, volumeFade: volTrend, isExhausted: exhaustion };
}

export function computeBullishPower(
  lastPrice: number,
  vwapSeries: number[],
  momDiv: MomentumDivergence | null,
  volSpike: VolumeSpike | null,
  gammaSummary: { maxAbsGammaStrike: number | null }
): BullishPower {
  let score = 0;
  if (vwapSeries.length > 5) {
    const vwapLast = vwapSeries[vwapSeries.length - 1];
    const vwapPrev = vwapSeries[vwapSeries.length - 5];
    const slope = (vwapLast - vwapPrev) / Math.max(Math.abs(vwapPrev), 1e-6);
    if (slope > 0.0005) score += 2;
    else if (slope < -0.0005) score -= 2;
  }
  if (momDiv && momDiv.divergence) score -= 2;
  else score += 2;
  if (volSpike && vwapSeries.length > 0 && volSpike.isSpike) {
    const vwapLast = vwapSeries[vwapSeries.length - 1];
    if (lastPrice < vwapLast) score -= 2;
    else score += 2;
  }
  const maxGamma = gammaSummary.maxAbsGammaStrike;
  if (maxGamma) {
    if (lastPrice > maxGamma) score += 2;
    else if (lastPrice < maxGamma) score -= 1;
  }
  const normalized = Math.max(0, Math.min(100, Math.round((score + 9) / 18 * 100)));
  return { rawScore: score, meter: normalized };
}

export function computeCandleStrength(ohlc: OHLC[]): CandleStrength {
  if (ohlc.length < 10) return { score: 50, bodyRatio: 0.5, wickRatio: 0.5 };
  const recent = ohlc.slice(-10);
  const avgVolume = recent.reduce((sum, c) => sum + c.volume, 0) / recent.length;
  let last = ohlc[ohlc.length - 1];
  for (let i = ohlc.length - 1; i >= Math.max(0, ohlc.length - 10); i--) {
    const candle = ohlc[i];
    if (candle.high !== candle.low && candle.high - candle.low > 0.001) {
      last = candle;
      break;
    }
  }
  const { open: o, high: h, low: l, close: c, volume: v } = last;
  const body = Math.abs(c - o);
  const totalRange = Math.max(h - l, 0.01);
  const bodyScore = (body / totalRange) * 40;
  const upperWick = h - Math.max(o, c);
  const lowerWick = Math.min(o, c) - l;
  const wickScore = c > o ? (lowerWick / totalRange) * 20 : (upperWick / totalRange) * 20;
  const closePos = (c - l) / totalRange;
  const closeScore = closePos * 20;
  const volScore = Math.min(v / Math.max(avgVolume, 1e-6), 2.0) * 10;
  const score = Math.max(0, Math.min(100, Math.round(bodyScore + wickScore + closeScore + volScore)));
  return { score, bodyRatio: body / totalRange, wickRatio: (upperWick + lowerWick) / totalRange };
}

export function detectLiquiditySweep(ohlc: OHLC[], lookback: number = 20, bufferPct: number = CONFIG.SWEEP_BUFFER_PCT): LiquiditySweep {
  if (!Array.isArray(ohlc) || ohlc.length < lookback + 1) {
    return { detected: false, type: null, level: null, reclaimed: false, description: null, sweepSize: null, sweepSizePct: null };
  }

  const window = ohlc.slice(-lookback - 1, -1);
  const current = ohlc[ohlc.length - 1];

  let maxHigh = -Infinity;
  let minLow = Infinity;
  for (const c of window) {
    if (c.high > maxHigh) maxHigh = c.high;
    if (c.low < minLow) minLow = c.low;
  }
  if (!isFinite(maxHigh) || !isFinite(minLow)) {
    return { detected: false, type: null, level: null, reclaimed: false, description: null, sweepSize: null, sweepSizePct: null };
  }

  const highThreshold = maxHigh * (1 + bufferPct);
  const lowThreshold = minLow * (1 - bufferPct);

  if (current.high > highThreshold && current.close < maxHigh) {
    const sweepSize = current.high - maxHigh;
    const sweepSizePct = sweepSize / Math.max(maxHigh, 1e-6);
    return {
      detected: true,
      type: 'high_sweep',
      level: maxHigh,
      reclaimed: null,
      description: `Swept above ${maxHigh.toFixed(2)} by ${sweepSize.toFixed(2)} then closed below`,
      sweepSize,
      sweepSizePct
    };
  }

  if (current.low < lowThreshold && current.close > minLow) {
    const sweepSize = minLow - current.low;
    const sweepSizePct = sweepSize / Math.max(minLow, 1e-6);
    return {
      detected: true,
      type: 'low_sweep',
      level: minLow,
      reclaimed: null,
      description: `Swept below ${minLow.toFixed(2)} by ${sweepSize.toFixed(2)} then reclaimed`,
      sweepSize,
      sweepSizePct
    };
  }

  return { detected: false, type: null, level: null, reclaimed: false, description: null, sweepSize: null, sweepSizePct: null };
}

export function computeEMACloud(ohlc: OHLC[]): EMACloud | null {
  if (ohlc.length < 21) return null;
  
  const ema9 = computeEMA(ohlc.map(c => c.close), 9);
  const ema21 = computeEMA(ohlc.map(c => c.close), 21);
  
  const last9 = ema9[ema9.length - 1];
  const last21 = ema21[ema21.length - 1];
  
  if (!last9 || !last21) return null;
  
  const trend = last9 > last21 * 1.001 ? 'bullish' : last9 < last21 * 0.999 ? 'bearish' : 'neutral';
  return {
    trend,
    top: Math.max(last9, last21),
    bottom: Math.min(last9, last21)
  };
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

export function computeTactical(
  bullishPower: BullishPower,
  candleStrength: CandleStrength,
  momDiv: MomentumDivergence | null,
  volSpike: VolumeSpike | null,
  failedVwap: { type: string; description: string } | null,
  exhaustion: TrendExhaustion | null,
  gammaSummary: { maxAbsGammaStrike: number | null },
  emaCloud: EMACloud | null,
  marketConfidence: number,
  lastPrice?: number,
  vwapLast?: number,
  liquiditySweep?: LiquiditySweep,
  divergenceWarning?: DivergenceWarning,
  marketHealth?: MarketHealthIndicators,
  historicalMetrics?: SignalMetrics
): TacticalAdvice {
  const notes: string[] = [];
  let strategy = "NEUTRAL";
  let bias: 'bullish' | 'bearish' | 'neutral' = "neutral";
  let confidence: 'low' | 'medium' | 'high' = "low";
  let volRegime: 'normal' | 'elevated' = "normal";

  let directionScore = 0;
  const W = CONFIG.WEIGHTS;

  const powerNorm = (bullishPower.meter - 50) / 50;
  const powerContrib = powerNorm * W.bullishPower;
  directionScore += powerContrib;
  if (Math.abs(powerContrib) > 6) notes.push(`${powerContrib > 0 ? 'Bullish' : 'Bearish'} tilt from BullishPower (${Math.round(powerContrib)})`);

  const candleNorm = (candleStrength.score - 50) / 50;
  const candleContrib = candleNorm * W.candleStrength;
  directionScore += candleContrib;
  if (Math.abs(candleContrib) > 3) notes.push(`${candleContrib > 0 ? 'Strong' : 'Weak'} candle (${Math.round(candleStrength.score)})`);

  if (momDiv && momDiv.divergence) {
    directionScore -= W.momentumDivergence;
    notes.push('Momentum divergence detected, reduces confidence');
  } else {
    directionScore += W.momentumDivergence * 0.4;
  }

  if (volSpike && volSpike.isSpike) {
    volRegime = 'elevated';
    if (typeof lastPrice === 'number' && typeof vwapLast === 'number') {
      const spikeSign = lastPrice >= vwapLast ? 1 : -1;
      directionScore += spikeSign * W.volumeSpike;
      notes.push(`Volume spike ${spikeSign > 0 ? 'above' : 'below'} VWAP`);
    } else {
      const volSign = bullishPower.rawScore >= 0 ? 1 : -1;
      directionScore += volSign * W.volumeSpike;
      notes.push('Volume spike detected (no VWAP context)');
    }
  }

  if (liquiditySweep && liquiditySweep.detected) {
    const base = W.liquiditySweepBase;
    const sizeFactor = (liquiditySweep.sweepSizePct ?? 0) * 10;
    const sweepWeight = base + sizeFactor;
    if (liquiditySweep.type === 'low_sweep') {
      if (liquiditySweep.reclaimed === true) {
        directionScore += sweepWeight;
        notes.push('Low liquidity sweep reclaimed — bullish signal');
      } else if (liquiditySweep.reclaimed === false) {
        directionScore += sweepWeight * 0.4;
        notes.push('Low liquidity sweep detected (awaiting reclaim)');
      } else {
        directionScore += sweepWeight * 0.6;
        notes.push('Low liquidity sweep detected');
      }
    } else if (liquiditySweep.type === 'high_sweep') {
      if (liquiditySweep.reclaimed === true) {
        directionScore -= sweepWeight * 0.6;
        notes.push('High sweep reclaimed (mixed signal)');
      } else if (liquiditySweep.reclaimed === false) {
        directionScore -= sweepWeight;
        notes.push('High liquidity sweep — bearish rejection');
      } else {
        directionScore -= sweepWeight * 0.8;
        notes.push('High liquidity sweep detected');
      }
    }
  }

  if (failedVwap) {
    directionScore -= W.failedVwap;
    notes.push('Failed VWAP reclaim — bearish');
  }

  if (exhaustion && exhaustion.isExhausted) {
    directionScore -= W.exhaustion;
    notes.push('Trend exhaustion: range compression and volume fade');
  } else if (exhaustion) {
    directionScore += W.exhaustion * 0.25;
  }

  // Add divergence warning to notes if detected
  if (divergenceWarning && divergenceWarning.type !== 'none') {
    if (divergenceWarning.severity === 'high') {
      directionScore *= 0.6; // Reduce conviction significantly
      notes.unshift(`PROTECTION: ${divergenceWarning.protection}`);
    } else if (divergenceWarning.severity === 'medium') {
      directionScore *= 0.8; // Reduce conviction moderately
      notes.push(`Caution: ${divergenceWarning.description}`);
    }
  }

  if (emaCloud) {
    if (emaCloud.trend === 'bullish') {
      directionScore += W.emaCloud;
      notes.push('EMA cloud supports bullish trend');
    } else if (emaCloud.trend === 'bearish') {
      directionScore -= W.emaCloud;
      notes.push('EMA cloud supports bearish trend');
    }
  }

  if (gammaSummary && gammaSummary.maxAbsGammaStrike != null && typeof lastPrice === 'number') {
    if (lastPrice > gammaSummary.maxAbsGammaStrike) {
      directionScore += W.gamma;
      notes.push('Price above max gamma strike — bullish skew');
    } else {
      directionScore -= W.gamma * 0.75;
      notes.push('Price below max gamma strike — bearish skew');
    }
  }

  let scale = 1.0;
  if (marketConfidence >= 70) scale = 1.2;
  else if (marketConfidence <= 40) scale = 0.8;
  directionScore *= scale;

  if (directionScore >= 18) {
    bias = 'bullish';
    strategy = 'AGGRESSIVE_LONG';
  } else if (directionScore >= 6) {
    bias = 'bullish';
    strategy = 'CALL_DEBIT_SPREAD';
  } else if (directionScore > -6 && directionScore < 6) {
    bias = 'neutral';
    strategy = 'NEUTRAL';
  } else if (directionScore <= -6 && directionScore > -18) {
    bias = 'bearish';
    strategy = 'PUT_DEBIT_SPREAD';
  } else {
    bias = 'bearish';
    strategy = 'AGGRESSIVE_SHORT';
  }

  const absScore = Math.abs(directionScore);
  let confRaw = Math.min(1, (absScore / 30) * 0.5 + (marketConfidence / 100) * 0.3 + (candleStrength.score / 100) * 0.2);

  const historySampleSize = historicalMetrics?.sample?.completedSignals ?? 0;
  let historyCalibration: TacticalHistoryCalibration | undefined;
  if (historySampleSize >= 12) {
    const decisiveWinRate = Number(historicalMetrics?.rates?.decisiveWinRate ?? 0);
    const avgR = Number(historicalMetrics?.expectancy?.avgR ?? 0);
    const reliability = clampNum(historySampleSize / 80, 0, 1);
    const winEdge = (decisiveWinRate - 50) / 50;
    const rEdge = clampNum(avgR / 2, -1, 1);
    const adjustment = clampNum((winEdge * 0.12 + rEdge * 0.08) * reliability, -0.14, 0.14);
    confRaw = clampNum(confRaw + adjustment, 0.05, 0.95);

    let edge: 'positive' | 'neutral' | 'negative' = 'neutral';
    if (decisiveWinRate >= 54 && avgR >= 0) edge = 'positive';
    else if (decisiveWinRate <= 47 || avgR < 0) edge = 'negative';

    historyCalibration = {
      sampleSize: historySampleSize,
      decisiveWinRate: Number(decisiveWinRate.toFixed(1)),
      avgR: Number(avgR.toFixed(2)),
      edge,
      confidenceAdjustment: Math.round(adjustment * 100),
    };

    if (Math.abs(adjustment) >= 0.02) {
      notes.push(
        adjustment > 0
          ? `History calibration boosted confidence (${decisiveWinRate.toFixed(1)}% decisive wins, ${historySampleSize} samples)`
          : `History calibration reduced confidence (${decisiveWinRate.toFixed(1)}% decisive wins, ${historySampleSize} samples)`
      );
    }
  }

  if (confRaw >= 0.7) confidence = 'high';
  else if (confRaw >= 0.4) confidence = 'medium';
  else confidence = 'low';

  if (volRegime === 'normal' && candleStrength.score > 70) volRegime = 'elevated';

  const prioritized = [
    ...notes.filter(n => /Failed VWAP|exhaustion|Volume spike|EMA cloud|Momentum divergence|liquidity sweep|sweep/i.test(n)),
    ...notes.filter(n => !/Failed VWAP|exhaustion|Volume spike|EMA cloud|Momentum divergence|liquidity sweep|sweep/i.test(n))
  ];
  const finalNotes = Array.from(new Set(prioritized)).slice(0, 3);

  const roundedScore = Math.round(directionScore);
  const directionMeter = clampNum(Math.round(((roundedScore + 30) / 60) * 100), 0, 100);

  const trendMeter = emaCloud
    ? emaCloud.trend === 'bullish'
      ? 78
      : emaCloud.trend === 'bearish'
        ? 22
        : 50
    : 50;

  const fallbackMomentum = clampNum(Math.round(50 + roundedScore * 1.4), 0, 100);
  const fallbackRsi = clampNum(Math.round(50 + roundedScore * 0.9), 0, 100);
  const fallbackMacd = clampNum(Math.round(50 + (roundedScore / 12) * 16), 0, 100);
  const fallbackBollinger = clampNum(Math.round(50 + roundedScore * 0.8), 0, 100);
  const fallbackAdx = clampNum(Math.round(28 + Math.abs(roundedScore) * 1.8), 0, 100);

  let contributors: TacticalContributor[] = [
    { name: 'Momentum', value: fallbackMomentum, strength: fallbackMomentum },
    { name: 'RSI', value: fallbackRsi, strength: fallbackRsi },
    { name: 'MACD', value: fallbackMacd, strength: fallbackMacd },
    { name: 'Bollinger', value: fallbackBollinger, strength: fallbackBollinger },
    { name: 'ADX', value: fallbackAdx, strength: fallbackAdx },
    { name: 'Direction', value: directionMeter, strength: directionMeter },
  ];

  let indicators: TacticalIndicators | undefined;
  if (marketHealth) {
    const rsiValue = marketHealth.rsi.value;
    const macdTrend = marketHealth.macd.trend;
    const bbPercentB = marketHealth.bollingerBands.percentB;
    const momentumScore = clampNum(
      Math.round(
        50 +
        marketHealth.macd.histogram * 18 +
        marketHealth.vwapSlope.contribution * 4 +
        marketHealth.obv.contribution * 3,
      ),
      0,
      100,
    );
    const momentumTrend: 'bullish' | 'bearish' | 'neutral' = momentumScore >= 60
      ? 'bullish'
      : momentumScore <= 40
        ? 'bearish'
        : 'neutral';
    const momentumConfirms = bias === 'bullish'
      ? momentumScore >= 50
      : bias === 'bearish'
        ? momentumScore <= 50
        : Math.abs(momentumScore - 50) <= 8;

    const rsiConfirms = bias === 'bullish'
      ? rsiValue >= 50
      : bias === 'bearish'
        ? rsiValue <= 50
        : rsiValue >= 45 && rsiValue <= 55;
    const macdConfirms = bias === 'bullish'
      ? macdTrend === 'bullish'
      : bias === 'bearish'
        ? macdTrend === 'bearish'
        : macdTrend === 'neutral';
    const bbConfirms = bias === 'bullish'
      ? bbPercentB >= 50
      : bias === 'bearish'
        ? bbPercentB <= 50
        : bbPercentB >= 40 && bbPercentB <= 60;

    const checks = [rsiConfirms, macdConfirms, bbConfirms, momentumConfirms];
    const confirmCount = checks.filter(Boolean).length;
    const totalChecks = checks.length;
    const agreementPct = Math.round((confirmCount / totalChecks) * 100);

    contributors = [
      { name: 'Momentum', value: momentumScore, strength: momentumScore },
      { name: 'RSI', value: Math.round(rsiValue), strength: clampNum(Math.round(rsiValue), 0, 100) },
      { name: 'MACD', value: clampNum(Math.round(50 + marketHealth.macd.histogram * 16), 0, 100), strength: clampNum(Math.round(50 + marketHealth.macd.histogram * 16), 0, 100) },
      { name: 'Bollinger', value: Math.round(bbPercentB), strength: clampNum(Math.round(bbPercentB), 0, 100) },
      { name: 'ADX', value: Math.round(marketHealth.adx.value), strength: clampNum(Math.round(marketHealth.adx.value), 0, 100) },
      { name: 'Direction', value: directionMeter, strength: directionMeter },
    ];

    indicators = {
      agreementPct,
      confirmCount,
      totalChecks,
      rsi: {
        value: rsiValue,
        signal: marketHealth.rsi.signal,
        confirms: rsiConfirms,
      },
      macd: {
        histogram: marketHealth.macd.histogram,
        trend: marketHealth.macd.trend,
        confirms: macdConfirms,
      },
      bb: {
        percentB: bbPercentB,
        squeeze: marketHealth.bollingerBands.squeeze,
        confirms: bbConfirms,
      },
      atr: {
        value: marketHealth.atr.value,
        percent: marketHealth.atr.percent,
      },
      adx: {
        value: marketHealth.adx.value,
        trendStrength: marketHealth.adx.trendStrength,
      },
      momentum: {
        score: momentumScore,
        trend: momentumTrend,
        confirms: momentumConfirms,
      },
    };
  }

  const entryWindow = confidence === 'high'
    ? 'Enter on first confirmation candle after pullback'
    : confidence === 'medium'
      ? 'Wait for confirmation and volume follow-through'
      : 'Stay patient; wait for cleaner directional confirmation';

  const actionPlan = bias === 'bullish'
    ? [
        'Wait for price to hold above VWAP or reclaim intraday resistance.',
        'Enter with defined risk using a call debit spread or reduced call size.',
        'Take partial profit near +1 ATR and trail the remainder under VWAP.'
      ]
    : bias === 'bearish'
      ? [
          'Wait for rejection at VWAP or failure to reclaim prior support.',
          'Enter with defined risk using a put debit spread or reduced put size.',
          'Take partial profit near -1 ATR and trail stops above lower highs.'
        ]
      : [
          'Stand aside while direction is mixed and avoid forcing entries.',
          'Only engage after a breakout with clear volume confirmation.',
          'Keep size small and preserve capital for cleaner setups.'
        ];

  const keyLevel = typeof lastPrice === 'number' ? Number(lastPrice.toFixed(2)) : undefined;
  const atrValue = indicators ? Number(indicators.atr.value.toFixed(2)) : undefined;

  let otm: TacticalOtm | undefined;
  if (typeof lastPrice === 'number' && atrValue && bias !== 'neutral') {
    const strikeBase = bias === 'bullish' ? lastPrice + atrValue * 0.6 : lastPrice - atrValue * 0.6;
    const strike = Number(strikeBase.toFixed(2));
    const baseItmProb = confidence === 'high' ? 62 : confidence === 'medium' ? 56 : 50;
    let itmProb = baseItmProb;
    if (historyCalibration) {
      const calibrated = clampNum(Math.round(historyCalibration.decisiveWinRate), 42, 72);
      itmProb = clampNum(Math.round(baseItmProb * 0.45 + calibrated * 0.55), 40, 74);
    }
    const targetPrice = Number((bias === 'bullish' ? lastPrice + atrValue * 1.2 : lastPrice - atrValue * 1.2).toFixed(2));
    const stopPrice = Number((bias === 'bullish' ? lastPrice - atrValue * 0.8 : lastPrice + atrValue * 0.8).toFixed(2));
    otm = {
      type: bias === 'bullish' ? 'call' : 'put',
      strike,
      delta: confidence === 'high' ? 0.38 : confidence === 'medium' ? 0.32 : 0.26,
      dte: 0,
      probability: 100 - itmProb,
      targetPrice,
      stopPrice,
      rationale: bias === 'bullish'
        ? 'Momentum + confirmation stack supports an intraday upside continuation setup.'
        : 'Momentum + confirmation stack supports an intraday downside continuation setup.',
    };
  }

  let tradePlan: TacticalTradePlan | undefined;
  if (typeof lastPrice === 'number' && lastPrice > 0 && bias !== 'neutral') {
    const atrBase = atrValue ?? Math.max(lastPrice * 0.003, 0.6);
    const stopDistance = Math.max(
      atrBase * (volRegime === 'elevated' ? 0.95 : 0.8),
      lastPrice * 0.0018,
    );
    const entry = Number(lastPrice.toFixed(2));
    const stop = Number((bias === 'bullish' ? entry - stopDistance : entry + stopDistance).toFixed(2));
    const target1 = Number((bias === 'bullish' ? entry + stopDistance * 1.2 : entry - stopDistance * 1.2).toFixed(2));
    const target2 = Number((bias === 'bullish' ? entry + stopDistance * 1.9 : entry - stopDistance * 1.9).toFixed(2));
    const target3 = Number((bias === 'bullish' ? entry + stopDistance * 2.7 : entry - stopDistance * 2.7).toFixed(2));
    const riskPerPoint = Math.max(Math.abs(entry - stop), 0.01);
    const rrLadder = [target1, target2, target3].map((target) =>
      Number((Math.abs(target - entry) / riskPerPoint).toFixed(2)),
    );
    const confidencePct = clampNum(Math.round(confRaw * 100), 35, 95);
    const confidenceReasons: string[] = [
      `Directional score ${roundedScore >= 0 ? '+' : ''}${roundedScore} with ${indicators?.agreementPct ?? 50}% indicator agreement`,
      `${volRegime === 'elevated' ? 'Elevated' : 'Normal'} volatility regime with ATR ${atrBase.toFixed(2)}`,
      historyCalibration
        ? `Recent decisive win rate ${historyCalibration.decisiveWinRate.toFixed(1)}% on ${historyCalibration.sampleSize} resolved signals`
        : 'Limited recent history, confidence based on live setup quality only',
    ];
    if (divergenceWarning && divergenceWarning.type !== 'none') {
      confidenceReasons.push(`Protection flag: ${divergenceWarning.description}`);
    }

    const positionSizing = confidence === 'high'
      ? 'Beginner sizing: risk up to 1.0% account value, split fills into 2 entries, move stop to breakeven after target 1.'
      : confidence === 'medium'
        ? 'Beginner sizing: risk 0.5%-0.75% account value, take partial at target 1, avoid adding if spread widens.'
        : 'Beginner sizing: risk 0.25%-0.5% account value or paper trade; wait for a second confirmation candle before entry.';

    const timeline = confidence === 'high'
      ? 'Primary move expectation: next 15-90 minutes.'
      : confidence === 'medium'
        ? 'Primary move expectation: next 30-120 minutes.'
        : 'Primary move expectation: wait for confirmation; avoid forcing same-candle entries.';

    tradePlan = {
      entry,
      entryZoneLow: Number((entry - Math.max(0.2, stopDistance * 0.35)).toFixed(2)),
      entryZoneHigh: Number((entry + Math.max(0.2, stopDistance * 0.35)).toFixed(2)),
      stop,
      targets: [target1, target2, target3],
      rrLadder,
      riskRewardLabel: `T1 ${rrLadder[0]}R • T2 ${rrLadder[1]}R • T3 ${rrLadder[2]}R`,
      confidencePct,
      confidenceLabel: confidence,
      confidenceReasons: confidenceReasons.slice(0, 4),
      positionSizing,
      timeline,
    };
  }

  return {
    strategy,
    bias,
    confidence,
    volRegime,
    notes: finalNotes,
    directionScore: roundedScore,
    contributors,
    indicators,
    entryWindow,
    actionPlan,
    keyLevel,
    atrValue,
    otm,
    historyCalibration,
    tradePlan,
  };
}

export function analyzeSymbol(
  symbol: string,
  ohlc: OHLC[],
  gammaSummary: { maxAbsGammaStrike: number | null } = { maxAbsGammaStrike: null },
  sessionSplit?: SessionSplit,
  currentPrice?: number
) {
  const lastPrice =
    Number.isFinite(currentPrice as number) && (currentPrice as number) > 0
      ? Number(currentPrice)
      : (ohlc.length > 0 ? ohlc[ohlc.length - 1].close : 0);
  
  const vwapSeries = computeVWAPSeries(ohlc);
  const momDiv = detectMomentumDivergence(lastPrice, vwapSeries);
  const volSpike = detectVolumeSpike(ohlc);
  const failedVwap = detectFailedVWAPReclaim(ohlc, vwapSeries);
  const exhaustion = detectTrendExhaustion(ohlc);
  const bullishPower = computeBullishPower(lastPrice, vwapSeries, momDiv, volSpike, gammaSummary);
  const candleStrength = computeCandleStrength(ohlc);
  const liquiditySweep = detectLiquiditySweep(ohlc);
  const emaCloud = computeEMACloud(ohlc);
  const marketHealth = computeMarketHealth(ohlc, vwapSeries, lastPrice);

  const marketConfidence = marketHealth.overallHealth;
  const trendConfidence = Math.round((marketHealth.adx.value / 100) * 100);
  const volumeConfidence = Math.round(50 + marketHealth.obv.contribution * 5 + marketHealth.cmf.contribution * 5);
  const patternConfidence = Math.round(50 + marketHealth.bollingerBands.contribution * 3 + marketHealth.keltnerChannel.contribution * 3);

  // Analyze divergence risk for protection warnings
  const divergenceWarning = analyzeDivergenceRisk(ohlc, vwapSeries, momDiv, volSpike, exhaustion);

  let historicalMetrics: SignalMetrics | undefined;
  try {
    historicalMetrics = getSignalMetrics(symbol, 96);
  } catch {
    historicalMetrics = undefined;
  }

  const tactical = computeTactical(
    bullishPower,
    candleStrength,
    momDiv,
    volSpike,
    failedVwap,
    exhaustion,
    gammaSummary,
    emaCloud,
    marketConfidence,
    lastPrice,
    vwapSeries.length ? vwapSeries[vwapSeries.length - 1] : undefined,
    liquiditySweep,
    divergenceWarning,
    marketHealth,
    historicalMetrics
  );

  const overall = (bullishPower.meter + candleStrength.score + marketConfidence) / 3;
  const gradePayload = assignGrade(overall, trendConfidence, volumeConfidence, patternConfidence, marketConfidence, {});

  const gammaForMeta = { maxAbsGammaStrike: marketHealth.gamma?.maxAbsGammaStrike ?? null };
  const metaEngine = computeMetaEngine(
    ohlc,
    vwapSeries,
    marketHealth,
    liquiditySweep,
    failedVwap,
    exhaustion,
    candleStrength,
    emaCloud,
    gammaForMeta,
    tactical,
    sessionSplit,
    lastPrice
  );

  return {
    symbol,
    overall: gradePayload.overall,
    grade: gradePayload.grade,
    setupQuality: gradePayload.grade === 'A' || gradePayload.grade === 'B' ? 'strong' as const : gradePayload.grade === 'C' ? 'medium' as const : 'weak' as const,
    directionalBias: tactical.bias,
    strategy: tactical.strategy,
    confidence: tactical.confidence,
    directionScore: tactical.directionScore,
    liquiditySweep,
    notes: tactical.notes,
    trendConfidence: Math.round(trendConfidence),
    volumeConfidence: Math.round(volumeConfidence),
    patternConfidence: Math.round(patternConfidence),
    marketConfidence: Math.round(marketConfidence),
    bullishPower,
    candleStrength,
    momentumDivergence: momDiv,
    volumeSpike: volSpike,
    trendExhaustion: exhaustion,
    emaCloud,
    failedVwapReclaim: failedVwap,
    marketHealth,
    vwapSeries,
    ohlc,
    lastPrice,
    tactical,
    metaEngine,
    divergenceWarning
  };
}

export function generateSampleOHLC(symbol: string, count: number = 100, liveSpotPrice?: number): OHLC[] {
  // Use live spot price if provided, otherwise fall back to estimated prices
  const fallbackPrices: Record<string, number> = {
    SPY: 690,
    QQQ: 620,
    AAPL: 255,
    TSLA: 435,
    NVDA: 185,
    MSFT: 460,
    AMZN: 240,
    META: 620,
    GOOGL: 330,
    AMD: 130,
  };

  const basePrice = liveSpotPrice ?? fallbackPrices[symbol.toUpperCase()] ?? 100 + Math.random() * 400;
  const ohlc: OHLC[] = [];
  let currentPrice = basePrice;
  const now = Math.floor(Date.now() / 1000);

  for (let i = 0; i < count; i++) {
    const volatility = 0.002 + Math.random() * 0.003;
    
    const meanReversion = (basePrice - currentPrice) * 0.02;
    const randomMove = (Math.random() - 0.5) * volatility * currentPrice;
    
    const open = currentPrice;
    currentPrice = open + meanReversion + randomMove;
    
    currentPrice = Math.max(basePrice * 0.95, Math.min(basePrice * 1.05, currentPrice));
    
    const range = currentPrice * volatility;
    const high = Math.max(open, currentPrice) + Math.random() * range * 0.5;
    const low = Math.min(open, currentPrice) - Math.random() * range * 0.5;
    const close = currentPrice;
    
    const baseVolume = 1000000 + Math.random() * 5000000;
    const volumeMultiplier = Math.random() < 0.1 ? 2 + Math.random() * 2 : 0.8 + Math.random() * 0.4;
    const volume = Math.round(baseVolume * volumeMultiplier);

    const timeSec = now - (count - i) * 60 * 15;
    ohlc.push({
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume,
      time: timeSec,
      timeMs: timeSec * 1000,
    });
  }

  return ohlc;
}
