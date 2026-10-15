import assert from 'node:assert/strict';
import { convertToDrawablePatterns } from '../server/patternDrawingAdapter';
import { normalizePatterns } from '../server/patternFusion';
import {
  detectBullishEngulfing,
  detectDoji,
  detectAllPatterns,
  detectMorningStar,
  detectSpinningTop,
  detectTasukiGap,
  detectThreeMethods,
  detectAdvancedStructuralPatterns,
  type PatternResult,
} from '../server/patterns';
import { patternRegistry } from '../client/src/patterns/patternRegistry';
import { PATTERN_REGISTRY } from '../shared/patternRegistry';
import type { OHLC } from '../shared/schema';

const requestedNames = Array.from(new Set([
  'Hammer', 'Inverted Hammer', 'Shooting Star', 'Hanging Man',
  'Bullish Belt Hold', 'Bearish Belt Hold', 'Long-Legged Doji', 'Dragonfly Doji',
  'Gravestone Doji', 'Standard Doji', 'Spinning Top (Bullish)', 'Spinning Top (Bearish)',
  'Bullish Engulfing', 'Bearish Engulfing', 'Piercing Line', 'Dark Cloud Cover',
  'Bullish Harami', 'Bearish Harami', 'Bullish Harami Cross', 'Bearish Harami Cross',
  'Piercing Line (Piercing Pattern)', 'Tweezer Bottom', 'Tweezer Top', 'Homing Pigeon',
  'Bullish Kicker', 'Bearish Kicker', 'Three Inside Up', 'Three Inside Down',
  'Three Outside Up', 'Three Outside Down', 'Morning Star', 'Evening Star',
  'Three White Soldiers', 'Three Black Crows', 'Bullish Abandoned Baby', 'Bearish Abandoned Baby',
  'Bullish Tri-Star Doji', 'Bearish Tri-Star Doji', 'Deliberation Pattern', 'Concealing Baby Swallow',
  'Breakaway (Bullish)', 'Breakaway (Bearish)', 'Tasuki Gap (Bullish)', 'Tasuki Gap (Bearish)',
  'Upside Gap Two Crows', 'Downside Gap Three Methods', 'Side-by-Side White Lines', 'Side-by-Side Black Lines',
  'Three Stars in the South', 'Three Mountains', 'Tower Bottom', 'Tower Top', 'Ladder Bottom', 'Ladder Top',
  'Matching Low', 'Matching High', 'Stick Sandwich', 'Stick Sandwich (Bullish)', 'Stick Sandwich (Bearish)',
  'Bullish Counterattack', 'Bearish Counterattack', 'Bullish Meeting Lines', 'Bearish Meeting Lines',
  'Bullish Separating Lines', 'Bearish Separating Lines', 'Bullish Belt Hold Pair', 'Bearish Belt Hold Pair',
  'On-Neck Pattern (weak bullish reversal candidate)', 'In-Neck Pattern (weak bullish reversal candidate)',
  'Thrusting Pattern (bullish variation)', 'Descending Hawk', 'Delayed Dark Cloud Cover',
  'Bearish Neckline Pattern', 'Bearish Thrusting Variation', 'Bearish On-Neck Variation',
  'Bullish Gap Reversal', 'Bearish Gap Reversal', 'Island Reversal Bottom (2-candle interpretation)',
  'Island Reversal Top (2-candle interpretation)', 'Bullish Window Reversal', 'Bearish Window Reversal',
  'Matching Low Plus Confirmation', 'Matching High Plus Confirmation', 'Last Engulfing Bottom',
  'Last Engulfing Top', 'Doji Star Bottom', 'Doji Star Top', 'Bullish Tasuki Reversal',
  'Bearish Tasuki Reversal',
  'Rising Three Methods', 'Falling Three Methods', 'Upside Tasuki', 'Downside Tasuki',
  'Separating Lines (Bullish)', 'Separating Lines (Bearish)', 'Bullish Marubozu', 'Bearish Marubozu',
  'Rising Wedge', 'Falling Wedge', 'Bull Flag', 'Bear Flag', 'Diamond Top', 'Diamond Top (forming)',
  'Bull Pennant', 'High-Tight Flag', 'Ascending Flag', 'Channel Flag (Bullish)', 'Bullish Flag Failure → Reversal',
  'Bear Pennant', 'Low-Tight Flag', 'Descending Flag', 'Channel Flag (Bearish)', 'Bearish Flag Failure → Reversal',
  'Ascending Triangle', 'Descending Triangle', 'Symmetrical Triangle', 'Expanding Triangle', 'Contracting Triangle',
  'Running Triangle', 'Triangle Fakeout → Reversal', 'Triangle Breakout → Continuation', 'Triangle Breakdown → Continuation', 'Triangle Apex Reversal',
  'Falling Wedge (Bullish Reversal)', 'Rising Wedge (Bearish Reversal)', 'Broadening Wedge', 'Contracting Wedge',
  'Terminal Wedge', 'Wedge Fakeout', 'Wedge Breakout', 'Wedge Breakdown', 'Wedge Throw-Over', 'Wedge Failure → Opposite Reversal',
  'Ascending Channel', 'Descending Channel', 'Horizontal Channel', 'Parallel Channel', 'Expanding Channel',
  'Contracting Channel', 'Channel Breakout', 'Channel Breakdown', 'Channel Fakeout', 'Channel Exhaustion Reversal',
  'Double Top', 'Double Bottom', 'Triple Top', 'Triple Bottom', 'Head & Shoulders', 'Inverse Head & Shoulders',
  'Rounded Top', 'Rounded Bottom', 'Rounding Top', 'Rounding Bottom', 'Adam & Eve Top', 'Adam & Eve Bottom', 'V-Top', 'V-Bottom',
  'Bullish Rectangle Breakout', 'Bearish Rectangle Breakdown', 'Cup & Handle (bullish reversal)',
  'Inverted Cup & Handle (bearish reversal)', 'Broadening Bottom', 'Broadening Top', 'Diamond Bottom',
  'Breakout', 'Breakdown', 'Failed Breakout', 'Failed Breakdown', 'Swing Failure Pattern (SFP)', 'Liquidity Grab',
  'Stop Hunt', 'Trap Move (Bull Trap)', 'Trap Move (Bear Trap)', 'Range Breakout', 'Range Breakdown', 'Range Fakeout',
  'Accumulation Range', 'Distribution Range', 'Compression Range', 'Expansion Range', 'Box Range', 'Micro-Range', 'Range Flip', 'Range Reversal',
  'Climax Volume Reversal', 'Volume Divergence Reversal', 'Volume Exhaustion', 'Volume Expansion Breakout',
  'Liquidity Sweep (Bullish)', 'Liquidity Sweep (Bearish)', 'Stop-Hunt Reversal', 'Stop-Run Reversal', 'Equal Lows Sweep', 'Equal Highs Sweep',
  'Order Block Reversal (Bullish)', 'Order Block Reversal (Bearish)', 'Breaker Block (Bullish)', 'Breaker Block (Bearish)',
  'Fair Value Gap Reversal', 'Displacement Reversal', 'Mitigation Block Reversal', 'Rejection Block Reversal',
  'Volatility Expansion Reversal', 'Volatility Compression Reversal', 'ATR Spike Reversal', 'ATR Collapse Reversal',
  'Bollinger Band M-Top', 'Bollinger Band W-Bottom', 'BB Squeeze Reversal', 'Keltner Channel Reversal',
  'Donchian Channel Reversal', 'Volatility Divergence Reversal', 'Range Break Reversal', 'Volatility Exhaustion Reversal',
  'Tri-Star Doji (Bullish)', 'Tri-Star Doji (Bearish)',
  'HTF Engulfing Reversal', 'HTF Hammer Reversal', 'HTF Shooting Star Reversal', 'LTF Liquidity Sweep + HTF Support',
  'LTF Engulfing + HTF Trend Exhaustion', 'HTF Order Block Reversal', 'HTF Breaker Reversal', 'HTF FVG Reversal',
  'Multi-Timeframe Divergence Reversal', 'Multi-Timeframe Volume Reversal',
]));

const candles: OHLC[] = Array.from({ length: 40 }, (_, index) => {
  const gapOffset = index >= 36 ? 5 : 0;
  const center = 100 + index * 0.12 + gapOffset;
  return {
    open: center - 0.2,
    high: center + 0.6 + (index % 4 === 0 ? 0.35 : 0),
    low: center - 0.6 - (index % 5 === 0 ? 0.3 : 0),
    close: center + 0.2,
    volume: 1_000 + index * 10,
    time: 1_700_000_000 + index * 300,
  };
});

function directionFor(name: string): PatternResult['type'] {
  const lower = name.toLowerCase();
  if (lower.includes('bear') || lower.includes('top') || lower.includes('crow') || lower.includes('mountain')
      || lower.includes('dark cloud') || lower.includes('shooting') || lower.includes('hanging')
      || lower.includes('downside') || lower.includes('falling three')) return 'bearish';
  if (lower.includes('doji') && !lower.includes('dragonfly')) return 'neutral';
  return 'bullish';
}

const patterns: PatternResult[] = requestedNames.map(name => ({
  name,
  type: directionFor(name),
  category: PATTERN_REGISTRY[name]?.backendCategory ?? 'candlestick',
  confidence: 75,
  description: `${name} verification fixture`,
  startIndex: ['candlestick', 'gap'].includes(PATTERN_REGISTRY[name]?.backendCategory ?? '') ? 34 : 10,
  endIndex: candles.length - 1,
}));

const patternAliases: Record<string, string> = {
  'piercing line (piercing pattern)': 'piercing line',
  'stick sandwich': 'stick sandwich (bullish)',
  'bullish separating lines': 'separating lines (bullish)',
  'bearish separating lines': 'separating lines (bearish)',
  'last engulfing bottom': 'bullish engulfing',
  'last engulfing top': 'bearish engulfing',
  'bullish gap reversal': 'piercing line',
  'bearish gap reversal': 'dark cloud cover',
  'bullish window reversal': 'bullish engulfing',
  'bearish window reversal': 'bearish engulfing',
};
const canonicalPatternName = (name: string) => patternAliases[name.toLowerCase()] ?? name.toLowerCase();

for (const name of requestedNames) {
  assert.equal(patternRegistry[name]?.showOnChart, true, `${name} missing from client chart registry`);
  assert.equal(PATTERN_REGISTRY[name]?.showOnChart, true, `${name} missing from shared visible registry`);
}

const drawable = convertToDrawablePatterns(patterns, candles, '5m');
assert.equal(drawable.length, requestedNames.length, 'Every requested pattern should survive drawable conversion');

const normalized = normalizePatterns(patterns, candles, drawable);
const uniquePatternCount = new Set(patterns.map(pattern =>
  `${canonicalPatternName(pattern.name)}|${pattern.type}|${pattern.startIndex}|${pattern.endIndex}`,
)).size;
assert.equal(normalized.length, uniquePatternCount, 'Normalization should retain each unique pattern and collapse only named aliases');

const duplicateEngulfingAliases = normalizePatterns([
  { name: 'Bullish Engulfing', type: 'bullish', category: 'candlestick', confidence: 80, description: 'base', startIndex: 38, endIndex: 39 },
  { name: 'Last Engulfing Bottom', type: 'bullish', category: 'candlestick', confidence: 80, description: 'specific alias', startIndex: 38, endIndex: 39 },
], candles);
assert.equal(duplicateEngulfingAliases.length, 1, 'Equivalent engulfing labels should not double-count one candle formation');

for (const pattern of drawable) {
  const coordinates = [
    ...pattern.geometry.points.flatMap(point => [point.x, point.y]),
    ...pattern.geometry.lines.flatMap(line => [line.start.x, line.start.y, line.end.x, line.end.y]),
  ];
  assert.ok(pattern.geometry.points.length + pattern.geometry.lines.length > 0, `${pattern.name} has empty geometry`);
  assert.ok(coordinates.every(Number.isFinite), `${pattern.name} has non-finite geometry`);

  const normalizedPattern = normalized.find(candidate =>
    canonicalPatternName(candidate.name) === canonicalPatternName(pattern.name) &&
    candidate.direction === pattern.type &&
    candidate.startIndex === pattern.startIndex &&
    candidate.endIndex === pattern.endIndex,
  );
  if (normalizedPattern?.name.toLowerCase() !== pattern.name.toLowerCase()) continue;
  assert.deepEqual(normalizedPattern?.geometry, pattern.geometry, `${pattern.name} geometry was lost during normalization`);
}

for (const name of ['Diamond Top', 'Diamond Top (forming)']) {
  const diamond = drawable.find(pattern => pattern.name === name);
  assert.ok(diamond && diamond.geometry.lines.length === 4, `${name} must have four boundary lines`);
}

for (const name of ['Rising Wedge', 'Falling Wedge']) {
  const wedge = drawable.find(pattern => pattern.name === name);
  assert.ok(wedge && wedge.geometry.lines.length >= 2, `${name} must have converging boundary geometry`);
}

for (const name of ['Bull Flag', 'Bear Flag']) {
  const flag = drawable.find(pattern => pattern.name === name);
  assert.ok(flag && flag.geometry.lines.length >= 1, `${name} must include pole/channel geometry`);
}

const downtrend: OHLC[] = Array.from({ length: 10 }, (_, index) => {
  const open = 110 - index;
  return { open, high: open + 0.3, low: open - 0.8, close: open - 0.5, volume: 1_000 };
});

const bullishEngulfing = detectBullishEngulfing([
  ...downtrend,
  { open: 100.8, high: 101, low: 99.7, close: 100, volume: 1_100 },
  { open: 99.8, high: 101.4, low: 99.6, close: 101.2, volume: 1_300 },
]);
assert.equal(bullishEngulfing?.name, 'Bullish Engulfing', 'Two-candle reversal detection failed');

const morningStar = detectMorningStar([
  ...downtrend,
  { open: 100.8, high: 101, low: 99.6, close: 99.8, volume: 1_100 },
  { open: 99.5, high: 99.7, low: 99.3, close: 99.55, volume: 900 },
  { open: 99.6, high: 100.8, low: 99.5, close: 100.5, volume: 1_300 },
]);
assert.equal(morningStar?.name, 'Morning Star', 'Three-candle reversal detection failed');

const standardDoji = detectDoji([...downtrend, { open: 100, high: 101, low: 99, close: 100.05, volume: 1_000 }]);
assert.equal(standardDoji?.name, 'Long-Legged Doji', 'Long-legged doji classification failed');

const spinningTop = detectSpinningTop([...downtrend, { open: 100, high: 101, low: 99, close: 100.3, volume: 1_000 }]);
assert.equal(spinningTop?.name, 'Spinning Top (Bullish)', 'Directional spinning-top classification failed');

const tasukiGap = detectTasukiGap([
  ...downtrend,
  { open: 100, high: 101.2, low: 99.8, close: 101, volume: 1_000 },
  { open: 102, high: 103.2, low: 101.8, close: 103, volume: 1_100 },
  { open: 102.8, high: 103, low: 101.4, close: 101.5, volume: 1_000 },
]);
assert.equal(tasukiGap?.name, 'Tasuki Gap (Bullish)', 'Gap-pattern detection failed');

const risingThreeMethods = detectThreeMethods([
  ...downtrend,
  { open: 100, high: 105.5, low: 99.5, close: 105, volume: 1_500 },
  { open: 104.8, high: 105, low: 103.5, close: 103.8, volume: 800 },
  { open: 104.2, high: 104.5, low: 102.8, close: 103.2, volume: 750 },
  { open: 103.8, high: 104, low: 102, close: 102.5, volume: 700 },
  { open: 104, high: 106.4, low: 103.8, close: 106, volume: 1_600 },
]);
assert.equal(risingThreeMethods?.name, 'Rising Three Methods', 'Continuation-pattern detection failed');

const rangeCandles: OHLC[] = Array.from({ length: 24 }, (_, index) => ({
  open: 100 + (index % 2 ? 0.15 : -0.15),
  high: 101,
  low: 99,
  close: 100 + (index % 3 - 1) * 0.12,
  volume: 1_000,
}));
const breakoutPatterns = detectAdvancedStructuralPatterns([
  ...rangeCandles,
  { open: 100.5, high: 103, low: 100.2, close: 102.6, volume: 2_200 },
]);
assert.ok(breakoutPatterns.some(pattern => pattern.name === 'Breakout'), 'Generic breakout detection failed');
assert.ok(breakoutPatterns.some(pattern => pattern.name === 'Range Breakout'), 'Range breakout detection failed');
assert.ok(breakoutPatterns.some(pattern => pattern.name === 'Volume Expansion Breakout'), 'Volume-confirmed breakout detection failed');

const failurePatterns = detectAdvancedStructuralPatterns([
  ...rangeCandles,
  { open: 100.6, high: 103, low: 100.4, close: 102.5, volume: 1_600 },
  { open: 102.4, high: 102.6, low: 99.6, close: 100.2, volume: 1_800 },
]);
assert.ok(failurePatterns.some(pattern => pattern.name === 'Failed Breakout'), 'Failed breakout detection failed');
assert.ok(failurePatterns.some(pattern => pattern.name === 'Trap Move (Bull Trap)'), 'Bull-trap detection failed');
assert.ok(failurePatterns.some(pattern => pattern.name === 'Range Fakeout'), 'Range fakeout detection failed');

const formingDrawables = convertToDrawablePatterns(breakoutPatterns, [...rangeCandles, { open: 100.5, high: 103, low: 100.2, close: 102.6, volume: 2_200 }], '5m');
assert.ok(formingDrawables.some(pattern => pattern.lifecycle === 'forming'), 'Active structural patterns must remain visibly forming');

const decliningCandles: OHLC[] = Array.from({ length: 10 }, (_, index) => {
  const center = 110 - index;
  return { open: center + 0.3, high: center + 0.6, low: center - 0.6, close: center - 0.3, volume: 1_000 };
});
const bullishHaramiCross = detectAllPatterns([
  ...decliningCandles,
  { open: 100, high: 100.2, low: 97.8, close: 98, volume: 1_100 },
  { open: 99, high: 99.1, low: 98.9, close: 99, volume: 900 },
], '5m');
assert.ok(bullishHaramiCross.some(pattern => pattern.name === 'Bullish Harami Cross'), 'Bullish Harami Cross was not detected by the live pattern runner');

const bullishBeltHoldPair = detectAllPatterns([
  ...decliningCandles,
  { open: 100, high: 101.1, low: 99.9, close: 101, volume: 1_100 },
  { open: 101, high: 102.1, low: 100.9, close: 102, volume: 1_200 },
], '5m');
assert.ok(bullishBeltHoldPair.some(pattern => pattern.name === 'Bullish Belt Hold Pair'), 'Bullish Belt Hold Pair was not detected by the live pattern runner');

const islandBottom = detectAllPatterns([
  ...decliningCandles,
  { open: 99, high: 99.2, low: 98.5, close: 98.7, volume: 1_100 },
  { open: 98, high: 98.1, low: 96, close: 96.5, volume: 1_300 },
  { open: 99, high: 100.2, low: 98.5, close: 100, volume: 1_400 },
], '5m');
assert.ok(islandBottom.some(pattern => pattern.name === 'Island Reversal Bottom (2-candle interpretation)'), 'Island Reversal Bottom was not detected by the live pattern runner');

const risingCandles: OHLC[] = Array.from({ length: 10 }, (_, index) => {
  const center = 90 + index;
  return { open: center - 0.3, high: center + 0.6, low: center - 0.6, close: center + 0.3, volume: 1_000 };
});
const bearishHaramiCross = detectAllPatterns([
  ...risingCandles,
  { open: 100, high: 102.2, low: 99.8, close: 102, volume: 1_100 },
  { open: 101, high: 101.1, low: 100.9, close: 101, volume: 900 },
], '5m');
assert.ok(bearishHaramiCross.some(pattern => pattern.name === 'Bearish Harami Cross'), 'Bearish Harami Cross was not detected by the live pattern runner');

const delayedDarkCloud = detectAllPatterns([
  ...risingCandles,
  { open: 100, high: 101.2, low: 99.8, close: 101, volume: 1_000 },
  { open: 100, high: 102.2, low: 99.8, close: 102, volume: 1_100 },
  { open: 102.1, high: 102.2, low: 100.6, close: 100.8, volume: 1_200 },
], '5m');
assert.ok(delayedDarkCloud.some(pattern => pattern.name === 'Delayed Dark Cloud Cover'), 'Delayed Dark Cloud Cover was not detected by the live pattern runner');

console.log(`Verified ${requestedNames.length} requested pattern overlays.`);