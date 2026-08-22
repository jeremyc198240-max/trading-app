/**
 * Scanner Integration for Engine Intake Log
 * 
 * Hooks into scanner signal generation to feed the engine intake log.
 * Extracts signal metadata and reasoning for tuning analysis.
 */

import { recordSignalToIntake, recordSymbolScanned, recordEngineOutput, type SignalSnapshot } from "./engineIntakeLog";

/**
 * Record a scanner signal to the intake log
 * 
 * Call this whenever a breakout signal is generated in scanner
 */
export function recordScannerSignal(signalData: {
  symbol: string;
  timeframe: string;
  breakoutSignal: string | null;
  breakoutScore?: number;
  momentumStrength?: number;
  volumeSpike?: number;
  rsiValue?: number;
  edgeEngine?: {
    signal?: string;
    direction?: "bullish" | "bearish" | "neutral";
    edgeScore?: number;
    confidence?: number;
    leadMinutes?: number;
    triggerProbability?: number;
    reasons?: string[];
    indicators?: {
      rsi?: number;
      macdHistogram?: number;
      macdTrend?: string;
      bbPercentB?: number;
      bbSqueeze?: boolean;
      stochasticK?: number;
      stochasticD?: number;
      adx?: number;
      tvRsi?: number;
      tvAdx?: number;
      momentum?: number;
      volumeSpike?: number;
    };
  };
  warnings?: string[];
  compression?: {
    sparkScore?: number;
    triggers?: string[];
  };
  preBreakoutSetup?: {
    score?: number;
    traits?: string[];
  };
  timeframeStack?: {
    agreement?: number;
    aggregateScore?: number;
    bias?: string;
  };
}) {
  // Record that symbol was scanned
  recordSymbolScanned(signalData.symbol);

  // Only record if there's a signal or high edge score
  if (!signalData.breakoutSignal && (!signalData.edgeEngine || signalData.edgeEngine.edgeScore === undefined || signalData.edgeEngine.edgeScore < 30)) {
    return;
  }

  // Build trigger list from all available signal reasons
  const triggers: string[] = [];

  if (signalData.edgeEngine?.reasons) {
    triggers.push(...signalData.edgeEngine.reasons);
  }

  if (signalData.compression?.triggers) {
    triggers.push(...signalData.compression.triggers.map(t => `compression: ${t}`));
  }

  if (signalData.preBreakoutSetup?.traits) {
    triggers.push(...signalData.preBreakoutSetup.traits.map(t => `setup: ${t}`));
  }

  // Add score-based triggers
  if (signalData.breakoutScore && signalData.breakoutScore > 75) {
    triggers.push("high_breakout_score");
  }

  if (signalData.volumeSpike && signalData.volumeSpike > 2.0) {
    triggers.push("volume_spike");
  }

  if (signalData.rsiValue !== undefined) {
    if (signalData.rsiValue > 70) {
      triggers.push("rsi_overbought");
    } else if (signalData.rsiValue < 30) {
      triggers.push("rsi_oversold");
    }
  }

  if (signalData.timeframeStack?.agreement && signalData.timeframeStack.agreement > 0.75) {
    triggers.push("timeframe_alignment");
  }

  // Deduplicate triggers
  const uniqueTriggers = [...new Set(triggers)];

  // Determine signal direction
  let direction: "bullish" | "bearish" | "neutral" = "neutral";
  if (signalData.edgeEngine?.direction) {
    direction = signalData.edgeEngine.direction;
  } else if (signalData.breakoutSignal === "BREAKOUT" || signalData.breakoutSignal === "MOMENTUM") {
    direction = "bullish";
  } else if (signalData.breakoutSignal === "BREAKDOWN") {
    direction = "bearish";
  }

  const snapshot: SignalSnapshot = {
    symbol: signalData.symbol,
    timeframe: signalData.timeframe,
    signalType: signalData.breakoutSignal,
    direction,
    breakoutScore: signalData.breakoutScore,
    edgeScore: signalData.edgeEngine?.edgeScore,
    confidence: signalData.edgeEngine?.confidence,
    triggers: uniqueTriggers,
    indicators: {
      rsi: signalData.rsiValue || signalData.edgeEngine?.indicators?.rsi,
      adx: signalData.edgeEngine?.indicators?.adx,
      momentum: signalData.momentumStrength || signalData.edgeEngine?.indicators?.momentum,
      volumeSpike: signalData.volumeSpike || signalData.edgeEngine?.indicators?.volumeSpike,
      bbPercentB: signalData.edgeEngine?.indicators?.bbPercentB,
      stochasticK: signalData.edgeEngine?.indicators?.stochasticK,
    },
  };

  recordSignalToIntake(snapshot);

  recordEngineOutput({
    engineName: "scanner",
    outputType: signalData.breakoutSignal ? "signal" : "scan",
    symbol: signalData.symbol,
    timeframe: signalData.timeframe,
    active: Boolean(signalData.breakoutSignal),
    bias: direction,
    strength: signalData.breakoutScore,
    edgeScore: signalData.edgeEngine?.edgeScore,
    confidence: signalData.edgeEngine?.confidence,
    reasons: uniqueTriggers,
    details: {
      signalType: signalData.breakoutSignal,
      momentumStrength: signalData.momentumStrength,
      volumeSpike: signalData.volumeSpike,
      timeframeStack: signalData.timeframeStack,
      warnings: signalData.warnings,
    },
  });
}

/**
 * Record that a symbol scan completed (even with no signal)
 */
export function recordScannerCycleSymbol(symbol: string) {
  recordSymbolScanned(symbol);
}
