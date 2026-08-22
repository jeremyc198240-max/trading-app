import { fetchLiveOHLC, OHLC } from './marketData';
import { analyzeHTFBias } from './engines/htfBiasEngine';
import { analyzeIntent } from './engines/intentEngine';
import { analyzeShadow } from './engines/shadowEngine';
import { analyzeInstitutionalSignature } from './engines/institutionalSignatureEngine';
import type { MarketHealthIndicators, TimeframePatternIntel, Timeframe } from './fusion';
import { computeVWAPSeries } from './finance';

const LOOKAHEAD_BARS = 6;
const MIN_HISTORY_BARS = 80;
const DIRECTION_THRESHOLD = 0.002;
const SAMPLE_STEP = 3;

interface EngineStats {
  tested: number;
  correct: number;
  skipped: number;
}

type Direction = 'bullish' | 'bearish' | 'neutral';

type TrendBias = 'bullish' | 'bearish' | 'neutral';

function aggregateOhlc(candles: OHLC[], factor: number): OHLC[] {
  if (factor <= 1 || candles.length === 0) return [...candles];
  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const result: OHLC[] = [];

  for (let i = 0; i < sorted.length; i += factor) {
    const chunk = sorted.slice(i, i + factor);
    if (chunk.length === 0) continue;
    result.push({
      open: chunk[0].open,
      high: Math.max(...chunk.map(c => c.high)),
      low: Math.min(...chunk.map(c => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((sum, c) => sum + c.volume, 0),
      time: chunk[0].time,
      timeMs: chunk[0].timeMs,
    });
  }

  return result;
}

function computeSlopeBias(ohlc: OHLC[]): TrendBias {
  if (ohlc.length < 2) return 'neutral';
  const closes = ohlc.map(c => c.close);
  const first = closes[0];
  const last = closes[closes.length - 1];
  const pct = (last - first) / Math.max(Math.abs(first), 1);
  if (pct > 0.003) return 'bullish';
  if (pct < -0.003) return 'bearish';
  return 'neutral';
}

function computeStructuralCompression(ohlc: OHLC[]): number {
  if (ohlc.length < 3) return 0.5;
  const ranges = ohlc.map(c => c.high - c.low);
  const mean = ranges.reduce((sum, r) => sum + r, 0) / ranges.length;
  const variance = ranges.reduce((sum, r) => sum + (r - mean) ** 2, 0) / ranges.length;
  const std = Math.sqrt(variance);
  return Math.min(1, Math.max(0, 1 - std / Math.max(mean, 1e-6)));
}

function computeVolExpansion(ohlc: OHLC[]): number {
  if (ohlc.length < 5) return 0.5;
  const ranges = ohlc.slice(-5).map(c => c.high - c.low);
  const avg = ranges.reduce((sum, n) => sum + n, 0) / ranges.length;
  return Math.min(1, Math.max(0, avg / Math.max(ohlc[ohlc.length - 1].close * 0.002, 1e-6)));
}

function buildTimeframeIntel(ohlc: OHLC[], timeframe: Timeframe): TimeframePatternIntel {
  const last = ohlc[ohlc.length - 1];
  if (!last) {
    return {
      timeframe,
      timestamp: Date.now(),
      primary: null,
      secondary: null,
      allPatterns: [],
      structuralCompression: 0,
      volatilityExpansionProb: 0,
      regimeBias: 'compressing',
      trendBias: 'neutral'
    };
  }

  const bias = computeSlopeBias(ohlc);
  const slope = computeVWAPSeries(ohlc);
  const slopeChange = slope.length > 1 ? Math.abs(slope[slope.length - 1] - slope[0]) / Math.max(Math.abs(slope[0]), 1e-6) : 0;
  const confidence = Math.min(0.95, Math.max(0.2, slopeChange * 30));
  const instruction = bias === 'bullish' ? 'buy' : bias === 'bearish' ? 'sell' : 'wait';

  return {
    timeframe,
    timestamp: last.time ?? Date.now(),
    primary: {
      name: `${timeframe} slope bias`,
      type: bias === 'bullish' ? 'bullish' : bias === 'bearish' ? 'bearish' : 'neutral',
      category: 'structure',
      confidence,
      completeness: 0.8,
      bias: bias === 'bullish' ? 'up' : bias === 'bearish' ? 'down' : 'neutral',
      entry: last.close,
      takeProfit: bias === 'bullish' ? last.close * 1.0015 : bias === 'bearish' ? last.close * 0.9985 : last.close,
      stopLoss: bias === 'bullish' ? last.close * 0.9985 : bias === 'bearish' ? last.close * 1.0015 : last.close,
      rr: 0.3,
      description: `${timeframe} trend from real 5m history`,
      instruction,
      startIndex: 0,
      endIndex: ohlc.length - 1
    },
    secondary: null,
    allPatterns: [],
    structuralCompression: computeStructuralCompression(ohlc),
    volatilityExpansionProb: computeVolExpansion(ohlc),
    regimeBias: slopeChange > 0.004 ? 'trending' : 'compressing',
    trendBias: bias
  };
}

function buildMarketHealth(ohlc: OHLC[]): MarketHealthIndicators {
  const slope = computeVWAPSeries(ohlc);
  const vwapSlopeValue = slope.length > 5 ? (slope[slope.length - 1] - slope[slope.length - 5]) / Math.max(Math.abs(slope[slope.length - 5]), 1e-6) : 0;
  const rsi = meanRSI(ohlc, 14);
  return {
    healthScore: 50,
    healthGrade: 'C',
    rsi: { value: rsi },
    macd: { value: 0 },
    adx: { value: 20 },
    vwapSlope: { value: vwapSlopeValue },
    ivChange: { value: 0 },
    orderflow: { value: 0 },
    gamma: { value: 0 },
    breadth: { value: 0 }
  };
}

function meanRSI(ohlc: OHLC[], period: number): number {
  if (ohlc.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = ohlc.length - period; i < ohlc.length; i++) {
    const diff = ohlc[i].close - ohlc[i - 1].close;
    if (diff > 0) gains += diff;
    else losses += -diff;
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function actualDirection(currentClose: number, futureClose: number): Direction {
  const move = (futureClose - currentClose) / Math.max(Math.abs(currentClose), 1);
  if (move > DIRECTION_THRESHOLD) return 'bullish';
  if (move < -DIRECTION_THRESHOLD) return 'bearish';
  return 'neutral';
}

function directionFromBias(bias: string): Direction {
  if (bias === 'bullish' || bias === 'accumulation' || bias === 'bull' || bias === 'buy') return 'bullish';
  if (bias === 'bearish' || bias === 'distribution' || bias === 'bear' || bias === 'sell') return 'bearish';
  return 'neutral';
}

function evaluateDirection(engineName: string, predicted: Direction, actual: Direction, stats: Record<string, EngineStats>) {
  if (predicted === 'neutral') {
    stats[engineName].skipped += 1;
    return;
  }
  stats[engineName].tested += 1;
  if (predicted === actual) stats[engineName].correct += 1;
}

async function main() {
  const symbol = process.argv[2] || 'SPY';
  const dayWindow = Math.max(7, Number(process.argv[3] || '90'));
  console.log(`[Backtest] Fetching real 5m OHLC history for ${symbol}...`);

  const { data: candles, isLive, error } = await fetchLiveOHLC(symbol, '5m', 'FULL');
  if (!candles || candles.length < MIN_HISTORY_BARS + LOOKAHEAD_BARS) {
    throw new Error(`Insufficient 5m history for ${symbol}: ${error || 'not enough candles'}`);
  }

  const nowMs = Date.now();
  const minMs = nowMs - dayWindow * 24 * 60 * 60 * 1000;
  const filtered = candles.filter(c => {
    const tsMs = Number.isFinite(c.timeMs) ? Number(c.timeMs) : Number(c.time) * 1000;
    return Number.isFinite(tsMs) && tsMs >= minMs;
  });

  if (filtered.length < MIN_HISTORY_BARS + LOOKAHEAD_BARS) {
    throw new Error(`Insufficient 5m history within last ${dayWindow} days for ${symbol}. Available bars=${filtered.length}`);
  }

  console.log(`[Backtest] Retrieved ${candles.length} 5m candles, using ${filtered.length} bars from last ${dayWindow} days (isLive=${isLive})`);

  const stats: Record<string, EngineStats> = {
    HTFBias: { tested: 0, correct: 0, skipped: 0 },
    Intent: { tested: 0, correct: 0, skipped: 0 },
    Shadow: { tested: 0, correct: 0, skipped: 0 },
    InstitutionalSignature: { tested: 0, correct: 0, skipped: 0 }
  };

  const maxIndex = filtered.length - LOOKAHEAD_BARS - 1;
  let samples = 0;

  for (let i = MIN_HISTORY_BARS; i <= maxIndex; i += SAMPLE_STEP) {
    const lookback = filtered.slice(i - MIN_HISTORY_BARS, i + 1);
    if (lookback.length < MIN_HISTORY_BARS + 1) continue;

    const future = filtered[i + LOOKAHEAD_BARS];
    if (!future) continue;

    const marketHealth = buildMarketHealth(lookback);
    const ohlcByTF: Partial<Record<string, OHLC[]>> = {
      '1m': lookback,
      '5m': lookback,
      '15m': aggregateOhlc(lookback, 3),
      '4h': aggregateOhlc(lookback, 48),
      '1D': aggregateOhlc(lookback, 78)
    };

    const timeframes: TimeframePatternIntel[] = [
      buildTimeframeIntel(ohlcByTF['5m'] ?? [], '5m'),
      buildTimeframeIntel(ohlcByTF['15m'] ?? [], '15m'),
      buildTimeframeIntel(ohlcByTF['4h'] ?? [], '4h'),
      buildTimeframeIntel(ohlcByTF['1D'] ?? [], '1D')
    ];

    const htfBias = analyzeHTFBias(timeframes, marketHealth);
    const intent = analyzeIntent(ohlcByTF, marketHealth, timeframes);
    const shadow = analyzeShadow(ohlcByTF, marketHealth, timeframes);
    const institutionalSignature = analyzeInstitutionalSignature(ohlcByTF, marketHealth, timeframes);

    const actual = actualDirection(filtered[i].close, future.close);
    if (actual === 'neutral') continue;

    evaluateDirection('HTFBias', directionFromBias(htfBias.bias), actual, stats);
    evaluateDirection('Intent', directionFromBias(intent.intent), actual, stats);
    evaluateDirection('Shadow', directionFromBias(shadow.shadowBias), actual, stats);
    evaluateDirection('InstitutionalSignature', directionFromBias(institutionalSignature.likelyAction === 'accumulate' ? 'bullish' : institutionalSignature.likelyAction === 'distribute' ? 'bearish' : 'neutral'), actual, stats);

    samples += 1;
  }

  const results = Object.entries(stats).map(([engine, result]) => ({
    engine,
    tested: result.tested,
    correct: result.correct,
    skipped: result.skipped,
    accuracy: result.tested > 0 ? (result.correct / result.tested) * 100 : 0
  }));

  results.sort((a, b) => b.accuracy - a.accuracy);
  console.log(`\nReal 5m backtest on ${symbol} (${dayWindow}d): ${samples} sampled signals`);
  console.table(results);
}

main().catch(error => {
  console.error('Real 5m backtest failed:', error);
  process.exit(1);
});
