import {
  getSignalHistory,
  getGoldHotSignals,
  getDailySummary,
  getAllSymbolsWithHistory,
  isCompletedOutcome,
  isLossOutcome,
  isWinOutcome,
} from './signalHistory';

function isLossLikeOutcome(outcome?: string): boolean {
  return isLossOutcome(outcome) || outcome === 'missed';
}

interface ThresholdAnalysis {
  currentThreshold: number;
  recommendedThreshold: number;
  winRateAtCurrent: number;
  winRateAtRecommended: number;
  sampleSize: number;
  confidence: 'high' | 'medium' | 'low';
}

interface TimeWindowAnalysis {
  window: string;
  startHour: number;
  endHour: number;
  totalSignals: number;
  wins: number;
  losses: number;
  winRate: number;
  avgConfidence: number;
  recommendation: 'optimal' | 'good' | 'avoid' | 'insufficient_data';
}

interface GradePerformance {
  grade: string;
  totalSignals: number;
  wins: number;
  losses: number;
  pending: number;
  winRate: number;
  avgConfidence: number;
  expectedWinRate: number;
  performanceVsExpected: number;
}

interface ConfidenceBucket {
  range: string;
  minConf: number;
  maxConf: number;
  totalSignals: number;
  wins: number;
  losses: number;
  winRate: number;
  recommendation: string;
}

interface LossAnalysis {
  commonFactors: string[];
  avgConfidenceOnLoss: number;
  avgRiskOnLoss: number;
  mostFrequentTimeOfLoss: string;
  patterns: string[];
}

interface TuningRecommendation {
  parameter: string;
  currentValue: number;
  recommendedValue: number;
  reason: string;
  expectedImpact: string;
  priority: 'high' | 'medium' | 'low';
}

export interface TuningAnalysisResult {
  timestamp: number;
  dataQuality: 'excellent' | 'good' | 'limited' | 'insufficient';
  totalSignalsAnalyzed: number;
  symbolsAnalyzed: string[];
  
  overallPerformance: {
    totalSignals: number;
    completedSignals: number;
    wins: number;
    losses: number;
    pending: number;
    overallWinRate: number;
    goldWinRate: number;
    hotWinRate: number;
  };
  
  gradePerformance: GradePerformance[];
  timeWindowAnalysis: TimeWindowAnalysis[];
  confidenceBuckets: ConfidenceBucket[];
  lossAnalysis: LossAnalysis;
  recommendations: TuningRecommendation[];
  
  thresholdAnalysis: {
    confidence: ThresholdAnalysis;
    gatingScore: ThresholdAnalysis;
    monsterValue: ThresholdAnalysis;
    risk: ThresholdAnalysis;
  };
  
  summary: string[];
}

export function runTuningAnalysis(): TuningAnalysisResult {
  const symbols = getAllSymbolsWithHistory();
  const allSignals: any[] = [];
  
  for (const symbol of symbols) {
    const history = getSignalHistory(symbol, 1000);
    allSignals.push(...history);
  }
  
  const completedSignals = allSignals.filter(s => isCompletedOutcome(s.outcome));
  const wins = allSignals.filter(s => isWinOutcome(s.outcome));
  const losses = allSignals.filter(s => isLossLikeOutcome(s.outcome));
  const pending = allSignals.filter(s => !isCompletedOutcome(s.outcome));
  
  const dataQuality = getDataQuality(completedSignals.length);
  
  const gradePerformance = analyzeGradePerformance(allSignals);
  const timeWindowAnalysis = analyzeTimeWindows(allSignals);
  const confidenceBuckets = analyzeConfidenceBuckets(allSignals);
  const lossAnalysis = analyzeLosses(losses);
  const thresholdAnalysis = analyzeThresholds(allSignals);
  const recommendations = generateRecommendations(
    gradePerformance, 
    timeWindowAnalysis, 
    confidenceBuckets, 
    lossAnalysis,
    thresholdAnalysis,
    completedSignals.length
  );
  
  const overallWinRate = completedSignals.length > 0 
    ? (wins.length / completedSignals.length) * 100 
    : 0;
  
  const goldSignals = completedSignals.filter(s => s.grade === 'GOLD');
  const goldWins = goldSignals.filter(s => isWinOutcome(s.outcome));
  const goldWinRate = goldSignals.length > 0 ? (goldWins.length / goldSignals.length) * 100 : 0;
  
  const hotSignals = completedSignals.filter(s => s.grade === 'HOT');
  const hotWins = hotSignals.filter(s => isWinOutcome(s.outcome));
  const hotWinRate = hotSignals.length > 0 ? (hotWins.length / hotSignals.length) * 100 : 0;
  
  const summary = generateSummary(
    overallWinRate, 
    goldWinRate, 
    hotWinRate, 
    completedSignals.length,
    recommendations
  );
  
  return {
    timestamp: Date.now(),
    dataQuality,
    totalSignalsAnalyzed: allSignals.length,
    symbolsAnalyzed: symbols,
    
    overallPerformance: {
      totalSignals: allSignals.length,
      completedSignals: completedSignals.length,
      wins: wins.length,
      losses: losses.length,
      pending: pending.length,
      overallWinRate,
      goldWinRate,
      hotWinRate
    },
    
    gradePerformance,
    timeWindowAnalysis,
    confidenceBuckets,
    lossAnalysis,
    recommendations,
    thresholdAnalysis,
    summary
  };
}

function getDataQuality(completedCount: number): TuningAnalysisResult['dataQuality'] {
  if (completedCount >= 100) return 'excellent';
  if (completedCount >= 50) return 'good';
  if (completedCount >= 20) return 'limited';
  return 'insufficient';
}

function analyzeGradePerformance(signals: any[]): GradePerformance[] {
  const grades = ['GOLD', 'HOT', 'READY', 'WAIT'];
  const expectedWinRates: Record<string, number> = {
    'GOLD': 90,
    'HOT': 83,
    'READY': 72,
    'WAIT': 58
  };
  
  return grades.map(grade => {
    const gradeSignals = signals.filter(s => s.grade === grade);
    const completed = gradeSignals.filter(s => isCompletedOutcome(s.outcome));
    const wins = gradeSignals.filter(s => isWinOutcome(s.outcome));
    const losses = gradeSignals.filter(s => isLossLikeOutcome(s.outcome));
    const pending = gradeSignals.filter(s => !isCompletedOutcome(s.outcome));
    
    const winRate = completed.length > 0 ? (wins.length / completed.length) * 100 : 0;
    const avgConfidence = gradeSignals.length > 0 
      ? gradeSignals.reduce((sum, s) => sum + (s.confidence || 0), 0) / gradeSignals.length 
      : 0;
    
    return {
      grade,
      totalSignals: gradeSignals.length,
      wins: wins.length,
      losses: losses.length,
      pending: pending.length,
      winRate,
      avgConfidence,
      expectedWinRate: expectedWinRates[grade] || 50,
      performanceVsExpected: winRate - (expectedWinRates[grade] || 50)
    };
  });
}

function analyzeTimeWindows(signals: any[]): TimeWindowAnalysis[] {
  const windows = [
    { window: '9:30-10:00 AM (Open)', startHour: 9.5, endHour: 10 },
    { window: '10:00-10:30 AM (Early)', startHour: 10, endHour: 10.5 },
    { window: '10:30-11:30 AM (Mid-Morning)', startHour: 10.5, endHour: 11.5 },
    { window: '11:30 AM-1:00 PM (Lunch)', startHour: 11.5, endHour: 13 },
    { window: '1:00-2:00 PM (Early Afternoon)', startHour: 13, endHour: 14 },
    { window: '2:00-3:00 PM (Power Hour Start)', startHour: 14, endHour: 15 },
    { window: '3:00-4:00 PM (Power Hour)', startHour: 15, endHour: 16 }
  ];
  
  return windows.map(w => {
    const windowSignals = signals.filter(s => {
      const date = new Date(s.timestamp);
      const hour = date.getHours() + date.getMinutes() / 60;
      return hour >= w.startHour && hour < w.endHour;
    });
    
    const completed = windowSignals.filter(s => isCompletedOutcome(s.outcome));
    const wins = windowSignals.filter(s => isWinOutcome(s.outcome));
    const losses = windowSignals.filter(s => isLossLikeOutcome(s.outcome));
    
    const winRate = completed.length > 0 ? (wins.length / completed.length) * 100 : 0;
    const avgConfidence = windowSignals.length > 0 
      ? windowSignals.reduce((sum, s) => sum + (s.confidence || 0), 0) / windowSignals.length 
      : 0;
    
    let recommendation: TimeWindowAnalysis['recommendation'] = 'insufficient_data';
    if (completed.length >= 10) {
      if (winRate >= 80) recommendation = 'optimal';
      else if (winRate >= 65) recommendation = 'good';
      else recommendation = 'avoid';
    } else if (completed.length >= 5) {
      if (winRate >= 75) recommendation = 'good';
      else if (winRate < 50) recommendation = 'avoid';
    }
    
    return {
      ...w,
      totalSignals: windowSignals.length,
      wins: wins.length,
      losses: losses.length,
      winRate,
      avgConfidence,
      recommendation
    };
  });
}

function analyzeConfidenceBuckets(signals: any[]): ConfidenceBucket[] {
  const buckets = [
    { range: '90-100%', minConf: 90, maxConf: 100 },
    { range: '80-89%', minConf: 80, maxConf: 89 },
    { range: '70-79%', minConf: 70, maxConf: 79 },
    { range: '60-69%', minConf: 60, maxConf: 69 },
    { range: '50-59%', minConf: 50, maxConf: 59 },
    { range: '<50%', minConf: 0, maxConf: 49 }
  ];
  
  return buckets.map(b => {
    const bucketSignals = signals.filter(s => 
      s.confidence >= b.minConf && s.confidence <= b.maxConf
    );
    
    const completed = bucketSignals.filter(s => isCompletedOutcome(s.outcome));
    const wins = bucketSignals.filter(s => isWinOutcome(s.outcome));
    const losses = bucketSignals.filter(s => isLossLikeOutcome(s.outcome));
    
    const winRate = completed.length > 0 ? (wins.length / completed.length) * 100 : 0;
    
    let recommendation = 'Insufficient data';
    if (completed.length >= 5) {
      if (winRate >= 85) recommendation = 'Excellent - prioritize these signals';
      else if (winRate >= 70) recommendation = 'Good - trade with normal sizing';
      else if (winRate >= 55) recommendation = 'Marginal - reduce position size';
      else recommendation = 'Avoid - consider raising threshold';
    }
    
    return {
      ...b,
      totalSignals: bucketSignals.length,
      wins: wins.length,
      losses: losses.length,
      winRate,
      recommendation
    };
  });
}

function analyzeLosses(losses: any[]): LossAnalysis {
  if (losses.length === 0) {
    return {
      commonFactors: ['No losses recorded yet'],
      avgConfidenceOnLoss: 0,
      avgRiskOnLoss: 0,
      mostFrequentTimeOfLoss: 'N/A',
      patterns: []
    };
  }
  
  const avgConfidence = losses.reduce((sum, s) => sum + (s.confidence || 0), 0) / losses.length;
  
  const timeSlots: Record<string, number> = {};
  losses.forEach(s => {
    const hour = new Date(s.timestamp).getHours();
    const slot = `${hour}:00`;
    timeSlots[slot] = (timeSlots[slot] || 0) + 1;
  });
  
  const mostFrequentTime = Object.entries(timeSlots)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
  
  const factors: string[] = [];
  
  const lowConfLosses = losses.filter(s => s.confidence < 70);
  if (lowConfLosses.length > losses.length * 0.5) {
    factors.push(`${((lowConfLosses.length / losses.length) * 100).toFixed(0)}% of losses had confidence < 70%`);
  }
  
  const waitGradeLosses = losses.filter(s => s.grade === 'WAIT' || s.grade === 'READY');
  if (waitGradeLosses.length > losses.length * 0.3) {
    factors.push(`${((waitGradeLosses.length / losses.length) * 100).toFixed(0)}% of losses were WAIT/READY grade signals`);
  }
  
  if (factors.length === 0) {
    factors.push('No clear pattern detected in losses yet');
  }
  
  return {
    commonFactors: factors,
    avgConfidenceOnLoss: avgConfidence,
    avgRiskOnLoss: 0,
    mostFrequentTimeOfLoss: mostFrequentTime,
    patterns: []
  };
}

function analyzeThresholds(signals: any[]): TuningAnalysisResult['thresholdAnalysis'] {
  const completed = signals.filter(s => isCompletedOutcome(s.outcome));
  
  const findOptimalThreshold = (
    getValue: (s: any) => number,
    currentThreshold: number,
    higher: boolean = true
  ): ThresholdAnalysis => {
    const thresholds = higher 
      ? [currentThreshold - 10, currentThreshold - 5, currentThreshold, currentThreshold + 5, currentThreshold + 10]
      : [currentThreshold + 10, currentThreshold + 5, currentThreshold, currentThreshold - 5, currentThreshold - 10];
    
    let bestThreshold = currentThreshold;
    let bestWinRate = 0;
    let bestSampleSize = 0;
    
    for (const threshold of thresholds) {
      const filtered = completed.filter(s => higher ? getValue(s) >= threshold : getValue(s) <= threshold);
      const wins = filtered.filter(s => isWinOutcome(s.outcome));
      const winRate = filtered.length > 0 ? (wins.length / filtered.length) * 100 : 0;
      
      if (filtered.length >= 5 && winRate > bestWinRate) {
        bestWinRate = winRate;
        bestThreshold = threshold;
        bestSampleSize = filtered.length;
      }
    }
    
    const currentFiltered = completed.filter(s => higher ? getValue(s) >= currentThreshold : getValue(s) <= currentThreshold);
    const currentWins = currentFiltered.filter(s => isWinOutcome(s.outcome));
    const currentWinRate = currentFiltered.length > 0 ? (currentWins.length / currentFiltered.length) * 100 : 0;
    
    return {
      currentThreshold,
      recommendedThreshold: bestThreshold,
      winRateAtCurrent: currentWinRate,
      winRateAtRecommended: bestWinRate,
      sampleSize: bestSampleSize,
      confidence: bestSampleSize >= 20 ? 'high' : bestSampleSize >= 10 ? 'medium' : 'low'
    };
  };
  
  return {
    confidence: findOptimalThreshold(s => s.confidence || 0, 85, true),
    gatingScore: findOptimalThreshold(s => s.gatingScore || 0, 80, true),
    monsterValue: findOptimalThreshold(s => s.monsterValue || 0, 55, true),
    risk: findOptimalThreshold(s => s.risk || 50, 50, false)
  };
}

function generateRecommendations(
  gradePerf: GradePerformance[],
  timeWindows: TimeWindowAnalysis[],
  confBuckets: ConfidenceBucket[],
  lossAnalysis: LossAnalysis,
  thresholds: TuningAnalysisResult['thresholdAnalysis'],
  sampleSize: number
): TuningRecommendation[] {
  const recommendations: TuningRecommendation[] = [];
  
  if (sampleSize < 20) {
    recommendations.push({
      parameter: 'Data Collection',
      currentValue: sampleSize,
      recommendedValue: 50,
      reason: 'Need more completed signals for reliable analysis',
      expectedImpact: 'Higher confidence in all recommendations',
      priority: 'high'
    });
    return recommendations;
  }
  
  const goldPerf = gradePerf.find(g => g.grade === 'GOLD');
  if (goldPerf && goldPerf.totalSignals >= 5 && goldPerf.winRate < 85) {
    recommendations.push({
      parameter: 'GOLD Confidence Threshold',
      currentValue: 85,
      recommendedValue: 88,
      reason: `GOLD win rate is ${goldPerf.winRate.toFixed(1)}%, below expected 90%`,
      expectedImpact: 'Fewer but higher quality GOLD signals',
      priority: 'high'
    });
  }
  
  if (thresholds.confidence.recommendedThreshold !== thresholds.confidence.currentThreshold) {
    recommendations.push({
      parameter: 'Minimum Confidence for GOLD',
      currentValue: thresholds.confidence.currentThreshold,
      recommendedValue: thresholds.confidence.recommendedThreshold,
      reason: `Win rate improves from ${thresholds.confidence.winRateAtCurrent.toFixed(1)}% to ${thresholds.confidence.winRateAtRecommended.toFixed(1)}%`,
      expectedImpact: 'Better signal selection',
      priority: thresholds.confidence.confidence === 'high' ? 'high' : 'medium'
    });
  }
  
  const avoidWindows = timeWindows.filter(w => w.recommendation === 'avoid' && w.totalSignals >= 5);
  for (const window of avoidWindows) {
    recommendations.push({
      parameter: `Time Window: ${window.window}`,
      currentValue: 100,
      recommendedValue: 0,
      reason: `Only ${window.winRate.toFixed(1)}% win rate in this window`,
      expectedImpact: 'Avoid trading during this period',
      priority: 'medium'
    });
  }
  
  const lowConfBucket = confBuckets.find(b => b.range === '<50%');
  if (lowConfBucket && lowConfBucket.totalSignals > 0 && lowConfBucket.winRate < 50) {
    recommendations.push({
      parameter: 'Block Low Confidence Signals',
      currentValue: 0,
      recommendedValue: 50,
      reason: `Signals below 50% confidence have ${lowConfBucket.winRate.toFixed(1)}% win rate`,
      expectedImpact: 'Eliminate low-probability trades',
      priority: 'high'
    });
  }
  
  if (recommendations.length === 0) {
    recommendations.push({
      parameter: 'Current Settings',
      currentValue: 100,
      recommendedValue: 100,
      reason: 'Current thresholds are performing well based on available data',
      expectedImpact: 'Continue monitoring for more data',
      priority: 'low'
    });
  }
  
  return recommendations.sort((a, b) => {
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
}

function generateSummary(
  overallWinRate: number,
  goldWinRate: number,
  hotWinRate: number,
  sampleSize: number,
  recommendations: TuningRecommendation[]
): string[] {
  const summary: string[] = [];
  
  if (sampleSize < 10) {
    summary.push(`Only ${sampleSize} completed signals - need more data for reliable tuning.`);
    summary.push('Continue trading to build signal history for analysis.');
    return summary;
  }
  
  summary.push(`Analyzed ${sampleSize} completed signals.`);
  summary.push(`Overall win rate: ${overallWinRate.toFixed(1)}%`);
  
  if (goldWinRate > 0) {
    const goldStatus = goldWinRate >= 85 ? 'on target' : goldWinRate >= 75 ? 'slightly below target' : 'needs attention';
    summary.push(`GOLD signal win rate: ${goldWinRate.toFixed(1)}% (${goldStatus})`);
  }
  
  if (hotWinRate > 0) {
    const hotStatus = hotWinRate >= 80 ? 'on target' : hotWinRate >= 70 ? 'acceptable' : 'needs attention';
    summary.push(`HOT signal win rate: ${hotWinRate.toFixed(1)}% (${hotStatus})`);
  }
  
  const highPriorityRecs = recommendations.filter(r => r.priority === 'high');
  if (highPriorityRecs.length > 0) {
    summary.push(`${highPriorityRecs.length} high-priority tuning recommendation(s) available.`);
  } else {
    summary.push('No urgent tuning changes needed at this time.');
  }
  
  return summary;
}

export function formatTuningReport(result: TuningAnalysisResult): string {
  const lines: string[] = [];
  
  lines.push('═══════════════════════════════════════════════════════════════════');
  lines.push('                    SIGNAL TUNING ANALYSIS REPORT                   ');
  lines.push('═══════════════════════════════════════════════════════════════════');
  lines.push('');
  
  lines.push(`Data Quality: ${result.dataQuality.toUpperCase()}`);
  lines.push(`Signals Analyzed: ${result.totalSignalsAnalyzed}`);
  lines.push(`Symbols: ${result.symbolsAnalyzed.join(', ') || 'None'}`);
  lines.push('');
  
  lines.push('=== OVERALL PERFORMANCE ===');
  lines.push(`Total: ${result.overallPerformance.totalSignals} | Completed: ${result.overallPerformance.completedSignals}`);
  lines.push(`Wins: ${result.overallPerformance.wins} | Losses: ${result.overallPerformance.losses} | Pending: ${result.overallPerformance.pending}`);
  lines.push(`Overall Win Rate: ${result.overallPerformance.overallWinRate.toFixed(1)}%`);
  lines.push(`GOLD Win Rate: ${result.overallPerformance.goldWinRate.toFixed(1)}% (target: 90%)`);
  lines.push(`HOT Win Rate: ${result.overallPerformance.hotWinRate.toFixed(1)}% (target: 83%)`);
  lines.push('');
  
  lines.push('=== GRADE PERFORMANCE ===');
  for (const grade of result.gradePerformance) {
    if (grade.totalSignals > 0) {
      const status = grade.performanceVsExpected >= 0 ? '+' : '';
      lines.push(`${grade.grade}: ${grade.winRate.toFixed(1)}% win rate (${status}${grade.performanceVsExpected.toFixed(1)}% vs expected) - ${grade.totalSignals} signals`);
    }
  }
  lines.push('');
  
  lines.push('=== TIME WINDOW ANALYSIS ===');
  for (const window of result.timeWindowAnalysis) {
    if (window.totalSignals > 0) {
      const emoji = window.recommendation === 'optimal' ? '🎯' : window.recommendation === 'good' ? '✅' : window.recommendation === 'avoid' ? '⚠️' : '❓';
      lines.push(`${emoji} ${window.window}: ${window.winRate.toFixed(1)}% win rate (${window.totalSignals} signals) - ${window.recommendation.toUpperCase()}`);
    }
  }
  lines.push('');
  
  lines.push('=== RECOMMENDATIONS ===');
  for (const rec of result.recommendations) {
    const priorityEmoji = rec.priority === 'high' ? '🔴' : rec.priority === 'medium' ? '🟡' : '🟢';
    lines.push(`${priorityEmoji} [${rec.priority.toUpperCase()}] ${rec.parameter}`);
    lines.push(`   Current: ${rec.currentValue} → Recommended: ${rec.recommendedValue}`);
    lines.push(`   Reason: ${rec.reason}`);
    lines.push(`   Impact: ${rec.expectedImpact}`);
    lines.push('');
  }
  
  lines.push('=== SUMMARY ===');
  for (const line of result.summary) {
    lines.push(`• ${line}`);
  }
  
  return lines.join('\n');
}
