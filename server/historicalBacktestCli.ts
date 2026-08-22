import { formatHistoricalBacktest, runHistoricalBacktest } from './historicalBacktest';

async function main() {
  const symbol = process.argv[2] || 'SPY';
  const timeframe = process.argv[3] || '5m';

  const result = await runHistoricalBacktest(symbol, timeframe);
  console.log(formatHistoricalBacktest(result));
}

main().catch((error) => {
  console.error('historicalBacktestCli failed:', error);
  process.exit(1);
});
