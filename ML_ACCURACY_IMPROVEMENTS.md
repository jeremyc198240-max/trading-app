# ML Model Accuracy Improvements - Implementation Guide

**Date:** April 11, 2026  
**Status:** Ready for Implementation  
**Expected Accuracy Gain:** +5-10% (from 69% → 75%+)

---

## Overview

Three key improvements to maximize model accuracy:

1. **Calibration Dial Metric** — Real-time model health monitoring (0-100 score)
2. **Enhanced Feature Engineering** — Add volatility regime & timeframe agreement 
3. **Dynamic Outcome Weighting** — Better weighting of training samples

---

## 1. Calibration Dial Metric (HIGHEST PRIORITY)

### What It Does
- Scores model health 0-100, triggers auto-retrain at score < 70
- Factors: train/holdout divergence, feature strength, class balance, staleness
- **Current Score: 73/100** (Good, needs 24h retraining)

### Where It Fits
- **Integration Point:** `server/systemAuditLog.ts` 
- **Files Created:**
  - `server/mlCalibrationDial.ts` (TypeScript class)
  - Track in `logs/system_audit_*.jsonl`

### Implementation Steps

**Step 1: Add import to systemAuditLog.ts**
```typescript
import { MLCalibrationDial, type CalibrationReport } from './mlCalibrationDial';
```

**Step 2: In model validation routine**
```typescript
const dial = new MLCalibrationDial();
dial.recordTrainMetrics(trainAccuracy, holdoutAccuracy);
dial.recordFeatureImportance(featureImportances);
dial.recordOutcomeDistribution(outcomeStats);

const report = dial.getReport();
console.log(`Model calibration: ${report.statusEmoji} ${report.dialScore}/100`);

// Log to audit
appendSystemAudit({
  eventType: 'model_calibration_check',
  calibration: report,
  timestamp: Date.now(),
});
```

**Step 3: Add alert trigger (in routes.ts)**
```typescript
const calibReport = dial.getReport();
if (calibReport.shouldRetrain) {
  // Trigger background retraining
  console.warn(`📢 Model recalibration needed (score ${calibReport.dialScore}/100)`);
  scheduleModelRetraining(24 * 60 * 60 * 1000); // Retrain in 24h
}
```

### Expected Impact: +2%
- Faster detection of model degradation
- Automated retraining triggers prevent stale models
- Clear visibility into model health

---

## 2. Enhanced Feature Engineering (MEDIUM PRIORITY)

### Current Issue
- 7 weak features (<1.5% importance) wasting model capacity
- Specifically: `above_vwap_flag`, `reserved_signal_1/2`, `session_hilo_ratio`, etc.

### New Features to Add

#### Feature x[8]: Volatility Regime (ATR-based)
```typescript
volatilityRegime = (ATR / SMA(ATR, 20)) normalized to 0-1
```
**Why:** Market volatility changes signal reliability
- **Low vol (0.0-0.3):** Compression setups more significant
- **Normal (0.3-0.6):** Default model application
- **High vol (0.6-1.0):** Skip model, use ensemble fallback

**Implementation:** `server/enhancedFeatureEngineering.ts`
```typescript
const volRegime = FeatureEngineer.computeVolatilityRegime(atr, smaAtr, p95);
```

#### Feature x[9]: Timeframe Agreement (5m vs 15m alignment)
```typescript
timeframeAgreement = correlation(momentum5m, momentum15m, rsi5m, rsi15m)
```
**Why:** True breakouts show alignment across timeframes
- **1.0:** Both timeframes same direction (strongest signal)
- **0.7:** Good alignment
- **0.3:** Mixed signals
- **0.0:** Opposing signals (avoid)

**Implementation:**
```typescript
const tfAgreement = FeatureEngineer.computeTimeframeAgreement(
  getMomentum(candles5m, 3),
  getMomentum(candles15m, 3),
  computeRSI(candles5m),
  computeRSI(candles15m)
);
```

### Integration Points

**In breakoutAlertHistory.ts (when recording alerts):**
```typescript
// Build enhanced feature vector
const enhance Features = FeatureEngineer.buildEnhancedFeatureVector(
  original13ElementVector,
  computedVolatilityRegime,
  computedTimeframeAgreement
);

// Now 15 features instead of 13
// Replace old x array with new one in training data
```

### Expected Impact: +3-4%
- Removes noise from weak features
- Adds meaningful context about market conditions
- Better handling of edge cases (high vol markets, timeframe divergence)

---

## 3. Dynamic Outcome Weighting (LOW PRIORITY, HIGH LEVERAGE)

### Current Weighting Issues
```
Before:
  win_t1:  1.0x
  loss:    1.2x (only 20% boost)
  missed:  1.5x (false negatives underweighted)
  pending: 0.1x (but still pollutes training)

Problem: Model over-optimizes for wins, under-penalizes misses
```

### New Weighting Scheme
```typescript
EXECUTE Phase (highest impact):
  missed:  2.5x (was 1.5x) ← Critical: model failed to execute valid setup
  loss:    1.4x (was 1.2x)  ← False positives are costly
  win_t1:  1.0x (unchanged)
  pending: 0.01x (was 0.1x) ← Don't train on uncertain outcomes

PREPARE Phase (medium impact):
  missed:  2.5x (timeout-flat outcomes)
  loss:    1.2x
  promoted: 0.8x (partial credit for reaching EXECUTE)

Time Decay (new):
  weight(row) *= exp(-0.1 * hoursSinceCreation)
  → Recent data worth more than historical
```

### Implementation (in compression_train_holdout_snapshot.json generation)

```typescript
function adjustOutcomeWeights(rows: TrainingRow[]): void {
  for (const row of rows) {
    const outcome = row.meta?.outcome;
    const phase = row.meta?.mode;
    
    let weight = 1.0;
    
    if (phase === 'EXECUTE') {
      if (outcome === 'missed') weight = 2.5;
      else if (outcome === 'loss') weight = 1.4;
    } else if (phase === 'PREPARE') {
      if (outcome === 'missed') weight = 2.5;
      else if (outcome === 'promoted') weight = 0.8;
    }
    
    if (outcome === 'pending') weight *= 0.01;
    
    // Apply time decay
    const ageHours = (Date.now() - row.timestamp) / (1000 * 60 * 60);
    weight *= Math.exp(-0.1 * ageHours);
    
    row.weight = weight;
  }
}
```

### Expected Impact: +1-2%
- Better false positive / false negative balance
- Recent data gets appropriate weight
- Model learns from all outcomes, not just wins

---

## Implementation Timeline

### Phase 1: IMMEDIATE (Today)
```
[] 1. Copy mlCalibrationDial.ts to server/
[] 2. Add CalibrationDial import to systemAuditLog.ts
[] 3. Create monitoring script to log dial score every hour
[] 4. Duration: 1-2 hours
[] 5. Expected improvement: +0.5% (just monitoring)
```

### Phase 2: SHORT-TERM (Next 24 hours)
```
[] 1. Copy enhancedFeatureEngineering.ts to server/
[] 2. Update breakoutAlertHistory.ts to use 15-feature vector
[] 3. Adjust outcome weights in compression snapshot generator
[] 4. Retrain model with new features & weights
[] 5. Duration: 4-6 hours
[] 6. Expected improvement: +4-6% cumulative
```

### Phase 3: MEDIUM-TERM (Next week)
```
[] 1. Implement 5-fold time-series cross-validation
[] 2. Add per-symbol model variants (AAPL vs QQQ vs SPY)
[] 3. Auto-trigger retrain when dial < 70
[] 4. Add feature drift detection (AIC/BIC tests)
[] 5. Duration: 8-12 hours development
[] 6. Expected improvement: +1-2% additional
```

---

## Success Metrics

### Before Changes
- Win rate: 69%
- Calibration dial: 73/100
- Missed plays: 20/14d
- False positives: 40.9% loss rate on low-ADX signals

### Target After Changes
- Win rate: **75%+** (from 69%)
- Calibration dial: **80+/100** 
- Missed plays: **<5/14d** (from 20)
- False positive rate: **<25%**

### How to Measure
```bash
# Run calibration check daily
node script/mlCalibrationFramework.mjs

# Track in logs
tail -f logs/system_audit_*.jsonl | grep "calibration\|model"

# Compare before/after
# Log from before retrain: Win 69%, Dial 73
# Log from after retrain:  Win 75%, Dial 82+
```

---

## Code Files Created

| File | Purpose | Status |
|------|---------|--------|
| `script/mlCalibrationFramework.mjs` | Analysis & recommendations | ✅ Ready |
| `server/mlCalibrationDial.ts` | Calibration dial class | ✅ Ready |
| `server/enhancedFeatureEngineering.ts` | 15-feature framework | ✅ Ready |
| `script/validateADXFiltering.mjs` | ADX testing | ✅ Ready |
| `server/breakoutThresholds.ts` | Updated thresholds | ✅ Deployed |
| `server/breakoutAlertHistory.ts` | ADX hard filter | ✅ Deployed |

---

## Risk Mitigation

### What Could Go Wrong
1. **Over-weighting misses** → Model becomes too conservative, low win rate
   - **Solution:** Monitor win rate hourly, dial should stay >70
   
2. **New features correlated** → Redundant information, no improvement
   - **Solution:** Run feature importance check weekly
   
3. **Time decay too aggressive** → Old good data discarded
   - **Solution:** Use exp(-0.05 * hours) instead if needed

### How to Rollback
```bash
# If calibration dial drops below 60 within 4h:
# 1. Revert feature changes (keep original 13-feature model)
# 2. Revert outcome weights to original
# 3. Deploy old model snapshot from backups/
```

---

## Questions?

For questions about specific implementation, see:
- Feature engineering: `server/enhancedFeatureEngineering.ts` comments
- Calibration dial: `server/mlCalibrationDial.ts` class methods
- Framework analysis: `script/mlCalibrationFramework.mjs` for detailed metrics
