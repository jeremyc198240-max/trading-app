import fs from "fs";
import path from "path";
import { analyzeSymbol } from "./finance";
import { fetchLiveOHLC, type OHLC } from "./marketData";
import { runMonsterOTMEngine, type MonsterOtmTuningOverrides } from "./monsterOtmEngine";

const LOOKBACK = 120;
const MAX_HOLD_BARS = 78;
const MIN_CANDLES = LOOKBACK + MAX_HOLD_BARS + 20;
const DEFAULT_SNAPSHOT = path.resolve(process.cwd(), "logs", "spy-5m-walk-forward.json");

const CANDIDATE_TUNING: MonsterOtmTuningOverrides = {
  minDomProb: 0.48,
  maxChop: 0.38,
  minRegimeConf: 0.44,
  minProbConf: 0.44,
  minIntentScore: 0.46,
  minTradeProbability: 0.5,
  allowBQualityFloor: 0.46,
  requireCompressionEdge: false,
  requireDirectionalPush: false,
  applyLateTrendRiskFilter: false,
};

interface SnapshotFile {
  symbol: "SPY";
  timeframe: "5m";
  capturedAt: string;
  source: string;
  candles: OHLC[];
}

interface Stats {
  scannedWindows: number;
  engineRejected: number;
  setups: number;
  qualified: number;
  t1Wins: number;
  t2Wins: number;
  stops: number;
  unresolved: number;
  totalMfe: number;
  totalMae: number;
  rangeBlocked: number;
  probabilityBlocked: number;
  lowRegimeConfidence: number;
  lowProbabilityConfidence: number;
  lowPceQuality: number;
  directionOrChopBlocked: number;
  downstreamEngineBlocked: number;
}

function getEtParts(timestampMs: number): { date: string; minute: number } | null {
  if (!Number.isFinite(timestampMs)) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(timestampMs));
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = value("year");
  const month = value("month");
  const day = value("day");
  const hour = Number(value("hour"));
  const minute = Number(value("minute"));
  if (!year || !month || !day || !Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return { date: `${year}-${month}-${day}`, minute: hour * 60 + minute };
}

function timestampOf(candle: OHLC): number {
  return Number.isFinite(candle.timeMs) ? candle.timeMs : candle.time * 1000;
}

function inSpyEntryWindow(minute: number): boolean {
  return (minute >= 590 && minute <= 690) || (minute >= 840 && minute <= 955);
}

function isRth(minute: number): boolean {
  return minute >= 570 && minute <= 960;
}

function average(values: number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function computeAtr(candles: OHLC[]): number {
  const recent = candles.slice(-14);
  if (recent.length < 2) return 0;
  const ranges = recent.map((candle, index) => {
    const previous = index > 0 ? recent[index - 1].close : candle.close;
    return Math.max(candle.high - candle.low, Math.abs(candle.high - previous), Math.abs(candle.low - previous));
  });
  return average(ranges);
}

function sessionExpectedRanges(candles: OHLC[]): Map<string, number> {
  const sessions = new Map<string, { high: number; low: number }>();
  for (const candle of candles) {
    const et = getEtParts(timestampOf(candle));
    if (!et || !isRth(et.minute)) continue;
    const session = sessions.get(et.date) ?? { high: candle.high, low: candle.low };
    session.high = Math.max(session.high, candle.high);
    session.low = Math.min(session.low, candle.low);
    sessions.set(et.date, session);
  }

  const dates = [...sessions.keys()].sort();
  const expected = new Map<string, number>();
  for (let index = 0; index < dates.length; index += 1) {
    const priorRanges = dates.slice(Math.max(0, index - 14), index).map((date) => {
      const session = sessions.get(date)!;
      return session.high - session.low;
    });
    expected.set(dates[index], average(priorRanges));
  }
  return expected;
}

function getArgs(): { snapshot: string; capture: boolean } {
  const snapshotArg = process.argv.find((argument) => argument.startsWith("--snapshot="));
  return {
    snapshot: path.resolve(process.cwd(), snapshotArg?.slice("--snapshot=".length) || DEFAULT_SNAPSHOT),
    capture: process.argv.includes("--capture"),
  };
}

function normalizeCandles(candles: unknown): OHLC[] {
  if (!Array.isArray(candles)) return [];
  const normalized = candles.filter((candle): candle is OHLC => {
    const row = candle as OHLC;
    return [row.open, row.high, row.low, row.close, timestampOf(row)].every(Number.isFinite) && row.high >= row.low;
  }).sort((left, right) => timestampOf(left) - timestampOf(right));
  return normalized.filter((candle, index) => index === 0 || timestampOf(candle) !== timestampOf(normalized[index - 1]));
}

function hasUsableVolume(candles: OHLC[]): boolean {
  const positiveVolumeBars = candles.filter((candle) => Number.isFinite(candle.volume) && candle.volume > 0).length;
  return positiveVolumeBars / Math.max(candles.length, 1) >= 0.8;
}

async function loadSnapshot(snapshotPath: string, capture: boolean): Promise<SnapshotFile> {
  if (capture) {
    const response = await fetchLiveOHLC("SPY", "5m", "FULL");
    const candles = normalizeCandles(response.data);
    if (!response.isLive || candles.length < MIN_CANDLES || !hasUsableVolume(candles)) {
      throw new Error(`Snapshot capture rejected: ${response.error ?? "source is not live"}; candles=${candles.length}; usableVolume=${hasUsableVolume(candles)}. Retry after the provider cooldown.`);
    }
    const snapshot: SnapshotFile = {
      symbol: "SPY",
      timeframe: "5m",
      capturedAt: new Date().toISOString(),
      source: response.error ?? "live market-data provider",
      candles,
    };
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.writeFileSync(snapshotPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
    return snapshot;
  }

  if (!fs.existsSync(snapshotPath)) {
    throw new Error(`No snapshot found at ${snapshotPath}. Run with --capture once to create a real, reproducible dataset.`);
  }
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8")) as SnapshotFile;
  const candles = normalizeCandles(snapshot.candles);
  if (snapshot.symbol !== "SPY" || snapshot.timeframe !== "5m" || candles.length < MIN_CANDLES || !hasUsableVolume(candles)) {
    throw new Error(`Invalid snapshot: expected SPY 5m with at least ${MIN_CANDLES} candles and usable volume; received ${candles.length}.`);
  }
  return { ...snapshot, candles };
}

function outcomeFor(
  side: "call" | "put",
  entry: number,
  t1: number,
  t2: number,
  stop: number,
  future: OHLC[],
): { outcome: "t1" | "t2" | "stop" | "unresolved"; mfe: number; mae: number } {
  let mfe = 0;
  let mae = 0;
  let t1Hit = false;
  for (const bar of future) {
    const favorable = side === "call" ? bar.high - entry : entry - bar.low;
    const adverse = side === "call" ? entry - bar.low : bar.high - entry;
    mfe = Math.max(mfe, favorable);
    mae = Math.max(mae, adverse);
    const stopHit = side === "call" ? bar.low <= stop : bar.high >= stop;
    const t1Touched = side === "call" ? bar.high >= t1 : bar.low <= t1;
    const t2Touched = side === "call" ? bar.high >= t2 : bar.low <= t2;
    if (stopHit && !t1Hit) return { outcome: "stop", mfe, mae };
    if (t2Touched) return { outcome: "t2", mfe, mae };
    if (t1Touched) t1Hit = true;
    if (stopHit) return { outcome: "t1", mfe, mae };
  }
  return { outcome: t1Hit ? "t1" : "unresolved", mfe, mae };
}

async function main() {
  const { snapshot: snapshotPath, capture } = getArgs();
  const snapshot = await loadSnapshot(snapshotPath, capture);
  const candles = snapshot.candles;
  const expectedRanges = sessionExpectedRanges(candles);
  const stats: Stats = {
    scannedWindows: 0, engineRejected: 0, setups: 0, qualified: 0, t1Wins: 0, t2Wins: 0, stops: 0,
    unresolved: 0, totalMfe: 0, totalMae: 0, rangeBlocked: 0, probabilityBlocked: 0, lowRegimeConfidence: 0,
    lowProbabilityConfidence: 0, lowPceQuality: 0, directionOrChopBlocked: 0, downstreamEngineBlocked: 0,
  };

  console.log(`[SPY Walk-Forward] snapshot=${snapshotPath}`);
  console.log(`[SPY Walk-Forward] captured=${snapshot.capturedAt}; source=${snapshot.source}; candles=${candles.length}`);

  for (let index = LOOKBACK; index < candles.length - 1; index += 1) {
    const current = candles[index];
    const et = getEtParts(timestampOf(current));
    if (!et || !inSpyEntryWindow(et.minute)) continue;
    stats.scannedWindows += 1;
    const window = candles.slice(index - LOOKBACK, index + 1);
    const analysis = analyzeSymbol("SPY", window, { maxAbsGammaStrike: null }, { rth: window, overnight: [], prevDayRth: [] }, current.close);
    const monster = runMonsterOTMEngine(
      window, analysis.marketHealth, analysis.liquiditySweep, analysis.failedVwapReclaim, analysis.trendExhaustion,
      analysis.candleStrength, analysis.bullishPower, analysis.emaCloud, analysis.tactical, [], et.minute,
      { rth: window, overnight: [], prevDayRth: [] }, current.close, undefined, CANDIDATE_TUNING,
    );
    if (!monster.hasPlay || !monster.play) {
      stats.engineRejected += 1;
      const directionBlocked = monster.meta.dominantProb < CANDIDATE_TUNING.minDomProb! || monster.meta.chop > CANDIDATE_TUNING.maxChop!;
      const pceCanSupplyDirection = monster.pce.pceProb >= 0.66 && monster.pce.direction !== "none";
      if (monster.meta.confidence < CANDIDATE_TUNING.minRegimeConf!) stats.lowRegimeConfidence += 1;
      if (monster.meta.dominantProb < CANDIDATE_TUNING.minProbConf!) stats.lowProbabilityConfidence += 1;
      if (monster.pce.quality === "none" || monster.pce.quality === "C" || (monster.pce.quality === "B" && monster.pce.pceProb < CANDIDATE_TUNING.allowBQualityFloor!)) stats.lowPceQuality += 1;
      if (directionBlocked && !pceCanSupplyDirection) stats.directionOrChopBlocked += 1;
      if (
        monster.meta.confidence >= CANDIDATE_TUNING.minRegimeConf! &&
        monster.meta.dominantProb >= CANDIDATE_TUNING.minProbConf! &&
        monster.pce.quality !== "none" &&
        monster.pce.quality !== "C" &&
        !(monster.pce.quality === "B" && monster.pce.pceProb < CANDIDATE_TUNING.allowBQualityFloor!) &&
        (!directionBlocked || pceCanSupplyDirection)
      ) stats.downstreamEngineBlocked += 1;
      continue;
    }
    stats.setups += 1;

    const side = monster.play.side;
    const entry = current.close;
    const target = Number(monster.play.targetPrice);
    const stop = Number(monster.play.stopPrice);
    const probability = Number(monster.play.probability ?? 0);
    const hitProbability = Number(monster.play.hitProbability ?? 0);
    const atr = computeAtr(window);
    const targetDistance = Math.abs(target - entry);
    const t1Distance = Math.min(targetDistance, Math.max(0.75, atr * 0.7));
    const t1 = side === "call" ? entry + t1Distance : entry - t1Distance;
    const priorToday = candles.slice(0, index + 1).filter((candle) => getEtParts(timestampOf(candle))?.date === et.date && isRth(getEtParts(timestampOf(candle))!.minute));
    const usedRange = priorToday.length ? Math.max(...priorToday.map((candle) => candle.high)) - Math.min(...priorToday.map((candle) => candle.low)) : 0;
    const expectedRange = expectedRanges.get(et.date) ?? 0;
    const rangeQualified = expectedRange <= 0 || expectedRange - usedRange >= t1Distance * 1.1;
    const probabilityQualified = probability >= 62 && hitProbability >= 58;
    if (!rangeQualified) stats.rangeBlocked += 1;
    if (!probabilityQualified) stats.probabilityBlocked += 1;
    if (!rangeQualified || !probabilityQualified) continue;

    const future = candles.slice(index + 1, Math.min(candles.length, index + 1 + MAX_HOLD_BARS)).filter((candle) => getEtParts(timestampOf(candle))?.date === et.date && isRth(getEtParts(timestampOf(candle))!.minute));
    if (!future.length || !Number.isFinite(target) || !Number.isFinite(stop)) continue;
    const result = outcomeFor(side, entry, t1, target, stop, future);
    stats.qualified += 1;
    stats.totalMfe += result.mfe;
    stats.totalMae += result.mae;
    if (result.outcome === "t1") stats.t1Wins += 1;
    else if (result.outcome === "t2") stats.t2Wins += 1;
    else if (result.outcome === "stop") stats.stops += 1;
    else stats.unresolved += 1;
  }

  const decisive = stats.t1Wins + stats.t2Wins + stats.stops;
  console.table([{
    scannedWindows: stats.scannedWindows,
    engineRejected: stats.engineRejected,
    setupCandidates: stats.setups,
    qualifiedTrades: stats.qualified,
    t1OrBetter: stats.t1Wins + stats.t2Wins,
    t2: stats.t2Wins,
    stops: stats.stops,
    unresolved: stats.unresolved,
    t1WinRate: decisive ? Number((((stats.t1Wins + stats.t2Wins) / decisive) * 100).toFixed(2)) : 0,
    t2WinRate: decisive ? Number(((stats.t2Wins / decisive) * 100).toFixed(2)) : 0,
    avgMfePoints: stats.qualified ? Number((stats.totalMfe / stats.qualified).toFixed(2)) : 0,
    avgMaePoints: stats.qualified ? Number((stats.totalMae / stats.qualified).toFixed(2)) : 0,
    rangeBlocked: stats.rangeBlocked,
    probabilityBlocked: stats.probabilityBlocked,
    lowRegimeConfidence: stats.lowRegimeConfidence,
    lowProbabilityConfidence: stats.lowProbabilityConfidence,
    lowPceQuality: stats.lowPceQuality,
    directionOrChopBlocked: stats.directionOrChopBlocked,
    downstreamEngineBlocked: stats.downstreamEngineBlocked,
  }]);
}

main().catch((error) => {
  console.error("SPY walk-forward backtest failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});