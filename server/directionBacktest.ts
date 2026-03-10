// Backtest the multi-factor direction analysis for 0DTE trades
// Using correlation-based simulation

interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

function generateScenario(
  trend: 'up' | 'down' | 'chop',
  volatility: number,
  count: number
): { history: OHLC[]; future: OHLC[]; actualTrend: 'up' | 'down' } {
  const candles: OHLC[] = [];
  let price = 100 + Math.random() * 400;
  
  // Generate history
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
    
    candles.push({ open, high, low, close, volume });
    price = close;
  }
  
  // Generate 6 future bars (simulating 0DTE hold period)
  const future: OHLC[] = [];
  const futureTrendBias = trend === 'up' ? 0.6 : trend === 'down' ? 0.4 : 0.5;
  
  for (let i = 0; i < 6; i++) {
    const direction = Math.random() < futureTrendBias ? 1 : -1;
    const move = (Math.random() * volatility * 2) * direction;
    
    const open = price;
    const close = price + move;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    
    future.push({ open, high, low, close, volume: 1000000 });
    price = close;
  }
  
  // Determine actual trend from future
  const futureMove = (future[future.length - 1].close - candles[candles.length - 1].close) / candles[candles.length - 1].close;
  const actualTrend = futureMove > 0.001 ? 'up' : futureMove < -0.001 ? 'down' : (Math.random() > 0.5 ? 'up' : 'down');
  
  return { history: candles, future, actualTrend };
}

function analyzeDirection(ohlc: OHLC[]): { direction: 'CALL' | 'PUT'; bullishScore: number; signals: string[] } {
  const last = ohlc[ohlc.length - 1];
  const closes = ohlc.slice(-20).map(c => c.close);
  
  // 1. EMA trend (9 vs 21)
  const ema9 = closes.slice(-9).reduce((a, b) => a + b, 0) / 9;
  const ema21 = closes.reduce((a, b) => a + b, 0) / closes.length;
  const emaBullish = ema9 > ema21;
  
  // 2. Recent momentum (last 5 vs prev 5)
  const last5Avg = closes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const prev5Avg = closes.slice(-10, -5).reduce((a, b) => a + b, 0) / 5;
  const momentumBullish = last5Avg > prev5Avg;
  
  // 3. Price vs range
  const rangeHigh = Math.max(...ohlc.slice(-20).map(c => c.high));
  const rangeLow = Math.min(...ohlc.slice(-20).map(c => c.low));
  const rangeMid = (rangeHigh + rangeLow) / 2;
  const priceAboveMid = last.close > rangeMid;
  
  // 4. Recent candle direction (last 3 closes)
  const recentCloses = closes.slice(-3);
  const upCandles = recentCloses.filter((c, i) => i > 0 && c > recentCloses[i - 1]).length;
  const recentBullish = upCandles >= 2;
  
  // Score direction
  let bullishScore = 0;
  const signals: string[] = [];
  
  if (emaBullish) { bullishScore++; signals.push('EMA9>21'); }
  if (momentumBullish) { bullishScore++; signals.push('momentum↑'); }
  if (priceAboveMid) { bullishScore++; signals.push('above mid'); }
  if (recentBullish) { bullishScore++; signals.push('candles↑'); }
  
  const direction = bullishScore >= 3 ? 'CALL' : 'PUT';
  
  return { direction, bullishScore, signals };
}

function runBacktest() {
  console.log('🔬 MULTI-FACTOR DIRECTION ANALYSIS BACKTEST\n');
  console.log('='.repeat(70));
  console.log('Testing: Does the 4-factor analysis correctly predict future direction?\n');
  
  const scenarios = [
    { trend: 'up' as const, volatility: 0.5, name: 'Uptrend Low Vol' },
    { trend: 'up' as const, volatility: 1.0, name: 'Uptrend Med Vol' },
    { trend: 'up' as const, volatility: 2.0, name: 'Uptrend High Vol' },
    { trend: 'down' as const, volatility: 0.5, name: 'Downtrend Low Vol' },
    { trend: 'down' as const, volatility: 1.0, name: 'Downtrend Med Vol' },
    { trend: 'down' as const, volatility: 2.0, name: 'Downtrend High Vol' },
    { trend: 'chop' as const, volatility: 0.5, name: 'Chop Low Vol' },
    { trend: 'chop' as const, volatility: 1.0, name: 'Chop Med Vol' },
    { trend: 'chop' as const, volatility: 2.0, name: 'Chop High Vol' },
  ];
  
  const iterationsPerScenario = 300;
  
  let totalTrades = 0;
  let directionCorrect = 0;
  let strongSignalTrades = 0;
  let strongSignalCorrect = 0;
  
  const results: { scenario: string; correct: number; total: number; accuracy: number }[] = [];
  
  console.log('📊 DIRECTION ACCURACY BY SCENARIO:\n');
  console.log('Scenario             | Correct | Total | Accuracy | Strong Signal');
  console.log('-'.repeat(70));
  
  for (const scenario of scenarios) {
    let scenarioCorrect = 0;
    let scenarioTotal = 0;
    let scenarioStrongCorrect = 0;
    let scenarioStrongTotal = 0;
    
    for (let i = 0; i < iterationsPerScenario; i++) {
      const { history, future, actualTrend } = generateScenario(scenario.trend, scenario.volatility, 100);
      const { direction, bullishScore } = analyzeDirection(history);
      
      scenarioTotal++;
      totalTrades++;
      
      // Check if direction prediction matches actual future trend
      const predictedUp = direction === 'CALL';
      const actualUp = actualTrend === 'up';
      const isCorrect = predictedUp === actualUp;
      
      if (isCorrect) {
        scenarioCorrect++;
        directionCorrect++;
      }
      
      // Strong signals: 4/4 bullish or 0/4 bullish (all factors agree)
      const isStrongSignal = bullishScore === 4 || bullishScore === 0;
      if (isStrongSignal) {
        strongSignalTrades++;
        scenarioStrongTotal++;
        if (isCorrect) {
          strongSignalCorrect++;
          scenarioStrongCorrect++;
        }
      }
    }
    
    const accuracy = scenarioTotal > 0 ? (scenarioCorrect / scenarioTotal * 100) : 0;
    const strongAccuracy = scenarioStrongTotal > 0 ? (scenarioStrongCorrect / scenarioStrongTotal * 100) : 0;
    results.push({ scenario: scenario.name, correct: scenarioCorrect, total: scenarioTotal, accuracy });
    
    const indicator = accuracy >= 70 ? '🟢' : accuracy >= 55 ? '🟡' : '🔴';
    console.log(
      `${indicator} ${scenario.name.padEnd(18)} | ${scenarioCorrect.toString().padStart(7)} | ${scenarioTotal.toString().padStart(5)} | ` +
      `${accuracy.toFixed(1).padStart(6)}% | ${strongAccuracy.toFixed(1)}% (n=${scenarioStrongTotal})`
    );
  }
  
  console.log('\n' + '='.repeat(70));
  console.log('📈 OVERALL RESULTS:\n');
  
  const overallAccuracy = totalTrades > 0 ? (directionCorrect / totalTrades * 100) : 0;
  const strongAccuracy = strongSignalTrades > 0 ? (strongSignalCorrect / strongSignalTrades * 100) : 0;
  
  console.log(`Total Predictions:    ${totalTrades}`);
  console.log(`Correct Predictions:  ${directionCorrect}`);
  console.log(`Overall Accuracy:     ${overallAccuracy.toFixed(1)}%`);
  console.log('');
  console.log(`Strong Signals (4/4 or 0/4 factors):`);
  console.log(`  Total:              ${strongSignalTrades}`);
  console.log(`  Correct:            ${strongSignalCorrect}`);
  console.log(`  Accuracy:           ${strongAccuracy.toFixed(1)}%`);
  
  console.log('\n' + '='.repeat(70));
  console.log('🎯 ACCURACY BY MARKET CONDITION:\n');
  
  const uptrend = results.filter(r => r.scenario.includes('Uptrend'));
  const downtrend = results.filter(r => r.scenario.includes('Downtrend'));
  const chop = results.filter(r => r.scenario.includes('Chop'));
  
  const calcGroupRate = (group: typeof results) => {
    const correct = group.reduce((s, r) => s + r.correct, 0);
    const total = group.reduce((s, r) => s + r.total, 0);
    return total > 0 ? (correct / total * 100) : 0;
  };
  
  console.log(`Uptrend conditions:   ${calcGroupRate(uptrend).toFixed(1)}% accuracy`);
  console.log(`Downtrend conditions: ${calcGroupRate(downtrend).toFixed(1)}% accuracy`);
  console.log(`Choppy conditions:    ${calcGroupRate(chop).toFixed(1)}% accuracy`);
  
  console.log('\n' + '='.repeat(70));
  console.log('💡 ANALYSIS:\n');
  
  if (overallAccuracy >= 65) {
    console.log('✅ Multi-factor direction analysis shows STRONG accuracy');
  } else if (overallAccuracy >= 55) {
    console.log('⚠️ Multi-factor direction analysis shows MODERATE accuracy');
    console.log('   This is expected - markets are inherently unpredictable');
  } else {
    console.log('❌ Multi-factor direction analysis is near random (50%)');
  }
  
  if (strongAccuracy > overallAccuracy + 5) {
    console.log(`\n🎯 Strong signals (all factors aligned) are ${(strongAccuracy - overallAccuracy).toFixed(1)}% MORE accurate!`);
    console.log(`   Recommendation: Only trade when ALL 4 factors agree`);
  }
  
  // Best performing scenario
  const best = results.reduce((a, b) => a.accuracy > b.accuracy ? a : b);
  console.log(`\n🏆 Best scenario: ${best.scenario} (${best.accuracy.toFixed(1)}% accuracy)`);
  
  console.log('\n' + '='.repeat(70));
  console.log('📝 NOTE: 55-65% accuracy is GOOD for directional prediction.');
  console.log('   Combined with proper risk management (1:2 R:R), this yields profit.');
  console.log('   The key is filtering for high-confidence setups only.');
  console.log('='.repeat(70));
}

runBacktest();
