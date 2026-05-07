# Tuning Changes - April 11, 2026

## Summary
Updated breakout thresholds & live tuning bias to reduce missed plays (20 missed in 14d) by lowering entry barriers while maintaining win rate (recent: 69%+ | tuning shows edge score recovering to 71).

## Changes to breakoutThresholds.ts

### 1. DEFAULT_CONFIG Version Update (v1 → v2)
```diff
  modes: {
-   TREND: { setupScoreMin: 68, setupTraitsMin: 4, requireSweetSpotStack: false },
+   TREND: { setupScoreMin: 64, setupTraitsMin: 3, requireSweetSpotStack: false },
-   BALANCED: { setupScoreMin: 78, setupTraitsMin: 5, requireSweetSpotStack: true },
+   BALANCED: { setupScoreMin: 70, setupTraitsMin: 4, requireSweetSpotStack: false },
-   CHOPPY: { setupScoreMin: 76, setupTraitsMin: 5, requireSweetSpotStack: true },
+   CHOPPY: { setupScoreMin: 72, setupTraitsMin: 4, requireSweetSpotStack: false },
  }
```

**Rationale:** Edge log shows 61-69% win rates with much lower edge scores. Thresholds were too stringent and filtering viable entries.

### 2. applyLiveTuningBias() Updates
```diff
- const error = 0.55 - winRate;
- const scoreShift = clampInt(error * 12, -4, 6);
- const traitsShift = clampInt(error * 3, -1, 1);
+ const targetWinRate = 0.60; // raised from 0.55
+ const error = targetWinRate - winRate;
+ const scoreShift = clampInt(error * 15, -6, 8); // increased 12→15
+ const traitsShift = clampInt(error * 4, -2, 2); // increased 3→4
```

+ Clamping ranges widened: `56-86 → 52-84`, `58-90 → 54-88`, `60-92 → 56-90`

**Effect:** System reacts 25% more aggressively to actual win rate and allows lower thresholds when justified.

### 3. fitThresholds() Range Expansion
```diff
- for (let scoreThreshold = 52; scoreThreshold <= 84; scoreThreshold += 2) {
+ for (let scoreThreshold = 48; scoreThreshold <= 80; scoreThreshold += 2) {
-   for (let traitsThreshold = 3; traitsThreshold <= 6; traitsThreshold += 1) {
+   for (let traitsThreshold = 2; traitsThreshold <= 6; traitsThreshold += 1) {
```

Allows optimal fit computation for lower thresholds.

## Deployment Instructions

1. **Restart Server**
   ```
   # Config cache was cleared. On server restart:
   - breakoutThresholds.ts will load with v2 defaults
   - applyLiveTuningBias() will use new 60% target + 15x sensitivity
   ```

2. **Monitor Impact** (next 2-4 hours)
   ```
   tail -f logs/edge_tuning_2d_log.jsonl | grep quality
   
   Watch for:
   - avgConfidence: should stay >70 (recent 73.51)
   - avgEdgeScore: should stay >70 (recent 71.14)
   - winRate: should stay 65%+
   ```

3. **Success Criteria**
   - Missed plays reduce from 20→<5 per 14d (w/ margin of error still 4-6% expected)
   - Win rate maintained at 68%+
   - No increase in false positives (confidence should remain stable)

## Pending Items (For Future Sprints)

### High Priority
- **ADX Hard Filter**: Add explicit check `if (adx < 20) skip PREPARE→EXECUTE transition`
  - Location: scanner.ts ~line 1169; trendNotConfirmed flag exists but not applied at entry gate
  - Data: 1,993 "Directional tape invalid" (stale candles) messages in tuning logs

- **Spot/OHLC Divergence Fix**: Fresh quotes vs stale 5m candles causing data quality loss
  - Root: Cache keys may include dynamic timestamps
  - Fix: stable symbol/timeframe/session keys + TTL expiry checks

### Medium Priority
- Retrain ML model with negative weight on "timeout_flat" outcomes
- Boost execute-phase feature weights (x[11], x[12]) which are currently underutilized
- Switch to 48h continuous edge samples instead of sparse alert histogram

## References
- [Tuning Analysis Log](../../script/tuneMissedPlaysAnalysis.mjs)
- [Market Data Cache Notes](../../../OneDrive/New%20folder/.../market-data-notes.md)
- [System Audit Logs](../../logs/system_audit_2026-04-09.jsonl)
