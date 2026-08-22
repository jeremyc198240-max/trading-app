import fs from "fs";
import path from "path";

export interface CompressionLiveInput {
  symbol: string;
  timeframe: string;
  breakoutScore?: number | null;
  edgeScore?: number | null;
  confidence?: number | null;
  triggerProbability?: number | null;
  momentum?: number | null;
  bbWidth?: number | null;
  rangePct?: number | null;
  atrPercent?: number | null;
  rsi?: number | null;
  phase?: string | null;
  mode?: string | null;
  directionalBias?: string | null;
  priceActionDirection?: string | null;
  priceActionStrength?: number | null;
  priceActionConsistency?: number | null;
  priceActionSafetyAction?: string | null;
  priceActionContradiction?: number | null;
  otmDelta?: number | null;
  preBreakoutScore?: number | null;
  timeframeAgreement?: number | null;
  edgeLeadMinutes?: number | null;
  edgeState?: string | null;
  edgeSignal?: string | null;
  volRatio?: number | null;
}

interface TrainingRow {
  symbol: string;
  timeframe: string;
  x: number[];
  y: number;
  weight: number;
  timestamp: number;
}

interface TrainStats {
  sampleCount: number;
  positiveRate: number;
  symbolWinRate: Record<string, number>;
  timeframeWinRate: Record<string, number>;
  validation?: {
    sampleCount: number;
    accuracy: number;
    brier: number;
    baselineBrier: number;
    improvementVsBaseline: number;
    incumbentBrier: number | null;
    accepted: boolean;
    walkForward?: {
      folds: number;
      avgAccuracy: number;
      avgBrier: number;
      avgBaselineBrier: number;
      avgImprovementVsBaseline: number;
      minImprovementVsBaseline: number;
      avgPositiveRate: number;
    } | null;
  };
}

export interface TrainedModel {
  weights: number[];
  bias: number;
  calibrationAlpha: number;
  priorPositiveRate: number;
  thresholds: {
    prepare: number;
    enter: number;
  };
  stats: TrainStats;
  trainedAt: number;
}

interface LogisticParams {
  lr: number;
  l2: number;
  epochs: number;
}

interface CandidateResult {
  model: { weights: number[]; bias: number };
  calibrationAlpha: number;
  priorPositiveRate: number;
  params: LogisticParams;
  tuneEval: { accuracy: number; brier: number; baselineBrier: number } | null;
}

interface DecisionThresholds {
  prepare: number;
  enter: number;
}

interface ThresholdDiagnostics {
  targetEnterPrecision: number;
  targetPreparePrecision: number;
  enter: {
    threshold: number;
    precision: number;
    recall: number;
    accuracy: number;
    support: number;
    signalRate: number;
  };
  prepare: {
    threshold: number;
    precision: number;
    recall: number;
    accuracy: number;
    support: number;
    signalRate: number;
  };
}

const FEATURE_COUNT = 21;
const DEFAULT_THRESHOLDS: DecisionThresholds = { prepare: 52, enter: 74 };
const MODEL_TTL_MS = 5 * 60 * 1000;
const RECENCY_HALF_LIFE_MS = 5 * 24 * 60 * 60 * 1000;
let cachedModel: TrainedModel | null = null;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function sigmoid(z: number): number {
  if (z > 35) return 1;
  if (z < -35) return 0;
  return 1 / (1 + Math.exp(-z));
}

function num(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function phaseToVec(phase?: string | null): [number, number, number] {
  const p = String(phase ?? "").toUpperCase();
  return [p === "NOW" ? 1 : 0, p === "READY" ? 1 : 0, p === "PREPARE" ? 1 : 0];
}

function modeToScalar(mode?: string | null): number {
  const m = String(mode ?? "").toUpperCase();
  if (m === "EXECUTE") return 1;
  if (m === "PREPARE") return 0.6;
  return 0;
}

function edgeStateToScalar(edgeState?: string | null): number {
  const s = String(edgeState ?? "").toUpperCase();
  if (s === "TRIGGERED") return 1;
  if (s === "PRIMED") return 0.75;
  if (s === "ARMING") return 0.5;
  if (s === "STANDBY") return 0.2;
  return 0.35;
}

function edgeSignalToScalar(edgeSignal?: string | null): number {
  const s = String(edgeSignal ?? "").toUpperCase();
  if (s === "BREAK_UP" || s === "BREAK_DOWN") return 1;
  if (s === "WATCH") return 0.55;
  if (s === "WAIT") return 0.2;
  return 0.4;
}

function dirToScalar(direction?: string | null): number {
  const d = String(direction ?? "").toLowerCase();
  if (d === "bullish") return 1;
  if (d === "bearish") return 0;
  return 0.5;
}

function evaluateRunnerGate(input: CompressionLiveInput): {
  pass: boolean;
  blockers: string[];
} {
  const blockers: string[] = [];
  const phase = String(input.phase ?? "WAIT").toUpperCase();
  const breakoutScore = num(input.breakoutScore) ?? 0;
  const edgeScore = num(input.edgeScore) ?? 0;
  const triggerProbability = num(input.triggerProbability) ?? 0;
  const confidence = num(input.confidence) ?? 0;
  const momentumAbs = Math.abs(num(input.momentum) ?? 0);
  const deltaAbs = Math.abs(num(input.otmDelta) ?? 0.2);
  const bbWidth = num(input.bbWidth) ?? 0;
  const volRatio = num(input.volRatio) ?? 0;
  const preBreakoutScore = num(input.preBreakoutScore) ?? 0;
  const timeframeAgreement = num(input.timeframeAgreement) ?? 0;

  // Single high-impact gate for 0DTE runner attempts:
  // only allow ENTER when expansion context, trigger quality, and low-delta lane are all aligned.
  if (phase !== "READY" && phase !== "NOW") blockers.push("phase_not_ready");
  if (breakoutScore < 58) blockers.push("breakout_score_low");
  if (edgeScore < 70) blockers.push("edge_score_low");
  if (triggerProbability < 60) blockers.push("trigger_probability_low");
  if (confidence < 68) blockers.push("confidence_low");
  if (momentumAbs < 22) blockers.push("momentum_too_weak");
  if (deltaAbs < 0.14 || deltaAbs > 0.32) blockers.push("delta_out_of_runner_lane");
  if (bbWidth > 1.7) blockers.push("compression_already_expanded");
  if (volRatio < 0.08) blockers.push("volume_too_dry");
  if (preBreakoutScore < 65) blockers.push("setup_score_too_low");
  if (timeframeAgreement < 60) blockers.push("mtf_stack_not_aligned");

  return {
    pass: blockers.length === 0,
    blockers,
  };
}

function buildFeatureVector(input: CompressionLiveInput): number[] {
  const bbWidth = num(input.bbWidth);
  const rangePct = num(input.rangePct);
  const atrPercent = num(input.atrPercent);
  const edgeScore = num(input.edgeScore);
  const confidence = num(input.confidence);
  const triggerProbability = num(input.triggerProbability);
  const breakoutScore = num(input.breakoutScore);
  const momentum = num(input.momentum);
  const otmDelta = num(input.otmDelta);
  const preBreakoutScore = num(input.preBreakoutScore);
  const timeframeAgreement = num(input.timeframeAgreement);
  const edgeLeadMinutes = num(input.edgeLeadMinutes);
  const volRatio = num(input.volRatio);

  const bbTight = bbWidth == null ? 0.5 : clamp01(1 - bbWidth / 2.2);
  const rangeTight = rangePct == null ? 0.5 : clamp01(1 - rangePct / 1.2);
  const atrTight = atrPercent == null ? 0.5 : clamp01(1 - atrPercent / 1.5);
  const [phaseNow, phaseReady, phasePrepare] = phaseToVec(input.phase);
  const breakoutNorm = clamp01((breakoutScore ?? 0) / 100);
  const edgeNorm = clamp01((edgeScore ?? 0) / 100);
  const confidenceNorm = clamp01((confidence ?? 0) / 100);
  const triggerNorm = clamp01((triggerProbability ?? 0) / 100);
  const momentumNorm = clamp01(Math.abs(momentum ?? 0) / 100);
  const deltaNorm = clamp01(Math.abs(otmDelta ?? 0.2) / 0.45);
  const preBreakoutNorm = clamp01((preBreakoutScore ?? 50) / 100);
  const stackAgreementNorm = clamp01((timeframeAgreement ?? 50) / 100);
  const volatilityRegime = atrPercent == null ? 0.5 : clamp01((atrPercent ?? 0) / 0.45);
  const leadWindowScore = edgeLeadMinutes == null
    ? 0.5
    : clamp01(1 - Math.abs(edgeLeadMinutes - 6) / 16);
  const edgeStateScore = edgeStateToScalar(input.edgeState);
  const edgeSignalScore = edgeSignalToScalar(input.edgeSignal);
  const volumeCompressionScore = volRatio == null
    ? 0.5
    : clamp01(1 - Math.abs(volRatio - 0.35) / 0.9);
  const expansionRisk = bbWidth == null ? 0.5 : clamp01((bbWidth - 0.9) / 1.2);

  const qualityFusion = Math.pow(Math.max(0.001, breakoutNorm * edgeNorm * confidenceNorm * triggerNorm), 0.25);
  const structureFusion = (bbTight + rangeTight + atrTight) / 3;
  const momentumTriggerFusion = clamp01(Math.sqrt(Math.max(0, momentumNorm * triggerNorm)));
  const deltaLaneScore = clamp01(1 - Math.abs((Math.abs(otmDelta ?? 0.22) - 0.23) / 0.16));
  const expansionReadiness = clamp01(
    0.32 * edgeStateScore +
    0.26 * edgeSignalScore +
    0.22 * leadWindowScore +
    0.2 * volumeCompressionScore -
    0.14 * expansionRisk
  );

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
    modeToScalar(input.mode),
    deltaNorm,
    qualityFusion,
    structureFusion,
    momentumTriggerFusion,
    deltaLaneScore,
    preBreakoutNorm,
    stackAgreementNorm,
    volatilityRegime,
    expansionReadiness,
  ];
}

function qualityMultiplier(outcomeReasonRaw: unknown): number {
  const reason = String(outcomeReasonRaw ?? "").toLowerCase();
  if (!reason) return 1;
  if (
    reason.includes("stale") ||
    reason.includes("desync") ||
    reason.includes("latency") ||
    reason.includes("ohlc")
  ) {
    return 0.72;
  }
  return 1;
}

function trainingWeight(item: any): number {
  const base = item.mode === "EXECUTE" ? 1.5 : item.mode === "PREPARE" ? 1.0 : 0.9;
  const outcome = String(item.outcome ?? "").toLowerCase();
  let multiplier = 1;

  if (outcome.includes("win")) multiplier = 1.25;
  else if (outcome.includes("loss")) multiplier = 1.4;
  else if (outcome.includes("miss")) multiplier = 1.55;
  else if (outcome === "pending") multiplier = 0.85;

  const ageHours = Math.max(0, (Date.now() - Number(item.timestamp)) / 3_600_000);
  const recency = Math.exp(-ageHours / 72);

  return Math.max(0.05, base * multiplier * qualityMultiplier(item.outcomeReason) * recency);
}

function dot(a: number[], b: number[]): number {
  let total = 0;
  for (let i = 0; i < a.length; i += 1) {
    total += (a[i] ?? 0) * (b[i] ?? 0);
  }
  return total;
}

function parseJsonFile(filePath: string): any[] {
  try {
    if (!fs.existsSync(filePath)) return [];
    const raw = fs.readFileSync(filePath, "utf8").trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function parseJsonlFiles(logDir: string, prefix: string): any[] {
  const entries: any[] = [];
  try {
    if (!fs.existsSync(logDir)) return entries;
    const files = fs.readdirSync(logDir).filter((f) => f.startsWith(prefix)).sort();
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(logDir, file), "utf8");
        for (const line of raw.split("\n")) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            entries.push(JSON.parse(trimmed));
          } catch {
            // ignore invalid lines
          }
        }
      } catch {
        // ignore unreadable files
      }
    }
  } catch {
    // ignore top-level read failures
  }
  return entries;
}

function rowsFromIntakeSnapshots(entries: any[]): TrainingRow[] {
  const rows: TrainingRow[] = [];
  const maxRows = 1200;
  const start = Math.max(0, entries.length - maxRows);

  for (let i = start; i < entries.length; i += 1) {
    const entry = entries[i] ?? {};
    const timestamp = Number.isFinite(Number(entry.unixMs)) ? Number(entry.unixMs) : Date.now();
    const outputs = Array.isArray(entry.engineOutputs) ? entry.engineOutputs : [];

    for (const output of outputs) {
      if (String(output.engineName ?? "").toLowerCase() !== "compressionai") continue;
      if (String(output.outputType ?? "").toLowerCase() !== "compressiondecision") continue;

      const active = output.active;
      const y = active === true ? 1 : active === false ? 0 : null;
      if (y == null) continue;

      const details = typeof output.details === "object" && output.details !== null ? output.details : {};
      const features = buildFeatureVector({
        symbol: String(output.symbol ?? ""),
        timeframe: String(output.timeframe ?? "15m"),
        breakoutScore: num(output.edgeScore ?? details.edgeScore),
        edgeScore: num(output.edgeScore ?? details.edgeScore),
        confidence: num(output.confidence ?? output.modelProbability ?? details.confidence),
        triggerProbability: num(details.triggerProbability),
        momentum: num(details.momentum ?? details.macdHistogram ?? details.priceVelocity),
        bbWidth: num(details.bbWidth),
        rangePct: num(details.rangePct),
        atrPercent: num(details.atrPercent),
        rsi: num(details.rsi),
        phase: details.phase,
        mode: details.mode,
        directionalBias: String(output.bias ?? details.direction ?? details.directionalBias ?? ""),
        otmDelta: num(details.otmDelta ?? details.delta ?? details.targetDelta),
        preBreakoutScore: num(details.preBreakoutScore ?? details.setupScore),
        timeframeAgreement: num(details.timeframeAgreement ?? details.timeframeStackAgreement),
        edgeLeadMinutes: num(details.edgeLeadMinutes ?? details.leadMinutes),
        edgeState: String(details.edgeState ?? details.state ?? ""),
        edgeSignal: String(details.edgeSignal ?? details.signal ?? ""),
        volRatio: num(details.volRatio),
      });

      if (features.length !== FEATURE_COUNT) continue;
      rows.push({
        symbol: String(output.symbol ?? "UNK").toUpperCase(),
        timeframe: String(output.timeframe ?? "15m").toLowerCase(),
        x: features,
        y,
        weight: 0.08,
        timestamp,
      });
    }
  }

  return rows;
}

export function deriveTrainingLabelFromOutcome(item: any, fallback: any = item): number | null {
  const outcome = String(item?.outcome ?? fallback?.outcome ?? "").toLowerCase();
  const prepareOutcome = String(item?.prepareOutcome ?? fallback?.prepareOutcome ?? "").toLowerCase();
  const reason = String(item?.outcomeReason ?? fallback?.outcomeReason ?? "").toLowerCase();
  const priceDeltaPct = num(item?.priceDeltaPct ?? fallback?.priceDeltaPct);
  const priceAtCapture = num(item?.priceAtCapture ?? fallback?.priceAtCapture);
  const stopLoss = num(item?.stopLoss ?? fallback?.stopLoss);
  const maxPriceSeen = num(item?.maxPriceSeen ?? fallback?.maxPriceSeen);
  const minPriceSeen = num(item?.minPriceSeen ?? fallback?.minPriceSeen);
  const targets = Array.isArray(item?.targets)
    ? item.targets
    : Array.isArray(fallback?.targets)
      ? fallback.targets
      : [];
  const targetPrice = targets
    .map((value: unknown) => num(value))
    .find((value: number | null): value is number => value != null && Number.isFinite(value));

  const positiveText = [outcome, prepareOutcome, reason].join(" ");
  const negativeText = [outcome, prepareOutcome, reason].join(" ");
  const positiveTokens = ["win", "target", "profit", "success", "executed", "hit", "filled", "reached"];
  const negativeTokens = ["missed", "loss", "stop", "timeout", "fail", "stopped", "flat", "rejected"];

  if (positiveTokens.some((token) => positiveText.includes(token))) return 1;
  if (negativeTokens.some((token) => negativeText.includes(token))) return 0;

  if (priceDeltaPct != null) {
    const hitTarget = targetPrice != null && maxPriceSeen != null && maxPriceSeen >= targetPrice;
    const stopHit = stopLoss != null && minPriceSeen != null && minPriceSeen <= stopLoss;
    const strongPositive = priceDeltaPct >= 0.02 || (priceDeltaPct >= 0.01 && hitTarget);
    const strongNegative = priceDeltaPct <= -0.02 || (priceDeltaPct <= -0.01 && stopHit);

    if (strongPositive) return 1;
    if (strongNegative) return 0;
  }

  const hasResolvedOutcome = outcome && outcome !== "pending" && outcome !== "open" && outcome !== "in_progress";
  if (!hasResolvedOutcome) return null;

  return null;
}

function rowsFromBreakoutHistory(history: any[]): TrainingRow[] {
  const rows: TrainingRow[] = [];
  const maxRows = 7000;
  const start = Math.max(0, history.length - maxRows);

  for (let i = start; i < history.length; i += 1) {
    const item = history[i] ?? {};
    const y = deriveTrainingLabelFromOutcome(item);
    if (y == null) continue;

    const features = buildFeatureVector({
      symbol: String(item.symbol ?? ""),
      timeframe: String(item.timeframe ?? "15m"),
      breakoutScore: num(item.breakoutScore),
      edgeScore: num(item.edgeEngine?.edgeScore),
      confidence: num(item.edgeEngine?.confidence),
      triggerProbability: num(item.edgeEngine?.triggerProbability),
      momentum: num(item.momentumStrength),
      bbWidth: num(item.compression?.bbWidth),
      rangePct: num(item.compression?.rangePct),
      atrPercent: num(item.marketHealth?.atr?.percent),
      rsi: num(item.marketHealth?.rsi?.value ?? item.rsiValue ?? item.edgeEngine?.indicators?.rsi),
      phase: item.compression?.phase,
      mode: item.mode,
      directionalBias: item.direction,
      otmDelta: num(item.tactical?.otm?.delta ?? item.optionsReadiness?.delta),
      preBreakoutScore: num(item.preBreakoutSetup?.score),
      timeframeAgreement: num(item.timeframeStack?.agreement),
      edgeLeadMinutes: num(item.edgeEngine?.leadMinutes),
      edgeState: String(item.edgeEngine?.state ?? ""),
      edgeSignal: String(item.edgeEngine?.signal ?? ""),
      volRatio: num(item.compression?.volRatio),
    });

    if (features.length !== FEATURE_COUNT) continue;

    rows.push({
      symbol: String(item.symbol ?? "UNK").toUpperCase(),
      timeframe: String(item.timeframe ?? "15m").toLowerCase(),
      x: features,
      y,
      weight: trainingWeight(item),
      timestamp: Number.isFinite(Number(item.timestamp)) ? Number(item.timestamp) : Date.now(),
    });
  }

  return rows;
}

function rowsFromEdgeSamples(samples: any[]): TrainingRow[] {
  const rows: TrainingRow[] = [];
  const maxRows = 2200;
  const start = Math.max(0, samples.length - maxRows);

  for (let i = start; i < samples.length; i += 1) {
    const item = samples[i] ?? {};
    const state = String(item.edgeEngine?.state ?? "").toUpperCase();
    const trig = num(item.edgeEngine?.triggerProbability) ?? 0;
    const conf = num(item.edgeEngine?.confidence) ?? 0;
    const edgeScore = num(item.edgeEngine?.edgeScore) ?? 0;
    const breakoutScore = num(item.breakoutScore) ?? 0;
    const direction = String(item.edgeEngine?.direction ?? "").toLowerCase();
    const signal = String(item.edgeEngine?.signal ?? "").toUpperCase();

    // Keep only high-conviction pseudo labels so regularization rows do not drown true outcomes.
    const strongPositive =
      direction !== "neutral" &&
      signal !== "WAIT" &&
      state === "TRIGGERED" &&
      trig >= 72 &&
      conf >= 72 &&
      edgeScore >= 74 &&
      breakoutScore >= 34;

    const strongNegative =
      (state === "STANDBY" || state === "ARMING") &&
      trig <= 36 &&
      conf <= 56 &&
      edgeScore <= 56 &&
      breakoutScore <= 36;

    if (!strongPositive && !strongNegative) continue;

    const y = strongPositive ? 1 : 0;

    const features = buildFeatureVector({
      symbol: String(item.symbol ?? ""),
      timeframe: String(item.timeframe ?? "15m"),
      breakoutScore: num(item.breakoutScore),
      edgeScore: num(item.edgeEngine?.edgeScore),
      confidence: conf,
      triggerProbability: trig,
      momentum: num(item.edgeEngine?.indicators?.momentum),
      bbWidth: num(item.edgeEngine?.indicators?.bbWidth),
      rangePct: null,
      atrPercent: num(item.edgeEngine?.indicators?.atrPercent),
      rsi: num(item.edgeEngine?.indicators?.rsi),
      phase: item.compression?.phase,
      mode: item.mode,
      directionalBias: item.edgeEngine?.direction,
      otmDelta: null,
      preBreakoutScore: num(item.preBreakoutSetup?.score),
      timeframeAgreement: num(item.timeframeStack?.agreement),
      edgeLeadMinutes: num(item.edgeEngine?.leadMinutes),
      edgeState: String(item.edgeEngine?.state ?? ""),
      edgeSignal: String(item.edgeEngine?.signal ?? ""),
      volRatio: num(item.compression?.volRatio),
    });

    if (features.length !== FEATURE_COUNT) continue;

    rows.push({
      symbol: String(item.symbol ?? "UNK").toUpperCase(),
      timeframe: String(item.timeframe ?? "15m").toLowerCase(),
      x: features,
      y,
      weight: 0.12,
      timestamp: Number.isFinite(Number(item.timestamp)) ? Number(item.timestamp) : Date.now(),
    });
  }

  return rows;
}

function recencyMultiplier(timestamp: number, anchor: number): number {
  const ageMs = Math.max(0, anchor - timestamp);
  const decay = Math.exp((-Math.log(2) * ageMs) / RECENCY_HALF_LIFE_MS);
  return 0.55 + 0.45 * decay;
}

function trainLogistic(
  rows: TrainingRow[],
  params: LogisticParams,
): { weights: number[]; bias: number } {
  const weights = new Array(FEATURE_COUNT).fill(0);
  let bias = 0;

  if (rows.length < 20) return { weights, bias };

  const maxTimestamp = rows.reduce((max, row) => Math.max(max, row.timestamp), 0);
  const posCount = rows.reduce((sum, row) => sum + (row.y === 1 ? 1 : 0), 0);
  const negCount = Math.max(0, rows.length - posCount);
  const posClassWeight = posCount > 0 ? rows.length / (2 * posCount) : 1;
  const negClassWeight = negCount > 0 ? rows.length / (2 * negCount) : 1;

  for (let epoch = 0; epoch < params.epochs; epoch += 1) {
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[(i + epoch) % rows.length];
      const score = dot(weights, row.x) + bias;
      const pred = sigmoid(score);
      const classWeight = row.y === 1 ? posClassWeight : negClassWeight;
      const recencyWeight = recencyMultiplier(row.timestamp, maxTimestamp);
      const error = (pred - row.y) * row.weight * classWeight * recencyWeight;

      for (let j = 0; j < FEATURE_COUNT; j += 1) {
        weights[j] -= params.lr * (error * row.x[j] + params.l2 * weights[j]);
      }

      bias -= params.lr * error;
    }
  }

  return { weights, bias };
}

function splitClassBalanced(
  rows: TrainingRow[],
  desiredHoldoutSize: number,
): { trainRows: TrainingRow[]; holdoutRows: TrainingRow[] } {
  if (rows.length < 40 || desiredHoldoutSize <= 0) {
    return { trainRows: rows, holdoutRows: [] };
  }

  const posIndices: number[] = [];
  const negIndices: number[] = [];
  for (let i = 0; i < rows.length; i += 1) {
    if (rows[i].y === 1) posIndices.push(i);
    else negIndices.push(i);
  }

  if (posIndices.length < 2 || negIndices.length < 2) {
    const holdoutSize = Math.min(desiredHoldoutSize, Math.max(0, rows.length - 20));
    return {
      trainRows: rows.slice(0, rows.length - holdoutSize),
      holdoutRows: rows.slice(rows.length - holdoutSize),
    };
  }

  const positiveRate = posIndices.length / rows.length;
  const minPerClass = 1;
  const maxPos = Math.max(minPerClass, posIndices.length - 1);
  const maxNeg = Math.max(minPerClass, negIndices.length - 1);

  let holdoutPos = Math.round(desiredHoldoutSize * positiveRate);
  holdoutPos = Math.max(minPerClass, Math.min(maxPos, holdoutPos));
  let holdoutNeg = desiredHoldoutSize - holdoutPos;
  holdoutNeg = Math.max(minPerClass, Math.min(maxNeg, holdoutNeg));

  while (holdoutPos + holdoutNeg > desiredHoldoutSize) {
    if (holdoutNeg > holdoutPos && holdoutNeg > minPerClass) holdoutNeg -= 1;
    else if (holdoutPos > minPerClass) holdoutPos -= 1;
    else break;
  }

  while (holdoutPos + holdoutNeg < desiredHoldoutSize) {
    if (holdoutNeg < maxNeg) holdoutNeg += 1;
    else if (holdoutPos < maxPos) holdoutPos += 1;
    else break;
  }

  const holdoutSet = new Set<number>([
    ...posIndices.slice(Math.max(0, posIndices.length - holdoutPos)),
    ...negIndices.slice(Math.max(0, negIndices.length - holdoutNeg)),
  ]);

  const trainRows: TrainingRow[] = [];
  const holdoutRows: TrainingRow[] = [];

  for (let i = 0; i < rows.length; i += 1) {
    if (holdoutSet.has(i)) holdoutRows.push(rows[i]);
    else trainRows.push(rows[i]);
  }

  return { trainRows, holdoutRows };
}

function selectBestCandidate(trainRows: TrainingRow[]): CandidateResult {
  const defaultParams: LogisticParams = { lr: 0.07, l2: 0.015, epochs: 220 };
  const defaultPrior = trainRows.length > 0
    ? trainRows.reduce((sum, row) => sum + row.y, 0) / trainRows.length
    : 0.5;
  if (trainRows.length < 60) {
    return {
      model: trainLogistic(trainRows, defaultParams),
      calibrationAlpha: 1,
      priorPositiveRate: defaultPrior,
      params: defaultParams,
      tuneEval: null,
    };
  }

  const tuneSize = Math.min(180, Math.max(30, Math.floor(trainRows.length * 0.2)));
  const split = splitClassBalanced(trainRows, tuneSize);
  const fitRows = split.trainRows;
  const tuneRows = split.holdoutRows;

  if (fitRows.length < 40 || tuneRows.length < 20) {
    return {
      model: trainLogistic(trainRows, defaultParams),
      calibrationAlpha: 1,
      priorPositiveRate: defaultPrior,
      params: defaultParams,
      tuneEval: null,
    };
  }

  const grid: LogisticParams[] = [
    { lr: 0.04, l2: 0.01, epochs: 180 },
    { lr: 0.05, l2: 0.012, epochs: 220 },
    { lr: 0.06, l2: 0.015, epochs: 220 },
    { lr: 0.07, l2: 0.015, epochs: 220 },
    { lr: 0.075, l2: 0.018, epochs: 260 },
    { lr: 0.085, l2: 0.02, epochs: 260 },
  ];

  const tunePrior = fitRows.reduce((sum, row) => sum + row.y, 0) / fitRows.length;
  let bestParams = grid[0];
  let bestCalAlpha = 1;
  const firstModel = trainLogistic(fitRows, grid[0]);
  bestCalAlpha = selectCalibrationAlpha(firstModel, tuneRows, tunePrior);
  let bestEval = evaluateModel(firstModel, tuneRows, { alpha: bestCalAlpha, prior: tunePrior });
  let bestObjective = (bestEval.baselineBrier - bestEval.brier) + bestEval.accuracy * 0.03;

  for (let i = 1; i < grid.length; i += 1) {
    const params = grid[i];
    const model = trainLogistic(fitRows, params);
    const calAlpha = selectCalibrationAlpha(model, tuneRows, tunePrior);
    const evalResult = evaluateModel(model, tuneRows, { alpha: calAlpha, prior: tunePrior });
    const objective = (evalResult.baselineBrier - evalResult.brier) + evalResult.accuracy * 0.03;
    if (objective > bestObjective) {
      bestObjective = objective;
      bestEval = evalResult;
      bestParams = params;
      bestCalAlpha = calAlpha;
    }
  }

  const finalPrior = trainRows.reduce((sum, row) => sum + row.y, 0) / trainRows.length;
  const finalModel = trainLogistic(trainRows, bestParams);
  const finalAlpha = tuneRows.length > 0
    ? selectCalibrationAlpha(finalModel, tuneRows, finalPrior)
    : bestCalAlpha;

  return {
    model: finalModel,
    calibrationAlpha: finalAlpha,
    priorPositiveRate: finalPrior,
    params: bestParams,
    tuneEval: bestEval,
  };
}

function evaluateModel(
  model: { weights: number[]; bias: number },
  rows: TrainingRow[],
  calibration?: { alpha: number; prior: number },
): { accuracy: number; brier: number; baselineBrier: number } {
  if (rows.length === 0) {
    return { accuracy: 0, brier: 1, baselineBrier: 1 };
  }

  const baselineProb = rows.reduce((sum, row) => sum + row.y, 0) / rows.length;
  let correct = 0;
  let brierSum = 0;
  let baselineBrierSum = 0;

  const alpha = calibration ? clamp01(calibration.alpha) : 1;
  const prior = calibration ? clamp01(calibration.prior) : baselineProb;

  for (const row of rows) {
    const raw = sigmoid(dot(model.weights, row.x) + model.bias);
    const p = clamp01(raw * alpha + prior * (1 - alpha));
    const pred = p >= 0.5 ? 1 : 0;
    if (pred === row.y) correct += 1;
    brierSum += Math.pow(p - row.y, 2);
    baselineBrierSum += Math.pow(baselineProb - row.y, 2);
  }

  return {
    accuracy: correct / rows.length,
    brier: brierSum / rows.length,
    baselineBrier: baselineBrierSum / rows.length,
  };
}

function buildPriorOnlyModel(rows: TrainingRow[]): { weights: number[]; bias: number } {
  const weights = new Array(FEATURE_COUNT).fill(0);
  if (rows.length === 0) {
    return { weights, bias: 0 };
  }

  const positiveRate = rows.reduce((sum, row) => sum + row.y, 0) / rows.length;
  const p = Math.min(0.995, Math.max(0.005, positiveRate));
  const bias = Math.log(p / (1 - p));
  return { weights, bias };
}

function selectCalibrationAlpha(
  model: { weights: number[]; bias: number },
  rows: TrainingRow[],
  priorPositiveRate: number,
): number {
  if (rows.length < 20) return 1;

  const alphaGrid = [0.2, 0.3, 0.4, 0.5, 0.65, 0.8, 1];
  let bestAlpha = 1;
  let bestEval = evaluateModel(model, rows, { alpha: bestAlpha, prior: priorPositiveRate });
  let bestObjective = (bestEval.baselineBrier - bestEval.brier) + bestEval.accuracy * 0.02;

  for (const alpha of alphaGrid) {
    const evalResult = evaluateModel(model, rows, { alpha, prior: priorPositiveRate });
    const objective = (evalResult.baselineBrier - evalResult.brier) + evalResult.accuracy * 0.02;
    if (objective > bestObjective) {
      bestObjective = objective;
      bestEval = evalResult;
      bestAlpha = alpha;
    }
  }

  return bestAlpha;
}

function buildStats(rows: TrainingRow[]): TrainStats {
  const sampleCount = rows.length;
  const positives = rows.reduce((sum, row) => sum + row.y, 0);
  const positiveRate = sampleCount > 0 ? positives / sampleCount : 0;

  const symbolAgg = new Map<string, { n: number; p: number }>();
  const tfAgg = new Map<string, { n: number; p: number }>();

  for (const row of rows) {
    const sym = symbolAgg.get(row.symbol) ?? { n: 0, p: 0 };
    sym.n += 1;
    sym.p += row.y;
    symbolAgg.set(row.symbol, sym);

    const tf = tfAgg.get(row.timeframe) ?? { n: 0, p: 0 };
    tf.n += 1;
    tf.p += row.y;
    tfAgg.set(row.timeframe, tf);
  }

  const symbolWinRate: Record<string, number> = {};
  for (const [k, v] of symbolAgg.entries()) {
    if (v.n >= 8) symbolWinRate[k] = v.p / v.n;
  }

  const timeframeWinRate: Record<string, number> = {};
  for (const [k, v] of tfAgg.entries()) {
    if (v.n >= 10) timeframeWinRate[k] = v.p / v.n;
  }

  return {
    sampleCount,
    positiveRate,
    symbolWinRate,
    timeframeWinRate,
  };
}

function evaluateThreshold(rows: TrainingRow[], probs: number[], threshold: number): {
  precision: number;
  recall: number;
  accuracy: number;
  support: number;
  signalRate: number;
} {
  if (rows.length === 0 || probs.length !== rows.length) {
    return { precision: 0, recall: 0, accuracy: 0, support: 0, signalRate: 0 };
  }

  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;

  for (let i = 0; i < rows.length; i += 1) {
    const predPositive = probs[i] * 100 >= threshold;
    const actualPositive = rows[i].y === 1;
    if (predPositive && actualPositive) tp += 1;
    else if (predPositive && !actualPositive) fp += 1;
    else if (!predPositive && actualPositive) fn += 1;
    else tn += 1;
  }

  const support = tp + fp;
  const precision = support > 0 ? tp / support : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const accuracy = (tp + tn) / rows.length;
  return {
    precision,
    recall,
    accuracy,
    support,
    signalRate: support / rows.length,
  };
}

function evaluateWalkForward(rows: TrainingRow[]): {
  folds: number;
  avgAccuracy: number;
  avgBrier: number;
  avgBaselineBrier: number;
  avgImprovementVsBaseline: number;
  minImprovementVsBaseline: number;
  avgPositiveRate: number;
} | null {
  if (rows.length < 260) return null;

  const minTrainRows = 140;
  const foldSize = Math.min(120, Math.max(40, Math.floor(rows.length * 0.1)));
  if (foldSize < 25 || rows.length < minTrainRows + foldSize) return null;

  const trainCutoffs: number[] = [];
  for (
    let trainEnd = minTrainRows;
    trainEnd + foldSize <= rows.length;
    trainEnd += foldSize
  ) {
    trainCutoffs.push(trainEnd);
  }

  const selected = trainCutoffs.slice(-4);
  if (selected.length === 0) return null;

  const evaluations: Array<{ accuracy: number; brier: number; baselineBrier: number; positiveRate: number }> = [];

  for (const trainEnd of selected) {
    const trainSlice = rows.slice(0, trainEnd);
    let testEnd = Math.min(rows.length, trainEnd + foldSize);
    let testSlice = rows.slice(trainEnd, testEnd);
    let pos = testSlice.reduce((sum, row) => sum + row.y, 0);
    let neg = Math.max(0, testSlice.length - pos);
    const maxExtended = Math.min(rows.length, trainEnd + foldSize * 3);

    while ((pos < 1 || neg < 1) && testEnd < maxExtended) {
      testEnd = Math.min(maxExtended, testEnd + Math.max(8, Math.floor(foldSize / 4)));
      testSlice = rows.slice(trainEnd, testEnd);
      pos = testSlice.reduce((sum, row) => sum + row.y, 0);
      neg = Math.max(0, testSlice.length - pos);
    }

    if (trainSlice.length < minTrainRows || testSlice.length < 25) continue;
    if (pos < 1 || neg < 1) continue;

    const tuned = selectBestCandidate(trainSlice);
    const evalResult = evaluateModel(tuned.model, testSlice, {
      alpha: tuned.calibrationAlpha,
      prior: tuned.priorPositiveRate,
    });

    evaluations.push({
      accuracy: evalResult.accuracy,
      brier: evalResult.brier,
      baselineBrier: evalResult.baselineBrier,
      positiveRate: testSlice.reduce((sum, row) => sum + row.y, 0) / testSlice.length,
    });
  }

  if (evaluations.length === 0) return null;

  const avgAccuracy = evaluations.reduce((sum, item) => sum + item.accuracy, 0) / evaluations.length;
  const avgBrier = evaluations.reduce((sum, item) => sum + item.brier, 0) / evaluations.length;
  const avgBaselineBrier = evaluations.reduce((sum, item) => sum + item.baselineBrier, 0) / evaluations.length;
  const avgPositiveRate = evaluations.reduce((sum, item) => sum + item.positiveRate, 0) / evaluations.length;
  const improvements = evaluations.map((item) => item.baselineBrier - item.brier);

  return {
    folds: evaluations.length,
    avgAccuracy,
    avgBrier,
    avgBaselineBrier,
    avgImprovementVsBaseline: improvements.reduce((sum, value) => sum + value, 0) / improvements.length,
    minImprovementVsBaseline: Math.min(...improvements),
    avgPositiveRate,
  };
}

function selectDecisionThresholds(
  model: { weights: number[]; bias: number },
  rows: TrainingRow[],
  calibration: { alpha: number; prior: number },
  target?: { enterPrecision: number; preparePrecision: number },
): { thresholds: DecisionThresholds; diagnostics: ThresholdDiagnostics } {
  if (rows.length < 60) {
    return {
      thresholds: DEFAULT_THRESHOLDS,
      diagnostics: {
        targetEnterPrecision: target?.enterPrecision ?? 0.6,
        targetPreparePrecision: target?.preparePrecision ?? 0.52,
        enter: {
          threshold: DEFAULT_THRESHOLDS.enter,
          precision: 0,
          recall: 0,
          accuracy: 0,
          support: 0,
          signalRate: 0,
        },
        prepare: {
          threshold: DEFAULT_THRESHOLDS.prepare,
          precision: 0,
          recall: 0,
          accuracy: 0,
          support: 0,
          signalRate: 0,
        },
      },
    };
  }

  const probs = rows.map((row) => {
    const raw = sigmoid(dot(model.weights, row.x) + model.bias);
    return clamp01(raw * calibration.alpha + calibration.prior * (1 - calibration.alpha));
  });

  const targetEnterPrecision = Math.max(0.5, Math.min(0.75, target?.enterPrecision ?? 0.6));
  const targetPreparePrecision = Math.max(0.42, Math.min(0.7, target?.preparePrecision ?? 0.52));

  let bestEnter = DEFAULT_THRESHOLDS.enter;
  let bestEnterObjective = -Infinity;

  for (let t = 60; t <= 88; t += 2) {
    const m = evaluateThreshold(rows, probs, t);
    if (m.support < Math.max(6, Math.floor(rows.length * 0.03))) continue;
    if (m.precision < targetEnterPrecision) continue;
    const objective = m.precision * 0.78 + m.recall * 0.14 + m.accuracy * 0.08;
    if (objective > bestEnterObjective) {
      bestEnterObjective = objective;
      bestEnter = t;
    }
  }

  if (!Number.isFinite(bestEnterObjective)) {
    for (let t = 58; t <= 84; t += 2) {
      const m = evaluateThreshold(rows, probs, t);
      if (m.support < Math.max(6, Math.floor(rows.length * 0.03))) continue;
      const objective = m.precision * 0.72 + m.recall * 0.18 + m.accuracy * 0.1;
      if (objective > bestEnterObjective) {
        bestEnterObjective = objective;
        bestEnter = t;
      }
    }
    if (!Number.isFinite(bestEnterObjective)) bestEnter = DEFAULT_THRESHOLDS.enter;
  }

  let bestPrepare = Math.min(bestEnter - 8, DEFAULT_THRESHOLDS.prepare);
  let bestPrepareObjective = -Infinity;
  const prepareMax = Math.max(44, bestEnter - 6);

  for (let t = 40; t <= prepareMax; t += 2) {
    const m = evaluateThreshold(rows, probs, t);
    if (m.support < Math.max(10, Math.floor(rows.length * 0.06))) continue;
    if (m.precision < targetPreparePrecision) continue;
    const objective = m.recall * 0.45 + m.precision * 0.36 + Math.min(0.62, m.signalRate) * 0.19;
    if (objective > bestPrepareObjective) {
      bestPrepareObjective = objective;
      bestPrepare = t;
    }
  }

  if (!Number.isFinite(bestPrepareObjective)) {
    for (let t = 38; t <= prepareMax; t += 2) {
      const m = evaluateThreshold(rows, probs, t);
      if (m.support < Math.max(8, Math.floor(rows.length * 0.05))) continue;
      const objective = m.recall * 0.44 + m.precision * 0.38 + m.accuracy * 0.18;
      if (objective > bestPrepareObjective) {
        bestPrepareObjective = objective;
        bestPrepare = t;
      }
    }
    if (!Number.isFinite(bestPrepareObjective)) {
      bestPrepare = Math.min(bestEnter - 8, DEFAULT_THRESHOLDS.prepare);
    }
  }

  const thresholds = {
    prepare: Math.max(38, Math.min(bestPrepare, bestEnter - 4)),
    enter: Math.max(58, bestEnter),
  };

  let enterEval = evaluateThreshold(rows, probs, thresholds.enter);
  if (enterEval.support === 0) {
    let fallbackThreshold = thresholds.enter;
    let fallbackEval = enterEval;
    let fallbackObjective = -Infinity;
    for (let t = Math.max(56, thresholds.prepare + 4); t <= 80; t += 2) {
      const m = evaluateThreshold(rows, probs, t);
      if (m.support === 0) continue;
      const objective = m.precision * 0.72 + m.recall * 0.18 + m.accuracy * 0.1;
      if (objective > fallbackObjective) {
        fallbackObjective = objective;
        fallbackThreshold = t;
        fallbackEval = m;
      }
    }

    if (fallbackEval.support > 0) {
      thresholds.enter = Math.max(thresholds.prepare + 4, fallbackThreshold);
      enterEval = fallbackEval;
    }
  }

  const prepareEval = evaluateThreshold(rows, probs, thresholds.prepare);

  return {
    thresholds,
    diagnostics: {
      targetEnterPrecision,
      targetPreparePrecision,
      enter: {
        threshold: thresholds.enter,
        precision: enterEval.precision,
        recall: enterEval.recall,
        accuracy: enterEval.accuracy,
        support: enterEval.support,
        signalRate: enterEval.signalRate,
      },
      prepare: {
        threshold: thresholds.prepare,
        precision: prepareEval.precision,
        recall: prepareEval.recall,
        accuracy: prepareEval.accuracy,
        support: prepareEval.support,
        signalRate: prepareEval.signalRate,
      },
    },
  };
}

export function trainCompressionModelFromLogs(logDir: string): TrainedModel {
  const now = Date.now();
  if (cachedModel && now - cachedModel.trainedAt <= MODEL_TTL_MS) {
    return cachedModel;
  }

  const breakoutHistory = parseJsonFile(path.join(logDir, "breakout_alert_history.json"));
  const edgeSamples = parseJsonFile(path.join(logDir, "edge_engine_samples.json"));
  const intakeSnapshots = parseJsonlFiles(logDir, "engine_intake_10m_");

  const rows = [
    ...rowsFromBreakoutHistory(breakoutHistory),
    ...rowsFromEdgeSamples(edgeSamples),
    ...rowsFromIntakeSnapshots(intakeSnapshots),
  ].sort((a, b) => a.timestamp - b.timestamp);

  const canHoldout = rows.length >= 220;
  const holdoutSize = canHoldout ? Math.min(300, Math.max(40, Math.floor(rows.length * 0.2))) : 0;
  const split = splitClassBalanced(rows, holdoutSize);
  const trainRows = split.trainRows;
  const holdoutRows = split.holdoutRows;
  const walkForward = evaluateWalkForward(rows);

  const tuned = selectBestCandidate(trainRows);
  const candidate = tuned.model;
  const priorModel = buildPriorOnlyModel(trainRows);
  const candidateEval = evaluateModel(candidate, holdoutRows, {
    alpha: tuned.calibrationAlpha,
    prior: tuned.priorPositiveRate,
  });
  const priorEval = evaluateModel(priorModel, holdoutRows);
  const incumbentEval = cachedModel
    ? evaluateModel({ weights: cachedModel.weights, bias: cachedModel.bias }, holdoutRows, {
      alpha: cachedModel.calibrationAlpha,
      prior: cachedModel.priorPositiveRate,
    })
    : null;
  const priorAccuracyBuffer = 0.05;

  const candidateBeatsPrior =
    holdoutRows.length === 0 ||
    candidateEval.brier <= priorEval.brier - 0.0005 ||
    (candidateEval.brier <= priorEval.brier + 0.0003 &&
      candidateEval.accuracy >= priorEval.accuracy + priorAccuracyBuffer);

  let accepted = true;
  if (incumbentEval && holdoutRows.length > 0) {
    const brierTolerance = 0.003;
    accepted = candidateEval.brier <= incumbentEval.brier + brierTolerance && candidateBeatsPrior;
  } else {
    accepted = candidateBeatsPrior;
  }

  const deployed = accepted
    ? {
      weights: candidate.weights,
      bias: candidate.bias,
      calibrationAlpha: tuned.calibrationAlpha,
      priorPositiveRate: tuned.priorPositiveRate,
    }
    : cachedModel
      ? {
        weights: cachedModel.weights,
        bias: cachedModel.bias,
        calibrationAlpha: cachedModel.calibrationAlpha,
        priorPositiveRate: cachedModel.priorPositiveRate,
      }
      : {
        weights: priorModel.weights,
        bias: priorModel.bias,
        calibrationAlpha: 0,
        priorPositiveRate: tuned.priorPositiveRate,
      };

  const thresholdRows = holdoutRows.length >= 60 ? holdoutRows : trainRows;
  const enterPrecisionTarget = walkForward
    ? Math.max(0.56, Math.min(0.72, 0.58 + (0.52 - walkForward.avgPositiveRate) * 0.2))
    : 0.6;
  const preparePrecisionTarget = Math.max(0.46, Math.min(0.62, enterPrecisionTarget - 0.1));
  const thresholdSelection = selectDecisionThresholds(deployed, thresholdRows, {
    alpha: deployed.calibrationAlpha,
    prior: deployed.priorPositiveRate,
  }, {
    enterPrecision: enterPrecisionTarget,
    preparePrecision: preparePrecisionTarget,
  });
  const thresholds = thresholdSelection.thresholds;

  const stats = buildStats(rows);
  if (holdoutRows.length > 0) {
    stats.validation = {
      sampleCount: holdoutRows.length,
      accuracy: candidateEval.accuracy,
      brier: candidateEval.brier,
      baselineBrier: candidateEval.baselineBrier,
      improvementVsBaseline: candidateEval.baselineBrier - candidateEval.brier,
      incumbentBrier: incumbentEval?.brier ?? null,
      accepted,
      walkForward,
    };
  }

  const trainingConfig = {
    lr: tuned.params.lr,
    l2: tuned.params.l2,
    epochs: tuned.params.epochs,
    calibrationAlpha: tuned.calibrationAlpha,
    tuningSampleCount: tuned.tuneEval ? Math.min(180, Math.max(30, Math.floor(trainRows.length * 0.2))) : 0,
    tuningAccuracy: tuned.tuneEval?.accuracy ?? null,
    tuningBrier: tuned.tuneEval?.brier ?? null,
    prepareThreshold: thresholds.prepare,
    enterThreshold: thresholds.enter,
    thresholdDiagnostics: thresholdSelection.diagnostics,
    holdoutPriorBrier: holdoutRows.length > 0 ? priorEval.brier : null,
    deployedSource: accepted ? "candidate" : cachedModel ? "cached" : "prior",
  };

  (stats as TrainStats & { trainingConfig?: typeof trainingConfig }).trainingConfig = trainingConfig;

  cachedModel = {
    weights: deployed.weights,
    bias: deployed.bias,
    calibrationAlpha: deployed.calibrationAlpha,
    priorPositiveRate: deployed.priorPositiveRate,
    thresholds,
    stats,
    trainedAt: now,
  };

  return cachedModel;
}

export function scoreCompressionOpportunity(
  model: TrainedModel,
  input: CompressionLiveInput,
): {
  aiScore: number;
  confidenceBand: "low" | "medium" | "high";
  modelProb: number;
  decision: "HOLD" | "PREPARE" | "ENTER";
  direction: "CALL" | "PUT" | "NEUTRAL";
  reasons: string[];
  priors: { symbolWinRate: number | null; timeframeWinRate: number | null };
  targetDeltaBand: { min: number; max: number };
  modelStats: TrainStats;
  runnerGate: {
    pass: boolean;
    blockers: string[];
  };
  priceActionSafety: {
    direction: string;
    strength: number;
    consistency: number;
    action: string;
    contradiction: boolean;
  };
} {
  const x = buildFeatureVector(input);
  const raw = sigmoid(dot(model.weights, x) + model.bias);
  const calibrated = clamp01(raw * model.calibrationAlpha + model.priorPositiveRate * (1 - model.calibrationAlpha));

  const symbolKey = String(input.symbol ?? "").toUpperCase();
  const timeframeKey = String(input.timeframe ?? "15m").toLowerCase();
  const symbolWinRate = model.stats.symbolWinRate[symbolKey] ?? null;
  const timeframeWinRate = model.stats.timeframeWinRate[timeframeKey] ?? null;

  // Blend model output with empirical priors to stabilize predictions.
  let blended = calibrated;
  if (symbolWinRate != null) blended = blended * 0.78 + symbolWinRate * 0.22;
  if (timeframeWinRate != null) blended = blended * 0.84 + timeframeWinRate * 0.16;

  const directional = dirToScalar(input.directionalBias);
  const direction = directional > 0.55 ? "CALL" : directional < 0.45 ? "PUT" : "NEUTRAL";

  const phase = String(input.phase ?? "WAIT").toUpperCase();
  const reasons: string[] = [];
  if (phase === "NOW" || phase === "READY") reasons.push(`Compression phase ${phase}`);
  if ((num(input.edgeScore) ?? 0) >= 80) reasons.push("Edge score strong");
  if ((num(input.triggerProbability) ?? 0) >= 75) reasons.push("Trigger probability elevated");
  if ((num(input.breakoutScore) ?? 0) >= 60) reasons.push("Breakout pressure confirmed");

  const priceActionStrength = clamp01((num(input.priceActionStrength) ?? 0) / 100);
  const priceActionConsistency = clamp01((num(input.priceActionConsistency) ?? 0) / 100);
  const priceActionDirection = String(input.priceActionDirection ?? "").toLowerCase();
  const priceActionSafetyAction = String(input.priceActionSafetyAction ?? "allow").toLowerCase();
  const priceActionContradiction = Boolean(num(input.priceActionContradiction) ?? 0);
  const bbWidth = num(input.bbWidth);
  const volRatio = num(input.volRatio);
  const preBreakoutScore = num(input.preBreakoutScore);
  const timeframeAgreement = num(input.timeframeAgreement);
  const edgeLeadMinutes = num(input.edgeLeadMinutes);
  const edgeState = String(input.edgeState ?? '').toUpperCase();

  let blendedScore = clamp01(blended);
  const sameDirection =
    (direction === "CALL" && priceActionDirection === "bullish") ||
    (direction === "PUT" && priceActionDirection === "bearish");
  const oppositeDirection =
    (direction === "CALL" && priceActionDirection === "bearish") ||
    (direction === "PUT" && priceActionDirection === "bullish");

  if (sameDirection && priceActionStrength >= 0.35) {
    const boost = 0.05 + Math.min(0.12, (priceActionStrength - 0.35) * 0.22 + (priceActionConsistency - 0.5) * 0.1);
    blendedScore = clamp01(blendedScore + boost);
    if (!reasons.includes(`Price action aligns with ${direction} (${Math.round(priceActionStrength * 100)}% strength)`)) {
      reasons.push(`Price action aligns with ${direction} (${Math.round(priceActionStrength * 100)}% strength)`);
    }
  }

  if (oppositeDirection && priceActionStrength >= 0.35) {
    const penalty = Math.min(0.22, 0.08 + (priceActionStrength - 0.35) * 0.24 + (priceActionConsistency - 0.5) * 0.08);
    blendedScore = clamp01(blendedScore - penalty);
    if (!reasons.includes(`Price action contradicts ${direction} (${Math.round(priceActionStrength * 100)}% strength)`)) {
      reasons.push(`Price action contradicts ${direction} (${Math.round(priceActionStrength * 100)}% strength)`);
    }
  }

  if (priceActionSafetyAction === "force_wait") {
    blendedScore = clamp01(blendedScore * 0.78);
    if (!reasons.includes("Safety suggestion: price action prefers waiting.")) {
      reasons.push("Safety suggestion: price action prefers waiting.");
    }
  } else if (priceActionSafetyAction === "reduce_confidence") {
    blendedScore = clamp01(blendedScore * 0.92);
    if (!reasons.includes("Safety suggestion: reduce confidence until alignment improves.")) {
      reasons.push("Safety suggestion: reduce confidence until alignment improves.");
    }
  }

  if (bbWidth != null) {
    if (bbWidth > 1.6) {
      blendedScore = clamp01(blendedScore - 0.12);
      reasons.push(`BB width expanded (${bbWidth.toFixed(2)}): compression edge fading.`);
    } else if (bbWidth >= 0.8 && bbWidth <= 1.35) {
      blendedScore = clamp01(blendedScore + 0.06);
      reasons.push(`BB width in expansion launch zone (${bbWidth.toFixed(2)}).`);
    }
  }

  if (volRatio != null) {
    if (volRatio >= 0.2 && volRatio <= 0.6) {
      blendedScore = clamp01(blendedScore + 0.05);
      reasons.push(`Volume ratio supportive (${volRatio.toFixed(2)}).`);
    } else if (volRatio < 0.1) {
      blendedScore = clamp01(blendedScore - 0.06);
      reasons.push(`Volume ratio too dry (${volRatio.toFixed(2)}).`);
    }
  }

  if (preBreakoutScore != null) {
    if (preBreakoutScore >= 75) {
      blendedScore = clamp01(blendedScore + 0.06);
      reasons.push(`Pre-breakout setup strong (${preBreakoutScore.toFixed(0)}).`);
    } else if (preBreakoutScore < 60) {
      blendedScore = clamp01(blendedScore - 0.05);
      reasons.push(`Pre-breakout setup weak (${preBreakoutScore.toFixed(0)}).`);
    }
  }

  if (timeframeAgreement != null) {
    if (timeframeAgreement >= 70) {
      blendedScore = clamp01(blendedScore + 0.05);
      reasons.push(`MTF stack aligned (${timeframeAgreement.toFixed(0)}%).`);
    } else if (timeframeAgreement < 55) {
      blendedScore = clamp01(blendedScore - 0.06);
      reasons.push(`MTF stack conflicted (${timeframeAgreement.toFixed(0)}%).`);
    }
  }

  if (edgeLeadMinutes != null) {
    if (edgeLeadMinutes <= 6) {
      blendedScore = clamp01(blendedScore + 0.04);
      reasons.push(`Edge lead window hot (${edgeLeadMinutes.toFixed(0)}m).`);
    } else if (edgeLeadMinutes > 12) {
      blendedScore = clamp01(blendedScore - 0.03);
      reasons.push(`Edge lead window stale (${edgeLeadMinutes.toFixed(0)}m).`);
    }
  }

  if (edgeState === 'TRIGGERED') {
    blendedScore = clamp01(blendedScore + 0.04);
    reasons.push('Edge state TRIGGERED.');
  } else if (edgeState === 'STANDBY') {
    blendedScore = clamp01(blendedScore - 0.03);
  }

  const aiScore = Math.round(blendedScore * 100);
  const confidenceBand = aiScore >= 75 ? "high" : aiScore >= 52 ? "medium" : "low";
  const runnerGate = evaluateRunnerGate(input);
  const enterThreshold = model.thresholds?.enter ?? DEFAULT_THRESHOLDS.enter;
  const prepareThreshold = model.thresholds?.prepare ?? DEFAULT_THRESHOLDS.prepare;
  const scoreBuffer = (num(input.confidence) ?? 0) >= 75 ? 2 : 0;
  const priceActionBuffer = priceActionSafetyAction === "force_wait" ? -10 : priceActionSafetyAction === "reduce_confidence" ? -4 : 0;

  const baseDecision: "HOLD" | "PREPARE" | "ENTER" =
    aiScore + scoreBuffer + priceActionBuffer >= enterThreshold
      ? "ENTER"
      : aiScore + scoreBuffer + priceActionBuffer >= prepareThreshold
        ? "PREPARE"
        : "HOLD";

  const decision: "HOLD" | "PREPARE" | "ENTER" =
    baseDecision === "ENTER"
      ? runnerGate.pass
        ? "ENTER"
        : aiScore >= 60
          ? "PREPARE"
          : "HOLD"
      : baseDecision;

  if (baseDecision === "ENTER" && !runnerGate.pass) {
    reasons.push(`Runner gate blocked (${runnerGate.blockers.join(",")})`);
  }
  if (decision === "ENTER") {
    reasons.push("Runner gate passed for 0DTE expansion attempt");
  }
  if (priceActionBuffer < 0) {
    reasons.push("Safety adjustment reduced entry aggression.");
  }
  if (symbolWinRate != null) reasons.push(`Symbol prior ${(symbolWinRate * 100).toFixed(0)}%`);
  if (timeframeWinRate != null) reasons.push(`Timeframe prior ${(timeframeWinRate * 100).toFixed(0)}%`);
  if (reasons.length === 0) reasons.push("No clear edge cluster yet");

  const targetDeltaBand =
    decision === "ENTER"
      ? { min: 0.2, max: 0.3 }
      : decision === "PREPARE"
        ? { min: 0.16, max: 0.24 }
        : { min: 0.1, max: 0.18 };

  return {
    aiScore,
    confidenceBand,
    modelProb: calibrated,
    decision,
    direction,
    reasons,
    priors: {
      symbolWinRate,
      timeframeWinRate,
    },
    targetDeltaBand,
    modelStats: model.stats,
    runnerGate,
    priceActionSafety: {
      direction: input.priceActionDirection ?? "neutral",
      strength: num(input.priceActionStrength) ?? 0,
      consistency: num(input.priceActionConsistency) ?? 0,
      action: input.priceActionSafetyAction ?? "allow",
      contradiction: priceActionContradiction,
    },
  };
}
