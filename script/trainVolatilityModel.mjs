#!/usr/bin/env node
/**
 * Volatility Prediction Model Trainer
 *
 * Trains a machine learning model to predict future realized volatility
 * using all engine features as inputs.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const logsDir = path.join(__dirname, '..', 'logs');
const scriptDir = path.join(__dirname);

// Simple Linear Regression implementation for volatility prediction
class VolatilityPredictor {
  constructor() {
    this.weights = {};
    this.bias = 0;
    this.featureNames = [];
    this.trained = false;
  }

  /**
   * Train the model using gradient descent
   */
  train(samples, learningRate = 0.01, epochs = 1000) {
    if (samples.length === 0) throw new Error('No training samples provided');

    // Extract feature names from first sample
    this.featureNames = Object.keys(samples[0].features);
    const numFeatures = this.featureNames.length;

    // Initialize weights randomly
    this.featureNames.forEach(feature => {
      this.weights[feature] = (Math.random() - 0.5) * 0.1;
    });
    this.bias = 0;
    this.trained = true; // Mark as trained for prediction during training

    console.log(`🏋️ Training volatility predictor with ${numFeatures} features...`);

    // Training loop
    for (let epoch = 0; epoch < epochs; epoch++) {
      let totalLoss = 0;

      for (const sample of samples) {
        // Extract features and target
        const features = this.featureNames.map(name => sample.features[name] || 0);
        const target = sample.target.volatility;

        // Make prediction
        const prediction = this.predictSample(features);

        // Calculate loss (MSE)
        const loss = Math.pow(prediction - target, 2);
        totalLoss += loss;

        // Calculate gradients
        const error = prediction - target;

        // Update weights
        this.featureNames.forEach((featureName, i) => {
          this.weights[featureName] -= learningRate * error * features[i];
        });
        this.bias -= learningRate * error;
      }

      // Log progress every 100 epochs
      if ((epoch + 1) % 100 === 0) {
        const avgLoss = totalLoss / samples.length;
        console.log(`Epoch ${epoch + 1}/${epochs}, Loss: ${(avgLoss * 10000).toFixed(4)}`);
      }
    }

    console.log('✅ Training completed!');
  }

  /**
   * Make prediction for a single sample
   */
  predictSample(features) {
    if (!this.trained) throw new Error('Model not trained');

    let prediction = this.bias;
    this.featureNames.forEach((featureName, i) => {
      prediction += this.weights[featureName] * features[i];
    });

    return Math.max(0, prediction); // Ensure non-negative volatility
  }

  /**
   * Make prediction from feature object
   */
  predict(featureObj) {
    const features = this.featureNames.map(name => featureObj[name] || 0);
    return this.predictSample(features);
  }

  /**
   * Evaluate model on test data
   */
  evaluate(testSamples) {
    if (!this.trained) throw new Error('Model not trained');

    let totalError = 0;
    let totalSquaredError = 0;
    const predictions = [];
    const actuals = [];

    for (const sample of testSamples) {
      const prediction = this.predict(sample.features);
      const actual = sample.target.volatility;

      predictions.push(prediction);
      actuals.push(actual);

      const error = prediction - actual;
      totalError += Math.abs(error);
      totalSquaredError += error * error;
    }

    const mae = totalError / testSamples.length;
    const mse = totalSquaredError / testSamples.length;
    const rmse = Math.sqrt(mse);

    // Calculate R² score
    const actualMean = actuals.reduce((a, b) => a + b, 0) / actuals.length;
    const ssRes = actuals.reduce((sum, actual, i) => sum + Math.pow(actual - predictions[i], 2), 0);
    const ssTot = actuals.reduce((sum, actual) => sum + Math.pow(actual - actualMean, 2), 0);
    const r2 = 1 - (ssRes / ssTot);

    return {
      mae,
      mse,
      rmse,
      r2,
      sampleCount: testSamples.length
    };
  }

  /**
   * Get feature importance (absolute weight values)
   */
  getFeatureImportance() {
    if (!this.trained) throw new Error('Model not trained');

    const importance = {};
    let totalWeight = 0;

    Object.entries(this.weights).forEach(([feature, weight]) => {
      const absWeight = Math.abs(weight);
      importance[feature] = absWeight;
      totalWeight += absWeight;
    });

    // Normalize to percentages
    Object.keys(importance).forEach(feature => {
      importance[feature] = (importance[feature] / totalWeight) * 100;
    });

    return importance;
  }

  /**
   * Save model to file
   */
  save(filePath) {
    const modelData = {
      weights: this.weights,
      bias: this.bias,
      featureNames: this.featureNames,
      trained: this.trained,
      savedAt: new Date().toISOString()
    };

    fs.writeFileSync(filePath, JSON.stringify(modelData, null, 2));
    console.log(`💾 Model saved to ${filePath}`);
  }

  /**
   * Load model from file
   */
  load(filePath) {
    const modelData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    this.weights = modelData.weights;
    this.bias = modelData.bias;
    this.featureNames = modelData.featureNames;
    this.trained = modelData.trained;

    console.log(`📖 Model loaded from ${filePath}`);
  }
}

/**
 * Train volatility prediction model
 */
async function trainVolatilityModel() {
  console.log('🚀 Training Volatility Prediction Model...');

  // Load training data
  const trainingPath = path.join(logsDir, 'volatility_prediction_training.json');
  if (!fs.existsSync(trainingPath)) {
    throw new Error('Training data not found. Run generateVolatilityTraining.mjs first.');
  }

  const trainingData = JSON.parse(fs.readFileSync(trainingPath, 'utf8'));
  const samples = trainingData.samples;

  console.log(`📊 Loaded ${samples.length} training samples`);

  // Split into train/validation
  const trainSamples = samples.filter(s => s.split === 'train');
  const holdoutSamples = samples.filter(s => s.split === 'holdout');

  console.log(`   Training: ${trainSamples.length} samples`);
  console.log(`   Holdout: ${holdoutSamples.length} samples`);

  // Train model
  const model = new VolatilityPredictor();
  model.train(trainSamples, 0.001, 500);

  // Evaluate on holdout set
  const metrics = model.evaluate(holdoutSamples);
  console.log('\n📈 Model Performance (Holdout Set):');
  console.log(`   MAE: ${(metrics.mae * 100).toFixed(3)}%`);
  console.log(`   RMSE: ${(metrics.rmse * 100).toFixed(3)}%`);
  console.log(`   R²: ${metrics.r2.toFixed(4)}`);

  // Get feature importance
  const importance = model.getFeatureImportance();
  console.log('\n🔍 Top 10 Feature Importance:');
  Object.entries(importance)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .forEach(([feature, imp]) => {
      console.log(`   ${feature}: ${imp.toFixed(2)}%`);
    });

  // Save model
  const modelPath = path.join(logsDir, 'volatility_predictor_model.json');
  model.save(modelPath);

  // Save evaluation results
  const resultsPath = path.join(logsDir, 'volatility_model_evaluation.json');
  const evaluationData = {
    trainedAt: new Date().toISOString(),
    trainingSamples: trainSamples.length,
    holdoutSamples: holdoutSamples.length,
    metrics,
    featureImportance: importance,
    modelPath
  };

  fs.writeFileSync(resultsPath, JSON.stringify(evaluationData, null, 2));
  console.log(`📊 Evaluation results saved to ${resultsPath}`);

  return model;
}

// Run training
trainVolatilityModel().catch(console.error);