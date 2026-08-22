import { OHLC, MarketHealthIndicators, TimeframePatternIntel } from '../fusion';

export interface LTFStructureResult {
  structureQuality: 'clean' | 'choppy' | 'uncertain';
  coherence: number; // 0-1
  details?: string[];
}

export function analyzeLTFStructure(timeframes: TimeframePatternIntel[], ohlcByTF: Partial<Record<string, OHLC[]>>): LTFStructureResult {
  // Heuristic: evaluate 1m/5m/15m structure coherence
  const tfs = ['1m','5m','15m'];
  let coherence = 0;
  const details: string[] = [];
  for (const tf of tfs) {
    const intel = timeframes.find(t => t.timeframe === tf);
    if (!intel) continue;
    const c = intel.structuralCompression ?? 0;
    coherence += 1 - Math.min(1, Math.abs(c));
    details.push(`${tf}:${Math.round((intel.primary?.confidence ?? 0))}`);
  }
  coherence = coherence / Math.max(1, tfs.length);
  const structureQuality = coherence > 0.7 ? 'clean' : coherence < 0.4 ? 'choppy' : 'uncertain';
  return { structureQuality, coherence: Math.max(0, Math.min(1, coherence)), details };
}
