import type {
  OHLC,
  LiquiditySweep,
  TrendExhaustion,
  EMACloud,
  TacticalAdvice,
  MarketHealth,
  CandleStrength,
  RegimeClassification,
  LiquidityLevel,
  LiquidityMap,
  PatternSignal,
  PatternMatrixMeta,
  DirectionalProbabilities,
  TimeOfDayVolatility,
  Recommended0DTEPlay,
  MetaEngineOutput,
} from "@shared/schema";
import { buildLiquidityMap as buildGammaLiquidityMap, type OptionContract, type LiquidityMap as GammaLiquidityMap } from "./gammaGhost";

interface GammaSummary {
  maxAbsGammaStrike: number | null;
}

export interface OptionsChainContext {
  chain: OptionContract[];
  symbol: string;
  spot: number;
}

export interface SessionSplit {
  rth: import('@shared/schema').OHLC[];
  overnight: import('@shared/schema').OHLC[];
  prevDayRth: import('@shared/schema').OHLC[];
}

export function computeRegime(
  marketHealth: MarketHealth,
  liquiditySweep: LiquiditySweep,
  failedVwapReclaim: { type: string; description: string } | null,
  trendExhaustion: TrendExhaustion | null,
  candleStrength: CandleStrength,
  emaCloud: EMACloud | null,
  gammaSummary: GammaSummary,
  lastPrice: number
): RegimeClassification {
  const notes: string[] = [];
  let regime: RegimeClassification['regime'] = 'range';
  let bias: 'bullish' | 'bearish' | 'neutral' = 'neutral';

  const adx = marketHealth.adx;
  const vwapSlope = marketHealth.vwapSlope;
  const vol = marketHealth.atr.percent;

  if (emaCloud?.trend !== 'neutral' && adx.trendStrength !== 'weak' && Math.abs(vwapSlope.contribution) > 4) {
    regime = 'trend';
    bias = emaCloud?.trend || 'neutral';
    notes.push('EMA cloud + ADX trend alignment');
  }

  if (adx.trendStrength === 'weak' && emaCloud?.trend === 'neutral' && Math.abs(vwapSlope.value) < 0.2) {
    regime = 'range';
    notes.push('Weak trend + VWAP magnet');
  }

  if (liquiditySweep.detected || failedVwapReclaim) {
    regime = 'liquidity_hunt';
    notes.push('Liquidity sweep behavior detected');
  }

  if (vol < 0.5 && gammaSummary.maxAbsGammaStrike !== null) {
    const gammaDistance = Math.abs(lastPrice - gammaSummary.maxAbsGammaStrike) / lastPrice;
    if (gammaDistance < 0.003) {
      regime = 'dealer_pinned';
      notes.push('Gamma pin + low volatility');
    }
  }

  if (marketHealth.orderflow.contribution > 6 || candleStrength.score > 80) {
    regime = 'news_expansion';
    notes.push('Sudden volatility expansion');
  }

  const confidence = Math.min(1, Math.abs(marketHealth.overallHealth - 50) / 50);

  return { regime, bias, confidence, notes };
}

export function computeLiquidityMap(
  sessionSplit: SessionSplit,
  vwapLast: number,
  liquiditySweep: LiquiditySweep,
  gammaSummary: GammaSummary,
  lastPrice: number,
  optionsChain?: OptionsChainContext
): LiquidityMap {
  const levels: LiquidityLevel[] = [];

  const { rth, overnight, prevDayRth } = sessionSplit;

  const add = (price: number, type: LiquidityLevel['type']) => {
    const distance = Math.abs(lastPrice - price);
    const distancePct = distance / Math.max(lastPrice, 1e-6);
    const liquidityScore = 1 / (1 + distancePct * 100);
    const sweepProbability = liquiditySweep.detected ? 0.7 : 0.3;
    levels.push({ price, type, liquidityScore, sweepProbability, distance });
  };

  if (prevDayRth.length > 0) {
    const prevHigh = Math.max(...prevDayRth.map(c => c.high));
    const prevLow = Math.min(...prevDayRth.map(c => c.low));
    add(prevHigh, 'PDH');
    add(prevLow, 'PDL');
  }

  if (overnight.length > 0) {
    const onHigh = Math.max(...overnight.map(c => c.high));
    const onLow = Math.min(...overnight.map(c => c.low));
    add(onHigh, 'ONH');
    add(onLow, 'ONL');
  }

  if (rth.length > 0) {
    const recent = rth.slice(-50);
    const swingHigh = Math.max(...recent.map(c => c.high));
    const swingLow = Math.min(...recent.map(c => c.low));
    add(swingHigh, 'SWING_HIGH');
    add(swingLow, 'SWING_LOW');
  }

  add(vwapLast, 'VWAP');

  if (gammaSummary.maxAbsGammaStrike != null) {
    add(gammaSummary.maxAbsGammaStrike, 'GAMMA');
  }

  levels.sort((a, b) => a.distance - b.distance);

  let nearestAbove = levels.find(l => l.price > lastPrice) || null;
  let nearestBelow = levels.find(l => l.price < lastPrice) || null;

  if (optionsChain && optionsChain.chain.length > 0) {
    const gammaLiqMap = buildGammaLiquidityMap(optionsChain.chain, {
      symbol: optionsChain.symbol,
      spot: optionsChain.spot,
      timestamp: new Date().toISOString()
    });

    if (gammaLiqMap.nearestAbove) {
      const gammaAbove: LiquidityLevel = {
        price: gammaLiqMap.nearestAbove.strike,
        type: 'GAMMA',
        liquidityScore: Math.min(1, gammaLiqMap.nearestAbove.gammaScore / 1000),
        sweepProbability: gammaLiqMap.confidence,
        distance: gammaLiqMap.nearestAbove.distance
      };
      if (!nearestAbove || gammaAbove.liquidityScore > nearestAbove.liquidityScore) {
        nearestAbove = gammaAbove;
      }
      levels.push(gammaAbove);
    }

    if (gammaLiqMap.nearestBelow) {
      const gammaBelow: LiquidityLevel = {
        price: gammaLiqMap.nearestBelow.strike,
        type: 'GAMMA',
        liquidityScore: Math.min(1, gammaLiqMap.nearestBelow.gammaScore / 1000),
        sweepProbability: gammaLiqMap.confidence,
        distance: gammaLiqMap.nearestBelow.distance
      };
      if (!nearestBelow || gammaBelow.liquidityScore > nearestBelow.liquidityScore) {
        nearestBelow = gammaBelow;
      }
      levels.push(gammaBelow);
    }
  }

  return {
    levels,
    nearestAbove,
    nearestBelow,
  };
}

export function computePatternMatrix(
  liquiditySweep: LiquiditySweep,
  failedVwapReclaim: { type: string; description: string } | null,
  trendExhaustion: TrendExhaustion | null,
  emaCloud: EMACloud | null
): PatternMatrixMeta {
  const patterns: PatternSignal[] = [];

  if (liquiditySweep.detected) {
    patterns.push({
      name: liquiditySweep.type === 'low_sweep' ? 'low_sweep_reclaim' : 'high_sweep_reject',
      baseTF: '5m',
      confirmTF: '15m',
      direction: liquiditySweep.type === 'low_sweep' ? 'bullish' : 'bearish',
      strength: Math.min(1, (liquiditySweep.sweepSizePct ?? 0) * 10),
      notes: [liquiditySweep.description ?? 'Liquidity sweep detected']
    });
  }

  if (failedVwapReclaim) {
    patterns.push({
      name: 'failed_vwap_reclaim',
      baseTF: '5m',
      confirmTF: '15m',
      direction: 'bearish',
      strength: 0.6,
      notes: [failedVwapReclaim.description]
    });
  }

  if (trendExhaustion?.isExhausted) {
    patterns.push({
      name: 'trend_exhaustion',
      baseTF: '5m',
      confirmTF: '15m',
      direction: 'bearish',
      strength: 0.7,
      notes: ['Range compression + volume fade']
    });
  }

  if (emaCloud?.trend !== 'neutral') {
    patterns.push({
      name: 'ema_trend_continuation',
      baseTF: '5m',
      confirmTF: '15m',
      direction: emaCloud?.trend || 'neutral',
      strength: 0.5,
      notes: ['EMA cloud alignment']
    });
  }

  const sorted = [...patterns].sort((a, b) => b.strength - a.strength);
  const strongest = sorted[0] || null;

  return { patterns, strongest };
}

export function computeDirectionalProbabilities(
  patterns: PatternMatrixMeta,
  liquidity: LiquidityMap,
  emaCloud: EMACloud | null,
  trendExhaustion: TrendExhaustion | null,
  failedVwapReclaim: { type: string; description: string } | null,
  tactical: TacticalAdvice,
  regime: RegimeClassification
): DirectionalProbabilities {
  let contUp =
    (emaCloud?.trend === 'bullish' ? 0.4 : 0) +
    (tactical.directionScore > 10 ? 0.3 : 0) +
    (liquidity.nearestAbove?.liquidityScore ?? 0) * 0.2;

  let contDown =
    (emaCloud?.trend === 'bearish' ? 0.4 : 0) +
    (tactical.directionScore < -10 ? 0.3 : 0) +
    (liquidity.nearestBelow?.liquidityScore ?? 0) * 0.2;

  let revUp =
    (patterns.patterns.some(p => p.name.includes('low_sweep')) ? 0.5 : 0) +
    (trendExhaustion?.isExhausted ? 0.2 : 0);

  let revDown =
    (patterns.patterns.some(p => p.name.includes('high_sweep')) ? 0.5 : 0) +
    (failedVwapReclaim ? 0.2 : 0);

  let chop =
    regime.regime === 'dealer_pinned' ? 0.6 :
    regime.regime === 'range' ? 0.4 : 0.2;

  const total = contUp + contDown + revUp + revDown + chop || 1;
  const normalize = (v: number) => Math.round((v / total) * 100) / 100;

  const out: DirectionalProbabilities = {
    continuationUp: normalize(contUp),
    continuationDown: normalize(contDown),
    reversalUp: normalize(revUp),
    reversalDown: normalize(revDown),
    chop: normalize(chop),
    dominant: '',
    confidence: Math.min(1, Math.abs(tactical.directionScore) / 30)
  };

  const entries: [string, number][] = [
    ['continuationUp', out.continuationUp],
    ['continuationDown', out.continuationDown],
    ['reversalUp', out.reversalUp],
    ['reversalDown', out.reversalDown],
    ['chop', out.chop]
  ];

  const sorted = entries.sort((a, b) => b[1] - a[1]);
  out.dominant = sorted[0][0];

  return out;
}

export function computeTimeOfDayVolatility(now: Date = new Date()): TimeOfDayVolatility {
  const hour = now.getUTCHours();

  let session: TimeOfDayVolatility['session'] = 'midday';
  let volBias: TimeOfDayVolatility['volBias'] = 'normal';
  let weight = 1.0;

  if (hour >= 13 && hour < 15) {
    session = 'open';
    volBias = 'high';
    weight = 1.2;
  } else if (hour >= 15 && hour < 19) {
    session = 'midday';
    volBias = 'normal';
    weight = 0.9;
  } else if (hour >= 19 && hour < 21) {
    session = 'power_hour';
    volBias = 'high';
    weight = 1.1;
  } else {
    session = 'after_hours';
    volBias = 'low';
    weight = 0.6;
  }

  return { session, volBias, weight };
}

export function computeMetaConfidence(
  regime: RegimeClassification,
  probabilities: DirectionalProbabilities,
  marketHealth: MarketHealth,
  timeOfDay: TimeOfDayVolatility
): number {
  const regimeConf = regime.confidence;
  const probConf = probabilities.confidence;
  const healthConf = Math.abs(marketHealth.overallHealth - 50) / 50;
  const todWeight = timeOfDay.weight;

  const raw = (regimeConf * 0.35 + probConf * 0.35 + healthConf * 0.3) * todWeight;
  return Math.max(0, Math.min(1, raw));
}

export function computeRecommended0DTEPlay(
  regime: RegimeClassification,
  probabilities: DirectionalProbabilities,
  timeOfDay: TimeOfDayVolatility
): Recommended0DTEPlay {
  const notes: string[] = [];
  let structure = 'FLAT';
  let direction: 'bullish' | 'bearish' | 'neutral' = 'neutral';
  let aggressiveness: Recommended0DTEPlay['aggressiveness'] = 'scalp';

  const dom = probabilities.dominant;

  if (dom === 'continuationUp') {
    direction = 'bullish';
    if (regime.regime === 'trend') {
      structure = 'CALL_DEBIT_SPREAD';
      aggressiveness = timeOfDay.session === 'open' || timeOfDay.session === 'power_hour' ? 'scalp' : 'swing';
      notes.push('Trend continuation up - directional long structures favored');
    } else {
      structure = 'CALL_VERTICAL';
      aggressiveness = 'scalp';
      notes.push('Bullish continuation in non-trend regime - tighter risk');
    }
  } else if (dom === 'continuationDown') {
    direction = 'bearish';
    if (regime.regime === 'trend') {
      structure = 'PUT_DEBIT_SPREAD';
      aggressiveness = timeOfDay.session === 'open' || timeOfDay.session === 'power_hour' ? 'scalp' : 'swing';
      notes.push('Trend continuation down - directional short structures favored');
    } else {
      structure = 'PUT_VERTICAL';
      aggressiveness = 'scalp';
      notes.push('Bearish continuation in non-trend regime - tighter risk');
    }
  } else if (dom === 'reversalUp') {
    direction = 'bullish';
    structure = 'CALL_LADDER';
    aggressiveness = 'lotto';
    notes.push('Reversal up - lotto-style risk with defined size');
  } else if (dom === 'reversalDown') {
    direction = 'bearish';
    structure = 'PUT_LADDER';
    aggressiveness = 'lotto';
    notes.push('Reversal down - lotto-style put structures');
  } else if (dom === 'chop') {
    direction = 'neutral';
    structure = 'IRON_BUTTERFLY';
    aggressiveness = 'premium_sell';
    notes.push('Chop / dealer-pinned - premium selling structures favored');
  }

  if (timeOfDay.session === 'after_hours') {
    notes.push('After-hours - execution quality and spreads may be worse');
  }

  return { structure, direction, aggressiveness, notes };
}

export function computeMetaEngine(
  ohlc: OHLC[],
  vwapSeries: number[],
  marketHealth: MarketHealth,
  liquiditySweep: LiquiditySweep,
  failedVwapReclaim: { type: string; description: string } | null,
  trendExhaustion: TrendExhaustion | null,
  candleStrength: CandleStrength,
  emaCloud: EMACloud | null,
  gammaSummary: GammaSummary,
  tactical: TacticalAdvice,
  sessionSplit?: SessionSplit
): MetaEngineOutput {
  const lastPrice = ohlc[ohlc.length - 1]?.close ?? 0;
  const vwapLast = vwapSeries[vwapSeries.length - 1] ?? lastPrice;

  const regime = computeRegime(
    marketHealth,
    liquiditySweep,
    failedVwapReclaim,
    trendExhaustion,
    candleStrength,
    emaCloud,
    gammaSummary,
    lastPrice
  );

  const effectiveSessionSplit: SessionSplit = sessionSplit ?? {
    rth: ohlc,
    overnight: [],
    prevDayRth: [],
  };

  const liquidity = computeLiquidityMap(
    effectiveSessionSplit,
    vwapLast,
    liquiditySweep,
    gammaSummary,
    lastPrice
  );

  const patterns = computePatternMatrix(
    liquiditySweep,
    failedVwapReclaim,
    trendExhaustion,
    emaCloud
  );

  const probabilities = computeDirectionalProbabilities(
    patterns,
    liquidity,
    emaCloud,
    trendExhaustion,
    failedVwapReclaim,
    tactical,
    regime
  );

  const timeOfDay = computeTimeOfDayVolatility();

  const metaConfidence = computeMetaConfidence(
    regime,
    probabilities,
    marketHealth,
    timeOfDay
  );

  const recommendedPlay = computeRecommended0DTEPlay(
    regime,
    probabilities,
    timeOfDay
  );

  return { 
    regime, 
    liquidity, 
    patterns, 
    probabilities,
    timeOfDay,
    metaConfidence,
    recommendedPlay
  };
}
