interface MemoryEntry {
  timestamp: number;
  direction: 'CALL' | 'PUT' | 'WAIT';
  confidence: number;
  hadReversal: boolean;
}

const MEMORY_SIZE = 3;
const MEMORY_EXPIRY_MS = 300_000;

const memoryCache = new Map<string, MemoryEntry[]>();

export function pushMemory(symbol: string, entry: Omit<MemoryEntry, 'timestamp'>): void {
  const sym = symbol.toUpperCase();
  if (!memoryCache.has(sym)) memoryCache.set(sym, []);
  const ring = memoryCache.get(sym)!;
  ring.push({ ...entry, timestamp: Date.now() });
  if (ring.length > MEMORY_SIZE) ring.shift();
}

function getRecentEntries(symbol: string): MemoryEntry[] {
  const sym = symbol.toUpperCase();
  const ring = memoryCache.get(sym);
  if (!ring || ring.length === 0) return [];
  const cutoff = Date.now() - MEMORY_EXPIRY_MS;
  return ring.filter(e => e.timestamp >= cutoff);
}

export interface MemorySmoothing {
  smoothedDirection: 'CALL' | 'PUT' | 'WAIT';
  wasOverridden: boolean;
  reason: string;
  recentReversalRate: number;
  avgRecentConfidence: number;
}

export function applyMemorySmoothing(
  symbol: string,
  rawDirection: 'CALL' | 'PUT' | 'WAIT',
  rawConfidence: number
): MemorySmoothing {
  const entries = getRecentEntries(symbol);

  if (entries.length < 2) {
    return {
      smoothedDirection: rawDirection,
      wasOverridden: false,
      reason: 'Insufficient memory',
      recentReversalRate: 0,
      avgRecentConfidence: rawConfidence
    };
  }

  const avgConf = entries.reduce((s, e) => s + e.confidence, 0) / entries.length;
  const reversalCount = entries.filter(e => e.hadReversal).length;
  const recentReversalRate = reversalCount / entries.length;

  let dirCounts: Record<string, number> = { CALL: 0, PUT: 0, WAIT: 0 };
  for (const e of entries) dirCounts[e.direction]++;

  const dominantDir = (Object.entries(dirCounts)
    .sort((a, b) => b[1] - a[1])[0][0]) as 'CALL' | 'PUT' | 'WAIT';

  if (rawDirection === 'WAIT') {
    return {
      smoothedDirection: 'WAIT',
      wasOverridden: false,
      reason: 'Raw direction is WAIT',
      recentReversalRate,
      avgRecentConfidence: avgConf
    };
  }

  if (rawDirection !== dominantDir && dominantDir !== 'WAIT' && rawConfidence < 65) {
    return {
      smoothedDirection: dominantDir,
      wasOverridden: true,
      reason: `Low-confidence flip suppressed (${rawDirection}->${dominantDir}, conf ${rawConfidence.toFixed(0)}%)`,
      recentReversalRate,
      avgRecentConfidence: avgConf
    };
  }

  if (recentReversalRate >= 0.67 && rawConfidence < 60) {
    return {
      smoothedDirection: 'WAIT',
      wasOverridden: true,
      reason: `High reversal churn (${(recentReversalRate * 100).toFixed(0)}%) with low confidence`,
      recentReversalRate,
      avgRecentConfidence: avgConf
    };
  }

  return {
    smoothedDirection: rawDirection,
    wasOverridden: false,
    reason: 'No smoothing needed',
    recentReversalRate,
    avgRecentConfidence: avgConf
  };
}
