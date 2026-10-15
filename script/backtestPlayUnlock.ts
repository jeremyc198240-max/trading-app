import fs from "node:fs";
import path from "node:path";

type Row = Record<string, any>;
type Result = "win" | "loss" | "miss" | "pending";

const logsDir = path.resolve(process.cwd(), "logs");
const requestedSymbol = String(process.argv[2] ?? "ALL").toUpperCase();
const alerts = JSON.parse(fs.readFileSync(path.join(logsDir, "breakout_alert_history.json"), "utf8")) as Row[];

function result(row: Row): Result {
  const value = String(row.outcome ?? "pending").toLowerCase();
  if (value.startsWith("win")) return "win";
  if (value === "loss" || value.includes("stop")) return "loss";
  if (value.includes("miss")) return "miss";
  return "pending";
}

function stats(rows: Row[]) {
  const completed = rows.filter((row) => result(row) !== "pending");
  const wins = completed.filter((row) => result(row) === "win").length;
  const losses = completed.filter((row) => result(row) === "loss").length;
  const misses = completed.filter((row) => result(row) === "miss").length;
  const decisions = wins + losses;
  return {
    alerts: rows.length,
    completed: completed.length,
    wins,
    losses,
    misses,
    pending: rows.length - completed.length,
    winRateExcludingMisses: decisions ? Number((wins / decisions * 100).toFixed(2)) : null,
    realizedHitRate: completed.length ? Number((wins / completed.length * 100).toFixed(2)) : null,
  };
}

function easternHour(row: Row): string {
  const timestamp = Number(row.timestamp);
  if (!Number.isFinite(timestamp)) return "unknown";
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    hour: "2-digit",
  }).formatToParts(new Date(timestamp)).find((part) => part.type === "hour")?.value;
  return hour == null ? "unknown" : `${hour}:00 ET`;
}

function easternSessionWindow(row: Row): string {
  const hour = Number(easternHour(row).slice(0, 2));
  if (!Number.isFinite(hour)) return "unknown";
  if (hour < 10) return "09:30-10:00 ET";
  if (hour < 11) return "10:00-11:00 ET";
  if (hour < 12) return "11:00-12:00 ET";
  if (hour < 13) return "12:00-13:00 ET";
  if (hour < 14) return "13:00-14:00 ET";
  if (hour < 15) return "14:00-15:00 ET";
  if (hour < 16) return "15:00-16:00 ET";
  return "after-hours ET";
}

function rankedGroups(rows: Row[], key: (row: Row) => string) {
  return Object.entries(Object.fromEntries([...Map.groupBy(rows, key)]
    .map(([name, group]) => [name, stats(group)])))
    .map(([name, result]) => ({ name, ...(result as ReturnType<typeof stats>) }))
    .sort((left, right) => {
      if (right.decisive !== left.decisive) return right.decisive - left.decisive;
      return (right.winRateExcludingMisses ?? -1) - (left.winRateExcludingMisses ?? -1);
    });
}

function strictReal(row: Row): boolean {
  return !(row.warnings ?? []).some((warning: string) => /TV_DERIVED_NO_OHLC|SIMULATED|DEGRADED/.test(warning));
}

function directionMatches(row: Row): boolean {
  const alertDirection = String(row.direction);
  const edgeDirection = String(row.edgeEngine?.direction);
  return (alertDirection === "bullish" && edgeDirection === "bullish") ||
    (alertDirection === "bearish" && edgeDirection === "bearish");
}

const source = alerts
  .filter(strictReal)
  .filter((row) => requestedSymbol === "ALL" || String(row.symbol).toUpperCase() === requestedSymbol)
  .sort((left, right) => Number(left.timestamp) - Number(right.timestamp));

function gates(row: Row) {
  const adx = Number(row.edgeEngine?.indicators?.adx ?? row.tvAdx);
  const momentum = Math.abs(Number(row.momentumStrength ?? row.edgeEngine?.indicators?.momentum));
  const bbWidth = Number(row.compression?.bbWidth);
  const phase = String(row.compression?.phase ?? "").toUpperCase();
  const edgeState = String(row.edgeEngine?.state ?? "").toUpperCase();
  const agreement = Number(row.timeframeStack?.agreement);
  return {
    trend: Number.isFinite(adx) && adx >= 25,
    momentum: Number.isFinite(momentum) && momentum >= 35,
    expansion: (Number.isFinite(bbWidth) && bbWidth >= 0.5) || phase === "READY" || phase === "NOW" || edgeState === "TRIGGERED",
    alignment: directionMatches(row) && agreement >= 100,
  };
}

const withGates = source.map((row) => ({ row, gates: gates(row) }));
const select = (...required: Array<keyof ReturnType<typeof gates>>) => withGates
  .filter((entry) => required.every((gate) => entry.gates[gate]))
  .map((entry) => entry.row);
const unlocked = select("trend", "momentum", "expansion", "alignment");
const latestTimestamp = Math.max(0, ...source.map((row) => Number(row.timestamp) || 0));
const recent48h = unlocked.filter((row) => Number(row.timestamp) >= latestTimestamp - 48 * 60 * 60 * 1000);

console.log(JSON.stringify({
  generatedAt: new Date().toISOString(),
  symbol: requestedSymbol,
  methodology: {
    source: "breakout_alert_history.json strict-real rows",
    trend: "ADX >= 25",
    momentum: "absolute momentum >= 35",
    expansion: "BB width >= 0.5 or READY/NOW/TRIGGERED",
    alignment: "alert direction matches edge direction and MTF agreement = 100",
    note: "Historical alignment is the persisted proxy for live tape confirmation. The unreliable 48-hour edge calibration is excluded from play unlock eligibility.",
  },
  baseline: stats(source),
  incremental: {
    trend: stats(select("trend")),
    trendMomentum: stats(select("trend", "momentum")),
    trendMomentumExpansion: stats(select("trend", "momentum", "expansion")),
    plusAlignment: stats(select("trend", "momentum", "expansion", "alignment")),
    allFourEngineGates: stats(unlocked),
  },
  unlocked: {
    overall: stats(unlocked),
    executeOnly: stats(unlocked.filter((row) => row.mode === "EXECUTE")),
    prepareOnly: stats(unlocked.filter((row) => row.mode === "PREPARE")),
    bullish: stats(unlocked.filter((row) => row.direction === "bullish")),
    bearish: stats(unlocked.filter((row) => row.direction === "bearish")),
    recent48h: stats(recent48h),
    symbols: Object.fromEntries([...Map.groupBy(unlocked, (row) => String(row.symbol))]
      .map(([symbol, rows]) => [symbol, stats(rows)])),
    timeframePerformance: rankedGroups(unlocked, (row) => String(row.timeframe ?? "unknown")),
    easternHourPerformance: rankedGroups(unlocked, easternHour),
    easternSessionPerformance: rankedGroups(unlocked, easternSessionWindow),
    tickerTimeframeSessionPerformance: rankedGroups(
      unlocked,
      (row) => `${String(row.symbol)} | ${String(row.timeframe ?? "unknown")} | ${easternSessionWindow(row)}`,
    ),
  },
}, null, 2));