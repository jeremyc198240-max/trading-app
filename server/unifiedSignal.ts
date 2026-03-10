// unifiedSignal.ts
// Single Source of Truth for all trading direction decisions
// All UI components must read from fusion.unified* fields only

import type {
  FusionSnapshot,
  MTFConsensus,
  PatternForecast,
  VolatilityRegime,
  RiskModel,
  DirectionalProbabilities,
  GatingState,
  MonsterGateDecision,
  GatedReversalAlert,
  DivergenceData
} from './fusion';

import type { EMACloudTrend } from './emaTrendAdapter';
import type { CorvonaLevels } from './corvonaPivots';
import type { ReversalSignal } from './reversalEngine';
import { getStableDirection, type StableDirection } from './signalStability';
import { pushMemory, applyMemorySmoothing, type MemorySmoothing } from './signalMemory';
import { computePriceActionSafety, type PriceActionSafety } from './priceActionSafety';

export type { FusionSnapshot };

export type UnifiedDirection = 'bullish' | 'bearish' | 'neutral' | 'none';

// =============== NORMALIZED SIGNAL SCHEMA ===============
// All signal sources must be converted to this format before fusion

export interface NormalizedSignal {
  source: string;                              // e.g., "forecast", "monster", "trend30m", "pattern30m", "pattern5m"
  direction: 'call' | 'put' | 'neutral';
  weight: number;                              // 0-1, base weight before adjustments
  confidence: number;                          // 0-1, signal's own confidence
  timeframe: '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1D';
  reason: string;
  isTrendAligned?: boolean;                    // true if aligned with dominant trend
  isReversal?: boolean;                        // true if this is a reversal signal
  isConfirmed?: boolean;                       // true if confirmed by lower timeframe
}

// Timeframe priority weights (30m > 5m > 1m per user spec)
const TIMEFRAME_WEIGHTS: Record<string, number> = {
  '1D': 0.7,
  '4h': 0.8,
  '1h': 0.9,
  '30m': 1.0,    // Primary timeframe - highest weight
  '15m': 0.85,
  '5m': 0.75,
  '1m': 0.5
};

// Weight adjustments
const TREND_ALIGNED_BONUS = 0.25;      // Signals aligned with trend get 25% boost
const COUNTER_TREND_PENALTY = 0.25;    // Counter-trend signals get 25% penalty (reduced from 35% to allow reversals)
const REVERSAL_CONFIRMED_BONUS = 0.50; // Reversals with 5m confirmation get 50% boost (increased for bounce catching)
const REVERSAL_UNCONFIRMED_PENALTY = 0.15; // Unconfirmed reversals get only 15% penalty (reduced from 30% to catch more bounces)

// =============== UNIFIED PLAY (0DTE recommendation) ===============

export interface UnifiedPlay {
  type: 'CALL' | 'PUT' | 'WAIT';
  symbol: string;
  strike: number | null;
  strikeType: 'ATM' | 'OTM' | 'ITM' | null;
  style: 'scalp' | 'swing' | 'trend';
  alignment: 'trend-aligned' | 'counter-trend' | 'reversal' | 'neutral';
  confidence: number;
  reason: string;
}

// =============== DECISION EXPLANATION ===============

export interface DecisionExplanation {
  inputsUsed: {
    source: string;
    direction: string;
    weight: number;
    adjustedWeight: number;
    reason: string;
  }[];
  weightsApplied: {
    trendBonus: number;
    reversalBonus: number;
    counterTrendPenalty: number;
    timeframePriority: Record<string, number>;
  };
  finalFusion: {
    direction: 'CALL' | 'PUT' | 'WAIT';
    confidence: number;
    netBullScore: number;
    netBearScore: number;
    reasonStack: string[];
  };
  rejectionReasons: {
    direction: 'CALL' | 'PUT';
    reasons: string[];
  }[];
}

export interface UnifiedReason {
  label: string;
  weight: number; // 0–1
  impact: 'bullish' | 'bearish' | 'neutral' | 'risk' | 'regime' | 'info';
}

export type SetupGrade = 'GOLD' | 'HOT' | 'READY' | 'BUILDING' | 'WAIT';

export type ReasonCategory = 'bullish' | 'bearish' | 'reversal' | 'risk' | 'gating' | 'meta';

export interface ReasonGraphEntry {
  category: ReasonCategory;
  label: string;
  weight: number;
  source: string;
}

export interface ReasonGraph {
  bullish: ReasonGraphEntry[];
  bearish: ReasonGraphEntry[];
  reversal: ReasonGraphEntry[];
  risk: ReasonGraphEntry[];
  gating: ReasonGraphEntry[];
  meta: ReasonGraphEntry[];
}

export interface SignalHealth {
  score: number;
  agreementRatio: number;
  signalCount: number;
  reversalConflict: boolean;
  volatilityPenalty: number;
  gatingContribution: number;
}

export interface TrendIntegrity {
  score: number;
  mtfComponent: number;
  emaComponent: number;
  probComponent: number;
}

export interface UnifiedSignal {
  symbol: string;
  timestamp: number;
  currentPrice: number;

  // =============== SINGLE SOURCE OF TRUTH ===============
  // These are THE authoritative fields - UI must read ONLY these
  unifiedDirection: 'CALL' | 'PUT' | 'WAIT';    // The final fused direction
  unifiedConfidence: number;                      // 0-100, fused confidence
  unifiedPlay: UnifiedPlay | null;                // Full 0DTE recommendation
  setupGrade: SetupGrade;                         // GOLD/HOT/READY/BUILDING/WAIT
  
  // Core decision (legacy - maps to unified*)
  direction: UnifiedDirection;
  state: 'ACTIVE' | 'INACTIVE' | 'STALE';
  status: 'active' | 'stale' | 'inactive';  // UI-friendly status
  regime: VolatilityRegime['regime'];
  regimeScore: number;

  // Trade struct
  entryZone: { low: number; high: number; min?: number; max?: number } | null;
  stopLoss: number | null;
  targets: number[];
  priceTargets: number[];  // UI compatibility alias for targets
  rr: number | null;
  
  // 0DTE Strike targets
  strikeTargets: {
    type: 'CALL' | 'PUT' | 'WAIT';
    atm: number;
    aggressive: number;  // Slightly OTM for higher leverage
    conservative: number; // Closer to ATM for safety
    scalp: number; // Quick flip target strike
  } | null;

  // Confidence & risk
  confidence: number; // 0–100
  mtfAlignment: number; // 0–100
  forecastConfidence: number; // 0–100
  riskScore: number; // 0–100
  gatingScore: number; // 0–100

  // Probabilities
  directionalProbs: {
    up: number;
    chop: number;
    down: number;
  };

  // =============== OPTION B FILTERING ===============
  // Alerts when trade meets Option B criteria (GOLD/HOT, 75%+, optimal timing)
  optionBQualified: boolean;
  optionBReasons: string[];
  
  // =============== REVERSAL ALERT ===============
  // Special alert when reversal/bounce is detected
  reversalAlert: {
    active: boolean;
    direction: 'CALL' | 'PUT' | 'NONE';
    type: string | null;
    confidence: number;
    reasons: string[];
  };

  // Context Modules (for display, NOT decision drivers)
  fusionBias: UnifiedDirection;
  forecastDirection: 'up' | 'down' | 'chop';
  mtfTrendConsensus: 'bullish' | 'bearish' | 'neutral';
  monsterGate: MonsterGateDecision;
  gatingState: GatingState;
  volatilityRegime: VolatilityRegime;
  riskModel: RiskModel;
  emaTrend?: EMACloudTrend;
  corvonaLevels?: CorvonaLevels;
  reversalSignal?: ReversalSignal;
  gatedReversalAlert?: GatedReversalAlert;

  // Normalized inputs that went into fusion
  normalizedInputs: NormalizedSignal[];
  
  // Decision explanation (institutional transparency)
  decisionExplanation: DecisionExplanation;

  signalHealth: SignalHealth;
  trendIntegrity: TrendIntegrity;
  reasonGraph: ReasonGraph;
  memorySmoothing: MemorySmoothing;
  priceActionSafety: PriceActionSafety;

  institutionalCore?: {
    direction: 'bull' | 'bear' | 'neutral';
    score: number;
    reasons: string[];
  };

  // Meta
  reasons: UnifiedReason[];
  notes: string[];  // UI-friendly reason labels
  summary: string;
  recommendedAction: string;
}

function toPct(x: number): number {
  return Math.max(0, Math.min(100, x * 100));
}

// Calculate strike increment based on underlying price (standard options chain intervals)
function getStrikeIncrement(price: number): number {
  if (price < 25) return 0.5;
  if (price < 50) return 1;
  if (price < 200) return 2.5;
  if (price < 500) return 5;
  return 10;
}

// Round to nearest strike
function roundToStrike(price: number, increment: number): number {
  return Math.round(price / increment) * increment;
}

// Calculate 0DTE strike targets
function calculateStrikeTargets(
  currentPrice: number,
  direction: UnifiedDirection,
  state: 'ACTIVE' | 'INACTIVE' | 'STALE',
  expectedMove: number
): UnifiedSignal['strikeTargets'] {
  if (state !== 'ACTIVE' || direction === 'neutral') {
    return null;
  }

  const increment = getStrikeIncrement(currentPrice);
  const atm = roundToStrike(currentPrice, increment);
  
  // For 0DTE, typical strike selection:
  // - ATM: highest premium, delta ~0.50
  // - Aggressive (1-2 strikes OTM): delta ~0.30-0.40, higher leverage
  // - Conservative (ITM or ATM): delta ~0.55-0.65, more safety
  // - Scalp (2-3 strikes OTM): quick flip for momentum moves
  
  if (direction === 'bullish') {
    return {
      type: 'CALL',
      atm: atm,
      aggressive: atm + increment,     // 1 strike OTM call
      conservative: atm - increment,   // 1 strike ITM call (safer)
      scalp: atm + (increment * 2)     // 2 strikes OTM for quick scalp
    };
  } else {
    return {
      type: 'PUT',
      atm: atm,
      aggressive: atm - increment,     // 1 strike OTM put
      conservative: atm + increment,   // 1 strike ITM put (safer)
      scalp: atm - (increment * 2)     // 2 strikes OTM for quick scalp
    };
  }
}

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function computeSignalHealth(params: {
  signals: NormalizedSignal[];
  fusionDirection: 'CALL' | 'PUT' | 'WAIT';
  bullScore: number;
  bearScore: number;
  volatilityRegime: VolatilityRegime;
  gatingScore: number;
}): SignalHealth {
  const { signals, fusionDirection, bullScore, bearScore, volatilityRegime, gatingScore } = params;
  const directionalSignals = signals.filter(s => s.direction !== 'neutral');
  const signalCount = directionalSignals.length;

  const agreeSide = fusionDirection === 'CALL' ? 'call' : fusionDirection === 'PUT' ? 'put' : null;
  const agreeCount = agreeSide ? directionalSignals.filter(s => s.direction === agreeSide).length : 0;
  const agreementRatio = signalCount > 0 ? agreeCount / signalCount : 0;

  const hasReversalSignal = signals.some(s => s.isReversal && s.direction !== 'neutral');
  const hasTrendSignal = signals.some(s => !s.isReversal && s.isTrendAligned && s.direction !== 'neutral');
  const reversalConflict = hasReversalSignal && hasTrendSignal &&
    signals.find(s => s.isReversal)?.direction !== signals.find(s => s.isTrendAligned && !s.isReversal)?.direction;

  const volPenalty = volatilityRegime.regime === 'high' ? 0.15 : volatilityRegime.regime === 'low' ? 0.05 : 0;
  const gatingContribution = clamp01(gatingScore / 100) * 0.2;

  const totalScore = bullScore + bearScore;
  const edgeClarity = totalScore > 0 ? Math.abs(bullScore - bearScore) / totalScore : 0;
  const countBonus = Math.min(1, signalCount / 6) * 0.15;
  const score = clamp01(
    agreementRatio * 0.30 +
    edgeClarity * 0.10 +
    countBonus +
    (reversalConflict ? -0.15 : 0.10) +
    gatingContribution -
    volPenalty +
    0.15
  );

  return {
    score: Math.round(score * 100),
    agreementRatio: Math.round(agreementRatio * 100) / 100,
    signalCount,
    reversalConflict: !!reversalConflict,
    volatilityPenalty: Math.round(volPenalty * 100),
    gatingContribution: Math.round(gatingContribution * 100)
  };
}

function computeTrendIntegrity(params: {
  mtfConsensus: MTFConsensus;
  emaTrend?: { direction: string; strength: number };
  probs: DirectionalProbabilities;
  fusionDirection: 'CALL' | 'PUT' | 'WAIT';
}): TrendIntegrity {
  const { mtfConsensus, emaTrend, probs, fusionDirection } = params;

  const isBull = fusionDirection === 'CALL';
  const isBear = fusionDirection === 'PUT';

  const mtfAligned = (isBull && mtfConsensus.trendConsensus === 'bullish') ||
                     (isBear && mtfConsensus.trendConsensus === 'bearish');
  const mtfComponent = mtfAligned ? mtfConsensus.alignmentScore : mtfConsensus.alignmentScore * 0.3;

  let emaComponent = 0;
  if (emaTrend) {
    const emaAligned = (isBull && emaTrend.direction === 'bullish') ||
                       (isBear && emaTrend.direction === 'bearish');
    const normStrength = Math.min(emaTrend.strength / 20, 1);
    emaComponent = emaAligned ? normStrength : normStrength * 0.2;
  }

  const probBias = isBull ? probs.up - probs.down : isBear ? probs.down - probs.up : 0;
  const probComponent = clamp01((probBias + 0.3) / 0.6);

  const score = clamp01(mtfComponent * 0.40 + emaComponent * 0.35 + probComponent * 0.25);

  return {
    score: Math.round(score * 100),
    mtfComponent: Math.round(mtfComponent * 100),
    emaComponent: Math.round(emaComponent * 100),
    probComponent: Math.round(probComponent * 100)
  };
}

function buildReasonGraph(params: {
  normalizedSignals: NormalizedSignal[];
  gatingReasons: string[];
  riskModel: RiskModel;
  volatilityRegime: VolatilityRegime;
  signalHealth: SignalHealth;
  trendIntegrity: TrendIntegrity;
}): ReasonGraph {
  const { normalizedSignals, gatingReasons, riskModel, volatilityRegime, signalHealth, trendIntegrity } = params;
  const graph: ReasonGraph = { bullish: [], bearish: [], reversal: [], risk: [], gating: [], meta: [] };

  for (const sig of normalizedSignals) {
    if (sig.isReversal) {
      graph.reversal.push({ category: 'reversal', label: sig.reason, weight: sig.weight, source: sig.source });
    } else if (sig.direction === 'call') {
      graph.bullish.push({ category: 'bullish', label: sig.reason, weight: sig.weight, source: sig.source });
    } else if (sig.direction === 'put') {
      graph.bearish.push({ category: 'bearish', label: sig.reason, weight: sig.weight, source: sig.source });
    }
  }

  for (const r of gatingReasons) {
    graph.gating.push({ category: 'gating', label: r, weight: 0.15, source: 'gating' });
  }

  if (riskModel.riskIndex > 0.5) {
    graph.risk.push({ category: 'risk', label: `Risk index ${(riskModel.riskIndex * 100).toFixed(0)}%`, weight: riskModel.riskIndex, source: 'riskModel' });
  }
  if (riskModel.failureProb > 0.3) {
    graph.risk.push({ category: 'risk', label: `Failure prob ${(riskModel.failureProb * 100).toFixed(0)}%`, weight: riskModel.failureProb, source: 'riskModel' });
  }

  graph.meta.push({ category: 'meta', label: `Vol regime: ${volatilityRegime.regime}`, weight: volatilityRegime.score, source: 'volatility' });
  graph.meta.push({ category: 'meta', label: `Signal health: ${signalHealth.score}`, weight: signalHealth.score / 100, source: 'health' });
  graph.meta.push({ category: 'meta', label: `Trend integrity: ${trendIntegrity.score}`, weight: trendIntegrity.score / 100, source: 'trendIntegrity' });

  return graph;
}

// =============== SIGNAL NORMALIZATION ===============
// Convert all input sources to common NormalizedSignal format

function normalizeInputs(params: {
  snapshot: FusionSnapshot;
  dominantTrend: 'bullish' | 'bearish' | 'neutral';
}): NormalizedSignal[] {
  const { snapshot, dominantTrend } = params;
  const signals: NormalizedSignal[] = [];

  // 1. Forecast signal
  if (snapshot.forecast) {
    const dir = snapshot.forecast.direction === 'up' ? 'call' : 
                snapshot.forecast.direction === 'down' ? 'put' : 'neutral';
    const isTrendAligned = (dir === 'call' && dominantTrend === 'bullish') ||
                           (dir === 'put' && dominantTrend === 'bearish');
    signals.push({
      source: 'forecast',
      direction: dir,
      weight: 0.20,
      confidence: snapshot.forecast.confidence,
      timeframe: '15m',
      reason: `Forecast: ${snapshot.forecast.direction} (${toPct(snapshot.forecast.confidence).toFixed(0)}%)`,
      isTrendAligned,
      isReversal: false,
      isConfirmed: true
    });
  }

  // 2. MTF Consensus signal
  if (snapshot.mtfConsensus) {
    const dir = snapshot.mtfConsensus.trendConsensus === 'bullish' ? 'call' :
                snapshot.mtfConsensus.trendConsensus === 'bearish' ? 'put' : 'neutral';
    signals.push({
      source: 'mtf_consensus',
      direction: dir,
      weight: 0.25,
      confidence: snapshot.mtfConsensus.alignmentScore,
      timeframe: '30m',
      reason: `MTF ${snapshot.mtfConsensus.trendConsensus} (${toPct(snapshot.mtfConsensus.alignmentScore).toFixed(0)}% aligned)`,
      isTrendAligned: dir !== 'neutral',
      isReversal: false,
      isConfirmed: true
    });
  }

  // 3. EMA Trend signal (30m weight)
  // REDUCE weight when reversal is active - EMA lags price action
  if (snapshot.emaTrend && snapshot.emaTrend.direction !== 'neutral') {
    const dir = snapshot.emaTrend.direction === 'bullish' ? 'call' : 'put';
    const strength = Math.min(snapshot.emaTrend.strength / 20, 1);
    
    // Check if reversal is active - if so, reduce EMA weight significantly
    const hasActiveReversal = snapshot.reversalSignal?.reversalSignal === true;
    const baseWeight = 0.25;
    const adjustedWeight = hasActiveReversal ? 0.08 : baseWeight; // Reduce to 0.08 during reversals
    
    signals.push({
      source: 'ema_trend_30m',
      direction: dir,
      weight: adjustedWeight,
      confidence: strength,
      timeframe: '30m',
      reason: `EMA trend ${snapshot.emaTrend.direction} (strength ${snapshot.emaTrend.strength.toFixed(0)})${hasActiveReversal ? ' [REDUCED]' : ''}`,
      isTrendAligned: true,
      isReversal: false,
      isConfirmed: true
    });
  }

  // 4. Monster panel top plays
  if (snapshot.monsterGateDecision && snapshot.monsterGateDecision.direction !== 'none') {
    const dir = snapshot.monsterGateDecision.direction === 'calls' ? 'call' : 
                snapshot.monsterGateDecision.direction === 'puts' ? 'put' : 'neutral';
    const isTrendAligned = (dir === 'call' && dominantTrend === 'bullish') ||
                           (dir === 'put' && dominantTrend === 'bearish');
    signals.push({
      source: 'monster_panel',
      direction: dir,
      weight: 0.15,
      confidence: snapshot.monsterGateDecision.value / 100,
      timeframe: '5m',
      reason: `Monster: ${dir.toUpperCase()} (${snapshot.monsterGateDecision.value.toFixed(0)}%)`,
      isTrendAligned,
      isReversal: false,
      isConfirmed: true
    });
  }

  // 5. MTF Reversal signal (30m hammer/shooting star + 5m confirmation)
  if (snapshot.mtfReversal && snapshot.mtfReversal.hasReversal) {
    const dir = snapshot.mtfReversal.direction === 'bullish' ? 'call' : 
                snapshot.mtfReversal.direction === 'bearish' ? 'put' : 'neutral';
    const isConfirmed = snapshot.mtfReversal.patterns5m.length > 0;
    const isTrendAligned = (dir === 'call' && dominantTrend === 'bullish') ||
                           (dir === 'put' && dominantTrend === 'bearish');
    signals.push({
      source: 'mtf_reversal',
      direction: dir,
      weight: 0.30,  // High weight for confirmed reversals
      confidence: snapshot.mtfReversal.confluenceScore / 100,
      timeframe: '30m',
      reason: `30m ${snapshot.mtfReversal.pattern30m} + ${snapshot.mtfReversal.patterns5m.length} 5m confirms`,
      isTrendAligned,
      isReversal: true,
      isConfirmed
    });
  }

  // 6. Directional probabilities
  const probs = snapshot.directionalProbabilities;
  if (probs.up > probs.down && probs.up > probs.chop * 0.8) {
    signals.push({
      source: 'directional_probs',
      direction: 'call',
      weight: 0.15,
      confidence: probs.up,
      timeframe: '15m',
      reason: `Probability edge: Up ${toPct(probs.up).toFixed(0)}% vs Down ${toPct(probs.down).toFixed(0)}%`,
      isTrendAligned: dominantTrend === 'bullish',
      isReversal: false,
      isConfirmed: true
    });
  } else if (probs.down > probs.up && probs.down > probs.chop * 0.8) {
    signals.push({
      source: 'directional_probs',
      direction: 'put',
      weight: 0.15,
      confidence: probs.down,
      timeframe: '15m',
      reason: `Probability edge: Down ${toPct(probs.down).toFixed(0)}% vs Up ${toPct(probs.up).toFixed(0)}%`,
      isTrendAligned: dominantTrend === 'bearish',
      isReversal: false,
      isConfirmed: true
    });
  }

  // 7. Core reversal signal from reversal engine (BOUNCE DETECTION)
  // CRITICAL: This must be strong enough to override lagging EMA trend
  if (snapshot.reversalSignal && snapshot.reversalSignal.reversalSignal) {
    const dir = snapshot.reversalSignal.reversalDirection === 'up' ? 'call' : 
                snapshot.reversalSignal.reversalDirection === 'down' ? 'put' : 'neutral';
    if (dir !== 'neutral') {
      // Boost weight significantly - bounces need to override lagging indicators
      const baseWeight = 0.50; // Very high base weight for reversal
      const confBoost = snapshot.reversalSignal.reversalConfidence / 100; // Extra boost from confidence
      
      signals.push({
        source: 'bounce_reversal',
        direction: dir,
        weight: baseWeight + confBoost * 0.3, // 0.50 - 0.80 weight range
        confidence: Math.max(0.5, snapshot.reversalSignal.reversalConfidence / 100 + 0.3), // Boost confidence
        timeframe: '5m',
        reason: `🔄 BOUNCE: ${snapshot.reversalSignal.reversalType} (${snapshot.reversalSignal.reversalConfidence}%)`,
        isTrendAligned: false,
        isReversal: true,
        isConfirmed: true // Always confirmed for immediate action
      });
    }
  }
  
  // 8. Gated reversal alert (secondary)
  if (snapshot.gatedReversalAlert && snapshot.gatedReversalAlert.alert && !snapshot.gatedReversalAlert.gated) {
    const dir = snapshot.gatedReversalAlert.direction === 'bullish' ? 'call' : 
                snapshot.gatedReversalAlert.direction === 'bearish' ? 'put' : 'neutral';
    signals.push({
      source: 'reversal_alert',
      direction: dir,
      weight: 0.20,
      confidence: snapshot.gatedReversalAlert.score / 100,
      timeframe: '5m',
      reason: `Reversal alert: ${snapshot.gatedReversalAlert.direction} (score ${snapshot.gatedReversalAlert.score})`,
      isTrendAligned: false,
      isReversal: true,
      isConfirmed: snapshot.gatedReversalAlert.mtfAligned
    });
  }

  // 9. Divergence signal (first-class)
  if (snapshot.divergence && snapshot.divergence.type !== 'none') {
    const div = snapshot.divergence;
    const dir = div.type === 'bullish' ? 'call' : 'put';
    const isTrendAligned = (dir === 'call' && dominantTrend === 'bullish') ||
                           (dir === 'put' && dominantTrend === 'bearish');
    signals.push({
      source: 'divergence',
      direction: dir,
      weight: div.confirmed ? 0.35 : 0.20,
      confidence: div.strength / 100,
      timeframe: '5m',
      reason: `Divergence: ${div.rawLabel ?? div.type} (${div.strength}%)`,
      isTrendAligned,
      isReversal: true,
      isConfirmed: div.confirmed
    });
  }

  return signals;
}

// =============== WEIGHTED FUSION ===============
// Apply timeframe priority, trend alignment bonuses, and reversal logic

function computeWeightedFusion(signals: NormalizedSignal[], volRegime?: string): {
  direction: 'CALL' | 'PUT' | 'WAIT';
  confidence: number;
  bullScore: number;
  bearScore: number;
  adjustedSignals: { source: string; direction: string; weight: number; adjustedWeight: number; reason: string }[];
  reasonStack: string[];
  rejectionReasons: { direction: 'CALL' | 'PUT'; reasons: string[] }[];
} {
  let bullScore = 0;
  let bearScore = 0;
  const adjustedSignals: { source: string; direction: string; weight: number; adjustedWeight: number; reason: string }[] = [];
  const reasonStack: string[] = [];
  const callReasons: string[] = [];
  const putReasons: string[] = [];

  const isHighVol = volRegime === 'high' || volRegime === 'extreme';
  const isLowVol = volRegime === 'low';

  const trendBonus = isHighVol ? TREND_ALIGNED_BONUS * 0.6 : isLowVol ? TREND_ALIGNED_BONUS * 1.3 : TREND_ALIGNED_BONUS;
  const reversalWeight = isHighVol ? REVERSAL_CONFIRMED_BONUS * 1.4 : isLowVol ? REVERSAL_CONFIRMED_BONUS * 0.7 : REVERSAL_CONFIRMED_BONUS;
  const volMinEdge = isHighVol ? 18 : isLowVol ? 8 : 12;

  for (const signal of signals) {
    let adjustedWeight = signal.weight * signal.confidence;
    
    const tfWeight = TIMEFRAME_WEIGHTS[signal.timeframe] ?? 0.7;
    adjustedWeight *= tfWeight;
    
    if (signal.isTrendAligned) {
      adjustedWeight *= (1 + trendBonus);
    } else if (!signal.isReversal && signal.direction !== 'neutral') {
      adjustedWeight *= (1 - COUNTER_TREND_PENALTY);
    }
    
    if (signal.isReversal) {
      if (signal.isConfirmed) {
        adjustedWeight *= (1 + reversalWeight);
      } else {
        adjustedWeight *= (1 - REVERSAL_UNCONFIRMED_PENALTY);
      }
    }

    if (signal.source === 'divergence' && signal.isConfirmed && signal.confidence > 0.6) {
      adjustedWeight *= 1.35;
    }

    // Accumulate scores
    if (signal.direction === 'call') {
      bullScore += adjustedWeight * 100;
      callReasons.push(signal.reason);
    } else if (signal.direction === 'put') {
      bearScore += adjustedWeight * 100;
      putReasons.push(signal.reason);
    }

    adjustedSignals.push({
      source: signal.source,
      direction: signal.direction,
      weight: signal.weight,
      adjustedWeight: adjustedWeight,
      reason: signal.reason
    });
  }

  const netScore = bullScore - bearScore;
  const minEdge = volMinEdge;
  
  let direction: 'CALL' | 'PUT' | 'WAIT' = 'WAIT';
  
  if (netScore >= minEdge) {
    direction = 'CALL';
    reasonStack.push(...callReasons);
  } else if (netScore <= -minEdge) {
    direction = 'PUT';
    reasonStack.push(...putReasons);
  } else {
    reasonStack.push(`No clear edge: CALL ${bullScore.toFixed(0)} vs PUT ${bearScore.toFixed(0)}`);
  }

  // Calculate confidence based on edge strength (normalized 0-100)
  // Components: Edge ratio (50%), signal strength (30%), signal count (20%)
  const totalScore = bullScore + bearScore;
  const edgeRatio = totalScore > 0 ? Math.abs(netScore) / totalScore : 0;
  
  // Normalize scores - typical range is 0-100 per direction
  const maxScore = Math.max(bullScore, bearScore);
  const normalizedStrength = Math.min(1, maxScore / 80); // 80 = strong signal threshold
  const signalCount = signals.filter(s => s.direction !== 'neutral').length;
  const normalizedCount = Math.min(1, signalCount / 6); // 6 = max expected directional signals
  
  const confidence = Math.round(
    edgeRatio * 50 +           // Edge ratio: 0-50 points
    normalizedStrength * 30 +  // Signal strength: 0-30 points
    normalizedCount * 20       // Signal coverage: 0-20 points
  );

  // Build rejection reasons
  const rejectionReasons: { direction: 'CALL' | 'PUT'; reasons: string[] }[] = [];
  
  if (direction !== 'CALL') {
    rejectionReasons.push({
      direction: 'CALL',
      reasons: bearScore > bullScore 
        ? [`Bearish signals stronger (${bearScore.toFixed(0)} vs ${bullScore.toFixed(0)})`]
        : [`Insufficient bullish edge (net: ${netScore.toFixed(0)}, need ${minEdge})`]
    });
  }
  
  if (direction !== 'PUT') {
    rejectionReasons.push({
      direction: 'PUT',
      reasons: bullScore > bearScore
        ? [`Bullish signals stronger (${bullScore.toFixed(0)} vs ${bearScore.toFixed(0)})`]
        : [`Insufficient bearish edge (net: ${netScore.toFixed(0)}, need -${minEdge})`]
    });
  }

  return {
    direction,
    confidence,
    bullScore,
    bearScore,
    adjustedSignals,
    reasonStack,
    rejectionReasons
  };
}

function resolveDirection(params: {
  symbol: string;
  forecast: PatternForecast;
  mtf: MTFConsensus;
  gating: GatingState;
  probs: DirectionalProbabilities;
  emaTrend?: { direction: string; strength: number };
  riskModel?: { riskIndex: number; failureProb: number };
}): { direction: UnifiedDirection; reasons: UnifiedReason[]; bullScore: number; bearScore: number } {
  const { symbol, forecast, mtf, gating, probs, emaTrend, riskModel } = params;
  const reasons: UnifiedReason[] = [];

  const up = probs.up;
  const down = probs.down;
  const chop = probs.chop;
  const upPct = toPct(up);
  const downPct = toPct(down);
  const chopPct = toPct(chop);

  // Calculate directional scores with weighted factors
  let bullScore = 0;
  let bearScore = 0;
  
  // 1. Directional probabilities (weight: 30%)
  // REGIME SHIFT DETECTOR: Penalty for low-confidence or high-chop environments
  const regimePenalty = (probs.chop > 0.45 || gating.regimeCap === 'range') ? 0.7 : 1.0;
  
  bullScore += up * 30 * regimePenalty;
  bearScore += down * 30 * regimePenalty;
  
  reasons.push({
    label: `Probs: Up ${upPct.toFixed(0)}% Down ${downPct.toFixed(0)}%`,
    weight: 0.3,
    impact: up > down ? 'bullish' : down > up ? 'bearish' : 'neutral'
  });

  // 2. MTF consensus (weight: 25%)
  if (mtf.trendConsensus === 'bullish') {
    bullScore += mtf.alignmentScore * 25;
    reasons.push({
      label: `MTF bullish (${toPct(mtf.alignmentScore).toFixed(0)}% aligned)`,
      weight: 0.25,
      impact: 'bullish'
    });
  } else if (mtf.trendConsensus === 'bearish') {
    bearScore += mtf.alignmentScore * 25;
    reasons.push({
      label: `MTF bearish (${toPct(mtf.alignmentScore).toFixed(0)}% aligned)`,
      weight: 0.25,
      impact: 'bearish'
    });
  }
  
  // 3. EMA trend direction (weight: 25%) - strong momentum indicator
  if (emaTrend) {
    const emaStrength = Math.min(emaTrend.strength / 20, 1); // Normalize to 0-1
    if (emaTrend.direction === 'bullish') {
      bullScore += emaStrength * 25;
      reasons.push({
        label: `EMA trend bullish (${emaTrend.strength.toFixed(0)} strength)`,
        weight: 0.25,
        impact: 'bullish'
      });
    } else if (emaTrend.direction === 'bearish') {
      bearScore += emaStrength * 25;
      reasons.push({
        label: `EMA trend bearish (${emaTrend.strength.toFixed(0)} strength)`,
        weight: 0.25,
        impact: 'bearish'
      });
    }
  }

  // 4. Forecast direction (weight: 20%)
  if (forecast.direction === 'up') {
    bullScore += forecast.confidence * 20;
  } else if (forecast.direction === 'down') {
    bearScore += forecast.confidence * 20;
  }
  
  reasons.push({
    label: `Forecast: ${forecast.direction} (${toPct(forecast.confidence).toFixed(0)}%)`,
    weight: 0.2,
    impact: forecast.direction === 'up' ? 'bullish' : forecast.direction === 'down' ? 'bearish' : 'neutral'
  });

  // Calculate net score and determine direction
  const netScore = bullScore - bearScore;
  const scoreThreshold = 15; // Minimum edge needed for directional signal
  
  let dir: UnifiedDirection = 'neutral';
  
  if (netScore >= scoreThreshold) {
    dir = 'bullish';
  } else if (netScore <= -scoreThreshold) {
    dir = 'bearish';
  } else {
    dir = 'neutral';
    reasons.push({
      label: `No clear edge (bull ${bullScore.toFixed(0)} vs bear ${bearScore.toFixed(0)})`,
      weight: 0.15,
      impact: 'neutral'
    });
  }

  // Risk-based override: high risk + high failure prob = go neutral
  if (riskModel && riskModel.riskIndex > 0.7 && riskModel.failureProb > 0.4) {
    reasons.push({
      label: `High risk (${toPct(riskModel.riskIndex).toFixed(0)}%) - caution`,
      weight: 0.3,
      impact: 'risk'
    });
    // Don't fully neutralize, but note the risk
  }

  // Chop override: if chop is dominant (>50%), force neutral
  if (chopPct >= 50) {
    reasons.push({
      label: `Chop dominant (${chopPct.toFixed(0)}%) - WAIT`,
      weight: 0.35,
      impact: 'neutral'
    });
    dir = 'neutral';
  }
  
  // Low probability override: if directional but probs don't support it
  if (dir === 'bullish' && upPct < 35) {
    reasons.push({
      label: `Low bullish probability (${upPct.toFixed(0)}%)`,
      weight: 0.2,
      impact: 'neutral'
    });
    dir = 'neutral';
  }
  if (dir === 'bearish' && downPct < 35) {
    reasons.push({
      label: `Low bearish probability (${downPct.toFixed(0)}%)`,
      weight: 0.2,
      impact: 'neutral'
    });
    dir = 'neutral';
  }

  // Apply signal stability to prevent rapid flipping
  const stabilityResult = getStableDirection({
    symbol,
    bullScore,
    bearScore,
    rawDirection: dir as StableDirection
  });
  
  if (stabilityResult.stabilized) {
    reasons.push({
      label: `Signal stabilized: ${stabilityResult.reason}`,
      weight: 0.4,
      impact: 'info'
    });
  }

  return { direction: stabilityResult.direction as UnifiedDirection, reasons, bullScore, bearScore };
}

function computeUnifiedConfidence(params: {
  mtf: MTFConsensus;
  forecast: PatternForecast;
  risk: RiskModel;
  gating: GatingState;
  vol: VolatilityRegime;
  probs: DirectionalProbabilities;
  institutionalCore?: { score: number };
}): { confidence: number; reasons: UnifiedReason[] } {
  const { mtf, forecast, risk, gating, vol, probs, institutionalCore } = params;
  const reasons: UnifiedReason[] = [];

  const mtfScore = toPct(mtf.alignmentScore);
  const forecastScore = toPct(forecast.confidence);
  const riskScore = toPct(risk.riskIndex);
  const gatingScore = toPct(gating.gatingScore);
  const volScore = toPct(vol.score);

  let base =
    mtfScore * 0.25 +
    forecastScore * 0.25 +
    gatingScore * 0.2 +
    volScore * 0.1 +
    (100 - riskScore) * 0.2;

  // Integrate institutionalCore score (10% weight, 90% other)
  if (institutionalCore) {
    base = base * 0.9 + institutionalCore.score * 0.1;
  }

  base = base / 100;
  base = clamp01(base);

  const up = toPct(probs.up);
  const down = toPct(probs.down);
  const chop = toPct(probs.chop);
  const dirEdge = Math.max(up, down) - chop;

  if (dirEdge < 5) {
    base *= 0.7;
    reasons.push({
      label: `Directional edge weak (Up=${up.toFixed(0)}%, Down=${down.toFixed(0)}%, Chop=${chop.toFixed(0)}%)`,
      weight: 0.25,
      impact: 'neutral'
    });
  }

  if (riskScore > 70) {
    base *= 0.7;
    reasons.push({
      label: `Elevated risk (${riskScore.toFixed(0)}%) - confidence reduced`,
      weight: 0.3,
      impact: 'risk'
    });
  }

  if (!gating.metaAllowed) {
    base *= 0.6;
    reasons.push({
      label: `Meta not allowed by gating - confidence suppressed`,
      weight: 0.35,
      impact: 'risk'
    });
  }

  return { confidence: toPct(base), reasons };
}

export function computeUnifiedSignal(params: {
  snapshot: FusionSnapshot;
  currentPrice: number;
  recentOhlc?: { open: number; high: number; low: number; close: number; volume: number }[];
  entryZone?: { low: number; high: number } | null;
  stopLoss?: number | null;
  targets?: number[] | null;
}): UnifiedSignal {
  const { snapshot, currentPrice, recentOhlc } = params;
  
  // 0DTE Entry Zone: TIGHT ±0.15% around current price for same-day execution
  // This is the actionable entry window, NOT the full breakout range
  const ENTRY_ZONE_PCT = 0.0015; // ±0.15%
  const entryZone = params.entryZone ?? {
    low: currentPrice * (1 - ENTRY_ZONE_PCT),
    high: currentPrice * (1 + ENTRY_ZONE_PCT)
  };

  // Generate 0DTE-appropriate targets and stop loss
  // For 0DTE options, we need TIGHT levels - typically 0.3-0.8% moves
  const corvonaLevels = snapshot.corvonaLevels;
  const volatilityMultiplier = snapshot.volatilityRegime.regime === 'high' ? 1.4 : 
                                snapshot.volatilityRegime.regime === 'low' ? 0.6 : 1.0;
  
  const { mtfConsensus, forecast, volatilityRegime, riskModel, directionalProbabilities, gatingState } = snapshot;

  // =============== NEW WEIGHTED FUSION PIPELINE ===============
  // Step 1: Determine dominant trend for context
  const dominantTrend: 'bullish' | 'bearish' | 'neutral' = 
    mtfConsensus.trendConsensus === 'bullish' ? 'bullish' :
    mtfConsensus.trendConsensus === 'bearish' ? 'bearish' : 'neutral';

  // Step 2: Normalize all inputs to common schema
  const normalizedInputs = normalizeInputs({ snapshot, dominantTrend });

  // Step 3: Apply weighted fusion with timeframe priority, trend bonuses, and volatility mode switching
  const fusionResult = computeWeightedFusion(normalizedInputs, volatilityRegime.regime);

  // =============== TARGET CALCULATION (based on FINAL fusion direction) ===============
  // Targets must use the unified direction from fusion, not early probabilities
  const isBullishDirection = fusionResult.direction === 'CALL';
  
  // 0DTE PREMIUM-OPTIMIZED targets based on CURRENT price
  // H1/L1 = ±0.30% from current = ~25-30% premium gain
  // H2/L2 = ±0.50% from current = ~40-50% premium gain  
  // H3/L3 = ±0.75% from current = ~60-75% premium gain
  const h1 = Math.round(currentPrice * 1.003 * 100) / 100;  // +0.30%
  const h2 = Math.round(currentPrice * 1.005 * 100) / 100;  // +0.50%
  const h3 = Math.round(currentPrice * 1.0075 * 100) / 100; // +0.75%
  const l1 = Math.round(currentPrice * 0.997 * 100) / 100;  // -0.30%
  const l2 = Math.round(currentPrice * 0.995 * 100) / 100;  // -0.50%
  const l3 = Math.round(currentPrice * 0.9925 * 100) / 100; // -0.75%

  let generatedTargets: number[];
  let generatedStopLoss: number;

  if (isBullishDirection) {
    // CALL targets - price goes UP for premium gains
    generatedTargets = [h1, h2, h3];  // +0.30%, +0.50%, +0.75%
    generatedStopLoss = l1;           // -0.30% stop
  } else {
    // PUT targets - price goes DOWN for premium gains
    generatedTargets = [l1, l2, l3];  // -0.30%, -0.50%, -0.75%
    generatedStopLoss = h1;           // +0.30% stop
  }
  
  const targets = params.targets ?? generatedTargets;
  const stopLoss = params.stopLoss ?? generatedStopLoss;

  // =============== LEGACY RESOLUTION (for compatibility) ===============
  const dirResult = resolveDirection({
    symbol: snapshot.symbol,
    forecast,
    mtf: mtfConsensus,
    gating: gatingState,
    probs: directionalProbabilities,
    emaTrend: snapshot.emaTrend ? {
      direction: snapshot.emaTrend.direction,
      strength: snapshot.emaTrend.strength
    } : undefined,
    riskModel: {
      riskIndex: riskModel.riskIndex,
      failureProb: riskModel.failureProb
    }
  });

  const confResult = computeUnifiedConfidence({
    mtf: mtfConsensus,
    forecast,
    risk: riskModel,
    gating: gatingState,
    vol: volatilityRegime,
    probs: directionalProbabilities,
    institutionalCore: snapshot.institutionalCore
  });

  const reasons: UnifiedReason[] = [
    ...dirResult.reasons,
    ...confResult.reasons
  ];

  // Attach institutional reasons if present
  if (snapshot.institutionalCore) {
    snapshot.institutionalCore.reasons.forEach(r => {
      reasons.push({
        label: `Institutional: ${r}`,
        weight: 0.2,
        impact: snapshot.institutionalCore!.direction === 'bull' ? 'bullish' : 
                snapshot.institutionalCore!.direction === 'bear' ? 'bearish' : 'neutral'
      });
    });
  }

  // Attach gating reasons as info/risk
  snapshot.gatingState.reasons.forEach(r => {
    reasons.push({
      label: `Gating: ${r}`,
      weight: 0.15,
      impact: r.toLowerCase().includes('risk') ? 'risk' : 'info'
    });
  });

  // Exhaustion / compression
  if (snapshot.exhaustionCluster.active) {
    reasons.push({
      label: `Exhaustion cluster active`,
      weight: 0.25,
      impact: 'risk'
    });
  }
  if (snapshot.compressionCluster.active) {
    reasons.push({
      label: `Compression cluster active`,
      weight: 0.2,
      impact: 'info'
    });
  }

  // State
  let state: UnifiedSignal['state'] = 'INACTIVE';
  if (!snapshot.gatingState.metaAllowed) {
    state = 'INACTIVE';
  // OPTIMIZED: Higher confidence threshold (was 40, now 55)
  } else if (dirResult.direction === 'neutral' || confResult.confidence < 55) {
    state = 'STALE';
  } else {
    state = 'ACTIVE';
  }

  const summaryParts: string[] = [];

  summaryParts.push(
    `Direction: ${dirResult.direction.toUpperCase()} | State: ${state} | Conf: ${confResult.confidence.toFixed(0)}%`
  );
  summaryParts.push(
    `MTF: ${toPct(mtfConsensus.alignmentScore).toFixed(0)}% | Forecast: ${toPct(forecast.confidence).toFixed(0)}% | Risk: ${toPct(riskModel.riskIndex).toFixed(0)}%`
  );
  summaryParts.push(
    `Vol regime: ${volatilityRegime.regime} (${toPct(volatilityRegime.score).toFixed(0)}%)`
  );

  const rr =
    entryZone && stopLoss && targets.length > 0 && entryZone.low > 0 && stopLoss !== null
      ? Math.abs((targets[0] - entryZone.low) / (entryZone.low - stopLoss))
      : null;

  // Calculate 0DTE strike targets
  const expectedMove = snapshot.forecast.expectedMovePct ?? 0;
  const strikeTargets = calculateStrikeTargets(currentPrice, dirResult.direction, state, expectedMove);

  // 0DTE-focused recommended actions
  const gatingPct = toPct(gatingState.gatingScore);
  const monsterPct = snapshot.monsterGateDecision?.value ?? 0;
  
  let recommendedAction = '⏳ WAIT - Setup building. Monitor for gating unlock before entry.';
  
  if (state === 'ACTIVE' && dirResult.direction === 'bullish') {
    if (gatingPct >= 80 && monsterPct >= 55) {
      recommendedAction = `🟢 0DTE CALL - Strike: $${strikeTargets?.aggressive ?? strikeTargets?.atm ?? 'ATM'}. Target: +80-100% premium. Stop: -40%.`;
    } else {
      recommendedAction = `🟡 CALL setup forming - Gating ${gatingPct.toFixed(0)}% Monster ${monsterPct.toFixed(0)}%. Wait for 80%/55% unlock.`;
    }
  } else if (state === 'ACTIVE' && dirResult.direction === 'bearish') {
    if (gatingPct >= 80 && monsterPct >= 55) {
      recommendedAction = `🟢 0DTE PUT - Strike: $${strikeTargets?.aggressive ?? strikeTargets?.atm ?? 'ATM'}. Target: +80-100% premium. Stop: -40%.`;
    } else {
      recommendedAction = `🟡 PUT setup forming - Gating ${gatingPct.toFixed(0)}% Monster ${monsterPct.toFixed(0)}%. Wait for 80%/55% unlock.`;
    }
  } else if (state === 'STALE') {
    recommendedAction = `⚠️ STALE - Low confidence (${confResult.confidence.toFixed(0)}%). Wait for fresh momentum or regime shift.`;
  } else {
    recommendedAction = `❌ INACTIVE - Gating blocked. ${gatingState.reasons[0] ?? 'Conditions not met for 0DTE entry.'}`;
  }

  // =============== BUILD UNIFIED PLAY ===============
  const unifiedPlay: UnifiedPlay | null = fusionResult.direction !== 'WAIT' ? {
    type: fusionResult.direction,
    symbol: snapshot.symbol,
    strike: strikeTargets?.atm ?? null,
    strikeType: strikeTargets ? 'ATM' : null,
    style: 'scalp',
    alignment: snapshot.mtfReversal?.hasReversal ? 'reversal' : 
               dominantTrend === 'bullish' && fusionResult.direction === 'CALL' ? 'trend-aligned' :
               dominantTrend === 'bearish' && fusionResult.direction === 'PUT' ? 'trend-aligned' :
               dominantTrend !== 'neutral' ? 'counter-trend' : 'neutral',
    confidence: fusionResult.confidence,
    reason: fusionResult.reasonStack[0] ?? 'Weighted fusion signal'
  } : null;

  // =============== BUILD DECISION EXPLANATION ===============
  const decisionExplanation: DecisionExplanation = {
    inputsUsed: fusionResult.adjustedSignals,
    weightsApplied: {
      trendBonus: TREND_ALIGNED_BONUS,
      reversalBonus: REVERSAL_CONFIRMED_BONUS,
      counterTrendPenalty: COUNTER_TREND_PENALTY,
      timeframePriority: TIMEFRAME_WEIGHTS
    },
    finalFusion: {
      direction: fusionResult.direction,
      confidence: fusionResult.confidence,
      netBullScore: fusionResult.bullScore,
      netBearScore: fusionResult.bearScore,
      reasonStack: fusionResult.reasonStack
    },
    rejectionReasons: fusionResult.rejectionReasons
  };

  // =============== CALCULATE SETUP GRADE ===============
  // NOTE: These are quality tiers, NOT guaranteed win rates
  // Real historical backtest shows ~52% overall accuracy
  // Better grades have slightly higher edge but NO guarantees
  const confPct = fusionResult.confidence;
  const gradeGatingPct = toPct(gatingState.gatingScore);
  const monsterValue = snapshot.monsterGateDecision?.value ?? 0;
  
  let setupGrade: SetupGrade = 'WAIT';
  if (confPct >= 85 && gradeGatingPct >= 80 && monsterValue >= 55) {
    setupGrade = 'GOLD';  // Highest quality setup
  } else if (confPct >= 75 && gradeGatingPct >= 70 && monsterValue >= 45) {
    setupGrade = 'HOT';   // High quality setup
  } else if (confPct >= 65 && gradeGatingPct >= 60) {
    setupGrade = 'READY'; // Standard quality setup
  } else if (confPct >= 55 && gradeGatingPct >= 50) {
    setupGrade = 'BUILDING'; // Developing setup
  }
  // else WAIT (low quality - avoid trading)

  // Divergence-based grade upgrade (strong confirmed divergence boosts READY->HOT, HOT->GOLD)
  const div = snapshot.divergence;
  if (div && div.type !== 'none' && div.confirmed && div.strength >= 60) {
    if (setupGrade === 'READY') {
      setupGrade = 'HOT';
    } else if (setupGrade === 'HOT') {
      setupGrade = 'GOLD';
    }
  }

  // =============== OPTION B FILTERING (GOLD/HOT, 75%+, optimal timing) ===============
  const OPTION_B_GRADES = ['GOLD', 'HOT'];
  const OPTION_B_MIN_CONF = 75;
  const optionBReasons: string[] = [];
  
  const gradeOk = OPTION_B_GRADES.includes(setupGrade);
  const confOk = fusionResult.confidence >= OPTION_B_MIN_CONF;
  
  if (gradeOk) optionBReasons.push(`Grade: ${setupGrade} ✓`);
  else optionBReasons.push(`Grade: ${setupGrade} ✗ (need GOLD/HOT)`);
  
  if (confOk) optionBReasons.push(`Confidence: ${fusionResult.confidence}% ✓`);
  else optionBReasons.push(`Confidence: ${fusionResult.confidence}% ✗ (need 75%+)`);
  
  const optionBQualified = gradeOk && confOk && fusionResult.direction !== 'WAIT';
  if (optionBQualified) {
    optionBReasons.push(`✅ OPTION B QUALIFIED - Trade this setup!`);
  }

  // =============== REVERSAL ALERT (boost reversals for bounce catching) ===============
  const reversalSignal = snapshot.reversalSignal;
  let reversalAlert: UnifiedSignal['reversalAlert'] = {
    active: false,
    direction: 'NONE',
    type: null,
    confidence: 0,
    reasons: []
  };
  
  if (reversalSignal && reversalSignal.reversalSignal) {
    const revDir = reversalSignal.reversalDirection === 'up' ? 'CALL' : 
                   reversalSignal.reversalDirection === 'down' ? 'PUT' : 'NONE';
    
    reversalAlert = {
      active: true,
      direction: revDir,
      type: reversalSignal.reversalType,
      confidence: reversalSignal.reversalConfidence,
      reasons: reversalSignal.reversalReasons
    };
    
    // If reversal is strong (40%+) and aligns with fusion direction, boost state to ACTIVE
    if (reversalSignal.reversalConfidence >= 40 && 
        ((revDir === 'CALL' && fusionResult.direction === 'CALL') ||
         (revDir === 'PUT' && fusionResult.direction === 'PUT'))) {
      state = 'ACTIVE';
      recommendedAction = `🔄 REVERSAL ${revDir} detected! ${reversalSignal.reversalType} pattern with ${reversalSignal.reversalConfidence}% confidence.`;
    }
  }

  // =============== SIGNAL HEALTH ===============
  const signalHealth = computeSignalHealth({
    signals: normalizedInputs,
    fusionDirection: fusionResult.direction,
    bullScore: fusionResult.bullScore,
    bearScore: fusionResult.bearScore,
    volatilityRegime,
    gatingScore: toPct(gatingState.gatingScore)
  });

  // =============== TREND INTEGRITY ===============
  const trendIntegrity = computeTrendIntegrity({
    mtfConsensus,
    emaTrend: snapshot.emaTrend ? { direction: snapshot.emaTrend.direction, strength: snapshot.emaTrend.strength } : undefined,
    probs: directionalProbabilities,
    fusionDirection: fusionResult.direction
  });

  // =============== REASON GRAPH ===============
  const reasonGraph = buildReasonGraph({
    normalizedSignals: normalizedInputs,
    gatingReasons: gatingState.reasons,
    riskModel,
    volatilityRegime,
    signalHealth,
    trendIntegrity
  });

  // =============== PRICE ACTION SAFETY LAYER ===============
  const priceActionSafety = computePriceActionSafety({
    recentOhlc: (recentOhlc ?? []) as any,
    signalDirection: fusionResult.direction,
    currentPrice
  });

  let safeDirection = fusionResult.direction;
  let safeConfidence = fusionResult.confidence;

  if (priceActionSafety.safetyAction === 'force_wait') {
    safeDirection = 'WAIT';
    safeConfidence = Math.min(safeConfidence, 30);
    reasons.push({
      label: `SAFETY OVERRIDE: ${priceActionSafety.reasons[0] ?? 'Price action contradicts signal'}`,
      weight: 0.9,
      impact: 'risk'
    });
    state = 'STALE';
    recommendedAction = `SAFETY: Price pushing ${priceActionSafety.momentumDirection} against ${fusionResult.direction}. Wait for alignment.`;
  } else if (priceActionSafety.safetyAction === 'reduce_confidence') {
    safeConfidence = Math.round(safeConfidence * priceActionSafety.confidenceMultiplier);
    reasons.push({
      label: `SAFETY: ${priceActionSafety.reasons[0] ?? 'Price momentum conflicts with signal'}`,
      weight: 0.5,
      impact: 'risk'
    });
    if (safeConfidence < 55 && state === 'ACTIVE') {
      state = 'STALE';
    }
  } else if (priceActionSafety.confidenceMultiplier > 1.0) {
    safeConfidence = Math.min(100, Math.round(safeConfidence * priceActionSafety.confidenceMultiplier));
  }

  for (const r of priceActionSafety.reasons) {
    if (!reasons.some(existing => existing.label.includes(r.substring(0, 30)))) {
      reasons.push({ label: r, weight: 0.3, impact: priceActionSafety.contradiction ? 'risk' : 'info' });
    }
  }

  // =============== MEMORY SMOOTHING ===============
  const hasActiveReversal = !!(snapshot.reversalSignal && snapshot.reversalSignal.reversalSignal);
  const memorySmoothing = applyMemorySmoothing(
    snapshot.symbol,
    safeDirection,
    safeConfidence
  );
  pushMemory(snapshot.symbol, {
    direction: safeDirection,
    confidence: safeConfidence,
    hadReversal: hasActiveReversal
  });

  const finalDirection = memorySmoothing.smoothedDirection;

  return {
    symbol: snapshot.symbol,
    timestamp: snapshot.timestamp,
    currentPrice,

    // =============== SINGLE SOURCE OF TRUTH (UI reads ONLY these) ===============
    unifiedDirection: finalDirection,
    unifiedConfidence: safeConfidence,
    unifiedPlay,
    setupGrade,

    // Legacy direction (maps to unifiedDirection for compatibility)
    direction: finalDirection === 'CALL' ? 'bullish' : 
               finalDirection === 'PUT' ? 'bearish' : 'neutral',
    state,
    // Status maps state to UI expected values
    status: state === 'ACTIVE' ? 'active' : state === 'STALE' ? 'stale' : 'inactive',
    regime: volatilityRegime.regime,
    regimeScore: toPct(volatilityRegime.score),

    // EntryZone mapped for UI compatibility (min/max instead of low/high)
    entryZone: entryZone.low > 0 && entryZone.high > 0 
      ? { low: entryZone.low, high: entryZone.high, min: entryZone.low, max: entryZone.high } 
      : null,
    stopLoss,
    targets: targets.filter(t => t > 0),
    // priceTargets for UI compatibility
    priceTargets: targets.filter(t => t > 0),
    rr,
    strikeTargets,

    // confidence as 0-1 for UI compatibility (UI compares to 0.7, 0.5)
    confidence: safeConfidence / 100,
    mtfAlignment: toPct(mtfConsensus.alignmentScore),
    forecastConfidence: toPct(forecast.confidence),
    riskScore: toPct(riskModel.riskIndex),
    gatingScore: toPct(gatingState.gatingScore),

    directionalProbs: {
      up: toPct(directionalProbabilities.up),
      chop: toPct(directionalProbabilities.chop),
      down: toPct(directionalProbabilities.down)
    },

    // Option B filtering
    optionBQualified,
    optionBReasons,
    
    // Reversal alert
    reversalAlert,

    // Context modules (for display, NOT decision drivers)
    fusionBias:
      forecast.direction === 'up' ? 'bullish' :
      forecast.direction === 'down' ? 'bearish' : 'neutral',

    forecastDirection: forecast.direction,
    mtfTrendConsensus: mtfConsensus.trendConsensus,
    monsterGate: snapshot.monsterGateDecision,
    gatingState: snapshot.gatingState,
    volatilityRegime: snapshot.volatilityRegime,
    riskModel: snapshot.riskModel,
    emaTrend: snapshot.emaTrend,
    corvonaLevels: snapshot.corvonaLevels,
    reversalSignal: snapshot.reversalSignal,
    gatedReversalAlert: snapshot.gatedReversalAlert,

    // Normalized inputs (for transparency)
    normalizedInputs,
    
    // Decision explanation (institutional transparency)
    decisionExplanation,

    signalHealth,
    trendIntegrity,
    reasonGraph,
    memorySmoothing,
    priceActionSafety,

    institutionalCore: snapshot.institutionalCore,

    reasons,
    // Notes for UI display (uses reasons labels)
    notes: reasons.map(r => r.label),
    summary: summaryParts.join(' • '),
    recommendedAction
  };
}
