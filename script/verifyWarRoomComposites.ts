import assert from "node:assert/strict";
import type { NormalizedPattern } from "../shared/schema";
import { fuseCompositeGauge } from "../client/src/lib/warRoomCompositeGauge";
import { canonicalPatternName, dedupeNormalizedPatterns } from "../client/src/lib/warRoomPatternDedupe";
import { readPriceActionReversal } from "../client/src/lib/warRoomPriceActionReversal";
import { calculateScannerTradeQuality, isScannerHotPlay } from "../client/src/lib/scannerHotPlay";
import { deriveLiveDirectionalProbabilities } from "../client/src/lib/warRoomLiveDirectional";

function pattern(overrides: Partial<NormalizedPattern> = {}): NormalizedPattern {
  return {
    name: "Piercing Line",
    category: "candlestick",
    direction: "bullish",
    confidence: 72,
    quality: 0.8,
    state: "valid",
    startIndex: 10,
    endIndex: 11,
    breakoutLevel: null,
    invalidationLevel: null,
    geometry: {
      points: [],
      lines: [],
      breakoutLevel: null,
      invalidationLevel: null,
    },
    howToTrade: [],
    description: "",
    priceTarget: null,
    stopLoss: null,
    ...overrides,
  };
}

assert.equal(canonicalPatternName("Piercing Line (Piercing Pattern)"), "piercing line");
const deduped = dedupeNormalizedPatterns([
  pattern({ name: "Piercing Line", confidence: 72, geometry: { points: [], lines: [], breakoutLevel: null, invalidationLevel: null } }),
  pattern({ name: "Piercing Line (Piercing Pattern)", confidence: 84, quality: 0.9, geometry: { points: [{ x: 1, y: 2 }], lines: [], breakoutLevel: null, invalidationLevel: null } }),
  pattern({ name: "Piercing Line", state: "failed", confidence: 99, quality: 1 }),
  pattern({ name: "Piercing Line", startIndex: 12, endIndex: 13 }),
  pattern({ name: "Piercing Line", direction: "bearish" }),
  pattern({ name: "Last Engulfing Bottom" }),
]);
assert.equal(deduped.length, 4, "alias geometry differences collapse while separate formations remain");
assert.equal(deduped[0].confidence, 84, "the higher-quality duplicate is retained");
assert.equal(dedupeNormalizedPatterns([
  pattern({ name: "Bullish Engulfing", startIndex: 20, endIndex: 21 }),
  pattern({ name: "Engulfing Pattern", startIndex: 20, endIndex: 22 }),
  pattern({ name: "Bullish Engulfing", startIndex: 21, endIndex: 22 }),
]).length, 2, "overlapping duplicate detections collapse without merging adjacent distinct formations");

const expansionWithVolume = {
  healthGrade: "A",
  rsiValue: 55,
  momentumStrength: 10,
  volumeSpike: 1.5,
  breakoutSignal: "EXPANSION",
};
assert.equal(calculateScannerTradeQuality(expansionWithVolume).score, 80);
assert.equal(isScannerHotPlay(expansionWithVolume), true, "volume-backed expansion is gold");
assert.equal(isScannerHotPlay({
  breakoutSignal: "BREAKOUT",
  volumeSpike: 1.6,
  momentumStrength: 39,
}), false, "breakouts require both volume and strong momentum");
assert.equal(isScannerHotPlay({
  breakoutSignal: "SQUEEZE",
  squeezeCandles: 5,
  healthGrade: "D",
  rsiValue: 25,
  momentumStrength: 40,
}), false, "critical squeezes must also clear the existing quality threshold");
assert.equal(isScannerHotPlay({
  breakoutSignal: "MOMENTUM",
}), true, "momentum signals preserve the scanner's existing gold criteria");

const trendingCandles = (direction: "up" | "down") => Array.from({ length: 6 }, (_, index) => {
  const base = 100 + (direction === "up" ? index : -index);
  return {
    open: base,
    high: base + 1.2,
    low: base - 0.2,
    close: base + (direction === "up" ? 1 : -1),
    volume: 1000,
    time: 1_800_000_000 + index * 300,
  };
});
const liveCallRead = deriveLiveDirectionalProbabilities({
  baseline: { up: 1 / 3, down: 1 / 3, chop: 1 / 3 },
  candles: trendingCandles("up"),
  spot: 106.5,
  quoteIsLive: true,
});
const livePutRead = deriveLiveDirectionalProbabilities({
  baseline: { up: 1 / 3, down: 1 / 3, chop: 1 / 3 },
  candles: trendingCandles("down"),
  spot: 94.5,
  quoteIsLive: true,
});
assert.ok(liveCallRead.up > liveCallRead.down, "live bullish chart + quote should favor CALL");
assert.ok(livePutRead.down > livePutRead.up, "live bearish chart + quote should favor PUT");
assert.ok(Math.abs(liveCallRead.up + liveCallRead.down + liveCallRead.chop - 1) < 1e-9, "live directional output must normalize to 100%");
const noChartRead = deriveLiveDirectionalProbabilities({
  baseline: undefined,
  candles: [],
  spot: 100,
  quoteIsLive: false,
});
assert.ok(Math.abs(noChartRead.up + noChartRead.down + noChartRead.chop - 1) < 1e-9, "missing chart data should use a neutral, normalized fallback");

const bullish = fuseCompositeGauge([
  { name: "tilt", score: 80, confidence: 90, reliability: 80, direction: "CALL" },
  { name: "cloud", score: 70, confidence: 75, reliability: 70, direction: "CALL" },
]);
assert.equal(bullish.direction, "CALL");
assert.ok(bullish.score > 50);

const mixed = fuseCompositeGauge([
  { name: "tilt", score: 80, confidence: 90, reliability: 80, direction: "CALL" },
  { name: "cloud", score: 80, confidence: 90, reliability: 80, direction: "PUT" },
]);
assert.equal(mixed.direction, "WAIT");
assert.equal(mixed.score, 50);

const balancedWithoutWeight = fuseCompositeGauge([
  { name: "support", score: 80, confidence: 90, reliability: 80, direction: "CALL" },
  { name: "resistance", score: 80, confidence: 90, reliability: 80, direction: "PUT" },
]);
const provisionallyWeighted = fuseCompositeGauge([
  { name: "support", score: 80, confidence: 90, reliability: 80, direction: "CALL", weight: 1.4 },
  { name: "resistance", score: 80, confidence: 90, reliability: 80, direction: "PUT" },
]);
assert.equal(balancedWithoutWeight.direction, "WAIT");
assert.equal(provisionallyWeighted.direction, "CALL", "higher evidence weight should shift a balanced fusion toward that input");
assert.ok(provisionallyWeighted.score > balancedWithoutWeight.score);

const bullishReversal = readPriceActionReversal({
  bullishCandle: true,
  bearishCandle: false,
  bodyQuality: 0.8,
  volumeRatio: 1.4,
  patterns: [{ name: "Bullish Engulfing", direction: "bullish", score: 82 }],
  scalpExitWarning: null,
});
assert.equal(bullishReversal.direction, "CALL");
assert.equal(bullishReversal.patternNames[0], "Bullish Engulfing");

const mixedReversal = readPriceActionReversal({
  bullishCandle: true,
  bearishCandle: false,
  bodyQuality: 0.7,
  volumeRatio: 1.2,
  patterns: [{ name: "Dark Cloud Cover", direction: "bearish", score: 72 }],
  scalpExitWarning: null,
});
assert.equal(mixedReversal.direction, "MIXED", "opposing candle and pattern evidence must not report a one-sided reversal");

const noReversal = readPriceActionReversal({
  bullishCandle: false,
  bearishCandle: false,
  bodyQuality: 0.2,
  volumeRatio: 0.8,
  patterns: [{ name: "Piercing Line", direction: "bullish", score: 40 }],
  scalpExitWarning: null,
});
assert.equal(noReversal.direction, "NONE");

assert.equal(fuseCompositeGauge([]).direction, "WAIT");
console.log("Verified pattern deduplication, weighted fusion, and price-action reversal reads.");
