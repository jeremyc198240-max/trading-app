import { OHLC, MarketHealthIndicators, TimeframePatternIntel } from '../fusion';

export interface OrderBlockResult {
  score: number;
  direction?: 'bullish' | 'bearish' | 'neutral';
  fresh: number;
  used: number;
  nearestBullish?: { low: number; high: number; ageBars: number };
  nearestBearish?: { low: number; high: number; ageBars: number };
  volumeProfile?: {
    vpoc: number;
    valueAreaLow: number;
    valueAreaHigh: number;
    highVolumeNodeCount: number;
  };
  details?: Record<string, any>;
}

interface OrderBlockZone {
  side: 'bullish' | 'bearish';
  low: number;
  high: number;
  createdAtIdx: number;
  touched: boolean;
  strength: number;
  confluence: number;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function buildVolumeProfile(ohlc: OHLC[], bins = 24): {
  vpoc: number;
  valueAreaLow: number;
  valueAreaHigh: number;
  highVolumeNodes: number[];
} {
  const highs = ohlc.map(c => c.high);
  const lows = ohlc.map(c => c.low);
  const minPrice = Math.min(...lows);
  const maxPrice = Math.max(...highs);

  if (!Number.isFinite(minPrice) || !Number.isFinite(maxPrice) || maxPrice <= minPrice) {
    const fallback = ohlc[ohlc.length - 1]?.close ?? 0;
    return {
      vpoc: fallback,
      valueAreaLow: fallback,
      valueAreaHigh: fallback,
      highVolumeNodes: []
    };
  }

  const span = maxPrice - minPrice;
  const bucketSize = span / bins;
  const buckets = new Array<number>(bins).fill(0);

  for (const candle of ohlc) {
    const lowIdx = Math.max(0, Math.min(bins - 1, Math.floor((candle.low - minPrice) / bucketSize)));
    const highIdx = Math.max(0, Math.min(bins - 1, Math.floor((candle.high - minPrice) / bucketSize)));
    const covered = Math.max(1, highIdx - lowIdx + 1);
    const volPerBucket = (candle.volume || 0) / covered;
    for (let i = lowIdx; i <= highIdx; i += 1) {
      buckets[i] += volPerBucket;
    }
  }

  const totalVol = buckets.reduce((sum, v) => sum + v, 0);
  let vpocIdx = 0;
  let maxVol = -Infinity;
  for (let i = 0; i < buckets.length; i += 1) {
    if (buckets[i] > maxVol) {
      maxVol = buckets[i];
      vpocIdx = i;
    }
  }

  let left = vpocIdx;
  let right = vpocIdx;
  let coveredVol = buckets[vpocIdx] || 0;
  const targetVol = totalVol * 0.7;

  while (coveredVol < targetVol && (left > 0 || right < bins - 1)) {
    const nextLeftVol = left > 0 ? buckets[left - 1] : -1;
    const nextRightVol = right < bins - 1 ? buckets[right + 1] : -1;
    if (nextLeftVol >= nextRightVol && left > 0) {
      left -= 1;
      coveredVol += buckets[left] || 0;
    } else if (right < bins - 1) {
      right += 1;
      coveredVol += buckets[right] || 0;
    } else {
      break;
    }
  }

  const highNodeThreshold = maxVol * 0.8;
  const highVolumeNodes: number[] = [];
  for (let i = 0; i < buckets.length; i += 1) {
    if (buckets[i] >= highNodeThreshold) {
      highVolumeNodes.push(minPrice + (i + 0.5) * bucketSize);
    }
  }

  return {
    vpoc: minPrice + (vpocIdx + 0.5) * bucketSize,
    valueAreaLow: minPrice + left * bucketSize,
    valueAreaHigh: minPrice + (right + 1) * bucketSize,
    highVolumeNodes
  };
}

function nearVolumeNode(price: number, nodes: number[], tolerance: number): number {
  if (!nodes.length || !Number.isFinite(price) || !Number.isFinite(tolerance) || tolerance <= 0) return 0;
  const minDist = Math.min(...nodes.map(node => Math.abs(node - price)));
  return clamp01(1 - minDist / tolerance);
}

function detectOrderBlocks(ohlc: OHLC[], profile: ReturnType<typeof buildVolumeProfile>): OrderBlockZone[] {
  if (ohlc.length < 20) return [];
  const zones: OrderBlockZone[] = [];
  const rangeAvg = ohlc
    .slice(-40)
    .map(c => c.high - c.low)
    .reduce((sum, r) => sum + r, 0) / Math.max(1, Math.min(40, ohlc.length));
  const volumeAvg = ohlc
    .slice(-40)
    .map(c => c.volume || 0)
    .reduce((sum, v) => sum + v, 0) / Math.max(1, Math.min(40, ohlc.length));
  const nodeTolerance = Math.max(rangeAvg * 1.6, (profile.valueAreaHigh - profile.valueAreaLow) * 0.08);

  for (let i = 2; i < ohlc.length - 2; i += 1) {
    const base = ohlc[i];
    const next = ohlc[i + 1];
    const impulse = ohlc[i + 2];
    if (!base || !next || !impulse) continue;

    const baseRange = Math.max(base.high - base.low, 1e-6);
    const baseBody = Math.abs(base.close - base.open);
    const compactBase = baseBody / baseRange < 0.55;

    const upDisplacement = ((impulse.close - base.high) / Math.max(base.high, 1e-6));
    const downDisplacement = ((base.low - impulse.close) / Math.max(base.low, 1e-6));
    const volImpulse = (next.volume + impulse.volume) / Math.max(1, volumeAvg * 2);
    const nodeConfluence = nearVolumeNode((base.high + base.low) * 0.5, profile.highVolumeNodes, nodeTolerance);

    if (compactBase && base.close < base.open && upDisplacement > 0.0015) {
      const zoneLow = Math.min(base.low, base.close);
      const zoneHigh = Math.max(base.high, base.open);
      let touched = false;
      for (let j = i + 3; j < ohlc.length; j += 1) {
        if (ohlc[j].low <= zoneHigh && ohlc[j].high >= zoneLow) {
          touched = true;
          break;
        }
      }

      const strength = clamp01((upDisplacement / 0.006) * 0.55 + clamp01(volImpulse) * 0.3 + nodeConfluence * 0.15);
      zones.push({
        side: 'bullish',
        low: zoneLow,
        high: zoneHigh,
        createdAtIdx: i,
        touched,
        strength,
        confluence: nodeConfluence
      });
    }

    if (compactBase && base.close > base.open && downDisplacement > 0.0015) {
      const zoneLow = Math.min(base.low, base.open);
      const zoneHigh = Math.max(base.high, base.close);
      let touched = false;
      for (let j = i + 3; j < ohlc.length; j += 1) {
        if (ohlc[j].low <= zoneHigh && ohlc[j].high >= zoneLow) {
          touched = true;
          break;
        }
      }

      const strength = clamp01((downDisplacement / 0.006) * 0.55 + clamp01(volImpulse) * 0.3 + nodeConfluence * 0.15);
      zones.push({
        side: 'bearish',
        low: zoneLow,
        high: zoneHigh,
        createdAtIdx: i,
        touched,
        strength,
        confluence: nodeConfluence
      });
    }
  }

  return zones;
}

export function analyzeOrderBlocks(ohlcByTF: Partial<Record<string, OHLC[]>>, marketHealth: MarketHealthIndicators, timeframes: TimeframePatternIntel[]): OrderBlockResult {
  const primary = ohlcByTF['5m'] ?? ohlcByTF['15m'] ?? [];
  if (primary.length < 30) {
    return { score: 0.3, direction: 'neutral', fresh: 0, used: 0, details: { reason: 'insufficient_history' } };
  }

  const profile = buildVolumeProfile(primary.slice(-180));
  const zones = detectOrderBlocks(primary.slice(-180), profile);
  const freshZones = zones.filter(z => !z.touched);
  const usedZones = zones.filter(z => z.touched);

  const lastPrice = primary[primary.length - 1]?.close ?? 0;
  const bullish = zones
    .filter(z => z.side === 'bullish')
    .sort((a, b) => Math.abs((a.low + a.high) * 0.5 - lastPrice) - Math.abs((b.low + b.high) * 0.5 - lastPrice));
  const bearish = zones
    .filter(z => z.side === 'bearish')
    .sort((a, b) => Math.abs((a.low + a.high) * 0.5 - lastPrice) - Math.abs((b.low + b.high) * 0.5 - lastPrice));

  const nearestBull = bullish[0];
  const nearestBear = bearish[0];
  const bullStrength = nearestBull?.strength ?? 0;
  const bearStrength = nearestBear?.strength ?? 0;
  const directionalDelta = bullStrength - bearStrength;
  const direction: OrderBlockResult['direction'] =
    directionalDelta > 0.08 ? 'bullish' :
    directionalDelta < -0.08 ? 'bearish' : 'neutral';

  const htfAgreement = (() => {
    const htf = timeframes.find(tf => tf.timeframe === '4h' || tf.timeframe === '1D')?.trendBias ?? 'neutral';
    if (htf === 'neutral' || direction === 'neutral') return 0.5;
    return htf === direction ? 1 : 0.2;
  })();

  const healthBoost = clamp01(((marketHealth.adx?.value ?? 20) - 15) / 25);
  const zoneQuality = clamp01(
    (freshZones.length > 0 ? 0.45 : 0.2) +
    Math.max(bullStrength, bearStrength) * 0.3 +
    htfAgreement * 0.15 +
    healthBoost * 0.1
  );

  return {
    score: zoneQuality,
    direction,
    fresh: freshZones.length,
    used: usedZones.length,
    nearestBullish: nearestBull
      ? {
          low: nearestBull.low,
          high: nearestBull.high,
          ageBars: Math.max(0, primary.length - 1 - nearestBull.createdAtIdx)
        }
      : undefined,
    nearestBearish: nearestBear
      ? {
          low: nearestBear.low,
          high: nearestBear.high,
          ageBars: Math.max(0, primary.length - 1 - nearestBear.createdAtIdx)
        }
      : undefined,
    volumeProfile: {
      vpoc: profile.vpoc,
      valueAreaLow: profile.valueAreaLow,
      valueAreaHigh: profile.valueAreaHigh,
      highVolumeNodeCount: profile.highVolumeNodes.length
    },
    details: {
      inspectedBars: Math.min(180, primary.length),
      directionalDelta,
      bullishZoneCount: bullish.length,
      bearishZoneCount: bearish.length,
      strongestBull: bullStrength,
      strongestBear: bearStrength,
      htfAgreement
    }
  };
}
