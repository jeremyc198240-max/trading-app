import { FEATURE_COUNT, FEATURE_NAMES, MLRawInput, NormalizationParams, Regime, RegimeNormalizationMap } from '../schema';

export function safeNum(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function clamp(value: number, min = 0, max = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function sigmoid(score: number): number {
  if (score > 35) return 1;
  if (score < -35) return 0;
  return 1 / (1 + Math.exp(-score));
}

export function softmax(scores: number[]): number[] {
  const max = Math.max(...scores);
  const exps = scores.map((score) => Math.exp(score - max));
  const sum = exps.reduce((acc, value) => acc + value, 0) || 1;
  return exps.map((value) => value / sum);
}

export function computePatternAgreementScore(input: MLRawInput): number {
  const roundedBottom = input.roundedBottom ? 1 : 0;
  const doubleBottom = input.doubleBottom ? 1 : 0;
  const bullishBOS = input.bullishBOS ? 1 : 0;
  const bearishBOS = input.bearishBOS ? 1 : 0;
  const failedReclaim = input.failedReclaim ? 1 : 0;

  return (
    0.12 * roundedBottom +
    0.08 * doubleBottom +
    0.15 * bullishBOS +
    -0.15 * bearishBOS +
    -0.2 * failedReclaim
  );
}

export function computeBaseFeatures(input: MLRawInput): number[] {
  const breakoutNorm = clamp(safeNum(input.breakoutScore) / 100);
  const edgeNorm = clamp(safeNum(input.edgeScore) / 100);
  const confidenceNorm = clamp(safeNum(input.confidence) / 100);
  const triggerNorm = clamp(safeNum(input.triggerProbability) / 100);
  const momentumNorm = clamp(Math.abs(safeNum(input.momentum)) / 100);
  const bbTight = clamp(1 - clamp(safeNum(input.bbWidth) / 2.5));
  const rangeTight = clamp(1 - clamp(safeNum(input.rangePct) / 1.2));
  const atrTight = clamp(1 - clamp(safeNum(input.atrPercent) / 1.5));

  const phase = String(input.phase ?? '').toUpperCase();
  const phaseNow = phase === 'NOW' ? 1 : 0;
  const phaseReady = phase === 'READY' ? 1 : 0;
  const phasePrepare = phase === 'PREPARE' ? 1 : 0;

  const modeRaw = String(input.mode ?? '').toUpperCase();
  const modeScalar = modeRaw === 'EXECUTE' ? 1 : modeRaw === 'PREPARE' ? 0.6 : 0;

  const deltaNorm = clamp(Math.abs(safeNum(input.otmDelta)) / 0.45);

  const qualityFusion = Math.pow(
    Math.max(0.001, breakoutNorm * edgeNorm * confidenceNorm * triggerNorm),
    0.25,
  );
  const structureFusion = (bbTight + rangeTight + atrTight) / 3;
  const momentumTriggerFusion = clamp(Math.sqrt(Math.max(0, momentumNorm * triggerNorm)));
  const deltaLaneScore = clamp(1 - Math.abs((Math.abs(safeNum(input.otmDelta)) - 0.23) / 0.16));

  return [
    breakoutNorm,
    edgeNorm,
    confidenceNorm,
    triggerNorm,
    momentumNorm,
    bbTight,
    rangeTight,
    atrTight,
    phaseNow,
    phaseReady,
    phasePrepare,
    modeScalar,
    deltaNorm,
    qualityFusion,
    structureFusion,
    momentumTriggerFusion,
    deltaLaneScore,
  ];
}

export function computeExtendedFeatures(input: MLRawInput): number[] {
  const momentumExpansion = safeNum(input.momentum) * (1 + clamp(Math.abs(safeNum(input.adx)) / 100));
  const macdHistogramSlope = safeNum(input.macdHistogram) * (String(input.macdTrend ?? '').toLowerCase() === 'bearish' ? -1 : 1);
  const rsiSlope = safeNum(input.rsi) - safeNum(input.tvRsi);
  const volumeSlope20 = clamp(safeNum(input.volumeRatio) - 1) + (safeNum(input.volumeSpike) > 0 ? 0.08 : 0);
  const priceAcceleration = safeNum(input.priceAcceleration);
  const bollingerBandwidthExpansion = clamp(safeNum(input.bbWidth) * 2);
  const triggerLevel = clamp(safeNum(input.triggerProbability) / 100);

  let breakoutBodyPct = 0.5;
  if (
    typeof input.candleOpen === 'number' &&
    typeof input.candleClose === 'number' &&
    typeof input.candleHigh === 'number' &&
    typeof input.candleLow === 'number'
  ) {
    const body = Math.abs(input.candleClose - input.candleOpen);
    const range = Math.max(0.0001, input.candleHigh - input.candleLow);
    breakoutBodyPct = clamp(body / range);
  }

  const distanceFromVWAP = clamp(safeNum(input.vwapDistance) * 20, -1, 1);
  const liquiditySweepFlag = input.liquiditySweep ? 1 : clamp((safeNum(input.volumeSpike) - 1) / 4, 0, 1);
  const impulseVectorSlope = safeNum(input.impulseVector) * 0.2 + clamp(safeNum(input.momentum) / 120);
  const microTrendAcceleration = safeNum(input.microTrend) * 0.2 + clamp(safeNum(input.momentum) / 200);
  const patternScore = computePatternAgreementScore(input);

  return [
    momentumExpansion,
    macdHistogramSlope,
    rsiSlope,
    volumeSlope20,
    priceAcceleration,
    bollingerBandwidthExpansion,
    triggerLevel,
    breakoutBodyPct,
    distanceFromVWAP,
    liquiditySweepFlag,
    impulseVectorSlope,
    microTrendAcceleration,
    patternScore,
  ];
}

export function buildRawFeatureVector(input: MLRawInput): number[] {
  const raw = [...computeBaseFeatures(input), ...computeExtendedFeatures(input)];
  if (raw.length !== FEATURE_COUNT) {
    throw new Error(`BuildRawFeatureVector returned ${raw.length} features, expected ${FEATURE_COUNT}`);
  }
  return raw;
}

export function regimeFromInput(input: MLRawInput): Regime {
  const adx = safeNum(input.adx);
  const squeeze = String(input.macdTrend ?? '').toLowerCase() === 'neutral';
  if (adx < 18 || squeeze) return 'low';
  if (adx > 30) return 'high';
  return 'chop';
}

export function buildRegimeClassifierFeatures(input: MLRawInput): number[] {
  return buildRawFeatureVector(input);
}

export function calculateNormalizationParams(rows: number[][]): NormalizationParams {
  const featureCount = FEATURE_COUNT;
  const mean = new Array(featureCount).fill(0);
  const std = new Array(featureCount).fill(0);
  const count = rows.length || 1;

  for (const row of rows) {
    for (let i = 0; i < featureCount; i += 1) {
      mean[i] += row[i] ?? 0;
    }
  }
  for (let i = 0; i < featureCount; i += 1) {
    mean[i] /= count;
  }

  for (const row of rows) {
    for (let i = 0; i < featureCount; i += 1) {
      const delta = (row[i] ?? 0) - mean[i];
      std[i] += delta * delta;
    }
  }
  for (let i = 0; i < featureCount; i += 1) {
    std[i] = Math.sqrt(std[i] / count) || 1;
  }

  return { mean, std };
}

export function normalizeFeatureVector(
  rawFeatures: number[],
  regime: Regime,
  normalization: RegimeNormalizationMap,
): number[] {
  const params = normalization[regime];
  if (!params) {
    throw new Error(`Unknown regime ${regime} for normalization`);
  }
  return rawFeatures.map((value, index) => (value - params.mean[index]) / params.std[index]);
}

export function normalizeGlobalFeatureVector(rawFeatures: number[], normalization: RegimeNormalizationMap): number[] {
  return rawFeatures.map((value, index) => (value - normalization.global.mean[index]) / normalization.global.std[index]);
}

export function computeFreshness(ageMs: number | undefined, tauMs = 2 * 60 * 60 * 1000): number {
  const t = Math.max(0, ageMs ?? 0);
  return Math.exp(-t / tauMs);
}

export function softmaxVector(scores: number[]): number[] {
  return softmax(scores);
}

export function zeroVector(length: number): number[] {
  return new Array(length).fill(0);
}

export const FEATURE_NAME_LIST = FEATURE_NAMES;
