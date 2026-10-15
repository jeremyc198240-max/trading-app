import { computeBollingerBands, computeMACD, computeRSI } from "./indicators";
import { fetchLiveOHLC, type OHLC } from "./marketData";
import { getWatchlist } from "./scanner";

export type ScalpDirection = "LONG" | "SHORT";

export interface ScalpConfluenceCandidate {
  symbol: string;
  direction: ScalpDirection;
  score: number;
  price: number;
  rsi: number;
  volumeRatio: number;
  macdCross: boolean;
  divergence: boolean;
  breakout: boolean;
  closeStrength: number;
  trendAligned: boolean;
  breakoutDistancePct: number;
  bollingerTight: boolean;
  strongPriceAction: boolean;
  strongSetup: boolean;
  preBreakout: boolean;
  emaCrossDirection: "bullish" | "bearish" | "none";
  emaCrossCount: number;
  emaCrossStrength: number;
  emaCrosses: string[];
  reasons: string[];
  scannedAt: number;
}

export interface ScalpRadarTrack extends ScalpConfluenceCandidate {
  state: "WATCH" | "ARMING" | "TRIGGERED" | "RESOLVED";
  qualifies: boolean;
  activeSince?: number;
  resolvedReason?: "extension_complete" | "confirmation_lost" | "expired";
}

interface ScalpConfluenceState {
  lastRunAt: number;
  isScanning: boolean;
  sessionEligible: boolean;
  inactiveReason?: "outside_regular_session";
  symbolsScanned: number;
  symbolsWithUsableCandles: number;
  candidates: ScalpConfluenceCandidate[];
  radarTracks: ScalpRadarTrack[];
  failures: number;
  scanIntervalMs: number;
  candleTimeframe: "5m";
  closingCaptureWindow: boolean;
}

const SCAN_INTERVAL_MS = 60 * 1000;
const REGULAR_SESSION_START_MINUTE = 9 * 60 + 30;
// A delayed closing pass lets the provider finalize the 3:55-4:00 PM candle.
const CLOSING_CAPTURE_END_MINUTE = 16 * 60 + 3;
const MIN_SCORE = 58;
const MAX_CONCURRENT_SYMBOL_FETCHES = 2;
const LIVE_ALERT_MAX_AGE_MS = 15 * 60 * 1000;
const LIVE_ALERT_EXTENSION_PCT = 1.1;
const state: ScalpConfluenceState = {
  lastRunAt: 0,
  isScanning: false,
  sessionEligible: false,
  symbolsScanned: 0,
  symbolsWithUsableCandles: 0,
  candidates: [],
  radarTracks: [],
  failures: 0,
  scanIntervalMs: SCAN_INTERVAL_MS,
  candleTimeframe: "5m",
  closingCaptureWindow: false,
};

let scanTimer: NodeJS.Timeout | null = null;
const alertLifecycles = new Map<string, {
  direction: ScalpDirection;
  activeSince: number;
  resolvedReason?: ScalpRadarTrack["resolvedReason"];
}>();

function getSessionState(now = new Date()): { eligible: boolean; closingCaptureWindow: boolean } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const minuteOfDay = hour * 60 + minute;
  const weekdayEligible = ["Mon", "Tue", "Wed", "Thu", "Fri"].includes(weekday);
  return {
    eligible: weekdayEligible && minuteOfDay >= REGULAR_SESSION_START_MINUTE && minuteOfDay <= CLOSING_CAPTURE_END_MINUTE,
    closingCaptureWindow: weekdayEligible && minuteOfDay >= 16 * 60 && minuteOfDay <= CLOSING_CAPTURE_END_MINUTE,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function emaSeries(values: number[], period: number): number[] {
  if (!values.length) return [];
  const multiplier = 2 / (period + 1);
  return values.reduce<number[]>((series, value, index) => {
    series.push(index === 0 ? value : value * multiplier + series[index - 1] * (1 - multiplier));
    return series;
  }, []);
}

function detectEmaCrosses(candles: OHLC[]): {
  bullishScore: number;
  bearishScore: number;
  bullishCrosses: string[];
  bearishCrosses: string[];
} {
  const closes = candles.map((candle) => candle.close);
  const series = new Map([9, 21, 50, 200].map((period) => [period, emaSeries(closes, period)]));
  const pairs = [
    { fast: 9, slow: 21, points: 12 },
    { fast: 9, slow: 50, points: 9 },
    { fast: 21, slow: 50, points: 8 },
    { fast: 50, slow: 200, points: 11 },
  ];
  let bullishScore = 0;
  let bearishScore = 0;
  const bullishCrosses: string[] = [];
  const bearishCrosses: string[] = [];

  for (const pair of pairs) {
    const fast = series.get(pair.fast) ?? [];
    const slow = series.get(pair.slow) ?? [];
    const currentFast = fast.at(-1) ?? 0;
    const currentSlow = slow.at(-1) ?? 0;
    const previousFast = fast.at(-2) ?? currentFast;
    const previousSlow = slow.at(-2) ?? currentSlow;
    const bullishCross = currentFast > currentSlow && previousFast <= previousSlow;
    const bearishCross = currentFast < currentSlow && previousFast >= previousSlow;
    const label = `${pair.fast}/${pair.slow}`;

    if (currentFast > currentSlow) bullishScore += pair.points;
    if (currentFast < currentSlow) bearishScore += pair.points;
    if (bullishCross) {
      bullishScore += 6;
      bullishCrosses.push(label);
    }
    if (bearishCross) {
      bearishScore += 6;
      bearishCrosses.push(label);
    }
  }

  return { bullishScore, bearishScore, bullishCrosses, bearishCrosses };
}

function detectRsiDivergence(candles: OHLC[]): { bullish: boolean; bearish: boolean } {
  if (candles.length < 38) return { bullish: false, bearish: false };
  const recent = candles.slice(-24);
  const earlier = recent.slice(0, 12);
  const later = recent.slice(12);
  const earlyRsi = computeRSI(earlier).value;
  const lateRsi = computeRSI(later).value;
  const earlyLow = Math.min(...earlier.map((bar) => bar.low));
  const lateLow = Math.min(...later.map((bar) => bar.low));
  const earlyHigh = Math.max(...earlier.map((bar) => bar.high));
  const lateHigh = Math.max(...later.map((bar) => bar.high));

  return {
    bullish: lateLow < earlyLow && lateRsi > earlyRsi + 3,
    bearish: lateHigh > earlyHigh && lateRsi < earlyRsi - 3,
  };
}

function buildCandidate(symbol: string, candles: OHLC[]): ScalpRadarTrack | null {
  if (candles.length < 40) return null;
  const latest = candles[candles.length - 1];
  const previous = candles.slice(0, -1);
  const rsi = computeRSI(candles).value;
  const macd = computeMACD(candles);
  const previousMacd = computeMACD(candles.slice(0, -1));
  const bollingerBands = computeBollingerBands(candles, 20);
  const volumeAverage = previous.slice(-20).reduce((sum, bar) => sum + bar.volume, 0) / 20;
  const volumeRatio = latest.volume / Math.max(volumeAverage, 1);
  const recentHigh = Math.max(...previous.slice(-20).map((bar) => bar.high));
  const recentLow = Math.min(...previous.slice(-20).map((bar) => bar.low));
  const divergence = detectRsiDivergence(candles);
  const bullishCross = macd.value > macd.signal && previousMacd.value <= previousMacd.signal;
  const bearishCross = macd.value < macd.signal && previousMacd.value >= previousMacd.signal;
  const breakoutUp = latest.close > recentHigh;
  const breakoutDown = latest.close < recentLow;
  const candleRange = Math.max(latest.high - latest.low, 0.01);
  const bullishCloseStrength = clamp((latest.close - latest.low) / candleRange, 0, 1);
  const bearishCloseStrength = clamp((latest.high - latest.close) / candleRange, 0, 1);
  const shortTrendBaseline = previous.slice(-8).reduce((sum, bar) => sum + bar.close, 0) / 8;
  const longTrendAligned = latest.close > shortTrendBaseline && macd.trend === "bullish";
  const shortTrendAligned = latest.close < shortTrendBaseline && macd.trend === "bearish";
  const breakoutUpDistancePct = ((latest.close - recentHigh) / recentHigh) * 100;
  const breakoutDownDistancePct = ((recentLow - latest.close) / recentLow) * 100;
  const previousClose = previous.at(-1)?.close ?? latest.open;
  const longPriceConfirmed = latest.close > latest.open && latest.close > previousClose && longTrendAligned;
  const shortPriceConfirmed = latest.close < latest.open && latest.close < previousClose && shortTrendAligned;
  const emaCross = detectEmaCrosses(candles);
  const longScore =
    (rsi >= 52 && rsi <= 72 ? 16 : rsi >= 45 ? 8 : 0) +
    (divergence.bullish ? 10 : 0) +
    (bullishCross ? 20 : macd.trend === "bullish" ? 12 : 0) +
    (volumeRatio >= 1.8 ? 18 : volumeRatio >= 1.3 ? 10 : 0) +
    (breakoutUp ? 24 : 0) +
    (bullishCloseStrength >= 0.7 ? 12 : bullishCloseStrength >= 0.58 ? 6 : 0) +
    (longTrendAligned ? 10 : 0) +
    emaCross.bullishScore;
  const shortScore =
    (rsi >= 28 && rsi <= 48 ? 16 : rsi <= 55 ? 8 : 0) +
    (divergence.bearish ? 10 : 0) +
    (bearishCross ? 20 : macd.trend === "bearish" ? 12 : 0) +
    (volumeRatio >= 1.8 ? 18 : volumeRatio >= 1.3 ? 10 : 0) +
    (breakoutDown ? 24 : 0) +
    (bearishCloseStrength >= 0.7 ? 12 : bearishCloseStrength >= 0.58 ? 6 : 0) +
    (shortTrendAligned ? 10 : 0) +
    emaCross.bearishScore;
  const emaCrossDirection = emaCross.bullishScore > emaCross.bearishScore
    ? "bullish"
    : emaCross.bearishScore > emaCross.bullishScore ? "bearish" : "none";
  const direction: ScalpDirection = shortPriceConfirmed && shortScore > longScore
    ? "SHORT"
    : longPriceConfirmed && longScore >= shortScore
      ? "LONG"
      : shortScore > longScore ? "SHORT" : "LONG";
  const rawScore = direction === "LONG" ? longScore : shortScore;
  const priceConfirmed = direction === "LONG" ? longPriceConfirmed : shortPriceConfirmed;

  const isLong = direction === "LONG";
  const closeStrength = isLong ? bullishCloseStrength : bearishCloseStrength;
  const trendAligned = isLong ? longTrendAligned : shortTrendAligned;
  const breakout = isLong ? breakoutUp : breakoutDown;
  const strongPriceAction = closeStrength >= 0.72 && trendAligned;
  const preBreakoutSetup = !priceConfirmed && trendAligned && (
    volumeRatio >= 1.1 ||
    bollingerBands.squeeze ||
    (isLong ? macd.trend === "bullish" : macd.trend === "bearish")
  );
  const score = clamp(rawScore, 0, 100);
  const strongSetup = score >= 70 && trendAligned && (volumeRatio >= 1.3 || breakout || strongPriceAction || preBreakoutSetup);
  const reasons = [
    isLong && rsi >= 52 && rsi <= 72 ? `RSI ${rsi.toFixed(0)} supports upside` : !isLong && rsi >= 28 && rsi <= 48 ? `RSI ${rsi.toFixed(0)} supports downside` : null,
    isLong && divergence.bullish ? "bullish RSI divergence" : !isLong && divergence.bearish ? "bearish RSI divergence" : null,
    isLong && bullishCross ? "MACD bullish crossover" : !isLong && bearishCross ? "MACD bearish crossover" : null,
    volumeRatio >= 1.3 ? `${volumeRatio.toFixed(1)}x abnormal volume` : null,
    isLong && longTrendAligned ? "short trend aligned" : !isLong && shortTrendAligned ? "short trend aligned" : null,
    isLong && breakoutUp ? `${breakoutUpDistancePct.toFixed(2)}% above 20-bar high` : !isLong && breakoutDown ? `${breakoutDownDistancePct.toFixed(2)}% below 20-bar low` : null,
    strongPriceAction ? `strong ${isLong ? "bullish" : "bearish"} price action` : null,
    bollingerBands.squeeze ? "5m Bollinger Bands tight" : null,
    strongSetup ? "strong setup confluence" : null,
    isLong && emaCross.bullishCrosses.length ? `5m bullish EMA cross ${emaCross.bullishCrosses.join(", ")}` : null,
    !isLong && emaCross.bearishCrosses.length ? `5m bearish EMA cross ${emaCross.bearishCrosses.join(", ")}` : null,
  ].filter((reason): reason is string => Boolean(reason));

  const qualifies = score >= MIN_SCORE && (priceConfirmed || preBreakoutSetup);
  const state: ScalpRadarTrack["state"] = qualifies && (isLong ? breakoutUp : breakoutDown)
    ? "TRIGGERED"
    : score >= 36
      ? "ARMING"
      : "WATCH";

  return {
    symbol,
    direction,
    score,
    price: latest.close,
    rsi,
    volumeRatio,
    macdCross: isLong ? bullishCross : bearishCross,
    divergence: isLong ? divergence.bullish : divergence.bearish,
    breakout,
    closeStrength,
    trendAligned,
    breakoutDistancePct: isLong ? Math.max(0, breakoutUpDistancePct) : Math.max(0, breakoutDownDistancePct),
    bollingerTight: bollingerBands.squeeze,
    strongPriceAction,
    strongSetup,
    preBreakout: preBreakoutSetup,
    emaCrossDirection,
    emaCrossCount: isLong ? emaCross.bullishCrosses.length : emaCross.bearishCrosses.length,
    emaCrossStrength: clamp(isLong ? emaCross.bullishScore : emaCross.bearishScore, 0, 100),
    emaCrosses: isLong ? emaCross.bullishCrosses : emaCross.bearishCrosses,
    reasons,
    scannedAt: Date.now(),
    state,
    qualifies,
  };
}

function applyAlertLifecycle(track: ScalpRadarTrack): ScalpRadarTrack {
  const key = track.symbol.toUpperCase();
  const existing = alertLifecycles.get(key);
  const isLiveBreak = track.state === "TRIGGERED" && track.breakout;

  if (!isLiveBreak) {
    // A new setup can arm only after the prior breakout has reset.
    if (!track.breakout) alertLifecycles.delete(key);
    return track;
  }

  const activeSince = existing?.direction === track.direction
    ? existing.activeSince
    : track.scannedAt;
  const ageMs = track.scannedAt - activeSince;
  const extensionComplete = (track.breakoutDistancePct ?? 0) >= LIVE_ALERT_EXTENSION_PCT;
  const expired = ageMs >= LIVE_ALERT_MAX_AGE_MS;

  if (existing?.resolvedReason && existing.direction === track.direction) {
    return {
      ...track,
      state: "RESOLVED",
      activeSince,
      resolvedReason: existing.resolvedReason,
    };
  }

  const resolvedReason = extensionComplete
    ? "extension_complete"
    : expired
      ? "expired"
      : undefined;

  alertLifecycles.set(key, {
    direction: track.direction,
    activeSince,
    resolvedReason,
  });

  return resolvedReason
    ? { ...track, state: "RESOLVED", activeSince, resolvedReason }
    : { ...track, activeSince };
}

export async function runScalpConfluenceScan(): Promise<void> {
  const session = getSessionState();
  state.sessionEligible = session.eligible;
  state.inactiveReason = session.eligible ? undefined : "outside_regular_session";
  if (state.isScanning || !session.eligible) return;
  state.isScanning = true;
  state.closingCaptureWindow = session.closingCaptureWindow;
  try {
    const symbols = getWatchlist();
    const results: PromiseSettledResult<ScalpRadarTrack | null>[] = [];
    for (let index = 0; index < symbols.length; index += MAX_CONCURRENT_SYMBOL_FETCHES) {
      const batch = symbols.slice(index, index + MAX_CONCURRENT_SYMBOL_FETCHES);
      const batchResults = await Promise.allSettled(batch.map(async (symbol) => {
        const response = await fetchLiveOHLC(symbol, "5m", "FULL");
        return buildCandidate(symbol, response.data ?? []);
      }));
      results.push(...batchResults);
    }
    state.symbolsScanned = symbols.length;
    state.symbolsWithUsableCandles = results.filter((result) => result.status === "fulfilled" && result.value).length;
    state.failures = results.filter((result) => result.status === "rejected").length;
    state.radarTracks = results
      .flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : [])
      .map(applyAlertLifecycle)
      .sort((left, right) => {
        const statePriority = { TRIGGERED: 3, ARMING: 2, WATCH: 1, RESOLVED: 0 };
        return statePriority[right.state] - statePriority[left.state] || right.score - left.score;
      })
      .slice(0, 12);
    state.candidates = state.radarTracks
      .filter((track) => track.qualifies && track.state !== "RESOLVED")
      .slice(0, 5);
    state.lastRunAt = Date.now();
    console.log(`[ScalpConfluence] 1m scan / 5m bars${session.closingCaptureWindow ? " (closing capture)" : ""}: ${state.candidates.length} candidates from ${symbols.length} symbols`);
  } finally {
    state.isScanning = false;
  }
}

export function startScalpConfluenceScanner(): void {
  if (scanTimer) return;
  console.log("[ScalpConfluence] Armed 1m RSI/MACD/volume/pre-breakout scanner");
  void runScalpConfluenceScan();
  scanTimer = setInterval(() => void runScalpConfluenceScan(), SCAN_INTERVAL_MS);
}

export function getScalpConfluenceState(): ScalpConfluenceState {
  return { ...state, candidates: [...state.candidates], radarTracks: [...state.radarTracks] };
}