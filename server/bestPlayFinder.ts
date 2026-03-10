// bestPlayFinder.ts
// Finds the optimal 0DTE play using real options data + compression/expansion analysis

import type { OHLC } from '@shared/schema';

export interface RealOption {
  strike: number;
  side: 'call' | 'put';
  lastPrice: number;
  bid: number;
  ask: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
}

export interface BestPlay {
  symbol: string;
  direction: 'CALL' | 'PUT' | 'WAIT';
  strike: number;
  currentPrice: number;
  spotPrice: number;
  
  // Premium info
  bid: number;
  ask: number;
  spread: number;
  spreadPct: number;
  
  // Liquidity
  volume: number;
  openInterest: number;
  liquidityScore: number;
  
  // Greeks
  iv: number;
  estimatedDelta: number;
  
  // Expected outcome
  targetPrice: number;
  stopPrice: number;
  rrRatio: number;
  
  // Signal quality
  sparkScore: number;
  edgeScore: number;
  confidence: number;
  
  // Timing
  phase: 'WAIT' | 'PREPARE' | 'READY' | 'NOW';
  triggers: string[];
  
  // Reasoning
  reasons: string[];
}

export interface OptionsChainData {
  calls: RealOption[];
  puts: RealOption[];
  spotPrice: number;
  expiration: string;
}

// Calculate spread quality
function getSpreadScore(bid: number, ask: number): number {
  if (!bid || !ask || ask <= bid) return 0;
  const spread = ask - bid;
  const mid = (bid + ask) / 2;
  const spreadPct = spread / mid;
  
  // Tight spread (< 3%) = 100, Wide spread (> 10%) = 0
  if (spreadPct < 0.03) return 100;
  if (spreadPct < 0.05) return 80;
  if (spreadPct < 0.08) return 50;
  if (spreadPct < 0.10) return 30;
  return 10;
}

// Calculate liquidity score
function getLiquidityScore(volume: number, openInterest: number): number {
  const volScore = Math.min(100, volume / 100); // 10k+ volume = 100
  const oiScore = Math.min(100, openInterest / 50); // 5k+ OI = 100
  return (volScore * 0.7 + oiScore * 0.3);
}

// Estimate delta based on moneyness
function estimateDelta(strike: number, spot: number, side: 'call' | 'put'): number {
  const moneyness = (spot - strike) / spot;
  
  if (side === 'call') {
    if (moneyness > 0.02) return 0.7; // Deep ITM
    if (moneyness > 0.005) return 0.55; // Slightly ITM
    if (moneyness > -0.005) return 0.50; // ATM
    if (moneyness > -0.01) return 0.40; // Slightly OTM
    if (moneyness > -0.02) return 0.25; // OTM
    return 0.10; // Far OTM
  } else {
    if (moneyness < -0.02) return 0.7; // Deep ITM
    if (moneyness < -0.005) return 0.55;
    if (moneyness < 0.005) return 0.50;
    if (moneyness < 0.01) return 0.40;
    if (moneyness < 0.02) return 0.25;
    return 0.10;
  }
}

// Analyze compression state
function analyzeCompression(ohlc: OHLC[]): { 
  isCompressed: boolean; 
  isExpanding: boolean; 
  sparkScore: number; 
  triggers: string[] 
} {
  if (ohlc.length < 20) {
    return { isCompressed: false, isExpanding: false, sparkScore: 0, triggers: [] };
  }
  
  const triggers: string[] = [];
  let sparkScore = 0;
  
  const closes = ohlc.slice(-20).map(c => c.close);
  const last = ohlc[ohlc.length - 1];
  
  // BB Width
  const sma = closes.reduce((a, b) => a + b, 0) / 20;
  const stdDev = Math.sqrt(closes.reduce((sum, c) => sum + Math.pow(c - sma, 2), 0) / 20);
  const bbWidth = (stdDev * 4) / sma * 100;
  
  if (bbWidth < 1.5) { sparkScore += 25; triggers.push(`BB squeeze ${bbWidth.toFixed(1)}%`); }
  else if (bbWidth < 2.5) { sparkScore += 10; triggers.push(`Tight BB ${bbWidth.toFixed(1)}%`); }
  
  // Range compression
  const highs = ohlc.slice(-10).map(c => c.high);
  const lows = ohlc.slice(-10).map(c => c.low);
  const rangeHigh = Math.max(...highs);
  const rangeLow = Math.min(...lows);
  const rangePct = (rangeHigh - rangeLow) / last.close * 100;
  
  if (rangePct < 0.5) { sparkScore += 20; triggers.push(`Tight range ${rangePct.toFixed(2)}%`); }
  else if (rangePct < 1.0) { sparkScore += 10; triggers.push(`Compressed range ${rangePct.toFixed(2)}%`); }
  
  // Volume surge
  const volumes = ohlc.slice(-10).map(c => c.volume);
  const avgVol = volumes.slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const recentVol = volumes.slice(-2).reduce((a, b) => a + b, 0) / 2;
  const volRatio = recentVol / Math.max(avgVol, 1);
  
  if (volRatio > 2) { sparkScore += 25; triggers.push(`Volume surge ${volRatio.toFixed(1)}x`); }
  else if (volRatio > 1.5) { sparkScore += 15; triggers.push(`Volume building ${volRatio.toFixed(1)}x`); }
  
  // Range expansion (breakout)
  const lastRange = (last.high - last.low) / last.close * 100;
  const prevBar = ohlc[ohlc.length - 2];
  const prevRange = (prevBar.high - prevBar.low) / prevBar.close * 100;
  
  if (lastRange > prevRange * 1.5) { sparkScore += 20; triggers.push('Range expanding'); }
  
  // Breakout detection
  const prev5High = Math.max(...ohlc.slice(-6, -1).map(c => c.high));
  const prev5Low = Math.min(...ohlc.slice(-6, -1).map(c => c.low));
  
  if (last.close > prev5High) { sparkScore += 25; triggers.push('Breakout UP'); }
  if (last.close < prev5Low) { sparkScore += 25; triggers.push('Breakout DOWN'); }
  
  const isCompressed = bbWidth < 2.5 || rangePct < 1.0;
  const isExpanding = lastRange > prevRange * 1.3 || volRatio > 1.5;
  
  return { isCompressed, isExpanding, sparkScore, triggers };
}

// Find the best play from real options chain
export function findBestPlay(
  chain: OptionsChainData,
  ohlc: OHLC[],
  direction: 'bullish' | 'bearish' | 'neutral',
  edge: number,
  confidence: number
): BestPlay | null {
  const { calls, puts, spotPrice } = chain;
  
  if (!calls.length && !puts.length) return null;
  
  const compression = analyzeCompression(ohlc);
  
  // Determine trade direction
  let tradeDirection: 'CALL' | 'PUT' | 'WAIT' = 'WAIT';
  const reasons: string[] = [];
  
  if (direction === 'bullish' && edge >= 15) {
    tradeDirection = 'CALL';
    reasons.push(`Bullish bias with ${edge}% edge`);
  } else if (direction === 'bearish' && edge >= 15) {
    tradeDirection = 'PUT';
    reasons.push(`Bearish bias with ${edge}% edge`);
  } else if (compression.sparkScore >= 50) {
    // Let compression breakout determine direction
    if (compression.triggers.some(t => t.includes('UP'))) {
      tradeDirection = 'CALL';
      reasons.push('Compression breakout UP');
    } else if (compression.triggers.some(t => t.includes('DOWN'))) {
      tradeDirection = 'PUT';
      reasons.push('Compression breakout DOWN');
    }
  }
  
  if (tradeDirection === 'WAIT') {
    reasons.push('No clear edge or breakout');
  }
  
  // Select options to search
  const options = tradeDirection === 'CALL' ? calls : 
                  tradeDirection === 'PUT' ? puts : [];
  
  if (options.length === 0) {
    return {
      symbol: '',
      direction: 'WAIT',
      strike: 0,
      currentPrice: 0,
      spotPrice,
      bid: 0,
      ask: 0,
      spread: 0,
      spreadPct: 0,
      volume: 0,
      openInterest: 0,
      liquidityScore: 0,
      iv: 0,
      estimatedDelta: 0,
      targetPrice: 0,
      stopPrice: 0,
      rrRatio: 0,
      sparkScore: compression.sparkScore,
      edgeScore: edge,
      confidence,
      phase: 'WAIT',
      triggers: compression.triggers,
      reasons
    };
  }
  
  // Score each option
  const scored = options.map(opt => {
    const spreadScore = getSpreadScore(opt.bid, opt.ask);
    const liquidityScore = getLiquidityScore(opt.volume, opt.openInterest);
    const delta = estimateDelta(opt.strike, spotPrice, tradeDirection === 'CALL' ? 'call' : 'put');
    
    // Delta scoring: prefer 0.30-0.50 for balanced risk/reward
    let deltaScore = 0;
    if (delta >= 0.30 && delta <= 0.50) deltaScore = 100;
    else if (delta >= 0.20 && delta <= 0.60) deltaScore = 70;
    else if (delta >= 0.15) deltaScore = 40;
    else deltaScore = 20;
    
    // Distance from ATM
    const distancePct = Math.abs(opt.strike - spotPrice) / spotPrice * 100;
    let distanceScore = 0;
    if (distancePct < 0.5) distanceScore = 100; // ATM
    else if (distancePct < 1) distanceScore = 80;
    else if (distancePct < 1.5) distanceScore = 60;
    else if (distancePct < 2) distanceScore = 40;
    else distanceScore = 20;
    
    const totalScore = (
      spreadScore * 0.25 +
      liquidityScore * 0.25 +
      deltaScore * 0.25 +
      distanceScore * 0.25
    );
    
    return { ...opt, totalScore, spreadScore, liquidityScore, delta, distancePct };
  });
  
  // Sort by score and take best
  scored.sort((a, b) => b.totalScore - a.totalScore);
  const best = scored[0];
  
  if (!best) return null;
  
  // Calculate expected move targets
  const expectedMove = spotPrice * 0.005; // 0.5% move
  const targetMove = expectedMove * (compression.sparkScore >= 50 ? 1.5 : 1);
  
  const targetSpot = tradeDirection === 'CALL' 
    ? spotPrice + targetMove 
    : spotPrice - targetMove;
  
  // Premium targets
  const mid = (best.bid + best.ask) / 2;
  const targetPrice = mid * (1 + best.delta * (targetMove / spotPrice) * 10);
  const stopPrice = mid * 0.5; // 50% stop
  const rrRatio = (targetPrice - mid) / (mid - stopPrice);
  
  // Determine phase
  let phase: BestPlay['phase'] = 'WAIT';
  if (compression.sparkScore >= 70) phase = 'NOW';
  else if (compression.sparkScore >= 50) phase = 'READY';
  else if (compression.sparkScore >= 30) phase = 'PREPARE';
  
  return {
    symbol: '',
    direction: tradeDirection,
    strike: best.strike,
    currentPrice: mid,
    spotPrice,
    bid: best.bid,
    ask: best.ask,
    spread: best.ask - best.bid,
    spreadPct: (best.ask - best.bid) / mid * 100,
    volume: best.volume,
    openInterest: best.openInterest,
    liquidityScore: best.liquidityScore,
    iv: best.impliedVolatility * 100,
    estimatedDelta: best.delta,
    targetPrice,
    stopPrice,
    rrRatio,
    sparkScore: compression.sparkScore,
    edgeScore: edge,
    confidence,
    phase,
    triggers: compression.triggers,
    reasons
  };
}
