# Codebase Architecture Summary: Signal Generation & Data Collection

## 1. SIGNAL GENERATION ENTRY POINTS

### Primary Engine: **Scanner** (`server/scanner.ts`)
- **Main Function**: `startScanner()` - initiates the real-time multi-symbol scanning loop
- **Signal Types Generated**:
  - `BREAKOUT` - price breaks above resistance
  - `BREAKDOWN` - price breaks below support
  - `SQUEEZE` - Bollinger Band compression pattern
  - `CONSOLIDATING` - range-bound consolidation
  - `EXPANSION` - volatility expansion
  - `BUILDING` - pre-breakout pressure building
  - `MOMENTUM` - directional momentum confirmation

- **Output Structure** (each signal includes):
  - `id`, `timestamp`, `symbol`, `timeframe` (5m, 15m, etc.)
  - `signal` (type above)
  - `direction` (bullish/bearish/neutral)
  - `breakoutScore` (0-100)
  - `momentumStrength` (-100 to 100)
  - `volumeSpike` (ratio)
  - `rsiValue`, `healthScore`, `healthGrade` (A-D)
  - `signalQuality` (LOW/MEDIUM/HIGH)
  - `warnings` (array of validation flags)
  - `compression` object (sparkScore, phase, bbWidth, rangePct, volRatio)
  - `priceAtCapture`, `stopLoss`, `targets` (T1, T2)
  - `outcome` (win_t1/win_t2/loss/pending/missed)

### Secondary Engine: **Unified Signal** (`server/unifiedSignal.ts`)
- **Purpose**: Single source of truth for directional decisions
- **Input**: Aggregates signals from:
  - Pattern forecasts (fusion)
  - Monster OTM engine
  - Trend adapters (30m, 5m, 1m)
  - Pattern detectors (30m, 5m)
  - Reversal signals
- **Output**: `UnifiedPlay` with type (CALL/PUT/WAIT) and confidence scoring
- **Timeframe Weights** (30m > 5m > 1m):
  - 1D: 0.7
  - 4h: 0.8
  - 1h: 0.9
  - **30m: 1.0** (primary)
  - 15m: 0.85
  - 5m: 0.75
  - 1m: 0.5

### Tertiary: **Breakout Alert System** (`server/breakoutAlertHistory.ts`)
- Records each scanner alert with rich context
- Tracks alert lifecycle (PREPARE → EXECUTE → RESOLVED)
- Enriches with options readiness, edge indicators, compression snapshots
- Persists to `logs/breakout_alert_history.json` + `logs/edge_engine_samples.json`

---

## 2. LOGGING & DATA COLLECTION STRUCTURE

### Log Files Analyzed:

#### **`logs/signal_history.json`**
- Structure: `{ symbol: [] }` mapping (currently empty or per-symbol arrays)
- **Purpose**: Real-time signal history per symbol
- **Format**: JSON object with signal snapshots

#### **`logs/edge_tuning_2d_log.jsonl`** (48-hour rolling windows)
- **Cadence**: Entries every ~15-30 minutes (900s bucket intervals)
- **Entry Format**:
  ```json
  {
    "rolledAt": 1776250623775,
    "windowHours": 48,
    "windowStart": 1776077823775,
    "windowEnd": 1776250623775,
    "sample": {
      "edgeSampleCount": 5848,
      "symbolCount": 8,
      "breakoutAlertCount": 235,
      "total": 235,
      "completed": 229,
      "wins": 88,
      "losses": 103,
      "missed": 38,
      "pending": 6,
      "winRate": 46.07,
      "execute": {...stats...},
      "prepare": {...stats...}
    },
    "quality": {
      "avgEdgeScore": 63.24,
      "avgConfidence": 67.16,
      "avgTriggerProbability": 56.62,
      "avgLeadMinutes": 12.09
    },
    "indicatorMeans": {
      "rsi": 47.69,
      "adx": 41.22,
      "stochK": 41.32,
      "bbPercentB": 46.82,
      "tvRsi": 58.78,
      "tvAdx": 23.69,
      "momentum": -18.72,
      "volumeSpike": 0.92
    },
    "mix": {
      "signal": {"BREAK_UP": 1660, "BREAK_DOWN": 2449, "WAIT": 1739},
      "state": {"STANDBY": 1974, "ARMING": 105, "PRIMED": 2253, "TRIGGERED": 1516}
    },
    "topReasons": [
      {"reason": "Participation rising (volume x1).", "count": 4090},
      ...
    ]
  }
  ```
- **Key Metrics Tracked**:
  - Win/Loss/Missed/Pending counts
  - Breakout alert lifecycle (PREPARE/EXECUTE with promotion tracking)
  - Average edge scores and lead times
  - Indicator distributions (RSI, ADX, Stoch, BB, TV metrics)
  - Signal mix (BREAK_UP/BREAK_DOWN/WAIT)
  - State distribution (STANDBY/ARMING/PRIMED/TRIGGERED)
  - Top triggering reasons

#### **`logs/breakout_alert_history.json`**
- Per-alert snapshots with full context
- Each alert includes:
  - Edge engine snapshot (signal, direction, state, edgeScore, confidence, reasons)
  - Timeframe stack components (5m, 15m, 30m, 1h agreement)
  - Compression snapshot (sparkScore, phase, Bollinger width)
  - Options readiness score
  - Pre-breakout setup ETA
  - Outcome tracking (T1/T2/STOP/MISS resolution)

#### **`logs/signal_history_daily.jsonl`**
- Daily rollup of signal metrics
- Per-symbol: total signals, wins, losses, win rates, expectancy

#### **`logs/edge_engine_samples.json`**
- Individual edge engine samples (low-level stream of edge events)
- Each sample captures one edge computation result

#### **`logs/system_audit_*.jsonl`** (includes dates like 2026-04-29)
- System health/performance audit logs
- Fields: `eventType` (not `type`), timestamp, metric data
- Used for debugging scanner stability and runtime issues

#### **Other Logs**:
- `compression_train_holdout_snapshot.json` - ML compression model training data
- `volatility_predictor_model.json` - Serialized volatility model weights
- `recurrence_14d_report.json` - 14-day pattern recurrence analysis

---

## 3. ML ENGINE MODULES (`ml/` directory)

### **ML Module Structure**:
```
ml/
├── features/           (Feature engineering for models)
├── inference/          (Runtime prediction & model inference)
├── training/           (Model training pipelines)
├── schema.ts           (TypeScript type definitions for ML data)
└── weights/            (Serialized model weights)
```

### **Server-Side ML Engines**:

#### **`server/compressionAiEngine.ts`**
- **Function**: `trainCompressionModelFromLogs()` - trains ML classifier on historical compression events
- **Function**: `scoreCompressionOpportunity()` - scores live compression phases
- **Purpose**: Detects and predicts Bollinger Band squeeze breakout opportunities

#### **`server/volatilityPredictor.ts`**
- **Function**: `predictVolatility()` - predicts upcoming volatility regime
- **Input**: Current OHLC, historical patterns
- **Output**: Expected volatility range and regime (low/mid/high)

#### **`server/mlCalibrationDial.ts`**
- **Function**: `calculateCalibrationDial()` - adjusts model sensitivity
- **Purpose**: Real-time tuning of ML model output thresholds based on market conditions

#### **`ml/inference/infer.ts`**
- **Function**: `inferLivePrediction()` - runs live inference on current market data
- **Purpose**: Real-time ML model predictions for directional bias and confidence

---

## 4. INTERVAL-BASED DATA COLLECTION PATTERNS

### **Edge Tuning Cadence (48-hour rolling windows)**
- **Collection Interval**: ~15-30 minute buckets (every 900s)
- **Aggregation Window**: 48 hours
- **Trigger**: `collectEdgeTuning2dNow()` function in `breakoutAlertHistory.ts`
- **Data Persisted**:
  - Signal counts (BREAK_UP/BREAK_DOWN/WAIT)
  - State counts (STANDBY/ARMING/PRIMED/TRIGGERED)
  - Outcome stats (wins, losses, missed, pending)
  - Quality metrics (avgEdgeScore, avgConfidence, avgLeadMinutes)
  - Indicator distributions
  - Top triggering reasons

### **Daily Signal Rollup**
- **Collection**: End-of-day aggregation in `signalHistory.ts`
- **Output**: `signal_history_daily.jsonl`
- **Metrics**: Per-symbol daily summary with winRate, expectancy, timing

### **Real-Time Scanner Samples**
- **Interval**: Every market tick (sub-second) when new OHLC candles form
- **Data Collected**:
  - Symbol, timeframe, signal type, direction
  - Score components (breakoutScore, momentumStrength, volumeSpike, RSI, etc.)
  - Outcome tracking (as positions resolve at T1/T2/STOP)

### **System Audit Events**
- **Collection**: Continuous as events occur
- **Interval**: Logged on-demand or periodic health checks
- **Fields**: eventType, timestamp, relevant metrics

### **14-Day Recurrence Report**
- **Collection**: Batch analysis over 14-day lookback
- **Purpose**: Identify patterns that repeat on specific days/times
- **Output**: `recurrence_14d_report.json`, `recurrence_14d_report.txt`

### **TradingView Historical Context**
- **Collection**: Periodic sync with TradingView scanner
- **Output**: `tradingview_history_14d_report.json/txt`
- **Purpose**: Validate scanner against external signal provider

---

## 5. MAIN ENGINE FILES & THEIR ROLES

| File | Purpose | Key Functions |
|------|---------|---|
| `scanner.ts` | Real-time breakout/compression detection | `startScanner()`, `scanSingleSymbol()` |
| `unifiedSignal.ts` | Signal fusion & direction consensus | `computeUnifiedPlay()`, signal weighting |
| `breakoutAlertHistory.ts` | Alert lifecycle & outcome tracking | `recordBreakoutAlert()`, `recordEdgeTuningSample()` |
| `signalHistory.ts` | Signal storage & metrics | `recordSignal()`, `getSignalMetrics()` |
| `finance.ts` | Technical indicator calculations | RSI, ADX, stochastic, Bollinger, MACD |
| `indicators.ts` | Low-level indicator helpers | ATR, moving averages, etc. |
| `patterns.ts` | Pattern detection (triangles, flags, etc.) | `detectAllPatterns()` |
| `patternFusion.ts` | Fuse pattern signals | `computePatternFusionSignal()` |
| `fusion.ts` | Multi-timeframe consensus | `computeFusionSnapshot()` |
| `emaTrendAdapter.ts` | Trend strength from EMA clouds | Timeframe-specific trend bias |
| `compressionAiEngine.ts` | ML compression detection | `scoreCompressionOpportunity()` |
| `volatilityPredictor.ts` | Volatility regime prediction | `predictVolatility()` |
| `monsterOtmEngine.ts` | Options chain analysis for OTM plays | Advanced delta/strike analysis |
| `gammaGhost.ts` | Gamma-driven price prediction | Options-implied direction |
| `reversalEngine.ts` | Mean-reversion signal detection | Price action reversals |
| `priceActionSafety.ts` | Validates price action logic | `computePriceActionSafety()` |
| `signalMemory.ts` | Smooths signals via memory buffer | Prevents whipsaws |
| `signalStability.ts` | Ensures directional stability | `getStableDirection()` |
| `signalTuning.ts` | Backtesting & tuning analysis | `runTuningAnalysis()` |
| `marketData.ts` | OHLC fetch & caching | `fetchLiveOHLC()`, `fetchLiveSpot()` |
| `breakoutAlertHistory.ts` | Edge tuning samples & outcomes | `recordEdgeTuningSample()` |

---

## 6. API ROUTES FOR SIGNAL ACCESS

- **`GET /api/scanner/results`** - Latest scanner signals across watchlist
- **`GET /api/scanner/:symbol/:timeframe`** - Single symbol analysis
- **`GET /api/analyze/:symbol/:timeframe`** - Unified fusion + pattern + fusion analysis
- **`GET /api/signal-history`** - Historical signal records with outcomes
- **`GET /api/breakout-alert`** - Breakout alert logs with lifecycle
- **`GET /api/edge-tuning-2d`** - 48-hour rolling edge tuning metrics
- **`POST /api/record-signal`** - Manual signal recording
- **`POST /api/update-outcomes`** - Update signal outcomes (T1/T2/STOP/MISS)

---

## 7. DATA FLOW DIAGRAM

```
Market Data (5m OHLC candles)
    ↓
[Scanner] → Detects BREAKOUT/SQUEEZE/etc. → Records breakout alert
    ↓
[Edge Engine] → Scores edge probability, lead time, triggers → Samples edge events
    ↓
[Pattern Detector] → Identifies triangles, flags, etc.
    ↓
[Fusion] → Combines scanner + pattern + reversal + trend signals
    ↓
[Unified Signal] → Weighted consensus across timeframes → CALL/PUT/WAIT
    ↓
[Signal History] → Persists outcome (win_t1/loss/pending/missed)
    ↓
[Edge Tuning 2D] → 48h rolling aggregation of all signals + quality metrics
    ↓
System Audit Log / Daily Rollup / 14-Day Report
```

---

## 8. CURRENT LOGGING GAPS & RECOMMENDATIONS

### What's Missing:
- **Hourly aggregations** (only 48h rolling available)
- **10-minute buckets** (currently ~15-30m)
- **Minute-level event stream** (only final candle signals persisted)
- **Per-signal reason audit trail** (top reasons tracked but not individual signal reasons)
- **Continuous background sample rate** (samples only on alert generation, not continuous monitoring)

### Existing Data Available:
✅ 48-hour rolling edge tuning metrics  
✅ Daily signal rollups (via `signal_history_daily.jsonl`)  
✅ 14-day recurrence patterns  
✅ Per-alert full context (edge engine state, timeframe stack, compression phase)  
✅ System audit logs (on-demand, includes performance metrics)  

---

## 9. KEY SIGNAL QUALITY METRICS TRACKED

- **Edge Score** (0-100): Breakout probability
- **Confidence** (0-100): Model certainty
- **Lead Minutes**: Advance warning before breakout
- **Trigger Probability** (0-100): Likelihood of price action confirming the signal
- **Health Grade** (A-D): Overall signal quality assessment
- **Win Rate**: % of completed signals that hit T1+ targets
- **Expectancy**: Average R-value (risk/reward ratio)

All metrics are continuously aggregated into the 48-hour rolling window for real-time performance monitoring.
