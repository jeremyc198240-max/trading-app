import fs from 'fs';
import path from 'path';
import {
  buildRawFeatureVector,
  clamp,
  computeFreshness,
  normalizeFeatureVector,
  normalizeGlobalFeatureVector,
  softmaxVector,
  sigmoid,
} from '../features/featureEngineering';
import {
  FEATURE_COUNT,
  MLInferencePayload,
  MLInferenceResult,
  ModelWeights,
  RegimeClassifierWeights,
  RegimeNormalizationMap,
  Regime,
  RegimeProbabilities,
  CalibrationConfig,
} from '../schema';

const WEIGHTS_DIR = path.resolve(process.cwd(), 'ml', 'weights');
let cachedModels: Record<Regime, ModelWeights> | null = null;
let cachedClassifier: RegimeClassifierWeights | null = null;
let cachedNormalization: RegimeNormalizationMap | null = null;
let cachedCalibration: CalibrationConfig | null = null;
let prevStableConfidence: number | null = null;

function loadJson<T>(fileName: string): T {
  const filePath = path.join(WEIGHTS_DIR, fileName);
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

function loadAssets() {
  if (!cachedModels) {
    cachedModels = {
      low: loadJson<ModelWeights>('model_low_vol.json'),
      high: loadJson<ModelWeights>('model_high_vol.json'),
      chop: loadJson<ModelWeights>('model_chop.json'),
    };
  }
  if (!cachedClassifier) {
    cachedClassifier = loadJson<RegimeClassifierWeights>('regime_classifier.json');
  }
  if (!cachedNormalization) {
    cachedNormalization = loadJson<RegimeNormalizationMap>('normalization.json');
  }
  if (!cachedCalibration) {
    cachedCalibration = loadJson<CalibrationConfig>('calibration.json');
  }
}

function dot(a: number[], b: number[]): number {
  let total = 0;
  for (let i = 0; i < a.length && i < b.length; i += 1) {
    total += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return total;
}

function scoreModel(model: ModelWeights, features: number[]): number {
  const raw = dot(model.weights, features) + model.bias;
  const probability = sigmoid(raw);
  return clamp(probability * model.calibrationAlpha + model.priorPositiveRate * (1 - model.calibrationAlpha));
}

function computeRegimeProbabilities(rawFeatures: number[]): RegimeProbabilities {
  if (!cachedClassifier || !cachedNormalization) {
    loadAssets();
  }
  const normalized = normalizeGlobalFeatureVector(rawFeatures, cachedNormalization!);
  const scores = cachedClassifier!.weights.map((weights, index) => dot(weights, normalized) + (cachedClassifier!.biases[index] ?? 0));
  const [low, high, chop] = softmaxVector(scores);
  return {
    low: clamp(low),
    high: clamp(high),
    chop: clamp(chop),
  };
}

function scoreRegime(inputRaw: number[], regime: Regime): number {
  if (!cachedModels || !cachedNormalization) {
    loadAssets();
  }
  const model = cachedModels![regime];
  const normalized = normalizeFeatureVector(inputRaw, regime, cachedNormalization!);
  return scoreModel(model, normalized);
}

function applyEnsembleCalibration(probability: number): number {
  if (!cachedCalibration) {
    loadAssets();
  }
  const calibration = cachedCalibration!;
  return clamp(probability * calibration.ensembleCalibrationAlpha + calibration.ensembleCalibrationPrior * (1 - calibration.ensembleCalibrationAlpha));
}

export function inferLivePrediction(input: MLInferencePayload): MLInferenceResult {
  loadAssets();
  const rawFeatures = buildRawFeatureVector(input);
  const regime_probs = computeRegimeProbabilities(rawFeatures);

  const lowProb = scoreRegime(rawFeatures, 'low');
  const highProb = scoreRegime(rawFeatures, 'high');
  const chopProb = scoreRegime(rawFeatures, 'chop');

  const finalPred = clamp(
    regime_probs.low * lowProb +
      regime_probs.high * highProb +
      regime_probs.chop * chopProb,
  );

  const calibrated_confidence = clamp(applyEnsembleCalibration(finalPred));
  const freshness = computeFreshness(input.ageMs, cachedCalibration?.freshnessTauMs);
  const confidence = clamp(calibrated_confidence * freshness);
  const stable_confidence = prevStableConfidence !== null ? clamp(prevStableConfidence * 0.7 + confidence * 0.3) : confidence;
  prevStableConfidence = stable_confidence;

  const pattern_score = (() => {
    const roundedBottom = input.roundedBottom ? 1 : 0;
    const doubleBottom = input.doubleBottom ? 1 : 0;
    const bullishBOS = input.bullishBOS ? 1 : 0;
    const bearishBOS = input.bearishBOS ? 1 : 0;
    const failedReclaim = input.failedReclaim ? 1 : 0;
    return 0.12 * roundedBottom + 0.08 * doubleBottom + 0.15 * bullishBOS - 0.15 * bearishBOS - 0.2 * failedReclaim;
  })();

  return {
    prediction: finalPred,
    confidence,
    regime_probs,
    pattern_score,
    freshness,
    calibrated_confidence,
    stable_confidence,
    rawFeatures,
  };
}

export function resetStablePrediction(): void {
  prevStableConfidence = null;
}
