import { fetchLiveOHLC, type OHLC } from "./marketData";
import { analyzeSymbol, generateSampleOHLC } from "./finance";
import { runMonsterOTMEngine } from "./monsterOtmEngine";
import { analyzeMarketDNA } from "./engines/marketDnaEngine";
import { analyzeOrderBlocks } from "./engines/orderBlockEngine";
import { getLiveTuningSnapshot } from "./signalHistory";

type GateMode = "legacy" | "logDriven";

interface OutcomeStats {
  entries: number;
  wins: number;
  losses: number;
  unresolved: number;
}

interface SymbolResult {
  symbol: string;
  mode: GateMode;
  candidates: number;
  entries: number;
  wins: number;
  losses: number;
  unresolved: number;
  decisive: number;
  accuracy: number;
}

interface GateEvalResult {
  allow: boolean;
  checks: {
    hasPlay: boolean;
    sessionWindowQualified: boolean;
    directionAligned: boolean;
    momentumQualified: boolean;
    tradeProbPassed: boolean;
    hitProbPassed: boolean;
    rrQualified: boolean;
    flowQualified: boolean;
    structureQualified: boolean;
    chopPassed: boolean;
    breakoutPassed: boolean;
    fallbackQualified: boolean;
  };
}

const LOOKBACK = 120;
const LOOKAHEAD = 18;
const STEP = 2;

const CANDIDATE_TUNING = {
  minDomProb: 0.48,
  maxChop: 0.38,
  minRegimeConf: 0.44,
  minProbConf: 0.44,
  minIntentScore: 0.46,
  minTradeProbability: 0.5,
  allowBQualityFloor: 0.46,
  requireCompressionEdge: false,
  requireDirectionalPush: false,
};

function getEasternMinuteOfDay(timestampMs: number): number | undefined {
  if (!Number.isFinite(timestampMs)) return undefined;
  const date = new Date(timestampMs);
  if (!Number.isFinite(date.getTime())) return undefined;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? Number.NaN);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? Number.NaN);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return undefined;
  return hour * 60 + minute;
}

function pickOutcome(
  side: "call" | "put",
  target: number,
  stop: number,
  futureBars: OHLC[],
): "win" | "loss" | "unresolved" {
  for (const bar of futureBars) {
    if (side === "call") {
      if (bar.low <= stop) return "loss";
      if (bar.high >= target) return "win";
    } else {
      if (bar.high >= stop) return "loss";
      if (bar.low <= target) return "win";
    }
  }
  return "unresolved";
}

function computeHighWinSystem() {
  const forcedLane = String(process.env.REPLAY_FORCE_LANE ?? "").toLowerCase();
  const liveTuning = getLiveTuningSnapshot(24);
  const systemCandidates = [
    {
      engine: "fusion" as const,
      label: "Fusion Engine",
      winRate: Number(liveTuning.fusion.winRate ?? 0),
      sampleSize: Number(liveTuning.fusion.completed ?? 0),
    },
    {
      engine: "scanner" as const,
      label: "Scanner Breakout",
      winRate: Number(liveTuning.scanner.winRate ?? 0),
      sampleSize: Number(liveTuning.scanner.completed ?? 0),
    },
  ].sort((a, b) => {
    if (b.winRate !== a.winRate) return b.winRate - a.winRate;
    return b.sampleSize - a.sampleSize;
  });

  const forced = forcedLane === "fusion" || forcedLane === "scanner"
    ? systemCandidates.find((row) => row.engine === forcedLane)
    : undefined;
  const topSystem = forced ?? systemCandidates[0];
  const confidence: "high" | "medium" | "low" =
    topSystem.sampleSize >= 60 ? "high" : topSystem.sampleSize >= 20 ? "medium" : "low";

  return {
    topSystem,
    highWinSystem: {
      engine: topSystem.engine,
      confidence,
    },
  };
}

function evaluateGate(
  mode: GateMode,
  ctx: {
    symbol: string;
    sessionMinuteEt?: number;
    monsterHasPlay: boolean;
    monsterDirection: "bullish" | "bearish" | "neutral";
    breakoutTriggered: boolean;
    hitProbPct: number;
    tradeProbPct: number;
    dnaDirection: "bullish" | "bearish" | "neutral";
    adxValue: number;
    rsiValue: number;
    momentumStrength: number;
    rrRatio: number;
    obvRatio: number;
    cmfValue: number;
    orderBlockScore: number;
    orderBlockDirection: "bullish" | "bearish" | "neutral";
    highWinSystemEngine: "fusion" | "scanner";
    topSystemSampleSize: number;
  },
): GateEvalResult {
  const spy0dteStrictMode = ctx.symbol === "SPY";
  const zeroDteSessionQualified = Boolean(
    Number.isFinite(ctx.sessionMinuteEt as number) &&
      (((ctx.sessionMinuteEt as number) >= 575 && (ctx.sessionMinuteEt as number) <= 690) ||
        ((ctx.sessionMinuteEt as number) >= 840 && (ctx.sessionMinuteEt as number) <= 955))
  );
  const spy0dteSessionQualified = !spy0dteStrictMode || zeroDteSessionQualified;
  const laneHasDepth = ctx.topSystemSampleSize >= 20;
  const selectedProfile = laneHasDepth
    ? (ctx.highWinSystemEngine === "scanner" ? "balanced_accuracy" : "strict_live")
    : "strict_live";

  const minTradeProbBaseLegacy = selectedProfile === "strict_live" ? 74 : 68;
  const minHitProbBaseLegacy = selectedProfile === "strict_live" ? 66 : 63;
  const minTradeProbBaseLogDriven = spy0dteStrictMode ? 66 : selectedProfile === "strict_live" ? 62 : 60;
  const minHitProbBaseLogDriven = spy0dteStrictMode ? 62 : selectedProfile === "strict_live" ? 58 : 56;
  const requiresBreakout = ctx.highWinSystemEngine === "scanner";

  const directionAlignedLegacy =
    ctx.dnaDirection === "neutral"
      ? ctx.monsterDirection !== "neutral" && ctx.tradeProbPct >= minTradeProbBaseLegacy + 4
      : ctx.dnaDirection === ctx.monsterDirection;

  if (mode === "legacy") {
    const hasPlay = ctx.monsterHasPlay;
    const sessionWindowQualified = spy0dteSessionQualified;
    const directionAligned = directionAlignedLegacy;
    const momentumQualified = true;
    const tradeProbPassed = ctx.tradeProbPct >= minTradeProbBaseLegacy;
    const hitProbPassed = ctx.hitProbPct >= minHitProbBaseLegacy;
    const rrQualified = true;
    const flowQualified = true;
    const structureQualified = true;
    const chopPassed = true;
    const breakoutPassed = !requiresBreakout || ctx.breakoutTriggered;
    const allow = (
      ctx.monsterHasPlay &&
      spy0dteSessionQualified &&
      directionAlignedLegacy &&
      ctx.tradeProbPct >= minTradeProbBaseLegacy &&
      ctx.hitProbPct >= minHitProbBaseLegacy &&
      (!requiresBreakout || ctx.breakoutTriggered)
    );

    return {
      allow,
      checks: {
        hasPlay,
        sessionWindowQualified,
        directionAligned,
        momentumQualified,
        tradeProbPassed,
        hitProbPassed,
        rrQualified,
        flowQualified,
        structureQualified,
        chopPassed,
        breakoutPassed,
        fallbackQualified: false,
      },
    };
  }

  const weakChop = ctx.adxValue > 0 && ctx.adxValue < 20 && ctx.rsiValue >= 45 && ctx.rsiValue <= 55;
  const trendStrong = ctx.adxValue >= 25;
  const spyTrendQualified = spy0dteStrictMode ? ctx.adxValue >= 22 : trendStrong;
  const directionAligned =
    ctx.dnaDirection === "neutral"
      ? ctx.monsterDirection !== "neutral" && spyTrendQualified && ctx.breakoutTriggered && ctx.tradeProbPct >= minTradeProbBaseLogDriven + (spy0dteStrictMode ? 8 : 6) && ctx.hitProbPct >= minHitProbBaseLogDriven + (spy0dteStrictMode ? 6 : 4)
      : ctx.dnaDirection === ctx.monsterDirection;
  const trendAlignmentBoost = trendStrong && ctx.breakoutTriggered ? 3 : 0;
  const chopPenalty = weakChop ? 4 : 0;
  const minTradeProb = Math.max(54, Math.min(84, minTradeProbBaseLogDriven - trendAlignmentBoost + chopPenalty));
  const minHitProb = Math.max(50, Math.min(80, minHitProbBaseLogDriven - (trendAlignmentBoost >= 3 ? 2 : 0) + Math.max(0, chopPenalty - 1)));
  const minRr = spy0dteStrictMode ? 1.25 : 1.15;
  const rrQualified = Number.isFinite(ctx.rrRatio) && ctx.rrRatio >= minRr;
  const flowQualified = ctx.monsterDirection === "neutral"
    ? false
    : ctx.monsterDirection === "bullish"
      ? (ctx.obvRatio >= 1.01 || ctx.cmfValue >= 0.02)
      : (ctx.obvRatio <= 0.99 || ctx.cmfValue <= -0.02);
  const structureAligned = ctx.orderBlockDirection === "neutral" || ctx.orderBlockDirection === ctx.monsterDirection;
  const structureQualified = structureAligned && (
    ctx.orderBlockScore >= (spy0dteStrictMode ? 0.52 : 0.5) ||
    (ctx.breakoutTriggered && ctx.orderBlockScore >= 0.48)
  );

  const momentumAbs = Math.abs(ctx.momentumStrength);
  const momentumQualified = spy0dteStrictMode
    ? (spyTrendQualified && (
      momentumAbs >= 8 ||
      (ctx.breakoutTriggered && ctx.tradeProbPct >= minTradeProb + 2 && ctx.hitProbPct >= minHitProb + 2) ||
      (ctx.tradeProbPct >= 72 && ctx.hitProbPct >= 66)
    ))
    : trendStrong
      ? (momentumAbs >= 10 || ctx.tradeProbPct >= minTradeProb + 2)
      : (momentumAbs >= 16 || (ctx.tradeProbPct >= minTradeProb + 4 && ctx.hitProbPct >= minHitProb));
  const logRuleAligned = directionAligned && momentumQualified;

  const fallbackQualified = Boolean(
    ctx.monsterHasPlay &&
      !spy0dteStrictMode &&
      !weakChop &&
      ctx.dnaDirection !== "neutral" &&
      ctx.monsterDirection === ctx.dnaDirection &&
      trendStrong &&
        rrQualified &&
        flowQualified &&
        structureQualified &&
      ctx.tradeProbPct >= 58 &&
      ctx.hitProbPct >= 54 &&
      (ctx.breakoutTriggered || ctx.hitProbPct >= 60)
  );

  const hasPlay = ctx.monsterHasPlay;
      const sessionWindowQualified = zeroDteSessionQualified;
  const tradeProbPassed = ctx.tradeProbPct >= minTradeProb;
  const hitProbPassed = ctx.hitProbPct >= minHitProb;
  const chopPassed = !weakChop || ctx.breakoutTriggered;
  const breakoutPassed = !requiresBreakout || ctx.breakoutTriggered;

  const allow = (
    (ctx.monsterHasPlay &&
      spy0dteSessionQualified &&
      directionAligned &&
      logRuleAligned &&
      tradeProbPassed &&
      hitProbPassed &&
        rrQualified &&
        flowQualified &&
        structureQualified &&
      chopPassed &&
      breakoutPassed) ||
      fallbackQualified
  );

  return {
    allow,
    checks: {
      hasPlay,
      sessionWindowQualified,
      directionAligned,
      momentumQualified,
      tradeProbPassed,
      hitProbPassed,
      rrQualified,
      flowQualified,
      structureQualified,
      chopPassed,
      breakoutPassed,
      fallbackQualified,
    },
  };
}

async function runForSymbol(symbol: string, mode: GateMode): Promise<SymbolResult> {
  const { topSystem, highWinSystem } = computeHighWinSystem();

  let raw: OHLC[] = [];
  try {
    const response = await fetchLiveOHLC(symbol, "5m", "FULL");
    raw = response.data ?? [];
  } catch {
    raw = [];
  }

  let candles = (raw ?? []).filter((c) => Number.isFinite(c.close) && Number.isFinite(c.high) && Number.isFinite(c.low));
  if (candles.length < LOOKBACK + LOOKAHEAD + 8) {
    candles = generateSampleOHLC(symbol, 420).map((row) => ({ ...row, time: row.time ?? 0, timeMs: row.timeMs ?? 0 }));
    console.warn(`[${symbol}] using synthetic fallback dataset (${candles.length} bars)`);
  }

  const stats: OutcomeStats = { entries: 0, wins: 0, losses: 0, unresolved: 0 };
  let candidates = 0;
  const gateTotals = {
    totalCandidates: 0,
    hasPlay: 0,
    sessionWindowQualified: 0,
    directionAligned: 0,
    momentumQualified: 0,
    tradeProbPassed: 0,
    hitProbPassed: 0,
    rrQualified: 0,
    flowQualified: 0,
    structureQualified: 0,
    chopPassed: 0,
    breakoutPassed: 0,
    fallbackQualified: 0,
    allow: 0,
  };

  for (let i = LOOKBACK; i <= candles.length - LOOKAHEAD - 1; i += STEP) {
    const window = candles.slice(i - LOOKBACK, i + 1);
    const current = window[window.length - 1];

    const analysis = analyzeSymbol(
      symbol,
      window,
      { maxAbsGammaStrike: null },
      { rth: window, overnight: [], prevDayRth: [] },
      current.close,
    );

    const momentumStrength = Number((analysis as any).momentumStrength ?? (analysis as any).marketHealth?.macd?.value ?? 0);
    const analysisAny = analysis as any;
    const obvRatio = Number(analysisAny?.marketHealth?.obv?.ratio ?? 1);
    const cmfValue = Number(analysisAny?.marketHealth?.cmf?.value ?? 0);

    const monster = runMonsterOTMEngine(
      window,
      analysis.marketHealth as any,
      analysis.liquiditySweep,
      analysis.failedVwapReclaim,
      analysis.trendExhaustion,
      analysis.candleStrength,
      analysis.bullishPower,
      analysis.emaCloud,
      analysis.tactical,
      [],
      new Date(current.timeMs ?? Date.now()).getHours() * 60 + new Date(current.timeMs ?? Date.now()).getMinutes(),
      { rth: window, overnight: [], prevDayRth: [] },
      current.close,
      undefined,
      CANDIDATE_TUNING,
    );

    const marketDNA = analyzeMarketDNA({ "15m": window, "5m": window, "1h": window }, analysis.marketHealth as any, []);
    const orderBlock = analyzeOrderBlocks({ "5m": window, "15m": window.slice(-90) }, analysis.marketHealth as any, []);
    const directionalSkew = Number((marketDNA?.fingerprint as any)?.directionalSkew ?? 0);
    const dnaDirection: "bullish" | "bearish" | "neutral" =
      directionalSkew > 0.08 ? "bullish" : directionalSkew < -0.08 ? "bearish" : "neutral";

    const monsterDirection: "bullish" | "bearish" | "neutral" =
      monster.play?.side === "call" ? "bullish" : monster.play?.side === "put" ? "bearish" : "neutral";

    const rrRatio = (() => {
      if (!monster.play) return 0;
      const target = Number(monster.play.targetPrice);
      const stop = Number(monster.play.stopPrice);
      if (!Number.isFinite(target) || !Number.isFinite(stop)) return 0;
      const reward = Math.abs(target - current.close);
      const risk = Math.abs(current.close - stop);
      if (!Number.isFinite(reward) || !Number.isFinite(risk) || risk <= 0) return 0;
      return reward / risk;
    })();

    if (monster.hasPlay && monster.play) {
      candidates += 1;
    }

    const gate = evaluateGate(mode, {
      symbol,
      sessionMinuteEt: getEasternMinuteOfDay(Number(current.timeMs) || (Number.isFinite(current.time) ? Number(current.time) * 1000 : Number.NaN)),
      monsterHasPlay: Boolean(monster.hasPlay && monster.play),
      monsterDirection,
      breakoutTriggered: Boolean(monster.breakout?.triggered),
      hitProbPct: Number(monster.play?.hitProbability ?? 0),
      tradeProbPct: Number(monster.play?.probability ?? 0),
      dnaDirection,
      adxValue: Number((analysis as any)?.marketHealth?.adx?.value ?? 0),
      rsiValue: Number((analysis as any)?.marketHealth?.rsi?.value ?? 50),
      momentumStrength,
      rrRatio,
      obvRatio,
      cmfValue,
      orderBlockScore: Number(orderBlock.score ?? 0),
      orderBlockDirection: orderBlock.direction ?? "neutral",
      highWinSystemEngine: highWinSystem.engine,
      topSystemSampleSize: topSystem.sampleSize,
    });

    if (monster.hasPlay && monster.play) {
      gateTotals.totalCandidates += 1;
      if (gate.checks.hasPlay) gateTotals.hasPlay += 1;
      if (gate.checks.sessionWindowQualified) gateTotals.sessionWindowQualified += 1;
      if (gate.checks.directionAligned) gateTotals.directionAligned += 1;
      if (gate.checks.momentumQualified) gateTotals.momentumQualified += 1;
      if (gate.checks.tradeProbPassed) gateTotals.tradeProbPassed += 1;
      if (gate.checks.hitProbPassed) gateTotals.hitProbPassed += 1;
      if (gate.checks.rrQualified) gateTotals.rrQualified += 1;
      if (gate.checks.flowQualified) gateTotals.flowQualified += 1;
      if (gate.checks.structureQualified) gateTotals.structureQualified += 1;
      if (gate.checks.chopPassed) gateTotals.chopPassed += 1;
      if (gate.checks.breakoutPassed) gateTotals.breakoutPassed += 1;
      if (gate.checks.fallbackQualified) gateTotals.fallbackQualified += 1;
      if (gate.allow) gateTotals.allow += 1;
    }

    if (!gate.allow || !monster.play) continue;

    const target = Number(monster.play.targetPrice);
    const stop = Number(monster.play.stopPrice);
    if (!Number.isFinite(target) || !Number.isFinite(stop)) continue;

    const future = candles.slice(i + 1, i + 1 + LOOKAHEAD);
    const outcome = pickOutcome(monster.play.side, target, stop, future);

    stats.entries += 1;
    if (outcome === "win") stats.wins += 1;
    else if (outcome === "loss") stats.losses += 1;
    else stats.unresolved += 1;
  }

  const decisive = stats.wins + stats.losses;
  const accuracy = decisive > 0 ? (stats.wins / decisive) * 100 : 0;

  console.log(`[${symbol}] ${mode} gate diagnostics`, gateTotals);

  return {
    symbol,
    mode,
    candidates,
    entries: stats.entries,
    wins: stats.wins,
    losses: stats.losses,
    unresolved: stats.unresolved,
    decisive,
    accuracy: Number(accuracy.toFixed(2)),
  };
}

async function main() {
  const symbolsArg = process.argv[2] ?? "SPY,QQQ,IWM";
  const symbols = symbolsArg.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);

  const rows: SymbolResult[] = [];
  for (const symbol of symbols) {
    const legacy = await runForSymbol(symbol, "legacy");
    const logDriven = await runForSymbol(symbol, "logDriven");
    rows.push(legacy, logDriven);
    console.log(
      `[${symbol}] candidates=${legacy.candidates} | legacy=${legacy.accuracy}% (${legacy.wins}/${legacy.decisive}, entries=${legacy.entries}) | ` +
      `logDriven=${logDriven.accuracy}% (${logDriven.wins}/${logDriven.decisive}, entries=${logDriven.entries})`
    );
  }

  console.log("\nRoute Gate Replay Summary");
  console.table(rows);

  const aggregate = (mode: GateMode, symbolFilter?: (symbol: string) => boolean) => {
    const modeRows = rows.filter((r) => r.mode === mode && (!symbolFilter || symbolFilter(r.symbol)));
    const wins = modeRows.reduce((a, b) => a + b.wins, 0);
    const losses = modeRows.reduce((a, b) => a + b.losses, 0);
    const entries = modeRows.reduce((a, b) => a + b.entries, 0);
    const candidates = modeRows.reduce((a, b) => a + b.candidates, 0);
    const unresolved = modeRows.reduce((a, b) => a + b.unresolved, 0);
    const decisive = wins + losses;
    const accuracy = decisive > 0 ? (wins / decisive) * 100 : 0;
    return {
      mode,
      candidates,
      entries,
      decisive,
      unresolved,
      wins,
      losses,
      accuracy: Number(accuracy.toFixed(2)),
    };
  };

  console.log("\nAggregate Comparison");
  console.table([aggregate("legacy"), aggregate("logDriven")]);

  console.log("\nSPY vs Non-SPY Breakdown");
  console.table([
    { segment: "SPY", ...aggregate("legacy", (symbol) => symbol === "SPY") },
    { segment: "SPY", ...aggregate("logDriven", (symbol) => symbol === "SPY") },
    { segment: "nonSPY", ...aggregate("legacy", (symbol) => symbol !== "SPY") },
    { segment: "nonSPY", ...aggregate("logDriven", (symbol) => symbol !== "SPY") },
  ]);
}

main().catch((error) => {
  console.error("routeGateReplayBacktest failed:", error);
  process.exit(1);
});
