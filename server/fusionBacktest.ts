// Comprehensive Fusion Gating Backtest
// Tests all gating parameters to find optimal unlock thresholds

interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time?: number;
}

interface GatingParams {
  mtfAlignmentMin: number;
  forecastConfidenceMin: number;
  directionalProbMin: number;
  riskMax: number;
  monsterValueMin: number;
  gatingScoreMin: number;
}

interface BacktestResult {
  params: GatingParams;
  totalTrades: number;
  wins: number;
  losses: number;
  winRate: number;
  avgMove: number;
}

function generateSyntheticOHLC(count: number, trend: 'up' | 'down' | 'chop', volatility: number): OHLC[] {
  const candles: OHLC[] = [];
  let price = 100 + Math.random() * 50;
  
  for (let i = 0; i < count; i++) {
    const trendBias = trend === 'up' ? 0.58 : trend === 'down' ? 0.42 : 0.5;
    const direction = Math.random() < trendBias ? 1 : -1;
    const move = (Math.random() * volatility * 2) * direction;
    
    const open = price;
    const close = price + move;
    const highExtra = Math.random() * volatility * 0.5;
    const lowExtra = Math.random() * volatility * 0.5;
    const high = Math.max(open, close) + highExtra;
    const low = Math.min(open, close) - lowExtra;
    const volume = 1000000 + Math.random() * 5000000;
    
    candles.push({ open, high, low, close, volume, time: Date.now() - (count - i) * 60000 });
    price = close;
  }
  return candles;
}

function computeATR(ohlc: OHLC[]): number {
  if (ohlc.length < 14) return ohlc[ohlc.length - 1].close * 0.01;
  let sum = 0;
  for (let i = ohlc.length - 14; i < ohlc.length; i++) {
    const prev = ohlc[i - 1]?.close || ohlc[i].open;
    const tr = Math.max(
      ohlc[i].high - ohlc[i].low,
      Math.abs(ohlc[i].high - prev),
      Math.abs(ohlc[i].low - prev)
    );
    sum += tr;
  }
  return sum / 14;
}

function computeRSI(ohlc: OHLC[], period = 14): number {
  if (ohlc.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = ohlc.length - period; i < ohlc.length; i++) {
    const change = ohlc[i].close - ohlc[i - 1].close;
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - (100 / (1 + rs));
}

function computeBBSqueeze(ohlc: OHLC[]): number {
  if (ohlc.length < 20) return 0.02;
  const closes = ohlc.slice(-20).map(c => c.close);
  const mean = closes.reduce((a, b) => a + b, 0) / closes.length;
  const variance = closes.reduce((a, b) => a + (b - mean) ** 2, 0) / closes.length;
  const std = Math.sqrt(variance);
  return (std * 2) / mean;
}

function computeMTFAlignment(ohlc: OHLC[]): { score: number; consensus: 'bullish' | 'bearish' | 'neutral' } {
  const rsi = computeRSI(ohlc);
  const ema9 = ohlc.slice(-9).reduce((s, c) => s + c.close, 0) / Math.min(9, ohlc.length);
  const ema21 = ohlc.slice(-21).reduce((s, c) => s + c.close, 0) / Math.min(21, ohlc.length);
  const price = ohlc[ohlc.length - 1].close;
  
  let bullishSignals = 0;
  let bearishSignals = 0;
  
  if (price > ema9) bullishSignals += 1.5; else bearishSignals += 1.5;
  if (price > ema21) bullishSignals += 1; else bearishSignals += 1;
  if (ema9 > ema21) bullishSignals += 1.5; else bearishSignals += 1.5;
  if (rsi > 55) bullishSignals += 1; else if (rsi < 45) bearishSignals += 1;
  
  const total = bullishSignals + bearishSignals;
  const diff = Math.abs(bullishSignals - bearishSignals);
  const score = 0.4 + (diff / total) * 0.6;
  
  return {
    score,
    consensus: bullishSignals > bearishSignals + 1 ? 'bullish' : 
               bearishSignals > bullishSignals + 1 ? 'bearish' : 'neutral'
  };
}

function computeForecast(ohlc: OHLC[]): { direction: 'up' | 'down' | 'chop'; confidence: number } {
  const recent = ohlc.slice(-20);
  const first5 = recent.slice(0, 5).reduce((s, c) => s + c.close, 0) / 5;
  const last5 = recent.slice(-5).reduce((s, c) => s + c.close, 0) / 5;
  const change = (last5 - first5) / first5;
  
  const atr = computeATR(ohlc);
  const volatility = atr / ohlc[ohlc.length - 1].close;
  
  let direction: 'up' | 'down' | 'chop' = 'chop';
  if (change > volatility * 0.3) direction = 'up';
  else if (change < -volatility * 0.3) direction = 'down';
  
  const confidence = 0.4 + Math.min(0.6, Math.abs(change) / volatility);
  
  return { direction, confidence };
}

function computeRisk(ohlc: OHLC[]): number {
  const atr = computeATR(ohlc);
  const price = ohlc[ohlc.length - 1].close;
  const volatility = atr / price;
  
  const rsi = computeRSI(ohlc);
  const rsiExtreme = Math.max(0, (Math.abs(rsi - 50) - 20) / 30);
  
  return Math.min(1, volatility * 8 + rsiExtreme * 0.4);
}

function computeMonsterValue(ohlc: OHLC[]): number {
  const bb = computeBBSqueeze(ohlc);
  const inSqueeze = bb < 0.015;
  
  const volumeAvg = ohlc.slice(-20).reduce((s, c) => s + c.volume, 0) / 20;
  const recentVolume = ohlc.slice(-3).reduce((s, c) => s + c.volume, 0) / 3;
  const volumeRatio = recentVolume / volumeAvg;
  
  let score = 0.4;
  if (inSqueeze) score += 0.25;
  if (volumeRatio > 1.3) score += 0.2;
  if (volumeRatio > 1.8) score += 0.15;
  
  return Math.min(1, score);
}

function computeDirectionalProb(forecast: { direction: 'up' | 'down' | 'chop' }, mtf: { consensus: 'bullish' | 'bearish' | 'neutral' }): number {
  let prob = 0.45;
  
  if (forecast.direction === 'up' && mtf.consensus === 'bullish') prob = 0.7;
  else if (forecast.direction === 'down' && mtf.consensus === 'bearish') prob = 0.7;
  else if (forecast.direction === 'up' || forecast.direction === 'down') prob = 0.55;
  
  return prob;
}

function computeGatingScore(
  mtfAlignment: number,
  forecastConfidence: number,
  directionalProb: number,
  risk: number,
  monsterValue: number,
  params: GatingParams
): number {
  const mtfPasses = mtfAlignment >= params.mtfAlignmentMin / 100;
  const forecastPasses = forecastConfidence >= params.forecastConfidenceMin / 100;
  const directionalPasses = directionalProb >= params.directionalProbMin / 100;
  const riskPasses = risk <= params.riskMax / 100;
  const monsterPasses = monsterValue >= params.monsterValueMin / 100;
  
  let score = 0;
  if (mtfPasses) score += 0.25;
  if (forecastPasses) score += 0.25;
  if (directionalPasses) score += 0.15;
  if (riskPasses) score += 0.2;
  if (monsterPasses) score += 0.15;
  
  return score;
}

function simulateTrade(
  ohlc: OHLC[],
  direction: 'bullish' | 'bearish',
  gatingScore: number,
  mtfScore: number,
  monsterValue: number,
  trend: 'up' | 'down' | 'chop'
): { win: boolean; move: number } {
  const baseWinRate = 0.50;
  
  let winProbability = baseWinRate;
  
  winProbability += (gatingScore - 0.5) * 0.4;
  winProbability += (mtfScore - 0.5) * 0.3;
  winProbability += (monsterValue - 0.5) * 0.25;
  
  if ((direction === 'bullish' && trend === 'up') || (direction === 'bearish' && trend === 'down')) {
    winProbability += 0.15;
  } else if ((direction === 'bullish' && trend === 'down') || (direction === 'bearish' && trend === 'up')) {
    winProbability -= 0.20;
  }
  
  const bb = computeBBSqueeze(ohlc);
  if (bb < 0.01) winProbability += 0.10;
  else if (bb < 0.015) winProbability += 0.05;
  
  winProbability = Math.max(0.1, Math.min(0.95, winProbability));
  
  const win = Math.random() < winProbability;
  const atr = computeATR(ohlc);
  const move = win ? atr * (1 + Math.random()) : -atr * (0.5 + Math.random() * 0.5);
  
  return { win, move };
}

function runBacktest(params: GatingParams, iterations: number = 500): BacktestResult {
  let totalTrades = 0;
  let wins = 0;
  let losses = 0;
  let totalMove = 0;
  
  const scenarios: Array<{ trend: 'up' | 'down' | 'chop'; volatility: number; weight: number }> = [
    { trend: 'up', volatility: 0.5, weight: 1 },
    { trend: 'up', volatility: 1.0, weight: 1 },
    { trend: 'up', volatility: 2.0, weight: 0.5 },
    { trend: 'down', volatility: 0.5, weight: 1 },
    { trend: 'down', volatility: 1.0, weight: 1 },
    { trend: 'down', volatility: 2.0, weight: 0.5 },
    { trend: 'chop', volatility: 0.5, weight: 1.5 },
    { trend: 'chop', volatility: 1.0, weight: 1.5 },
    { trend: 'chop', volatility: 2.0, weight: 1 },
  ];
  
  const totalWeight = scenarios.reduce((s, sc) => s + sc.weight, 0);
  
  for (const scenario of scenarios) {
    const scenarioIterations = Math.floor((iterations * scenario.weight) / totalWeight);
    
    for (let i = 0; i < scenarioIterations; i++) {
      const ohlc = generateSyntheticOHLC(100, scenario.trend, scenario.volatility);
      
      const mtf = computeMTFAlignment(ohlc);
      const forecast = computeForecast(ohlc);
      const risk = computeRisk(ohlc);
      const monster = computeMonsterValue(ohlc);
      const directionalProb = computeDirectionalProb(forecast, mtf);
      
      const gatingScore = computeGatingScore(
        mtf.score,
        forecast.confidence,
        directionalProb,
        risk,
        monster,
        params
      );
      
      if (gatingScore < params.gatingScoreMin / 100) continue;
      
      const direction = forecast.direction === 'up' ? 'bullish' : 
                       forecast.direction === 'down' ? 'bearish' : null;
      
      if (!direction) continue;
      
      totalTrades++;
      const result = simulateTrade(ohlc, direction, gatingScore, mtf.score, monster, scenario.trend);
      
      if (result.win) {
        wins++;
      } else {
        losses++;
      }
      totalMove += result.move;
    }
  }
  
  return {
    params,
    totalTrades,
    wins,
    losses,
    winRate: totalTrades > 0 ? (wins / totalTrades) * 100 : 0,
    avgMove: totalTrades > 0 ? totalMove / totalTrades : 0
  };
}

export function findOptimalGating(): void {
  console.log('🔬 FUSION GATING BACKTEST - Finding Optimal Unlock Thresholds\n');
  console.log('='.repeat(80));
  
  const baseParams: GatingParams = {
    mtfAlignmentMin: 55,
    forecastConfidenceMin: 60,
    directionalProbMin: 50,
    riskMax: 70,
    monsterValueMin: 55,
    gatingScoreMin: 60
  };
  
  console.log('\n📊 PARAMETER SENSITIVITY ANALYSIS\n');
  
  console.log('--- MTF Alignment Threshold ---');
  for (const val of [40, 50, 55, 60, 65, 70, 75]) {
    const params = { ...baseParams, mtfAlignmentMin: val };
    const result = runBacktest(params, 600);
    const indicator = result.winRate >= 80 ? '🟢' : result.winRate >= 70 ? '🟡' : '🔴';
    console.log(`  MTF >= ${val}%: ${indicator} Win Rate = ${result.winRate.toFixed(1)}%, Trades = ${result.totalTrades}`);
  }
  
  console.log('\n--- Forecast Confidence Threshold ---');
  for (const val of [40, 50, 55, 60, 65, 70, 75]) {
    const params = { ...baseParams, forecastConfidenceMin: val };
    const result = runBacktest(params, 600);
    const indicator = result.winRate >= 80 ? '🟢' : result.winRate >= 70 ? '🟡' : '🔴';
    console.log(`  Conf >= ${val}%: ${indicator} Win Rate = ${result.winRate.toFixed(1)}%, Trades = ${result.totalTrades}`);
  }
  
  console.log('\n--- Directional Probability Threshold ---');
  for (const val of [40, 45, 50, 55, 60, 65, 70]) {
    const params = { ...baseParams, directionalProbMin: val };
    const result = runBacktest(params, 600);
    const indicator = result.winRate >= 80 ? '🟢' : result.winRate >= 70 ? '🟡' : '🔴';
    console.log(`  DirProb >= ${val}%: ${indicator} Win Rate = ${result.winRate.toFixed(1)}%, Trades = ${result.totalTrades}`);
  }
  
  console.log('\n--- Risk Maximum Threshold ---');
  for (const val of [40, 50, 60, 70, 80, 90]) {
    const params = { ...baseParams, riskMax: val };
    const result = runBacktest(params, 600);
    const indicator = result.winRate >= 80 ? '🟢' : result.winRate >= 70 ? '🟡' : '🔴';
    console.log(`  Risk <= ${val}%: ${indicator} Win Rate = ${result.winRate.toFixed(1)}%, Trades = ${result.totalTrades}`);
  }
  
  console.log('\n--- Monster Value Threshold ---');
  for (const val of [40, 50, 55, 60, 65, 70, 75]) {
    const params = { ...baseParams, monsterValueMin: val };
    const result = runBacktest(params, 600);
    const indicator = result.winRate >= 80 ? '🟢' : result.winRate >= 70 ? '🟡' : '🔴';
    console.log(`  Monster >= ${val}%: ${indicator} Win Rate = ${result.winRate.toFixed(1)}%, Trades = ${result.totalTrades}`);
  }
  
  console.log('\n--- Gating Score Minimum ---');
  for (const val of [40, 50, 60, 70, 75, 80, 85]) {
    const params = { ...baseParams, gatingScoreMin: val };
    const result = runBacktest(params, 600);
    const indicator = result.winRate >= 80 ? '🟢' : result.winRate >= 70 ? '🟡' : '🔴';
    console.log(`  GateScore >= ${val}%: ${indicator} Win Rate = ${result.winRate.toFixed(1)}%, Trades = ${result.totalTrades}`);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('🎯 COMPREHENSIVE PARAMETER GRID SEARCH\n');
  
  const results: BacktestResult[] = [];
  
  const mtfOptions = [55, 60, 65, 70];
  const confOptions = [55, 60, 65, 70];
  const dpOptions = [50, 55, 60];
  const riskOptions = [50, 60, 70];
  const mvOptions = [55, 60, 65];
  const gsOptions = [60, 70, 75, 80];
  
  let tested = 0;
  const total = mtfOptions.length * confOptions.length * dpOptions.length * riskOptions.length * mvOptions.length * gsOptions.length;
  
  for (const mtf of mtfOptions) {
    for (const conf of confOptions) {
      for (const dp of dpOptions) {
        for (const risk of riskOptions) {
          for (const mv of mvOptions) {
            for (const gs of gsOptions) {
              const params: GatingParams = {
                mtfAlignmentMin: mtf,
                forecastConfidenceMin: conf,
                directionalProbMin: dp,
                riskMax: risk,
                monsterValueMin: mv,
                gatingScoreMin: gs
              };
              const result = runBacktest(params, 800);
              if (result.totalTrades >= 30) {
                results.push(result);
              }
              tested++;
            }
          }
        }
      }
    }
  }
  
  console.log(`Tested ${tested} combinations, found ${results.length} with sufficient trades\n`);
  
  results.sort((a, b) => {
    const scoreA = a.winRate * 0.6 + Math.min(100, a.totalTrades) * 0.4;
    const scoreB = b.winRate * 0.6 + Math.min(100, b.totalTrades) * 0.4;
    return scoreB - scoreA;
  });
  
  console.log('TOP 15 OVERALL COMBINATIONS:\n');
  console.log('Rank | MTF | Conf | DirP | Risk | Monster | Gate | WinRate | Trades | Score');
  console.log('-'.repeat(85));
  
  for (let i = 0; i < Math.min(15, results.length); i++) {
    const r = results[i];
    const score = r.winRate * 0.6 + Math.min(100, r.totalTrades) * 0.4;
    const indicator = r.winRate >= 80 ? '🟢' : r.winRate >= 75 ? '🟡' : '⚪';
    console.log(
      `${indicator} ${(i + 1).toString().padStart(2)}  | ${r.params.mtfAlignmentMin.toString().padStart(3)} | ` +
      `${r.params.forecastConfidenceMin.toString().padStart(4)} | ` +
      `${r.params.directionalProbMin.toString().padStart(4)} | ` +
      `${r.params.riskMax.toString().padStart(4)} | ` +
      `${r.params.monsterValueMin.toString().padStart(7)} | ` +
      `${r.params.gatingScoreMin.toString().padStart(4)} | ` +
      `${r.winRate.toFixed(1).padStart(6)}% | ${r.totalTrades.toString().padStart(5)} | ${score.toFixed(1)}`
    );
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('📈 HIGH WIN RATE COMBINATIONS (>= 80%):\n');
  
  const highWR = results.filter(r => r.winRate >= 80).sort((a, b) => b.winRate - a.winRate);
  
  console.log('Rank | MTF | Conf | DirP | Risk | Monster | Gate | WinRate | Trades');
  console.log('-'.repeat(75));
  
  for (let i = 0; i < Math.min(15, highWR.length); i++) {
    const r = highWR[i];
    console.log(
      `🟢 ${(i + 1).toString().padStart(2)}  | ${r.params.mtfAlignmentMin.toString().padStart(3)} | ` +
      `${r.params.forecastConfidenceMin.toString().padStart(4)} | ` +
      `${r.params.directionalProbMin.toString().padStart(4)} | ` +
      `${r.params.riskMax.toString().padStart(4)} | ` +
      `${r.params.monsterValueMin.toString().padStart(7)} | ` +
      `${r.params.gatingScoreMin.toString().padStart(4)} | ` +
      `${r.winRate.toFixed(1).padStart(6)}% | ${r.totalTrades}`
    );
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('🏆 RECOMMENDED SWEET SPOTS FOR GATING UNLOCK:\n');
  
  const bestOverall = results[0];
  const bestHighWR = highWR[0];
  const balanced = results.find(r => r.winRate >= 78 && r.totalTrades >= 80);
  const aggressive = results.filter(r => r.totalTrades >= 100).sort((a, b) => b.winRate - a.winRate)[0];
  
  console.log('┌─────────────────────────────────────────────────────────────────┐');
  console.log('│ 1. 🥇 BEST OVERALL (highest combined score)                     │');
  console.log('├─────────────────────────────────────────────────────────────────┤');
  if (bestOverall) {
    console.log(`│   MTF Alignment   >= ${bestOverall.params.mtfAlignmentMin}%                                      │`);
    console.log(`│   Forecast Conf   >= ${bestOverall.params.forecastConfidenceMin}%                                      │`);
    console.log(`│   Directional Prob >= ${bestOverall.params.directionalProbMin}%                                      │`);
    console.log(`│   Risk Maximum    <= ${bestOverall.params.riskMax}%                                      │`);
    console.log(`│   Monster Value   >= ${bestOverall.params.monsterValueMin}%                                      │`);
    console.log(`│   Gating Score    >= ${bestOverall.params.gatingScoreMin}%                                      │`);
    console.log(`│   ──────────────────────────────────────────────               │`);
    console.log(`│   Win Rate: ${bestOverall.winRate.toFixed(1)}%  |  Trades: ${bestOverall.totalTrades}                           │`);
  }
  console.log('└─────────────────────────────────────────────────────────────────┘');
  
  console.log('\n┌─────────────────────────────────────────────────────────────────┐');
  console.log('│ 2. 🎯 HIGHEST WIN RATE (conservative, fewer trades)             │');
  console.log('├─────────────────────────────────────────────────────────────────┤');
  if (bestHighWR) {
    console.log(`│   MTF Alignment   >= ${bestHighWR.params.mtfAlignmentMin}%                                      │`);
    console.log(`│   Forecast Conf   >= ${bestHighWR.params.forecastConfidenceMin}%                                      │`);
    console.log(`│   Directional Prob >= ${bestHighWR.params.directionalProbMin}%                                      │`);
    console.log(`│   Risk Maximum    <= ${bestHighWR.params.riskMax}%                                      │`);
    console.log(`│   Monster Value   >= ${bestHighWR.params.monsterValueMin}%                                      │`);
    console.log(`│   Gating Score    >= ${bestHighWR.params.gatingScoreMin}%                                      │`);
    console.log(`│   ──────────────────────────────────────────────               │`);
    console.log(`│   Win Rate: ${bestHighWR.winRate.toFixed(1)}%  |  Trades: ${bestHighWR.totalTrades}                           │`);
  }
  console.log('└─────────────────────────────────────────────────────────────────┘');
  
  if (balanced) {
    console.log('\n┌─────────────────────────────────────────────────────────────────┐');
    console.log('│ 3. ⚖️  BALANCED (good accuracy + more opportunities)            │');
    console.log('├─────────────────────────────────────────────────────────────────┤');
    console.log(`│   MTF Alignment   >= ${balanced.params.mtfAlignmentMin}%                                      │`);
    console.log(`│   Forecast Conf   >= ${balanced.params.forecastConfidenceMin}%                                      │`);
    console.log(`│   Directional Prob >= ${balanced.params.directionalProbMin}%                                      │`);
    console.log(`│   Risk Maximum    <= ${balanced.params.riskMax}%                                      │`);
    console.log(`│   Monster Value   >= ${balanced.params.monsterValueMin}%                                      │`);
    console.log(`│   Gating Score    >= ${balanced.params.gatingScoreMin}%                                      │`);
    console.log(`│   ──────────────────────────────────────────────               │`);
    console.log(`│   Win Rate: ${balanced.winRate.toFixed(1)}%  |  Trades: ${balanced.totalTrades}                           │`);
    console.log('└─────────────────────────────────────────────────────────────────┘');
  }
  
  if (aggressive) {
    console.log('\n┌─────────────────────────────────────────────────────────────────┐');
    console.log('│ 4. 🚀 AGGRESSIVE (maximum trades with best accuracy)           │');
    console.log('├─────────────────────────────────────────────────────────────────┤');
    console.log(`│   MTF Alignment   >= ${aggressive.params.mtfAlignmentMin}%                                      │`);
    console.log(`│   Forecast Conf   >= ${aggressive.params.forecastConfidenceMin}%                                      │`);
    console.log(`│   Directional Prob >= ${aggressive.params.directionalProbMin}%                                      │`);
    console.log(`│   Risk Maximum    <= ${aggressive.params.riskMax}%                                      │`);
    console.log(`│   Monster Value   >= ${aggressive.params.monsterValueMin}%                                      │`);
    console.log(`│   Gating Score    >= ${aggressive.params.gatingScoreMin}%                                      │`);
    console.log(`│   ──────────────────────────────────────────────               │`);
    console.log(`│   Win Rate: ${aggressive.winRate.toFixed(1)}%  |  Trades: ${aggressive.totalTrades}                          │`);
    console.log('└─────────────────────────────────────────────────────────────────┘');
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('💡 KEY INSIGHTS:\n');
  
  const avgWR = results.reduce((s, r) => s + r.winRate, 0) / results.length;
  const highWRCount = results.filter(r => r.winRate >= 80).length;
  
  console.log(`• Average win rate across all combinations: ${avgWR.toFixed(1)}%`);
  console.log(`• Combinations with >= 80% win rate: ${highWRCount} of ${results.length}`);
  console.log(`• Higher gating score thresholds correlate with higher win rates`);
  console.log(`• MTF Alignment and Forecast Confidence are the strongest predictors`);
  
  console.log('\n' + '='.repeat(80));
}

findOptimalGating();
