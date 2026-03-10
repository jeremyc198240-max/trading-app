// marketData.ts - Multi-source market data (Finnhub primary, Yahoo fallback)

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';

let yahooFinanceInstance: any | null = null;

// Finnhub quote response interface
interface FinnhubQuote {
  c: number;  // Current price
  d: number;  // Change
  dp: number; // Percent change
  h: number;  // High price of the day
  l: number;  // Low price of the day
  o: number;  // Open price of the day
  pc: number; // Previous close price
  t: number;  // Timestamp
}

// Fetch real-time quote from Finnhub
async function fetchFinnhubQuote(symbol: string): Promise<FinnhubQuote | null> {
  if (!FINNHUB_API_KEY) {
    return null;
  }
  
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol.toUpperCase()}&token=${FINNHUB_API_KEY}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      console.warn(`[Finnhub] HTTP ${response.status} for ${symbol}`);
      return null;
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      console.warn(`[Finnhub] Non-JSON response for ${symbol}; skipping quote parse.`);
      return null;
    }
    
    const data = await response.json() as FinnhubQuote;
    
    // Finnhub returns { c: 0, d: null, ... } for invalid symbols
    if (data.c === 0 && data.pc === 0) {
      console.warn(`[Finnhub] No data for ${symbol}`);
      return null;
    }
    
    if (process.env.DEBUG_SIGNALS === '1') {
      console.log(`[Finnhub] Quote for ${symbol}: $${data.c.toFixed(2)} (${data.dp > 0 ? '+' : ''}${data.dp.toFixed(2)}%)`);
    }
    return data;
  } catch (error) {
    console.warn(`[Finnhub] Error fetching ${symbol}:`, error);
    return null;
  }
}

async function getYahooFinance() {
  if (!yahooFinanceInstance) {
    const mod = await import('yahoo-finance2');
    const candidate: any = (mod as any).default ?? mod;

    if (typeof candidate === 'function') {
      yahooFinanceInstance = new candidate();
    } else if (candidate && typeof candidate === 'object') {
      if (typeof candidate.suppressNotices === 'function') {
        candidate.suppressNotices(['yahooSurvey']);
      }
      yahooFinanceInstance = candidate;
    } else {
      throw new Error('Unsupported yahoo-finance2 export shape');
    }
  }
  return yahooFinanceInstance;
}

export interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;    // unix seconds (for backend compatibility)
  timeMs: number;  // unix milliseconds (for chart libraries)
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

// Last known good data for gap protection (never wipe charts on error)
const lastKnownData = new Map<string, CacheEntry['data']>();

// Spot price cache for high-frequency polling
interface SpotCache {
  data: {
    symbol: string;
    spot: number;
    prevClose: number;
    marketState: string;
    timestamp: string;
    source: 'finnhub' | 'yahoo';
  };
  timestamp: number;
}
const spotCache = new Map<string, SpotCache>();

export type SessionType = 'RTH' | 'OVERNIGHT' | 'FULL';

const cache = new Map<string, CacheEntry>();

// Timeframe-specific cache TTLs (in milliseconds)
// 5m/15m/30m: 60 seconds, 2h/4h: 5 minutes, 1d: 10 minutes
const CACHE_TTL_BY_TF: Record<string, number> = {
  '5m': 60 * 1000,
  '15m': 60 * 1000,
  '30m': 60 * 1000,
  '1h': 2 * 60 * 1000,
  '2h': 5 * 60 * 1000,
  '4h': 5 * 60 * 1000,
  '1d': 10 * 60 * 1000,
  '1D': 10 * 60 * 1000,
};

// Spot price cache TTL: 2 seconds for faster quote refresh
const SPOT_CACHE_TTL_MS = 2 * 1000;
const FINNHUB_MAX_STALENESS_MS = 60 * 1000;
const YAHOO_MAX_STALENESS_MS = 90 * 1000;
const MAX_CACHED_SPOT_FALLBACK_MS = 120 * 1000;
const MAX_CACHED_SPOT_RATE_LIMIT_FALLBACK_MS = 10 * 60 * 1000;
const YAHOO_OHLC_COOLDOWN_MS = 60 * 1000;
const YAHOO_SPOT_COOLDOWN_MS = 60 * 1000;

let yahooOhlcGlobalCooldownUntil = 0;
let yahooOhlcCooldownLogAt = 0;
let yahooSpotGlobalCooldownUntil = 0;
let yahooSpotCooldownLogAt = 0;

function isYahooRateLimitError(message: string): boolean {
  const m = message.toLowerCase();
  return (
    m.includes('too many requests') ||
    m.includes('rate limit') ||
    m.includes('status code 429') ||
    m.includes('http 429')
  );
}

function getCacheTTL(timeframe: string): number {
  return CACHE_TTL_BY_TF[timeframe] || 60 * 1000;
}

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
  const ttl = getCacheTTL(timeframe);

  if (entry && Date.now() - entry.timestamp < ttl) {
    return entry.data;
  }

  cache.delete(key);
  return null;
}

// Get last known good data key (simpler, for gap protection)
function getLastKnownKey(symbol: string, timeframe: string): string {
  return `${symbol.toUpperCase()}-${timeframe}`;
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

const INTERVAL_MAP: Record<string, '5m' | '15m' | '30m' | '1h' | '1d'> = {
  '5m': '5m',
  '15m': '15m',
  '30m': '30m',
  '1h': '1h',
  '2h': '1h',  // Yahoo doesn't have 2h, use 1h and aggregate
  '4h': '1h',  // Yahoo doesn't have 4h, use 1h and aggregate
  '1d': '1d',
  '1D': '1d',
};

function getDateRange(timeframe: string): { period1: Date; period2: Date } {
  const now = new Date();
  const period2 = now;
  let period1: Date;

  switch (timeframe) {
    case '5m':
      period1 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '15m':
      period1 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      break;
    case '30m':
      period1 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '1h':
      period1 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
      break;
    case '2h':
      period1 = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '4h':
      period1 = new Date(now.getTime() - 120 * 24 * 60 * 60 * 1000);
      break;
    case '1d':
    case '1D':
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

function aggregateCandles(candles: OHLC[], factor: number): OHLC[] {
  if (factor <= 1 || candles.length === 0) return candles;

  const sorted = [...candles].sort((a, b) => a.time - b.time);
  const result: OHLC[] = [];

  for (let i = 0; i < sorted.length; i += factor) {
    const chunk = sorted.slice(i, i + factor);
    if (chunk.length === 0) continue;

    result.push({
      open: chunk[0].open,
      high: Math.max(...chunk.map(c => c.high)),
      low: Math.min(...chunk.map(c => c.low)),
      close: chunk[chunk.length - 1].close,
      volume: chunk.reduce((s, c) => s + c.volume, 0),
      time: chunk[0].time,
      timeMs: chunk[0].timeMs,
    });
  }

  return result;
}

function getAggregationFactor(timeframe: string): number {
  switch (timeframe) {
    case '2h': return 2;
    case '4h': return 4;
    default: return 1;
  }
}

function sanitizeOhlcWicks(candles: OHLC[]): OHLC[] {
  if (candles.length < 5) return candles;

  const validCandles = candles.filter(c => c.volume > 0 && c.high > c.low);
  if (validCandles.length < 3) return candles;

  const bodies = validCandles.map(c => Math.abs(c.close - c.open)).filter(b => b > 0).sort((a, b) => a - b);
  const ranges = validCandles.map(c => c.high - c.low).sort((a, b) => a - b);
  const medianRange = ranges[Math.floor(ranges.length / 2)];
  const medianBody = bodies.length > 0 ? bodies[Math.floor(bodies.length / 2)] : medianRange * 0.5;
  const maxWick = Math.max(medianBody * 1.5, medianRange * 0.75);

  const result: OHLC[] = [];

  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    let { open, high, low, close } = c;

    open = Number(open);
    high = Number(high);
    low = Number(low);
    close = Number(close);

    if (high < low) {
      const tmp = high;
      high = low;
      low = tmp;
    }

    high = Math.max(high, open, close);
    low = Math.min(low, open, close);

    const bodyHigh = Math.max(open, close);
    const bodyLow = Math.min(open, close);

    if (high - bodyHigh > maxWick) {
      high = bodyHigh + maxWick;
    }
    if (bodyLow - low > maxWick) {
      low = bodyLow - maxWick;
    }

    result.push({ ...c, open, high, low, close });
  }

  return result;
}

// ----------------------
// CANDLES (historical)
// ----------------------
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
  const lastKnownKey = getLastKnownKey(symbol, timeframe);
  
  // Check cache first
  const cached = getFromCache(symbol, timeframe, session, period1, period2);
  if (cached) {
    const { full, rth, overnight, prevDayRth } = cached;
    const data =
      session === 'RTH' ? rth :
      session === 'OVERNIGHT' ? overnight :
      full;
    return { data, rth, overnight, prevDayRth, isLive: true };
  }

  // Global cooldown after Yahoo 429s to avoid hammering every symbol in scanner loops.
  if (Date.now() < yahooOhlcGlobalCooldownUntil) {
    const remainingMs = yahooOhlcGlobalCooldownUntil - Date.now();
    const remainingSec = Math.max(1, Math.ceil(remainingMs / 1000));
    const now = Date.now();

    if (process.env.DEBUG_SIGNALS === '1' && (now - yahooOhlcCooldownLogAt > 15_000)) {
      console.warn(`[fetchLiveOHLC] Yahoo cooldown active (${remainingSec}s), skipping live fetch for ${symbol}/${timeframe}`);
      yahooOhlcCooldownLogAt = now;
    }

    const lastKnown = lastKnownData.get(lastKnownKey);
    if (lastKnown && lastKnown.full.length > 0) {
      const data =
        session === 'RTH' ? lastKnown.rth :
        session === 'OVERNIGHT' ? lastKnown.overnight :
        lastKnown.full;
      return {
        data,
        rth: lastKnown.rth,
        overnight: lastKnown.overnight,
        prevDayRth: lastKnown.prevDayRth,
        isLive: false,
        error: `Yahoo cooldown active (${remainingSec}s), using cached data`,
      };
    }

    return {
      data: [],
      rth: [],
      overnight: [],
      prevDayRth: [],
      isLive: false,
      error: `Yahoo cooldown active (${remainingSec}s), no cached data`,
    };
  }

  try {
    if (process.env.DEBUG_SIGNALS === '1') {
      console.log(`[fetchLiveOHLC] Fetching OHLC for ${symbol} / ${timeframe} / ${session}`);
    }
    const interval = INTERVAL_MAP[timeframe] || '1d';
    const yahooFinance = await getYahooFinance();

    const result = await yahooFinance.chart(symbol.toUpperCase(), {
      period1,
      period2,
      interval,
      includePrePost: session !== 'RTH',
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
    if (!result || !result.quotes) {
      console.error(`[fetchLiveOHLC] No result or quotes for ${symbol} / ${timeframe}`);
      console.error(`[fetchLiveOHLC] Yahoo API response:`, JSON.stringify(result, null, 2));
      console.error(`[fetchLiveOHLC] Params:`, { symbol, timeframe, session, period1, period2, interval });
    } else if (result.quotes.length === 0) {
      console.warn(`[fetchLiveOHLC] Empty quotes array for ${symbol} / ${timeframe}`);
      console.warn(`[fetchLiveOHLC] Yahoo API response:`, JSON.stringify(result, null, 2));
      console.warn(`[fetchLiveOHLC] Params:`, { symbol, timeframe, session, period1, period2, interval });
    }

    // GAP PROTECTION: If no data, use last known good data
    if (!result || !result.quotes || result.quotes.length === 0) {
      console.warn(`[fetchLiveOHLC] GAP: No data for ${symbol} / ${timeframe}`);
      const lastKnown = lastKnownData.get(lastKnownKey);
      if (lastKnown && lastKnown.full.length > 0) {
        console.warn(`[Yahoo] No new data for ${symbol}/${timeframe}, using last known (${lastKnown.full.length} candles)`);
        const data =
          session === 'RTH' ? lastKnown.rth :
          session === 'OVERNIGHT' ? lastKnown.overnight :
          lastKnown.full;
        return { 
          data, 
          rth: lastKnown.rth, 
          overnight: lastKnown.overnight, 
          prevDayRth: lastKnown.prevDayRth, 
          isLive: false,
          error: 'Using cached data (no new data available)',
        };
      }
      return {
        data: [],
        rth: [],
        overnight: [],
        prevDayRth: [],
        isLive: false,
        error: 'No data available for this symbol',
      };
    }

    const rawOhlc: OHLC[] = result.quotes
      .filter(q => q.open != null && q.high != null && q.low != null && q.close != null)
      .map(q => {
        const timeMs = new Date(q.date).getTime();
        return {
          open: Number(q.open!),
          high: Number(q.high!),
          low: Number(q.low!),
          close: Number(q.close!),
          volume: q.volume || 0,
          time: Math.floor(timeMs / 1000),
          timeMs: timeMs,
        };
      });

    const fullOhlc = sanitizeOhlcWicks(rawOhlc);

    // GAP PROTECTION: If no valid candles, use last known
    if (fullOhlc.length === 0) {
      console.warn(`[fetchLiveOHLC] GAP: No valid OHLC for ${symbol} / ${timeframe}`);
      const lastKnown = lastKnownData.get(lastKnownKey);
      if (lastKnown && lastKnown.full.length > 0) {
        console.warn(`[Yahoo] No valid OHLC for ${symbol}/${timeframe}, using last known`);
        const data =
          session === 'RTH' ? lastKnown.rth :
          session === 'OVERNIGHT' ? lastKnown.overnight :
          lastKnown.full;
        return { 
          data, 
          rth: lastKnown.rth, 
          overnight: lastKnown.overnight, 
          prevDayRth: lastKnown.prevDayRth, 
          isLive: false,
          error: 'Using cached data (no valid OHLC)',
        };
      }
      return {
        data: [],
        rth: [],
        overnight: [],
        prevDayRth: [],
        isLive: false,
        error: 'No valid OHLC data',
      };
    }

    const rawSplit = splitSessions(fullOhlc);

    const aggFactor = getAggregationFactor(timeframe);
    const split = aggFactor > 1 ? {
      full: aggregateCandles(rawSplit.full, aggFactor),
      rth: aggregateCandles(rawSplit.rth, aggFactor),
      overnight: aggregateCandles(rawSplit.overnight, aggFactor),
      prevDayRth: aggregateCandles(rawSplit.prevDayRth, aggFactor),
    } : rawSplit;
    
    // Store as last known good data (gap protection)
    lastKnownData.set(lastKnownKey, split);
    
    // Store in time-based cache
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
    const rateLimited = isYahooRateLimitError(message);

    if (rateLimited) {
      yahooOhlcGlobalCooldownUntil = Math.max(yahooOhlcGlobalCooldownUntil, Date.now() + YAHOO_OHLC_COOLDOWN_MS);
      const remainingSec = Math.max(1, Math.ceil((yahooOhlcGlobalCooldownUntil - Date.now()) / 1000));

      // Keep rate-limit logs compact to avoid noisy stack traces every symbol.
      if (Date.now() - yahooOhlcCooldownLogAt > 5_000) {
        console.warn(`[fetchLiveOHLC] Yahoo rate-limited for ${symbol}/${timeframe}; cooling down ${remainingSec}s.`);
        yahooOhlcCooldownLogAt = Date.now();
      }
    } else {
      console.error(`[fetchLiveOHLC] ERROR for ${symbol}/${timeframe}:`, message, error);
    }

    const effectiveMessage = rateLimited
      ? `Yahoo rate-limited (cooldown ${Math.max(1, Math.ceil((yahooOhlcGlobalCooldownUntil - Date.now()) / 1000))}s)`
      : message;
    
    // GAP PROTECTION: On error, return last known good data
    const lastKnown = lastKnownData.get(lastKnownKey);
    if (lastKnown && lastKnown.full.length > 0) {
      console.warn(`[Yahoo] Using last known data for ${symbol}/${timeframe} (${lastKnown.full.length} candles)`);
      const data =
        session === 'RTH' ? lastKnown.rth :
        session === 'OVERNIGHT' ? lastKnown.overnight :
        lastKnown.full;
      return { 
        data, 
        rth: lastKnown.rth, 
        overnight: lastKnown.overnight, 
        prevDayRth: lastKnown.prevDayRth, 
        isLive: false,
        error: `Using cached data (${effectiveMessage})`,
      };
    }
    
    return {
      data: [],
      rth: [],
      overnight: [],
      prevDayRth: [],
      isLive: false,
      error: effectiveMessage,
    };
  }
}

// ----------------------
// LIVE SPOT (Finnhub primary, Yahoo fallback)
// With 5-second caching for rate limit protection
// ----------------------
export async function fetchLiveSpot(symbol: string): Promise<{
  symbol: string;
  spot: number;
  prevClose: number;
  marketState: string;
  timestamp: string;
  source: 'finnhub' | 'yahoo';
}> {
  const upperSymbol = symbol.toUpperCase();

  const toMs = (raw: unknown): number | null => {
    if (raw == null) return null;
    if (raw instanceof Date) {
      const ms = raw.getTime();
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof raw === 'number') {
      const ms = raw > 1e12 ? raw : raw * 1000;
      return Number.isFinite(ms) ? ms : null;
    }
    if (typeof raw === 'string') {
      const ms = Date.parse(raw);
      return Number.isFinite(ms) ? ms : null;
    }
    return null;
  };

  const resolveIntradayFallback = async (): Promise<{ price: number; timestampMs: number } | null> => {
    try {
      const intraday = await fetchLiveOHLC(upperSymbol, '5m', 'FULL');
      if (!intraday.data || intraday.data.length === 0) return null;
      const lastCandle = intraday.data[intraday.data.length - 1];
      if (!lastCandle || !Number.isFinite(lastCandle.close)) return null;
      return {
        price: lastCandle.close,
        timestampMs: (lastCandle.time ?? Math.floor(Date.now() / 1000)) * 1000,
      };
    } catch {
      return null;
    }
  };

  const resolveFinnhubFallback = async (): Promise<SpotCache['data'] | null> => {
    const finnhubQuote = await fetchFinnhubQuote(upperSymbol);
    if (!finnhubQuote || !Number.isFinite(finnhubQuote.c) || finnhubQuote.c <= 0) {
      return null;
    }
    return {
      symbol: upperSymbol,
      spot: finnhubQuote.c,
      prevClose: Number.isFinite(finnhubQuote.pc) && finnhubQuote.pc > 0 ? finnhubQuote.pc : finnhubQuote.c,
      marketState: 'REGULAR',
      timestamp: new Date((finnhubQuote.t || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      source: 'finnhub',
    };
  };
  
  // Check spot cache first (5-second TTL for real-time feel without rate limiting)
  const cached = spotCache.get(upperSymbol);
  if (cached && Date.now() - cached.timestamp < SPOT_CACHE_TTL_MS) {
    return cached.data;
  }

  // Global cooldown after Yahoo 429s to avoid quote hammering loops.
  if (Date.now() < yahooSpotGlobalCooldownUntil) {
    const remainingSec = Math.max(1, Math.ceil((yahooSpotGlobalCooldownUntil - Date.now()) / 1000));
    if (cached && Date.now() - cached.timestamp <= MAX_CACHED_SPOT_RATE_LIMIT_FALLBACK_MS) {
      if (process.env.DEBUG_SIGNALS === '1' && (Date.now() - yahooSpotCooldownLogAt > 5_000)) {
        console.warn(`[Spot] Yahoo cooldown active (${remainingSec}s), using cached quote for ${upperSymbol}.`);
        yahooSpotCooldownLogAt = Date.now();
      }
      return cached.data;
    }

    const finnhubFallback = await resolveFinnhubFallback();
    if (finnhubFallback) {
      spotCache.set(upperSymbol, { data: finnhubFallback, timestamp: Date.now() });
      return finnhubFallback;
    }
  }
  
  try {
    // Always get Yahoo quote first - it has market state and extended hours data
    const yahooFinance = await getYahooFinance();
    const quote = await yahooFinance.quote(upperSymbol);

    if (!quote || quote.regularMarketPrice == null) {
      // GAP PROTECTION: Return last known spot if available
      if (cached) {
        console.warn(`[Spot] No quote for ${symbol}, using last known: $${cached.data.spot.toFixed(2)}`);
        return cached.data;
      }
      throw new Error(`No live quote for ${symbol}`);
    }

    const marketState = (quote as any).marketState || 'REGULAR';
    const regularPrice = quote.regularMarketPrice;
    const preMarketPrice = (quote as any).preMarketPrice;
    const postMarketPrice = (quote as any).postMarketPrice;
    const quotePrevClose = (quote as any).regularMarketPreviousClose || regularPrice;
    const quoteTimeMs =
      toMs((quote as any).regularMarketTime) ??
      toMs((quote as any).postMarketTime) ??
      toMs((quote as any).preMarketTime) ??
      Date.now();

    const nowEt = toEST(new Date());
    const day = nowEt.getDay();
    const minutesEt = nowEt.getHours() * 60 + nowEt.getMinutes();
    const isWeekdayEt = day >= 1 && day <= 5;
    const isLikelyRegularHoursEt = isWeekdayEt && minutesEt >= (9 * 60 + 30) && minutesEt < (16 * 60);
    const useExtendedHoursPath = marketState !== 'REGULAR' && !isLikelyRegularHoursEt;

    let result: SpotCache['data'];

    // For extended hours (PRE, POST, CLOSED), use Yahoo's extended hours prices
    // Finnhub free tier only provides regular market hours data
    if (useExtendedHoursPath) {
      let spot = regularPrice;
      let prevClose = quotePrevClose;
      let source: 'finnhub' | 'yahoo' = 'yahoo';
      if (marketState === 'PRE' && preMarketPrice != null) {
        spot = preMarketPrice;
      } else if ((marketState === 'POST' || marketState === 'POSTPOST' || marketState === 'CLOSED') && postMarketPrice != null) {
        spot = postMarketPrice;
      }

      let timestampMs = quoteTimeMs;
      if (Date.now() - timestampMs > YAHOO_MAX_STALENESS_MS) {
        const intradayFallback = await resolveIntradayFallback();
        if (intradayFallback) {
          spot = intradayFallback.price;
          timestampMs = intradayFallback.timestampMs;
          if (process.env.DEBUG_SIGNALS === '1') {
            console.warn(`[Spot] Yahoo extended-hours quote stale for ${symbol}; using intraday fallback ${spot.toFixed(2)}.`);
          }
        } else {
          const finnhubQuote = await fetchFinnhubQuote(upperSymbol);
          const finnhubTsMs = finnhubQuote?.t ? finnhubQuote.t * 1000 : 0;
          const finnhubIsFresh = finnhubTsMs > 0 && (Date.now() - finnhubTsMs) <= FINNHUB_MAX_STALENESS_MS;
          if (finnhubQuote && Number.isFinite(finnhubQuote.c) && finnhubQuote.c > 0) {
            const finnhubDeltaPct = spot > 0 ? Math.abs(finnhubQuote.c - spot) / spot : 0;
            if (finnhubIsFresh || finnhubDeltaPct >= 0.0002) {
              spot = finnhubQuote.c;
              prevClose = Number.isFinite(finnhubQuote.pc) && finnhubQuote.pc > 0 ? finnhubQuote.pc : quotePrevClose;
              timestampMs = finnhubIsFresh ? finnhubTsMs : Date.now();
              source = 'finnhub';
              if (process.env.DEBUG_SIGNALS === '1') {
                console.warn(
                  `[Spot] Yahoo extended-hours quote stale for ${symbol}; using ${finnhubIsFresh ? 'fresh' : 'delta-matched'} Finnhub tick ${spot.toFixed(2)}.`
                );
              }
            }
          }
        }
      }
      
      if (process.env.DEBUG_SIGNALS === '1') {
        console.log(`[Spot] Extended hours quote for ${symbol}: $${spot.toFixed(2)} (${marketState}) from ${source}`);
      }
      result = {
        symbol: upperSymbol,
        spot,
        prevClose,
        marketState,
        timestamp: new Date(timestampMs).toISOString(),
        source,
      };
    } else {
      // During regular hours, try Finnhub for real-time data
      const finnhubQuote = await fetchFinnhubQuote(symbol);
      const finnhubTsMs = finnhubQuote?.t ? finnhubQuote.t * 1000 : 0;
      const finnhubIsFresh = finnhubTsMs > 0 && (Date.now() - finnhubTsMs) <= FINNHUB_MAX_STALENESS_MS;

      if (finnhubQuote && finnhubIsFresh) {
        result = {
          symbol: upperSymbol,
          spot: finnhubQuote.c,
          prevClose: finnhubQuote.pc,
          marketState: 'REGULAR',
          timestamp: new Date(finnhubQuote.t * 1000).toISOString(),
          source: 'finnhub',
        };
      } else {
        if (finnhubQuote && !finnhubIsFresh && process.env.DEBUG_SIGNALS === '1') {
          console.warn(`[Spot] Finnhub stale tick for ${symbol}: ${(Date.now() - finnhubTsMs)}ms old. Using Yahoo.`);
        }
        // Fallback to Yahoo regular market price
        let spot = regularPrice;
        let prevClose = quotePrevClose;
        let timestampMs = quoteTimeMs;
        let source: 'finnhub' | 'yahoo' = 'yahoo';

        if (finnhubQuote && Number.isFinite(finnhubQuote.c) && finnhubQuote.c > 0 && !finnhubIsFresh) {
          const finnhubDeltaPct = regularPrice > 0 ? Math.abs(finnhubQuote.c - regularPrice) / regularPrice : 0;
          if (finnhubDeltaPct >= 0.0002) {
            spot = finnhubQuote.c;
            prevClose = Number.isFinite(finnhubQuote.pc) && finnhubQuote.pc > 0 ? finnhubQuote.pc : quotePrevClose;
            timestampMs = Date.now();
            source = 'finnhub';
            if (process.env.DEBUG_SIGNALS === '1') {
              console.warn(`[Spot] Using delta-matched stale Finnhub price for ${symbol}: ${spot.toFixed(2)}.`);
            }
          }
        }

        if (source === 'yahoo' && Date.now() - timestampMs > YAHOO_MAX_STALENESS_MS) {
          const intradayFallback = await resolveIntradayFallback();
          if (intradayFallback) {
            spot = intradayFallback.price;
            timestampMs = intradayFallback.timestampMs;
            if (process.env.DEBUG_SIGNALS === '1') {
              console.warn(`[Spot] Yahoo regular quote stale for ${symbol}; using intraday fallback ${spot.toFixed(2)}.`);
            }
          }
        }

        if (process.env.DEBUG_SIGNALS === '1') {
          console.log(`[Spot] Regular hours quote for ${symbol}: $${spot.toFixed(2)} from ${source}`);
        }
        result = {
          symbol: upperSymbol,
          spot,
          prevClose,
          marketState,
          timestamp: new Date(timestampMs).toISOString(),
          source,
        };
      }
    }

    // Cache the result
    spotCache.set(upperSymbol, { data: result, timestamp: Date.now() });
    return result;

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const rateLimited = isYahooRateLimitError(message);

    if (rateLimited) {
      yahooSpotGlobalCooldownUntil = Math.max(yahooSpotGlobalCooldownUntil, Date.now() + YAHOO_SPOT_COOLDOWN_MS);
      const remainingSec = Math.max(1, Math.ceil((yahooSpotGlobalCooldownUntil - Date.now()) / 1000));
      if (Date.now() - yahooSpotCooldownLogAt > 5_000) {
        console.warn(`[Spot] Yahoo rate-limited for ${upperSymbol}; cooling down ${remainingSec}s.`);
        yahooSpotCooldownLogAt = Date.now();
      }
    }

    // GAP PROTECTION: On error, return last known spot if available
    const maxFallbackAgeMs = rateLimited
      ? MAX_CACHED_SPOT_RATE_LIMIT_FALLBACK_MS
      : MAX_CACHED_SPOT_FALLBACK_MS;
    if (cached && Date.now() - cached.timestamp <= maxFallbackAgeMs) {
      console.warn(`[Spot] Error for ${symbol}, using last known: $${cached.data.spot.toFixed(2)}`);
      return cached.data;
    }

    // For Yahoo 429s, try Finnhub-only fallback before failing.
    if (rateLimited) {
      const finnhubFallback = await resolveFinnhubFallback();
      if (finnhubFallback) {
        spotCache.set(upperSymbol, { data: finnhubFallback, timestamp: Date.now() });
        return finnhubFallback;
      }
    }

    throw error;
  }
}

export async function fetchDailyVolumeStats(symbol: string): Promise<{
  regularMarketVolume: number;
  averageDailyVolume: number;
  volumeRatio: number;
}> {
  try {
    const yahooFinance = await getYahooFinance();
    const quote = await yahooFinance.quote(symbol.toUpperCase());
    const regularMarketVolume = (quote as any)?.regularMarketVolume || 0;
    const averageDailyVolume = (quote as any)?.averageDailyVolume3Month || (quote as any)?.averageDailyVolume10Day || 0;
    const volumeRatio = averageDailyVolume > 0 ? regularMarketVolume / averageDailyVolume : 1;
    return { regularMarketVolume, averageDailyVolume, volumeRatio };
  } catch {
    return { regularMarketVolume: 0, averageDailyVolume: 0, volumeRatio: 1 };
  }
}

export function clearCache(): void {
  cache.clear();
  lastKnownData.clear();
  spotCache.clear();
}