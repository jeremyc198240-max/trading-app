import fs from "fs";
import path from "path";

export type BreakoutSignal =
  | "BREAKOUT"
  | "BREAKDOWN"
  | "SQUEEZE"
  | "CONSOLIDATING"
  | "EXPANSION"
  | "BUILDING"
  | "MOMENTUM"
  | null;

export type BreakoutDirection = "bullish" | "bearish" | "neutral";
export type BreakoutOutcome = "win_t1" | "win_t2" | "loss" | "pending" | "missed";

export interface BreakoutCompressionSnapshot {
  sparkScore?: number;
  phase?: string;
  bbWidth?: string;
  rangePct?: string;
  volRatio?: string;
}

export interface BreakoutPreSetupSnapshot {
  score?: number;
  etaMinutes?: number;
  traits?: string[];
}

export interface BreakoutTimeframeStackSnapshot {
  agreement?: number;
  aggregateScore?: number;
  bias?: "bullish" | "bearish" | "mixed" | "neutral";
}

export interface BreakoutEdgeIndicatorSnapshot {
  rsi?: number;
  macdHistogram?: number;
  macdTrend?: "bullish" | "bearish" | "neutral";
  bbPercentB?: number;
  bbSqueeze?: boolean;
  stochasticK?: number;
  stochasticD?: number;
  adx?: number;
  tvRsi?: number;
  tvAdx?: number;
  tvRecommendAll?: number;
  momentum?: number;
  volumeSpike?: number;
  sarBias?: "above" | "below" | "neutral";
}

export interface BreakoutEdgeEngineSnapshot {
  signal?: "BREAK_UP" | "BREAK_DOWN" | "WAIT";
  direction?: "bullish" | "bearish" | "neutral";
  state?: "STANDBY" | "ARMING" | "PRIMED" | "TRIGGERED";
  edgeScore?: number;
  confidence?: number;
  leadMinutes?: number;
  triggerProbability?: number;
  reasons?: string[];
  indicators?: BreakoutEdgeIndicatorSnapshot;
}

export interface EdgeTuning2dLogEntry {
  rolledAt: number;
  windowHours: number;
  windowStart: number;
  windowEnd: number;
  sample: {
    edgeSampleCount: number;
    symbolCount: number;
    breakoutAlertCount: number;
    total: number;
    completed: number;
    wins: number;
    losses: number;
    missed: number;
    pending: number;
    winRate: number;
  };
  quality: {
    avgEdgeScore: number;
    avgConfidence: number;
    avgTriggerProbability: number;
    avgLeadMinutes: number;
  };
  indicatorMeans: {
    rsi: number;
    adx: number;
    stochK: number;
    bbPercentB: number;
    tvRsi: number;
    tvAdx: number;
    momentum: number;
    volumeSpike: number;
  };
  mix: {
    signal: Record<"BREAK_UP" | "BREAK_DOWN" | "WAIT", number>;
    state: Record<"STANDBY" | "ARMING" | "PRIMED" | "TRIGGERED", number>;
  };
  topReasons: Array<{ reason: string; count: number }>;
}

export interface EdgeTuningSampleInput {
  symbol: string;
  timeframe: string;
  timestamp: number;
  breakoutSignal?: BreakoutSignal;
  breakoutScore?: number;
  edgeEngine?: BreakoutEdgeEngineSnapshot;
}

interface EdgeTuningSample {
  timestamp: number;
  symbol: string;
  timeframe: string;
  breakoutSignal?: Exclude<BreakoutSignal, null>;
  breakoutScore?: number;
  edgeEngine: NonNullable<BreakoutAlertSnapshot["edgeEngine"]>;
}

export interface BreakoutAlertInput {
  symbol: string;
  timeframe: string;
  timestamp: number;
  lastPrice: number;
  priceChangePercent?: number;
  breakoutSignal?: BreakoutSignal;
  breakoutScore?: number;
  momentumStrength?: number;
  volumeSpike?: number;
  rsiValue?: number;
  healthScore?: number;
  healthGrade?: string;
  signalQuality?: "HIGH" | "MEDIUM" | "LOW" | "UNRELIABLE";
  expansionDirection?: "bullish" | "bearish" | null;
  tvRsi?: number;
  tvAdx?: number;
  tvRecommendAll?: number;
  tvTrendDirection?: "bullish" | "bearish" | "neutral";
  tvTrendStrength?: number;
  warnings?: string[];
  compression?: BreakoutCompressionSnapshot;
  preBreakoutSetup?: BreakoutPreSetupSnapshot;
  timeframeStack?: BreakoutTimeframeStackSnapshot;
  edgeEngine?: BreakoutEdgeEngineSnapshot;
}

export interface BreakoutAlertSnapshot {
  id: string;
  timestamp: number;
  symbol: string;
  timeframe: string;
  signal: Exclude<BreakoutSignal, null>;
  direction: BreakoutDirection;
  breakoutScore: number;
  priceChangePercent?: number;
  momentumStrength: number;
  volumeSpike: number;
  rsiValue: number;
  healthScore: number;
  healthGrade: string;
  signalQuality: "HIGH" | "MEDIUM" | "LOW" | "UNRELIABLE";
  tvRsi?: number;
  tvAdx?: number;
  tvRecommendAll?: number;
  tvTrendDirection?: "bullish" | "bearish" | "neutral";
  tvTrendStrength?: number;
  warnings: string[];
  compression: {
    sparkScore: number;
    phase: string;
    bbWidth: number;
    rangePct: number;
    volRatio: number;
  };
  preBreakoutSetup?: {
    score?: number;
    etaMinutes?: number;
    traits?: string[];
  };
  timeframeStack?: {
    agreement?: number;
    aggregateScore?: number;
    bias?: "bullish" | "bearish" | "mixed" | "neutral";
  };
  edgeEngine?: {
    signal?: "BREAK_UP" | "BREAK_DOWN" | "WAIT";
    direction?: "bullish" | "bearish" | "neutral";
    state?: "STANDBY" | "ARMING" | "PRIMED" | "TRIGGERED";
    edgeScore?: number;
    confidence?: number;
    leadMinutes?: number;
    triggerProbability?: number;
    reasons?: string[];
    indicators?: {
      rsi?: number;
      macdHistogram?: number;
      macdTrend?: "bullish" | "bearish" | "neutral";
      bbPercentB?: number;
      bbSqueeze?: boolean;
      stochasticK?: number;
      stochasticD?: number;
      adx?: number;
      tvRsi?: number;
      tvAdx?: number;
      tvRecommendAll?: number;
      momentum?: number;
      volumeSpike?: number;
      sarBias?: "above" | "below" | "neutral";
    };
  };
  priceAtCapture: number;
  stopLoss: number;
  targets: number[];
  priceNow?: number;
  priceDeltaPct?: number;
  maxPriceSeen: number;
  minPriceSeen: number;
  resolvedAt?: number;
  outcome: BreakoutOutcome;
  outcomeReason?: string;
}

export interface BreakoutAlertSummary {
  lookbackHours: number;
  sample: {
    total: number;
    completed: number;
    wins: number;
    losses: number;
    missed: number;
    pending: number;
    winRate: number;
  };
  bySignal: Record<string, {
    total: number;
    completed: number;
    wins: number;
    losses: number;
    missed: number;
    pending: number;
    winRate: number;
  }>;
  byDirection: Record<string, {
    total: number;
    completed: number;
    wins: number;
    losses: number;
    missed: number;
    pending: number;
    winRate: number;
  }>;
  lead5m: {
    total: number;
    completed: number;
    wins: number;
    losses: number;
    missed: number;
    pending: number;
    winRate: number;
    avgResolutionMins: number;
  };
  lead10m: {
    total: number;
    completed: number;
    wins: number;
    losses: number;
    missed: number;
    pending: number;
    winRate: number;
    avgResolutionMins: number;
  };
  avgResolutionMins: number;
}

const PROJECT_ROOT = process.cwd();
const STORAGE_PATH = path.resolve(PROJECT_ROOT, "logs", "breakout_alert_history.json");
const EDGE_TUNING_2D_STORAGE_PATH = path.resolve(PROJECT_ROOT, "logs", "edge_tuning_2d_log.jsonl");
const EDGE_SAMPLE_STORAGE_PATH = path.resolve(PROJECT_ROOT, "logs", "edge_engine_samples.json");
const MAX_LOOKBACK_HOURS = 48;
const RETENTION_MS = MAX_LOOKBACK_HOURS * 60 * 60 * 1000;
const RETENTION_SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const EDGE_TUNING_WINDOW_HOURS = 48;
const EDGE_TUNING_WINDOW_MS = EDGE_TUNING_WINDOW_HOURS * 60 * 60 * 1000;
const EDGE_SAMPLE_MIN_INTERVAL_MS = 45 * 1000;
const EDGE_TUNING_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const EDGE_TUNING_MAX_LOG_ROWS = 180;
const MIN_RECORD_INTERVAL_MINS = 6;
const MIN_RECORD_INTERVAL_SIGNAL_FLIP_MINS = 2;
const MIN_RECORD_INTERVAL_DRIFT_MINS = 3;
const MIN_BREAKOUT_SCORE = 60;
const OUTCOME_TIMEOUT_MINS = 180;
const OUTCOME_TIMEOUT_MOVE_PCT = 0.2;

const breakoutHistory: BreakoutAlertSnapshot[] = [];
let persistTimer: NodeJS.Timeout | null = null;
const edgeSamples: EdgeTuningSample[] = [];
let edgeSamplePersistTimer: NodeJS.Timeout | null = null;
const edgeTuning2dLog: EdgeTuning2dLogEntry[] = [];
let lastEdgeTuningRollAt = 0;
const lastEdgeSampleBySymbol = new Map<string, {
  timestamp: number;
  state?: "STANDBY" | "ARMING" | "PRIMED" | "TRIGGERED";
  signal?: "BREAK_UP" | "BREAK_DOWN" | "WAIT";
  edgeScore?: number;
}>();

function roundToCent(value: number): number {
  return Math.round(value * 100) / 100;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function ensureStorageDir(): void {
  const dir = path.dirname(STORAGE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function ensureDirFor(filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function persistToDisk(): void {
  try {
    ensureStorageDir();
    fs.writeFileSync(STORAGE_PATH, JSON.stringify(breakoutHistory), "utf8");
  } catch (error) {
    console.error("[BreakoutAlertHistory] Failed to persist:", error);
  }
}

function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistToDisk();
  }, 250);
}

function persistEdgeSamplesToDisk(): void {
  try {
    ensureDirFor(EDGE_SAMPLE_STORAGE_PATH);
    fs.writeFileSync(EDGE_SAMPLE_STORAGE_PATH, JSON.stringify(edgeSamples), "utf8");
  } catch (error) {
    console.error("[BreakoutAlertHistory] Failed to persist edge samples:", error);
  }
}

function scheduleEdgeSamplePersist(): void {
  if (edgeSamplePersistTimer) return;
  edgeSamplePersistTimer = setTimeout(() => {
    edgeSamplePersistTimer = null;
    persistEdgeSamplesToDisk();
  }, 300);
}

function pruneOld(now: number = Date.now()): void {
  const cutoff = now - RETENTION_MS;
  let breakoutWriteNeeded = false;
  let edgeSampleWriteNeeded = false;

  for (let i = breakoutHistory.length - 1; i >= 0; i--) {
    if (breakoutHistory[i].timestamp < cutoff) {
      breakoutHistory.splice(i, 1);
      breakoutWriteNeeded = true;
    }
  }

  for (let i = edgeSamples.length - 1; i >= 0; i--) {
    if (edgeSamples[i].timestamp < cutoff) {
      edgeSamples.splice(i, 1);
      edgeSampleWriteNeeded = true;
    }
  }

  if (breakoutWriteNeeded) {
    schedulePersist();
  }
  if (edgeSampleWriteNeeded) {
    scheduleEdgeSamplePersist();
  }
}

function hydrateFromDisk(): void {
  try {
    if (!fs.existsSync(STORAGE_PATH)) return;
    const raw = fs.readFileSync(STORAGE_PATH, "utf8");
    if (!raw?.trim()) return;

    const parsed = JSON.parse(raw) as BreakoutAlertSnapshot[];
    if (!Array.isArray(parsed)) return;

    breakoutHistory.length = 0;
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      if (typeof row.symbol !== "string") continue;
      if (!Number.isFinite(row.timestamp)) continue;
      if (typeof row.signal !== "string") continue;
      if (!Number.isFinite(row.priceAtCapture)) continue;
      if (!Array.isArray(row.targets) || row.targets.length === 0) continue;
      breakoutHistory.push(row);
    }

    pruneOld(Date.now());
  } catch (error) {
    console.error("[BreakoutAlertHistory] Failed to hydrate:", error);
  }
}

function hydrateEdgeSamplesFromDisk(): void {
  try {
    if (!fs.existsSync(EDGE_SAMPLE_STORAGE_PATH)) return;
    const raw = fs.readFileSync(EDGE_SAMPLE_STORAGE_PATH, "utf8");
    if (!raw.trim()) return;

    const parsed = JSON.parse(raw) as EdgeTuningSample[];
    if (!Array.isArray(parsed)) return;

    edgeSamples.length = 0;
    for (const row of parsed) {
      if (!row || typeof row !== "object") continue;
      if (!Number.isFinite(row.timestamp)) continue;
      if (typeof row.symbol !== "string") continue;
      if (!row.edgeEngine || typeof row.edgeEngine !== "object") continue;
      edgeSamples.push(row);

      const symbol = String(row.symbol).toUpperCase();
      const prev = lastEdgeSampleBySymbol.get(symbol);
      if (!prev || row.timestamp >= prev.timestamp) {
        lastEdgeSampleBySymbol.set(symbol, {
          timestamp: row.timestamp,
          state: row.edgeEngine.state,
          signal: row.edgeEngine.signal,
          edgeScore: row.edgeEngine.edgeScore,
        });
      }
    }

    pruneOld(Date.now());
  } catch (error) {
    console.error("[BreakoutAlertHistory] Failed to hydrate edge samples:", error);
  }
}

function average(values: number[]): number {
  if (!values.length) return 0;
  const sum = values.reduce((acc, value) => acc + value, 0);
  return sum / values.length;
}

function parseEdgeSnapshot(input?: BreakoutEdgeEngineSnapshot): BreakoutAlertSnapshot["edgeEngine"] | undefined {
  if (!input || typeof input !== "object") return undefined;

  const signalRaw = String(input.signal ?? "").toUpperCase();
  const signal = signalRaw === "BREAK_UP" || signalRaw === "BREAK_DOWN" || signalRaw === "WAIT"
    ? (signalRaw as "BREAK_UP" | "BREAK_DOWN" | "WAIT")
    : undefined;

  const directionRaw = String(input.direction ?? "").toLowerCase();
  const direction = directionRaw === "bullish" || directionRaw === "bearish" || directionRaw === "neutral"
    ? (directionRaw as "bullish" | "bearish" | "neutral")
    : undefined;

  const stateRaw = String(input.state ?? "").toUpperCase();
  const state = stateRaw === "STANDBY" || stateRaw === "ARMING" || stateRaw === "PRIMED" || stateRaw === "TRIGGERED"
    ? (stateRaw as "STANDBY" | "ARMING" | "PRIMED" | "TRIGGERED")
    : undefined;

  const indicatorsIn = input.indicators ?? {};
  const indicators: NonNullable<BreakoutAlertSnapshot["edgeEngine"]>["indicators"] = {
    rsi: Number.isFinite(indicatorsIn.rsi as number) ? parseNum(indicatorsIn.rsi) : undefined,
    macdHistogram: Number.isFinite(indicatorsIn.macdHistogram as number) ? parseNum(indicatorsIn.macdHistogram) : undefined,
    macdTrend:
      indicatorsIn.macdTrend === "bullish" || indicatorsIn.macdTrend === "bearish" || indicatorsIn.macdTrend === "neutral"
        ? indicatorsIn.macdTrend
        : undefined,
    bbPercentB: Number.isFinite(indicatorsIn.bbPercentB as number) ? parseNum(indicatorsIn.bbPercentB) : undefined,
    bbSqueeze: typeof indicatorsIn.bbSqueeze === "boolean" ? indicatorsIn.bbSqueeze : undefined,
    stochasticK: Number.isFinite(indicatorsIn.stochasticK as number) ? parseNum(indicatorsIn.stochasticK) : undefined,
    stochasticD: Number.isFinite(indicatorsIn.stochasticD as number) ? parseNum(indicatorsIn.stochasticD) : undefined,
    adx: Number.isFinite(indicatorsIn.adx as number) ? parseNum(indicatorsIn.adx) : undefined,
    tvRsi: Number.isFinite(indicatorsIn.tvRsi as number) ? parseNum(indicatorsIn.tvRsi) : undefined,
    tvAdx: Number.isFinite(indicatorsIn.tvAdx as number) ? parseNum(indicatorsIn.tvAdx) : undefined,
    tvRecommendAll: Number.isFinite(indicatorsIn.tvRecommendAll as number) ? parseNum(indicatorsIn.tvRecommendAll) : undefined,
    momentum: Number.isFinite(indicatorsIn.momentum as number) ? parseNum(indicatorsIn.momentum) : undefined,
    volumeSpike: Number.isFinite(indicatorsIn.volumeSpike as number) ? parseNum(indicatorsIn.volumeSpike) : undefined,
    sarBias:
      indicatorsIn.sarBias === "above" || indicatorsIn.sarBias === "below" || indicatorsIn.sarBias === "neutral"
        ? indicatorsIn.sarBias
        : undefined,
  };

  const reasons = Array.isArray(input.reasons)
    ? input.reasons.map((reason) => String(reason).trim()).filter(Boolean).slice(0, 8)
    : undefined;

  const snapshot: BreakoutAlertSnapshot["edgeEngine"] = {
    signal,
    direction,
    state,
    edgeScore: Number.isFinite(input.edgeScore as number) ? parseNum(input.edgeScore) : undefined,
    confidence: Number.isFinite(input.confidence as number) ? parseNum(input.confidence) : undefined,
    leadMinutes: Number.isFinite(input.leadMinutes as number) ? parseNum(input.leadMinutes) : undefined,
    triggerProbability: Number.isFinite(input.triggerProbability as number) ? parseNum(input.triggerProbability) : undefined,
    reasons,
    indicators,
  };

  const hasAnyField =
    snapshot.signal != null ||
    snapshot.direction != null ||
    snapshot.state != null ||
    snapshot.edgeScore != null ||
    snapshot.confidence != null ||
    snapshot.leadMinutes != null ||
    snapshot.triggerProbability != null ||
    (snapshot.reasons != null && snapshot.reasons.length > 0) ||
    Object.values(snapshot.indicators ?? {}).some((value) => value != null);

  return hasAnyField ? snapshot : undefined;
}

function hydrateEdgeTuning2dLog(): void {
  try {
    if (!fs.existsSync(EDGE_TUNING_2D_STORAGE_PATH)) return;
    const raw = fs.readFileSync(EDGE_TUNING_2D_STORAGE_PATH, "utf8");
    if (!raw.trim()) return;

    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    edgeTuning2dLog.length = 0;
    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as EdgeTuning2dLogEntry;
        if (!parsed || !Number.isFinite(parsed.rolledAt)) continue;
        edgeTuning2dLog.push(parsed);
      } catch {
        // Ignore malformed lines.
      }
    }

    edgeTuning2dLog.sort((a, b) => a.rolledAt - b.rolledAt);
    if (edgeTuning2dLog.length > EDGE_TUNING_MAX_LOG_ROWS) {
      edgeTuning2dLog.splice(0, edgeTuning2dLog.length - EDGE_TUNING_MAX_LOG_ROWS);
    }

    lastEdgeTuningRollAt = edgeTuning2dLog.length > 0
      ? edgeTuning2dLog[edgeTuning2dLog.length - 1].rolledAt
      : 0;
  } catch (error) {
    console.error("[BreakoutAlertHistory] Failed to hydrate 2d edge tuning log:", error);
  }
}

function persistEdgeTuning2dLog(): void {
  try {
    ensureDirFor(EDGE_TUNING_2D_STORAGE_PATH);
    const rows = edgeTuning2dLog
      .slice(-EDGE_TUNING_MAX_LOG_ROWS)
      .map((entry) => JSON.stringify(entry))
      .join("\n");
    fs.writeFileSync(
      EDGE_TUNING_2D_STORAGE_PATH,
      rows.length > 0 ? `${rows}\n` : "",
      "utf8",
    );
  } catch (error) {
    console.error("[BreakoutAlertHistory] Failed to persist 2d edge tuning log:", error);
  }
}

function buildEdgeTuning2dEntry(now: number): EdgeTuning2dLogEntry | null {
  const windowStart = now - EDGE_TUNING_WINDOW_MS;
  const scopedEdgeSamples = edgeSamples.filter(
    (row) => row.timestamp >= windowStart && row.timestamp <= now && row.edgeEngine,
  );
  if (!scopedEdgeSamples.length) return null;

  const scopedAlerts = breakoutHistory.filter(
    (row) => row.timestamp >= windowStart && row.timestamp <= now && row.edgeEngine,
  );
  const alertOutcomes = summarizeRows(scopedAlerts);
  const sample: EdgeTuning2dLogEntry["sample"] = {
    edgeSampleCount: scopedEdgeSamples.length,
    symbolCount: new Set(scopedEdgeSamples.map((row) => row.symbol)).size,
    breakoutAlertCount: scopedAlerts.length,
    ...alertOutcomes,
  };

  const edgeScores = scopedEdgeSamples
    .map((row) => row.edgeEngine.edgeScore)
    .filter((value): value is number => Number.isFinite(value as number));
  const confidences = scopedEdgeSamples
    .map((row) => row.edgeEngine.confidence)
    .filter((value): value is number => Number.isFinite(value as number));
  const triggerProbs = scopedEdgeSamples
    .map((row) => row.edgeEngine.triggerProbability)
    .filter((value): value is number => Number.isFinite(value as number));
  const leadMinutes = scopedEdgeSamples
    .map((row) => row.edgeEngine.leadMinutes)
    .filter((value): value is number => Number.isFinite(value as number));

  const rsiValues = scopedEdgeSamples
    .map((row) => row.edgeEngine.indicators?.rsi)
    .filter((value): value is number => Number.isFinite(value as number));
  const adxValues = scopedEdgeSamples
    .map((row) => row.edgeEngine.indicators?.adx)
    .filter((value): value is number => Number.isFinite(value as number));
  const stochKValues = scopedEdgeSamples
    .map((row) => row.edgeEngine.indicators?.stochasticK)
    .filter((value): value is number => Number.isFinite(value as number));
  const bbPercentBValues = scopedEdgeSamples
    .map((row) => row.edgeEngine.indicators?.bbPercentB)
    .filter((value): value is number => Number.isFinite(value as number));
  const tvRsiValues = scopedEdgeSamples
    .map((row) => row.edgeEngine.indicators?.tvRsi)
    .filter((value): value is number => Number.isFinite(value as number));
  const tvAdxValues = scopedEdgeSamples
    .map((row) => row.edgeEngine.indicators?.tvAdx)
    .filter((value): value is number => Number.isFinite(value as number));
  const momentumValues = scopedEdgeSamples
    .map((row) => row.edgeEngine.indicators?.momentum)
    .filter((value): value is number => Number.isFinite(value as number));
  const volumeSpikeValues = scopedEdgeSamples
    .map((row) => row.edgeEngine.indicators?.volumeSpike)
    .filter((value): value is number => Number.isFinite(value as number));

  const signalMix: EdgeTuning2dLogEntry["mix"]["signal"] = {
    BREAK_UP: 0,
    BREAK_DOWN: 0,
    WAIT: 0,
  };
  const stateMix: EdgeTuning2dLogEntry["mix"]["state"] = {
    STANDBY: 0,
    ARMING: 0,
    PRIMED: 0,
    TRIGGERED: 0,
  };
  const reasonCounts = new Map<string, number>();

  for (const row of scopedEdgeSamples) {
    const signal = row.edgeEngine.signal;
    if (signal && signal in signalMix) {
      signalMix[signal] += 1;
    }

    const state = row.edgeEngine.state;
    if (state && state in stateMix) {
      stateMix[state] += 1;
    }

    for (const reason of row.edgeEngine.reasons ?? []) {
      const normalized = String(reason).trim();
      if (!normalized) continue;
      reasonCounts.set(normalized, (reasonCounts.get(normalized) ?? 0) + 1);
    }
  }

  const topReasons = Array.from(reasonCounts.entries())
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  return {
    rolledAt: now,
    windowHours: EDGE_TUNING_WINDOW_HOURS,
    windowStart,
    windowEnd: now,
    sample,
    quality: {
      avgEdgeScore: roundToCent(average(edgeScores)),
      avgConfidence: roundToCent(average(confidences)),
      avgTriggerProbability: roundToCent(average(triggerProbs)),
      avgLeadMinutes: roundToCent(average(leadMinutes)),
    },
    indicatorMeans: {
      rsi: roundToCent(average(rsiValues)),
      adx: roundToCent(average(adxValues)),
      stochK: roundToCent(average(stochKValues)),
      bbPercentB: roundToCent(average(bbPercentBValues)),
      tvRsi: roundToCent(average(tvRsiValues)),
      tvAdx: roundToCent(average(tvAdxValues)),
      momentum: roundToCent(average(momentumValues)),
      volumeSpike: roundToCent(average(volumeSpikeValues)),
    },
    mix: {
      signal: signalMix,
      state: stateMix,
    },
    topReasons,
  };
}

function maybeRollEdgeTuning2d(now: number = Date.now(), options?: { force?: boolean }): EdgeTuning2dLogEntry | null {
  const force = Boolean(options?.force);
  if (!force && lastEdgeTuningRollAt > 0 && now - lastEdgeTuningRollAt < EDGE_TUNING_WINDOW_MS) {
    return null;
  }

  const next = buildEdgeTuning2dEntry(now);
  if (!next) {
    if (lastEdgeTuningRollAt === 0) {
      // Start cadence even if no qualifying entries yet.
      lastEdgeTuningRollAt = now;
    }
    return null;
  }

  if (!force && edgeTuning2dLog.length > 0) {
    const last = edgeTuning2dLog[edgeTuning2dLog.length - 1];
    if (Math.abs(last.windowEnd - next.windowEnd) < 60_000) {
      return null;
    }
  }

  edgeTuning2dLog.push(next);
  if (edgeTuning2dLog.length > EDGE_TUNING_MAX_LOG_ROWS) {
    edgeTuning2dLog.splice(0, edgeTuning2dLog.length - EDGE_TUNING_MAX_LOG_ROWS);
  }
  lastEdgeTuningRollAt = next.rolledAt;
  persistEdgeTuning2dLog();
  return next;
}

hydrateFromDisk();
hydrateEdgeSamplesFromDisk();
hydrateEdgeTuning2dLog();

const breakoutRetentionSweep = setInterval(() => {
  pruneOld(Date.now());
}, RETENTION_SWEEP_INTERVAL_MS);
breakoutRetentionSweep.unref?.();

const edgeTuning2dSweep = setInterval(() => {
  maybeRollEdgeTuning2d(Date.now());
}, EDGE_TUNING_CHECK_INTERVAL_MS);
edgeTuning2dSweep.unref?.();

// Bootstrap at startup so cadence starts immediately in fresh environments.
maybeRollEdgeTuning2d(Date.now(), { force: true });

function parseNum(value: unknown, fallback: number = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toDirection(input: BreakoutAlertInput): BreakoutDirection {
  const signal = String(input.breakoutSignal ?? "").toUpperCase();
  if (signal === "BREAKOUT") return "bullish";
  if (signal === "BREAKDOWN") return "bearish";

  if (signal === "EXPANSION" || signal === "MOMENTUM") {
    if (input.expansionDirection === "bullish") return "bullish";
    if (input.expansionDirection === "bearish") return "bearish";
    const momentum = parseNum(input.momentumStrength, 0);
    if (momentum >= 0) return "bullish";
    return "bearish";
  }

  const momentum = parseNum(input.momentumStrength, 0);
  if (momentum >= 12) return "bullish";
  if (momentum <= -12) return "bearish";
  return "neutral";
}

function isTrackableSignal(signal: BreakoutSignal): signal is Exclude<BreakoutSignal, null> {
  const upper = String(signal ?? "").toUpperCase();
  return (
    upper === "BREAKOUT" ||
    upper === "BREAKDOWN" ||
    upper === "EXPANSION" ||
    upper === "MOMENTUM" ||
    upper === "BUILDING" ||
    upper === "SQUEEZE"
  );
}

function isCardCandidate(input: BreakoutAlertInput): boolean {
  const signal: BreakoutSignal = input.breakoutSignal ?? null;
  if (!isTrackableSignal(signal)) return false;

  const breakoutScore = parseNum(input.breakoutScore, 0);
  if (breakoutScore < MIN_BREAKOUT_SCORE) return false;

  const quality = String(input.signalQuality ?? "LOW").toUpperCase();
  if (quality === "UNRELIABLE") return false;

  const momentumAbs = Math.abs(parseNum(input.momentumStrength, 0));
  if ((signal === "BREAKOUT" || signal === "BREAKDOWN" || signal === "EXPANSION") && momentumAbs < 12) {
    return false;
  }

  if (signal === "MOMENTUM") {
    if (quality !== "HIGH") return false;
    if (breakoutScore < 68) return false;
    if (momentumAbs < 26) return false;
  }

  if ((signal === "BREAKOUT" || signal === "BREAKDOWN" || signal === "EXPANSION") && quality === "LOW" && breakoutScore < 72) {
    return false;
  }

  const warnings = new Set((input.warnings ?? []).map((warning) => String(warning).toUpperCase()));
  const hasTrendConflict = warnings.has("TREND_CONFLICT") || warnings.has("TV_TREND_CONFLICT");
  if (hasTrendConflict && breakoutScore < 74) return false;
  if (warnings.has("LATE_PHASE_UNCONFIRMED") && breakoutScore < 76) return false;

  return true;
}

function buildLevels(entryPrice: number, direction: BreakoutDirection): { stopLoss: number; targets: number[] } {
  if (direction === "bearish") {
    return {
      stopLoss: roundToCent(entryPrice * 1.005),
      targets: [
        roundToCent(entryPrice * 0.996),
        roundToCent(entryPrice * 0.993),
      ],
    };
  }

  return {
    stopLoss: roundToCent(entryPrice * 0.995),
    targets: [
      roundToCent(entryPrice * 1.004),
      roundToCent(entryPrice * 1.007),
    ],
  };
}

function shouldRecord(input: BreakoutAlertInput, direction: BreakoutDirection): boolean {
  const now = input.timestamp;
  const signal = String(input.breakoutSignal ?? "").toUpperCase();
  const isDirectionalSignal =
    signal === "BREAKOUT" ||
    signal === "BREAKDOWN" ||
    signal === "EXPANSION" ||
    signal === "MOMENTUM";

  for (let i = breakoutHistory.length - 1; i >= 0; i--) {
    const last = breakoutHistory[i];
    if (last.symbol !== input.symbol) continue;

    const minsSince = (now - last.timestamp) / 60000;
    const signalChanged = last.signal !== String(input.breakoutSignal).toUpperCase();
    const directionChanged =
      last.direction !== direction &&
      last.direction !== "neutral" &&
      direction !== "neutral";
    const scoreChanged = Math.abs(last.breakoutScore - parseNum(input.breakoutScore, 0)) >= 8;
    const momentumChanged = Math.abs(last.momentumStrength - parseNum(input.momentumStrength, 0)) >= 12;

    if (minsSince >= MIN_RECORD_INTERVAL_MINS) return true;

    if (signalChanged && minsSince >= MIN_RECORD_INTERVAL_SIGNAL_FLIP_MINS) {
      return true;
    }

    if (isDirectionalSignal && directionChanged && minsSince >= MIN_RECORD_INTERVAL_SIGNAL_FLIP_MINS) {
      return true;
    }

    if ((scoreChanged || momentumChanged) && minsSince >= MIN_RECORD_INTERVAL_DRIFT_MINS) {
      return true;
    }

    return false;
  }

  return true;
}

export function recordBreakoutAlert(input: BreakoutAlertInput): void {
  const now = Number.isFinite(input.timestamp) ? input.timestamp : Date.now();
  pruneOld(now);

  if (!input.symbol || !Number.isFinite(input.lastPrice) || input.lastPrice <= 0) return;
  if (!isCardCandidate(input)) return;

  const signal = String(input.breakoutSignal).toUpperCase() as Exclude<BreakoutSignal, null>;
  const direction = toDirection(input);
  if (!shouldRecord(input, direction)) return;

  const entryPrice = input.lastPrice;
  const levels = buildLevels(entryPrice, direction);
  const compression = input.compression || {};
  const tvRsi = Number.isFinite(input.tvRsi as number) ? parseNum(input.tvRsi) : undefined;
  const tvAdx = Number.isFinite(input.tvAdx as number) ? parseNum(input.tvAdx) : undefined;
  const tvRecommendAll = Number.isFinite(input.tvRecommendAll as number)
    ? parseNum(input.tvRecommendAll)
    : undefined;
  const tvTrendStrength = Number.isFinite(input.tvTrendStrength as number)
    ? parseNum(input.tvTrendStrength)
    : undefined;
  const tvTrendDirection = input.tvTrendDirection === "bullish" || input.tvTrendDirection === "bearish" || input.tvTrendDirection === "neutral"
    ? input.tvTrendDirection
    : undefined;
  const priceChangePercent = Number.isFinite(input.priceChangePercent as number)
    ? parseNum(input.priceChangePercent)
    : undefined;
  const setupScore = Number.isFinite(input.preBreakoutSetup?.score as number)
    ? parseNum(input.preBreakoutSetup?.score)
    : undefined;
  const setupEtaRaw = Number(input.preBreakoutSetup?.etaMinutes);
  const setupEtaMinutes = Number.isFinite(setupEtaRaw)
    ? clamp(Math.round(setupEtaRaw), 0, 120)
    : undefined;
  const setupTraits = Array.isArray(input.preBreakoutSetup?.traits)
    ? input.preBreakoutSetup!.traits!.slice(0, 10).map((trait) => String(trait)).filter(Boolean)
    : undefined;

  const stackAgreement = Number.isFinite(input.timeframeStack?.agreement as number)
    ? clamp(parseNum(input.timeframeStack?.agreement), 0, 100)
    : undefined;
  const stackAggregateScore = Number.isFinite(input.timeframeStack?.aggregateScore as number)
    ? clamp(parseNum(input.timeframeStack?.aggregateScore), 0, 100)
    : undefined;
  const stackBiasRaw = String(input.timeframeStack?.bias ?? "").toLowerCase();
  const stackBias = stackBiasRaw === "bullish" || stackBiasRaw === "bearish" || stackBiasRaw === "mixed" || stackBiasRaw === "neutral"
    ? (stackBiasRaw as "bullish" | "bearish" | "mixed" | "neutral")
    : undefined;

  const leadSetup =
    setupScore != null || setupEtaMinutes != null || (setupTraits && setupTraits.length > 0)
      ? {
        score: setupScore,
        etaMinutes: setupEtaMinutes,
        traits: setupTraits,
      }
      : undefined;

  const stackSnapshot =
    stackAgreement != null || stackAggregateScore != null || stackBias != null
      ? {
        agreement: stackAgreement,
        aggregateScore: stackAggregateScore,
        bias: stackBias,
      }
      : undefined;
  const id = `${input.symbol}-${now}-${Math.floor(Math.random() * 1e6).toString(36)}`;

  const snapshot: BreakoutAlertSnapshot = {
    id,
    timestamp: now,
    symbol: input.symbol.toUpperCase(),
    timeframe: input.timeframe || "15m",
    signal,
    direction,
    breakoutScore: parseNum(input.breakoutScore, 0),
    priceChangePercent,
    momentumStrength: parseNum(input.momentumStrength, 0),
    volumeSpike: parseNum(input.volumeSpike, 1),
    rsiValue: parseNum(input.rsiValue, 50),
    healthScore: parseNum(input.healthScore, 50),
    healthGrade: String(input.healthGrade || "C"),
    signalQuality: input.signalQuality || "LOW",
    tvRsi,
    tvAdx,
    tvRecommendAll,
    tvTrendDirection,
    tvTrendStrength,
    warnings: Array.isArray(input.warnings) ? input.warnings.slice(0, 10) : [],
    compression: {
      sparkScore: parseNum(compression.sparkScore, 0),
      phase: String(compression.phase || "WAIT"),
      bbWidth: parseNum(compression.bbWidth, 0),
      rangePct: parseNum(compression.rangePct, 0),
      volRatio: parseNum(compression.volRatio, 0),
    },
    preBreakoutSetup: leadSetup,
    timeframeStack: stackSnapshot,
    edgeEngine: parseEdgeSnapshot(input.edgeEngine),
    priceAtCapture: entryPrice,
    stopLoss: levels.stopLoss,
    targets: levels.targets,
    maxPriceSeen: entryPrice,
    minPriceSeen: entryPrice,
    outcome: "pending",
  };

  breakoutHistory.push(snapshot);
  schedulePersist();
}

export function recordEdgeTuningSample(input: EdgeTuningSampleInput): void {
  const now = Number.isFinite(input.timestamp) ? Number(input.timestamp) : Date.now();
  pruneOld(now);

  if (!input.symbol) return;

  const parsedEdge = parseEdgeSnapshot(input.edgeEngine);
  if (!parsedEdge) return;

  const symbol = String(input.symbol).toUpperCase();
  const prev = lastEdgeSampleBySymbol.get(symbol);
  const nextScore = Number.isFinite(parsedEdge.edgeScore as number) ? Number(parsedEdge.edgeScore) : 0;

  if (prev && (now - prev.timestamp) < EDGE_SAMPLE_MIN_INTERVAL_MS) {
    const stateChanged = prev.state !== parsedEdge.state;
    const signalChanged = prev.signal !== parsedEdge.signal;
    const scoreMoved = Math.abs((prev.edgeScore ?? 0) - nextScore) >= 3;
    if (!stateChanged && !signalChanged && !scoreMoved) {
      return;
    }
  }

  const timeframe = String(input.timeframe || "15m");
  const signalRaw = String(input.breakoutSignal ?? "").toUpperCase();
  const breakoutSignal =
    signalRaw === "BREAKOUT" ||
    signalRaw === "BREAKDOWN" ||
    signalRaw === "SQUEEZE" ||
    signalRaw === "CONSOLIDATING" ||
    signalRaw === "EXPANSION" ||
    signalRaw === "BUILDING" ||
    signalRaw === "MOMENTUM"
      ? (signalRaw as Exclude<BreakoutSignal, null>)
      : undefined;

  const sample: EdgeTuningSample = {
    timestamp: now,
    symbol,
    timeframe,
    breakoutSignal,
    breakoutScore: Number.isFinite(input.breakoutScore as number) ? parseNum(input.breakoutScore) : undefined,
    edgeEngine: parsedEdge,
  };

  edgeSamples.push(sample);
  lastEdgeSampleBySymbol.set(symbol, {
    timestamp: now,
    state: parsedEdge.state,
    signal: parsedEdge.signal,
    edgeScore: parsedEdge.edgeScore,
  });

  scheduleEdgeSamplePersist();
}

export function updateBreakoutAlertOutcomes(
  symbol: string,
  currentPrice: number,
  context?: { high?: number; low?: number; now?: number }
): void {
  if (!symbol || !Number.isFinite(currentPrice) || currentPrice <= 0) return;

  const now = Number.isFinite(context?.now) ? Number(context?.now) : Date.now();
  pruneOld(now);

  const sym = symbol.toUpperCase();
  const observedHigh = Math.max(currentPrice, parseNum(context?.high, currentPrice));
  const observedLow = Math.min(currentPrice, parseNum(context?.low, currentPrice));
  let mutated = false;

  for (const row of breakoutHistory) {
    if (row.symbol !== sym || row.outcome !== "pending") continue;

    mutated = true;
    row.priceNow = currentPrice;
    row.maxPriceSeen = Math.max(row.maxPriceSeen, observedHigh);
    row.minPriceSeen = Math.min(row.minPriceSeen, observedLow);

    const deltaPct = row.priceAtCapture > 0 ? ((currentPrice - row.priceAtCapture) / row.priceAtCapture) * 100 : 0;
    row.priceDeltaPct = deltaPct;

    const t1 = row.targets[0] ?? row.priceAtCapture;
    const t2 = row.targets[1] ?? t1;
    const ageMins = (now - row.timestamp) / 60000;

    if (row.direction === "bullish") {
      const stopTouched = observedLow <= row.stopLoss;
      const t1Touched = observedHigh >= t1;
      const t2Touched = observedHigh >= t2;

      if (stopTouched && (t1Touched || t2Touched)) {
        row.outcome = "missed";
        row.outcomeReason = "whipsaw";
        row.resolvedAt = now;
      } else if (stopTouched) {
        row.outcome = "loss";
        row.outcomeReason = "stop_hit";
        row.resolvedAt = now;
      } else if (t2Touched) {
        row.outcome = "win_t2";
        row.outcomeReason = "target2_hit";
        row.resolvedAt = now;
      } else if (t1Touched) {
        row.outcome = "win_t1";
        row.outcomeReason = "target1_hit";
        row.resolvedAt = now;
      } else if (ageMins > OUTCOME_TIMEOUT_MINS) {
        row.outcome = deltaPct >= OUTCOME_TIMEOUT_MOVE_PCT ? "win_t1" : "missed";
        row.outcomeReason = row.outcome === "win_t1" ? "timeout_positive" : "timeout_flat";
        row.resolvedAt = now;
      }
      continue;
    }

    if (row.direction === "bearish") {
      const stopTouched = observedHigh >= row.stopLoss;
      const t1Touched = observedLow <= t1;
      const t2Touched = observedLow <= t2;

      if (stopTouched && (t1Touched || t2Touched)) {
        row.outcome = "missed";
        row.outcomeReason = "whipsaw";
        row.resolvedAt = now;
      } else if (stopTouched) {
        row.outcome = "loss";
        row.outcomeReason = "stop_hit";
        row.resolvedAt = now;
      } else if (t2Touched) {
        row.outcome = "win_t2";
        row.outcomeReason = "target2_hit";
        row.resolvedAt = now;
      } else if (t1Touched) {
        row.outcome = "win_t1";
        row.outcomeReason = "target1_hit";
        row.resolvedAt = now;
      } else if (ageMins > OUTCOME_TIMEOUT_MINS) {
        row.outcome = deltaPct <= -OUTCOME_TIMEOUT_MOVE_PCT ? "win_t1" : "missed";
        row.outcomeReason = row.outcome === "win_t1" ? "timeout_positive" : "timeout_flat";
        row.resolvedAt = now;
      }
      continue;
    }

    if (ageMins > OUTCOME_TIMEOUT_MINS) {
      row.outcome = "missed";
      row.outcomeReason = "timeout_no_direction";
      row.resolvedAt = now;
    }
  }

  if (mutated) {
    schedulePersist();
  }
}

export function getBreakoutAlertLog(limit: number = 200, symbol?: string, lookbackHours?: number): BreakoutAlertSnapshot[] {
  pruneOld(Date.now());

  const bounded = Number.isFinite(limit) && limit > 0 ? Math.min(2000, Math.floor(limit)) : 200;
  const boundedHours = Number.isFinite(lookbackHours) && (lookbackHours as number) > 0
    ? Math.min(MAX_LOOKBACK_HOURS, Math.floor(lookbackHours as number))
    : null;
  const cutoff = boundedHours != null ? Date.now() - boundedHours * 60 * 60 * 1000 : null;
  const sym = symbol ? symbol.toUpperCase() : null;
  const scoped = sym
    ? breakoutHistory.filter((row) => row.symbol === sym)
    : breakoutHistory;
  const filtered = cutoff != null
    ? scoped.filter((row) => row.timestamp >= cutoff)
    : scoped;

  return filtered.slice(-bounded).reverse();
}

function summarizeRows(rows: BreakoutAlertSnapshot[]): {
  total: number;
  completed: number;
  wins: number;
  losses: number;
  missed: number;
  pending: number;
  winRate: number;
} {
  const completed = rows.filter((row) => row.outcome !== "pending");
  const wins = completed.filter((row) => row.outcome === "win_t1" || row.outcome === "win_t2").length;
  const losses = completed.filter((row) => row.outcome === "loss").length;
  const missed = completed.filter((row) => row.outcome === "missed").length;
  const pending = rows.filter((row) => row.outcome === "pending").length;
  const decisive = wins + losses;

  return {
    total: rows.length,
    completed: completed.length,
    wins,
    losses,
    missed,
    pending,
    winRate: decisive > 0 ? (wins / decisive) * 100 : 0,
  };
}

function computeAvgResolutionMins(rows: BreakoutAlertSnapshot[]): number {
  const resolutionSamples = rows
    .filter((row) => row.resolvedAt && row.resolvedAt > row.timestamp)
    .map((row) => ((row.resolvedAt as number) - row.timestamp) / 60000)
    .filter((mins) => Number.isFinite(mins) && mins >= 0);

  return resolutionSamples.length > 0
    ? resolutionSamples.reduce((sum, mins) => sum + mins, 0) / resolutionSamples.length
    : 0;
}

export function getBreakoutAlertSummary(lookbackHours: number = 48): BreakoutAlertSummary {
  pruneOld(Date.now());

  const boundedHours = Number.isFinite(lookbackHours) && lookbackHours > 0
    ? Math.min(MAX_LOOKBACK_HOURS, lookbackHours)
    : Math.min(48, MAX_LOOKBACK_HOURS);
  const cutoff = Date.now() - boundedHours * 60 * 60 * 1000;
  const scoped = breakoutHistory.filter((row) => row.timestamp >= cutoff);

  const bySignal: BreakoutAlertSummary["bySignal"] = {};
  const byDirection: BreakoutAlertSummary["byDirection"] = {};

  for (const row of scoped) {
    if (!bySignal[row.signal]) bySignal[row.signal] = summarizeRows([]);
    if (!byDirection[row.direction]) byDirection[row.direction] = summarizeRows([]);
  }

  for (const signal of Object.keys(bySignal)) {
    bySignal[signal] = summarizeRows(scoped.filter((row) => row.signal === signal));
  }
  for (const direction of Object.keys(byDirection)) {
    byDirection[direction] = summarizeRows(scoped.filter((row) => row.direction === direction));
  }

  const lead5Rows = scoped.filter((row) => {
    const eta = Number(row.preBreakoutSetup?.etaMinutes);
    return Number.isFinite(eta) && eta <= 5;
  });
  const lead10Rows = scoped.filter((row) => {
    const eta = Number(row.preBreakoutSetup?.etaMinutes);
    return Number.isFinite(eta) && eta <= 10;
  });

  const overall = summarizeRows(scoped);
  const avgResolutionMins = computeAvgResolutionMins(scoped);
  const lead5Summary = summarizeRows(lead5Rows);
  const lead10Summary = summarizeRows(lead10Rows);

  return {
    lookbackHours: boundedHours,
    sample: overall,
    bySignal,
    byDirection,
    lead5m: {
      ...lead5Summary,
      avgResolutionMins: computeAvgResolutionMins(lead5Rows),
    },
    lead10m: {
      ...lead10Summary,
      avgResolutionMins: computeAvgResolutionMins(lead10Rows),
    },
    avgResolutionMins,
  };
}

export function getEdgeTuning2dSnapshot(): EdgeTuning2dLogEntry | null {
  pruneOld(Date.now());
  return buildEdgeTuning2dEntry(Date.now());
}

export function getEdgeTuning2dLog(limit: number = 30): EdgeTuning2dLogEntry[] {
  const bounded = Number.isFinite(limit) && limit > 0 ? Math.min(EDGE_TUNING_MAX_LOG_ROWS, Math.floor(limit)) : 30;
  return edgeTuning2dLog.slice(-bounded).reverse();
}

export function collectEdgeTuning2dNow(): EdgeTuning2dLogEntry | null {
  pruneOld(Date.now());
  return maybeRollEdgeTuning2d(Date.now(), { force: true });
}

export function clearBreakoutAlertLog(symbol?: string): void {
  if (symbol) {
    const sym = symbol.toUpperCase();
    for (let i = breakoutHistory.length - 1; i >= 0; i--) {
      if (breakoutHistory[i].symbol === sym) {
        breakoutHistory.splice(i, 1);
      }
    }
  } else {
    breakoutHistory.length = 0;
  }

  schedulePersist();
}
