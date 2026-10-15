import fs from 'node:fs';
import path from 'node:path';
import { estimateZeroDtePremiumReturn } from '../server/historicalBacktest';
import { fetchLiveOHLC, type OHLC } from '../server/marketData';

type Direction = 'CALL' | 'PUT';
type RawTradingViewRow = Record<string, unknown>;

interface FiveMinuteBar extends OHLC {
  minuteBars: OHLC[];
}

interface Features {
  ignitionVolumeRatio: number;
  ignitionAcceleration: number;
  ignitionPressure: number;
  ignitionConsistency: number;
  volumeTrend: number;
  preBreakCompression: number;
  preBreakRejection: number;
  preBreakDoji: number;
  breakoutVolumeRatio: number;
  breakoutBodyRatio: number;
  breakoutCloseLocation: number;
  breakoutExtensionAtr: number;
  tvAdx: number | null;
  tvRecommendationAligned: number | null;
  tvAgeMinutes: number | null;
}

interface Outcome {
  entryTimeMs: number;
  entrySpot: number;
  exitSpot: number;
  premiumReturnPct: number;
}

interface BreakoutEvent {
  symbol: string;
  sessionDate: string;
  breakoutTimeMs: number;
  direction: Direction;
  level: number;
  atr: number;
  features: Features;
  outcomes: Record<string, Outcome>;
  retestOutcomes: Record<string, Outcome> | null;
  retestDelayMinutes: number | null;
  chartBars: FiveMinuteBar[];
  breakoutOffset: number;
  ignitionBars: OHLC[];
}

interface RuleDefinition {
  name: string;
  entry: 'BREAKOUT' | 'RETEST';
  test: (event: BreakoutEvent) => boolean;
}

const ALL_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'GLD'];
const DEFAULT_SYMBOLS = ALL_SYMBOLS.slice(0, Math.ceil(ALL_SYMBOLS.length / 2));
const REQUESTED_DAYS = Math.max(2, Math.min(7, Number(process.argv[2] ?? 7)));
const SYMBOLS = (process.argv[3] ?? DEFAULT_SYMBOLS.join(','))
  .split(',')
  .map((symbol) => symbol.trim().toUpperCase())
  .filter(Boolean);
const HORIZONS = [10, 15, 20, 30] as const;
const RANGE_BARS = 12;
const CHART_PRE_BARS = 18;
const logsDir = path.resolve(process.cwd(), 'logs');
const jsonPath = path.join(logsDir, '0dte_1m_ignition_5m_breakout_half.json');
const htmlPath = path.join(logsDir, '0dte_1m_ignition_5m_breakout_half.html');
const tvPath = path.join(logsDir, 'breakout_alert_history.json');
const TV_MAX_AGE_MS = 15 * 60 * 1000;

const RULES: RuleDefinition[] = [
  { name: '1m_volume_1.15+', entry: 'BREAKOUT', test: (e) => e.features.ignitionVolumeRatio >= 1.15 },
  { name: '1m_acceleration_1.15+', entry: 'BREAKOUT', test: (e) => e.features.ignitionAcceleration >= 1.15 },
  { name: '1m_pressure_0.15+', entry: 'BREAKOUT', test: (e) => e.features.ignitionPressure >= 0.15 },
  { name: '1m_pressure_2_of_3', entry: 'BREAKOUT', test: (e) => e.features.ignitionConsistency >= 2 },
  { name: '1m_volume_trend_positive', entry: 'BREAKOUT', test: (e) => e.features.volumeTrend > 0 },
  { name: '1m_ignition_stack', entry: 'BREAKOUT', test: (e) => e.features.ignitionVolumeRatio >= 1.15 && e.features.ignitionAcceleration >= 1.1 && e.features.ignitionPressure >= 0.15 && e.features.ignitionConsistency >= 2 },
  { name: '5m_rejection_before_break', entry: 'BREAKOUT', test: (e) => e.features.preBreakRejection >= 0.25 },
  { name: '5m_doji_before_break', entry: 'BREAKOUT', test: (e) => e.features.preBreakDoji === 1 },
  { name: '5m_accepted_close', entry: 'BREAKOUT', test: (e) => e.features.breakoutBodyRatio >= 0.5 && e.features.breakoutCloseLocation >= 0.7 },
  { name: '5m_not_overextended', entry: 'BREAKOUT', test: (e) => e.features.breakoutExtensionAtr <= 0.6 },
  { name: 'ignition_plus_acceptance', entry: 'BREAKOUT', test: (e) => e.features.ignitionPressure >= 0.15 && e.features.ignitionConsistency >= 2 && e.features.breakoutBodyRatio >= 0.5 && e.features.breakoutCloseLocation >= 0.7 },
  { name: 'ignition_acceptance_not_extended', entry: 'BREAKOUT', test: (e) => e.features.ignitionPressure >= 0.15 && e.features.ignitionConsistency >= 2 && e.features.breakoutBodyRatio >= 0.5 && e.features.breakoutCloseLocation >= 0.7 && e.features.breakoutExtensionAtr <= 0.6 },
  { name: 'retest_held_within_3m', entry: 'RETEST', test: (e) => e.retestOutcomes != null },
  { name: 'ignition_then_retest_held', entry: 'RETEST', test: (e) => e.retestOutcomes != null && e.features.ignitionPressure >= 0.15 && e.features.ignitionConsistency >= 2 },
];

function number(value: unknown, fallback = Number.NaN): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function mean(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function round(value: number, digits = 3): number {
  return Number(value.toFixed(digits));
}

function timeMs(candle: OHLC): number {
  return candle.timeMs ?? candle.time * 1000;
}

function nyParts(value: number): { date: string; minute: number; weekday: string } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((entry) => entry.type === type)?.value ?? '';
  return {
    date: `${part('year')}-${part('month')}-${part('day')}`,
    minute: number(part('hour'), 0) * 60 + number(part('minute'), 0),
    weekday: part('weekday'),
  };
}

function isZeroDteSession(symbol: string, value: number): boolean {
  if (symbol === 'SPY' || symbol === 'QQQ') return true;
  return nyParts(value).weekday === 'Fri';
}

function minutesToClose(value: number): number {
  return Math.max(1, 16 * 60 - nyParts(value).minute);
}

function nearestStrike(symbol: string, spot: number): number {
  const interval = symbol === 'SPY' || symbol === 'QQQ'
    ? 1 : spot < 25 ? 0.5 : spot < 100 ? 1 : spot < 200 ? 2.5 : spot < 1000 ? 5 : 10;
  return Math.round(spot / interval) * interval;
}

function atr(bars: OHLC[]): number {
  if (bars.length < 2) return 0;
  return mean(bars.slice(1).map((bar, index) => Math.max(
    bar.high - bar.low,
    Math.abs(bar.high - bars[index].close),
    Math.abs(bar.low - bars[index].close),
  )));
}

function annualizedVolatility(prior: OHLC[], currentAtr: number): number {
  const spot = prior.at(-1)?.close ?? 1;
  return Math.max(0.15, Math.min(1.2, currentAtr / Math.max(spot, 1e-9) * Math.sqrt(78 * 252)));
}

function loadTradingViewRows(): Map<string, RawTradingViewRow[]> {
  const result = new Map<string, RawTradingViewRow[]>();
  if (!fs.existsSync(tvPath)) return result;
  const rows = JSON.parse(fs.readFileSync(tvPath, 'utf8')) as RawTradingViewRow[];
  for (const row of rows) {
    const symbol = String(row.symbol ?? '').toUpperCase();
    const timeframe = String(row.timeframe ?? '').toLowerCase();
    const timestamp = number(row.timestamp);
    const warnings = Array.isArray(row.warnings) ? row.warnings.map(String).join(' ').toUpperCase() : '';
    if (!SYMBOLS.includes(symbol) || timeframe !== '5m' || !Number.isFinite(timestamp)) continue;
    if (/SIMULATED|DEGRADED|TV_DERIVED_NO_OHLC/.test(warnings)) continue;
    const symbolRows = result.get(symbol) ?? [];
    symbolRows.push(row);
    result.set(symbol, symbolRows);
  }
  for (const rows of result.values()) rows.sort((left, right) => number(left.timestamp) - number(right.timestamp));
  return result;
}

function priorTradingViewRow(rows: RawTradingViewRow[], value: number): RawTradingViewRow | null {
  let low = 0;
  let high = rows.length - 1;
  let found: RawTradingViewRow | null = null;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (number(rows[middle].timestamp) <= value) {
      found = rows[middle];
      low = middle + 1;
    } else high = middle - 1;
  }
  return found && value - number(found.timestamp) <= TV_MAX_AGE_MS ? found : null;
}

function sessionMinutes(candles: OHLC[]): Map<string, OHLC[]> {
  const sessions = new Map<string, OHLC[]>();
  for (const candle of candles) {
    const parts = nyParts(timeMs(candle));
    if (parts.minute < 570 || parts.minute >= 960 || candle.volume <= 0) continue;
    const bars = sessions.get(parts.date) ?? [];
    bars.push(candle);
    sessions.set(parts.date, bars);
  }
  for (const bars of sessions.values()) bars.sort((left, right) => left.time - right.time);
  return sessions;
}

function aggregateFiveMinute(minutes: OHLC[]): FiveMinuteBar[] {
  const buckets = new Map<number, OHLC[]>();
  for (const candle of minutes) {
    const minute = nyParts(timeMs(candle)).minute;
    const bucket = Math.floor((minute - 570) / 5);
    const bars = buckets.get(bucket) ?? [];
    bars.push(candle);
    buckets.set(bucket, bars);
  }
  return [...buckets.entries()].sort(([left], [right]) => left - right).flatMap(([, bars]) => {
    if (bars.length < 4) return [];
    const sorted = [...bars].sort((left, right) => left.time - right.time);
    return [{
      open: sorted[0].open,
      high: Math.max(...sorted.map((bar) => bar.high)),
      low: Math.min(...sorted.map((bar) => bar.low)),
      close: sorted.at(-1)!.close,
      volume: sorted.reduce((sum, bar) => sum + bar.volume, 0),
      time: sorted[0].time,
      timeMs: timeMs(sorted[0]),
      minuteBars: sorted,
    }];
  });
}

function pressure(bar: OHLC, direction: Direction): number {
  const sign = direction === 'CALL' ? 1 : -1;
  return ((bar.close - bar.open) / Math.max(bar.high - bar.low, 1e-9)) * sign;
}

function calculateFeatures(
  fiveBars: FiveMinuteBar[],
  breakoutIndex: number,
  direction: Direction,
  tvRows: RawTradingViewRow[],
): Features {
  const breakout = fiveBars[breakoutIndex];
  const prior = fiveBars.slice(Math.max(0, breakoutIndex - 24), breakoutIndex);
  const previous = prior.at(-1)!;
  const ignition = prior.flatMap((bar) => bar.minuteBars).slice(-23);
  const latestThree = ignition.slice(-3);
  const previousThree = ignition.slice(-6, -3);
  const baseline = ignition.slice(0, -3);
  const signedPressure = latestThree.reduce((sum, bar) => sum + pressure(bar, direction) * bar.volume, 0)
    / Math.max(1, latestThree.reduce((sum, bar) => sum + bar.volume, 0));
  const recentVolumes = latestThree.map((bar) => bar.volume);
  const baselineVolumes = baseline.map((bar) => bar.volume);
  const fiveVolumeBaseline = prior.slice(-13, -1).map((bar) => bar.volume);
  const previousRange = Math.max(previous.high - previous.low, 1e-9);
  const breakoutRange = Math.max(breakout.high - breakout.low, 1e-9);
  const lowerWick = Math.max(0, Math.min(previous.open, previous.close) - previous.low);
  const upperWick = Math.max(0, previous.high - Math.max(previous.open, previous.close));
  const currentAtr = atr(prior.slice(-21));
  const tv = priorTradingViewRow(tvRows, timeMs(previous));
  const tvTimestamp = tv ? number(tv.timestamp) : Number.NaN;
  const tvRecommendation = tv ? number(tv.tvRecommendAll) : Number.NaN;
  const sign = direction === 'CALL' ? 1 : -1;
  const trendDenominator = Math.max(1, mean(baselineVolumes));
  return {
    ignitionVolumeRatio: round(mean(recentVolumes) / trendDenominator),
    ignitionAcceleration: round(mean(recentVolumes) / Math.max(1, mean(previousThree.map((bar) => bar.volume)))),
    ignitionPressure: round(signedPressure),
    ignitionConsistency: latestThree.filter((bar) => pressure(bar, direction) > 0).length,
    volumeTrend: round((recentVolumes.at(-1)! - recentVolumes[0]) / trendDenominator),
    preBreakCompression: round(mean(prior.slice(-4).map((bar) => bar.high - bar.low)) / Math.max(currentAtr, 1e-9)),
    preBreakRejection: round((direction === 'CALL' ? lowerWick : upperWick) / previousRange),
    preBreakDoji: Math.abs(previous.close - previous.open) / previousRange <= 0.15 ? 1 : 0,
    breakoutVolumeRatio: round(breakout.volume / Math.max(1, mean(fiveVolumeBaseline))),
    breakoutBodyRatio: round(Math.abs(breakout.close - breakout.open) / breakoutRange),
    breakoutCloseLocation: round(direction === 'CALL' ? (breakout.close - breakout.low) / breakoutRange : (breakout.high - breakout.close) / breakoutRange),
    breakoutExtensionAtr: round(Math.abs(breakout.close - (direction === 'CALL' ? Math.max(...prior.slice(-RANGE_BARS).map((bar) => bar.high)) : Math.min(...prior.slice(-RANGE_BARS).map((bar) => bar.low)))) / Math.max(currentAtr, 1e-9)),
    tvAdx: tv && Number.isFinite(number(tv.tvAdx)) ? round(number(tv.tvAdx), 1) : null,
    tvRecommendationAligned: Number.isFinite(tvRecommendation) ? round(tvRecommendation * sign, 3) : null,
    tvAgeMinutes: Number.isFinite(tvTimestamp) ? round((timeMs(previous) - tvTimestamp) / 60_000, 1) : null,
  };
}

function findMinuteIndex(minutes: OHLC[], targetMs: number): number {
  return minutes.findIndex((bar) => timeMs(bar) >= targetMs);
}

function buildOutcomes(
  symbol: string,
  direction: Direction,
  minutes: OHLC[],
  entryIndex: number,
  currentAtr: number,
  priorFive: OHLC[],
): Record<string, Outcome> | null {
  const entry = minutes[entryIndex];
  if (!entry) return null;
  const outcomes: Record<string, Outcome> = {};
  for (const horizon of HORIZONS) {
    const exit = minutes[entryIndex + horizon - 1];
    if (!exit || nyParts(timeMs(exit)).date !== nyParts(timeMs(entry)).date) return null;
    const premiumReturnPct = estimateZeroDtePremiumReturn({
      entrySpot: entry.open,
      exitSpot: exit.close,
      strike: nearestStrike(symbol, entry.open),
      entryMinutesToExpiry: minutesToClose(timeMs(entry)),
      exitMinutesToExpiry: minutesToClose(timeMs(exit)),
      annualizedVolatility: annualizedVolatility(priorFive, currentAtr),
      direction,
    });
    outcomes[String(horizon)] = {
      entryTimeMs: timeMs(entry), entrySpot: round(entry.open, 4), exitSpot: round(exit.close, 4),
      premiumReturnPct: round(Math.max(-100, Math.min(300, premiumReturnPct)), 2),
    };
  }
  return outcomes;
}

function findRetestEntry(minutes: OHLC[], baseEntryIndex: number, direction: Direction, level: number, currentAtr: number): number | null {
  const tolerance = Math.max(level * 0.00015, currentAtr * 0.04);
  for (let offset = 0; offset < 3; offset += 1) {
    const bar = minutes[baseEntryIndex + offset];
    if (!bar) break;
    const touched = direction === 'CALL' ? bar.low <= level + tolerance : bar.high >= level - tolerance;
    const held = direction === 'CALL' ? bar.close > level : bar.close < level;
    if (touched && held) return baseEntryIndex + offset + 1;
  }
  return null;
}

function analyzeSession(symbol: string, date: string, minutes: OHLC[], tvRows: RawTradingViewRow[]): BreakoutEvent[] {
  const events: BreakoutEvent[] = [];
  const fiveBars = aggregateFiveMinute(minutes);
  for (let index = Math.max(25, RANGE_BARS + 1); index < fiveBars.length - 7; index += 1) {
    const breakout = fiveBars[index];
    if (!isZeroDteSession(symbol, timeMs(breakout))) continue;
    const range = fiveBars.slice(index - RANGE_BARS, index);
    const rangeHigh = Math.max(...range.map((bar) => bar.high));
    const rangeLow = Math.min(...range.map((bar) => bar.low));
    const previousClose = fiveBars[index - 1].close;
    const direction: Direction | null = breakout.close > rangeHigh && previousClose <= rangeHigh
      ? 'CALL' : breakout.close < rangeLow && previousClose >= rangeLow ? 'PUT' : null;
    if (!direction) continue;
    const level = direction === 'CALL' ? rangeHigh : rangeLow;
    const entryTargetMs = timeMs(breakout) + 5 * 60_000;
    const entryIndex = findMinuteIndex(minutes, entryTargetMs);
    const priorFive = fiveBars.slice(index - 20, index);
    const currentAtr = atr(priorFive);
    if (entryIndex < 0 || !(currentAtr > 0)) continue;
    const outcomes = buildOutcomes(symbol, direction, minutes, entryIndex, currentAtr, priorFive);
    if (!outcomes) continue;
    const retestEntryIndex = findRetestEntry(minutes, entryIndex, direction, level, currentAtr);
    const retestOutcomes = retestEntryIndex == null ? null : buildOutcomes(symbol, direction, minutes, retestEntryIndex, currentAtr, priorFive);
    events.push({
      symbol, sessionDate: date, breakoutTimeMs: timeMs(breakout), direction,
      level: round(level, 4), atr: round(currentAtr, 4),
      features: calculateFeatures(fiveBars, index, direction, tvRows),
      outcomes,
      retestOutcomes,
      retestDelayMinutes: retestEntryIndex == null ? null : retestEntryIndex - entryIndex + 1,
      chartBars: fiveBars.slice(Math.max(0, index - CHART_PRE_BARS), index + 7),
      breakoutOffset: Math.min(CHART_PRE_BARS, index),
      ignitionBars: fiveBars.slice(Math.max(0, index - 4), index).flatMap((bar) => bar.minuteBars),
    });
    index += 2;
  }
  return events;
}

function metrics(events: BreakoutEvent[], horizon: number, entry: 'BREAKOUT' | 'RETEST' = 'BREAKOUT') {
  const values = events.flatMap((event) => {
    const outcome = entry === 'RETEST' ? event.retestOutcomes?.[String(horizon)] : event.outcomes[String(horizon)];
    return outcome ? [outcome.premiumReturnPct] : [];
  });
  const wins = values.filter((value) => value > 0).length;
  const grossWins = values.reduce((sum, value) => sum + Math.max(0, value), 0);
  const grossLosses = Math.abs(values.reduce((sum, value) => sum + Math.min(0, value), 0));
  return {
    events: values.length,
    premiumWins: wins,
    premiumWinRate: values.length ? round(wins / values.length * 100, 1) : 0,
    averagePremiumReturnPct: values.length ? round(mean(values), 2) : 0,
    medianPremiumReturnPct: values.length ? round(median(values), 2) : 0,
    premiumProfitFactor: grossLosses > 0 ? round(grossWins / grossLosses, 2) : grossWins > 0 ? 999 : 0,
  };
}

function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

function eventChart(event: BreakoutEvent): string {
  const width = 700;
  const priceHeight = 180;
  const volumeHeight = 76;
  const bars = event.chartBars;
  const minPrice = Math.min(...bars.map((bar) => bar.low));
  const maxPrice = Math.max(...bars.map((bar) => bar.high));
  const span = Math.max(maxPrice - minPrice, 1e-9);
  const xStep = width / bars.length;
  const y = (price: number) => 8 + ((maxPrice - price) / span) * (priceHeight - 20);
  const candles = bars.map((bar, index) => {
    const x = index * xStep + xStep / 2;
    const color = bar.close >= bar.open ? '#2dffaa' : '#ff487a';
    const top = y(Math.max(bar.open, bar.close));
    const body = Math.max(1.5, Math.abs(y(bar.open) - y(bar.close)));
    return `<line x1="${round(x, 1)}" y1="${round(y(bar.high), 1)}" x2="${round(x, 1)}" y2="${round(y(bar.low), 1)}" stroke="${color}"/><rect x="${round(x - xStep * 0.27, 1)}" y="${round(top, 1)}" width="${round(xStep * 0.54, 1)}" height="${round(body, 1)}" fill="${color}"/>`;
  }).join('');
  const maxVolume = Math.max(...event.ignitionBars.map((bar) => bar.volume), 1);
  const volumeWidth = width / Math.max(event.ignitionBars.length, 1);
  const volumes = event.ignitionBars.map((bar, index) => {
    const height = Math.max(1, (bar.volume / maxVolume) * (volumeHeight - 18));
    const aligned = pressure(bar, event.direction) > 0;
    return `<rect x="${round(index * volumeWidth + 1, 1)}" y="${round(priceHeight + volumeHeight - height, 1)}" width="${round(Math.max(1, volumeWidth - 2), 1)}" height="${round(height, 1)}" fill="${aligned ? '#2dffaa' : '#ff487a'}" opacity=".78"/>`;
  }).join('');
  const breakoutX = event.breakoutOffset * xStep;
  return `<svg viewBox="0 0 ${width} ${priceHeight + volumeHeight}" role="img" aria-label="${escapeHtml(event.symbol)} pre-breakout price and volume">
    <rect width="${width}" height="${priceHeight + volumeHeight}" fill="#061016"/>
    <line x1="0" y1="${round(y(event.level), 1)}" x2="${width}" y2="${round(y(event.level), 1)}" stroke="#f6c453" stroke-dasharray="5 4"/>
    <line x1="${round(breakoutX, 1)}" y1="0" x2="${round(breakoutX, 1)}" y2="${priceHeight}" stroke="#f6c453" stroke-width="2"/>
    ${candles}<line x1="0" y1="${priceHeight}" x2="${width}" y2="${priceHeight}" stroke="#20343c"/>${volumes}
    <text x="8" y="${priceHeight + 13}" fill="#82939d" font-size="10">1M PRE-BREAK VOLUME: GREEN ALIGNED / RED OPPOSING</text>
  </svg>`;
}

function buildReport(events: BreakoutEvent[], warnings: string[]) {
  const dates = [...new Set(events.map((event) => event.sessionDate))].sort();
  const splitIndex = Math.max(1, Math.min(dates.length - 1, Math.floor(dates.length * 0.7)));
  const holdoutStart = dates[splitIndex] ?? null;
  const train = holdoutStart ? events.filter((event) => event.sessionDate < holdoutStart) : events;
  const holdout = holdoutStart ? events.filter((event) => event.sessionDate >= holdoutStart) : [];
  const rules = RULES.map((rule) => {
    const trainMatches = train.filter(rule.test);
    const holdoutMatches = holdout.filter(rule.test);
    return {
      rule: rule.name,
      entry: rule.entry,
      train: Object.fromEntries(HORIZONS.map((horizon) => [horizon, metrics(trainMatches, horizon, rule.entry)])),
      holdout: Object.fromEntries(HORIZONS.map((horizon) => [horizon, metrics(holdoutMatches, horizon, rule.entry)])),
    };
  });
  return {
    generatedAt: new Date().toISOString(),
    methodology: {
      symbols: SYMBOLS, sourceTimeframe: 'Yahoo 1m only; exact 5m bars aggregated from the same minute timeline',
      requestedLookbackDays: REQUESTED_DAYS, breakoutDefinition: `Closed 5m candle crosses the previous ${RANGE_BARS}-bar high/low`,
      breakoutEntry: 'Next available 1m open after the 5m breakout closes',
      retestEntry: 'Next 1m open after a touch and close beyond the level within three minutes',
      exits: HORIZONS.map((value) => `${value} minutes from the applicable entry`),
      optionModel: 'Nearest listed strike theoretical 0DTE premium with 3% half-spread; no historical option quotes',
      featureTiming: '1m ignition and pre-break 5m features end before the breakout candle; acceptance uses the closed breakout candle',
      split: holdoutStart ? `Sessions before ${holdoutStart} train; ${holdoutStart} and later untouched chronological holdout` : 'Insufficient sessions for holdout',
      tradingViewJoin: 'Real stored 5m snapshot at or before the pre-break candle and no older than 15 minutes',
    },
    coverage: { sessions: dates.length, events: events.length, trainEvents: train.length, holdoutEvents: holdout.length, tradingViewMatched: events.filter((event) => event.features.tvAdx != null).length, warnings },
    baselineByHorizon: Object.fromEntries(HORIZONS.map((horizon) => [horizon, { train: metrics(train, horizon), holdout: metrics(holdout, horizon), all: metrics(events, horizon) }])),
    retestBaselineByHorizon: Object.fromEntries(HORIZONS.map((horizon) => [horizon, { train: metrics(train, horizon, 'RETEST'), holdout: metrics(holdout, horizon, 'RETEST'), all: metrics(events, horizon, 'RETEST') }])),
    bySymbol: SYMBOLS.map((symbol) => ({ symbol, horizons: Object.fromEntries(HORIZONS.map((horizon) => [horizon, metrics(events.filter((event) => event.symbol === symbol), horizon)])) })),
    byDirection: (['CALL', 'PUT'] as const).map((direction) => ({ direction, horizons: Object.fromEntries(HORIZONS.map((horizon) => [horizon, metrics(events.filter((event) => event.direction === direction), horizon)])) })),
    rules,
    events: events.map(({ chartBars: _chartBars, ignitionBars: _ignitionBars, ...event }) => event),
  };
}

function renderHtml(report: ReturnType<typeof buildReport>, events: BreakoutEvent[]): string {
  const horizonRows = HORIZONS.map((horizon) => {
    const row = report.baselineByHorizon[horizon];
    return `<tr><td>${horizon}m</td><td>${row.all.events}</td><td>${row.all.premiumWinRate}%</td><td>${row.all.averagePremiumReturnPct}%</td><td>${row.all.premiumProfitFactor}</td><td>${row.holdout.events}</td><td>${row.holdout.premiumWinRate}%</td><td>${row.holdout.averagePremiumReturnPct}%</td><td>${row.holdout.premiumProfitFactor}</td></tr>`;
  }).join('');
  const ruleRows = report.rules.flatMap((rule) => HORIZONS.map((horizon) => {
    const row = rule.holdout[horizon];
    return `<tr><td>${escapeHtml(rule.rule)}</td><td>${rule.entry}</td><td>${horizon}m</td><td>${row.events}</td><td>${row.premiumWinRate}%</td><td>${row.averagePremiumReturnPct}%</td><td>${row.premiumProfitFactor}</td></tr>`;
  })).join('');
  const cards = events.map((event) => `<article class="event"><header><strong>${event.symbol} ${event.direction}</strong><span>${event.sessionDate} ${new Date(event.breakoutTimeMs).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit' })} ET</span><b>${HORIZONS.map((h) => `${h}m ${event.outcomes[h].premiumReturnPct >= 0 ? '+' : ''}${event.outcomes[h].premiumReturnPct}%`).join(' | ')}</b></header>${eventChart(event)}<div class="features"><span>1M RVOL ${event.features.ignitionVolumeRatio}x</span><span>ACC ${event.features.ignitionAcceleration}x</span><span>PRESS ${event.features.ignitionPressure}</span><span>ALIGN ${event.features.ignitionConsistency}/3</span><span>5M BODY ${event.features.breakoutBodyRatio}</span><span>CLOSE ${event.features.breakoutCloseLocation}</span><span>EXT ${event.features.breakoutExtensionAtr} ATR</span><span>RETEST ${event.retestOutcomes ? `YES ${event.retestDelayMinutes}m` : 'NO'}</span><span>TV ADX ${event.features.tvAdx ?? 'N/A'}</span></div></article>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><title>1m Ignition / 5m 0DTE Breakouts</title><style>:root{color-scheme:dark;font-family:"Bahnschrift",sans-serif;background:#04090d;color:#e8f1f3}body{margin:0;padding:26px;background:linear-gradient(145deg,#04090d,#0a171c)}main{max-width:1500px;margin:auto}h1{margin:0 0 6px}.sub{color:#91a5ad}.summary{display:grid;grid-template-columns:repeat(4,1fr);border:1px solid #20343c;background:#081218}.metric{padding:15px;border-right:1px solid #20343c}.metric b{display:block;font-size:22px;color:#f6c453}.metric small{color:#91a5ad}section{margin-top:28px}table{width:100%;border-collapse:collapse;background:#081218}th,td{padding:9px;border-bottom:1px solid #1a2a31;text-align:right}th:first-child,td:first-child{text-align:left}.events{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.event{border:1px solid #22353d;background:#081218;padding:11px}.event header{display:grid;grid-template-columns:auto auto 1fr;gap:14px;align-items:center;margin-bottom:8px}.event header span{color:#91a5ad}.event header b{text-align:right;color:#f6c453;font:11px Consolas,monospace}.event svg{display:block;width:100%}.features{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.features span{font:11px Consolas,monospace;padding:4px 6px;background:#102028;color:#c2d0d5}@media(max-width:950px){.events{grid-template-columns:1fr}.summary{grid-template-columns:1fr 1fr}}</style></head><body><main><h1>1m Ignition / 5m Acceptance 0DTE Discovery</h1><p class="sub">True Yahoo 1-minute OHLCV aggregated into closed 5-minute structure. TradingView snapshots join only when timestamp-valid. Returns are theoretical ATM 0DTE proxies, not fills.</p><div class="summary"><div class="metric"><b>${report.coverage.events}</b><small>breakouts</small></div><div class="metric"><b>${report.coverage.sessions}</b><small>sessions</small></div><div class="metric"><b>${report.coverage.tradingViewMatched}</b><small>TradingView matches</small></div><div class="metric"><b>${report.coverage.holdoutEvents}</b><small>untouched holdout</small></div></div><section><h2>Exit Horizon Baseline</h2><table><thead><tr><th>Exit</th><th>All n</th><th>All win</th><th>All mean</th><th>All PF</th><th>Holdout n</th><th>Holdout win</th><th>Holdout mean</th><th>Holdout PF</th></tr></thead><tbody>${horizonRows}</tbody></table></section><section><h2>Chronological Holdout Rules</h2><table><thead><tr><th>Rule</th><th>Entry</th><th>Exit</th><th>n</th><th>Win</th><th>Mean</th><th>PF</th></tr></thead><tbody>${ruleRows}</tbody></table></section><section><h2>Every Breakout</h2><div class="events">${cards}</div></section></main></body></html>`;
}

async function fetchSymbol(symbol: string): Promise<{ candles: OHLC[]; warning: string | null }> {
  let lastError = '';
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await fetchLiveOHLC(symbol, '1m', 'FULL', { lookbackDays: REQUESTED_DAYS });
    if (result.data.length >= 100) return { candles: result.data, warning: result.error ?? null };
    lastError = result.error ?? `only ${result.data.length} candles returned`;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, 62_000));
  }
  throw new Error(`${symbol}: real 1m data unavailable (${lastError})`);
}

async function main(): Promise<void> {
  fs.mkdirSync(logsDir, { recursive: true });
  const tvRows = loadTradingViewRows();
  const events: BreakoutEvent[] = [];
  const warnings: string[] = [];
  for (const symbol of SYMBOLS) {
    const result = await fetchSymbol(symbol);
    if (result.warning) warnings.push(`${symbol}: ${result.warning}`);
    const symbolEvents = [...sessionMinutes(result.candles).entries()].flatMap(([date, minutes]) => analyzeSession(symbol, date, minutes, tvRows.get(symbol) ?? []));
    events.push(...symbolEvents);
    console.log(`[MICRO_DISCOVERY] ${symbol} minutes=${result.candles.length} events=${symbolEvents.length} tv=${symbolEvents.filter((event) => event.features.tvAdx != null).length}`);
  }
  events.sort((left, right) => left.breakoutTimeMs - right.breakoutTimeMs);
  const report = buildReport(events, warnings);
  fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(htmlPath, renderHtml(report, events), 'utf8');
  console.log(`[MICRO_DISCOVERY] events=${report.coverage.events} sessions=${report.coverage.sessions} holdout=${report.coverage.holdoutEvents} tv=${report.coverage.tradingViewMatched}`);
  for (const horizon of HORIZONS) {
    const result = report.baselineByHorizon[horizon].holdout;
    console.log(`[MICRO_DISCOVERY] holdout ${horizon}m n=${result.events} win=${result.premiumWinRate}% mean=${result.averagePremiumReturnPct}% pf=${result.premiumProfitFactor}`);
  }
  console.log(`[MICRO_DISCOVERY] json=${jsonPath}`);
  console.log(`[MICRO_DISCOVERY] charts=${htmlPath}`);
}

main().catch((error) => {
  console.error('[MICRO_DISCOVERY] failed:', error);
  process.exitCode = 1;
});