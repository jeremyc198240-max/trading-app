import type { OHLC } from "@shared/schema";

export interface DirectionalProbabilityDistribution {
  up: number;
  down: number;
  chop: number;
}

function normalize(values: DirectionalProbabilityDistribution): DirectionalProbabilityDistribution {
  const up = Math.max(0, Number.isFinite(values.up) ? values.up : 0);
  const down = Math.max(0, Number.isFinite(values.down) ? values.down : 0);
  const chop = Math.max(0, Number.isFinite(values.chop) ? values.chop : 0);
  const total = up + down + chop;
  return total > 0
    ? { up: up / total, down: down / total, chop: chop / total }
    : { up: 1 / 3, down: 1 / 3, chop: 1 / 3 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function deriveLiveDirectionalProbabilities({
  baseline,
  candles,
  spot,
  quoteIsLive,
}: {
  baseline?: Partial<DirectionalProbabilityDistribution>;
  candles: OHLC[];
  spot: number;
  quoteIsLive: boolean;
}): DirectionalProbabilityDistribution {
  const prior = normalize({
    up: baseline?.up ?? 1 / 3,
    down: baseline?.down ?? 1 / 3,
    chop: baseline?.chop ?? 1 / 3,
  });
  const recent = candles
    .filter((candle) =>
      [candle.open, candle.high, candle.low, candle.close].every((value) => Number.isFinite(value) && value > 0),
    )
    .slice(-6);

  if (recent.length < 3) return prior;

  const ranges = recent.map((candle) => Math.max(candle.high - candle.low, candle.close * 0.0001));
  const averageRange = ranges.reduce((sum, range) => sum + range, 0) / ranges.length;
  const netMove = recent[recent.length - 1].close - recent[0].open;
  const trendPressure = clamp(netMove / (averageRange * 2.5), -1, 1);
  const recentBodies = recent.slice(-5);
  const bodyPressure = recentBodies.reduce((sum, candle, index) => {
    const weight = index + 1;
    const range = Math.max(candle.high - candle.low, candle.close * 0.0001);
    return sum + (candle.close - candle.open) / range * weight;
  }, 0) / recentBodies.reduce((sum, _candle, index) => sum + index + 1, 0);
  let chartPressure = clamp(trendPressure * 0.65 + bodyPressure * 0.35, -1, 1);

  const latestClose = recent[recent.length - 1].close;
  if (quoteIsLive && Number.isFinite(spot) && spot > 0) {
    const quotePressure = clamp((spot - latestClose) / (averageRange * 1.5), -1, 1);
    chartPressure = clamp(chartPressure * 0.78 + quotePressure * 0.22, -1, 1);
  }

  const directionalMagnitude = Math.abs(chartPressure);
  const chartDistribution = normalize({
    up: 0.5 + chartPressure * 0.5,
    down: 0.5 - chartPressure * 0.5,
    chop: 1 - directionalMagnitude,
  });

  return normalize({
    up: prior.up * 0.4 + chartDistribution.up * 0.6,
    down: prior.down * 0.4 + chartDistribution.down * 0.6,
    chop: prior.chop * 0.4 + chartDistribution.chop * 0.6,
  });
}
