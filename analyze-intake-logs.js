#!/usr/bin/env node

/**
 * Engine Intake Log Analyzer
 * 
 * Usage: node analyze-intake-logs.js [command] [options]
 * 
 * Commands:
 *   summary              Show summary statistics
 *   signals              List all signals from logs
 *   triggers             Show top triggers
 *   symbols              Per-symbol breakdown
 *   quality              Quality score trends
 *   compare              Compare time periods
 */

import fs from "fs";
import path from "path";
import readline from "readline";

const logsDir = path.join(process.cwd(), "logs");
const command = process.argv[2] || "summary";

async function readLogs() {
  const files = fs
    .readdirSync(logsDir)
    .filter((f) => f.startsWith("engine_intake_10m_"))
    .sort();

  if (files.length === 0) {
    console.error("No intake log files found in logs/");
    process.exit(1);
  }

  const entries = [];

  for (const file of files) {
    const filePath = path.join(logsDir, file);
    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({ input: fileStream, crlfDelay: Infinity });

    for await (const line of rl) {
      if (line.trim()) {
        try {
          entries.push(JSON.parse(line));
        } catch (e) {
          // Skip invalid lines
        }
      }
    }
  }

  return entries.sort((a, b) => a.unixMs - b.unixMs);
}

function showSummary(entries) {
  if (entries.length === 0) {
    console.log("No data available");
    return;
  }

  const totalSignals = entries.reduce((sum, e) => sum + e.summary.signalsCreated, 0);
  const avgSignalsPerInterval = totalSignals / entries.length;
  const avgConfidence = entries.reduce((sum, e) => sum + e.summary.avgConfidence, 0) / entries.length;
  const avgReadiness = entries.reduce((sum, e) => sum + e.quality.readinessScore, 0) / entries.length;

  // Aggregate signal types
  const signalTypes = {};
  const directions = {};

  for (const entry of entries) {
    for (const [type, count] of Object.entries(entry.summary.signalsByType)) {
      signalTypes[type] = (signalTypes[type] || 0) + count;
    }
    for (const [dir, count] of Object.entries(entry.summary.signalsByDirection)) {
      directions[dir] = (directions[dir] || 0) + count;
    }
  }

  console.log("\n📊 ENGINE INTAKE LOG SUMMARY");
  console.log("════════════════════════════════════════");
  console.log(`Total Snapshots: ${entries.length}`);
  console.log(`Time Range: ${new Date(entries[0].unixMs).toLocaleString()} - ${new Date(entries[entries.length - 1].unixMs).toLocaleString()}`);
  console.log(`\nSignal Generation:`);
  console.log(`  Total Signals: ${totalSignals}`);
  console.log(`  Avg Per Interval: ${avgSignalsPerInterval.toFixed(2)}`);
  console.log(`  By Type: ${JSON.stringify(signalTypes)}`);
  console.log(`  By Direction: ${JSON.stringify(directions)}`);
  console.log(`\nQuality Metrics:`);
  console.log(`  Avg Confidence: ${avgConfidence.toFixed(1)}%`);
  console.log(`  Avg Readiness: ${avgReadiness.toFixed(1)}%`);
  console.log(`  Most Common Health: ${getMostCommon(entries.map((e) => e.quality.healthScore))}`);
}

function showSignals(entries) {
  console.log("\n📌 ALL SIGNALS");
  console.log("════════════════════════════════════════");

  for (const entry of entries) {
    if (entry.signals.length === 0) continue;
    console.log(`\n${new Date(entry.timestamp).toLocaleString()} - ${entry.signals.length} signals:`);

    for (const signal of entry.signals) {
      console.log(
        `  ${signal.symbol} [${signal.timeframe}] ${signal.signalType} (${signal.direction}) - Score: ${signal.edgeScore}, Confidence: ${signal.confidence}%`
      );
    }
  }
}

function showTriggers(entries) {
  const triggerMap = {};

  for (const entry of entries) {
    for (const trigger of entry.topTriggers) {
      if (!triggerMap[trigger.reason]) {
        triggerMap[trigger.reason] = { count: 0, scores: [] };
      }
      triggerMap[trigger.reason].count += trigger.frequency;
      triggerMap[trigger.reason].scores.push(trigger.avgScore);
    }
  }

  const sorted = Object.entries(triggerMap)
    .map(([reason, data]) => ({
      reason,
      frequency: data.count,
      avgScore: data.scores.reduce((a, b) => a + b, 0) / data.scores.length,
    }))
    .sort((a, b) => b.frequency - a.frequency);

  console.log("\n🎯 TOP TRIGGERS (ALL TIME)");
  console.log("════════════════════════════════════════");

  for (const [i, trigger] of sorted.slice(0, 15).entries()) {
    console.log(`${i + 1}. ${trigger.reason}`);
    console.log(`   Frequency: ${trigger.frequency} | Avg Score: ${trigger.avgScore.toFixed(1)}`);
  }
}

function showSymbols(entries) {
  const symbolMap = {};

  for (const entry of entries) {
    for (const [symbol, data] of Object.entries(entry.bySymbol)) {
      if (!symbolMap[symbol]) {
        symbolMap[symbol] = { count: 0, signals: 0, confidence: 0 };
      }
      symbolMap[symbol].count++;
      symbolMap[symbol].signals += data.signalsCreated;
      symbolMap[symbol].confidence += data.avgConfidence;
    }
  }

  const sorted = Object.entries(symbolMap)
    .map(([symbol, data]) => ({
      symbol,
      totalSignals: data.signals,
      avgConfidence: data.confidence / data.count,
    }))
    .sort((a, b) => b.totalSignals - a.totalSignals);

  console.log("\n📈 SIGNALS BY SYMBOL");
  console.log("════════════════════════════════════════");

  for (const item of sorted.slice(0, 20)) {
    console.log(`${item.symbol}: ${item.totalSignals} signals | Avg Confidence: ${item.avgConfidence.toFixed(1)}%`);
  }
}

function showQuality(entries) {
  console.log("\n⭐ QUALITY SCORE TRENDS");
  console.log("════════════════════════════════════════");

  for (const entry of entries.slice(-20)) {
    const bar = "█".repeat(Math.floor(entry.quality.readinessScore / 5)) + "░".repeat(20 - Math.floor(entry.quality.readinessScore / 5));
    console.log(`${new Date(entry.timestamp).toLocaleTimeString()} [${bar}] ${entry.quality.readinessScore.toFixed(0)}% (${entry.quality.healthScore})`);
  }
}

function getMostCommon(arr) {
  const counts = {};
  for (const item of arr) {
    counts[String(item)] = (counts[String(item)] || 0) + 1;
  }
  return arr[arr.indexOf(Object.keys(counts).reduce((a, b) => (counts[a] > counts[b] ? a : b)))];
}

async function main() {
  try {
    const entries = await readLogs();

    switch (command) {
      case "summary":
        showSummary(entries);
        break;
      case "signals":
        showSignals(entries);
        break;
      case "triggers":
        showTriggers(entries);
        break;
      case "symbols":
        showSymbols(entries);
        break;
      case "quality":
        showQuality(entries);
        break;
      default:
        console.log(`Unknown command: ${command}`);
        console.log("Available: summary, signals, triggers, symbols, quality");
    }
  } catch (error) {
    console.error("Error:", error);
    process.exit(1);
  }
}

main();
