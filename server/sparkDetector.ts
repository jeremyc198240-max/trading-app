// sparkDetector.ts
// Identifies the "spark" moment when options contracts are about to run
// Combines compression, momentum acceleration, and volume surge

import { OHLC } from './fusion';

export interface SparkSignal {
  isIgniting: boolean;
  sparkScore: number;  // 0-100
  phase: 'dormant' | 'building' | 'ready' | 'igniting' | 'running';
  triggers: string[];
  urgency: 'none' | 'watch' | 'prepare' | 'now';
  expectedMoveMultiplier: number; // 1.0 = normal, 2.0+ = explosive
}

interface CompressionState {
  isCompressed: boolean;
  compressionBars: number;
  bbWidth: number;
  rangePercent: number;
}

interface MomentumState {
  isAccelerating: boolean;
  velocity: number;
  acceleration: number;
  breakingOut: boolean;
}

interface VolumeState {
  isSurging: boolean;
  volumeRatio: number;
  volumeTrend: 'fading' | 'flat' | 'building' | 'surging';
}

// Detect compression - coiling before the move
function detectCompression(ohlc: OHLC[]): CompressionState {
  if (ohlc.length < 20) {
    return { isCompressed: false, compressionBars: 0, bbWidth: 0.05, rangePercent: 0.02 };
  }

  const period = 20;
  const closes = ohlc.slice(-period).map(c => c.close);
  const last = ohlc[ohlc.length - 1];
  
  // Bollinger Band width
  const sma = closes.reduce((a, b) => a + b, 0) / period;
  const stdDev = Math.sqrt(closes.reduce((sum, c) => sum + Math.pow(c - sma, 2), 0) / period);
  const bbWidth = (stdDev * 2 * 2) / sma;
  
  // Price range compression
  const highs = ohlc.slice(-period).map(c => c.high);
  const lows = ohlc.slice(-period).map(c => c.low);
  const rangeHigh = Math.max(...highs);
  const rangeLow = Math.min(...lows);
  const rangePercent = (rangeHigh - rangeLow) / last.close;
  
  // Count consecutive compression bars
  let compressionBars = 0;
  for (let i = ohlc.length - 1; i >= Math.max(0, ohlc.length - 10); i--) {
    const bar = ohlc[i];
    const barRange = (bar.high - bar.low) / bar.close;
    if (barRange < 0.003) { // Less than 0.3% range = tight bar
      compressionBars++;
    } else {
      break;
    }
  }
  
  // SPY is compressed when BB width < 1.5% and range < 0.8%
  const isCompressed = bbWidth < 0.015 || rangePercent < 0.008 || compressionBars >= 3;
  
  return { isCompressed, compressionBars, bbWidth, rangePercent };
}

// Detect momentum acceleration - the spark firing
function detectMomentumAcceleration(ohlc: OHLC[]): MomentumState {
  if (ohlc.length < 10) {
    return { isAccelerating: false, velocity: 0, acceleration: 0, breakingOut: false };
  }
  
  const last = ohlc[ohlc.length - 1];
  const prev = ohlc[ohlc.length - 2];
  const prev2 = ohlc[ohlc.length - 3];
  
  // Current velocity (price change)
  const velocity = (last.close - prev.close) / prev.close;
  const prevVelocity = (prev.close - prev2.close) / prev2.close;
  
  // Acceleration (change in velocity)
  const acceleration = velocity - prevVelocity;
  
  // Is momentum accelerating in same direction?
  const sameDirection = Math.sign(velocity) === Math.sign(prevVelocity);
  const isAccelerating = sameDirection && Math.abs(acceleration) > 0.0005;
  
  // Breakout detection - big candle breaking range
  const recentHigh = Math.max(...ohlc.slice(-10, -1).map(c => c.high));
  const recentLow = Math.min(...ohlc.slice(-10, -1).map(c => c.low));
  const breakingOut = last.close > recentHigh || last.close < recentLow;
  
  return { isAccelerating, velocity, acceleration, breakingOut };
}

// Detect volume surge
function detectVolumeSurge(ohlc: OHLC[]): VolumeState {
  if (ohlc.length < 20) {
    return { isSurging: false, volumeRatio: 1, volumeTrend: 'flat' };
  }
  
  const volumes = ohlc.slice(-20).map(c => c.volume);
  const avgVolume = volumes.slice(0, -1).reduce((a, b) => a + b, 0) / (volumes.length - 1);
  const currentVolume = volumes[volumes.length - 1];
  const volumeRatio = currentVolume / Math.max(avgVolume, 1);
  
  // Recent volume trend (last 5 bars)
  const recent5 = volumes.slice(-5);
  const older5 = volumes.slice(-10, -5);
  const recentAvg = recent5.reduce((a, b) => a + b, 0) / 5;
  const olderAvg = older5.reduce((a, b) => a + b, 0) / 5;
  const volumeChange = (recentAvg - olderAvg) / Math.max(olderAvg, 1);
  
  let volumeTrend: 'fading' | 'flat' | 'building' | 'surging';
  if (volumeRatio > 2 && volumeChange > 0.3) {
    volumeTrend = 'surging';
  } else if (volumeChange > 0.2) {
    volumeTrend = 'building';
  } else if (volumeChange < -0.2) {
    volumeTrend = 'fading';
  } else {
    volumeTrend = 'flat';
  }
  
  const isSurging = volumeRatio > 1.5 || volumeTrend === 'surging';
  
  return { isSurging, volumeRatio, volumeTrend };
}

// Main spark detector
export function detectSpark(ohlc: OHLC[]): SparkSignal {
  if (ohlc.length < 20) {
    return {
      isIgniting: false,
      sparkScore: 0,
      phase: 'dormant',
      triggers: [],
      urgency: 'none',
      expectedMoveMultiplier: 1.0
    };
  }
  
  const compression = detectCompression(ohlc);
  const momentum = detectMomentumAcceleration(ohlc);
  const volume = detectVolumeSurge(ohlc);
  
  const triggers: string[] = [];
  let sparkScore = 0;
  
  // Compression contributes to potential energy
  if (compression.isCompressed) {
    sparkScore += 20;
    triggers.push(`Compression (BB: ${(compression.bbWidth * 100).toFixed(1)}%)`);
  }
  if (compression.compressionBars >= 3) {
    sparkScore += 15;
    triggers.push(`${compression.compressionBars} tight bars`);
  }
  
  // Momentum acceleration is the spark
  if (momentum.isAccelerating) {
    sparkScore += 25;
    triggers.push(`Momentum accelerating (${(momentum.acceleration * 10000).toFixed(1)}bps)`);
  }
  if (momentum.breakingOut) {
    sparkScore += 20;
    triggers.push('Range breakout');
  }
  
  // Volume surge confirms the move
  if (volume.isSurging) {
    sparkScore += 15;
    triggers.push(`Volume surge (${volume.volumeRatio.toFixed(1)}x avg)`);
  }
  if (volume.volumeTrend === 'building') {
    sparkScore += 10;
    triggers.push('Volume building');
  }
  
  // Bonus for compression + breakout combo (the ideal setup)
  if (compression.isCompressed && momentum.breakingOut) {
    sparkScore += 15;
    triggers.push('COMPRESSION BREAKOUT');
  }
  
  // Bonus for volume confirmation on breakout
  if (momentum.breakingOut && volume.isSurging) {
    sparkScore += 10;
    triggers.push('Volume-confirmed breakout');
  }
  
  // Determine phase
  let phase: SparkSignal['phase'];
  let urgency: SparkSignal['urgency'];
  
  if (sparkScore >= 70) {
    phase = 'igniting';
    urgency = 'now';
  } else if (sparkScore >= 50) {
    phase = 'ready';
    urgency = 'prepare';
  } else if (sparkScore >= 30) {
    phase = 'building';
    urgency = 'watch';
  } else if (compression.isCompressed) {
    phase = 'dormant';
    urgency = 'watch';
  } else {
    phase = 'dormant';
    urgency = 'none';
  }
  
  // Expected move multiplier based on compression + volume
  let expectedMoveMultiplier = 1.0;
  if (compression.isCompressed) {
    expectedMoveMultiplier += 0.3; // Compressed = bigger move potential
  }
  if (volume.isSurging) {
    expectedMoveMultiplier += 0.4; // Volume surge = sustained move
  }
  if (momentum.breakingOut) {
    expectedMoveMultiplier += 0.3; // Breakout = momentum
  }
  
  const isIgniting = phase === 'igniting' || phase === 'ready';
  
  return {
    isIgniting,
    sparkScore: Math.min(100, sparkScore),
    phase,
    triggers,
    urgency,
    expectedMoveMultiplier
  };
}
