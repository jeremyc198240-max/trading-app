import { runHistoricalBacktest, type BacktestProfile } from '../server/historicalBacktest';
import fs from 'node:fs';
import path from 'node:path';

interface ProfileDef {
  name: string;
  profile: Partial<BacktestProfile>;
}

interface Row {
  symbol: string;
  profile: string;
  trades: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
  callsWinRate: number;
  putsWinRate: number;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isCooldownError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error ?? '');
  return msg.toLowerCase().includes('cooldown active');
}

async function runBacktestWithRetry(
  symbol: string,
  lookbackDays: number,
  profile: Partial<BacktestProfile>,
  attempts = 3,
): Promise<Awaited<ReturnType<typeof runHistoricalBacktest>>> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await runHistoricalBacktest(symbol, '5m', lookbackDays, profile);
    } catch (error) {
      lastError = error;
      if (!isCooldownError(error) || attempt === attempts) {
        throw error;
      }
      const waitMs = 62_000;
      console.log(`[VOL_DIAG] ${symbol} cooldown hit (attempt ${attempt}/${attempts}), waiting ${Math.round(waitMs / 1000)}s`);
      await delay(waitMs);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

const SYMBOLS = ['SPY', 'QQQ', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'GLD'];
const MIN_TRADES_FOR_SELECTION = 20;
const OUTPUT_PATH = path.resolve(process.cwd(), 'logs', 'volume_diagnostic_30d.json');

const PROFILES: ProfileDef[] = [
  { name: 'baseline_v1.04', profile: { minVolumeRatio: 1.04 } },
  { name: 'volume_v1.08', profile: { minVolumeRatio: 1.08 } },
  { name: 'volume_v1.10', profile: { minVolumeRatio: 1.1 } },
  { name: 'volume_v1.14', profile: { minVolumeRatio: 1.14 } },
  { name: 'volume_v1.20', profile: { minVolumeRatio: 1.2 } },
  {
    name: 'volume_v1.10_strong_bar',
    profile: {
      minVolumeRatio: 1.1,
      minBodyPctOfRange: 0.6,
      minCloseLocation: 0.75,
    },
  },
];

function rank(rows: Row[]): Row[] {
  return [...rows].sort((a, b) => {
    if (b.profitFactor !== a.profitFactor) return b.profitFactor - a.profitFactor;
    if (b.expectancy !== a.expectancy) return b.expectancy - a.expectancy;
    return b.winRate - a.winRate;
  });
}

async function runForSymbol(symbol: string, lookbackDays: number): Promise<Row[]> {
  const rows: Row[] = [];

  for (const entry of PROFILES) {
    const result = await runBacktestWithRetry(symbol, lookbackDays, entry.profile);
    rows.push({
      symbol,
      profile: entry.name,
      trades: result.totalSignals,
      winRate: result.winRate,
      profitFactor: result.profitFactor,
      expectancy: result.expectancy,
      callsWinRate: result.byDirection.calls.winRate,
      putsWinRate: result.byDirection.puts.winRate,
    });
  }

  return rows;
}

async function main() {
  const lookbackDays = Number(process.argv[2] ?? 30);
  const symbols = (process.argv[3] ?? SYMBOLS.join(',')).split(',').map((v) => v.trim().toUpperCase()).filter(Boolean);
  const existingRows: Row[] = (() => {
    if (!fs.existsSync(OUTPUT_PATH)) return [];
    try {
      const parsed = JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8')) as { allRows?: Row[] };
      return Array.isArray(parsed.allRows) ? parsed.allRows : [];
    } catch {
      return [];
    }
  })();
  const allRows: Row[] = [...existingRows];

  for (const symbol of symbols) {
    for (let i = allRows.length - 1; i >= 0; i -= 1) {
      if (allRows[i].symbol === symbol) {
        allRows.splice(i, 1);
      }
    }
    const rows = await runForSymbol(symbol, lookbackDays);
    allRows.push(...rows);
    const bestWithSample = rank(rows.filter((row) => row.trades >= MIN_TRADES_FOR_SELECTION))[0] ?? rank(rows)[0];
    const baseline = rows.find((row) => row.profile === 'baseline_v1.04');
    console.log(
      `[VOL_DIAG] ${symbol} best=${bestWithSample.profile} pf=${bestWithSample.profitFactor} wr=${bestWithSample.winRate}% sig=${bestWithSample.trades} ` +
      `(baseline pf=${baseline?.profitFactor ?? 'n/a'}, wr=${baseline?.winRate ?? 'n/a'}%, sig=${baseline?.trades ?? 'n/a'})`,
    );

    fs.writeFileSync(
      OUTPUT_PATH,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          lookbackDays,
          symbols: Array.from(new Set(allRows.map((row) => row.symbol))),
          minTradesForSelection: MIN_TRADES_FOR_SELECTION,
          profiles: PROFILES.map((profile) => profile.name),
          completedSymbols: Array.from(new Set(allRows.map((row) => row.symbol))),
          allRows,
        },
        null,
        2,
      ),
      'utf8',
    );
  }

  const aggregateByProfile = PROFILES.map((profile) => {
    const rows = allRows.filter((row) => row.profile === profile.name);
    const trades = rows.reduce((sum, row) => sum + row.trades, 0);
    const weightedWinRate = trades > 0 ? rows.reduce((sum, row) => sum + row.winRate * row.trades, 0) / trades : 0;
    const weightedExpectancy = trades > 0 ? rows.reduce((sum, row) => sum + row.expectancy * row.trades, 0) / trades : 0;
    const grossWinsProxy = rows.reduce((sum, row) => sum + Math.max(0, row.expectancy) * row.trades, 0);
    const grossLossProxy = rows.reduce((sum, row) => sum + Math.max(0, -row.expectancy) * row.trades, 0);
    const expectancyBalance = grossLossProxy > 0 ? grossWinsProxy / grossLossProxy : grossWinsProxy > 0 ? 999 : 0;
    const profitableTickers = rows.filter((row) => row.profitFactor >= 1.05 && row.trades >= MIN_TRADES_FOR_SELECTION).length;

    return {
      profile: profile.name,
      totalTrades: trades,
      weightedWinRate: Number(weightedWinRate.toFixed(1)),
      weightedExpectancy: Number(weightedExpectancy.toFixed(2)),
      profitableTickers,
      expectancyBalance: Number(expectancyBalance.toFixed(2)),
    };
  });

  const allSymbols = Array.from(new Set(allRows.map((row) => row.symbol)));

  const bestPerSymbol = allSymbols.map((symbol) => {
    const rows = allRows.filter((row) => row.symbol === symbol);
    const bestWithSample = rank(rows.filter((row) => row.trades >= MIN_TRADES_FOR_SELECTION))[0] ?? rank(rows)[0];
    const baseline = rows.find((row) => row.profile === 'baseline_v1.04');
    return {
      symbol,
      bestProfile: bestWithSample.profile,
      bestPF: bestWithSample.profitFactor,
      bestWR: bestWithSample.winRate,
      bestTrades: bestWithSample.trades,
      baselinePF: baseline?.profitFactor ?? null,
      baselineWR: baseline?.winRate ?? null,
      baselineTrades: baseline?.trades ?? null,
      deltaPF: baseline ? Number((bestWithSample.profitFactor - baseline.profitFactor).toFixed(2)) : null,
      deltaWR: baseline ? Number((bestWithSample.winRate - baseline.winRate).toFixed(1)) : null,
      callWinRateBest: bestWithSample.callsWinRate,
      putWinRateBest: bestWithSample.putsWinRate,
    };
  });

  console.log('\n=== VOLUME PROFILE AGGREGATE ===');
  console.table(aggregateByProfile);

  console.log('\n=== BEST PROFILE PER TICKER ===');
  console.table(bestPerSymbol);

  const payload = {
    generatedAt: new Date().toISOString(),
    lookbackDays,
    symbols: allSymbols,
    minTradesForSelection: MIN_TRADES_FOR_SELECTION,
    profiles: PROFILES.map((profile) => profile.name),
    aggregateByProfile,
    bestPerSymbol,
    allRows,
  };

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2), 'utf8');
  console.log(`\n[VOL_DIAG] results written to ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error('volumeDiagnosticAllTickers failed:', error);
  process.exit(1);
});
