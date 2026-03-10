export const CONFIG = {
  WEIGHTS: {
    vwapSlope: 18,
    bullishPower: 20,
    candleStrength: 8,
    momentumDivergence: 10,
    volumeSpike: 8,
    liquiditySweepBase: 12,
    failedVwap: 12,
    exhaustion: 10,
    emaCloud: 15,
    macd: 6,
    rsi: 6,
    adx: 8,
    obv: 6,
    chaikin: 6,
    bollinger: 7,
    keltner: 7,
    stochastic: 5,
    orderflow: 8,
    gamma: 4,
    ivChange: 6,
    breadth: 10,
    correlation: 6
  },
  SWEEP_BUFFER_PCT: 0.001,
  SPIKE_FACTOR: 2.0,
  DEFAULT_MARKET_CONFIDENCE: 60,
  RISK: {
    accountRiskPct: 0.01,
    maxExposurePct: 0.08,
    atrMultiplier: 1.8
  }
};
