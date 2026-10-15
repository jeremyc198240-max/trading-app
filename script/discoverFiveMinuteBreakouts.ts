import fs from 'node:fs';
import path from 'node:path';
import { estimateZeroDtePremiumReturn } from '../server/historicalBacktest';
import { fetchLiveOHLC, type OHLC } from '../server/marketData';

type Direction = 'CALL' | 'PUT';
type RawTradingViewRow = Record<string, unknown>;

interface Features {
  relativeVolume: number;
  volumeAcceleration: number;
  pressureAligned: number;
  bodyRatio: number;
  closeLocation: number;
  rejectionWick: number;
  doji: number;
  compressionRatio: number;
  emaSpreadAligned: number;
  emaSlopeAligned: number;
  rsiAligned: number;
  vwapDistanceAligned: number;
  tvRsiAligned: number | null;
  tvAdx: number | null;
  tvRecommendationAligned: number | null;
  tvAgeMinutes: number | null;
}

interface BreakoutEvent {
  symbol: string;
  sessionDate: string;
  breakoutTimeMs: number;
  entryTimeMs: number;
  direction: Direction;
  level: number;
  entrySpot: number;
  exitSpot: number;
  atr: number;
  favorableAtr: number;
  adverseAtr: number;
  underlyingReturnPct: number;
  premiumReturnPct: number;
  structuralSuccess: boolean;
  premiumWin: boolean;
  features: Features;
  chartBars: OHLC[];
  breakoutOffset: number;
}

interface RuleDefinition {
  name: string;
  test: (features: Features) => boolean;
}

const ALL_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'GLD'];
const DEFAULT_SYMBOLS = ALL_SYMBOLS.slice(0, Math.ceil(ALL_SYMBOLS.length / 2));
const LOOKBACK_DAYS = Math.max(10, Math.min(59, Number(process.argv[2] ?? 30)));
const SYMBOLS = (process.argv[3] ?? DEFAULT_SYMBOLS.join(','))
  .split(',')
  .map((symbol) => symbol.trim().toUpperCase())
  .filter(Boolean);
const RANGE_BARS = 12;
const HOLD_BARS = 6;
const CHART_PRE_BARS = 18;
const TV_MAX_AGE_MS = 15 * 60 * 1000;
const logsDir = path.resolve(process.cwd(), 'logs');
const jsonPath = path.join(logsDir, '0dte_5m_breakout_discovery_half.json');
const htmlPath = path.join(logsDir, '0dte_5m_breakout_discovery_half.html');
const tvPath = path.join(logsDir, 'breakout_alert_history.json');
const FEATURE_KEYS: Array<keyof Features> = [
  'relativeVolume',
  'volumeAcceleration',
  'pressureAligned',
  'bodyRatio',
  'closeLocation',
  'rejectionWick',
  'doji',
  'compressionRatio',
  'emaSpreadAligned',
  'emaSlopeAligned',
  'rsiAligned',
  'vwapDistanceAligned',
  'tvRsiAligned',
  'tvAdx',
  'tvRecommendationAligned',
];

const RULES: RuleDefinition[] = [
  { name: 'relative_volume_1.20+', test: (f) => f.relativeVolume >= 1.2 },
  { name: 'volume_acceleration_1.20+', test: (f) => f.volumeAcceleration >= 1.2 },
  { name: 'aligned_pressure_0.20+', test: (f) => f.pressureAligned >= 0.2 },
  { name: 'directional_close_0.70+', test: (f) => f.closeLocation >= 0.7 },
  { name: 'rejection_wick_0.25+', test: (f) => f.rejectionWick >= 0.25 },
  { name: 'pre_break_doji', test: (f) => f.doji === 1 },
  { name: 'range_compression_below_0.80', test: (f) => f.compressionRatio <= 0.8 },
  { name: 'ema_9_21_aligned', test: (f) => f.emaSpreadAligned > 0 },
  { name: 'ema_slope_aligned', test: (f) => f.emaSlopeAligned > 0 },
  { name: 'rsi_aligned_55+', test: (f) => f.rsiAligned >= 55 },
  { name: 'vwap_aligned', test: (f) => f.vwapDistanceAligned > 0 },
  { name: 'volume_plus_pressure', test: (f) => f.relativeVolume >= 1.2 && f.pressureAligned >= 0.2 },
  { name: 'compression_then_volume', test: (f) => f.compressionRatio <= 0.8 && f.relativeVolume >= 1.2 },
  { name: 'ema_plus_volume', test: (f) => f.emaSpreadAligned > 0 && f.relativeVolume >= 1.2 },
  { name: 'doji_with_rejection', test: (f) => f.doji === 1 && f.rejectionWick >= 0.25 },
  { name: 'tv_adx_25+_direction_aligned', test: (f) => (f.tvAdx ?? -Infinity) >= 25 && (f.tvRecommendationAligned ?? -Infinity) >= 0.15 },
];

function number(value: unknown, fallback = Number.NaN): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mean(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function round(value: number, digits = 3): number {
  return Number(value.toFixed(digits));
}

function nyParts(timeMs: number): { date: string; minute: number; weekday: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timeMs));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    minute: number(part('hour'), 0) * 60 + number(part('minute'), 0),
    weekday: part('weekday'),
  };
}

function isZeroDteSession(symbol: string, timeMs: number): boolean {
  if (symbol === 'SPY' || symbol === 'QQQ') return true;
  return nyParts(timeMs).weekday === 'Fri';
}

function minutesToClose(timeMs: number): number {
  return Math.max(1, 16 * 60 - nyParts(timeMs).minute);
}

function nearestStrike(symbol: string, spot: number): number {
  const interval = symbol === 'SPY' || symbol === 'QQQ'
    ? 1
    : spot < 25 ? 0.5 : spot < 100 ? 1 : spot < 200 ? 2.5 : spot < 1000 ? 5 : 10;
  return Math.round(spot / interval) * interval;
}

function ema(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const multiplier = 2 / (period + 1);
  let value = mean(values.slice(0, Math.min(period, values.length)));
  for (let index = period; index < values.length; index += 1) {
    value = (values[index] - value) * multiplier + value;
  }
  return value;
}

function atr(bars: OHLC[]): number {
  if (bars.length < 2) return 0;
  const ranges = bars.slice(1).map((bar, index) => {
    const previousClose = bars[index].close;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose));
  });
  return mean(ranges);
}

function rsi(closes: number[], period = 14): number {
  const changes = closes.slice(-period - 1).slice(1).map((close, index) => close - closes.slice(-period - 1)[index]);
  if (changes.length === 0) return 50;
  const gain = mean(changes.map((change) => Math.max(0, change)));
  const loss = mean(changes.map((change) => Math.max(0, -change)));
  if (loss === 0) return gain > 0 ? 100 : 50;
  return 100 - 100 / (1 + gain / loss);
}

function loadTradingViewRows(): Map<string, RawTradingViewRow[]> {
  const bySymbol = new Map<string, RawTradingViewRow[]>();
  if (!fs.existsSync(tvPath)) return bySymbol;
  const rows = JSON.parse(fs.readFileSync(tvPath, 'utf8')) as RawTradingViewRow[];
  for (const row of rows) {
    const symbol = String(row.symbol ?? '').toUpperCase();
    const timeframe = String(row.timeframe ?? '').toLowerCase();
    const timestamp = number(row.timestamp);
    const warnings = Array.isArray(row.warnings) ? row.warnings.map(String).join(' ').toUpperCase() : '';
    if (!SYMBOLS.includes(symbol) || timeframe !== '5m' || !Number.isFinite(timestamp)) continue;
    if (/SIMULATED|DEGRADED|TV_DERIVED_NO_OHLC/.test(warnings)) continue;
    const symbolRows = bySymbol.get(symbol) ?? [];
    symbolRows.push(row);
    bySymbol.set(symbol, symbolRows);
  }
  for (const rowsForSymbol of bySymbol.values()) {
    rowsForSymbol.sort((left, right) => number(left.timestamp) - number(right.timestamp));
  }
  return bySymbol;
}

function priorTradingViewRow(rows: RawTradingViewRow[], timeMs: number): RawTradingViewRow | null {
  let low = 0;
  let high = rows.length - 1;
  let found: RawTradingViewRow | null = null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (number(rows[middle].timestamp) <= timeMs) {
      found = rows[middle];
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return found && timeMs - number(found.timestamp) <= TV_MAX_AGE_MS ? found : null;
}

function sessionBars(candles: OHLC[]): Map<string, OHLC[]> {
  const sessions = new Map<string, OHLC[]>();
  for (const candle of candles) {
    const timeMs = candle.timeMs ?? candle.time * 1000;
    const time = nyParts(timeMs);
    if (time.minute < 570 || time.minute >= 960 || candle.volume <= 0) continue;
    const bars = sessions.get(time.date) ?? [];
    bars.push(candle);
    sessions.set(time.date, bars);
  }
  for (const bars of sessions.values()) bars.sort((left, right) => left.time - right.time);
  return sessions;
}

function calculateFeatures(
  session: OHLC[],
  breakoutIndex: number,
  direction: Direction,
  tvRows: RawTradingViewRow[],
): Features {
  const prior = session.slice(Math.max(0, breakoutIndex - 24), breakoutIndex);
  const current = prior.at(-1)!;
  const sign = direction === 'CALL' ? 1 : -1;
  const ranges = prior.map((bar) => Math.max(0, bar.high - bar.low));
  const currentRange = Math.max(current.high - current.low, 1e-9);
  const baselineVolumes = prior.slice(-23, -3).map((bar) => bar.volume);
  const recentVolumes = prior.slice(-3).map((bar) => bar.volume);
  const previousVolumes = prior.slice(-6, -3).map((bar) => bar.volume);
  const closes = prior.map((bar) => bar.close);
  const previousCloses = closes.slice(0, -1);
  const ema9 = ema(closes, 9);
  const ema21 = ema(closes, 21);
  const previousEma9 = ema(previousCloses, 9);
  const pressure = prior.slice(-3).reduce((sum, bar) => {
    const range = Math.max(bar.high - bar.low, 1e-9);
    return sum + ((bar.close - bar.open) / range) * bar.volume;
  }, 0) / Math.max(1, recentVolumes.reduce((sum, value) => sum + value, 0));
  const sessionToCurrent = session.slice(0, breakoutIndex);
  const cumulativeVolume = sessionToCurrent.reduce((sum, bar) => sum + bar.volume, 0);
  const vwap = cumulativeVolume > 0
    ? sessionToCurrent.reduce((sum, bar) => sum + ((bar.high + bar.low + bar.close) / 3) * bar.volume, 0) / cumulativeVolume
    : current.close;
  const rawRsi = rsi(closes);
  const lowerWick = Math.max(0, Math.min(current.open, current.close) - current.low);
  const upperWick = Math.max(0, current.high - Math.max(current.open, current.close));
  const tv = priorTradingViewRow(tvRows, current.timeMs ?? current.time * 1000);
  const tvRsi = tv ? number(tv.tvRsi) : Number.NaN;
  const tvRecommendation = tv ? number(tv.tvRecommendAll) : Number.NaN;
  const tvTimestamp = tv ? number(tv.timestamp) : Number.NaN;
  return {
    relativeVolume: round(mean(recentVolumes) / Math.max(1, mean(baselineVolumes))),
    volumeAcceleration: round(mean(recentVolumes) / Math.max(1, mean(previousVolumes))),
    pressureAligned: round(pressure * sign),
    bodyRatio: round(Math.abs(current.close - current.open) / currentRange),
    closeLocation: round(direction === 'CALL' ? (current.close - current.low) / currentRange : (current.high - current.close) / currentRange),
    rejectionWick: round((direction === 'CALL' ? lowerWick : upperWick) / currentRange),
    doji: Math.abs(current.close - current.open) / currentRange <= 0.15 ? 1 : 0,
    compressionRatio: round(mean(ranges.slice(-4)) / Math.max(atr(prior.slice(-21)), 1e-9)),
    emaSpreadAligned: round(((ema9 - ema21) / Math.max(current.close, 1e-9)) * sign, 5),
    emaSlopeAligned: round(((ema9 - previousEma9) / Math.max(current.close, 1e-9)) * sign, 5),
    rsiAligned: round(direction === 'CALL' ? rawRsi : 100 - rawRsi, 1),
    vwapDistanceAligned: round(((current.close - vwap) / Math.max(current.close, 1e-9)) * sign, 5),
    tvRsiAligned: Number.isFinite(tvRsi) ? round(direction === 'CALL' ? tvRsi : 100 - tvRsi, 1) : null,
    tvAdx: tv && Number.isFinite(number(tv.tvAdx)) ? round(number(tv.tvAdx), 1) : null,
    tvRecommendationAligned: Number.isFinite(tvRecommendation) ? round(tvRecommendation * sign, 3) : null,
    tvAgeMinutes: Number.isFinite(tvTimestamp) ? round(((current.timeMs ?? current.time * 1000) - tvTimestamp) / 60_000, 1) : null,
  };
}

function annualizedVolatility(prior: OHLC[], currentAtr: number): number {
  const spot = prior.at(-1)?.close ?? 1;
  return Math.max(0.15, Math.min(1.2, currentAtr / Math.max(spot, 1e-9) * Math.sqrt(78 * 252)));
}

function analyzeSession(symbol: string, date: string, bars: OHLC[], tvRows: RawTradingViewRow[]): BreakoutEvent[] {
  const events: BreakoutEvent[] = [];
  for (let index = Math.max(25, RANGE_BARS + 1); index < bars.length - HOLD_BARS - 1; index += 1) {
    const breakout = bars[index];
    if (!isZeroDteSession(symbol, breakout.timeMs ?? breakout.time * 1000)) continue;
    const range = bars.slice(index - RANGE_BARS, index);
    const rangeHigh = Math.max(...range.map((bar) => bar.high));
    const rangeLow = Math.min(...range.map((bar) => bar.low));
    const previousClose = bars[index - 1].close;
    const direction: Direction | null = breakout.close > rangeHigh && previousClose <= rangeHigh
      ? 'CALL'
      : breakout.close < rangeLow && previousClose >= rangeLow ? 'PUT' : null;
    if (!direction) continue;

    const entry = bars[index + 1];
    const future = bars.slice(index + 1, index + HOLD_BARS + 1);
    if (future.length < HOLD_BARS) continue;
    const exit = future.at(-1)!;
    const prior = bars.slice(index - 20, index);
    const currentAtr = atr(prior);
    if (!(currentAtr > 0)) continue;
    const sign = direction === 'CALL' ? 1 : -1;
    const favorable = direction === 'CALL'
      ? Math.max(...future.map((bar) => bar.high)) - entry.open
      : entry.open - Math.min(...future.map((bar) => bar.low));
    const adverse = direction === 'CALL'
      ? entry.open - Math.min(...future.map((bar) => bar.low))
      : Math.max(...future.map((bar) => bar.high)) - entry.open;
    const entryTimeMs = entry.timeMs ?? entry.time * 1000;
    const exitTimeMs = exit.timeMs ?? exit.time * 1000;
    const premiumReturn = Math.max(-100, Math.min(300, estimateZeroDtePremiumReturn({
      entrySpot: entry.open,
      exitSpot: exit.close,
      strike: nearestStrike(symbol, entry.open),
      entryMinutesToExpiry: minutesToClose(entryTimeMs),
      exitMinutesToExpiry: minutesToClose(exitTimeMs),
      annualizedVolatility: annualizedVolatility(prior, currentAtr),
      direction,
    })));
    events.push({
      symbol,
      sessionDate: date,
      breakoutTimeMs: breakout.timeMs ?? breakout.time * 1000,
      entryTimeMs,
      direction,
      level: round(direction === 'CALL' ? rangeHigh : rangeLow, 4),
      entrySpot: round(entry.open, 4),
      exitSpot: round(exit.close, 4),
      atr: round(currentAtr, 4),
      favorableAtr: round(favorable / currentAtr),
      adverseAtr: round(Math.max(0, adverse) / currentAtr),
      underlyingReturnPct: round(((exit.close - entry.open) / entry.open) * 100 * sign),
      premiumReturnPct: round(premiumReturn, 2),
      structuralSuccess: favorable >= currentAtr * 0.75 && favorable > Math.max(0, adverse),
      premiumWin: premiumReturn > 0,
      features: calculateFeatures(bars, index, direction, tvRows),
      chartBars: bars.slice(Math.max(0, index - CHART_PRE_BARS), index + HOLD_BARS + 1),
      breakoutOffset: Math.min(CHART_PRE_BARS, index),
    });
    index += HOLD_BARS;
  }
  return events;
}

function metrics(events: BreakoutEvent[]) {
  const wins = events.filter((event) => event.premiumWin).length;
  const structuralWins = events.filter((event) => event.structuralSuccess).length;
  const grossWins = events.reduce((sum, event) => sum + Math.max(0, event.premiumReturnPct), 0);
  const grossLosses = Math.abs(events.reduce((sum, event) => sum + Math.min(0, event.premiumReturnPct), 0));
  return {
    events: events.length,
    premiumWins: wins,
    premiumWinRate: events.length ? round(wins / events.length * 100, 1) : 0,
    averagePremiumReturnPct: events.length ? round(mean(events.map((event) => event.premiumReturnPct)), 2) : 0,
    medianPremiumReturnPct: events.length ? round(median(events.map((event) => event.premiumReturnPct)), 2) : 0,
    premiumProfitFactor: grossLosses > 0 ? round(grossWins / grossLosses, 2) : grossWins > 0 ? 999 : 0,
    structuralSuccessRate: events.length ? round(structuralWins / events.length * 100, 1) : 0,
  };
}

function compareFeatures(events: BreakoutEvent[]) {
  return FEATURE_KEYS.map((feature) => {
    const available = events.filter((event) => event.features[feature] != null && Number.isFinite(event.features[feature]));
    const values = available.map((event) => Number(event.features[feature]));
    const premiumWins = available.filter((event) => event.premiumWin).map((event) => Number(event.features[feature]));
    const premiumLosses = available.filter((event) => !event.premiumWin).map((event) => Number(event.features[feature]));
    const structuralWins = available.filter((event) => event.structuralSuccess).map((event) => Number(event.features[feature]));
    const structuralLosses = available.filter((event) => !event.structuralSuccess).map((event) => Number(event.features[feature]));
    const average = mean(values);
    const deviation = Math.sqrt(mean(values.map((value) => (value - average) ** 2)));
    const winAverage = mean(premiumWins);
    const lossAverage = mean(premiumLosses);
    return {
      feature,
      coverage: available.length,
      premiumWinAverage: round(winAverage, 4),
      premiumLossAverage: round(lossAverage, 4),
      premiumSeparationStd: deviation > 0 ? round((winAverage - lossAverage) / deviation, 3) : 0,
      structuralWinAverage: round(mean(structuralWins), 4),
      structuralLossAverage: round(mean(structuralLosses), 4),
    };
  }).sort((left, right) => Math.abs(right.premiumSeparationStd) - Math.abs(left.premiumSeparationStd));
}

function summarizeRules(train: BreakoutEvent[], holdout: BreakoutEvent[]) {
  const baselineHoldout = metrics(holdout);
  return RULES.map((rule) => {
    const trainMatches = train.filter((event) => rule.test(event.features));
    const holdoutMatches = holdout.filter((event) => rule.test(event.features));
    const holdoutMetrics = metrics(holdoutMatches);
    return {
      rule: rule.name,
      train: metrics(trainMatches),
      holdout: holdoutMetrics,
      holdoutWinRateLiftPct: round(holdoutMetrics.premiumWinRate - baselineHoldout.premiumWinRate, 1),
    };
  }).sort((left, right) => {
    const leftQualified = left.holdout.events >= 8 ? 1 : 0;
    const rightQualified = right.holdout.events >= 8 ? 1 : 0;
    return rightQualified - leftQualified
      || right.holdout.averagePremiumReturnPct - left.holdout.averagePremiumReturnPct
      || right.holdout.events - left.holdout.events;
  });
}

function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]!);
}

function chartSvg(event: BreakoutEvent): string {
  const width = 620;
  const height = 190;
  const top = 12;
  const bottom = 28;
  const priceHeight = height - top - bottom;
  const minPrice = Math.min(...event.chartBars.map((bar) => bar.low));
  const maxPrice = Math.max(...event.chartBars.map((bar) => bar.high));
  const span = Math.max(maxPrice - minPrice, 1e-9);
  const xStep = width / Math.max(event.chartBars.length, 1);
  const y = (price: number) => top + ((maxPrice - price) / span) * priceHeight;
  const candles = event.chartBars.map((bar, index) => {
    const x = index * xStep + xStep / 2;
    const color = bar.close >= bar.open ? '#2dffaa' : '#ff487a';
    const bodyTop = y(Math.max(bar.open, bar.close));
    const bodyHeight = Math.max(1.5, Math.abs(y(bar.open) - y(bar.close)));
    return `<line x1="${round(x, 1)}" y1="${round(y(bar.high), 1)}" x2="${round(x, 1)}" y2="${round(y(bar.low), 1)}" stroke="${color}"/><rect x="${round(x - xStep * 0.27, 1)}" y="${round(bodyTop, 1)}" width="${round(xStep * 0.54, 1)}" height="${round(bodyHeight, 1)}" fill="${color}"/>`;
  }).join('');
  const breakoutX = event.breakoutOffset * xStep;
  const futureX = (event.breakoutOffset + 1) * xStep;
  return `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(event.symbol)} pre-breakout chart">
    <rect width="${width}" height="${height}" fill="#071117"/>
    <rect x="${round(futureX, 1)}" width="${round(width - futureX, 1)}" height="${height}" fill="#12212a" opacity="0.72"/>
    <line x1="0" y1="${round(y(event.level), 1)}" x2="${width}" y2="${round(y(event.level), 1)}" stroke="#f6c453" stroke-dasharray="5 4"/>
    <line x1="${round(breakoutX, 1)}" y1="0" x2="${round(breakoutX, 1)}" y2="${height}" stroke="#f6c453" stroke-width="2"/>
    ${candles}
    <text x="8" y="${height - 8}" fill="#82939d" font-size="11">PRE-BREAK DATA</text>
    <text x="${round(futureX + 8, 1)}" y="${height - 8}" fill="#82939d" font-size="11">30M OUTCOME</text>
  </svg>`;
}

function renderHtml(report: ReturnType<typeof buildReport>, events: BreakoutEvent[]): string {
  const ruleRows = report.indicatorRules.map((row) => `<tr><td>${escapeHtml(row.rule)}</td><td>${row.train.events}</td><td>${row.holdout.events}</td><td>${row.holdout.premiumWinRate}%</td><td class="${row.holdoutWinRateLiftPct >= 0 ? 'positive' : 'negative'}">${row.holdoutWinRateLiftPct >= 0 ? '+' : ''}${row.holdoutWinRateLiftPct}%</td><td>${row.holdout.averagePremiumReturnPct}%</td><td>${row.holdout.premiumProfitFactor}</td></tr>`).join('');
  const featureRows = report.holdoutFeatureComparison.map((row) => `<tr><td>${escapeHtml(row.feature)}</td><td>${row.coverage}</td><td>${row.premiumWinAverage}</td><td>${row.premiumLossAverage}</td><td class="${row.premiumSeparationStd >= 0 ? 'positive' : 'negative'}">${row.premiumSeparationStd}</td><td>${row.structuralWinAverage}</td><td>${row.structuralLossAverage}</td></tr>`).join('');
  const cards = events.map((event) => `<article class="event ${event.premiumWin ? 'win' : 'loss'}">
    <header><strong>${event.symbol} ${event.direction}</strong><span>${event.sessionDate} ${new Date(event.breakoutTimeMs).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })} ET</span><b>${event.premiumReturnPct >= 0 ? '+' : ''}${event.premiumReturnPct}% proxy</b></header>
    ${chartSvg(event)}
    <div class="features"><span>RVOL ${event.features.relativeVolume}x</span><span>VOL ACC ${event.features.volumeAcceleration}x</span><span>PRESS ${event.features.pressureAligned}</span><span>COMP ${event.features.compressionRatio}</span><span>RSI ${event.features.rsiAligned}</span><span>DOJI ${event.features.doji ? 'YES' : 'NO'}</span><span>TV ADX ${event.features.tvAdx ?? 'N/A'}</span><span>MFE ${event.favorableAtr} ATR</span></div>
  </article>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>5m 0DTE Breakout Discovery</title><style>
    :root{color-scheme:dark;font-family:"Segoe UI",sans-serif;background:#050a0e;color:#e7f0f2}body{margin:0;padding:28px;background:linear-gradient(135deg,#050a0e,#0b171c)}main{max-width:1480px;margin:auto}h1{font-size:28px;letter-spacing:.04em;margin:0 0 8px}.sub{color:#90a4ad;margin:0 0 24px}.summary{display:grid;grid-template-columns:repeat(5,1fr);border:1px solid #20343c;background:#081218}.metric{padding:16px;border-right:1px solid #20343c}.metric:last-child{border:0}.metric b{display:block;font-size:22px;color:#f6c453}.metric small{color:#90a4ad}section{margin-top:28px}table{width:100%;border-collapse:collapse;background:#081218}th,td{padding:10px;border-bottom:1px solid #1a2a31;text-align:right}th:first-child,td:first-child{text-align:left}.positive{color:#2dffaa}.negative{color:#ff487a}.events{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.event{border:1px solid #22353d;background:#081218;padding:12px}.event.win{border-left:3px solid #2dffaa}.event.loss{border-left:3px solid #ff487a}.event header{display:grid;grid-template-columns:1fr auto auto;gap:16px;align-items:center;margin-bottom:8px}.event header span{color:#90a4ad}.event header b{color:#f6c453}.event svg{display:block;width:100%;height:auto}.features{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}.features span{font:11px Consolas,monospace;padding:4px 6px;background:#102028;color:#b9c8ce}@media(max-width:900px){.events{grid-template-columns:1fr}.summary{grid-template-columns:1fr 1fr}.metric{border-bottom:1px solid #20343c}}
  </style></head><body><main><h1>5m 0DTE Breakout Discovery</h1><p class="sub">Yahoo 5-minute underlying candles; prior 5-minute TradingView snapshots where available. Entry is next-bar open after a closed structural break. Outcome is a fixed 30-minute ATM premium proxy, not historical option quotes.</p>
  <div class="summary"><div class="metric"><b>${report.baseline.events}</b><small>non-overlapping breaks</small></div><div class="metric"><b>${report.baseline.premiumWinRate}%</b><small>premium proxy wins</small></div><div class="metric"><b>${report.baseline.averagePremiumReturnPct}%</b><small>mean / ${report.baseline.medianPremiumReturnPct}% median</small></div><div class="metric"><b>${report.baseline.structuralSuccessRate}%</b><small>structural follow-through</small></div><div class="metric"><b>${report.coverage.tradingViewMatched}</b><small>TradingView matches</small></div></div>
  <section><h2>Chronological holdout indicator scan</h2><table><thead><tr><th>Pre-break rule</th><th>Train n</th><th>Holdout n</th><th>Holdout win</th><th>Lift</th><th>Mean return</th><th>PF</th></tr></thead><tbody>${ruleRows}</tbody></table></section>
  <section><h2>Holdout winner / loser feature separation</h2><table><thead><tr><th>Feature</th><th>Coverage</th><th>Premium wins</th><th>Premium losses</th><th>Std separation</th><th>Structure wins</th><th>Structure losses</th></tr></thead><tbody>${featureRows}</tbody></table></section>
  <section><h2>Every qualifying breakout</h2><div class="events">${cards}</div></section></main></body></html>`;
}

function buildReport(events: BreakoutEvent[], dataWarnings: string[]) {
  const dates = Array.from(new Set(events.map((event) => event.sessionDate))).sort();
  const splitIndex = Math.max(1, Math.min(dates.length - 1, Math.floor(dates.length * 0.7)));
  const holdoutStart = dates[splitIndex] ?? null;
  const train = holdoutStart ? events.filter((event) => event.sessionDate < holdoutStart) : events;
  const holdout = holdoutStart ? events.filter((event) => event.sessionDate >= holdoutStart) : [];
  return {
    generatedAt: new Date().toISOString(),
    methodology: {
      symbols: SYMBOLS,
      timeframe: '5m only',
      lookbackDays: LOOKBACK_DAYS,
      breakoutDefinition: `Close crosses the prior ${RANGE_BARS}-bar high/low; no volume or indicator is used to define the event.`,
      entry: 'Next 5-minute bar open after the breakout bar closes.',
      exit: `Close after ${HOLD_BARS} bars / 30 minutes.`,
      optionModel: 'Nearest listed strike, theoretical 0DTE premium with 3% half-spread; no historical option quote or fill data.',
      expiryEligibility: 'SPY/QQQ use weekday sessions; single stocks use Fridays only because 0DTE requires an expiration that day.',
      featureTiming: 'All discovery features end on the bar immediately before the breakout bar.',
      split: holdoutStart ? `Sessions before ${holdoutStart} are train; ${holdoutStart} and later are untouched chronological holdout.` : 'Insufficient sessions for holdout.',
      tradingViewJoin: 'Only real 5m snapshots timestamped at or before the feature bar and no older than 15 minutes.',
    },
    coverage: {
      sessions: dates.length,
      events: events.length,
      trainEvents: train.length,
      holdoutEvents: holdout.length,
      tradingViewMatched: events.filter((event) => event.features.tvAdx != null).length,
      warnings: dataWarnings,
    },
    baseline: metrics(events),
    trainBaseline: metrics(train),
    holdoutBaseline: metrics(holdout),
    bySymbol: SYMBOLS.map((symbol) => ({ symbol, ...metrics(events.filter((event) => event.symbol === symbol)) })),
    byDirection: (['CALL', 'PUT'] as const).map((direction) => ({ direction, ...metrics(events.filter((event) => event.direction === direction)) })),
    indicatorRules: summarizeRules(train, holdout),
    trainFeatureComparison: compareFeatures(train),
    holdoutFeatureComparison: compareFeatures(holdout),
    events: events.map(({ chartBars: _chartBars, ...event }) => event),
  };
}

async function fetchSymbol(symbol: string): Promise<{ candles: OHLC[]; warning: string | null }> {
  let lastError = '';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await fetchLiveOHLC(symbol, '5m', 'FULL', { lookbackDays: LOOKBACK_DAYS });
    if (result.isLive && result.data.length >= 100) return { candles: result.data, warning: result.error ?? null };
    lastError = result.error ?? `only ${result.data.length} candles returned`;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 62_000));
  }
  throw new Error(`${symbol}: real Yahoo-primary 5m data unavailable (${lastError})`);
}

async function main(): Promise<void> {
  fs.mkdirSync(logsDir, { recursive: true });
  const tvRows = loadTradingViewRows();
  const events: BreakoutEvent[] = [];
  const warnings: string[] = [];
  for (const symbol of SYMBOLS) {
    const result = await fetchSymbol(symbol);
    if (result.warning) warnings.push(`${symbol}: ${result.warning}`);
    const symbolEvents = Array.from(sessionBars(result.candles).entries())
      .flatMap(([date, bars]) => analyzeSession(symbol, date, bars, tvRows.get(symbol) ?? []));
    events.push(...symbolEvents);
    console.log(`[5M_DISCOVERY] ${symbol} candles=${result.candles.length} events=${symbolEvents.length} tv=${symbolEvents.filter((event) => event.features.tvAdx != null).length}`);
  }
  events.sort((left, right) => left.breakoutTimeMs - right.breakoutTimeMs);
  const report = buildReport(events, warnings);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(htmlPath, renderHtml(report, events), 'utf8');
  console.log(`[5M_DISCOVERY] baseline events=${report.baseline.events} win=${report.baseline.premiumWinRate}% mean=${report.baseline.averagePremiumReturnPct}% pf=${report.baseline.premiumProfitFactor}`);
  console.log(`[5M_DISCOVERY] holdout events=${report.holdoutBaseline.events} win=${report.holdoutBaseline.premiumWinRate}% mean=${report.holdoutBaseline.averagePremiumReturnPct}%`);
  console.log(`[5M_DISCOVERY] json=${jsonPath}`);
  console.log(`[5M_DISCOVERY] charts=${htmlPath}`);
}

main().catch((error) => {
  console.error('[5M_DISCOVERY] failed:', error);
  process.exitCode = 1;
});