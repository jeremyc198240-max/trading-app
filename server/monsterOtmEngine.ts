import type {
  OHLC,
  MetaEngineOutput,
  LiquiditySweep,
  CandleStrength,
  BullishPower,
  EMACloud,
  TacticalAdvice
} from "@shared/schema";

import type { MarketHealthIndicators } from "./indicators";

import {
  computeVWAPSeries,
  detectVolumeSpike,
  computeCandleStrength,
  detectLiquiditySweep
} from "./finance";

import {
  computeATR,
  computeBollingerBands,
  computeKeltnerChannel
} from "./indicators";

import { computeMetaEngine, type SessionSplit } from "./metaEngine";

const CFG = {
  pce: {
    maxScore: 15,
    htfTrendAlpha: 0.35,
    thresholdA: 0.72,
    thresholdB: 0.56,
    thresholdC: 0.34,
    monsterProb: 0.68
  },
  pullback: {
    lookback: 60,
    idealMin: 0.25,
    idealMax: 0.5,
    minDepth: 0.15,
    maxDepth: 0.6
  },
  compression: {
    atrLookback: 50,
    maxRangePct: 0.005,
    minBars: 30,
    window: 30
  },
  expansion: {
    minBodyMultiple: 1.6,
    minVolumeRatio: 2.0,
    minFollowThroughBodyMult: 1.1
  },
  otm: {
    minRoomPoints: 2.4,
    strikeRoomFactor: 0.35,
    minDelta: 0.18,
    maxDelta: 0.42,
    minDomProb: 0.58,
    maxChop: 0.22,
    minRegimeConf: 0.62,
    minProbConf: 0.6
    // time windows removed from gating
  }
};

export type OTMPlaySide = "call" | "put";

export interface PCESignal {
  pullbackScore: number;
  compressionScore: number;
  expansionScore: number;
  pceRaw: number;
  pceScore: number;
  pceProb: number;
  quality: "A" | "B" | "C" | "none";
  direction: "bullish" | "bearish" | "none";
  entryLevel: number | null;
  stopLevel: number | null;
  notes: string[];
  monster: boolean;
  monsterReasons: string[];
  ignition: boolean; // NEW: price-led ignition flag
}

export interface OTMPlay {
  side: OTMPlaySide;
  strike: number;
  premium: number;
  delta: number;
  roomPoints: number;
  quality: "A" | "B" | "none";
  monster: boolean;
  probability?: number;
  hitProbability?: number;
  targetPrice?: number;
  stopPrice?: number;
  supportLevel?: number;
  resistanceLevel?: number;
  breakoutAlert?: string;
  intentScore?: number;
  reason?: string;
}

export interface MonsterOTMEngineOutput {
  hasPlay: boolean;
  play: OTMPlay | null;
  meta: {
    regime: string;
    bias: string;
    dominant: string;
    dominantProb: number;
    chop: number;
    confidence: number;
    vixLevel?: number;
    vixRegime?: "calm" | "balanced" | "elevated" | "chaotic";
  };
  breakout?: {
    triggered: boolean;
    type: "breakout_up" | "breakout_down" | "none";
    supportLevel?: number;
    resistanceLevel?: number;
    hitProbability?: number;
    alert?: string;
  };
  pce: PCESignal;
}

export interface MonsterOtmTuningOverrides {
  minDomProb?: number;
  maxChop?: number;
  minRegimeConf?: number;
  minProbConf?: number;
  minIntentScore?: number;
  minTradeProbability?: number;
  requireCompressionEdge?: boolean;
  requireDirectionalPush?: boolean;
  applyLateTrendRiskFilter?: boolean;
  allowBQualityFloor?: number;
}

function inWindow(windows: [number, number][], minutes: number) {
  return windows.some(([a, b]) => minutes >= a && minutes <= b);
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function getVixRegime(vixLevel?: number): "calm" | "balanced" | "elevated" | "chaotic" {
  if (!Number.isFinite(vixLevel as number) || (vixLevel as number) <= 0) return "balanced";
  if ((vixLevel as number) < 15) return "calm";
  if ((vixLevel as number) < 22) return "balanced";
  if ((vixLevel as number) < 30) return "elevated";
  return "chaotic";
}

function vixPenalty(vixLevel?: number): number {
  if (!Number.isFinite(vixLevel as number) || (vixLevel as number) <= 0) return 0;
  if ((vixLevel as number) < 15) return 0.01;
  if ((vixLevel as number) < 22) return 0;
  if ((vixLevel as number) < 30) return -0.04;
  return -0.09;
}

function computeSessionReachMultiplier(
  nowMinutes: number,
  vixRegime: "calm" | "balanced" | "elevated" | "chaotic",
): number {
  const sessionOpen = 9 * 60 + 30;
  const sessionClose = 16 * 60;
  const minutesLeft = sessionClose - nowMinutes;

  let base = 0.7;
  if (minutesLeft <= 0) base = 0.42;
  else if (minutesLeft <= 20) base = 0.36;
  else if (minutesLeft <= 60) base = 0.48;
  else if (minutesLeft <= 120) base = 0.62;
  else if (minutesLeft <= 240) base = 0.78;
  else if (nowMinutes < sessionOpen) base = 0.66;
  else base = 0.9;

  if (vixRegime === "elevated") base += 0.04;
  if (vixRegime === "chaotic") base += 0.08;
  if (vixRegime === "calm") base -= 0.04;

  return Math.max(0.28, Math.min(1, base));
}

function hasCompressionEdge(pce: PCESignal, tradeProbability: number): boolean {
  if (pce.ignition) return true;
  if (pce.compressionScore >= 3 && pce.expansionScore >= 2) return true;
  if (pce.compressionScore >= 4) return true;
  // Allow rare high-probability exceptions.
  return tradeProbability >= 0.78 && pce.expansionScore >= 3;
}

function resolveSupportResistance(
  meta: MetaEngineOutput,
  pce: PCESignal,
  lastPrice: number,
  roomPoints: number,
): { support: number; resistance: number } {
  const support = Number(meta.liquidity.nearestBelow?.price ?? pce.stopLevel ?? (lastPrice - roomPoints));
  const resistance = Number(meta.liquidity.nearestAbove?.price ?? pce.entryLevel ?? (lastPrice + roomPoints));
  return {
    support: Number.isFinite(support) ? support : lastPrice - roomPoints,
    resistance: Number.isFinite(resistance) ? resistance : lastPrice + roomPoints,
  };
}

function computeHitProbability(
  tradeProbability: number,
  direction: "bullish" | "bearish",
  lastPrice: number,
  targetPrice: number,
  supportLevel: number,
  resistanceLevel: number,
  pce: PCESignal,
  vixRegime: "calm" | "balanced" | "elevated" | "chaotic",
): number {
  const targetDistance = Math.max(0.01, Math.abs(targetPrice - lastPrice));
  const roomToLevel = direction === "bullish"
    ? Math.max(0.01, resistanceLevel - lastPrice)
    : Math.max(0.01, lastPrice - supportLevel);

  const srRoomScore = clamp01(roomToLevel / targetDistance);
  const breakoutBoost = pce.expansionScore >= 3 ? 0.08 : pce.expansionScore >= 2 ? 0.04 : 0;
  const compressionBoost = pce.compressionScore >= 3 ? 0.05 : 0;
  const vixAdjust = vixRegime === "chaotic" ? -0.1 : vixRegime === "elevated" ? -0.05 : vixRegime === "calm" ? 0.02 : 0;

  const blended =
    tradeProbability * 0.68 +
    srRoomScore * 0.2 +
    breakoutBoost +
    compressionBoost +
    vixAdjust;

  return Math.max(0.05, Math.min(0.97, blended));
}

function isLateTrendRisky(
  marketHealth: MarketHealthIndicators,
  pce: PCESignal,
): boolean {
  const adx = Number((marketHealth as any)?.adx?.value ?? 0);
  const rsi = Number((marketHealth as any)?.rsi?.value ?? 50);
  const adxVeryHigh = adx >= 52;
  const stretched = rsi >= 74 || rsi <= 26;
  return adxVeryHigh && stretched && !pce.ignition;
}

/**
 * Pullback: where are we inside the recent swing?
 */
function computePullbackScore(ohlc: OHLC[]): { score: number; swingHigh: number; swingLow: number } {
  const n = ohlc.length;
  if (n === 0) {
    return { score: 0, swingHigh: 0, swingLow: 0 };
  }
  if (n < CFG.pullback.lookback) {
    const last = ohlc[n - 1];
    return { score: 0, swingHigh: last.high, swingLow: last.low };
  }

  const slice = ohlc.slice(-CFG.pullback.lookback);
  let swingHigh = slice[0].high;
  let swingLow = slice[0].low;

  for (const c of slice) {
    if (c.high > swingHigh) swingHigh = c.high;
    if (c.low < swingLow) swingLow = c.low;
  }

  const last = ohlc[n - 1];
  const denom = Math.max(swingHigh - swingLow, 1e-6);
  const depth = (swingHigh - last.low) / denom;

  let score = 0;
  if (depth >= CFG.pullback.idealMin && depth <= CFG.pullback.idealMax) score = 3;
  else if (depth >= CFG.pullback.minDepth && depth <= CFG.pullback.maxDepth) score = 2;

  return { score, swingHigh, swingLow };
}

/**
 * Advanced compression: multi-factor squeeze detection.
 */
function computeCompressionScore(
  ohlc: OHLC[],
  atr: { value: number; percent: number } | null,
  bb: any,
  kc: any
): { score: number; details: string[] } {
  const n = ohlc.length;
  const details: string[] = [];

  if (n < CFG.compression.minBars || !atr || !bb || !kc) {
    return { score: 0, details };
  }

  const window = CFG.compression.window;
  const slice = ohlc.slice(-window);
  const last = ohlc[n - 1];

  const hi = Math.max(...slice.map(c => c.high));
  const lo = Math.min(...slice.map(c => c.low));
  const rangePct = (hi - lo) / Math.max(last.close, 1e-6);

  const bodies = slice.map(c => Math.abs(c.close - c.open));
  const avgBody = bodies.reduce((a, b) => a + b, 0) / Math.max(bodies.length, 1);
  const lastBody = Math.abs(last.close - last.open);
  const bodyCompression = avgBody > 0 ? lastBody / avgBody : 1;

  const wickSymArr = slice.map(c => {
    const upper = c.high - Math.max(c.close, c.open);
    const lower = Math.min(c.close, c.open) - c.low;
    return Math.abs(upper - lower);
  });
  const avgWickSym = wickSymArr.reduce((a, b) => a + b, 0) / Math.max(wickSymArr.length, 1);

  const vols = slice.map(c => (c as any).volume ?? 0);
  const avgVol = vols.reduce((a, b) => a + b, 0) / Math.max(vols.length, 1);
  const lastVol = (last as any).volume ?? avgVol;
  const volFade = avgVol > 0 ? lastVol / avgVol : 1;

  const bbInsideKC = bb.upper <= kc.upper && bb.lower >= kc.lower;

  let score = 0;

  if (bbInsideKC) {
    score += 3;
    details.push("bb_inside_kc");
  }

  if (rangePct <= CFG.compression.maxRangePct * 0.6) {
    score += 3;
    details.push("ultra_tight_range");
  } else if (rangePct <= CFG.compression.maxRangePct) {
    score += 2;
    details.push("tight_range");
  }

  if (bodyCompression < 0.6) {
    score += 2;
    details.push("body_shrink");
  }

  if (avgWickSym < avgBody * 0.4) {
    score += 1;
    details.push("wick_symmetry");
  }

  if (volFade < 0.7) {
    score += 1;
    details.push("volume_fade");
  }

  if (atr.percent < 0.6) {
    score += 1;
    details.push("atr_compression");
  }

  return { score, details };
}

/**
 * Expansion / breakout: how hard are we breaking out of the compression box?
 */
function computeExpansionScore(
  ohlc: OHLC[],
  vwap: number[],
  volSpike: any,
  sweep: LiquiditySweep
): {
  score: number;
  compHigh: number;
  compLow: number;
  details: string[];
  breakoutDirection: "up" | "down" | "none";
} {
  const n = ohlc.length;
  const details: string[] = [];

  if (n < 30) {
    const last = ohlc[n - 1];
    return {
      score: 0,
      compHigh: last.high,
      compLow: last.low,
      details,
      breakoutDirection: "none"
    };
  }

  const last = ohlc[n - 1];
  const compSlice = ohlc.slice(-21, -1);
  const compHigh = Math.max(...compSlice.map(c => c.high));
  const compLow = Math.min(...compSlice.map(c => c.low));

  const bodies = compSlice.map(c => Math.abs(c.close - c.open)).sort((a, b) => a - b);
  const medianBody = bodies[Math.floor(bodies.length / 2)] || 1e-6;
  const body = Math.abs(last.close - last.open);
  const bodyMult = body / medianBody;

  let score = 0;
  let breakoutDirection: "up" | "down" | "none" = "none";

  if (last.close > compHigh && bodyMult >= CFG.expansion.minBodyMultiple) {
    score += 3;
    breakoutDirection = "up";
    details.push("breakout_up");
    details.push("impulse_body");
  } else if (last.close < compLow && bodyMult >= CFG.expansion.minBodyMultiple) {
    score += 3;
    breakoutDirection = "down";
    details.push("breakout_down");
    details.push("impulse_body");
  }

  const vRatio = volSpike ? volSpike.lastVolume / Math.max(volSpike.avgVolume, 1e-6) : 1;
  if (vRatio >= CFG.expansion.minVolumeRatio) {
    score += 2;
    details.push("volume_expansion");
  }

  const vwapLast = vwap[vwap.length - 1] ?? last.close;
  if (sweep.detected && sweep.type === "low_sweep" && last.close > vwapLast) {
    score += 2;
    details.push("low_sweep_vwap_reclaim");
  }
  if (sweep.detected && sweep.type === "high_sweep" && last.close < vwapLast) {
    score += 2;
    details.push("high_sweep_vwap_reject");
  }

  return { score, compHigh, compLow, details, breakoutDirection };
}

/**
 * PCE: Pullback + Compression + Expansion fused with meta regime.
 * Now includes an ignition flag for price-led explosions.
 */
function computePCE(
  ohlc: OHLC[],
  meta: MetaEngineOutput,
  vwap: number[],
  volSpike: any,
  sweep: LiquiditySweep,
  candle: CandleStrength
): PCESignal {
  const pb = computePullbackScore(ohlc);
  const atr = computeATR(ohlc, CFG.compression.atrLookback);
  const bb = computeBollingerBands(ohlc, 20);
  const kc = computeKeltnerChannel(ohlc, 20);

  const comp = computeCompressionScore(ohlc, atr, bb, kc);
  const exp = computeExpansionScore(ohlc, vwap, volSpike, sweep);

  // Cap individual scores to reasonable ranges
  const cappedPb = Math.min(pb.score, 8);
  const cappedComp = Math.min(comp.score, 8);
  const cappedExp = Math.min(exp.score, 8);
  
  const pceRaw = cappedPb + cappedComp + cappedExp;
  
  // Add base score boost for setups with clear direction (including dominant probability)
  let baseBoost = 0;
  if (meta.regime.bias !== 'neutral' && meta.regime.confidence > 0.4) {
    baseBoost = 4; // Boost trending market setups
  } else if (meta.probabilities.dominant.includes('Up') || meta.probabilities.dominant.includes('Down')) {
    // Even in neutral bias, if there's a clear dominant probability, give some boost
    const domVal = (meta.probabilities as any)[meta.probabilities.dominant] ?? 0;
    if (domVal > 0.4) {
      baseBoost = 3;
    } else if (domVal > 0.3) {
      baseBoost = 2;
    }
  }
  
  let pceScore = (pceRaw + baseBoost) * (1 + CFG.pce.htfTrendAlpha * meta.regime.confidence);
  let pceProb = Math.min(1, pceScore / CFG.pce.maxScore);

  let quality: "A" | "B" | "C" | "none" = "none";
  if (pceProb >= CFG.pce.thresholdA) quality = "A";
  else if (pceProb >= CFG.pce.thresholdB) quality = "B";
  else if (pceProb >= CFG.pce.thresholdC) quality = "C";

  // Determine direction from bias first, then dominant probability if bias is neutral
  let direction: "bullish" | "bearish" | "none" = "none";
  if (meta.regime.bias === "bullish") {
    direction = "bullish";
  } else if (meta.regime.bias === "bearish") {
    direction = "bearish";
  } else if (meta.probabilities.dominant.includes('Up')) {
    direction = "bullish";
  } else if (meta.probabilities.dominant.includes('Down')) {
    direction = "bearish";
  }

  const notes: string[] = [];

  if (sweep.detected) notes.push(`sweep_${sweep.type}`);
  if (candle.score > 80) notes.push("strong_candle");
  notes.push(...comp.details);
  notes.push(...exp.details);

  // IGNITION MODE: strong breakout + candle + volume
  const vRatio = volSpike ? volSpike.lastVolume / Math.max(volSpike.avgVolume, 1e-6) : 1;
  const ignition =
    exp.score >= 3 &&               // breakout + impulse body
    candle.score >= 80 &&           // strong candle
    vRatio >= CFG.expansion.minVolumeRatio &&
    exp.breakoutDirection !== "none";

  if (ignition && quality !== "A") {
    // promote ignition setups to A-quality
    quality = "A";
    notes.push("ignition_override");
    // slightly boost score/prob
    pceScore *= 1.05;
    pceProb = Math.min(1, pceScore / CFG.pce.maxScore);
  }

  return {
    pullbackScore: pb.score,
    compressionScore: comp.score,
    expansionScore: exp.score,
    pceRaw,
    pceScore,
    pceProb,
    quality,
    direction,
    entryLevel: exp.compHigh,
    stopLevel: exp.compLow,
    notes,
    monster: false,
    monsterReasons: [],
    ignition
  };
}

/**
 * Monster gating: only the absolute apex setups survive.
 * Now slightly looser and ignition-aware.
 */
function computeMonster(
  pce: PCESignal,
  meta: MetaEngineOutput,
  volSpike: any,
  candle: CandleStrength,
  nowMinutes: number
) {
  const reasons: string[] = [];

  const regimeOk = ["trend", "news_expansion", "liquidity_hunt", "consolidation", "compression", "range", "breakout"].includes(meta.regime.regime);
  if (!regimeOk) reasons.push("regime");

  const biasMatch = pce.direction === meta.regime.bias || meta.regime.bias === 'neutral';
  if (!biasMatch) reasons.push("bias");

  if (pce.pceProb < 0.58 && !pce.ignition) reasons.push("pceProb");

  const probs = meta.probabilities;
  const dom = probs.dominant;
  const domVal = (probs as any)[dom] ?? 0;
  if (domVal < 0.42) reasons.push("dominant");
  if (probs.chop > 0.38) reasons.push("chop");

  const vRatio = volSpike ? volSpike.lastVolume / Math.max(volSpike.avgVolume, 1e-6) : 1;
  if (vRatio < 0.8 && !pce.ignition) reasons.push("volume");

  if (candle.score < 68 && !pce.ignition) reasons.push("candle");

  const monster = reasons.length === 0;
  return { monster, reasons };
}

/**
 * Direction picker: uses dominant probabilities first, then regime bias.
 */
function pickDirection(
  meta: MetaEngineOutput,
  minDomProb: number,
  maxChop: number,
): "bullish" | "bearish" | null {
  const probs = meta.probabilities;
  const dom = probs.dominant;
  const domVal = (probs as any)[dom] ?? 0;

  if (domVal < minDomProb || probs.chop > maxChop) return null;

  if (dom === "continuationUp" || dom === "reversalUp") return "bullish";
  if (dom === "continuationDown" || dom === "reversalDown") return "bearish";

  if (meta.regime.bias !== "neutral") return meta.regime.bias as "bullish" | "bearish";

  return null;
}

function hasDirectionalPush(ohlc: OHLC[], direction: "bullish" | "bearish"): boolean {
  if (ohlc.length < 8) return false;

  const recent = ohlc.slice(-12);
  const last = recent[recent.length - 1];
  const prev = recent[recent.length - 2] ?? last;
  const avgShort = recent.slice(-5).reduce((sum, bar) => sum + bar.close, 0) / 5;
  const avgMedium = recent.reduce((sum, bar) => sum + bar.close, 0) / recent.length;
  const drift = Math.abs(last.close - avgMedium) / Math.max(avgMedium, 1e-6);
  const momentum = (last.close - prev.close) / Math.max(prev.close, 1e-6);

  if (direction === "bullish") {
    return last.close > avgShort && last.close > avgMedium && momentum > 0.0008 && drift > 0.003;
  }

  return last.close < avgShort && last.close < avgMedium && momentum < -0.0008 && drift > 0.003;
}

function computeInstitutionalIntent(
  meta: MetaEngineOutput,
  pce: PCESignal,
  direction: "bullish" | "bearish"
): number {
  const dom = meta.probabilities.dominant;
  const dominantProb = clamp01((meta.probabilities as any)[dom] ?? 0);
  const directionalBias =
    direction === "bullish"
      ? dom === "continuationUp" || dom === "reversalUp"
      : dom === "continuationDown" || dom === "reversalDown";
  const biasAlign =
    (direction === "bullish" && meta.regime.bias === "bullish") ||
    (direction === "bearish" && meta.regime.bias === "bearish")
      ? 1
      : meta.regime.bias === "neutral"
      ? 0.55
      : 0.15;

  const score =
    dominantProb * 0.42 +
    clamp01(meta.regime.confidence) * 0.22 +
    clamp01(pce.pceProb) * 0.2 +
    (directionalBias ? 1 : 0) * 0.1 +
    biasAlign * 0.06 -
    clamp01(meta.probabilities.chop) * 0.2;

  return clamp01(score);
}

function computeTradeProbability(
  meta: MetaEngineOutput,
  pce: PCESignal,
  direction: "bullish" | "bearish",
  pushConfirmed: boolean,
  intentScore: number,
  vixLevel?: number
): number {
  const dom = meta.probabilities.dominant;
  const dominantProb = clamp01((meta.probabilities as any)[dom] ?? 0);
  const directionAligned =
    (direction === "bullish" && (dom === "continuationUp" || dom === "reversalUp")) ||
    (direction === "bearish" && (dom === "continuationDown" || dom === "reversalDown"));

  const raw =
    dominantProb * 0.3 +
    clamp01(meta.regime.confidence) * 0.2 +
    clamp01(meta.probabilities.confidence) * 0.16 +
    clamp01(pce.pceProb) * 0.2 +
    intentScore * 0.08 +
    (pushConfirmed ? 0.04 : -0.06) +
    (pce.ignition ? 0.04 : 0) +
    vixPenalty(vixLevel) +
    (directionAligned ? 0.03 : -0.04) -
    clamp01(meta.probabilities.chop) * 0.18;

  return Math.max(0.05, Math.min(0.97, raw));
}

/**
 * OTM strike selection: balances distance to target, spread, and liquidity.
 */
function selectOTMStrike(
  direction: "bullish" | "bearish",
  entryPrice: number,
  roomPoints: number,
  optionsChain: any[]
): OTMPlay | null {
  if (roomPoints < CFG.otm.minRoomPoints) return null;

  const targetStrike =
    direction === "bullish"
      ? entryPrice + roomPoints * CFG.otm.strikeRoomFactor
      : entryPrice - roomPoints * CFG.otm.strikeRoomFactor;

  let best: any = null;
  let bestScore = Infinity;

  for (const opt of optionsChain) {
    const d = Math.abs(opt.delta);
    if (d < CFG.otm.minDelta || d > CFG.otm.maxDelta) continue;

    const dist = Math.abs(opt.strike - targetStrike);
    const spread = Math.max(0.0001, (opt.ask ?? 0) - (opt.bid ?? 0));
    const liqPenalty = spread * 10 - Math.log(Math.max(opt.oi ?? 1, 1));
    const score = dist + liqPenalty;

    if (score < bestScore) {
      bestScore = score;
      best = opt;
    }
  }

  if (!best) {
    const fallbackStrike = direction === "bullish"
      ? entryPrice + Math.max(roomPoints, 1.5)
      : entryPrice - Math.max(roomPoints, 1.5);

    return {
      side: direction === "bullish" ? "call" : "put",
      strike: Number(fallbackStrike.toFixed(2)),
      premium: Math.max(0.05, roomPoints * 0.015),
      delta: 0.2,
      roomPoints,
      quality: "A",
      monster: false
    };
  }

  return {
    side: direction === "bullish" ? "call" : "put",
    strike: best.strike,
    premium: (best.bid + best.ask) / 2,
    delta: best.delta,
    roomPoints,
    quality: "A",
    monster: false
  };
}

/**
 * Main engine: fuses meta, PCE, monster gating, and OTM selection.
 * Time gate removed. Ignition can promote plays.
 */
export function runMonsterOTMEngine(
  ohlc: OHLC[],
  marketHealth: MarketHealthIndicators,
  liquiditySweep: LiquiditySweep,
  failedVwapReclaim: any,
  trendExhaustion: any,
  candleStrength: CandleStrength | null,
  bullishPower: BullishPower,
  emaCloud: EMACloud | null,
  tactical: TacticalAdvice,
  optionsChain: any[],
  nowMinutes: number,
  sessionSplit?: SessionSplit,
  currentPrice?: number,
  vixLevel?: number,
  tuning?: MonsterOtmTuningOverrides,
): MonsterOTMEngineOutput {
  const vwap = computeVWAPSeries(ohlc);
  const volSpike = detectVolumeSpike(ohlc);
  const candle = candleStrength ?? computeCandleStrength(ohlc);
  const sweep = liquiditySweep ?? detectLiquiditySweep(ohlc);

  const meta = computeMetaEngine(
    ohlc,
    vwap,
    marketHealth,
    sweep,
    failedVwapReclaim,
    trendExhaustion,
    candle,
    emaCloud,
    { maxAbsGammaStrike: null },
    tactical,
    sessionSplit,
    currentPrice
  );

  const pce = computePCE(ohlc, meta, vwap, volSpike, sweep, candle);
  const monsterInfo = computeMonster(pce, meta, volSpike, candle, nowMinutes);
  pce.monster = monsterInfo.monster;
  pce.monsterReasons = monsterInfo.reasons;

  const vixRegime = getVixRegime(vixLevel);
  const baseMeta = {
    regime: meta.regime.regime,
    bias: meta.regime.bias,
    dominant: meta.probabilities.dominant,
    dominantProb: (meta.probabilities as any)[meta.probabilities.dominant] ?? 0,
    chop: meta.probabilities.chop,
    confidence: meta.regime.confidence,
    vixLevel: Number.isFinite(vixLevel as number) ? Number(vixLevel) : undefined,
    vixRegime,
  };

  const thresholds = {
    minDomProb: tuning?.minDomProb ?? CFG.otm.minDomProb,
    maxChop: tuning?.maxChop ?? CFG.otm.maxChop,
    minRegimeConf: tuning?.minRegimeConf ?? CFG.otm.minRegimeConf,
    minProbConf: tuning?.minProbConf ?? CFG.otm.minProbConf,
    minIntentScore: tuning?.minIntentScore,
    minTradeProbability: tuning?.minTradeProbability,
    requireCompressionEdge: tuning?.requireCompressionEdge ?? true,
    requireDirectionalPush: tuning?.requireDirectionalPush ?? true,
    applyLateTrendRiskFilter: tuning?.applyLateTrendRiskFilter ?? true,
    allowBQualityFloor: tuning?.allowBQualityFloor ?? 0.58,
  };

  // Hard quality gates: keep only high-conviction setups.
  const confidenceFloor = pce.ignition ? thresholds.minRegimeConf - 0.06 : thresholds.minRegimeConf;
  const probFloor = pce.ignition ? thresholds.minProbConf - 0.05 : thresholds.minProbConf;
  if (meta.regime.confidence < confidenceFloor || meta.probabilities.confidence < probFloor) {
    return { hasPlay: false, play: null, meta: baseMeta, pce };
  }

  const effectiveQuality = pce.quality === "A" || pce.ignition ? "A" : pce.quality;
  if (effectiveQuality === "none" || effectiveQuality === "C") {
    return { hasPlay: false, play: null, meta: baseMeta, pce };
  }
  if (effectiveQuality === "B" && pce.pceProb < thresholds.allowBQualityFloor) {
    return { hasPlay: false, play: null, meta: baseMeta, pce };
  }

  let direction = pickDirection(meta, thresholds.minDomProb, thresholds.maxChop);
  if (!direction) {
    direction = pce.pceProb >= 0.66
      ? pce.direction === "bullish"
        ? "bullish"
        : pce.direction === "bearish"
        ? "bearish"
        : null
      : null;
  }
  if (!direction) {
    return { hasPlay: false, play: null, meta: baseMeta, pce };
  }

  const pushConfirmed = hasDirectionalPush(ohlc, direction);
  if (thresholds.requireDirectionalPush && !pushConfirmed) {
    return { hasPlay: false, play: null, meta: baseMeta, pce };
  }

  const intentScore = computeInstitutionalIntent(meta, pce, direction);
  const intentFloor = thresholds.minIntentScore ?? (vixRegime === "chaotic" ? 0.7 : vixRegime === "elevated" ? 0.64 : 0.6);
  if (intentScore < intentFloor) {
    return { hasPlay: false, play: null, meta: baseMeta, pce };
  }

  const tradeProbability = computeTradeProbability(meta, pce, direction, pushConfirmed, intentScore, vixLevel);
  const probabilityFloor = thresholds.minTradeProbability ?? (vixRegime === "chaotic" ? 0.72 : vixRegime === "elevated" ? 0.66 : 0.62);
  if (tradeProbability < probabilityFloor) {
    return { hasPlay: false, play: null, meta: baseMeta, pce };
  }

  // Recurrence logs showed compression + momentum alignment as best-performing setup family.
  if (thresholds.requireCompressionEdge && !hasCompressionEdge(pce, tradeProbability)) {
    return { hasPlay: false, play: null, meta: baseMeta, pce };
  }

  // Avoid late-trend exhaustion entries unless ignition confirms continuation.
  if (thresholds.applyLateTrendRiskFilter && isLateTrendRisky(marketHealth, pce)) {
    return { hasPlay: false, play: null, meta: baseMeta, pce };
  }

  const lastPrice =
    Number.isFinite(currentPrice as number) && (currentPrice as number) > 0
      ? Number(currentPrice)
      : ohlc[ohlc.length - 1].close;
  const nearest =
    direction === "bullish" ? meta.liquidity.nearestAbove : meta.liquidity.nearestBelow;
  
  // Calculate roomPoints from liquidity level or fallback to ATR-based estimate
  let roomPoints: number;
  if (nearest && nearest.price) {
    roomPoints = Math.abs(nearest.price - lastPrice);
  } else {
    const atr = computeATR(ohlc, 14);
    roomPoints = atr?.value ? atr.value * 1.15 : lastPrice * 0.012;
  }
  
  // Ensure minimum room for viable plays
  roomPoints = Math.max(roomPoints, CFG.otm.minRoomPoints);
  
  const play = selectOTMStrike(direction, lastPrice, roomPoints, optionsChain);
  if (!play) {
    return { hasPlay: false, play: null, meta: baseMeta, pce };
  }

  play.monster = pce.monster;
  const atr = computeATR(ohlc, 14);
  const baseMove = Math.max(roomPoints * 0.75, (atr?.value ?? (lastPrice * 0.008)));
  const sessionMult = computeSessionReachMultiplier(nowMinutes, vixRegime);
  const atrSessionCap = (atr?.value ?? (lastPrice * 0.006)) * (1 + sessionMult);
  const liquidityCap = roomPoints * 0.92;
  const probabilityScale = 0.68 + Math.max(0, tradeProbability - 0.62) * 1.05;
  const scaledMove = baseMove * Math.max(0.6, Math.min(1, probabilityScale));
  const sessionMove = Math.min(scaledMove, atrSessionCap, liquidityCap);
  const move = Math.max(sessionMove, lastPrice * 0.0028);

  const levels = resolveSupportResistance(meta, pce, lastPrice, roomPoints);

  // Keep 0DTE invalidation tight: target distance must never determine initial risk.
  // ATR absorbs normal bar noise, while the percentage cap prevents multi-dollar SPY stops.
  const chopScore = clamp01(meta.probabilities.chop);
  const atrValue = Math.max(0, Number(atr?.value ?? 0));
  const minStopDistance = lastPrice * 0.0008;
  const maxStopDistance = lastPrice * 0.002;
  const volatilityStopDistance = atrValue * (chopScore > 0.28 ? 1.15 : 0.9);
  const cappedStopDistance = Math.min(maxStopDistance, Math.max(minStopDistance, volatilityStopDistance));
  const structureStop = direction === "bullish" ? levels.support : levels.resistance;
  const structureIsValid = direction === "bullish"
    ? structureStop > 0 && structureStop < lastPrice
    : structureStop > lastPrice;
  const structureStopDistance = structureIsValid ? Math.abs(lastPrice - structureStop) : Number.POSITIVE_INFINITY;
  const stopDistance = Math.min(cappedStopDistance, structureStopDistance);
  const targetMultiplier = pce.ignition ? 1.08 : chopScore < 0.18 ? 1.04 : 1.0;

  play.targetPrice = Number((direction === "bullish" ? lastPrice + move * targetMultiplier : lastPrice - move * targetMultiplier).toFixed(2));
  play.stopPrice = Number((direction === "bullish" ? lastPrice - stopDistance : lastPrice + stopDistance).toFixed(2));
  play.probability = Number((tradeProbability * 100).toFixed(1));
  play.intentScore = Number((intentScore * 100).toFixed(1));

  play.supportLevel = Number(levels.support.toFixed(2));
  play.resistanceLevel = Number(levels.resistance.toFixed(2));

  const hitProbability = computeHitProbability(
    tradeProbability,
    direction,
    lastPrice,
    play.targetPrice,
    levels.support,
    levels.resistance,
    pce,
    vixRegime,
  );
  play.hitProbability = Number((hitProbability * 100).toFixed(1));

  if (!optionsChain || optionsChain.length === 0) {
    play.quality = pce.quality === "A" ? "A" : pce.quality === "B" ? "B" : "A";
    play.reason = pce.ignition
      ? "Momentum ignition fallback"
      : "Directional edge fallback";
  }

  if (vixRegime === "elevated") {
    play.reason = `${play.reason ? `${play.reason}; ` : ""}VIX elevated: tightened entry criteria`;
  } else if (vixRegime === "chaotic") {
    play.reason = `${play.reason ? `${play.reason}; ` : ""}VIX chaotic: only extreme conviction setups allowed`;
  }

  play.reason = `${play.reason ? `${play.reason}; ` : ""}0DTE stop capped at ${(maxStopDistance / lastPrice * 100).toFixed(2)}% of spot`;

  const breakoutTriggered = pce.expansionScore >= 3 && (
    (direction === "bullish" && (pce.direction === "bullish" || pce.ignition)) ||
    (direction === "bearish" && (pce.direction === "bearish" || pce.ignition))
  );

  const breakoutType = breakoutTriggered
    ? (direction === "bullish" ? "breakout_up" : "breakout_down")
    : "none";

  const alertMessage = breakoutTriggered
    ? `${breakoutType === "breakout_up" ? "BREAKOUT UP" : "BREAKOUT DOWN"}: PICK ${play.side.toUpperCase()} ${play.strike.toFixed(2)} (Hit ${play.hitProbability?.toFixed(1)}%)`
    : undefined;

  if (alertMessage) {
    play.breakoutAlert = alertMessage;
  }

  return {
    hasPlay: true,
    play,
    meta: baseMeta,
    breakout: {
      triggered: breakoutTriggered,
      type: breakoutType,
      supportLevel: play.supportLevel,
      resistanceLevel: play.resistanceLevel,
      hitProbability: play.hitProbability,
      alert: alertMessage,
    },
    pce,
  };
}
