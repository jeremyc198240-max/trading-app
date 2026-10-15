import fs from "node:fs";
import path from "node:path";

type Row = Record<string, any>;
type Side = "CALL" | "PUT";

const logsDir = path.resolve(process.cwd(), "logs");
const joinWindowMs = 15 * 60 * 1000;

function readJson(fileName: string): any {
  const filePath = path.join(logsDir, fileName);
  return fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, "utf8")) : null;
}

function readJsonlFiles(pattern: RegExp): Row[] {
  if (!fs.existsSync(logsDir)) return [];
  return fs.readdirSync(logsDir)
    .filter((fileName) => pattern.test(fileName))
    .sort()
    .flatMap((fileName) => fs.readFileSync(path.join(logsDir, fileName), "utf8").split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          return [{ ...JSON.parse(line), sourceFile: fileName }];
        } catch {
          return [];
        }
      }));
}

function number(value: unknown, fallback = Number.NaN): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function direction(value: unknown): Side | "WAIT" {
  const normalized = String(value ?? "").toUpperCase();
  if (/CALL|BULL|BREAK_UP|UP|LONG/.test(normalized)) return "CALL";
  if (/PUT|BEAR|BREAK_DOWN|DOWN|SHORT/.test(normalized)) return "PUT";
  return "WAIT";
}

function signalScore(row: Row, label: string): number | null {
  const signal = (row.signals ?? []).find((candidate: Row) => String(candidate.label).replace(/ \d+$/, "") === label);
  const score = number(signal?.score);
  return Number.isFinite(score) ? score : null;
}

function percentile(values: number[], fraction: number): number | null {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function nearestPrior(rows: Row[], symbol: string, timestamp: number, getTime: (row: Row) => number): Row | null {
  let match: Row | null = null;
  let matchTime = -Infinity;
  for (const row of rows) {
    if (String(row.symbol ?? "").toUpperCase() !== symbol) continue;
    const rowTime = getTime(row);
    if (rowTime > timestamp || timestamp - rowTime > joinWindowMs || rowTime <= matchTime) continue;
    match = row;
    matchTime = rowTime;
  }
  return match;
}

function pmSummary(rows: Row[]) {
  const returns = rows.map((row) => number(row.returnPct)).filter(Number.isFinite);
  const positive = returns.filter((value) => value > 0).length;
  const negative = returns.filter((value) => value < 0).length;
  return {
    count: rows.length,
    positive,
    flat: returns.length - positive - negative,
    negative,
    positiveRate: returns.length ? Number((positive / returns.length * 100).toFixed(1)) : null,
    meanReturnPct: returns.length ? Number((returns.reduce((sum, value) => sum + value, 0) / returns.length).toFixed(4)) : null,
    medianReturnPct: percentile(returns, 0.5),
  };
}

function outcomeKind(row: Row | null): "win" | "loss" | "missed" | "pending" {
  const outcome = String(row?.outcome ?? row?.result ?? "pending").toLowerCase();
  if (outcome.startsWith("win") || outcome === "positive") return "win";
  if (outcome === "loss" || outcome.includes("stop")) return "loss";
  if (outcome.includes("miss") || outcome === "flat") return "missed";
  return "pending";
}

function evidenceSummary(rows: Row[], evidenceKey: "breakout" | "snapshotOutcome") {
  const counts = { count: rows.length, matched: 0, wins: 0, losses: 0, missed: 0, pending: 0 };
  for (const row of rows) {
    const evidence = row[evidenceKey] as Row | null;
    if (evidence) counts.matched += 1;
    const kind = outcomeKind(evidence);
    if (kind === "win") counts.wins += 1;
    if (kind === "loss") counts.losses += 1;
    if (kind === "missed") counts.missed += 1;
    if (kind === "pending") counts.pending += 1;
  }
  const decisive = counts.wins + counts.losses;
  const completed = decisive + counts.missed;
  return {
    ...counts,
    decisive,
    completed,
    decisiveWinRate: decisive ? Number((counts.wins / decisive * 100).toFixed(1)) : null,
    completedWinRate: completed ? Number((counts.wins / completed * 100).toFixed(1)) : null,
  };
}

function uniqueBy(rows: Row[], key: (row: Row) => string | null): Row[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const value = key(row);
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function compactGate(rows: Row[]) {
  const uniqueBreakouts = uniqueBy(rows, (row) => row.breakout?.id ?? null);
  const snapshotAligned = rows.filter((row) => row.joins?.snapshotAligned);
  return {
    positionManager: pmSummary(rows),
    breakoutEvidence: evidenceSummary(rows, "breakout"),
    uniqueBreakoutSetups: evidenceSummary(uniqueBreakouts, "breakout"),
    snapshotAlignedEvidence: evidenceSummary(snapshotAligned, "snapshotOutcome"),
  };
}

const positionRows = readJsonlFiles(/^black_box_position_manager_.*\.jsonl$/i);
const activations = new Map<string, Row>();
const resolutions = new Map<string, Row>();
for (const row of positionRows) {
  if (row.event === "activated" && !activations.has(row.alertId)) activations.set(row.alertId, row);
  if (row.event === "resolved" && !resolutions.has(row.alertId)) resolutions.set(row.alertId, row);
}

const pairs = Array.from(activations.entries()).flatMap(([alertId, activation]) => {
  const resolution = resolutions.get(alertId);
  if (!resolution || ["page_hidden", "symbol_changed"].includes(String(resolution.resolvedReason))) return [];
  const startPrice = number(activation.startPrice);
  const endPrice = number(resolution.endPrice);
  if (!(startPrice > 0) || !Number.isFinite(endPrice)) return [];
  const signedReturn = activation.side === "CALL" ? endPrice - startPrice : startPrice - endPrice;
  return [{
    ...activation,
    endedAt: number(resolution.endedAt),
    resolvedReason: String(resolution.resolvedReason ?? "unknown"),
    durationSeconds: number(resolution.durationSeconds, 0),
    returnPct: Number((signedReturn / startPrice * 100).toFixed(4)),
    probabilityScore: signalScore(activation, "Probability"),
  }];
});

const breakoutAlerts = (readJson("breakout_alert_history.json") ?? []) as Row[];
const strictBreakoutAlerts = breakoutAlerts.filter((row) => !(row.warnings ?? []).some((warning: string) =>
  /TV_DERIVED_NO_OHLC|SIMULATED|DEGRADED/.test(warning),
));
const edgeSamples = (readJson("edge_engine_samples.json") ?? []) as Row[];
const intakeRows = readJsonlFiles(/^engine_intake_10m_.*\.jsonl$/i);
const intakePoints = intakeRows.flatMap((row) => (row.signals ?? []).map((signal: Row) => ({
  ...signal,
  timestamp: number(row.unixMs, Date.parse(String(row.timestamp ?? ""))),
})));
const snapshots = readJsonlFiles(/^black_box_15m_.*\.jsonl$/i);
const snapshotOutcomes = readJsonlFiles(/^black_box_outcomes_.*\.jsonl$/i);
const snapshotByDecision = new Map(snapshots.map((row) => [String(row.decisionId ?? `${row.symbol}:${row.candleTimeMs}`), row]));
const outcomesWithSnapshots = snapshotOutcomes
  .filter((row) => number(row.horizonMinutes) === 15)
  .map((row) => ({
    ...row,
    snapshot: snapshotByDecision.get(String(row.decisionId ?? String(row.outcomeId ?? "").replace(/:15$/, ""))) ?? null,
  }))
  .filter((row) => row.snapshot);

const joined = pairs.map((row) => {
  const symbol = String(row.symbol).toUpperCase();
  const startedAt = number(row.startedAt);
  const breakout = nearestPrior(strictBreakoutAlerts, symbol, startedAt, (candidate) => number(candidate.timestamp));
  const edgeSample = nearestPrior(edgeSamples, symbol, startedAt, (candidate) => number(candidate.timestamp));
  const intake = nearestPrior(intakePoints, symbol, startedAt, (candidate) => number(candidate.timestamp));
  const snapshotOutcome = nearestPrior(outcomesWithSnapshots, symbol, startedAt, (candidate) => number(candidate.snapshot?.capturedAtMs));
  const breakoutDirection = direction(breakout?.direction ?? breakout?.edgeEngine?.direction);
  const edgeDirection = direction(edgeSample?.edgeEngine?.direction ?? edgeSample?.direction);
  const intakeDirection = direction(intake?.direction);
  const snapshotDirection = direction(snapshotOutcome?.snapshot?.engineState?.fusion?.direction);
  return {
    ...row,
    breakout,
    edgeSample,
    intake,
    snapshotOutcome,
    joins: {
      breakoutAgeSeconds: breakout ? Number(((startedAt - number(breakout.timestamp)) / 1000).toFixed(1)) : null,
      breakoutAligned: breakoutDirection !== "WAIT" && breakoutDirection === row.side,
      edgeAligned: edgeDirection !== "WAIT" && edgeDirection === row.side,
      intakeAligned: intakeDirection !== "WAIT" && intakeDirection === row.side,
      snapshotAligned: snapshotDirection !== "WAIT" && snapshotDirection === row.side,
    },
  };
});

const confirmedStates = new Set(["TESTING", "ACCEPTED", "RETEST HELD"]);
const strongStates = new Set(["ACCEPTED", "RETEST HELD"]);
const currentFiveMinuteGate = (row: Row) => confirmedStates.has(String(row.fiveMinuteState));
const tvRecommendationAdx25 = (row: Row) => {
  const recommendation = number(row.breakout?.tvRecommendAll);
  const recommendationDirection = recommendation >= 0.15 ? "CALL" : recommendation <= -0.15 ? "PUT" : "WAIT";
  return recommendationDirection !== "WAIT" && recommendationDirection === row.side && number(row.breakout?.tvAdx, 0) >= 25;
};
const tvTrendAdx25Momentum35 = (row: Row) => direction(row.breakout?.tvTrendDirection) === row.side &&
  number(row.breakout?.tvAdx, 0) >= 25 && Math.abs(number(row.breakout?.momentumStrength, 0)) >= 35;
const breakdownReadyNow72Momentum40Volume15 = (row: Row) => row.side === "PUT" &&
  String(row.breakout?.signal).toUpperCase() === "BREAKDOWN" &&
  ["READY", "NOW"].includes(String(row.breakout?.compression?.phase).toUpperCase()) &&
  number(row.breakout?.breakoutScore, 0) >= 72 &&
  Math.abs(number(row.breakout?.momentumStrength, 0)) >= 40 &&
  number(row.breakout?.volumeSpike, 0) >= 1.5;
const gates: Record<string, (row: Row) => boolean> = {
  all: () => true,
  currentFiveMinuteGate,
  probability40: (row) => number(row.probabilityScore, 0) >= 40,
  currentGateAndProbability40: (row) => currentFiveMinuteGate(row) && number(row.probabilityScore, 0) >= 40,
  acceptedOrRetestHeld: (row) => strongStates.has(String(row.fiveMinuteState)),
  knownFreshBreakout: (row) => number(row.breakoutAgeMinutes) >= 0 && number(row.breakoutAgeMinutes) <= 15,
  breakoutContextAvailable: (row) => Boolean(row.breakout),
  breakoutDirectionAligned: (row) => row.joins.breakoutAligned,
  breakoutTriggeredAligned: (row) => row.joins.breakoutAligned && row.breakout?.edgeEngine?.state === "TRIGGERED",
  breakoutEdge80Aligned: (row) => row.joins.breakoutAligned && number(row.breakout?.edgeEngine?.edgeScore, 0) >= 80,
  breakoutProbability80Aligned: (row) => row.joins.breakoutAligned && number(row.breakout?.edgeEngine?.triggerProbability, 0) >= 80,
  breakoutProbability90Aligned: (row) => row.joins.breakoutAligned && number(row.breakout?.edgeEngine?.triggerProbability, 0) >= 90,
  breakoutAdx25Momentum35Aligned: (row) => row.joins.breakoutAligned &&
    number(row.breakout?.edgeEngine?.indicators?.adx, 0) >= 25 && Math.abs(number(row.breakout?.momentumStrength, 0)) >= 35,
  optionsReadyAligned: (row) => row.joins.breakoutAligned && row.breakout?.optionsReadiness?.alignedDirection === true &&
    number(row.breakout?.optionsReadiness?.score, 0) >= 50,
  edgeSampleAligned: (row) => row.joins.edgeAligned,
  intakeAligned: (row) => row.joins.intakeAligned,
  multiSystemAligned: (row) => [row.joins.breakoutAligned, row.joins.edgeAligned, row.joins.intakeAligned, row.joins.snapshotAligned]
    .filter(Boolean).length >= 2,
  tvRecommendationAdx25,
  currentGateAndTvRecommendationAdx25: (row) => currentFiveMinuteGate(row) && tvRecommendationAdx25(row),
  tvTrendAdx25Momentum35,
  currentGateAndTvTrendAdx25Momentum35: (row) => currentFiveMinuteGate(row) && tvTrendAdx25Momentum35(row),
  breakdownReadyNow72Momentum40Volume15,
  currentGateAndBreakdownReadyNow72Momentum40Volume15: (row) =>
    currentFiveMinuteGate(row) && breakdownReadyNow72Momentum40Volume15(row),
};

function byDay(rows: Row[]) {
  const days = new Map<string, Row[]>();
  for (const row of rows) {
    const day = new Date(number(row.startedAt)).toISOString().slice(0, 10);
    days.set(day, [...(days.get(day) ?? []), row]);
  }
  return Object.fromEntries(Array.from(days.entries()).map(([day, values]) => [day, compactGate(values)]));
}

function fileInventory(pattern: RegExp) {
  const files = fs.readdirSync(logsDir).filter((fileName) => pattern.test(fileName));
  return {
    files: files.length,
    bytes: files.reduce((sum, fileName) => sum + fs.statSync(path.join(logsDir, fileName)).size, 0),
  };
}

const recurrence = readJson("recurrence_14d_report.json");
const tradingView = readJson("tradingview_history_14d_report.json");
const ruleScan = readJson("breakout_rule_scan.json");
const signalHistory = readJson("signal_history.json") ?? {};

const gateResults = Object.fromEntries(Object.entries(gates).map(([name, predicate]) => [name, compactGate(joined.filter(predicate))]));
const exactCompositeByDay = Object.fromEntries([
  "tvRecommendationAdx25",
  "currentGateAndTvRecommendationAdx25",
  "tvTrendAdx25Momentum35",
  "currentGateAndTvTrendAdx25Momentum35",
  "breakdownReadyNow72Momentum40Volume15",
  "currentGateAndBreakdownReadyNow72Momentum40Volume15",
].map((name) => [name, byDay(joined.filter(gates[name]))]));
const compact = process.argv.includes("--compact");
const report = {
  generatedAt: new Date().toISOString(),
  methodology: {
    join: "Latest prior same-symbol record within 15 minutes; no future feature records used.",
    duplicationControl: "Candidate gates include raw Position Manager alerts and unique breakout alert IDs.",
    breakoutOutcomeRates: "Decisive excludes missed; completed includes missed as non-wins.",
  },
  inventory: {
    positionManager: { ...fileInventory(/^black_box_position_manager_.*\.jsonl$/i), rows: positionRows.length, usablePairs: pairs.length },
    breakoutAlerts: { rows: breakoutAlerts.length, strictRows: strictBreakoutAlerts.length },
    edgeSamples: { rows: edgeSamples.length },
    intake: { ...fileInventory(/^engine_intake_10m_.*\.jsonl$/i), intervals: intakeRows.length, signalPoints: intakePoints.length },
    snapshots: { ...fileInventory(/^black_box_15m_.*\.jsonl$/i), rows: snapshots.length },
    snapshotOutcomes: { ...fileInventory(/^black_box_outcomes_.*\.jsonl$/i), rows: snapshotOutcomes.length, joined15m: outcomesWithSnapshots.length },
    signalHistoryRows: Object.values(signalHistory).reduce((sum: number, rows) => sum + (Array.isArray(rows) ? rows.length : 0), 0),
    systemAudit: fileInventory(/^system_audit_.*\.jsonl$/i),
  },
  joinCoverage: {
    usablePositionAlerts: joined.length,
    breakout: joined.filter((row) => row.breakout).length,
    edgeSample: joined.filter((row) => row.edgeSample).length,
    intake: joined.filter((row) => row.intake).length,
    snapshot15m: joined.filter((row) => row.snapshotOutcome).length,
    breakoutAgeSeconds: {
      median: percentile(joined.map((row) => number(row.joins.breakoutAgeSeconds)), 0.5),
      p90: percentile(joined.map((row) => number(row.joins.breakoutAgeSeconds)), 0.9),
    },
  },
  gates: gateResults,
  currentGateByDay: byDay(joined.filter(gates.currentFiveMinuteGate)),
  breakoutAlignedByDay: byDay(joined.filter(gates.breakoutDirectionAligned)),
  exactCompositeByDay,
  externalReports: {
    recurrence: { coverage: recurrence?.coverage, byDirection: recurrence?.byDirection, topRules: recurrence?.topRules?.slice?.(0, 8) },
    tradingView: { counts: tradingView?.counts, baseline: tradingView?.baseline, byDirection: tradingView?.byDirection, topRules: tradingView?.topRules?.slice?.(0, 8) },
    ruleScan: { baseline: ruleScan?.baseline, topRules: ruleScan?.topRules?.slice?.(0, 8) },
  },
};

console.log(JSON.stringify(compact ? {
  generatedAt: report.generatedAt,
  methodology: report.methodology,
  inventory: report.inventory,
  joinCoverage: report.joinCoverage,
  gates: gateResults,
  exactCompositeByDay,
} : report, null, 2));