import fs from 'node:fs';

type Row = {
  symbol: string;
  profile: string;
  trades: number;
  winRate: number;
  profitFactor: number;
  expectancy: number;
};

const report = JSON.parse(fs.readFileSync('logs/volume_diagnostic_30d.json', 'utf8')) as { allRows?: Row[] };
const rows = report.allRows ?? [];

const symbols = Array.from(new Set(rows.map((row) => row.symbol)));
const profiles = Array.from(new Set(rows.map((row) => row.profile)));

const bestPerSymbol = symbols.map((symbol) => {
  const options = rows
    .filter((row) => row.symbol === symbol)
    .sort((a, b) => b.profitFactor - a.profitFactor || b.expectancy - a.expectancy || b.winRate - a.winRate);

  const best = options[0];
  const baseline = options.find((row) => row.profile === 'baseline_v1.04');
  return {
    symbol,
    bestProfile: best.profile,
    bestPF: best.profitFactor,
    bestWR: best.winRate,
    bestTrades: best.trades,
    baselinePF: baseline?.profitFactor ?? null,
    baselineWR: baseline?.winRate ?? null,
    deltaPF: baseline ? Number((best.profitFactor - baseline.profitFactor).toFixed(2)) : null,
    deltaWR: baseline ? Number((best.winRate - baseline.winRate).toFixed(1)) : null,
  };
});

const aggregateByProfile = profiles.map((profile) => {
  const set = rows.filter((row) => row.profile === profile);
  const totalTrades = set.reduce((sum, row) => sum + row.trades, 0);
  const weightedWinRate = totalTrades > 0
    ? set.reduce((sum, row) => sum + row.winRate * row.trades, 0) / totalTrades
    : 0;
  const weightedExpectancy = totalTrades > 0
    ? set.reduce((sum, row) => sum + row.expectancy * row.trades, 0) / totalTrades
    : 0;
  const symbolsPFge1 = set.filter((row) => row.profitFactor >= 1).length;
  return {
    profile,
    totalTrades,
    weightedWinRate: Number(weightedWinRate.toFixed(1)),
    weightedExpectancy: Number(weightedExpectancy.toFixed(2)),
    symbolsPFge1,
  };
});

console.log('BEST_SUMMARY_START');
console.log(JSON.stringify(bestPerSymbol, null, 2));
console.log('BEST_SUMMARY_END');
console.log('AGG_SUMMARY_START');
console.log(JSON.stringify(aggregateByProfile, null, 2));
console.log('AGG_SUMMARY_END');
