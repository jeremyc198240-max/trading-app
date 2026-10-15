import fs from "node:fs";
import path from "node:path";

type Row = Record<string, any>;

interface AlertPair extends Row {
  durationSeconds: number;
  resolvedReason: string;
  returnPct: number | null;
}

const logsDir = path.resolve(process.cwd(), "logs");
const files = fs.existsSync(logsDir)
  ? fs.readdirSync(logsDir).filter((file) => /^black_box_position_manager_.*\.jsonl$/i.test(file)).sort()
  : [];

const rows = files.flatMap((file) => fs.readFileSync(path.join(logsDir, file), "utf8").split(/\r?\n/)
  .filter(Boolean)
  .flatMap((line) => {
    try {
      return [{ ...JSON.parse(line), sourceFile: file }];
    } catch {
      return [];
    }
  }));

const activatedRows = rows.filter((row) => row.event === "activated");
const resolvedRows = rows.filter((row) => row.event === "resolved");
const activations = new Map<string, Row>();
const resolutions = new Map<string, Row>();
for (const row of activatedRows) if (!activations.has(row.alertId)) activations.set(row.alertId, row);
for (const row of resolvedRows) if (!resolutions.has(row.alertId)) resolutions.set(row.alertId, row);

const pairs: AlertPair[] = Array.from(activations.entries()).flatMap(([alertId, activation]) => {
  const resolution = resolutions.get(alertId);
  if (!resolution) return [];
  const startPrice = Number(activation.startPrice);
  const endPrice = Number(resolution.endPrice);
  const rawReturn = startPrice > 0 && Number.isFinite(endPrice)
    ? (activation.side === "CALL" ? endPrice - startPrice : startPrice - endPrice) / startPrice * 100
    : null;
  return [{
    ...activation,
    durationSeconds: Number(resolution.durationSeconds),
    resolvedReason: String(resolution.resolvedReason ?? "unknown"),
    returnPct: rawReturn == null ? null : Number(rawReturn.toFixed(4)),
  }];
});

const usable = pairs.filter((row) =>
  row.returnPct != null && !["page_hidden", "symbol_changed"].includes(row.resolvedReason),
);

function percentile(values: number[], fraction: number): number | null {
  const sorted = values.filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * fraction))];
}

function summarize(sample: AlertPair[]) {
  const returns = sample.map((row) => row.returnPct).filter((value): value is number => value != null);
  const durations = sample.map((row) => row.durationSeconds).filter(Number.isFinite);
  const positive = returns.filter((value) => value > 0).length;
  return {
    count: sample.length,
    positive,
    flat: returns.filter((value) => value === 0).length,
    negative: returns.filter((value) => value < 0).length,
    positiveRate: returns.length ? Number((positive / returns.length * 100).toFixed(1)) : null,
    meanReturnPct: returns.length ? Number((returns.reduce((sum, value) => sum + value, 0) / returns.length).toFixed(4)) : null,
    medianReturnPct: percentile(returns, 0.5),
    medianDurationSeconds: percentile(durations, 0.5),
    p75DurationSeconds: percentile(durations, 0.75),
    p90DurationSeconds: percentile(durations, 0.9),
    under15Seconds: durations.filter((value) => value < 15).length,
    under60Seconds: durations.filter((value) => value < 60).length,
    under180Seconds: durations.filter((value) => value < 180).length,
  };
}

function groupBy(label: (row: AlertPair) => string, sample = usable) {
  return Object.fromEntries(Array.from(new Set(sample.map(label))).sort().map((key) => [
    key,
    compactSummary(sample.filter((row) => label(row) === key)),
  ]));
}

function compactSummary(sample: AlertPair[]) {
  const summary = summarize(sample);
  return {
    count: summary.count,
    positiveRate: summary.positiveRate,
    meanReturnPct: summary.meanReturnPct,
    medianReturnPct: summary.medianReturnPct,
    medianDurationSeconds: summary.medianDurationSeconds,
  };
}

function ignitionDirection(row: AlertPair): "MATCH" | "WAIT" | "OPPOSE" {
  const direction = String(row.ignition?.direction ?? "WAIT").toUpperCase();
  if (direction === "WAIT") return "WAIT";
  return direction === row.side ? "MATCH" : "OPPOSE";
}

function signalScore(row: AlertPair, label: string): number | null {
  const signal = (row.signals ?? []).find((candidate: Row) => candidate.label === label);
  const score = Number(signal?.score);
  return Number.isFinite(score) ? score : null;
}

function hasConfirmedFiveMinute(row: AlertPair): boolean {
  return ["ACCEPTED", "RETEST HELD", "TESTING"].includes(row.fiveMinuteState);
}

const sortedActivations = Array.from(activations.values()).sort((left, right) => left.startedAt - right.startedAt);
const reactivationDelays = pairs.flatMap((pair) => {
  const endedAt = Number(resolutions.get(pair.alertId)?.endedAt);
  const next = sortedActivations.find((row) =>
    row.alertId !== pair.alertId && row.symbol === pair.symbol && row.side === pair.side && row.startedAt >= endedAt,
  );
  return next ? [(Number(next.startedAt) - endedAt) / 1000] : [];
});

const candidateGates: Record<string, (row: AlertPair) => boolean> = {
  all: () => true,
  scoreAtLeast58: (row) => row.score >= 58,
  scoreAtLeast60: (row) => row.score >= 60,
  scoreAtLeast61: (row) => row.score >= 61,
  gapAtLeast22: (row) => row.scoreGap >= 22,
  score58AndGap22: (row) => row.score >= 58 && row.scoreGap >= 22,
  probabilityAtLeast40: (row) => (signalScore(row, "Probability") ?? 0) >= 40,
  ignitionMatches: (row) => ignitionDirection(row) === "MATCH",
  confirmedFiveMinute: hasConfirmedFiveMinute,
  confirmedFiveMinuteAndProbability40: (row) => hasConfirmedFiveMinute(row) && (signalScore(row, "Probability") ?? 0) >= 40,
  score58Gap22ConfirmedFiveMinute: (row) => row.score >= 58 && row.scoreGap >= 22 && hasConfirmedFiveMinute(row),
  usableOneMinute: (row) => !["NO 1M DATA", "1M DATA STALE"].includes(row.studyState),
  freshBreakout: (row) => row.breakoutAgeMinutes == null || row.breakoutAgeMinutes <= 15,
};

const signalRows = usable.flatMap((row) => (row.signals ?? []).map((signal: Row) => ({
  ...row,
  signalKey: `${String(signal.label).replace(/ \d+$/, "")}|${signal.classification}`,
})));
const selectedGate = usable.filter(candidateGates.confirmedFiveMinute);

console.log(JSON.stringify({
  files,
  eventCounts: {
    rows: rows.length,
    activated: activatedRows.length,
    resolved: resolvedRows.length,
    uniqueActivations: activations.size,
    uniqueResolutions: resolutions.size,
    paired: pairs.length,
    usable: usable.length,
    unresolved: Array.from(activations.keys()).filter((alertId) => !resolutions.has(alertId)).length,
    resolvedWithoutActivation: Array.from(resolutions.keys()).filter((alertId) => !activations.has(alertId)).length,
    duplicateActivations: activatedRows.length - activations.size,
    duplicateResolutions: resolvedRows.length - resolutions.size,
  },
  overall: summarize(usable),
  bySourceFile: groupBy((row) => row.sourceFile),
  bySymbol: groupBy((row) => row.symbol),
  bySide: groupBy((row) => row.side),
  byTimeframe: groupBy((row) => row.timeframe),
  byResolutionReason: groupBy((row) => row.resolvedReason, pairs),
  byScore: groupBy((row) => row.score < 58 ? "55-57.99" : row.score < 61 ? "58-60.99" : "61+"),
  byScoreGap: groupBy((row) => row.scoreGap < 18 ? "6-17.99" : row.scoreGap < 22 ? "18-21.99" : row.scoreGap < 26 ? "22-25.99" : "26+"),
  byStudyState: groupBy((row) => row.studyState),
  byFiveMinuteState: groupBy((row) => String(row.fiveMinuteState)),
  byIgnitionState: groupBy((row) => String(row.ignition?.state)),
  byIgnitionDirection: groupBy(ignitionDirection),
  byBreakoutAge: groupBy((row) => row.breakoutAgeMinutes == null ? "null" : row.breakoutAgeMinutes <= 15 ? "<=15" : row.breakoutAgeMinutes <= 60 ? "15-60" : ">60"),
  candidateGates: Object.fromEntries(Object.entries(candidateGates).map(([name, predicate]) => [name, compactSummary(usable.filter(predicate))])),
  selectedGate: {
    overall: summarize(selectedGate),
    bySourceFile: groupBy((row) => row.sourceFile, selectedGate),
    bySymbol: groupBy((row) => row.symbol, selectedGate),
    bySide: groupBy((row) => row.side, selectedGate),
    byTimeframe: groupBy((row) => row.timeframe, selectedGate),
  },
  reactivation: {
    count: reactivationDelays.length,
    under5Seconds: reactivationDelays.filter((value) => value < 5).length,
    under15Seconds: reactivationDelays.filter((value) => value < 15).length,
    under60Seconds: reactivationDelays.filter((value) => value < 60).length,
    medianSeconds: percentile(reactivationDelays, 0.5),
    p90Seconds: percentile(reactivationDelays, 0.9),
  },
  signalClassifications: groupBy((row) => row.signalKey, signalRows),
  suspicious: {
    activationWithBreakoutAgeOver60: activatedRows.filter((row) => row.breakoutAgeMinutes > 60).length,
    activationWithWaitIgnition: activatedRows.filter((row) => String(row.ignition?.direction ?? "WAIT").toUpperCase() === "WAIT").length,
    activationWithFiveMinuteWaiting: activatedRows.filter((row) => row.fiveMinuteState === "WAITING").length,
    activationWithMissingOrStaleOneMinute: activatedRows.filter((row) => ["NO 1M DATA", "1M DATA STALE"].includes(row.studyState)).length,
    zeroDurationPairs: pairs.filter((row) => row.durationSeconds === 0).length,
  },
}, null, 2));