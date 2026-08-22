import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeMarketDNA } from '../engines/marketDnaEngine';
import { runMonsterOTMEngine } from '../monsterOtmEngine';

const sampleOHLC = Array.from({ length: 60 }, (_, i) => {
  const open = 100 + Math.sin(i / 7) * 0.8 + i * 0.01;
  const close = open + Math.cos(i / 5) * 0.6 + 0.2;
  const high = Math.max(open, close) + 0.7;
  const low = Math.min(open, close) - 0.7;
  return { open, high, low, close, volume: 1200000 + i * 8000 };
});

const trendOHLC = Array.from({ length: 90 }, (_, i) => {
  const base = 100 + i * 0.32;
  const impulse = i % 6 === 0 ? 0.55 : 0.18;
  const open = base;
  const close = base + impulse;
  return {
    open,
    high: close + 0.42,
    low: open - 0.28,
    close,
    volume: 1400000 + i * 18000,
  };
});

test('market DNA produces a meaningful fingerprint', () => {
  const result = analyzeMarketDNA(
    { '5m': sampleOHLC, '15m': sampleOHLC.slice(-40) },
    {
      healthScore: 78,
      healthGrade: 'B',
      rsi: { value: 64 },
      macd: { value: 1.2 },
      adx: { value: 28 },
      vwapSlope: { value: 0.8 },
      ivChange: { value: 0.15 },
      orderflow: { value: 0.6 },
      gamma: { value: 0.3 },
      breadth: { value: 0.55 },
    } as any,
    [] as any,
  );

  assert.ok(result.reliability >= 0.4);
  assert.ok(result.fingerprint.sweepFreq >= 0);
  assert.ok(result.fingerprint.institutionalScore >= 0.45);
  assert.ok(result.fingerprint.momentumBias !== undefined);
});

test('OTM engine stays selective without options-chain confirmation', () => {
  const result = runMonsterOTMEngine(
     trendOHLC as any,
    {
      healthScore: 86,
      healthGrade: 'A',
      rsi: { value: 68 },
      macd: { value: 1.8 },
      adx: { value: 34 },
      vwapSlope: { value: 1.1 },
      ivChange: { value: 0.2 },
      orderflow: { value: 0.72 },
      gamma: { value: 0.3 },
      breadth: { value: 0.64 },
    } as any,
    { detected: false, type: 'none', strength: 0 } as any,
    null,
    null,
    { score: 85, strength: 0.9 } as any,
    { value: 1.3, direction: 'bullish' } as any,
    null,
    {} as any,
    [],
    14 * 60 + 30,
    undefined,
     trendOHLC[trendOHLC.length - 1].close,
  );

  assert.equal(result.hasPlay, false);
  assert.equal(result.play, null);
});

test('OTM engine stays flat when price is not pushing in the selected direction', () => {
  const flatOHLC = Array.from({ length: 80 }, (_, i) => {
    const base = 100 + (i % 12) * 0.2;
    const drift = Math.sin(i / 9) * 0.45;
    const open = base + drift;
    const close = base - drift * 0.4;
    return {
      open,
      high: Math.max(open, close) + 0.8,
      low: Math.min(open, close) - 0.8,
      close,
      volume: 900000 + (i % 7) * 15000,
    };
  });

  const result = runMonsterOTMEngine(
    flatOHLC as any,
    {
      healthScore: 52,
      healthGrade: 'C',
      rsi: { value: 49 },
      macd: { value: -0.1 },
      adx: { value: 17 },
      vwapSlope: { value: 0.02 },
      ivChange: { value: 0.04 },
      orderflow: { value: 0.48 },
      gamma: { value: 0.2 },
      breadth: { value: 0.5 },
    } as any,
    { detected: false, type: 'none', strength: 0 } as any,
    null,
    null,
    { score: 28, strength: 0.2 } as any,
    { value: 0.5, direction: 'neutral' } as any,
    null,
    {} as any,
    [],
    15 * 60,
    undefined,
    flatOHLC[flatOHLC.length - 1].close,
  );

  assert.equal(result.hasPlay, false);
  assert.equal(result.play, null);
});
