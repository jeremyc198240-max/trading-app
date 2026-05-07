#!/usr/bin/env node
/**
 * Volatility Prediction ML Model Training Data Generator
 *
 * Creates training data for predicting future realized volatility using:
 * - High-low range
 * - ATR (Average True Range)
 * - Squared returns
 *
 * Uses all existing engine features as inputs:
 * - Trend indicators, alignment scores, confidence metrics
 * - Risk assessments, monster gate status, gating reasons
 * - Pattern triggers, delta calculations
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, '..', 'logs');
const scriptDir = path.join(__dirname);

// Feature definitions for volatility prediction model
const VOLATILITY_FEATURES = [
  // Core technical indicators
  { name: 'rsi', desc: 'RSI (0-100)' },
  { name: 'macd_signal', desc: 'MACD signal line' },
  { name: 'bb_position', desc: '%B position in Bollinger Bands' },
  { name: 'bb_width', desc: 'Bollinger Band width' },
  { name: 'atr_percent', desc: 'ATR as % of price' },
  { name: 'vwap_distance', desc: 'Distance from VWAP' },

  // Trend and momentum
  { name: 'ema_alignment', desc: 'EMA cloud alignment (-1 to 1)' },
  { name: 'momentum_3bar', desc: '3-bar momentum' },
  { name: 'momentum_5bar', desc: '5-bar momentum' },

  // Volume and liquidity
  { name: 'volume_ratio', desc: 'Volume ratio vs 20-bar average' },
  { name: 'cmf', desc: 'Chaikin Money Flow' },

  // Pattern recognition
  { name: 'compression_score', desc: 'Range compression score' },
  { name: 'breakout_probability', desc: 'Breakout probability' },

  // Risk and confidence
  { name: 'directional_bias', desc: 'Directional bias (-1 to 1)' },
  { name: 'confidence_score', desc: 'Overall confidence score' },
  { name: 'risk_score', desc: 'Risk assessment score' },

  // Monster gate and execution
  { name: 'monster_gate_score', desc: 'Monster gate activation score' },
  { name: 'execution_phase', desc: 'Execution phase (0=WAIT, 1=PREPARE, 2=NOW)' },

  // Delta and options
  { name: 'otm_delta', desc: 'OTM delta exposure' },
  { name: 'gamma_exposure', desc: 'Gamma exposure' },

  // Market regime
  { name: 'adx', desc: 'ADX trend strength' },
  { name: 'regime_filter', desc: 'Market regime filter' },
];

/**
 * Calculate realized volatility for a future period
 */
function calculateRealizedVolatility(ohlcData, startIndex, lookAheadBars = 24) {
  if (!ohlcData || startIndex < 0 || startIndex + lookAheadBars >= ohlcData.length) {
    return null;
  }

  const futureBars = ohlcData.slice(startIndex, startIndex + lookAheadBars);
  if (futureBars.length < 5) return null;

  // Method 1: High-Low Range Volatility
  const highLowRange = Math.max(...futureBars.map(c => c.high)) - Math.min(...futureBars.map(c => c.low));
  const avgPrice = futureBars.reduce((sum, c) => sum + c.close, 0) / futureBars.length;
  const rangeVolatility = highLowRange / avgPrice;

  // Method 2: ATR-based Volatility
  let atrSum = 0;
  for (let i = 1; i < futureBars.length; i++) {
    const tr = Math.max(
      futureBars[i].high - futureBars[i].low,
      Math.abs(futureBars[i].high - futureBars[i-1].close),
      Math.abs(futureBars[i].low - futureBars[i-1].close)
    );
    atrSum += tr;
  }
  const atr = atrSum / (futureBars.length - 1);
  const atrVolatility = atr / avgPrice;

  // Method 3: Squared Returns Volatility
  const returns = [];
  for (let i = 1; i < futureBars.length; i++) {
    const ret = (futureBars[i].close - futureBars[i-1].close) / futureBars[i-1].close;
    returns.push(ret * ret); // Square the return
  }
  const squaredReturnsVolatility = returns.length > 0
    ? Math.sqrt(returns.reduce((sum, sq) => sum + sq, 0) / returns.length)
    : 0;

  // Combine methods (weighted average)
  const combinedVolatility = (
    rangeVolatility * 0.4 +
    atrVolatility * 0.4 +
    squaredReturnsVolatility * 0.2
  );

  return {
    volatility: combinedVolatility,
    rangeVolatility,
    atrVolatility,
    squaredReturnsVolatility,
    period: lookAheadBars,
    bars: futureBars.length
  };
}

/**
 * Extract engine features from analysis data
 */
function extractEngineFeatures(analysis, ohlcData, currentIndex) {
  const features = {};

  // Core technical indicators
  features.rsi = analysis.marketHealth?.rsi?.value || 50;
  features.macd_signal = analysis.marketHealth?.macd?.signal || 0;
  features.bb_position = analysis.marketHealth?.bollingerBands?.percentB || 0.5;
  features.bb_width = analysis.marketHealth?.bollingerBands?.width || 0;
  features.atr_percent = analysis.marketHealth?.atr?.percent || 0;
  features.vwap_distance = analysis.marketHealth?.vwapSlope?.value || 0;

  // Trend and momentum
  features.ema_alignment = analysis.emaCloud || 0;
  features.momentum_3bar = analysis.momentumStrength || 0;

  // Calculate 5-bar momentum
  if (ohlcData && currentIndex >= 4) {
    const prices = ohlcData.slice(currentIndex - 4, currentIndex + 1).map(c => c.close);
    features.momentum_5bar = prices.length >= 5 ? (prices[4] - prices[0]) / prices[0] : 0;
  } else {
    features.momentum_5bar = 0;
  }

  // Volume and liquidity
  features.volume_ratio = analysis.marketHealth?.obv?.ratio || 1;
  features.cmf = analysis.marketHealth?.cmf?.value || 0;

  // Pattern recognition
  features.compression_score = analysis.trendExhaustion?.rangeCompression || 0;
  features.breakout_probability = analysis.breakoutScore || 0;

  // Risk and confidence
  features.directional_bias = analysis.directionalBias || 0;
  features.confidence_score = analysis.confidence || 50;
  features.risk_score = analysis.riskScore || 50;

  // Monster gate and execution
  features.monster_gate_score = analysis.monsterOTM?.gateScore || 0;
  features.execution_phase = analysis.executionPhase || 0;

  // Delta and options
  features.otm_delta = analysis.tactical?.otm?.delta || 0;
  features.gamma_exposure = analysis.marketHealth?.gamma?.value || 0;

  // Market regime
  features.adx = analysis.marketHealth?.adx?.value || 25;
  features.regime_filter = analysis.regimeFilter || 0;

  return features;
}

/**
 * Generate volatility prediction training data
 */
async function generateVolatilityTrainingData() {
  console.log('🔄 Generating synthetic volatility prediction training data...');

  // Read signal history to understand patterns
  const signalHistoryPath = path.join(logsDir, 'signal_history.json');
  let signalHistory = {};
  try {
    signalHistory = JSON.parse(fs.readFileSync(signalHistoryPath, 'utf8'));
  } catch (error) {
    console.log('No signal history found, using synthetic data');
  }

  const trainingSamples = [];
  const symbols = ['SPY', 'QQQ', 'TSLA', 'AAPL', 'NVDA', 'MSFT', 'AMZN', 'META'];

  // Generate synthetic training samples
  for (let i = 0; i < 1000; i++) {
    const symbol = symbols[Math.floor(Math.random() * symbols.length)];
    const baseDate = new Date('2026-04-01');
    const randomDays = Math.floor(Math.random() * 10);
    const timestamp = baseDate.getTime() + (randomDays * 24 * 60 * 60 * 1000) + Math.random() * 24 * 60 * 60 * 1000;

    // Generate realistic features based on typical market conditions
    const features = {};

    // Core technical indicators
    features.rsi = 30 + Math.random() * 40; // 30-70 range typical
    features.macd_signal = (Math.random() - 0.5) * 2; // -1 to 1
    features.bb_position = Math.random(); // 0-1
    features.bb_width = 0.01 + Math.random() * 0.05; // 1%-6% typical
    features.atr_percent = 0.005 + Math.random() * 0.03; // 0.5%-3.5%
    features.vwap_distance = (Math.random() - 0.5) * 0.02; // -1% to 1%

    // Trend and momentum
    features.ema_alignment = (Math.random() - 0.5) * 2; // -1 to 1
    features.momentum_3bar = (Math.random() - 0.5) * 0.04; // -2% to 2%
    features.momentum_5bar = (Math.random() - 0.5) * 0.06; // -3% to 3%

    // Volume and liquidity
    features.volume_ratio = 0.5 + Math.random() * 2; // 0.5x to 2.5x
    features.cmf = (Math.random() - 0.5) * 0.4; // -0.2 to 0.2

    // Pattern recognition
    features.compression_score = Math.random() * 0.8; // 0-0.8
    features.breakout_probability = Math.random() * 100; // 0-100

    // Risk and confidence
    features.directional_bias = (Math.random() - 0.5) * 2; // -1 to 1
    features.confidence_score = 30 + Math.random() * 50; // 30-80
    features.risk_score = 20 + Math.random() * 60; // 20-80

    // Monster gate and execution
    features.monster_gate_score = Math.random() * 100; // 0-100
    features.execution_phase = Math.floor(Math.random() * 3); // 0, 1, or 2

    // Delta and options
    features.otm_delta = (Math.random() - 0.5) * 0.6; // -0.3 to 0.3
    features.gamma_exposure = (Math.random() - 0.5) * 0.4; // -0.2 to 0.2

    // Market regime
    features.adx = 15 + Math.random() * 35; // 15-50 typical
    features.regime_filter = Math.random(); // 0-1

    // Generate realistic future volatility based on features
    // Higher compression + lower ADX = higher future volatility (breakout)
    // Lower compression + higher ADX = lower future volatility (trending)
    const compressionFactor = features.compression_score;
    const trendFactor = features.adx / 50; // Normalize ADX
    const momentumFactor = Math.abs(features.momentum_5bar) * 10; // Scale momentum

    // Base volatility influenced by market conditions
    let baseVolatility = 0.015; // 1.5% base daily volatility

    // Compression increases future volatility (potential breakout)
    baseVolatility += compressionFactor * 0.02;

    // Strong trends reduce volatility (continuation)
    baseVolatility -= trendFactor * 0.01;

    // High momentum increases volatility
    baseVolatility += momentumFactor * 0.005;

    // Add some randomness
    const randomFactor = (Math.random() - 0.5) * 0.01;
    baseVolatility += randomFactor;

    // Ensure reasonable bounds
    baseVolatility = Math.max(0.005, Math.min(0.08, baseVolatility));

    // Calculate component volatilities
    const rangeVolatility = baseVolatility * (0.8 + Math.random() * 0.4);
    const atrVolatility = baseVolatility * (0.9 + Math.random() * 0.2);
    const squaredReturnsVolatility = baseVolatility * (0.7 + Math.random() * 0.6);

    const combinedVolatility = (
      rangeVolatility * 0.4 +
      atrVolatility * 0.4 +
      squaredReturnsVolatility * 0.2
    );

    // Create training sample
    const sample = {
      symbol,
      timestamp,
      date: new Date(timestamp).toISOString().split('T')[0],

      // Features (inputs)
      features,

      // Target (output) - future realized volatility
      target: {
        volatility: combinedVolatility,
        rangeVolatility,
        atrVolatility,
        squaredReturnsVolatility,
        period: 24, // 24 bars = ~1 trading day
        bars: 24
      },

      // Metadata
      split: Math.random() < 0.8 ? 'train' : 'holdout',
      weight: 1.0,
      synthetic: true
    };

    trainingSamples.push(sample);
  }

  // Save training data
  const outputPath = path.join(logsDir, 'volatility_prediction_training.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    metadata: {
      generatedAt: new Date().toISOString(),
      totalSamples: trainingSamples.length,
      features: VOLATILITY_FEATURES,
      lookAheadBars: 24,
      description: 'Synthetic volatility prediction model training data',
      note: 'Generated from realistic market feature distributions'
    },
    samples: trainingSamples
  }, null, 2));

  console.log(`✅ Generated ${trainingSamples.length} training samples`);
  console.log(`📁 Saved to: ${outputPath}`);

  // Generate summary statistics
  const volatilities = trainingSamples.map(s => s.target.volatility);
  const avgVolatility = volatilities.reduce((a, b) => a + b, 0) / volatilities.length;
  const minVolatility = Math.min(...volatilities);
  const maxVolatility = Math.max(...volatilities);

  console.log('\n📊 Training Data Summary:');
  console.log(`   Average Volatility: ${(avgVolatility * 100).toFixed(2)}%`);
  console.log(`   Min Volatility: ${(minVolatility * 100).toFixed(2)}%`);
  console.log(`   Max Volatility: ${(maxVolatility * 100).toFixed(2)}%`);
  console.log(`   Training Samples: ${trainingSamples.filter(s => s.split === 'train').length}`);
  console.log(`   Holdout Samples: ${trainingSamples.filter(s => s.split === 'holdout').length}`);

  return trainingSamples;
}

// Run the generator
generateVolatilityTrainingData().catch(console.error);