import fs from 'node:fs';
import path from 'node:path';
import { runHistoricalBacktest, type BacktestProfile, type HistoricalBacktestResult } from '../server/historicalBacktest';
import { fetchLiveOHLC, type OHLC } from '../server/marketData';

interface Candidate {
  name: string;
  profile: Partial<BacktestProfile>;
}

interface ValidationRow {
  symbol: string;
  selectedProfile: string | null;
  direction: string | null;
  accepted: boolean;
  rejectionReason: string | null;
  train: Pick<HistoricalBacktestResult, 'totalSignals' | 'wins' | 'winRate' | 'profitFactor' | 'expectancy'> | null;
  holdout: Pick<HistoricalBacktestResult, 'totalSignals' | 'wins' | 'winRate' | 'profitFactor' | 'expectancy'> | null;
}

const SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'GLD'];
const MIN_TRAIN_TRADES = 12;
const MIN_TRAIN_WIN_RATE = 65;
const MIN_TRAIN_PROFIT_FACTOR = 1;
const MIN_HOLDOUT_TRADES = 5;

const BASE_PROFILES: Array<{ name: string; profile: Partial<BacktestProfile> }> = [
  { name: 'baseline_v1.04', profile: { minVolumeRatio: 1.04 } },
  { name: 'volume_v1.10', profile: { minVolumeRatio: 1.1 } },
  { name: 'volume_v1.20', profile: { minVolumeRatio: 1.2 } },
  { name: 'strong_bar_v1.10', profile: { minVolumeRatio: 1.1, minBodyPctOfRange: 0.6, minCloseLocation: 0.75 } },
];

const CANDIDATES: Candidate[] = BASE_PROFILES.flatMap((entry) => [
  { name: `${entry.name}_both`, profile: { ...entry.profile, allowedDirections: ['CALL', 'PUT'] } },
  { name: `${entry.name}_calls`, profile: { ...entry.profile, allowedDirections: ['CALL'] } },
  { name: `${entry.name}_puts`, profile: { ...entry.profile, allowedDirections: ['PUT'] } },
]);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sessionDate(candle: OHLC): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(candle.time * 1000));
}

async function loadCandles(symbol: string, lookbackDays: number): Promise<OHLC[]> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await fetchLiveOHLC(symbol, '5m', 'FULL', { lookbackDays });
    if (result.data.length >= 100) return result.data;
    if (attempt < 3 && String(result.error ?? '').toLowerCase().includes('cooldown')) {
      console.log(`[SELECTIVE_WF] ${symbol} provider cooldown; retrying in 62s`);
      await delay(62_000);
      continue;
    }
    throw new Error(`${symbol}: insufficient candles (${result.data.length}): ${result.error ?? 'unknown provider error'}`);
  }
  return [];
}

function compact(result: HistoricalBacktestResult): ValidationRow['train'] {
  return {
    totalSignals: result.totalSignals,
    wins: result.wins,
    winRate: result.winRate,
    profitFactor: result.profitFactor,
    expectancy: result.expectancy,
  };
}

function rank(result: HistoricalBacktestResult): number {
  const sampleAdjustment = Math.min(1, result.totalSignals / 30);
  return result.winRate * sampleAdjustment + Math.min(result.profitFactor, 3) * 8 + Math.max(-5, Math.min(5, result.expectancy));
}

async function validateSymbol(symbol: string, lookbackDays: number): Promise<ValidationRow> {
  const candles = await loadCandles(symbol, lookbackDays);
  const dates = Array.from(new Set(candles.map(sessionDate))).sort();
  if (dates.length < 10) throw new Error(`${symbol}: only ${dates.length} sessions available`);
  const splitIndex = Math.max(1, Math.min(dates.length - 1, Math.floor(dates.length * 0.7)));
  const holdoutDate = dates[splitIndex];
  const splitCandle = candles.find((candle) => sessionDate(candle) === holdoutDate);
  if (!splitCandle) throw new Error(`${symbol}: unable to resolve holdout boundary`);
  const splitTime = splitCandle.time;

  const trainingRuns: Array<{ candidate: Candidate; result: HistoricalBacktestResult }> = [];
  for (const candidate of CANDIDATES) {
    const result = await runHistoricalBacktest(symbol, '5m', lookbackDays, candidate.profile, { endTime: splitTime });
    trainingRuns.push({ candidate, result });
  }

  const eligible = trainingRuns
    .filter(({ result }) => result.totalSignals >= MIN_TRAIN_TRADES)
    .filter(({ result }) => result.winRate >= MIN_TRAIN_WIN_RATE)
    .filter(({ result }) => result.profitFactor >= MIN_TRAIN_PROFIT_FACTOR && result.expectancy > 0)
    .sort((left, right) => rank(right.result) - rank(left.result));

  const selected = eligible[0];
  if (!selected) {
    const best = [...trainingRuns].sort((left, right) => rank(right.result) - rank(left.result))[0];
    return {
      symbol,
      selectedProfile: best?.candidate.name ?? null,
      direction: best?.candidate.profile.allowedDirections?.join('+') ?? null,
      accepted: false,
      rejectionReason: `No training profile met ${MIN_TRAIN_TRADES}+ trades, ${MIN_TRAIN_WIN_RATE}% WR, PF ${MIN_TRAIN_PROFIT_FACTOR}+ and positive expectancy`,
      train: best ? compact(best.result) : null,
      holdout: null,
    };
  }

  const holdout = await runHistoricalBacktest(symbol, '5m', lookbackDays, selected.candidate.profile, { startTime: splitTime });
  const accepted = holdout.totalSignals >= MIN_HOLDOUT_TRADES;
  return {
    symbol,
    selectedProfile: selected.candidate.name,
    direction: selected.candidate.profile.allowedDirections?.join('+') ?? null,
    accepted,
    rejectionReason: accepted ? null : `Holdout sample below ${MIN_HOLDOUT_TRADES} trades`,
    train: compact(selected.result),
    holdout: compact(holdout),
  };
}

async function main() {
  const lookbackDays = Number(process.argv[2] ?? 30);
  const symbols = (process.argv[3] ?? SYMBOLS.join(',')).split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
  const outputPath = path.resolve(process.cwd(), 'logs', `selective_scalper_walk_forward_${lookbackDays}d.json`);
  const rows: ValidationRow[] = (() => {
    if (!fs.existsSync(outputPath)) return [];
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as { rows?: ValidationRow[] };
      return Array.isArray(existing.rows) ? existing.rows.filter((row) => !symbols.includes(row.symbol)) : [];
    } catch {
      return [];
    }
  })();

  const writeReport = () => {
    const accepted = rows.filter((row) => row.accepted && row.holdout);
    const holdoutTrades = accepted.reduce((sum, row) => sum + (row.holdout?.totalSignals ?? 0), 0);
    const holdoutWins = accepted.reduce((sum, row) => sum + (row.holdout?.wins ?? 0), 0);
    const holdoutWinRate = holdoutTrades ? Number((holdoutWins / holdoutTrades * 100).toFixed(1)) : 0;
    const releaseQualified = holdoutTrades >= 30 && holdoutWinRate >= 70;
    const report = {
      generatedAt: new Date().toISOString(),
      lookbackDays,
      split: 'first 70% sessions train / final 30% sessions holdout',
      selectionCriteria: { minTrainTrades: MIN_TRAIN_TRADES, minTrainWinRate: MIN_TRAIN_WIN_RATE, minTrainProfitFactor: MIN_TRAIN_PROFIT_FACTOR, minHoldoutTrades: MIN_HOLDOUT_TRADES },
      aggregateHoldout: { symbols: accepted.length, trades: holdoutTrades, wins: holdoutWins, winRate: holdoutWinRate, targetWinRate: 70, releaseQualified },
      rows,
    };
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    return report;
  };

  for (const symbol of symbols) {
    const row = await validateSymbol(symbol, lookbackDays);
    rows.push(row);
    writeReport();
    console.log(`[SELECTIVE_WF] ${symbol} ${row.accepted ? 'accepted' : 'rejected'} profile=${row.selectedProfile ?? 'none'} train=${row.train?.winRate ?? 0}%/${row.train?.totalSignals ?? 0} holdout=${row.holdout?.winRate ?? 0}%/${row.holdout?.totalSignals ?? 0}`);
  }

  const report = writeReport();
  console.log(`[SELECTIVE_WF] aggregate holdout=${report.aggregateHoldout.winRate}% (${report.aggregateHoldout.wins}/${report.aggregateHoldout.trades}) releaseQualified=${report.aggregateHoldout.releaseQualified}`);
  console.log(`[SELECTIVE_WF] output=${outputPath}`);
}

main().catch((error) => {
  console.error('validateSelectiveScalper failed:', error);
  process.exit(1);
});