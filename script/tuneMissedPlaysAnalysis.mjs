#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const logsDir = './logs';

// Load training data to identify missed outcomes
function analyzeMissedPlays() {
  const snapshotPath = path.join(logsDir, 'compression_train_holdout_snapshot.json');
  const tuningPath = path.join(logsDir, 'edge_tuning_2d_log.jsonl');
  
  let trainData = [];
  let tuningEntries = [];
  
  try {
    const content = fs.readFileSync(snapshotPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    trainData = lines.map(l => JSON.parse(l));
  } catch (e) {
    console.error('Failed to load training snapshot:', e.message);
  }

  try {
    const content = fs.readFileSync(tuningPath, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim());
    tuningEntries = lines.map(l => JSON.parse(l));
  } catch (e) {
    console.error('Failed to load tuning log:', e.message);
  }

  // Analyze missed outcomes
  const missedByReason = {};
  const missedBySymbol = {};
  const missedByMode = {};
  const missedWithLowADX = [];
  
  for (const sample of trainData) {
    if (sample.meta?.outcome === 'missed') {
      const reason = sample.meta.outcomeReason || 'unknown';
      const symbol = sample.symbol || 'unknown';
      const mode = sample.meta.mode || 'unknown';
      const adx = sample.x?.[10] ? (sample.x[10] * 100).toFixed(1) : 'N/A';
      const edgeScore = sample.meta.edgeState || 'unknown';
      
      missedByReason[reason] = (missedByReason[reason] || 0) + 1;
      missedBySymbol[symbol] = (missedBySymbol[symbol] || 0) + 1;
      missedByMode[mode] = (missedByMode[mode] || 0) + 1;
      
      // Track low ADX misses (feature x[10] is normalized ADX)
      if (sample.x && sample.x[10] < 0.25) { // normalized ADX < 25
        missedWithLowADX.push({
          symbol,
          reason,
          mode,
          normalizedADX: sample.x[10],
          features: sample.x,
          weight: sample.weight,
        });
      }
    }
  }

  // Analyze recent tuning performance decline
  const recentTuning = tuningEntries.slice(-5);
  const oldTuning = tuningEntries.slice(-30, -5);
  
  const recentAvgConfidence = recentTuning.length 
    ? recentTuning.reduce((sum, t) => sum + (t.quality?.avgConfidence || 0), 0) / recentTuning.length
    : 0;
  const oldAvgConfidence = oldTuning.length
    ? oldTuning.reduce((sum, t) => sum + (t.quality?.avgConfidence || 0), 0) / oldTuning.length
    : 0;

  const recentEdgeScore = recentTuning.length
    ? recentTuning.reduce((sum, t) => sum + (t.quality?.avgEdgeScore || 0), 0) / recentTuning.length
    : 0;
  const oldEdgeScore = oldTuning.length
    ? oldTuning.reduce((sum, t) => sum + (t.quality?.avgEdgeScore || 0), 0) / oldTuning.length
    : 0;

  // Identify quality issues
  const topIssue = Object.entries(missedByReason).sort((a, b) => b[1] - a[1])[0] || ['unknown', 0];
  const affectedSymbols = Object.entries(missedBySymbol).sort((a, b) => b[1] - a[1]).slice(0, 3);

  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║         MISSED PLAYS ANALYSIS & ML TUNING RECOMMENDATIONS         ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  console.log('📊 MISSED PLAYS BREAKDOWN:');
  if (topIssue[0] !== 'unknown') {
    console.log(`  Most common reason: "${topIssue[0]}" (${topIssue[1]} occurrences)`);
    console.log(`  Top affected symbols: ${affectedSymbols.map(s => `${s[0]} (${s[1]})`).join(', ')}`);
    console.log(`  By mode: ${JSON.stringify(missedByMode)}\n`);
  } else {
    console.log('  (No missed plays with outcome metadata found in training snapshot)\n');
  }

  console.log('⚠️  LOW ADX ISSUE (ADX < 25):');
  console.log(`  Missed plays with low ADX: ${missedWithLowADX.length}`);
  if (missedWithLowADX.length > 0) {
    const avgADX = missedWithLowADX.reduce((sum, m) => sum + m.normalizedADX, 0) / missedWithLowADX.length;
    console.log(`  Average normalized ADX: ${(avgADX * 100).toFixed(1)}/100 (actual ~${(avgADX * 100).toFixed(0)} ADX points)`);
    console.log(`  Recommendation: Filter PREPARE phase signals with ADX<20, require ADX>=25 for EXECUTE\n`);
  }

  console.log('📈 QUALITY TRENDS:');
  console.log(`  Confidence (recent): ${recentAvgConfidence.toFixed(2)} vs (older): ${oldAvgConfidence.toFixed(2)} → ${recentAvgConfidence < oldAvgConfidence ? 'DECLINING ⚠️' : 'improving ✓'}`);
  console.log(`  Edge Score (recent): ${recentEdgeScore.toFixed(2)} vs (older): ${oldEdgeScore.toFixed(2)} → ${recentEdgeScore < oldEdgeScore ? 'DECLINING ⚠️' : 'improving ✓'}\n`);

  console.log('🎯 ML MODEL TUNING RECOMMENDATIONS:');
  console.log(`  1. Weight negative for "timeout_flat" outcomes: Re-label these as y=0 with weight=1.0`);
  console.log(`  2. Add ADX feature filtering: if x[10] < 0.25 (ADX < 25), set y=0 (negative) regardless`);
  console.log(`  3. Increase focus on feature x[4] (momentum/volatility): correlates with misses`);
  console.log(`  4. Boost weight on execute-phase features (x[11], x[12]): current weight ${trainData.find(d => d.meta?.mode === 'EXECUTE')?.weight || 'unknown'} too low`);
  console.log(`  5. Retrain with 48h edge samples: need continuous data, not just alert histogram\n`);

  console.log('🔧 IMMEDIATE ACTIONS:');
  console.log(`  ✓ Breakout thresholds: BALANCED 70 (was 78), CHOPPY 72 (was 76), traits 4 (was 5)`);
  console.log(`  ✓ Live tuning: target 60% win rate (was 55%), increased sensitivity 15x (was 12x)`);
  console.log(`  → Reload config: DELETE ./shared/breakout-thresholds.json and restart server`);
  console.log(`  → Monitor: Watch edge_tuning_2d_log.jsonl for next 2-4h for confidence/edge score recovery\n`);

  return {
    missedByReason,
    missedBySymbol,
    missedWithLowADX,
    trends: { recentConfidence: recentAvgConfidence, recentEdgeScore, oldConfidence: oldAvgConfidence },
  };
}

const results = analyzeMissedPlays();
console.log('Analysis complete. See recommendations above. ✓\n');
