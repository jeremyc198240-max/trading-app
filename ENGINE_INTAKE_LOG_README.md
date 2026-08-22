# Engine Intake Log (10-Minute Intervals)

## Overview

The **Engine Intake Log** is a comprehensive data collection system that captures all engine signal outputs every 10 minutes. This enables detailed analysis and tuning of your signal generation engine.

## What Gets Logged

### Every 10 Minutes
- **Signals Created**: All new signals with full metadata
- **Signal Metadata**: Score, direction, confidence, triggers
- **Engine State**: Edge engine status and metrics
- **Trigger Analysis**: What caused each signal (top 10 ranked)
- **Per-Symbol Stats**: Signal generation breakdown by symbol
- **Quality Metrics**: Engine readiness and health score

### Signal Details Captured
Each signal includes:
- **Type**: BREAKOUT, BREAKDOWN, SQUEEZE, CONSOLIDATING, EXPANSION, BUILDING, MOMENTUM
- **Direction**: bullish, bearish, or neutral
- **Scores**:
  - `breakoutScore` (0-100)
  - `edgeScore` (0-100)
  - `confidence` (0-100)
- **Triggers**: All reasons why the signal was created
- **Indicators**:
  - RSI, ADX, Momentum, Volume Spike
  - Bollinger Bands %B, Stochastic K
  - All edge engine indicator values

## Log File Structure

**Location**: `logs/engine_intake_10m_*.jsonl`

**Retention**: 10-day rotating file set (files are overwritten daily)

**Format**: JSONL (one JSON entry per line)

### Example Entry

```json
{
  "timestamp": "2026-05-02T14:30:00.123Z",
  "unixMs": 1746259800123,
  "intervalMinutes": 10,
  "isMarketOpen": true,
  "summary": {
    "totalSymbolsScanned": 45,
    "signalsCreated": 7,
    "signalsByType": {
      "BREAKOUT": 3,
      "MOMENTUM": 2,
      "BREAKDOWN": 2
    },
    "signalsByDirection": {
      "bullish": 5,
      "bearish": 2
    },
    "avgBreakoutScore": 72.4,
    "avgEdgeScore": 68.5,
    "avgConfidence": 74.2
  },
  "signals": [
    {
      "symbol": "AAPL",
      "timeframe": "5m",
      "signalType": "BREAKOUT",
      "direction": "bullish",
      "breakoutScore": 81,
      "edgeScore": 79,
      "confidence": 82,
      "triggers": [
        "high_breakout_score",
        "volume_spike",
        "rsi_overbought",
        "timeframe_alignment",
        "edge_engine: Bollinger Band breakout",
        "setup: High volume confirmation"
      ],
      "indicators": {
        "rsi": 72,
        "adx": 35,
        "momentum": 28,
        "volumeSpike": 2.4,
        "bbPercentB": 0.95,
        "stochasticK": 78
      }
    }
  ],
  "bySymbol": {
    "AAPL": {
      "scanned": true,
      "signalsCreated": 1,
      "signalTypes": ["BREAKOUT"],
      "highestScore": 79,
      "avgConfidence": 82
    }
  },
  "topTriggers": [
    {
      "reason": "high_breakout_score",
      "frequency": 5,
      "avgScore": 75.2
    },
    {
      "reason": "volume_spike",
      "frequency": 4,
      "avgScore": 71.8
    }
  ],
  "engineState": {
    "averageState": {},
    "averageLeadMinutes": 0,
    "triggerReadiness": 0
  },
  "quality": {
    "readinessScore": 85.3,
    "healthScore": "A",
    "volatilityRegime": "unknown",
    "marketCondition": "unknown"
  }
}
```

## How to Use This Log for Tuning

### 1. **Analyze Signal Distribution**

Check which signal types are most frequently generated:

```bash
# Count signals by type (Linux/macOS)
tail -f logs/engine_intake_10m_0.jsonl | jq '.summary.signalsByType' | head -5
```

**What to look for:**
- Are certain signal types appearing too frequently?
- Are you seeing the expected mix of BREAKOUT vs BREAKDOWN?

### 2. **Identify Dominant Triggers**

The `topTriggers` field shows what's causing signals:

```bash
# Extract top triggers
jq '.topTriggers[0:5]' logs/engine_intake_10m_0.jsonl | head -20
```

**What to look for:**
- Which triggers are driving most signals?
- Is `high_breakout_score` dominating? This might mean other triggers are weak
- Are indicators like `rsi_overbought` appearing frequently?

### 3. **Monitor Quality Trends**

Track `readinessScore` and `healthScore` over time:

```bash
# Extract quality scores for analysis
jq '.timestamp, .quality.readinessScore, .quality.healthScore' logs/engine_intake_10m_*.jsonl
```

**What to look for:**
- Is readiness score consistent? (should be 0-100)
- Is health score staying at "A"?
- Do scores drop at certain market times?

### 4. **Per-Symbol Performance**

Identify which symbols are generating most signals:

```bash
# Get symbol summary
jq '.bySymbol | to_entries[] | {symbol: .key, signals: .value.signalsCreated, avgConfidence: .value.avgConfidence}' logs/engine_intake_10m_*.jsonl | head -30
```

**What to look for:**
- Which symbols dominate signal generation?
- Are some symbols stuck with low confidence?
- Is there a correlation between signal count and market volatility?

### 5. **Indicator Distribution**

Analyze indicator values when signals are created:

```bash
# Extract average indicators from each signal
jq '.signals[].indicators | {rsi: .rsi, adx: .adx, momentum: .momentum}' logs/engine_intake_10m_*.jsonl | head -50
```

**What to look for:**
- What RSI ranges produce signals? (e.g., 30-40 vs 60-70)
- Is ADX staying above 25? (good for trends)
- Are momentum indicators aligned with signal direction?

## Tuning Strategy

### Step 1: Establish Baseline (1 week)
Let the engine run for 1 week and collect data. This establishes normal signal generation patterns.

### Step 2: Identify Issues
- **Too many signals**: Triggers are too lenient. Tighten score thresholds.
- **Too few signals**: Triggers are too strict. Lower confidence requirements.
- **Wrong direction bias**: Check `signalsByDirection` - are bullish/bearish skewed?
- **Low confidence signals**: If `avgConfidence` < 50, triggers need refinement.

### Step 3: Adjust Engine Parameters
Based on findings, adjust:
- **Breakout score threshold**: Higher = fewer, higher-quality signals
- **Confidence minimums**: Affects which signals are recorded
- **Trigger weights**: Adjust individual trigger importance in edge engine
- **Indicator parameters**: RSI periods, Bollinger Band width, ADX threshold

### Step 4: Monitor Changes
After tuning:
1. Clear old logs to start fresh
2. Let engine run another 1-2 weeks
3. Compare new metrics vs baseline
4. Repeat as needed

## API Endpoints (Optional Future Enhancement)

Consider adding these endpoints for real-time monitoring:

```
GET /api/intake/status        # Current 10m interval progress
GET /api/intake/latest        # Latest 10m snapshot
GET /api/intake/stats         # Last 24h aggregated stats
GET /api/intake/triggers      # Top triggers (last 24h)
GET /api/intake/symbols       # Per-symbol statistics
```

## Performance Notes

- **Overhead**: Minimal - logs are written async to disk
- **Storage**: ~500 KB - 1 MB per 10-minute snapshot
- **Retention**: 10-day rotating file (automatic cleanup)
- **Scalability**: Tested with 50+ symbols per scan

## Troubleshooting

### No log files appearing
1. Check that `logs/` directory exists
2. Verify market is open (scheduler only runs during market hours by default)
3. Check server logs for errors: `grep -i "intakeScheduler" server.log`

### Logs not updating
1. Verify scheduler is running: Check server logs for "Starting 10-minute interval"
2. Ensure scannerIntegration calls are being hit
3. Check file permissions on `logs/` directory

### Wrong signal counts
1. Verify scanner is actually creating signals
2. Check that `recordScannerSignal` is being called
3. Review scanner logic for signal generation thresholds

## Integration Notes

The intake log is automatically integrated into:
- ✅ Scanner signal generation (scanner.ts)
- ✅ Engine initialization (index.ts)
- ✅ 10-minute scheduler (engineIntakeScheduler.ts)

No additional configuration needed - it starts automatically when the server starts.

## Data Analysis Examples

### Find all high-confidence signals
```bash
jq '.signals[] | select(.confidence > 80)' logs/engine_intake_10m_*.jsonl | head -20
```

### Calculate signal generation rate
```bash
# Signals per hour during market hours
jq '.summary.signalsCreated' logs/engine_intake_10m_*.jsonl | awk '{sum+=$1} END {print "Avg signals per snapshot:", sum/NR, "| Hourly rate:", (sum/NR)*6}'
```

### Identify correlations
```bash
# Which triggers appear together most often?
jq '.signals[].triggers[]' logs/engine_intake_10m_*.jsonl | sort | uniq -c | sort -rn | head -20
```

---

**Last Updated**: May 2, 2026
**Version**: 1.0
