/**
 * Historical 0DTE Proxy Backtest Engine
 * Uses actual Yahoo Finance underlying candles with theoretical option pricing.
 * Contract returns remain simulated unless historical option quotes are supplied.
 */

import { OHLC, fetchLiveOHLC } from './marketData';

export interface HistoricalBacktestResult {
  symbol: string;
  period: string;
  totalBars: number;
  totalSignals: number;
  signalsAnalyzed: number;
  wins: number;
  losses: number;
  scratches: number;
  winRate: number;
  avgWinPct: number;
  avgLossPct: number;
  profitFactor: number;
  expectancy: number;
  avgHoldBars: number;
  avgHoldMinutes: number;
  minHoldMinutes: number;
  maxHoldMinutes: number;
  byDirection: {
    calls: { trades: number; wins: number; winRate: number };
    puts: { trades: number; wins: number; winRate: number };
  };
  byHour: { hour: number; trades: number; winRate: number }[];
  sampleTrades: TradeResult[];
  disclaimer: string;
}

interface TradeResult {
  entryTime: number;
  entryPrice: number;
  direction: 'CALL' | 'PUT';
  stopLoss: number;
  target1: number;
  target2: number;
  exitPrice: number;
  exitTime: number;
  outcome: 'win_t1' | 'win_t2' | 'loss' | 'scratch';
  returnPct: number;
  holdBars: number;
  reason: string;
}

interface ZeroDtePricingInput {
  spot: number;
  strike: number;
  minutesToExpiry: number;
  annualizedVolatility: number;
  direction: 'CALL' | 'PUT';
}

export interface ZeroDtePremiumReturnInput {
  entrySpot: number;
  exitSpot: number;
  strike: number;
  entryMinutesToExpiry: number;
  exitMinutesToExpiry: number;
  annualizedVolatility: number;
  direction: 'CALL' | 'PUT';
  halfSpreadPct?: number;
}

interface SignalSnapshot {
  barIndex: number;
  timestamp: number;
  price: number;
  direction: 'CALL' | 'PUT';
  stopLoss: number;
  target1: number;
  target2: number;
  confidence: number;
}

export interface BacktestProfile {
  allowedDirections?: Array<'CALL' | 'PUT'>;
  minConfidence: number;
  minMomentumAbs: number;
  minVolumeRatio: number;
  minEmaSpreadPct: number;
  minAtrPct: number;
  maxAtrPct: number;
  stopLossPct: number;
  target1Pct: number;
  target2Pct: number;
  maxHoldBars: number;
  minBarsBetween: number;
  allowedEstHours?: number[];
  blockedEstHours: number[];
  requiredStepBias: number;
  requireFreshBreak?: boolean;
  minBodyPctOfRange?: number;
  minCloseLocation?: number;
}

export interface BacktestEvaluationWindow {
  startTime?: number;
  endTime?: number;
}

const BACKTEST_PROFILES: Record<string, BacktestProfile> = {
  '5m': {
    allowedDirections: ['CALL', 'PUT'],
    minConfidence: 70,
    minMomentumAbs: 0.0009,
    minVolumeRatio: 1.04,
    minEmaSpreadPct: 0.00018,
    minAtrPct: 0.0006,
    maxAtrPct: 0.0105,
    stopLossPct: 0.0035,
    target1Pct: 0.0015,
    target2Pct: 0.003,
    maxHoldBars: 5,
    minBarsBetween: 2,
    allowedEstHours: [9, 10, 11, 12, 13, 14, 15],
    blockedEstHours: [],
    requiredStepBias: 2,
    requireFreshBreak: true,
  },
  '15m': {
    allowedDirections: ['PUT'],
    minConfidence: 78,
    minMomentumAbs: 0.0017,
    minVolumeRatio: 1,
    minEmaSpreadPct: 0.00016,
    minAtrPct: 0.0007,
    maxAtrPct: 0.0085,
    stopLossPct: 0.0065,
    target1Pct: 0.0008,
    target2Pct: 0.0016,
    maxHoldBars: 12,
    minBarsBetween: 5,
    allowedEstHours: [10],
    blockedEstHours: [9],
    requiredStepBias: 2,
  },
  '30m': {
    allowedDirections: ['CALL', 'PUT'],
    minConfidence: 72,
    minMomentumAbs: 0.0015,
    minVolumeRatio: 0.95,
    minEmaSpreadPct: 0.0002,
    minAtrPct: 0.0005,
    maxAtrPct: 0.008,
    stopLossPct: 0.006,
    target1Pct: 0.001,
    target2Pct: 0.002,
    maxHoldBars: 10,
    minBarsBetween: 3,
    allowedEstHours: [10, 12],
    blockedEstHours: [9],
    requiredStepBias: 2,
  },
  '1h': {
    allowedDirections: ['PUT'],
    minConfidence: 74,
    minMomentumAbs: 0.0013,
    minVolumeRatio: 0.95,
    minEmaSpreadPct: 0.00014,
    minAtrPct: 0.00045,
    maxAtrPct: 0.009,
    stopLossPct: 0.006,
    target1Pct: 0.0009,
    target2Pct: 0.0018,
    maxHoldBars: 8,
    minBarsBetween: 3,
    allowedEstHours: [10, 11, 12, 13, 14, 15],
    blockedEstHours: [9],
    requiredStepBias: 1,
  },
};

const DEFAULT_PROFILE = BACKTEST_PROFILES['15m'];

function estHour(unixSeconds: number): number {
  const ms = unixSeconds * 1000;
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    hour12: false,
  }).format(new Date(ms)));
}

function isRegularMarketCandle(unixSeconds: number): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(unixSeconds * 1000));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  const minutesSinceMidnight = hour * 60 + minute;
  return Number.isFinite(minutesSinceMidnight) && minutesSinceMidnight >= 570 && minutesSinceMidnight <= 955;
}

function getProfile(timeframe: string, overrides?: Partial<BacktestProfile>): BacktestProfile {
  return { ...(BACKTEST_PROFILES[timeframe.toLowerCase()] ?? DEFAULT_PROFILE), ...overrides };
}

function timeframeMinutes(timeframe: string): number {
  const normalized = timeframe.toLowerCase();
  if (normalized.endsWith('m')) return Number(normalized.slice(0, -1)) || 5;
  if (normalized.endsWith('h')) return (Number(normalized.slice(0, -1)) || 1) * 60;
  return 5;
}

/**
 * Generates a signal based on simple technical rules applied to the candle data
 * This replaces the complex fusion engine for backtesting purposes
 */
function generateSignal(candles: OHLC[], index: number, profile: BacktestProfile): SignalSnapshot | null {
  if (index < 20) return null; // Need at least 20 bars for indicators
  
  const current = candles[index];
  const hour = estHour(current.time);
  if (!isRegularMarketCandle(current.time)) return null;
  if (profile.allowedEstHours && profile.allowedEstHours.length > 0 && !profile.allowedEstHours.includes(hour)) return null;
  if (profile.blockedEstHours.includes(hour)) return null;
  const lookback = candles.slice(Math.max(0, index - 20), index + 1);
  const prevClose = candles[index - 1]?.close ?? current.close;
  
  // Calculate simple indicators
  const closes = lookback.map(c => c.close);
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  const prevEma9 = calculateEMA(closes.slice(0, -1), 9);
  const prevEma21 = calculateEMA(closes.slice(0, -1), 21);
  
  // Calculate momentum
  const momentum = (current.close - lookback[0].close) / lookback[0].close;
  
  // Calculate volume trend
  const avgVolume = lookback.slice(0, -1).reduce((s, c) => s + c.volume, 0) / (lookback.length - 1);
  const volumeRatio = avgVolume > 0 ? current.volume / avgVolume : 0;
  
  // Calculate ATR for volatility
  const atr = calculateATR(lookback);
  const atrPct = current.close > 0 ? atr / current.close : 0;
  if (atrPct < profile.minAtrPct || atrPct > profile.maxAtrPct) return null;

  const candleRange = current.high - current.low;
  const bodyPctOfRange = candleRange > 0 ? Math.abs(current.close - current.open) / candleRange : 0;
  const bullishCloseLocation = candleRange > 0 ? (current.close - current.low) / candleRange : 0.5;
  const bearishCloseLocation = candleRange > 0 ? (current.high - current.close) / candleRange : 0.5;

  const emaSpreadPct = Math.abs(ema9 - ema21) / Math.max(current.close, 1e-6);
  if (emaSpreadPct < profile.minEmaSpreadPct) return null;

  const recent = lookback.slice(-5);
  let upSteps = 0;
  let downSteps = 0;
  for (let i = 1; i < recent.length; i += 1) {
    if (recent[i].close > recent[i - 1].close) upSteps += 1;
    if (recent[i].close < recent[i - 1].close) downSteps += 1;
  }
  const stepBias = upSteps - downSteps;
  const freshEma9BreakUp = prevClose <= prevEma9 && current.close > ema9;
  const freshEma9BreakDown = prevClose >= prevEma9 && current.close < ema9;
  const freshTrendFlipUp = prevEma9 <= prevEma21 && ema9 > ema21;
  const freshTrendFlipDown = prevEma9 >= prevEma21 && ema9 < ema21;
  const requireFresh5mBreak = profile.requireFreshBreak === true;
  
  // Determine direction based on EMA crossover and momentum
  let direction: 'CALL' | 'PUT' | null = null;
  let confidence = 50;
  
  // CALL signal: Price above both EMAs, positive momentum, above-average volume
  if (
    ema9 > ema21 &&
    momentum > profile.minMomentumAbs &&
    volumeRatio > profile.minVolumeRatio &&
    stepBias >= profile.requiredStepBias &&
    (profile.minBodyPctOfRange == null || bodyPctOfRange >= profile.minBodyPctOfRange) &&
    (profile.minCloseLocation == null || bullishCloseLocation >= profile.minCloseLocation) &&
    (!requireFresh5mBreak || freshEma9BreakUp || freshTrendFlipUp)
  ) {
    direction = 'CALL';
    confidence = 58 + Math.min(24, momentum * 1800) + Math.min(14, (volumeRatio - 1) * 18) + Math.min(8, stepBias * 2);
    if (freshEma9BreakUp) confidence += 8;
    if (freshTrendFlipUp) confidence += 6;
  }
  // PUT signal: Price below both EMAs, negative momentum, above-average volume
  else if (
    ema9 < ema21 &&
    momentum < -profile.minMomentumAbs &&
    volumeRatio > profile.minVolumeRatio &&
    -stepBias >= profile.requiredStepBias &&
    (profile.minBodyPctOfRange == null || bodyPctOfRange >= profile.minBodyPctOfRange) &&
    (profile.minCloseLocation == null || bearishCloseLocation >= profile.minCloseLocation) &&
    (!requireFresh5mBreak || freshEma9BreakDown || freshTrendFlipDown)
  ) {
    direction = 'PUT';
    confidence = 58 + Math.min(24, Math.abs(momentum) * 1800) + Math.min(14, (volumeRatio - 1) * 18) + Math.min(8, -stepBias * 2);
    if (freshEma9BreakDown) confidence += 8;
    if (freshTrendFlipDown) confidence += 6;
  }
  
  if (!direction) return null;
  if (profile.allowedDirections && !profile.allowedDirections.includes(direction)) return null;
  
  // Only generate high-confidence signals (simulating GOLD/HOT thresholds)
  if (confidence < profile.minConfidence) return null;
  
  const price = current.close;
  const stopLoss = direction === 'CALL' 
    ? price * (1 - profile.stopLossPct)
    : price * (1 + profile.stopLossPct);
  const target1 = direction === 'CALL'
    ? price * (1 + profile.target1Pct)
    : price * (1 - profile.target1Pct);
  const target2 = direction === 'CALL'
    ? price * (1 + profile.target2Pct)
    : price * (1 - profile.target2Pct);
  
  return {
    barIndex: index,
    timestamp: current.time,
    price,
    direction,
    stopLoss,
    target1,
    target2,
    confidence: Math.min(95, confidence),
  };
}

/**
 * Simulates the trade forward to determine outcome
 * This is the key function - it uses REAL future price data
 */
function simulateTradeForward(
  symbol: string,
  candles: OHLC[],
  signal: SignalSnapshot,
  profile: BacktestProfile,
): TradeResult {
  const entryBar = signal.barIndex;
  let exitBar = entryBar;
  let outcome: TradeResult['outcome'] = 'scratch';
  let exitPrice = signal.price;
  let reason = 'Time stop (max hold)';
  let target1Reached = false;
  let runnerOpen = false;
  
  // Walk forward through actual future bars
  for (let i = entryBar + 1; i < Math.min(entryBar + profile.maxHoldBars + 1, candles.length); i++) {
    const bar = candles[i];
    exitBar = i;
    
    if (signal.direction === 'CALL') {
      const hitStop = bar.low <= signal.stopLoss;
      const hitT2 = bar.high >= signal.target2;
      const hitT1 = bar.high >= signal.target1;

      if (runnerOpen) {
        const hitBreakeven = bar.low <= signal.price;
        if (hitBreakeven && hitT2) {
          outcome = 'win_t2';
          exitPrice = bar.close >= bar.open ? signal.target2 : signal.price;
          reason = bar.close >= bar.open ? 'Runner reached T2' : 'Runner stopped at breakeven';
        } else if (hitT2) {
          outcome = 'win_t2';
          exitPrice = signal.target2;
          reason = 'Runner reached T2';
        } else if (hitBreakeven) {
          outcome = 'win_t1';
          exitPrice = signal.price;
          reason = 'T1 secured; runner stopped at breakeven';
        } else {
          continue;
        }
        runnerOpen = false;
        break;
      }

      // If both stop and target were touched in the same bar, resolve using candle direction.
      if (hitStop && (hitT1 || hitT2)) {
        if (bar.close >= bar.open) {
          outcome = hitT2 ? 'win_t2' : 'win_t1';
          exitPrice = hitT2 ? signal.target2 : signal.target1;
          target1Reached = true;
          reason = 'Same-bar conflict resolved to target (bullish close)';
        } else {
          outcome = 'loss';
          exitPrice = signal.stopLoss;
          reason = 'Same-bar conflict resolved to stop (bearish close)';
        }
        break;
      }

      if (hitStop) {
        outcome = 'loss';
        exitPrice = signal.stopLoss;
        reason = 'Stop loss hit';
        break;
      }
      if (hitT2) {
        outcome = 'win_t2';
        exitPrice = signal.target2;
        target1Reached = true;
        reason = 'T2 target hit';
        break;
      }
      if (hitT1) {
        target1Reached = true;
        runnerOpen = true;
        outcome = 'win_t1';
        exitPrice = signal.target1;
        reason = 'T1 secured; runner active';
      }
    } else {
      const hitStop = bar.high >= signal.stopLoss;
      const hitT2 = bar.low <= signal.target2;
      const hitT1 = bar.low <= signal.target1;

      if (runnerOpen) {
        const hitBreakeven = bar.high >= signal.price;
        if (hitBreakeven && hitT2) {
          outcome = 'win_t2';
          exitPrice = bar.close <= bar.open ? signal.target2 : signal.price;
          reason = bar.close <= bar.open ? 'Runner reached T2' : 'Runner stopped at breakeven';
        } else if (hitT2) {
          outcome = 'win_t2';
          exitPrice = signal.target2;
          reason = 'Runner reached T2';
        } else if (hitBreakeven) {
          outcome = 'win_t1';
          exitPrice = signal.price;
          reason = 'T1 secured; runner stopped at breakeven';
        } else {
          continue;
        }
        runnerOpen = false;
        break;
      }

      // If both stop and target were touched in the same bar, resolve using candle direction.
      if (hitStop && (hitT1 || hitT2)) {
        if (bar.close <= bar.open) {
          outcome = hitT2 ? 'win_t2' : 'win_t1';
          exitPrice = hitT2 ? signal.target2 : signal.target1;
          target1Reached = true;
          reason = 'Same-bar conflict resolved to target (bearish close)';
        } else {
          outcome = 'loss';
          exitPrice = signal.stopLoss;
          reason = 'Same-bar conflict resolved to stop (bullish close)';
        }
        break;
      }

      if (hitStop) {
        outcome = 'loss';
        exitPrice = signal.stopLoss;
        reason = 'Stop loss hit';
        break;
      }
      if (hitT2) {
        outcome = 'win_t2';
        exitPrice = signal.target2;
        target1Reached = true;
        reason = 'T2 target hit';
        break;
      }
      if (hitT1) {
        target1Reached = true;
        runnerOpen = true;
        outcome = 'win_t1';
        exitPrice = signal.target1;
        reason = 'T1 secured; runner active';
      }
    }
  }

  if (runnerOpen) {
    exitPrice = candles[exitBar]?.close ?? exitPrice;
    reason = 'T1 secured; runner time exit';
  }
  
  // If we exited due to time, calculate return based on last close
  if (outcome === 'scratch') {
    const lastBar = candles[exitBar];
    exitPrice = lastBar.close;
    const movePct = signal.direction === 'CALL'
      ? (exitPrice - signal.price) / signal.price
      : (signal.price - exitPrice) / signal.price;
    
    // Small winners/losers based on actual price movement
    if (movePct > 0) {
      outcome = 'win_t1';
      reason = 'Time exit (small profit)';
    } else if (movePct < 0) {
      outcome = 'loss';
      reason = 'Time exit (small loss)';
    }
  }
  
  const returnPct = estimateZeroDteReturn(symbol, candles, signal, exitBar, exitPrice, target1Reached, profile);
  if (returnPct > 0) {
    outcome = target1Reached ? outcome : 'win_t1';
  } else if (returnPct < 0) {
    outcome = 'loss';
  } else {
    outcome = 'scratch';
  }
  
  return {
    entryTime: signal.timestamp,
    entryPrice: signal.price,
    direction: signal.direction,
    stopLoss: signal.stopLoss,
    target1: signal.target1,
    target2: signal.target2,
    exitPrice,
    exitTime: candles[exitBar]?.time ?? signal.timestamp,
    outcome,
    returnPct: Math.round(Math.max(-100, Math.min(300, returnPct)) * 100) / 100,
    holdBars: exitBar - entryBar,
    reason,
  };
}

function calculateEMA(data: number[], period: number): number {
  if (data.length < period) return data[data.length - 1];
  const multiplier = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema;
  }
  return ema;
}

function calculateATR(candles: OHLC[]): number {
  if (candles.length < 2) return 0;
  let sum = 0;
  for (let i = 1; i < candles.length; i++) {
    const high = candles[i].high;
    const low = candles[i].low;
    const prevClose = candles[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    sum += tr;
  }
  return sum / (candles.length - 1);
}

function normalCdf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value) / Math.sqrt(2);
  const coefficient = 1 / (1 + 0.3275911 * x);
  const approximation = 1 - (((((1.061405429 * coefficient - 1.453152027) * coefficient + 1.421413741)
    * coefficient - 0.284496736) * coefficient + 0.254829592) * coefficient * Math.exp(-x * x));
  return 0.5 * (1 + sign * approximation);
}

function zeroDteOptionValue(input: ZeroDtePricingInput): number {
  const years = Math.max(input.minutesToExpiry, 1) / (365 * 24 * 60);
  const volatility = Math.max(0.08, Math.min(1.5, input.annualizedVolatility));
  const standardDeviation = volatility * Math.sqrt(years);
  const d1 = (Math.log(input.spot / input.strike) + 0.5 * volatility * volatility * years) / standardDeviation;
  const d2 = d1 - standardDeviation;
  if (input.direction === 'CALL') {
    return Math.max(0.01, input.spot * normalCdf(d1) - input.strike * normalCdf(d2));
  }
  return Math.max(0.01, input.strike * normalCdf(-d2) - input.spot * normalCdf(-d1));
}

export function estimateZeroDtePremiumReturn(input: ZeroDtePremiumReturnInput): number {
  const halfSpreadPct = input.halfSpreadPct ?? 0.03;
  const entryMid = zeroDteOptionValue({
    spot: input.entrySpot,
    strike: input.strike,
    minutesToExpiry: input.entryMinutesToExpiry,
    annualizedVolatility: input.annualizedVolatility,
    direction: input.direction,
  });
  const exitMid = zeroDteOptionValue({
    spot: input.exitSpot,
    strike: input.strike,
    minutesToExpiry: input.exitMinutesToExpiry,
    annualizedVolatility: input.annualizedVolatility,
    direction: input.direction,
  });
  const entryFill = entryMid * (1 + halfSpreadPct);
  const exitFill = exitMid * (1 - halfSpreadPct);
  return Math.max(-1, (exitFill - entryFill) / entryFill) * 100;
}

function minutesToRegularClose(unixSeconds: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(unixSeconds * 1000));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 16);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return Math.max(1, 16 * 60 - (hour * 60 + minute));
}

function nearestListedStrike(symbol: string, spot: number): number {
  const interval = ['SPY', 'QQQ', 'IWM', 'DIA'].includes(symbol.toUpperCase())
    ? 1
    : spot < 25 ? 0.5
      : spot < 100 ? 1
        : spot < 200 ? 2.5
          : spot < 1000 ? 5
            : 10;
  return Math.round(spot / interval) * interval;
}

function estimateZeroDteReturn(
  symbol: string,
  candles: OHLC[],
  signal: SignalSnapshot,
  exitBar: number,
  exitPrice: number,
  target1Reached: boolean,
  profile: BacktestProfile,
): number {
  const volatilityWindow = candles.slice(Math.max(0, signal.barIndex - 20), signal.barIndex + 1);
  const atrPct = calculateATR(volatilityWindow) / Math.max(signal.price, 1e-6);
  const annualizedVolatility = Math.max(0.15, Math.min(1.2, atrPct * Math.sqrt(78 * 252)));
  const strike = nearestListedStrike(symbol, signal.price);
  const entryMinutes = minutesToRegularClose(signal.timestamp);
  const exitMinutes = minutesToRegularClose(candles[exitBar]?.time ?? signal.timestamp);
  const runnerReturn = estimateZeroDtePremiumReturn({
    entrySpot: signal.price,
    exitSpot: exitPrice,
    strike,
    entryMinutesToExpiry: entryMinutes,
    exitMinutesToExpiry: exitMinutes,
    annualizedVolatility,
    direction: signal.direction,
  }) / 100;
  if (!target1Reached) return Math.max(-1, runnerReturn) * 100;

  const targetSpot = signal.direction === 'CALL'
    ? signal.price * (1 + profile.target1Pct)
    : signal.price * (1 - profile.target1Pct);
  const securedReturn = estimateZeroDtePremiumReturn({
    entrySpot: signal.price,
    exitSpot: targetSpot,
    strike,
    entryMinutesToExpiry: entryMinutes,
    exitMinutesToExpiry: exitMinutes,
    annualizedVolatility,
    direction: signal.direction,
  }) / 100;
  return Math.max(-1, (securedReturn + runnerReturn) / 2) * 100;
}

/**
 * Run the historical underlying replay with a 0DTE premium proxy.
 */
export async function runHistoricalBacktest(
  symbol: string = 'SPY',
  timeframe: string = '5m',
  lookbackDays?: number,
  profileOverrides?: Partial<BacktestProfile>,
  evaluationWindow?: BacktestEvaluationWindow,
): Promise<HistoricalBacktestResult> {
  console.log(`[HistoricalBacktest] Starting backtest for ${symbol} on ${timeframe}${lookbackDays ? ` over ${lookbackDays} days` : ''}...`);
  
  // Fetch real historical data from Yahoo Finance
  const { data: candles, isLive, error } = await fetchLiveOHLC(symbol, timeframe, 'FULL', { lookbackDays });
  
  if (!candles || candles.length < 50) {
    throw new Error(`Insufficient historical data for ${symbol}: ${error || 'Not enough candles'}`);
  }
  
  console.log(`[HistoricalBacktest] Loaded ${candles.length} historical candles`);

  const profile = getProfile(timeframe, profileOverrides);
  
  const trades: TradeResult[] = [];
  let lastSignalBar = -profile.minBarsBetween - 1;
  
  // Walk through history, generating signals and testing them
  // Leave last 20 bars for forward simulation
  for (let i = 20; i < candles.length - profile.maxHoldBars; i++) {
    const timestamp = candles[i].time;
    if (evaluationWindow?.startTime != null && timestamp < evaluationWindow.startTime) continue;
    if (evaluationWindow?.endTime != null && timestamp >= evaluationWindow.endTime) continue;

    // Enforce minimum bars between signals
    if (i - lastSignalBar < profile.minBarsBetween) continue;
    
    const signal = generateSignal(candles, i, profile);
    if (!signal) continue;
    
    // Simulate the trade using REAL future data
    const trade = simulateTradeForward(symbol, candles, signal, profile);
    trades.push(trade);
    lastSignalBar = i;
  }
  
  console.log(`[HistoricalBacktest] Generated ${trades.length} trades`);
  
  // Calculate statistics
  const wins = trades.filter(t => t.outcome === 'win_t1' || t.outcome === 'win_t2');
  const losses = trades.filter(t => t.outcome === 'loss');
  const scratches = trades.filter(t => t.outcome === 'scratch');
  
  const winRate = trades.length > 0 ? (wins.length / trades.length) * 100 : 0;
  
  const avgWinPct = wins.length > 0
    ? wins.reduce((s, t) => s + t.returnPct, 0) / wins.length
    : 0;
  const avgLossPct = losses.length > 0
    ? Math.abs(losses.reduce((s, t) => s + t.returnPct, 0) / losses.length)
    : 0;
  
  const grossWins = wins.reduce((s, t) => s + t.returnPct, 0);
  const grossLosses = Math.abs(losses.reduce((s, t) => s + t.returnPct, 0));
  const profitFactor = grossLosses > 0 ? grossWins / grossLosses : (grossWins > 0 ? 999 : 0);
  
  const expectancy = trades.length > 0
    ? trades.reduce((s, t) => s + t.returnPct, 0) / trades.length
    : 0;
  
  const avgHoldBars = trades.length > 0
    ? trades.reduce((s, t) => s + t.holdBars, 0) / trades.length
    : 0;
  const holdMinutes = trades.map((trade) => trade.holdBars * timeframeMinutes(timeframe));
  
  // Stats by direction
  const callTrades = trades.filter(t => t.direction === 'CALL');
  const putTrades = trades.filter(t => t.direction === 'PUT');
  const callWins = callTrades.filter(t => t.outcome === 'win_t1' || t.outcome === 'win_t2').length;
  const putWins = putTrades.filter(t => t.outcome === 'win_t1' || t.outcome === 'win_t2').length;
  
  // Stats by hour
  const byHour: HistoricalBacktestResult['byHour'] = [];
  for (let h = 9; h <= 16; h++) {
    const hourTrades = trades.filter(t => {
      return estHour(t.entryTime) === h;
    });
    const hourWins = hourTrades.filter(t => t.outcome === 'win_t1' || t.outcome === 'win_t2').length;
    byHour.push({
      hour: h,
      trades: hourTrades.length,
      winRate: hourTrades.length > 0 ? Math.round((hourWins / hourTrades.length) * 1000) / 10 : 0,
    });
  }
  
  // Calculate period
  const evaluatedCandles = candles.filter((candle) =>
    (evaluationWindow?.startTime == null || candle.time >= evaluationWindow.startTime) &&
    (evaluationWindow?.endTime == null || candle.time < evaluationWindow.endTime),
  );
  const firstTime = evaluatedCandles[0]?.time ?? candles[0]?.time ?? 0;
  const lastTime = evaluatedCandles.at(-1)?.time ?? candles.at(-1)?.time ?? 0;
  const days = Math.round((lastTime - firstTime) / (24 * 60 * 60));
  
  return {
    symbol,
    period: `${days} days (${candles.length} bars)`,
    totalBars: candles.length,
    totalSignals: trades.length,
    signalsAnalyzed: trades.length,
    wins: wins.length,
    losses: losses.length,
    scratches: scratches.length,
    winRate: Math.round(winRate * 10) / 10,
    avgWinPct: Math.round(avgWinPct * 100) / 100,
    avgLossPct: Math.round(avgLossPct * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    expectancy: Math.round(expectancy * 100) / 100,
    avgHoldBars: Math.round(avgHoldBars * 10) / 10,
    avgHoldMinutes: Math.round(avgHoldBars * timeframeMinutes(timeframe) * 10) / 10,
    minHoldMinutes: holdMinutes.length > 0 ? Math.min(...holdMinutes) : 0,
    maxHoldMinutes: holdMinutes.length > 0 ? Math.max(...holdMinutes) : 0,
    byDirection: {
      calls: {
        trades: callTrades.length,
        wins: callWins,
        winRate: callTrades.length > 0 ? Math.round((callWins / callTrades.length) * 1000) / 10 : 0,
      },
      puts: {
        trades: putTrades.length,
        wins: putWins,
        winRate: putTrades.length > 0 ? Math.round((putWins / putTrades.length) * 1000) / 10 : 0,
      },
    },
    byHour,
    sampleTrades: trades.slice(-10), // Last 10 trades for inspection
    disclaimer: 'Directional signals use real Yahoo underlying candles. 0DTE returns are an ATM theoretical proxy with constant realized-volatility input and 3% entry/exit spread assumptions, not historical option-chain fills. Past performance does not guarantee future results.',
  };
}

/**
 * Format backtest results for display
 */
export function formatHistoricalBacktest(result: HistoricalBacktestResult): string {
  const lines = [
    '═══════════════════════════════════════════════════════════',
    `  0DTE PROXY BACKTEST: ${result.symbol}`,
    `  Period: ${result.period}`,
    '═══════════════════════════════════════════════════════════',
    '',
    `📊 RESULTS (${result.totalSignals} signals tested):`,
    `   Win Rate: ${result.winRate}%`,
    `   Wins: ${result.wins} | Losses: ${result.losses} | Scratches: ${result.scratches}`,
    `   Avg Win: +${result.avgWinPct}% | Avg Loss: -${result.avgLossPct}%`,
    `   Profit Factor: ${result.profitFactor}x`,
    `   Expectancy: ${result.expectancy >= 0 ? '+' : ''}${result.expectancy}% per trade`,
    `   Avg Hold: ${result.avgHoldBars} bars (${result.avgHoldMinutes} mins; range ${result.minHoldMinutes}-${result.maxHoldMinutes} mins)`,
    '',
    '📈 BY DIRECTION:',
    `   CALLS: ${result.byDirection.calls.winRate}% (${result.byDirection.calls.wins}/${result.byDirection.calls.trades})`,
    `   PUTS:  ${result.byDirection.puts.winRate}% (${result.byDirection.puts.wins}/${result.byDirection.puts.trades})`,
    '',
    '⏰ BY HOUR (EST):',
  ];
  
  for (const h of result.byHour) {
    if (h.trades > 0) {
      const indicator = h.winRate >= 60 ? '🟢' : h.winRate >= 50 ? '🟡' : '🔴';
      lines.push(`   ${h.hour}:00 - ${indicator} ${h.winRate}% (${h.trades} trades)`);
    }
  }
  
  lines.push('');
  lines.push('⚠️ DISCLAIMER:');
  lines.push(`   ${result.disclaimer}`);
  lines.push('═══════════════════════════════════════════════════════════');
  
  return lines.join('\n');
}
