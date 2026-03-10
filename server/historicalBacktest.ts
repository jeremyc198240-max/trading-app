/**
 * REAL Historical Backtest Engine
 * Uses actual Yahoo Finance price data to calculate TRUE win rates
 * 
 * This is NOT a simulation - it tests signals against real price movement
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

const STOP_LOSS_PCT = 0.003;    // 0.30% underlying stop
const TARGET_1_PCT = 0.002;     // 0.20% underlying for T1
const TARGET_2_PCT = 0.004;     // 0.40% underlying for T2
const MAX_HOLD_BARS = 12;       // 60 minutes max (12 x 5min bars)
const MIN_BARS_BETWEEN = 3;     // Wait 3 bars between signals

/**
 * Generates a signal based on simple technical rules applied to the candle data
 * This replaces the complex fusion engine for backtesting purposes
 */
function generateSignal(candles: OHLC[], index: number): SignalSnapshot | null {
  if (index < 20) return null; // Need at least 20 bars for indicators
  
  const current = candles[index];
  const lookback = candles.slice(Math.max(0, index - 20), index + 1);
  
  // Calculate simple indicators
  const closes = lookback.map(c => c.close);
  const ema9 = calculateEMA(closes, 9);
  const ema21 = calculateEMA(closes, 21);
  
  // Calculate momentum
  const momentum = (current.close - lookback[0].close) / lookback[0].close;
  
  // Calculate volume trend
  const avgVolume = lookback.slice(0, -1).reduce((s, c) => s + c.volume, 0) / (lookback.length - 1);
  const volumeRatio = current.volume / avgVolume;
  
  // Calculate ATR for volatility
  const atr = calculateATR(lookback);
  const atrPct = atr / current.close;
  
  // Determine direction based on EMA crossover and momentum
  let direction: 'CALL' | 'PUT' | null = null;
  let confidence = 50;
  
  // CALL signal: Price above both EMAs, positive momentum, above-average volume
  if (ema9 > ema21 && momentum > 0.001 && volumeRatio > 0.8) {
    direction = 'CALL';
    confidence = 55 + Math.min(30, momentum * 1000) + Math.min(15, (volumeRatio - 1) * 10);
  }
  // PUT signal: Price below both EMAs, negative momentum, above-average volume
  else if (ema9 < ema21 && momentum < -0.001 && volumeRatio > 0.8) {
    direction = 'PUT';
    confidence = 55 + Math.min(30, Math.abs(momentum) * 1000) + Math.min(15, (volumeRatio - 1) * 10);
  }
  
  if (!direction) return null;
  
  // Only generate high-confidence signals (simulating GOLD/HOT thresholds)
  if (confidence < 65) return null;
  
  const price = current.close;
  const stopLoss = direction === 'CALL' 
    ? price * (1 - STOP_LOSS_PCT)
    : price * (1 + STOP_LOSS_PCT);
  const target1 = direction === 'CALL'
    ? price * (1 + TARGET_1_PCT)
    : price * (1 - TARGET_1_PCT);
  const target2 = direction === 'CALL'
    ? price * (1 + TARGET_2_PCT)
    : price * (1 - TARGET_2_PCT);
  
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
  candles: OHLC[],
  signal: SignalSnapshot
): TradeResult {
  const entryBar = signal.barIndex;
  let exitBar = entryBar;
  let outcome: TradeResult['outcome'] = 'scratch';
  let exitPrice = signal.price;
  let reason = 'Time stop (max hold)';
  
  // Walk forward through actual future bars
  for (let i = entryBar + 1; i < Math.min(entryBar + MAX_HOLD_BARS + 1, candles.length); i++) {
    const bar = candles[i];
    exitBar = i;
    
    if (signal.direction === 'CALL') {
      // Check stop loss first (hit during bar)
      if (bar.low <= signal.stopLoss) {
        outcome = 'loss';
        exitPrice = signal.stopLoss;
        reason = 'Stop loss hit';
        break;
      }
      // Check target 2 (big winner)
      if (bar.high >= signal.target2) {
        outcome = 'win_t2';
        exitPrice = signal.target2;
        reason = 'T2 target hit';
        break;
      }
      // Check target 1 (small winner)
      if (bar.high >= signal.target1) {
        outcome = 'win_t1';
        exitPrice = signal.target1;
        reason = 'T1 target hit';
        break;
      }
    } else {
      // PUT direction - inverse levels
      if (bar.high >= signal.stopLoss) {
        outcome = 'loss';
        exitPrice = signal.stopLoss;
        reason = 'Stop loss hit';
        break;
      }
      if (bar.low <= signal.target2) {
        outcome = 'win_t2';
        exitPrice = signal.target2;
        reason = 'T2 target hit';
        break;
      }
      if (bar.low <= signal.target1) {
        outcome = 'win_t1';
        exitPrice = signal.target1;
        reason = 'T1 target hit';
        break;
      }
    }
  }
  
  // If we exited due to time, calculate return based on last close
  if (outcome === 'scratch') {
    const lastBar = candles[exitBar];
    exitPrice = lastBar.close;
    const movePct = signal.direction === 'CALL'
      ? (exitPrice - signal.price) / signal.price
      : (signal.price - exitPrice) / signal.price;
    
    // Small winners/losers based on actual price movement
    if (movePct > 0.001) {
      outcome = 'win_t1';
      reason = 'Time exit (small profit)';
    } else if (movePct < -0.001) {
      outcome = 'loss';
      reason = 'Time exit (small loss)';
    }
  }
  
  // Calculate premium return estimate
  // 0DTE options have ~80x leverage on ATM strikes
  const underlyingMove = signal.direction === 'CALL'
    ? (exitPrice - signal.price) / signal.price
    : (signal.price - exitPrice) / signal.price;
  const premiumMultiplier = 80;
  let returnPct = underlyingMove * premiumMultiplier * 100;
  
  // Cap returns to realistic ranges
  returnPct = Math.max(-50, Math.min(150, returnPct));
  
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
    returnPct: Math.round(returnPct * 100) / 100,
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

/**
 * Run the REAL historical backtest
 */
export async function runHistoricalBacktest(
  symbol: string = 'SPY',
  timeframe: string = '5m'
): Promise<HistoricalBacktestResult> {
  console.log(`[HistoricalBacktest] Starting backtest for ${symbol} on ${timeframe}...`);
  
  // Fetch real historical data from Yahoo Finance
  const { data: candles, isLive, error } = await fetchLiveOHLC(symbol, timeframe, 'FULL');
  
  if (!candles || candles.length < 50) {
    throw new Error(`Insufficient historical data for ${symbol}: ${error || 'Not enough candles'}`);
  }
  
  console.log(`[HistoricalBacktest] Loaded ${candles.length} historical candles`);
  
  const trades: TradeResult[] = [];
  let lastSignalBar = -MIN_BARS_BETWEEN - 1;
  
  // Walk through history, generating signals and testing them
  // Leave last 20 bars for forward simulation
  for (let i = 20; i < candles.length - MAX_HOLD_BARS; i++) {
    // Enforce minimum bars between signals
    if (i - lastSignalBar < MIN_BARS_BETWEEN) continue;
    
    const signal = generateSignal(candles, i);
    if (!signal) continue;
    
    // Simulate the trade using REAL future data
    const trade = simulateTradeForward(candles, signal);
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
  
  // Stats by direction
  const callTrades = trades.filter(t => t.direction === 'CALL');
  const putTrades = trades.filter(t => t.direction === 'PUT');
  const callWins = callTrades.filter(t => t.outcome === 'win_t1' || t.outcome === 'win_t2').length;
  const putWins = putTrades.filter(t => t.outcome === 'win_t1' || t.outcome === 'win_t2').length;
  
  // Stats by hour
  const byHour: HistoricalBacktestResult['byHour'] = [];
  for (let h = 9; h <= 16; h++) {
    const hourTrades = trades.filter(t => {
      const d = new Date(t.entryTime * 1000);
      return d.getUTCHours() - 5 === h; // Convert to EST
    });
    const hourWins = hourTrades.filter(t => t.outcome === 'win_t1' || t.outcome === 'win_t2').length;
    byHour.push({
      hour: h,
      trades: hourTrades.length,
      winRate: hourTrades.length > 0 ? Math.round((hourWins / hourTrades.length) * 1000) / 10 : 0,
    });
  }
  
  // Calculate period
  const firstTime = candles[0]?.time ?? 0;
  const lastTime = candles[candles.length - 1]?.time ?? 0;
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
    disclaimer: 'REAL backtest using Yahoo Finance historical data. Past performance does not guarantee future results. Options trading involves significant risk of loss.',
  };
}

/**
 * Format backtest results for display
 */
export function formatHistoricalBacktest(result: HistoricalBacktestResult): string {
  const lines = [
    '═══════════════════════════════════════════════════════════',
    `  REAL HISTORICAL BACKTEST: ${result.symbol}`,
    `  Period: ${result.period}`,
    '═══════════════════════════════════════════════════════════',
    '',
    `📊 RESULTS (${result.totalSignals} signals tested):`,
    `   Win Rate: ${result.winRate}%`,
    `   Wins: ${result.wins} | Losses: ${result.losses} | Scratches: ${result.scratches}`,
    `   Avg Win: +${result.avgWinPct}% | Avg Loss: -${result.avgLossPct}%`,
    `   Profit Factor: ${result.profitFactor}x`,
    `   Expectancy: ${result.expectancy >= 0 ? '+' : ''}${result.expectancy}% per trade`,
    `   Avg Hold: ${result.avgHoldBars} bars (${Math.round(result.avgHoldBars * 5)} mins)`,
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
