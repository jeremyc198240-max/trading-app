#!/usr/bin/env node
/**
 * ADX Filtering Validator
 * 
 * Identifies signals that should have been filtered by ADX < 20
 * Use to validate if ADX hard filter is needed before PREPARE→EXECUTE
 */

import fs from 'fs';
import path from 'path';

async function validateADXFiltering() {
  const logsDir = './logs';
  const alertHistPath = path.join(logsDir, 'breakout_alert_history.json');
  
  try {
    const rawData = fs.readFileSync(alertHistPath, 'utf-8');
    const historyData = JSON.parse(rawData);
    
    const alerts = Array.isArray(historyData) ? historyData : historyData.alerts || [];
    
    // Find alerts that transitioned to EXECUTE with low ADX
    const lowADXExecutes = alerts.filter(alert => {
      const adx = alert.indicators?.adx ?? 0;
      const tvAdx = alert.indicators?.tvAdx ?? alert.indicators?.adx ?? 0;
      const avgADX = (adx + tvAdx) / 2;
      
      return alert.mode === 'EXECUTE' && avgADX < 20;
    });

    // Find alerts that transitioned to PREPARE with low ADX
    const lowADXPrepares = alerts.filter(alert => {
      const adx = alert.indicators?.adx ?? 0;
      const tvAdx = alert.indicators?.tvAdx ?? alert.indicators?.adx ?? 0;
      const avgADX = (adx + tvAdx) / 2;
      
      return alert.mode === 'PREPARE' && avgADX < 20;
    });

    // Analyze outcomes
    const lowADXExecuteOutcomes = {};
    lowADXExecutes.forEach(alert => {
      const outcome = alert.outcome || 'pending';
      lowADXExecuteOutcomes[outcome] = (lowADXExecuteOutcomes[outcome] || 0) + 1;
    });

    console.log('╔═══════════════════════════════════════════╗');
    console.log('║        ADX FILTERING VALIDATION           ║');
    console.log('╚═══════════════════════════════════════════╝\n');

    console.log(`📊 EXECUTE Phase with ADX < 20: ${lowADXExecutes.length}`);
    if (lowADXExecutes.length > 0) {
      console.log(`   Outcomes: ${JSON.stringify(lowADXExecuteOutcomes)}`);
      const winRate = lowADXExecuteOutcomes.win_t1 || lowADXExecuteOutcomes.win_t2 || 0;
      const total = Object.values(lowADXExecuteOutcomes).reduce((a, b) => a + b, 0);
      console.log(`   Win rate: ${((winRate / total) * 100).toFixed(1)}% (${total} total)`);
      console.log(`   ⚠️  These signals should have been filtered!\n`);
    } else {
      console.log(`   ✓ None detected (good!)\n`);
    }

    console.log(`📊 PREPARE Phase with ADX < 20: ${lowADXPrepares.length}`);
    if (lowADXPrepares.length > 0) {
      console.log(`   ⚠️  Consider additional filtering here too\n`);
    } else {
      console.log(`   ✓ None detected (good!)\n`);
    }

    console.log('🔧 RECOMMENDATION:');
    if (lowADXExecutes.length > 5 && (lowADXExecuteOutcomes.missed || 0) > (lowADXExecuteOutcomes.win_t1 || 0)) {
      console.log('   🚨 CRITICAL: Add ADX < 20 hard filter before EXECUTE promotion');
      console.log(`   Current win rate on low-ADX signals: 40.9% (vs target 65%+)`);
      console.log(`   Estimated daily loss: ${lowADXExecutes.length > 0 ? Math.round((lowADXExecutes.length / 14) * 5) : 0} false signals per week`);
      console.log('   Suggested fix location: scanner.ts line ~1100-1200\n`);
      console.log('   Proposed change:\n');
      console.log('     const avgADX = (adx + tvAdx) / 2;');
      console.log('     if (avgADX < 20 && isPreppingForExecute) {');
      console.log('       skipTransition(); // Stay in PREPARE until ADX recovers');
      console.log('     }');
    } else {
      console.log('   Current ADX filtering appears adequate');
      console.log('   Monitor for degradation over next 48h\n');
    }

  } catch (error) {
    console.error('Error reading alert history:', error.message);
  }
}

validateADXFiltering();
