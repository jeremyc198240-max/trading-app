import fs from 'fs';
import path from 'path';
import {
  buildRawFeatureVector,
  calculateNormalizationParams,
  normalizeFeatureVector,
  normalizeGlobalFeatureVector,
  regimeFromInput,
  safeNum,
  sigmoid,
} from '../features/featureEngineering';
import {
  FEATURE_COUNT,
  MLRawInput,
  ModelWeights,
  Regime,
  RegimeClassifierWeights,
  RegimeNormalizationMap,
  CalibrationConfig,
} from '../schema';

interface TrainingRow {
  x: number[];
  y: number;
  regime: Regime;
  weight: number;
  timestamp: number;
}

interface EdgeEngineSample {
  timestamp?: number;
  symbol?: string;
  timeframe?: string;
  breakoutScore?: number;
  edgeEngine?: {
    signal?: string;
    direction?: string;
    state?: string;
    edgeScore?: number;
    confidence?: number;
    triggerProbability?: number;
    indicators?: Record<string, unknown>;
  };
}

const WEIGHTS_DIR = path.resolve(process.cwd(), 'ml', 'weights');
const LOGS_DIR = path.resolve(process.cwd(), 'logs');
const TRAIN_FILE = path.join(WEIGHTS_DIR, 'training_manifest.json');

function ensureWeightsDir() {
  if (!fs.existsSync(WEIGHTS_DIR)) {
    fs.mkdirSync(WEIGHTS_DIR, { recursive: true });
  }
}

function loadLogArray(fileName: string): any[] {
  const filePath = path.join(LOGS_DIR, fileName);
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const raw = fs.readFileSync(filePath, 'utf8').trim();
  if (!raw) return [];
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function labelSample(sample: EdgeEngineSample): number | null {
  const state = String(sample.edgeEngine?.state ?? '').toUpperCase();
  const conf = safeNum(sample.edgeEngine?.confidence);
  const trig = safeNum(sample.edgeEngine?.triggerProbability);
  const edgeScore = safeNum(sample.edgeEngine?.edgeScore);
  const breakoutScore = safeNum(sample.breakoutScore);

  const strongPositive =
    ['PRIMED', 'ARMED', 'TRIGGERED'].includes(state) && conf >= 70 && trig >= 65;
  const strongNegative =
    ['STANDBY', 'IDLE', 'PENDING', 'DISARMED'].includes(state) && conf <= 50 && trig <= 40;

  if (strongPositive) return 1;
  if (strongNegative) return 0;
  if (edgeScore >= 84 && conf >= 78 && trig >= 70 && breakoutScore >= 40) return 1;
  if (edgeScore <= 36 && conf <= 52 && trig <= 35) return 0;
  return null;
}

function buildSampleInput(sample: EdgeEngineSample): MLRawInput {
  const indicators = sample.edgeEngine?.indicators ?? {};
  return {
    breakoutScore: sample.breakoutScore,
    edgeScore: safeNum(sample.edgeEngine?.edgeScore),
    confidence: safeNum(sample.edgeEngine?.confidence),
    triggerProbability: safeNum(sample.edgeEngine?.triggerProbability),
    momentum: safeNum(indicators.momentum),
    bbWidth: safeNum(indicators.bbWidth),
    rangePct: safeNum(indicators.rangePct),
    atrPercent: safeNum(indicators.atrPercent),
    phase: String(sample.edgeEngine?.state ?? ''),
    mode: String(sample.edgeEngine?.signal ?? ''),
    directionalBias: String(sample.edgeEngine?.direction ?? ''),
    otmDelta: safeNum(indicators.otmDelta),
    macdHistogram: safeNum(indicators.macdHistogram),
    macdTrend: String(indicators.macdTrend ?? ''),
    rsi: safeNum(indicators.rsi),
    tvRsi: safeNum(indicators.tvRsi),
    volumeSpike: safeNum(indicators.volumeSpike),
    volumeRatio: safeNum(indicators.volumeRatio),
    vwapDistance: safeNum(indicators.vwapDistance),
    priceAcceleration: safeNum(indicators.priceAcceleration),
    roundedBottom: false,
    doubleBottom: false,
    bullishBOS: false,
    bearishBOS: false,
    failedReclaim: false,
    liquiditySweep: false,
    impulseVector: safeNum(indicators.momentum),
    microTrend: safeNum(indicators.momentum),
    adx: safeNum(indicators.adx),
  };
}

function regimeLabel(input: MLRawInput): Regime {
  return regimeFromInput(input);
}

function dot(a: number[], b: number[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) {
    total += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return total;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function trainLogistic(rows: TrainingRow[], lr = 0.01, l2 = 0.001, epochs = 200): { weights: number[]; bias: number } {
  const weights = new Array(FEATURE_COUNT).fill(0);
  let bias = 0;
  if (rows.length < 10) return { weights, bias };

  const posCount = rows.reduce((sum, row) => sum + (row.y === 1 ? 1 : 0), 0);
  const negCount = Math.max(1, rows.length - posCount);
  const posClassWeight = rows.length / (2 * Math.max(1, posCount));
  const negClassWeight = rows.length / (2 * negCount);

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    const batch = shuffle(rows);
    for (const row of batch) {
      const score = dot(weights, row.x) + bias;
      const pred = sigmoid(score);
      const classWeight = row.y === 1 ? posClassWeight : negClassWeight;
      const error = (pred - row.y) * row.weight * classWeight;
      for (let j = 0; j < FEATURE_COUNT; j += 1) {
        weights[j] -= lr * (error * row.x[j] + l2 * weights[j]);
      }
      bias -= lr * error;
    }
  }

  return { weights, bias };
}

function scoreRows(model: { weights: number[]; bias: number }, rows: TrainingRow[]): number[] {
  return rows.map((row) => sigmoid(dot(model.weights, row.x) + model.bias));
}

function brierScore(predictions: number[], truth: number[]): number {
  const n = predictions.length || 1;
  let total = 0;
  for (let i = 0; i < n; i += 1) {
    const diff = predictions[i] - truth[i];
    total += diff * diff;
  }
  return total / n;
}

function selectCalibrationAlpha(predictions: number[], truth: number[], prior: number): number {
  const candidates = [0, 0.2, 0.4, 0.6, 0.8, 1];
  let bestAlpha = 1;
  let bestScore = Infinity;
  for (const alpha of candidates) {
    const calibrated = predictions.map((p) => clamp(p * alpha + prior * (1 - alpha)));
    const score = brierScore(calibrated, truth);
    if (score < bestScore) {
      bestScore = score;
      bestAlpha = alpha;
    }
  }
  return bestAlpha;
}

function calibrateModel(model: { weights: number[]; bias: number }, rows: TrainingRow[]): { calibrationAlpha: number; priorPositiveRate: number } {
  const predictions = scoreRows(model, rows);
  const truth = rows.map((row) => row.y);
  const prior = truth.reduce((sum, value) => sum + value, 0) / Math.max(1, truth.length);
  const alpha = selectCalibrationAlpha(predictions, truth, prior);
  return { calibrationAlpha: alpha, priorPositiveRate: prior };
}

function buildRegimeClassifier(rows: TrainingRow[]): RegimeClassifierWeights {
  const regimes: Regime[] = ['low', 'high', 'chop'];
  const weights: number[][] = [];
  const biases: number[] = [];

  for (const regime of regimes) {
    const binaryRows = rows.map((row) => ({ ...row, y: row.regime === regime ? 1 : 0 }));
    const model = trainLogistic(binaryRows, 0.012, 0.002, 120);
    weights.push(model.weights);
    biases.push(model.bias);
  }

  return {
    weights,
    biases,
    featureNames: [],
  };
}

function normalizeRows(rows: TrainingRow[], normalization: RegimeNormalizationMap): TrainingRow[] {
  return rows.map((row) => ({
    ...row,
    x: normalizeFeatureVector(row.x, row.regime, normalization),
  }));
}

function mapNormalizedRows(rows: TrainingRow[], normalization: RegimeNormalizationMap): TrainingRow[] {
  return rows.map((row) => ({
    ...row,
    x: normalizeFeatureVector(row.x, row.regime, normalization),
  }));
}

function writeJson<T>(fileName: string, value: T) {
  fs.writeFileSync(path.join(WEIGHTS_DIR, fileName), JSON.stringify(value, null, 2), 'utf8');
}

function buildRows(): TrainingRow[] {
  const samples = loadLogArray('edge_engine_samples.json');
  const rows: TrainingRow[] = [];

  for (const sample of samples) {
    const input = buildSampleInput(sample);
    const label = labelSample(sample);
    if (label === null) continue;
    const rawFeatures = buildRawFeatureVector(input);
    if (rawFeatures.length !== FEATURE_COUNT) continue;
    rows.push({
      x: rawFeatures,
      y: label,
      regime: regimeLabel(input),
      weight: 1,
      timestamp: Number(sample.timestamp) || Date.now(),
    });
  }

  return rows;
}

function splitRows(rows: TrainingRow[], holdoutFraction = 0.2): { train: TrainingRow[]; holdout: TrainingRow[] } {
  const shuffled = shuffle(rows);
  const holdoutCount = Math.max(1, Math.floor(shuffled.length * holdoutFraction));
  return {
    holdout: shuffled.slice(0, holdoutCount),
    train: shuffled.slice(holdoutCount),
  };
}

function trainModelForRegime(rows: TrainingRow[], regime: Regime): ModelWeights {
  const subset = rows.filter((row) => row.regime === regime);
  if (subset.length < 10) {
    return {
      weights: new Array(FEATURE_COUNT).fill(0),
      bias: 0,
      calibrationAlpha: 1,
      priorPositiveRate: 0.5,
    };
  }
  const split = splitRows(subset, 0.2);
  const model = trainLogistic(split.train, 0.01, 0.0025, 200);
  const calibration = calibrateModel(model, split.holdout);
  return {
    ...model,
    calibrationAlpha: calibration.calibrationAlpha,
    priorPositiveRate: calibration.priorPositiveRate,
    thresholds: { prepare: 0.5, enter: 0.65 },
  };
}

function main() {
  ensureWeightsDir();
  const rows = buildRows();
  if (rows.length < 10) {
    console.error('Not enough labeled training rows found.');
    process.exit(1);
  }

  const normalization: RegimeNormalizationMap = {
    global: calculateNormalizationParams(rows.map((row) => row.x)),
    low: calculateNormalizationParams(rows.filter((row) => row.regime === 'low').map((row) => row.x)),
    high: calculateNormalizationParams(rows.filter((row) => row.regime === 'high').map((row) => row.x)),
    chop: calculateNormalizationParams(rows.filter((row) => row.regime === 'chop').map((row) => row.x)),
  };

  const normalizedRows = rows.map((row) => ({
    ...row,
    x: normalizeFeatureVector(row.x, row.regime, normalization),
  }));

  const regimeClassifier = buildRegimeClassifier(rows.map((row) => ({
    ...row,
    x: normalizeGlobalFeatureVector(row.x, normalization),
  })));

  regimeClassifier.featureNames = [];

  const models: Record<Regime, ModelWeights> = {
    low: trainModelForRegime(normalizedRows, 'low'),
    high: trainModelForRegime(normalizedRows, 'high'),
    chop: trainModelForRegime(normalizedRows, 'chop'),
  };

  const calibrationConfig: CalibrationConfig = {
    freshnessTauMs: 2 * 60 * 60 * 1000,
    ensembleCalibrationAlpha: 1,
    ensembleCalibrationPrior: rows.reduce((sum, row) => sum + row.y, 0) / Math.max(1, rows.length),
  };

  writeJson('normalization.json', normalization);
  writeJson('regime_classifier.json', regimeClassifier);
  writeJson('model_low_vol.json', models.low);
  writeJson('model_high_vol.json', models.high);
  writeJson('model_chop.json', models.chop);
  writeJson('calibration.json', calibrationConfig);
  writeJson('training_manifest.json', {
    createdAt: new Date().toISOString(),
    rowCount: rows.length,
    symbolCount: new Set(rows.map((row) => row.regime)).size,
    regimeCounts: {
      low: rows.filter((row) => row.regime === 'low').length,
      high: rows.filter((row) => row.regime === 'high').length,
      chop: rows.filter((row) => row.regime === 'chop').length,
    },
  });

  console.log('Training complete. Generated model files in ml/weights');
}

main();
