// playSynthesis.ts - Unified Options Play synthesis engine
// Combines Monster OTM analysis with Unified Signal for legendary play recommendations

import type { UnifiedSignal } from './unifiedSignal';
import type { SyntheticContract, SyntheticOptionsChain } from './syntheticOptions';
import type { PCESignal } from './monsterOTM';
import type { 
  MonsterDirection, 
  UnifiedOptionsPlay, 
  UnifiedOptionsPlayReason 
} from '@shared/schema';

export type { MonsterDirection, UnifiedOptionsPlay, UnifiedOptionsPlayReason };

interface SynthesizePlayParams {
  symbol: string;
  timeframe: string;
  unified: UnifiedSignal | null;
  chain: SyntheticOptionsChain;
  spot: number;
  expectedMove: number;
  isSynthetic: boolean;
}

function fusedScore(
  contract: SyntheticContract,
  pce: PCESignal,
  unifiedConfidence: number
): number {
  const contractScore = contract.score.total;
  const pceScore = pce.pceProb * 100;
  const gateScore = pce.quality === 'A' ? 100 : pce.quality === 'B' ? 75 : pce.quality === 'C' ? 50 : 25;
  
  const delta = contract.greeks.delta;
  const deltaScore = Math.max(0, 20 - Math.abs(delta - 0.3) * 100);
  
  const rrScore = Math.max(0, Math.min(20, (contract.expansion.rrRatio - 1) * 10));
  
  const total =
    contractScore * 0.35 +
    pceScore * 0.15 +
    gateScore * 0.15 +
    unifiedConfidence * 0.15 +
    rrScore * 0.10 +
    deltaScore * 0.10;

  return Math.round(Math.max(0, Math.min(100, total)));
}

export function synthesizeMonsterPlay(params: SynthesizePlayParams): UnifiedOptionsPlay | null {
  const { symbol, timeframe, unified, chain, spot, expectedMove, isSynthetic } = params;

  if (!unified || unified.state !== 'ACTIVE') return null;
  if (unified.direction === 'neutral' || unified.direction === 'none') return null;

  const direction: MonsterDirection = unified.direction === 'bullish' ? 'CALLS' : 'PUTS';
  const contracts = direction === 'CALLS' ? chain.calls : chain.puts;

  if (!contracts || contracts.length === 0) return null;

  const expectedMovePercent = expectedMove / spot;

  const viable = contracts.filter((c) => {
    const delta = c.greeks.delta;
    const deltaOk = delta >= 0.15 && delta <= 0.50;

    const strikeDistance = Math.abs(c.strike - spot);
    const withinExpectedMove = strikeDistance <= expectedMove * 1.5;

    const rrOk = c.expansion.rrRatio >= 1.0;

    return deltaOk && withinExpectedMove && rrOk;
  });

  if (viable.length === 0) return null;

  const unifiedConfidence = unified.confidence ?? 50;
  const pce = chain.pce;

  const ranked = viable
    .map((c) => ({
      contract: c,
      fusedScore: fusedScore(c, pce, unifiedConfidence),
    }))
    .sort((a, b) => b.fusedScore - a.fusedScore);

  const best = ranked[0];
  const c = best.contract;

  const reasons: UnifiedOptionsPlayReason[] = [];

  reasons.push({
    label: `Unified Signal ${unified.state} ${unified.direction.toUpperCase()}`,
    weight: 0.2,
  });

  reasons.push({
    label: `Contract score ${c.score.total}`,
    weight: 0.15,
  });

  const pceProb = Math.round(pce.pceProb * 100);
  reasons.push({
    label: `PCE alignment ${pceProb}%`,
    weight: 0.15,
  });

  if (pce.quality !== 'none') {
    reasons.push({
      label: `Setup quality ${pce.quality}`,
      weight: 0.15,
    });
  }

  reasons.push({
    label: `Delta ${Math.round(c.greeks.delta * 100)} in optimal range`,
    weight: 0.1,
  });

  reasons.push({
    label: `R:R ${c.expansion.rrRatio.toFixed(2)}:1`,
    weight: 0.1,
  });

  if (c.score.reasons.length > 0) {
    c.score.reasons.slice(0, 2).forEach((r) => {
      reasons.push({ label: r, weight: 0.05 });
    });
  }

  const entryTrigger =
    direction === 'CALLS'
      ? Math.min(unified.entryZone?.high ?? spot, spot + expectedMove * 0.3)
      : Math.max(unified.entryZone?.low ?? spot, spot - expectedMove * 0.3);

  const mapDirection = (d: string): 'BULLISH' | 'BEARISH' | 'NEUTRAL' => {
    if (d === 'bullish') return 'BULLISH';
    if (d === 'bearish') return 'BEARISH';
    return 'NEUTRAL';
  };

  const play: UnifiedOptionsPlay = {
    symbol,
    timeframe,
    direction,
    isSynthetic,

    expiration: c.expiration.label,
    strike: c.strike,
    premium: c.premium,
    delta: c.greeks.delta,

    entryTrigger,
    stop: c.expansion.stopPremium,
    target: c.expansion.targetPremium,
    rr: Number.isFinite(c.expansion.rrRatio) ? Number(c.expansion.rrRatio.toFixed(2)) : 0,

    score: best.fusedScore,
    confidence: Math.round(Math.min(100, best.fusedScore)),
    pceScore: pceProb,
    monsterGate: pce.quality === 'A' ? 100 : pce.quality === 'B' ? 75 : pce.quality === 'C' ? 50 : 25,

    spot,
    expectedMove,
    unifiedState: unified.state,
    unifiedDirection: mapDirection(unified.direction),

    reasons,
    notes: isSynthetic
      ? 'Synthetic options chain used for modeling. For educational purposes only.'
      : undefined,
  };

  return play;
}
