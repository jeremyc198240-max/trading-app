import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowDownRight, ArrowUpRight, BellRing, Brain, ChevronDown, Crosshair, Radar, RotateCcw, ShieldAlert, Target, Waves, X, Zap } from "lucide-react";
import type { AnalysisPayload, NormalizedPattern, OHLC, SmartSignal } from "@shared/schema";
import { TWO_CANDLE_REVERSAL_PATTERN_NAMES } from "@shared/patternRegistry";
import { fuseCompositeGauge, type CompositeGaugeInput, type CompositeGaugeResult } from "@/lib/warRoomCompositeGauge";
import { readPriceActionReversal } from "@/lib/warRoomPriceActionReversal";
import { deriveLiveDirectionalProbabilities } from "@/lib/warRoomLiveDirectional";
import { canonicalPatternName, dedupeNormalizedPatterns } from "@/lib/warRoomPatternDedupe";
import { isActionableEdgeCard, isEarlyDirectionalStandbyEdgeCard, isHighConvictionArmingEdgeCard, type ScannerResult } from "@/components/EdgeAlertBar";
import { MacroYieldsTab } from "@/components/MacroYieldsTab";
import { PatternCardVisual } from "@/components/PatternCardVisual";
import { isScannerHotPlay } from "@/lib/scannerHotPlay";

interface WarRoomCommandDeckProps {
  analysis: AnalysisPayload;
  lastPrice: number;
  spotIsLive: boolean;
  timeframe: string;
  isRefreshing?: boolean;
}

type ManagedPositionSide = "CALL" | "PUT";
type TabMonitorTone = "call" | "put" | "conflict" | "neutral";

const patternAlertNames = new Set<string>([
  ...TWO_CANDLE_REVERSAL_PATTERN_NAMES,
  "Piercing Line",
  "Stick Sandwich (Bullish)",
  "Separating Lines (Bullish)",
  "Separating Lines (Bearish)",
]);

const patternAlertDisplayNames: Record<string, string> = {
  "Piercing Line": "Piercing Line (Piercing Pattern)",
  "Stick Sandwich (Bullish)": "Stick Sandwich",
  "Separating Lines (Bullish)": "Bullish Separating Lines",
  "Separating Lines (Bearish)": "Bearish Separating Lines",
};

const canonicalPatternAlertNames = new Set([...patternAlertNames].map(canonicalPatternName));

interface PositionManagerAlertRun {
  alertId: string;
  symbol: string;
  timeframe: string;
  side: ManagedPositionSide;
  startedAt: number;
  startPrice: number;
  latestPrice: number;
  maxFavorableExcursionPct: number;
  maxAdverseExcursionPct: number;
  maxFavorableAt: number;
  maxAdverseAt: number;
  lastSampledAt: number;
  sampleCount: number;
  score: number;
  opposingScore: number;
  scoreGap: number;
  coverage: number;
  gateState: string;
  studyState: string;
  fusionFresh: boolean;
  fiveMinuteState?: string | null;
  breakoutAgeMinutes?: number | null;
  ignition: {
    direction?: string | null;
    state?: string | null;
    strength?: number | null;
    volumeAcceleration?: number | null;
  };
  signals: Array<{
    label: string;
    score: number;
    weight: number;
    classification: "support" | "neutral" | "conflict";
  }>;
}

function postPositionManagerAlert(payload: Record<string, unknown>, useBeacon = false): void {
  const body = JSON.stringify(payload);
  if (useBeacon && navigator.sendBeacon) {
    navigator.sendBeacon("/api/black-box/position-manager-alert", new Blob([body], { type: "application/json" }));
    return;
  }
  void fetch("/api/black-box/position-manager-alert", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch((error) => console.warn("Position-manager alert logging failed", error));
}

interface FusionCommandData {
  currentPrice?: number;
  expectedMove?: { dollars?: number; pct?: number; confidence?: number };
  breakoutZones?: { upper?: number; lower?: number; retest?: number; invalidation?: number; upsideTarget1?: number; upsideTarget2?: number; downsideTarget1?: number; downsideTarget2?: number };
  breakoutLifecycle?: { state?: string; zoneLow?: number; zoneHigh?: number };
  microBreakout?: {
    ignition1m?: { available?: boolean; fresh?: boolean; direction?: ManagedPositionSide | "WAIT"; volumeRatio?: number; volumeAcceleration?: number; pressure?: number; alignedPressureBars?: number; ageMinutes?: number | null; studyCandidate?: boolean; strength?: number; state?: "QUIET" | "BUILDING" | "SURGE" | "STALE" };
    structure5m?: {
      call?: { state?: "NO LEVEL" | "WAITING" | "TESTING" | "REJECTED" | "ACCEPTED" | "RETEST HELD"; level?: number | null; doji?: boolean; ageMinutes?: number | null; breakoutAgeMinutes?: number | null };
      put?: { state?: "NO LEVEL" | "WAITING" | "TESTING" | "REJECTED" | "ACCEPTED" | "RETEST HELD"; level?: number | null; doji?: boolean; ageMinutes?: number | null; breakoutAgeMinutes?: number | null };
    };
  };
  compressionCluster?: {
    active?: boolean;
    bbSqueezeActive?: boolean;
    keltnerBreakoutSide?: "upper" | "lower" | "none";
    healthLow?: boolean;
    readinessScore?: number;
    factors?: {
      bollinger?: number;
      atrTightness?: number;
      volumeSweetSpot?: number;
      preBreakout?: number;
      timeframeStack?: number;
      triggerPressure?: number;
    };
    reasons?: string[];
  };
  gatingState?: { metaAllowed?: boolean; monsterConflict?: boolean; reasons?: string[]; gatingScore?: number };
  monsterGateDecision?: { value?: number; direction?: "calls" | "puts" | "none"; allowedAggression?: boolean; conflict?: boolean; conflictReason?: string | null };
  monsterOtm?: {
    hasPlay?: boolean;
    play?: {
      side?: "call" | "put";
      strike?: number;
      premium?: number;
      delta?: number;
      roomPoints?: number;
      quality?: "A" | "B" | "none";
      probability?: number;
      hitProbability?: number;
      targetPrice?: number;
      stopPrice?: number;
      reason?: string;
    } | null;
    breakout?: { triggered?: boolean; type?: "breakout_up" | "breakout_down" | "none"; alert?: string; hitProbability?: number };
  };
  volatilityRegime?: { regime?: string };
  mtfConsensus?: { trendConsensus?: string; alignmentScore?: number };
  directionalProbabilities?: { up?: number; down?: number; chop?: number };
  institutionalSummary?: {
    liquidityGeometry?: {
      active?: boolean;
      confidence?: number;
      direction?: string;
      level?: number;
    };
    orderBlock?: {
      active?: boolean;
      score?: number;
      direction?: string;
      fresh?: number;
      used?: number;
      vpoc?: number;
      valueAreaLow?: number;
      valueAreaHigh?: number;
    };
    marketDNA?: {
      active?: boolean;
      reliability?: number;
      sweepFreq?: number;
      obReliability?: number;
      institutionalScore?: number;
    };
    intent?: {
      active?: boolean;
      confidence?: number;
      direction?: string;
    };
    institutionalCore?: {
      active?: boolean;
      direction?: string;
      score?: number;
      reasons?: string[];
    };
  };
  unifiedSignal?: {
    state?: "ACTIVE" | "INACTIVE" | "STALE";
    unifiedDirection?: "CALL" | "PUT" | "WAIT";
    unifiedConfidence?: number;
    unifiedPlay?: { type?: "CALL" | "PUT" | "WAIT"; strike?: number | null; reason?: string } | null;
    entryZone?: { min?: number; max?: number };
    stopLoss?: number;
    priceTargets?: number[];
    recommendedAction?: string;
    setupGrade?: string;
  };
  smartSignal?: SmartSignal;
  timeframes?: Array<{
    timeframe: string;
    structuralCompression?: number;
    volatilityExpansionProb?: number;
    regimeBias?: "trending" | "ranging" | "compressing" | "expanding";
    trendBias?: "bullish" | "bearish" | "neutral";
    primary?: { name?: string; confidence?: number } | null;
  }>;
}

interface BreakoutHistoryData {
  summary?: {
    lookbackHours?: number;
    sample?: { total?: number; completed?: number; wins?: number; losses?: number; missed?: number; pending?: number; winRate?: number };
    byMode?: {
      EXECUTE?: { total?: number; completed?: number; wins?: number; losses?: number; missed?: number; winRate?: number };
      PREPARE?: { total?: number; completed?: number; wins?: number; losses?: number; missed?: number; winRate?: number; promoted?: number; promotionRate?: number };
    };
    lead10m?: { total?: number; completed?: number; wins?: number; losses?: number; winRate?: number };
    byDirection?: Record<string, { total?: number; completed?: number; wins?: number; losses?: number; winRate?: number }>;
    topLeadProfiles?: Array<{ label?: string; total?: number; wins?: number; losses?: number; winRate?: number }>;
  };
}

interface WarRoomGaugeData {
  name: string;
  score: number;
  confidence: number;
  reliability: number;
  direction: "CALL" | "PUT" | "WAIT";
}

interface WarRoomCalibrationData {
  modelVersion?: string;
  horizonMinutes?: number;
  lookbackHours?: number;
  gauges?: Array<{
    name: string;
    regimes: Array<{
      name: string;
      total: number;
      wins: number;
      losses: number;
      flats: number;
      neutrals: number;
      decisive: number;
      winRate: number | null;
    }>;
    total: number;
    fresh: number;
    stale: number;
    wins: number;
    losses: number;
    flats: number;
    neutrals: number;
    decisive: number;
    winRate: number | null;
    bins: Array<{
      label: string;
      total: number;
      wins: number;
      losses: number;
      flats: number;
      neutrals: number;
      winRate: number | null;
    }>;
  }>;
  recentSnapshots?: Array<{
    snapshotId: string;
    symbol: string;
    timeframe: string;
    capturedAtMs: number;
    marketRegime: string;
    features: Record<string, number | boolean | null>;
    feedFresh: boolean;
    feedAgeMs: number | null;
    gauges: WarRoomGaugeData[];
    outcomes: Array<{ gauge: string; result: "win" | "loss" | "flat" | "neutral"; movePct: number }>;
  }>;
}

interface EdgeTuningData {
  currentWindow?: {
    sample?: {
      edgeSampleCount?: number;
      completed?: number;
      wins?: number;
      losses?: number;
      missed?: number;
      winRate?: number;
      execute?: { completed?: number; wins?: number; losses?: number; missed?: number; winRate?: number };
    };
    quality?: { avgEdgeScore?: number; avgConfidence?: number; avgTriggerProbability?: number };
    mix?: { state?: { PRIMED?: number; TRIGGERED?: number } };
  } | null;
}

interface ScannerPlayAlert {
  id: string;
  timestamp: number;
  symbol: string;
  timeframe: string;
  mode: "PREPARE" | "EXECUTE";
  signal: string;
  direction: "bullish" | "bearish" | "neutral";
  breakoutScore: number;
  signalQuality: "HIGH" | "MEDIUM" | "LOW" | "UNRELIABLE";
  warnings: string[];
  priceAtCapture: number;
  stopLoss: number;
  targets: number[];
  outcome: "win_t1" | "win_t2" | "loss" | "pending" | "missed";
}

interface ScannerPlayAlertsData {
  entries?: ScannerPlayAlert[];
}

interface ScalpConfluenceData {
  lastRunAt?: number;
  isScanning?: boolean;
  sessionEligible?: boolean;
  inactiveReason?: "outside_regular_session";
  symbolsScanned?: number;
  symbolsWithUsableCandles?: number;
  scanIntervalMs?: number;
  candleTimeframe?: string;
  closingCaptureWindow?: boolean;
  radarTracks?: Array<{
    symbol: string;
    direction: "LONG" | "SHORT";
    score: number;
    price: number;
    volumeRatio: number;
    macdCross: boolean;
    divergence: boolean;
    breakout: boolean;
    closeStrength?: number;
    trendAligned?: boolean;
    breakoutDistancePct?: number;
    bollingerTight?: boolean;
    strongPriceAction?: boolean;
    strongSetup?: boolean;
    preBreakout?: boolean;
    emaCrossDirection?: "bullish" | "bearish" | "none";
    emaCrossCount?: number;
    emaCrossStrength?: number;
    emaCrosses?: string[];
    state: "WATCH" | "ARMING" | "TRIGGERED" | "RESOLVED";
    qualifies: boolean;
    activeSince?: number;
    resolvedReason?: "extension_complete" | "confirmation_lost" | "expired";
  }>;
  candidates?: Array<{
    symbol: string;
    direction: "LONG" | "SHORT";
    score: number;
    price: number;
    rsi: number;
    volumeRatio: number;
    macdCross: boolean;
    divergence: boolean;
    breakout: boolean;
    bollingerTight?: boolean;
    trendAligned?: boolean;
    strongPriceAction?: boolean;
    strongSetup?: boolean;
    emaCrossDirection?: "bullish" | "bearish" | "none";
    emaCrossCount?: number;
    emaCrossStrength?: number;
    emaCrosses?: string[];
    reasons: string[];
  }>;
}

interface DisplayScalpTrack {
  symbol: string;
  direction: "LONG" | "SHORT";
  score: number;
  price: number;
  rsi?: number;
  volumeRatio: number;
  macdCross: boolean;
  divergence: boolean;
  breakout: boolean;
  closeStrength?: number;
  trendAligned?: boolean;
  breakoutDistancePct?: number;
  bollingerTight?: boolean;
  strongPriceAction?: boolean;
  strongSetup?: boolean;
  preBreakout?: boolean;
  emaCrossDirection?: "bullish" | "bearish" | "none";
  emaCrossCount?: number;
  emaCrossStrength?: number;
  emaCrosses?: string[];
  state: "WATCH" | "ARMING" | "TRIGGERED";
}

interface RadarTrack {
  symbol: string;
  direction: "LONG" | "SHORT";
  score: number;
  volumeRatio: number;
  closeStrength?: number;
  trendAligned?: boolean;
  breakout?: boolean;
  emaCrossStrength?: number;
  state: string;
}

interface AlertDisplayTrack extends DisplayScalpTrack {
  source: "scalp" | "edge";
}

interface TradingViewEvidenceData {
  success?: boolean;
  lookback?: { days?: number };
  baseline?: { total?: number; winRate?: number };
  topRules?: Array<{ rule?: string; support?: number; wins?: number; winRate?: number; lift?: number }>;
}

function value(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? `$${value.toFixed(2)}` : "--";
}

function percent(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${Math.round(value)}%` : "--";
}

function toPercentScale(value: number | undefined): number {
  if (!Number.isFinite(value as number)) return 0;
  const v = Number(value);
  return v <= 1 ? Math.max(0, Math.min(100, v * 100)) : Math.max(0, Math.min(100, v));
}

function decimalPercent(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(1)}%` : "--";
}

function isDirectionalTarget(target: number | undefined, trigger: number | undefined, direction: "CALL" | "PUT" | null): target is number {
  return typeof target === "number" && Number.isFinite(target) && target > 0 && typeof trigger === "number" && Number.isFinite(trigger) &&
    (direction === "CALL" ? target > trigger : direction === "PUT" ? target < trigger : false);
}

interface VolumeRead {
  ratio: number;
  latest: number;
  average: number;
  bars: number[];
}

interface EmaLine {
  period: 9 | 21 | 50 | 200;
  values: number[];
  latest: number;
  slope: number;
}

interface FvgZone {
  direction: "bullish" | "bearish";
  startIndex: number;
  low: number;
  high: number;
  fillPercent: number;
  age: number;
  quality: number;
}

interface LiquidityMagnetLevel {
  label: string;
  kind: "pool" | "poc" | "gamma" | "prior" | "fvg" | "imbalance" | "trigger";
  price: number;
  score: number;
  note: string;
}

interface LiquidityExecutionModel {
  magnets: LiquidityMagnetLevel[];
  nearestMagnet?: LiquidityMagnetLevel;
  direction: "CALL" | "PUT" | "WAIT";
  movingToward: boolean;
  distancePct: number;
  equalHighs: boolean;
  equalLows: boolean;
  tightRange: boolean;
  microConsolidation: boolean;
  insideBar: boolean;
  preNews: boolean;
  lowVolume: boolean;
  middayChop: boolean;
  components: {
    liquidityPool: number;
    trendAlignment: number;
    volumeProfileLevel: number;
    momentumConfirmation: number;
    timeOfDay: number;
  };
  penalties: {
    middayChop: number;
    insideBar: number;
    preNews: number;
    lowVolume: number;
    microRanges: number;
  };
  totalScore: number;
}

interface PriceActionConfirmation {
  direction: "bullish" | "bearish" | "neutral";
  putConfirmed: boolean;
  callConfirmed: boolean;
  priorClosedPrice?: number;
  upSteps: number;
  downSteps: number;
}

function calculateEmaSeries(values: number[], period: EmaLine["period"]): number[] {
  if (values.length < period) return [];
  const multiplier = 2 / (period + 1);
  const series = [values.slice(0, period).reduce((sum, value) => sum + value, 0) / period];
  for (let index = period; index < values.length; index += 1) {
    series.push(values[index] * multiplier + series[series.length - 1] * (1 - multiplier));
  }
  return series;
}

function buildEmaLines(analysis: AnalysisPayload, liveSpot = 0): EmaLine[] {
  const closes = (analysis.ohlc ?? []).map((candle) => Number(candle.close)).filter((close) => Number.isFinite(close) && close > 0);
  if (liveSpot > 0) closes.push(liveSpot);
  return ([9, 21, 50, 200] as const).map((period) => {
    const values = calculateEmaSeries(closes, period);
    const latest = values.at(-1) ?? 0;
    const prior = values.at(-6) ?? values[0] ?? latest;
    return { period, values, latest, slope: prior > 0 ? ((latest - prior) / prior) * 100 : 0 };
  });
}

function countTimeframeTrends(timeframes: NonNullable<FusionCommandData["timeframes"]>): { bullish: number; bearish: number } {
  return timeframes.reduce((counts, frame) => {
    if (frame.trendBias === "bullish") counts.bullish += 1;
    if (frame.trendBias === "bearish") counts.bearish += 1;
    return counts;
  }, { bullish: 0, bearish: 0 });
}

function detectActiveFvgZones(ohlc: OHLC[]): FvgZone[] {
  const zones: FvgZone[] = [];
  for (let index = 2; index < ohlc.length; index += 1) {
    const first = ohlc[index - 2];
    const impulse = ohlc[index - 1];
    const third = ohlc[index];
    const candidate = first.high < third.low
      ? { direction: "bullish" as const, low: first.high, high: third.low }
      : first.low > third.high
        ? { direction: "bearish" as const, low: third.high, high: first.low }
        : null;
    if (!candidate) continue;

    const gapSize = candidate.high - candidate.low;
    const referencePrice = Math.max(0.01, (candidate.high + candidate.low) / 2);
    const gapPercent = gapSize / referencePrice * 100;
    const impulseRange = Math.max(0.0001, impulse.high - impulse.low);
    const impulseBody = Math.abs(impulse.close - impulse.open);
    const displacement = impulseBody / impulseRange;
    const priorVolume = ohlc.slice(Math.max(0, index - 22), index - 2);
    const averageVolume = priorVolume.length
      ? priorVolume.reduce((sum, candle) => sum + Math.max(0, candle.volume ?? 0), 0) / priorVolume.length
      : 0;
    const volumeRatio = averageVolume > 0 ? Math.max(0, impulse.volume ?? 0) / averageVolume : 1;
    const deepestFill = ohlc.slice(index + 1).reduce((fill, candle) => candidate.direction === "bullish"
      ? Math.max(fill, candidate.high - candle.low)
      : Math.max(fill, candle.high - candidate.low), 0);
    const fillPercent = gapSize > 0 ? Math.max(0, Math.min(100, (deepestFill / gapSize) * 100)) : 100;
    const quality = clampScore(
      Math.min(35, gapPercent * 120) +
      displacement * 30 +
      Math.min(20, Math.max(0, volumeRatio - 0.8) * 20) +
      Math.max(0, 15 - (ohlc.length - 1 - index) * 0.5),
    );
    if (fillPercent < 100 && quality >= 25) {
      zones.push({ ...candidate, startIndex: index - 2, fillPercent, age: ohlc.length - 1 - index, quality });
    }
  }
  return zones.sort((left, right) => right.quality - left.quality).slice(0, 12);
}

function fvgZoneStrength(zone: FvgZone | undefined, spot: number, ema21: number): number {
  if (!zone || spot <= 0) return 0;
  const midpoint = (zone.low + zone.high) / 2;
  const distancePct = Math.abs(spot - midpoint) / spot * 100;
  const proximity = Math.max(0, 100 - distancePct * 80);
  const freshness = Math.max(0, 100 - zone.age * 2.5);
  const unfilled = 100 - zone.fillPercent;
  const emaDistancePct = ema21 > 0 ? Math.abs(midpoint - ema21) / ema21 * 100 : 10;
  const confluence = Math.max(0, 100 - emaDistancePct * 100);
  return clampScore(proximity * 0.3 + freshness * 0.15 + unfilled * 0.2 + confluence * 0.15 + zone.quality * 0.2);
}

function buildPriceActionConfirmation(ohlc: OHLC[], spot: number): PriceActionConfirmation {
  const completedCloses = ohlc.slice(-6, -1).map((candle) => candle.close).filter((close) => Number.isFinite(close) && close > 0);
  const priorClosedPrice = completedCloses.at(-1);
  const observedPrice = spot > 0 ? spot : ohlc.at(-1)?.close;
  let upSteps = 0;
  let downSteps = 0;

  for (let index = 1; index < completedCloses.length; index += 1) {
    if (completedCloses[index] > completedCloses[index - 1]) upSteps += 1;
    if (completedCloses[index] < completedCloses[index - 1]) downSteps += 1;
  }

  const shortTrendDown = completedCloses.length >= 3 && completedCloses.at(-1)! < completedCloses.at(-3)!;
  const shortTrendUp = completedCloses.length >= 3 && completedCloses.at(-1)! > completedCloses.at(-3)!;
  const liveDown = Number.isFinite(observedPrice) && Number.isFinite(priorClosedPrice) && Number(observedPrice) < Number(priorClosedPrice);
  const liveUp = Number.isFinite(observedPrice) && Number.isFinite(priorClosedPrice) && Number(observedPrice) > Number(priorClosedPrice);
  const putConfirmed = liveDown && (shortTrendDown || downSteps >= 1);
  const callConfirmed = liveUp && (shortTrendUp || upSteps >= 1);

  return {
    direction: putConfirmed ? "bearish" : callConfirmed ? "bullish" : "neutral",
    putConfirmed,
    callConfirmed,
    priorClosedPrice,
    upSteps,
    downSteps,
  };
}

function buildVolumeRead(analysis: AnalysisPayload): VolumeRead {
  const candles = (analysis.ohlc ?? []).slice(-25);
  const rawBars = candles.map((candle) => Math.max(0, Number(candle.volume) || 0));
  let latestCompletedIndex = -1;
  for (let index = rawBars.length - 1; index >= 0; index -= 1) {
    if (rawBars[index] > 0) {
      latestCompletedIndex = index;
      break;
    }
  }
  const completedBars = latestCompletedIndex >= 0 ? rawBars.slice(0, latestCompletedIndex + 1) : rawBars;
  const latest = completedBars.at(-1) ?? 0;
  const baseline = completedBars.slice(0, -1).slice(-20);
  const average = baseline.length ? baseline.reduce((sum, volume) => sum + volume, 0) / baseline.length : 0;
  return { ratio: average > 0 ? latest / average : 0, latest, average, bars: completedBars };
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

type PatternReadGrade = "A+" | "A" | "B" | "C" | "D" | "F";

interface GradedPattern {
  pattern: NormalizedPattern;
  score: number;
  grade: PatternReadGrade;
  alignment: "aligned" | "conflict" | "neutral";
}

function patternGradeFromScore(score: number): PatternReadGrade {
  if (score >= 92) return "A+";
  if (score >= 84) return "A";
  if (score >= 72) return "B";
  if (score >= 60) return "C";
  if (score >= 48) return "D";
  return "F";
}

function gradePatternFromOverallRead(pattern: NormalizedPattern, analysis: AnalysisPayload): GradedPattern {
  const confidence = clampScore(pattern.confidence);
  const quality = clampScore(pattern.quality * 100);
  const overall = clampScore(analysis.overall);
  const aligned = pattern.direction !== "neutral" && pattern.direction === analysis.directionalBias;
  const conflicts = pattern.direction !== "neutral" && analysis.directionalBias !== "neutral" && pattern.direction !== analysis.directionalBias;
  const lifecycleAdjustment = pattern.state === "breaking" ? 6
    : pattern.state === "valid" ? 3
      : pattern.state === "forming" ? -3
        : pattern.state === "failed" ? -24 : -32;
  const alignmentAdjustment = aligned ? 8 : conflicts ? -10 : 0;
  const score = clampScore(confidence * 0.4 + quality * 0.3 + overall * 0.3 + lifecycleAdjustment + alignmentAdjustment);

  return {
    pattern,
    score,
    grade: patternGradeFromScore(score),
    alignment: aligned ? "aligned" : conflicts ? "conflict" : "neutral",
  };
}

function sessionBucketFromNow(now = Date.now()): "open" | "morning" | "midday" | "afternoon" | "late" | "offhours" {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(now));
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  const minute = Number(parts.find((part) => part.type === "minute")?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "offhours";
  const total = hour * 60 + minute;
  if (total < 600) return "open";
  if (total < 660) return "morning";
  if (total < 750) return "midday";
  if (total < 840) return "afternoon";
  if (total < 960) return "late";
  return "offhours";
}

function detectInsideBar(ohlc: OHLC[]): boolean {
  if (ohlc.length < 2) return false;
  const last = ohlc[ohlc.length - 1];
  const prev = ohlc[ohlc.length - 2];
  return last.high <= prev.high && last.low >= prev.low;
}

function detectEqualExtremes(ohlc: OHLC[], spot: number): { equalHighs: boolean; equalLows: boolean } {
  const recent = ohlc.slice(-14);
  if (recent.length < 6 || spot <= 0) return { equalHighs: false, equalLows: false };
  const highs = [...recent].sort((a, b) => b.high - a.high);
  const lows = [...recent].sort((a, b) => a.low - b.low);
  const highTolerance = Math.max(spot * 0.0005, 0.02);
  const lowTolerance = Math.max(spot * 0.0005, 0.02);
  const equalHighs = highs.length >= 2 && Math.abs(highs[0].high - highs[1].high) <= highTolerance;
  const equalLows = lows.length >= 2 && Math.abs(lows[0].low - lows[1].low) <= lowTolerance;
  return { equalHighs, equalLows };
}

function detectRangeState(ohlc: OHLC[], spot: number): { tightRange: boolean; microConsolidation: boolean } {
  const micro = ohlc.slice(-6);
  const swing = ohlc.slice(-12);
  if (spot <= 0 || micro.length < 4 || swing.length < 8) {
    return { tightRange: false, microConsolidation: false };
  }
  const microRange = (Math.max(...micro.map((candle) => candle.high)) - Math.min(...micro.map((candle) => candle.low))) / spot * 100;
  const swingRange = (Math.max(...swing.map((candle) => candle.high)) - Math.min(...swing.map((candle) => candle.low))) / spot * 100;
  return {
    microConsolidation: microRange <= 0.22,
    tightRange: swingRange <= 0.48,
  };
}

function buildLiquidityExecutionModel(params: {
  spot: number;
  previousSpot: number;
  ohlc: OHLC[];
  direction: SmartSignal["direction"];
  chopDominant: boolean;
  volumeRatio: number;
  momentumAbs: number;
  mtfScore: number;
  volatilityRegime?: string;
  structureLevels: StructureLevel[];
  orderBlock?: FusionCommandData["institutionalSummary"] extends infer X ? X extends { orderBlock?: infer O } ? O : never : never;
  liquidity?: FusionCommandData["institutionalSummary"] extends infer X ? X extends { liquidityGeometry?: infer L } ? L : never : never;
  gammaStrike?: number | null;
  liquidityLevels?: Array<{ price: number; type?: string; liquidityScore?: number }>;
  nearestBullishFvg?: FvgZone;
  nearestBearishFvg?: FvgZone;
}): LiquidityExecutionModel {
  const {
    spot,
    previousSpot,
    ohlc,
    direction,
    chopDominant,
    volumeRatio,
    momentumAbs,
    mtfScore,
    volatilityRegime,
    structureLevels,
    orderBlock,
    liquidity,
    gammaStrike,
    liquidityLevels,
    nearestBullishFvg,
    nearestBearishFvg,
  } = params;

  const magnets: LiquidityMagnetLevel[] = [];
  const unique = new Set<string>();
  const addMagnet = (magnet: LiquidityMagnetLevel | null) => {
    if (!magnet || !Number.isFinite(magnet.price) || magnet.price <= 0) return;
    const key = `${magnet.kind}:${magnet.price.toFixed(2)}`;
    if (unique.has(key)) return;
    unique.add(key);
    magnets.push(magnet);
  };

  addMagnet(liquidity?.level ? {
    label: "Liquidity Pool",
    kind: "pool",
    price: liquidity.level,
    score: 3,
    note: "Institutional liquidity level",
  } : null);

  addMagnet(orderBlock?.vpoc ? {
    label: "POC",
    kind: "poc",
    price: orderBlock.vpoc,
    score: 2,
    note: "Volume profile control",
  } : null);

  addMagnet(orderBlock?.valueAreaHigh ? {
    label: "VA High",
    kind: "poc",
    price: orderBlock.valueAreaHigh,
    score: 2,
    note: "Volume profile boundary",
  } : null);

  addMagnet(orderBlock?.valueAreaLow ? {
    label: "VA Low",
    kind: "poc",
    price: orderBlock.valueAreaLow,
    score: 2,
    note: "Volume profile boundary",
  } : null);

  addMagnet(gammaStrike != null ? {
    label: "Gamma Wall",
    kind: "gamma",
    price: gammaStrike,
    score: 3,
    note: "Dealer gamma pivot",
  } : null);

  for (const level of liquidityLevels ?? []) {
    const kind = String(level.type ?? "").toUpperCase() === "GAMMA" ? "gamma" : "pool";
    addMagnet({
      label: String(level.type ?? "Liquidity"),
      kind,
      price: Number(level.price),
      score: kind === "gamma" ? 3 : 2,
      note: `${kind === "gamma" ? "Gamma" : "Liquidity"} map level`,
    });
  }

  for (const level of structureLevels) {
    if (level.kind !== "trigger" && level.kind !== "liquidity") continue;
    addMagnet({
      label: level.label,
      kind: level.kind === "trigger" ? "trigger" : "pool",
      price: level.price,
      score: 2,
      note: "Breakout structure level",
    });
  }

  const priorSlice = ohlc.slice(-32, -1);
  if (priorSlice.length >= 8) {
    addMagnet({
      label: "Prev High",
      kind: "prior",
      price: Math.max(...priorSlice.map((candle) => candle.high)),
      score: 2,
      note: "Previous swing high liquidity",
    });
    addMagnet({
      label: "Prev Low",
      kind: "prior",
      price: Math.min(...priorSlice.map((candle) => candle.low)),
      score: 2,
      note: "Previous swing low liquidity",
    });
  }

  addMagnet(nearestBullishFvg ? {
    label: "Bullish FVG",
    kind: "fvg",
    price: (nearestBullishFvg.low + nearestBullishFvg.high) / 2,
    score: 2,
    note: "Imbalance magnet below price",
  } : null);
  addMagnet(nearestBearishFvg ? {
    label: "Bearish FVG",
    kind: "imbalance",
    price: (nearestBearishFvg.low + nearestBearishFvg.high) / 2,
    score: 2,
    note: "Imbalance magnet above price",
  } : null);

  const sorted = magnets.sort((left, right) => Math.abs(left.price - spot) - Math.abs(right.price - spot));
  const nearestMagnet = sorted[0];
  const nearestDistancePct = nearestMagnet && spot > 0 ? Math.abs(nearestMagnet.price - spot) / spot * 100 : 999;
  const magnetDirection: "CALL" | "PUT" | "WAIT" = !nearestMagnet || spot <= 0
    ? "WAIT"
    : nearestMagnet.price >= spot
      ? "CALL"
      : "PUT";
  const previousDistance = nearestMagnet && previousSpot > 0 ? Math.abs(nearestMagnet.price - previousSpot) : Number.POSITIVE_INFINITY;
  const currentDistance = nearestMagnet && spot > 0 ? Math.abs(nearestMagnet.price - spot) : Number.POSITIVE_INFINITY;
  const movingToward = Boolean(nearestMagnet && previousSpot > 0 && currentDistance <= previousDistance);

  const { equalHighs, equalLows } = detectEqualExtremes(ohlc, spot);
  const { tightRange, microConsolidation } = detectRangeState(ohlc, spot);
  const insideBar = detectInsideBar(ohlc);
  const lowVolume = volumeRatio < 1;
  const sessionBucket = sessionBucketFromNow();
  const middayChop = chopDominant && (sessionBucket === "midday" || sessionBucket === "afternoon");
  const preNews = String(volatilityRegime ?? "").toUpperCase().includes("NEWS");

  const liquidityPool = nearestDistancePct <= 0.55 && (nearestMagnet?.kind === "pool" || nearestMagnet?.kind === "prior" || equalHighs || equalLows) ? 3 : 0;
  const trendAlignment = direction !== "WAIT" && direction === magnetDirection && mtfScore >= 55 ? 2 : 0;
  const volumeProfileLevel = nearestDistancePct <= 0.45 && (nearestMagnet?.kind === "poc" || nearestMagnet?.label.startsWith("VA ")) ? 2 : 0;
  const momentumConfirmation = direction !== "WAIT" && direction === magnetDirection && momentumAbs >= 35 ? 1 : 0;
  const timeOfDay = sessionBucket === "open" || sessionBucket === "morning" || sessionBucket === "late" ? 1 : 0;

  const penalties = {
    middayChop: middayChop ? -3 : 0,
    insideBar: insideBar ? -2 : 0,
    preNews: preNews ? -2 : 0,
    lowVolume: lowVolume ? -2 : 0,
    microRanges: (tightRange ? -1 : 0) + (microConsolidation ? -1 : 0),
  };

  const totalScore = liquidityPool + trendAlignment + volumeProfileLevel + momentumConfirmation + timeOfDay +
    penalties.middayChop + penalties.insideBar + penalties.preNews + penalties.lowVolume + penalties.microRanges;

  return {
    magnets: sorted.slice(0, 8),
    nearestMagnet,
    direction: magnetDirection,
    movingToward,
    distancePct: nearestDistancePct,
    equalHighs,
    equalLows,
    tightRange,
    microConsolidation,
    insideBar,
    preNews,
    lowVolume,
    middayChop,
    components: {
      liquidityPool,
      trendAlignment,
      volumeProfileLevel,
      momentumConfirmation,
      timeOfDay,
    },
    penalties,
    totalScore,
  };
}

function normalizeRadarState(state: string | undefined): DisplayScalpTrack["state"] {
  const normalized = String(state ?? "").toUpperCase();
  if (normalized === "TRIGGERED") return "TRIGGERED";
  if (normalized === "ARMING" || normalized === "PRIMED") return "ARMING";
  return "WATCH";
}

type StructureLevelKind = "target" | "trigger" | "retest" | "value" | "liquidity" | "entry" | "invalidation";

interface StructureLevel {
  label: string;
  price: number;
  kind: StructureLevelKind;
}

function buildStructureLevels({
  spot,
  zones,
  signal,
  orderBlock,
  liquidity,
}: {
  spot: number;
  zones: FusionCommandData["breakoutZones"];
  signal: FusionCommandData["unifiedSignal"] | undefined;
  orderBlock: NonNullable<FusionCommandData["institutionalSummary"]>["orderBlock"] | undefined;
  liquidity: NonNullable<FusionCommandData["institutionalSummary"]>["liquidityGeometry"] | undefined;
}): StructureLevel[] {
  const entry = signal?.entryZone?.min != null && signal?.entryZone?.max != null
    ? (signal.entryZone.min + signal.entryZone.max) / 2
    : undefined;
  const candidates: Array<StructureLevel | null> = [
    signal?.priceTargets?.[1] ? { label: "PT2", price: signal.priceTargets[1], kind: "target" } : null,
    signal?.priceTargets?.[0] ? { label: "PT1", price: signal.priceTargets[0], kind: "target" } : null,
    zones?.upper ? { label: "BREAKOUT", price: zones.upper, kind: "trigger" } : null,
    zones?.retest ? { label: "RETEST", price: zones.retest, kind: "retest" } : null,
    orderBlock?.valueAreaHigh ? { label: "VA HIGH", price: orderBlock.valueAreaHigh, kind: "value" } : null,
    liquidity?.level ? { label: "LIQUIDITY", price: liquidity.level, kind: "liquidity" } : null,
    entry ? { label: "ENTRY MID", price: entry, kind: "entry" } : null,
    orderBlock?.valueAreaLow ? { label: "VA LOW", price: orderBlock.valueAreaLow, kind: "value" } : null,
    zones?.lower ? { label: "BREAKDOWN", price: zones.lower, kind: "trigger" } : null,
    signal?.stopLoss ? { label: "STOP", price: signal.stopLoss, kind: "invalidation" } : null,
    zones?.invalidation ? { label: "INVALIDATION", price: zones.invalidation, kind: "invalidation" } : null,
  ];
  const tolerance = Math.max(Math.abs(spot) * 0.00035, 0.01);

  return candidates
    .filter((level): level is StructureLevel => Boolean(level && Number.isFinite(level.price) && level.price > 0))
    .sort((left, right) => right.price - left.price)
    .reduce<StructureLevel[]>((levels, level) => {
      const duplicate = levels.some((existing) => Math.abs(existing.price - level.price) <= tolerance);
      if (!duplicate) levels.push(level);
      return levels;
    }, [])
    .slice(0, 7);
}

export function WarRoomCommandDeck({ analysis, lastPrice, spotIsLive, timeframe, isRefreshing = false }: WarRoomCommandDeckProps) {
  const executionTimeframe = timeframe;
  const [activeView, setActiveView] = useState<"execution" | "position" | "smart" | "cloud" | "evidence" | "flow" | "radar" | "alerts" | "patterns" | "review" | "macro">("execution");
  const [managedPositionSide, setManagedPositionSide] = useState<ManagedPositionSide | null>(null);
  const [managedEntrySpot, setManagedEntrySpot] = useState<number | null>(null);
  const [managedPeakSpot, setManagedPeakSpot] = useState<number | null>(null);
  const [managedEntryTime, setManagedEntryTime] = useState<number | null>(null);
  const [managedClock, setManagedClock] = useState(() => Date.now());
  const [favoredPlayRun, setFavoredPlayRun] = useState<{ symbol: string; side: ManagedPositionSide; startedAt: number } | null>(null);
  const [favoredPlayClock, setFavoredPlayClock] = useState(() => Date.now());
  const [patternDetectionAlerts, setPatternDetectionAlerts] = useState<NormalizedPattern[]>([]);
  const [focusedScalpSymbol, setFocusedScalpSymbol] = useState<string | null>(null);
  const [expandedLeaderSymbol, setExpandedLeaderSymbol] = useState<string | null>(null);
  const [gateExpanded, setGateExpanded] = useState(false);
  const [goldPlayAlert, setGoldPlayAlert] = useState<ScannerResult[] | null>(null);
  const previousSpotRef = useRef(0);
  const spotTrailRef = useRef<number[]>([]);
  const spotTrailSymbolRef = useRef(analysis.symbol);
  const lastWarRoomCaptureRef = useRef<string | null>(null);
  const favoredAlertRef = useRef<PositionManagerAlertRun | null>(null);
  const positionHydrationKeyRef = useRef<string | null>(null);
  const patternAlertScopeRef = useRef(analysis.symbol);
  const seenPatternAlertsRef = useRef(new Set<string>());
  const previousGoldSymbolsRef = useRef<Set<string> | null>(null);
  const executionFeedsEnabled = activeView === "execution";
  const positionFeedsEnabled = activeView === "position";
  const radarFeedsEnabled = executionFeedsEnabled || positionFeedsEnabled || activeView === "radar" || activeView === "alerts" || activeView === "review";
  const calibrationFeedsEnabled = executionFeedsEnabled || positionFeedsEnabled || activeView === "evidence" || activeView === "review";
  const { data: fusion, dataUpdatedAt: fusionUpdatedAt, isFetching: fusionFetching, isError: fusionError } = useQuery<FusionCommandData>({
    queryKey: ["/api/fusion", analysis.symbol, executionTimeframe],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/fusion/${encodeURIComponent(analysis.symbol)}/${encodeURIComponent(executionTimeframe)}`, { signal });
      if (!response.ok) throw new Error("Unable to load tuned fusion");
      return response.json();
    },
    enabled: Boolean(analysis.symbol),
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    staleTime: 10000,
    retry: 1,
  });
  const { data: breakoutHistory, isFetching: historyFetching, isError: historyError } = useQuery<BreakoutHistoryData>({
    queryKey: ["/api/scanner/breakout-log/summary", "48h"],
    enabled: calibrationFeedsEnabled,
    queryFn: async () => {
      const response = await fetch("/api/scanner/breakout-log/summary?hours=48");
      if (!response.ok) throw new Error("Unable to load breakout history");
      return response.json();
    },
    refetchInterval: 60000,
    staleTime: 30000,
    retry: 1,
  });
  const { data: edgeTuning, isFetching: tuningFetching, isError: tuningError } = useQuery<EdgeTuningData>({
    queryKey: ["/api/scanner/edge-tuning/2d", "current"],
    enabled: calibrationFeedsEnabled,
    queryFn: async () => {
      const response = await fetch("/api/scanner/edge-tuning/2d?limit=1");
      if (!response.ok) throw new Error("Unable to load edge calibration");
      return response.json();
    },
    refetchInterval: 60000,
    staleTime: 30000,
    retry: 1,
  });
  const { data: scannerPlayAlerts } = useQuery<ScannerPlayAlertsData>({
    queryKey: ["/api/scanner/breakout-log", analysis.symbol],
    queryFn: async ({ signal }) => {
      const response = await fetch(`/api/scanner/breakout-log?symbol=${encodeURIComponent(analysis.symbol)}&hours=12&limit=25`, { signal });
      if (!response.ok) throw new Error("Unable to load scanner plays");
      return response.json();
    },
    enabled: Boolean(analysis.symbol) && (executionFeedsEnabled || activeView === "alerts"),
    refetchInterval: 30000,
    staleTime: 10000,
    retry: false,
  });
  const { data: scalpScan } = useQuery<ScalpConfluenceData>({
    queryKey: ["/api/scanner/scalp-confluence"],
    enabled: radarFeedsEnabled,
    refetchInterval: 30000,
    staleTime: 10000,
    retry: false,
  });
  const { data: edgeResults } = useQuery<ScannerResult[]>({
    queryKey: ["/api/scanner/results"],
    enabled: radarFeedsEnabled,
    refetchInterval: 10000,
    staleTime: 5000,
    retry: false,
  });
  const goldScannerRows = (edgeResults ?? []).filter(isScannerHotPlay);
  useEffect(() => {
    const goldScannerSymbols = new Set((edgeResults ?? [])
      .filter(isScannerHotPlay)
      .map((row) => row.symbol.toUpperCase()));
    const previous = previousGoldSymbolsRef.current;
    if (previous) {
      const newlyGold = [...goldScannerSymbols].filter((symbol) => !previous.has(symbol));
      if (newlyGold.length) {
        setGoldPlayAlert((edgeResults ?? []).filter((row) => newlyGold.includes(row.symbol.toUpperCase())));
      }
    }
    previousGoldSymbolsRef.current = goldScannerSymbols;
  }, [edgeResults]);
  const { data: evidence, isFetching: evidenceFetching, isError: evidenceError } = useQuery<TradingViewEvidenceData>({
    queryKey: ["/api/analytics/tradingview-evidence"],
    enabled: executionFeedsEnabled || positionFeedsEnabled || activeView === "evidence",
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
    retry: 1,
  });
  const { data: warRoomCalibration, isError: warRoomCalibrationError } = useQuery<WarRoomCalibrationData>({
    queryKey: ["/api/black-box/war-room-calibration", analysis.symbol, executionTimeframe, "168h"],
    enabled: activeView === "review",
    queryFn: async () => {
      const query = new URLSearchParams({
        hours: "168",
        symbol: analysis.symbol,
        timeframe: executionTimeframe,
      });
      const response = await fetch(`/api/black-box/war-room-calibration?${query}`);
      if (!response.ok) throw new Error("Unable to load War Room gauge calibration");
      return response.json();
    },
    refetchInterval: 60000,
    staleTime: 30000,
    retry: 1,
  });
  const signal = fusion?.unifiedSignal;
  const tradeState = signal?.state ?? "PENDING";
  const smartSignal = fusion?.smartSignal;
  const zones = fusion?.breakoutZones;
  // Dashboard supplies the freshest validated /api/spot quote; fusion may belong to an older analysis cycle.
  const spot = lastPrice > 0 ? lastPrice : fusion?.currentPrice ?? 0;
  const rawDirection = signal?.unifiedDirection ?? "WAIT";
  const fusionTrendConsensus = String(fusion?.mtfConsensus?.trendConsensus ?? "").toUpperCase();
  const fusionTiltDirection: SmartSignal["direction"] = rawDirection === "CALL" || rawDirection === "PUT"
    ? rawDirection
    : fusionTrendConsensus === "BULLISH" ? "CALL"
      : fusionTrendConsensus === "BEARISH" ? "PUT" : "WAIT";
  const priceActionConfirmation = buildPriceActionConfirmation(analysis.ohlc ?? [], spot);
  const priorClosedPrice = priceActionConfirmation.priorClosedPrice;
  const previousSpot = previousSpotRef.current;
  const tickMovePct = previousSpot > 0 && spot > 0 ? ((spot - previousSpot) / previousSpot) * 100 : 0;
  const latestCandleHigh = Math.max(0, ...(analysis.ohlc ?? []).slice(-2).map((candle) => Number(candle.high) || 0));
  const recentObservedHigh = Math.max(spot, latestCandleHigh, ...spotTrailRef.current);
  const recentObservedLow = Math.min(spot, ...(analysis.ohlc ?? []).slice(-2).map((candle) => Number(candle.low) || spot), ...spotTrailRef.current);
  const pullbackFromHighPct = recentObservedHigh > 0 ? ((recentObservedHigh - spot) / recentObservedHigh) * 100 : 0;
  const reboundFromLowPct = recentObservedLow > 0 ? ((spot - recentObservedLow) / recentObservedLow) * 100 : 0;
  const tapeMoveThresholdPct = timeframe === "5m" ? 0.03 : 0.002;
  const tickDirection: SmartSignal["direction"] = tickMovePct <= -tapeMoveThresholdPct
    ? "PUT"
    : tickMovePct >= tapeMoveThresholdPct ? "CALL" : "WAIT";
  const liveSwingDirection: SmartSignal["direction"] = pullbackFromHighPct >= 0.06 && pullbackFromHighPct > reboundFromLowPct * 1.2
    ? "PUT"
    : reboundFromLowPct >= 0.06 && reboundFromLowPct > pullbackFromHighPct * 1.2 ? "CALL" : "WAIT";
  const recentStepDirection: SmartSignal["direction"] = priceActionConfirmation.downSteps >= priceActionConfirmation.upSteps + 2
    ? "PUT"
    : priceActionConfirmation.upSteps >= priceActionConfirmation.downSteps + 2 ? "CALL" : "WAIT";
  const currentTapeDirection: SmartSignal["direction"] = tickDirection !== "WAIT"
    ? tickDirection
    : liveSwingDirection !== "WAIT"
      ? liveSwingDirection
    : recentStepDirection !== "WAIT"
      ? recentStepDirection
      : priceActionConfirmation.direction === "bullish" ? "CALL" : priceActionConfirmation.direction === "bearish" ? "PUT" : "WAIT";
  const putHasDownwardConfirmation = priceActionConfirmation.putConfirmed;
  const putSafetyBlocked = currentTapeDirection === "CALL" || !putHasDownwardConfirmation;
  const confirmedTapeReversal = currentTapeDirection === "PUT" && putHasDownwardConfirmation && rawDirection !== "PUT";
  const direction: SmartSignal["direction"] = confirmedTapeReversal
    ? "PUT"
    : rawDirection === "PUT" && putSafetyBlocked ? "WAIT" : rawDirection;
  const smartTone = smartSignal?.direction === "CALL" ? "call" : smartSignal?.direction === "PUT" ? "put" : "neutral";
  const smartMove = smartSignal?.direction === "CALL"
    ? `+${value(fusion?.expectedMove?.dollars)}`
    : smartSignal?.direction === "PUT"
      ? `-${value(fusion?.expectedMove?.dollars)}`
      : value(fusion?.expectedMove?.dollars);
  const hasExecution = signal?.state === "ACTIVE" && direction !== "WAIT" && Boolean(signal.entryZone && signal.stopLoss && signal.priceTargets?.length);
  const targets = signal?.priceTargets ?? [];
  const action = hasExecution
    ? signal?.recommendedAction ?? signal?.unifiedPlay?.reason ?? "Execute only inside the defined entry zone."
    : fusion
    ? `No entry yet. Monitor ${value(zones?.upper)} / ${value(zones?.lower)} for a confirmed breakout.`
    : "Loading live fusion and breakout map...";
  const setupGrade = signal?.setupGrade ?? "WAIT";
  const volatility = (fusion?.volatilityRegime?.regime ?? "scanning").toUpperCase();
  const marketDNA = fusion?.institutionalSummary?.marketDNA;
  const liquidity = fusion?.institutionalSummary?.liquidityGeometry;
  const orderBlock = fusion?.institutionalSummary?.orderBlock;
  const institutionalCore = fusion?.institutionalSummary?.institutionalCore;
  const intent = fusion?.institutionalSummary?.intent;
  const probs = fusion?.directionalProbabilities;
  const upProb = toPercentScale(probs?.up);
  const downProb = toPercentScale(probs?.down);
  const chopProb = toPercentScale(probs?.chop);
  const liveDirectionalProbabilities = deriveLiveDirectionalProbabilities({
    baseline: {
      up: upProb,
      down: downProb,
      chop: chopProb,
    },
    candles: analysis.ohlc ?? [],
    spot,
    quoteIsLive: spotIsLive,
  });
  const intentDirection = String(intent?.direction ?? "neutral").toUpperCase();
  const coreDirection = String(institutionalCore?.direction ?? "neutral").toUpperCase();
  const orderBlockDirection = String(orderBlock?.direction ?? "neutral").toUpperCase();
  const intentAligned = intentDirection === "ACCUMULATE"
    ? coreDirection === "BULL" && orderBlockDirection !== "BEARISH"
    : intentDirection === "DISTRIBUTE"
      ? coreDirection === "BEAR" && orderBlockDirection !== "BULLISH"
      : false;
  const intentStatus = intentAligned ? "ALIGNED" : intentDirection === "NEUTRAL" || intentDirection === "UNKNOWN" ? "WAIT" : "CONFLICT";
  const intentReason = institutionalCore?.reasons?.[0] ?? "Waiting for confirmed institutional participation.";
  const liquidityDirection = String(liquidity?.direction ?? "neutral").toUpperCase();
  const flowCallVotes = [intentDirection === "ACCUMULATE", coreDirection === "BULL", orderBlockDirection === "BULLISH", /BULL|UP|CALL|LONG/.test(liquidityDirection)].filter(Boolean).length;
  const flowPutVotes = [intentDirection === "DISTRIBUTE", coreDirection === "BEAR", orderBlockDirection === "BEARISH", /BEAR|DOWN|PUT|SHORT/.test(liquidityDirection)].filter(Boolean).length;
  const flowConflict = flowCallVotes > 0 && flowPutVotes > 0;
  const flowTone: TabMonitorTone = flowConflict ? "conflict" : flowCallVotes > flowPutVotes ? "call" : flowPutVotes > flowCallVotes ? "put" : "neutral";
  const flowDataReady = Boolean(intent || institutionalCore || orderBlock || liquidity);
  const flowEngineState = fusionError ? "DEGRADED" : fusionFetching && !fusion ? "SYNCING" : flowDataReady ? "LIVE" : "WAITING";
  const flowFeedAgeSeconds = fusionUpdatedAt > 0 ? Math.max(0, Math.floor((Date.now() - fusionUpdatedAt) / 1000)) : null;
  const breakoutSummary = breakoutHistory?.summary;
  const activeScannerPlay = (scannerPlayAlerts?.entries ?? []).find((entry) =>
    entry.outcome === "pending" && entry.direction !== "neutral" && entry.signalQuality !== "UNRELIABLE" &&
    (entry.direction !== "bearish" || putHasDownwardConfirmation),
  );
  const confirmedScannerPut = Boolean(
    activeScannerPlay?.direction === "bearish" &&
    activeScannerPlay.warnings.includes("POTENTIAL_PUT_PLAY") &&
    activeScannerPlay.warnings.includes("FAILED_UPSIDE_BREAKOUT"),
  );
  const executeHistory = breakoutSummary?.byMode?.EXECUTE;
  const prepareHistory = breakoutSummary?.byMode?.PREPARE;
  const leadProfile = breakoutSummary?.topLeadProfiles?.[0];
  const tuningWindow = edgeTuning?.currentWindow;
  const executionCalibration = tuningWindow?.sample?.execute?.winRate ?? executeHistory?.winRate;
  const executionResolved = tuningWindow?.sample?.execute?.completed ?? executeHistory?.completed ?? 0;
  const executionMissed = tuningWindow?.sample?.execute?.missed ?? executeHistory?.missed ?? 0;
  const minimumCalibrationSample = 30;
  const executionConversion = executionResolved > 0
    ? ((executionResolved - executionMissed) / executionResolved) * 100
    : 0;
  const calibrationReady = executionResolved >= minimumCalibrationSample && (executionCalibration ?? 0) >= 55;
  const calibrationTone = calibrationReady ? "validated" : executionResolved >= minimumCalibrationSample ? "caution" : "building";
  const calibrationStatus = calibrationReady ? "EXECUTION VALIDATED" : executionResolved >= minimumCalibrationSample ? "EXECUTION CAUTION" : "BUILDING SAMPLE";
  const rawScalpCandidates = scalpScan?.candidates ?? [];
  const rawRadarTracks = scalpScan?.radarTracks ?? [];
  const scalpDataDelayed = Boolean(
    scalpScan?.sessionEligible &&
    !scalpScan.isScanning &&
    (scalpScan.symbolsScanned ?? 0) > 0 &&
    scalpScan.symbolsWithUsableCandles === 0,
  );
  const resolvedRadarTracks = rawRadarTracks.filter((track) => track.state === "RESOLVED");
  const activeRadarTracks = rawRadarTracks.filter((track) => track.state !== "RESOLVED");
  const isDirectionallyConfirmedTrack = (track: RadarTrack) => {
    const expectedEmaDirection = track.direction === "SHORT" ? "bearish" : "bullish";
    return track.trendAligned && Boolean(
      track.breakout ||
      track.strongPriceAction ||
      track.strongSetup ||
      track.preBreakout ||
      (track.emaCrossDirection === expectedEmaDirection && (track.emaCrossCount ?? 0) > 0)
    );
  };
  const radarTracks = activeRadarTracks.filter(isDirectionallyConfirmedTrack);
  const scalpCandidates = rawScalpCandidates.filter(isDirectionallyConfirmedTrack);
  const displayScalpTracks: DisplayScalpTrack[] = (scalpCandidates.length ? scalpCandidates : radarTracks).map((track) => ({
    ...track,
    state: normalizeRadarState("state" in track ? track.state : track.breakout ? "TRIGGERED" : track.score >= 70 ? "ARMING" : "WATCH"),
  }));
  const selectedSymbolScalpTrack = displayScalpTracks.find((track) => track.symbol === analysis.symbol);
  const focusedScalpTrack = displayScalpTracks.find((track) => track.symbol === focusedScalpSymbol) ?? displayScalpTracks[0];
  const visibleScalpTracks = displayScalpTracks;
  const alertTracks = radarTracks.filter((track) =>
    track.divergence || track.volumeRatio >= 1.3 || track.breakout || track.strongSetup || track.preBreakout || track.strongPriceAction || track.bollingerTight,
  );
  const edgeAlertCards = (edgeResults ?? [])
    .filter((row) => isActionableEdgeCard(row) || isHighConvictionArmingEdgeCard(row) || isEarlyDirectionalStandbyEdgeCard(row))
    .sort((left, right) => {
      const leftEdge = left.edgeEngine;
      const rightEdge = right.edgeEngine;
      const stateRank = (state?: string) => state === "TRIGGERED" ? 4 : state === "PRIMED" ? 3 : state === "ARMING" ? 2 : 1;
      return stateRank(rightEdge?.state) - stateRank(leftEdge?.state) || (rightEdge?.edgeScore ?? 0) - (leftEdge?.edgeScore ?? 0);
    });
  const selectedScannerResult = (edgeResults ?? []).find((row) => row.symbol === analysis.symbol);
  const selectedEdgeScore = selectedScannerResult?.edgeEngine?.edgeScore ?? 0;
  const requiresSpyScoreBand = analysis.symbol.toUpperCase() === "SPY";
  const scoreBandCalibrated = !requiresSpyScoreBand || (selectedEdgeScore >= 72 && selectedEdgeScore < 80);
  const scannerDataFresh = spotIsLive && (
    !selectedScannerResult ||
    (!selectedScannerResult.isDegraded && selectedScannerResult.spotMeta?.isFresh !== false)
  );
  const executionLeaders = (edgeResults ?? [])
    .filter((row) => row.edgeEngine && !row.isDegraded && row.edgeEngine.direction !== "neutral")
    .sort((left, right) => {
      const stateRank = (state?: string) => state === "TRIGGERED" ? 4 : state === "PRIMED" ? 3 : state === "ARMING" ? 2 : 1;
      const isCalibratedSpyBand = (row: ScannerResult) =>
        row.symbol !== "SPY" || ((row.edgeEngine?.edgeScore ?? 0) >= 72 && (row.edgeEngine?.edgeScore ?? 0) < 80);
      return Number(isCalibratedSpyBand(right)) - Number(isCalibratedSpyBand(left))
        || stateRank(right.edgeEngine?.state) - stateRank(left.edgeEngine?.state)
        || (right.edgeEngine?.edgeScore ?? 0) - (left.edgeEngine?.edgeScore ?? 0);
    })
    .slice(0, 5);
  const edgeRadarTracks: RadarTrack[] = (edgeResults ?? [])
    .filter((row) => {
      const edge = row.edgeEngine;
      return edge && edge.direction !== "neutral" && !row.isDegraded &&
        (Math.abs(row.priceChangePercent ?? 0) >= 0.1 || edge.edgeScore >= 45);
    })
    .sort((left, right) => (right.edgeEngine?.edgeScore ?? 0) - (left.edgeEngine?.edgeScore ?? 0))
    .map((row) => ({
      symbol: row.symbol,
      direction: row.edgeEngine?.direction === "bearish" ? "SHORT" : "LONG",
      score: row.edgeEngine?.edgeScore ?? 0,
      volumeRatio: Math.max(0, row.edgeEngine?.indicators.volumeSpike ?? 0),
      closeStrength: Math.min(1, Math.abs(row.priceChangePercent ?? 0) / 2),
      trendAligned: row.timeframeStack?.bias === row.edgeEngine?.direction,
      emaCrossStrength: Math.min(100, Math.abs(row.edgeEngine?.indicators.momentum ?? 0) * 2),
      state: row.edgeEngine?.state === "TRIGGERED" ? "TRIGGERED" : row.edgeEngine?.state === "PRIMED" ? "ARMING" : "WATCH",
    }));
  const alertRadarTracks: RadarTrack[] = [
    ...alertTracks.map((track) => ({ ...track, state: normalizeRadarState(String(track.state)) })),
    ...edgeRadarTracks.filter((edgeTrack) => !alertTracks.some((track) => track.symbol === edgeTrack.symbol)),
  ];
  const alertDisplayTracks: AlertDisplayTrack[] = [
    ...alertTracks.map((track) => ({
      ...track,
      state: normalizeRadarState(String(track.state)),
      source: "scalp" as const,
    })),
    ...edgeRadarTracks
      .filter((edgeTrack) => !alertTracks.some((track) => track.symbol === edgeTrack.symbol))
      .map((track) => ({
        symbol: track.symbol,
        direction: track.direction,
        score: track.score,
        price: (() => {
          const scannerPrice = (edgeResults ?? []).find((row) => row.symbol === track.symbol)?.lastPrice ?? 0;
          return Number.isFinite(scannerPrice) && scannerPrice > 0 ? scannerPrice : 0;
        })(),
        rsi: undefined,
        volumeRatio: track.volumeRatio,
        macdCross: false,
        divergence: false,
        breakout: track.state === "TRIGGERED",
        closeStrength: track.closeStrength,
        trendAligned: track.trendAligned,
        breakoutDistancePct: undefined,
        bollingerTight: false,
        strongPriceAction: Boolean((track.closeStrength ?? 0) >= 0.55),
        strongSetup: track.state === "TRIGGERED" || track.state === "ARMING",
        emaCrossDirection: (track.direction === "SHORT" ? "bearish" : "bullish") as "bullish" | "bearish",
        emaCrossCount: (track.emaCrossStrength ?? 0) >= 55 ? 1 : 0,
        emaCrossStrength: track.emaCrossStrength,
        emaCrosses: (track.emaCrossStrength ?? 0) >= 55 ? ["9/21"] : [],
        state: normalizeRadarState(track.state),
        source: "edge" as const,
      })),
  ];
  const focusedAlertTrack = alertDisplayTracks.find((track) => track.symbol === focusedScalpSymbol) ?? alertDisplayTracks[0];
  const visibleAlertTracks = alertDisplayTracks;
  const edgeTriggered = edgeAlertCards.some((row) => row.edgeEngine?.state === "TRIGGERED");
  const alertTriggeredBase = alertDisplayTracks.some((track) => track.breakout || track.strongSetup) || edgeTriggered;
  const alertAverageScore = alertRadarTracks.length
    ? Math.round(alertRadarTracks.reduce((sum, track) => sum + (track.score ?? 0), 0) / alertRadarTracks.length)
    : 0;
  const alertAverageVolume = alertRadarTracks.length
    ? clampScore(alertRadarTracks.reduce((sum, track) => sum + clampScore((track.volumeRatio / 1.8) * 100), 0) / alertRadarTracks.length)
    : 0;
  const alertTriggerRate = edgeAlertCards.length
    ? clampScore(edgeAlertCards.reduce((sum, row) => sum + (row.edgeEngine?.triggerProbability ?? 0), 0) / edgeAlertCards.length)
    : alertAverageScore;
  const alertCallCount = alertRadarTracks.filter((track) => track.direction === "LONG").length;
  const alertPutCount = alertRadarTracks.filter((track) => track.direction === "SHORT").length;
  const alertDivergenceCount = alertTracks.filter((track) => track.divergence).length;
  const alertBreakoutCount = alertTracks.filter((track) => track.breakout || track.strongSetup).length + edgeAlertCards.filter((row) => row.edgeEngine?.state === "TRIGGERED").length;
  const alertEngineState = scalpDataDelayed ? "DATA DELAY" : scalpScan?.isScanning ? "SCANNING" : alertTriggeredBase ? "TRIGGERED" : alertDisplayTracks.length ? "ARMING" : "MONITORING";
  const radarState = radarTracks.some((track) => track.state === "TRIGGERED")
    ? "TRIGGERED"
    : radarTracks.some((track) => track.state === "ARMING")
      ? "ARMING"
      : "STANDBY";
  const radarAverageScore = radarTracks.length
    ? Math.round(radarTracks.reduce((sum, track) => sum + (track.score ?? 0), 0) / radarTracks.length)
    : 0;
  const radarLeadTrack = [...radarTracks]
    .filter((track) => track.state === radarState)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0];
  const radarDirection = radarState === "STANDBY"
    ? "WAIT"
    : radarLeadTrack?.direction === "SHORT" ? "PUT" : "CALL";
  const radarTone = radarDirection === "CALL" ? "call" : radarDirection === "PUT" ? "put" : "neutral";
  const radarAlerting = !scalpDataDelayed && (radarState === "ARMING" || radarState === "TRIGGERED" || scalpCandidates.length > 0);
  const topEvidenceRule = evidence?.topRules?.[0];
  const fusionCompression = fusion?.compressionCluster;
  const compression = timeframe === "5m"
    ? {
        active: Boolean(analysis.marketHealth?.bollingerBands?.squeeze),
        bbSqueezeActive: Boolean(analysis.marketHealth?.bollingerBands?.squeeze),
        healthLow: false,
        readinessScore: clampScore(100 - (analysis.trendExhaustion?.rangeCompression ?? 1) * 100),
        factors: {
          bollinger: analysis.marketHealth?.bollingerBands?.squeeze ? 80 : 35,
          atrTightness: clampScore(100 - (analysis.trendExhaustion?.rangeCompression ?? 1) * 100),
          volumeSweetSpot: clampScore(analysis.volumeSpike?.avgVolume ? (analysis.volumeSpike.lastVolume / analysis.volumeSpike.avgVolume) * 70 : 0),
          preBreakout: clampScore(analysis.preMovePressure?.score ?? analysis.bullishPower?.meter ?? 0),
          timeframeStack: 50,
          triggerPressure: clampScore(analysis.preMovePressure?.score ?? 0),
        },
        reasons: analysis.preMovePressure?.reasons ?? [],
      }
    : fusionCompression;
  const monster = fusion?.monsterOtm;
  const monsterPlay = monster?.play;
  const monsterGate = fusion?.monsterGateDecision;
  const volumeRead = buildVolumeRead(analysis);
  const emaLines = buildEmaLines(analysis, spot);
  const [ema9, ema21, ema50, ema200] = emaLines;
  const tacticalIndicators = analysis.tactical?.indicators;
  const latestVwap = analysis.vwapSeries?.at(-1);
  const latestCandle = analysis.ohlc?.at(-1);
  const priorCandle = analysis.ohlc?.at(-2);
  const timeframeFrames = fusion?.timeframes ?? [];
  const timeframeTrendCounts = countTimeframeTrends(timeframeFrames);
  const bullishTimeframes = timeframeTrendCounts.bullish;
  const bearishTimeframes = timeframeTrendCounts.bearish;
  const cloudBullish = ema9.latest > ema21.latest && ema21.latest > ema50.latest && ema50.latest > ema200.latest;
  const cloudBearish = ema9.latest < ema21.latest && ema21.latest < ema50.latest && ema50.latest < ema200.latest;
  const bullishSlopeCount = emaLines.filter((line) => line.slope > 0).length;
  const bearishSlopeCount = emaLines.filter((line) => line.slope < 0).length;
  const emaHistoryBars = ema9.values.length;
  const fastCloudSpread = ema21.latest > 0 ? ((ema9.latest - ema21.latest) / ema21.latest) * 100 : 0;
  const priorEma21 = ema21.values.at(-6);
  const priorEma9 = ema9.values.at(-6);
  const priorFastCloudSpread = typeof priorEma21 === "number" && priorEma21 > 0 && typeof priorEma9 === "number"
    ? ((priorEma9 - priorEma21) / priorEma21) * 100
    : fastCloudSpread;
  const candleRange = latestCandle ? Math.max(latestCandle.high - latestCandle.low, 0.0001) : 0;
  const candleBodyQuality = latestCandle ? Math.abs(latestCandle.close - latestCandle.open) / candleRange : 0;
  const candleVolumePower = clampScore(candleBodyQuality * 60 + Math.min(volumeRead.ratio, 1.5) / 1.5 * 40);
  const immediatePriorEma9 = ema9.values.at(-2) ?? ema9.latest;
  const immediatePriorEma21 = ema21.values.at(-2) ?? ema21.latest;
  const immediatePriorSpread = immediatePriorEma21 > 0
    ? ((immediatePriorEma9 - immediatePriorEma21) / immediatePriorEma21) * 100
    : fastCloudSpread;
  const bullishEmaHold = ema9.latest > ema21.latest &&
    (priorEma9 ?? ema9.latest) >= (priorEma21 ?? ema21.latest) &&
    Boolean(latestCandle && priorCandle && latestCandle.close > ema9.latest && priorCandle.close > (priorEma9 ?? ema9.latest));
  const bearishEmaHold = ema9.latest < ema21.latest &&
    (priorEma9 ?? ema9.latest) <= (priorEma21 ?? ema21.latest) &&
    Boolean(latestCandle && priorCandle && latestCandle.close < ema9.latest && priorCandle.close < (priorEma9 ?? ema9.latest));
  const confirmedEmaHoldDirection: SmartSignal["direction"] = candleVolumePower >= 55
    ? bullishEmaHold ? "CALL" : bearishEmaHold ? "PUT" : "WAIT"
    : "WAIT";
  const strongBearishReversalCandle = Boolean(
    latestCandle && latestCandle.close < latestCandle.open && latestCandle.close < ema9.latest &&
    candleBodyQuality >= 0.45 && volumeRead.ratio >= 1.05,
  );
  const strongBullishReversalCandle = Boolean(
    latestCandle && latestCandle.close > latestCandle.open && latestCandle.close > ema9.latest &&
    candleBodyQuality >= 0.45 && volumeRead.ratio >= 1.05,
  );
  const scalpExitWarning = immediatePriorEma9 > immediatePriorEma21 && strongBearishReversalCandle &&
    (ema9.latest <= ema21.latest || fastCloudSpread < immediatePriorSpread - 0.01)
      ? "EXIT CALLS WATCH"
      : immediatePriorEma9 < immediatePriorEma21 && strongBullishReversalCandle &&
          (ema9.latest >= ema21.latest || fastCloudSpread > immediatePriorSpread + 0.01)
        ? "EXIT PUTS WATCH"
        : null;
  const cloudSpreadChange = fastCloudSpread - priorFastCloudSpread;
  const cloudPhase = Math.abs(fastCloudSpread) < 0.05
    ? "COMPRESSED"
    : cloudSpreadChange > 0.01
      ? "SEPARATING"
      : cloudSpreadChange < -0.01
        ? "ROLLING OVER"
        : "ALIGNED";
  const activeFvgZones = detectActiveFvgZones(analysis.ohlc ?? []);
  const nearestBullishFvg = [...activeFvgZones]
    .filter((zone) => zone.direction === "bullish" && zone.low <= spot)
    .sort((left, right) => Math.abs(spot - left.high) - Math.abs(spot - right.high))[0];
  const nearestBearishFvg = [...activeFvgZones]
    .filter((zone) => zone.direction === "bearish" && zone.high >= spot)
    .sort((left, right) => Math.abs(spot - left.low) - Math.abs(spot - right.low))[0];
  const bullishFvgStrength = fvgZoneStrength(nearestBullishFvg, spot, ema21.latest);
  const bearishFvgStrength = fvgZoneStrength(nearestBearishFvg, spot, ema21.latest);
  const callCloudPoints =
    (cloudBullish ? 24 : ema9.latest > ema21.latest ? 10 : 0) +
    (spot > ema9.latest ? 8 : 0) +
    bullishSlopeCount * 4 +
    (analysis.emaCloud?.trend === "bullish" ? 8 : 0) +
    (latestVwap != null && spot > latestVwap ? 8 : 0) +
    (tacticalIndicators?.rsi.value != null && tacticalIndicators.rsi.value >= 52 && tacticalIndicators.rsi.value < 72 ? 8 : 0) +
    (tacticalIndicators?.macd.trend === "bullish" || (tacticalIndicators?.macd.histogram ?? 0) > 0 ? 10 : 0) +
    (tacticalIndicators?.momentum?.trend === "bullish" ? 8 : 0) +
    (upProb > downProb ? Math.min(10, (upProb - downProb) / 2) : 0) +
    (bullishTimeframes > bearishTimeframes ? 8 : 0) +
    bullishFvgStrength * 0.08 +
    (currentTapeDirection === "CALL" ? 20 : 0) +
    (latestCandle && latestCandle.close > latestCandle.open && volumeRead.ratio >= 1 ? 6 : 0);
  const putCloudPoints =
    (cloudBearish ? 24 : ema9.latest < ema21.latest ? 10 : 0) +
    (spot < ema9.latest ? 8 : 0) +
    bearishSlopeCount * 4 +
    (analysis.emaCloud?.trend === "bearish" ? 8 : 0) +
    (latestVwap != null && spot < latestVwap ? 8 : 0) +
    (tacticalIndicators?.rsi.value != null && tacticalIndicators.rsi.value <= 48 && tacticalIndicators.rsi.value > 28 ? 8 : 0) +
    (tacticalIndicators?.macd.trend === "bearish" || (tacticalIndicators?.macd.histogram ?? 0) < 0 ? 10 : 0) +
    (tacticalIndicators?.momentum?.trend === "bearish" ? 8 : 0) +
    (downProb > upProb ? Math.min(10, (downProb - upProb) / 2) : 0) +
    (bearishTimeframes > bullishTimeframes ? 8 : 0) +
    bearishFvgStrength * 0.08 +
    (currentTapeDirection === "PUT" ? 20 : 0) +
    (latestCandle && latestCandle.close < latestCandle.open && volumeRead.ratio >= 1 ? 6 : 0);
  const cloudPointTotal = Math.max(1, callCloudPoints + putCloudPoints);
  const callStrength = clampScore((callCloudPoints / cloudPointTotal) * 100);
  const putStrength = clampScore((putCloudPoints / cloudPointTotal) * 100);
  const cloudReliability = clampScore(
    25 + Math.min(35, (emaHistoryBars / 200) * 35) + (tacticalIndicators ? 20 : 0) + (timeframeFrames.length ? 10 : 0) + (volumeRead.average > 0 ? 10 : 0),
  );
  const modelCloudDirection: SmartSignal["direction"] = Math.abs(callStrength - putStrength) < 10
    ? "WAIT"
    : callStrength > putStrength ? "CALL" : "PUT";
  const rawCloudDirection: SmartSignal["direction"] = cloudReliability < 55
    ? "WAIT"
    : currentTapeDirection !== "WAIT"
      ? currentTapeDirection
      : modelCloudDirection;
  const cloudTapeOverride = currentTapeDirection !== "WAIT" && modelCloudDirection !== "WAIT" && currentTapeDirection !== modelCloudDirection;
  const cloudDirection = rawCloudDirection;
  const cloudTone = cloudDirection === "CALL" ? "call" : cloudDirection === "PUT" ? "put" : "neutral";
  const cloudAlignment = clampScore(50 + Math.abs(callStrength - putStrength) / 2);
  const cloudDecisionStrength = cloudDirection === "WAIT" ? Math.abs(callStrength - putStrength) : Math.max(callStrength, putStrength);
  const cloudDecisionConfidence = cloudReliability < 55 ? 0 : cloudAlignment;
  const cloudStructureState = cloudBullish ? "BULL STACK" : cloudBearish ? "BEAR STACK" : ema9.latest > ema21.latest ? "BULL STRUCTURE" : ema9.latest < ema21.latest ? "BEAR STRUCTURE" : "COMPRESSED";
  const cloudState = currentTapeDirection === "PUT"
    ? cloudBearish || ema9.latest < ema21.latest ? "BEAR ROTATION" : "BEARISH ROLLOVER"
    : currentTapeDirection === "CALL"
      ? cloudBullish || ema9.latest > ema21.latest ? "BULL ROTATION" : "BULLISH REVERSAL"
      : cloudStructureState;
  const isBreakoutTriggered = Boolean(monster?.breakout?.triggered);
  const breakoutDirection = monster?.breakout?.type === "breakout_up"
    ? "CALL"
    : monster?.breakout?.type === "breakout_down"
      ? "PUT"
      : null;
  const breakoutTrigger = breakoutDirection === "CALL" ? zones?.upper : breakoutDirection === "PUT" ? zones?.lower : undefined;
  const breakoutStop = monsterPlay?.stopPrice ?? signal?.stopLoss;
  const zoneTargetOne = breakoutDirection === "CALL" ? zones?.upsideTarget1 : zones?.downsideTarget1;
  const zoneTargetTwo = breakoutDirection === "CALL" ? zones?.upsideTarget2 : zones?.downsideTarget2;
  const signalTargetOne = targets[0];
  const signalTargetTwo = targets[1];
  const breakoutTargetOne = isDirectionalTarget(monsterPlay?.targetPrice, breakoutTrigger, breakoutDirection)
    ? monsterPlay.targetPrice
    : isDirectionalTarget(zoneTargetOne, breakoutTrigger, breakoutDirection)
      ? zoneTargetOne
      : isDirectionalTarget(signalTargetOne, breakoutTrigger, breakoutDirection)
        ? signalTargetOne
        : undefined;
  const breakoutTargetTwo = isDirectionalTarget(zoneTargetTwo, breakoutTrigger, breakoutDirection)
    ? zoneTargetTwo
    : isDirectionalTarget(signalTargetTwo, breakoutTargetOne ?? breakoutTrigger, breakoutDirection)
      ? signalTargetTwo
      : undefined;
  const hasHeldPosition = Boolean(managedPositionSide && managedEntrySpot && managedPeakSpot);
  const managedDirectionMatchesSystem = Boolean(managedPositionSide && managedPositionSide === direction);
  const managedDirectionOpposesSystem = Boolean(managedPositionSide && direction !== "WAIT" && managedPositionSide !== direction);
  const managedEntryPrice = managedEntrySpot ?? 0;
  const managedInitialStop = managedPositionSide && managedEntrySpot
    ? [signal?.stopLoss, zones?.invalidation, managedPositionSide === "CALL" ? zones?.lower : zones?.upper]
      .filter((level): level is number => Number.isFinite(level) && (managedPositionSide === "CALL" ? Number(level) < managedEntryPrice : Number(level) > managedEntryPrice))
      .sort((left, right) => Math.abs(left - managedEntryPrice) - Math.abs(right - managedEntryPrice))[0]
      ?? (managedPositionSide === "CALL"
        ? managedEntrySpot - Math.max((fusion?.expectedMove?.dollars ?? 0) * 0.35, managedEntrySpot * 0.0025)
        : managedEntrySpot + Math.max((fusion?.expectedMove?.dollars ?? 0) * 0.35, managedEntrySpot * 0.0025))
    : null;
  const managedPossiblePeak = managedPositionSide && managedEntrySpot
    ? [
      managedPositionSide === "CALL" ? zones?.upsideTarget2 : zones?.downsideTarget2,
      managedPositionSide === "CALL" ? zones?.upsideTarget1 : zones?.downsideTarget1,
      ...targets,
    ]
      .filter((level): level is number => Number.isFinite(level) && (managedPositionSide === "CALL" ? Number(level) > managedEntryPrice : Number(level) < managedEntryPrice))
      .sort((left, right) => managedPositionSide === "CALL" ? right - left : left - right)[0] ?? null
    : null;
  const managedFavorableMove = managedPositionSide && managedEntrySpot && managedPeakSpot
    ? Math.max(0, managedPositionSide === "CALL" ? managedPeakSpot - managedEntrySpot : managedEntrySpot - managedPeakSpot)
    : 0;
  const managedRisk = managedEntrySpot && managedInitialStop ? Math.abs(managedEntrySpot - managedInitialStop) : 0;
  const directionalInputScore = (inputDirection: string | undefined, side: ManagedPositionSide, confidence = 100): number => {
    const normalized = String(inputDirection ?? "").toUpperCase();
    const neutral = !normalized || normalized === "WAIT" || normalized === "NONE" || normalized === "NEUTRAL" || normalized === "UNKNOWN";
    if (neutral) return 50;
    const callDirection = normalized.includes("CALL") || normalized.includes("BULL") || normalized.includes("UP") || normalized.includes("LONG") || normalized.includes("ACCUMULATE");
    const putDirection = normalized.includes("PUT") || normalized.includes("BEAR") || normalized.includes("DOWN") || normalized.includes("SHORT") || normalized.includes("DISTRIBUTE");
    const matches = side === "CALL" ? callDirection : putDirection;
    const opposes = side === "CALL" ? putDirection : callDirection;
    const strength = clampScore(confidence);
    return matches ? 50 + strength * 0.5 : opposes ? 50 - strength * 0.5 : 50;
  };
  const microIgnition = fusion?.microBreakout?.ignition1m;
  const fiveMinuteScore = (state: string | undefined, breakoutAgeMinutes: number | null | undefined, candleAgeMinutes: number | null | undefined): number => {
    if (candleAgeMinutes != null && candleAgeMinutes > 10) return 25;
    if (breakoutAgeMinutes != null && breakoutAgeMinutes > 15 && (state === "RETEST HELD" || state === "ACCEPTED")) return 32;
    if (state === "RETEST HELD") return 72;
    if (state === "ACCEPTED") return 58;
    if (state === "TESTING") return 56;
    if (state === "REJECTED") return 10;
    if (state === "WAITING") return 45;
    return 50;
  };
  const buildPositionPlayModel = (side: ManagedPositionSide) => {
    const sideProbability = side === "CALL" ? upProb : downProb;
    const sideCalibration = breakoutSummary?.byDirection?.[side === "CALL" ? "bullish" : "bearish"];
    const historicalCompleted = sideCalibration?.completed ?? 0;
    const historicalPrior = evidence?.baseline?.winRate ?? 50;
    const historicalObserved = sideCalibration?.winRate ?? historicalPrior;
    const historicalScore = ((historicalObserved * historicalCompleted) + historicalPrior * 20) / Math.max(20, historicalCompleted + 20);
    const historicalWeight = 0.55 + Math.min(0.5, historicalCompleted / 120);
    const sideFiveMinuteRead = side === "CALL" ? fusion?.microBreakout?.structure5m?.call : fusion?.microBreakout?.structure5m?.put;
    const acceleration = microIgnition?.volumeAcceleration ?? 0;
    const accelerationScore = sideFiveMinuteRead?.state === "ACCEPTED" || sideFiveMinuteRead?.state === "RETEST HELD"
      ? acceleration >= 1.15 ? Math.min(68, 55 + (acceleration - 1.15) * 20) : acceleration < 0.9 ? 44 : 50
      : 50;
    const inputs = [
      { label: "Fusion bias", score: directionalInputScore(direction, side), weight: 1.5, ready: Boolean(fusion) },
      { label: "Probability", score: sideProbability, weight: 1.35, ready: Boolean(probs) },
      { label: "MTF alignment", score: directionalInputScore(fusion?.mtfConsensus?.trendConsensus, side, toPercentScale(fusion?.mtfConsensus?.alignmentScore)), weight: 1.15, ready: fusion?.mtfConsensus?.alignmentScore != null },
      { label: "Institutional", score: directionalInputScore(institutionalCore?.direction, side, toPercentScale(institutionalCore?.score)), weight: 1.1, ready: institutionalCore?.score != null },
      { label: "Intent", score: directionalInputScore(intent?.direction, side, toPercentScale(intent?.confidence)), weight: 1, ready: Boolean(intent?.active) },
      { label: "Liquidity", score: directionalInputScore(liquidity?.direction, side, toPercentScale(liquidity?.confidence)), weight: 0.85, ready: Boolean(liquidity?.active) },
      { label: "Order block", score: directionalInputScore(orderBlock?.direction, side, toPercentScale(orderBlock?.score)), weight: 0.9, ready: Boolean(orderBlock?.active) },
      { label: "Live tape", score: directionalInputScore(currentTapeDirection, side, 88), weight: 1.2, ready: currentTapeDirection !== "WAIT" },
      { label: "1m ignition", score: directionalInputScore(microIgnition?.direction, side, microIgnition?.strength), weight: 0.85, ready: Boolean(microIgnition?.available && microIgnition.fresh) },
      { label: "1m accel shadow", score: accelerationScore, weight: 0.45, ready: Boolean(microIgnition?.available && microIgnition.fresh) },
      { label: "5m level", score: fiveMinuteScore(sideFiveMinuteRead?.state, sideFiveMinuteRead?.breakoutAgeMinutes, sideFiveMinuteRead?.ageMinutes), weight: 1.4, ready: sideFiveMinuteRead?.level != null },
      { label: `History ${historicalCompleted}`, score: historicalScore, weight: historicalWeight, ready: historicalCompleted >= 10 },
    ].filter((input) => input.ready);
    const totalWeight = inputs.reduce((total, input) => total + input.weight, 0);
    const coverage = Math.min(1, totalWeight / 12.5);
    const rawScore = totalWeight > 0 ? inputs.reduce((total, input) => total + input.score * input.weight, 0) / totalWeight : 0;
    const freshnessFactor = fusionUpdatedAt > 0 && Date.now() - fusionUpdatedAt <= 90_000 ? 1 : 0.88;
    const score = clampScore((rawScore - Math.max(0, chopProb - 45) * 0.35) * (0.62 + coverage * 0.38) * freshnessFactor);
    return {
      side,
      sideProbability,
      inputs,
      coverage,
      score,
      aligned: inputs.filter((input) => input.score >= 55).length,
      conflicts: inputs.filter((input) => input.score < 40).length,
      supportShare: totalWeight > 0 ? inputs.filter((input) => input.score >= 55).reduce((total, input) => total + input.weight, 0) / totalWeight : 0,
      conflictShare: totalWeight > 0 ? inputs.filter((input) => input.score < 40).reduce((total, input) => total + input.weight, 0) / totalWeight : 0,
    };
  };
  const callPlayModel = buildPositionPlayModel("CALL");
  const putPlayModel = buildPositionPlayModel("PUT");
  const leadingPlayModel = callPlayModel.score >= putPlayModel.score ? callPlayModel : putPlayModel;
  const leadingFiveMinuteRead = leadingPlayModel.side === "CALL" ? fusion?.microBreakout?.structure5m?.call : fusion?.microBreakout?.structure5m?.put;
  const leadingBreakoutAgeMinutes = leadingFiveMinuteRead?.breakoutAgeMinutes ?? null;
  const leadingStructureStale = Boolean(leadingFiveMinuteRead?.ageMinutes != null && leadingFiveMinuteRead.ageMinutes > 10);
  const positionLifecycleBlocked = leadingStructureStale || leadingFiveMinuteRead?.state === "REJECTED" || Boolean(
    leadingBreakoutAgeMinutes != null && leadingBreakoutAgeMinutes > 15 &&
    (leadingFiveMinuteRead?.state === "ACCEPTED" || leadingFiveMinuteRead?.state === "RETEST HELD"),
  );
  const positionShadowCandidate = Boolean(
    microIgnition?.available && microIgnition.fresh && microIgnition.studyCandidate &&
    (leadingFiveMinuteRead?.state === "ACCEPTED" || leadingFiveMinuteRead?.state === "RETEST HELD") &&
    (leadingFiveMinuteRead?.breakoutAgeMinutes == null || leadingFiveMinuteRead.breakoutAgeMinutes <= 15),
  );
  const positionScoreGap = Math.abs(callPlayModel.score - putPlayModel.score);
  const positionFiveMinuteConfirmed = ["TESTING", "ACCEPTED", "RETEST HELD"].includes(leadingFiveMinuteRead?.state ?? "");
  const positionFavoredSide: ManagedPositionSide | null = !positionLifecycleBlocked && leadingPlayModel.coverage >= 0.6 && leadingPlayModel.score >= 55 && positionScoreGap >= 6 && positionFiveMinuteConfirmed
    ? leadingPlayModel.side
    : null;
  const positionGateState = leadingStructureStale
    ? "5M DATA STALE"
    : leadingFiveMinuteRead?.state === "REJECTED"
    ? "5M REJECT"
    : positionLifecycleBlocked ? "STALE BREAK" : leadingPlayModel.coverage < 0.6
    ? "COVERAGE LOW"
    : leadingPlayModel.score < 55 ? "BELOW ACTIVATION" : positionScoreGap < 6 ? "SIGNAL SPLIT" : !positionFiveMinuteConfirmed ? "AWAIT 5M" : "QUALIFIED";
  const positionStudyState = !microIgnition?.available
    ? "NO 1M DATA"
    : !microIgnition.fresh
      ? "1M DATA STALE"
    : !microIgnition.studyCandidate
      ? "OBSERVING"
      : positionLifecycleBlocked
        ? "EXPIRED"
        : leadingFiveMinuteRead?.state === "RETEST HELD"
          ? "RETEST SHADOW"
          : leadingFiveMinuteRead?.state === "ACCEPTED" ? "15M SHADOW" : "AWAIT 5M";
  const positionFusionFresh = fusionUpdatedAt > 0 && Date.now() - fusionUpdatedAt <= 90_000;
  const managedPlayModel = managedPositionSide === "CALL" ? callPlayModel : managedPositionSide === "PUT" ? putPlayModel : null;
  const managedSideProbability = managedPlayModel?.sideProbability ?? 0;
  const managedSignalInputs = managedPlayModel?.inputs ?? [];
  const managedCoverage = managedPlayModel?.coverage ?? 0;
  const managedEngineScore = managedPlayModel?.score ?? 0;
  const managedAgreementCount = managedSignalInputs.filter((input) => input.score >= 55).length;
  const managedConflictCount = managedSignalInputs.filter((input) => input.score < 40).length;
  const managedEngineGrade = managedEngineScore >= 78 && managedConflictCount <= 1
    ? "A"
    : managedEngineScore >= 64 && managedConflictCount <= 2 ? "B" : managedEngineScore >= 50 ? "C" : "RISK";
  const managedGivebackFraction = managedDirectionOpposesSystem || managedConflictCount >= 3
    ? 0.24
    : chopProb >= 48 ? 0.3 : managedEngineScore >= 72 ? 0.42 : 0.35;
  const managedAdjustedStop = managedPositionSide && managedEntrySpot && managedPeakSpot && managedInitialStop
    ? managedFavorableMove >= managedRisk * 1.5
      ? managedPositionSide === "CALL" ? managedPeakSpot - managedFavorableMove * managedGivebackFraction : managedPeakSpot + managedFavorableMove * managedGivebackFraction
      : managedFavorableMove >= managedRisk
        ? managedEntrySpot
        : managedFavorableMove >= managedRisk * 0.5
          ? (managedInitialStop + managedEntrySpot) / 2
          : managedInitialStop
    : null;
  const managedPullback = managedPositionSide && managedPeakSpot
    ? Math.max(0, managedPositionSide === "CALL" ? managedPeakSpot - spot : spot - managedPeakSpot)
    : 0;
  const managedStopReached = Boolean(managedPositionSide && managedAdjustedStop && (managedPositionSide === "CALL" ? spot <= managedAdjustedStop : spot >= managedAdjustedStop));
  const managedPeakReached = Boolean(managedPositionSide && managedPossiblePeak && (managedPositionSide === "CALL" ? spot >= managedPossiblePeak : spot <= managedPossiblePeak));
  const managedRMultiple = managedRisk > 0
    ? (managedPositionSide === "CALL" ? spot - (managedEntrySpot ?? spot) : (managedEntrySpot ?? spot) - spot) / managedRisk
    : 0;
  const managedPeakCapture = managedFavorableMove > 0 ? clampScore((1 - managedPullback / managedFavorableMove) * 100) : 0;
  const managedElapsedSeconds = managedEntryTime ? Math.max(0, Math.floor((managedClock - managedEntryTime) / 1000)) : 0;
  const managedElapsedMinutes = managedElapsedSeconds / 60;
  const managedTimerLabel = `${String(Math.floor(managedElapsedSeconds / 60)).padStart(2, "0")}:${String(managedElapsedSeconds % 60).padStart(2, "0")}`;
  const favoredPlayElapsedSeconds = positionFavoredSide && favoredPlayRun?.symbol === analysis.symbol && favoredPlayRun.side === positionFavoredSide
    ? Math.max(0, Math.floor((favoredPlayClock - favoredPlayRun.startedAt) / 1000))
    : 0;
  const favoredPlayTimerLabel = `${String(Math.floor(favoredPlayElapsedSeconds / 60)).padStart(2, "0")}:${String(favoredPlayElapsedSeconds % 60).padStart(2, "0")}`;
  const managedMomentumWindowMinutes = 15;
  const managedMinutesRemaining = Math.max(0, Math.ceil(managedMomentumWindowMinutes - managedElapsedMinutes));
  const managedFiveMinuteRead = managedPositionSide === "CALL"
    ? fusion?.microBreakout?.structure5m?.call
    : managedPositionSide === "PUT" ? fusion?.microBreakout?.structure5m?.put : undefined;
  const managedBreakoutTrigger = managedFiveMinuteRead?.level != null
    ? managedFiveMinuteRead.level
    : managedPositionSide === breakoutDirection && Number.isFinite(breakoutTrigger) ? Number(breakoutTrigger) : null;
  const managedFiveMinuteState = managedFiveMinuteRead?.state ?? "NO LEVEL";
  const managedBreakoutAgeMinutes = managedFiveMinuteRead?.breakoutAgeMinutes ?? null;
  const managedDivergenceDetected = Boolean(managedPositionSide && selectedSymbolScalpTrack?.divergence);
  const managedIgnitionMatches = Boolean(managedPositionSide && microIgnition?.direction === managedPositionSide);
  const managedIgnitionOpposes = Boolean(managedPositionSide && microIgnition?.direction !== "WAIT" && microIgnition?.direction !== managedPositionSide);
  const managedHoldCount = managedFiveMinuteState === "RETEST HELD" ? 2 : managedFiveMinuteState === "ACCEPTED" ? 1 : 0;
  const managedTriggerDoji = Boolean(managedFiveMinuteRead?.doji);
  const managedBreakoutState = managedBreakoutTrigger == null
    ? "NO TRIGGER"
    : managedStopReached
      ? "FAILED"
      : managedDivergenceDetected
        ? "DIVERGENCE"
      : managedElapsedMinutes >= managedMomentumWindowMinutes
        ? "DECAY"
        : managedBreakoutAgeMinutes != null && managedBreakoutAgeMinutes > managedMomentumWindowMinutes
          ? "STALE BREAK"
        : managedFiveMinuteState === "REJECTED"
          ? "5M REJECT"
          : managedIgnitionOpposes
          ? "AT RISK"
          : managedTriggerDoji
            ? "DOJI TEST"
            : managedFiveMinuteState === "RETEST HELD" ? "HELD" : managedFiveMinuteState === "ACCEPTED" ? "BREAKOUT" : managedIgnitionMatches ? "IGNITION" : "WAITING";
  const managedRiskMode = managedStopReached || managedBreakoutState === "FAILED"
    ? "EXIT"
    : managedDirectionOpposesSystem || managedConflictCount >= 3 || managedDivergenceDetected || managedBreakoutState === "AT RISK" || managedBreakoutState === "5M REJECT" || managedBreakoutState === "STALE BREAK" || managedBreakoutState === "DECAY"
      ? "DEFEND"
      : managedRMultiple >= 1 ? "TRAIL" : "MONITOR";
  const tradeManagement = !hasHeldPosition
    ? null
    : managedStopReached || managedBreakoutState === "FAILED"
      ? "Breakout structure failed on closed candles or the adjusted stop was reached. Protect the position or exit according to your plan."
      : managedDivergenceDetected
        ? "Divergence detected on the selected symbol. Tighten the adjusted stop, protect open profit, or exit if price loses the confirmed level."
      : managedBreakoutState === "DECAY"
        ? "The tested 15-minute momentum window has expired. Require fresh expansion or defend gains; the study found deterioration toward 30 minutes."
        : managedBreakoutState === "STALE BREAK"
          ? "The mapped breakout is already older than the tested 15-minute window. Do not chase it; require a fresh level break or held retest."
        : managedBreakoutState === "5M REJECT"
          ? "The closed 5-minute candle rejected the breakout level. Defend risk and require a fresh 1-minute surge plus a 5-minute reclaim before trusting continuation."
        : managedBreakoutState === "AT RISK"
          ? "One-minute pressure has flipped against the position. Defend risk while waiting for the 5-minute structure candle to settle."
          : managedBreakoutState === "DOJI TEST"
            ? "A doji is testing the breakout level. Treat it as indecision and wait for the next closed candle to confirm direction."
      : managedPeakReached
        ? "Possible peak reached. Consider taking profit and trail any remainder behind the adjusted stop."
        : !managedDirectionMatchesSystem && direction !== "WAIT"
          ? `System now favors ${direction}. Tighten risk while this ${managedPositionSide} play is opposed.`
          : managedPullback >= managedFavorableMove * 0.35 && managedFavorableMove > 0
            ? "The move is pulling back from its peak. Protect gains at the adjusted stop."
            : managedFavorableMove >= managedRisk
              ? "The move has earned at least 1R. The adjusted stop now protects the entry."
              : `Track the move while ${managedPositionSide === "CALL" ? "upside" : "downside"} structure holds.`;
  const patternRows = dedupeNormalizedPatterns(analysis.normalizedPatterns ?? []);
  const gradedPatterns = patternRows
    .map((pattern) => gradePatternFromOverallRead(pattern, analysis))
    .sort((left, right) => right.score - left.score);
  const activeGradedPatterns = gradedPatterns.filter(({ pattern }) => pattern.state !== "failed" && pattern.state !== "expired");
  const latestPatternIndex = Math.max(0, (analysis.ohlc?.length ?? 0) - 1);
  const detectedReversalPatterns = patternRows.filter((pattern, index, candidates) => {
    if (!analysis.ohlc?.length || pattern.endIndex < latestPatternIndex - 2
        || !canonicalPatternAlertNames.has(canonicalPatternName(pattern.name)) || pattern.state === "failed" || pattern.state === "expired") return false;
    const canonicalName = canonicalPatternName(pattern.name);
    return candidates.findIndex((candidate) =>
      candidate.endIndex >= latestPatternIndex - 2 &&
      canonicalPatternAlertNames.has(canonicalPatternName(candidate.name)) &&
      candidate.state !== "failed" &&
      candidate.state !== "expired" &&
      candidate.direction === pattern.direction &&
      candidate.startIndex === pattern.startIndex &&
      candidate.endIndex === pattern.endIndex &&
      canonicalPatternName(candidate.name) === canonicalName
    ) === index;
  });
  const positionEngineFeeds = [
    { label: "Live fusion", ready: Boolean(fusion), loading: fusionFetching, failed: fusionError },
    { label: "48H outcomes", ready: Boolean(breakoutHistory), loading: historyFetching, failed: historyError },
    { label: "Calibration", ready: Boolean(edgeTuning), loading: tuningFetching, failed: tuningError },
    { label: "Log evidence", ready: Boolean(evidence), loading: evidenceFetching, failed: evidenceError },
  ];
  const positionFeedsReady = positionEngineFeeds.filter((feed) => feed.ready).length;
  const positionFeedsFailed = positionEngineFeeds.filter((feed) => feed.failed).length;
  const positionEngineStatus = positionFeedsFailed
    ? "DEGRADED"
    : positionFeedsReady === positionEngineFeeds.length ? "ONLINE" : "SYNCING";
  const engineHealth = [
    {
      label: "Fusion Core",
      state: fusionError ? "OFFLINE" : fusionFetching && !fusion ? "SYNCING" : fusion ? "ONLINE" : "WAITING",
      tone: fusionError ? "failed" : fusion ? "ready" : "loading",
      detail: fusion ? `${String(fusion.requestedTimeframe ?? executionTimeframe).toUpperCase()} · ${fusion?.unifiedSignal?.state ?? "READY"}` : "Loading multi-TF map",
    },
    {
      label: "Pattern Map",
      state: activeGradedPatterns.length ? "TRACKING" : "SCANNING",
      tone: activeGradedPatterns.length ? "ready" : "loading",
      detail: `${activeGradedPatterns.length} active · ${gradedPatterns.length} graded`,
    },
    {
      label: "Breakout Radar",
      state: scalpDataDelayed ? "STALE" : scalpScan?.sessionEligible === false ? "SESSION IDLE" : scalpScan?.isScanning ? "SCANNING" : scalpScan ? "ONLINE" : "SYNCING",
      tone: scalpDataDelayed ? "failed" : scalpScan?.sessionEligible === false ? "idle" : scalpScan ? "ready" : "loading",
      detail: scalpScan?.sessionEligible === false
        ? "Resumes in eligible session"
        : `${scalpScan?.candidates?.length ?? 0} setups · ${scalpScan?.radarTracks?.length ?? 0} tracks`,
    },
    {
      label: "Calibration",
      state: tuningError || historyError ? "DEGRADED" : edgeTuning && breakoutHistory ? "ONLINE" : "SYNCING",
      tone: tuningError || historyError ? "failed" : edgeTuning && breakoutHistory ? "ready" : "loading",
      detail: `${executionResolved} resolved · ${executionCalibration == null ? "building" : `${Math.round(executionCalibration)}% win`}`,
    },
    {
      label: "Evidence",
      state: evidenceError ? "OFFLINE" : evidence ? "ONLINE" : "SYNCING",
      tone: evidenceError ? "failed" : evidence ? "ready" : "loading",
      detail: `${evidence?.topRules?.length ?? 0} ranked rules`,
    },
  ];
  const isCompressionArmed = Boolean(compression?.active && !compression.healthLow);
  const optionPlayLive = Boolean(
    monster?.hasPlay && monsterPlay && !monsterGate?.conflict &&
    (monsterPlay.side !== "put" || !putSafetyBlocked),
  );
  const chopDominant = chopProb >= upProb && chopProb >= downProb;
  const evidenceDirection = confirmedScannerPut
    ? "PUT"
    : direction === "CALL" && chopDominant
      ? "WAIT"
      : direction;
  const ignitionBlocked = Boolean(monsterGate?.conflict || (monsterPlay?.side === "put" && putSafetyBlocked));
  const ignitionState = optionPlayLive ? "PLAY LIVE"
    : ignitionBlocked ? "BLOCKED"
      : isBreakoutTriggered ? "TRIGGERED"
        : isCompressionArmed ? "ARMED" : "PREPARE";
  const ignitionTone = optionPlayLive ? "live"
    : ignitionBlocked ? "blocked"
      : isBreakoutTriggered ? "triggered"
        : isCompressionArmed ? "armed" : "watch";
  const ignitionMessage = monsterGate?.conflict
    ? monsterGate.conflictReason ?? "Option gate conflict; no contract is authorized."
    : monsterPlay?.side === "put" && putSafetyBlocked
      ? "PUT safety check blocked this contract; wait for downside confirmation."
      : optionPlayLive
        ? monsterPlay?.reason ?? monster?.breakout?.alert ?? "Option gate is aligned."
        : monster?.breakout?.alert ?? compression?.reasons?.[0] ?? "Waiting for compression, directional confirmation, and a valid option gate.";
  const directionalProbability = evidenceDirection === "CALL" ? upProb : evidenceDirection === "PUT" ? downProb : Math.max(upProb, downProb);
  const calibrationDirection = evidenceDirection === "CALL" ? "bullish" : evidenceDirection === "PUT" ? "bearish" : "neutral";
  const calibration = breakoutSummary?.byDirection?.[calibrationDirection];
  const evidenceBaseline = evidence?.baseline?.winRate ?? 50;
  const evidenceSupport = topEvidenceRule?.support ?? 0;
  const evidenceConfidence = evidenceSupport / (evidenceSupport + 20);
  const shrunkEvidenceWinRate = evidenceBaseline +
    ((topEvidenceRule?.winRate ?? evidenceBaseline) - evidenceBaseline) * evidenceConfidence;
  const evidenceScore = evidenceSupport >= 20
    ? Math.max(0, shrunkEvidenceWinRate - Math.max(45, evidenceBaseline)) * 1.65
    : 0;
  const directionalScore = Math.max(0, directionalProbability - 50) * 1.15;
  const conviction = clampScore(
    25 + evidenceScore + directionalScore +
    (isCompressionArmed ? 12 : 0) +
    (volumeRead.ratio >= 1.3 ? 10 : volumeRead.ratio >= 1 ? 4 : 0) +
    (isBreakoutTriggered ? 10 : 0) +
    (optionPlayLive ? 12 : 0) -
    (monsterGate?.conflict ? 25 : 0),
  );
  const convictionLabel = conviction >= 75 ? "HIGH" : conviction >= 55 ? "BUILDING" : "LOW";
  const evidenceTone = evidenceDirection === "CALL" ? "call" : evidenceDirection === "PUT" ? "put" : "neutral";
  const structureLevels = buildStructureLevels({ spot, zones, signal, orderBlock, liquidity });
  const nextUpsideLevel = structureLevels.filter((level) => level.price > spot).at(-1);
  const nextDownsideLevel = structureLevels.find((level) => level.price < spot);
  const structurePrices = [spot, ...structureLevels.map((level) => level.price)];
  const structureRawHigh = Math.max(...structurePrices);
  const structureRawLow = Math.min(...structurePrices);
  const structureMinimumSpan = Math.max(Math.abs(spot) * 0.004, 0.01);
  const structureSpan = Math.max(structureRawHigh - structureRawLow, structureMinimumSpan);
  const structureMidpoint = (structureRawHigh + structureRawLow) / 2;
  const structureFloor = structureMidpoint - structureSpan * 0.62;
  const structureCeiling = structureMidpoint + structureSpan * 0.62;
  const structurePlotPosition = (price: number) =>
    Math.max(3, Math.min(97, ((structureCeiling - price) / (structureCeiling - structureFloor)) * 100));
  const structureLevelLayout = structureLevels.map((level) => ({
    level,
    position: structurePlotPosition(level.price),
  }));
  const minimumLevelGap = 11.5;
  structureLevelLayout.forEach((item, index) => {
    if (index === 0) {
      item.position = Math.max(6, item.position);
      return;
    }
    item.position = Math.max(item.position, structureLevelLayout[index - 1].position + minimumLevelGap);
  });
  if (structureLevelLayout.at(-1)?.position && structureLevelLayout.at(-1)!.position > 94) {
    const overflow = structureLevelLayout.at(-1)!.position - 94;
    structureLevelLayout.forEach((item) => { item.position -= overflow; });
  }
  const preferredLevel = direction === "CALL" ? nextUpsideLevel : direction === "PUT" ? nextDownsideLevel : null;
  const nextStructureTest = preferredLevel
    ? `${direction === "CALL" ? "Clear" : "Hold above"} ${preferredLevel.label} ${value(preferredLevel.price)}`
    : "Await a clean break of the trigger range";
  const positionKey = `aegis-warroom-position:${analysis.symbol}`;
  const liveMovePct = priorClosedPrice && spot > 0 ? ((spot - priorClosedPrice) / priorClosedPrice) * 100 : 0;
  const bullishPricePressure = Math.max(0, liveMovePct) * 300 + priceActionConfirmation.upSteps * 4;
  const bearishPricePressure = Math.max(0, -liveMovePct) * 300 + priceActionConfirmation.downSteps * 4;
  const shortTermTapeDirection: SmartSignal["direction"] =
    (currentTapeDirection === "CALL" ||
      (liveMovePct > 0 && priceActionConfirmation.upSteps > priceActionConfirmation.downSteps)) &&
    currentTapeDirection !== "PUT"
      ? "CALL"
      : (currentTapeDirection === "PUT" ||
          (liveMovePct < 0 && priceActionConfirmation.downSteps > priceActionConfirmation.upSteps))
        ? "PUT"
        : "WAIT";
  const executionConfirmations = [tickDirection, liveSwingDirection, recentStepDirection,
    priceActionConfirmation.direction === "bullish" ? "CALL" : priceActionConfirmation.direction === "bearish" ? "PUT" : "WAIT"];
  const executionCallConfirmations = executionConfirmations.filter((confirmation) => confirmation === "CALL").length;
  const executionPutConfirmations = executionConfirmations.filter((confirmation) => confirmation === "PUT").length;
  const liveAdx = tacticalIndicators?.adx.value;
  const weakTrend = liveAdx != null && liveAdx < 20;
  const developingTrend = liveAdx != null && liveAdx < 25;
  const unarmedSqueeze = Boolean(
    tacticalIndicators?.bb.squeeze &&
    (compression?.factors?.preBreakout ?? 0) < 50 &&
    (compression?.factors?.triggerPressure ?? 0) < 50,
  );
  const requiredExecutionConfirmations = developingTrend ? 3 : 2;
  const executionRegimeWait = chopDominant || weakTrend || unarmedSqueeze;
  const executionTiltDirection: SmartSignal["direction"] = executionRegimeWait
    ? "WAIT"
    : executionCallConfirmations >= requiredExecutionConfirmations && executionPutConfirmations === 0
      ? "CALL"
      : executionPutConfirmations >= requiredExecutionConfirmations && executionCallConfirmations === 0 ? "PUT" : "WAIT";
  const marketTiltDirection: SmartSignal["direction"] = executionRegimeWait
    ? "WAIT"
    : executionTiltDirection !== "WAIT"
      ? executionTiltDirection
      : fusionTiltDirection;
  const rawCallPressure = clampScore(upProb * 0.65 + bullishPricePressure + Math.max(0, tickMovePct) * 450 + (executionTiltDirection === "CALL" ? 12 : 0));
  const rawPutPressure = clampScore(downProb * 0.65 + bearishPricePressure + Math.max(0, -tickMovePct) * 450 + (executionTiltDirection === "PUT" ? 12 : 0));
  const neutralPressure = clampScore((rawCallPressure + rawPutPressure) / 2);
  const liveCallPressure = executionTiltDirection === "WAIT"
    ? neutralPressure
    : executionTiltDirection === "PUT" ? Math.min(rawCallPressure, Math.max(0, rawPutPressure - 8)) : rawCallPressure;
  const livePutPressure = executionTiltDirection === "WAIT"
    ? neutralPressure
    : executionTiltDirection === "CALL" ? Math.min(rawPutPressure, Math.max(0, rawCallPressure - 8)) : rawPutPressure;
  const executionTiltScore = executionTiltDirection === "CALL"
    ? liveCallPressure
    : executionTiltDirection === "PUT" ? livePutPressure : neutralPressure;
  const executionTiltConfidence = executionTiltDirection === "WAIT"
    ? Math.abs(rawCallPressure - rawPutPressure)
    : Math.max(liveCallPressure, livePutPressure);
  const executionRegimeLabel = chopDominant
    ? "CHOP WAIT"
    : weakTrend ? `ADX ${liveAdx?.toFixed(1)} WAIT`
      : unarmedSqueeze ? "SQUEEZE WAIT"
        : `${tickMovePct >= 0 ? "+" : ""}${tickMovePct.toFixed(3)}% TICK`;
  const liveMomentumStrength = Math.abs(tacticalIndicators?.momentum?.score ?? 0);
  const hasBollingerState = typeof tacticalIndicators?.bb?.squeeze === "boolean";
  const compressionInputs = [
    compression?.factors?.preBreakout,
    compression?.factors?.triggerPressure,
    compression?.readinessScore,
  ];
  const hasCompressionState = compressionInputs.some((input) => Number.isFinite(input));
  const hasExpansionEngineData = hasBollingerState || hasCompressionState;
  const expansionScore = hasExpansionEngineData
    ? clampScore(Math.max(
        tacticalIndicators?.bb.squeeze ? 20 : 65,
        compression?.factors?.preBreakout ?? 0,
        compression?.factors?.triggerPressure ?? 0,
      ))
    : 0;
  const directionalStepEdge = Math.max(-4, Math.min(4, priceActionConfirmation.upSteps - priceActionConfirmation.downSteps));
  const momentumScore = Number(tacticalIndicators?.momentum?.score ?? 0);
  const callDirectional =
    (shortTermTapeDirection === "CALL" ? 26 : shortTermTapeDirection === "PUT" ? 4 : 14) +
    (confirmedEmaHoldDirection === "CALL" ? 20 + candleVolumePower * 0.16 : 0) +
    Math.max(0, liveMovePct) * 520 +
    Math.max(0, directionalStepEdge) * 11 +
    Math.max(0, momentumScore) * 1.08;
  const putDirectional =
    (shortTermTapeDirection === "PUT" ? 26 : shortTermTapeDirection === "CALL" ? 4 : 14) +
    (confirmedEmaHoldDirection === "PUT" ? 20 + candleVolumePower * 0.16 : 0) +
    Math.max(0, -liveMovePct) * 520 +
    Math.max(0, -directionalStepEdge) * 11 +
    Math.max(0, -momentumScore) * 1.08;
  const sharedFlow = clampScore(Math.max(0, (volumeRead.ratio - 0.85) * 75) * 0.42 + expansionScore * 0.25);
  const callRaw = Math.max(1, callDirectional + sharedFlow);
  const putRaw = Math.max(1, putDirectional + sharedFlow);
  const rawTotal = Math.max(1, callRaw + putRaw);
  const callPushPower = clampScore((callRaw / rawTotal) * 100);
  const putPushPower = clampScore((putRaw / rawTotal) * 100);
  const pushIntensity = clampScore((Math.max(callDirectional, putDirectional) * 0.46) + sharedFlow * 0.54);
  const directionalGap = Math.abs(callPushPower - putPushPower);
  const compressionPushDirection: SmartSignal["direction"] = Math.abs(callPushPower - putPushPower) >= 8
    ? callPushPower >= putPushPower ? "CALL" : "PUT"
    : "WAIT";
  const priceActionDirection: SmartSignal["direction"] = confirmedEmaHoldDirection !== "WAIT"
    ? confirmedEmaHoldDirection
    : shortTermTapeDirection;
  const executionDisplayDirection: SmartSignal["direction"] = marketTiltDirection !== "WAIT"
    ? marketTiltDirection
    : compressionPushDirection;
  const compressionPushPower = compressionPushDirection === "CALL"
    ? clampScore(pushIntensity * 0.72 + directionalGap * 0.28)
    : compressionPushDirection === "PUT"
      ? clampScore(pushIntensity * 0.72 + directionalGap * 0.28)
      : clampScore(pushIntensity * 0.58);
  const compressionPushTone = executionDisplayDirection === "CALL" ? "call" : executionDisplayDirection === "PUT" ? "put" : "neutral";
  const compressionDirectionalScore = clampScore(expansionScore * 0.52 + compressionPushPower * 0.48);
  const compressionDirectionalConfidence = clampScore(
    (compression?.factors?.preBreakout ?? expansionScore) * 0.45 +
    compressionPushPower * 0.4 +
    directionalGap * 0.15,
  );
  const compressionReady = Boolean(isCompressionArmed && expansionScore >= 50);
  const compressionAlertAssist = compressionReady && compressionPushDirection !== "WAIT" && compressionPushPower >= 66;
  const alertTriggered = alertTriggeredBase || compressionAlertAssist;
  const expansionReleaseReady = Boolean(
    !compression?.healthLow &&
    expansionScore >= 50 &&
    (
      compression?.keltnerBreakoutSide === "upper" ||
      compression?.keltnerBreakoutSide === "lower" ||
      isBreakoutTriggered ||
      liveMomentumStrength >= 35
    ),
  );
  const useCalibrationUnlock = executionResolved >= 20;
  const calibrationUnlockScore = clampScore(executionCalibration ?? 0);
  const historicalGuardLabel = requiresSpyScoreBand ? "SPY 72-79" : "48H EDGE";
  const playUnlockMetrics = {
    trend: clampScore(((liveAdx ?? 0) - 15) / 20 * 100),
    momentum: clampScore(liveMomentumStrength / 55 * 100),
    historicalGuard: useCalibrationUnlock ? calibrationUnlockScore : expansionScore,
    alignment: clampScore(Math.max(executionCallConfirmations, executionPutConfirmations) / 4 * 100),
  };
  const playUnlockChecks = {
    trend: (liveAdx ?? 0) >= 25,
    momentum: liveMomentumStrength >= 35,
    historicalGuard: useCalibrationUnlock ? calibrationReady && scoreBandCalibrated : compressionReady || expansionReleaseReady,
    alignment: marketTiltDirection !== "WAIT",
  };
  const playUnlockPassed = Object.values(playUnlockChecks).filter(Boolean).length;
  const playUnlocked = playUnlockPassed === Object.keys(playUnlockChecks).length;
  const playUnlockState = playUnlocked ? "PLAY UNLOCKED" : playUnlockPassed >= 3 ? "ARMING" : "LOCKED";
  const executionTone = executionTiltDirection === "CALL" ? "call" : executionTiltDirection === "PUT" ? "put" : "neutral";
  const marketTiltTone = marketTiltDirection === "CALL" ? "call" : marketTiltDirection === "PUT" ? "put" : "neutral";
  const playUnlockTone = playUnlocked ? marketTiltTone : "neutral";
  const compressionStrength = expansionScore;
  const compressionReliability = clampScore(
    ((compression?.factors?.bollinger ?? 0) +
      (compression?.factors?.atrTightness ?? 0) +
      (compression?.factors?.preBreakout ?? 0) +
      (compression?.factors?.triggerPressure ?? 0)) / 4,
  );
  const fusionSyncLabel = fusionUpdatedAt
    ? `Fusion synced ${new Date(fusionUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
    : "Fusion data pending";
  const mtfScore = toPercentScale(fusion?.mtfConsensus?.alignmentScore);
  const strictExecutionReady = Boolean(
    hasExecution &&
    scannerDataFresh &&
    optionPlayLive &&
    isBreakoutTriggered &&
    volumeRead.ratio >= 1.3 &&
    mtfScore >= 60 &&
    calibrationReady &&
    scoreBandCalibrated,
  );
  const liquidityExecution = buildLiquidityExecutionModel({
    spot,
    previousSpot,
    ohlc: analysis.ohlc ?? [],
    direction: executionDisplayDirection,
    chopDominant,
    volumeRatio: volumeRead.ratio,
    momentumAbs: liveMomentumStrength,
    mtfScore,
    volatilityRegime: volatility,
    structureLevels,
    orderBlock,
    liquidity,
    gammaStrike: analysis.marketHealth?.gamma?.maxAbsGammaStrike ?? analysis.metaEngine?.liquidity?.levels?.find((level) => level.type === "GAMMA")?.price ?? null,
    liquidityLevels: analysis.metaEngine?.liquidity?.levels,
    nearestBullishFvg,
    nearestBearishFvg,
  });
  const executionState = strictExecutionReady ? "MANAGE" : isBreakoutTriggered ? "TRIGGERED" : "PREPARE";
  const gateChecks: Array<{ label: string; detail: string; passed: boolean; status?: "pass" | "blocked" | "caution" }> = [
    {
      label: "Live data integrity",
      detail: scannerDataFresh ? "Fresh spot and scanner tape" : "Fresh spot and non-degraded scanner tape required",
      passed: scannerDataFresh,
    },
    {
      label: "Price trigger",
      detail: rawDirection === "PUT" && putSafetyBlocked
        ? currentTapeDirection === "CALL"
          ? "PUT blocked: live tape is grinding up; wait for a confirmed downside turn"
          : `PUT blocked: live price must fall below prior close ${value(priorClosedPrice)}`
        : direction === "CALL" ? `Needs ${value(zones?.upper)} reclaim` : direction === "PUT" ? `Needs ${value(zones?.lower)} hold` : "Await directional trigger",
      passed: isBreakoutTriggered && !(rawDirection === "PUT" && putSafetyBlocked),
    },
    {
      label: "Volume confirmation",
      detail: `${volumeRead.ratio.toFixed(2)}x completed bar / 1.30x required`,
      passed: volumeRead.ratio >= 1.3,
    },
    {
      label: "Multi-timeframe alignment",
      detail: mtfScore ? `${Math.round(mtfScore)}% aligned` : "Synchronizing consensus",
      passed: mtfScore >= 60,
    },
    {
      label: "Option gate",
      detail: monsterGate?.conflict ? monsterGate.conflictReason ?? "Conflicting option conditions" : optionPlayLive ? "Contract approved" : "Waiting for a valid option play",
      passed: optionPlayLive,
    },
    {
      label: "48h execution calibration",
      detail: executionResolved ? `${percent(executionCalibration)} over ${executionResolved} resolved executions` : "Collecting resolved execution outcomes",
      passed: calibrationReady,
      status: calibrationReady ? "pass" : executionResolved >= 20 ? "caution" : "blocked",
    },
    ...(requiresSpyScoreBand ? [{
      label: "SPY score calibration",
      detail: `${Math.round(selectedEdgeScore)} current edge score / 72-79 historical band`,
      passed: scoreBandCalibrated,
      status: scoreBandCalibrated ? "pass" as const : "caution" as const,
    }] : []),
  ];
  const gateBlockers = gateChecks.filter((check) => !check.passed);
  const directionTone = (input: string | null | undefined): TabMonitorTone => {
    const normalized = String(input ?? "").toUpperCase();
    if (/CALL|BULL|UP|LONG|ACCUMULATE/.test(normalized)) return "call";
    if (/PUT|BEAR|DOWN|SHORT|DISTRIBUTE/.test(normalized)) return "put";
    return "neutral";
  };
  const trackTone = (tracks: Array<{ direction: "LONG" | "SHORT"; score: number }>): TabMonitorTone => {
    const callScore = tracks.filter((track) => track.direction === "LONG").reduce((sum, track) => sum + Math.max(1, track.score), 0);
    const putScore = tracks.filter((track) => track.direction === "SHORT").reduce((sum, track) => sum + Math.max(1, track.score), 0);
    const total = callScore + putScore;
    if (callScore > 0 && putScore > 0 && Math.abs(callScore - putScore) <= total * 0.25) return "conflict";
    return callScore > putScore ? "call" : putScore > callScore ? "put" : "neutral";
  };
  const executionConflict = executionCallConfirmations >= 2 && executionPutConfirmations >= 2 ||
    rawCallPressure >= 35 && rawPutPressure >= 35 && Math.abs(rawCallPressure - rawPutPressure) < 10;
  const positionConflict = positionScoreGap < 6 || leadingPlayModel.conflicts >= 3;
  const smartConflict = Boolean(smartSignal && smartSignal.direction !== "WAIT" && !smartSignal.agreement);
  const cloudConflict = cloudTapeOverride || Math.abs(callStrength - putStrength) < 10;
  const patternCallScore = patternRows.filter((pattern) => pattern.direction === "bullish").reduce((sum, pattern) => sum + pattern.confidence, 0);
  const patternPutScore = patternRows.filter((pattern) => pattern.direction === "bearish").reduce((sum, pattern) => sum + pattern.confidence, 0);
  const patternTone: TabMonitorTone = patternCallScore > 0 && patternPutScore > 0 && Math.abs(patternCallScore - patternPutScore) <= (patternCallScore + patternPutScore) * 0.25
    ? "conflict"
    : patternCallScore > patternPutScore ? "call" : patternPutScore > patternCallScore ? "put" : directionTone(direction);
  const bullishPatternRead = activeGradedPatterns
    .filter(({ pattern }) => pattern.direction === "bullish")
    .reduce((sum, item) => sum + item.score, 0);
  const bearishPatternRead = activeGradedPatterns
    .filter(({ pattern }) => pattern.direction === "bearish")
    .reduce((sum, item) => sum + item.score, 0);
  const patternReadTotal = bullishPatternRead + bearishPatternRead;
  const patternReadDirection: SmartSignal["direction"] = patternReadTotal === 0 || Math.abs(bullishPatternRead - bearishPatternRead) / patternReadTotal < 0.12
    ? "WAIT"
    : bullishPatternRead > bearishPatternRead ? "CALL" : "PUT";
  const patternReadScore = activeGradedPatterns.length
    ? clampScore(activeGradedPatterns.slice(0, 8).reduce((sum, item) => sum + item.score, 0) / Math.min(activeGradedPatterns.length, 8))
    : 0;
  const reversalRead = readPriceActionReversal({
    bullishCandle: strongBullishReversalCandle,
    bearishCandle: strongBearishReversalCandle,
    bodyQuality: candleBodyQuality,
    volumeRatio: volumeRead.ratio,
    patterns: activeGradedPatterns.flatMap(({ pattern, score }) =>
      pattern.direction === "bullish" || pattern.direction === "bearish"
        ? [{ name: pattern.name, direction: pattern.direction, score }]
        : [],
    ),
    scalpExitWarning,
  });
  const patternReadGrade = patternGradeFromScore(patternReadScore);
  const divergenceWarning = analysis.divergenceWarning;
  const divergenceActive = Boolean(divergenceWarning && divergenceWarning.type !== "none");
  const divergenceTone: TabMonitorTone = divergenceWarning?.type === "bullish_divergence"
    ? "call"
    : divergenceWarning?.type === "bearish_divergence" ? "put"
      : divergenceActive ? "conflict" : "neutral";
  const macroTone: TabMonitorTone = fusionTiltDirection !== "WAIT" && marketTiltDirection !== "WAIT" && fusionTiltDirection !== marketTiltDirection
    ? "conflict"
    : directionTone(fusion?.mtfConsensus?.trendConsensus);
  const tabMonitorTones: Record<typeof activeView, TabMonitorTone> = {
    execution: executionConflict ? "conflict" : directionTone(executionDisplayDirection),
    position: positionLifecycleBlocked ? "neutral" : positionConflict ? "conflict" : directionTone(leadingPlayModel.side),
    smart: smartConflict ? "conflict" : directionTone(smartSignal?.direction),
    cloud: cloudConflict ? "conflict" : directionTone(cloudDirection),
    evidence: chopDominant ? "conflict" : directionTone(evidenceDirection),
    flow: flowTone,
    radar: trackTone(visibleScalpTracks),
    alerts: trackTone(alertDisplayTracks),
    patterns: patternTone,
    summary: patternReadDirection === "WAIT" ? "neutral" : directionTone(patternReadDirection),
    divergence: divergenceTone,
    macro: macroTone,
    review: executionResolved >= 20 && !calibrationReady ? "conflict" : directionTone(direction),
  };

  const executionTiltReliability = clampScore(
    45 + Math.abs(priceActionConfirmation.upSteps - priceActionConfirmation.downSteps) * 12 +
    Math.min(20, Math.abs(liveMovePct) * 100),
  );

  const primaryExecutionInputs: CompositeGaugeInput[] = [
    { name: "Market Tilt", score: executionTiltScore, confidence: executionTiltConfidence, reliability: executionTiltReliability, direction: marketTiltDirection, weight: 1 },
    { name: "Compression", score: compressionDirectionalScore, confidence: compressionDirectionalConfidence, reliability: compressionReliability, direction: executionDisplayDirection, weight: 0.9 },
    { name: "Option Ignition", score: directionalProbability, confidence: conviction, reliability: clampScore(40 + (isCompressionArmed ? 20 : 0) + (optionPlayLive ? 25 : 0) + (isBreakoutTriggered ? 15 : 0)), direction: evidenceDirection, weight: 1 },
    { name: "Conviction", score: conviction, confidence: directionalProbability, reliability: clampScore(executionResolved / minimumCalibrationSample * 100), direction: evidenceDirection, weight: 0.65 },
  ];
  const contextFusionInputs: CompositeGaugeInput[] = [
    { name: "EMA Cloud", score: cloudDecisionStrength, confidence: cloudDecisionConfidence, reliability: cloudReliability, direction: cloudDirection, weight: 1 },
    { name: "Historical Smart Signal", score: smartSignal?.probability ?? 0, confidence: smartSignal?.confidence ?? 0, reliability: smartSignal?.reliability ?? 0, direction: smartSignal?.direction ?? "WAIT", weight: 0.9 },
    { name: "Scalp Radar", score: radarAverageScore, confidence: Math.min(100, radarAverageScore + 10), reliability: Math.min(100, scalpCandidates.length ? (scalpCandidates.length / Math.max(radarTracks.length, 1)) * 100 : radarAverageScore), direction: radarDirection, weight: 0.9 },
    { name: "Position Manager", score: leadingPlayModel.score, confidence: positionScoreGap, reliability: clampScore(leadingPlayModel.coverage * 100), direction: leadingPlayModel.side, weight: 1.15 },
  ];
  const primaryExecutionFusion = fuseCompositeGauge(primaryExecutionInputs);
  const contextFusion = fuseCompositeGauge(contextFusionInputs);

  useEffect(() => {
    const candle = analysis.ohlc?.at(-1);
    const candleTimeMs = Number(candle?.time ?? 0) * 1000;
    if (!analysis.symbol || !Number.isFinite(candleTimeMs) || candleTimeMs <= 0 || spot <= 0) return;

    const capturedAtMs = Date.now();
    const quarterHourBucket = Math.floor(capturedAtMs / (15 * 60_000)) * (15 * 60_000);
    const snapshotId = `${analysis.symbol.toUpperCase()}:${executionTimeframe}:${quarterHourBucket}`;
    if (lastWarRoomCaptureRef.current === snapshotId) return;
    lastWarRoomCaptureRef.current = snapshotId;

    const feedAgeMs = fusionUpdatedAt > 0 ? Math.max(0, capturedAtMs - fusionUpdatedAt) : null;
    const gauges: WarRoomGaugeData[] = [
      {
        name: "market_tilt",
        score: executionTiltScore,
        confidence: executionTiltConfidence,
        reliability: executionTiltReliability,
        direction: marketTiltDirection,
      },
      {
        name: "compression",
        score: compressionDirectionalScore,
        confidence: compressionDirectionalConfidence,
        reliability: compressionReliability,
        direction: executionDisplayDirection,
      },
      {
        name: "option_ignition",
        score: directionalProbability,
        confidence: conviction,
        reliability: clampScore(40 + (isCompressionArmed ? 20 : 0) + (optionPlayLive ? 25 : 0) + (isBreakoutTriggered ? 15 : 0)),
        direction: evidenceDirection,
      },
      {
        name: "pattern_read",
        score: patternReadScore,
        confidence: patternReadScore,
        reliability: clampScore(activeGradedPatterns.length * 15),
        direction: patternReadDirection,
      },
      {
        name: "ema_cloud",
        score: cloudDecisionStrength,
        confidence: cloudDecisionConfidence,
        reliability: cloudReliability,
        direction: cloudDirection,
      },
      {
        name: "historical_smart_signal",
        score: smartSignal?.probability ?? 0,
        confidence: smartSignal?.confidence ?? 0,
        reliability: smartSignal?.reliability ?? 0,
        direction: smartSignal?.direction ?? "WAIT",
      },
      {
        name: "scalp_radar",
        score: radarAverageScore,
        confidence: Math.min(100, radarAverageScore + 10),
        reliability: Math.min(100, scalpCandidates.length ? (scalpCandidates.length / Math.max(radarTracks.length, 1)) * 100 : radarAverageScore),
        direction: radarDirection,
      },
      {
        name: "managed_position",
        score: managedEngineScore,
        confidence: managedSideProbability,
        reliability: executionCalibration ?? fusion?.mtfConsensus?.alignmentScore ?? 0,
        direction: managedPositionSide ?? "WAIT",
      },
      {
        name: "conviction",
        score: conviction,
        confidence: directionalProbability,
        reliability: clampScore(executionResolved / minimumCalibrationSample * 100),
        direction: evidenceDirection,
      },
      {
        name: "primary_execution_fusion",
        score: primaryExecutionFusion.score,
        confidence: primaryExecutionFusion.confidence,
        reliability: primaryExecutionFusion.reliability,
        direction: primaryExecutionFusion.direction,
      },
      {
        name: "context_fusion",
        score: contextFusion.score,
        confidence: contextFusion.confidence,
        reliability: contextFusion.reliability,
        direction: contextFusion.direction,
      },
    ];
    const payload = {
      snapshotId,
      symbol: analysis.symbol,
      timeframe: executionTimeframe,
      capturedAtMs,
      candleTimeMs,
      price: spot,
      marketRegime: String(fusion?.volatilityRegime?.regime ?? (chopDominant ? "ranging" : "unknown")).toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32) || "unknown",
      features: {
        upProbability: upProb,
        downProbability: downProb,
        chopProbability: chopProb,
        adx: Number.isFinite(tacticalIndicators?.adx.value) ? tacticalIndicators?.adx.value ?? null : null,
        volumeRatio: volumeRead.ratio,
        callPressure: liveCallPressure,
        putPressure: livePutPressure,
        compressionScore: compressionDirectionalScore,
        compressionArmed: isCompressionArmed,
        breakoutTriggered: isBreakoutTriggered,
        optionPlayLive,
        monsterConflict: Boolean(monsterGate?.conflict),
        activePatternCount: activeGradedPatterns.length,
        bullishPatternScore: bullishPatternRead,
        bearishPatternScore: bearishPatternRead,
        cloudCallStrength: callStrength,
        cloudPutStrength: putStrength,
        cloudAlignment,
        mtfAlignment: mtfScore,
        radarCandidateCount: scalpCandidates.length,
        radarTrackCount: radarTracks.length,
        managedAgreementCount: managedAgreementCount,
        managedConflictCount: managedConflictCount,
      },
      feedFresh: Boolean(spotIsLive && !isRefreshing && feedAgeMs != null && feedAgeMs <= 90_000),
      feedAgeMs,
      gauges,
    };
    void fetch("/api/black-box/war-room-gauge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).then((response) => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    }).catch((error) => console.warn("War Room gauge capture logging failed", error));
  }, [
    activeGradedPatterns.length,
    analysis.ohlc,
    analysis.symbol,
    callStrength,
    cloudAlignment,
    cloudDecisionConfidence,
    cloudDecisionStrength,
    cloudDirection,
    cloudReliability,
    compressionDirectionalConfidence,
    compressionDirectionalScore,
    compressionReliability,
    chopProb,
    conviction,
    directionalProbability,
    evidenceDirection,
    executionDisplayDirection,
    executionTimeframe,
    executionCalibration,
    executionResolved,
    executionTiltConfidence,
    executionTiltReliability,
    executionTiltScore,
    leadingPlayModel.coverage,
    leadingPlayModel.score,
    leadingPlayModel.side,
    positionScoreGap,
    fusionUpdatedAt,
    isBreakoutTriggered,
    isCompressionArmed,
    isRefreshing,
    isCompressionArmed,
    liveCallPressure,
    livePutPressure,
    marketTiltDirection,
    managedAgreementCount,
    managedConflictCount,
    managedEngineScore,
    managedPositionSide,
    managedSideProbability,
    mtfScore,
    chopDominant,
    fusion?.volatilityRegime?.regime,
    fusion?.mtfConsensus?.alignmentScore,
    monsterGate?.conflict,
    optionPlayLive,
    patternReadDirection,
    patternReadScore,
    bullishPatternRead,
    bearishPatternRead,
    putStrength,
    radarAverageScore,
    radarDirection,
    radarTracks.length,
    scalpCandidates.length,
    smartSignal?.confidence,
    smartSignal?.direction,
    smartSignal?.probability,
    smartSignal?.reliability,
    spot,
    spotIsLive,
    tacticalIndicators?.adx.value,
    upProb,
    downProb,
    volumeRead.ratio,
  ]);

  useEffect(() => {
    if (patternAlertScopeRef.current !== analysis.symbol) {
      patternAlertScopeRef.current = analysis.symbol;
      seenPatternAlertsRef.current.clear();
      setPatternDetectionAlerts([]);
    }

    const fresh = detectedReversalPatterns.filter((pattern) => {
      const signature = `${analysis.symbol}|${canonicalPatternName(pattern.name)}|${pattern.direction}|${pattern.startIndex}|${pattern.endIndex}`;
      if (seenPatternAlertsRef.current.has(signature)) return false;
      seenPatternAlertsRef.current.add(signature);
      return true;
    });
    if (fresh.length) setPatternDetectionAlerts(fresh.slice(-5));
  }, [analysis.symbol, detectedReversalPatterns]);

  useEffect(() => {
    if (spotTrailSymbolRef.current !== analysis.symbol) {
      spotTrailSymbolRef.current = analysis.symbol;
      spotTrailRef.current = [];
      previousSpotRef.current = 0;
    }
    if (spot > 0) {
      previousSpotRef.current = spot;
      const trail = spotTrailRef.current;
      if (trail.at(-1) !== spot) spotTrailRef.current = [...trail, spot].slice(-12);
    }
  }, [analysis.symbol, spot]);

  useEffect(() => {
    positionHydrationKeyRef.current = positionKey;
    const savedPosition = window.localStorage.getItem(positionKey);
    if (!savedPosition) {
      setManagedPositionSide(null);
      setManagedEntrySpot(null);
      setManagedPeakSpot(null);
      setManagedEntryTime(null);
      return;
    }
    try {
      const position = JSON.parse(savedPosition) as { side?: ManagedPositionSide; entrySpot?: number; peakSpot?: number; entryTime?: number };
      setManagedPositionSide(position.side === "CALL" || position.side === "PUT" ? position.side : null);
      setManagedEntrySpot(Number.isFinite(position.entrySpot) ? position.entrySpot ?? null : null);
      setManagedPeakSpot(Number.isFinite(position.peakSpot) ? position.peakSpot ?? null : null);
      setManagedEntryTime(Number.isFinite(position.entryTime) ? position.entryTime ?? null : Date.now());
    } catch {
      window.localStorage.removeItem(positionKey);
      setManagedPositionSide(null);
      setManagedEntrySpot(null);
      setManagedPeakSpot(null);
      setManagedEntryTime(null);
    }
  }, [positionKey]);

  useEffect(() => {
    if (positionHydrationKeyRef.current === positionKey) {
      positionHydrationKeyRef.current = null;
      return;
    }
    if (!managedPositionSide || !managedEntrySpot || !managedPeakSpot || !managedEntryTime) {
      window.localStorage.removeItem(positionKey);
      return;
    }
    window.localStorage.setItem(positionKey, JSON.stringify({ side: managedPositionSide, entrySpot: managedEntrySpot, peakSpot: managedPeakSpot, entryTime: managedEntryTime }));
  }, [managedEntrySpot, managedEntryTime, managedPeakSpot, managedPositionSide, positionKey]);

  useEffect(() => {
    if (!managedPositionSide) return;
    setManagedClock(Date.now());
    const intervalId = window.setInterval(() => setManagedClock(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, [managedPositionSide]);

  useEffect(() => {
    const previousAlert = favoredAlertRef.current;
    const alertChanged = previousAlert && (
      !positionFavoredSide ||
      previousAlert.symbol !== analysis.symbol ||
      previousAlert.side !== positionFavoredSide
    );

    if (alertChanged) {
      const endedAt = Date.now();
      postPositionManagerAlert({
        ...previousAlert,
        event: "resolved",
        endedAt,
        endPrice: previousAlert.symbol === analysis.symbol ? spot : previousAlert.latestPrice,
        resolvedReason: previousAlert.symbol !== analysis.symbol
          ? "symbol_changed"
          : positionFavoredSide ? "direction_changed" : positionGateState,
      });
      favoredAlertRef.current = null;
    }

    if (!positionFavoredSide) {
      setFavoredPlayRun(null);
      return;
    }

    if (favoredAlertRef.current?.symbol === analysis.symbol && favoredAlertRef.current.side === positionFavoredSide) return;

    const startedAt = Date.now();
    const activeModel = positionFavoredSide === "CALL" ? callPlayModel : putPlayModel;
    const opposingModel = positionFavoredSide === "CALL" ? putPlayModel : callPlayModel;
    const alertRun: PositionManagerAlertRun = {
      alertId: `${analysis.symbol}:${positionFavoredSide}:${startedAt}:${Math.random().toString(36).slice(2, 8)}`,
      symbol: analysis.symbol,
      timeframe: executionTimeframe,
      side: positionFavoredSide,
      startedAt,
      startPrice: spot,
      latestPrice: spot,
      maxFavorableExcursionPct: 0,
      maxAdverseExcursionPct: 0,
      maxFavorableAt: startedAt,
      maxAdverseAt: startedAt,
      lastSampledAt: startedAt,
      sampleCount: 1,
      score: activeModel.score,
      opposingScore: opposingModel.score,
      scoreGap: positionScoreGap,
      coverage: activeModel.coverage,
      gateState: positionGateState,
      studyState: positionStudyState,
      fusionFresh: positionFusionFresh,
      fiveMinuteState: leadingFiveMinuteRead?.state ?? null,
      breakoutAgeMinutes: leadingBreakoutAgeMinutes,
      ignition: {
        direction: microIgnition?.direction ?? null,
        state: microIgnition?.state ?? null,
        strength: microIgnition?.strength ?? null,
        volumeAcceleration: microIgnition?.volumeAcceleration ?? null,
      },
      signals: activeModel.inputs.map((input) => ({
        label: input.label,
        score: input.score,
        weight: input.weight,
        classification: input.score >= 55 ? "support" : input.score < 40 ? "conflict" : "neutral",
      })),
    };
    favoredAlertRef.current = alertRun;
    postPositionManagerAlert({ ...alertRun, event: "activated" });
    setFavoredPlayRun({ symbol: analysis.symbol, side: positionFavoredSide, startedAt });
    setFavoredPlayClock(startedAt);
  }, [analysis.symbol, positionFavoredSide]);

  useEffect(() => {
    const activeAlert = favoredAlertRef.current;
    if (activeAlert?.symbol !== analysis.symbol || !(activeAlert.startPrice > 0)) return;
    const sampledAt = Date.now();
    const directionalMovePct = activeAlert.side === "CALL"
      ? (spot - activeAlert.startPrice) / activeAlert.startPrice * 100
      : (activeAlert.startPrice - spot) / activeAlert.startPrice * 100;
    const favorableExcursionPct = Math.max(0, directionalMovePct);
    const adverseExcursionPct = Math.max(0, -directionalMovePct);
    activeAlert.latestPrice = spot;
    activeAlert.lastSampledAt = sampledAt;
    activeAlert.sampleCount += 1;
    if (favorableExcursionPct > activeAlert.maxFavorableExcursionPct) {
      activeAlert.maxFavorableExcursionPct = Number(favorableExcursionPct.toFixed(4));
      activeAlert.maxFavorableAt = sampledAt;
    }
    if (adverseExcursionPct > activeAlert.maxAdverseExcursionPct) {
      activeAlert.maxAdverseExcursionPct = Number(adverseExcursionPct.toFixed(4));
      activeAlert.maxAdverseAt = sampledAt;
    }
  }, [analysis.symbol, spot]);

  useEffect(() => {
    const resolveOnPageHide = (event: PageTransitionEvent) => {
      if (event.persisted) return;
      const activeAlert = favoredAlertRef.current;
      if (!activeAlert) return;
      const endedAt = Date.now();
      postPositionManagerAlert({
        ...activeAlert,
        event: "resolved",
        endedAt,
        endPrice: activeAlert.latestPrice,
        resolvedReason: "page_hidden",
      }, true);
      favoredAlertRef.current = null;
    };
    window.addEventListener("pagehide", resolveOnPageHide);
    return () => window.removeEventListener("pagehide", resolveOnPageHide);
  }, []);

  useEffect(() => {
    if (!positionFavoredSide) return;
    const intervalId = window.setInterval(() => setFavoredPlayClock(Date.now()), 1_000);
    return () => window.clearInterval(intervalId);
  }, [positionFavoredSide]);

  useEffect(() => {
    if (!managedPositionSide || !managedEntrySpot || spot <= 0) return;
    setManagedPeakSpot((currentPeak) => {
      if (!currentPeak) return spot;
      return managedPositionSide === "CALL" ? Math.max(currentPeak, spot) : Math.min(currentPeak, spot);
    });
  }, [managedEntrySpot, managedPositionSide, spot]);

  const startManagedPosition = (side: ManagedPositionSide) => {
    if (spot <= 0) return;
    if (managedPositionSide === side && managedEntrySpot) return;
    setManagedPositionSide(side);
    setManagedEntrySpot(spot);
    setManagedPeakSpot(spot);
    const startedAt = Date.now();
    setManagedEntryTime(startedAt);
    setManagedClock(startedAt);
  };

  const closeManagedPosition = () => {
    setManagedPositionSide(null);
    setManagedEntrySpot(null);
    setManagedPeakSpot(null);
    setManagedEntryTime(null);
  };

  return (
    <section className="warroom-command-deck warroom-command-deck--enhanced" data-testid="warroom-command-deck">
      <div className="warroom-command-deck__chrome" />
      <div className="warroom-command-deck__scan" />
      <div className="warroom-command-deck__noise" />
      <div className="warroom-command-deck__pulseline" />
      <div className="warroom-command-deck__header">
        <div>
          <div className="warroom-command-deck__eyebrow"><Radar className="h-3.5 w-3.5" /> Fusion // Breakout Command</div>
          <h2>{analysis.symbol} Fusion War Room</h2>
        </div>
        <div className="warroom-command-deck__badges">
          <div className="warroom-command-deck__badge">Grade {setupGrade}</div>
          <div className={`warroom-command-deck__signal warroom-command-deck__signal--${direction.toLowerCase()}`}>
            <Zap className="h-4 w-4" />
            <span>{direction === "WAIT" ? "NEUTRAL" : direction}</span>
            <strong>{percent(signal?.unifiedConfidence)}</strong>
          </div>
        </div>
      </div>

      <div className="warroom-command-deck__ticker">
        <span>Lane: FUSION</span>
        <span>Lifecycle: {(fusion?.breakoutLifecycle?.state ?? "syncing").toUpperCase()}</span>
        <span>Volatility: {volatility}</span>
      </div>

      {patternDetectionAlerts.length ? (
        <div
          className="flex flex-wrap items-center gap-3 rounded-md border border-amber-400/45 bg-amber-500/10 px-3 py-2 text-amber-100 shadow-[0_0_18px_rgba(251,191,36,0.12)]"
          role="alert"
          aria-live="assertive"
          data-testid="warroom-pattern-detection-alert"
        >
          <BellRing className="h-4 w-4 shrink-0 text-amber-300" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <strong className="block text-[10px] uppercase tracking-[0.16em]">Pattern detected · {analysis.symbol}</strong>
            <span className="mt-1 block text-xs leading-relaxed">
              {patternDetectionAlerts.map((pattern) =>
                `${patternAlertDisplayNames[pattern.name] ?? pattern.name} · ${pattern.direction.toUpperCase()} · ${Math.round(pattern.confidence)}% · ${pattern.state}`
              ).join("  |  ")}
              {detectedReversalPatterns.length > patternDetectionAlerts.length
                ? `  |  +${detectedReversalPatterns.length - patternDetectionAlerts.length} more`
                : ""}
            </span>
          </div>
          <button
            className="rounded border border-amber-300/35 px-2 py-1 text-[9px] font-bold uppercase tracking-wider hover:bg-amber-300/10"
            onClick={() => setActiveView("patterns")}
            type="button"
          >
            Review
          </button>
          <button
            aria-label="Dismiss new pattern alert"
            className="rounded p-1 text-amber-200/80 hover:bg-amber-300/10 hover:text-amber-100"
            onClick={() => setPatternDetectionAlerts([])}
            type="button"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      ) : null}

      <div className="warroom-engine-health" aria-label="War Room engine health">
        {engineHealth.map((engine) => <div className={`is-${engine.tone}`} key={engine.label}>
          <i />
          <span>{engine.label}<small>{engine.detail}</small></span>
          <strong>{engine.state}</strong>
        </div>)}
      </div>

      <div className="warroom-timeframe-meter" aria-label="Multi-timeframe trend meter">
        <div className="warroom-timeframe-meter__label">
          <span>TF Stack</span>
          <strong>{String(fusion?.mtfConsensus?.trendConsensus ?? "syncing").toUpperCase()}</strong>
        </div>
        <div className="warroom-timeframe-meter__track">
          {timeframeFrames.map((frame) => {
            const trend = frame.trendBias ?? "neutral";
            return <div
              className={`warroom-timeframe-meter__segment is-${trend}`}
              key={frame.timeframe}
              title={`${frame.timeframe}: ${trend}, ${frame.regimeBias ?? "scanning"}, ${Math.round(toPercentScale(frame.volatilityExpansionProb))}% expansion`}
            >
              <i />
              <span>{frame.timeframe}</span>
            </div>;
          })}
          {!timeframeFrames.length ? <div className="warroom-timeframe-meter__loading">Syncing timeframes...</div> : null}
        </div>
        <div className="warroom-timeframe-meter__score">
          <strong>{Math.round(mtfScore)}%</strong>
          <span>{bullishTimeframes} UP · {bearishTimeframes} DOWN</span>
        </div>
      </div>

      <div className="warroom-command-deck__tabs" role="tablist" aria-label="War Room views">
        {([
          ["execution", "Execution"],
          ["position", "Position"],
          ["smart", "Smart Signal"],
          ["cloud", "EMA Cloud"],
          ["evidence", "Evidence"],
          ["flow", "Flow"],
          ["radar", "Radar"],
          ["alerts", "Alerts"],
          ["patterns", "Patterns"],
          ["summary", "Final Read"],
          ["divergence", "Divergence"],
          ["macro", "Macro Yields & Curves"],
          ["review", "Review"],
        ] as const).map(([view, label]) => (
          <button
            className={`${activeView === view ? "is-active" : ""} is-monitor-${tabMonitorTones[view]} ${view === "evidence" ? "is-static-monitor" : ""} ${view === "radar" && radarAlerting ? `is-alerting is-${radarState.toLowerCase()}` : ""} ${view === "alerts" && alertDisplayTracks.length ? `is-alerting ${alertTriggered ? "is-triggered" : "is-arming"}` : ""} ${view === "execution" && goldScannerRows.length ? "is-alerting" : ""}`}
            key={view}
            onClick={() => setActiveView(view)}
            role="tab"
            aria-selected={activeView === view}
            title={`${label}: ${tabMonitorTones[view] === "call" ? "CALL bias" : tabMonitorTones[view] === "put" ? "PUT bias" : tabMonitorTones[view] === "conflict" ? "conflicting signals" : "neutral / insufficient evidence"}`}
            type="button"
          >
            <b className="warroom-command-deck__tab-pulse" aria-hidden="true" />
            <span>{label}</span>
            {view === "radar" && radarAlerting ? <i>{radarState === "TRIGGERED" ? "LIVE" : "ARMING"}</i> : null}
            {view === "alerts" && alertDisplayTracks.length ? <i>{alertDisplayTracks.length}</i> : null}
            {view === "execution" && goldScannerRows.length ? <i>{goldScannerRows.length} GOLD</i> : null}
            {view === "patterns" && activeGradedPatterns.length ? <i>{activeGradedPatterns.length}</i> : null}
            {view === "patterns" && patternDetectionAlerts.length ? <i>NEW {patternDetectionAlerts.length}</i> : null}
            {view === "summary" && activeGradedPatterns.length ? <i>{patternReadGrade}</i> : null}
            {view === "divergence" && divergenceActive ? <i>{divergenceWarning?.severity.toUpperCase()}</i> : null}
          </button>
        ))}
      </div>

      {activeView === "execution" || activeView === "position" ? (
        <div className={`warroom-execution ${activeView === "position" ? "is-position-view" : ""}`}>
          {activeView === "execution" && goldPlayAlert?.length ? <div className="warroom-gold-alert" role="status">
            <span className="warroom-gold-alert__beacon"><Zap className="h-4 w-4" /></span>
            <div>
              <strong>MARKET SCANNER · GOLD SIGNAL DETECTED</strong>
              <p>New high-priority watchlist setups. Confirm the live chart and risk levels; this is not an entry authorization.</p>
              <div className="warroom-gold-alert__tickers">
                {goldPlayAlert.map((row) => <span className="warroom-gold-alert__ticker" key={row.symbol}>
                  <Zap className="h-3 w-3" />{row.symbol}<small>{row.breakoutSignal ?? "HOT"}{row.lastPrice && row.lastPrice > 0 ? ` · $${row.lastPrice.toFixed(2)}` : ""}</small>
                </span>)}
              </div>
            </div>
            <button type="button" aria-label="Dismiss gold scanner alert" onClick={() => setGoldPlayAlert(null)}><X className="h-4 w-4" /></button>
          </div> : null}
          <div className={`warroom-execution__spot-strip ${spotIsLive ? "is-live" : "is-analysis"}`}>
            <span><i />{spotIsLive ? "LIVE SPOT" : "ANALYSIS PRICE"}</span>
            <strong>{analysis.symbol}</strong>
            {goldScannerRows.map((row) => <span className="warroom-execution__gold-badge" key={row.symbol}>
              <Zap className="h-3 w-3" />{row.symbol} GOLD
            </span>)}
            <b>{value(spot)}</b>
            {!spotIsLive ? <small>Quote is not marked live</small> : null}
          </div>
          <div className={`warroom-execution__state is-${executionState.toLowerCase()} trade-${tradeState.toLowerCase()}`}>
            <div className="warroom-execution__radar-pair">
              <div className={`warroom-execution__radar-card is-${primaryExecutionFusion.direction === "CALL" ? "call" : primaryExecutionFusion.direction === "PUT" ? "put" : "neutral"}`}>
                <CompositeGaugePanel
                  title="Execution Confluence"
                  result={primaryExecutionFusion}
                  inputs={primaryExecutionInputs}
                  spot={spot}
                  spotIsLive={spotIsLive}
                />
              </div>
              <div className={`warroom-execution__radar-card is-${contextFusion.direction === "CALL" ? "call" : contextFusion.direction === "PUT" ? "put" : "neutral"}`}>
                <CompositeGaugePanel
                  title="Context Fusion"
                  result={contextFusion}
                  inputs={contextFusionInputs}
                  spot={spot}
                  spotIsLive={spotIsLive}
                  sidecar={
                    <div className="warroom-position-model-readout">
                      <div><span>POSITION MANAGER</span><b>{leadingPlayModel.side} {Math.round(leadingPlayModel.score)}</b></div>
                      <div><span>CALL / PUT SPLIT</span><b>{Math.round(callPlayModel.score)} / {Math.round(putPlayModel.score)}</b></div>
                      <div><span>COVERAGE · GAP</span><b>{Math.round(leadingPlayModel.coverage * 100)}% · {positionScoreGap.toFixed(1)}</b></div>
                      <div><span>FIVE-MINUTE GATE</span><b>{positionGateState}</b></div>
                      <small>PM blend weight 1.15× · cautious, provisional weighting</small>
                    </div>
                  }
                />
              </div>
              <div className={`warroom-execution__radar-card warroom-execution__probability-card is-${executionDisplayDirection.toLowerCase()}`}>
                <DirectionalProbabilityGauge
                  up={liveDirectionalProbabilities.up * 100}
                  chop={liveDirectionalProbabilities.chop * 100}
                  down={liveDirectionalProbabilities.down * 100}
                  direction={executionDisplayDirection}
                  quoteIsLive={spotIsLive}
                  timeframe={timeframe}
                  lastCandleTime={analysis.ohlc?.at(-1)?.time}
                />
                <PriceActionReversalReadout
                  direction={reversalRead.direction}
                  strength={reversalRead.strength}
                  bullishStrength={reversalRead.bullishStrength}
                  bearishStrength={reversalRead.bearishStrength}
                  patternNames={reversalRead.patternNames}
                  scalpExitWarning={scalpExitWarning}
                  volumeRatio={volumeRead.ratio}
                  bodyQuality={candleBodyQuality}
                />
              </div>
              <div className={`warroom-execution__radar-card warroom-execution__unlock-card is-${playUnlockTone}`}>
                <div className="warroom-command-deck__label"><Crosshair className="h-3.5 w-3.5" /> Historical Play Unlock</div>
                <PlayUnlockRadar
                  metrics={playUnlockMetrics}
                  checks={playUnlockChecks}
                  historicalGuardLabel={historicalGuardLabel}
                  state={playUnlockState}
                  direction={executionDisplayDirection}
                  tone={playUnlockTone as "call" | "put" | "neutral"}
                />
                <div className="warroom-structure-map__spot"><span>{playUnlockPassed}/4 ENGINE GATES · {spotIsLive ? "LIVE SPOT" : "ANALYSIS PRICE"}</span><strong>{playUnlockState}</strong><small>ADX 25+ · momentum 35+ · {requiresSpyScoreBand ? "SPY score 72-79" : useCalibrationUnlock ? "48h execution edge" : "compression while 48h sample builds"} · fusion and tape alignment</small></div>
              </div>
            </div>
          </div>
          <div className="warroom-execution__support-grid">
            <div className={`warroom-ignition-module is-${ignitionTone}`}>
              <div className="warroom-ignition-module__heading">
                <span><Zap className="h-3.5 w-3.5" /> OPTION IGNITION</span>
                <strong>{ignitionState}</strong>
              </div>
              <div className="warroom-ignition-module__metrics">
                <div><span>Contract</span><b>{optionPlayLive && monsterPlay ? `${monsterPlay.side?.toUpperCase() ?? "OPTION"} ${monsterPlay.strike?.toFixed(0) ?? "--"}` : "GATE CLOSED"}</b></div>
                <div><span>OTM print odds</span><b>{percent(monsterPlay?.probability ?? monster?.breakout?.hitProbability)}</b></div>
                <div><span>Directional model</span><b>{evidenceDirection === "WAIT" ? `NO EDGE · UP ${upProb}% / DOWN ${downProb}%` : `${evidenceDirection} · ${Math.round(directionalProbability)}%`}</b></div>
                <div><span>Trigger</span><b>{isBreakoutTriggered ? "CONFIRMED" : isCompressionArmed ? "ARMED" : "WAITING"}</b></div>
              </div>
              <div className="warroom-ignition-module__levels">
                <PlanValue label="Target" value={value(monsterPlay?.targetPrice ?? targets[0])} />
                <PlanValue label="Stop" value={value(monsterPlay?.stopPrice ?? signal?.stopLoss)} />
                <PlanValue label="Delta" value={decimalPercent((monsterPlay?.delta ?? 0) * 100)} />
                <PlanValue label="Room" value={monsterPlay?.roomPoints ? `${monsterPlay.roomPoints.toFixed(2)} pts` : "--"} />
              </div>
              <p>{ignitionMessage}</p>
            </div>
            <div className="warroom-execution__support-brief">
              <div className="warroom-execution__live-read"><span>CALL {liveCallPressure}</span><strong>{executionRegimeLabel}</strong><span>PUT {livePutPressure}</span></div>
              <div className="warroom-execution__live-read"><span>CALL {callPushPower}</span><strong>{compressionDirectionalScore}% {executionDisplayDirection === "WAIT" ? "NEUTRAL" : `${executionDisplayDirection} PUSH`}</strong><span>PUT {putPushPower}</span></div>
              <details className="warroom-execution__leaders">
                <summary><Target className="h-3.5 w-3.5" /> Watchlist Execution Leaders <span>{executionLeaders.length} TRACKED</span></summary>
                <div className="warroom-execution__leaders-body">
                  <div className="warroom-execution__leader-grid">
                    {executionLeaders.length ? executionLeaders.map((row) => {
                      const edge = row.edgeEngine!;
                      const directionLabel = edge.direction === "bullish" ? "CALL" : "PUT";
                      const breakoutActive = edge.state === "TRIGGERED" || row.breakoutSignal === "BREAKOUT" || row.breakoutSignal === "BREAKDOWN";
                      return (
                        <button
                          className={`warroom-execution__leader is-${edge.direction} ${breakoutActive ? "is-breakout" : ""} ${expandedLeaderSymbol === row.symbol ? "is-expanded" : ""}`}
                          key={row.symbol}
                          onClick={() => setExpandedLeaderSymbol((current) => current === row.symbol ? null : row.symbol)}
                          type="button"
                          aria-expanded={expandedLeaderSymbol === row.symbol}
                        >
                          <strong>{row.symbol}</strong>
                          <span>{directionLabel} · {edge.state}</span>
                          <b>{Math.round(edge.edgeScore)} edge</b>
                          <small>{Math.round(edge.triggerProbability)}% trigger · {row.spotMeta?.isFresh ? "fresh spot" : "refreshing"}</small>
                          {expandedLeaderSymbol === row.symbol ? (
                            <div className="warroom-execution__leader-detail">
                              <span>{row.breakoutSignal ?? "WAIT"} · {row.timeframeStack?.primary ?? "15m"} stack {Math.round(row.timeframeStack?.agreement ?? 0)}%</span>
                              <span>RSI {Math.round(edge.indicators.rsi)} · ADX {Math.round(edge.indicators.adx)} · volume x{edge.indicators.volumeSpike.toFixed(2)}</span>
                              {row.repeatedSetupPattern ? <span>Repeat {Math.round(row.repeatedSetupPattern.hitRate * 100)}% · {row.repeatedSetupPattern.sampleSize} analogs · {Math.round(row.repeatedSetupPattern.avgSimilarity * 100)}% match · +{row.repeatedSetupPattern.scoreBoost} score</span> : <span>No repeat analogs yet</span>}
                              {row.preBreakoutSetup?.traits?.length ? <span>{row.preBreakoutSetup.traits.slice(0, 2).join(" · ")}</span> : null}
                              {edge.reasons.slice(0, 2).map((reason) => <span key={reason}>{reason}</span>)}
                              {row.optionsReadiness?.hasOptionData ? <span>Options readiness {Math.round(row.optionsReadiness.score ?? 0)}%</span> : <span>Options chain unavailable</span>}
                            </div>
                          ) : null}
                        </button>
                      );
                    }) : <p className="warroom-execution__leaders-empty">Waiting for fresh all-ticker scanner evidence.</p>}
                  </div>
                  <p className="warroom-execution__leaders-note">Ranking is a monitoring priority, not an entry order. Execute only when the selected ticker's full Fusion, price-break, volume, and option gates agree.</p>
                </div>
              </details>
              <div className="warroom-execution__state-copy">
                <div><span>Trade State</span><em>{fusionSyncLabel}</em></div>
                <strong>{tradeState}</strong>
                <small>{executionState} · {action}</small>
              </div>
            </div>
          </div>
          <details className="warroom-execution__diagnostics">
            <summary>EXPAND PRICE-ACTION + LIQUIDITY DIAGNOSTICS</summary>
            <div className="warroom-execution__diagnostics-grid">
            <div className={`warroom-execution__gauge-card warroom-execution__gauge-card--price is-${compressionPushTone}`}>
              <PriceActionGauge
                callPower={callPushPower}
                putPower={putPushPower}
                direction={priceActionDirection}
                liveMovePct={liveMovePct}
                volumeRatio={volumeRead.ratio}
                upSteps={priceActionConfirmation.upSteps}
                downSteps={priceActionConfirmation.downSteps}
                candleVolumePower={candleVolumePower}
                emaHoldConfirmed={confirmedEmaHoldDirection !== "WAIT"}
                scalpExitWarning={scalpExitWarning}
              />
            </div>
            <div className={`warroom-execution__gauge-card warroom-execution__gauge-card--shadow warroom-execution__shadow-wrap is-${liquidityExecution.direction.toLowerCase()}`}>
              <ShadowGauge
                model={liquidityExecution}
                spot={spot}
                executionDirection={executionDisplayDirection}
                playUnlockState={playUnlockState}
                playUnlockPassed={playUnlockPassed}
              />
            </div>
            </div>
          </details>
          <div className="warroom-execution__ops">
            <div className={`warroom-execution__gate warroom-execution__gate--compact ${gateExpanded ? "is-expanded" : ""}`}>
              <button className="warroom-gate-toggle" onClick={() => setGateExpanded((current) => !current)} type="button" aria-expanded={gateExpanded}>
                <ShieldAlert className="h-3.5 w-3.5" />
                <span>{gateBlockers.length ? "Why Wait" : "Execution Gate Clear"}</span>
                <b>{gateBlockers.length} BLOCKED</b>
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              {gateExpanded ? (
                <div className="warroom-gate-checks">
                  {gateChecks.map((check) => <GateCheck key={check.label} {...check} />)}
                </div>
              ) : (
                <div className="warroom-gate-summary">
                  {(gateBlockers.length ? gateBlockers : gateChecks.slice(0, 3)).slice(0, 3).map((check) => (
                    <span key={check.label} className={check.passed ? "is-pass" : "is-blocked"}>{check.label}</span>
                  ))}
                  {gateBlockers.length > 3 ? <span className="is-more">+{gateBlockers.length - 3} more</span> : null}
                </div>
              )}
            </div>
            <div className={`warroom-calibration-guard warroom-calibration-guard--engine is-${calibrationTone}`}>
              <div className="warroom-calibration-engine__core" style={{ ["--calibration-score" as string]: `${clampScore(executionCalibration ?? 0) * 3.6}deg` }}>
                <div><span>48H</span><strong>{percent(executionCalibration)}</strong><small>{calibrationStatus}</small></div>
              </div>
              <div className="warroom-calibration-engine__body">
                <div className="warroom-command-deck__intel-heading">
                  <div className="warroom-command-deck__label"><Brain className="h-3.5 w-3.5" /> 48H Calibration Engine</div>
                  <span>{executionResolved} RESOLVED</span>
                </div>
                <div className="warroom-calibration-guard__metrics">
                  <PlanValue label={`${calibrationDirection} edge`} value={`${percent(calibration?.winRate)} · ${calibration?.completed ?? 0}`} />
                  <PlanValue label="Engine samples" value={`${tuningWindow?.sample?.edgeSampleCount ?? 0}`} />
                  <PlanValue label="Avg trigger" value={percent(tuningWindow?.quality?.avgTriggerProbability)} />
                  <PlanValue label="Conversion" value={`${percent(executionConversion)} · ${executionMissed} missed`} />
                </div>
                <p>{calibrationReady ? "Validated: require fresh break, volume, and option alignment." : executionResolved >= minimumCalibrationSample ? "Caution: keep alerts observational until the 48-hour edge recovers." : `Building a minimum ${minimumCalibrationSample}-outcome sample before execution validation.`}</p>
              </div>
            </div>
          </div>
          {activeScannerPlay ? (
            <div className={`warroom-scanner-play is-${activeScannerPlay.direction}`}>
              <div className="warroom-command-deck__label"><Radar className="h-3.5 w-3.5" /> Scanner Evidence <span>{strictExecutionReady ? "GATE ALIGNED" : "EVIDENCE ONLY"}</span></div>
              <div className="warroom-scanner-play__heading">
                <strong>{activeScannerPlay.direction === "bearish" ? "POTENTIAL PUT" : "POTENTIAL CALL"}</strong>
                <span>{strictExecutionReady && activeScannerPlay.mode === "EXECUTE" ? "GATE ALIGNED" : "DO NOT EXECUTE"}</span>
              </div>
              <p>{activeScannerPlay.warnings.includes("POTENTIAL_PUT_PLAY") ? "Failed upside breakout confirmed on closed candles." : `${activeScannerPlay.signal} scanner setup from ${activeScannerPlay.timeframe}.`} {strictExecutionReady ? "Full execution gate is aligned." : "Scanner output is not an entry authorization."}</p>
              <div className="warroom-scanner-play__levels">
                <PlanValue label="Entry" value={value(activeScannerPlay.priceAtCapture)} />
                <PlanValue label="Stop" value={value(activeScannerPlay.stopLoss)} />
                <PlanValue label="T1" value={value(activeScannerPlay.targets[0])} />
                <PlanValue label="Score" value={`${Math.round(activeScannerPlay.breakoutScore)}`} />
              </div>
            </div>
          ) : null}
          <div className="warroom-position-manager">
            <div className="warroom-position-manager__heading">
              <div>
                <div className="warroom-command-deck__label"><Crosshair className="h-3.5 w-3.5" /> Position Command</div>
                <small>0DTE live risk and momentum control</small>
              </div>
              <span className={`is-${(positionFavoredSide ?? "wait").toLowerCase()}`}><i /> {fusion ? (positionFavoredSide ? `${positionFavoredSide} weighted leader` : "No qualified edge") : "Engines syncing"}</span>
            </div>
            <div className={`warroom-position-manager__health is-${positionEngineStatus.toLowerCase()}`}>
              <div><i /><span>Engine network</span><strong>{positionEngineStatus}</strong></div>
              <div className="warroom-position-manager__health-feeds">
                {positionEngineFeeds.map((feed) => <span className={feed.failed ? "is-failed" : feed.ready ? "is-ready" : "is-loading"} key={feed.label}>{feed.label}<b>{feed.failed ? "OFFLINE" : feed.ready ? "LIVE" : "SYNC"}</b></span>)}
              </div>
            </div>
            <div className={`warroom-position-manager__decision-strip ${positionFavoredSide ? `is-${positionFavoredSide.toLowerCase()}` : "is-guarded"}`}>
              <div><span>Provisional leader</span><strong>{leadingPlayModel.side} {Math.round(leadingPlayModel.score)}</strong></div>
              <div><span>Edge separation</span><strong>{positionScoreGap.toFixed(1)} PTS</strong></div>
              <div><span>Activation gate</span><strong>{positionGateState}</strong></div>
              <div><span>Model coverage</span><strong>{Math.round(leadingPlayModel.coverage * 100)}%</strong></div>
              <div><span>Fusion state</span><strong>{positionFusionFresh ? "FRESH" : "STALE"}</strong></div>
              <div className={positionShadowCandidate ? "is-shadow" : ""}><span>Study read</span><strong>{positionStudyState}</strong></div>
            </div>
            <div className="warroom-position-manager__micro-tape">
              <div className={microIgnition?.studyCandidate ? "is-shadow" : `is-${(microIgnition?.direction ?? "wait").toLowerCase()}`}><span>1M acceleration · shadow</span><strong>{microIgnition?.available ? `${(microIgnition.volumeAcceleration ?? 0).toFixed(2)}x · ${microIgnition.state ?? "QUIET"}` : "NO VOLUME READ"}</strong><small>{microIgnition?.available ? `${(microIgnition.volumeRatio ?? 0).toFixed(2)}x RVOL · ${microIgnition.alignedPressureBars ?? 0}/3 pressure · ${(microIgnition.ageMinutes ?? 0).toFixed(1)}m old` : "Excluded from score"}</small></div>
              <div className={`is-${(fusion?.microBreakout?.structure5m?.call?.state ?? "waiting").toLowerCase().replace(" ", "-")}`}><span>5M call level · closed</span><strong>{fusion?.microBreakout?.structure5m?.call?.state ?? "SYNCING"}</strong><small>{value(fusion?.microBreakout?.structure5m?.call?.level)} · {fusion?.microBreakout?.structure5m?.call?.breakoutAgeMinutes != null ? `${Math.round(fusion.microBreakout.structure5m.call.breakoutAgeMinutes)}m break age` : "no active break"}</small></div>
              <div className={`is-${(fusion?.microBreakout?.structure5m?.put?.state ?? "waiting").toLowerCase().replace(" ", "-")}`}><span>5M put level · closed</span><strong>{fusion?.microBreakout?.structure5m?.put?.state ?? "SYNCING"}</strong><small>{value(fusion?.microBreakout?.structure5m?.put?.level)} · {fusion?.microBreakout?.structure5m?.put?.breakoutAgeMinutes != null ? `${Math.round(fusion.microBreakout.structure5m.put.breakoutAgeMinutes)}m break age` : "no active break"}</small></div>
            </div>
            <div className="warroom-position-manager__choices">
              <button className={`is-call ${positionFavoredSide === "CALL" ? "is-favored" : ""} ${managedPositionSide === "CALL" ? "is-selected" : ""} ${managedPositionSide === "CALL" && managedDivergenceDetected ? "is-divergence" : ""}`} style={{ ["--play-score" as string]: `${callPlayModel.score}%` }} type="button" onClick={() => startManagedPosition("CALL")} disabled={spot <= 0} aria-pressed={managedPositionSide === "CALL"}>
                <span className="warroom-position-manager__choice-icon"><ArrowUpRight /></span>
                <span className="warroom-position-manager__choice-copy"><small>{managedPositionSide === "CALL" ? `LOCKED · T+${managedTimerLabel}` : "I GOT"}</small><strong>CALLS</strong><em>{managedDivergenceDetected && managedPositionSide === "CALL" ? "Divergence · defend now" : positionFavoredSide === "CALL" ? "Weighted leader" : positionShadowCandidate && leadingPlayModel.side === "CALL" ? "15M shadow candidate" : positionFavoredSide === "PUT" ? "Lower weighted edge" : "No qualified edge"}</em></span>
                <span className="warroom-position-manager__choice-score"><small>{positionFavoredSide === "CALL" ? `FAVORED · T+${favoredPlayTimerLabel}` : "PLAY WEIGHT"}</small><b>{Math.round(callPlayModel.score)}</b><em>{Math.round(upProb)}% raw · {callPlayModel.aligned}/{callPlayModel.inputs.length} align</em></span>
                <span className="warroom-position-manager__choice-spectrum" aria-label={`CALL edge map, ${Math.round(callPlayModel.supportShare * 100)} percent weighted support and ${Math.round(callPlayModel.conflictShare * 100)} percent conflict`} title={callPlayModel.inputs.map((input) => `${input.label} ${Math.round(input.score)} (${input.weight.toFixed(2)}x)`).join(" · ")}>
                  <span className="warroom-position-manager__choice-spectrum-head"><b>WEIGHTED EDGE MAP</b><em>{Math.round(callPlayModel.supportShare * 100)}% support · {Math.round(callPlayModel.conflictShare * 100)}% conflict</em></span>
                  <span className="warroom-position-manager__choice-spectrum-track"><i className="is-aligned" style={{ flexGrow: callPlayModel.supportShare }} /><i className="is-mixed" style={{ flexGrow: Math.max(0, 1 - callPlayModel.supportShare - callPlayModel.conflictShare) }} /><i className="is-conflict" style={{ flexGrow: callPlayModel.conflictShare }} /></span>
                </span>
              </button>
              <button className={`is-put ${positionFavoredSide === "PUT" ? "is-favored" : ""} ${managedPositionSide === "PUT" ? "is-selected" : ""} ${managedPositionSide === "PUT" && managedDivergenceDetected ? "is-divergence" : ""}`} style={{ ["--play-score" as string]: `${putPlayModel.score}%` }} type="button" onClick={() => startManagedPosition("PUT")} disabled={spot <= 0} aria-pressed={managedPositionSide === "PUT"}>
                <span className="warroom-position-manager__choice-icon"><ArrowDownRight /></span>
                <span className="warroom-position-manager__choice-copy"><small>{managedPositionSide === "PUT" ? `LOCKED · T+${managedTimerLabel}` : "I GOT"}</small><strong>PUTS</strong><em>{managedDivergenceDetected && managedPositionSide === "PUT" ? "Divergence · defend now" : positionFavoredSide === "PUT" ? "Weighted leader" : positionShadowCandidate && leadingPlayModel.side === "PUT" ? "15M shadow candidate" : positionFavoredSide === "CALL" ? "Lower weighted edge" : "No qualified edge"}</em></span>
                <span className="warroom-position-manager__choice-score"><small>{positionFavoredSide === "PUT" ? `FAVORED · T+${favoredPlayTimerLabel}` : "PLAY WEIGHT"}</small><b>{Math.round(putPlayModel.score)}</b><em>{Math.round(downProb)}% raw · {putPlayModel.aligned}/{putPlayModel.inputs.length} align</em></span>
                <span className="warroom-position-manager__choice-spectrum" aria-label={`PUT edge map, ${Math.round(putPlayModel.supportShare * 100)} percent weighted support and ${Math.round(putPlayModel.conflictShare * 100)} percent conflict`} title={putPlayModel.inputs.map((input) => `${input.label} ${Math.round(input.score)} (${input.weight.toFixed(2)}x)`).join(" · ")}>
                  <span className="warroom-position-manager__choice-spectrum-head"><b>WEIGHTED EDGE MAP</b><em>{Math.round(putPlayModel.supportShare * 100)}% support · {Math.round(putPlayModel.conflictShare * 100)}% conflict</em></span>
                  <span className="warroom-position-manager__choice-spectrum-track"><i className="is-aligned" style={{ flexGrow: putPlayModel.supportShare }} /><i className="is-mixed" style={{ flexGrow: Math.max(0, 1 - putPlayModel.supportShare - putPlayModel.conflictShare) }} /><i className="is-conflict" style={{ flexGrow: putPlayModel.conflictShare }} /></span>
                </span>
              </button>
            </div>
            {hasHeldPosition ? (
              <>
                <div className={`warroom-position-manager__locked is-${managedPositionSide?.toLowerCase()} ${managedDivergenceDetected ? "is-divergence" : ""}`} role="status" aria-live="polite">
                  <span><i /> {managedDivergenceDetected ? "DIVERGENCE DETECTED" : `${managedPositionSide} position locked`}</span>
                  <strong>T+{managedTimerLabel} · Entry {value(managedEntrySpot)} · {managedRiskMode} · {Math.round(managedCoverage * 100)}% coverage</strong>
                </div>
                {managedDivergenceDetected ? <div className="warroom-position-manager__divergence-alert" role="alert"><ShieldAlert className="h-4 w-4" /><strong>DIVERGENCE</strong><span>Move the stop, protect gains, or exit if the confirmed level fails.</span></div> : null}
              </>
            ) : null}
            {!hasHeldPosition ? (
              <div className="warroom-position-manager__standby">
                <Zap className="h-4 w-4" /> Select the position you entered. The engine will lock the live spot, track favorable excursion, and adapt risk as conditions change.
              </div>
            ) : (
              <div className={`warroom-position-manager__active is-${managedPositionSide?.toLowerCase()} is-mode-${managedRiskMode.toLowerCase()} ${managedDivergenceDetected ? "is-divergence" : ""}`}>
                <div className="warroom-position-manager__active-head">
                  <div><span>0DTE adaptive control</span><strong>{managedPositionSide} PLAY // {managedRiskMode}</strong></div>
                  <button type="button" onClick={closeManagedPosition} title="Close tracked play" aria-label="Close tracked play"><RotateCcw className="h-3.5 w-3.5" /></button>
                </div>
                <div className={`warroom-position-manager__breakout-clock is-${managedBreakoutState.toLowerCase().replace(" ", "-")}`}>
                  <div><span>1M acceleration</span><strong>{microIgnition?.available ? `${(microIgnition.volumeAcceleration ?? 0).toFixed(2)}x · ${microIgnition?.direction ?? "WAIT"}` : "SYNCING"}</strong></div>
                  <div><span>5M structure</span><strong>{managedFiveMinuteState}</strong></div>
                  <div><span>{managedBreakoutAgeMinutes == null ? "Breakout level" : "Breakout age"}</span><strong>{managedBreakoutTrigger == null ? "NOT MAPPED" : managedBreakoutAgeMinutes == null ? value(managedBreakoutTrigger) : `${Math.round(managedBreakoutAgeMinutes)} MIN · ${value(managedBreakoutTrigger)}`}</strong></div>
                  <div><span>Position timer</span><strong>T+{managedTimerLabel} · {managedElapsedMinutes < managedMomentumWindowMinutes ? `${managedMinutesRemaining}M LEFT` : "EXPIRED"}</strong></div>
                </div>
                <div className="warroom-position-manager__cockpit">
                  <div className="warroom-position-manager__gauge">
                    <SmartEngineDial
                      probability={managedEngineScore}
                      confidence={managedSideProbability}
                      reliability={executionCalibration ?? fusion?.mtfConsensus?.alignmentScore ?? 0}
                      direction={managedPositionSide ?? "WAIT"}
                      tone={managedPositionSide === "CALL" ? "call" : managedPositionSide === "PUT" ? "put" : "neutral"}
                      levels={structureLevels}
                      spot={spot}
                    />
                    <span>GRADE {managedEngineGrade} · {managedRiskMode}</span>
                  </div>
                  <div className="warroom-position-manager__matrix">
                    <div className="warroom-position-manager__matrix-head">
                      <span>{managedAgreementCount}/{managedSignalInputs.length} engines aligned</span>
                      <strong>{managedConflictCount ? `${managedConflictCount} conflicts` : "CLEAR"}</strong>
                    </div>
                    <div className="warroom-position-manager__signal-grid">
                      {managedSignalInputs.map((input) => (
                        <div className={input.score >= 55 ? "is-aligned" : input.score < 40 ? "is-conflict" : "is-mixed"} key={input.label} title={`${input.label}: ${Math.round(input.score)}`}>
                          <span><i />{input.label}</span><small>{input.weight.toFixed(2)}x</small><strong>{Math.round(input.score)}</strong>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="warroom-position-manager__metrics">
                  <PlanValue label="Entry spot" value={value(managedEntrySpot)} />
                  <PlanValue label="Move peak" value={value(managedPeakSpot)} />
                  <PlanValue label="Adjusted stop" value={value(managedAdjustedStop)} />
                  <PlanValue label="Possible peak" value={value(managedPossiblePeak)} />
                  <PlanValue label="Live R" value={`${managedRMultiple >= 0 ? "+" : ""}${managedRMultiple.toFixed(2)}R`} />
                  <PlanValue label="Peak capture" value={`${Math.round(managedPeakCapture)}%`} />
                </div>
                <p><ShieldAlert className="h-3.5 w-3.5" /> {tradeManagement}</p>
                <small className="warroom-position-manager__footnote">Underlying-price decision support. 0DTE premium, spread, theta, and fills can diverge materially.</small>
              </div>
            )}
          </div>
        </div>
      ) : null}

      {activeView === "execution" ? <><div className="warroom-command-deck__grid">
        <div className="warroom-command-deck__spot">
          <span>{spotIsLive ? "Live Spot" : "Analysis Price"}</span>
          <strong>{value(spot)}</strong>
          <small>{volatility} volatility</small>
        </div>
        <Level label="Breakout Above" value={zones?.upper} tone="up" active={isBreakoutTriggered && breakoutDirection === "CALL"} />
        <Level label="Breakdown Below" value={zones?.lower} tone="down" active={isBreakoutTriggered && breakoutDirection === "PUT"} />
        <Level label="Call Target" value={zones?.upsideTarget1} tone="up" />
        <Level label="Put Target" value={zones?.downsideTarget1} tone="down" />
        <Level label="Retest" value={zones?.retest} tone="neutral" />
        <Level label="Invalidation" value={zones?.invalidation} tone="risk" />
      </div>

      <div className="warroom-command-deck__lower">
        <div className="warroom-command-deck__plan">
          <div className="warroom-command-deck__label"><Crosshair className="h-3.5 w-3.5" /> Fusion Execution Plan</div>
          <div className="warroom-command-deck__plan-values">
            <PlanValue label="Entry" value={signal?.entryZone ? `${value(signal.entryZone.min)} - ${value(signal.entryZone.max)}` : "Await trigger"} />
            <PlanValue label="Stop" value={value(signal?.stopLoss)} />
            <PlanValue label="PT1" value={value(targets[0])} />
            <PlanValue label="PT2" value={value(targets[1])} />
          </div>
          <p>{action}</p>
        </div>
        <div className="warroom-command-deck__telemetry">
          <Telemetry icon={Activity} label="Lifecycle" value={fusion?.breakoutLifecycle?.state ?? "SYNCING"} />
          <Telemetry icon={Target} label="Expected Move" value={value(fusion?.expectedMove?.dollars)} />
          <Telemetry icon={ShieldAlert} label="MTF" value={fusion?.mtfConsensus?.trendConsensus ?? "NEUTRAL"} />
        </div>
      </div></> : null}

      <div className="warroom-command-deck__intel">
        {activeView === "cloud" ? <div className={`warroom-command-deck__intel-card warroom-ema-cloud is-${cloudTone}`}>
          <div className="warroom-command-deck__intel-heading">
            <div className="warroom-command-deck__label"><Waves className="h-3.5 w-3.5" /> EMA Cloud Radar</div>
            <span className={`warroom-ema-cloud__state is-${cloudTone}`}>{cloudState}</span>
          </div>
          <div className="warroom-ema-cloud__radars">
            <div className={`warroom-ema-cloud__radar-panel is-${cloudTone}`}>
              <EmaCloudRadar
                lines={emaLines}
                spot={spot}
                tone={cloudTone}
                state={cloudState}
                strength={Math.max(callStrength, putStrength)}
                fvgZones={activeFvgZones}
                candleCount={analysis.ohlc?.length ?? 0}
              />
              <div className="warroom-ema-cloud__caption">
                <span>Cloud Structure</span>
                <strong>{cloudState}</strong>
                <small>{cloudPhase} · {cloudStructureState} · {bullishSlopeCount} rising / {bearishSlopeCount} falling · {fastCloudSpread >= 0 ? "+" : ""}{fastCloudSpread.toFixed(3)}% spread ({cloudSpreadChange >= 0 ? "+" : ""}{cloudSpreadChange.toFixed(3)} pts)</small>
              </div>
            </div>
            <div className={`warroom-ema-cloud__radar-panel warroom-ema-cloud__decision is-${cloudTone}`}>
              <div className="warroom-ema-cloud__decision-kicker"><Radar className="h-3.5 w-3.5" /> Directional Decision Core</div>
              <SmartEngineDial
                probability={cloudDecisionStrength}
                confidence={cloudDecisionConfidence}
                reliability={cloudReliability}
                direction={cloudDirection}
                tone={cloudTone}
                spot={spot}
              />
              <div className="warroom-ema-cloud__caption">
                <span>Options Bias</span>
                <strong>{cloudDirection}</strong>
                <small>{cloudTapeOverride
                  ? `TAPE OVERRIDE · EMA model ${modelCloudDirection}`
                  : cloudReliability < 55
                    ? `Building EMA history · ${emaHistoryBars}/200 bars`
                    : cloudDirection === "WAIT" ? "Cloud inputs are too balanced" : `${Math.max(callStrength, putStrength)}% directional strength`}</small>
              </div>
            </div>
            <div className={`warroom-ema-cloud__radar-panel warroom-ema-cloud__fvg-panel is-${bullishFvgStrength > bearishFvgStrength ? "call" : bearishFvgStrength > bullishFvgStrength ? "put" : "neutral"}`}>
              <div className="warroom-ema-cloud__decision-kicker"><Crosshair className="h-3.5 w-3.5" /> Imbalance Field Radar</div>
              <FvgPressureRadar
                bullishZone={nearestBullishFvg}
                bearishZone={nearestBearishFvg}
                bullishStrength={bullishFvgStrength}
                bearishStrength={bearishFvgStrength}
                spot={spot}
                ema21={ema21.latest}
              />
              <div className="warroom-ema-cloud__caption">
                <span>Active FVGs</span>
                <strong>{activeFvgZones.length}</strong>
                <small>{activeFvgZones.filter((zone) => zone.direction === "bullish").length} bullish · {activeFvgZones.filter((zone) => zone.direction === "bearish").length} bearish · {nearestBullishFvg ? `B ${value(nearestBullishFvg.low)}-${value(nearestBullishFvg.high)}` : "B --"} · {nearestBearishFvg ? `S ${value(nearestBearishFvg.low)}-${value(nearestBearishFvg.high)}` : "S --"}</small>
              </div>
            </div>
          </div>
          <div className="warroom-smart-signal__sides">
            <Prob label="CALL STRENGTH" value={callStrength} tone="up" />
            <Prob label="CLOUD ALIGNMENT" value={cloudAlignment} tone="neutral" />
            <Prob label="PUT STRENGTH" value={putStrength} tone="down" />
          </div>
          <div className="warroom-ema-cloud__averages">
            {emaLines.map((line) => <div key={line.period} className={`is-${line.slope > 0 ? "up" : line.slope < 0 ? "down" : "flat"}`}>
              <span>EMA {line.period}</span>
              <strong>{value(line.latest)}</strong>
              <small>{line.slope >= 0 ? "+" : ""}{line.slope.toFixed(2)}% slope</small>
            </div>)}
          </div>
          <div className="warroom-smart-signal__details">
            <PlanValue label="RSI" value={tacticalIndicators?.rsi.value != null ? tacticalIndicators.rsi.value.toFixed(1) : "--"} />
            <PlanValue label="MACD" value={tacticalIndicators?.macd.trend?.toUpperCase() ?? "--"} />
            <PlanValue label="ADX" value={tacticalIndicators?.adx.value != null ? `${tacticalIndicators.adx.value.toFixed(1)} ${tacticalIndicators.adx.trendStrength}` : "--"} />
            <PlanValue label="Price / VWAP" value={latestVwap != null ? `${spot >= latestVwap ? "ABOVE" : "BELOW"} ${value(latestVwap)}` : "--"} />
            <PlanValue label="Volume" value={`${volumeRead.ratio.toFixed(2)}x average`} />
            <PlanValue label="Momentum" value={tacticalIndicators?.momentum?.trend?.toUpperCase() ?? analysis.directionalBias.toUpperCase()} />
            <PlanValue label="Price Action" value={`${priceActionConfirmation.direction.toUpperCase()} · ${priceActionConfirmation.upSteps}U/${priceActionConfirmation.downSteps}D`} />
            <PlanValue label="TF Alignment" value={`${Math.round(mtfScore)}% · ${bullishTimeframes}U/${bearishTimeframes}D`} />
            <PlanValue label="Fusion Odds" value={`${Math.round(upProb)}C / ${Math.round(downProb)}P`} />
          </div>
          <div className="warroom-smart-signal__reasons">
            <p>{cloudState === "BEARISH ROLLOVER"
              ? "Price action has rolled bearish while the lagging EMA stack remains bullish. Treat the old bull structure as weakening, not as an active bullish rotation."
              : cloudState === "BULLISH REVERSAL"
                ? "Price action has turned bullish while the lagging EMA stack remains bearish. Treat the old bear structure as weakening until the fast averages cross."
                : cloudBullish ? "All four averages are ordered bullish from EMA 9 through EMA 200." : cloudBearish ? "All four averages are ordered bearish from EMA 9 through EMA 200." : "The averages are mixed; wait for the fast cloud to separate and slopes to align."}</p>
            <p>{cloudTapeOverride
              ? `${currentTapeDirection} tape overrides the lagging ${modelCloudDirection} EMA model until price action realigns.`
              : cloudDirection === "WAIT"
                ? "CALL and PUT evidence is within 10 points, so the radar remains neutral."
                : `${cloudDirection} leads after combining cloud structure, momentum, VWAP, volume, multi-timeframe trend, and fusion probabilities.`}</p>
          </div>
        </div> : null}
        {activeView === "smart" ? <div className={`warroom-command-deck__intel-card warroom-smart-signal is-${smartTone}`}>
          <div className="warroom-command-deck__intel-heading">
            <div className="warroom-command-deck__label"><Brain className="h-3.5 w-3.5" /> Historical Smart Signal</div>
            <span className={`warroom-smart-signal__status is-${String(smartSignal?.status ?? "cold_start").toLowerCase()}`}>{smartSignal?.status?.replace("_", " ") ?? "SYNCING"}</span>
          </div>
          <div className="warroom-smart-signal__hero">
            <SmartEngineDial
              probability={smartSignal?.probability ?? 0}
              confidence={smartSignal?.confidence ?? 0}
              reliability={smartSignal?.reliability ?? 0}
              direction={smartSignal?.direction ?? "WAIT"}
              tone={smartTone}
              levels={structureLevels}
              spot={spot}
            />
            <div className="warroom-smart-signal__callout">
              <span>Predicted Move</span>
              <strong>{smartSignal?.direction ?? "WAIT"} {smartMove}</strong>
              <small>{smartSignal?.agreement ? "Live fusion and historical model agree" : "Historical model is not aligned with the live fusion direction"}</small>
            </div>
            <div className="warroom-smart-signal__sample">
              <span>Comparable Outcomes</span>
              <strong>{smartSignal?.sampleSize ?? 0}</strong>
              <small>{smartSignal?.historicalWinRate == null ? "Building resolved sample" : `${percent(smartSignal.historicalWinRate)} weighted win rate`}</small>
            </div>
          </div>
          <div className="warroom-smart-signal__sides">
            <Prob label="CALL MODEL" value={smartSignal?.sides.call.probability ?? upProb} tone="up" />
            <Prob label="HISTORY RELIABILITY" value={smartSignal?.reliability ?? 0} tone="neutral" />
            <Prob label="PUT MODEL" value={smartSignal?.sides.put.probability ?? downProb} tone="down" />
          </div>
          <div className="warroom-smart-signal__details">
            <PlanValue label="Live Up / Down" value={`${Math.round(upProb)}% / ${Math.round(downProb)}%`} />
            <PlanValue label="CALL History" value={`${percent(smartSignal?.sides.call.historicalWinRate ?? undefined)} · ${smartSignal?.sides.call.sampleSize ?? 0}`} />
            <PlanValue label="PUT History" value={`${percent(smartSignal?.sides.put.historicalWinRate ?? undefined)} · ${smartSignal?.sides.put.sampleSize ?? 0}`} />
            <PlanValue label="Model Confidence" value={percent(smartSignal?.confidence)} />
          </div>
          <div className="warroom-smart-signal__reasons">
            {(smartSignal?.reasons ?? ["Waiting for fusion and resolved historical outcomes."]).map((reason) => <p key={reason}>{reason}</p>)}
          </div>
        </div> : null}
        {activeView === "evidence" ? <div className={`warroom-command-deck__intel-card warroom-command-deck__evidence-card is-${evidenceTone} ${isBreakoutTriggered ? "is-breakout-hit" : ""}`}>
          <div className="warroom-command-deck__intel-heading">
            <div className="warroom-command-deck__label"><Target className="h-3.5 w-3.5" /> Evidence Playbook</div>
            <span className="warroom-command-deck__evidence-window">{evidence?.lookback?.days ?? 14}D STUDY</span>
          </div>
          {topEvidenceRule ? (
            <>
              <div className="warroom-conviction">
                <ConvictionDial value={conviction} label={convictionLabel} tone={evidenceTone} />
                <div className="warroom-conviction__copy">
                  <span>Live Conviction</span>
                  <strong>{confirmedScannerPut ? "Failed breakout favors PUT confirmation" : chopDominant ? "Chop dominant: wait for a clean break" : optionPlayLive ? "Gate + evidence aligned" : "Evidence is not an entry"}</strong>
                  <small>{confirmedScannerPut ? "Closed-candle reversal is a candidate, not an automatic option entry." : "Alignment score, not a forecast. The option gate remains strict until a play is live."}</small>
                </div>
              </div>
              <div className="warroom-command-deck__evidence-score">
                <strong>{percent(topEvidenceRule.winRate)}</strong>
                <span>{topEvidenceRule.wins ?? 0} wins / {topEvidenceRule.support ?? 0} resolved</span>
                <small>{(topEvidenceRule.lift ?? 0).toFixed(2)}x baseline lift</small>
              </div>
              <p className="warroom-command-deck__evidence-rule">{formatEvidenceRule(topEvidenceRule.rule)}</p>
              <div className="warroom-command-deck__evidence-baseline">Baseline: {percent(evidence?.baseline?.winRate)} across {evidence?.baseline?.total ?? 0} pre-compression outcomes.</div>
              <div className="warroom-evidence-rules" aria-label="Ranked evidence rules">
                {(evidence?.topRules ?? []).slice(0, 4).map((rule, index) => (
                  <div className="warroom-evidence-rules__row" key={`${rule.rule}-${index}`}>
                    <span>0{index + 1}</span>
                    <strong>{formatEvidenceRule(rule.rule)}</strong>
                    <em>{percent(rule.winRate)} / {rule.support ?? 0}</em>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="warroom-command-deck__evidence-rule">No recurrence report is available yet. Continue logging resolved setups before changing gates.</p>}
          {isBreakoutTriggered && breakoutDirection ? (
            <div className={`warroom-breakout-manager is-${breakoutDirection.toLowerCase()}`}>
              <div className="warroom-breakout-manager__hit"><Zap className="h-3.5 w-3.5" /><span>{breakoutDirection} BREAKOUT HIT</span><strong>{value(breakoutTrigger)}</strong></div>
              <div className="warroom-breakout-manager__levels">
                <PlanValue label="Live" value={value(spot)} />
                <PlanValue label="Stop" value={value(breakoutStop)} />
                <PlanValue label="PT1" value={value(breakoutTargetOne)} />
                <PlanValue label="PT2" value={value(breakoutTargetTwo)} />
              </div>
              <p className="warroom-breakout-manager__status">{hasHeldPosition ? `${managedPositionSide} play: ${tradeManagement}` : "Open the Position Manager and select I got CALLS or I got PUTS to track the move."}</p>
            </div>
          ) : null}
        </div> : null}
        {activeView === "patterns" ? <div className="warroom-command-deck__intel-card warroom-command-deck__patterns-card">
          <div className="warroom-command-deck__intel-heading">
            <div className="warroom-command-deck__label"><Waves className="h-3.5 w-3.5" /> Live Chart Patterns + Final Grades</div>
            <span className="warroom-command-deck__patterns-window">{activeGradedPatterns.length} ACTIVE · {timeframe} MAP</span>
          </div>
          <WarRoomCandleChart candles={analysis.ohlc ?? []} spot={spot} upper={zones?.upper} lower={zones?.lower} />
          {gradedPatterns.length ? (
            <div className="warroom-pattern-grid">
              {gradedPatterns.map(({ pattern, score, grade, alignment }, index) => {
                const type = pattern.direction;
                return <div className={`warroom-pattern-card is-${type} is-${pattern.state}`} key={`${pattern.name}-${pattern.startIndex}-${index}`}>
                  <div><span>{pattern.category} · {pattern.state} · {alignment}</span><strong>{pattern.name}</strong></div>
                  <div className={`warroom-pattern-card__grade grade-${grade.replace("+", "plus").toLowerCase()}`}><b>{grade}</b><small>{score}/100</small></div>
                  <PatternCardVisual candles={analysis.ohlc ?? []} pattern={pattern} score={score} grade={grade} />
                  <p>{pattern.description || "Live structure detected. Use the trigger level and confirmation gate before entry."}</p>
                  <div className="warroom-pattern-card__scorebar"><i style={{ width: `${score}%` }} /><span>CONF {Math.round(pattern.confidence)} · GEO {Math.round(pattern.quality * 100)}</span></div>
                  <div className="warroom-pattern-card__levels">
                    <PlanValue label="Break" value={value(pattern.breakoutLevel)} />
                    <PlanValue label="Target" value={value(pattern.priceTarget)} />
                    <PlanValue label="Stop" value={value(pattern.stopLoss)} />
                  </div>
                  <div className="warroom-pattern-card__trade-plan">
                    <span>TRADE PLAN</span>
                    {pattern.howToTrade.slice(0, 3).map((step, stepIndex) => <div key={`${pattern.name}-plan-${stepIndex}`}><b>{stepIndex + 1}</b><strong>{step}</strong></div>)}
                  </div>
                </div>;
              })}
            </div>
          ) : <div className="warroom-patterns-empty">No live chart pattern has cleared the current confidence threshold. The structure map remains active while the pattern engine rebuilds.</div>}
        </div> : null}
        {activeView === "summary" ? <div className={`warroom-command-deck__intel-card warroom-final-read is-${patternReadDirection.toLowerCase()}`}>
          <div className="warroom-command-deck__intel-heading">
            <div className="warroom-command-deck__label"><Brain className="h-3.5 w-3.5" /> Pattern Intelligence Final Read</div>
            <span className="warroom-command-deck__patterns-window">SYSTEM SYNTHESIS</span>
          </div>
          <div className="warroom-final-read__hero">
            <div className="warroom-final-read__grade"><span>FINAL GRADE</span><strong>{patternReadGrade}</strong><small>{patternReadScore}/100</small></div>
            <div className="warroom-final-read__verdict">
              <span>STRUCTURAL CONSENSUS</span>
              <strong>{patternReadDirection === "CALL" ? "BULLISH STRUCTURE" : patternReadDirection === "PUT" ? "BEARISH STRUCTURE" : "MIXED / WAIT"}</strong>
              <p>{activeGradedPatterns.length
                ? `${activeGradedPatterns.length} active formations analyzed against the ${analysis.directionalBias} overall read. ${activeGradedPatterns.filter((item) => item.alignment === "aligned").length} align and ${activeGradedPatterns.filter((item) => item.alignment === "conflict").length} conflict.`
                : "No active formation has enough evidence for a directional structural read."}</p>
            </div>
            <div className="warroom-final-read__balance" aria-label="Bullish versus bearish pattern score">
              <div><span>CALL</span><strong>{Math.round(bullishPatternRead)}</strong></div>
              <div className="warroom-final-read__balance-track"><i style={{ width: `${patternReadTotal ? bullishPatternRead / patternReadTotal * 100 : 50}%` }} /></div>
              <div><span>PUT</span><strong>{Math.round(bearishPatternRead)}</strong></div>
            </div>
          </div>
          <div className="warroom-final-read__leaders">
            {activeGradedPatterns.slice(0, 5).map(({ pattern, score, grade, alignment }) => <div className={`is-${pattern.direction}`} key={`${pattern.name}-${pattern.startIndex}`}>
              <span>{pattern.state} · {alignment}</span><strong>{pattern.name}</strong><b>{grade} · {score}</b>
            </div>)}
          </div>
          <div className="warroom-final-read__directive">
            <ShieldAlert className="h-4 w-4" />
            <div><span>OPERATING DIRECTIVE</span><strong>{patternReadDirection === "WAIT" ? "Stand by for a confirmed break; pattern evidence is balanced." : `Favor ${patternReadDirection} only after the live trigger confirms; invalidate at the displayed structure level.`}</strong></div>
          </div>
        </div> : null}
        {activeView === "divergence" ? <div className={`warroom-command-deck__intel-card warroom-divergence-system is-${divergenceWarning?.severity ?? "clear"}`}>
          <div className="warroom-command-deck__intel-heading">
            <div className="warroom-command-deck__label"><ShieldAlert className="h-3.5 w-3.5" /> Divergence Protection System</div>
            <span className={`warroom-divergence-system__state is-${divergenceActive ? divergenceWarning?.severity : "clear"}`}>{divergenceActive ? `${divergenceWarning?.severity} ALERT` : "CLEAR"}</span>
          </div>
          <div className="warroom-divergence-system__radar">
            <div className="warroom-divergence-system__scope"><i /><i /><i /><b>{divergenceActive ? "!" : "OK"}</b></div>
            <div className="warroom-divergence-system__message">
              <span>{divergenceActive ? divergenceWarning?.type.replaceAll("_", " ") : "NO ACTIVE DIVERGENCE"}</span>
              <strong>{divergenceActive ? divergenceWarning?.description : "Price, volume, momentum, and exhaustion checks are not reporting a protection event."}</strong>
              <p>{divergenceActive ? divergenceWarning?.protection : "The monitor remains armed and will surface here as soon as the server raises a warning."}</p>
            </div>
          </div>
          <div className="warroom-divergence-system__actions">
            <div className={divergenceWarning?.reduceSize ? "is-active" : ""}><span>POSITION SIZE</span><strong>{divergenceWarning?.reduceSize ? "REDUCE" : "NORMAL"}</strong></div>
            <div className={divergenceWarning?.tightenStops ? "is-active" : ""}><span>STOP CONTROL</span><strong>{divergenceWarning?.tightenStops ? "TIGHTEN" : "STANDARD"}</strong></div>
            <div className={divergenceActive ? "is-active" : ""}><span>SEVERITY</span><strong>{divergenceWarning?.severity.toUpperCase() ?? "NONE"}</strong></div>
          </div>
        </div> : null}
        {activeView === "macro" ? <div className="warroom-command-deck__intel-card warroom-command-deck__macro-card">
          <MacroYieldsTab timeframe={timeframe} />
        </div> : null}
        {activeView === "flow" ? <div className={`warroom-command-deck__intel-card warroom-command-deck__intent-card warroom-flow-card is-${flowTone}`}>
          <div className="warroom-command-deck__intel-heading">
            <div className="warroom-command-deck__label"><Brain className="h-3.5 w-3.5" /> Institutional Intent</div>
            <span className={`warroom-command-deck__intent-status is-${flowEngineState.toLowerCase().replace(" ", "-")}`}>{flowEngineState}</span>
          </div>
          <div className={`warroom-flow__command is-${flowTone}`}>
            <div className="warroom-flow__direction"><span>FLOW CONSENSUS</span><strong>{flowTone === "call" ? "CALL FLOW" : flowTone === "put" ? "PUT FLOW" : flowTone === "conflict" ? "CROSS-CURRENT" : "NO DIRECTION"}</strong><small>{flowCallVotes} bullish nodes · {flowPutVotes} bearish nodes</small></div>
            <div className="warroom-flow__nodes" aria-label="Institutional flow node agreement"><i className={intentDirection === "ACCUMULATE" ? "is-call" : intentDirection === "DISTRIBUTE" ? "is-put" : ""} /><i className={coreDirection === "BULL" ? "is-call" : coreDirection === "BEAR" ? "is-put" : ""} /><i className={orderBlockDirection === "BULLISH" ? "is-call" : orderBlockDirection === "BEARISH" ? "is-put" : ""} /><i className={/BULL|UP|CALL|LONG/.test(liquidityDirection) ? "is-call" : /BEAR|DOWN|PUT|SHORT/.test(liquidityDirection) ? "is-put" : ""} /></div>
            <div className="warroom-flow__health"><span>{intentStatus}</span><strong>{flowFeedAgeSeconds == null ? "--" : `${flowFeedAgeSeconds}s`}</strong><small>FUSION AGE</small></div>
          </div>
          <div className="warroom-command-deck__intent-main">
            <div>
              <span>Flow Thesis</span>
              <strong>{intentDirection}</strong>
            </div>
            <div>
              <span>Confidence</span>
              <strong>{percent(intent?.confidence)}</strong>
            </div>
            <div>
              <span>Core Bias</span>
              <strong>{coreDirection}</strong>
            </div>
          </div>
          <p className="warroom-command-deck__thesis">{intentReason}</p>
          <div className="warroom-command-deck__signal-rail">
            <SignalChip label="DNA" value={percent(marketDNA?.reliability)} active={Boolean(marketDNA?.active)} />
            <SignalChip label="Sweep" value={percent(liquidity?.confidence)} active={Boolean(liquidity?.active)} />
            <SignalChip label="OB" value={percent(orderBlock?.score)} active={orderBlockDirection !== "NEUTRAL"} />
          </div>
        </div> : null}
        {activeView === "flow" ? <div className={`warroom-command-deck__intel-card warroom-command-deck__structure-card warroom-flow-card is-${flowTone}`}>
          <div className="warroom-command-deck__intel-heading">
            <div className="warroom-command-deck__label"><Waves className="h-3.5 w-3.5" /> Structure Map</div>
            <span className={`warroom-command-deck__structure-bias is-${orderBlockDirection.toLowerCase()}`}>{orderBlockDirection} BLOCK</span>
          </div>
          <div className="warroom-structure-map" aria-label="Live price structure ladder">
            <div className="warroom-structure-map__bound is-high"><span>MAP HIGH</span><strong>{value(structureCeiling)}</strong></div>
            {structureLevelLayout.length ? structureLevelLayout.map(({ level, position }) => (
              <StructureLevelRow
                key={`${level.label}-${level.price}`}
                level={level}
                spot={spot}
                position={position}
                isNearest={level === nextUpsideLevel || level === nextDownsideLevel}
              />
            )) : <div className="warroom-structure-map__empty">Synchronizing live structural levels...</div>}
            <div className="warroom-structure-map__spot-line" style={{ top: `${structurePlotPosition(spot)}%` }}>
              <span>LIVE SPOT</span><i /> <strong>{value(spot)}</strong>
            </div>
            <div className="warroom-structure-map__bound is-low"><span>MAP LOW</span><strong>{value(structureFloor)}</strong></div>
          </div>
          <div className="warroom-structure-map__next"><span>NEXT STRUCTURE TEST</span><strong>{nextStructureTest}</strong></div>
          <div className="warroom-prob-scale">
            <Prob label="UP" value={upProb} tone="up" />
            <Prob label="CHOP" value={chopProb} tone="neutral" />
            <Prob label="DOWN" value={downProb} tone="down" />
          </div>
        </div> : null}
        {activeView === "review" ? <div className="warroom-command-deck__intel-card warroom-command-deck__memory-card">
          <div className="warroom-command-deck__intel-heading">
            <div className="warroom-command-deck__label"><Activity className="h-3.5 w-3.5" /> Breakout Memory</div>
            <span className="warroom-command-deck__memory-window">{breakoutSummary?.lookbackHours ?? 48}H LOG</span>
          </div>
          <div className="warroom-command-deck__memory-score">
            <span>Resolved Edge</span>
            <strong>{percent(breakoutSummary?.sample?.winRate)}</strong>
            <small>{breakoutSummary?.sample?.wins ?? 0}W / {breakoutSummary?.sample?.losses ?? 0}L from {breakoutSummary?.sample?.completed ?? 0} resolved</small>
          </div>
          <div className="warroom-command-deck__memory-grid">
            <PlanValue label="Execute" value={`${percent(executeHistory?.winRate)} · ${executeHistory?.completed ?? 0} resolved`} />
            <PlanValue label="Prepare" value={`${percent(prepareHistory?.winRate)} · ${prepareHistory?.promoted ?? 0} promoted`} />
            <PlanValue label="Lead ≤10m" value={`${percent(breakoutSummary?.lead10m?.winRate)} · ${breakoutSummary?.lead10m?.completed ?? 0} resolved`} />
            <PlanValue label="Best Pattern" value={leadProfile?.label ?? "Building sample"} />
          </div>
          <div className="warroom-command-deck__memory-note">
            <span>Calibration status</span>
            <strong>{calibrationStatus}</strong>
            <small>Model confidence is monitored against resolved execution outcomes; repeated and stale signals stay confirmation-only.</small>
          </div>
        </div> : null}
        {activeView === "review" ? <div className="warroom-command-deck__intel-card warroom-gauge-review">
          <div className="warroom-command-deck__intel-heading">
            <div className="warroom-command-deck__label"><Brain className="h-3.5 w-3.5" /> War Room Gauge Calibration</div>
            <span className="warroom-command-deck__memory-window">{analysis.symbol} · {executionTimeframe} · {warRoomCalibration?.horizonMinutes ?? 15}M · {warRoomCalibration?.lookbackHours ?? 168}H · {warRoomCalibration?.modelVersion ?? "SYNCING"}</span>
          </div>
          <p className="warroom-gauge-review__empty">Directional close-to-close accuracy, not options P&amp;L. Captures preserve the gauge values and inputs; stale feeds are excluded from accuracy, and flat/WAIT outcomes remain separate.</p>
          {warRoomCalibrationError ? <p className="warroom-gauge-review__empty">Calibration records are unavailable. Check the black-box endpoint and server logs.</p> : null}
          {!warRoomCalibrationError && !(warRoomCalibration?.gauges?.length) ? (
            <p className="warroom-gauge-review__empty">Waiting for fresh War Room captures and their 15-minute outcomes. Captures are logged once per symbol, timeframe, and candle.</p>
          ) : null}
          {(warRoomCalibration?.gauges ?? []).length ? (
            <div className="warroom-gauge-review__table">
              <div className="warroom-gauge-review__row is-heading"><span>Gauge / score band</span><span>Win rate</span><span>Fresh W/L · Flat · Wait</span></div>
              {warRoomCalibration!.gauges!.map((gauge) => (
                <div className="warroom-gauge-review__gauge" key={gauge.name}>
                  <div className="warroom-gauge-review__row">
                    <strong>{gauge.name.replaceAll("_", " ")}</strong>
                    <b>{gauge.winRate == null ? "--" : `${gauge.winRate}%`}</b>
                    <small>{gauge.wins}/{gauge.losses} · {gauge.flats} · {gauge.neutrals} · {gauge.stale} stale</small>
                  </div>
                  <div className="warroom-gauge-review__bins">
                    {gauge.bins.map((bin) => (
                      <span key={bin.label}>{bin.label}: <b>{bin.winRate == null ? "--" : `${bin.winRate}%`}</b> ({bin.total})</span>
                    ))}
                  </div>
                  {gauge.regimes.length ? <div className="warroom-gauge-review__bins">
                    {gauge.regimes.map((regime) => (
                      <span key={regime.name}>{regime.name}: <b>{regime.winRate == null ? "--" : `${regime.winRate}%`}</b> ({regime.decisive} W/L)</span>
                    ))}
                  </div> : null}
                  <small className="warroom-gauge-review__sample">{gauge.fresh} fresh of {gauge.total} outcomes · {gauge.decisive} decisive</small>
                </div>
              ))}
            </div>
          ) : null}
          <div className="warroom-gauge-review__captures">
            <strong>Captured gauge snapshots</strong>
            {(warRoomCalibration?.recentSnapshots ?? []).length ? warRoomCalibration!.recentSnapshots!.slice(0, 6).map((snapshot) => (
              <div className="warroom-gauge-review__capture" key={snapshot.snapshotId}>
                <div>
                  <b>{snapshot.symbol} · {snapshot.timeframe}</b>
                  <span>{snapshot.marketRegime} · {new Date(snapshot.capturedAtMs).toLocaleString()} · {snapshot.feedFresh ? `FRESH${snapshot.feedAgeMs == null ? "" : ` · ${Math.round(snapshot.feedAgeMs / 1000)}s`}` : "STALE / INCOMPLETE"}</span>
                </div>
                {snapshot.gauges.map((gauge) => {
                  const outcome = snapshot.outcomes.find((row) => row.gauge === gauge.name);
                  return <span key={gauge.name}>
                    {gauge.name.replaceAll("_", " ")} {Math.round(gauge.score)} · {gauge.direction} · {outcome ? `${outcome.result.toUpperCase()} ${outcome.movePct > 0 ? "+" : ""}${outcome.movePct}%` : "15M PENDING"}
                  </span>;
                })}
                <small className="warroom-gauge-review__features">
                  {Object.entries(snapshot.features).map(([name, feature]) =>
                    `${name.replaceAll(/([A-Z])/g, " $1").toLowerCase()} ${typeof feature === "number" ? feature.toFixed(1) : feature == null ? "--" : feature ? "ON" : "OFF"}`,
                  ).join(" · ")}
                </small>
              </div>
            )) : <p className="warroom-gauge-review__empty">No recorded gauge snapshots in this lookback window.</p>}
          </div>
        </div> : null}
        {activeView === "flow" ? <div className={`warroom-command-deck__intel-card warroom-command-deck__volume-card warroom-flow-card is-${flowTone}`}>
          <div className="warroom-command-deck__intel-heading">
            <div className="warroom-command-deck__label"><Activity className="h-3.5 w-3.5" /> Volume Confirmation</div>
            <span className={`warroom-command-deck__volume-state ${volumeRead.ratio >= 1.3 ? "is-confirmed" : ""}`}>{volumeRead.ratio >= 1.3 ? "CONFIRMED" : "NEUTRAL"}</span>
          </div>
          <VolumePulse bars={volumeRead.bars} average={volumeRead.average} ratio={volumeRead.ratio} />
          <div className="warroom-command-deck__volume-grid">
            <PlanValue label="Last / 20 Bar" value={`${volumeRead.ratio.toFixed(2)}x`} />
            <PlanValue label="Last / Baseline" value={volumeRead.latest ? `${Math.round(volumeRead.latest / 1000)}K / ${Math.round(volumeRead.average / 1000)}K` : "--"} />
                <PlanValue label="Compression" value={isCompressionArmed ? "ARMED" : expansionReleaseReady ? "RELEASED" : compression?.bbSqueezeActive ? "SQUEEZE" : "OFF"} />
            <PlanValue label="Historical Edge" value={`${percent(calibration?.winRate)} · ${calibration?.completed ?? 0}`} />
          </div>
          <p className="warroom-command-deck__volume-note">Compare volume expansion with the directional probability and resolved alert history before changing thresholds.</p>
        </div> : null}
        {activeView === "radar" ? <div className="warroom-command-deck__intel-card warroom-command-deck__scalp-card">
          <div className="warroom-command-deck__intel-heading">
            <div className="warroom-command-deck__label"><Radar className="h-3.5 w-3.5" /> 3M Sweep / 5M EMA Crossover</div>
            <span className={`warroom-command-deck__radar-state is-${scalpDataDelayed ? "standby" : radarState.toLowerCase()}`}>{scalpScan?.isScanning ? "SCANNING" : scalpScan?.inactiveReason === "outside_regular_session" ? "MARKET CLOSED" : scalpDataDelayed ? "DATA DELAY" : radarState}</span>
          </div>

          <div className="warroom-smart-signal__hero" style={{ marginTop: "0.65rem" }}>
            <SmartEngineDial
              probability={radarAverageScore}
              confidence={Math.min(100, radarAverageScore + 10)}
              reliability={Math.min(100, scalpCandidates.length ? (scalpCandidates.length / Math.max(radarTracks.length, 1)) * 100 : radarAverageScore)}
              direction={radarDirection as SmartSignal["direction"]}
              tone={radarTone as "call" | "put" | "neutral"}
            />
            <div className="warroom-smart-signal__callout">
              <span>Radar Sweep</span>
              <strong>{radarLeadTrack?.emaCrossCount
                ? `5M ${radarLeadTrack.emaCrossDirection?.toUpperCase()} CROSSOVER`
                : scalpScan?.inactiveReason === "outside_regular_session" ? "REGULAR SESSION REQUIRED" : scalpDataDelayed ? "CANDLE FEED DELAYED" : radarState === "STANDBY" ? "WAITING" : radarState === "ARMING" ? "WATCHLIST ACTIVE" : "BREAKOUT LIVE"}</strong>
              <small>{scalpScan?.inactiveReason === "outside_regular_session" ? "The scalp engine resumes at the next U.S. regular session." : scalpDataDelayed ? "No watchlist symbol has enough fresh 5-minute candles for a reliable radar read." : radarTracks.length ? `${scalpCandidates.length} qualified / ${radarTracks.length} tracked` : "Scanning for the next completed bar."}</small>
            </div>
            <div className="warroom-smart-signal__sample">
              <span>Top Signal</span>
              <strong>{focusedScalpTrack?.symbol ?? "--"}</strong>
              <small>{focusedScalpTrack ? `${focusedScalpTrack.direction} · ${Math.round(focusedScalpTrack.score)} score` : "No focus yet"}</small>
            </div>
          </div>

          <div className="warroom-command-deck__radar-workspace" style={{ marginTop: "0.6rem" }}>
            <div className="warroom-command-deck__radar-stage">
              <ScalpRadar tracks={radarTracks} focusedSymbol={focusedScalpTrack?.symbol} blockedShorts={rawRadarTracks.length - radarTracks.length} />
              <div className="warroom-command-deck__radar-summary">
                <PlanValue label="Qualified" value={`${scalpCandidates.length} / ${radarTracks.length}`} />
                <PlanValue label="Confirmed" value={`${radarTracks.filter((track) => track.state === "TRIGGERED").length} breaks`} />
                <PlanValue label="Engine" value="5M EMA + CLOSE + TREND" />
              </div>
              {focusedScalpTrack ? (
                <div className={`warroom-command-deck__scalp-focus is-${focusedScalpTrack.direction.toLowerCase()} is-${focusedScalpTrack.state.toLowerCase()}`}>
                  <div><span>Radar Focus</span><strong>{focusedScalpTrack.symbol} {focusedScalpTrack.direction}</strong></div>
                  <div><span>State</span><strong>{focusedScalpTrack.state}</strong></div>
                  <div><span>Break Strength</span><strong>{focusedScalpTrack.breakout ? `${(focusedScalpTrack.breakoutDistancePct ?? 0).toFixed(2)}%` : "SETTING UP"}</strong></div>
                  <div><span>5M EMA Cross</span><strong>{focusedScalpTrack.emaCrossCount ? `${focusedScalpTrack.emaCrossDirection?.toUpperCase()} ${focusedScalpTrack.emaCrosses?.join("+")}` : "NO FRESH CROSS"}</strong></div>
                </div>
              ) : <div className="warroom-command-deck__scalp-focus is-empty"><div><span>Radar Status</span><strong>{scalpDataDelayed ? "CANDLE DATA DELAYED" : "MONITORING WATCHLIST"}</strong></div><div><span>Rule</span><strong>{scalpDataDelayed ? "DO NOT USE FOR ENTRY" : "WAIT FOR CLOSE + TREND"}</strong></div></div>}
            </div>
            <aside className="warroom-command-deck__radar-alerts" aria-label="Live radar alerts">
              <div className="warroom-command-deck__radar-alerts-heading"><span>Live Alerts</span><strong>{visibleScalpTracks.length}</strong></div>
              {visibleScalpTracks.length ? (
                <div className="warroom-command-deck__scalp-list">
                  {visibleScalpTracks.map((candidate) => (
                    <button type="button" onClick={() => setFocusedScalpSymbol(candidate.symbol)} className={`warroom-command-deck__scalp-row is-${candidate.direction.toLowerCase()} ${focusedScalpTrack?.symbol === candidate.symbol ? "is-focused" : ""}`} key={candidate.symbol} aria-pressed={focusedScalpTrack?.symbol === candidate.symbol}>
                      <div><strong>{candidate.symbol}</strong><span>{value(candidate.price)} · RSI {candidate.rsi == null ? "--" : Math.round(candidate.rsi)}</span></div>
                      <div className="warroom-command-deck__scalp-flags">
                        {candidate.divergence ? <span>DIV</span> : null}
                        {candidate.macdCross ? <span>MACD</span> : null}
                        {candidate.volumeRatio >= 1.3 ? <span>{candidate.volumeRatio.toFixed(1)}X VOL</span> : null}
                        {candidate.breakout ? <span>BRK</span> : null}
                        {candidate.trendAligned ? <span>TRND</span> : null}
                        {candidate.emaCrossCount ? <span>EMA {candidate.emaCrosses?.join("+")}</span> : null}
                      </div>
                      <div className="warroom-command-deck__scalp-score"><span>{candidate.state}</span><strong>{Math.round(candidate.score)}</strong></div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="warroom-command-deck__scalp-empty">{scalpDataDelayed ? "Candle data is delayed across the watchlist. Radar confirmation is unavailable until fresh 5-minute bars arrive." : "No radar tracks yet. The engine is waiting for the next completed bar before it ranks breakout quality."}</div>
              )}
            </aside>
          </div>
        </div> : null}
        {activeView === "alerts" ? <div className={`warroom-command-deck__intel-card warroom-command-deck__scalp-card warroom-command-deck__alert-card warroom-command-deck__alerts-command ${alertRadarTracks.length ? "is-live" : ""} ${alertDivergenceCount ? "has-divergence" : ""}`}>
          <div className="warroom-command-deck__intel-heading">
            <div><div className="warroom-command-deck__label"><ShieldAlert className="h-3.5 w-3.5" /> Live Signal Matrix</div><strong className="warroom-alert-command__title">Alert Command Center</strong></div>
            <span className={`warroom-command-deck__radar-state ${alertTriggered ? "is-triggered" : alertEngineState === "ARMING" || alertEngineState === "SCANNING" ? "is-arming" : "is-standby"}`}>
              {alertTriggered ? "TRIGGERED" : alertEngineState}
            </span>
          </div>

          <div className={`warroom-alert-command__priority ${alertDivergenceCount ? "is-divergence" : alertTriggered ? "is-triggered" : alertDisplayTracks.length ? "is-arming" : "is-standby"}`}>
            <ShieldAlert />
            <div><span>{alertDivergenceCount ? "PRIORITY RISK" : alertTriggered ? "ACTIONABLE CONDITIONS" : alertDisplayTracks.length ? "SIGNALS BUILDING" : "WATCHLIST CLEAR"}</span><strong>{alertDivergenceCount ? `${alertDivergenceCount} DIVERGENCE ${alertDivergenceCount === 1 ? "ALERT" : "ALERTS"}` : alertBreakoutCount ? `${alertBreakoutCount} BREAKOUT / SETUP SIGNALS` : "AWAITING COMPLETED-BAR CONFIRMATION"}</strong></div>
            <small>SCALP {scalpScan?.candleTimeframe?.toUpperCase() ?? "5M"} · EDGE 10S</small>
          </div>

          <div className="warroom-command-deck__alert-telemetry">
            <div><span>TRACKING</span><strong>{alertRadarTracks.length}</strong><small>LIVE TICKERS</small></div>
            <div className="is-call"><span>CALL PRESSURE</span><strong>{alertCallCount}</strong><small>UPSTREAM</small></div>
            <div className="is-put"><span>PUT PRESSURE</span><strong>{alertPutCount}</strong><small>DOWNSTREAM</small></div>
            <div><span>EDGE FEED</span><strong>{edgeRadarTracks.length}</strong><small>10S PULSE</small></div>
          </div>

          <div className="warroom-command-deck__alert-meters" aria-label="Radar alert quality meters">
            <div className="warroom-command-deck__alert-meter">
              <div><span>MATRIX SCORE</span><strong>{alertAverageScore}%</strong></div>
              <i><b style={{ width: `${alertAverageScore}%` }} /></i>
            </div>
            <div className="warroom-command-deck__alert-meter is-cyan">
              <div><span>TRIGGER PRESSURE</span><strong>{alertTriggerRate}%</strong></div>
              <i><b style={{ width: `${alertTriggerRate}%` }} /></i>
            </div>
            <div className="warroom-command-deck__alert-meter is-amber">
              <div><span>VOLUME ENERGY</span><strong>{alertAverageVolume}%</strong></div>
              <i><b style={{ width: `${alertAverageVolume}%` }} /></i>
            </div>
            <div className={`warroom-command-deck__alert-meter ${compressionPushDirection === "CALL" ? "is-call" : compressionPushDirection === "PUT" ? "is-put" : "is-neutral"}`}>
              <div><span>COMPRESSION PUSH</span><strong>{compressionPushPower}%</strong></div>
              <i><b style={{ width: `${compressionPushPower}%` }} /></i>
            </div>
          </div>

          {edgeAlertCards.length ? <div className="warroom-command-deck__edge-alerts" aria-label="Edge engine alerts">
            <div className="warroom-command-deck__radar-alerts-heading"><span>Edge Engine Alerts</span><strong>{edgeAlertCards.length}</strong></div>
            <div className="warroom-command-deck__edge-alert-grid">
              {edgeAlertCards.map((row) => {
                const edge = row.edgeEngine;
                const direction = edge?.direction === "bearish" ? "PUT" : edge?.direction === "bullish" ? "CALL" : "WAIT";
                const status = edge?.state === "TRIGGERED" ? "TRIGGERED" : edge?.state === "PRIMED" ? "PRIMED" : edge?.state === "ARMING" ? "ARMING" : "STANDBY";
                return <div key={row.symbol} className={`warroom-command-deck__edge-alert is-${direction.toLowerCase()} is-${status.toLowerCase()}`}>
                  <div className="warroom-command-deck__edge-alert-top"><strong>{row.symbol}</strong><span>{direction}</span><b>{status}</b></div>
                  <div className="warroom-command-deck__edge-alert-metrics">
                    <span>EDGE <strong>{Math.round(edge?.edgeScore ?? 0)}</strong></span>
                    <span>CONF <strong>{Math.round(edge?.confidence ?? 0)}%</strong></span>
                    <span>TRIGGER <strong>{Math.round(edge?.triggerProbability ?? 0)}%</strong></span>
                    <span>LEAD <strong>{Math.round(edge?.leadMinutes ?? 0)}M</strong></span>
                  </div>
                  <small>{edge?.signal?.replace("BREAK_", "BREAK ") ?? "WAIT"} · {edge?.reasons?.[0] ?? "Directional edge detected"}</small>
                </div>;
              })}
            </div>
          </div> : null}

          <div className="warroom-command-deck__radar-workspace">
            <div className="warroom-command-deck__radar-stage">
              <ScalpRadar tracks={alertRadarTracks} focusedSymbol={focusedAlertTrack?.symbol ?? edgeRadarTracks[0]?.symbol} />
              <div className="warroom-command-deck__radar-summary">
                <PlanValue label="Divergence" value={`${alertTracks.filter((track) => track.divergence).length}`} />
                <PlanValue label="Volume Spikes" value={`${alertTracks.filter((track) => track.volumeRatio >= 1.3).length}`} />
                <PlanValue label="Breaks / Setups" value={`${alertTracks.filter((track) => track.breakout || track.strongSetup).length}`} />
                <PlanValue label="Cleared" value={`${resolvedRadarTracks.length}`} />
              </div>
              {focusedAlertTrack ? (
                <div className={`warroom-command-deck__scalp-focus is-${focusedAlertTrack.direction.toLowerCase()} is-${focusedAlertTrack.state.toLowerCase()}`}>
                  <div><span>Alert Focus</span><strong>{focusedAlertTrack.symbol} {focusedAlertTrack.direction}</strong></div>
                  <div><span>Timeframe</span><strong>{scalpScan?.candleTimeframe?.toUpperCase() ?? "5M"}</strong></div>
                  <div><span>Price Action</span><strong>{focusedAlertTrack.strongPriceAction ? `STRONG ${focusedAlertTrack.direction === "LONG" ? "BULLISH" : "BEARISH"}` : "NORMAL"}</strong></div>
                  <div><span>Compression</span><strong>{focusedAlertTrack.bollingerTight ? "BB TIGHT" : "OPEN"}</strong></div>
                </div>
              ) : <div className="warroom-command-deck__scalp-focus is-empty"><div><span>Alert Status</span><strong>NO ACTIVE CONDITIONS</strong></div><div><span>Scan</span><strong>COMPLETED 5M BARS</strong></div></div>}
            </div>
            <aside className="warroom-command-deck__radar-alerts" aria-label="Divergence, volume, breakdown, setup, and compression alerts">
              <div className="warroom-command-deck__radar-alerts-heading"><span>Active Conditions</span><strong>{visibleAlertTracks.length}</strong></div>
              {visibleAlertTracks.length ? <div className="warroom-command-deck__scalp-list">
                {visibleAlertTracks.map((alert) => (
                  <button type="button" onClick={() => setFocusedScalpSymbol(alert.symbol)} className={`warroom-command-deck__scalp-row is-${alert.direction.toLowerCase()} ${alert.divergence ? "is-divergence" : ""} ${alert.breakout || alert.strongSetup ? "is-priority" : ""} ${focusedAlertTrack?.symbol === alert.symbol ? "is-focused" : ""}`} key={alert.symbol} aria-pressed={focusedAlertTrack?.symbol === alert.symbol}>
                    <div><strong>{alert.symbol}</strong><span>{value(alert.price)} · {alert.direction}</span></div>
                    <div className="warroom-command-deck__scalp-flags">
                      {alert.divergence ? <span>DIV</span> : null}
                      {alert.volumeRatio >= 1.3 ? <span>{alert.volumeRatio.toFixed(1)}X VOL</span> : null}
                      {alert.breakout ? <span>{alert.direction === "SHORT" ? "BREAKDOWN" : "BREAKOUT"}</span> : null}
                      {alert.preBreakout && !alert.breakout ? <span>PRE-BREAK</span> : null}
                      {alert.strongSetup ? <span>STRONG SETUP</span> : null}
                      {alert.strongPriceAction ? <span>STRONG {alert.direction === "LONG" ? "BULL" : "BEAR"}</span> : null}
                      {alert.bollingerTight ? <span>BB TIGHT</span> : null}
                      {alert.source === "edge" ? <span>EDGE FEED</span> : null}
                    </div>
                    <div className="warroom-command-deck__scalp-score"><span>{alert.state}</span><strong>{Math.round(alert.score)}</strong></div>
                  </button>
                ))}
              </div> : <div className="warroom-command-deck__scalp-empty">No active conditions. Completed moves clear after extension, confirmation loss, or the live-alert window expires.</div>}
            </aside>
          </div>
        </div> : null}
      </div>
    </section>
  );
}

function Level({ label, value: level, tone, active = false }: { label: string; value?: number; tone: "up" | "down" | "neutral" | "risk"; active?: boolean }) {
  return <div className={`warroom-level warroom-level--${tone} ${active ? "is-active" : ""}`}><span>{label}</span><strong>{value(level)}</strong><i /></div>;
}

function PlanValue({ label, value: planValue }: { label: string; value: string }) {
  return <div><span>{label}</span><strong>{planValue}</strong></div>;
}

function Telemetry({ icon: Icon, label, value: telemetryValue }: { icon: typeof Activity; label: string; value: string }) {
  return <div><Icon className="h-3.5 w-3.5" /><span>{label}</span><strong>{telemetryValue}</strong></div>;
}

function GateCheck({ label, detail, passed, status }: { label: string; detail: string; passed: boolean; status?: "pass" | "blocked" | "caution" }) {
  const resolvedStatus = status ?? (passed ? "pass" : "blocked");
  const labelText = resolvedStatus === "pass" ? "PASS" : resolvedStatus === "caution" ? "CAUTION" : "BLOCKED";
  return <div className={`warroom-gate-check is-${resolvedStatus}`}><i /><div><strong>{label}</strong><span>{detail}</span></div><small>{labelText}</small></div>;
}

function SignalChip({ label, value: signalValue, active }: { label: string; value: string; active: boolean }) {
  return <div className={`warroom-command-deck__signal-chip ${active ? "is-active" : ""}`}><span>{label}</span><strong>{signalValue}</strong></div>;
}

function StructureLevelRow({ level, spot, position, isNearest }: { level: StructureLevel; spot: number; position: number; isNearest: boolean }) {
  const distance = ((level.price - spot) / spot) * 100;
  const pointDistance = level.price - spot;
  const isAbove = level.price > spot;
  const isActive = Math.abs(level.price - spot) / Math.max(Math.abs(spot), 1) <= 0.006 || level.kind === "trigger" || level.kind === "target" || level.kind === "liquidity";
  return (
    <div
      className={`warroom-structure-map__row is-${level.kind} ${isAbove ? "is-above" : "is-below"} ${isActive ? "is-active" : ""} ${isNearest ? "is-nearest" : ""}`}
      style={{ top: `${position}%` }}
    >
      <span className="warroom-structure-map__marker" />
      <span className="warroom-structure-map__label">{level.label}</span>
      <strong>{value(level.price)}</strong>
      <small>{isAbove ? "+" : ""}{distance.toFixed(2)}% · {pointDistance >= 0 ? "+" : ""}{pointDistance.toFixed(2)}</small>
    </div>
  );
}

function ConvictionDial({ value: dialValue, label, tone }: { value: number; label: string; tone: "call" | "put" | "neutral" }) {
  return (
    <div className={`warroom-conviction__dial is-${tone}`} aria-label={`Live conviction ${dialValue} out of 100, ${label}`}>
      <svg viewBox="0 0 42 42" role="img">
        <circle className="warroom-conviction__track" cx="21" cy="21" r="16" pathLength="100" />
        <circle className="warroom-conviction__fill" cx="21" cy="21" r="16" pathLength="100" style={{ strokeDasharray: `${dialValue} ${100 - dialValue}` }} />
      </svg>
      <div><strong>{dialValue}</strong><span>{label}</span></div>
    </div>
  );
}

function VolumePulse({ bars, average, ratio }: { bars: number[]; average: number; ratio: number }) {
  const maxVolume = Math.max(...bars, 1);
  const baselineY = 31 - Math.min(28, (average / maxVolume) * 28);
  const lastIndex = bars.length - 1;
  return (
    <svg className="warroom-volume-pulse" viewBox="0 0 120 32" preserveAspectRatio="none" aria-label={`Recent volume is ${ratio.toFixed(2)} times its twenty-bar baseline`}>
      <line className="warroom-volume-pulse__baseline" x1="0" x2="120" y1={baselineY} y2={baselineY} />
      {bars.map((volume, index) => {
        const height = Math.max(2, (volume / maxVolume) * 28);
        const width = 120 / Math.max(bars.length, 1);
        const isCurrent = index === lastIndex;
        return <rect className={isCurrent ? (ratio >= 1.3 ? "is-expanding" : "is-current") : ""} key={index} x={index * width + 0.8} y={31 - height} width={Math.max(width - 1.5, 0.8)} height={height} />;
      })}
      <text x="2" y={Math.max(7, baselineY - 1)}>20B AVG</text>
      <text x="118" y="7" textAnchor="end">NOW</text>
    </svg>
  );
}

function ScalpRadar({ tracks, focusedSymbol, blockedShorts = 0 }: { tracks: RadarTrack[]; focusedSymbol?: string; blockedShorts?: number }) {
  const focusedTrack = tracks.find((track) => track.symbol === focusedSymbol) ?? tracks[0];
  const triggeredTrack = tracks.find((track) => track.state === "TRIGGERED" && track.breakout);
  const metrics = focusedTrack ? [
    clampScore(focusedTrack.score),
    clampScore((focusedTrack.closeStrength ?? 0) * 100),
    focusedTrack.trendAligned ? 100 : 10,
    clampScore((focusedTrack.volumeRatio / 1.8) * 100),
    clampScore(focusedTrack.emaCrossStrength ?? 0),
  ] : [0, 0, 0, 0, 0];
  const center = 90;
  const radius = 64;
  const point = (index: number, score: number) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / metrics.length;
    const scaledRadius = radius * score / 100;
    return `${center + Math.cos(angle) * scaledRadius},${center + Math.sin(angle) * scaledRadius}`;
  };
  const polygon = metrics.map((metric, index) => point(index, metric)).join(" ");
  const axes = metrics.map((_, index) => point(index, 100));
  const trackPolygons = tracks.map((track) => {
    const trackMetrics = [
      clampScore(track.score),
      clampScore((track.closeStrength ?? 0) * 100),
      track.trendAligned ? 100 : 18,
      clampScore((track.volumeRatio / 1.8) * 100),
      clampScore(track.emaCrossStrength ?? 0),
    ];
    const [labelX, labelY] = point(0, Math.max(18, trackMetrics[0])).split(",");
    return { track, points: trackMetrics.map((metric, index) => point(index, metric)).join(" "), labelX, labelY };
  });
  const longPressure = tracks.filter((track) => track.direction === "LONG").reduce((sum, track) => sum + track.score, 0);
  const shortPressure = tracks.filter((track) => track.direction === "SHORT").reduce((sum, track) => sum + track.score, 0);
  const pressureTotal = Math.max(1, longPressure + shortPressure);
  const longPercent = Math.round(longPressure / pressureTotal * 100);
  const shortPercent = Math.round(shortPressure / pressureTotal * 100);
  const toneTrack = triggeredTrack ?? focusedTrack;
  const tone = toneTrack?.direction === "SHORT" ? "short" : toneTrack?.direction === "LONG" ? "long" : "neutral";
  const triggerLabel = triggeredTrack?.direction === "SHORT" ? "BREAKDOWN LIVE" : "BREAKOUT LIVE";

  return (
    <div className={`warroom-scalp-radar is-${tone} ${triggeredTrack ? "is-triggered" : ""}`} aria-label={`Three-minute breakout imbalance field${triggeredTrack ? `: ${triggerLabel}` : ""}`}>
      <svg viewBox="0 0 180 180" role="img" aria-label={`${tracks.length} guarded scanner tracks`}>
        {[1, 0.72, 0.42].map((scale) => <polygon key={scale} points={metrics.map((_, index) => point(index, scale * 100)).join(" ")} className="warroom-scalp-radar__ring" />)}
        {axes.map((axis, index) => {
          const [x, y] = axis.split(",");
          return <line key={index} x1={center} y1={center} x2={x} y2={y} className="warroom-scalp-radar__axis" />;
        })}
        {trackPolygons.map(({ track, points, labelX, labelY }) => <g key={track.symbol} className={`warroom-scalp-radar__track-group is-${track.direction.toLowerCase()} ${track.symbol === focusedTrack?.symbol ? "is-focused" : ""}`}>
          <polygon points={points} className="warroom-scalp-radar__track" />
          <text x={labelX} y={Number(labelY) - 4} textAnchor="middle">{track.symbol}</text>
        </g>)}
        {focusedTrack ? <polygon points={polygon} className="warroom-scalp-radar__field" /> : null}
        <circle cx={center} cy={center} r="5" className="warroom-scalp-radar__core" />
        <text x="90" y="13" textAnchor="middle">SCORE</text>
        <text x="169" y="70" textAnchor="end">CLOSE</text>
        <text x="143" y="165" textAnchor="middle">TREND</text>
        <text x="37" y="165" textAnchor="middle">VOLUME</text>
        <text x="11" y="70">EMA X</text>
      </svg>
      <div className="warroom-scalp-radar__readout">
        <span>{focusedTrack?.symbol ?? "NO FIELD"}</span>
        <strong>{focusedTrack ? Math.round(focusedTrack.score) : 0}%</strong>
        <small>{triggeredTrack ? `${triggeredTrack.direction} · ${triggerLabel}` : focusedTrack ? `${focusedTrack.direction} · ${focusedTrack.state}` : "AWAIT CLOSED BAR"}</small>
      </div>
      <div className="warroom-scalp-radar__legend">
        <div className="warroom-scalp-radar__pressure"><span style={{ width: `${longPercent}%` }}>LONG {longPercent}%</span><span style={{ width: `${shortPercent}%` }}>SHORT {shortPercent}%</span></div>
        <span>{tracks.length} LIVE TICKER TRACKS</span>
        <span>{blockedShorts ? `${blockedShorts} UNSAFE SHORT${blockedShorts === 1 ? "" : "S"} BLOCKED` : "PRICE ACTION GATE CLEAR"}</span>
      </div>
    </div>
  );
}

function CompressionRadar({ score, active }: { score: number; active: boolean }) {
  const ringValue = clampScore(score);
  const points = [
    [80, 22],
    [122, 50],
    [118, 112],
    [80, 138],
    [42, 112],
    [38, 50],
  ] as const;
  const polygon = points.map(([x, y], index) => {
    const pulse = index % 2 === 0 ? 1 : 0.8;
    const offset = (ringValue / 100) * 16 * pulse;
    return `${x + (index < 3 ? offset : -offset)},${y + (index < 2 ? -offset : offset)}`;
  }).join(" ");

  return <div className={`warroom-compression-radar ${active ? "is-active" : ""}`} aria-label={`Compression radar at ${score} percent`}>
    <svg viewBox="0 0 160 160" role="img">
      <circle cx="80" cy="80" r="60" className="warroom-scalp-radar__ring" />
      <circle cx="80" cy="80" r="42" className="warroom-scalp-radar__ring" />
      <circle cx="80" cy="80" r="24" className="warroom-scalp-radar__ring" />
      <path d="M80 10V150M10 80H150" className="warroom-scalp-radar__axis" />
      <polygon points={polygon} className="warroom-compression-radar__polygon" />
      <circle cx="80" cy="80" r="8" className="warroom-scalp-radar__core" />
    </svg>
    <div className="warroom-compression-radar__readout">
      <span>Compression</span>
      <strong>{Math.round(score)}%</strong>
      <small>{active ? "TIGHT" : "LOOSE"}</small>
    </div>
  </div>;
}

function formatEvidenceRule(rule?: string): string {
  if (!rule) return "Awaiting validated recurrence data.";
  return rule
    .replace("tv_recommend_direction_match", "TradingView recommendation matches direction")
    .replace("tv_trend_aligned", "TradingView trend aligned")
    .replace("tv_adx>=", "ADX >= ")
    .replace("|momentum|>=", "momentum >= ");
}

function Prob({ label, value, tone }: { label: string; value: number; tone: "up" | "down" | "neutral" }) {
  return (
    <div className="warroom-prob-scale__row">
      <span>{label}</span>
      <div className="warroom-prob-scale__track">
        <div className={`warroom-prob-scale__fill warroom-prob-scale__fill--${tone}`} style={{ width: `${Math.round(value)}%` }} />
      </div>
      <strong>{Math.round(value)}%</strong>
    </div>
  );
}

function EmaCloudRadar({
  lines,
  spot,
  tone,
  state,
  strength,
  fvgZones,
  candleCount,
}: {
  lines: EmaLine[];
  spot: number;
  tone: "call" | "put" | "neutral";
  state: string;
  strength: number;
  fvgZones: FvgZone[];
  candleCount: number;
}) {
  const visibleLines = lines.map((line) => ({ ...line, values: line.values.slice(-60) }));
  const allValues = visibleLines.flatMap((line) => line.values).concat(spot > 0 ? [spot] : []);
  if (!allValues.length) return <div className="warroom-ema-cloud__empty">Waiting for candle history...</div>;
  const minimum = Math.min(...allValues);
  const maximum = Math.max(...allValues);
  const range = Math.max(maximum - minimum, maximum * 0.001, 0.01);
  const colors = ["#22d3ee", "#34d399", "#facc15", "#f97316"];
  const toPoints = (values: number[]) => values.map((price, index) => {
    const x = 12 + (index / Math.max(values.length - 1, 1)) * 216;
    const y = 130 - ((price - minimum) / range) * 108;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const fastPoints = visibleLines[0]?.values ?? [];
  const slowPoints = visibleLines[1]?.values ?? [];
  const cloudPolygon = fastPoints.map((price, index) => {
    const x = 12 + (index / Math.max(fastPoints.length - 1, 1)) * 216;
    const y = 130 - ((price - minimum) / range) * 108;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).concat(slowPoints.map((price, reverseIndex) => {
    const index = slowPoints.length - reverseIndex - 1;
    const x = 12 + (index / Math.max(slowPoints.length - 1, 1)) * 216;
    const y = 130 - ((slowPoints[index] - minimum) / range) * 108;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  })).join(" ");
  const spotY = 130 - ((spot - minimum) / range) * 108;
  const latestPoints = visibleLines.map((line, index) => ({
    period: line.period,
    color: colors[index],
    x: 228,
    y: 130 - (((line.values.at(-1) ?? minimum) - minimum) / range) * 108,
  }));
  const upperPrice = maximum.toFixed(2);
  const middlePrice = ((maximum + minimum) / 2).toFixed(2);
  const lowerPrice = minimum.toFixed(2);
  const windowStart = Math.max(0, candleCount - 60);
  const visibleFvgZones = fvgZones.filter((zone) => zone.startIndex >= windowStart && zone.low <= maximum && zone.high >= minimum);

  return <div className={`warroom-ema-cloud__radar is-${tone}`} aria-label="EMA 9 21 50 and 200 cloud radar">
    <div className="warroom-ema-cloud__hud">
      <span>LIVE CLOUD MATRIX</span>
      <strong>{state}</strong>
      <small>{Math.round(strength)}% FORCE</small>
    </div>
    <svg viewBox="0 0 240 152" role="img">
      <defs>
        <linearGradient id={`ema-cloud-${tone}`} x1="0" x2="1">
          <stop offset="0" stopColor={tone === "call" ? "#10b981" : tone === "put" ? "#dc2626" : "#0891b2"} stopOpacity="0.04" />
          <stop offset="0.72" stopColor={tone === "call" ? "#34d399" : tone === "put" ? "#f97316" : "#22d3ee"} stopOpacity="0.34" />
          <stop offset="1" stopColor={tone === "call" ? "#a7f3d0" : tone === "put" ? "#fed7aa" : "#cffafe"} stopOpacity="0.12" />
        </linearGradient>
        <filter id="ema-cloud-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.5" result="blur" /><feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        <clipPath id="ema-cloud-plot"><rect x="8" y="20" width="224" height="112" /></clipPath>
      </defs>
      <g className="warroom-ema-cloud__scope">
        <ellipse cx="120" cy="76" rx="108" ry="54" className="warroom-ema-cloud__ring" />
        <ellipse cx="120" cy="76" rx="75" ry="37" className="warroom-ema-cloud__ring" />
        <ellipse cx="120" cy="76" rx="40" ry="20" className="warroom-ema-cloud__ring" />
        <path d="M8 38H232M8 76H232M8 114H232M64 20V132M120 20V132M176 20V132" className="warroom-ema-cloud__grid" />
      </g>
      <g clipPath="url(#ema-cloud-plot)">
        <path d="M8 76H232" className="warroom-ema-cloud__scan-beam" />
        {visibleFvgZones.map((zone) => {
          const x = 12 + ((zone.startIndex - windowStart) / 59) * 216;
          const top = 130 - ((zone.high - minimum) / range) * 108;
          const bottom = 130 - ((zone.low - minimum) / range) * 108;
          return <g key={`${zone.direction}-${zone.startIndex}`} className={`warroom-ema-cloud__fvg-zone is-${zone.direction}`}>
            <rect x={x} y={top} width={228 - x} height={Math.max(2, bottom - top)} />
            <line x1={x} x2="228" y1={(top + bottom) / 2} y2={(top + bottom) / 2} />
            <text x={x + 3} y={Math.max(24, top - 2)}>FVG {zone.direction === "bullish" ? "B+" : "S-"} · {Math.round(100 - zone.fillPercent)}% OPEN</text>
          </g>;
        })}
        {cloudPolygon ? <polygon points={cloudPolygon} className="warroom-ema-cloud__fill" fill={`url(#ema-cloud-${tone})`} /> : null}
        {visibleLines.map((line, index) => <polyline key={line.period} points={toPoints(line.values)} fill="none" stroke={colors[index]} className={`warroom-ema-cloud__line is-ema-${line.period}`} filter="url(#ema-cloud-glow)" />)}
      </g>
      {latestPoints.map((point) => <g key={point.period} className="warroom-ema-cloud__beacon"><circle cx={point.x} cy={point.y} r="3.6" fill={point.color} /><circle cx={point.x} cy={point.y} r="1.5" /><text x="224" y={point.y - 4} textAnchor="end">{point.period}</text></g>)}
      {spot > 0 ? <g className="warroom-ema-cloud__spot-line"><line x1="8" x2="232" y1={spotY} y2={spotY} /><text x="228" y={spotY - 4} textAnchor="end">SPOT {spot.toFixed(2)}</text></g> : null}
      <g className="warroom-ema-cloud__scale"><text x="10" y="27">{upperPrice}</text><text x="10" y="74">{middlePrice}</text><text x="10" y="128">{lowerPrice}</text></g>
    </svg>
    <div className="warroom-ema-cloud__legend">{lines.map((line, index) => <span key={line.period}><i style={{ backgroundColor: colors[index] }} />EMA {line.period} {value(line.latest)}</span>)}<span><i className="is-spot" />SPOT {value(spot)}</span></div>
  </div>;
}

function FvgPressureRadar({
  bullishZone,
  bearishZone,
  bullishStrength,
  bearishStrength,
  spot,
  ema21,
}: {
  bullishZone?: FvgZone;
  bearishZone?: FvgZone;
  bullishStrength: number;
  bearishStrength: number;
  spot: number;
  ema21: number;
}) {
  const leadZone = bullishStrength >= bearishStrength ? bullishZone : bearishZone;
  const leadStrength = Math.max(bullishStrength, bearishStrength);
  const leadDirection = bullishStrength === bearishStrength ? "neutral" : bullishStrength > bearishStrength ? "bullish" : "bearish";
  const midpoint = leadZone ? (leadZone.low + leadZone.high) / 2 : 0;
  const distancePct = leadZone && spot > 0 ? Math.abs(spot - midpoint) / spot * 100 : 0;
  const gapPct = leadZone && spot > 0 ? (leadZone.high - leadZone.low) / spot * 100 : 0;
  const metrics = leadZone ? [
    Math.max(0, 100 - distancePct * 80),
    Math.max(0, 100 - leadZone.age * 2.5),
    100 - leadZone.fillPercent,
    Math.min(100, gapPct * 350),
    ema21 > 0 ? Math.max(0, 100 - Math.abs(midpoint - ema21) / ema21 * 10000) : 0,
  ] : [0, 0, 0, 0, 0];
  const center = 90;
  const radius = 62;
  const point = (index: number, score: number) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / metrics.length;
    const scaledRadius = radius * score / 100;
    return `${center + Math.cos(angle) * scaledRadius},${center + Math.sin(angle) * scaledRadius}`;
  };
  const polygon = metrics.map((metric, index) => point(index, metric)).join(" ");
  const axes = metrics.map((_, index) => point(index, 100));

  return <div className={`warroom-fvg-radar is-${leadDirection}`} aria-label={`FVG pressure ${Math.round(leadStrength)} percent ${leadDirection}`}>
    <svg viewBox="0 0 180 180" role="img">
      {[1, 0.72, 0.42].map((scale) => <polygon key={scale} points={metrics.map((_, index) => point(index, scale * 100)).join(" ")} className="warroom-fvg-radar__grid" />)}
      {axes.map((axis, index) => {
        const [x, y] = axis.split(",");
        return <line key={index} x1={center} y1={center} x2={x} y2={y} className="warroom-fvg-radar__axis" />;
      })}
      <polygon points={polygon} className="warroom-fvg-radar__field" />
      <circle cx={center} cy={center} r="5" className="warroom-fvg-radar__core" />
      <text x="90" y="13" textAnchor="middle">PROXIMITY</text>
      <text x="168" y="70" textAnchor="end">FRESH</text>
      <text x="142" y="164" textAnchor="middle">OPEN</text>
      <text x="38" y="164" textAnchor="middle">SIZE</text>
      <text x="12" y="70">EMA SYNC</text>
    </svg>
    <div className="warroom-fvg-radar__readout">
      <span>{leadZone ? `${leadDirection.toUpperCase()} PRESSURE` : "NO ACTIVE FIELD"}</span>
      <strong>{Math.round(leadStrength)}%</strong>
      <small>{leadZone ? `${value(leadZone.low)} - ${value(leadZone.high)} · ${distancePct.toFixed(2)}% AWAY` : "AWAITING DISPLACEMENT"}</small>
    </div>
    <div className="warroom-fvg-radar__balance"><span style={{ width: `${bullishStrength}%` }}>CALL {bullishStrength}%</span><span style={{ width: `${bearishStrength}%` }}>PUT {bearishStrength}%</span></div>
  </div>;
}

function PlayUnlockRadar({
  metrics,
  checks,
  historicalGuardLabel,
  state,
  direction,
  tone,
}: {
  metrics: { trend: number; momentum: number; historicalGuard: number; alignment: number };
  checks: { trend: boolean; momentum: boolean; historicalGuard: boolean; alignment: boolean };
  historicalGuardLabel: string;
  state: string;
  direction: SmartSignal["direction"];
  tone: "call" | "put" | "neutral";
}) {
  const axes = [
    { label: "ADX 25+", value: metrics.trend, passed: checks.trend },
    { label: "MOM 35+", value: metrics.momentum, passed: checks.momentum },
    { label: historicalGuardLabel, value: metrics.historicalGuard, passed: checks.historicalGuard },
    { label: "TAPE", value: metrics.alignment, passed: checks.alignment },
  ];
  const center = 100;
  const radius = 68;
  const point = (index: number, score: number) => {
    const angle = -Math.PI / 2 + index * Math.PI * 2 / axes.length;
    const distance = radius * score / 100;
    return `${center + Math.cos(angle) * distance},${center + Math.sin(angle) * distance}`;
  };
  const polygon = axes.map((axis, index) => point(index, axis.value)).join(" ");
  const passed = axes.filter((axis) => axis.passed).length;
  const unlocked = state === "PLAY UNLOCKED";
  const averageScore = Math.round(axes.reduce((total, axis) => total + axis.value, 0) / axes.length);

  return <div className={`warroom-play-unlock-radar is-${tone} ${unlocked ? "is-unlocked" : ""}`}>
    <svg viewBox="0 0 200 200" role="img" aria-label={`${state}, ${passed} of 4 engine gates passed`}>
      <circle cx={center} cy={center} r="83" className="warroom-play-unlock-radar__ring warroom-play-unlock-radar__ring--outer" />
      <circle cx={center} cy={center} r="54" className="warroom-play-unlock-radar__ring" />
      <g className="warroom-play-unlock-radar__sweep"><path d="M100 100 L100 14 A86 86 0 0 1 176 61 Z" /></g>
      {[1, 0.72, 0.42].map((scale) => <polygon key={scale} points={axes.map((_, index) => point(index, scale * 100)).join(" ")} className="warroom-play-unlock-radar__grid" />)}
      {axes.map((axis, index) => {
        const [x, y] = point(index, 100).split(",");
        const [labelX, labelY] = point(index, 116).split(",");
        return <g key={axis.label}><line x1={center} y1={center} x2={x} y2={y} /><circle cx={x} cy={y} r="6" className="warroom-play-unlock-radar__node-ring" /><circle cx={x} cy={y} r="3" className={axis.passed ? "is-pass" : "is-blocked"} /><text x={labelX} y={labelY} textAnchor="middle">{axis.label}</text></g>;
      })}
      <polygon points={polygon} className="warroom-play-unlock-radar__field" />
      <circle cx={center} cy={center} r="12" className="warroom-play-unlock-radar__core-halo" />
      <circle cx={center} cy={center} r="5" className="warroom-play-unlock-radar__core" />
      <text x={center} y="104" textAnchor="middle" className="warroom-play-unlock-radar__core-mark">{unlocked ? "LIVE" : "SCAN"}</text>
    </svg>
    <div className="warroom-play-unlock-radar__readout"><span>{direction} BIAS</span><strong>{state}</strong><small>{passed}/4 ENGINE GATES · {averageScore} AVG</small></div>
    <div className="warroom-play-unlock-radar__gates">{axes.map((axis) => <span key={axis.label} className={axis.passed ? "is-pass" : "is-blocked"}><small>{axis.label}</small><strong>{axis.value}<i>%</i></strong></span>)}</div>
  </div>;
}

function PriceActionGauge({
  callPower,
  putPower,
  direction,
  liveMovePct,
  volumeRatio,
  upSteps,
  downSteps,
  candleVolumePower,
  emaHoldConfirmed,
  scalpExitWarning,
}: {
  callPower: number;
  putPower: number;
  direction: SmartSignal["direction"];
  liveMovePct: number;
  volumeRatio: number;
  upSteps: number;
  downSteps: number;
  candleVolumePower: number;
  emaHoldConfirmed: boolean;
  scalpExitWarning: string | null;
}) {
  const net = clampScore(Math.abs(callPower - putPower));
  const dominant = direction === "CALL" ? callPower : direction === "PUT" ? putPower : Math.round((callPower + putPower) / 2);
  const tone = direction === "CALL" ? "call" : direction === "PUT" ? "put" : "neutral";
  const stability = clampScore(45 + Math.abs(upSteps - downSteps) * 10 + Math.max(0, (volumeRatio - 1) * 14));
  const driftLabel = liveMovePct >= 0 ? `+${liveMovePct.toFixed(3)}%` : `${liveMovePct.toFixed(3)}%`;
  const stateLabel = scalpExitWarning ?? (emaHoldConfirmed && direction === "CALL"
    ? "BULLISH POWER"
    : emaHoldConfirmed && direction === "PUT"
      ? "BEARISH POWER"
      : dominant >= 78 ? "OVERDRIVE" : dominant >= 62 ? "BUILDING" : "SCANNING");

  return (
    <div className={`warroom-price-action-gauge is-${tone}`} aria-label="Price action directional power gauge">
      <div className="warroom-command-deck__label"><Zap className="h-3.5 w-3.5" /> Price Action Hyper Core</div>
      <SmartEngineDial
        probability={dominant}
        confidence={net}
        reliability={stability}
        direction={direction}
        tone={tone}
      />
      <div className="warroom-execution__live-read"><span>CALL {callPower}</span><strong>{stateLabel} · {driftLabel}</strong><span>PUT {putPower}</span></div>
      <div className="warroom-price-action-gauge__meters">
        <div className="warroom-price-action-gauge__meter is-call"><span>CALL POWER</span><i><b style={{ width: `${callPower}%` }} /></i><strong>{callPower}%</strong></div>
        <div className="warroom-price-action-gauge__meter is-put"><span>PUT POWER</span><i><b style={{ width: `${putPower}%` }} /></i><strong>{putPower}%</strong></div>
        <div className="warroom-price-action-gauge__stats"><span>LIVE DRIFT {driftLabel}</span><span>VOL {volumeRatio.toFixed(2)}x</span><span>CANDLE/VOL {candleVolumePower}%</span><span>{scalpExitWarning ?? `STEPS ${upSteps}U/${downSteps}D`}</span><span>STABILITY {stability}%</span></div>
      </div>
    </div>
  );
}

function ShadowGauge({
  model,
  spot,
  executionDirection,
  playUnlockState,
  playUnlockPassed,
}: {
  model: LiquidityExecutionModel;
  spot: number;
  executionDirection: SmartSignal["direction"];
  playUnlockState: string;
  playUnlockPassed: number;
}) {
  const tone: "call" | "put" | "neutral" = model.direction === "CALL" ? "call" : model.direction === "PUT" ? "put" : "neutral";
  const scored = clampScore(((model.totalScore + 9) / 18) * 100);
  const alignment = model.direction !== "WAIT" && model.direction === executionDirection;
  const positiveStack = model.components.liquidityPool + model.components.trendAlignment + model.components.volumeProfileLevel + model.components.momentumConfirmation + model.components.timeOfDay;
  const penaltyStack = Math.abs(model.penalties.middayChop + model.penalties.insideBar + model.penalties.preNews + model.penalties.lowVolume + model.penalties.microRanges);
  const magneticPull = model.nearestMagnet && spot > 0 ? clampScore(100 - model.distancePct * 125) : 0;
  const certainty = clampScore(scored * 0.45 + magneticPull * 0.35 + (alignment ? 18 : 0) + (model.movingToward ? 12 : 0) - penaltyStack * 6);
  const state = scored >= 74 && model.movingToward && penaltyStack <= 2
    ? "MAGNET LOCK"
    : scored >= 56
      ? "TRACKING"
      : "BUILDING";
  const signalTraits = [
    model.equalHighs ? "EQH" : null,
    model.equalLows ? "EQL" : null,
    model.tightRange ? "TIGHT" : null,
    model.microConsolidation ? "MICRO" : null,
    model.insideBar ? "INSIDE" : null,
    model.preNews ? "PRE-NEWS" : null,
    model.lowVolume ? "LOW VOL" : null,
  ].filter(Boolean) as string[];

  return (
    <div className={`warroom-price-action-gauge warroom-shadow-gauge is-${tone}`} aria-label="Shadow liquidity magnet gauge">
      <div className="warroom-command-deck__label"><Target className="h-3.5 w-3.5" /> Shadow</div>
      <SmartEngineDial
        probability={scored}
        confidence={magneticPull}
        reliability={certainty}
        direction={model.direction}
        tone={tone}
        levels={model.magnets.map((magnet) => ({
          label: magnet.label,
          price: magnet.price,
          distance: Math.abs(magnet.price - spot),
          kind: magnet.kind === "pool" || magnet.kind === "gamma" || magnet.kind === "poc" ? "liquidity" : magnet.kind === "prior" || magnet.kind === "trigger" ? "trigger" : "target",
        }))}
        spot={spot}
      />
      <div className="warroom-execution__live-read"><span>PULL {magneticPull}%</span><strong>{state} · {model.direction}</strong><span>CERTAINTY {certainty}%</span></div>
      <div className="warroom-calibration-guard__metrics">
        <PlanValue label="Liquidity +3" value={`${model.components.liquidityPool}`} />
        <PlanValue label="Trend +2" value={`${model.components.trendAlignment}`} />
        <PlanValue label="Volume profile +2" value={`${model.components.volumeProfileLevel}`} />
      </div>
      <div className="warroom-calibration-guard__metrics">
        <PlanValue label="Momentum +1" value={`${model.components.momentumConfirmation}`} />
        <PlanValue label="Time +1" value={`${model.components.timeOfDay}`} />
        <PlanValue label="Penalty" value={`-${penaltyStack}`} />
      </div>
      <div className="warroom-command-deck__signal-rail">
        {signalTraits.length ? signalTraits.map((trait) => <SignalChip key={trait} label={trait} value="ON" active={true} />) : <SignalChip label="CLEAN TAPE" value="ON" active={true} />}
        <SignalChip label="TOWARD" value={model.movingToward ? "YES" : "NO"} active={model.movingToward} />
        <SignalChip label="ALIGN" value={alignment ? "YES" : "NO"} active={alignment} />
      </div>
      <div className="warroom-shadow-gauge__status">
        <span>{model.nearestMagnet ? `${model.nearestMagnet.label} ${value(model.nearestMagnet.price)}` : "No active magnet"}</span>
        <strong>{playUnlockPassed}/4 GATES · {playUnlockState}</strong>
        <small>{model.nearestMagnet ? `${model.distancePct.toFixed(2)}% gap · ${positiveStack} confluence` : "Build structure context"}</small>
      </div>
    </div>
  );
}

function SmartEngineDial({
  probability,
  confidence,
  reliability,
  direction,
  tone,
  levels = [],
  spot,
  spotLabel = "LIVE SPOT",
  readoutLabel = "SMART ENGINE",
  reliabilityLabel = "history lock",
}: {
  probability: number;
  confidence: number;
  reliability: number;
  direction: SmartSignal["direction"];
  tone: "call" | "put" | "neutral";
  levels?: StructureLevel[];
  spot?: number;
  spotLabel?: string;
  readoutLabel?: string;
  reliabilityLabel?: string;
}) {
  const score = clampScore(probability);
  const confidenceScore = clampScore(confidence);
  const reliabilityScore = clampScore(reliability);
  const orbitSeconds = Math.max(4.2, 18 - score * 0.12);
  const directionalBias = tone === "put" ? -1 : tone === "call" ? 1 : 0;
  const activeLevelStrength = 0.72 + (score / 100) * 0.8 + (reliabilityScore / 100) * 0.35;
  const dialLevels = levels.slice(0, 6).map((level, index) => {
    const angle = (index / Math.max(levels.length || 1, 1)) * Math.PI * 2 - Math.PI / 2;
    const radius = 45;
    const x = 50 + Math.cos(angle) * radius;
    const y = 50 + Math.sin(angle) * radius;
    const isBreak = level.kind === "trigger" || level.kind === "invalidation" || level.kind === "target" || level.kind === "liquidity";
    const toneClass = level.kind === "invalidation" ? "put" : level.kind === "trigger" || level.kind === "target" ? "call" : level.kind === "liquidity" ? "neutral" : "neutral";
    return {
      ...level,
      x,
      y,
      isBreak,
      toneClass,
    };
  });

  return <div
    className={`warroom-smart-engine is-${tone}`}
    aria-label={`${readoutLabel} ${direction} at ${score}`}
    style={{
      ["--engine-spin-speed" as string]: `${orbitSeconds}s`,
      ["--engine-spin-direction" as string]: tone === "put" ? "reverse" : "normal",
      ["--engine-bias" as string]: String(directionalBias),
      ["--engine-push-strength" as string]: `${Math.min(1.26, activeLevelStrength).toFixed(2)}`,
    }}
  >
    <div className="warroom-smart-engine__orbit" style={{ animationDuration: `${orbitSeconds}s`, animationDirection: tone === "put" ? "reverse" : "normal" }}><i /><i /><i /></div>
    <svg viewBox="0 0 180 180" role="img">
      <circle className="warroom-smart-engine__halo" cx="90" cy="90" r="82" />
      <circle className="warroom-smart-engine__track" cx="90" cy="90" r="70" pathLength="100" />
      <circle className="warroom-smart-engine__probability" cx="90" cy="90" r="70" pathLength="100" style={{ strokeDasharray: `${score} ${100 - score}` }} />
      <circle className="warroom-smart-engine__track is-inner" cx="90" cy="90" r="55" pathLength="100" />
      <circle className="warroom-smart-engine__confidence" cx="90" cy="90" r="55" pathLength="100" style={{ strokeDasharray: `${confidenceScore} ${100 - confidenceScore}` }} />
      <circle className="warroom-smart-engine__track is-core" cx="90" cy="90" r="40" pathLength="100" />
      <circle className="warroom-smart-engine__reliability" cx="90" cy="90" r="40" pathLength="100" style={{ strokeDasharray: `${reliabilityScore} ${100 - reliabilityScore}` }} />
    </svg>
    <div className="warroom-smart-engine__radar-levels">
      {dialLevels.map((level) => {
        const isActive = level.isBreak || level.kind === "target" || level.kind === "liquidity" || level.kind === "trigger";
        return (
          <div
            key={`${level.label}-${level.price}`}
            className={`warroom-smart-engine__radar-level is-${level.toneClass} ${level.isBreak ? "is-break" : ""} ${isActive ? "is-active" : ""}`}
            style={{
              left: `${level.x}%`,
              top: `${level.y}%`,
              opacity: isActive ? 1 : 0.8,
              transform: `translate(-50%, -50%) scale(${isActive ? 1.04 : 0.97})`,
            }}
          >
            <span>{level.label}</span>
            <strong>{value(level.price)}</strong>
          </div>
        );
      })}
    </div>
    <div className="warroom-smart-engine__spot" aria-label={`${spotLabel} price ${value(spot)}`}>
      <span>{spotLabel}</span>
      <strong>{value(spot)}</strong>
    </div>
    <div className="warroom-smart-engine__readout"><span>{readoutLabel}</span><strong>{score}</strong><em>{direction}</em><small>{reliabilityScore}% {reliabilityLabel}</small></div>
  </div>;
}

function CompositeGaugePanel({ title, result, inputs, sidecar, spot, spotIsLive }: {
  title: string;
  result: CompositeGaugeResult;
  inputs: CompositeGaugeInput[];
  sidecar?: ReactNode;
  spot: number;
  spotIsLive: boolean;
}) {
  const tone = result.direction === "CALL" ? "call" : result.direction === "PUT" ? "put" : "neutral";
  return (
    <div className="warroom-composite-gauge">
      <div className="warroom-command-deck__label"><Activity className="h-3.5 w-3.5" /> {title}</div>
      <div className="warroom-composite-gauge__note">
        <strong>ALIGNMENT SCORE · NOT WIN PROBABILITY</strong>
        <span>{result.contributors}/{result.total} directional inputs</span>
      </div>
      <div className="warroom-composite-gauge__hero">
        <div className="warroom-composite-gauge__dial-column">
          <SmartEngineDial
            probability={result.score}
            confidence={result.confidence}
            reliability={result.reliability}
            direction={result.direction}
            tone={tone}
            spot={spot}
            spotLabel={spotIsLive ? "LIVE SPOT" : "ANALYSIS"}
            readoutLabel="ALIGNMENT"
            reliabilityLabel="signal reliability"
          />
          <div className="warroom-composite-gauge__ring-key" aria-label="Gauge ring legend">
            <span><i /> Alignment</span>
            <span><i /> Confidence</span>
            <span><i /> Reliability</span>
          </div>
        </div>
      </div>
      {sidecar ? <div className="warroom-composite-gauge__sidecar">{sidecar}</div> : null}
      <div className="warroom-composite-gauge__inputs">
        {inputs.map((input) => (
          <div key={input.name} className={`is-${input.direction.toLowerCase()}`}>
            <strong>{input.name}</strong>
            <span>{input.direction} · {Math.round(input.score)} · {Math.round(input.reliability)}% · {(input.weight ?? 1).toFixed(2)}×</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DirectionalProbabilityGauge({ up, chop, down, direction, quoteIsLive, timeframe, lastCandleTime }: {
  up: number;
  chop: number;
  down: number;
  direction: string;
  quoteIsLive: boolean;
  timeframe: string;
  lastCandleTime?: number;
}) {
  const total = up + chop + down;
  const distribution = total > 0
    ? { up: up / total * 100, chop: chop / total * 100, down: down / total * 100 }
    : { up: 0, chop: 100, down: 0 };
  const favoredSide = distribution.chop >= Math.max(distribution.up, distribution.down) ||
    Math.abs(distribution.up - distribution.down) < 1
    ? "WAIT"
    : distribution.up > distribution.down ? "CALL" : "PUT";
  const favoredStrength = favoredSide === "CALL"
    ? distribution.up
    : favoredSide === "PUT" ? distribution.down : distribution.chop;
  const tone = favoredSide === "CALL" ? "call" : favoredSide === "PUT" ? "put" : "neutral";
  const candleTimestampMs = typeof lastCandleTime === "number" && Number.isFinite(lastCandleTime)
    ? (lastCandleTime < 1e12 ? lastCandleTime * 1000 : lastCandleTime)
    : null;
  const candleTimestampLabel = candleTimestampMs != null
    ? new Date(candleTimestampMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
    : "BAR TIME N/A";
  return (
    <div className={`warroom-probability-gauge is-${favoredSide.toLowerCase()}`} aria-label={`Directional model distribution: call ${Math.round(distribution.up)} percent, chop ${Math.round(distribution.chop)} percent, put ${Math.round(distribution.down)} percent`}>
      <div className="warroom-probability-gauge__heading">
        <span>DIRECTIONAL MODEL</span>
        <strong>{favoredSide === "WAIT" ? "CHOP / WAIT" : `${favoredSide} LEAN`}</strong>
      </div>
      <div className={`warroom-directional-dial__source ${quoteIsLive ? "is-live" : "is-chart"}`}>
        <span><i />{quoteIsLive ? "LIVE CHART + SPOT" : "CHART STRUCTURE · QUOTE NOT LIVE"}</span>
        <b>{timeframe.toUpperCase()} · {candleTimestampLabel}</b>
      </div>
      <div className={`warroom-smart-engine warroom-directional-dial is-${tone}`}>
        <div className="warroom-smart-engine__orbit"><i /><i /><i /></div>
        <svg viewBox="0 0 180 180" role="img" aria-label={`CALL strength ${Math.round(distribution.up)} percent; PUT strength ${Math.round(distribution.down)} percent`}>
          <circle className="warroom-smart-engine__halo" cx="90" cy="90" r="82" />
          {[...Array(32)].map((_, index) => {
            const angle = (index / 32) * Math.PI * 2 - Math.PI / 2;
            const inner = index % 4 === 0 ? 73 : 76;
            return <line
              className="warroom-directional-dial__tick"
              key={index}
              x1={90 + Math.cos(angle) * inner}
              y1={90 + Math.sin(angle) * inner}
              x2={90 + Math.cos(angle) * 80}
              y2={90 + Math.sin(angle) * 80}
            />;
          })}
          <path className="warroom-directional-dial__track" d="M90 20 A70 70 0 0 1 90 160" pathLength="50" />
          <path className="warroom-directional-dial__track" d="M90 20 A70 70 0 0 0 90 160" pathLength="50" />
          <path className="warroom-directional-dial__call" d="M90 20 A70 70 0 0 1 90 160" pathLength="50" style={{ strokeDasharray: `${distribution.up / 2} 50` }} />
          <path className="warroom-directional-dial__put" d="M90 20 A70 70 0 0 0 90 160" pathLength="50" style={{ strokeDasharray: `${distribution.down / 2} 50` }} />
        </svg>
        <div className="warroom-smart-engine__readout">
          <span>DOMINANT SIDE</span>
          <strong>{Math.round(favoredStrength)}<i>%</i></strong>
          <em>{favoredSide === "WAIT" ? "WAIT" : favoredSide}</em>
          <small>MODEL STRENGTH</small>
        </div>
      </div>
      <div className="warroom-directional-dial__readout">
        <span className="is-call"><i />CALL <b>{Math.round(distribution.up)}%</b></span>
        <span className="is-put"><i />PUT <b>{Math.round(distribution.down)}%</b></span>
      </div>
      <div className="warroom-probability-gauge__context">
        <span>CHOP {Math.round(distribution.chop)}%</span>
        <span>TAPE {direction}</span>
        <b>{favoredSide === "WAIT" ? "WAIT FOR EDGE" : `${favoredSide} LEADS BY ${Math.round(Math.abs(distribution.up - distribution.down))} POINTS`}</b>
      </div>
      <small>Directional model strength, not a calibrated options win probability. {favoredSide === "WAIT" ? "Chop currently dominates." : `${favoredSide} strength: ${Math.round(favoredStrength)}%.`}</small>
    </div>
  );
}

function PriceActionReversalReadout({
  direction,
  strength,
  bullishStrength,
  bearishStrength,
  patternNames,
  scalpExitWarning,
  volumeRatio,
  bodyQuality,
}: {
  direction: "CALL" | "PUT" | "MIXED" | "NONE";
  strength: number;
  bullishStrength: number;
  bearishStrength: number;
  patternNames: string[];
  scalpExitWarning: string | null;
  volumeRatio: number;
  bodyQuality: number;
}) {
  const reversalLabel = direction === "NONE"
    ? "NO REVERSAL CONFIRMED"
    : direction === "MIXED" ? "CONFLICTING REVERSAL READS" : `${direction} REVERSAL WATCH`;
  const tone = direction === "CALL" ? "call" : direction === "PUT" ? "put" : direction === "MIXED" ? "mixed" : "quiet";
  const evidenceLabel = scalpExitWarning
    ?? (patternNames.length ? patternNames.join(" / ") : direction === "NONE" ? "Closed-candle structure is not confirming a reversal" : "Closed candle + volume expansion");

  return (
    <div className={`warroom-reversal-readout is-${tone}`}>
      <div className="warroom-reversal-readout__heading">
        <span><Activity className="h-3.5 w-3.5" /> PRICE-ACTION REVERSAL ENGINE</span>
        <strong>{reversalLabel}</strong>
      </div>
      <div className="warroom-reversal-readout__signal">
        <b>{direction === "MIXED" ? "MIXED" : direction === "NONE" ? "—" : direction}</b>
        <div><i style={{ width: `${strength}%` }} /></div>
        <small>{direction === "NONE" ? "WAIT" : `${Math.round(strength)} STRENGTH`}</small>
      </div>
      <p>{evidenceLabel}</p>
      <div className="warroom-reversal-readout__evidence">
        <span>CALL {Math.round(bullishStrength)}</span>
        <span>PUT {Math.round(bearishStrength)}</span>
        <span>BODY {Math.round(bodyQuality * 100)}%</span>
        <span>VOL {volumeRatio.toFixed(2)}×</span>
      </div>
      <small>Closed-candle evidence only · reversal watch is not entry authorization.</small>
    </div>
  );
}

function PriceLadderRadar({ levels, spot, direction, tone }: { levels: StructureLevel[]; spot: number; direction: string; tone: "call" | "put" | "neutral" }) {
  const topLevels = levels.slice(0, 5);
  const orbitSeconds = Math.max(5, 16 - (topLevels.length * 0.8));
  const spinDirection = tone === "put" ? "reverse" : "normal";
  
  const ladderLevels = topLevels.map((level, index) => {
    const angle = (index / Math.max(topLevels.length, 1)) * Math.PI * 2 - Math.PI / 2;
    const radius = 33;
    const x = 50 + Math.cos(angle) * radius;
    const y = 50 + Math.sin(angle) * radius;
    const distance = Math.abs(level.price - spot);
    const isNearest = distance === Math.min(...topLevels.map(l => Math.abs(l.price - spot)));
    return { ...level, x, y, isNearest };
  });

  return (
    <div className={`warroom-price-ladder-radar is-${tone}`} style={{ ["--engine-spin-speed" as string]: `${orbitSeconds}s`, ["--engine-spin-direction" as string]: spinDirection }}>
      <div className="warroom-price-ladder-radar__orbit" style={{ animationDuration: `${orbitSeconds}s`, animationDirection: spinDirection }}><i /><i /></div>
      <svg viewBox="0 0 160 160" role="img">
        <circle cx="80" cy="80" r="48" className="warroom-price-ladder-radar__track" />
        <circle cx="80" cy="80" r="32" className="warroom-price-ladder-radar__track" />
        <path d="M80 20V140M20 80H140" className="warroom-price-ladder-radar__axis" />
        <circle cx="80" cy="80" r="8" className="warroom-price-ladder-radar__core" />
      </svg>
      <div className="warroom-price-ladder-radar__levels">
        {ladderLevels.map((level) => (
          <div
            key={`ladder-${level.label}-${level.price}`}
            className={`warroom-price-ladder-radar__level is-${level.kind} ${level.isNearest ? "is-nearest" : ""}`}
            style={{ left: `${level.x}%`, top: `${level.y}%` }}
          >
            <span>{level.label}</span>
            <strong>{value(level.price)}</strong>
          </div>
        ))}
      </div>
      <div className="warroom-price-ladder-radar__center"><strong>{value(spot)}</strong></div>
    </div>
  );
}

function WarRoomCandleChart({ candles, spot, upper, lower }: { candles: OHLC[]; spot: number; upper?: number; lower?: number }) {
  const visible = candles
    .slice(-52)
    .filter((candle) => [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite))
    .map((candle) => ({
      ...candle,
      high: Math.max(candle.high, candle.open, candle.close),
      low: Math.min(candle.low, candle.open, candle.close),
    }));
  if (visible.length < 3) return <div className="warroom-candle-chart is-empty">Waiting for live candle history...</div>;

  const width = 760;
  const height = 250;
  const plotTop = 18;
  const plotBottom = 218;
  const priceCandidates = visible.flatMap((candle) => [candle.high, candle.low]);
  if (Number.isFinite(upper as number)) priceCandidates.push(Number(upper));
  if (Number.isFinite(lower as number)) priceCandidates.push(Number(lower));
  if (Number.isFinite(spot)) priceCandidates.push(spot);
  const low = Math.min(...priceCandidates);
  const high = Math.max(...priceCandidates);
  const padding = Math.max((high - low) * 0.08, Math.abs(high) * 0.0005, 0.01);
  const minPrice = low - padding;
  const maxPrice = high + padding;
  const priceRange = Math.max(maxPrice - minPrice, 0.01);
  const y = (price: number) => plotTop + ((maxPrice - price) / priceRange) * (plotBottom - plotTop);
  const slot = width / visible.length;
  const candleWidth = Math.max(2.5, slot * 0.58);
  const levels = [
    Number.isFinite(upper as number) ? { label: "BREAKOUT", price: Number(upper), tone: "up" } : null,
    Number.isFinite(lower as number) ? { label: "BREAKDOWN", price: Number(lower), tone: "down" } : null,
    Number.isFinite(spot) ? { label: "SPOT", price: spot, tone: "spot" } : null,
  ].filter((level): level is { label: string; price: number; tone: string } => Boolean(level));
  const positionedLevels = levels
    .map((level) => ({ ...level, lineY: y(level.price), labelY: y(level.price) }))
    .sort((a, b) => a.lineY - b.lineY);
  const labelGap = 15;
  const labelTop = plotTop + 11;
  const labelBottom = plotBottom - 3;
  positionedLevels.forEach((level, index) => {
    const previousLabelY = index ? positionedLevels[index - 1].labelY : labelTop - labelGap;
    level.labelY = Math.max(labelTop, level.lineY, previousLabelY + labelGap);
  });
  const overflow = positionedLevels.at(-1)?.labelY ? Math.max(0, positionedLevels.at(-1)!.labelY - labelBottom) : 0;
  if (overflow > 0) positionedLevels.forEach((level) => { level.labelY -= overflow; });

  return <div className="warroom-candle-chart">
    <div className="warroom-candle-chart__header"><span>Live Candle Structure</span><strong>{visible.length} bars · {value(spot)}</strong></div>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${visible.length} candle live price chart`}>
      {[0, 1, 2, 3, 4].map((index) => {
        const gridY = plotTop + ((plotBottom - plotTop) / 4) * index;
        const gridPrice = maxPrice - (priceRange / 4) * index;
        return <g key={index}><line className="warroom-candle-chart__grid" x1="0" x2={width} y1={gridY} y2={gridY} /><text className="warroom-candle-chart__price" x={width - 5} y={gridY - 3} textAnchor="end">{gridPrice.toFixed(2)}</text></g>;
      })}
      {positionedLevels.map((level) => <g className={`warroom-candle-chart__level is-${level.tone}`} key={level.label}>
        <line x1="0" x2={width} y1={level.lineY} y2={level.lineY} />
        <rect x="5" y={level.labelY - 10} width="116" height="13" rx="2" />
        <text x="9" y={level.labelY}>{level.label} {level.price.toFixed(2)}</text>
      </g>)}
      {visible.map((candle, index) => {
        const x = index * slot + slot / 2;
        const bullish = candle.close >= candle.open;
        const bodyTop = y(Math.max(candle.open, candle.close));
        const bodyHeight = Math.max(1.6, Math.abs(y(candle.open) - y(candle.close)));
        return <g className={`warroom-candle-chart__candle is-${bullish ? "up" : "down"}`} key={`${candle.time ?? index}-${index}`}>
          <line x1={x} x2={x} y1={y(candle.high)} y2={y(candle.low)} />
          <rect x={x - candleWidth / 2} y={bodyTop} width={candleWidth} height={bodyHeight} />
        </g>;
      })}
    </svg>
  </div>;
}
