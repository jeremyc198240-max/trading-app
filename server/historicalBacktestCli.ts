import { formatHistoricalBacktest, runHistoricalBacktest } from './historicalBacktest';

async function main() {
  const symbol = process.argv[2] || 'SPY';
  const timeframe = process.argv[3] || '5m';
  const lookbackDays = Number(process.argv[4]);

  const result = await runHistoricalBacktest(symbol, timeframe, Number.isFinite(lookbackDays) && lookbackDays > 0 ? lookbackDays : undefined);
  console.log(formatHistoricalBacktest(result));
}

main().catch((error) => {
  console.error('historicalBacktestCli failed:', error);
  process.exit(1);
});
