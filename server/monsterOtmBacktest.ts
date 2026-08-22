import { fetchLiveOHLC, type OHLC } from "./marketData";
import { analyzeSymbol } from "./finance";
import { runMonsterOTMEngine, type MonsterOtmTuningOverrides } from "./monsterOtmEngine";

interface TradeStat {
  profile: string;
  symbol: string;
  candidates: number;
  confirmedBreakouts: number;
  entries: number;
  wins: number;
  losses: number;
  unresolved: number;
  accuracy: number;
  avgProbability: number;
}

const LOOKBACK = 120;
const LOOKAHEAD = 18;
const STEP = 2;

const PROFILES: Array<{ name: string; tuning: MonsterOtmTuningOverrides }> = [
  {
    name: "strict_live",
    tuning: {},
  },
  {
    name: "balanced_accuracy",
    tuning: {
      minDomProb: 0.54,
      maxChop: 0.3,
      minRegimeConf: 0.54,
      minProbConf: 0.52,
      minIntentScore: 0.55,
      minTradeProbability: 0.58,
      allowBQualityFloor: 0.54,
      requireCompressionEdge: true,
    },
  },
  {
    name: "active_flow",
    tuning: {
      minDomProb: 0.5,
      maxChop: 0.34,
      minRegimeConf: 0.48,
      minProbConf: 0.48,
      minIntentScore: 0.5,
      minTradeProbability: 0.54,
      allowBQualityFloor: 0.5,
      requireCompressionEdge: false,
    },
  },
  {
    name: "flow_plus",
    tuning: {
      minDomProb: 0.48,
      maxChop: 0.38,
      minRegimeConf: 0.44,
      minProbConf: 0.44,
      minIntentScore: 0.46,
      minTradeProbability: 0.5,
      allowBQualityFloor: 0.46,
      requireCompressionEdge: false,
      requireDirectionalPush: false,
    },
  },
  {
    name: "sample_harvest",
    tuning: {
      minDomProb: 0.46,
      maxChop: 0.42,
      minRegimeConf: 0.4,
      minProbConf: 0.4,
      minIntentScore: 0.42,
      minTradeProbability: 0.46,
      allowBQualityFloor: 0.42,
      requireCompressionEdge: false,
      requireDirectionalPush: false,
      applyLateTrendRiskFilter: false,
    },
  },
];

function pickOutcome(
  side: "call" | "put",
  target: number,
  stop: number,
  futureBars: OHLC[],
): "win" | "loss" | "unresolved" {
  for (const bar of futureBars) {
    if (side === "call") {
      const stopHit = bar.low <= stop;
      const targetHit = bar.high >= target;
      if (stopHit && targetHit) return "unresolved";
      if (targetHit) return "win";
      if (stopHit) return "loss";
    } else {
      const stopHit = bar.high >= stop;
      const targetHit = bar.low <= target;
      if (stopHit && targetHit) return "unresolved";
      if (targetHit) return "win";
      if (stopHit) return "loss";
    }
  }
  return "unresolved";
}

function etMinute(candle: OHLC): number | null {
  const timeMs = Number.isFinite(candle.timeMs) ? candle.timeMs : candle.time * 1000;
  if (!Number.isFinite(timeMs)) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(timeMs));
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : null;
}

function isMonsterEntryWindow(minute: number): boolean {
  return (minute >= 575 && minute <= 690) || (minute >= 840 && minute <= 935);
}

async function runForSymbol(symbol: string, profileName: string, tuning: MonsterOtmTuningOverrides): Promise<TradeStat> {
  let raw: OHLC[] = [];
  try {
    const response = await fetchLiveOHLC(symbol, "5m", "FULL");
    raw = response.data ?? [];
  } catch {
    raw = [];
  }

  let candles = (raw ?? []).filter((c) => Number.isFinite(c.close) && Number.isFinite(c.high) && Number.isFinite(c.low));
  if (candles.length < LOOKBACK + LOOKAHEAD + 8) {
    throw new Error(`[${symbol}] insufficient real 5m history for backtest (${candles.length} bars)`);
  }

  let entries = 0;
  let candidates = 0;
  let confirmedBreakouts = 0;
  let wins = 0;
  let losses = 0;
  let unresolved = 0;
  let probabilitySum = 0;

  for (let i = LOOKBACK; i <= candles.length - LOOKAHEAD - 1; i += STEP) {
    const window = candles.slice(i - LOOKBACK, i + 1);
    const current = window[window.length - 1];
    const nowMinutes = etMinute(current);
    if (nowMinutes == null || !isMonsterEntryWindow(nowMinutes)) continue;

    const analysis = analyzeSymbol(symbol, window, { maxAbsGammaStrike: null }, { rth: window, overnight: [], prevDayRth: [] }, current.close);

    const monster = runMonsterOTMEngine(
      window,
      analysis.marketHealth,
      analysis.liquiditySweep,
      analysis.failedVwapReclaim,
      analysis.trendExhaustion,
      analysis.candleStrength,
      analysis.bullishPower,
      analysis.emaCloud,
      analysis.tactical,
      [],
      nowMinutes,
      { rth: window, overnight: [], prevDayRth: [] },
      current.close,
      undefined,
      tuning,
    );

    if (!monster.hasPlay || !monster.play) continue;
    candidates += 1;
    if (!monster.breakout?.triggered) continue;
    confirmedBreakouts += 1;

    const target = Number(monster.play.targetPrice);
    const stop = Number(monster.play.stopPrice);
    const side = monster.play.side;
    if (!Number.isFinite(target) || !Number.isFinite(stop)) continue;

    const future = candles.slice(i + 1, i + 1 + LOOKAHEAD);
    const outcome = pickOutcome(side, target, stop, future);

    entries += 1;
    probabilitySum += Number(monster.play.probability ?? 0);

    if (outcome === "win") wins += 1;
    else if (outcome === "loss") losses += 1;
    else unresolved += 1;
  }

  const decisive = wins + losses;
  const accuracy = decisive > 0 ? (wins / decisive) * 100 : 0;
  const avgProbability = entries > 0 ? probabilitySum / entries : 0;

  return {
    profile: profileName,
    symbol,
    candidates,
    confirmedBreakouts,
    entries,
    wins,
    losses,
    unresolved,
    accuracy: Number(accuracy.toFixed(2)),
    avgProbability: Number(avgProbability.toFixed(2)),
  };
}

async function main() {
  const symbolsArg = process.argv[2] ?? "SPY,QQQ,IWM";
  const symbols = symbolsArg.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

  console.log(`[Monster OTM Backtest] Symbols: ${symbols.join(", ")}`);
  console.log(`[Monster OTM Backtest] lookback=${LOOKBACK} bars, lookahead=${LOOKAHEAD} bars, step=${STEP}`);

  const allStats: TradeStat[] = [];

  for (const profile of PROFILES) {
    console.log(`\n=== Profile: ${profile.name} ===`);
    for (const symbol of symbols) {
      try {
        const result = await runForSymbol(symbol, profile.name, profile.tuning);
        allStats.push(result);
        console.log(`[${profile.name}] [${symbol}] entries=${result.entries}, wins=${result.wins}, losses=${result.losses}, unresolved=${result.unresolved}, accuracy=${result.accuracy}%`);
      } catch (error) {
        console.error(`[${profile.name}] [${symbol}] backtest failed`, error);
      }
    }
  }

  const profileRows = PROFILES.map((profile) => {
    const rows = allStats.filter((s) => s.profile === profile.name);
    const totals = rows.reduce(
      (acc, row) => {
        acc.candidates += row.candidates;
        acc.confirmedBreakouts += row.confirmedBreakouts;
        acc.entries += row.entries;
        acc.wins += row.wins;
        acc.losses += row.losses;
        acc.unresolved += row.unresolved;
        acc.probabilityWeighted += row.avgProbability * row.entries;
        return acc;
      },
      { candidates: 0, confirmedBreakouts: 0, entries: 0, wins: 0, losses: 0, unresolved: 0, probabilityWeighted: 0 },
    );

    const decisive = totals.wins + totals.losses;
    const accuracy = decisive > 0 ? (totals.wins / decisive) * 100 : 0;
    const avgProbability = totals.entries > 0 ? totals.probabilityWeighted / totals.entries : 0;
    return {
      profile: profile.name,
      candidates: totals.candidates,
      confirmedBreakouts: totals.confirmedBreakouts,
      entries: totals.entries,
      decisive,
      wins: totals.wins,
      losses: totals.losses,
      unresolved: totals.unresolved,
      accuracy: Number(accuracy.toFixed(2)),
      avgProbability: Number(avgProbability.toFixed(2)),
    };
  });

  console.log("\nMonster OTM Backtest Summary by Profile");
  console.table(profileRows);

  const eligible = profileRows.filter((r) => r.decisive >= 12);
  const ranked = (eligible.length > 0 ? eligible : profileRows)
    .slice()
    .sort((a, b) => {
      if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
      return b.decisive - a.decisive;
    });

  const best = ranked[0];
  if (best) {
    console.log(`\nBest profile: ${best.profile}`);
    console.log(`Accuracy: ${best.accuracy.toFixed(2)}% | Decisive trades: ${best.decisive} | Entries: ${best.entries}`);
  }
}

main().catch((error) => {
  console.error("Monster OTM backtest failed:", error);
  process.exit(1);
});
