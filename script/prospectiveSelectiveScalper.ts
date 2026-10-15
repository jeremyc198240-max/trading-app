import fs from 'node:fs';
import path from 'node:path';
import { runHistoricalBacktest, type BacktestProfile, type HistoricalBacktestResult } from '../server/historicalBacktest';
import { fetchLiveOHLC, type OHLC } from '../server/marketData';

interface Candidate {
  name: string;
  profile: Partial<BacktestProfile>;
}

interface Metrics {
  totalSignals: number;
  wins: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
}

interface FrozenSymbolPolicy {
  symbol: string;
  selectedProfile: string | null;
  profile: Partial<BacktestProfile> | null;
  eligible: boolean;
  rejectionReason: string | null;
  development: Metrics | null;
  folds: Metrics[];
  frozenAfter: number;
}

interface FrozenPolicy {
  version: 2;
  generatedAt: string;
  lookbackDays: number;
  methodology: string;
  criteria: typeof CRITERIA;
  symbols: FrozenSymbolPolicy[];
}

const SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'GLD'];
const CRITERIA = {
  folds: 3,
  minDevelopmentTrades: 30,
  minDevelopmentWinRate: 60,
  minDevelopmentProfitFactor: 1,
  minFoldTrades: 5,
  minFoldWinRate: 55,
  minFoldProfitFactor: 0.8,
  minFoldExpectancy: -2,
  minProspectiveTrades: 30,
  targetProspectiveWinRate: 70,
};

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

function compact(result: HistoricalBacktestResult): Metrics {
  return {
    totalSignals: result.totalSignals,
    wins: result.wins,
    winRate: result.winRate,
    profitFactor: result.profitFactor,
    expectancy: result.expectancy,
  };
}

async function loadCandles(symbol: string, lookbackDays: number): Promise<OHLC[]> {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const result = await fetchLiveOHLC(symbol, '5m', 'FULL', { lookbackDays });
    if (result.data.length >= 100) return result.data;
    if (attempt < 3 && String(result.error ?? '').toLowerCase().includes('cooldown')) {
      console.log(`[PROSPECTIVE] ${symbol} provider cooldown; retrying in 62s`);
      await delay(62_000);
      continue;
    }
    throw new Error(`${symbol}: insufficient candles (${result.data.length}): ${result.error ?? 'unknown provider error'}`);
  }
  return [];
}

function foldBoundaries(candles: OHLC[]): Array<{ startTime: number; endTime?: number }> {
  const dates = Array.from(new Set(candles.map(sessionDate))).sort();
  if (dates.length < CRITERIA.folds * 3) throw new Error(`Only ${dates.length} sessions available for stability folds`);
  const starts = Array.from({ length: CRITERIA.folds }, (_, index) => dates[Math.floor(index * dates.length / CRITERIA.folds)]);
  return starts.map((startDate, index) => {
    const start = candles.find((candle) => sessionDate(candle) === startDate)?.time;
    const nextDate = starts[index + 1];
    const end = nextDate ? candles.find((candle) => sessionDate(candle) === nextDate)?.time : undefined;
    if (start == null) throw new Error(`Unable to resolve fold ${index + 1}`);
    return { startTime: start, endTime: end };
  });
}

function stable(development: HistoricalBacktestResult, folds: HistoricalBacktestResult[]): boolean {
  return development.totalSignals >= CRITERIA.minDevelopmentTrades
    && development.winRate >= CRITERIA.minDevelopmentWinRate
    && development.profitFactor >= CRITERIA.minDevelopmentProfitFactor
    && development.expectancy > 0
    && folds.every((fold) => fold.totalSignals >= CRITERIA.minFoldTrades)
    && folds.every((fold) => fold.winRate >= CRITERIA.minFoldWinRate)
    && folds.every((fold) => fold.profitFactor >= CRITERIA.minFoldProfitFactor)
    && folds.every((fold) => fold.expectancy >= CRITERIA.minFoldExpectancy);
}

function stabilityRank(development: HistoricalBacktestResult, folds: HistoricalBacktestResult[]): number {
  const worstWinRate = Math.min(...folds.map((fold) => fold.winRate));
  const winRateSpread = Math.max(...folds.map((fold) => fold.winRate)) - worstWinRate;
  const worstProfitFactor = Math.min(...folds.map((fold) => fold.profitFactor));
  return worstWinRate * 2 + development.winRate + Math.min(worstProfitFactor, 2) * 10 - winRateSpread * 0.5;
}

async function freezeSymbol(symbol: string, lookbackDays: number): Promise<FrozenSymbolPolicy> {
  const candles = await loadCandles(symbol, lookbackDays);
  const boundaries = foldBoundaries(candles);
  const runs: Array<{ candidate: Candidate; development: HistoricalBacktestResult; folds: HistoricalBacktestResult[] }> = [];

  for (const candidate of CANDIDATES) {
    const development = await runHistoricalBacktest(symbol, '5m', lookbackDays, candidate.profile);
    const folds: HistoricalBacktestResult[] = [];
    for (const boundary of boundaries) {
      folds.push(await runHistoricalBacktest(symbol, '5m', lookbackDays, candidate.profile, boundary));
    }
    runs.push({ candidate, development, folds });
  }

  const eligible = runs
    .filter((run) => stable(run.development, run.folds))
    .sort((left, right) => stabilityRank(right.development, right.folds) - stabilityRank(left.development, left.folds));
  const selected = eligible[0];
  const best = selected ?? [...runs].sort(
    (left, right) => stabilityRank(right.development, right.folds) - stabilityRank(left.development, left.folds),
  )[0];
  const frozenAfter = Math.max(...candles.map((candle) => candle.time)) + 1;

  return {
    symbol,
    selectedProfile: best?.candidate.name ?? null,
    profile: selected?.candidate.profile ?? null,
    eligible: Boolean(selected),
    rejectionReason: selected ? null : 'No profile passed aggregate performance and all three chronological stability folds',
    development: best ? compact(best.development) : null,
    folds: best ? best.folds.map(compact) : [],
    frozenAfter,
  };
}

function policyPath(lookbackDays: number): string {
  return path.resolve(process.cwd(), 'logs', `selective_scalper_0dte_frozen_policy_${lookbackDays}d.json`);
}

async function freeze(lookbackDays: number, symbols: string[], force: boolean): Promise<void> {
  const outputPath = policyPath(lookbackDays);
  const existingPolicy: FrozenPolicy | null = (() => {
    if (!fs.existsSync(outputPath)) return null;
    try {
      return JSON.parse(fs.readFileSync(outputPath, 'utf8')) as FrozenPolicy;
    } catch {
      return null;
    }
  })();
  const frozenSymbols = existingPolicy?.symbols.filter((entry) => symbols.includes(entry.symbol)).map((entry) => entry.symbol) ?? [];
  if (frozenSymbols.length && !force) {
    throw new Error(`Policy already frozen for ${frozenSymbols.join(', ')}; pass --force only when intentionally starting a new experiment`);
  }
  const existing = existingPolicy?.symbols.filter((entry) => !symbols.includes(entry.symbol)) ?? [];
  const rows = [...existing];

  for (const symbol of symbols) {
    const row = await freezeSymbol(symbol, lookbackDays);
    rows.push(row);
    const policy: FrozenPolicy = {
      version: 2,
      generatedAt: new Date().toISOString(),
      lookbackDays,
      methodology: 'ATM 0DTE premium proxy with theta and 3% entry/exit friction. Full development window; candidate must pass aggregate criteria and three chronological folds. Only post-freeze candles qualify for release validation.',
      criteria: CRITERIA,
      symbols: rows,
    };
    fs.writeFileSync(outputPath, `${JSON.stringify(policy, null, 2)}\n`, 'utf8');
    console.log(`[PROSPECTIVE] ${symbol} ${row.eligible ? 'frozen' : 'rejected'} profile=${row.selectedProfile ?? 'none'} development=${row.development?.winRate ?? 0}%/${row.development?.totalSignals ?? 0}`);
  }
  console.log(`[PROSPECTIVE] frozen policy=${outputPath}`);
}

async function check(lookbackDays: number, symbols: string[]): Promise<void> {
  const inputPath = policyPath(lookbackDays);
  if (!fs.existsSync(inputPath)) throw new Error(`Frozen policy not found: ${inputPath}`);
  const policy = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as FrozenPolicy;
  const outputPath = path.resolve(process.cwd(), 'logs', `selective_scalper_0dte_prospective_${lookbackDays}d.json`);
  const rows: Array<{ symbol: string; selectedProfile: string | null; frozenAfter: number; prospective: Metrics }> = (() => {
    if (!fs.existsSync(outputPath)) return [];
    try {
      const existing = JSON.parse(fs.readFileSync(outputPath, 'utf8')) as { rows?: Array<{ symbol: string; selectedProfile: string | null; frozenAfter: number; prospective: Metrics }> };
      return Array.isArray(existing.rows) ? existing.rows.filter((row) => !symbols.includes(row.symbol)) : [];
    } catch {
      return [];
    }
  })();

  const writeReport = () => {
    const trades = rows.reduce((sum, row) => sum + row.prospective.totalSignals, 0);
    const wins = rows.reduce((sum, row) => sum + row.prospective.wins, 0);
    const winRate = trades ? Number((wins / trades * 100).toFixed(1)) : 0;
    const releaseQualified = trades >= CRITERIA.minProspectiveTrades && winRate >= CRITERIA.targetProspectiveWinRate;
    const report = {
      generatedAt: new Date().toISOString(),
      policyGeneratedAt: policy.generatedAt,
      lookbackDays,
      aggregateProspective: { trades, wins, winRate, targetWinRate: CRITERIA.targetProspectiveWinRate, minTrades: CRITERIA.minProspectiveTrades, releaseQualified },
      rows,
    };
    fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    return report;
  };

  for (const entry of policy.symbols.filter((symbol) => symbols.includes(symbol.symbol) && symbol.eligible && symbol.profile)) {
    await loadCandles(entry.symbol, lookbackDays);
    const result = await runHistoricalBacktest(entry.symbol, '5m', lookbackDays, entry.profile ?? {}, { startTime: entry.frozenAfter });
    rows.push({ symbol: entry.symbol, selectedProfile: entry.selectedProfile, frozenAfter: entry.frozenAfter, prospective: compact(result) });
    writeReport();
    console.log(`[PROSPECTIVE] ${entry.symbol} holdout=${result.winRate}% (${result.wins}/${result.totalSignals})`);
  }

  const report = writeReport();
  console.log(`[PROSPECTIVE] holdout=${report.aggregateProspective.winRate}% (${report.aggregateProspective.wins}/${report.aggregateProspective.trades}) releaseQualified=${report.aggregateProspective.releaseQualified}`);
  console.log(`[PROSPECTIVE] report=${outputPath}`);
}

async function main(): Promise<void> {
  const mode = String(process.argv[2] ?? 'freeze').toLowerCase();
  const lookbackDays = Number(process.argv[3] ?? 60);
  const symbols = (process.argv[4] ?? SYMBOLS.join(',')).split(',').map((value) => value.trim().toUpperCase()).filter(Boolean);
  const force = process.argv.includes('--force');
  if (mode === 'freeze') await freeze(lookbackDays, symbols, force);
  else if (mode === 'check') await check(lookbackDays, symbols);
  else throw new Error(`Unknown mode "${mode}"; expected freeze or check`);
}

main().catch((error) => {
  console.error('prospectiveSelectiveScalper failed:', error);
  process.exit(1);
});