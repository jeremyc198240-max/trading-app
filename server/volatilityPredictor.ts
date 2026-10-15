#!/usr/bin/env node
/**
 * Volatility Predictor Module
 *
 * Uses trained ML model to predict future realized volatility
 */

import fs from 'fs';
import path from 'path';

const logsDir = path.resolve(process.cwd(), 'logs');

interface VolatilityModel {
  weights: Record<string, number>;
  bias: number;
  featureNames: string[];
  trained: boolean;
}

class VolatilityPredictor {
  private model: VolatilityModel | null = null;

  constructor() {
    this.loadModel();
  }

  private loadModel() {
    try {
      const modelPath = path.join(logsDir, 'volatility_predictor_model.json');
      if (fs.existsSync(modelPath)) {
        this.model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));
        console.log('📖 Volatility predictor model loaded');
      } else {
        console.warn('⚠️ Volatility predictor model not found');
      }
    } catch (error) {
      console.error('❌ Failed to load volatility model:', error);
    }
  }

  predict(features: Record<string, number>): number {
    if (!this.model) {
      throw new Error('Model not loaded');
    }

    let prediction = this.model.bias;
    for (const featureName of this.model.featureNames) {
      const weight = this.model.weights[featureName] || 0;
      const value = features[featureName] || 0;
      prediction += weight * value;
    }

    return Math.max(0, prediction); // Ensure non-negative
  }
}

// Singleton instance
const predictor = new VolatilityPredictor();

/**
 * Predict future realized volatility from analysis data
 */
export function predictVolatility(analysis: any): {
  predictedVolatility: number;
  confidence: number;
  features: Record<string, number>;
} {
  try {
    // Extract features from analysis data (matching training features)
    const features: Record<string, number> = {
      // Core technical indicators
      rsi: analysis.marketHealth?.rsi?.value || 50,
      macd_signal: analysis.marketHealth?.macd?.signal || 0,
      bb_position: analysis.marketHealth?.bollingerBands?.percentB || 0.5,
      bb_width: analysis.marketHealth?.bollingerBands?.width || 0,
      atr_percent: analysis.marketHealth?.atr?.percent || 0,
      vwap_distance: analysis.marketHealth?.vwapSlope?.value || 0,

      // Trend and momentum
      ema_alignment: analysis.emaCloud || 0,
      momentum_3bar: analysis.momentumStrength || 0,
      momentum_5bar: analysis.momentumStrength || 0, // Simplified

      // Volume and liquidity
      volume_ratio: analysis.marketHealth?.obv?.ratio || 1,
      cmf: analysis.marketHealth?.cmf?.value || 0,

      // Pattern recognition
      compression_score: analysis.trendExhaustion?.rangeCompression || 0,
      breakout_probability: analysis.breakoutScore || 0,

      // Risk and confidence
      directional_bias: analysis.directionalBias || 0,
      confidence_score: analysis.confidence || 50,
      risk_score: analysis.riskScore || 50,

      // Monster gate and execution
      monster_gate_score: analysis.monsterOTM?.gateScore || 0,
      execution_phase: analysis.executionPhase || 0,

      // Delta and options
      otm_delta: analysis.tactical?.otm?.delta || 0,
      gamma_exposure: analysis.marketHealth?.gamma?.value || 0,

      // Market regime
      adx: analysis.marketHealth?.adx?.value || 25,
      regime_filter: analysis.regimeFilter || 0,
    };

    // Make prediction
    const predictedVolatility = predictor.predict(features);

    // Calculate confidence based on feature consistency
    // Higher confidence when features are in normal ranges
    const featureValues = Object.values(features);
    const mean = featureValues.reduce((a, b) => a + b, 0) / featureValues.length;
    const variance = featureValues.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / featureValues.length;
    const stdDev = Math.sqrt(variance);

    // Confidence decreases with high feature variance (unusual conditions)
    const confidence = Math.max(30, Math.min(90, 80 - stdDev * 10));

    return {
      predictedVolatility,
      confidence,
      features
    };

  } catch (error) {
    console.error('Volatility prediction error:', error);
    return {
      predictedVolatility: 0.015, // Default 1.5%
      confidence: 0,
      features: {}
    };
  }
}