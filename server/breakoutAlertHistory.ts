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
  warnings?: string[];
  compression?: BreakoutCompressionSnapshot;
}

export interface BreakoutAlertSnapshot {
  id: string;
  timestamp: number;
  symbol: string;
  timeframe: string;
  signal: Exclude<BreakoutSignal, null>;
  direction: BreakoutDirection;
  breakoutScore: number;
  momentumStrength: number;
  volumeSpike: number;
  rsiValue: number;
  healthScore: number;
  healthGrade: string;
  signalQuality: "HIGH" | "MEDIUM" | "LOW" | "UNRELIABLE";
  warnings: string[];
  compression: {
    sparkScore: number;
    phase: string;
    bbWidth: number;
    rangePct: number;
    volRatio: number;
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
  avgResolutionMins: number;
}

const PROJECT_ROOT = process.cwd();
const STORAGE_PATH = path.resolve(PROJECT_ROOT, "logs", "breakout_alert_history.json");
const RETENTION_MS = 48 * 60 * 60 * 1000;
const MIN_RECORD_INTERVAL_MINS = 6;
const MIN_BREAKOUT_SCORE = 60;
const OUTCOME_TIMEOUT_MINS = 180;
const OUTCOME_TIMEOUT_MOVE_PCT = 0.2;

const breakoutHistory: BreakoutAlertSnapshot[] = [];
let persistTimer: NodeJS.Timeout | null = null;

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

function pruneOld(now: number = Date.now()): void {
  const cutoff = now - RETENTION_MS;
  let writeNeeded = false;

  for (let i = breakoutHistory.length - 1; i >= 0; i--) {
    if (breakoutHistory[i].timestamp < cutoff) {
      breakoutHistory.splice(i, 1);
      writeNeeded = true;
    }
  }

  if (writeNeeded) {
    schedulePersist();
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

hydrateFromDisk();

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

  const momentumAbs = Math.abs(parseNum(input.momentumStrength, 0));
  if ((signal === "BREAKOUT" || signal === "BREAKDOWN" || signal === "EXPANSION" || signal === "MOMENTUM") && momentumAbs < 10) {
    return false;
  }

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
  for (let i = breakoutHistory.length - 1; i >= 0; i--) {
    const last = breakoutHistory[i];
    if (last.symbol !== input.symbol) continue;

    const minsSince = (now - last.timestamp) / 60000;
    const signalChanged = last.signal !== String(input.breakoutSignal).toUpperCase();
    const directionChanged = last.direction !== direction;
    const scoreChanged = Math.abs(last.breakoutScore - parseNum(input.breakoutScore, 0)) >= 8;
    const momentumChanged = Math.abs(last.momentumStrength - parseNum(input.momentumStrength, 0)) >= 12;

    return minsSince >= MIN_RECORD_INTERVAL_MINS || signalChanged || directionChanged || scoreChanged || momentumChanged;
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
  const id = `${input.symbol}-${now}-${Math.floor(Math.random() * 1e6).toString(36)}`;

  const snapshot: BreakoutAlertSnapshot = {
    id,
    timestamp: now,
    symbol: input.symbol.toUpperCase(),
    timeframe: input.timeframe || "15m",
    signal,
    direction,
    breakoutScore: parseNum(input.breakoutScore, 0),
    momentumStrength: parseNum(input.momentumStrength, 0),
    volumeSpike: parseNum(input.volumeSpike, 1),
    rsiValue: parseNum(input.rsiValue, 50),
    healthScore: parseNum(input.healthScore, 50),
    healthGrade: String(input.healthGrade || "C"),
    signalQuality: input.signalQuality || "LOW",
    warnings: Array.isArray(input.warnings) ? input.warnings.slice(0, 10) : [],
    compression: {
      sparkScore: parseNum(compression.sparkScore, 0),
      phase: String(compression.phase || "WAIT"),
      bbWidth: parseNum(compression.bbWidth, 0),
      rangePct: parseNum(compression.rangePct, 0),
      volRatio: parseNum(compression.volRatio, 0),
    },
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

export function getBreakoutAlertLog(limit: number = 200, symbol?: string): BreakoutAlertSnapshot[] {
  pruneOld(Date.now());

  const bounded = Number.isFinite(limit) && limit > 0 ? Math.min(2000, Math.floor(limit)) : 200;
  const sym = symbol ? symbol.toUpperCase() : null;
  const scoped = sym
    ? breakoutHistory.filter((row) => row.symbol === sym)
    : breakoutHistory;

  return scoped.slice(-bounded).reverse();
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

export function getBreakoutAlertSummary(lookbackHours: number = 48): BreakoutAlertSummary {
  pruneOld(Date.now());

  const boundedHours = Number.isFinite(lookbackHours) && lookbackHours > 0
    ? Math.min(48, lookbackHours)
    : 48;
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

  const overall = summarizeRows(scoped);
  const resolutionSamples = scoped
    .filter((row) => row.resolvedAt && row.resolvedAt > row.timestamp)
    .map((row) => ((row.resolvedAt as number) - row.timestamp) / 60000)
    .filter((mins) => Number.isFinite(mins) && mins >= 0);
  const avgResolutionMins = resolutionSamples.length > 0
    ? resolutionSamples.reduce((sum, mins) => sum + mins, 0) / resolutionSamples.length
    : 0;

  return {
    lookbackHours: boundedHours,
    sample: overall,
    bySignal,
    byDirection,
    avgResolutionMins,
  };
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
