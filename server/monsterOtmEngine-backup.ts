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
    maxScore: 24,
    htfTrendAlpha: 0.4,
    thresholdA: 0.8,
    thresholdB: 0.65,
    thresholdC: 0.5,
    monsterProb: 0.9
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
    maxRangePct: 0.005
  },
  expansion: {
    minBodyMultiple: 1.5,
    minVolumeRatio: 2.0
  },
  otm: {
    minRoomPoints: 2.5,
    strikeRoomFactor: 0.35,
    minDelta: 0.18,
    maxDelta: 0.45,
    minDomProb: 0.6,
    maxChop: 0.18,
    minRegimeConf: 0.65,
    minProbConf: 0.65,
    allowedWindows: [
      [9 * 60 + 35, 11 * 60],
      [14 * 60 + 30, 15 * 60 + 30]
    ] as [number, number][]
  }
};

export type OTMPlaySide = 'call' | 'put';

export interface PCESignal {
  pullbackScore: number;
  compressionScore: number;
  expansionScore: number;
  pceRaw: number;
  pceScore: number;
  pceProb: number;
  quality: 'A' | 'B' | 'C' | 'none';
  direction: 'bullish' | 'bearish' | 'none';
  entryLevel: number | null;
  stopLevel: number | null;
  notes: string[];
  monster: boolean;
  monsterReasons: string[];
}

export interface OTMPlay {
  side: OTMPlaySide;
  strike: number;
  premium: number;
  delta: number;
  roomPoints: number;
  quality: 'A' | 'B' | 'none';
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

function computePullbackScore(ohlc: OHLC[]): { score: number; swingHigh: number; swingLow: number } {
  const n = ohlc.length;
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

function computeCompressionScore(ohlc: OHLC[], atr: { value: number; percent: number } | null, bb: any, kc: any): number {
  const n = ohlc.length;
  if (n < 30 || !atr || !bb || !kc) return 0;
  const last = ohlc[n - 1];
  const slice = ohlc.slice(-20);
  const hi = Math.max(...slice.map(c => c.high));
  const lo = Math.min(...slice.map(c => c.low));
  const rangePct = (hi - lo) / Math.max(last.close, 1e-6);
  let score = 0;
  const bbInsideKC = bb.upper <= kc.upper && bb.lower >= kc.lower;
  if (bbInsideKC) score += 3;
  if (rangePct <= CFG.compression.maxRangePct * 0.6) score += 2;
  else if (rangePct <= CFG.compression.maxRangePct) score += 1;
  return score;
}

function computeExpansionScore(
  ohlc: OHLC[],
  vwap: number[],
  volSpike: any,
  sweep: LiquiditySweep
): { score: number; compHigh: number; compLow: number } {
  const n = ohlc.length;
  if (n < 30) {
    const last = ohlc[n - 1];
    return { score: 0, compHigh: last.high, compLow: last.low };
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
  if (last.close > compHigh && bodyMult >= CFG.expansion.minBodyMultiple) score += 3;
  const vRatio = volSpike ? volSpike.lastVolume / Math.max(volSpike.avgVolume, 1e-6) : 1;
  if (vRatio >= CFG.expansion.minVolumeRatio) score += 2;
  const vwapLast = vwap[vwap.length - 1] ?? last.close;
  if (sweep.detected && sweep.type === 'low_sweep' && last.close > vwapLast) score += 2;
  return { score, compHigh, compLow };
}

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
  const compScore = computeCompressionScore(ohlc, atr, bb, kc);
  const exp = computeExpansionScore(ohlc, vwap, volSpike, sweep);

  const pceRaw = pb.score + compScore + exp.score;
  const pceScore = pceRaw * (1 + CFG.pce.htfTrendAlpha * meta.regime.confidence);
  const pceProb = Math.min(1, pceScore / CFG.pce.maxScore);

  let quality: 'A' | 'B' | 'C' | 'none' = 'none';
  if (pceProb >= CFG.pce.thresholdA) quality = 'A';
  else if (pceProb >= CFG.pce.thresholdB) quality = 'B';
  else if (pceProb >= CFG.pce.thresholdC) quality = 'C';

  const direction =
    meta.regime.bias === 'bullish' ? 'bullish' :
    meta.regime.bias === 'bearish' ? 'bearish' : 'none';

  const notes: string[] = [];
  if (sweep.detected) notes.push(`sweep_${sweep.type}`);
  if (candle.score > 80) notes.push('strong_candle');

  return {
    pullbackScore: pb.score,
    compressionScore: compScore,
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
    monsterReasons: []
  };
}

function computeMonster(
  pce: PCESignal,
  meta: MetaEngineOutput,
  volSpike: any,
  candle: CandleStrength,
  nowMinutes: number
) {
  const reasons: string[] = [];

  const regimeOk = ['trend', 'news_expansion', 'liquidity_hunt'].includes(meta.regime.regime);
  if (!regimeOk) reasons.push('regime');

  const biasMatch = pce.direction === meta.regime.bias;
  if (!biasMatch) reasons.push('bias');

  if (pce.pceProb < CFG.pce.monsterProb) reasons.push('pceProb');

  const probs = meta.probabilities;
  const dom = probs.dominant;
  const domVal = (probs as any)[dom] ?? 0;
  if (domVal < CFG.otm.minDomProb) reasons.push('dominant');
  if (probs.chop > CFG.otm.maxChop) reasons.push('chop');

  const vRatio = volSpike ? volSpike.lastVolume / Math.max(volSpike.avgVolume, 1e-6) : 1;
  if (vRatio < CFG.expansion.minVolumeRatio) reasons.push('volume');

  if (candle.score < 80) reasons.push('candle');

  if (!inWindow(CFG.otm.allowedWindows, nowMinutes)) reasons.push('time');

  const monster = reasons.length === 0;
  return { monster, reasons };
}

function pickDirection(meta: MetaEngineOutput): 'bullish' | 'bearish' | null {
  const probs = meta.probabilities;
  const dom = probs.dominant;
  const domVal = (probs as any)[dom] ?? 0;
  if (domVal < CFG.otm.minDomProb || probs.chop > CFG.otm.maxChop) return null;
  if (dom === 'continuationUp' || dom === 'reversalUp') return 'bullish';
  if (dom === 'continuationDown' || dom === 'reversalDown') return 'bearish';
  if (meta.regime.bias !== 'neutral') return meta.regime.bias as 'bullish' | 'bearish';
  return null;
}

function selectOTMStrike(
  direction: 'bullish' | 'bearish',
  entryPrice: number,
  roomPoints: number,
  optionsChain: any[]
): OTMPlay | null {
  if (roomPoints < CFG.otm.minRoomPoints) return null;

  const targetStrike =
    direction === 'bullish'
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
    side: direction === 'bullish' ? 'call' : 'put',
    strike: best.strike,
    premium: (best.bid + best.ask) / 2,
    delta: best.delta,
    roomPoints,
    quality: 'A',
    monster: false
  };
}

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
  sessionSplit?: SessionSplit
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
    sessionSplit
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

  if (!inWindow(CFG.otm.allowedWindows, nowMinutes) ||
      meta.regime.confidence < CFG.otm.minRegimeConf ||
      meta.probabilities.confidence < CFG.otm.minProbConf ||
      pce.quality !== 'A') {
    return { hasPlay: false, play: null, meta: baseMeta, pce };
  }

  const direction = pickDirection(meta);
  if (!direction) {
    return { hasPlay: false, play: null, meta: baseMeta, pce };
  }

  const lastPrice = ohlc[ohlc.length - 1].close;
  const nearest = direction === 'bullish' ? meta.liquidity.nearestAbove : meta.liquidity.nearestBelow;
  if (!nearest) {
    return { hasPlay: false, play: null, meta: baseMeta, pce };
  }

  const roomPoints = Math.abs(nearest.price - lastPrice);
  const play = selectOTMStrike(direction, lastPrice, roomPoints, optionsChain);
  if (!play) {
    return { hasPlay: false, play: null, meta: baseMeta, pce };
  }

  play.monster = pce.monster;

  return { hasPlay: true, play, meta: baseMeta, pce };
}
