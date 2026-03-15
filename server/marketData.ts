// marketData.ts - Multi-source market data (Yahoo primary, Finnhub fallback)

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY || '';
const FINNHUB_COOLDOWN_MS = 30 * 1000;
let finnhubGlobalCooldownUntil = 0;
let finnhubCooldownLogAt = 0;
let finnhubCandlesDisabled = false;
let finnhubCandlesDisabledLogged = false;

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

interface FinnhubCandlesResponse {
  c?: number[];
  h?: number[];
  l?: number[];
  o?: number[];
  s?: string;
  t?: number[];
  v?: number[];
}

// Fetch real-time quote from Finnhub
async function fetchFinnhubQuote(symbol: string): Promise<FinnhubQuote | null> {
  if (!FINNHUB_API_KEY) {
    return null;
  }

  if (Date.now() < finnhubGlobalCooldownUntil) {
    if (process.env.DEBUG_SIGNALS === '1' && (Date.now() - finnhubCooldownLogAt > 5_000)) {
      const remainingSec = Math.max(1, Math.ceil((finnhubGlobalCooldownUntil - Date.now()) / 1000));
      console.warn(`[Finnhub] Cooldown active (${remainingSec}s), skipping ${symbol}.`);
      finnhubCooldownLogAt = Date.now();
    }
    return null;
  }
  
  try {
    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol.toUpperCase()}&token=${FINNHUB_API_KEY}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      if (response.status === 429) {
        finnhubGlobalCooldownUntil = Math.max(finnhubGlobalCooldownUntil, Date.now() + FINNHUB_COOLDOWN_MS);
      }
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
  // Time-window params are dynamic per request; keep cache key stable per symbol/timeframe/session
  // and rely on TTL to invalidate.
  void period1;
  void period2;
  return [symbol.toUpperCase(), timeframe, session].join('-');
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

function getFinnhubResolution(timeframe: string): string | null {
  switch (timeframe) {
    case '5m':
      return '5';
    case '15m':
      return '15';
    case '30m':
      return '30';
    case '1h':
    case '2h':
    case '4h':
      return '60';
    case '1d':
    case '1D':
      return 'D';
    default:
      return null;
  }
}

function getDateRange(timeframe: string): { period1: Date; period2: Date } {
  const now = new Date();
  const period2 = now;
  let period1: Date;

  switch (timeframe) {
    case '5m':
      period1 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case '15m':
      period1 = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
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
  // Use America/New_York conversion so DST transitions do not skew session logic.
  const eastern = new Date(date.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return Number.isFinite(eastern.getTime()) ? eastern : date;
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

async function fetchYahooChartDirect(
  symbol: string,
  timeframe: string,
  session: SessionType,
  period1: Date,
  period2: Date,
): Promise<OHLC[] | null> {
  const interval = INTERVAL_MAP[timeframe] || '1d';
  const includePrePost = session !== 'RTH' ? 'true' : 'false';
  const from = Math.max(0, Math.floor(period1.getTime() / 1000));
  const to = Math.max(from + 60, Math.floor(period2.getTime() / 1000));

  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol.toUpperCase())}?period1=${from}&period2=${to}&interval=${interval}&includePrePost=${includePrePost}&events=history`;

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
      },
    });

    if (!response.ok) {
      if (process.env.DEBUG_SIGNALS === '1') {
        console.warn(`[YahooDirect] HTTP ${response.status} for ${symbol}/${timeframe}`);
      }
      return null;
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      return null;
    }

    const payload = await response.json() as any;
    const result = payload?.chart?.result?.[0];
    const ts = Array.isArray(result?.timestamp) ? result.timestamp : [];
    const quote = result?.indicators?.quote?.[0];
    if (!quote || ts.length === 0) return null;

    const open = Array.isArray(quote.open) ? quote.open : [];
    const high = Array.isArray(quote.high) ? quote.high : [];
    const low = Array.isArray(quote.low) ? quote.low : [];
    const close = Array.isArray(quote.close) ? quote.close : [];
    const volume = Array.isArray(quote.volume) ? quote.volume : [];

    const len = Math.min(ts.length, open.length, high.length, low.length, close.length, volume.length);
    if (len <= 0) return null;

    const candles: OHLC[] = [];
    for (let i = 0; i < len; i++) {
      const t = Number(ts[i]);
      const o = Number(open[i]);
      const h = Number(high[i]);
      const l = Number(low[i]);
      const c = Number(close[i]);
      const v = Number(volume[i]);

      if (!Number.isFinite(t) || t <= 0) continue;
      if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) continue;

      candles.push({
        open: o,
        high: h,
        low: l,
        close: c,
        volume: Number.isFinite(v) ? Math.max(0, v) : 0,
        time: Math.floor(t),
        timeMs: Math.floor(t) * 1000,
      });
    }

    if (candles.length === 0) return null;
    if (process.env.DEBUG_SIGNALS === '1') {
      console.log(`[YahooDirect] OHLC fallback for ${symbol}/${timeframe}: ${candles.length} candles`);
    }
    return candles;
  } catch (error) {
    if (process.env.DEBUG_SIGNALS === '1') {
      console.warn(`[YahooDirect] Error for ${symbol}/${timeframe}:`, error);
    }
    return null;
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

async function fetchFinnhubCandles(
  symbol: string,
  timeframe: string,
  period1: Date,
  period2: Date,
): Promise<OHLC[] | null> {
  if (finnhubCandlesDisabled) return null;
  if (!FINNHUB_API_KEY) return null;
  if (Date.now() < finnhubGlobalCooldownUntil) return null;

  const resolution = getFinnhubResolution(timeframe);
  if (!resolution) return null;

  const from = Math.max(0, Math.floor(period1.getTime() / 1000));
  const to = Math.max(from + 60, Math.floor(period2.getTime() / 1000));

  try {
    const url = `https://finnhub.io/api/v1/stock/candle?symbol=${symbol.toUpperCase()}&resolution=${resolution}&from=${from}&to=${to}&token=${FINNHUB_API_KEY}`;
    const response = await fetch(url);

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        finnhubCandlesDisabled = true;
        if (!finnhubCandlesDisabledLogged) {
          console.warn(`[Finnhub] OHLC candle endpoint unavailable (${response.status}); disabling candle fallback.`);
          finnhubCandlesDisabledLogged = true;
        }
        return null;
      }
      if (response.status === 429) {
        finnhubGlobalCooldownUntil = Math.max(finnhubGlobalCooldownUntil, Date.now() + FINNHUB_COOLDOWN_MS);
      }
      console.warn(`[Finnhub] OHLC HTTP ${response.status} for ${symbol}/${timeframe}`);
      return null;
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.includes('application/json')) {
      console.warn(`[Finnhub] OHLC non-JSON response for ${symbol}/${timeframe}`);
      return null;
    }

    const data = await response.json() as FinnhubCandlesResponse;
    if (!data || data.s !== 'ok' || !Array.isArray(data.t) || data.t.length === 0) {
      return null;
    }

    const open = Array.isArray(data.o) ? data.o : [];
    const high = Array.isArray(data.h) ? data.h : [];
    const low = Array.isArray(data.l) ? data.l : [];
    const close = Array.isArray(data.c) ? data.c : [];
    const volume = Array.isArray(data.v) ? data.v : [];
    const len = Math.min(data.t.length, open.length, high.length, low.length, close.length, volume.length);
    if (len <= 0) return null;

    const candles: OHLC[] = [];
    for (let i = 0; i < len; i++) {
      const timeSec = Number(data.t[i]);
      const o = Number(open[i]);
      const h = Number(high[i]);
      const l = Number(low[i]);
      const c = Number(close[i]);
      const v = Number(volume[i]);

      if (!Number.isFinite(timeSec) || timeSec <= 0) continue;
      if (!Number.isFinite(o) || !Number.isFinite(h) || !Number.isFinite(l) || !Number.isFinite(c)) continue;

      candles.push({
        open: o,
        high: h,
        low: l,
        close: c,
        volume: Number.isFinite(v) ? Math.max(0, v) : 0,
        time: Math.floor(timeSec),
        timeMs: Math.floor(timeSec) * 1000,
      });
    }

    if (candles.length === 0) return null;
    if (process.env.DEBUG_SIGNALS === '1') {
      console.log(`[Finnhub] OHLC fallback for ${symbol}/${timeframe}: ${candles.length} candles`);
    }
    return candles;
  } catch (error) {
    console.warn(`[Finnhub] OHLC error for ${symbol}/${timeframe}:`, error);
    return null;
  }
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

  const tryFinnhubFallback = async (reason: string) => {
    const finnhubRaw = await fetchFinnhubCandles(symbol, timeframe, period1, period2);
    if (!finnhubRaw || finnhubRaw.length === 0) return null;

    const finnhubOhlc = sanitizeOhlcWicks(finnhubRaw);
    if (finnhubOhlc.length === 0) return null;

    const rawSplit = splitSessions(finnhubOhlc);
    const aggFactor = getAggregationFactor(timeframe);
    const split = aggFactor > 1 ? {
      full: aggregateCandles(rawSplit.full, aggFactor),
      rth: aggregateCandles(rawSplit.rth, aggFactor),
      overnight: aggregateCandles(rawSplit.overnight, aggFactor),
      prevDayRth: aggregateCandles(rawSplit.prevDayRth, aggFactor),
    } : rawSplit;

    lastKnownData.set(lastKnownKey, split);
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
      error: `Using Finnhub candles (${reason})`,
    };
  };

  const tryYahooDirectFallback = async (reason: string) => {
    const directRaw = await fetchYahooChartDirect(symbol, timeframe, session, period1, period2);
    if (!directRaw || directRaw.length === 0) return null;

    const directOhlc = sanitizeOhlcWicks(directRaw);
    if (directOhlc.length === 0) return null;

    const rawSplit = splitSessions(directOhlc);
    const aggFactor = getAggregationFactor(timeframe);
    const split = aggFactor > 1 ? {
      full: aggregateCandles(rawSplit.full, aggFactor),
      rth: aggregateCandles(rawSplit.rth, aggFactor),
      overnight: aggregateCandles(rawSplit.overnight, aggFactor),
      prevDayRth: aggregateCandles(rawSplit.prevDayRth, aggFactor),
    } : rawSplit;

    lastKnownData.set(lastKnownKey, split);
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
      error: `Using Yahoo direct candles (${reason})`,
    };
  };

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

    const yahooDirectFallback = await tryYahooDirectFallback(`Yahoo cooldown ${remainingSec}s`);
    if (yahooDirectFallback) return yahooDirectFallback;

    const finnhubFallback = await tryFinnhubFallback(`Yahoo cooldown ${remainingSec}s`);
    if (finnhubFallback) return finnhubFallback;

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

      const yahooDirectFallback = await tryYahooDirectFallback('Yahoo SDK returned no candles');
      if (yahooDirectFallback) return yahooDirectFallback;

      const finnhubFallback = await tryFinnhubFallback('Yahoo returned no candles');
      if (finnhubFallback) return finnhubFallback;

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

      const yahooDirectFallback = await tryYahooDirectFallback('Yahoo SDK produced invalid OHLC');
      if (yahooDirectFallback) return yahooDirectFallback;

      const finnhubFallback = await tryFinnhubFallback('Yahoo produced invalid OHLC');
      if (finnhubFallback) return finnhubFallback;

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

    const yahooDirectFallback = await tryYahooDirectFallback(effectiveMessage);
    if (yahooDirectFallback) return yahooDirectFallback;

    const finnhubFallback = await tryFinnhubFallback(effectiveMessage);
    if (finnhubFallback) return finnhubFallback;
    
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
// LIVE SPOT (Yahoo primary, Finnhub fallback)
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
  const cached = spotCache.get(upperSymbol);

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

  const sanitizeTimestampMs = (rawMs: number | null): number | null => {
    if (!Number.isFinite(rawMs as number)) return null;
    const now = Date.now();
    const ms = Number(rawMs);
    if (ms <= 0) return null;
    // Some vendor fields can resolve slightly in the future due clock or TZ quirks.
    if (ms > now + 2 * 60 * 1000) return now;
    return ms;
  };

  const parseStooqTimestampMs = (datePart: string, timePart: string): number | null => {
    if (!/^\d{8}$/.test(datePart)) return null;

    const year = Number(datePart.slice(0, 4));
    const month = Number(datePart.slice(4, 6));
    const day = Number(datePart.slice(6, 8));

    if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;

    let hour = 16;
    let minute = 0;
    let second = 0;
    if (/^\d{6}$/.test(timePart)) {
      hour = Number(timePart.slice(0, 2));
      minute = Number(timePart.slice(2, 4));
      second = Number(timePart.slice(4, 6));
    }

    const ts = Date.UTC(year, Math.max(0, month - 1), day, hour, minute, second);
    return Number.isFinite(ts) ? ts : null;
  };

  const resolveStooqFallback = async (): Promise<SpotCache['data'] | null> => {
    const symbolCandidates = [`${upperSymbol.toLowerCase()}.us`, upperSymbol.toLowerCase()];

    for (const stooqSymbol of symbolCandidates) {
      try {
        const response = await fetch(`https://stooq.com/q/l/?s=${encodeURIComponent(stooqSymbol)}&i=5`, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (!response.ok) continue;

        const raw = (await response.text()).trim();
        if (!raw) continue;

        const lines = raw.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        const row = lines[lines.length - 1];
        if (!row) continue;

        const cols = row.split(',');
        if (cols.length < 7) continue;

        const close = Number(cols[6]);
        if (!Number.isFinite(close) || close <= 0) continue;

        const open = Number(cols[3]);
        const prevClose = Number.isFinite(open) && open > 0
          ? open
          : cached?.data.prevClose ?? close;

        const timestampMs =
          sanitizeTimestampMs(parseStooqTimestampMs(cols[1] ?? '', cols[2] ?? '')) ?? Date.now();

        return {
          symbol: upperSymbol,
          spot: close,
          prevClose,
          marketState: 'REGULAR',
          timestamp: new Date(timestampMs).toISOString(),
          source: 'yahoo',
        };
      } catch {
        // Continue to next candidate.
      }
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

    const finnhubTsMs = finnhubQuote.t ? finnhubQuote.t * 1000 : 0;
    const finnhubIsFresh = finnhubTsMs > 0 && (Date.now() - finnhubTsMs) <= FINNHUB_MAX_STALENESS_MS;
    if (!finnhubIsFresh) {
      return null;
    }

    return {
      symbol: upperSymbol,
      spot: finnhubQuote.c,
      prevClose: Number.isFinite(finnhubQuote.pc) && finnhubQuote.pc > 0 ? finnhubQuote.pc : finnhubQuote.c,
      marketState: 'REGULAR',
      timestamp: new Date(finnhubTsMs).toISOString(),
      source: 'finnhub',
    };
  };
  
  // Check spot cache first (5-second TTL for real-time feel without rate limiting)
  if (cached && Date.now() - cached.timestamp < SPOT_CACHE_TTL_MS) {
    return cached.data;
  }

  // Global cooldown after Yahoo 429s to avoid quote hammering loops.
  if (Date.now() < yahooSpotGlobalCooldownUntil) {
    const remainingSec = Math.max(1, Math.ceil((yahooSpotGlobalCooldownUntil - Date.now()) / 1000));
    const intradayFallback = await resolveIntradayFallback();
    if (intradayFallback) {
      const intradayResult: SpotCache['data'] = {
        symbol: upperSymbol,
        spot: intradayFallback.price,
        prevClose: cached?.data.prevClose ?? intradayFallback.price,
        marketState: cached?.data.marketState ?? 'REGULAR',
        timestamp: new Date(intradayFallback.timestampMs).toISOString(),
        source: 'yahoo',
      };
      spotCache.set(upperSymbol, { data: intradayResult, timestamp: Date.now() });
      return intradayResult;
    }

    const finnhubFallback = await resolveFinnhubFallback();
    if (finnhubFallback) {
      spotCache.set(upperSymbol, { data: finnhubFallback, timestamp: Date.now() });
      return finnhubFallback;
    }

    if (cached && Date.now() - cached.timestamp <= MAX_CACHED_SPOT_RATE_LIMIT_FALLBACK_MS) {
      if (process.env.DEBUG_SIGNALS === '1' && (Date.now() - yahooSpotCooldownLogAt > 5_000)) {
        console.warn(`[Spot] Yahoo cooldown active (${remainingSec}s), using cached quote for ${upperSymbol}.`);
        yahooSpotCooldownLogAt = Date.now();
      }
      return cached.data;
    }

    if (cached) {
      if (process.env.DEBUG_SIGNALS === '1' && (Date.now() - yahooSpotCooldownLogAt > 5_000)) {
        const ageSec = Math.max(1, Math.floor((Date.now() - cached.timestamp) / 1000));
        console.warn(`[Spot] Yahoo cooldown active (${remainingSec}s), using stale cached quote for ${upperSymbol} (${ageSec}s old).`);
        yahooSpotCooldownLogAt = Date.now();
      }
      return cached.data;
    }

    const stooqFallback = await resolveStooqFallback();
    if (stooqFallback) {
      spotCache.set(upperSymbol, { data: stooqFallback, timestamp: Date.now() });
      return stooqFallback;
    }

    throw new Error(`Yahoo rate-limited cooldown active (${remainingSec}s), no fallback data`);
  }
  
  try {
    // Always get Yahoo quote first - it has market state and extended hours data
    const yahooFinance = await getYahooFinance();
    const quote = await yahooFinance.quote(upperSymbol);

    if (!quote || quote.regularMarketPrice == null) {
      const intradayFallback = await resolveIntradayFallback();
      if (intradayFallback) {
        const intradayResult: SpotCache['data'] = {
          symbol: upperSymbol,
          spot: intradayFallback.price,
          prevClose: cached?.data.prevClose ?? intradayFallback.price,
          marketState: cached?.data.marketState ?? 'REGULAR',
          timestamp: new Date(intradayFallback.timestampMs).toISOString(),
          source: 'yahoo',
        };
        spotCache.set(upperSymbol, { data: intradayResult, timestamp: Date.now() });
        return intradayResult;
      }

      const stooqFallback = await resolveStooqFallback();
      const finnhubFallback = await resolveFinnhubFallback();
      if (finnhubFallback) {
        spotCache.set(upperSymbol, { data: finnhubFallback, timestamp: Date.now() });
        return finnhubFallback;
      }

      if (stooqFallback) {
        spotCache.set(upperSymbol, { data: stooqFallback, timestamp: Date.now() });
        return stooqFallback;
      }

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
    const regularMarketTimeMs = sanitizeTimestampMs(toMs((quote as any).regularMarketTime));
    const postMarketTimeMs = sanitizeTimestampMs(toMs((quote as any).postMarketTime));
    const preMarketTimeMs = sanitizeTimestampMs(toMs((quote as any).preMarketTime));
    const quoteTimeMs =
      sanitizeTimestampMs(regularMarketTimeMs ?? postMarketTimeMs ?? preMarketTimeMs) ?? Date.now();

    const nowEt = toEST(new Date());
    const day = nowEt.getDay();
    const minutesEt = nowEt.getHours() * 60 + nowEt.getMinutes();
    const isWeekdayEt = day >= 1 && day <= 5;
    const isLikelyRegularHoursEt = isWeekdayEt && minutesEt >= (9 * 60 + 30) && minutesEt < (16 * 60);
    const isLikelyPremarketEt = isWeekdayEt && minutesEt >= (4 * 60) && minutesEt < (9 * 60 + 30);
    const isLikelyPostMarketEt = isWeekdayEt && minutesEt >= (16 * 60) && minutesEt < (20 * 60);
    const hasExtendedPrint = preMarketPrice != null || postMarketPrice != null;
    const useExtendedHoursPath =
      (!isLikelyRegularHoursEt && hasExtendedPrint) ||
      (marketState !== 'REGULAR' && !isLikelyRegularHoursEt);

    let result: SpotCache['data'];

    // For extended hours (PRE, POST, CLOSED), use Yahoo's extended hours prices
    // Finnhub free tier only provides regular market hours data
    if (useExtendedHoursPath) {
      let spot = regularPrice;
      let prevClose = quotePrevClose;
      let timestampMs = quoteTimeMs;
      let source: 'finnhub' | 'yahoo' = 'yahoo';

      // Prefer explicit time-window pricing over ambiguous market states.
      if (isLikelyPremarketEt && preMarketPrice != null) {
        spot = preMarketPrice;
        timestampMs = preMarketTimeMs ?? quoteTimeMs;
      } else if (isLikelyPostMarketEt && postMarketPrice != null) {
        spot = postMarketPrice;
        timestampMs = postMarketTimeMs ?? quoteTimeMs;
      } else if (marketState === 'PRE' && preMarketPrice != null) {
        spot = preMarketPrice;
        timestampMs = preMarketTimeMs ?? quoteTimeMs;
      } else if ((marketState === 'POST' || marketState === 'POSTPOST') && postMarketPrice != null) {
        spot = postMarketPrice;
        timestampMs = postMarketTimeMs ?? quoteTimeMs;
      } else if (marketState === 'CLOSED') {
        const preTs = preMarketTimeMs ?? 0;
        const postTs = postMarketTimeMs ?? 0;

        if (preMarketPrice != null && postMarketPrice != null) {
          if (preTs >= postTs) {
            spot = preMarketPrice;
            timestampMs = preMarketTimeMs ?? quoteTimeMs;
          } else {
            spot = postMarketPrice;
            timestampMs = postMarketTimeMs ?? quoteTimeMs;
          }
        } else if (preMarketPrice != null) {
          spot = preMarketPrice;
          timestampMs = preMarketTimeMs ?? quoteTimeMs;
        } else if (postMarketPrice != null) {
          spot = postMarketPrice;
          timestampMs = postMarketTimeMs ?? quoteTimeMs;
        }
      }

      if (Date.now() - timestampMs > YAHOO_MAX_STALENESS_MS) {
        const intradayFallback = await resolveIntradayFallback();
        if (intradayFallback) {
          spot = intradayFallback.price;
          timestampMs = intradayFallback.timestampMs;
          if (process.env.DEBUG_SIGNALS === '1') {
            console.warn(`[Spot] Yahoo extended-hours quote stale for ${symbol}; using intraday fallback ${spot.toFixed(2)}.`);
          }
        } else {
          const finnhubFallback = await resolveFinnhubFallback();
          if (finnhubFallback) {
            spot = finnhubFallback.spot;
            prevClose = finnhubFallback.prevClose;
            timestampMs = sanitizeTimestampMs(toMs(finnhubFallback.timestamp)) ?? Date.now();
            source = 'finnhub';
            if (process.env.DEBUG_SIGNALS === '1') {
              console.warn(`[Spot] Yahoo extended-hours quote stale for ${symbol}; using fresh Finnhub fallback ${spot.toFixed(2)}.`);
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
      // During regular hours, prefer Yahoo and only fall back if stale.
      let spot = regularPrice;
      let prevClose = quotePrevClose;
      let timestampMs = quoteTimeMs;
      let source: 'finnhub' | 'yahoo' = 'yahoo';

      if (Date.now() - timestampMs > YAHOO_MAX_STALENESS_MS) {
        const intradayFallback = await resolveIntradayFallback();
        if (intradayFallback) {
          spot = intradayFallback.price;
          timestampMs = intradayFallback.timestampMs;
          if (process.env.DEBUG_SIGNALS === '1') {
            console.warn(`[Spot] Yahoo regular quote stale for ${symbol}; using intraday fallback ${spot.toFixed(2)}.`);
          }
        } else if (process.env.DEBUG_SIGNALS === '1') {
          console.warn(`[Spot] Yahoo regular quote stale for ${symbol}; keeping Yahoo quote to avoid cross-provider drift.`);
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

      // For Yahoo 429s, prefer Yahoo-compatible fallbacks before cross-provider quotes.
      const intradayFallback = await resolveIntradayFallback();
      if (intradayFallback) {
        const intradayResult: SpotCache['data'] = {
          symbol: upperSymbol,
          spot: intradayFallback.price,
          prevClose: cached?.data.prevClose ?? intradayFallback.price,
          marketState: 'REGULAR',
          timestamp: new Date(intradayFallback.timestampMs).toISOString(),
          source: 'yahoo',
        };
        spotCache.set(upperSymbol, { data: intradayResult, timestamp: Date.now() });
        return intradayResult;
      }

      const finnhubFallback = await resolveFinnhubFallback();
      if (finnhubFallback) {
        spotCache.set(upperSymbol, { data: finnhubFallback, timestamp: Date.now() });
        return finnhubFallback;
      }

      const stooqFallback = await resolveStooqFallback();
      if (stooqFallback) {
        spotCache.set(upperSymbol, { data: stooqFallback, timestamp: Date.now() });
        return stooqFallback;
      }
    }

    const finnhubFallback = await resolveFinnhubFallback();
    if (finnhubFallback) {
      spotCache.set(upperSymbol, { data: finnhubFallback, timestamp: Date.now() });
      return finnhubFallback;
    }

    const stooqFallback = await resolveStooqFallback();
    if (stooqFallback) {
      spotCache.set(upperSymbol, { data: stooqFallback, timestamp: Date.now() });
      return stooqFallback;
    }

    // GAP PROTECTION: On error, return last known spot if available
    const maxFallbackAgeMs = rateLimited
      ? MAX_CACHED_SPOT_RATE_LIMIT_FALLBACK_MS
      : MAX_CACHED_SPOT_FALLBACK_MS;
    if (cached && (Date.now() - cached.timestamp <= maxFallbackAgeMs || rateLimited)) {
      console.warn(`[Spot] Error for ${symbol}, using last known: $${cached.data.spot.toFixed(2)}`);
      return cached.data;
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

export function getCachedSpot(symbol: string): {
  data: {
    symbol: string;
    spot: number;
    prevClose: number;
    marketState: string;
    timestamp: string;
    source: 'finnhub' | 'yahoo';
  };
  ageMs: number;
} | null {
  const entry = spotCache.get(symbol.toUpperCase());
  if (!entry) return null;
  return {
    data: entry.data,
    ageMs: Date.now() - entry.timestamp,
  };
}

export function getLastKnownSpotFromCandles(symbol: string): {
  data: {
    symbol: string;
    spot: number;
    prevClose: number;
    marketState: string;
    timestamp: string;
    source: 'finnhub' | 'yahoo';
  };
  ageMs: number;
} | null {
  const upperSymbol = symbol.toUpperCase();
  let best: { last: OHLC; prev: OHLC } | null = null;

  for (const [key, entry] of lastKnownData.entries()) {
    if (!key.startsWith(`${upperSymbol}-`)) continue;
    if (!entry.full || entry.full.length === 0) continue;

    const last = entry.full[entry.full.length - 1];
    const prev = entry.full.length > 1 ? entry.full[entry.full.length - 2] : last;
    if (!best || last.time > best.last.time) {
      best = { last, prev };
    }
  }

  if (!best) return null;

  const timestampMs = (best.last.time ?? Math.floor(Date.now() / 1000)) * 1000;
  return {
    data: {
      symbol: upperSymbol,
      spot: best.last.close,
      prevClose: best.prev.close,
      marketState: 'REGULAR',
      timestamp: new Date(timestampMs).toISOString(),
      source: 'yahoo',
    },
    ageMs: Date.now() - timestampMs,
  };
}

export function clearCache(): void {
  cache.clear();
  lastKnownData.clear();
  spotCache.clear();
}