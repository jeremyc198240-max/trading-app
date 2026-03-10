import type { UnifiedSignal } from "./unifiedSignal";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { appendSystemAudit } from "./systemAuditLog";

export type SignalOutcome = 'win_t1' | 'win_t2' | 'win_t3' | 'loss' | 'pending' | 'missed';

export type DisplayOutcome = 'win' | 'loss' | 'pending';

export type HitTarget = 'T1' | 'T2' | 'T3' | 'STOP' | 'MISS';
export type SignalSource = 'fusion' | 'scanner';

type ScannerRecordGate = {
  minConfidencePct: number;
  minGatingScore: number;
  minDirectionalProb: number;
  minDirectionalEdge: number;
  minRecordIntervalMins: number;
};

type SourceSummary = {
  total: number;
  completed: number;
  wins: number;
  losses: number;
  missed: number;
  pending: number;
  winRate: number;
};

export interface DailyTuningLogEntry {
  date: string;
  rolledAt: number;
  favoredSystem: 'scanner' | 'fusion' | 'tie' | 'none';
  totals: SourceSummary;
  bySource: {
    scanner: SourceSummary;
    fusion: SourceSummary;
  };
  bySymbol: Record<string, {
    total: number;
    completed: number;
    wins: number;
    losses: number;
    missed: number;
    pending: number;
    winRate: number;
    bySource: {
      scanner: SourceSummary;
      fusion: SourceSummary;
    };
  }>;
}

export interface SignalMetrics {
  symbol: string;
  lookbackHours: number;
  sample: {
    totalSignals: number;
    completedSignals: number;
    wins: number;
    losses: number;
    missed: number;
    pending: number;
  };
  rates: {
    winRate: number;
    completionRate: number;
    decisiveWinRate: number;
  };
  expectancy: {
    avgR: number;
    medianR: number;
    profitFactor: number;
    avgMfePct: number;
    avgMaePct: number;
  };
  timing: {
    avgResolutionMins: number;
    medianResolutionMins: number;
    byTarget: {
      T1: { count: number; avgMins: number };
      T2: { count: number; avgMins: number };
      T3: { count: number; avgMins: number };
      STOP: { count: number; avgMins: number };
      MISS: { count: number; avgMins: number };
    };
  };
  byGrade: Array<{
    grade: string;
    signals: number;
    completed: number;
    winRate: number;
    avgR: number;
  }>;
}

export interface SignalSnapshot {
  timestamp: number;
  symbol: string;
  source?: SignalSource;
  price: number;
  direction: string;
  grade: string;
  state: string;
  confidence: number;
  mtfAlignment: number;
  forecastConfidence: number;
  riskScore: number;
  gatingScore: number;
  directionalProbs: { up: number; down: number; chop: number };
  monsterDirection: string;
  monsterValue: number;
  entryZone: { low: number; high: number };
  stopLoss: number;
  targets: number[];
  gatingReasons: string[];
  priceAtCapture: number;
  priceNow?: number;
  priceDelta?: number;
  priceDeltaPct?: number;
  maxPriceSeen?: number;
  minPriceSeen?: number;
  mfePct?: number;
  maePct?: number;
  resolvedAt?: number;
  hitTarget?: HitTarget;
  wouldHaveWorked?: boolean;
  outcome?: SignalOutcome;
}

interface SignalHistoryStore {
  [symbol: string]: SignalSnapshot[];
}

const signalHistory: SignalHistoryStore = {};
const MAX_HISTORY_PER_SYMBOL = 500;
const MIN_RECORD_CONFIDENCE_PCT = 30;
const MIN_RECORD_GATING_SCORE = 15;
const MIN_DIRECTIONAL_EDGE = 0.08;
const MIN_DIRECTIONAL_PROB = 0.54;
const MIN_RECORD_INTERVAL_MINS = 6;
const SCANNER_MIN_RECORD_CONFIDENCE_PCT = 56;
const SCANNER_MIN_RECORD_GATING_SCORE = 50;
const SCANNER_MIN_DIRECTIONAL_EDGE = 0.2;
const SCANNER_MIN_DIRECTIONAL_PROB = 0.68;
const SCANNER_MIN_RECORD_INTERVAL_MINS = 15;
const SCANNER_ADAPTIVE_LOOKBACK_HOURS = 12;
const SCANNER_ADAPTIVE_MIN_COMPLETED = 12;
const SCANNER_ADAPTIVE_MAX_CONF_SHIFT = 8;
const SCANNER_ADAPTIVE_MAX_GATING_SHIFT = 8;
const SCANNER_ADAPTIVE_MAX_PROB_SHIFT = 0.05;
const SCANNER_ADAPTIVE_MAX_EDGE_SHIFT = 0.05;
const SCANNER_ADAPTIVE_MAX_INTERVAL_SHIFT = 8;
const SIGNAL_OUTCOME_TIMEOUT_MINS = 75;
const SIGNAL_OUTCOME_TIMEOUT_MOVE_PCT = 0.1;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SIGNAL_HISTORY_STORAGE_PATH = path.resolve(__dirname, "..", "logs", "signal_history.json");
const SIGNAL_HISTORY_DAILY_LOG_PATH = path.resolve(__dirname, "..", "logs", "signal_history_daily.jsonl");

let lastSignalTime: { [symbol: string]: number } = {};
let lastSignalGrade: { [symbol: string]: string } = {};
let lastSignalDirection: { [symbol: string]: string } = {};
let persistTimer: NodeJS.Timeout | null = null;
let scannerGateCache: { computedAt: number; gate: ScannerRecordGate } | null = null;
let activeTradingDateKey = '';

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function getAdaptiveScannerRecordGate(now: number): ScannerRecordGate {
  if (scannerGateCache && now - scannerGateCache.computedAt < 60 * 1000) {
    return scannerGateCache.gate;
  }

  const baseGate: ScannerRecordGate = {
    minConfidencePct: SCANNER_MIN_RECORD_CONFIDENCE_PCT,
    minGatingScore: SCANNER_MIN_RECORD_GATING_SCORE,
    minDirectionalProb: SCANNER_MIN_DIRECTIONAL_PROB,
    minDirectionalEdge: SCANNER_MIN_DIRECTIONAL_EDGE,
    minRecordIntervalMins: SCANNER_MIN_RECORD_INTERVAL_MINS,
  };

  const cutoff = now - SCANNER_ADAPTIVE_LOOKBACK_HOURS * 60 * 60 * 1000;
  const scannerRecent: SignalSnapshot[] = [];

  for (const entries of Object.values(signalHistory)) {
    for (const signal of entries) {
      if (signal.source !== 'scanner') continue;
      if (signal.timestamp < cutoff) continue;
      scannerRecent.push(signal);
    }
  }

  const completed = scannerRecent.filter((signal) => isCompletedOutcome(signal.outcome));
  const wins = completed.filter((signal) => isWinOutcome(signal.outcome)).length;
  const decisive = completed.filter((signal) => signal.outcome === 'loss' || isWinOutcome(signal.outcome));
  const losses = decisive.filter((signal) => signal.outcome === 'loss').length;
  const decisiveCount = wins + losses;

  if (completed.length < SCANNER_ADAPTIVE_MIN_COMPLETED || decisiveCount < 4) {
    scannerGateCache = { computedAt: now, gate: baseGate };
    return baseGate;
  }

  const winRate = decisiveCount > 0 ? wins / decisiveCount : 0.5;
  const targetWinRate = 0.53;
  const error = targetWinRate - winRate;

  const confidenceShift = clamp(
    Math.round(error * 20),
    -SCANNER_ADAPTIVE_MAX_CONF_SHIFT,
    SCANNER_ADAPTIVE_MAX_CONF_SHIFT,
  );
  const gatingShift = clamp(
    Math.round(error * 20),
    -SCANNER_ADAPTIVE_MAX_GATING_SHIFT,
    SCANNER_ADAPTIVE_MAX_GATING_SHIFT,
  );
  const probShift = clamp(
    error * 0.12,
    -SCANNER_ADAPTIVE_MAX_PROB_SHIFT,
    SCANNER_ADAPTIVE_MAX_PROB_SHIFT,
  );
  const edgeShift = clamp(
    error * 0.12,
    -SCANNER_ADAPTIVE_MAX_EDGE_SHIFT,
    SCANNER_ADAPTIVE_MAX_EDGE_SHIFT,
  );
  const intervalShift = clamp(
    Math.round(error * 16),
    -SCANNER_ADAPTIVE_MAX_INTERVAL_SHIFT,
    SCANNER_ADAPTIVE_MAX_INTERVAL_SHIFT,
  );

  const adaptiveGate: ScannerRecordGate = {
    minConfidencePct: clamp(baseGate.minConfidencePct + confidenceShift, 44, 68),
    minGatingScore: clamp(baseGate.minGatingScore + gatingShift, 30, 58),
    minDirectionalProb: clamp(baseGate.minDirectionalProb + probShift, 0.56, 0.7),
    minDirectionalEdge: clamp(baseGate.minDirectionalEdge + edgeShift, 0.1, 0.24),
    minRecordIntervalMins: clamp(baseGate.minRecordIntervalMins + intervalShift, 6, 20),
  };

  scannerGateCache = { computedAt: now, gate: adaptiveGate };
  return adaptiveGate;
}

export function getLiveTuningSnapshot(lookbackHours: number = SCANNER_ADAPTIVE_LOOKBACK_HOURS): {
  lookbackHours: number;
  gate: ScannerRecordGate;
  scanner: {
    total: number;
    completed: number;
    wins: number;
    losses: number;
    missed: number;
    winRate: number;
  };
  fusion: {
    total: number;
    completed: number;
    wins: number;
    losses: number;
    missed: number;
    winRate: number;
  };
} {
  ensureDailyRollover(Date.now());
  const boundedLookback = Number.isFinite(lookbackHours) && lookbackHours > 0
    ? Math.min(48, lookbackHours)
    : SCANNER_ADAPTIVE_LOOKBACK_HOURS;
  const now = Date.now();
  const cutoff = now - boundedLookback * 60 * 60 * 1000;
  const gate = getAdaptiveScannerRecordGate(now);

  const summarize = (source: SignalSource) => {
    const rows: SignalSnapshot[] = [];
    for (const entries of Object.values(signalHistory)) {
      for (const signal of entries) {
        if (signal.source !== source) continue;
        if (signal.timestamp < cutoff) continue;
        rows.push(signal);
      }
    }

    const completed = rows.filter((signal) => isCompletedOutcome(signal.outcome));
    const wins = completed.filter((signal) => isWinOutcome(signal.outcome)).length;
    const losses = completed.filter((signal) => signal.outcome === 'loss').length;
    const missed = completed.filter((signal) => signal.outcome === 'missed').length;
    const decisive = wins + losses;

    return {
      total: rows.length,
      completed: completed.length,
      wins,
      losses,
      missed,
      winRate: decisive > 0 ? (wins / decisive) * 100 : 0,
    };
  };

  return {
    lookbackHours: boundedLookback,
    gate,
    scanner: summarize('scanner'),
    fusion: summarize('fusion'),
  };
}

export function getDailyTuningLog(limit: number = 30): DailyTuningLogEntry[] {
  ensureDailyRollover(Date.now());
  const boundedLimit = Number.isFinite(limit) && limit > 0 ? Math.min(180, Math.floor(limit)) : 30;
  try {
    if (!fs.existsSync(SIGNAL_HISTORY_DAILY_LOG_PATH)) return [];
    const raw = fs.readFileSync(SIGNAL_HISTORY_DAILY_LOG_PATH, 'utf8');
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    const parsed = lines
      .map((line) => {
        try {
          return JSON.parse(line) as DailyTuningLogEntry;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is DailyTuningLogEntry => !!entry);

    return parsed.slice(-boundedLimit).reverse();
  } catch (error) {
    console.error('[SignalHistory] Failed reading daily tuning log:', error);
    return [];
  }
}

function ensureStorageDir(): void {
  const dir = path.dirname(SIGNAL_HISTORY_STORAGE_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function hydrateFromDisk(): void {
  try {
    if (!fs.existsSync(SIGNAL_HISTORY_STORAGE_PATH)) return;
    const raw = fs.readFileSync(SIGNAL_HISTORY_STORAGE_PATH, "utf8");
    if (!raw?.trim()) return;

    const parsed = JSON.parse(raw) as SignalHistoryStore;
    for (const [symbol, entries] of Object.entries(parsed || {})) {
      const sym = symbol.toUpperCase();
      const safeEntries = Array.isArray(entries) ? entries : [];
      signalHistory[sym] = safeEntries.slice(-MAX_HISTORY_PER_SYMBOL).map((entry) => ({
        ...entry,
        symbol: sym,
        outcome: (entry.outcome || 'pending') as SignalOutcome,
      }));

      const last = signalHistory[sym][signalHistory[sym].length - 1];
      if (last) {
        lastSignalTime[sym] = last.timestamp || 0;
        lastSignalGrade[sym] = last.grade || '';
        lastSignalDirection[sym] = last.direction || '';
      }
    }
    const latestTs = Object.values(signalHistory)
      .flat()
      .reduce((maxTs, row) => Math.max(maxTs, row.timestamp || 0), 0);
    activeTradingDateKey = toNYDateKey(latestTs > 0 ? latestTs : Date.now());
  } catch (error) {
    console.error('[SignalHistory] Failed to hydrate from disk:', error);
    activeTradingDateKey = toNYDateKey(Date.now());
  }
}

function persistToDisk(): void {
  try {
    ensureStorageDir();
    fs.writeFileSync(SIGNAL_HISTORY_STORAGE_PATH, JSON.stringify(signalHistory), "utf8");
  } catch (error) {
    console.error('[SignalHistory] Failed to persist to disk:', error);
  }
}

function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistToDisk();
  }, 250);
}

hydrateFromDisk();

export function isWinOutcome(outcome?: SignalOutcome | string): boolean {
  return typeof outcome === 'string' && outcome.startsWith('win');
}

export function isLossOutcome(outcome?: SignalOutcome | string): boolean {
  return outcome === 'loss';
}

export function isCompletedOutcome(outcome?: SignalOutcome | string): boolean {
  return isWinOutcome(outcome) || isLossOutcome(outcome) || outcome === 'missed';
}

export function toDisplayOutcome(outcome?: SignalOutcome | string): DisplayOutcome {
  if (isWinOutcome(outcome)) return 'win';
  if (isLossOutcome(outcome) || outcome === 'missed') return 'loss';
  return 'pending';
}

export function toHitTarget(outcome?: SignalOutcome | string): HitTarget | undefined {
  if (outcome === 'win_t1') return 'T1';
  if (outcome === 'win_t2') return 'T2';
  if (outcome === 'win_t3') return 'T3';
  if (outcome === 'loss') return 'STOP';
  if (outcome === 'missed') return 'MISS';
  return undefined;
}

function safeAvg(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function safeMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function getResolvedExitPrice(signal: SignalSnapshot): number {
  const entry = signal.priceAtCapture;
  if (signal.outcome === 'win_t3' && signal.targets[2]) return signal.targets[2];
  if (signal.outcome === 'win_t2' && signal.targets[1]) return signal.targets[1];
  if (signal.outcome === 'win_t1' && signal.targets[0]) return signal.targets[0];
  if (signal.outcome === 'loss' && signal.stopLoss) return signal.stopLoss;
  if (typeof signal.priceNow === 'number') return signal.priceNow;
  if (typeof signal.priceDelta === 'number') return entry + signal.priceDelta;
  return entry;
}

function getRMultiple(signal: SignalSnapshot): number {
  const entry = signal.priceAtCapture;
  const stop = signal.stopLoss;
  const riskPct = entry > 0 ? Math.abs((stop - entry) / entry) * 100 : 0;
  if (!Number.isFinite(riskPct) || riskPct <= 0) return 0;

  const exit = getResolvedExitPrice(signal);
  const isCall = signal.direction === 'CALL' || signal.direction === 'bullish';
  const isPut = signal.direction === 'PUT' || signal.direction === 'bearish';

  let movePct = 0;
  if (isCall) {
    movePct = entry > 0 ? ((exit - entry) / entry) * 100 : 0;
  } else if (isPut) {
    movePct = entry > 0 ? ((entry - exit) / entry) * 100 : 0;
  }

  if (!Number.isFinite(movePct)) return 0;
  return movePct / riskPct;
}

function getResolutionMins(signal: SignalSnapshot): number {
  if (!signal.resolvedAt) return 0;
  return Math.max(0, (signal.resolvedAt - signal.timestamp) / 60000);
}

function toNYDateKey(ts: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(ts));
}

function summarizeRows(rows: SignalSnapshot[]): SourceSummary {
  const completed = rows.filter((signal) => isCompletedOutcome(signal.outcome));
  const wins = completed.filter((signal) => isWinOutcome(signal.outcome)).length;
  const losses = completed.filter((signal) => signal.outcome === 'loss').length;
  const missed = completed.filter((signal) => signal.outcome === 'missed').length;
  const pending = rows.filter((signal) => signal.outcome === 'pending').length;
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

function buildDailyTuningLogEntry(dateKey: string, rolledAt: number): DailyTuningLogEntry | null {
  const allRows: SignalSnapshot[] = [];
  for (const entries of Object.values(signalHistory)) {
    for (const signal of entries) {
      allRows.push(signal);
    }
  }
  if (allRows.length === 0) return null;

  const scannerRows = allRows.filter((signal) => signal.source === 'scanner');
  const fusionRows = allRows.filter((signal) => signal.source !== 'scanner');
  const scanner = summarizeRows(scannerRows);
  const fusion = summarizeRows(fusionRows);
  const totals = summarizeRows(allRows);

  const scannerDecisive = scanner.wins + scanner.losses;
  const fusionDecisive = fusion.wins + fusion.losses;
  const scannerWinRate = scannerDecisive > 0 ? scanner.wins / scannerDecisive : 0;
  const fusionWinRate = fusionDecisive > 0 ? fusion.wins / fusionDecisive : 0;

  let favoredSystem: DailyTuningLogEntry['favoredSystem'] = 'none';
  if (scannerDecisive > 0 || fusionDecisive > 0) {
    if (Math.abs(scannerWinRate - fusionWinRate) < 0.02) favoredSystem = 'tie';
    else favoredSystem = scannerWinRate > fusionWinRate ? 'scanner' : 'fusion';
  }

  const bySymbol: DailyTuningLogEntry['bySymbol'] = {};
  for (const [symbol, rows] of Object.entries(signalHistory)) {
    if (!rows || rows.length === 0) continue;
    const symbolScanner = rows.filter((signal) => signal.source === 'scanner');
    const symbolFusion = rows.filter((signal) => signal.source !== 'scanner');
    bySymbol[symbol] = {
      ...summarizeRows(rows),
      bySource: {
        scanner: summarizeRows(symbolScanner),
        fusion: summarizeRows(symbolFusion),
      },
    };
  }

  return {
    date: dateKey,
    rolledAt,
    favoredSystem,
    totals,
    bySource: {
      scanner,
      fusion,
    },
    bySymbol,
  };
}

function appendDailyLog(entry: DailyTuningLogEntry): void {
  try {
    ensureStorageDir();
    fs.appendFileSync(SIGNAL_HISTORY_DAILY_LOG_PATH, `${JSON.stringify(entry)}\n`, 'utf8');
  } catch (error) {
    console.error('[SignalHistory] Failed to append daily log:', error);
  }
}

function performLiveClear(): void {
  for (const sym in signalHistory) {
    signalHistory[sym] = [];
  }
  lastSignalTime = {};
  lastSignalGrade = {};
  lastSignalDirection = {};
  scannerGateCache = null;
  schedulePersist();
}

function ensureDailyRollover(now: number = Date.now()): void {
  const currentDateKey = toNYDateKey(now);
  if (!activeTradingDateKey) {
    activeTradingDateKey = currentDateKey;
    return;
  }
  if (activeTradingDateKey === currentDateKey) return;

  const entry = buildDailyTuningLogEntry(activeTradingDateKey, now);
  if (entry) appendDailyLog(entry);

  performLiveClear();
  activeTradingDateKey = currentDateKey;
}

export function recordSignal(
  symbol: string,
  price: number,
  unifiedSignal: UnifiedSignal,
  monsterGate?: { value: number; direction: string },
  options?: { source?: SignalSource }
): void {
  const now = Date.now();
  ensureDailyRollover(now);
  const sym = symbol.toUpperCase();
  const source: SignalSource = options?.source === 'scanner' ? 'scanner' : 'fusion';
  
  if (!signalHistory[sym]) {
    signalHistory[sym] = [];
  }
  
  const currentGrade = unifiedSignal.setupGrade || 'WAIT';
  const currentDirection = unifiedSignal.unifiedDirection || 'NONE';
  
  const lastTime = lastSignalTime[sym] || 0;
  const lastGrade = lastSignalGrade[sym] || '';
  const lastDir = lastSignalDirection[sym] || '';
  
  const timeSinceLastMins = (now - lastTime) / 60000;
  const gradeChanged = currentGrade !== lastGrade;
  const directionChanged = currentDirection !== lastDir;
  const actionableState = unifiedSignal.state === 'ACTIVE';
  const actionableDirection = currentDirection === 'CALL' || currentDirection === 'PUT';
  const confidencePct = Number.isFinite(unifiedSignal.unifiedConfidence)
    ? Number(unifiedSignal.unifiedConfidence)
    : Number(unifiedSignal.confidence || 0) * 100;
  const gatingScore = Number.isFinite(unifiedSignal.gatingScore)
    ? Number(unifiedSignal.gatingScore)
    : Number(unifiedSignal.gatingState?.gatingScore || 0) * 100;
  const reasons = unifiedSignal.gatingState?.reasons || [];
  const hasBlockedReason = reasons.some((reason) =>
    /consolidation|global gate failed|low_live_coverage|wait for breakout/i.test(reason)
  );

  const directionalProbs = unifiedSignal.directionalProbs || { up: 0, down: 0, chop: 1 };
  const upProb = Number.isFinite(directionalProbs.up) ? directionalProbs.up : 0;
  const downProb = Number.isFinite(directionalProbs.down) ? directionalProbs.down : 0;
  const directionalEdge = Math.abs(upProb - downProb);
  const directionalProb = currentDirection === 'CALL' ? upProb : downProb;
  const scannerGate = source === 'scanner' ? getAdaptiveScannerRecordGate(now) : null;
  const minConfidencePct = source === 'scanner'
    ? (scannerGate?.minConfidencePct ?? SCANNER_MIN_RECORD_CONFIDENCE_PCT)
    : MIN_RECORD_CONFIDENCE_PCT;
  const minGatingScore = source === 'scanner'
    ? (scannerGate?.minGatingScore ?? SCANNER_MIN_RECORD_GATING_SCORE)
    : MIN_RECORD_GATING_SCORE;
  const minDirectionalProb = source === 'scanner'
    ? (scannerGate?.minDirectionalProb ?? SCANNER_MIN_DIRECTIONAL_PROB)
    : MIN_DIRECTIONAL_PROB;
  const minDirectionalEdge = source === 'scanner'
    ? (scannerGate?.minDirectionalEdge ?? SCANNER_MIN_DIRECTIONAL_EDGE)
    : MIN_DIRECTIONAL_EDGE;
  const minRecordIntervalMins = source === 'scanner'
    ? (scannerGate?.minRecordIntervalMins ?? SCANNER_MIN_RECORD_INTERVAL_MINS)
    : MIN_RECORD_INTERVAL_MINS;
  const directionSupported = directionalProb >= minDirectionalProb && directionalEdge >= minDirectionalEdge;
  const scannerGradeOk = source !== 'scanner' || currentGrade === 'HOT' || currentGrade === 'GOLD';
  const scannerStateOk = source !== 'scanner' || currentGrade !== 'BUILDING';

  const confidenceChangedEnough = (() => {
    const prev = signalHistory[sym][signalHistory[sym].length - 1]?.confidence;
    if (!Number.isFinite(prev)) return true;
    return Math.abs(confidencePct - Number(prev)) >= 8;
  })();
  
  // Record all actionable directional signals for unbiased analytics
  if (!actionableState || !actionableDirection) return;

  const passesQualityGate =
    confidencePct >= minConfidencePct &&
    gatingScore >= minGatingScore &&
    directionSupported &&
    scannerGradeOk &&
    scannerStateOk &&
    !hasBlockedReason;

  if (!passesQualityGate) return;
  
  const shouldRecord = 
    timeSinceLastMins >= minRecordIntervalMins ||
    gradeChanged ||
    directionChanged ||
    confidenceChangedEnough ||
    signalHistory[sym].length === 0;
  
  if (!shouldRecord) return;
  
  const snapshot: SignalSnapshot = {
    timestamp: now,
    symbol: sym,
    source,
    price,
    direction: currentDirection,
    grade: currentGrade,
    state: unifiedSignal.state,
    confidence: confidencePct,
    mtfAlignment: unifiedSignal.mtfAlignment,
    forecastConfidence: unifiedSignal.forecastConfidence,
    riskScore: unifiedSignal.riskScore,
    gatingScore,
    directionalProbs: unifiedSignal.directionalProbs,
    monsterDirection: monsterGate?.direction || 'none',
    monsterValue: monsterGate?.value || 0,
    entryZone: unifiedSignal.entryZone || { low: price * 0.998, high: price * 1.002 },
    stopLoss: unifiedSignal.stopLoss || (currentDirection === 'CALL' ? price * 0.995 : price * 1.005),
    targets: unifiedSignal.targets || unifiedSignal.priceTargets || [],
    gatingReasons: reasons,
    priceAtCapture: price,
    maxPriceSeen: price,
    minPriceSeen: price,
    outcome: 'pending'
  };
  
  signalHistory[sym].push(snapshot);

  appendSystemAudit('signal.recorded', {
    symbol: sym,
    source,
    direction: snapshot.direction,
    grade: snapshot.grade,
    state: snapshot.state,
    confidence: snapshot.confidence,
    gatingScore: snapshot.gatingScore,
    mtfAlignment: snapshot.mtfAlignment,
    forecastConfidence: snapshot.forecastConfidence,
    riskScore: snapshot.riskScore,
    priceAtCapture: snapshot.priceAtCapture,
    stopLoss: snapshot.stopLoss,
    target1: snapshot.targets?.[0] ?? null,
    blockedReasons: snapshot.gatingReasons,
  });
  
  if (signalHistory[sym].length > MAX_HISTORY_PER_SYMBOL) {
    signalHistory[sym] = signalHistory[sym].slice(-MAX_HISTORY_PER_SYMBOL);
  }

  schedulePersist();
  
  lastSignalTime[sym] = now;
  lastSignalGrade[sym] = currentGrade;
  lastSignalDirection[sym] = currentDirection;
  
  if (process.env.DEBUG_SIGNALS === '1') {
    console.log(`[SignalHistory] ${currentGrade} ${currentDirection} recorded for ${sym} @ $${price.toFixed(2)} | Conf: ${snapshot.confidence.toFixed(0)}%`);
  }
}

export function updateOutcomes(
  symbol: string,
  currentPrice: number,
  context?: { high?: number; low?: number; now?: number }
): void {
  ensureDailyRollover(context?.now ?? Date.now());
  const sym = symbol.toUpperCase();
  const history = signalHistory[sym];
  if (!history) return;

  let didMutate = false;
  const observedHigh = Math.max(currentPrice, context?.high ?? currentPrice);
  const observedLow = Math.min(currentPrice, context?.low ?? currentPrice);
  const evaluationNow = context?.now ?? Date.now();
  
  for (const signal of history) {
    if (signal.outcome !== 'pending') continue;
    const outcomeBefore = signal.outcome;
    didMutate = true;
    
    signal.priceNow = currentPrice;
    signal.priceDelta = currentPrice - signal.priceAtCapture;
    signal.priceDeltaPct = (signal.priceDelta / signal.priceAtCapture) * 100;
    signal.maxPriceSeen = Math.max(signal.maxPriceSeen ?? signal.priceAtCapture, observedHigh);
    signal.minPriceSeen = Math.min(signal.minPriceSeen ?? signal.priceAtCapture, observedLow);
    
    const isCall = signal.direction === 'CALL' || signal.direction === 'bullish';
    const isPut = signal.direction === 'PUT' || signal.direction === 'bearish';
    
    const t1 = signal.targets[0];
    const t2 = signal.targets[1];
    const t3 = signal.targets[2];
    const stop = signal.stopLoss;
    
    const ageMinutes = (evaluationNow - signal.timestamp) / 60000;
    const priceDeltaPct = signal.priceDeltaPct ?? 0;

    if (isCall) {
      signal.mfePct = ((signal.maxPriceSeen - signal.priceAtCapture) / signal.priceAtCapture) * 100;
      signal.maePct = ((signal.minPriceSeen - signal.priceAtCapture) / signal.priceAtCapture) * 100;
    } else if (isPut) {
      signal.mfePct = ((signal.priceAtCapture - signal.minPriceSeen) / signal.priceAtCapture) * 100;
      signal.maePct = ((signal.priceAtCapture - signal.maxPriceSeen) / signal.priceAtCapture) * 100;
    }
    
    if (isCall) {
      const stopTouched = observedLow <= stop;
      const t1Touched = !!t1 && observedHigh >= t1;
      const t2Touched = !!t2 && observedHigh >= t2;
      const t3Touched = !!t3 && observedHigh >= t3;
      const anyTargetTouched = t1Touched || t2Touched || t3Touched;

      if (stopTouched && anyTargetTouched) {
        signal.outcome = 'missed';
        signal.hitTarget = 'MISS';
        signal.resolvedAt = evaluationNow;
        signal.wouldHaveWorked = false;
      } else if (stopTouched) {
        signal.outcome = 'loss';
        signal.hitTarget = 'STOP';
        signal.resolvedAt = evaluationNow;
        signal.wouldHaveWorked = false;
      } else if (t3Touched) {
        signal.outcome = 'win_t3';
        signal.hitTarget = 'T3';
        signal.resolvedAt = evaluationNow;
        signal.wouldHaveWorked = true;
      } else if (t2Touched) {
        signal.outcome = 'win_t2';
        signal.hitTarget = 'T2';
        signal.resolvedAt = evaluationNow;
        signal.wouldHaveWorked = true;
      } else if (t1Touched) {
        signal.outcome = 'win_t1';
        signal.hitTarget = 'T1';
        signal.resolvedAt = evaluationNow;
        signal.wouldHaveWorked = true;
      } else if (ageMinutes > SIGNAL_OUTCOME_TIMEOUT_MINS) {
        signal.outcome = priceDeltaPct > SIGNAL_OUTCOME_TIMEOUT_MOVE_PCT ? 'win_t1' : 'missed';
        signal.hitTarget = signal.outcome === 'win_t1' ? 'T1' : 'MISS';
        signal.resolvedAt = evaluationNow;
        signal.wouldHaveWorked = priceDeltaPct > SIGNAL_OUTCOME_TIMEOUT_MOVE_PCT;
      }
    } else if (isPut) {
      const stopTouched = observedHigh >= stop;
      const t1Touched = !!t1 && observedLow <= t1;
      const t2Touched = !!t2 && observedLow <= t2;
      const t3Touched = !!t3 && observedLow <= t3;
      const anyTargetTouched = t1Touched || t2Touched || t3Touched;

      if (stopTouched && anyTargetTouched) {
        signal.outcome = 'missed';
        signal.hitTarget = 'MISS';
        signal.resolvedAt = evaluationNow;
        signal.wouldHaveWorked = false;
      } else if (stopTouched) {
        signal.outcome = 'loss';
        signal.hitTarget = 'STOP';
        signal.resolvedAt = evaluationNow;
        signal.wouldHaveWorked = false;
      } else if (t3Touched) {
        signal.outcome = 'win_t3';
        signal.hitTarget = 'T3';
        signal.resolvedAt = evaluationNow;
        signal.wouldHaveWorked = true;
      } else if (t2Touched) {
        signal.outcome = 'win_t2';
        signal.hitTarget = 'T2';
        signal.resolvedAt = evaluationNow;
        signal.wouldHaveWorked = true;
      } else if (t1Touched) {
        signal.outcome = 'win_t1';
        signal.hitTarget = 'T1';
        signal.resolvedAt = evaluationNow;
        signal.wouldHaveWorked = true;
      } else if (ageMinutes > SIGNAL_OUTCOME_TIMEOUT_MINS) {
        signal.outcome = priceDeltaPct < -SIGNAL_OUTCOME_TIMEOUT_MOVE_PCT ? 'win_t1' : 'missed';
        signal.hitTarget = signal.outcome === 'win_t1' ? 'T1' : 'MISS';
        signal.resolvedAt = evaluationNow;
        signal.wouldHaveWorked = priceDeltaPct < -SIGNAL_OUTCOME_TIMEOUT_MOVE_PCT;
      }
    }

    if (outcomeBefore === 'pending' && signal.outcome && signal.outcome !== 'pending') {
      appendSystemAudit('signal.resolved', {
        symbol: signal.symbol,
        source: signal.source || 'fusion',
        direction: signal.direction,
        grade: signal.grade,
        outcome: signal.outcome,
        hitTarget: signal.hitTarget || null,
        wouldHaveWorked: signal.wouldHaveWorked ?? null,
        priceAtCapture: signal.priceAtCapture,
        priceNow: signal.priceNow ?? currentPrice,
        priceDeltaPct: signal.priceDeltaPct ?? 0,
        mfePct: signal.mfePct ?? 0,
        maePct: signal.maePct ?? 0,
        ageMinutes,
      });
    }
  }

  if (didMutate) {
    schedulePersist();
  }
}

export function getSignalHistory(symbol: string, limit: number = 50): SignalSnapshot[] {
  ensureDailyRollover(Date.now());
  const sym = symbol.toUpperCase();
  const history = signalHistory[sym] || [];
  return history.slice(-limit).reverse();
}

export function getGoldHotSignals(symbol: string, limit: number = 20): SignalSnapshot[] {
  ensureDailyRollover(Date.now());
  const sym = symbol.toUpperCase();
  const history = signalHistory[sym] || [];
  return history
    .filter(s => s.grade === 'GOLD' || s.grade === 'HOT')
    .slice(-limit)
    .reverse();
}

export function getDailySummary(symbol: string): {
  totalSignals: number;
  goldSignals: number;
  hotSignals: number;
  callSignals: number;
  putSignals: number;
  winRate: number;
  wins: number;
  losses: number;
  pending: number;
  missed: number;
  avgConfidence: number;
  bestSignal: SignalSnapshot | null;
  worstSignal: SignalSnapshot | null;
} {
  ensureDailyRollover(Date.now());
  const sym = symbol.toUpperCase();
  const history = signalHistory[sym] || [];
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStart = today.getTime();
  
  const todaySignals = history.filter(s => s.timestamp >= todayStart);
  
  const goldSignals = todaySignals.filter(s => s.grade === 'GOLD').length;
  const hotSignals = todaySignals.filter(s => s.grade === 'HOT').length;
  const callSignals = todaySignals.filter(s => s.direction === 'CALL' || s.direction === 'bullish').length;
  const putSignals = todaySignals.filter(s => s.direction === 'PUT' || s.direction === 'bearish').length;
  
  const wins = todaySignals.filter(s => s.outcome?.startsWith('win')).length;
  const losses = todaySignals.filter(s => s.outcome === 'loss').length;
  const pending = todaySignals.filter(s => s.outcome === 'pending').length;
  const missed = todaySignals.filter(s => s.outcome === 'missed').length;
  
  const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;
  
  const avgConfidence = todaySignals.length > 0 
    ? todaySignals.reduce((sum, s) => sum + s.confidence, 0) / todaySignals.length 
    : 0;
  
  const completedSignals = todaySignals.filter(s => s.outcome !== 'pending');
  const bestSignal = completedSignals.length > 0
    ? completedSignals.reduce((best, s) => 
        (s.priceDeltaPct || 0) > (best.priceDeltaPct || 0) ? s : best)
    : null;
  const worstSignal = completedSignals.length > 0
    ? completedSignals.reduce((worst, s) => 
        (s.priceDeltaPct || 0) < (worst.priceDeltaPct || 0) ? s : worst)
    : null;
  
  return {
    totalSignals: todaySignals.length,
    goldSignals,
    hotSignals,
    callSignals,
    putSignals,
    winRate,
    wins,
    losses,
    pending,
    missed,
    avgConfidence,
    bestSignal,
    worstSignal
  };
}

export function getAllSymbolsWithHistory(): string[] {
  ensureDailyRollover(Date.now());
  return Object.keys(signalHistory);
}

export function getSignalMetrics(symbol: string, lookbackHours: number = 24): SignalMetrics {
  ensureDailyRollover(Date.now());
  const sym = symbol.toUpperCase();
  const history = signalHistory[sym] || [];
  const boundedLookbackHours = Number.isFinite(lookbackHours) && lookbackHours > 0 ? Math.min(720, lookbackHours) : 24;
  const cutoff = Date.now() - boundedLookbackHours * 60 * 60 * 1000;
  const scoped = history.filter((signal) => signal.timestamp >= cutoff);

  const completed = scoped.filter((signal) => isCompletedOutcome(signal.outcome));
  const wins = completed.filter((signal) => isWinOutcome(signal.outcome));
  const losses = completed.filter((signal) => isLossOutcome(signal.outcome));
  const missed = completed.filter((signal) => signal.outcome === 'missed');
  const pending = scoped.filter((signal) => signal.outcome === 'pending');

  const rValues = completed.map(getRMultiple).filter((value) => Number.isFinite(value));
  const positiveR = rValues.filter((value) => value > 0);
  const negativeR = rValues.filter((value) => value < 0);
  const mfeValues = scoped.map((signal) => signal.mfePct ?? 0).filter((value) => Number.isFinite(value));
  const maeValues = scoped.map((signal) => signal.maePct ?? 0).filter((value) => Number.isFinite(value));

  const resolutionSamples = completed
    .map((signal) => getResolutionMins(signal))
    .filter((value) => Number.isFinite(value) && value > 0);

  const targetKeys: HitTarget[] = ['T1', 'T2', 'T3', 'STOP', 'MISS'];
  const byTarget = {
    T1: { count: 0, avgMins: 0 },
    T2: { count: 0, avgMins: 0 },
    T3: { count: 0, avgMins: 0 },
    STOP: { count: 0, avgMins: 0 },
    MISS: { count: 0, avgMins: 0 },
  };

  for (const key of targetKeys) {
    const targetSignals = completed.filter((signal) => signal.hitTarget === key);
    const targetTimes = targetSignals
      .map((signal) => getResolutionMins(signal))
      .filter((value) => Number.isFinite(value) && value > 0);

    byTarget[key] = {
      count: targetSignals.length,
      avgMins: safeAvg(targetTimes),
    };
  }

  const grades = Array.from(new Set(scoped.map((signal) => signal.grade))).filter(Boolean);
  const byGrade = grades
    .map((grade) => {
      const gradeSignals = scoped.filter((signal) => signal.grade === grade);
      const gradeCompleted = gradeSignals.filter((signal) => isCompletedOutcome(signal.outcome));
      const gradeWins = gradeCompleted.filter((signal) => isWinOutcome(signal.outcome));
      const gradeR = gradeCompleted.map(getRMultiple).filter((value) => Number.isFinite(value));

      return {
        grade,
        signals: gradeSignals.length,
        completed: gradeCompleted.length,
        winRate: gradeCompleted.length > 0 ? (gradeWins.length / gradeCompleted.length) * 100 : 0,
        avgR: safeAvg(gradeR),
      };
    })
    .sort((a, b) => b.signals - a.signals);

  const decisiveDenominator = wins.length + losses.length;

  return {
    symbol: sym,
    lookbackHours: boundedLookbackHours,
    sample: {
      totalSignals: scoped.length,
      completedSignals: completed.length,
      wins: wins.length,
      losses: losses.length,
      missed: missed.length,
      pending: pending.length,
    },
    rates: {
      winRate: completed.length > 0 ? (wins.length / completed.length) * 100 : 0,
      completionRate: scoped.length > 0 ? (completed.length / scoped.length) * 100 : 0,
      decisiveWinRate: decisiveDenominator > 0 ? (wins.length / decisiveDenominator) * 100 : 0,
    },
    expectancy: {
      avgR: safeAvg(rValues),
      medianR: safeMedian(rValues),
      profitFactor: negativeR.length > 0
        ? positiveR.reduce((sum, value) => sum + value, 0) / Math.abs(negativeR.reduce((sum, value) => sum + value, 0))
        : positiveR.length > 0 ? 999 : 0,
      avgMfePct: safeAvg(mfeValues),
      avgMaePct: safeAvg(maeValues),
    },
    timing: {
      avgResolutionMins: safeAvg(resolutionSamples),
      medianResolutionMins: safeMedian(resolutionSamples),
      byTarget,
    },
    byGrade,
  };
}

export function clearHistory(symbol?: string): void {
  if (symbol) {
    const sym = symbol.toUpperCase();
    signalHistory[sym] = [];
    delete lastSignalTime[sym];
    delete lastSignalGrade[sym];
    delete lastSignalDirection[sym];
  } else {
    for (const sym in signalHistory) {
      signalHistory[sym] = [];
    }
    lastSignalTime = {};
    lastSignalGrade = {};
    lastSignalDirection = {};
    scannerGateCache = null;
    activeTradingDateKey = toNYDateKey(Date.now());
  }

  schedulePersist();
}
