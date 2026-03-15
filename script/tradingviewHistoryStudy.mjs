import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const INPUT = path.resolve(ROOT, "logs", "breakout_alert_history.json");
const OUT_JSON = path.resolve(ROOT, "logs", "tradingview_history_14d_report.json");
const OUT_TXT = path.resolve(ROOT, "logs", "tradingview_history_14d_report.txt");

const LOOKBACK_DAYS = 14;
const NOW = Date.now();
const FROM = NOW - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : Number.NaN;
}

function up(v) {
  return String(v ?? "").trim().toUpperCase();
}

function isCompleted(row) {
  return row?.outcome && row.outcome !== "pending";
}

function isWin(row) {
  return row?.outcome === "win_t1" || row?.outcome === "win_t2";
}

function summarize(rows) {
  const total = rows.length;
  const completed = rows.filter(isCompleted).length;
  const wins = rows.filter(isWin).length;
  const losses = rows.filter((r) => r?.outcome === "loss").length;
  const missed = rows.filter((r) => r?.outcome === "missed").length;
  const pending = rows.filter((r) => r?.outcome === "pending").length;
  const winRate = completed > 0 ? (wins / completed) * 100 : 0;
  return {
    total,
    completed,
    wins,
    losses,
    missed,
    pending,
    winRate: Number(winRate.toFixed(2)),
  };
}

function inBin(value, lo, hi) {
  return Number.isFinite(value) && value >= lo && value < hi;
}

function bucketize(rows, valueFn, bins) {
  return bins.map(([lo, hi]) => {
    const subset = rows.filter((row) => inBin(valueFn(row), lo, hi));
    return {
      bin: `${lo}-${hi}`,
      ...summarize(subset),
    };
  });
}

function hasTvSnapshot(row) {
  return Number.isFinite(num(row?.tvRsi)) &&
    Number.isFinite(num(row?.tvAdx)) &&
    Number.isFinite(num(row?.tvRecommendAll));
}

function isPreCompression(row) {
  const signal = up(row?.signal);
  return signal === "BUILDING" || signal === "SQUEEZE" || signal === "CONSOLIDATING";
}

function hasFallbackWarning(row) {
  const warnings = Array.isArray(row?.warnings) ? row.warnings : [];
  return warnings.some((w) => {
    const x = up(w);
    return x.includes("TV_DERIVED_NO_OHLC") || x.includes("SIMULATED") || x.includes("DEGRADED");
  });
}

function tvDirectionFromRecommend(tvRecommendAll) {
  const v = num(tvRecommendAll);
  if (!Number.isFinite(v)) return "neutral";
  if (v >= 0.15) return "bullish";
  if (v <= -0.15) return "bearish";
  return "neutral";
}

function ruleStats(rows, name, pred, baselineWinRate) {
  const subset = rows.filter(pred);
  const stats = summarize(subset);
  const lift = baselineWinRate > 0 ? stats.winRate / baselineWinRate : 0;
  return {
    rule: name,
    support: stats.completed,
    total: stats.total,
    wins: stats.wins,
    winRate: stats.winRate,
    lift: Number(lift.toFixed(3)),
  };
}

function topRules(rows, baselineWinRate) {
  const rules = [
    ruleStats(
      rows,
      "tv_trend_aligned + tv_adx>=25 + |momentum|>=35",
      (r) => up(r.direction) === up(r.tvTrendDirection) && num(r.tvAdx) >= 25 && Math.abs(num(r.momentumStrength)) >= 35,
      baselineWinRate,
    ),
    ruleStats(
      rows,
      "tv_recommend_direction_match + tv_adx>=25",
      (r) => {
        const recDir = tvDirectionFromRecommend(r.tvRecommendAll);
        return recDir !== "neutral" && recDir === String(r.direction || "").toLowerCase() && num(r.tvAdx) >= 25;
      },
      baselineWinRate,
    ),
    ruleStats(
      rows,
      "tv_rsi_extreme + tv_adx>=25",
      (r) => {
        const rsi = num(r.tvRsi);
        return Number.isFinite(rsi) && (rsi <= 40 || rsi >= 60) && num(r.tvAdx) >= 25;
      },
      baselineWinRate,
    ),
    ruleStats(
      rows,
      "tv_rsi_45_55 + tv_adx<20",
      (r) => {
        const rsi = num(r.tvRsi);
        const adx = num(r.tvAdx);
        return Number.isFinite(rsi) && rsi >= 45 && rsi < 55 && Number.isFinite(adx) && adx < 20;
      },
      baselineWinRate,
    ),
    ruleStats(
      rows,
      "tv_recommend_all<=-0.35 and bearish direction",
      (r) => num(r.tvRecommendAll) <= -0.35 && String(r.direction || "").toLowerCase() === "bearish",
      baselineWinRate,
    ),
    ruleStats(
      rows,
      "tv_recommend_all>=0.35 and bullish direction",
      (r) => num(r.tvRecommendAll) >= 0.35 && String(r.direction || "").toLowerCase() === "bullish",
      baselineWinRate,
    ),
  ];

  return rules
    .filter((r) => r.support >= 12)
    .sort((a, b) => {
      if (b.lift !== a.lift) return b.lift - a.lift;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.support - a.support;
    });
}

if (!fs.existsSync(INPUT)) {
  throw new Error(`Missing input file: ${INPUT}`);
}

const allRows = JSON.parse(fs.readFileSync(INPUT, "utf8"));
const rows14d = allRows.filter((r) => r && Number(r.timestamp) >= FROM);

const tvRows = rows14d.filter(hasTvSnapshot);
const tvPreRows = tvRows.filter(isPreCompression);
const tvPreCompleted = tvPreRows.filter(isCompleted);
const tvPreCompletedStrictReal = tvPreCompleted.filter((r) => !hasFallbackWarning(r));

const baseline = summarize(tvPreCompletedStrictReal);
const baselineWinRate = baseline.winRate;

const bySignalMap = {};
for (const row of tvPreCompletedStrictReal) {
  const key = up(row.signal) || "UNKNOWN";
  if (!bySignalMap[key]) bySignalMap[key] = [];
  bySignalMap[key].push(row);
}
const bySignal = Object.fromEntries(Object.entries(bySignalMap).map(([k, v]) => [k, summarize(v)]));

const byDirectionMap = {};
for (const row of tvPreCompletedStrictReal) {
  const key = String(row.direction || "neutral").toLowerCase();
  if (!byDirectionMap[key]) byDirectionMap[key] = [];
  byDirectionMap[key].push(row);
}
const byDirection = Object.fromEntries(Object.entries(byDirectionMap).map(([k, v]) => [k, summarize(v)]));

const bins = {
  tvRsi: bucketize(tvPreCompletedStrictReal, (r) => num(r.tvRsi), [
    [0, 35],
    [35, 45],
    [45, 55],
    [55, 65],
    [65, 101],
  ]),
  tvAdx: bucketize(tvPreCompletedStrictReal, (r) => num(r.tvAdx), [
    [0, 15],
    [15, 20],
    [20, 25],
    [25, 35],
    [35, 100],
  ]),
  tvRecommendAll: bucketize(tvPreCompletedStrictReal, (r) => num(r.tvRecommendAll), [
    [-1.1, -0.5],
    [-0.5, -0.2],
    [-0.2, 0.2],
    [0.2, 0.5],
    [0.5, 1.1],
  ]),
};

const symbolMap = {};
for (const row of tvPreCompletedStrictReal) {
  const sym = up(row.symbol) || "UNKNOWN";
  if (!symbolMap[sym]) symbolMap[sym] = [];
  symbolMap[sym].push(row);
}
const bySymbol = Object.fromEntries(
  Object.entries(symbolMap)
    .sort((a, b) => b[1].length - a[1].length)
    .map(([k, v]) => [k, summarize(v)])
);

const rules = topRules(tvPreCompletedStrictReal, baselineWinRate);

const report = {
  lookback: {
    days: LOOKBACK_DAYS,
    from: new Date(FROM).toISOString(),
    to: new Date(NOW).toISOString(),
  },
  provenance: {
    source: "breakout_alert_history.json",
    requiresTvFields: ["tvRsi", "tvAdx", "tvRecommendAll"],
    strictRealFilter: "exclude warnings containing TV_DERIVED_NO_OHLC, SIMULATED, DEGRADED",
  },
  counts: {
    rows14d: rows14d.length,
    rowsWithTvSnapshot: tvRows.length,
    preCompressionRowsWithTv: tvPreRows.length,
    preCompressionCompletedWithTv: tvPreCompleted.length,
    preCompressionCompletedStrictReal: tvPreCompletedStrictReal.length,
  },
  baseline,
  bySignal,
  byDirection,
  bins,
  bySymbol,
  topRules: rules,
};

const lines = [];
lines.push("TradingView history recurrence study (14d)");
lines.push(`Window: ${report.lookback.from} -> ${report.lookback.to}`);
lines.push("");
lines.push("Data provenance:");
lines.push(`- Source file: ${report.provenance.source}`);
lines.push(`- Rows with TradingView snapshots: ${report.counts.rowsWithTvSnapshot}/${report.counts.rows14d}`);
lines.push(`- Strict real pre-compression completed rows: ${report.counts.preCompressionCompletedStrictReal}`);
lines.push("");
lines.push("Baseline (strict real + TradingView snapshot + pre-compression):");
lines.push(`- Win rate: ${report.baseline.winRate}%`);
lines.push(`- Wins: ${report.baseline.wins}`);
lines.push(`- Losses: ${report.baseline.losses}`);
lines.push(`- Missed: ${report.baseline.missed}`);
lines.push("");
lines.push("Top TradingView recurrence rules (support >= 12):");
for (const row of rules) {
  lines.push(`- ${row.rule}: winRate ${row.winRate}% | support ${row.support} | lift ${row.lift}x`);
}

fs.writeFileSync(OUT_JSON, JSON.stringify(report, null, 2), "utf8");
fs.writeFileSync(OUT_TXT, lines.join("\n"), "utf8");

console.log(`Wrote ${OUT_JSON}`);
console.log(`Wrote ${OUT_TXT}`);
