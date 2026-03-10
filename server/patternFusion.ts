import type { PatternResult } from './patterns';
import type { NormalizedPattern, FusionPatternSignal, PatternGeometry, PatternLifecycle, PatternCategory } from '@shared/schema';

interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time?: number;
}

function bodySize(c: OHLC): number {
  return Math.abs(c.close - c.open);
}

function totalRange(c: OHLC): number {
  return c.high - c.low;
}

function computePatternQuality(pattern: PatternResult, ohlc: OHLC[]): number {
  let score = 0;
  const start = Math.max(0, pattern.startIndex);
  const end = Math.min(pattern.endIndex, ohlc.length - 1);
  const span = end - start + 1;

  const confScore = Math.min(pattern.confidence / 100, 1) * 0.25;
  score += confScore;

  if (span >= 3) {
    const highs = ohlc.slice(start, end + 1).map(c => c.high);
    const lows = ohlc.slice(start, end + 1).map(c => c.low);
    const maxH = Math.max(...highs);
    const minL = Math.min(...lows);
    const range = maxH - minL;
    if (range > 0) {
      const midPrice = (maxH + minL) / 2;
      const avgDist = highs.reduce((s, h, i) => s + Math.abs(h - midPrice) + Math.abs(lows[i] - midPrice), 0) / (span * 2);
      const symmetry = 1 - Math.min(avgDist / range, 1);
      score += symmetry * 0.15;
    }
  }

  const sliceForVol = ohlc.slice(Math.max(0, start - 5), end + 1);
  if (sliceForVol.length >= 2) {
    const avgVol = sliceForVol.reduce((s, c) => s + c.volume, 0) / sliceForVol.length;
    const lastVol = ohlc[end].volume;
    if (avgVol > 0 && lastVol > avgVol * 1.2) {
      score += 0.15;
    } else if (avgVol > 0 && lastVol > avgVol * 0.8) {
      score += 0.08;
    }
  }

  if (span >= 5 && span <= 50) {
    score += 0.1;
  } else if (span >= 3) {
    score += 0.05;
  }

  const lookback = Math.min(20, start);
  if (lookback >= 5) {
    const priorSlice = ohlc.slice(start - lookback, start);
    const closes = priorSlice.map(c => c.close);
    if (closes.length >= 2) {
      const trend = closes[closes.length - 1] > closes[0] ? 'bullish' : 'bearish';
      if (
        (pattern.type === 'bullish' && trend === 'bullish') ||
        (pattern.type === 'bearish' && trend === 'bearish')
      ) {
        score += 0.15;
      } else if (
        (pattern.category === 'reversal' || pattern.category === 'candlestick') &&
        ((pattern.type === 'bullish' && trend === 'bearish') ||
         (pattern.type === 'bearish' && trend === 'bullish'))
      ) {
        score += 0.1;
      }
    }
  }

  const recency = ohlc.length - 1 - end;
  if (recency <= 2) {
    score += 0.1;
  } else if (recency <= 10) {
    score += 0.05;
  }

  if (ohlc.length > end) {
    const c = ohlc[end];
    const range = totalRange(c);
    if (range > 0) {
      const body = bodySize(c);
      const ratio = body / range;
      if (ratio > 0.6) score += 0.1;
      else if (ratio > 0.3) score += 0.05;
    }
  }

  return Math.min(Math.round(score * 100) / 100, 1);
}

function generateTradePlan(pattern: PatternResult, ohlc: OHLC[]): string[] {
  const plan: string[] = [];
  const lastPrice = ohlc[ohlc.length - 1]?.close ?? 0;
  const name = pattern.name;

  if (pattern.type === 'bullish') {
    if (pattern.priceTarget) {
      plan.push(`Entry: Look for breakout above $${pattern.priceTarget.toFixed(2)} with volume confirmation.`);
    } else {
      plan.push(`Entry: Wait for bullish confirmation above recent resistance.`);
    }
    if (pattern.stopLoss) {
      plan.push(`Stop: Place stop below $${pattern.stopLoss.toFixed(2)}.`);
    } else {
      const atrEst = totalRange(ohlc[ohlc.length - 1]) * 1.5;
      plan.push(`Stop: Place stop ${atrEst.toFixed(2)} below entry.`);
    }
    plan.push(`Target: Use 1.5-2x risk for initial target.`);
  } else if (pattern.type === 'bearish') {
    if (pattern.priceTarget) {
      plan.push(`Entry: Look for breakdown below $${pattern.priceTarget.toFixed(2)} with volume.`);
    } else {
      plan.push(`Entry: Wait for bearish confirmation below recent support.`);
    }
    if (pattern.stopLoss) {
      plan.push(`Stop: Place stop above $${pattern.stopLoss.toFixed(2)}.`);
    } else {
      const atrEst = totalRange(ohlc[ohlc.length - 1]) * 1.5;
      plan.push(`Stop: Place stop ${atrEst.toFixed(2)} above entry.`);
    }
    plan.push(`Target: Use 1.5-2x risk for initial target.`);
  } else {
    plan.push(`Wait for directional confirmation before entering.`);
    plan.push(`Watch for breakout in either direction with volume.`);
  }

  const cat = pattern.category;
  if (cat === 'reversal' || cat === 'candlestick') {
    plan.push(`Risk: Counter-trend setup - use smaller position size (50-75% normal).`);
    plan.push(`Invalidation: Pattern fails if price moves back through the formation.`);
  } else if (cat === 'continuation') {
    plan.push(`Risk: Trend continuation - normal position sizing allowed.`);
    plan.push(`Invalidation: Pattern fails if price breaks the consolidation range in the wrong direction.`);
  } else if (cat === 'breakout') {
    plan.push(`Risk: Wait for retest of breakout level before adding size.`);
    plan.push(`Invalidation: False breakout if price re-enters the pattern range.`);
  } else if (cat === 'structure') {
    plan.push(`Risk: Structure patterns are context clues - combine with other signals.`);
  } else if (cat === 'volatility') {
    plan.push(`Risk: Volatility patterns suggest imminent expansion - use straddle approach or wait for direction.`);
  }

  return plan;
}

function deriveLifecycle(
  pattern: PatternResult,
  ohlc: OHLC[],
  breakoutLevel: number | null,
  invalidationLevel: number | null
): PatternLifecycle {
  const lastIdx = ohlc.length - 1;
  const lastClose = ohlc[lastIdx].close;
  const age = lastIdx - pattern.endIndex;

  if (age > 50) return 'expired';

  if (invalidationLevel !== null) {
    const failed = pattern.type === 'bullish'
      ? lastClose < invalidationLevel
      : lastClose > invalidationLevel;
    if (failed) return 'failed';
  }

  if (breakoutLevel !== null) {
    const isBreaking = pattern.type === 'bullish'
      ? lastClose > breakoutLevel * 0.998 && lastClose < breakoutLevel * 1.005
      : lastClose < breakoutLevel * 1.002 && lastClose > breakoutLevel * 0.995;
    if (isBreaking) return 'breaking';
  }

  if (pattern.endIndex >= lastIdx - 2) return 'forming';

  return 'valid';
}

function buildSimpleGeometry(pattern: PatternResult, ohlc: OHLC[]): PatternGeometry {
  const start = Math.max(0, pattern.startIndex);
  const end = Math.min(pattern.endIndex, ohlc.length - 1);
  const slice = ohlc.slice(start, end + 1);

  const rangeHigh = Math.max(...slice.map(c => c.high));
  const rangeLow = Math.min(...slice.map(c => c.low));

  const breakoutLevel = pattern.type === 'bullish' ? rangeHigh : (pattern.type === 'bearish' ? rangeLow : null);
  const invalidationLevel = pattern.type === 'bullish' ? rangeLow : (pattern.type === 'bearish' ? rangeHigh : null);

  return {
    points: [
      { x: start, y: ohlc[start].high, label: 'Start' },
      { x: end, y: ohlc[end].close, label: 'End' },
    ],
    lines: [
      {
        start: { x: start, y: rangeHigh },
        end: { x: end, y: rangeHigh },
        style: 'dashed' as const,
      },
      {
        start: { x: start, y: rangeLow },
        end: { x: end, y: rangeLow },
        style: 'dashed' as const,
      },
    ],
    breakoutLevel,
    invalidationLevel,
  };
}

function mapCategory(cat: string): PatternCategory {
  const valid: PatternCategory[] = [
    'candlestick', 'classical', 'continuation', 'reversal',
    'breakout', 'structure', 'volatility', 'gap', 'liquidity'
  ];
  if (valid.includes(cat as PatternCategory)) return cat as PatternCategory;
  return 'classical';
}

export function normalizePatterns(
  patterns: PatternResult[],
  ohlc: OHLC[]
): NormalizedPattern[] {
  if (!ohlc || ohlc.length === 0) return [];

  return patterns.map((p) => {
    const quality = computePatternQuality(p, ohlc);
    const howToTrade = generateTradePlan(p, ohlc);
    const geometry = buildSimpleGeometry(p, ohlc);
    const state = deriveLifecycle(p, ohlc, geometry.breakoutLevel, geometry.invalidationLevel);

    return {
      name: p.name,
      category: mapCategory(p.category),
      direction: p.type,
      confidence: p.confidence,
      quality,
      state,
      startIndex: Math.max(0, Math.min(p.startIndex, ohlc.length - 1)),
      endIndex: Math.max(0, Math.min(p.endIndex, ohlc.length - 1)),
      breakoutLevel: geometry.breakoutLevel,
      invalidationLevel: geometry.invalidationLevel,
      geometry,
      howToTrade,
      description: p.description,
      priceTarget: p.priceTarget ?? null,
      stopLoss: p.stopLoss ?? null,
    };
  });
}

export function computePatternFusionSignal(
  patterns: NormalizedPattern[]
): FusionPatternSignal {
  if (patterns.length === 0) {
    return {
      direction: 'WAIT',
      confidence: 0,
      reasons: ['No patterns detected'],
      howToTrade: [],
      dominantPattern: null,
      patternCount: 0,
    };
  }

  const active = patterns.filter(p => p.state !== 'expired' && p.state !== 'failed');
  if (active.length === 0) {
    return {
      direction: 'WAIT',
      confidence: 0,
      reasons: ['All patterns expired or failed'],
      howToTrade: [],
      dominantPattern: null,
      patternCount: patterns.length,
    };
  }

  let bullScore = 0;
  let bearScore = 0;
  const reasons: string[] = [];

  for (const p of active) {
    const weight = (p.confidence / 100) * p.quality;
    const stateMultiplier =
      p.state === 'breaking' ? 1.5 :
      p.state === 'valid' ? 1.2 :
      p.state === 'forming' ? 0.8 : 1;

    const catMultiplier =
      p.category === 'reversal' ? 1.3 :
      p.category === 'breakout' ? 1.2 :
      p.category === 'continuation' ? 1.1 :
      p.category === 'structure' ? 0.9 : 1;

    const score = weight * stateMultiplier * catMultiplier;

    if (p.direction === 'bullish') {
      bullScore += score;
    } else if (p.direction === 'bearish') {
      bearScore += score;
    }
  }

  const sorted = [...active].sort((a, b) => {
    const scoreA = (a.confidence / 100) * a.quality;
    const scoreB = (b.confidence / 100) * b.quality;
    return scoreB - scoreA;
  });

  const dominant = sorted[0];
  const totalScore = bullScore + bearScore;
  const edgeRatio = totalScore > 0 ? Math.abs(bullScore - bearScore) / totalScore : 0;

  let direction: 'CALL' | 'PUT' | 'WAIT';
  let confidence: number;

  if (edgeRatio < 0.15 || totalScore < 0.1) {
    direction = 'WAIT';
    confidence = Math.round(edgeRatio * 100);
    reasons.push(`Conflicting patterns: bull ${bullScore.toFixed(2)} vs bear ${bearScore.toFixed(2)}`);
  } else if (bullScore > bearScore) {
    direction = 'CALL';
    confidence = Math.round(Math.min(edgeRatio * 100 + 20, 95));
    reasons.push(`Bullish pattern edge: ${bullScore.toFixed(2)} vs ${bearScore.toFixed(2)}`);
  } else {
    direction = 'PUT';
    confidence = Math.round(Math.min(edgeRatio * 100 + 20, 95));
    reasons.push(`Bearish pattern edge: ${bearScore.toFixed(2)} vs ${bullScore.toFixed(2)}`);
  }

  for (const p of sorted.slice(0, 3)) {
    reasons.push(`${p.name} (${p.direction}, ${p.state}, quality ${(p.quality * 100).toFixed(0)}%)`);
  }

  const howToTrade = dominant?.howToTrade ?? [];

  return {
    direction,
    confidence,
    reasons,
    howToTrade,
    dominantPattern: dominant?.name ?? null,
    patternCount: active.length,
  };
}
