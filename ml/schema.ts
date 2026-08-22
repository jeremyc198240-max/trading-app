export type Regime = 'low' | 'high' | 'chop';

export interface PatternFlags {
  roundedBottom?: boolean;
  doubleBottom?: boolean;
  bullishBOS?: boolean;
  bearishBOS?: boolean;
  failedReclaim?: boolean;
}

export interface MLRawInput {
  symbol?: string;
  timeframe?: string;
  timestamp?: number;
  breakoutScore?: number;
  edgeScore?: number;
  confidence?: number;
  triggerProbability?: number;
  momentum?: number;
  bbWidth?: number;
  rangePct?: number;
  atrPercent?: number;
  phase?: string;
  mode?: string;
  directionalBias?: number | string;
  leadMinutes?: number;
  edgeSignal?: string;
  edgeState?: string;
  otmDelta?: number;
  macdHistogram?: number;
  macdTrend?: string;
  rsi?: number;
  tvRsi?: number;
  volumeSpike?: number;
  volumeRatio?: number;
  vwapDistance?: number;
  priceVelocity?: number;
  priceAcceleration?: number;
  candleOpen?: number;
  candleHigh?: number;
  candleLow?: number;
  candleClose?: number;
  roundedBottom?: boolean;
  doubleBottom?: boolean;
  bullishBOS?: boolean;
  bearishBOS?: boolean;
  failedReclaim?: boolean;
  liquiditySweep?: boolean;
  impulseVector?: number;
  microTrend?: number;
  adx?: number;
  regimeFilter?: number;
}

export interface MLInferencePayload extends MLRawInput {
  ageMs?: number;
}

export interface RegimeProbabilities {
  low: number;
  high: number;
  chop: number;
}

export interface MLInferenceResult {
  prediction: number;
  confidence: number;
  regime_probs: RegimeProbabilities;
  pattern_score: number;
  freshness: number;
  calibrated_confidence: number;
  stable_confidence: number;
  rawFeatures: number[];
  normalizedFeatures?: number[];
}

export interface ModelWeights {
  weights: number[];
  bias: number;
  calibrationAlpha: number;
  priorPositiveRate: number;
  thresholds?: {
    prepare: number;
    enter: number;
  };
  stats?: Record<string, unknown>;
}

export interface RegimeClassifierWeights {
  weights: number[][];
  biases: number[];
  featureNames: string[];
}

export interface NormalizationParams {
  mean: number[];
  std: number[];
}

export interface RegimeNormalizationMap {
  global: NormalizationParams;
  low: NormalizationParams;
  high: NormalizationParams;
  chop: NormalizationParams;
}

export interface CalibrationConfig {
  freshnessTauMs: number;
  ensembleCalibrationAlpha: number;
  ensembleCalibrationPrior: number;
}

export const BASE_FEATURE_NAMES = [
  'breakoutNorm',
  'edgeNorm',
  'confidenceNorm',
  'triggerNorm',
  'momentumNorm',
  'bbTight',
  'rangeTight',
  'atrTight',
  'phaseNow',
  'phaseReady',
  'phasePrepare',
  'modeScalar',
  'directionalBiasScalar',
  'deltaNorm',
  'qualityFusion',
  'structureFusion',
  'momentumTriggerFusion',
  'deltaLaneScore',
];

export const NEW_FEATURE_NAMES = [
  'momentumExpansion',
  'macdHistogramSlope',
  'rsiSlope',
  'volumeSlope20',
  'priceAcceleration',
  'bollingerBandwidthExpansion',
  'triggerLevel',
  'breakoutBodyPct',
  'distanceFromVWAP',
  'liquiditySweepFlag',
  'impulseVectorSlope',
  'microTrendAcceleration',
  'leadTimeBias',
  'edgeStateScore',
  'edgeSignalScore',
  'patternScore',
];

export const FEATURE_NAMES = [...BASE_FEATURE_NAMES, ...NEW_FEATURE_NAMES];
export const FEATURE_COUNT = FEATURE_NAMES.length;
