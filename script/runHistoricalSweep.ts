import { runHistoricalBacktest } from "../server/historicalBacktest";

type Timeframe = "5m" | "15m" | "30m" | "1h";

interface SweepRow {
  symbol: string;
  timeframe: Timeframe;
  totalSignals: number;
  winRate: number;
  wins: number;
  losses: number;
  profitFactor: number;
  expectancy: number;
  avgHoldMinutes: number;
  minHoldMinutes: number;
  maxHoldMinutes: number;
  period: string;
}

const DEFAULT_SYMBOLS = ["SPY", "QQQ", "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "GLD"];
const DEFAULT_TIMEFRAMES: Timeframe[] = ["5m", "15m", "30m"];

function parseSymbols(arg?: string): string[] {
  if (!arg) return DEFAULT_SYMBOLS;
  return Array.from(new Set(arg.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)));
}

function parseTimeframes(arg?: string): Timeframe[] {
  if (!arg) return DEFAULT_TIMEFRAMES;
  const allowed: Timeframe[] = ["5m", "15m", "30m", "1h"];
  const parsed = Array.from(new Set(arg.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean)));
  const selected = parsed.filter((tf): tf is Timeframe => allowed.includes(tf as Timeframe));
  return selected.length > 0 ? selected : DEFAULT_TIMEFRAMES;
}

function rankScore(row: SweepRow): number {
  const qualityWeight = row.winRate * 1.0;
  const expectancyWeight = row.expectancy * 1.5;
  const samplePenalty = row.totalSignals < 8 ? -8 : 0;
  return qualityWeight + expectancyWeight + samplePenalty;
}

async function main() {
  const symbols = parseSymbols(process.argv[2]);
  const timeframes = parseTimeframes(process.argv[3]);
  const rows: SweepRow[] = [];

  for (const symbol of symbols) {
    for (const timeframe of timeframes) {
      try {
        const result = await runHistoricalBacktest(symbol, timeframe);
        rows.push({
          symbol,
          timeframe,
          totalSignals: result.totalSignals,
          winRate: result.winRate,
          wins: result.wins,
          losses: result.losses,
          profitFactor: result.profitFactor,
          expectancy: result.expectancy,
          avgHoldMinutes: result.avgHoldMinutes,
          minHoldMinutes: result.minHoldMinutes,
          maxHoldMinutes: result.maxHoldMinutes,
          period: result.period,
        });
        console.log(`[SWEEP] ${symbol} ${timeframe} | wr=${result.winRate}% | sig=${result.totalSignals} | pf=${result.profitFactor} | exp=${result.expectancy} | hold=${result.avgHoldMinutes}m (${result.minHoldMinutes}-${result.maxHoldMinutes}m)`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.log(`[SWEEP] ${symbol} ${timeframe} | ERROR: ${msg}`);
      }
    }
  }

  const bySymbol = new Map<string, SweepRow[]>();
  for (const row of rows) {
    const list = bySymbol.get(row.symbol) ?? [];
    list.push(row);
    bySymbol.set(row.symbol, list);
  }

  const bestPerSymbol = Array.from(bySymbol.entries()).map(([symbol, options]) => {
    const sorted = [...options].sort((a, b) => rankScore(b) - rankScore(a));
    return {
      symbol,
      best: sorted[0],
      alternatives: sorted.slice(1),
    };
  });

  const payload = {
    generatedAt: new Date().toISOString(),
    symbols,
    timeframes,
    rows,
    bestPerSymbol,
  };

  console.log("\n=== SWEEP_JSON_START ===");
  console.log(JSON.stringify(payload, null, 2));
  console.log("=== SWEEP_JSON_END ===");
}

main().catch((error) => {
  console.error("runHistoricalSweep failed:", error);
  process.exit(1);
});
