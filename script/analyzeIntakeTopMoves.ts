import fs from 'node:fs';
import path from 'node:path';
import { estimateZeroDtePremiumReturn } from '../server/historicalBacktest';
import { fetchLiveOHLC, type OHLC } from '../server/marketData';

type Direction = 'CALL' | 'PUT' | 'WAIT';
type RawRow = Record<string, any>;

interface IntakePoint {
  symbol: string;
  timeMs: number;
  direction: Direction;
  confidence: number;
  edgeScore: number;
  breakoutScore: number;
  signalType: string;
  triggers: string[];
  indicators: Record<string, number>;
}

interface MoveResult {
  symbol: string;
  sessionDate: string;
  rank: number;
  entryTimeMs: number;
  extremeTimeMs: number;
  direction: Exclude<Direction, 'WAIT'>;
  magnitudePct: number;
  intakeTimeMs: number | null;
  leadMinutes: number | null;
  predictedDirection: Direction;
  confidence: number;
  edgeScore: number;
  breakoutScore: number;
  signalType: string | null;
  directionCorrect: boolean;
  actionable: boolean;
  triggers: string[];
  indicators: Record<string, number>;
}

interface SymbolResult {
  symbol: string;
  sessions: number;
  moves: MoveResult[];
  trades: PremiumObservation[];
}

interface PremiumObservation {
  symbol: string;
  timeMs: number;
  direction: Exclude<Direction, 'WAIT'>;
  confidence: number;
  edgeScore: number;
  breakoutScore: number;
  signalType: string;
  returnPct: number;
  win: boolean;
  triggers: string[];
  indicators: Record<string, number>;
}

const ALL_SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'GLD'];
const lookbackDays = Math.max(5, Number(process.argv[2] ?? 30));
const requestedSymbols = (process.argv[3] ?? ALL_SYMBOLS.join(','))
  .split(',').map((symbol) => symbol.trim().toUpperCase()).filter(Boolean);
const topN = Math.max(1, Number(process.argv[4] ?? 3));
const horizonBars = Math.max(1, Number(process.argv[5] ?? 6));
const minConfidence = Math.max(0, Number(process.argv[6] ?? 55));
const logsDir = path.resolve(process.cwd(), 'logs');
const outputPath = path.join(logsDir, `intake_top_moves_${lookbackDays}d.json`);

function number(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function nyDate(timeMs: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(timeMs));
}

function nyMinute(timeMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(timeMs));
  return number(parts.find((part) => part.type === 'hour')?.value) * 60
    + number(parts.find((part) => part.type === 'minute')?.value);
}

function readIntakeRows(): RawRow[] {
  if (!fs.existsSync(logsDir)) return [];
  return fs.readdirSync(logsDir)
    .filter((fileName) => /^engine_intake_10m_.*\.jsonl$/i.test(fileName))
    .flatMap((fileName) => fs.readFileSync(path.join(logsDir, fileName), 'utf8').split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const row = JSON.parse(line) as RawRow;
          return row.isMarketOpen === true ? [row] : [];
        } catch {
          return [];
        }
      }));
}

function signalDirection(value: unknown): Direction {
  const direction = String(value ?? '').toLowerCase();
  if (direction === 'bullish' || direction === 'call') return 'CALL';
  if (direction === 'bearish' || direction === 'put') return 'PUT';
  return 'WAIT';
}

function buildIntakePoints(rows: RawRow[]): IntakePoint[] {
  const points: IntakePoint[] = [];
  for (const row of rows) {
    const timeMs = number(row.unixMs, Date.parse(String(row.timestamp ?? '')));
    const bySymbol = new Map<string, RawRow[]>();
    for (const signal of Array.isArray(row.signals) ? row.signals : []) {
      const symbol = String(signal.symbol ?? '').toUpperCase();
      if (!symbol || String(signal.timeframe ?? '') !== '5m') continue;
      const signals = bySymbol.get(symbol) ?? [];
      signals.push(signal);
      bySymbol.set(symbol, signals);
    }
    for (const [symbol, signals] of bySymbol.entries()) {
      const best = [...signals].sort((left, right) => {
        const leftDirectional = signalDirection(left.direction) === 'WAIT' ? 0 : 25;
        const rightDirectional = signalDirection(right.direction) === 'WAIT' ? 0 : 25;
        return rightDirectional + number(right.edgeScore) + number(right.confidence)
          - (leftDirectional + number(left.edgeScore) + number(left.confidence));
      })[0];
      const indicators = Object.fromEntries(Object.entries(best.indicators ?? {})
        .map(([key, value]) => [key, number(value, NaN)])
        .filter(([, value]) => Number.isFinite(value)));
      points.push({
        symbol,
        timeMs,
        direction: signalDirection(best.direction),
        confidence: number(best.confidence),
        edgeScore: number(best.edgeScore),
        breakoutScore: number(best.breakoutScore),
        signalType: String(best.signalType ?? 'UNKNOWN'),
        triggers: Array.isArray(best.triggers) ? best.triggers.map(String) : [],
        indicators,
      });
    }
  }
  return points.sort((left, right) => left.timeMs - right.timeMs);
}

async function loadCandles(symbol: string): Promise<OHLC[]> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const response = await fetchLiveOHLC(symbol, '5m', 'FULL', { lookbackDays });
    if (response.data.length >= 100) return response.data;
    if (attempt < 3 && String(response.error ?? '').toLowerCase().includes('cooldown')) {
      console.log(`[TOP_MOVES] ${symbol} provider cooldown; retrying in 62s`);
      await delay(62_000);
      continue;
    }
    throw new Error(`${symbol}: insufficient candles (${response.data.length}): ${response.error ?? 'unknown error'}`);
  }
  return [];
}

function sessionBars(candles: OHLC[]): Map<string, OHLC[]> {
  const sessions = new Map<string, OHLC[]>();
  for (const candle of candles) {
    const timeMs = candle.timeMs ?? candle.time * 1000;
    const minute = nyMinute(timeMs);
    if (minute < 570 || minute >= 960 || candle.volume <= 0) continue;
    const date = nyDate(timeMs);
    const bars = sessions.get(date) ?? [];
    bars.push(candle);
    sessions.set(date, bars);
  }
  for (const bars of sessions.values()) bars.sort((left, right) => left.time - right.time);
  return sessions;
}

function topMoves(symbol: string, date: string, bars: OHLC[]): Array<Omit<MoveResult, 'rank' | 'intakeTimeMs' | 'leadMinutes' | 'predictedDirection' | 'confidence' | 'edgeScore' | 'breakoutScore' | 'signalType' | 'directionCorrect' | 'actionable' | 'triggers' | 'indicators'>> {
  const candidates = bars.slice(0, -1).map((entry, index) => {
    const forward = bars.slice(index + 1, Math.min(bars.length, index + horizonBars + 1));
    const high = forward.reduce((best, bar) => bar.high > best.high ? bar : best, forward[0]);
    const low = forward.reduce((best, bar) => bar.low < best.low ? bar : best, forward[0]);
    const upPct = (high.high - entry.close) / entry.close * 100;
    const downPct = (entry.close - low.low) / entry.close * 100;
    const call = upPct >= downPct;
    return {
      symbol,
      sessionDate: date,
      entryTimeMs: entry.timeMs ?? entry.time * 1000,
      extremeTimeMs: (call ? high.timeMs : low.timeMs) ?? (call ? high.time : low.time) * 1000,
      direction: (call ? 'CALL' : 'PUT') as Exclude<Direction, 'WAIT'>,
      magnitudePct: Number(Math.max(upPct, downPct).toFixed(3)),
    };
  });
  const selected: typeof candidates = [];
  const separationMs = horizonBars * 5 * 60 * 1000;
  for (const candidate of candidates.sort((left, right) => right.magnitudePct - left.magnitudePct)) {
    if (selected.some((move) => Math.abs(move.entryTimeMs - candidate.entryTimeMs) < separationMs)) continue;
    selected.push(candidate);
    if (selected.length >= topN) break;
  }
  return selected;
}

function nearestStrike(symbol: string, spot: number): number {
  const interval = ['SPY', 'QQQ', 'IWM', 'DIA'].includes(symbol)
    ? 1
    : spot < 25 ? 0.5 : spot < 100 ? 1 : spot < 200 ? 2.5 : spot < 1000 ? 5 : 10;
  return Math.round(spot / interval) * interval;
}

function minutesToClose(timeMs: number): number {
  return Math.max(1, 960 - nyMinute(timeMs));
}

function annualizedVolatility(bars: OHLC[], entryIndex: number): number {
  const window = bars.slice(Math.max(0, entryIndex - 20), entryIndex + 1);
  if (window.length < 2) return 0.3;
  let trueRangeSum = 0;
  for (let index = 1; index < window.length; index += 1) {
    const bar = window[index];
    const previousClose = window[index - 1].close;
    trueRangeSum += Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose));
  }
  const atrPct = trueRangeSum / (window.length - 1) / Math.max(window.at(-1)?.close ?? 1, 1e-6);
  return Math.max(0.15, Math.min(1.2, atrPct * Math.sqrt(78 * 252)));
}

function evaluatePremiumSignals(symbol: string, candles: OHLC[], points: IntakePoint[]): PremiumObservation[] {
  const bars = Array.from(sessionBars(candles).values()).flat().sort((left, right) => left.time - right.time);
  const observations: PremiumObservation[] = [];
  for (const point of points.filter((entry) => entry.symbol === symbol && entry.direction !== 'WAIT' && entry.confidence >= minConfidence)) {
    const entryIndex = bars.findIndex((bar) => (bar.timeMs ?? bar.time * 1000) >= point.timeMs);
    const exitIndex = entryIndex + horizonBars;
    if (entryIndex < 20 || exitIndex >= bars.length) continue;
    const entry = bars[entryIndex];
    const exit = bars[exitIndex];
    const entryTimeMs = entry.timeMs ?? entry.time * 1000;
    const exitTimeMs = exit.timeMs ?? exit.time * 1000;
    if (nyDate(entryTimeMs) !== nyDate(exitTimeMs)) continue;
    const direction = point.direction as Exclude<Direction, 'WAIT'>;
    const returnPct = estimateZeroDtePremiumReturn({
      entrySpot: entry.close,
      exitSpot: exit.close,
      strike: nearestStrike(symbol, entry.close),
      entryMinutesToExpiry: minutesToClose(entryTimeMs),
      exitMinutesToExpiry: minutesToClose(exitTimeMs),
      annualizedVolatility: annualizedVolatility(bars, entryIndex),
      direction,
    });
    observations.push({
      symbol,
      timeMs: point.timeMs,
      direction,
      confidence: point.confidence,
      edgeScore: point.edgeScore,
      breakoutScore: point.breakoutScore,
      signalType: point.signalType,
      returnPct: Number(returnPct.toFixed(2)),
      win: returnPct > 0,
      triggers: point.triggers,
      indicators: point.indicators,
    });
  }
  return observations;
}

function analyzeSymbol(symbol: string, candles: OHLC[], allPoints: IntakePoint[]): SymbolResult {
  const points = allPoints.filter((point) => point.symbol === symbol);
  const pointDates = new Set(points.map((point) => nyDate(point.timeMs)));
  const moves: MoveResult[] = [];
  let sessions = 0;
  for (const [date, bars] of sessionBars(candles).entries()) {
    if (!pointDates.has(date)) continue;
    sessions += 1;
    topMoves(symbol, date, bars).forEach((move, index) => {
      const prior = points.filter((point) => point.timeMs < move.entryTimeMs && move.entryTimeMs - point.timeMs <= 20 * 60 * 1000).at(-1) ?? null;
      const directionCorrect = Boolean(prior && prior.direction === move.direction);
      moves.push({
        ...move,
        rank: index + 1,
        intakeTimeMs: prior?.timeMs ?? null,
        leadMinutes: prior ? Number(((move.entryTimeMs - prior.timeMs) / 60000).toFixed(1)) : null,
        predictedDirection: prior?.direction ?? 'WAIT',
        confidence: prior?.confidence ?? 0,
        edgeScore: prior?.edgeScore ?? 0,
        breakoutScore: prior?.breakoutScore ?? 0,
        signalType: prior?.signalType ?? null,
        directionCorrect,
        actionable: directionCorrect && (prior?.confidence ?? 0) >= minConfidence,
        triggers: prior?.triggers ?? [],
        indicators: prior?.indicators ?? {},
      });
    });
  }
  return { symbol, sessions, moves, trades: evaluatePremiumSignals(symbol, candles, points) };
}

function average(values: number[]): number | null {
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3)) : null;
}

function normalizedTrigger(trigger: string): string {
  return trigger
    .replace(/-?\d+(?:\.\d+)?%?/g, '#')
    .replace(/\s+/g, ' ')
    .trim();
}

function nonOverlappingTrades(trades: PremiumObservation[]): PremiumObservation[] {
  const selected: PremiumObservation[] = [];
  const nextEntryBySymbol = new Map<string, number>();
  for (const trade of [...trades].sort((left, right) => left.timeMs - right.timeMs)) {
    if (trade.timeMs < (nextEntryBySymbol.get(trade.symbol) ?? 0)) continue;
    selected.push(trade);
    nextEntryBySymbol.set(trade.symbol, trade.timeMs + horizonBars * 5 * 60 * 1000);
  }
  return selected;
}

function premiumMetrics(trades: PremiumObservation[]) {
  const wins = trades.filter((trade) => trade.win).length;
  return {
    signals: trades.length,
    wins,
    winRate: trades.length ? Number((wins / trades.length * 100).toFixed(1)) : 0,
    expectancyPct: average(trades.map((trade) => trade.returnPct)),
  };
}

function hasTrigger(trade: PremiumObservation, expected: string): boolean {
  return trade.triggers.map(normalizedTrigger).includes(expected);
}

function evaluateCandidatePolicies(trades: PremiumObservation[]) {
  const candidates: Array<{ name: string; matches: (trade: PremiumObservation) => boolean }> = [
    { name: 'baseline', matches: () => true },
    { name: 'range_compression', matches: (trade) => hasTrigger(trade, 'setup: PRE_RANGE_COMPRESSION') },
    { name: 'compression_ready', matches: (trade) => hasTrigger(trade, 'Compression phase READY with spark #.') },
    { name: 'high_close_location', matches: (trade) => hasTrigger(trade, 'setup: PRE_HIGH_CLOSE_LOCATION') },
    { name: 'tv_pressure_conflict', matches: (trade) => hasTrigger(trade, 'setup: TV_PRESSURE_CONFLICT') },
    { name: 'bearish_compression_alignment', matches: (trade) => trade.direction === 'PUT' && hasTrigger(trade, '#m compression leg aligned bearish (SQUEEZE #).') },
    { name: 'range_plus_ready', matches: (trade) => hasTrigger(trade, 'setup: PRE_RANGE_COMPRESSION') && hasTrigger(trade, 'Compression phase READY with spark #.') },
    { name: 'direction_match_high_close', matches: (trade) => hasTrigger(trade, 'setup: TV_DIRECTION_MATCH') && hasTrigger(trade, 'setup: PRE_HIGH_CLOSE_LOCATION') },
    { name: 'range_or_high_close', matches: (trade) => hasTrigger(trade, 'setup: PRE_RANGE_COMPRESSION') || hasTrigger(trade, 'setup: PRE_HIGH_CLOSE_LOCATION') },
    { name: 'range_and_high_close', matches: (trade) => hasTrigger(trade, 'setup: PRE_RANGE_COMPRESSION') && hasTrigger(trade, 'setup: PRE_HIGH_CLOSE_LOCATION') },
    { name: 'tv_conflict_with_structure', matches: (trade) => hasTrigger(trade, 'setup: TV_PRESSURE_CONFLICT') && (hasTrigger(trade, 'setup: PRE_RANGE_COMPRESSION') || hasTrigger(trade, 'setup: PRE_HIGH_CLOSE_LOCATION')) },
    { name: 'range_without_direction_conflict', matches: (trade) => hasTrigger(trade, 'setup: PRE_RANGE_COMPRESSION') && !hasTrigger(trade, 'setup: TV_DIRECTION_CONFLICT') },
  ];
  const dates = Array.from(new Set(trades.map((trade) => nyDate(trade.timeMs)))).sort();
  const splitIndex = Math.max(1, Math.min(dates.length - 1, Math.floor(dates.length * 0.7)));
  const holdoutStart = dates[splitIndex] ?? null;
  return {
    split: holdoutStart ? `sessions before ${holdoutStart} train; ${holdoutStart} and later holdout` : 'insufficient sessions',
    policies: candidates.map((candidate) => {
      const matched = trades.filter(candidate.matches);
      const train = holdoutStart ? matched.filter((trade) => nyDate(trade.timeMs) < holdoutStart) : matched;
      const holdout = holdoutStart ? matched.filter((trade) => nyDate(trade.timeMs) >= holdoutStart) : [];
      return { name: candidate.name, train: premiumMetrics(train), holdout: premiumMetrics(holdout) };
    }),
  };
}

function buildReport(results: SymbolResult[], intakeRows: number) {
  const moves = results.flatMap((result) => result.moves);
  const rawTrades = results.flatMap((result) => result.trades ?? []);
  const trades = nonOverlappingTrades(rawTrades);
  const matched = moves.filter((move) => move.intakeTimeMs != null);
  const actionable = matched.filter((move) => move.actionable);
  const missed = matched.filter((move) => !move.actionable);
  const indicatorNames = Array.from(new Set(matched.flatMap((move) => Object.keys(move.indicators)))).sort();
  const triggerMap = new Map<string, { sample: number; actionable: number }>();
  for (const move of matched) {
    for (const trigger of new Set(move.triggers.map(normalizedTrigger))) {
      const current = triggerMap.get(trigger) ?? { sample: 0, actionable: 0 };
      current.sample += 1;
      if (move.actionable) current.actionable += 1;
      triggerMap.set(trigger, current);
    }
  }
  const premiumTriggerMap = new Map<string, { sample: number; wins: number; totalReturn: number }>();
  for (const trade of trades) {
    for (const trigger of new Set(trade.triggers.map(normalizedTrigger))) {
      const current = premiumTriggerMap.get(trigger) ?? { sample: 0, wins: 0, totalReturn: 0 };
      current.sample += 1;
      if (trade.win) current.wins += 1;
      current.totalReturn += trade.returnPct;
      premiumTriggerMap.set(trigger, current);
    }
  }
  const premiumWins = trades.filter((trade) => trade.win).length;
  return {
    generatedAt: new Date().toISOString(),
    methodology: {
      topMovesPerSession: topN,
      horizonMinutes: horizonBars * 5,
      minConfidence,
      lookaheadControl: 'Only market-hours intake rows timestamped before the move entry are used.',
      caveat: 'Labels identify underlying expansion opportunities; contract profitability must be validated with historical quotes or the 0DTE proxy.',
    },
    coverage: { intakeRows, symbols: results.length, sessions: results.reduce((sum, result) => sum + result.sessions, 0), moves: moves.length, matchedMoves: matched.length },
    performance: {
      directionCorrect: matched.filter((move) => move.directionCorrect).length,
      directionAccuracyPct: matched.length ? Number((matched.filter((move) => move.directionCorrect).length / matched.length * 100).toFixed(1)) : 0,
      actionable: actionable.length,
      actionableRecallPct: matched.length ? Number((actionable.length / matched.length * 100).toFixed(1)) : 0,
      wait: matched.filter((move) => move.predictedDirection === 'WAIT').length,
      wrongDirection: matched.filter((move) => move.predictedDirection !== 'WAIT' && !move.directionCorrect).length,
    },
    premiumProxy: {
      rawSignals: rawTrades.length,
      signals: trades.length,
      wins: premiumWins,
      winRate: trades.length ? Number((premiumWins / trades.length * 100).toFixed(1)) : 0,
      expectancyPct: average(trades.map((trade) => trade.returnPct)),
      bySymbol: results.map((result) => {
        const symbolTrades = trades.filter((trade) => trade.symbol === result.symbol);
        const wins = symbolTrades.filter((trade) => trade.win).length;
        return {
          symbol: result.symbol,
          signals: symbolTrades.length,
          wins,
          winRate: symbolTrades.length ? Number((wins / symbolTrades.length * 100).toFixed(1)) : 0,
          expectancyPct: average(symbolTrades.map((trade) => trade.returnPct)),
        };
      }),
      triggerPerformance: Array.from(premiumTriggerMap.entries()).map(([trigger, stat]) => ({
        trigger,
        sample: stat.sample,
        wins: stat.wins,
        winRate: Number((stat.wins / stat.sample * 100).toFixed(1)),
        expectancyPct: Number((stat.totalReturn / stat.sample).toFixed(2)),
      })).filter((row) => row.sample >= 10).sort((left, right) => right.expectancyPct - left.expectancyPct || right.sample - left.sample),
      candidatePolicies: evaluateCandidatePolicies(trades),
    },
    indicatorComparison: Object.fromEntries(indicatorNames.map((indicator) => [indicator, {
      actionableAverage: average(actionable.map((move) => move.indicators[indicator]).filter(Number.isFinite)),
      missedAverage: average(missed.map((move) => move.indicators[indicator]).filter(Number.isFinite)),
    }])),
    triggerPerformance: Array.from(triggerMap.entries()).map(([trigger, stat]) => ({
      trigger,
      sample: stat.sample,
      actionable: stat.actionable,
      actionableRecallPct: Number((stat.actionable / stat.sample * 100).toFixed(1)),
    })).filter((row) => row.sample >= 3).sort((left, right) => right.actionableRecallPct - left.actionableRecallPct || right.sample - left.sample),
    bySymbol: results.map((result) => {
      const symbolMatched = result.moves.filter((move) => move.intakeTimeMs != null);
      const symbolActionable = symbolMatched.filter((move) => move.actionable);
      return {
        symbol: result.symbol,
        sessions: result.sessions,
        moves: result.moves.length,
        matchedMoves: symbolMatched.length,
        actionable: symbolActionable.length,
        actionableRecallPct: symbolMatched.length ? Number((symbolActionable.length / symbolMatched.length * 100).toFixed(1)) : 0,
        averageMovePct: average(symbolMatched.map((move) => move.magnitudePct)),
      };
    }),
    results,
  };
}

async function main(): Promise<void> {
  const intakeRows = readIntakeRows();
  const points = buildIntakePoints(intakeRows);
  const existing: SymbolResult[] = (() => {
    if (!fs.existsSync(outputPath)) return [];
    try {
      const report = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as { results?: SymbolResult[] };
      return Array.isArray(report.results) ? report.results.filter((row) => !requestedSymbols.includes(row.symbol)) : [];
    } catch {
      return [];
    }
  })();
  const results = [...existing];

  for (const symbol of requestedSymbols) {
    const candles = await loadCandles(symbol);
    const result = analyzeSymbol(symbol, candles, points);
    results.push(result);
    const report = buildReport(results, intakeRows.length);
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    const summary = report.bySymbol.find((row) => row.symbol === symbol);
    console.log(`[TOP_MOVES] ${symbol} sessions=${summary?.sessions ?? 0} matched=${summary?.matchedMoves ?? 0} recall=${summary?.actionableRecallPct ?? 0}%`);
  }
  console.log(`[TOP_MOVES] output=${outputPath}`);
}

main().catch((error) => {
  console.error('analyzeIntakeTopMoves failed:', error);
  process.exit(1);
});