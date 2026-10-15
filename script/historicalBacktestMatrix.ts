import { runHistoricalBacktest } from "../server/historicalBacktest";

type Timeframe = "5m" | "15m" | "30m";

const SYMBOLS = ["SPY", "QQQ", "AAPL", "MSFT", "GOOGL", "AMZN", "TSLA", "NVDA", "GLD"];
const TIMEFRAMES: Timeframe[] = ["5m", "15m", "30m"];

interface MatrixRow {
  symbol: string;
  timeframe: Timeframe;
  totalSignals: number;
  period: string;
  winRate: number;
  expectancy: number;
  profitFactor: number;
  wins: number;
  losses: number;
}

function scoreRow(row: MatrixRow): number {
  const freqPerDayApprox = row.period.includes("days")
    ? row.totalSignals / Math.max(1, Number(row.period.split(" days")[0]))
    : row.totalSignals;
  const freqScore = Math.max(0, Math.min(100, freqPerDayApprox * 35));
  const expectancyScore = Math.max(0, Math.min(100, 50 + row.expectancy * 8));
  return row.winRate * 0.55 + expectancyScore * 0.25 + freqScore * 0.2;
}

async function main() {
  const rows: MatrixRow[] = [];

  for (const symbol of SYMBOLS) {
    for (const timeframe of TIMEFRAMES) {
      try {
        const r = await runHistoricalBacktest(symbol, timeframe);
        rows.push({
          symbol,
          timeframe,
          totalSignals: r.totalSignals,
          period: r.period,
          winRate: r.winRate,
          expectancy: r.expectancy,
          profitFactor: r.profitFactor,
          wins: r.wins,
          losses: r.losses,
        });
      } catch (error) {
        console.error(`[matrix] ${symbol} ${timeframe} failed:`, error);
      }
    }
  }

  const ranked = [...rows]
    .map((row) => ({ ...row, composite: Number(scoreRow(row).toFixed(2)) }))
    .sort((a, b) => b.composite - a.composite);

  const bestBySymbol = SYMBOLS.map((symbol) => {
    const options = ranked.filter((row) => row.symbol === symbol);
    const best = options[0];
    return {
      symbol,
      bestTimeframe: best?.timeframe ?? "n/a",
      winRate: best?.winRate ?? 0,
      expectancy: best?.expectancy ?? 0,
      totalSignals: best?.totalSignals ?? 0,
      composite: best?.composite ?? 0,
    };
  });

  console.log("\n=== HISTORICAL BACKTEST MATRIX (ALL RUNS) ===");
  console.table(ranked.map((row) => ({
    symbol: row.symbol,
    timeframe: row.timeframe,
    winRate: row.winRate,
    expectancy: row.expectancy,
    profitFactor: row.profitFactor,
    signals: row.totalSignals,
    wins: row.wins,
    losses: row.losses,
    composite: row.composite,
    period: row.period,
  })));

  console.log("\n=== BEST TIMEFRAME BY SYMBOL ===");
  console.table(bestBySymbol);

  const targetSetups = ranked.filter((row) => row.timeframe === "5m" && row.totalSignals >= 8 && row.winRate >= 65);
  console.log("\n=== 5M CANDIDATES (MIN 8 SIGNALS + 65% WR) ===");
  console.table(targetSetups.map((row) => ({
    symbol: row.symbol,
    winRate: row.winRate,
    expectancy: row.expectancy,
    signals: row.totalSignals,
    period: row.period,
  })));
}

main().catch((error) => {
  console.error("historicalBacktestMatrix failed:", error);
  process.exit(1);
});
