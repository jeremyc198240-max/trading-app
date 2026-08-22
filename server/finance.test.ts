import test from 'node:test';
import assert from 'node:assert/strict';

import { generateSampleOHLC } from './finance.ts';

test('SPY fallback candles should anchor near current market range instead of stale low-600s', () => {
  const candles = generateSampleOHLC('SPY', 80);
  assert.ok(candles.length > 0, 'expected candles to be generated');

  const closes = candles.map((c) => c.close);
  const minClose = Math.min(...closes);
  const maxClose = Math.max(...closes);
  const lastClose = closes[closes.length - 1];

  assert.ok(minClose >= 700, `expected SPY fallback candles to stay near current market, got min ${minClose}`);
  assert.ok(lastClose >= 730, `expected last SPY close near current price, got ${lastClose}`);
  assert.ok(maxClose <= 820, `expected SPY fallback candles to stay realistic range, got max ${maxClose}`);
});
