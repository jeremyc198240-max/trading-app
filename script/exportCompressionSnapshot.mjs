import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const LOG_DIR = path.resolve(ROOT, "logs");
const BREAKOUT_PATH = path.resolve(LOG_DIR, "breakout_alert_history.json");
const EDGE_PATH = path.resolve(LOG_DIR, "edge_engine_samples.json");
const OUT_PATH = path.resolve(LOG_DIR, "compression_train_holdout_snapshot.json");

const FEATURE_COUNT = 13;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function phaseToVec(phase) {
  const p = String(phase ?? "").toUpperCase();
  return [p === "NOW" ? 1 : 0, p === "READY" ? 1 : 0, p === "PREPARE" ? 1 : 0];
}

function modeToScalar(mode) {
  const m = String(mode ?? "").toUpperCase();
  if (m === "EXECUTE") return 1;
  if (m === "PREPARE") return 0.6;
  return 0;
}

function buildFeatureVector(input) {
  const bbWidth = num(input.bbWidth);
  const rangePct = num(input.rangePct);
  const atrPercent = num(input.atrPercent);
  const edgeScore = num(input.edgeScore);
  const confidence = num(input.confidence);
  const triggerProbability = num(input.triggerProbability);
  const breakoutScore = num(input.breakoutScore);
  const momentum = num(input.momentum);
  const otmDelta = num(input.otmDelta);

  const bbTight = bbWidth == null ? 0.5 : clamp01(1 - bbWidth / 2.2);
  const rangeTight = rangePct == null ? 0.5 : clamp01(1 - rangePct / 1.2);
  const atrTight = atrPercent == null ? 0.5 : clamp01(1 - atrPercent / 1.5);
  const [phaseNow, phaseReady, phasePrepare] = phaseToVec(input.phase);

  return [
    clamp01((breakoutScore ?? 0) / 100),
    clamp01((edgeScore ?? 0) / 100),
    clamp01((confidence ?? 0) / 100),
    clamp01((triggerProbability ?? 0) / 100),
    clamp01(Math.abs(momentum ?? 0) / 100),
    bbTight,
    rangeTight,
    atrTight,
    phaseNow,
    phaseReady,
    phasePrepare,
    modeToScalar(input.mode),
    clamp01(Math.abs(otmDelta ?? 0.2) / 0.45),
  ];
}

function parseJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const raw = fs.readFileSync(filePath, "utf8").trim();
  if (!raw) return [];
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? parsed : [];
}

function rowLabelFromOutcome(outcomeRaw, reasonRaw) {
  const outcome = String(outcomeRaw ?? "").toLowerCase();
  const reason = String(reasonRaw ?? "").toLowerCase();
  if (!outcome || outcome === "pending") return null;

  const positiveTokens = ["win", "target", "profit", "success", "executed"];
  const negativeTokens = ["missed", "loss", "stop", "timeout", "fail"];

  if (positiveTokens.some((token) => outcome.includes(token) || reason.includes(token))) return 1;
  if (negativeTokens.some((token) => outcome.includes(token) || reason.includes(token))) return 0;
  return null;
}

function rowsFromBreakoutHistory(history) {
  const rows = [];
  const maxRows = 7000;
  const start = Math.max(0, history.length - maxRows);

  for (let i = start; i < history.length; i += 1) {
    const item = history[i] ?? {};
    const y = rowLabelFromOutcome(item.outcome, item.outcomeReason);
    if (y == null) continue;

    const x = buildFeatureVector({
      breakoutScore: num(item.breakoutScore),
      edgeScore: num(item.edgeEngine?.edgeScore),
      confidence: num(item.edgeEngine?.confidence),
      triggerProbability: num(item.edgeEngine?.triggerProbability),
      momentum: num(item.momentumStrength),
      bbWidth: num(item.compression?.bbWidth),
      rangePct: num(item.compression?.rangePct),
      atrPercent: num(item.marketHealth?.atr?.percent),
      phase: item.compression?.phase,
      mode: item.mode,
      otmDelta: num(item.tactical?.otm?.delta ?? item.optionsReadiness?.delta),
    });

    if (x.length !== FEATURE_COUNT) continue;

    rows.push({
      source: "breakout_history",
      symbol: String(item.symbol ?? "UNK").toUpperCase(),
      timeframe: String(item.timeframe ?? "15m").toLowerCase(),
      timestamp: Number.isFinite(Number(item.timestamp)) ? Number(item.timestamp) : Date.now(),
      y,
      weight: item.mode === "EXECUTE" ? 1.25 : 1,
      x,
      meta: {
        mode: item.mode ?? null,
        signal: item.signal ?? item.breakoutSignal ?? null,
        outcome: item.outcome ?? null,
        outcomeReason: item.outcomeReason ?? null,
      },
    });
  }

  return rows;
}

function rowsFromEdgeSamples(samples) {
  const rows = [];
  const maxRows = 3500;
  const start = Math.max(0, samples.length - maxRows);

  for (let i = start; i < samples.length; i += 1) {
    const item = samples[i] ?? {};
    const state = String(item.edgeEngine?.state ?? "").toUpperCase();
    const trig = num(item.edgeEngine?.triggerProbability) ?? 0;
    const conf = num(item.edgeEngine?.confidence) ?? 0;
    const y = state === "TRIGGERED" && trig >= 70 && conf >= 70 ? 1 : 0;

    const x = buildFeatureVector({
      breakoutScore: num(item.breakoutScore),
      edgeScore: num(item.edgeEngine?.edgeScore),
      confidence: conf,
      triggerProbability: trig,
      momentum: num(item.edgeEngine?.indicators?.momentum),
      bbWidth: num(item.edgeEngine?.indicators?.bbWidth),
      rangePct: null,
      atrPercent: num(item.edgeEngine?.indicators?.atrPercent),
      phase: item.compression?.phase,
      mode: item.mode,
      otmDelta: null,
    });

    if (x.length !== FEATURE_COUNT) continue;

    rows.push({
      source: "edge_samples",
      symbol: String(item.symbol ?? "UNK").toUpperCase(),
      timeframe: String(item.timeframe ?? "15m").toLowerCase(),
      timestamp: Number.isFinite(Number(item.timestamp)) ? Number(item.timestamp) : Date.now(),
      y,
      weight: 0.25,
      x,
      meta: {
        edgeState: state || null,
        edgeSignal: item.edgeEngine?.signal ?? null,
      },
    });
  }

  return rows;
}

function summarize(rows) {
  const total = rows.length;
  const positives = rows.filter((r) => r.y === 1).length;
  const negatives = total - positives;
  const positiveRate = total > 0 ? Number((positives / total).toFixed(4)) : 0;
  return { total, positives, negatives, positiveRate };
}

function main() {
  const breakoutHistory = parseJsonArray(BREAKOUT_PATH);
  const edgeSamples = parseJsonArray(EDGE_PATH);

  const breakoutRows = rowsFromBreakoutHistory(breakoutHistory);
  const edgeRows = rowsFromEdgeSamples(edgeSamples);
  const allRows = [...breakoutRows, ...edgeRows].sort((a, b) => a.timestamp - b.timestamp);

  const canHoldout = allRows.length >= 220;
  const holdoutSize = canHoldout ? Math.min(300, Math.max(40, Math.floor(allRows.length * 0.2))) : 0;
  const trainRows = canHoldout ? allRows.slice(0, allRows.length - holdoutSize) : allRows;
  const holdoutRows = canHoldout ? allRows.slice(allRows.length - holdoutSize) : [];

  const payload = {
    schemaVersion: 1,
    createdAt: Date.now(),
    sourceFiles: {
      breakoutHistory: path.relative(ROOT, BREAKOUT_PATH),
      edgeSamples: path.relative(ROOT, EDGE_PATH),
    },
    split: {
      strategy: "timestamp_last_20pct_holdout_if_ge_220",
      holdoutSize,
      canHoldout,
    },
    sourceSummary: {
      breakoutHistory: summarize(breakoutRows),
      edgeSamples: summarize(edgeRows),
      combined: summarize(allRows),
      train: summarize(trainRows),
      holdout: summarize(holdoutRows),
    },
    trainRows,
    holdoutRows,
  };

  fs.writeFileSync(OUT_PATH, JSON.stringify(payload), "utf8");
  console.log(`Wrote ${path.relative(ROOT, OUT_PATH)}`);
  console.log(`combined_rows=${allRows.length}`);
  console.log(`train_rows=${trainRows.length}`);
  console.log(`holdout_rows=${holdoutRows.length}`);
}

main();