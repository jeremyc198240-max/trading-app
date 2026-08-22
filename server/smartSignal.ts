import {
  getSignalHistory,
  isCompletedOutcome,
  isWinOutcome,
  type SignalSnapshot,
} from "./signalHistory";

export type SmartSignalDirection = "CALL" | "PUT" | "WAIT";
export type SmartSignalStatus = "READY" | "LEARNING" | "COLD_START";

export interface SmartSignalInput {
  direction: SmartSignalDirection;
  confidence: number;
  mtfAlignment: number;
  forecastConfidence: number;
  riskScore: number;
  gatingScore: number;
  directionalProbabilities: { up: number; down: number; chop: number };
  monsterValue: number;
}

export interface SmartSignalSideScore {
  direction: Exclude<SmartSignalDirection, "WAIT">;
  probability: number;
  historicalWinRate: number | null;
  modelProbability: number;
  sampleSize: number;
  reliability: number;
  averageSimilarity: number;
}

export interface SmartSignalResult {
  direction: SmartSignalDirection;
  probability: number;
  confidence: number;
  historicalWinRate: number | null;
  sampleSize: number;
  reliability: number;
  status: SmartSignalStatus;
  agreement: boolean;
  sides: { call: SmartSignalSideScore; put: SmartSignalSideScore };
  reasons: string[];
  trainedAt: number;
}

const FEATURE_WEIGHTS = [0.18, 0.13, 0.12, 0.12, 0.15, 0.16, 0.07, 0.07] as const;
const MAX_NEIGHBORS = 40;
const PRIOR_WEIGHT = 4;
const HISTORICAL_BLEND_MAX = 0.38;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function toPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return clamp(Math.abs(value) <= 1 ? value * 100 : value, 0, 100);
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function directionalProbability(
  probabilities: { up: number; down: number; chop: number },
  direction: "CALL" | "PUT",
): number {
  return toPercent(direction === "CALL" ? probabilities.up : probabilities.down);
}

function featureVector(
  input: SmartSignalInput,
  direction: "CALL" | "PUT",
): number[] {
  return [
    toPercent(input.confidence),
    toPercent(input.mtfAlignment),
    toPercent(input.forecastConfidence),
    toPercent(input.riskScore),
    toPercent(input.gatingScore),
    directionalProbability(input.directionalProbabilities, direction),
    toPercent(input.directionalProbabilities.chop),
    toPercent(input.monsterValue),
  ];
}

function historyFeatureVector(signal: SignalSnapshot): number[] {
  const direction = signal.direction === "PUT" ? "PUT" : "CALL";
  return [
    toPercent(signal.confidence),
    toPercent(signal.mtfAlignment),
    toPercent(signal.forecastConfidence),
    toPercent(signal.riskScore),
    toPercent(signal.gatingScore),
    directionalProbability(signal.directionalProbs, direction),
    toPercent(signal.directionalProbs.chop),
    toPercent(signal.monsterValue),
  ];
}

function similarity(left: number[], right: number[]): number {
  const distance = FEATURE_WEIGHTS.reduce((sum, weight, index) => (
    sum + weight * Math.abs(left[index] - right[index]) / 100
  ), 0);
  return Math.exp(-3 * distance);
}

function scoreSide(
  history: SignalSnapshot[],
  input: SmartSignalInput,
  direction: "CALL" | "PUT",
): SmartSignalSideScore {
  const currentFeatures = featureVector(input, direction);
  const neighbors = history
    .filter((signal) => signal.direction === direction && isCompletedOutcome(signal.outcome))
    .map((signal) => ({ signal, similarity: similarity(currentFeatures, historyFeatureVector(signal)) }))
    .filter((neighbor) => neighbor.similarity >= 0.22)
    .sort((left, right) => right.similarity - left.similarity)
    .slice(0, MAX_NEIGHBORS);

  const totalWeight = neighbors.reduce((sum, neighbor) => sum + neighbor.similarity, 0);
  const weightedWins = neighbors.reduce((sum, neighbor) => (
    sum + (isWinOutcome(neighbor.signal.outcome) ? neighbor.similarity : 0)
  ), 0);
  const modelProbability = directionalProbability(input.directionalProbabilities, direction);
  const historicalProbability = totalWeight > 0
    ? ((weightedWins + (modelProbability / 100) * PRIOR_WEIGHT) / (totalWeight + PRIOR_WEIGHT)) * 100
    : modelProbability;
  const averageSimilarity = neighbors.length > 0 ? totalWeight / neighbors.length : 0;
  const reliability = clamp(Math.sqrt(neighbors.length / 24) * averageSimilarity, 0, 1);
  const historicalWeight = HISTORICAL_BLEND_MAX * reliability;
  const probability = modelProbability * (1 - historicalWeight) + historicalProbability * historicalWeight;

  return {
    direction,
    probability: round(probability),
    historicalWinRate: totalWeight > 0 ? round((weightedWins / totalWeight) * 100) : null,
    modelProbability: round(modelProbability),
    sampleSize: neighbors.length,
    reliability: round(reliability * 100),
    averageSimilarity: round(averageSimilarity * 100),
  };
}

export function buildSmartSignal(symbol: string, input: SmartSignalInput): SmartSignalResult {
  const history = getSignalHistory(symbol, 500);
  const call = scoreSide(history, input, "CALL");
  const put = scoreSide(history, input, "PUT");
  const leader = call.probability >= put.probability ? call : put;
  const runnerUp = leader.direction === "CALL" ? put : call;
  const edge = leader.probability - runnerUp.probability;
  const direction: SmartSignalDirection = leader.probability >= 55 && edge >= 4
    ? leader.direction
    : "WAIT";
  const status: SmartSignalStatus = leader.sampleSize >= 12 && leader.reliability >= 45
    ? "READY"
    : leader.sampleSize >= 4
      ? "LEARNING"
      : "COLD_START";
  const agreement = direction !== "WAIT" && direction === input.direction;
  const confidence = clamp(
    Math.abs(edge) * 3 + leader.reliability * 0.55 + (agreement ? 12 : 0),
    0,
    100,
  );
  const reasons = [
    `${leader.direction} blend ${leader.probability.toFixed(1)}% vs ${runnerUp.probability.toFixed(1)}%.`,
    leader.historicalWinRate == null
      ? "No comparable resolved outcomes yet; live model remains in control."
      : `${leader.sampleSize} comparable outcomes at ${leader.historicalWinRate.toFixed(1)}% weighted win rate.`,
    status === "READY"
      ? "Historical support is strong enough to calibrate the live move forecast."
      : "Historical support is still learning; require the normal execution gates.",
  ];

  return {
    direction,
    probability: leader.probability,
    confidence: round(confidence),
    historicalWinRate: leader.historicalWinRate,
    sampleSize: leader.sampleSize,
    reliability: leader.reliability,
    status,
    agreement,
    sides: { call, put },
    reasons,
    trainedAt: Date.now(),
  };
}