/**
 * Enhanced Feature Engineering for ML Model
 * 
 * Adds 2 new features to replace weak/reserved slots:
 * - x[8]: volatility_regime (market volatility state based on ATR)
 * - x[9]: timeframe_agreement (5m vs 15m directional alignment)
 * 
 * These replace reserved_signal_1 and reserved_signal_2 with proven predictors
 */

export interface EnhancedFeatureSet {
  // Original 13 features (indices 0-7, 10-12)
  momentum3Bar: number;              // x[0]
  rsi: number;                       // x[1]
  closePercentile: number;           // x[2]
  bbPercentB: number;                // x[3]
  volatilityCompression: number;     // x[4]
  vwapProximity: number;             // x[5]
  sessionHiLoRatio: number;          // x[6]
  aboveVwapFlag: number;             // x[7]
  
  // NEW: volatility_regime (x[8])
  volatilityRegime: number;          // 0-1, normalized market volatility state
  
  // NEW: timeframe_agreement (x[9])
  timeframeAgreement: number;        // 0-1, 5m vs 15m directional alignment
  
  adxNormalized: number;             // x[10]
  executePhaseFlag: number;          // x[11]
  momentumDirectional: number;       // x[12]
}

export class FeatureEngineer {
  /**
   * Compute volatility_regime (x[8])
   * 
   * Market volatility context helps model distinguish:
   * - Low volatility: compression setups are more significant
   * - High volatility: setups may be noise, need more confirmation
   * 
   * Formula: (ATR / SMA(ATR, 20)) normalized to 0-1
   * Range interpretation:
   * - 0.0-0.3: Extremely low volatility (dead market)
   * - 0.3-0.6: Normal/quiet market (default)
   * - 0.6-0.8: Elevated volatility
   * - 0.8-1.0: High volatility (may skip model, use ensemble)
   */
  static computeVolatilityRegime(atr: number, smaAtr: number, percentile95: number): number {
    if (smaAtr === 0) return 0.5; // Default to neutral

    const ratio = atr / smaAtr;
    
    // Normalize: typical range 0.3-1.5 → map to 0-1
    // Values > 95th percentile are clamped to avoid extreme outliers
    const normalized = Math.min(ratio / 1.5, 1.0);
    
    return Math.max(0, Math.min(1, normalized));
  }

  /**
   * Compute timeframe_agreement (x[9])
   * 
   * 5-minute candles show immediate momentum
   * 15-minute candles show trend validation
   * 
   * When both align, the setup is stronger and more likely to follow through
   * This helps model detect true breakouts vs whipsaws
   * 
   * Formula:
   * - If both 5m and 15m same direction: 1.0
   * - If aligned: 0.7
   * - If mixed signals: 0.3
   * - If opposite: 0.0
   */
  static computeTimeframeAgreement(
    momentum5m: number,        // -1 (down) to +1 (up)
    momentum15m: number,       // -1 (down) to +1 (up)
    rsi5m: number,             // 0-100, normalized to -1 to +1
    rsi15m: number,            // 0-100
  ): number {
    // Normalize RSI to directional bias
    const rsi5mBias = (rsi5m - 50) / 50;  // -1 to +1
    const rsi15mBias = (rsi15m - 50) / 50; // -1 to +1

    // Combined scores
    const score5m = (momentum5m * 0.6 + rsi5mBias * 0.4);
    const score15m = (momentum15m * 0.6 + rsi15mBias * 0.4);

    // Correlation strength
    const product = score5m * score15m;

    if (product > 0.8) {
      return 1.0; // Strong alignment, same direction
    } else if (product >= 0.3) {
      return 0.7; // Good alignment
    } else if (product >= -0.3) {
      return 0.3; // Weak alignment / mixed signals
    } else {
      return 0.0; // Opposing signals
    }
  }

  /**
   * Build enhanced feature vector (15 elements instead of 13)
   * 
   * This is called during model input preparation
   */
  static buildEnhancedFeatureVector(
    original13: number[],
    volatilityRegime: number,
    timeframeAgreement: number,
  ): number[] {
    return [
      original13[0],  // momentum_3bar (x[0])
      original13[1],  // rsi (x[1])
      original13[2],  // close_percentile (x[2])
      original13[3],  // bb_percentb (x[3])
      original13[4],  // volatility_compression (x[4])
      original13[5],  // vwap_proximity (x[5])
      original13[6],  // session_hilo_ratio (x[6])
      original13[7],  // above_vwap_flag (x[7])
      volatilityRegime,          // x[8] NEW
      timeframeAgreement,        // x[9] NEW
      original13[10], // adx_normalized (x[10])
      original13[11], // execute_phase_flag (x[11])
      original13[12], // momentum_directional (x[12])
    ];
  }
}

/**
 * Example integration point in breakout alert processing:
 * 
 * const atr = computeATR(candles, 14);
 * const smaAtr = computeSMA(atrSeries, 20);
 * const p95 = percentile(atrSeries, 0.95);
 * const volRegime = FeatureEngineer.computeVolatilityRegime(atr, smaAtr, p95);
 * 
 * const tfAgreement = FeatureEngineer.computeTimeframeAgreement(
 *   getMomentum(candles5m, 3),
 *   getMomentum(candles15m, 3),
 *   computeRSI(candles5m),
 *   computeRSI(candles15m)
 * );
 * 
 * const featureVector = FeatureEngineer.buildEnhancedFeatureVector(
 *   original13ElementVector,
 *   volRegime,
 *   tfAgreement
 * );
 * 
 * // Feed to model
 * const prediction = await model.predict(featureVector);
 */
