let yahooFinanceInstance: InstanceType<typeof import('yahoo-finance2').default> | null = null;

async function getYahooFinance() {
  if (!yahooFinanceInstance) {
    const mod = await import('yahoo-finance2');
    const YahooFinance = mod.default;
    yahooFinanceInstance = new YahooFinance();
  }
  return yahooFinanceInstance;
}

export interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
}

interface CacheEntry {
  data: {
    full: OHLC[];
    rth: OHLC[];
    overnight: OHLC[];
    prevDayRth: OHLC[];
  };
  timestamp: number;
}

export type SessionType = 'RTH' | 'OVERNIGHT' | 'FULL';

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000;

function getCacheKey(
  symbol: string,
  timeframe: string,
  session: SessionType,
  period1: Date,
  period2: Date
): string {
  return [
    symbol.toUpperCase(),
    timeframe,
    session,
    period1.getTime(),
    period2.getTime(),
  ].join('-');
}

function getFromCache(
  symbol: string,
  timeframe: string,
  session: SessionType,
  period1: Date,
  period2: Date
): CacheEntry['data'] | null {
  const key = getCacheKey(symbol, timeframe, session, period1, period2);
  const entry = cache.get(key);

  if (entry && Date.now() - entry.timestamp < CACHE_TTL_MS) {
    return entry.data;
  }

  cache.delete(key);
  return null;
}

function setCache(
  symbol: string,
  timeframe: string,
  session: SessionType,
  period1: Date,
  period2: Date,
  data: CacheEntry['data']
): void {
  const key = getCacheKey(symbol, timeframe, session, period1, period2);
  cache.set(key, { data, timestamp: Date.now() });

  if (cache.size > 200) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
}

const INTERVAL_MAP: Record<string, '1m' | '5m' | '15m' | '30m' | '1h' | '1d'> = {
  '1m': '1m',
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '4h': '1h',
  '1d': '1d',
};

function getDateRange(timeframe: string): { period1: Date; period2: Date } {
  const now = new Date();
  const period2 = now;
  let period1: Date;

  switch (timeframe) {
    case '1m':
      period1 = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      break;
    case '5m':
      period1 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '15m':
      period1 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      break;
    case '1h':
      period1 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      break;
    case '4h':
      period1 = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);
      break;
    case '1d':
      period1 = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    default:
      period1 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  }

  return { period1, period2 };
}

function toEST(date: Date): Date {
  const offsetMs = 5 * 60 * 60 * 1000;
  return new Date(date.getTime() - offsetMs);
}

function isRthEst(date: Date): boolean {
  const d = toEST(date);
  const hour = d.getHours();
  const min = d.getMinutes();
  const totalMin = hour * 60 + min;
  const open = 9 * 60 + 30;
  const close = 16 * 60;
  return totalMin >= open && totalMin < close;
}

function splitSessions(ohlc: OHLC[]): {
  full: OHLC[];
  rth: OHLC[];
  overnight: OHLC[];
  prevDayRth: OHLC[];
} {
  if (ohlc.length === 0) {
    return { full: [], rth: [], overnight: [], prevDayRth: [] };
  }

  const full = [...ohlc].sort((a, b) => a.time - b.time);

  const byDay: Record<string, OHLC[]> = {};
  for (const c of full) {
    const d = toEST(new Date(c.time * 1000));
    const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
    if (!byDay[key]) byDay[key] = [];
    byDay[key].push(c);
  }

  const dayKeys = Object.keys(byDay).sort();
  const todayKey = dayKeys[dayKeys.length - 1];
  const prevKey = dayKeys[dayKeys.length - 2];

  const today = byDay[todayKey] ?? [];
  const prev = prevKey ? byDay[prevKey] : [];

  const rth = today.filter(c => isRthEst(new Date(c.time * 1000)));
  const overnight = today.filter(c => !isRthEst(new Date(c.time * 1000)));
  const prevDayRth = prev.filter(c => isRthEst(new Date(c.time * 1000)));

  return { full, rth, overnight, prevDayRth };
}

export async function fetchLiveOHLC(
  symbol: string,
  timeframe: string = '15m',
  session: SessionType = 'FULL'
): Promise<{
  data: OHLC[];
  rth: OHLC[];
  overnight: OHLC[];
  prevDayRth: OHLC[];
  isLive: boolean;
  error?: string;
}> {
  const { period1, period2 } = getDateRange(timeframe);
  const cached = getFromCache(symbol, timeframe, session, period1, period2);
  if (cached) {
    const { full, rth, overnight, prevDayRth } = cached;
    const data =
      session === 'RTH' ? rth :
      session === 'OVERNIGHT' ? overnight :
      full;
    return { data, rth, overnight, prevDayRth, isLive: true };
  }

  try {
    const interval = INTERVAL_MAP[timeframe] || '1d';
    const yahooFinance = await getYahooFinance();

    const result = await yahooFinance.chart(symbol.toUpperCase(), {
      period1,
      period2,
      interval,
    }) as {
      quotes: Array<{
        date: Date;
        open: number | null;
        high: number | null;
        low: number | null;
        close: number | null;
        volume: number | null;
      }>;
    };

    if (!result.quotes || result.quotes.length === 0) {
      return {
        data: [],
        rth: [],
        overnight: [],
        prevDayRth: [],
        isLive: false,
        error: 'No data available for this symbol',
      };
    }

    const fullOhlc: OHLC[] = result.quotes
      .filter(q => q.open != null && q.high != null && q.low != null && q.close != null)
      .map(q => ({
        open: q.open!,
        high: q.high!,
        low: q.low!,
        close: q.close!,
        volume: q.volume || 0,
        time: Math.floor(new Date(q.date).getTime() / 1000),
      }));

    if (fullOhlc.length === 0) {
      return {
        data: [],
        rth: [],
        overnight: [],
        prevDayRth: [],
        isLive: false,
        error: 'No valid OHLC data',
      };
    }

    const split = splitSessions(fullOhlc);
    setCache(symbol, timeframe, session, period1, period2, split);

    const data =
      session === 'RTH' ? split.rth :
      session === 'OVERNIGHT' ? split.overnight :
      split.full;

    return {
      data,
      rth: split.rth,
      overnight: split.overnight,
      prevDayRth: split.prevDayRth,
      isLive: true,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`Yahoo Finance error for ${symbol}:`, message);
    return {
      data: [],
      rth: [],
      overnight: [],
      prevDayRth: [],
      isLive: false,
      error: message,
    };
  }
}

export function clearCache(): void {
  cache.clear();
}
