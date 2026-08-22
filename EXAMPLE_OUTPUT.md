# Engine Intake Log - Example Output

This file shows what the 10-minute engine intake logs will look like once the system is running.

## Example Log Entry (JSONL)

```json
{
  "timestamp": "2026-05-02T14:30:00.123Z",
  "unixMs": 1746259800123,
  "intervalMinutes": 10,
  "isMarketOpen": true,
  "summary": {
    "totalSymbolsScanned": 47,
    "signalsCreated": 8,
    "signalsByType": {
      "BREAKOUT": 3,
      "MOMENTUM": 2,
      "BREAKDOWN": 2,
      "SQUEEZE": 1
    },
    "signalsByDirection": {
      "bullish": 5,
      "bearish": 2,
      "neutral": 1
    },
    "avgBreakoutScore": 74.2,
    "avgEdgeScore": 71.5,
    "avgConfidence": 76.8
  },
  "signals": [
    {
      "symbol": "AAPL",
      "timeframe": "5m",
      "signalType": "BREAKOUT",
      "direction": "bullish",
      "breakoutScore": 82,
      "edgeScore": 79,
      "confidence": 84,
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
    },
    {
      "symbol": "MSFT",
      "timeframe": "5m",
      "signalType": "MOMENTUM",
      "direction": "bullish",
      "breakoutScore": 68,
      "edgeScore": 65,
      "confidence": 71,
      "triggers": [
        "edge_engine: RSI divergence bullish",
        "setup: Inside bar breakout",
        "timeframe_alignment",
        "volume_spike"
      ],
      "indicators": {
        "rsi": 58,
        "adx": 28,
        "momentum": 18,
        "volumeSpike": 1.8,
        "bbPercentB": 0.65,
        "stochasticK": 52
      }
    },
    {
      "symbol": "GOOGL",
      "timeframe": "5m",
      "signalType": "BREAKDOWN",
      "direction": "bearish",
      "breakoutScore": 76,
      "edgeScore": 74,
      "confidence": 79,
      "triggers": [
        "high_breakout_score",
        "rsi_oversold",
        "edge_engine: Support break",
        "compression: Breakout ready"
      ],
      "indicators": {
        "rsi": 28,
        "adx": 32,
        "momentum": -22,
        "volumeSpike": 2.1,
        "bbPercentB": 0.05,
        "stochasticK": 22
      }
    }
  ],
  "bySymbol": {
    "AAPL": {
      "scanned": true,
      "signalsCreated": 1,
      "signalTypes": ["BREAKOUT"],
      "highestScore": 79,
      "avgConfidence": 84
    },
    "MSFT": {
      "scanned": true,
      "signalsCreated": 1,
      "signalTypes": ["MOMENTUM"],
      "highestScore": 65,
      "avgConfidence": 71
    },
    "GOOGL": {
      "scanned": true,
      "signalsCreated": 1,
      "signalTypes": ["BREAKDOWN"],
      "highestScore": 74,
      "avgConfidence": 79
    },
    "TSLA": {
      "scanned": true,
      "signalsCreated": 0,
      "signalTypes": [],
      "highestScore": 0,
      "avgConfidence": 0
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
    },
    {
      "reason": "timeframe_alignment",
      "frequency": 3,
      "avgScore": 73.3
    },
    {
      "reason": "edge_engine: Bollinger Band breakout",
      "frequency": 2,
      "avgScore": 78.5
    },
    {
      "reason": "rsi_overbought",
      "frequency": 2,
      "avgScore": 72
    }
  ],
  "engineState": {
    "averageState": {},
    "averageLeadMinutes": 0,
    "triggerReadiness": 0
  },
  "quality": {
    "readinessScore": 82.5,
    "healthScore": "A",
    "volatilityRegime": "unknown",
    "marketCondition": "unknown"
  }
}
```

## CLI Analysis Tool Output

### `node analyze-intake-logs.js summary`

```
📊 ENGINE INTAKE LOG SUMMARY
════════════════════════════════════════
Total Snapshots: 48
Time Range: 5/1/2026, 9:30:00 AM - 5/2/2026, 4:00:00 PM

Signal Generation:
  Total Signals: 384
  Avg Per Interval: 8.0
  By Type: {"BREAKOUT":145,"MOMENTUM":98,"BREAKDOWN":87,"SQUEEZE":54}
  By Direction: {"bullish":224,"bearish":144,"neutral":16}

Quality Metrics:
  Avg Confidence: 74.3%
  Avg Readiness: 81.2%
  Most Common Health: A
```

### `node analyze-intake-logs.js triggers`

```
🎯 TOP TRIGGERS (ALL TIME)
════════════════════════════════════════
1. high_breakout_score
   Frequency: 142 | Avg Score: 76.3

2. volume_spike
   Frequency: 98 | Avg Score: 71.8

3. timeframe_alignment
   Frequency: 76 | Avg Score: 74.1

4. rsi_overbought
   Frequency: 52 | Avg Score: 73.2

5. edge_engine: Bollinger Band breakout
   Frequency: 48 | Avg Score: 77.9

6. setup: High volume confirmation
   Frequency: 42 | Avg Score: 75.4

7. rsi_oversold
   Frequency": 38 | Avg Score: 71.6

8. edge_engine: Support break
   Frequency: 35 | Avg Score: 72.1
```

### `node analyze-intake-logs.js symbols`

```
📈 SIGNALS BY SYMBOL
════════════════════════════════════════
AAPL: 34 signals | Avg Confidence: 78.2%
MSFT: 28 signals | Avg Confidence: 76.1%
GOOGL: 24 signals | Avg Confidence: 73.5%
TSLA: 22 signals | Avg Confidence: 71.8%
META: 19 signals | Avg Confidence: 75.3%
NVDA: 18 signals | Avg Confidence: 77.1%
AMZN: 16 signals | Avg Confidence: 74.2%
NFLX: 14 signals | Avg Confidence: 72.5%
AMD: 12 signals | Avg Confidence: 70.3%
INTC: 10 signals | Avg Confidence: 69.8%
```

### `node analyze-intake-logs.js quality`

```
⭐ QUALITY SCORE TRENDS
════════════════════════════════════════
2:00:00 PM [████████████████░░] 87% (A)
2:10:00 PM [█████████████░░░░░] 82% (A)
2:20:00 PM [█████████████████░] 86% (A)
2:30:00 PM [███████████░░░░░░░] 75% (B)
2:40:00 PM [██████████████░░░░] 84% (A)
2:50:00 PM [███████████████░░░] 85% (A)
3:00:00 PM [█████████░░░░░░░░░] 68% (B)
3:10:00 PM [████████████████░░] 88% (A)
3:20:00 PM [█████████████░░░░░] 82% (A)
3:30:00 PM [██████████░░░░░░░░] 73% (B)
```

## How to Interpret This Data

### High Confidence Signals
- Avg Confidence > 80% = Good signal quality
- Look for patterns in these signals
- Use as a baseline for tuning

### Top Triggers
- If dominated by one trigger → Diversify signal sources
- If `high_breakout_score` is #1 → Other triggers may be too weak
- If many edge_engine triggers → Engine is working well
- If many RSI triggers → May be over-reliant on RSI

### Per-Symbol Distribution
- High-frequency symbols = Most alpha opportunity
- High-confidence symbols = Most reliable
- Low-confidence symbols = Needs tuning
- Evenly distributed = Engine is balanced

### Quality Score Trends
- Scores should be consistently high (>80%)
- Dips at certain times may indicate market changes
- Grade "A" = Healthy engine state
- Grade "B" = Some caution needed

---

## Real-World Tuning Example

### Week 1: Baseline
- Collected 48 snapshots (5 days)
- Avg 8 signals per interval
- Avg confidence 74%
- Top trigger: `high_breakout_score`

### Analysis Finding
"We're getting 8 signals/10min but confidence is only 74%. The single dominant trigger suggests other indicators aren't contributing enough."

### Week 2: Adjustment
Changed:
- Lowered `breakoutScore` threshold from 70 to 60
- Increased weight of RSI divergence trigger
- Adjusted Bollinger Band squeeze scoring

### Result
- Signals: 8 → 10/interval (more opportunities)
- Confidence: 74% → 78% (better quality)
- Triggers: More diverse (5 top triggers vs 1 dominant)
- Health: Still Grade A

---

## File Location & Access

**Location**: `logs/engine_intake_10m_0.jsonl` through `logs/engine_intake_10m_9.jsonl`

**Format**: JSONL (one JSON per line)

**Size**: ~1-2 MB per snapshot

**Retention**: 10 days (auto-rotating)

**Access**:
```bash
# View latest snapshot
tail -1 logs/engine_intake_10m_0.jsonl | jq '.'

# Pretty print
tail -1 logs/engine_intake_10m_0.jsonl | jq '.summary'

# Stream all snapshots
cat logs/engine_intake_10m_*.jsonl | jq '.summary.signalsCreated' | awk '{s+=$1} END {print "Total signals:", s}'
```

---

## Next Steps

1. ✅ System is installed
2. ⏱️ Run for 3-5 days to collect baseline
3. 📊 Run analysis: `node analyze-intake-logs.js summary`
4. 🎯 Identify issues from analysis
5. ⚙️ Adjust engine parameters
6. 📈 Monitor improvements

The intake log system is now ready to help you tune your engine more effectively!
