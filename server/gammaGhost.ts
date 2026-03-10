// =======================================
// GAMMA GHOST v5 — RUTHLESS LIQUIDITY ENGINE
// =======================================
// Design goals:
// - Strong, non-negotiable distance + EM gating
// - Stable GEX normalization (no maxGex drift)
// - Hard walls/magnets only where it truly matters
// - Strike-spacing aware voids
// - Side bias from actual exposure, not just OI
// - Fallback anchors that actually stabilize the map

export type OptionSide = "call" | "put";

export interface OptionContract {
  symbol: string;
  side: OptionSide;
  strike: number;
  expiry: string;
  delta: number;
  iv: number;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  openInterest: number;
}

export interface UnderlyingSnapshot {
  symbol: string;
  spot: number;
  timestamp: string;
  expectedMovePct?: number;
}

export interface LiquidityLevel {
  strike: number;
  gammaScore: number;
  gammaExposure: number;
  oi: number;
  volume: number;
  distance: number;
  distancePct: number;
  sideBias: "call" | "put" | "mixed";
  withinExpectedMove: boolean;
}

export interface GammaFlipZone {
  strike: number;
  flipType: 'positive_to_negative' | 'negative_to_positive';
  significance: number;
}

export interface NetGexAnalysis {
  totalNetGex: number;
  callGex: number;
  putGex: number;
  dealerPositioning: 'long_gamma' | 'short_gamma' | 'neutral';
  flipZone: GammaFlipZone | null;
  gexTilt: number;
}

export interface LiquidityMap {
  nearestAbove: LiquidityLevel | null;
  nearestBelow: LiquidityLevel | null;
  wallsAbove: LiquidityLevel[];
  wallsBelow: LiquidityLevel[];
  magnets: LiquidityLevel[];
  voidZones: { from: number; to: number; gapPct?: number; type?: 'minor' | 'major' }[];
  liquidityBias: "bullish" | "bearish" | "neutral";
  confidence: number;
  expectedMoveRange: { low: number; high: number };
  pinning?: { isPinned: boolean; pinStrike: number | null; pinStrength: number };
  netGex?: NetGexAnalysis;
  volatilityRegime?: 'low' | 'normal' | 'high' | 'extreme';
  actionableInsight?: string;
}

const CFG = {
  // Base liquidity filters
  minOi: 200,           // Lowered from 300 - catch more levels
  minVolume: 50,        // Lowered from 100 - catch more levels

  // Gamma score thresholds (normalized 0-1 scale)
  wallGammaScoreMin: 0.25,      // Lowered from 0.35 - catch more walls
  magnetGammaScoreMin: 0.40,    // Lowered from 0.55 - detect magnets
  superMagnetScoreMin: 0.60,    // New: high-conviction magnet threshold

  // Void detection
  voidMinGapPct: 0.004,         // Lowered from 0.006 - catch tighter voids
  voidGapMultiplier: 1.5,       // Lowered from 1.8 - more sensitive

  // Distance + EM gating
  distanceDecayFactor: 3.5,     // Lowered from 4.0 - less aggressive decay
  quadraticDistanceK: 1.0,      // Raised from 0.9 - softer penalty
  maxDistanceEMMultiplierWalls: 1.5,    // Raised from 1.2 - wider wall detection
  maxDistanceEMMultiplierMagnets: 1.0,  // Raised from 0.8 - catch more magnets

  // Side bias detection
  sideBiasRatio: 1.3,           // New: lowered from hardcoded 1.5

  // Liquidity bias threshold
  liquidityBiasThreshold: 0.25, // Raised from 0.20 - require significant imbalance for directional bias
  gexTiltNeutralZone: 0.08,     // Net GEX tilt below 8% is considered neutral (wider zone)

  // Expected move
  defaultExpectedMovePct: 0.012,

  // Confidence shaping
  confidence: {
    highWallCount: 3,     // Lowered from 4
    highMagnetCount: 2,   // Lowered from 3
    minConfidence: 0.15   // New: floor for confidence
  }
};

function estimateGamma(delta: number): number {
  const absDelta = Math.abs(delta);
  return Math.exp(-Math.pow((absDelta - 0.5) * 3, 2));
}

function computeGammaExposure(
  contracts: OptionContract[],
  spot: number
): { gex: number; callGex: number; putGex: number } {
  let callGex = 0;
  let putGex = 0;

  for (const c of contracts) {
    const gamma = estimateGamma(c.delta);
    const dollarGamma = gamma * c.openInterest * 100 * spot * spot * 0.01;

    if (c.side === "call") {
      callGex += dollarGamma;
    } else {
      putGex += dollarGamma;
    }
  }

  return {
    gex: callGex + putGex,
    callGex,
    putGex
  };
}

function groupByStrike(chain: OptionContract[]): Map<number, OptionContract[]> {
  const map = new Map<number, OptionContract[]>();
  for (const c of chain) {
    if (!map.has(c.strike)) map.set(c.strike, []);
    map.get(c.strike)!.push(c);
  }
  return map;
}

function quadraticDistancePenalty(distancePct: number): number {
  const k = CFG.quadraticDistanceK;
  const q = 1 / (1 + Math.pow(distancePct / k, 2));
  const exp = Math.exp(-CFG.distanceDecayFactor * distancePct);
  return q * exp;
}

function computeStrikeGammaScore(
  contracts: OptionContract[],
  spot: number,
  expectedMovePct: number,
  totalAbsGex: number
): LiquidityLevel {
  let callOi = 0;
  let putOi = 0;
  let callVol = 0;
  let putVol = 0;

  const strike = contracts[0].strike;
  const distance = Math.abs(strike - spot);
  const distancePct = distance / spot;

  const { gex, callGex, putGex } = computeGammaExposure(contracts, spot);

  for (const c of contracts) {
    if (c.side === "call") {
      callOi += c.openInterest;
      callVol += c.volume;
    } else {
      putOi += c.openInterest;
      putVol += c.volume;
    }
  }

  const totalOi = callOi + putOi;
  const totalVol = callVol + putVol;

  const distancePenalty = quadraticDistancePenalty(distancePct);

  const absGex = Math.abs(gex);
  const normalizedGex = totalAbsGex > 0 ? absGex / totalAbsGex : 0;

  const liquidityComponent = Math.log10(1 + totalOi + totalVol) / 6;
  const gammaComponent = normalizedGex;

  const rawScore =
    (liquidityComponent * 0.4 + gammaComponent * 0.6) * distancePenalty;

  let sideBias: "call" | "put" | "mixed" = "mixed";
  const callDom = Math.abs(callGex);
  const putDom = Math.abs(putGex);
  if (callDom > putDom * CFG.sideBiasRatio) sideBias = "call";
  else if (putDom > callDom * CFG.sideBiasRatio) sideBias = "put";

  const withinExpectedMove =
    distancePct <= expectedMovePct * CFG.maxDistanceEMMultiplierWalls;

  return {
    strike,
    gammaScore: rawScore,
    gammaExposure: gex,
    oi: totalOi,
    volume: totalVol,
    distance,
    distancePct,
    sideBias,
    withinExpectedMove
  };
}

function filterLiquidityLevels(levels: LiquidityLevel[]): LiquidityLevel[] {
  return levels.filter(
    l => l.oi >= CFG.minOi || l.volume >= CFG.minVolume
  );
}

function splitAboveBelow(levels: LiquidityLevel[], spot: number) {
  const above = levels.filter(l => l.strike >= spot).sort((a, b) => a.strike - b.strike);
  const below = levels.filter(l => l.strike < spot).sort((a, b) => b.strike - a.strike);
  return { above, below };
}

function detectMagnets(levels: LiquidityLevel[], expectedMovePct: number): LiquidityLevel[] {
  return levels.filter(
    l =>
      l.gammaScore >= CFG.magnetGammaScoreMin &&
      l.distancePct <= expectedMovePct * CFG.maxDistanceEMMultiplierMagnets
  );
}

function detectWalls(levels: LiquidityLevel[], expectedMovePct: number): LiquidityLevel[] {
  return levels.filter(
    l =>
      l.gammaScore >= CFG.wallGammaScoreMin &&
      l.distancePct <= expectedMovePct * CFG.maxDistanceEMMultiplierWalls
  );
}

function detectVoidZones(
  levels: LiquidityLevel[],
  spot: number,
  expectedMovePct: number
): { from: number; to: number; gapPct: number; type: 'minor' | 'major' }[] {
  if (levels.length < 2) return [];

  const sorted = [...levels].sort((a, b) => a.strike - b.strike);
  const voids: { from: number; to: number; gapPct: number; type: 'minor' | 'major' }[] = [];

  const gaps: number[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    gaps.push(sorted[i + 1].strike - sorted[i].strike);
  }
  const avgGap = gaps.length
    ? gaps.reduce((a, b) => a + b, 0) / gaps.length
    : spot * 0.002;

  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    const gap = b.strike - a.strike;
    const gapPct = gap / spot;

    const withinEM = Math.abs((a.strike + b.strike) / 2 - spot) / spot <= expectedMovePct * 1.5;

    if (
      gap > avgGap * CFG.voidGapMultiplier &&
      gapPct >= CFG.voidMinGapPct &&
      withinEM
    ) {
      const type = gapPct >= expectedMovePct * 0.5 ? 'major' : 'minor';
      voids.push({ from: a.strike, to: b.strike, gapPct, type });
    }
  }

  return voids.sort((a, b) => b.gapPct - a.gapPct);
}

function computeLiquidityBias(
  levels: LiquidityLevel[],
  spot: number,
  gexTilt?: number
): { bias: "bullish" | "bearish" | "neutral"; confidence: number } {
  const above = levels.filter(l => l.strike >= spot && l.withinExpectedMove);
  const below = levels.filter(l => l.strike < spot && l.withinExpectedMove);

  const sumGexAbove = above.reduce((s, l) => s + l.gammaExposure, 0);
  const sumGexBelow = below.reduce((s, l) => s + l.gammaExposure, 0);

  const absAbove = Math.abs(sumGexAbove);
  const absBelow = Math.abs(sumGexBelow);

  if (absAbove === 0 && absBelow === 0) {
    return { bias: "neutral", confidence: 0 };
  }

  const total = absAbove + absBelow;
  const abovePct = absAbove / total;
  const belowPct = absBelow / total;
  const imbalance = abovePct - belowPct; // positive = more gamma above, negative = more gamma below

  let bias: "bullish" | "bearish" | "neutral" = "neutral";
  let conf = Math.abs(imbalance);

  // Net GEX is the primary directional indicator:
  // - Positive Net GEX (call-dominated) = dealers short gamma = they buy dips = bullish flow
  // - Negative Net GEX (put-dominated) = dealers long gamma = they sell rallies = bearish flow
  // Gamma walls above/below only indicate resistance/support, not directional bias
  
  if (gexTilt !== undefined) {
    // Use Net GEX tilt as primary directional indicator
    if (gexTilt > 0.02) { // More than 2% call-dominated
      bias = "bullish";
      conf = Math.min(0.8, gexTilt * 2); // Scale confidence by tilt magnitude
    } else if (gexTilt < -0.02) { // More than 2% put-dominated  
      bias = "bearish";
      conf = Math.min(0.8, Math.abs(gexTilt) * 2);
    } else {
      // Net GEX is neutral - use gamma wall imbalance as secondary signal
      // But require a very significant imbalance (40%+)
      if (imbalance > 0.40) {
        bias = "bearish"; // Heavy resistance above
        conf = (imbalance - 0.40) * 2;
      } else if (imbalance < -0.40) {
        bias = "bullish"; // Heavy support below
        conf = (Math.abs(imbalance) - 0.40) * 2;
      }
      // Otherwise stay neutral
    }
  } else {
    // No GEX data - fall back to wall imbalance only
    const threshold = CFG.liquidityBiasThreshold;
    if (imbalance > threshold) {
      bias = "bearish";
    } else if (imbalance < -threshold) {
      bias = "bullish";
    }
  }

  return { bias, confidence: Math.max(CFG.confidence.minConfidence, conf) };
}

function computeGlobalConfidence(
  wallsAbove: LiquidityLevel[],
  wallsBelow: LiquidityLevel[],
  magnets: LiquidityLevel[],
  biasConf: number,
  hasValidLevels: boolean,
  nearestAbove: LiquidityLevel | null,
  nearestBelow: LiquidityLevel | null
): number {
  if (!hasValidLevels) return CFG.confidence.minConfidence;

  const wallCount = wallsAbove.length + wallsBelow.length;
  const magnetCount = magnets.length;
  const superMagnets = magnets.filter(m => m.gammaScore >= CFG.superMagnetScoreMin).length;

  const wallScore = Math.min(wallCount / CFG.confidence.highWallCount, 1);
  const magnetScore = Math.min(magnetCount / CFG.confidence.highMagnetCount, 1);
  const superMagnetBonus = superMagnets > 0 ? 0.15 : 0;

  const nearestScore = (nearestAbove && nearestBelow) ? 
    Math.min(nearestAbove.gammaScore, nearestBelow.gammaScore) * 0.5 : 0;

  const conf = 0.35 * wallScore + 0.30 * magnetScore + 0.20 * biasConf + 0.15 * nearestScore + superMagnetBonus;
  return Math.max(CFG.confidence.minConfidence, Math.min(1, conf));
}

function detectPinningZone(
  magnets: LiquidityLevel[],
  spot: number,
  expectedMovePct: number
): { isPinned: boolean; pinStrike: number | null; pinStrength: number } {
  if (magnets.length === 0) {
    return { isPinned: false, pinStrike: null, pinStrength: 0 };
  }

  const nearMagnets = magnets.filter(m => m.distancePct <= expectedMovePct * 0.5);
  if (nearMagnets.length === 0) {
    return { isPinned: false, pinStrike: null, pinStrength: 0 };
  }

  const strongest = nearMagnets.reduce((best, m) => 
    m.gammaScore > best.gammaScore ? m : best, nearMagnets[0]);

  const pinStrength = Math.min(1, strongest.gammaScore / CFG.superMagnetScoreMin);
  const isPinned = strongest.distancePct <= expectedMovePct * 0.3 && pinStrength >= 0.7;

  return {
    isPinned,
    pinStrike: strongest.strike,
    pinStrength
  };
}

function computeNetGexAnalysis(
  chain: OptionContract[],
  spot: number,
  levels: LiquidityLevel[]
): NetGexAnalysis {
  let callGex = 0;
  let putGex = 0;

  for (const c of chain) {
    const gamma = estimateGamma(c.delta);
    const dollarGamma = gamma * c.openInterest * 100 * spot * spot * 0.01;
    if (c.side === "call") {
      callGex += dollarGamma;
    } else {
      putGex -= dollarGamma;
    }
  }

  const totalNetGex = callGex + putGex;
  const absTotal = Math.abs(callGex) + Math.abs(putGex);
  const gexTilt = absTotal > 0 ? totalNetGex / absTotal : 0;

  let dealerPositioning: 'long_gamma' | 'short_gamma' | 'neutral' = 'neutral';
  if (gexTilt > 0.15) dealerPositioning = 'long_gamma';
  else if (gexTilt < -0.15) dealerPositioning = 'short_gamma';

  let flipZone: GammaFlipZone | null = null;
  const sortedLevels = [...levels].sort((a, b) => a.strike - b.strike);
  
  for (let i = 0; i < sortedLevels.length - 1; i++) {
    const a = sortedLevels[i];
    const b = sortedLevels[i + 1];
    
    if (a.strike < spot && b.strike >= spot) {
      const aNet = a.sideBias === 'call' ? 1 : a.sideBias === 'put' ? -1 : 0;
      const bNet = b.sideBias === 'call' ? 1 : b.sideBias === 'put' ? -1 : 0;
      
      if (aNet !== bNet && (aNet !== 0 || bNet !== 0)) {
        flipZone = {
          strike: (a.strike + b.strike) / 2,
          flipType: aNet < bNet ? 'negative_to_positive' : 'positive_to_negative',
          significance: Math.max(a.gammaScore, b.gammaScore)
        };
        break;
      }
    }
  }

  return {
    totalNetGex,
    callGex,
    putGex,
    dealerPositioning,
    flipZone,
    gexTilt
  };
}

function detectVolatilityRegime(
  chain: OptionContract[],
  spot: number
): 'low' | 'normal' | 'high' | 'extreme' {
  const atmContracts = chain.filter(c => 
    Math.abs(c.strike - spot) / spot < 0.02
  );
  
  if (atmContracts.length === 0) return 'normal';
  
  const avgIv = atmContracts.reduce((sum, c) => sum + c.iv, 0) / atmContracts.length;
  
  if (avgIv < 0.15) return 'low';
  if (avgIv < 0.25) return 'normal';
  if (avgIv < 0.40) return 'high';
  return 'extreme';
}

function generateActionableInsight(
  bias: 'bullish' | 'bearish' | 'neutral',
  pinning: { isPinned: boolean; pinStrike: number | null; pinStrength: number },
  netGex: NetGexAnalysis,
  volatilityRegime: 'low' | 'normal' | 'high' | 'extreme',
  nearestAbove: LiquidityLevel | null,
  nearestBelow: LiquidityLevel | null,
  spot: number
): string {
  const parts: string[] = [];

  if (pinning.isPinned && pinning.pinStrike) {
    parts.push(`PINNED near $${pinning.pinStrike} (${(pinning.pinStrength * 100).toFixed(0)}% strength)`);
  }

  if (netGex.dealerPositioning === 'long_gamma') {
    parts.push('Dealers long gamma - expect mean reversion, sell volatility');
  } else if (netGex.dealerPositioning === 'short_gamma') {
    parts.push('Dealers short gamma - expect trend acceleration, buy volatility');
  }

  if (volatilityRegime === 'extreme') {
    parts.push('EXTREME IV environment - options expensive');
  } else if (volatilityRegime === 'low') {
    parts.push('Low IV - options cheap, consider long premium');
  }

  // Always provide resistance/support levels for context
  if (nearestAbove && nearestBelow) {
    if (bias === 'bullish') {
      parts.push(`Resistance at $${nearestAbove.strike}, support at $${nearestBelow.strike}`);
    } else if (bias === 'bearish') {
      parts.push(`Support wall at $${nearestBelow.strike} may limit downside`);
    } else {
      // Neutral - show trading range
      parts.push(`Range: $${nearestBelow.strike} support to $${nearestAbove.strike} resistance`);
    }
  } else if (nearestAbove) {
    parts.push(`Resistance at $${nearestAbove.strike}`);
  } else if (nearestBelow) {
    parts.push(`Support at $${nearestBelow.strike}`);
  }

  if (netGex.flipZone) {
    parts.push(`GEX flip zone near $${netGex.flipZone.strike.toFixed(0)}`);
  }

  // Add GEX tilt context for neutral bias
  if (bias === 'neutral' && Math.abs(netGex.gexTilt) > 0.01) {
    const tiltDir = netGex.gexTilt > 0 ? 'slightly call-heavy' : 'slightly put-heavy';
    parts.push(`Net GEX ${tiltDir}`);
  }

  return parts.length > 0 ? parts.join('. ') + '.' : 'Balanced gamma exposure - no strong directional pull.';
}

function createFallbackLevel(
  spot: number,
  direction: "above" | "below",
  expectedMovePct: number
): LiquidityLevel {
  const offset = spot * expectedMovePct * 0.6;
  const strike = direction === "above" ? spot + offset : spot - offset;

  return {
    strike: Math.round(strike * 100) / 100,
    gammaScore: 0.18,
    gammaExposure: 0,
    oi: 0,
    volume: 0,
    distance: offset,
    distancePct: offset / spot,
    sideBias: "mixed",
    withinExpectedMove: true
  };
}

export function buildLiquidityMap(
  chain: OptionContract[],
  underlying: UnderlyingSnapshot
): LiquidityMap {
  const spot = underlying.spot;
  const expectedMovePct = underlying.expectedMovePct ?? CFG.defaultExpectedMovePct;
  const expectedMoveRange = {
    low: spot * (1 - expectedMovePct),
    high: spot * (1 + expectedMovePct)
  };

  if (!chain.length) {
    return {
      nearestAbove: createFallbackLevel(spot, "above", expectedMovePct),
      nearestBelow: createFallbackLevel(spot, "below", expectedMovePct),
      wallsAbove: [],
      wallsBelow: [],
      magnets: [],
      voidZones: [],
      liquidityBias: "neutral",
      confidence: CFG.confidence.minConfidence,
      expectedMoveRange,
      pinning: { isPinned: false, pinStrike: null, pinStrength: 0 }
    };
  }

  const grouped = groupByStrike(chain);

  let totalAbsGex = 0;
  grouped.forEach(contracts => {
    const { gex } = computeGammaExposure(contracts, spot);
    totalAbsGex += Math.abs(gex);
  });

  const levels: LiquidityLevel[] = [];
  grouped.forEach(contracts => {
    const lvl = computeStrikeGammaScore(
      contracts,
      spot,
      expectedMovePct,
      totalAbsGex
    );
    levels.push(lvl);
  });

  const filtered = filterLiquidityLevels(levels);
  if (!filtered.length) {
    return {
      nearestAbove: createFallbackLevel(spot, "above", expectedMovePct),
      nearestBelow: createFallbackLevel(spot, "below", expectedMovePct),
      wallsAbove: [],
      wallsBelow: [],
      magnets: [],
      voidZones: [],
      liquidityBias: "neutral",
      confidence: CFG.confidence.minConfidence,
      expectedMoveRange,
      pinning: { isPinned: false, pinStrike: null, pinStrength: 0 }
    };
  }

  const { above, below } = splitAboveBelow(filtered, spot);

  const wallsAbove = detectWalls(above, expectedMovePct);
  const wallsBelow = detectWalls(below, expectedMovePct);
  const magnets = detectMagnets(filtered, expectedMovePct);
  const voidZones = detectVoidZones(filtered, spot, expectedMovePct);

  const relevantAbove = above.filter(
    l => l.distancePct <= expectedMovePct * CFG.maxDistanceEMMultiplierWalls
  );
  const relevantBelow = below.filter(
    l => l.distancePct <= expectedMovePct * CFG.maxDistanceEMMultiplierWalls
  );

  let nearestAbove: LiquidityLevel | null =
    relevantAbove.length ? relevantAbove[0] : above[0] ?? null;
  let nearestBelow: LiquidityLevel | null =
    relevantBelow.length ? relevantBelow[0] : below[0] ?? null;

  if (!nearestAbove) {
    nearestAbove = createFallbackLevel(spot, "above", expectedMovePct);
  }
  if (!nearestBelow) {
    nearestBelow = createFallbackLevel(spot, "below", expectedMovePct);
  }

  // Compute Net GEX first so we can use the tilt for bias calculation
  const netGex = computeNetGexAnalysis(chain, spot, filtered);
  
  // Pass gexTilt to bias calculation for smarter determination
  const { bias, confidence: biasConf } = computeLiquidityBias(filtered, spot, netGex.gexTilt);
  const hasValidLevels =
    relevantAbove.length > 0 || relevantBelow.length > 0 || magnets.length > 0;
  const globalConf = computeGlobalConfidence(
    wallsAbove,
    wallsBelow,
    magnets,
    biasConf,
    hasValidLevels,
    nearestAbove,
    nearestBelow
  );

  const pinning = detectPinningZone(magnets, spot, expectedMovePct);
  const volatilityRegime = detectVolatilityRegime(chain, spot);
  const actionableInsight = generateActionableInsight(
    bias, pinning, netGex, volatilityRegime, nearestAbove, nearestBelow, spot
  );

  return {
    nearestAbove,
    nearestBelow,
    wallsAbove,
    wallsBelow,
    magnets,
    voidZones,
    liquidityBias: bias,
    confidence: globalConf,
    expectedMoveRange,
    pinning,
    netGex,
    volatilityRegime,
    actionableInsight
  };
}

export interface GammaGhostResult {
  liquidityMap: LiquidityMap;
  underlying: UnderlyingSnapshot;
  timestamp: string;
  computeTimeMs?: number;
}

export function runGammaGhost(
  chain: OptionContract[],
  underlying: UnderlyingSnapshot
): GammaGhostResult {
  const start = Date.now();
  const liquidityMap = buildLiquidityMap(chain, underlying);

  return {
    liquidityMap,
    underlying,
    timestamp: new Date().toISOString(),
    computeTimeMs: Date.now() - start
  };
}

export function generateMockOptionsChain(
  symbol: string,
  spot: number,
  expectedMovePct: number = 0.012
): OptionContract[] {
  const chain: OptionContract[] = [];
  const now = new Date();
  const expiry = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0];

  const strikeStep = spot > 500 ? 5 : spot > 100 ? 1 : 0.5;
  const numStrikes = 30;
  const baseStrike = Math.round(spot / strikeStep) * strikeStep;

  for (let i = -numStrikes; i <= numStrikes; i++) {
    const strike = baseStrike + i * strikeStep;
    if (strike <= 0) continue;

    const distance = Math.abs(strike - spot);
    const distancePct = distance / spot;

    const callDelta = Math.max(0.01, Math.min(0.99, 0.5 - (strike - spot) / (spot * 0.1)));
    const putDelta = callDelta - 1;

    const atmIv = 0.25;
    const skew = (strike < spot ? 0.05 : -0.02) * distancePct * 10;
    const iv = atmIv + skew;

    const baseOi = Math.floor(Math.random() * 8000) + 500;
    const baseVol = Math.floor(Math.random() * 2000) + 100;

    const proximityBoost = distancePct < expectedMovePct ? 2.5 : 1;
    const roundBoost = strike % (strikeStep * 10) === 0 ? 2 : 1;

    const callOi = Math.floor(baseOi * proximityBoost * roundBoost * (0.8 + Math.random() * 0.4));
    const putOi = Math.floor(baseOi * proximityBoost * roundBoost * (0.8 + Math.random() * 0.4));
    const callVol = Math.floor(baseVol * proximityBoost * (0.5 + Math.random() * 1));
    const putVol = Math.floor(baseVol * proximityBoost * (0.5 + Math.random() * 1));

    const callPrice = Math.max(0.01, (spot - strike) * 0.5 + spot * iv * 0.1);
    const putPrice = Math.max(0.01, (strike - spot) * 0.5 + spot * iv * 0.1);

    chain.push({
      symbol: `${symbol}${expiry}C${strike}`,
      side: "call",
      strike,
      expiry,
      delta: callDelta,
      iv,
      bid: callPrice * 0.95,
      ask: callPrice * 1.05,
      last: callPrice,
      volume: callVol,
      openInterest: callOi
    });

    chain.push({
      symbol: `${symbol}${expiry}P${strike}`,
      side: "put",
      strike,
      expiry,
      delta: putDelta,
      iv,
      bid: putPrice * 0.95,
      ask: putPrice * 1.05,
      last: putPrice,
      volume: putVol,
      openInterest: putOi
    });
  }

  return chain;
}

// Legacy compatibility aliases
export const generateSampleChain = generateMockOptionsChain;

export interface HistoricalChainContext {
  avgOtmVolume: number;
  avgOtmSpread: number;
  avgOtmIv: number;
  avgOtmDelta: number;
  callSkewBaseline: number;
  putSkewBaseline: number;
}

export function generateHistoricalContext(): HistoricalChainContext {
  return {
    avgOtmVolume: 500 + Math.random() * 1000,
    avgOtmSpread: 0.05 + Math.random() * 0.1,
    avgOtmIv: 0.2 + Math.random() * 0.15,
    avgOtmDelta: 0.15 + Math.random() * 0.1,
    callSkewBaseline: -0.02 + Math.random() * 0.04,
    putSkewBaseline: 0.02 + Math.random() * 0.04
  };
}

export interface UnderlyingWithPrev extends UnderlyingSnapshot {
  prevSpot?: number;
}

export function runGammaGhostTimed(
  chain: OptionContract[],
  underlying: UnderlyingWithPrev,
  _ctx: HistoricalChainContext
): GammaGhostResult {
  return runGammaGhost(chain, underlying);
}
