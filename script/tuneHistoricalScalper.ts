import { runHistoricalBacktest, type BacktestProfile } from '../server/historicalBacktest';

interface Candidate {
  name: string;
  profile: Partial<BacktestProfile>;
}

const candidates: Candidate[] = [
  { name: 'baseline', profile: {} },
  {
    name: 'volume_confirmed',
    profile: {
      minVolumeRatio: 1.1,
    },
  },
  {
    name: 'accepted_breakout_bar',
    profile: {
      minVolumeRatio: 1.1,
      minBodyPctOfRange: 0.45,
      minCloseLocation: 0.65,
    },
  },
  {
    name: 'strong_breakout_bar',
    profile: {
      minVolumeRatio: 1.1,
      minBodyPctOfRange: 0.6,
      minCloseLocation: 0.75,
    },
  },
  {
    name: 'strong_breakout_calls',
    profile: {
      allowedDirections: ['CALL'],
      minVolumeRatio: 1.1,
      minBodyPctOfRange: 0.6,
      minCloseLocation: 0.75,
    },
  },
  {
    name: 'strong_breakout_puts',
    profile: {
      allowedDirections: ['PUT'],
      minVolumeRatio: 1.1,
      minBodyPctOfRange: 0.6,
      minCloseLocation: 0.75,
    },
  },
  {
    name: 'persistent_impulse',
    profile: {
      minMomentumAbs: 0.0011,
      minVolumeRatio: 1.08,
      minEmaSpreadPct: 0.0002,
      requiredStepBias: 3,
    },
  },
  {
    name: 'balanced_payoff',
    profile: {
      stopLossPct: 0.003,
      target1Pct: 0.002,
      target2Pct: 0.004,
      maxHoldBars: 7,
    },
  },
  {
    name: 'balanced_flow',
    profile: {
      minConfidence: 74,
      minMomentumAbs: 0.00115,
      minVolumeRatio: 1.12,
      minEmaSpreadPct: 0.00022,
      minAtrPct: 0.00075,
      maxAtrPct: 0.008,
      stopLossPct: 0.003,
      target1Pct: 0.002,
      target2Pct: 0.004,
      maxHoldBars: 7,
      minBarsBetween: 3,
      requiredStepBias: 3,
    },
  },
  {
    name: 'strong_directional_push',
    profile: {
      minConfidence: 78,
      minMomentumAbs: 0.00145,
      minVolumeRatio: 1.22,
      minEmaSpreadPct: 0.00028,
      minAtrPct: 0.0009,
      maxAtrPct: 0.007,
      stopLossPct: 0.003,
      target1Pct: 0.0022,
      target2Pct: 0.0044,
      maxHoldBars: 7,
      minBarsBetween: 3,
      requiredStepBias: 3,
    },
  },
  {
    name: 'tight_risk_flow',
    profile: {
      minConfidence: 76,
      minMomentumAbs: 0.00125,
      minVolumeRatio: 1.16,
      minEmaSpreadPct: 0.00024,
      minAtrPct: 0.0008,
      maxAtrPct: 0.0075,
      stopLossPct: 0.0025,
      target1Pct: 0.002,
      target2Pct: 0.004,
      maxHoldBars: 6,
      minBarsBetween: 3,
      requiredStepBias: 3,
    },
  },
];

async function main() {
  const symbol = (process.argv[2] ?? 'SPY').toUpperCase();
  const lookbackDays = Number(process.argv[3] ?? 30);
  const rows = [];

  for (const candidate of candidates) {
    const result = await runHistoricalBacktest(symbol, '5m', lookbackDays, candidate.profile);
    rows.push({
      profile: candidate.name,
      trades: result.totalSignals,
      winRate: result.winRate,
      profitFactor: result.profitFactor,
      expectancy: result.expectancy,
      calls: result.byDirection.calls.winRate,
      puts: result.byDirection.puts.winRate,
    });
  }

  console.table(rows);
}

main().catch((error) => {
  console.error('tuneHistoricalScalper failed:', error);
  process.exit(1);
});