import fs from "node:fs";
import path from "node:path";

type Row = Record<string, any>;

const logsDir = path.resolve(process.cwd(), "logs");
const requestedSymbol = String(process.argv[2] ?? "SPY").toUpperCase();

function loadJson(file: string): any {
  return JSON.parse(fs.readFileSync(path.join(logsDir, file), "utf8"));
}

function loadJsonl(file: string): Row[] {
  return fs.readFileSync(path.join(logsDir, file), "utf8").split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try { return [JSON.parse(line)]; } catch { return []; }
  });
}

function outcomeKind(row: Row): "win" | "loss" | "miss" | "pending" {
  const outcome = String(row.outcome ?? row.result ?? "pending").toLowerCase();
  if (outcome.startsWith("win")) return "win";
  if (outcome === "loss" || outcome.includes("stop")) return "loss";
  if (outcome.includes("miss")) return "miss";
  return "pending";
}

function summary(rows: Row[]) {
  const counts = { total: rows.length, wins: 0, losses: 0, missed: 0, pending: 0 };
  for (const row of rows) {
    const kind = outcomeKind(row);
    if (kind === "win") counts.wins += 1;
    if (kind === "loss") counts.losses += 1;
    if (kind === "miss") counts.missed += 1;
    if (kind === "pending") counts.pending += 1;
  }
  const decisive = counts.wins + counts.losses;
  return { ...counts, decisive, winRate: decisive ? Number((counts.wins / decisive * 100).toFixed(2)) : null };
}

function groups(rows: Row[], key: (row: Row) => string) {
  return Object.fromEntries([...Map.groupBy(rows, key)].map(([name, values]) => [name, summary(values)]));
}

function numberBucket(value: unknown, cuts: number[], labels: string[]): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "missing";
  const index = cuts.findIndex((cut) => numeric < cut);
  return labels[index < 0 ? labels.length - 1 : index];
}

const files = fs.readdirSync(logsDir).sort();
const inventory = files.map((file) => {
  const stat = fs.statSync(path.join(logsDir, file));
  let records: number | null = null;
  try {
    if (file.endsWith(".jsonl")) records = loadJsonl(file).length;
    if (file.endsWith(".json")) {
      const parsed = loadJson(file);
      records = Array.isArray(parsed) ? parsed.length : Object.keys(parsed).length;
    }
  } catch {
    records = null;
  }
  return { file, bytes: stat.size, records };
});

const alerts = loadJson("breakout_alert_history.json") as Row[];
const strictAlerts = alerts.filter((row) => !(row.warnings ?? []).some((warning: string) =>
  /TV_DERIVED_NO_OHLC|SIMULATED|DEGRADED/.test(warning),
));
const symbolAlerts = strictAlerts.filter((row) => String(row.symbol).toUpperCase() === requestedSymbol);
const latestAlertTime = Math.max(0, ...strictAlerts.map((row) => Number(row.timestamp) || 0));
const recent48h = strictAlerts.filter((row) => Number(row.timestamp) >= latestAlertTime - 48 * 60 * 60 * 1000);
const symbolRecent48h = recent48h.filter((row) => String(row.symbol).toUpperCase() === requestedSymbol);

function alertBreakdown(rows: Row[]) {
  return {
    summary: summary(rows),
    mode: groups(rows, (row) => String(row.mode ?? "unknown")),
    direction: groups(rows, (row) => String(row.direction ?? "unknown")),
    quality: groups(rows, (row) => String(row.signalQuality ?? "unknown")),
    signal: groups(rows, (row) => String(row.signal ?? "unknown")),
    edgeScore: groups(rows, (row) => numberBucket(row.edgeEngine?.edgeScore, [60, 72, 80], ["<60", "60-71", "72-79", "80+"])),
    confidence: groups(rows, (row) => numberBucket(row.edgeEngine?.confidence, [55, 70, 85], ["<55", "55-69", "70-84", "85+"])),
    adx: groups(rows, (row) => numberBucket(row.edgeEngine?.indicators?.adx ?? row.tvAdx, [20, 25], ["<20", "20-24", "25+"])),
    bbWidth: groups(rows, (row) => numberBucket(row.compression?.bbWidth, [0.5, 0.8, 1.1], ["<0.5", "0.5-0.79", "0.8-1.09", "1.1+"])),
    momentumAbs: groups(rows, (row) => numberBucket(Math.abs(Number(row.momentumStrength)), [20, 35, 55], ["<20", "20-34", "35-54", "55+"])),
    timeframeAgreement: groups(rows, (row) => numberBucket(row.timeframeStack?.agreement, [50, 75, 100], ["<50", "50-74", "75-99", "100"])),
  };
}

const edgeWindows = loadJsonl("edge_tuning_2d_log.jsonl");
const latestEdgeWindow = edgeWindows.at(-1) ?? null;
const recurrence = loadJson("recurrence_14d_report.json");
const tradingView = loadJson("tradingview_history_14d_report.json");
const ruleScan = loadJson("breakout_rule_scan.json");
const daily = loadJsonl("signal_history_daily.jsonl");
const edgeSamples = loadJson("edge_engine_samples.json") as Row[];
const auditFiles = files.filter((file) => /^system_audit_.*\.jsonl$/.test(file));
const auditRows = auditFiles.flatMap(loadJsonl);

const report = {
  generatedAt: new Date().toISOString(),
  requestedSymbol,
  inventory,
  breakoutAlerts: {
    strictAll: alertBreakdown(strictAlerts),
    symbolAll: alertBreakdown(symbolAlerts),
    recent48h: alertBreakdown(recent48h),
    symbolRecent48h: alertBreakdown(symbolRecent48h),
  },
  edge48hLatest: latestEdgeWindow,
  edgeSamples: {
    total: edgeSamples.length,
    symbol: edgeSamples.filter((row) => String(row.symbol).toUpperCase() === requestedSymbol).length,
  },
  dailySignalHistory: daily,
  recurrence14d: {
    coverage: recurrence.coverage,
    byDirection: recurrence.byDirection,
    indicatorBuckets: recurrence.indicatorBuckets,
    topRules: recurrence.topRules,
  },
  tradingView14d: {
    counts: tradingView.counts,
    baseline: tradingView.baseline,
    byDirection: tradingView.byDirection,
    bins: tradingView.bins,
    topRules: tradingView.topRules,
  },
  ruleScan: { baseline: ruleScan.baseline, topRules: ruleScan.topRules?.slice(0, 10) },
  systemAudit: {
    rows: auditRows.length,
    eventTypes: Object.fromEntries([...Map.groupBy(auditRows, (row) => String(row.eventType ?? row.type ?? "unknown"))]
      .map(([name, values]) => [name, values.length]).sort((left, right) => right[1] - left[1])),
  },
};

const compact = process.argv.includes("--compact");
console.log(JSON.stringify(compact ? {
  generatedAt: report.generatedAt,
  requestedSymbol,
  inventory: {
    files: inventory.length,
    bytes: inventory.reduce((sum, file) => sum + file.bytes, 0),
    records: inventory.reduce((sum, file) => sum + (file.records ?? 0), 0),
  },
  symbolAll: report.breakoutAlerts.symbolAll,
  symbolRecent48h: report.breakoutAlerts.symbolRecent48h,
  recent48hAllSymbols: report.breakoutAlerts.recent48h.summary,
  latestEdge48h: latestEdgeWindow ? {
    rolledAt: latestEdgeWindow.rolledAt,
    sample: latestEdgeWindow.sample,
    quality: latestEdgeWindow.quality,
    indicatorMeans: latestEdgeWindow.indicatorMeans,
    mix: latestEdgeWindow.mix,
  } : null,
  historicalEvidence: {
    recurrenceCoverage: recurrence.coverage,
    direction: recurrence.byDirection,
    bbWidth: recurrence.indicatorBuckets?.bbWidth,
    momentumAbs: recurrence.indicatorBuckets?.momentumAbs,
    tvAdx: recurrence.indicatorBuckets?.tvAdx,
    recurrenceTopRules: recurrence.topRules,
    tradingViewTopRules: tradingView.topRules,
    breakoutRuleTop: ruleScan.topRules?.[0],
  },
  edgeSamples: report.edgeSamples,
  dailySignalHistory: report.dailySignalHistory,
  systemAudit: report.systemAudit,
} : report, null, 2));