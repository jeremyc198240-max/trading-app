import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const INPUT_PATH = path.resolve(ROOT, "logs", "breakout_alert_history.json");
const OUTPUT_JSON = path.resolve(ROOT, "logs", "recurrence_14d_report.json");
const OUTPUT_TXT = path.resolve(ROOT, "logs", "recurrence_14d_report.txt");

const LOOKBACK_DAYS = 14;
const NOW = Date.now();
const FROM = NOW - LOOKBACK_DAYS * 24 * 60 * 60 * 1000;

function isFiniteNumber(value) {
  const n = Number(value);
  return Number.isFinite(n);
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function safeUpper(value) {
  return String(value ?? "").trim().toUpperCase();
}

function isWin(row) {
  return row.outcome === "win_t1" || row.outcome === "win_t2";
}

function isCompleted(row) {
  return row.outcome && row.outcome !== "pending";
}

function isPreCompressionSignal(signal) {
  const s = safeUpper(signal);
  return s === "BUILDING" || s === "SQUEEZE" || s === "CONSOLIDATING";
}

function hasTrendConflict(row) {
  const warnings = Array.isArray(row.warnings) ? row.warnings : [];
  return warnings.some((warning) => {
    const up = safeUpper(warning);
    return up.includes("TV_TREND_CONFLICT") || up.includes("TREND_CONFLICT") || up.includes("TV_RECOMMEND_OPPOSE");
  });
}

function directionAlignedWithTv(row) {
  const dir = safeUpper(row.direction);
  const tv = safeUpper(row.tvTrendDirection);
  return dir !== "" && tv !== "" && dir === tv;
}

function summarize(rows) {
  const wins = rows.filter(isWin).length;
  const losses = rows.filter((r) => r.outcome === "loss").length;
  const missed = rows.filter((r) => r.outcome === "missed").length;
  const pending = rows.filter((r) => r.outcome === "pending").length;
  const completed = rows.filter(isCompleted).length;
  const total = rows.length;
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

function bucketize(rows, accessor, buckets) {
  return buckets.map((bucket) => {
    const [lo, hi] = bucket;
    const subset = rows.filter((row) => {
      const value = accessor(row);
      if (!isFiniteNumber(value)) return false;
      const n = Number(value);
      return n >= lo && n < hi;
    });
    const stats = summarize(subset);
    return {
      bin: `${lo}-${hi}`,
      ...stats,
    };
  });
}

function normalizePhase(phase) {
  return safeUpper(phase || "WAIT");
}

function buildFeatureMap(row) {
  const signal = safeUpper(row.signal);
  const direction = safeUpper(row.direction);
  const phase = normalizePhase(row.compression?.phase);
  const spark = toNumber(row.compression?.sparkScore, 0);
  const bbWidth = toNumber(row.compression?.bbWidth, Number.NaN);
  const volumeSpike = toNumber(row.volumeSpike, Number.NaN);
  const momentum = toNumber(row.momentumStrength, Number.NaN);
  const momentumAbs = Math.abs(momentum);
  const rsi = toNumber(row.rsiValue, Number.NaN);
  const adx = toNumber(row.tvAdx, Number.NaN);
  const tvRec = toNumber(row.tvRecommendAll, Number.NaN);
  const setupScore = toNumber(row.preBreakoutSetup?.score, Number.NaN);
  const eta = toNumber(row.preBreakoutSetup?.etaMinutes, Number.NaN);
  const stackAgreement = toNumber(row.timeframeStack?.agreement, Number.NaN);
  const stackBias = safeUpper(row.timeframeStack?.bias);

  return {
    signal,
    direction,
    phase,
    spark,
    bbWidth,
    volumeSpike,
    momentumAbs,
    rsi,
    adx,
    tvRec,
    setupScore,
    eta,
    stackAgreement,
    stackBias,
    noTrendConflict: !hasTrendConflict(row),
    tvAligned: directionAlignedWithTv(row),
    phaseReadyNow: phase === "READY" || phase === "NOW",
    sparkHigh: spark >= 60,
    bbTight: isFiniteNumber(bbWidth) && bbWidth <= 0.8,
    volumeNotDry: isFiniteNumber(volumeSpike) && volumeSpike >= 0.95,
    momentumActive: isFiniteNumber(momentumAbs) && momentumAbs >= 25,
    rsiBalanced: isFiniteNumber(rsi) && rsi >= 45 && rsi <= 70,
    adxTrending: isFiniteNumber(adx) && adx >= 18,
    tvRecommendNotHardOppose: isFiniteNumber(tvRec) ? tvRec > -0.5 : false,
    setupScoreStrong: isFiniteNumber(setupScore) && setupScore >= 70,
    etaEarly: isFiniteNumber(eta) && eta > 0 && eta <= 10,
    stackAgreementStrong: isFiniteNumber(stackAgreement) && stackAgreement >= 55,
    stackBiasMatchesDirection:
      (direction === "BULLISH" && stackBias === "BULLISH") ||
      (direction === "BEARISH" && stackBias === "BEARISH"),
  };
}

function evaluateRule(rows, name, predicate, baselineWinRate) {
  const subset = rows.filter(predicate);
  const rawRows = subset.map((item) => item.row ?? item);
  const stats = summarize(rawRows);
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

function sortRules(rules) {
  return rules
    .filter((r) => r.support >= 12)
    .sort((a, b) => {
      if (b.lift !== a.lift) return b.lift - a.lift;
      if (b.winRate !== a.winRate) return b.winRate - a.winRate;
      return b.support - a.support;
    });
}

if (!fs.existsSync(INPUT_PATH)) {
  throw new Error(`Missing input file: ${INPUT_PATH}`);
}

const allRows = JSON.parse(fs.readFileSync(INPUT_PATH, "utf8"));
const rowsInRange = allRows.filter((row) => row && Number(row.timestamp) >= FROM);
const completedInRange = rowsInRange.filter(isCompleted);

const preCompressionRows = rowsInRange.filter((row) => isPreCompressionSignal(row.signal));
const preCompressionCompleted = preCompressionRows.filter(isCompleted);
const preWithFeatures = preCompressionCompleted.map((row) => ({ row, f: buildFeatureMap(row) }));

const baseline = summarize(preCompressionCompleted);
const baselineWinRate = baseline.winRate;

const directional = {
  bullish: preCompressionCompleted.filter((row) => safeUpper(row.direction) === "BULLISH"),
  bearish: preCompressionCompleted.filter((row) => safeUpper(row.direction) === "BEARISH"),
  neutral: preCompressionCompleted.filter((row) => safeUpper(row.direction) === "NEUTRAL"),
};

const bySignal = {};
for (const row of preCompressionCompleted) {
  const key = safeUpper(row.signal) || "UNKNOWN";
  if (!bySignal[key]) bySignal[key] = [];
  bySignal[key].push(row);
}

const signalBreakdown = Object.fromEntries(
  Object.entries(bySignal).map(([signal, rows]) => [signal, summarize(rows)])
);

const indicatorBuckets = {
  bbWidth: bucketize(preCompressionCompleted, (row) => row.compression?.bbWidth, [
    [0, 0.5],
    [0.5, 0.8],
    [0.8, 1.1],
    [1.1, 10],
  ]),
  sparkScore: bucketize(preCompressionCompleted, (row) => row.compression?.sparkScore, [
    [0, 45],
    [45, 60],
    [60, 75],
    [75, 101],
  ]),
  volumeSpike: bucketize(preCompressionCompleted, (row) => row.volumeSpike, [
    [0, 0.9],
    [0.9, 1.05],
    [1.05, 1.25],
    [1.25, 10],
  ]),
  rsi: bucketize(preCompressionCompleted, (row) => row.rsiValue, [
    [0, 40],
    [40, 48],
    [48, 56],
    [56, 65],
    [65, 101],
  ]),
  momentumAbs: bucketize(preCompressionCompleted, (row) => Math.abs(toNumber(row.momentumStrength, Number.NaN)), [
    [0, 20],
    [20, 35],
    [35, 55],
    [55, 200],
  ]),
  tvAdx: bucketize(preCompressionCompleted, (row) => row.tvAdx, [
    [0, 15],
    [15, 20],
    [20, 25],
    [25, 100],
  ]),
};

const ruleCandidates = [
  {
    name: "phase_ready_now + spark_high + bb_tight + momentum_active + no_trend_conflict",
    test: (x) => x.f.phaseReadyNow && x.f.sparkHigh && x.f.bbTight && x.f.momentumActive && x.f.noTrendConflict,
  },
  {
    name: "phase_ready_now + bb_tight + volume_not_dry + momentum_active",
    test: (x) => x.f.phaseReadyNow && x.f.bbTight && x.f.volumeNotDry && x.f.momentumActive,
  },
  {
    name: "spark_high + rsi_balanced + adx_trending + no_trend_conflict",
    test: (x) => x.f.sparkHigh && x.f.rsiBalanced && x.f.adxTrending && x.f.noTrendConflict,
  },
  {
    name: "phase_ready_now + setup_score_strong + eta_early",
    test: (x) => x.f.phaseReadyNow && x.f.setupScoreStrong && x.f.etaEarly,
  },
  {
    name: "phase_ready_now + stack_agreement_strong + stack_bias_matches_direction",
    test: (x) => x.f.phaseReadyNow && x.f.stackAgreementStrong && x.f.stackBiasMatchesDirection,
  },
  {
    name: "tv_aligned + spark_high + momentum_active",
    test: (x) => x.f.tvAligned && x.f.sparkHigh && x.f.momentumActive,
  },
  {
    name: "bb_tight + volume_not_dry + rsi_balanced + momentum_active + no_trend_conflict",
    test: (x) => x.f.bbTight && x.f.volumeNotDry && x.f.rsiBalanced && x.f.momentumActive && x.f.noTrendConflict,
  },
  {
    name: "tv_recommend_not_hard_oppose + spark_high + phase_ready_now",
    test: (x) => x.f.tvRecommendNotHardOppose && x.f.sparkHigh && x.f.phaseReadyNow,
  },
];

const ruleStats = sortRules(
  ruleCandidates.map((rule) =>
    evaluateRule(preWithFeatures, rule.name, rule.test, baselineWinRate)
  )
);

const conflictSubset = preCompressionCompleted.filter(hasTrendConflict);
const alignedSubset = preCompressionCompleted.filter(directionAlignedWithTv);

const report = {
  lookback: {
    days: LOOKBACK_DAYS,
    from: new Date(FROM).toISOString(),
    to: new Date(NOW).toISOString(),
  },
  coverage: {
    allSignals: summarize(rowsInRange),
    completedAllSignals: summarize(completedInRange),
    preCompressionAll: summarize(preCompressionRows),
    preCompressionCompleted: baseline,
  },
  bySignal: signalBreakdown,
  byDirection: {
    bullish: summarize(directional.bullish),
    bearish: summarize(directional.bearish),
    neutral: summarize(directional.neutral),
  },
  indicatorBuckets,
  tvContext: {
    trendConflict: summarize(conflictSubset),
    trendAligned: summarize(alignedSubset),
  },
  topRules: ruleStats.slice(0, 8),
  missingIndicators: [
    "Fast stochastic (FSTO) is not persisted in breakout history.",
    "Parabolic SAR is not persisted in breakout history.",
    "Raw MACD line/signal values are not persisted; momentumStrength is available as a proxy.",
  ],
};

const lines = [];
lines.push(`Recurrence study lookback: ${LOOKBACK_DAYS} days`);
lines.push(`Window: ${report.lookback.from} -> ${report.lookback.to}`);
lines.push("");
lines.push("Pre-compression baseline:");
lines.push(`- Completed samples: ${baseline.completed}`);
lines.push(`- Wins: ${baseline.wins}`);
lines.push(`- Win rate: ${baseline.winRate}%`);
lines.push("");
lines.push("Top recurrence rules (support >= 12):");
for (const rule of report.topRules) {
  lines.push(`- ${rule.rule}: winRate ${rule.winRate}% | support ${rule.support} | lift ${rule.lift}x`);
}
lines.push("");
lines.push("Missing captured indicators:");
for (const item of report.missingIndicators) {
  lines.push(`- ${item}`);
}

fs.writeFileSync(OUTPUT_JSON, JSON.stringify(report, null, 2), "utf8");
fs.writeFileSync(OUTPUT_TXT, lines.join("\n"), "utf8");

console.log(`Wrote ${OUTPUT_JSON}`);
console.log(`Wrote ${OUTPUT_TXT}`);
