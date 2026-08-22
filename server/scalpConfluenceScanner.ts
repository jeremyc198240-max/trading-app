import { computeMACD, computeRSI } from "./indicators";
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
  reasons: string[];
  scannedAt: number;
}

export interface ScalpRadarTrack extends ScalpConfluenceCandidate {
  state: "WATCH" | "ARMING" | "TRIGGERED";
  qualifies: boolean;
}

interface ScalpConfluenceState {
  lastRunAt: number;
  isScanning: boolean;
  symbolsScanned: number;
  candidates: ScalpConfluenceCandidate[];
  radarTracks: ScalpRadarTrack[];
  failures: number;
  scanIntervalMs: number;
  candleTimeframe: "5m";
  closingCaptureWindow: boolean;
}

const SCAN_INTERVAL_MS = 3 * 60 * 1000;
const REGULAR_SESSION_START_MINUTE = 9 * 60 + 30;
// A delayed closing pass lets the provider finalize the 3:55-4:00 PM candle.
const CLOSING_CAPTURE_END_MINUTE = 16 * 60 + 3;
const MIN_SCORE = 58;
const state: ScalpConfluenceState = {
  lastRunAt: 0,
  isScanning: false,
  symbolsScanned: 0,
  candidates: [],
  radarTracks: [],
  failures: 0,
  scanIntervalMs: SCAN_INTERVAL_MS,
  candleTimeframe: "5m",
  closingCaptureWindow: false,
};

let scanTimer: NodeJS.Timeout | null = null;

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
  const longScore =
    (rsi >= 52 && rsi <= 72 ? 16 : rsi >= 45 ? 8 : 0) +
    (divergence.bullish ? 10 : 0) +
    (bullishCross ? 20 : macd.trend === "bullish" ? 12 : 0) +
    (volumeRatio >= 1.8 ? 18 : volumeRatio >= 1.3 ? 10 : 0) +
    (breakoutUp ? 24 : 0) +
    (bullishCloseStrength >= 0.7 ? 12 : bullishCloseStrength >= 0.58 ? 6 : 0) +
    (longTrendAligned ? 10 : 0);
  const shortScore =
    (rsi >= 28 && rsi <= 48 ? 16 : rsi <= 55 ? 8 : 0) +
    (divergence.bearish ? 10 : 0) +
    (bearishCross ? 20 : macd.trend === "bearish" ? 12 : 0) +
    (volumeRatio >= 1.8 ? 18 : volumeRatio >= 1.3 ? 10 : 0) +
    (breakoutDown ? 24 : 0) +
    (bearishCloseStrength >= 0.7 ? 12 : bearishCloseStrength >= 0.58 ? 6 : 0) +
    (shortTrendAligned ? 10 : 0);
  const direction: ScalpDirection = longScore >= shortScore ? "LONG" : "SHORT";
  const score = clamp(Math.max(longScore, shortScore), 0, 100);

  const isLong = direction === "LONG";
  const reasons = [
    isLong && rsi >= 52 && rsi <= 72 ? `RSI ${rsi.toFixed(0)} supports upside` : !isLong && rsi >= 28 && rsi <= 48 ? `RSI ${rsi.toFixed(0)} supports downside` : null,
    isLong && divergence.bullish ? "bullish RSI divergence" : !isLong && divergence.bearish ? "bearish RSI divergence" : null,
    isLong && bullishCross ? "MACD bullish crossover" : !isLong && bearishCross ? "MACD bearish crossover" : null,
    volumeRatio >= 1.3 ? `${volumeRatio.toFixed(1)}x abnormal volume` : null,
    isLong && longTrendAligned ? "short trend aligned" : !isLong && shortTrendAligned ? "short trend aligned" : null,
    isLong && breakoutUp ? `${breakoutUpDistancePct.toFixed(2)}% above 20-bar high` : !isLong && breakoutDown ? `${breakoutDownDistancePct.toFixed(2)}% below 20-bar low` : null,
  ].filter((reason): reason is string => Boolean(reason));

  const qualifies = score >= MIN_SCORE;
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
    breakout: isLong ? breakoutUp : breakoutDown,
    closeStrength: isLong ? bullishCloseStrength : bearishCloseStrength,
    trendAligned: isLong ? longTrendAligned : shortTrendAligned,
    breakoutDistancePct: isLong ? Math.max(0, breakoutUpDistancePct) : Math.max(0, breakoutDownDistancePct),
    reasons,
    scannedAt: Date.now(),
    state,
    qualifies,
  };
}

export async function runScalpConfluenceScan(): Promise<void> {
  const session = getSessionState();
  if (state.isScanning || !session.eligible) return;
  state.isScanning = true;
  state.closingCaptureWindow = session.closingCaptureWindow;
  try {
    const symbols = getWatchlist();
    const results = await Promise.allSettled(symbols.map(async (symbol) => {
      const response = await fetchLiveOHLC(symbol, "5m", "FULL");
      return buildCandidate(symbol, response.data ?? []);
    }));
    state.symbolsScanned = symbols.length;
    state.failures = results.filter((result) => result.status === "rejected").length;
    state.radarTracks = results
      .flatMap((result) => result.status === "fulfilled" && result.value ? [result.value] : [])
      .sort((left, right) => {
        const statePriority = { TRIGGERED: 2, ARMING: 1, WATCH: 0 };
        return statePriority[right.state] - statePriority[left.state] || right.score - left.score;
      })
      .slice(0, 12);
    state.candidates = state.radarTracks
      .filter((track) => track.qualifies)
      .slice(0, 5);
    state.lastRunAt = Date.now();
    console.log(`[ScalpConfluence] 3m scan / 5m bars${session.closingCaptureWindow ? " (closing capture)" : ""}: ${state.candidates.length} candidates from ${symbols.length} symbols`);
  } finally {
    state.isScanning = false;
  }
}

export function startScalpConfluenceScanner(): void {
  if (scanTimer) return;
  console.log("[ScalpConfluence] Armed 3m RSI/MACD/volume/breakout scanner");
  void runScalpConfluenceScan();
  scanTimer = setInterval(() => void runScalpConfluenceScan(), SCAN_INTERVAL_MS);
}

export function getScalpConfluenceState(): ScalpConfluenceState {
  return { ...state, candidates: [...state.candidates], radarTracks: [...state.radarTracks] };
}