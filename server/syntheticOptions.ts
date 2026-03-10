// syntheticOptions.ts - Synthetic options chain generation with scoring and premium modeling

import type { OHLC } from "@shared/schema";
import type { MonsterOTMEngineOutput, PCESignal, OTMPlay } from "./monsterOTM";
import { runMonsterOTMSimple } from "./monsterOTM";
import { computeATR } from "./indicators";

// Strike interval based on underlying price
// Major ETFs like SPY, QQQ use $1 intervals for 0DTE
function getStrikeInterval(price: number, symbol?: string): number {
  // Major liquid ETFs always use $1 intervals
  const liquidETFs = ['SPY', 'QQQ', 'IWM', 'DIA'];
  if (symbol && liquidETFs.includes(symbol.toUpperCase())) {
    return 1;
  }
  
  if (price < 25) return 0.5;
  if (price < 50) return 1;
  if (price < 100) return 1;
  if (price < 200) return 2.5;
  if (price < 500) return 5;
  // High-priced stocks still use smaller intervals
  if (price < 1000) return 5;
  return 10;
}

// Round to nearest strike
function roundToStrike(price: number, interval: number): number {
  return Math.round(price / interval) * interval;
}

// Generate expiration dates (0DTE, weekly, monthly)
export interface ExpirationDate {
  label: string;
  date: string;
  daysToExpiry: number;
  type: '0DTE' | 'weekly' | 'monthly';
}

function generateExpirations(): ExpirationDate[] {
  const now = new Date();
  const expirations: ExpirationDate[] = [];
  
  // 0DTE - today if market hours, else next trading day
  const dayOfWeek = now.getDay();
  let daysTo0DTE = 0;
  if (dayOfWeek === 0) daysTo0DTE = 1; // Sunday -> Monday
  else if (dayOfWeek === 6) daysTo0DTE = 2; // Saturday -> Monday
  
  const zeroDate = new Date(now);
  zeroDate.setDate(zeroDate.getDate() + daysTo0DTE);
  expirations.push({
    label: '0DTE',
    date: zeroDate.toISOString().split('T')[0],
    daysToExpiry: daysTo0DTE,
    type: '0DTE'
  });
  
  // Find next Friday for weekly
  const daysUntilFriday = (5 - dayOfWeek + 7) % 7 || 7;
  const weeklyDate = new Date(now);
  weeklyDate.setDate(weeklyDate.getDate() + daysUntilFriday);
  expirations.push({
    label: `${weeklyDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    date: weeklyDate.toISOString().split('T')[0],
    daysToExpiry: daysUntilFriday,
    type: 'weekly'
  });
  
  // Next week Friday
  const nextWeeklyDate = new Date(weeklyDate);
  nextWeeklyDate.setDate(nextWeeklyDate.getDate() + 7);
  expirations.push({
    label: `${nextWeeklyDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    date: nextWeeklyDate.toISOString().split('T')[0],
    daysToExpiry: daysUntilFriday + 7,
    type: 'weekly'
  });
  
  // Monthly - 3rd Friday of next month
  const monthlyDate = new Date(now);
  monthlyDate.setMonth(monthlyDate.getMonth() + 1);
  monthlyDate.setDate(1);
  // Find first Friday
  while (monthlyDate.getDay() !== 5) {
    monthlyDate.setDate(monthlyDate.getDate() + 1);
  }
  // Add 2 weeks for 3rd Friday
  monthlyDate.setDate(monthlyDate.getDate() + 14);
  const monthlyDays = Math.ceil((monthlyDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  expirations.push({
    label: `${monthlyDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
    date: monthlyDate.toISOString().split('T')[0],
    daysToExpiry: monthlyDays,
    type: 'monthly'
  });
  
  return expirations;
}

// Greeks approximation using Black-Scholes-like formulas
export interface SyntheticGreeks {
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  iv: number;
}

function approximateGreeks(
  spotPrice: number,
  strike: number,
  daysToExpiry: number,
  volatilityRegime: number, // 0-1 scale
  side: 'call' | 'put'
): SyntheticGreeks {
  const T = Math.max(daysToExpiry / 365, 0.001);
  const iv = 0.15 + volatilityRegime * 0.35; // 15-50% IV range
  
  const moneyness = (spotPrice - strike) / spotPrice;
  const otmPct = Math.abs(moneyness);
  
  // Delta approximation based on moneyness and time
  let rawDelta = 0.5;
  if (side === 'call') {
    rawDelta = 0.5 + (moneyness * 2); // Simplified
    rawDelta = Math.max(0.01, Math.min(0.99, rawDelta));
  } else {
    rawDelta = -0.5 + (moneyness * 2);
    rawDelta = Math.max(-0.99, Math.min(-0.01, rawDelta));
  }
  
  // Adjust for time decay
  const timeAdjust = Math.sqrt(T);
  const delta = side === 'call' 
    ? Math.max(0.01, Math.min(0.99, 0.5 + moneyness / (0.5 * timeAdjust)))
    : Math.max(-0.99, Math.min(-0.01, -0.5 + moneyness / (0.5 * timeAdjust)));
  
  // Gamma peaks ATM
  const gamma = Math.exp(-otmPct * otmPct * 50) * 0.05 / timeAdjust;
  
  // Theta (time decay) - higher for ATM and short-dated
  const theta = -spotPrice * iv * Math.exp(-otmPct * otmPct * 20) / (2 * Math.sqrt(T) * 365);
  
  // Vega - higher for ATM and longer-dated
  const vega = spotPrice * Math.sqrt(T) * Math.exp(-otmPct * otmPct * 30) * 0.01;
  
  return {
    delta: Math.abs(delta),
    gamma,
    theta,
    vega,
    iv
  };
}

// Premium estimation
function estimatePremium(
  spotPrice: number,
  strike: number,
  daysToExpiry: number,
  iv: number,
  side: 'call' | 'put'
): number {
  const T = Math.max(daysToExpiry / 365, 0.001);
  const moneyness = side === 'call' ? spotPrice - strike : strike - spotPrice;
  
  // Intrinsic value
  const intrinsic = Math.max(0, moneyness);
  
  // Time value approximation (simplified Black-Scholes-like)
  const timeValue = spotPrice * iv * Math.sqrt(T) * 0.4 * Math.exp(-Math.abs(moneyness / spotPrice) * 3);
  
  return Math.max(0.01, intrinsic + timeValue);
}

// Contract scoring
export interface ContractScore {
  total: number;        // 0-100
  pceAlignment: number; // 0-25
  monsterGate: number;  // 0-25
  deltaScore: number;   // 0-20
  rrScore: number;      // 0-20
  liquidityScore: number; // 0-10
  reasons: string[];
}

function scoreContract(
  strike: number,
  spotPrice: number,
  delta: number,
  daysToExpiry: number,
  pce: PCESignal,
  direction: 'call' | 'put',
  expectedMovePercent: number
): ContractScore {
  const reasons: string[] = [];
  
  // PCE Alignment (0-25)
  let pceAlignment = 0;
  if (pce.quality === 'A') pceAlignment = 25;
  else if (pce.quality === 'B') pceAlignment = 18;
  else if (pce.quality === 'C') pceAlignment = 10;
  
  if (pce.monster) {
    pceAlignment = Math.min(25, pceAlignment + 5);
    reasons.push('Monster setup');
  }
  if (pce.ignition) {
    reasons.push('Ignition confirmed');
  }
  
  // Direction alignment
  const directionMatch = 
    (direction === 'call' && pce.direction === 'bullish') ||
    (direction === 'put' && pce.direction === 'bearish');
  if (!directionMatch && pce.direction !== 'none') {
    pceAlignment = Math.floor(pceAlignment * 0.5);
    reasons.push('Direction mismatch');
  }
  
  // Monster Gate (0-25) - Tuned for more plays
  let monsterGate = 0;
  if (pce.pceProb >= 0.70) {
    monsterGate = 25;
    reasons.push('Monster tier');
  } else if (pce.pceProb >= 0.50) {
    monsterGate = 20;
    reasons.push('Aggressive tier');
  } else if (pce.pceProb >= 0.35) {
    monsterGate = 15;
    reasons.push('Setup developing');
  } else if (pce.pceProb >= 0.25) {
    monsterGate = 8;
  }
  
  // Delta score (0-20) - Sweet spot is 0.20-0.40
  let deltaScore = 0;
  if (delta >= 0.20 && delta <= 0.40) {
    deltaScore = 20;
    reasons.push('Optimal delta range');
  } else if (delta >= 0.15 && delta <= 0.50) {
    deltaScore = 15;
  } else if (delta >= 0.10 && delta <= 0.60) {
    deltaScore = 10;
  } else {
    deltaScore = 5;
    reasons.push(delta > 0.60 ? 'High delta (ITM bias)' : 'Low delta (lottery)');
  }
  
  // R:R score (0-20) - Based on expected move vs strike distance
  const otmPct = Math.abs((strike - spotPrice) / spotPrice);
  const moveReach = expectedMovePercent > 0 ? otmPct / expectedMovePercent : 1;
  let rrScore = 0;
  if (moveReach <= 0.5) {
    rrScore = 20;
    reasons.push('Strike within expected move');
  } else if (moveReach <= 0.8) {
    rrScore = 15;
  } else if (moveReach <= 1.0) {
    rrScore = 10;
  } else {
    rrScore = 5;
    reasons.push('Strike beyond expected move');
  }
  
  // Liquidity score (0-10) - Closer to ATM = better liquidity
  let liquidityScore = 0;
  if (otmPct <= 0.01) liquidityScore = 10;
  else if (otmPct <= 0.02) liquidityScore = 8;
  else if (otmPct <= 0.03) liquidityScore = 6;
  else if (otmPct <= 0.05) liquidityScore = 4;
  else liquidityScore = 2;
  
  // Expiration bonus - 0DTE/weekly preferred for momentum plays
  if (daysToExpiry <= 1 && pce.ignition) {
    rrScore = Math.min(20, rrScore + 3);
    reasons.push('0DTE ignition play');
  }
  
  const total = pceAlignment + monsterGate + deltaScore + rrScore + liquidityScore;
  
  return {
    total,
    pceAlignment,
    monsterGate,
    deltaScore,
    rrScore,
    liquidityScore,
    reasons
  };
}

// Premium expansion modeling
export interface PremiumExpansionModel {
  currentPremium: number;
  targetPremium: number;
  stopPremium: number;
  expansionPercent: number;
  expectedGain: number;
  riskAmount: number;
  rrRatio: number;
  confidence: number;
  notes: string[];
}

function modelPremiumExpansion(
  premium: number,
  delta: number,
  gamma: number,
  theta: number,
  expectedMovePoints: number,
  daysToExpiry: number,
  volatilityRegime: number
): PremiumExpansionModel {
  const notes: string[] = [];
  
  // Delta contribution to premium change
  const deltaGain = delta * expectedMovePoints;
  
  // Gamma acceleration (convexity)
  const gammaGain = 0.5 * gamma * expectedMovePoints * expectedMovePoints;
  
  // Theta decay over expected holding period (assume 1-3 days)
  const holdDays = Math.min(daysToExpiry, 2);
  const thetaLoss = Math.abs(theta) * holdDays;
  
  // Vega impact from volatility expansion
  const vegaBoost = volatilityRegime > 0.6 ? premium * 0.1 : 0;
  
  const netGain = deltaGain + gammaGain - thetaLoss + vegaBoost;
  const targetPremium = premium + netGain;
  const expansionPercent = (netGain / premium) * 100;
  
  // Stop loss at 40% of premium
  const riskAmount = premium * 0.4;
  const stopPremium = premium * 0.6;
  
  const rrRatio = netGain > 0 ? netGain / riskAmount : 0;
  
  // Confidence based on setup quality
  let confidence = 50;
  if (rrRatio >= 3) {
    confidence += 20;
    notes.push('Strong R:R');
  }
  if (expansionPercent >= 100) {
    confidence += 15;
    notes.push('2x potential');
  }
  if (daysToExpiry <= 1 && expansionPercent >= 50) {
    confidence += 10;
    notes.push('0DTE momentum');
  }
  if (volatilityRegime > 0.7) {
    confidence -= 10;
    notes.push('High volatility risk');
  }
  
  confidence = Math.max(0, Math.min(100, confidence));
  
  return {
    currentPremium: premium,
    targetPremium: Math.max(premium * 1.1, targetPremium),
    stopPremium,
    expansionPercent,
    expectedGain: netGain,
    riskAmount,
    rrRatio,
    confidence,
    notes
  };
}

// Single contract in the chain
export interface SyntheticContract {
  strike: number;
  side: 'call' | 'put';
  expiration: ExpirationDate;
  premium: number;
  greeks: SyntheticGreeks;
  score: ContractScore;
  expansion: PremiumExpansionModel;
  isRecommended: boolean;
  rank: number;
}

// Full synthetic chain
export interface SyntheticOptionsChain {
  symbol: string;
  spotPrice: number;
  atmStrike: number;
  strikeInterval: number;
  expirations: ExpirationDate[];
  calls: SyntheticContract[];
  puts: SyntheticContract[];
  topPlays: SyntheticContract[];
  monsterPlay: SyntheticContract | null;
  pce: PCESignal;
  meta: MonsterOTMEngineOutput['meta'];
}

// Main chain generator
export function generateSyntheticChain(
  ohlc: OHLC[],
  symbol: string,
  spotPrice?: number
): SyntheticOptionsChain {
  // Run Monster OTM analysis
  const monsterOutput = runMonsterOTMSimple(ohlc);
  const { pce, meta } = monsterOutput;
  
  // Get spot price
  const lastPrice = spotPrice ?? ohlc[ohlc.length - 1]?.close ?? 100;
  
  // Get ATR for expected move
  const atr = computeATR(ohlc);
  const expectedMovePoints = atr?.value ?? lastPrice * 0.02;
  const expectedMovePercent = expectedMovePoints / lastPrice;
  
  // Volatility regime (0-1)
  const volatilityRegime = meta.confidence;
  
  // Strike setup - pass symbol for proper interval detection
  const interval = getStrikeInterval(lastPrice, symbol);
  const atmStrike = roundToStrike(lastPrice, interval);
  
  // Generate expirations
  const expirations = generateExpirations();
  
  // Generate strikes (20 OTM on each side + ATM for liquid ETFs, 10 for others)
  const liquidETFs = ['SPY', 'QQQ', 'IWM', 'DIA'];
  const strikeRange = liquidETFs.includes(symbol.toUpperCase()) ? 20 : 10;
  const strikes: number[] = [];
  for (let i = -strikeRange; i <= strikeRange; i++) {
    strikes.push(atmStrike + i * interval);
  }
  
  const calls: SyntheticContract[] = [];
  const puts: SyntheticContract[] = [];
  
  // Generate contracts for each strike and expiration
  for (const strike of strikes) {
    for (const expiration of expirations) {
      // Call
      const callGreeks = approximateGreeks(lastPrice, strike, expiration.daysToExpiry, volatilityRegime, 'call');
      const callPremium = estimatePremium(lastPrice, strike, expiration.daysToExpiry, callGreeks.iv, 'call');
      const callScore = scoreContract(strike, lastPrice, callGreeks.delta, expiration.daysToExpiry, pce, 'call', expectedMovePercent);
      const callExpansion = modelPremiumExpansion(callPremium, callGreeks.delta, callGreeks.gamma, callGreeks.theta, expectedMovePoints, expiration.daysToExpiry, volatilityRegime);
      
      calls.push({
        strike,
        side: 'call',
        expiration,
        premium: callPremium,
        greeks: callGreeks,
        score: callScore,
        expansion: callExpansion,
        isRecommended: false,
        rank: 0
      });
      
      // Put
      const putGreeks = approximateGreeks(lastPrice, strike, expiration.daysToExpiry, volatilityRegime, 'put');
      const putPremium = estimatePremium(lastPrice, strike, expiration.daysToExpiry, putGreeks.iv, 'put');
      const putScore = scoreContract(strike, lastPrice, putGreeks.delta, expiration.daysToExpiry, pce, 'put', expectedMovePercent);
      const putExpansion = modelPremiumExpansion(putPremium, putGreeks.delta, putGreeks.gamma, putGreeks.theta, expectedMovePoints, expiration.daysToExpiry, volatilityRegime);
      
      puts.push({
        strike,
        side: 'put',
        expiration,
        premium: putPremium,
        greeks: putGreeks,
        score: putScore,
        expansion: putExpansion,
        isRecommended: false,
        rank: 0
      });
    }
  }
  
  // Combine and rank all contracts
  const allContracts = [...calls, ...puts];
  allContracts.sort((a, b) => b.score.total - a.score.total);
  
  // Assign ranks
  allContracts.forEach((c, i) => {
    c.rank = i + 1;
  });
  
  // Top 5 plays
  const topPlays = allContracts.slice(0, 5);
  topPlays.forEach(c => { c.isRecommended = true; });
  
  // Monster play (if available)
  let monsterPlay: SyntheticContract | null = null;
  if (pce.monster && pce.direction !== 'none') {
    const side = pce.direction === 'bullish' ? 'call' : 'put';
    const candidates = (side === 'call' ? calls : puts)
      .filter(c => c.expiration.type === '0DTE' || c.expiration.daysToExpiry <= 2)
      .filter(c => c.greeks.delta >= 0.20 && c.greeks.delta <= 0.45);
    
    if (candidates.length > 0) {
      candidates.sort((a, b) => b.score.total - a.score.total);
      monsterPlay = candidates[0];
      monsterPlay.isRecommended = true;
    }
  }
  
  return {
    symbol,
    spotPrice: lastPrice,
    atmStrike,
    strikeInterval: interval,
    expirations,
    calls: calls.sort((a, b) => b.strike - a.strike), // Descending for calls
    puts: puts.sort((a, b) => a.strike - b.strike),   // Ascending for puts
    topPlays,
    monsterPlay,
    pce,
    meta
  };
}

// API response type
export interface MonsterOTMPanelData {
  chain: SyntheticOptionsChain;
  hasMonsterPlay: boolean;
  topPlay: SyntheticContract | null;
  direction: 'bullish' | 'bearish' | 'neutral';
  setupQuality: 'A' | 'B' | 'C' | 'none';
  summary: string;
  isSynthetic: boolean;
  disclaimer: string;
}

export function getMonsterOTMPanelData(
  ohlc: OHLC[],
  symbol: string,
  spotPrice?: number
): MonsterOTMPanelData {
  const chain = generateSyntheticChain(ohlc, symbol, spotPrice);
  
  const hasMonsterPlay = chain.monsterPlay !== null;
  const topPlay = chain.topPlays[0] ?? null;
  const direction = chain.pce.direction === 'none' ? 'neutral' : chain.pce.direction;
  const setupQuality = chain.pce.quality;
  
  // Generate summary
  let summary = '';
  if (hasMonsterPlay && chain.monsterPlay) {
    const mp = chain.monsterPlay;
    summary = `MONSTER ${mp.side.toUpperCase()} $${mp.strike} (${mp.expiration.label}) - Score ${mp.score.total}/100 - ${mp.expansion.expansionPercent.toFixed(0)}% expansion potential`;
  } else if (topPlay) {
    summary = `Top play: ${topPlay.side.toUpperCase()} $${topPlay.strike} (${topPlay.expiration.label}) - Score ${topPlay.score.total}/100`;
  } else {
    summary = 'No high-conviction plays detected. Wait for PCE setup.';
  }
  
  return {
    chain,
    hasMonsterPlay,
    topPlay,
    direction,
    setupQuality,
    summary,
    isSynthetic: true,
    disclaimer: 'Synthetic options chain for educational purposes. Premiums and Greeks are approximated. Verify with live data before trading.'
  };
}
