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
    maxScore: 15,        // Further lowered for more generous scoring
    htfTrendAlpha: 0.35, // Reduced HTF trend alpha
    thresholdA: 0.60,    // Lowered from 0.70
    thresholdB: 0.40,    // Lowered from 0.50
    thresholdC: 0.25,    // Lowered from 0.35
    monsterProb: 0.50    // Lowered from 0.70 for more plays
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
    minRoomPoints: 2.0,          // was 2.5
    strikeRoomFactor: 0.35,
    minDelta: 0.15,              // was 0.18
    maxDelta: 0.55,              // was 0.45
    minDomProb: 0.5,             // was 0.6
    maxChop: 0.3,                // was 0.18
    minRegimeConf: 0.5,          // was 0.65
    minProbConf: 0.5             // was 0.65
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
  };
  pce: PCESignal;
}

function inWindow(windows: [number, number][], minutes: number) {
  return windows.some(([a, b]) => minutes >= a && minutes <= b);
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
  const compSlice = ohlc.slice(-20);
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

  // Loosened regime check - allow most regimes except extreme chop
  const regimeOk = ["trend", "news_expansion", "liquidity_hunt", "consolidation", "compression", "range", "breakout"].includes(meta.regime.regime);
  if (!regimeOk) reasons.push("regime");

  // Loosened bias check - allow if bias is neutral (grinding market)
  const biasMatch = pce.direction === meta.regime.bias || meta.regime.bias === 'neutral';
  if (!biasMatch) reasons.push("bias");

  // Loosened PCE prob requirement
  if (pce.pceProb < CFG.pce.monsterProb && !pce.ignition) reasons.push("pceProb");

  const probs = meta.probabilities;
  const dom = probs.dominant;
  const domVal = (probs as any)[dom] ?? 0;
  // More lenient probability checks
  if (domVal < 0.35) reasons.push("dominant"); // Lowered from 0.5
  if (probs.chop > 0.45) reasons.push("chop");  // Raised from 0.3

  const vRatio = volSpike ? volSpike.lastVolume / Math.max(volSpike.avgVolume, 1e-6) : 1;
  // Loosened volume requirement
  if (vRatio < 0.6 && !pce.ignition) reasons.push("volume"); // Lowered from minVolumeRatio

  // Loosened candle score requirement
  if (candle.score < 60 && !pce.ignition) reasons.push("candle"); // Lowered from 80

  // Allow up to 2 minor issues for "aggressive" tier
  const monster = reasons.length === 0;
  return { monster, reasons };
}

/**
 * Direction picker: uses dominant probabilities first, then regime bias.
 */
function pickDirection(meta: MetaEngineOutput): "bullish" | "bearish" | null {
  const probs = meta.probabilities;
  const dom = probs.dominant;
  const domVal = (probs as any)[dom] ?? 0;

  if (domVal < CFG.otm.minDomProb || probs.chop > CFG.otm.maxChop) return null;

  if (dom === "continuationUp" || dom === "reversalUp") return "bullish";
  if (dom === "continuationDown" || dom === "reversalDown") return "bearish";

  if (meta.regime.bias !== "neutral") return meta.regime.bias as "bullish" | "bearish";

  return null;
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
    const spread = opt.ask - opt.bid;
    const liqPenalty = spread * 10 - Math.log(Math.max(opt.oi, 1));
    const score = dist + liqPenalty;

    if (score < bestScore) {
      bestScore = score;
      best = opt;
    }
  }

  if (!best) return null;

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
  currentPrice?: number
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

  const baseMeta = {
    regime: meta.regime.regime,
    bias: meta.regime.bias,
    dominant: meta.probabilities.dominant,
    dominantProb: (meta.probabilities as any)[meta.probabilities.dominant] ?? 0,
    chop: meta.probabilities.chop,
    confidence: meta.regime.confidence
  };

  // Core safety gates, but looser + ignition-aware
  if (
    meta.regime.confidence < CFG.otm.minRegimeConf ||
    meta.probabilities.confidence < CFG.otm.minProbConf
  ) {
    return { hasPlay: false, play: null, meta: baseMeta, pce };
  }

  // Allow B and C quality and ignition setups through
  const effectiveQuality =
    pce.quality === "A" || pce.ignition ? "A" : pce.quality;

  // Allow A, B, and C quality plays (more generous)
  if (effectiveQuality === "none") {
    return { hasPlay: false, play: null, meta: baseMeta, pce };
  }

  const direction = pickDirection(meta);
  if (!direction) {
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
    // Fallback: use 1.5% of price as room (typical expected move)
    roomPoints = lastPrice * 0.015;
  }
  
  // Ensure minimum room for viable plays
  roomPoints = Math.max(roomPoints, CFG.otm.minRoomPoints);
  
  const play = selectOTMStrike(direction, lastPrice, roomPoints, optionsChain);
  if (!play) {
    return { hasPlay: false, play: null, meta: baseMeta, pce };
  }

  play.monster = pce.monster;

  return { hasPlay: true, play, meta: baseMeta, pce };
}
