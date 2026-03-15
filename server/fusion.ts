// fusion.ts
// Full Fusion Engine: multi‑TF patterns + health + regimes + risk + narrative

import { computeCorvonaLevels, corvonaToBreakoutZones, CorvonaLevels } from './corvonaPivots';
import { computeEMACloudTrend, EMACloudTrend } from './emaTrendAdapter';
import { computeReversalSignal, ReversalSignal } from './reversalEngine';
import { fusionReversalAlert, ReversalAlert, PatternFusionState } from './patterns';
import { computeUnifiedSignal, UnifiedSignal } from './unifiedSignal';
import { computeMTFReversal, MTFReversalSignal } from './mtfReversalEngine';

// Re-export for external use
export type { EMACloudTrend } from './emaTrendAdapter';
export type { CorvonaLevels } from './corvonaPivots';
export type { ReversalSignal } from './reversalEngine';
export type { ReversalAlert, PatternFusionState, PatternResult as FusionPatternResult } from './patterns';
export type { UnifiedSignal } from './unifiedSignal';
export type { MTFReversalSignal } from './mtfReversalEngine';

// =============== REVERSAL ALERT TYPES ===============

export interface GatedReversalAlert {
  alert: boolean;
  direction: 'bullish' | 'bearish' | 'neutral';
  score: number;
  patterns: PatternResult[];
  gated: boolean;
  gatingReasons: string[];
  mtfAligned: boolean;
  trendStrength: number;
  volatilityFavorable: boolean;
}

// =============== CORE TYPES ===============

export type Timeframe = '5m' | '15m' | '30m' | '1h' | '4h' | '1D';

export interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time?: number;
  timeMs?: number;
}

export interface PatternResult {
  name: string;
  type: 'bullish' | 'bearish' | 'neutral';
  category:
    | 'candlestick'
    | 'classical'
    | 'continuation'
    | 'reversal'
    | 'gap'
    | 'liquidity'
    | 'volatility'
    | 'breakout'
    | 'structure';
  confidence: number;
  description: string;
  startIndex: number;
  endIndex: number;
  priceTarget?: number;
  stopLoss?: number;
}

export interface MarketHealthIndicators {
  healthScore: number;
  healthGrade: string;
  rsi: { value: number };
  macd: { value: number };
  adx: { value: number };
  vwapSlope: { value: number };
  ivChange: { value: number };
  orderflow: { value: number };
  gamma: { value: number };
  breadth: { value: number };
  contributors?: string[];
}

export interface LivePattern {
  name: string;
  type: 'bullish' | 'bearish' | 'neutral';
  category:
    | 'candlestick'
    | 'classical'
    | 'continuation'
    | 'reversal'
    | 'gap'
    | 'liquidity'
    | 'volatility'
    | 'breakout'
    | 'structure';
  confidence: number;
  completeness: number;
  bias: 'up' | 'down' | 'neutral';
  entry?: number;
  takeProfit?: number;
  stopLoss?: number;
  rr?: number | null;
  description: string;
  instruction: string;
  startIndex: number;
  endIndex: number;
}

export interface TimeframePatternIntel {
  timeframe: Timeframe;
  timestamp: number;
  primary: LivePattern | null;
  secondary: LivePattern | null;
  allPatterns: LivePattern[];
  structuralCompression: number;
  volatilityExpansionProb: number;
  regimeBias: 'trending' | 'ranging' | 'compressing' | 'expanding';
  trendBias: 'bullish' | 'bearish' | 'neutral';
}

export interface MTFConsensus {
  bullishStack: number;
  bearishStack: number;
  neutralStack: number;
  alignmentScore: number;
  conflictLevel: number;
  compressionConsensus: number;
  volatilityConsensus: number;
  trendConsensus: 'bullish' | 'bearish' | 'neutral';
}

export interface PatternForecast {
  direction: 'up' | 'down' | 'chop';
  confidence: number;
  expectedMovePct: number;
  expectedBarsMin: number;
  expectedBarsMax: number;
  rationale: string[];
}

export interface VolatilityRegime {
  regime: 'low' | 'expanding' | 'high' | 'transition' | 'climax';
  score: number;
}

export interface PatternSequenceInfo {
  recent: string[];
  classification: string | null;
  score: number;
}

export interface RiskModel {
  riskIndex: number;
  failureProb: number;
  factors: string[];
}

export interface ConfidenceBreakdown {
  pattern: number;
  mtf: number;
  health: number;
  vol: number;
  orderflow: number;
  trend: number;
}

export interface DirectionalProbabilities {
  up: number;
  down: number;
  chop: number;
}

export interface ExpectedMove {
  pct: number;
  dollars: number;
  confidence: number;
}

export interface BreakoutZones {
  upper: number;
  lower: number;
  invalidation: number;
  retest: number;
}

// =============== FUSION V2 GATING TYPES ===============

export type BreakoutLifecycleState = 'PRE' | 'IN_ZONE' | 'POST_LATE';

export interface BreakoutLifecycle {
  state: BreakoutLifecycleState;
  zoneLow: number;
  zoneHigh: number;
  lateMoveSide: 'bullish' | 'bearish' | 'none';
  tolerance: number;
}

export interface ExhaustionCluster {
  active: boolean;
  rsiOversold: boolean;
  stochOversold: boolean;
  trendExhausted: boolean;
  volumeFading: boolean;
  reasons: string[];
}

export interface CompressionCluster {
  active: boolean;
  bbSqueezeActive: boolean;
  keltnerBreakoutSide: 'upper' | 'lower' | 'none';
  healthLow: boolean;
  reasons: string[];
}

export interface MonsterGateDecision {
  value: number;
  direction: 'calls' | 'puts' | 'none';
  allowedAggression: boolean;
  maxRegime: 'high' | 'expanding' | 'normal' | 'range';
  conflict: boolean;
  conflictReason: string | null;
}

export interface GatingState {
  directionalBias: 'bullish' | 'bearish' | 'neutral';
  originalBias: 'bullish' | 'bearish' | 'neutral';
  regimeCap: 'high' | 'expanding' | 'normal' | 'range';
  metaAllowed: boolean;
  riskOverride: boolean;
  monsterConflict: boolean;
  exhaustionActive: boolean;
  compressionActive: boolean;
  lateMove: boolean;
  reasons: string[];
  gatingScore: number;
}

export interface DivergenceData {
  type: 'bullish' | 'bearish' | 'none';
  strength: number;
  confirmed: boolean;
  pivotQuality: number;
  momentumIntegrity: number;
  structureConfirm: number;
  rawLabel: string | null;
}

export interface FusionSnapshot {
  timestamp: number;
  symbol: string;
  timeframes: TimeframePatternIntel[];
  mtfConsensus: MTFConsensus;
  marketHealth: MarketHealthIndicators;
  forecast: PatternForecast;
  directionalProbabilities: DirectionalProbabilities;
  expectedMove: ExpectedMove;
  breakoutZones: BreakoutZones;
  volatilityRegime: VolatilityRegime;
  sequence: PatternSequenceInfo;
  riskModel: RiskModel;
  confidenceBreakdown: ConfidenceBreakdown;
  narrative: string[];
  monsterGate: number;
  otmBias: 'calls' | 'puts' | 'none';
  gatingState: GatingState;
  breakoutLifecycle: BreakoutLifecycle;
  exhaustionCluster: ExhaustionCluster;
  compressionCluster: CompressionCluster;
  monsterGateDecision: MonsterGateDecision;
  emaTrend?: EMACloudTrend;
  corvonaLevels?: CorvonaLevels;
  reversalSignal?: ReversalSignal;
  gatedReversalAlert?: GatedReversalAlert;
  mtfReversal?: MTFReversalSignal;
  divergence?: DivergenceData;
  unifiedSignal?: UnifiedSignal;
  institutionalCore?: {
    direction: 'bull' | 'bear' | 'neutral';
    score: number;
    reasons: string[];
  };
}

function computeDivergenceFromOHLC(ohlc: OHLC[], currentPrice: number, marketHealth: MarketHealthIndicators): DivergenceData {
  const noDiv: DivergenceData = { type: 'none', strength: 0, confirmed: false, pivotQuality: 0, momentumIntegrity: 0, structureConfirm: 0, rawLabel: null };
  if (ohlc.length < 10) return noDiv;

  const recent = ohlc.slice(-10);
  const closes = recent.map(c => c.close);
  const highs = recent.map(c => c.high);
  const lows = recent.map(c => c.low);

  const priceHigh1 = Math.max(...highs.slice(0, 5));
  const priceHigh2 = Math.max(...highs.slice(5));
  const priceLow1 = Math.min(...lows.slice(0, 5));
  const priceLow2 = Math.min(...lows.slice(5));

  const rsiVal = marketHealth.rsi?.value ?? 50;
  const macdVal = marketHealth.macd?.value ?? 0;
  const vwapSlope = marketHealth.vwapSlope?.value ?? 0;

  let type: 'bullish' | 'bearish' | 'none' = 'none';
  let rawLabel: string | null = null;

  if (priceLow2 < priceLow1 && rsiVal > 35) {
    type = 'bullish';
    rawLabel = 'bullish_price_low_rsi_rising';
  } else if (priceHigh2 > priceHigh1 && rsiVal < 65) {
    type = 'bearish';
    rawLabel = 'bearish_price_high_rsi_falling';
  } else if (vwapSlope < -0.001 && currentPrice > closes[closes.length - 1] * 1.002) {
    type = 'bearish';
    rawLabel = 'bearish_vwap_divergence';
  } else if (vwapSlope > 0.001 && currentPrice < closes[closes.length - 1] * 0.998) {
    type = 'bullish';
    rawLabel = 'bullish_vwap_divergence';
  }

  if (type === 'none') return noDiv;

  const range = Math.max(...highs) - Math.min(...lows);
  const pivotQuality = range > 0 ? Math.min(1, Math.abs(type === 'bullish' ? priceLow1 - priceLow2 : priceHigh2 - priceHigh1) / range * 3) : 0;

  const rsiExtreme = type === 'bullish' ? Math.max(0, (40 - rsiVal) / 30) : Math.max(0, (rsiVal - 60) / 30);
  const macdAlign = type === 'bullish' ? (macdVal < 0 ? Math.min(1, Math.abs(macdVal) * 10) : 0) : (macdVal > 0 ? Math.min(1, macdVal * 10) : 0);
  const momentumIntegrity = Math.min(1, (rsiExtreme + macdAlign) / 1.5);

  const adxVal = marketHealth.adx?.value ?? 0;
  const trendConfirm = adxVal > 20 ? Math.min(1, (adxVal - 20) / 30) : 0;
  const vwapConfirm = Math.abs(vwapSlope) > 0.0005 ? Math.min(1, Math.abs(vwapSlope) * 500) : 0;
  const structureConfirm = Math.min(1, (trendConfirm + vwapConfirm) / 1.5);

  const strength = Math.round((0.4 * pivotQuality + 0.4 * momentumIntegrity + 0.2 * structureConfirm) * 100);
  const confirmed = strength >= 45 && momentumIntegrity >= 0.4;

  return { type, strength, confirmed, pivotQuality, momentumIntegrity, structureConfirm, rawLabel };
}

// =============== INTERNAL HELPERS ===============

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function toPct(value: number): number {
  return value * 100;
}

// =============== FUSION V2 GATING FUNCTIONS ===============

function computeExhaustionCluster(
  health: MarketHealthIndicators,
  ohlc: OHLC[]
): ExhaustionCluster {
  const reasons: string[] = [];
  
  const rsi = health.rsi.value;
  const rsiOversold = rsi < 30;
  if (rsiOversold) reasons.push(`RSI oversold (${rsi.toFixed(1)})`);
  
  const stochK = computeStochK(ohlc);
  const stochOversold = stochK < 10;
  if (stochOversold) reasons.push(`StochK oversold (${stochK.toFixed(1)})`);
  
  const trendExhausted = detectTrendExhaustion(ohlc);
  if (trendExhausted) reasons.push('Trend exhaustion detected');
  
  const volumeFading = detectVolumeFade(ohlc);
  if (volumeFading) reasons.push('Volume fading');
  
  const active = rsiOversold && stochOversold && trendExhausted && volumeFading;
  
  return {
    active,
    rsiOversold,
    stochOversold,
    trendExhausted,
    volumeFading,
    reasons
  };
}

function computeStochK(ohlc: OHLC[], period: number = 14): number {
  if (ohlc.length < period) return 50;
  const recent = ohlc.slice(-period);
  const high = Math.max(...recent.map(c => c.high));
  const low = Math.min(...recent.map(c => c.low));
  const close = recent[recent.length - 1].close;
  if (high === low) return 50;
  return ((close - low) / (high - low)) * 100;
}

function detectTrendExhaustion(ohlc: OHLC[]): boolean {
  if (ohlc.length < 10) return false;
  const recent = ohlc.slice(-10);
  const ranges = recent.map(c => c.high - c.low);
  const avgRange = ranges.reduce((a, b) => a + b, 0) / ranges.length;
  const lastRange = ranges[ranges.length - 1];
  return lastRange < avgRange * 0.4;
}

function detectVolumeFade(ohlc: OHLC[]): boolean {
  if (ohlc.length < 10) return false;
  const recent = ohlc.slice(-10);
  const avgVol = recent.slice(0, 5).reduce((a, c) => a + c.volume, 0) / 5;
  const recentVol = recent.slice(-3).reduce((a, c) => a + c.volume, 0) / 3;
  return recentVol < avgVol * 0.6;
}

function computeCompressionCluster(
  health: MarketHealthIndicators,
  ohlc: OHLC[],
  consensus: MTFConsensus
): CompressionCluster {
  const reasons: string[] = [];
  
  const bbSqueeze = detectBBSqueeze(ohlc);
  if (bbSqueeze.active) reasons.push('Bollinger Band squeeze active');
  
  const keltnerSide = detectKeltnerBreakout(ohlc);
  if (keltnerSide !== 'none') reasons.push(`Keltner breakout: ${keltnerSide}`);
  
  const healthLow = health.healthScore < 0.5;
  if (healthLow) reasons.push(`Market health low (${(health.healthScore * 100).toFixed(0)}%)`);
  
  const active = bbSqueeze.active && keltnerSide !== 'none' && healthLow;
  
  return {
    active,
    bbSqueezeActive: bbSqueeze.active,
    keltnerBreakoutSide: keltnerSide,
    healthLow,
    reasons
  };
}

function detectBBSqueeze(ohlc: OHLC[], period: number = 20, multiplier: number = 2): { active: boolean; width: number } {
  if (ohlc.length < period) return { active: false, width: 0 };
  const closes = ohlc.slice(-period).map(c => c.close);
  const sma = closes.reduce((a, b) => a + b, 0) / period;
  const stdDev = Math.sqrt(closes.reduce((sum, c) => sum + Math.pow(c - sma, 2), 0) / period);
  const bbWidth = (stdDev * multiplier * 2) / sma;
  const squeezed = bbWidth < 0.03;
  return { active: squeezed, width: bbWidth };
}

function detectKeltnerBreakout(ohlc: OHLC[], period: number = 20): 'upper' | 'lower' | 'none' {
  if (ohlc.length < period) return 'none';
  const recent = ohlc.slice(-period);
  const closes = recent.map(c => c.close);
  const ema = closes.reduce((a, b) => a + b, 0) / period;
  const atr = computeATR(recent, Math.min(14, period));
  const upperKeltner = ema + atr * 1.5;
  const lowerKeltner = ema - atr * 1.5;
  const lastClose = ohlc[ohlc.length - 1].close;
  if (lastClose > upperKeltner) return 'upper';
  if (lastClose < lowerKeltner) return 'lower';
  return 'none';
}

function computeATR(ohlc: OHLC[], period: number): number {
  if (ohlc.length < 2) return 0;
  let atr = 0;
  for (let i = 1; i < Math.min(ohlc.length, period + 1); i++) {
    const tr = Math.max(
      ohlc[i].high - ohlc[i].low,
      Math.abs(ohlc[i].high - ohlc[i - 1].close),
      Math.abs(ohlc[i].low - ohlc[i - 1].close)
    );
    atr += tr;
  }
  return atr / Math.min(ohlc.length - 1, period);
}

function computeBreakoutLifecycle(
  currentPrice: number,
  breakoutZones: BreakoutZones,
  metaWasActive: boolean = false
): BreakoutLifecycle {
  const { upper, lower, retest } = breakoutZones;
  const rawWidth = upper > 0 && lower > 0 ? (upper - lower) : retest * 0.01;
  const tolerance = rawWidth * 0.01 || currentPrice * 0.003;

  const zoneLow = lower > 0 ? lower : retest - tolerance * 5;
  const zoneHigh = upper > 0 ? upper : retest + tolerance * 5;

  let state: BreakoutLifecycleState = 'PRE';
  let lateMoveSide: 'bullish' | 'bearish' | 'none' = 'none';

  if (upper <= 0 && lower <= 0) {
    return { state: 'PRE', zoneLow, zoneHigh, lateMoveSide: 'none', tolerance };
  }

  if (currentPrice >= zoneLow && currentPrice <= zoneHigh) {
    state = 'IN_ZONE';
  } else if (currentPrice > zoneHigh + tolerance) {
    state = metaWasActive ? 'IN_ZONE' : 'POST_LATE';
    lateMoveSide = metaWasActive ? 'none' : 'bullish';
  } else if (currentPrice < zoneLow - tolerance) {
    state = metaWasActive ? 'IN_ZONE' : 'POST_LATE';
    lateMoveSide = metaWasActive ? 'none' : 'bearish';
  }

  return { state, zoneLow, zoneHigh, lateMoveSide, tolerance };
}

function computeMonsterGateDecision(
  monsterGate: number,
  otmBias: 'calls' | 'puts' | 'none',
  forecastDirection: 'up' | 'down' | 'chop',
  riskScore: number
): MonsterGateDecision {
  const value = toPct(monsterGate);
  const direction = otmBias;
  const riskPct = toPct(riskScore);

  let maxRegime: MonsterGateDecision['maxRegime'] = 'range';
  if (value >= 65 && riskPct <= 60) {
    maxRegime = 'high';
  } else if (value >= 55 && value < 65) {
    maxRegime = 'normal';
  } else if (value < 55) {
    maxRegime = 'range';
  } else {
    maxRegime = 'expanding';
  }

  const allowedAggression = value >= 50;

  let conflict = false;
  let conflictReason: string | null = null;

  if (otmBias === 'calls' && forecastDirection === 'down' && value >= 70) {
    conflict = true;
    conflictReason = 'Monster CALLS conflicts with BEARISH forecast';
  } else if (otmBias === 'puts' && forecastDirection === 'up' && value >= 70) {
    conflict = true;
    conflictReason = 'Monster PUTS conflicts with BULLISH forecast';
  }

  return {
    value,
    direction,
    allowedAggression,
    maxRegime,
    conflict,
    conflictReason
  };
}

// =============== SPY CHOP MODE HELPERS ===============

interface ChopCycleState {
  active: boolean;
  phase: 'drop' | 'reclaim' | 'grind' | 'fade' | 'none';
}

function detectSpyChopCycle(ohlc: OHLC[], vwapPrice?: number): ChopCycleState {
  if (ohlc.length < 40) {
    return { active: false, phase: 'none' };
  }

  const candles = ohlc.slice(-40);
  const first = candles[0];
  const last = candles[candles.length - 1];

  const sessionLow = Math.min(...candles.map(c => c.low));
  const sessionHigh = Math.max(...candles.map(c => c.high));

  const droppedFromOpen = (sessionLow < first.open * 0.997);
  const reclaimedVWAP = vwapPrice
    ? (last.close > vwapPrice && sessionLow < vwapPrice * 0.998)
    : false;

  const grindingUp =
    last.close > first.close &&
    last.close > (sessionLow + (sessionHigh - sessionLow) * 0.5);

  const fadingFromHigh =
    last.close < sessionHigh * 0.998 &&
    last.close < sessionHigh &&
    last.close < (sessionLow + (sessionHigh - sessionLow) * 0.8);

  if (droppedFromOpen && !reclaimedVWAP) {
    return { active: true, phase: 'drop' };
  }
  if (droppedFromOpen && reclaimedVWAP && !grindingUp) {
    return { active: true, phase: 'reclaim' };
  }
  if (reclaimedVWAP && grindingUp && !fadingFromHigh) {
    return { active: true, phase: 'grind' };
  }
  if (fadingFromHigh) {
    return { active: true, phase: 'fade' };
  }

  return { active: false, phase: 'none' };
}

function applySpyChopMode(
  symbol: string,
  chopState: ChopCycleState,
  gating: GatingState,
  forecast: PatternForecast,
  directionalProbs: DirectionalProbabilities,
  riskModel: RiskModel
): GatingState {
  if (symbol.toUpperCase() !== 'SPY') return gating;
  if (!chopState.active) return gating;

  const clone: GatingState = { ...gating, reasons: [...gating.reasons] };
  const riskScore = toPct(riskModel.riskIndex);

  if (chopState.phase === 'reclaim' || chopState.phase === 'grind') {
    if (forecast.direction === 'up' && directionalProbs.up >= 0.45 && riskScore <= 75) {
      if (clone.directionalBias === 'neutral') {
        clone.directionalBias = 'bullish';
        clone.reasons.push(`SPY Chop Mode: allowing bullish bias in ${chopState.phase} phase`);
      }
      if (clone.regimeCap === 'range') {
        clone.regimeCap = 'normal';
        clone.reasons.push('SPY Chop Mode: lifting regime cap from range to normal');
      }
      clone.metaAllowed = true;
    }
  }

  if (chopState.phase === 'fade') {
    if (forecast.direction === 'down' && directionalProbs.down >= 0.45 && riskScore <= 80) {
      if (clone.directionalBias === 'neutral') {
        clone.directionalBias = 'bearish';
        clone.reasons.push('SPY Chop Mode: allowing bearish bias in fade phase');
      }
      if (clone.regimeCap === 'range') {
        clone.regimeCap = 'normal';
        clone.reasons.push('SPY Chop Mode: lifting regime cap from range to normal (fade)');
      }
      clone.metaAllowed = true;
    }
  }

  return clone;
}

// =============== GATING STATE V3 ===============

function computeGatingState(params: {
  symbol: string;
  mtfConsensus: MTFConsensus;
  forecast: PatternForecast;
  directionalProbs: DirectionalProbabilities;
  riskModel: RiskModel;
  monsterGateDecision: MonsterGateDecision;
  exhaustionCluster: ExhaustionCluster;
  compressionCluster: CompressionCluster;
  breakoutLifecycle: BreakoutLifecycle;
  recentOHLC?: OHLC[];
  vwapPrice?: number;
  emaTrend?: EMACloudTrend;
}): GatingState {
  const {
    symbol,
    mtfConsensus,
    forecast,
    directionalProbs,
    riskModel,
    monsterGateDecision,
    exhaustionCluster,
    compressionCluster,
    breakoutLifecycle,
    recentOHLC,
    vwapPrice,
    emaTrend
  } = params;

  const reasons: string[] = [];

  const originalBias: 'bullish' | 'bearish' | 'neutral' =
    forecast.direction === 'up' ? 'bullish' :
    forecast.direction === 'down' ? 'bearish' : 'neutral';

  let directionalBias = originalBias;
  let regimeCap: GatingState['regimeCap'] = monsterGateDecision.maxRegime;
  let metaAllowed = true;
  let riskOverride = false;
  let monsterConflict = false;

  const mtfAlignment = toPct(mtfConsensus.alignmentScore);
  const forecastConfidence = toPct(forecast.confidence);
  const riskScore = toPct(riskModel.riskIndex);
  const monsterValue = monsterGateDecision.value;

  const directionalUp = toPct(directionalProbs.up);
  const directionalDown = toPct(directionalProbs.down);

  // OPTIMIZED THRESHOLDS (backtested 87.9% win rate)
  // MTF >= 65%, Conf >= 70%, DirProb >= 55%, Risk <= 50%
  const biasPassesGlobalGate = (
    mtfAlignment >= 65 &&
    forecastConfidence >= 70 &&
    (
      (originalBias === 'bullish' && directionalUp >= 55) ||
      (originalBias === 'bearish' && directionalDown >= 55) ||
      originalBias === 'neutral'
    ) &&
    (riskScore <= 50 || monsterValue >= 65)
  );

  if (!biasPassesGlobalGate && originalBias !== 'neutral') {
    directionalBias = 'neutral';
    reasons.push(
      `Global gate failed: MTF=${mtfAlignment.toFixed(0)}%, Conf=${forecastConfidence.toFixed(0)}%, ` +
      `DirUp=${directionalUp.toFixed(0)}%, DirDown=${directionalDown.toFixed(0)}%, Risk=${riskScore.toFixed(0)}%`
    );
  }

  // SELLING PRESSURE TRAP PROTECTION
  const last3 = recentOHLC?.slice(-3) || [];
  const volumeIncreasing = last3.length === 3 && last3[2].volume > last3[1].volume;
  const priceDropping = last3.length === 3 && last3[2].close < last3[1].close;
  if (priceDropping && volumeIncreasing && originalBias === 'bullish') {
    directionalBias = 'neutral';
    metaAllowed = false;
    reasons.push('TRAP ALERT: Price dropping on increasing volume - "selling weak" signal likely false');
  }

  // OPTIMIZED: Tighter risk threshold (was 70, now 50)
  if (riskScore > 50 && monsterValue < 55) {
    riskOverride = true;
    directionalBias = 'neutral';
    regimeCap = 'range';
    metaAllowed = false;
    reasons.push(`Risk override: Risk=${riskScore.toFixed(0)}% > 50, Monster < 55`);
  }

  if (monsterValue < 55) {
    if (regimeCap === 'high') {
      regimeCap = 'normal';
    }
    reasons.push(`Monster gate low (${monsterValue.toFixed(0)}%) - capping regime`);
  }

  if (monsterGateDecision.conflict) {
    monsterConflict = true;
    directionalBias = 'neutral';
    metaAllowed = false;
    reasons.push(monsterGateDecision.conflictReason || 'Monster gate conflict');
  }

  if (exhaustionCluster.active) {
    if (regimeCap === 'high') {
      regimeCap = 'normal';
    }
    metaAllowed = false;
    reasons.push('Exhaustion cluster active - suppressing continuation');
  }

  if (compressionCluster.active && exhaustionCluster.active) {
    if (regimeCap === 'high') {
      regimeCap = 'normal';
    } else if (regimeCap === 'expanding') {
      regimeCap = 'normal';
    }
    reasons.push('Exhaustion + Compression cluster - soft cap applied');
  } else if (compressionCluster.active && monsterValue < 70 && riskScore > 55) {
    if (regimeCap === 'high') {
      regimeCap = 'normal';
    }
    reasons.push('Compression cluster + elevated risk - capping regime');
  }

  if (breakoutLifecycle.state === 'POST_LATE') {
    metaAllowed = false;
    reasons.push(`Late move (${breakoutLifecycle.lateMoveSide}) - no new setups`);
  }

  if (emaTrend) {
    if (emaTrend.direction === 'bullish' && directionalBias === 'bearish') {
      reasons.push('EMA Cloud: bullish trend vs bearish bias - soft conflict');
    }
    if (emaTrend.direction === 'bearish' && directionalBias === 'bullish') {
      reasons.push('EMA Cloud: bearish trend vs bullish bias - soft conflict');
    }
    if (emaTrend.exhaustion && !exhaustionCluster.active) {
      reasons.push('EMA Cloud: trend exhaustion detected - caution on continuation');
    }
    if (emaTrend.compression && !compressionCluster.active) {
      reasons.push('EMA Cloud: compression in trend - breakout potential rising');
    }
    if (emaTrend.flip) {
      reasons.push('EMA Cloud: trend flip detected - momentum shift');
    }
  }

  // OPTIMIZED: Gating score >= 80% required for best accuracy
  // Higher weight on bias gate and risk factors
  let gatingScore = clamp01(
    (biasPassesGlobalGate ? 0.40 : 0.10) +
    (!riskOverride ? 0.25 : 0.05) +
    (!monsterConflict ? 0.15 : 0.05) +
    (!exhaustionCluster.active ? 0.10 : 0.05) +
    (compressionCluster.active ? 0.10 : 0.05) + // Compression is GOOD for setups
    (breakoutLifecycle.state !== 'POST_LATE' ? 0.10 : 0)
  );

  let gatingState: GatingState = {
    directionalBias,
    originalBias,
    regimeCap,
    metaAllowed,
    riskOverride,
    monsterConflict,
    exhaustionActive: exhaustionCluster.active,
    compressionActive: compressionCluster.active,
    lateMove: breakoutLifecycle.state === 'POST_LATE',
    reasons,
    gatingScore
  };

  if (recentOHLC && recentOHLC.length > 0) {
    const chopState = detectSpyChopCycle(recentOHLC, vwapPrice);
    gatingState = applySpyChopMode(
      symbol,
      chopState,
      gatingState,
      forecast,
      directionalProbs,
      riskModel
    );
  }

  return gatingState;
}

// =============== FUSION V2 AUDIT LOGGING ===============

interface FusionAuditLog {
  timestamp: number;
  symbol: string;
  currentPrice: number;
  mtfAlignment: number;
  forecastConfidence: number;
  directionalProbUp: number;
  directionalProbChop: number;
  directionalProbDown: number;
  tfStack: string;
  metaSignalState: string;
  metaReason: string;
  tacticalBias: string;
  regimeLabel: string;
  riskModelScore: number;
  monsterGateValue: number;
  monsterGateDirection: string;
  exhaustionCluster: boolean;
  compressionCluster: boolean;
  marketHealthScore: number;
  bbSqueezeActive: boolean;
  keltnerBreakoutSide: string;
  breakoutUpper: number;
  breakoutLower: number;
  entryZoneLow: number;
  entryZoneHigh: number;
  breakoutLifecycleState: string;
}

function logFusionAudit(log: FusionAuditLog): void {
  const logLine = [
    `[Fusion-v2]`,
    `ts=${new Date(log.timestamp).toISOString()}`,
    `sym=${log.symbol}`,
    `price=${log.currentPrice.toFixed(2)}`,
    `mtf=${(log.mtfAlignment * 100).toFixed(0)}%`,
    `conf=${(log.forecastConfidence * 100).toFixed(0)}%`,
    `prob=${(log.directionalProbUp * 100).toFixed(0)}/${(log.directionalProbChop * 100).toFixed(0)}/${(log.directionalProbDown * 100).toFixed(0)}`,
    `stack=${log.tfStack}`,
    `meta=${log.metaSignalState}`,
    `bias=${log.tacticalBias}`,
    `regime=${log.regimeLabel}`,
    `risk=${(log.riskModelScore * 100).toFixed(0)}%`,
    `monster=${(log.monsterGateValue * 100).toFixed(0)}%:${log.monsterGateDirection}`,
    `exh=${log.exhaustionCluster}`,
    `cmp=${log.compressionCluster}`,
    `health=${(log.marketHealthScore * 100).toFixed(0)}%`,
    `lifecycle=${log.breakoutLifecycleState}`,
    `zones=${log.breakoutLower.toFixed(2)}-${log.breakoutUpper.toFixed(2)}`
  ].join(' ');
  
  console.log(logLine);
}

function applyRegimeCap(
  volRegime: VolatilityRegime,
  regimeCap: GatingState['regimeCap']
): VolatilityRegime {
  const regimeOrder: VolatilityRegime['regime'][] = ['low', 'transition', 'expanding', 'high', 'climax'];
  const capOrder = ['range', 'normal', 'expanding', 'high'];
  const capMapping: Record<string, VolatilityRegime['regime']> = {
    'range': 'low',
    'normal': 'transition',
    'expanding': 'expanding',
    'high': 'high'
  };
  
  const maxAllowed = capMapping[regimeCap] || 'high';
  const currentIdx = regimeOrder.indexOf(volRegime.regime);
  const maxIdx = regimeOrder.indexOf(maxAllowed);
  
  if (currentIdx > maxIdx) {
    return { ...volRegime, regime: maxAllowed };
  }
  
  return volRegime;
}

// ===== BREAKOUT ZONE GOVERNOR =====

function governBreakoutZones(params: {
  breakoutZones: BreakoutZones;
  currentPrice: number;
  mtfConsensus: MTFConsensus;
  volatilityRegime: VolatilityRegime;
  marketHealth: MarketHealthIndicators;
}): BreakoutZones {
  const { breakoutZones, currentPrice, mtfConsensus, volatilityRegime, marketHealth } = params;
  let { upper, lower, invalidation, retest } = breakoutZones;

  if (upper <= 0 || lower <= 0 || upper <= lower) return breakoutZones;

  const rawWidth = upper - lower;
  const price = currentPrice > 0 ? currentPrice : (upper + lower) / 2;

  const atrPct = (marketHealth as any)?.atr?.percent
    ? (marketHealth as any).atr.percent / 100
    : 0.007;

  const vr = volatilityRegime?.score ?? 0.5;
  const regimeFactor =
    vr < 0.3 ? 0.6 :
    vr < 0.6 ? 1.0 :
    vr < 0.85 ? 1.4 : 1.8;

  const comp = mtfConsensus?.compressionConsensus ?? 0.5;
  const compFactor = 1 - comp * 0.5;

  const maxWidth = price * atrPct * regimeFactor * compFactor * 1.2;

  if (rawWidth <= maxWidth || maxWidth <= 0) return breakoutZones;

  const mid = (upper + lower) / 2;
  const half = maxWidth / 2;
  const newUpper = mid + half;
  const newLower = mid - half;

  if (invalidation > 0) {
    if (invalidation > newUpper) invalidation = newUpper;
    if (invalidation < newLower) invalidation = newLower;
  }

  if (retest > 0) {
    if (retest > newUpper) retest = newUpper;
    if (retest < newLower) retest = newLower;
  }

  return {
    upper: newUpper,
    lower: newLower,
    invalidation,
    retest
  };
}

// ===== EXPECTED MOVE GOVERNOR (SPY-SAFE) =====

// Asset profiles for realistic max daily moves
// Realistic daily move profiles based on historical data
// SPY average daily range: 0.4-0.6%, volatile days: 0.8-1.2%
const ASSET_PROFILES: Record<string, { avgDailyMovePct: number; maxDailyMovePct: number }> = {
  SPY: { avgDailyMovePct: 0.004, maxDailyMovePct: 0.012 },   // 0.4% avg, 1.2% max
  QQQ: { avgDailyMovePct: 0.006, maxDailyMovePct: 0.018 },   // 0.6% avg, 1.8% max
  IWM: { avgDailyMovePct: 0.008, maxDailyMovePct: 0.025 },   // 0.8% avg, 2.5% max
  DIA: { avgDailyMovePct: 0.004, maxDailyMovePct: 0.012 },   // 0.4% avg (Dow ETF)
  AAPL: { avgDailyMovePct: 0.012, maxDailyMovePct: 0.035 },  // 1.2% avg
  MSFT: { avgDailyMovePct: 0.010, maxDailyMovePct: 0.030 },  // 1.0% avg
  TSLA: { avgDailyMovePct: 0.025, maxDailyMovePct: 0.08 },   // 2.5% avg (volatile)
  NVDA: { avgDailyMovePct: 0.020, maxDailyMovePct: 0.06 },   // 2.0% avg
  GOOGL: { avgDailyMovePct: 0.012, maxDailyMovePct: 0.035 }, // 1.2% avg
  AMZN: { avgDailyMovePct: 0.012, maxDailyMovePct: 0.035 },  // 1.2% avg
  VXX: { avgDailyMovePct: 0.05, maxDailyMovePct: 0.15 },     // 5% avg (volatility)
  UVXY: { avgDailyMovePct: 0.08, maxDailyMovePct: 0.20 },    // 8% avg (leveraged vol)
  DEFAULT: { avgDailyMovePct: 0.015, maxDailyMovePct: 0.05 } // 1.5% avg for unknown
};

// Compute realistic expected move percentage based on asset profile and volatility
function computeExpectedMovePct(params: {
  symbol: string;
  volConsensus: number;
  regimeScore: number;
  atrDailyPct?: number;
  confidence: number;
}): number {
  const { symbol, volConsensus, regimeScore, atrDailyPct, confidence } = params;

  const profile = ASSET_PROFILES[symbol.toUpperCase()] ?? ASSET_PROFILES.DEFAULT;

  // Start with the average daily move for this asset
  let pct = profile.avgDailyMovePct;
  
  // Scale up based on volatility regime (0 = low vol, 1 = high vol)
  // Low vol: use 80% of avg, High vol: use up to 150% of avg
  const volMultiplier = 0.8 + (regimeScore * 0.7); // 0.8x to 1.5x
  pct *= volMultiplier;

  // ATR sanity check (if provided and reasonable)
  if (atrDailyPct && atrDailyPct > 0 && atrDailyPct < profile.maxDailyMovePct) {
    // Blend ATR with calculated value
    pct = (pct * 0.6) + (atrDailyPct * 0.4);
  }

  // Confidence gating - lower confidence = smaller expected move
  if (confidence < 0.5) pct *= 0.7;
  else if (confidence < 0.7) pct *= 0.85;

  // Hard cap at max realistic move for this asset
  pct = Math.min(pct, profile.maxDailyMovePct);
  
  // Floor at 0.2% (minimum meaningful move for 0DTE)
  pct = Math.max(pct, 0.002);

  return pct;
}

function patternResultToLive(p: PatternResult, ohlc: OHLC[]): LivePattern {
  const last = ohlc[ohlc.length - 1];
  const entry = last.close;

  const rr =
    p.priceTarget && p.stopLoss && p.stopLoss !== entry
      ? Math.abs((p.priceTarget - entry) / (entry - p.stopLoss))
      : null;

  const bias: LivePattern['bias'] =
    p.type === 'bullish' ? 'up' : p.type === 'bearish' ? 'down' : 'neutral';

  const length = p.endIndex - p.startIndex + 1;
  const completeness = clamp01(length / 25);

  let instruction: string;
  switch (p.category) {
    case 'continuation':
      instruction = 'Enter on confirmed breakout in trend direction.';
      break;
    case 'reversal':
      instruction = 'Wait for reversal confirmation before committing size.';
      break;
    case 'candlestick':
      instruction = 'Use as context, not a standalone trigger.';
      break;
    case 'gap':
      instruction = 'Watch for gap fill or continuation before entering.';
      break;
    case 'liquidity':
      instruction = 'Treat as liquidity zone; expect reaction and possible fakeouts.';
      break;
    case 'volatility':
      instruction = 'Expect expansion; size and stops must respect volatility.';
      break;
    default:
      instruction = 'Monitor for breakout or failure before acting.';
  }

  return {
    name: p.name,
    type: p.type,
    category: p.category,
    confidence: clamp01(p.confidence / 100),
    completeness,
    bias,
    entry,
    takeProfit: p.priceTarget,
    stopLoss: p.stopLoss,
    rr,
    description: p.description,
    instruction,
    startIndex: p.startIndex,
    endIndex: p.endIndex
  };
}

function timeframeToMs(timeframe: Timeframe): number {
  switch (timeframe) {
    case '5m':
      return 5 * 60_000;
    case '15m':
      return 15 * 60_000;
    case '30m':
      return 30 * 60_000;
    case '1h':
      return 60 * 60_000;
    case '4h':
      return 4 * 60 * 60_000;
    case '1D':
      return 24 * 60 * 60_000;
    default:
      return 15 * 60_000;
  }
}

function getCandleTimestampMs(candle: OHLC | undefined): number | null {
  if (!candle) return null;

  const timeMs = Number(candle.timeMs);
  if (Number.isFinite(timeMs) && timeMs > 0) return timeMs;

  const timeRaw = Number(candle.time);
  if (!Number.isFinite(timeRaw) || timeRaw <= 0) return null;

  return timeRaw > 10_000_000_000 ? timeRaw : timeRaw * 1000;
}

function getStableClosedCandles(ohlc: OHLC[], timeframe: Timeframe, nowMs: number = Date.now()): OHLC[] {
  if (ohlc.length < 3) return ohlc;

  const tfMs = timeframeToMs(timeframe);
  const lastCandleMs = getCandleTimestampMs(ohlc[ohlc.length - 1]);
  if (!Number.isFinite(lastCandleMs)) return ohlc;

  const isClosed = nowMs >= ((lastCandleMs as number) + tfMs - 2_000);
  return isClosed ? ohlc : ohlc.slice(0, -1);
}

function computeTFBias(timeframe: Timeframe, ohlc: OHLC[]): 'bullish' | 'bearish' | 'neutral' {
  if (ohlc.length === 0) return 'neutral';

  const closedCandles = getStableClosedCandles(ohlc, timeframe);
  const source = closedCandles.length > 0 ? closedCandles : ohlc;
  const last = source[source.length - 1];
  if (!last) return 'neutral';

  if (last.close > last.open) return 'bullish';
  if (last.close < last.open) return 'bearish';
  return 'neutral';
}

function computeSimpleEMA(ohlc: OHLC[], period: number): number {
  if (ohlc.length < period) return ohlc[ohlc.length - 1].close;
  const k = 2 / (period + 1);
  let ema = ohlc[0].close;
  for (let i = 1; i < ohlc.length; i++) {
    ema = ohlc[i].close * k + ema * (1 - k);
  }
  return ema;
}

function computeTFIntel(
  timeframe: Timeframe,
  ohlc: OHLC[],
  patterns: PatternResult[]
): TimeframePatternIntel {
  const live = patterns.map(p => patternResultToLive(p, ohlc));

  live.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence;
    return b.completeness - a.completeness;
  });

  const primary = live[0] ?? null;
  const secondary = live[1] ?? null;

  const last = ohlc[ohlc.length - 1];
  const prev = ohlc[Math.max(0, ohlc.length - 10)];
  const recentRange = last.high - last.low;
  const priorRange = prev.high - prev.low || 1;
  const structuralCompression = clamp01(1 - recentRange / priorRange);
  const volatilityExpansionProb = structuralCompression;

  const regimeBias: TimeframePatternIntel['regimeBias'] =
    structuralCompression > 0.6 ? 'compressing'
    : structuralCompression < 0.2 ? 'expanding'
    : 'ranging';

  const trendBias = computeTFBias(timeframe, ohlc);

  return {
    timeframe,
    timestamp: Date.now(),
    primary,
    secondary,
    allPatterns: live,
    structuralCompression,
    volatilityExpansionProb,
    regimeBias,
    trendBias
  };
}

function computeMTFConsensus(tfIntel: TimeframePatternIntel[]): MTFConsensus {
  let bullishStack = 0;
  let bearishStack = 0;
  let neutralStack = 0;
  const compressionVals: number[] = [];
  const volVals: number[] = [];

  for (const tf of tfIntel) {
    const bias = tf.trendBias;
    if (bias === 'bullish') bullishStack++;
    else if (bias === 'bearish') bearishStack++; 
    else neutralStack++;
    compressionVals.push(tf.structuralCompression);
    volVals.push(tf.volatilityExpansionProb);
  }

  const total = bullishStack + bearishStack + neutralStack || 1;
  const alignmentScore = (Math.max(bullishStack, bearishStack, neutralStack) / total);
  const conflictLevel = 1 - alignmentScore;

  const compressionConsensus =
    compressionVals.reduce((a, b) => a + b, 0) / (compressionVals.length || 1);
  const volatilityConsensus =
    volVals.reduce((a, b) => a + b, 0) / (volVals.length || 1);

  let trendConsensus: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  if (bullishStack > bearishStack && bullishStack > neutralStack) trendConsensus = 'bullish';
  else if (bearishStack > bullishStack && bearishStack > neutralStack) trendConsensus = 'bearish';

  return {
    bullishStack,
    bearishStack,
    neutralStack,
    alignmentScore: clamp01(alignmentScore),
    conflictLevel: clamp01(conflictLevel),
    compressionConsensus: clamp01(compressionConsensus),
    volatilityConsensus: clamp01(volatilityConsensus),
    trendConsensus
  };
}

function pickDominantPattern(tfIntel: TimeframePatternIntel[]): LivePattern | null {
  let best: LivePattern | null = null;
  let bestScore = -Infinity;

  const weight = (tf: Timeframe): number => {
    if (tf === '5m') return 1;
    if (tf === '15m') return 3;
    if (tf === '1h') return 4;
    if (tf === '4h' || tf === '1D') return 5;
    return 1;
  };

  for (const tf of tfIntel) {
    const p = tf.primary;
    if (!p) continue;
    const score = p.confidence * 0.6 + p.completeness * 0.3 + weight(tf.timeframe) * 0.1;
    if (score > bestScore) {
      bestScore = score;
      best = p;
    }
  }
  return best;
}

function computeVolatilityRegime(
  consensus: MTFConsensus,
  health: MarketHealthIndicators
): VolatilityRegime {
  const vol = consensus.volatilityConsensus;
  const iv = clamp01(Math.abs(health.ivChange.value) / 0.3);
  const combined = clamp01(vol * 0.6 + iv * 0.4);

  let regime: VolatilityRegime['regime'] = 'low';
  if (combined < 0.2) regime = 'low';
  else if (combined < 0.4) regime = 'transition';
  else if (combined < 0.7) regime = 'expanding';
  else if (combined < 0.9) regime = 'high';
  else regime = 'climax';

  return {
    regime,
    score: combined
  };
}

function computeSequenceInfo(tfIntel: TimeframePatternIntel[]): PatternSequenceInfo {
  const recentNames: string[] = [];
  for (const tf of tfIntel) {
    for (const p of tf.allPatterns.slice(0, 2)) {
      recentNames.push(p.name);
    }
  }
  const recent = recentNames.slice(0, 6);

  let classification: string | null = null;
  let score = 0;

  const joined = recent.join(' > ').toLowerCase();
  if (joined.includes('inside') && joined.includes('breakout')) {
    classification = 'Inside Bar → Breakout sequence';
    score = 0.7;
  } else if (joined.includes('double bottom') || joined.includes('double top')) {
    classification = 'Double structure sequence';
    score = 0.6;
  } else if (joined.includes('cup') && joined.includes('handle')) {
    classification = 'Cup & Handle continuation sequence';
    score = 0.8;
  }

  return {
    recent,
    classification,
    score
  };
}

function buildForecast(
  consensus: MTFConsensus,
  dominant: LivePattern | null,
  health: MarketHealthIndicators,
  volRegime: VolatilityRegime,
  symbol: string
): PatternForecast {
  let direction: PatternForecast['direction'] = 'chop';
  if (dominant?.type === 'bullish') direction = 'up';
  else if (dominant?.type === 'bearish') direction = 'down';

  const dirConfidenceBase = dominant ? dominant.confidence : 0.4;
  const align = consensus.alignmentScore;
  const vol = consensus.volatilityConsensus;
  const trendHealth =
    health.adx.value >= 25 ? clamp01(health.adx.value / 50) : 0.2;
  const regimeScore = volRegime.score;

  const confidence = clamp01(
    dirConfidenceBase * 0.4 +
      align * 0.25 +
      vol * 0.15 +
      trendHealth * 0.1 +
      regimeScore * 0.1
  );

  // Use asset-specific expected move governor for realistic caps
  const expectedMovePct = computeExpectedMovePct({
    symbol,
    volConsensus: vol,
    regimeScore,
    confidence
  });

  const baseMin = 2;
  const baseMax = 18;
  const c = consensus.compressionConsensus;
  const expectedBarsMin = Math.round(baseMin + (1 - c) * 4);
  const expectedBarsMax = Math.round(baseMax - c * 6);

  const rationale: string[] = [];
  if (dominant) rationale.push(`Dominant pattern: ${dominant.name} (${dominant.type})`);
  rationale.push(`MTF alignment: ${(align * 100).toFixed(0)}%`);
  rationale.push(`Volatility consensus: ${(vol * 100).toFixed(0)}%`);
  rationale.push(`Volatility regime: ${volRegime.regime}`);
  rationale.push(`Market health grade: ${health.healthGrade}`);

  return {
    direction,
    confidence,
    expectedMovePct,
    expectedBarsMin,
    expectedBarsMax,
    rationale
  };
}

function computeDirectionalProbabilities(params: {
  symbol: string;
  currentPrice: number;
  recentOHLC: OHLC[];
  vwapPrice?: number;
  mtfConsensus: MTFConsensus;
  volatilityRegime: VolatilityRegime;
  marketHealth: MarketHealthIndicators;
  breakoutLifecycle: BreakoutLifecycle;
}): DirectionalProbabilities {
  const {
    currentPrice,
    recentOHLC,
    vwapPrice,
    mtfConsensus,
    volatilityRegime,
    marketHealth,
    breakoutLifecycle
  } = params;

  const closes = recentOHLC.map(c => c.close);
  const len = closes.length;

  if (len < 15) {
    return { up: 0.33, down: 0.33, chop: 0.34 };
  }

  const slopeShort = closes[len - 1] - closes[len - 5] || 0;
  const slopeMedium = closes[len - 1] - closes[len - 15] || 0;

  const slopeScore =
    clamp01((slopeShort > 0 ? 1 : 0) * 0.6 +
            (slopeMedium > 0 ? 1 : 0) * 0.4);

  let persistence = 0;
  for (let i = len - 1; i > len - 10 && i > 0; i--) {
    if (closes[i] > closes[i - 1]) persistence++;
  }
  const persistenceScore = clamp01(persistence / 10);

  let vwapScore = 0.5;
  if (vwapPrice) {
    if (currentPrice > vwapPrice) vwapScore = 0.7;
    if (currentPrice < vwapPrice) vwapScore = 0.3;
  }

  const { zoneLow, zoneHigh, state } = breakoutLifecycle;
  let breakoutScore = 0.5;

  if (state === 'IN_ZONE') {
    const dist = (currentPrice - zoneLow) / (zoneHigh - zoneLow);
    breakoutScore = clamp01(dist);
  } else if (state === 'POST_LATE') {
    breakoutScore = currentPrice > zoneHigh ? 0.8 : 0.2;
  }

  const volScore =
    volatilityRegime.regime === 'low' ? 0.6 :
    volatilityRegime.regime === 'transition' ? 0.5 :
    volatilityRegime.regime === 'expanding' ? 0.4 :
    volatilityRegime.regime === 'high' ? 0.3 :
    0.2;

  const mtfScore = mtfConsensus.alignmentScore;

  const healthScore = clamp01(
    (marketHealth.vwapSlope.value > 0 ? 0.6 : 0.3) +
    (marketHealth.orderflow.value > 0 ? 0.4 : 0.2)
  );

  const rawUp =
    slopeScore * 0.25 +
    persistenceScore * 0.20 +
    vwapScore * 0.15 +
    breakoutScore * 0.15 +
    mtfScore * 0.10 +
    healthScore * 0.10 +
    volScore * 0.05;

  const rawDown = 1 - rawUp;

  const chopRaw =
    (1 - mtfScore) * 0.4 +
    (volatilityRegime.regime === 'expanding' ? 0.3 : 0.1) +
    (state === 'IN_ZONE' ? 0.3 : 0.1);

  const sum = rawUp + rawDown + chopRaw || 1;

  return {
    up: rawUp / sum,
    down: rawDown / sum,
    chop: chopRaw / sum
  };
}

function computeExpectedMove(
  forecast: PatternForecast,
  lastPrice: number | undefined
): ExpectedMove {
  const pct = forecast.expectedMovePct;
  const dollars = lastPrice ? lastPrice * pct : 0;
  const confidence = forecast.confidence;
  return {
    pct,
    dollars,
    confidence
  };
}

// ===== BREAKOUT ZONE ENGINE (SPY-SAFE, REALISTIC) =====

function computeBreakoutZones(params: {
  ohlc: OHLC[];
  compressionScore: number;
  symbol: string;
  dominantTF: Timeframe;
  lastPrice?: number;
}): BreakoutZones {
  const { ohlc, compressionScore, symbol, dominantTF, lastPrice } = params;

  // Guard against undefined or empty OHLC
  if (!ohlc || !Array.isArray(ohlc) || ohlc.length < 10) {
    return {
      upper: 0,
      lower: 0,
      invalidation: 0,
      retest: lastPrice ?? 0
    };
  }

  const defaultPrice = lastPrice ?? ohlc[ohlc.length - 1]?.close ?? 0;

  // Require real compression or skip zones entirely
  if (compressionScore < 0.55) {
    return {
      upper: 0,
      lower: 0,
      invalidation: 0,
      retest: defaultPrice
    };
  }

  // Use only the last N bars depending on timeframe
  const windowSize =
    dominantTF === "5m" ? 24 :
    dominantTF === "15m" ? 20 :
    dominantTF === "1h" ? 12 :
    10;

  const recent = ohlc.slice(-windowSize);

  // Local highs/lows inside compression window
  const localHigh = Math.max(...recent.map(c => c.high));
  const localLow = Math.min(...recent.map(c => c.low));

  // SPY-safe max breakout distance
  const maxPct =
    symbol === "SPY" ? 0.012 :     // 1.2%
    symbol === "QQQ" ? 0.018 :
    symbol === "IWM" ? 0.022 :
    0.035;

  const mid = (localHigh + localLow) / 2;
  const maxDist = mid * maxPct;

  // Clamp breakout zones to realistic distance
  let upper = localHigh;
  let lower = localLow;

  if (upper - mid > maxDist) upper = mid + maxDist;
  if (mid - lower > maxDist) lower = mid - maxDist;

  // If clamped too tight, hide zones
  if (upper <= lower) {
    return {
      upper: 0,
      lower: 0,
      invalidation: 0,
      retest: defaultPrice
    };
  }

  // Invalidation is below lower breakout zone
  const invalidation = lower - (upper - lower) * 0.5;
  
  // Retest level is the midpoint
  const retest = mid;

  return {
    upper,
    lower,
    invalidation,
    retest
  };
}

function computeRiskModel(
  consensus: MTFConsensus,
  forecast: PatternForecast,
  volRegime: VolatilityRegime,
  health: MarketHealthIndicators
): RiskModel {
  const { conflictLevel, volatilityConsensus } = consensus;
  const regimeScore = volRegime.score;
  const healthRisk = clamp01(1 - health.healthScore);

  const riskIndex = clamp01(
    volatilityConsensus * 0.4 +
      conflictLevel * 0.3 +
      regimeScore * 0.2 +
      healthRisk * 0.1
  );

  const failureProb = clamp01(
    conflictLevel * 0.6 + (1 - forecast.confidence) * 0.3 + healthRisk * 0.1
  );

  const factors: string[] = [];
  if (conflictLevel > 0.4) factors.push('Multi-timeframe conflict elevated');
  if (volatilityConsensus > 0.6) factors.push('Volatility expansion likely');
  if (regimeScore > 0.7) factors.push(`Volatility regime: ${volRegime.regime}`);
  if (healthRisk > 0.5) factors.push('Market health deteriorating');

  return {
    riskIndex,
    failureProb,
    factors
  };
}

function computeConfidenceBreakdown(
  dominant: LivePattern | null,
  consensus: MTFConsensus,
  health: MarketHealthIndicators,
  volRegime: VolatilityRegime
): ConfidenceBreakdown {
  const pattern = dominant ? dominant.confidence : 0.4;
  const mtf = consensus.alignmentScore;
  const healthScore = health.healthScore;
  const vol = volRegime.score;
  const orderflow = clamp01((health.orderflow.value + 1) / 2);
  const trend = clamp01(health.adx.value / 50);

  const sum = pattern + mtf + healthScore + vol + orderflow + trend || 1;

  return {
    pattern: pattern / sum,
    mtf: mtf / sum,
    health: healthScore / sum,
    vol: vol / sum,
    orderflow: orderflow / sum,
    trend: trend / sum
  };
}

function computeNarrative(params: {
  symbol: string;
  consensus: MTFConsensus;
  volRegime: VolatilityRegime;
  forecast: PatternForecast;
  riskModel: RiskModel;
  sequence: PatternSequenceInfo;
  dominant: LivePattern | null;
  health: MarketHealthIndicators;
}): string[] {
  const {
    symbol,
    consensus,
    volRegime,
    forecast,
    riskModel,
    sequence,
    dominant,
    health
  } = params;

  const lines: string[] = [];

  lines.push(
    `Fusion view for ${symbol}: trend consensus is ${consensus.trendConsensus} with ${(consensus.alignmentScore * 100).toFixed(
      0
    )}% alignment across timeframes.`
  );

  lines.push(
    `Volatility regime is ${volRegime.regime} (score ${(volRegime.score * 100).toFixed(
      0
    )}%), with compression consensus at ${(consensus.compressionConsensus * 100).toFixed(
      0
    )}%.`
  );

  lines.push(
    `Forecast bias is ${forecast.direction} with ${(forecast.confidence * 100).toFixed(
      0
    )}% confidence, expecting ~${(forecast.expectedMovePct * 100).toFixed(
      1
    )}% move over ${forecast.expectedBarsMin}-${forecast.expectedBarsMax} bars.`
  );

  if (dominant) {
    lines.push(
      `Dominant pattern: ${dominant.name} (${dominant.category}, ${dominant.type}), confidence ${(dominant.confidence * 100).toFixed(
        0
      )}%, completeness ${(dominant.completeness * 100).toFixed(0)}%.`
    );
  }

  lines.push(
    `Market health grade: ${health.healthGrade} (score ${(health.healthScore * 100).toFixed(
      0
    )}%).`
  );

  if (sequence.classification) {
    lines.push(
      `Recent pattern sequence detected: ${sequence.classification} (score ${(sequence.score * 100).toFixed(
        0
      )}%).`
    );
  }

  if (riskModel.riskIndex > 0.6) {
    lines.push(
      `Risk is elevated (risk index ${(riskModel.riskIndex * 100).toFixed(
        0
      )}%, failure probability ${(riskModel.failureProb * 100).toFixed(0)}%).`
    );
  } else {
    lines.push(
      `Risk is moderate (risk index ${(riskModel.riskIndex * 100).toFixed(
        0
      )}%, failure probability ${(riskModel.failureProb * 100).toFixed(0)}%).`
    );
  }

  if (riskModel.factors.length) {
    lines.push(`Key risk factors: ${riskModel.factors.join('; ')}.`);
  }

  return lines;
}

function computeMonsterGate(
  dominant: LivePattern | null,
  consensus: MTFConsensus,
  forecast: PatternForecast,
  riskModel: RiskModel
): number {
  if (!dominant) return 0;
  if (dominant.confidence < 0.7 || dominant.completeness < 0.5) return 0;

  const raw =
    dominant.confidence * dominant.completeness * 0.5 +
    consensus.alignmentScore * 0.2 +
    forecast.confidence * 0.2 +
    (1 - riskModel.riskIndex) * 0.1;

  return clamp01(raw);
}

function computeOTMBias(
  directional: DirectionalProbabilities,
  forecast: PatternForecast
): 'calls' | 'puts' | 'none' {
  if (forecast.confidence < 0.6) return 'none';
  if (directional.up > directional.down && directional.up > directional.chop) return 'calls';
  if (directional.down > directional.up && directional.down > directional.chop) return 'puts';
  return 'none';
}

// =============== PUBLIC FUSION ENTRYPOINT ===============

export interface FusionInput {
  symbol: string;
  ohlcByTF: Partial<Record<Timeframe, OHLC[]>>;
  patternsByTF: Partial<Record<Timeframe, PatternResult[]>>;
  marketHealth: MarketHealthIndicators;
  lastPrice?: number;
}

export function computeFusionSnapshot(input: FusionInput): FusionSnapshot {
  const { symbol, ohlcByTF, patternsByTF, marketHealth, lastPrice } = input;

  const orderedTFs: Timeframe[] = ['5m', '15m', '30m', '1h', '4h', '1D'];

  const timeframes: TimeframePatternIntel[] = orderedTFs
    .filter(tf => ohlcByTF[tf] && ohlcByTF[tf]!.length > 0)
    .map(tf =>
      computeTFIntel(
        tf,
        ohlcByTF[tf]!,
        patternsByTF[tf] ?? []
      )
    );

  const mtfConsensus = computeMTFConsensus(timeframes);
  const volRegime = computeVolatilityRegime(mtfConsensus, marketHealth);
  const dominant = pickDominantPattern(timeframes);
  const sequence = computeSequenceInfo(timeframes);
  const forecast = buildForecast(mtfConsensus, dominant, marketHealth, volRegime, symbol);

  const findDominantTF = (): Timeframe => {
    const tfWeight: Record<Timeframe, number> = { '5m': 1, '15m': 2, '30m': 3, '1h': 4, '4h': 5, '1D': 6 };
    let bestTF: Timeframe = '15m';
    let bestScore = -1;
    for (const tfInfo of timeframes) {
      if (tfInfo.primary) {
        const score = tfInfo.primary.confidence * tfWeight[tfInfo.timeframe];
        if (score > bestScore) {
          bestScore = score;
          bestTF = tfInfo.timeframe;
        }
      }
    }
    return bestTF;
  };
  const dominantTF: Timeframe = findDominantTF();
  const ohlcForBreakout = ohlcByTF[dominantTF] ?? [];
  const primaryOhlc = ohlcByTF['15m'] ?? ohlcByTF['5m'] ?? ohlcByTF['1h'] ?? [];
  const currentPrice = lastPrice ?? primaryOhlc[primaryOhlc.length - 1]?.close ?? 0;

  const priorSessionOhlc = ohlcByTF['1D'] ?? ohlcByTF['4h'] ?? [];
  const corvonaLevels = computeCorvonaLevels(priorSessionOhlc) || undefined;

  const emaTrend = computeEMACloudTrend(primaryOhlc, '15m') || undefined;

  // MTF Reversal: Look for Hammer/Shooting Star on 30m and confirm with 5m patterns
  const ohlc30m = ohlcByTF['30m'] ?? [];
  const ohlc5m = ohlcByTF['5m'] ?? [];
  const mtfReversal = computeMTFReversal({
    ohlc30m,
    ohlc5m,
    currentPrice
  });
  
  // Log MTF reversal if detected
  if (mtfReversal.hasReversal) {
    console.log(`[FUSION-MTF] ${symbol} ${mtfReversal.direction.toUpperCase()} reversal: ${mtfReversal.pattern30m} | 5m: ${mtfReversal.patterns5m.join(', ')} | Conf: ${mtfReversal.confidence}%`);
  }

  const rawBreakoutZones = computeBreakoutZones({
    ohlc: ohlcForBreakout,
    compressionScore: mtfConsensus.compressionConsensus,
    symbol,
    dominantTF,
    lastPrice
  });

  const baseBreakoutZones = corvonaLevels 
    ? corvonaToBreakoutZones(corvonaLevels)
    : rawBreakoutZones;

  const breakoutZones = governBreakoutZones({
    breakoutZones: baseBreakoutZones,
    currentPrice,
    mtfConsensus,
    volatilityRegime: volRegime,
    marketHealth
  });

  const breakoutLifecycle = computeBreakoutLifecycle(
    currentPrice,
    breakoutZones,
    false
  );

  const directionalProbabilities = computeDirectionalProbabilities({
    symbol,
    currentPrice,
    recentOHLC: primaryOhlc,
    mtfConsensus,
    volatilityRegime: volRegime,
    marketHealth,
    breakoutLifecycle
  });

  const expectedMove = computeExpectedMove(forecast, lastPrice);
  const riskModel = computeRiskModel(mtfConsensus, forecast, volRegime, marketHealth);
  const confidenceBreakdown = computeConfidenceBreakdown(
    dominant,
    mtfConsensus,
    marketHealth,
    volRegime
  );
  const narrative = computeNarrative({
    symbol,
    consensus: mtfConsensus,
    volRegime,
    forecast,
    riskModel,
    sequence,
    dominant,
    health: marketHealth
  });
  const monsterGate = computeMonsterGate(dominant, mtfConsensus, forecast, riskModel);
  const otmBias = computeOTMBias(directionalProbabilities, forecast);

  // =============== FUSION V3 GATING COMPUTATIONS ===============

  const exhaustionCluster = computeExhaustionCluster(marketHealth, primaryOhlc);

  const compressionCluster = computeCompressionCluster(marketHealth, primaryOhlc, mtfConsensus);
  
  const monsterGateDecision = computeMonsterGateDecision(
    monsterGate,
    otmBias,
    forecast.direction,
    riskModel.riskIndex
  );
  
  const gatingState = computeGatingState({
    symbol,
    mtfConsensus,
    forecast,
    directionalProbs: directionalProbabilities,
    riskModel,
    monsterGateDecision,
    exhaustionCluster,
    compressionCluster,
    breakoutLifecycle,
    recentOHLC: primaryOhlc,
    emaTrend
  });
  
  const cappedVolRegime = applyRegimeCap(volRegime, gatingState.regimeCap);
  
  const gatedNarrative = [...narrative];
  if (gatingState.reasons.length > 0) {
    gatedNarrative.push(`Gating: ${gatingState.reasons.join('; ')}`);
  }
  if (gatingState.directionalBias !== gatingState.originalBias) {
    gatedNarrative.push(`Bias adjusted from ${gatingState.originalBias} to ${gatingState.directionalBias} due to gating rules.`);
  }

  // ---- Divergence detection ----
  const divergenceOhlc = ohlcByTF['5m'] ?? primaryOhlc;
  const divergence = computeDivergenceFromOHLC(divergenceOhlc, currentPrice, marketHealth);

  // ---- Reversal detection + full Fusion gating ----
  // CRITICAL: Use 5m OHLC for bounce detection - 15m is too slow to catch momentum reversals
  const reversalOhlc = ohlcByTF['5m'] ?? ohlcByTF['15m'] ?? primaryOhlc;
  
  const reversalSignal = computeReversalSignal({
    ohlc: reversalOhlc,
    currentPrice,
    corvona: corvonaLevels,
    emaTrend,
    breakoutLifecycle
  });

  let gatedReversalAlert: GatedReversalAlert | undefined;

  if (reversalSignal) {
    // Build full PatternFusionState with complete Fusion objects
    const patternFusionState: PatternFusionState = {
      mtfConsensus,
      emaTrend,
      volatilityRegime: cappedVolRegime,
      marketHealth,
      breakoutLifecycle,
      riskModel,
      monsterGateDecision,
      gatingState
    };

    // Call fusionReversalAlert with new API
    const rawAlert = fusionReversalAlert({
      reversalSignal,
      fusionState: patternFusionState
    });

    // Map to GatedReversalAlert
    gatedReversalAlert = {
      alert: rawAlert.alert,
      direction: rawAlert.direction,
      score: rawAlert.score,
      patterns: rawAlert.patterns,
      gated: rawAlert.gated,
      gatingReasons: rawAlert.gatingReasons,
      mtfAligned: rawAlert.mtfAligned,
      trendStrength: rawAlert.trendStrength,
      volatilityFavorable: rawAlert.volatilityFavorable
    };

    // Log reversal alert if triggered
    if (rawAlert.alert) {
      console.log(`[FUSION] Reversal Alert: ${rawAlert.direction.toUpperCase()} @ ${rawAlert.score}% | Gated: ${rawAlert.gated} | Reasons: ${rawAlert.gatingReasons.join(', ') || 'None'}`);
    }
  }

  logFusionAudit({
    timestamp: Date.now(),
    symbol,
    currentPrice,
    mtfAlignment: mtfConsensus.alignmentScore,
    forecastConfidence: forecast.confidence,
    directionalProbUp: directionalProbabilities.up,
    directionalProbChop: directionalProbabilities.chop,
    directionalProbDown: directionalProbabilities.down,
    tfStack: `${mtfConsensus.bullishStack}/${mtfConsensus.neutralStack}/${mtfConsensus.bearishStack}`,
    metaSignalState: gatingState.metaAllowed ? 'ACTIVE' : 'INACTIVE',
    metaReason: gatingState.reasons[0] || 'None',
    tacticalBias: gatingState.directionalBias,
    regimeLabel: cappedVolRegime.regime.toUpperCase(),
    riskModelScore: riskModel.riskIndex,
    monsterGateValue: monsterGate,
    monsterGateDirection: monsterGateDecision.direction,
    exhaustionCluster: exhaustionCluster.active,
    compressionCluster: compressionCluster.active,
    marketHealthScore: marketHealth.healthScore,
    bbSqueezeActive: compressionCluster.bbSqueezeActive,
    keltnerBreakoutSide: compressionCluster.keltnerBreakoutSide,
    breakoutUpper: breakoutZones.upper,
    breakoutLower: breakoutZones.lower,
    entryZoneLow: breakoutLifecycle.zoneLow,
    entryZoneHigh: breakoutLifecycle.zoneHigh,
    breakoutLifecycleState: breakoutLifecycle.state
  });

  // Build snapshot for unified signal computation
  const snapshotForUnified = {
    timestamp: Date.now(),
    symbol,
    timeframes,
    mtfConsensus,
    marketHealth,
    forecast,
    directionalProbabilities,
    expectedMove,
    breakoutZones,
    volatilityRegime: cappedVolRegime,
    sequence,
    riskModel,
    confidenceBreakdown,
    narrative: gatedNarrative,
    monsterGate,
    otmBias,
    gatingState,
    breakoutLifecycle,
    exhaustionCluster,
    compressionCluster,
    monsterGateDecision,
    emaTrend,
    corvonaLevels,
    reversalSignal,
    gatedReversalAlert,
    mtfReversal,
    divergence
  };

  // Compute unified signal - let it generate 0DTE-appropriate levels internally
  // Entry zone ±0.15%, stop loss ~0.25%, targets ~0.2%/0.4% for 0DTE execution
  // Pass 5m OHLC for Price Action Safety layer (most responsive to live price movement)
  const safetyOhlc = ohlcByTF['5m'] ?? ohlcByTF['15m'] ?? primaryOhlc;
  const unifiedSignal = computeUnifiedSignal({
    snapshot: snapshotForUnified,
    currentPrice,
    recentOhlc: safetyOhlc
  });

  return {
    ...snapshotForUnified,
    unifiedSignal
  };
}
