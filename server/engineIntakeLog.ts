/**
 * Engine Intake Log (10-minute intervals)
 * 
 * Collects all engine outputs every 10 minutes:
 * - Signals created (type, direction, scores)
 * - Why signals were created (triggers, indicators, scores)
 * - Engine state and confidence metrics
 * - Per-symbol signal breakdown
 * 
 * Use this log to tune the engine by understanding signal creation patterns.
 */

import fs from "fs";
import path from "path";

export interface SignalSnapshot {
  symbol: string;
  timeframe: string;
  signalType: string | null;
  direction: "bullish" | "bearish" | "neutral";
  breakoutScore?: number;
  edgeScore?: number;
  confidence?: number;
  triggers: string[];
  indicators: {
    rsi?: number;
    adx?: number;
    momentum?: number;
    volumeSpike?: number;
    bbPercentB?: number;
    stochasticK?: number;
  };
}

export interface EngineOutputSnapshot {
  engineName: string;
  outputType: string;
  symbol: string;
  timeframe?: string;
  active?: boolean;
  bias?: string;
  strength?: number;
  edgeScore?: number;
  confidence?: number;
  modelProbability?: number;
  decision?: string;
  reasons?: string[];
  details?: Record<string, unknown>;
}

export interface EngineIntakeEntry {
  timestamp: string;
  unixMs: number;
  intervalMinutes: number;
  isMarketOpen: boolean;
  
  // Summary stats
  summary: {
    totalSymbolsScanned: number;
    signalsCreated: number;
    engineOutputsCaptured: number;
    signalsByType: Record<string, number>;
    signalsByDirection: Record<string, number>;
    avgBreakoutScore: number;
    avgEdgeScore: number;
    avgConfidence: number;
  };
  
  // Per-signal detailed breakdown
  signals: SignalSnapshot[];
  
  // Engine outputs captured during this interval
  engineOutputs: EngineOutputSnapshot[];
  
  // Per-symbol summary
  bySymbol: Record<string, {
    scanned: boolean;
    signalsCreated: number;
    signalTypes: string[];
    highestScore: number;
    avgConfidence: number;
  }>;
  
  // Top trigger reasons
  topTriggers: Array<{
    reason: string;
    frequency: number;
    avgScore: number;
  }>;
  
  // Engine state aggregates
  engineState: {
    averageState: Record<string, number>;
    averageLeadMinutes: number;
    triggerReadiness: number; // 0-100
  };
  
  // Quality metrics
  quality: {
    readinessScore: number; // 0-100: how ready the engine is to generate signals
    healthScore: string; // A-D grade
    volatilityRegime: string;
    marketCondition: string;
  };
}

// In-memory buffer for current interval
let currentIntervalSignals: SignalSnapshot[] = [];
let currentIntervalEngineOutputs: EngineOutputSnapshot[] = [];
let currentIntervalStartMs: number = 0;
let scannedSymbols: Set<string> = new Set();

// Global state references
declare global {
  var engineIntakeSamples: Array<{
    symbol: string;
    timeframe: string;
    breakoutSignal: string | null;
    breakoutScore: number;
    edgeEngine?: any;
    indicators?: any;
  }>;
}

/**
 * Add a signal to the current interval buffer
 */
export function recordSignalToIntake(signal: SignalSnapshot) {
  // Initialize interval if needed
  if (currentIntervalStartMs === 0) {
    initializeInterval();
  }

  currentIntervalSignals.push(signal);
  scannedSymbols.add(signal.symbol);
}

/**
 * Record that a symbol was scanned (even if no signal created)
 */
export function recordSymbolScanned(symbol: string) {
  scannedSymbols.add(symbol);
}

export function recordEngineOutput(output: EngineOutputSnapshot) {
  if (currentIntervalStartMs === 0) {
    initializeInterval();
  }
  currentIntervalEngineOutputs.push(output);
  scannedSymbols.add(output.symbol);
}

export function startEngineIntakeInterval() {
  if (currentIntervalStartMs === 0) {
    initializeInterval();
  }
}

/**
 * Initialize a new 10-minute interval
 */
function initializeInterval() {
  currentIntervalStartMs = Date.now();
  currentIntervalSignals = [];
  currentIntervalEngineOutputs = [];
  scannedSymbols = new Set();
}

/**
 * Roll the 10-minute interval and write to log
 */
export function rollEngineIntakeLog() {
  if (currentIntervalStartMs === 0) {
    initializeInterval();
  }

  const now = Date.now();
  const durationMs = now - currentIntervalStartMs;
  const durationMins = Math.round(durationMs / 60000);

  // Aggregate signal data
  const signalsByType: Record<string, number> = {};
  const signalsByDirection: Record<string, number> = {};
  let totalBreakoutScore = 0;
  let totalEdgeScore = 0;
  let totalConfidence = 0;
  let scoreCount = 0;

  const triggerFrequency: Record<string, { count: number; scores: number[] }> = {};
  const bySymbol: Record<string, {
    scanned: boolean;
    signalsCreated: number;
    signalTypes: string[];
    highestScore: number;
    avgConfidence: number;
  }> = {};

  // Initialize by-symbol tracking
  for (const sym of scannedSymbols) {
    bySymbol[sym] = {
      scanned: true,
      signalsCreated: 0,
      signalTypes: [],
      highestScore: 0,
      avgConfidence: 0,
    };
  }

  // Process signals
  const confidences: number[] = [];
  for (const signal of currentIntervalSignals) {
    // Track by type
    if (signal.signalType) {
      signalsByType[signal.signalType] = (signalsByType[signal.signalType] || 0) + 1;
    }

    // Track by direction
    const dir = signal.direction || "neutral";
    signalsByDirection[dir] = (signalsByDirection[dir] || 0) + 1;

    // Aggregate scores
    if (signal.breakoutScore !== undefined) {
      totalBreakoutScore += signal.breakoutScore;
      scoreCount++;
    }
    if (signal.edgeScore !== undefined) {
      totalEdgeScore += signal.edgeScore;
    }
    if (signal.confidence !== undefined) {
      totalConfidence += signal.confidence;
      confidences.push(signal.confidence);
    }

    // Track triggers
    for (const trigger of signal.triggers) {
      if (!triggerFrequency[trigger]) {
        triggerFrequency[trigger] = { count: 0, scores: [] };
      }
      triggerFrequency[trigger].count++;
      if (signal.edgeScore) {
        triggerFrequency[trigger].scores.push(signal.edgeScore);
      }
    }

    // Update by-symbol stats
    if (bySymbol[signal.symbol]) {
      bySymbol[signal.symbol].signalsCreated++;
      bySymbol[signal.symbol].signalTypes.push(signal.signalType || "null");
      bySymbol[signal.symbol].highestScore = Math.max(
        bySymbol[signal.symbol].highestScore,
        signal.edgeScore || 0
      );
      if (signal.confidence) {
        confidences.push(signal.confidence);
      }
    }
  }

  // Calculate per-symbol avg confidence
  if (confidences.length > 0) {
    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
    for (const sym of Object.keys(bySymbol)) {
      bySymbol[sym].avgConfidence = avgConfidence;
    }
  }

  // Top triggers ranked by frequency and avg score
  const topTriggers = Object.entries(triggerFrequency)
    .map(([reason, data]) => ({
      reason,
      frequency: data.count,
      avgScore: data.scores.length > 0 ? data.scores.reduce((a, b) => a + b, 0) / data.scores.length : 0,
    }))
    .sort((a, b) => b.frequency - a.frequency || b.avgScore - a.avgScore)
    .slice(0, 10);

  // Build entry
  const entry: EngineIntakeEntry = {
    timestamp: new Date().toISOString(),
    unixMs: currentIntervalStartMs,
    intervalMinutes: durationMins,
    isMarketOpen: isMarketOpenEST(),

    summary: {
      totalSymbolsScanned: scannedSymbols.size,
      signalsCreated: currentIntervalSignals.length,
      engineOutputsCaptured: currentIntervalEngineOutputs.length,
      signalsByType,
      signalsByDirection,
      avgBreakoutScore: scoreCount > 0 ? totalBreakoutScore / scoreCount : 0,
      avgEdgeScore: currentIntervalSignals.length > 0 ? totalEdgeScore / currentIntervalSignals.length : 0,
      avgConfidence: currentIntervalSignals.length > 0 ? totalConfidence / currentIntervalSignals.length : 0,
    },

    signals: currentIntervalSignals,
    engineOutputs: currentIntervalEngineOutputs,
    bySymbol,
    topTriggers,

    engineState: {
      averageState: {},
      averageLeadMinutes: 0,
      triggerReadiness: 0,
    },

    quality: {
      readinessScore: scannedSymbols.size > 0
        ? Math.min(100, (currentIntervalSignals.length / scannedSymbols.size) * 50 + (totalConfidence / currentIntervalSignals.length || 0) * 50)
        : 0,
      healthScore: scoreCount > 0 ? "A" : "B",
      volatilityRegime: "unknown",
      marketCondition: "unknown",
    },
  };

  // Write to log file
  writeToLog(entry);

  // Reset interval
  initializeInterval();
}

/**
 * Write entry to rotating log file (10-day retention)
 */
function writeToLog(entry: EngineIntakeEntry) {
  const logsDir = path.join("logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
  }

  // 10-day rotation (every 10 days, use next file)
  const dayIndex = Math.floor(Date.now() / 86400000) % 10;
  const filePath = path.join(logsDir, `engine_intake_10m_${dayIndex}.jsonl`);

  // Clear file if it's from a previous day
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    const now = new Date();
    const startOfDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    if (stats.mtimeMs < startOfDay) {
      fs.writeFileSync(filePath, "");
    }
  }

  // Clean up stale files
  const files = fs.readdirSync(logsDir);
  const cutoff = Date.now() - 10 * 86400000;
  for (const f of files) {
    if (f.startsWith("engine_intake_10m_")) {
      const p = path.join(logsDir, f);
      try {
        const st = fs.statSync(p);
        if (st.mtimeMs < cutoff) {
          fs.unlinkSync(p);
        }
      } catch {
        // ignore
      }
    }
  }

  // Append entry
  fs.appendFileSync(filePath, JSON.stringify(entry) + "\n");
  console.log(`[EngineIntakeLog] Wrote 10m snapshot: ${entry.summary.signalsCreated} signals from ${entry.summary.totalSymbolsScanned} symbols`);
}

/**
 * Check if market is open (EST)
 */
function isMarketOpenEST(): boolean {
  const now = new Date();
  const est = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));

  const h = est.getHours();
  const m = est.getMinutes();

  const afterOpen = h > 8 || (h === 8 && m >= 30);
  const beforeClose = h < 16;

  return afterOpen && beforeClose;
}

/**
 * Get current interval status (for debugging)
 */
export function getIntakeStatus() {
  return {
    currentSignals: currentIntervalSignals.length,
    currentEngineOutputs: currentIntervalEngineOutputs.length,
    symbolsScanned: scannedSymbols.size,
    intervalStartMs: currentIntervalStartMs,
    elapsedMinutes: currentIntervalStartMs > 0 ? Math.round((Date.now() - currentIntervalStartMs) / 60000) : 0,
  };
}

/**
 * Get the latest intake log entry from disk
 */
export function getLatestIntakeEntry(): EngineIntakeEntry | null {
  const logsDir = path.join("logs");
  if (!fs.existsSync(logsDir)) {
    // Return demo data if no logs exist
    console.log("[EngineIntakeLog] No log directory - returning demo data");
    return createDemoIntakeEntry();
  }

  const files = fs
    .readdirSync(logsDir)
    .filter((f) => f.startsWith("engine_intake_10m_"))
    .sort()
    .reverse();

  for (const file of files) {
    const filePath = path.join(logsDir, file);
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.trim().split("\n").filter((l) => l.trim());
      if (lines.length > 0) {
        const lastLine = lines[lines.length - 1];
        return JSON.parse(lastLine) as EngineIntakeEntry;
      }
    } catch {
      // Skip unreadable files
    }
  }

  // Return demo data if no valid entries found
  console.log("[EngineIntakeLog] No valid entries found - returning demo data");
  return createDemoIntakeEntry();
}

/**
 * Get recent intake entries (last N snapshots)
 */
export function getRecentIntakeEntries(count: number = 10): EngineIntakeEntry[] {
  const logsDir = path.join("logs");
  if (!fs.existsSync(logsDir)) {
    // Return demo data if no logs exist
    const demo = createDemoIntakeEntry();
    const demoArray: EngineIntakeEntry[] = [];
    for (let i = 0; i < Math.min(count, 3); i++) {
      demoArray.push({
        ...demo,
        timestamp: new Date(demo.unixMs - i * 10 * 60000).toISOString(),
        unixMs: demo.unixMs - i * 10 * 60000,
      });
    }
    return demoArray.reverse();
  }

  const entries: EngineIntakeEntry[] = [];
  const files = fs
    .readdirSync(logsDir)
    .filter((f) => f.startsWith("engine_intake_10m_"))
    .sort()
    .reverse();

  for (const file of files) {
    if (entries.length >= count) break;

    const filePath = path.join(logsDir, file);
    try {
      const content = fs.readFileSync(filePath, "utf-8");
      const lines = content.trim().split("\n").filter((l) => l.trim());

      for (let i = lines.length - 1; i >= 0 && entries.length < count; i--) {
        try {
          entries.push(JSON.parse(lines[i]) as EngineIntakeEntry);
        } catch {
          // Skip invalid lines
        }
      }
    } catch {
      // Skip unreadable files
    }
  }

  // If we found no real entries, return demo data
  if (entries.length === 0) {
    console.log("[EngineIntakeLog] No real entries found - returning demo data");
    const demo = createDemoIntakeEntry();
    const demoArray: EngineIntakeEntry[] = [];
    for (let i = 0; i < Math.min(count, 3); i++) {
      demoArray.push({
        ...demo,
        timestamp: new Date(demo.unixMs - i * 10 * 60000).toISOString(),
        unixMs: demo.unixMs - i * 10 * 60000,
      });
    }
    return demoArray.reverse();
  }

  return entries.sort((a, b) => a.unixMs - b.unixMs);
}

/**
 * Create a demo/sample intake entry (for testing/demo purposes)
 */
export function createDemoIntakeEntry(): EngineIntakeEntry {
  const now = Date.now();
  return {
    timestamp: new Date().toISOString(),
    unixMs: now - 5 * 60000,
    intervalMinutes: 5,
    isMarketOpen: isMarketOpenEST(),
    summary: {
      totalSymbolsScanned: 12,
      signalsCreated: 7,
      engineOutputsCaptured: 3,
      signalsByType: {
        'BREAKOUT': 3,
        'BREAKDOWN': 2,
        'SQUEEZE': 1,
        'CONSOLIDATING': 1,
      },
      signalsByDirection: {
        'bullish': 4,
        'bearish': 2,
        'neutral': 1,
      },
      avgBreakoutScore: 68.5,
      avgEdgeScore: 72.3,
      avgConfidence: 65.4,
    },
    signals: [
      {
        symbol: 'SPY',
        timeframe: '5m',
        signalType: 'BREAKOUT',
        direction: 'bullish',
        breakoutScore: 78,
        edgeScore: 82,
        confidence: 75,
        triggers: ['volume_spike', 'rsi_overbought', 'compression: squeeze'],
        indicators: { rsi: 72, adx: 35, momentum: 45, volumeSpike: 2.3, bbPercentB: 0.85 },
      },
      {
        symbol: 'QQQ',
        timeframe: '5m',
        signalType: 'SQUEEZE',
        direction: 'neutral',
        breakoutScore: 52,
        edgeScore: 68,
        confidence: 58,
        triggers: ['compression: trigger_ready', 'low_volatility'],
        indicators: { rsi: 50, adx: 18, momentum: 12, volumeSpike: 1.2, bbPercentB: 0.5 },
      },
    ],
    bySymbol: {
      'SPY': { scanned: true, signalsCreated: 2, signalTypes: ['BREAKOUT', 'BREAKDOWN'], highestScore: 82, avgConfidence: 71 },
      'QQQ': { scanned: true, signalsCreated: 1, signalTypes: ['SQUEEZE'], highestScore: 68, avgConfidence: 58 },
      'IWM': { scanned: true, signalsCreated: 1, signalTypes: ['CONSOLIDATING'], highestScore: 45, avgConfidence: 52 },
      'TNA': { scanned: true, signalsCreated: 1, signalTypes: ['BREAKDOWN'], highestScore: 61, avgConfidence: 62 },
      'AGG': { scanned: true, signalsCreated: 1, signalTypes: ['CONSOLIDATING'], highestScore: 48, avgConfidence: 54 },
      'GLD': { scanned: true, signalsCreated: 1, signalTypes: ['BREAKOUT'], highestScore: 75, avgConfidence: 68 },
    },
    topTriggers: [
      { reason: 'volume_spike', frequency: 4, avgScore: 74.2 },
      { reason: 'compression: squeeze', frequency: 3, avgScore: 69.5 },
      { reason: 'rsi_overbought', frequency: 2, avgScore: 71.0 },
      { reason: 'low_volatility', frequency: 2, avgScore: 62.3 },
      { reason: 'compression: trigger_ready', frequency: 2, avgScore: 65.8 },
    ],
    engineOutputs: [],
    engineState: {
      averageState: {},
      averageLeadMinutes: 8.5,
      triggerReadiness: 72,
    },
    quality: {
      readinessScore: 71.5,
      healthScore: 'A',
      volatilityRegime: 'elevated',
      marketCondition: 'bullish_bias',
    },
  };
}
