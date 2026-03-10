// signalStability.ts
// Prevents rapid signal flipping by implementing hysteresis and time-based stability

export type StableDirection = 'bullish' | 'bearish' | 'neutral' | 'none';

interface SignalState {
  direction: StableDirection;
  timestamp: number;
  score: number;          // The net score that determined this direction
  lockUntil: number;      // Don't flip until this timestamp
  flipCount: number;      // How many times we've flipped recently
  lastFlipTime: number;   // When we last flipped
}

// Cache signal states per symbol
const signalCache = new Map<string, SignalState>();

// Configuration for signal stability
const STABILITY_CONFIG = {
  // Minimum time (ms) to hold a direction before allowing flip
  MIN_HOLD_TIME: 60000,  // 1 minute minimum hold
  
  // Extra threshold needed to flip direction (hysteresis)
  FLIP_THRESHOLD_BOOST: 10, // Need 10 more points to flip vs. maintain
  
  // If we flip too often, increase the threshold even more
  RAPID_FLIP_WINDOW: 300000, // 5 minutes
  RAPID_FLIP_MAX: 2,         // Max flips in window before penalty
  RAPID_FLIP_PENALTY: 15,    // Extra threshold if flipping too fast
  
  // Score threshold for direction
  BASE_THRESHOLD: 15,
  
  // Cache cleanup interval
  CACHE_EXPIRY: 600000,  // 10 minutes
};

// Clean up old cache entries
function cleanupCache(): void {
  const now = Date.now();
  const entries = Array.from(signalCache.entries());
  for (const [symbol, state] of entries) {
    if (now - state.timestamp > STABILITY_CONFIG.CACHE_EXPIRY) {
      signalCache.delete(symbol);
    }
  }
}

// Get stable direction with hysteresis
export function getStableDirection(params: {
  symbol: string;
  bullScore: number;
  bearScore: number;
  rawDirection: StableDirection;
}): { 
  direction: StableDirection; 
  stabilized: boolean;
  reason: string;
} {
  const { symbol, bullScore, bearScore, rawDirection } = params;
  const now = Date.now();
  const netScore = bullScore - bearScore;
  
  // Cleanup old entries periodically
  if (Math.random() < 0.1) cleanupCache();
  
  // Get or create state
  let state = signalCache.get(symbol);
  
  if (!state) {
    // First signal for this symbol - accept it
    state = {
      direction: rawDirection,
      timestamp: now,
      score: netScore,
      lockUntil: now + STABILITY_CONFIG.MIN_HOLD_TIME,
      flipCount: 0,
      lastFlipTime: 0
    };
    signalCache.set(symbol, state);
    return { 
      direction: rawDirection, 
      stabilized: false,
      reason: 'Initial signal'
    };
  }
  
  // Same direction? Just update timestamp and score
  if (rawDirection === state.direction) {
    state.timestamp = now;
    state.score = netScore;
    return { 
      direction: state.direction, 
      stabilized: false,
      reason: 'Direction unchanged'
    };
  }
  
  // Direction wants to change - apply stability rules
  
  // Rule 1: Check minimum hold time
  if (now < state.lockUntil) {
    const remainingSecs = Math.ceil((state.lockUntil - now) / 1000);
    return {
      direction: state.direction,
      stabilized: true,
      reason: `Hold lock: ${remainingSecs}s remaining`
    };
  }
  
  // Rule 2: Calculate required threshold with hysteresis
  let requiredThreshold = STABILITY_CONFIG.BASE_THRESHOLD + STABILITY_CONFIG.FLIP_THRESHOLD_BOOST;
  
  // Rule 3: Check for rapid flipping penalty
  if (state.lastFlipTime > 0 && (now - state.lastFlipTime) < STABILITY_CONFIG.RAPID_FLIP_WINDOW) {
    if (state.flipCount >= STABILITY_CONFIG.RAPID_FLIP_MAX) {
      requiredThreshold += STABILITY_CONFIG.RAPID_FLIP_PENALTY;
    }
  } else {
    // Reset flip count if outside window
    state.flipCount = 0;
  }
  
  // Check if the new direction meets the higher threshold
  const absNetScore = Math.abs(netScore);
  
  if (absNetScore < requiredThreshold) {
    return {
      direction: state.direction,
      stabilized: true,
      reason: `Score ${absNetScore.toFixed(0)} < threshold ${requiredThreshold} (hysteresis)`
    };
  }
  
  // Allow the flip - update state
  state.direction = rawDirection;
  state.timestamp = now;
  state.score = netScore;
  state.lockUntil = now + STABILITY_CONFIG.MIN_HOLD_TIME;
  state.flipCount++;
  state.lastFlipTime = now;
  
  console.log(`[STABILITY] ${symbol}: Direction flipped to ${rawDirection} (score: ${netScore.toFixed(1)}, threshold: ${requiredThreshold})`);
  
  return {
    direction: rawDirection,
    stabilized: false,
    reason: `Direction changed (score ${absNetScore.toFixed(0)} >= ${requiredThreshold})`
  };
}

// Force reset stability for a symbol (useful for manual intervention)
export function resetStability(symbol: string): void {
  signalCache.delete(symbol);
}

// Get current cached state for debugging
export function getStabilityState(symbol: string): SignalState | undefined {
  return signalCache.get(symbol);
}
