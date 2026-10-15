import fs from "fs";
import path from "path";
import { average } from "./patterns";
import { roundTo } from "./scanner";

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
export type AlertCardMode = "PREPARE" | "EXECUTE";
export type PrepareAlertOutcome = "pending" | "promoted" | "win_t1" | "win_t2" | "loss" | "missed";
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

export interface BreakoutOptionsReadinessSnapshot {
  score: number;
  moveScore: number;
  chainScore: number;
  optionScore?: number;
  optionOpenInterest?: number;
  riskRewardPercent?: number;
  hasOptionData?: boolean;
  expectedDirection?: "CALL" | "PUT" | null;
  alignedDirection?: boolean;
}

export interface BreakoutPromotionSnapshot {
  executeAlertId: string;
  promotedAt: number;
  executeSignal: Exclude<BreakoutSignal, null>;
  executeBreakoutScore: number;
  executePrice: number;
  minutesToPromote: number;
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
    execute: BreakoutSummarySlice;
    prepare: BreakoutSummarySlice & {
      promoted: number;
      promotionRate: number;
    };
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
  optionsReadiness?: BreakoutOptionsReadinessSnapshot;
}

export interface BreakoutAlertSnapshot {
  id: string;
  timestamp: number;
  symbol: string;
  timeframe: string;
  mode: AlertCardMode;
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
  optionsReadiness?: BreakoutOptionsReadinessSnapshot;
  prepareOutcome?: PrepareAlertOutcome;
  prepareResolvedAt?: number;
  promotedFromId?: string;
  promotion?: BreakoutPromotionSnapshot;
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

export interface BreakoutSummarySlice {
  total: number;
  completed: number;
  wins: number;
  losses: number;
  missed: number;
  pending: number;
  winRate: number;
}

export interface BreakoutLeadProfileSummary extends BreakoutSummarySlice {
  key: string;
  label: string;
  signal: string;
  direction: BreakoutDirection;
  etaBucket: string;
  setupBucket: string;
  edgeState: string;
  readinessBucket: string;
  promoted: number;
  promotionRate: number;
  avgResolutionMins: number;
  avgBreakoutScore: number;
  avgOptionsReadiness: number;
}

export interface BreakoutAlertSummary {
  lookbackHours: number;
  sample: BreakoutSummarySlice;
  bySignal: Record<string, BreakoutSummarySlice>;
  byDirection: Record<string, BreakoutSummarySlice>;
  byMode: Record<AlertCardMode, BreakoutSummarySlice>;
  prepare: BreakoutSummarySlice & {
    promoted: number;
    promotionRate: number;
    avgResolutionMins: number;
  };
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
  topLeadProfiles: BreakoutLeadProfileSummary[];
}

const PROJECT_ROOT = process.cwd();
const STORAGE_PATH = path.resolve(PROJECT_ROOT, "logs", "breakout_alert_history.json");
const EDGE_TUNING_2D_STORAGE_PATH = path.resolve(PROJECT_ROOT, "logs", "edge_tuning_2d_log.jsonl");
const EDGE_SAMPLE_STORAGE_PATH = path.resolve(PROJECT_ROOT, "logs", "edge_engine_samples.json");
const MAX_LOOKBACK_HOURS = 90 * 24;
const RETENTION_MS = MAX_LOOKBACK_HOURS * 60 * 60 * 1000;
const RETENTION_SWEEP_INTERVAL_MS = 15 * 60 * 1000;
const EDGE_TUNING_WINDOW_HOURS = 48;
const EDGE_TUNING_WINDOW_MS = EDGE_TUNING_WINDOW_HOURS * 60 * 60 * 1000;
const EDGE_SAMPLE_MIN_INTERVAL_MS = 45 * 1000;
const EDGE_SAMPLE_SCORE_DELTA = 3;
const EDGE_SAMPLE_CONFIDENCE_DELTA = 2;
const EDGE_SAMPLE_TRIGGER_DELTA = 2;
const EDGE_SAMPLE_LEAD_DELTA = 1;
const EDGE_TUNING_CHECK_INTERVAL_MS = 15 * 60 * 1000;
const EDGE_TUNING_MAX_LOG_ROWS = 180;
const MIN_RECORD_INTERVAL_MINS = 6;
const MIN_RECORD_INTERVAL_SIGNAL_FLIP_MINS = 2;
const MIN_RECORD_INTERVAL_DRIFT_MINS = 3;
const DUPLICATE_ALERT_COOLDOWN_MINS = 12;
const DUPLICATE_PRICE_BUCKET_PCT = 0.0025;
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
  confidence?: number;
  triggerProbability?: number;
  leadMinutes?: number;
  reasonSignature?: string;
}>();

function roundToCent(value: number): number {
  return Math.round(value * 100) / 100;
}

function normalizeReasonSignature(reasons?: string[]): string {
  if (!Array.isArray(reasons) || reasons.length === 0) return "";
  return reasons
    .map((reason) => String(reason || "").trim())
    .filter(Boolean)
    .slice(0, 3)
    .join("|");
}

function toEdgeTuningCadenceBucket(timestamp: number): number {
  return Math.floor(timestamp / EDGE_TUNING_CHECK_INTERVAL_MS);
}

function normalizeEdgeTuning2dLogEntries(entries: EdgeTuning2dLogEntry[]): EdgeTuning2dLogEntry[] {
  const bucketed = new Map<number, EdgeTuning2dLogEntry>();

  for (const entry of entries) {
    if (!entry || !Number.isFinite(entry.rolledAt)) continue;
    const bucket = toEdgeTuningCadenceBucket(entry.rolledAt);
    const prev = bucketed.get(bucket);
    if (!prev || entry.rolledAt >= prev.rolledAt) {
      bucketed.set(bucket, entry);
    }
  }

  return Array.from(bucketed.values())
    .sort((a, b) => a.rolledAt - b.rolledAt)
    .slice(-EDGE_TUNING_MAX_LOG_ROWS);
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

      const hydratedRow: BreakoutAlertSnapshot = {
        ...row,
        symbol: row.symbol.toUpperCase(),
        timeframe: typeof row.timeframe === "string" && row.timeframe.trim() ? row.timeframe : "15m",
        mode: row.mode === "PREPARE" || row.mode === "EXECUTE" ? row.mode : resolveAlertMode(row.signal),
        optionsReadiness: normalizeOptionsReadiness(row.optionsReadiness),
      };

      hydratedRow.prepareOutcome = inferPrepareOutcome(hydratedRow);
      breakoutHistory.push(hydratedRow);
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
          confidence: row.edgeEngine.confidence,
          triggerProbability: row.edgeEngine.triggerProbability,
          leadMinutes: row.edgeEngine.leadMinutes,
          reasonSignature: normalizeReasonSignature(row.edgeEngine.reasons),
        });
      }
    }

    pruneOld(Date.now());
  } catch (error) {
    console.error("[BreakoutAlertHistory] Failed to hydrate edge samples:", error);
  }
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

    const normalized = normalizeEdgeTuning2dLogEntries(edgeTuning2dLog);
    edgeTuning2dLog.length = 0;
    edgeTuning2dLog.push(...normalized);

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
    const normalized = normalizeEdgeTuning2dLogEntries(edgeTuning2dLog);
    edgeTuning2dLog.length = 0;
    edgeTuning2dLog.push(...normalized);

    const rows = edgeTuning2dLog
      .map((entry) => JSON.stringify(entry))
      .join("\n");
    fs.writeFileSync(
      EDGE_TUNING_2D_STORAGE_PATH,
      rows.length > 0 ? `${rows}\n` : "",
      "utf8",
    );
    lastEdgeTuningRollAt = edgeTuning2dLog.length > 0
      ? edgeTuning2dLog[edgeTuning2dLog.length - 1].rolledAt
      : 0;
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
  const scopedById = new Map(scopedAlerts.map((row) => [row.id, row]));
  const executeOutcomes = summarizeRows(scopedAlerts.filter((row) => row.mode === "EXECUTE"));
  const prepareRows = scopedAlerts.filter((row) => row.mode === "PREPARE");
  const prepareOutcomes = summarizePrepareRows(prepareRows, scopedById);
  const preparePromoted = prepareRows.filter((row) => row.prepareOutcome === "promoted" || Boolean(row.promotion?.executeAlertId)).length;
  const sample: EdgeTuning2dLogEntry["sample"] = {
    edgeSampleCount: scopedEdgeSamples.length,
    symbolCount: new Set(scopedEdgeSamples.map((row) => row.symbol)).size,
    breakoutAlertCount: scopedAlerts.length,
    ...alertOutcomes,
    execute: executeOutcomes,
    prepare: {
      ...prepareOutcomes,
      promoted: preparePromoted,
      promotionRate: prepareRows.length > 0 ? (preparePromoted / prepareRows.length) * 100 : 0,
    },
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
  if (!force && lastEdgeTuningRollAt > 0 && now - lastEdgeTuningRollAt < EDGE_TUNING_CHECK_INTERVAL_MS) {
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

  if (edgeTuning2dLog.length > 0) {
    const last = edgeTuning2dLog[edgeTuning2dLog.length - 1];
    if (toEdgeTuningCadenceBucket(last.rolledAt) === toEdgeTuningCadenceBucket(next.rolledAt)) {
      edgeTuning2dLog[edgeTuning2dLog.length - 1] = next;
      lastEdgeTuningRollAt = next.rolledAt;
      persistEdgeTuning2dLog();
      return next;
    }
  }

  edgeTuning2dLog.push(next);
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

function inSamePriceBucket(a: number, b: number): boolean {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a <= 0 || b <= 0) return false;
  return Math.abs(a - b) / Math.max(a, b) <= DUPLICATE_PRICE_BUCKET_PCT;
}

function edgeStateRank(state?: BreakoutEdgeEngineSnapshot["state"]): number {
  switch (state) {
    case "TRIGGERED":
      return 3;
    case "PRIMED":
      return 2;
    case "ARMING":
      return 1;
    default:
      return 0;
  }
}

function isPrepareSignal(signal: BreakoutSignal | string | null | undefined): boolean {
  const upper = String(signal ?? "").toUpperCase();
  return upper === "BUILDING" || upper === "SQUEEZE" || upper === "CONSOLIDATING";
}

function resolveAlertMode(signal: BreakoutSignal | string | null | undefined): AlertCardMode {
  return isPrepareSignal(signal) ? "PREPARE" : "EXECUTE";
}

function shouldForceExecuteMode(input: BreakoutAlertInput, direction: BreakoutDirection): boolean {
  const signal = String(input.breakoutSignal ?? "").toUpperCase();
  if (!isPrepareSignal(signal)) return false;
  if (direction === "neutral") return false;

  const edge = input.edgeEngine;
  if (!edge) return false;
  if (edge.direction !== direction) return false;

  const stateRank = edgeStateRank(edge.state);
  const confidence = parseNum(edge.confidence, 0);
  const probability = parseNum(edge.triggerProbability, 0);
  const edgeScore = parseNum(edge.edgeScore, 0);
  const leadMinutes = parseNum(edge.leadMinutes, 99);
  const setupScore = parseNum(input.preBreakoutSetup?.score, 0);
  const setupEtaRaw = Number(input.preBreakoutSetup?.etaMinutes);
  const setupEtaMinutes = Number.isFinite(setupEtaRaw) ? setupEtaRaw : null;
  
  // ADX filter: require minimum trend confirmation to transition to EXECUTE
  const adx = parseNum((input.edgeEngine as any)?.indicators?.adx, 0);
  const tvAdx = parseNum(input.tvAdx, adx);
  const avgAdx = (adx + tvAdx) / 2;
  
  // Prevent PREPARE→EXECUTE transition if trend not confirmed (ADX < 20)
  // This reduces 40.9% → target 65%+ win rate on these signals
  if (avgAdx < 20) return false;

  const triggeredOverride =
    stateRank >= edgeStateRank("TRIGGERED") &&
    confidence >= 80 &&
    probability >= 70 &&
    edgeScore >= 75;

  const primedOverride =
    stateRank >= edgeStateRank("PRIMED") &&
    confidence >= 85 &&
    probability >= 78 &&
    edgeScore >= 82 &&
    leadMinutes <= 10 &&
    setupScore >= 85 &&
    (setupEtaMinutes == null || setupEtaMinutes <= 6);

  const setupTraits = new Set((input.preBreakoutSetup?.traits ?? []).map((trait) => String(trait).toUpperCase()));
  const repeatCompressionOverride =
    stateRank >= edgeStateRank("PRIMED") &&
    avgAdx >= 22 &&
    confidence >= 72 &&
    probability >= 60 &&
    edgeScore >= 72 &&
    leadMinutes <= 10 &&
    setupScore >= 78 &&
    (setupEtaMinutes == null || setupEtaMinutes <= 10) &&
    input.warnings?.some((warning) => String(warning).toUpperCase() === "REPEAT_SETUP_PATTERN") === true &&
    setupTraits.has("PRE_RANGE_COMPRESSION") &&
    setupTraits.has("MTF_ALIGNMENT");

  return triggeredOverride || primedOverride || repeatCompressionOverride;
}

function normalizeOptionsReadiness(
  input?: BreakoutOptionsReadinessSnapshot,
): BreakoutOptionsReadinessSnapshot | undefined {
  if (!input || typeof input !== "object") return undefined;

  const score = clamp(parseNum(input.score, 0), 0, 100);
  const moveScore = clamp(parseNum(input.moveScore, 0), 0, 100);
  const chainScore = clamp(parseNum(input.chainScore, 0), 0, 100);
  const expectedDirection = input.expectedDirection === "CALL" || input.expectedDirection === "PUT"
    ? input.expectedDirection
    : null;

  const snapshot: BreakoutOptionsReadinessSnapshot = {
    score,
    moveScore,
    chainScore,
    optionScore: Number.isFinite(input.optionScore as number) ? clamp(parseNum(input.optionScore), 0, 100) : undefined,
    optionOpenInterest: Number.isFinite(input.optionOpenInterest as number) ? Math.max(0, parseNum(input.optionOpenInterest)) : undefined,
    riskRewardPercent: Number.isFinite(input.riskRewardPercent as number) ? Math.max(0, parseNum(input.riskRewardPercent)) : undefined,
    hasOptionData: Boolean(input.hasOptionData),
    expectedDirection,
    alignedDirection: typeof input.alignedDirection === "boolean" ? input.alignedDirection : undefined,
  };

  const hasAnyField =
    Number.isFinite(snapshot.score) ||
    Number.isFinite(snapshot.moveScore) ||
    Number.isFinite(snapshot.chainScore) ||
    snapshot.optionScore != null ||
    snapshot.optionOpenInterest != null ||
    snapshot.riskRewardPercent != null ||
    snapshot.hasOptionData ||
    snapshot.expectedDirection != null ||
    snapshot.alignedDirection != null;

  return hasAnyField ? snapshot : undefined;
}

function inferPrepareOutcome(row: BreakoutAlertSnapshot): PrepareAlertOutcome | undefined {
  if (row.mode !== "PREPARE") return undefined;
  if (row.prepareOutcome) return row.prepareOutcome;
  return row.outcome === "pending"
    ? "pending"
    : (row.outcome as PrepareAlertOutcome);
}

function toDirection(input: BreakoutAlertInput): BreakoutDirection {
  const signal = String(input.breakoutSignal ?? "").toUpperCase();
  if (signal === "BREAKOUT") return "bullish";
  if (signal === "BREAKDOWN") return "bearish";

  if (signal === "EXPANSION" || signal === "MOMENTUM") {
    if (input.expansionDirection === "bullish") return "bullish";
    if (input.expansionDirection === "bearish") return "bearish";
    const momentum = parseNum(input.momentumStrength, 0);
    if (momentum >= 8) return "bullish";
    if (momentum <= -8) return "bearish";
    return "neutral";
  }

  const edgeDirection = input.edgeEngine?.direction;
  if (edgeDirection === "bullish" || edgeDirection === "bearish") {
    return edgeDirection;
  }

  const stackAgreement = parseNum(input.timeframeStack?.agreement, 0);
  const stackBias = input.timeframeStack?.bias;
  if (stackAgreement >= 55 && (stackBias === "bullish" || stackBias === "bearish")) {
    return stackBias;
  }

  if (input.tvTrendDirection === "bullish" || input.tvTrendDirection === "bearish") {
    return input.tvTrendDirection;
  }

  const dayMovePct = parseNum(input.priceChangePercent, 0);
  if (dayMovePct >= 0.35) return "bullish";
  if (dayMovePct <= -0.35) return "bearish";

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
    upper === "SQUEEZE" ||
    upper === "CONSOLIDATING"
  );
}

function isStrongPrepareCandidate(input: BreakoutAlertInput, direction: BreakoutDirection): boolean {
  const signal = String(input.breakoutSignal ?? "").toUpperCase();
  const phase = String(input.compression?.phase ?? "").toUpperCase();
  if (!isPrepareSignal(signal)) return false;
  if (direction === "neutral") return false;
  if (phase !== "PREPARE" && phase !== "READY") return false;

  const setupScore = parseNum(input.preBreakoutSetup?.score, 0);
  const setupTraits = Array.isArray(input.preBreakoutSetup?.traits)
    ? input.preBreakoutSetup.traits.filter(Boolean).length
    : 0;
  const etaRaw = Number(input.preBreakoutSetup?.etaMinutes);
  const etaMinutes = Number.isFinite(etaRaw) ? etaRaw : null;
  if (setupScore < 72 || setupTraits < 3) return false;
  if (etaMinutes != null && etaMinutes > 12) return false;

  const warnings = new Set((input.warnings ?? []).map((warning) => String(warning).toUpperCase()));
  if (warnings.has("CONFLICT_MOMENTUM")) return false;

  const stackAgreement = parseNum(input.timeframeStack?.agreement, 0);
  const stackBias = String(input.timeframeStack?.bias ?? "").toLowerCase();
  if (
    stackAgreement >= 55 &&
    stackBias.length > 0 &&
    stackBias !== "neutral" &&
    stackBias !== "mixed" &&
    stackBias !== direction
  ) {
    return false;
  }

  const tvTrendDirection = input.tvTrendDirection;
  if (tvTrendDirection && tvTrendDirection !== "neutral" && tvTrendDirection !== direction) {
    return false;
  }

  const tvRecommendAll = Number.isFinite(input.tvRecommendAll as number)
    ? parseNum(input.tvRecommendAll)
    : undefined;
  const dayMovePct = parseNum(input.priceChangePercent, 0);
  const opposedContext =
    direction === "bullish"
      ? (tvRecommendAll != null && tvRecommendAll <= -0.25) || dayMovePct <= -0.35
      : (tvRecommendAll != null && tvRecommendAll >= 0.25) || dayMovePct >= 0.35;
  if (opposedContext) return false;

  const edgeDirection = input.edgeEngine?.direction;
  if (edgeDirection && edgeDirection !== "neutral" && edgeDirection !== direction) {
    return false;
  }

  const edgeScore = parseNum(input.edgeEngine?.edgeScore, 0);
  const edgeConfidence = parseNum(input.edgeEngine?.confidence, 0);
  const edgeProbability = parseNum(input.edgeEngine?.triggerProbability, 0);
  const edgeLead = parseNum(input.edgeEngine?.leadMinutes, 99);
  const stateRank = edgeStateRank(input.edgeEngine?.state);
  const breakoutScore = parseNum(input.breakoutScore, 0);
  const momentumAbs = Math.abs(parseNum(input.momentumStrength, 0));

  return (
    stateRank >= edgeStateRank("PRIMED") ||
    (stateRank >= edgeStateRank("ARMING") &&
      edgeScore >= 72 &&
      edgeConfidence >= 70 &&
      edgeProbability >= 55 &&
      edgeLead <= 15) ||
    (setupScore >= 88 && etaMinutes != null && etaMinutes <= 5 && breakoutScore >= 18 && momentumAbs >= 12)
  );
}

function isStrongExecuteCandidate(input: BreakoutAlertInput, direction: BreakoutDirection): boolean {
  if (direction === "neutral") return false;

  const signal = String(input.breakoutSignal ?? "").toUpperCase();
  const signalSupports =
    signal === "BREAKOUT" ||
    signal === "BREAKDOWN" ||
    signal === "EXPANSION" ||
    signal === "MOMENTUM" ||
    signal === "SQUEEZE" ||
    signal === "CONSOLIDATING";
  if (!signalSupports) return false;

  const edge = input.edgeEngine;
  if (!edge || edge.direction !== direction) return false;

  const stateRank = edgeStateRank(edge.state);
  if (stateRank === 0) return false;

  const stackAgreement = parseNum(input.timeframeStack?.agreement, 0);
  const stackBias = String(input.timeframeStack?.bias ?? "").toLowerCase();
  if (
    stackAgreement >= 55 &&
    stackBias.length > 0 &&
    stackBias !== "neutral" &&
    stackBias !== "mixed" &&
    stackBias !== direction
  ) {
    return false;
  }

  const breakoutScore = parseNum(input.breakoutScore, 0);
  const momentumAbs = Math.abs(parseNum(input.momentumStrength, 0));
  const edgeScore = parseNum(edge.edgeScore, 0);
  const edgeConfidence = parseNum(edge.confidence, 0);
  const edgeProbability = parseNum(edge.triggerProbability, 0);
  const edgeLead = parseNum(edge.leadMinutes, 99);
  const tvRecommendAll = Number.isFinite(input.tvRecommendAll as number) ? parseNum(input.tvRecommendAll) : undefined;
  const dayMovePct = parseNum(input.priceChangePercent, 0);
  const severeOpposedContext =
    direction === "bullish"
      ? (tvRecommendAll != null && tvRecommendAll <= -0.65 && dayMovePct <= -0.75)
      : (tvRecommendAll != null && tvRecommendAll >= 0.65 && dayMovePct >= 0.75);
  if (severeOpposedContext && stateRank < edgeStateRank("TRIGGERED")) return false;

  return (
    stateRank >= edgeStateRank("PRIMED") &&
    edgeScore >= 72 &&
    edgeConfidence >= 70 &&
    edgeProbability >= 60 &&
    edgeLead <= 10 &&
    (stackAgreement >= 75 || breakoutScore >= 60 || momentumAbs >= 40 || signal === "BREAKOUT" || signal === "BREAKDOWN")
  ) || (
    stateRank >= edgeStateRank("ARMING") &&
    edgeScore >= 78 &&
    edgeConfidence >= 76 &&
    edgeProbability >= 65 &&
    momentumAbs >= 32 &&
    (breakoutScore >= 48 || stackAgreement >= 85)
  );
}

function isCardCandidate(input: BreakoutAlertInput, direction: BreakoutDirection): boolean {
  const signal: BreakoutSignal = input.breakoutSignal ?? null;
  if (!isTrackableSignal(signal)) return false;

  const quality = String(input.signalQuality ?? "LOW").toUpperCase();
  if (quality === "UNRELIABLE") return false;

  const warnings = new Set((input.warnings ?? []).map((warning) => String(warning).toUpperCase()));
  const breakoutScore = parseNum(input.breakoutScore, 0);
  const confirmedFailedUpsideReversal =
    signal === "BREAKDOWN" &&
    direction === "bearish" &&
    breakoutScore >= 75 &&
    warnings.has("FAILED_UPSIDE_BREAKOUT") &&
    warnings.has("POTENTIAL_PUT_PLAY");
  if (confirmedFailedUpsideReversal) return true;

  if (isStrongPrepareCandidate(input, direction)) return true;
  if (isStrongExecuteCandidate(input, direction)) return true;

  if (breakoutScore < MIN_BREAKOUT_SCORE) return false;

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

  const hasTrendConflict = warnings.has("TREND_CONFLICT") || warnings.has("TV_TREND_CONFLICT");
  if (hasTrendConflict && breakoutScore < 74) return false;
  if (warnings.has("LATE_PHASE_UNCONFIRMED") && breakoutScore < 76) return false;

  const tvAdx = Number.isFinite(input.tvAdx as number) ? parseNum(input.tvAdx) : undefined;
  const tvRecommendAll = Number.isFinite(input.tvRecommendAll as number) ? parseNum(input.tvRecommendAll) : undefined;
  const tvTrendDirection = input.tvTrendDirection;
  const bearishTvConflict =
    direction === "bullish" &&
    tvTrendDirection === "bearish" &&
    tvAdx != null &&
    tvAdx < 25;
  const strongBearishPressure =
    direction === "bullish" &&
    tvRecommendAll != null &&
    tvRecommendAll <= -0.35 &&
    tvAdx != null &&
    tvAdx < 25;

  if (bearishTvConflict || strongBearishPressure) return false;

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

function linkPreparePromotion(snapshot: BreakoutAlertSnapshot): void {
  if (snapshot.mode !== "EXECUTE" || snapshot.direction === "neutral") return;

  const maxPromotionAgeMs = 45 * 60 * 1000;
  for (let i = breakoutHistory.length - 1; i >= 0; i--) {
    const row = breakoutHistory[i];
    if (snapshot.timestamp - row.timestamp > maxPromotionAgeMs) break;
    if (row.symbol !== snapshot.symbol) continue;
    if (String(row.timeframe || "15m").toLowerCase() !== String(snapshot.timeframe || "15m").toLowerCase()) continue;
    if (row.direction !== snapshot.direction) continue;
    if (row.mode !== "PREPARE") continue;
    if (row.promotion?.executeAlertId) continue;

    row.promotion = {
      executeAlertId: snapshot.id,
      promotedAt: snapshot.timestamp,
      executeSignal: snapshot.signal,
      executeBreakoutScore: snapshot.breakoutScore,
      executePrice: snapshot.priceAtCapture,
      minutesToPromote: roundTo((snapshot.timestamp - row.timestamp) / 60000, 2),
    };
    row.prepareOutcome = "promoted";
    row.prepareResolvedAt = snapshot.timestamp;
    snapshot.promotedFromId = row.id;
    return;
  }
}

function shouldRecord(input: BreakoutAlertInput, direction: BreakoutDirection): boolean {
  const now = input.timestamp;
  const symbol = String(input.symbol || "").toUpperCase();
  const signal = String(input.breakoutSignal ?? "").toUpperCase();
  const timeframe = String(input.timeframe || "15m").toLowerCase();
  const entryPrice = parseNum(input.lastPrice, 0);
  const isPrepareSetup = isPrepareSignal(signal);
  const nextSetupScore = parseNum(input.preBreakoutSetup?.score, 0);
  const nextSetupEtaRaw = Number(input.preBreakoutSetup?.etaMinutes);
  const nextSetupEta = Number.isFinite(nextSetupEtaRaw) ? nextSetupEtaRaw : null;
  const nextEdgeStateRank = edgeStateRank(input.edgeEngine?.state);
  const isDirectionalSignal =
    signal === "BREAKOUT" ||
    signal === "BREAKDOWN" ||
    signal === "EXPANSION" ||
    signal === "MOMENTUM";

  let latestForSymbol: BreakoutAlertSnapshot | null = null;
  let allowSetupPromotion = false;

  for (let i = breakoutHistory.length - 1; i >= 0; i--) {
    const last = breakoutHistory[i];
    const minsSince = (now - last.timestamp) / 60000;
    if (minsSince > DUPLICATE_ALERT_COOLDOWN_MINS) break;
    if (last.symbol !== symbol) continue;
    if (!latestForSymbol) latestForSymbol = last;

    const lastTimeframe = String(last.timeframe || "15m").toLowerCase();
    const sameTimeframe = lastTimeframe === timeframe;
    const sameDirection = last.direction === direction;
    const samePriceBucket = inSamePriceBucket(last.priceAtCapture, entryPrice);
    if (sameTimeframe && sameDirection && samePriceBucket) {
      if (isPrepareSetup) {
        const lastSetupScore = parseNum(last.preBreakoutSetup?.score, 0);
        const lastSetupEtaRaw = Number(last.preBreakoutSetup?.etaMinutes);
        const lastSetupEta = Number.isFinite(lastSetupEtaRaw) ? lastSetupEtaRaw : null;
        const lastEdgeStateRank = edgeStateRank(last.edgeEngine?.state);
        const stateImproved = nextEdgeStateRank > lastEdgeStateRank;
        const etaCompressed =
          nextSetupEta != null &&
          nextSetupEta <= 5 &&
          (lastSetupEta == null || nextSetupEta < lastSetupEta);
        const setupScoreImproved = nextSetupScore >= 80 && nextSetupScore >= lastSetupScore + 4;

        if (stateImproved || etaCompressed || setupScoreImproved) {
          allowSetupPromotion = true;
          latestForSymbol = last;
          break;
        }
      }
      return false;
    }
  }

  if (!latestForSymbol) {
    for (let i = breakoutHistory.length - 1; i >= 0; i--) {
      if (breakoutHistory[i].symbol === symbol) {
        latestForSymbol = breakoutHistory[i];
        break;
      }
    }
  }

  if (!latestForSymbol) return true;

  const last = latestForSymbol;

  const minsSince = (now - last.timestamp) / 60000;
  const signalChanged = last.signal !== String(input.breakoutSignal).toUpperCase();
  const directionChanged =
    last.direction !== direction &&
    last.direction !== "neutral" &&
    direction !== "neutral";
  const scoreChanged = Math.abs(last.breakoutScore - parseNum(input.breakoutScore, 0)) >= 8;
  const momentumChanged = Math.abs(last.momentumStrength - parseNum(input.momentumStrength, 0)) >= 12;
  const lastSetupScore = parseNum(last.preBreakoutSetup?.score, 0);
  const lastSetupEtaRaw = Number(last.preBreakoutSetup?.etaMinutes);
  const lastSetupEta = Number.isFinite(lastSetupEtaRaw) ? lastSetupEtaRaw : null;
  const lastEdgeStateRank = edgeStateRank(last.edgeEngine?.state);
  const statePromoted = nextEdgeStateRank > lastEdgeStateRank;
  const etaCompressed =
    isPrepareSetup &&
    nextSetupEta != null &&
    nextSetupEta <= 5 &&
    (lastSetupEta == null || nextSetupEta < lastSetupEta);
  const setupScoreImproved =
    isPrepareSetup && nextSetupScore >= 80 && nextSetupScore >= lastSetupScore + 4;

  if (minsSince >= MIN_RECORD_INTERVAL_MINS) return true;

  if ((allowSetupPromotion || statePromoted || etaCompressed || setupScoreImproved) && minsSince >= 1) {
    return true;
  }

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

export function recordBreakoutAlert(input: BreakoutAlertInput): void {
  const now = Number.isFinite(input.timestamp) ? input.timestamp : Date.now();
  pruneOld(now);

  if (!input.symbol || !Number.isFinite(input.lastPrice) || input.lastPrice <= 0) return;
  const direction = toDirection(input);
  if (!isCardCandidate(input, direction)) return;

  const signal = String(input.breakoutSignal).toUpperCase() as Exclude<BreakoutSignal, null>;
  const mode = shouldForceExecuteMode(input, direction) ? "EXECUTE" : resolveAlertMode(signal);
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
    mode,
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
    optionsReadiness: normalizeOptionsReadiness(input.optionsReadiness),
    prepareOutcome: mode === "PREPARE" ? "pending" : undefined,
    priceAtCapture: entryPrice,
    stopLoss: levels.stopLoss,
    targets: levels.targets,
    maxPriceSeen: entryPrice,
    minPriceSeen: entryPrice,
    outcome: "pending",
  };

  linkPreparePromotion(snapshot);
  breakoutHistory.push(snapshot);
  schedulePersist();
}

function applyRowOutcome(
  row: BreakoutAlertSnapshot,
  outcome: BreakoutOutcome,
  reason: string,
  now: number,
): void {
  row.outcome = outcome;
  row.outcomeReason = reason;
  row.resolvedAt = now;

  if (row.mode === "PREPARE" && (!row.prepareOutcome || row.prepareOutcome === "pending")) {
    row.prepareOutcome = outcome;
    row.prepareResolvedAt = now;
  }
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
  const nextConfidence = Number.isFinite(parsedEdge.confidence as number) ? Number(parsedEdge.confidence) : 0;
  const nextTrigger = Number.isFinite(parsedEdge.triggerProbability as number) ? Number(parsedEdge.triggerProbability) : 0;
  const nextLead = Number.isFinite(parsedEdge.leadMinutes as number) ? Number(parsedEdge.leadMinutes) : 0;
  const nextReasonSignature = normalizeReasonSignature(parsedEdge.reasons);

  if (prev && (now - prev.timestamp) < EDGE_SAMPLE_MIN_INTERVAL_MS) {
    const stateChanged = prev.state !== parsedEdge.state;
    const signalChanged = prev.signal !== parsedEdge.signal;
    const scoreMoved = Math.abs((prev.edgeScore ?? 0) - nextScore) >= EDGE_SAMPLE_SCORE_DELTA;
    const confidenceMoved = Math.abs((prev.confidence ?? 0) - nextConfidence) >= EDGE_SAMPLE_CONFIDENCE_DELTA;
    const triggerMoved = Math.abs((prev.triggerProbability ?? 0) - nextTrigger) >= EDGE_SAMPLE_TRIGGER_DELTA;
    const leadMoved = Math.abs((prev.leadMinutes ?? 0) - nextLead) >= EDGE_SAMPLE_LEAD_DELTA;
    const reasonsChanged = prev.reasonSignature !== nextReasonSignature;

    if (!stateChanged && !signalChanged && !scoreMoved && !confidenceMoved && !triggerMoved && !leadMoved && !reasonsChanged) {
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
    confidence: parsedEdge.confidence,
    triggerProbability: parsedEdge.triggerProbability,
    leadMinutes: parsedEdge.leadMinutes,
    reasonSignature: nextReasonSignature,
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
        applyRowOutcome(row, "missed", "whipsaw", now);
      } else if (stopTouched) {
        applyRowOutcome(row, "loss", "stop_hit", now);
      } else if (t2Touched) {
        applyRowOutcome(row, "win_t2", "target2_hit", now);
      } else if (t1Touched) {
        applyRowOutcome(row, "win_t1", "target1_hit", now);
      } else if (ageMins > OUTCOME_TIMEOUT_MINS) {
        applyRowOutcome(
          row,
          deltaPct >= OUTCOME_TIMEOUT_MOVE_PCT ? "win_t1" : "missed",
          deltaPct >= OUTCOME_TIMEOUT_MOVE_PCT ? "timeout_positive" : "timeout_flat",
          now,
        );
      }
      continue;
    }

    if (row.direction === "bearish") {
      const stopTouched = observedHigh >= row.stopLoss;
      const t1Touched = observedLow <= t1;
      const t2Touched = observedLow <= t2;

      if (stopTouched && (t1Touched || t2Touched)) {
        applyRowOutcome(row, "missed", "whipsaw", now);
      } else if (stopTouched) {
        applyRowOutcome(row, "loss", "stop_hit", now);
      } else if (t2Touched) {
        applyRowOutcome(row, "win_t2", "target2_hit", now);
      } else if (t1Touched) {
        applyRowOutcome(row, "win_t1", "target1_hit", now);
      } else if (ageMins > OUTCOME_TIMEOUT_MINS) {
        applyRowOutcome(
          row,
          deltaPct <= -OUTCOME_TIMEOUT_MOVE_PCT ? "win_t1" : "missed",
          deltaPct <= -OUTCOME_TIMEOUT_MOVE_PCT ? "timeout_positive" : "timeout_flat",
          now,
        );
      }
      continue;
    }

    if (ageMins > OUTCOME_TIMEOUT_MINS) {
      applyRowOutcome(row, "missed", "timeout_no_direction", now);
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

function summarizeRows(rows: BreakoutAlertSnapshot[]): BreakoutSummarySlice {
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

function summarizePrepareRows(
  rows: BreakoutAlertSnapshot[],
  rowsById: Map<string, BreakoutAlertSnapshot>,
): BreakoutSummarySlice {
  let wins = 0;
  let losses = 0;
  let missed = 0;
  let pending = 0;

  for (const row of rows) {
    const prepareOutcome = row.prepareOutcome ?? inferPrepareOutcome(row) ?? "pending";
    if (prepareOutcome === "promoted") {
      const executeRow = row.promotion?.executeAlertId ? rowsById.get(row.promotion.executeAlertId) : undefined;
      if (!executeRow || executeRow.outcome === "pending") pending += 1;
      else if (executeRow.outcome === "win_t1" || executeRow.outcome === "win_t2") wins += 1;
      else if (executeRow.outcome === "loss") losses += 1;
      else if (executeRow.outcome === "missed") missed += 1;
      else pending += 1;
      continue;
    }

    if (prepareOutcome === "pending") pending += 1;
    else if (prepareOutcome === "win_t1" || prepareOutcome === "win_t2") wins += 1;
    else if (prepareOutcome === "loss") losses += 1;
    else if (prepareOutcome === "missed") missed += 1;
    else pending += 1;
  }

  const completed = wins + losses + missed;
  return {
    total: rows.length,
    completed,
    wins,
    losses,
    missed,
    pending,
    winRate: completed > 0 ? (wins / completed) * 100 : 0,
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

function computePrepareAvgResolutionMins(
  rows: BreakoutAlertSnapshot[],
  rowsById: Map<string, BreakoutAlertSnapshot>,
): number {
  const resolutionSamples: number[] = [];

  for (const row of rows) {
    if (row.prepareOutcome === "promoted") {
      const executeRow = row.promotion?.executeAlertId ? rowsById.get(row.promotion.executeAlertId) : undefined;
      if (executeRow?.resolvedAt != null && executeRow.resolvedAt > row.timestamp) {
        resolutionSamples.push((executeRow.resolvedAt - row.timestamp) / 60000);
        continue;
      }
      if (row.prepareResolvedAt != null && row.prepareResolvedAt > row.timestamp) {
        resolutionSamples.push((row.prepareResolvedAt - row.timestamp) / 60000);
      }
      continue;
    }

    const resolvedAt = row.prepareResolvedAt ?? row.resolvedAt;
    if (resolvedAt != null && resolvedAt > row.timestamp) {
      resolutionSamples.push((resolvedAt - row.timestamp) / 60000);
    }
  }

  return resolutionSamples.length > 0
    ? resolutionSamples.reduce((sum, mins) => sum + mins, 0) / resolutionSamples.length
    : 0;
}

function toEtaBucket(etaMinutes: number | null): string {
  if (etaMinutes == null) return "n/a";
  if (etaMinutes <= 5) return "<=5m";
  if (etaMinutes <= 10) return "6-10m";
  return "11m+";
}

function toSetupBucket(setupScore: number): string {
  if (setupScore >= 90) return "90+";
  if (setupScore >= 80) return "80s";
  if (setupScore >= 70) return "70s";
  return "<70";
}

function toReadinessBucket(readinessScore: number): string {
  if (readinessScore >= 80) return "80+";
  if (readinessScore >= 65) return "65-79";
  if (readinessScore >= 50) return "50-64";
  return "<50";
}

function buildLeadProfileSummary(rows: BreakoutAlertSnapshot[]): BreakoutLeadProfileSummary[] {
  const prepareRows = rows.filter((row) => row.mode === "PREPARE");
  const rowsById = new Map(rows.map((row) => [row.id, row]));
  const grouped = new Map<string, BreakoutAlertSnapshot[]>();

  for (const row of prepareRows) {
    const etaRaw = Number(row.preBreakoutSetup?.etaMinutes);
    const etaMinutes = Number.isFinite(etaRaw) ? etaRaw : null;
    const setupScore = parseNum(row.preBreakoutSetup?.score, 0);
    const edgeState = String(row.edgeEngine?.state ?? "NONE").toUpperCase() || "NONE";
    const readinessScore = parseNum(row.optionsReadiness?.score, 0);
    const key = [
      row.signal,
      row.direction,
      toEtaBucket(etaMinutes),
      toSetupBucket(setupScore),
      edgeState,
      toReadinessBucket(readinessScore),
    ].join("|");
    const current = grouped.get(key) ?? [];
    current.push(row);
    grouped.set(key, current);
  }

  return Array.from(grouped.entries())
    .map(([key, profileRows]) => {
      const sample = summarizePrepareRows(profileRows, rowsById);
      const [signal, direction, etaBucket, setupBucket, edgeState, readinessBucket] = key.split("|");
      const promoted = profileRows.filter((row) => row.prepareOutcome === "promoted" || Boolean(row.promotion?.executeAlertId)).length;
      const avgBreakoutScore = average(
        profileRows
          .map((row) => parseNum(row.breakoutScore, Number.NaN))
          .filter((value) => Number.isFinite(value)),
      );
      const avgOptionsReadiness = average(
        profileRows
          .map((row) => parseNum(row.optionsReadiness?.score, Number.NaN))
          .filter((value) => Number.isFinite(value)),
      );

      return {
        ...sample,
        key,
        label: `${direction.toUpperCase()} ${signal} • ${etaBucket} • setup ${setupBucket} • ${edgeState}`,
        signal,
        direction: (direction as BreakoutDirection) ?? "neutral",
        etaBucket,
        setupBucket,
        edgeState,
        readinessBucket,
        promoted,
        promotionRate: profileRows.length > 0 ? (promoted / profileRows.length) * 100 : 0,
        avgResolutionMins: computePrepareAvgResolutionMins(profileRows, rowsById),
        avgBreakoutScore: roundTo(avgBreakoutScore, 2),
        avgOptionsReadiness: roundTo(avgOptionsReadiness, 2),
      };
    })
    .sort((a, b) => {
      const aDecisive = a.wins + a.losses;
      const bDecisive = b.wins + b.losses;
      if (bDecisive !== aDecisive) return bDecisive - aDecisive;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      if (b.promotionRate !== a.promotionRate) return b.promotionRate - a.promotionRate;
      return b.total - a.total;
    })
    .slice(0, 6);
}

export function getBreakoutAlertSummary(lookbackHours: number = 48): BreakoutAlertSummary {
  pruneOld(Date.now());

  const boundedHours = Number.isFinite(lookbackHours) && lookbackHours > 0
    ? Math.min(MAX_LOOKBACK_HOURS, lookbackHours)
    : Math.min(48, MAX_LOOKBACK_HOURS);
  const cutoff = Date.now() - boundedHours * 60 * 60 * 1000;
  const scoped = breakoutHistory.filter((row) => row.timestamp >= cutoff);
  const scopedById = new Map(scoped.map((row) => [row.id, row]));

  const bySignal: BreakoutAlertSummary["bySignal"] = {};
  const byDirection: BreakoutAlertSummary["byDirection"] = {};
  const byMode: BreakoutAlertSummary["byMode"] = {
    PREPARE: summarizeRows([]),
    EXECUTE: summarizeRows([]),
  };

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
  byMode.PREPARE = summarizePrepareRows(scoped.filter((row) => row.mode === "PREPARE"), scopedById);
  byMode.EXECUTE = summarizeRows(scoped.filter((row) => row.mode === "EXECUTE"));

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
  const prepareRows = scoped.filter((row) => row.mode === "PREPARE");
  const prepareSummary = summarizePrepareRows(prepareRows, scopedById);
  const preparePromoted = prepareRows.filter((row) => row.prepareOutcome === "promoted" || Boolean(row.promotion?.executeAlertId)).length;

  return {
    lookbackHours: boundedHours,
    sample: overall,
    bySignal,
    byDirection,
    byMode,
    prepare: {
      ...prepareSummary,
      promoted: preparePromoted,
      promotionRate: prepareRows.length > 0 ? (preparePromoted / prepareRows.length) * 100 : 0,
      avgResolutionMins: computePrepareAvgResolutionMins(prepareRows, scopedById),
    },
    lead5m: {
      ...lead5Summary,
      avgResolutionMins: computeAvgResolutionMins(lead5Rows),
    },
    lead10m: {
      ...lead10Summary,
      avgResolutionMins: computeAvgResolutionMins(lead10Rows),
    },
    avgResolutionMins,
    topLeadProfiles: buildLeadProfileSummary(scoped),
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
