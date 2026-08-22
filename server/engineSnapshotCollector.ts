import fs from "fs";
import path from "path";
import { analyzeSymbol } from "./finance";
import { computeFusionSnapshot, type MarketHealthIndicators, type OHLC } from "./fusion";
import { fetchLiveOHLC } from "./marketData";
import { appendSystemAudit } from "./systemAuditLog";

const SNAPSHOT_SYMBOLS = ["SPY", "QQQ", "IWM"];
const SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000;
const RETENTION_DAYS = 90;
const LOGS_DIR = path.join("logs");
const OUTCOME_HORIZONS = [15, 30, 60] as const;
const REGULAR_SESSION_OPEN_MINUTE = 9 * 60 + 30;
const REGULAR_SESSION_CLOSE_MINUTE = 16 * 60;
const PRICE_ACTION_WINDOW = 12;
const MAX_CANDLE_AGE_MS = 20 * 60 * 1000;
const MIN_RECENT_NONZERO_VOLUME_BARS = 10;
const MAX_SINGLE_BAR_MOVE_PCT = 10;

let schedulerId: NodeJS.Timeout | null = null;
let initialTimer: NodeJS.Timeout | null = null;
let collectionRunning = false;
let lastCollectionAt = 0;
let lastSuccessfulSymbols = 0;
let lastFailedSymbols = 0;

function nySessionClock(now = new Date()): { weekday: number; minuteOfDay: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "short",
    hourCycle: "h23",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(now);
  const weekdayName = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(weekdayName);
  return { weekday, minuteOfDay: hour * 60 + minute };
}

function getRegularSessionState(now = new Date()): { regularSession: boolean; minuteOfDay: number; weekday: number } {
  const { weekday, minuteOfDay } = nySessionClock(now);
  return {
    regularSession: weekday >= 1 && weekday <= 5 && minuteOfDay >= REGULAR_SESSION_OPEN_MINUTE && minuteOfDay < REGULAR_SESSION_CLOSE_MINUTE,
    minuteOfDay,
    weekday,
  };
}

function isRegularSession(now = new Date()): boolean {
  return getRegularSessionState(now).regularSession;
}

function nyDateKey(ts = Date.now()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts)).replace(/\//g, "-");
}

function aggregateOhlc(candles: OHLC[], factor: number): OHLC[] {
  const output: OHLC[] = [];
  for (let index = 0; index < candles.length; index += factor) {
    const group = candles.slice(index, index + factor);
    if (!group.length) continue;
    output.push({
      open: group[0].open,
      high: Math.max(...group.map((bar) => bar.high)),
      low: Math.min(...group.map((bar) => bar.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((sum, bar) => sum + bar.volume, 0),
      time: group[0].time,
      timeMs: group[0].timeMs,
    });
  }
  return output;
}

function normalizeMarketHealth(analysis: any): MarketHealthIndicators {
  const health = analysis.marketHealth ?? {};
  const contributors = [
    health?.rsi?.contribution,
    health?.macd?.contribution,
    health?.adx?.contribution,
    health?.obv?.contribution,
    health?.bollingerBands?.contribution,
    health?.stochastic?.contribution,
    health?.cmf?.contribution,
  ].filter(Number.isFinite);

  return {
    healthScore: contributors.length
      ? contributors.reduce((sum: number, value: number) => sum + value, 0) / contributors.length
      : 0.5,
    healthGrade: health.healthGrade ?? "C",
    rsi: { value: Number(health?.rsi?.value ?? 50) },
    macd: { value: Number(health?.macd?.value ?? 0) },
    adx: { value: Number(health?.adx?.value ?? 20) },
    vwapSlope: { value: Number(health?.vwapSlope?.value ?? 0) },
    ivChange: { value: Number(health?.ivChange?.value ?? 0) },
    orderflow: { value: Number(health?.orderflow?.tickImbalance ?? 0) },
    gamma: { value: Number(health?.gamma?.maxAbsGammaStrike ?? 0) },
    breadth: { value: Number(health?.breadth?.composite ?? 0.5) },
  };
}

function validateCaptureData(candles: OHLC[], isLive: boolean, now = Date.now()): { valid: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!isLive) reasons.push("provider returned cached or fallback candles");
  if (candles.length < 120) reasons.push(`insufficient candles (${candles.length})`);

  const recent = candles.slice(-PRICE_ACTION_WINDOW);
  const latest = recent[recent.length - 1];
  const latestTimeMs = Number(latest?.timeMs ?? (latest?.time ? latest.time * 1000 : 0));
  if (!Number.isFinite(latestTimeMs) || latestTimeMs <= 0 || now - latestTimeMs > MAX_CANDLE_AGE_MS) {
    reasons.push("latest candle is stale or missing a timestamp");
  }

  const malformedBar = recent.some((bar) =>
    ![bar.open, bar.high, bar.low, bar.close, bar.volume].every(Number.isFinite) ||
    bar.open <= 0 || bar.high <= 0 || bar.low <= 0 || bar.close <= 0 || bar.volume < 0 ||
    bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close),
  );
  if (malformedBar) reasons.push("recent candle OHLC or volume values are invalid");

  const nonzeroVolumeBars = recent.filter((bar) => bar.volume > 0).length;
  if (nonzeroVolumeBars < MIN_RECENT_NONZERO_VOLUME_BARS) {
    reasons.push(`insufficient recent volume (${nonzeroVolumeBars}/${recent.length} nonzero bars)`);
  }

  const implausibleMove = recent.slice(1).some((bar, index) => {
    const previousClose = recent[index].close;
    return Math.abs((bar.close - previousClose) / Math.max(previousClose, 0.000001)) * 100 > MAX_SINGLE_BAR_MOVE_PCT;
  });
  if (implausibleMove) reasons.push(`recent bar move exceeds ${MAX_SINGLE_BAR_MOVE_PCT}% sanity limit`);

  return { valid: reasons.length === 0, reasons };
}

function writeSnapshot(snapshot: Record<string, unknown>): void {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  const filePath = path.join(LOGS_DIR, `black_box_15m_${nyDateKey()}.jsonl`);
  fs.appendFileSync(filePath, `${JSON.stringify(snapshot)}\n`, "utf8");

  const cutoff = Date.now() - RETENTION_DAYS * 86400000;
  for (const fileName of fs.readdirSync(LOGS_DIR)) {
    if (!/^black_box_15m_.*\.jsonl$/i.test(fileName)) continue;
    const fullPath = path.join(LOGS_DIR, fileName);
    try {
      if (fs.statSync(fullPath).mtimeMs < cutoff) fs.unlinkSync(fullPath);
    } catch {
      // A log rotation failure should never affect signal execution.
    }
  }
}

function getDecisionId(symbol: string, candleTimeMs: number): string {
  return `${symbol.toUpperCase()}:${candleTimeMs}`;
}

function getDirectionalExcursion(
  candles: OHLC[],
  captureTimeMs: number,
  resolvedTimeMs: number,
  capturePrice: number,
  direction: "CALL" | "PUT" | "WAIT",
): { maxFavorableExcursionPct: number; maxAdverseExcursionPct: number } {
  if (direction === "WAIT") {
    return { maxFavorableExcursionPct: 0, maxAdverseExcursionPct: 0 };
  }

  const observed = candles.filter((bar) => {
    const barTimeMs = Number(bar.timeMs ?? (bar.time ? bar.time * 1000 : 0));
    return barTimeMs >= captureTimeMs && barTimeMs <= resolvedTimeMs;
  });
  if (!observed.length) {
    return { maxFavorableExcursionPct: 0, maxAdverseExcursionPct: 0 };
  }

  const highest = Math.max(...observed.map((bar) => bar.high));
  const lowest = Math.min(...observed.map((bar) => bar.low));
  const favorableMove = direction === "CALL" ? highest - capturePrice : capturePrice - lowest;
  const adverseMove = direction === "CALL" ? capturePrice - lowest : highest - capturePrice;
  const denominator = Math.max(capturePrice, 0.000001);
  return {
    maxFavorableExcursionPct: Number(((Math.max(0, favorableMove) / denominator) * 100).toFixed(3)),
    maxAdverseExcursionPct: Number(((Math.max(0, adverseMove) / denominator) * 100).toFixed(3)),
  };
}

function readResolvedOutcomeIds(): Set<string> {
  const ids = new Set<string>();
  if (!fs.existsSync(LOGS_DIR)) return ids;

  for (const fileName of fs.readdirSync(LOGS_DIR)) {
    if (!/^black_box_outcomes_.*\.jsonl$/i.test(fileName)) continue;
    try {
      for (const line of fs.readFileSync(path.join(LOGS_DIR, fileName), "utf8").split(/\r?\n/)) {
        if (!line.trim()) continue;
        const parsed = JSON.parse(line) as { outcomeId?: string };
        if (parsed.outcomeId) ids.add(parsed.outcomeId);
      }
    } catch {
      // An unreadable outcome file must not interrupt market-session collection.
    }
  }
  return ids;
}

function resolveSnapshotOutcomes(symbol: string, candles: OHLC[]): void {
  if (!fs.existsSync(LOGS_DIR) || !candles.length) return;
  const resolvedIds = readResolvedOutcomeIds();
  const outcomes: Record<string, unknown>[] = [];

  for (const fileName of fs.readdirSync(LOGS_DIR)) {
    if (!/^black_box_15m_.*\.jsonl$/i.test(fileName)) continue;
    const filePath = path.join(LOGS_DIR, fileName);
    try {
      if (fs.statSync(filePath).mtimeMs < Date.now() - RETENTION_DAYS * 86400000) continue;
      for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
        if (!line.trim()) continue;
        const snapshot = JSON.parse(line) as Record<string, any>;
        if (
          snapshot.type !== "black_box_15m" ||
          snapshot.symbol !== symbol ||
          snapshot.dataQuality?.accepted !== true ||
          !Number.isFinite(snapshot.price) ||
          !Number.isFinite(snapshot.candleTimeMs)
        ) continue;

        for (const horizonMinutes of OUTCOME_HORIZONS) {
          const decisionId = typeof snapshot.decisionId === "string"
            ? snapshot.decisionId
            : getDecisionId(symbol, Number(snapshot.candleTimeMs));
          const outcomeId = `${decisionId}:${horizonMinutes}`;
          if (resolvedIds.has(outcomeId)) continue;
          const targetTime = Number(snapshot.candleTimeMs) + horizonMinutes * 60 * 1000;
          const resolvedBar = candles.find((bar) => Number(bar.timeMs ?? 0) >= targetTime);
          if (!resolvedBar) continue;

          const capturePrice = Number(snapshot.price);
          const movePct = (resolvedBar.close - capturePrice) / Math.max(capturePrice, 1e-6);
          const predicted = String(snapshot.engineState?.fusion?.direction ?? "WAIT");
          const direction = predicted === "CALL" || predicted === "PUT" ? predicted : "WAIT";
          const result = Math.abs(movePct) < 0.0007
            ? "flat"
            : direction === "CALL"
              ? (movePct > 0 ? "win" : "loss")
              : direction === "PUT"
                ? (movePct < 0 ? "win" : "loss")
                : "neutral";
          const resolvedTimeMs = Number(resolvedBar.timeMs ?? (resolvedBar.time ? resolvedBar.time * 1000 : targetTime));
          const excursion = getDirectionalExcursion(candles, Number(snapshot.candleTimeMs), resolvedTimeMs, capturePrice, direction);
          const tradePlan = snapshot.engineState?.tactical?.tradePlan;
          const targets: number[] = Array.isArray(tradePlan?.targets)
            ? tradePlan.targets.filter((target: unknown): target is number => Number.isFinite(target))
            : [];
          const stop = Number(tradePlan?.stop);
          const observed = candles.filter((bar) => {
            const barTimeMs = Number(bar.timeMs ?? (bar.time ? bar.time * 1000 : 0));
            return barTimeMs >= Number(snapshot.candleTimeMs) && barTimeMs <= resolvedTimeMs;
          });
          const targetHit = direction === "CALL"
            ? targets.some((target) => observed.some((bar) => bar.high >= target))
            : direction === "PUT"
              ? targets.some((target) => observed.some((bar) => bar.low <= target))
              : false;
          const stopHit = Number.isFinite(stop) && (direction === "CALL"
            ? observed.some((bar) => bar.low <= stop)
            : direction === "PUT"
              ? observed.some((bar) => bar.high >= stop)
              : false);

          outcomes.push({
            type: "black_box_outcome",
            outcomeId,
            decisionId,
            outcomeFamilyId: decisionId,
            isPrimaryHorizon: horizonMinutes === OUTCOME_HORIZONS[0],
            resolvedAt: new Date().toISOString(),
            symbol,
            horizonMinutes,
            capturePrice,
            resolvedPrice: resolvedBar.close,
            movePct: Number((movePct * 100).toFixed(3)),
            ...excursion,
            targetHit,
            stopHit,
            dataValid: true,
            marketDataSource: snapshot.source,
            fusionDirection: predicted,
            fusionConfidence: snapshot.engineState?.fusion?.confidence ?? 0,
            orderBlockDirection: snapshot.engineState?.institutional?.orderBlock?.direction ?? "neutral",
            monsterHasPlay: Boolean(snapshot.engineState?.monster?.hasPlay),
            result,
          });
          resolvedIds.add(outcomeId);
        }
      }
    } catch {
      // Skip a bad source log rather than halting snapshot collection.
    }
  }

  if (!outcomes.length) return;
  fs.appendFileSync(
    path.join(LOGS_DIR, `black_box_outcomes_${nyDateKey()}.jsonl`),
    `${outcomes.map((outcome) => JSON.stringify(outcome)).join("\n")}\n`,
    "utf8",
  );
  console.log(`[BlackBox] Resolved ${outcomes.length} ${symbol} outcomes`);
}

async function collectSymbolSnapshot(symbol: string): Promise<void> {
  const response = await fetchLiveOHLC(symbol, "5m", "FULL");
  const candles = (response.data ?? []).filter((bar) => Number.isFinite(bar.close) && Number.isFinite(bar.volume));
  const captureQuality = validateCaptureData(candles, response.isLive);
  if (!captureQuality.valid) {
    appendSystemAudit("engine.snapshot", {
      symbol,
      accepted: false,
      source: response.isLive ? "live" : "fallback",
      reason: response.error ?? null,
      qualityRejections: captureQuality.reasons,
    });
    throw new Error(`Black Box capture rejected: ${captureQuality.reasons.join("; ")}`);
  }

  resolveSnapshotOutcomes(symbol, candles);

  const latest = candles[candles.length - 1];
  const prior = candles[candles.length - 2];
  const recentCandles = candles.slice(-PRICE_ACTION_WINDOW);
  const averageVolume = candles.slice(-21, -1).reduce((sum, candle) => sum + candle.volume, 0) / 20;
  const recentHigh = Math.max(...recentCandles.map((candle) => candle.high));
  const recentLow = Math.min(...recentCandles.map((candle) => candle.low));
  const candleRange = Math.max(latest.high - latest.low, 0.000001);
  const sessionSplit = { rth: candles, overnight: [] as OHLC[], prevDayRth: [] as OHLC[] };
  const analysis = analyzeSymbol(symbol, candles, { maxAbsGammaStrike: null }, sessionSplit, latest.close);
  const fusion = computeFusionSnapshot({
    symbol,
    ohlcByTF: { "5m": candles, "15m": aggregateOhlc(candles, 3) },
    patternsByTF: {},
    marketHealth: normalizeMarketHealth(analysis),
    lastPrice: latest.close,
  });

  const orderBlock = fusion.orderBlock;
  const monster = fusion.monsterOtm;
  const capturedAtMs = Date.now();
  const candleTimeMs = Number(latest.timeMs ?? (latest.time ? latest.time * 1000 : capturedAtMs));
  const decisionId = getDecisionId(symbol, candleTimeMs);
  const snapshot = {
    type: "black_box_15m",
    schemaVersion: 4,
    decisionId,
    capturedAt: new Date().toISOString(),
    capturedAtMs,
    symbol,
    timeframe: "5m",
    source: response.isLive ? "live" : "fallback",
    dataQuality: {
      accepted: true,
      marketDataSource: response.isLive ? "live" : "fallback",
      validationReasons: [],
      latestCandleAgeMs: capturedAtMs - candleTimeMs,
      recentNonzeroVolumeBars: recentCandles.filter((candle) => candle.volume > 0).length,
    },
    session: {
      name: "regular",
      timezone: "America/New_York",
      captureMinuteEt: getRegularSessionState().minuteOfDay,
    },
    price: latest.close,
    candleTimeMs,
    priceCheckpoint: {
      capture: latest.close,
      forward15m: null,
      forward30m: null,
      forward60m: null,
    },
    priceAction: {
      change1BarPct: prior ? Number((((latest.close - prior.close) / Math.max(prior.close, 0.000001)) * 100).toFixed(3)) : null,
      range20BarPct: Number((((recentHigh - recentLow) / Math.max(latest.close, 0.000001)) * 100).toFixed(3)),
      closeLocationPct: Number((((latest.close - latest.low) / candleRange) * 100).toFixed(1)),
      volumeRatio20Bar: Number((latest.volume / Math.max(averageVolume, 1)).toFixed(3)),
      bars: recentCandles.map((candle) => ({
        timeMs: candle.timeMs ?? (candle.time ? candle.time * 1000 : null),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      })),
    },
    engineState: {
      directionalBias: analysis.directionalBias,
      tacticalConfidence: analysis.confidence,
      tactical: {
        strategy: analysis.strategy,
        directionScore: analysis.directionScore,
        tradePlan: analysis.tactical?.tradePlan,
        optionCandidate: analysis.tactical?.otm,
      },
      patternSignals: {
        liquiditySweep: analysis.liquiditySweep,
        failedVwapReclaim: analysis.failedVwapReclaim,
        momentumDivergence: analysis.momentumDivergence,
        volumeSpike: analysis.volumeSpike,
        trendExhaustion: analysis.trendExhaustion,
        candleStrength: analysis.candleStrength,
        divergenceWarning: analysis.divergenceWarning,
        emaCloud: analysis.emaCloud,
      },
      health: {
        grade: analysis.marketHealth?.healthGrade,
        rsi: analysis.marketHealth?.rsi?.value,
        adx: analysis.marketHealth?.adx?.value,
        macd: analysis.marketHealth?.macd?.value,
        obvRatio: (analysis.marketHealth as any)?.obv?.ratio,
        cmf: analysis.marketHealth?.cmf?.value,
      },
      fusion: {
        direction: fusion.unifiedSignal?.unifiedDirection,
        confidence: fusion.unifiedSignal?.unifiedConfidence,
        action: fusion.unifiedSignal?.recommendedAction,
        forecast: fusion.forecast,
        probabilities: fusion.directionalProbabilities,
        mtf: fusion.mtfConsensus,
        gating: fusion.gatingState,
        risk: fusion.riskModel,
        breakout: {
          zones: fusion.breakoutZones,
          lifecycle: fusion.breakoutLifecycle,
          compression: fusion.compressionCluster,
          exhaustion: fusion.exhaustionCluster,
        },
        patterns: fusion.timeframes,
      },
      institutional: {
        core: fusion.institutionalCore,
        intent: fusion.intent,
        marketDNA: fusion.marketDNA,
        liquidity: fusion.liquidityGeometry,
        orderBlock: orderBlock ? {
          score: orderBlock.score,
          direction: orderBlock.direction,
          fresh: orderBlock.fresh,
          used: orderBlock.used,
          nearestBullish: orderBlock.nearestBullish,
          nearestBearish: orderBlock.nearestBearish,
          volumeProfile: orderBlock.volumeProfile,
        } : null,
      },
      monster: monster ? {
        hasPlay: monster.hasPlay,
        play: monster.play,
        breakout: monster.breakout,
        pce: monster.pce,
      } : null,
    },
  };

  writeSnapshot(snapshot);
  appendSystemAudit("engine.snapshot", {
    decisionId,
    symbol,
    price: latest.close,
    direction: fusion.unifiedSignal?.unifiedDirection ?? "WAIT",
    confidence: fusion.unifiedSignal?.unifiedConfidence ?? 0,
    hasMonsterPlay: Boolean(monster?.hasPlay),
    orderBlockDirection: orderBlock?.direction ?? "neutral",
  });
}

export async function collectEngineSnapshots(_force = false): Promise<{ ran: boolean; succeeded: number; failed: number; skippedReason?: "collection_running" | "outside_regular_session" }> {
  if (collectionRunning) {
    return { ran: false, succeeded: lastSuccessfulSymbols, failed: lastFailedSymbols, skippedReason: "collection_running" };
  }
  if (!isRegularSession()) {
    return { ran: false, succeeded: lastSuccessfulSymbols, failed: lastFailedSymbols, skippedReason: "outside_regular_session" };
  }
  collectionRunning = true;
  try {
    const results = await Promise.allSettled(SNAPSHOT_SYMBOLS.map(collectSymbolSnapshot));
    const succeeded = results.filter((result) => result.status === "fulfilled").length;
    const failed = results.length - succeeded;
    lastCollectionAt = Date.now();
    lastSuccessfulSymbols = succeeded;
    lastFailedSymbols = failed;
    console.log(`[BlackBox] 15m session sample: ${succeeded}/${SNAPSHOT_SYMBOLS.length} symbols captured${failed ? `, ${failed} failed` : ""}`);
    return { ran: true, succeeded, failed };
  } finally {
    collectionRunning = false;
  }
}

export function getBlackBoxStatus() {
  return {
    armed: Boolean(schedulerId || initialTimer),
    collecting: collectionRunning,
    regularSession: isRegularSession(),
    lastCollectionAt,
    lastSuccessfulSymbols,
    lastFailedSymbols,
    symbols: SNAPSHOT_SYMBOLS,
    retentionDays: RETENTION_DAYS,
  };
}

export function startEngineSnapshotScheduler(): void {
  if (schedulerId || initialTimer) return;
  const now = Date.now();
  const delay = SNAPSHOT_INTERVAL_MS - (now % SNAPSHOT_INTERVAL_MS);
  console.log(`[BlackBox] Armed 15m regular-session capture for ${SNAPSHOT_SYMBOLS.join(", ")} (${RETENTION_DAYS}-day retention)`);

  initialTimer = setTimeout(() => {
    initialTimer = null;
    void collectEngineSnapshots();
    schedulerId = setInterval(() => void collectEngineSnapshots(), SNAPSHOT_INTERVAL_MS);
  }, delay);
}

export function stopEngineSnapshotScheduler(): void {
  if (initialTimer) clearTimeout(initialTimer);
  if (schedulerId) clearInterval(schedulerId);
  initialTimer = null;
  schedulerId = null;
}