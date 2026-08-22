import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Activity, Brain, Crosshair, Radar, ShieldAlert, Target, Waves, Zap } from "lucide-react";
import type { AnalysisPayload, OHLC, SmartSignal } from "@shared/schema";

interface WarRoomCommandDeckProps {
  analysis: AnalysisPayload;
  lastPrice: number;
  spotIsLive: boolean;
  timeframe: string;
}

interface FusionCommandData {
  currentPrice?: number;
  expectedMove?: { dollars?: number; pct?: number; confidence?: number };
  breakoutZones?: { upper?: number; lower?: number; retest?: number; invalidation?: number; upsideTarget1?: number; upsideTarget2?: number; downsideTarget1?: number; downsideTarget2?: number };
  breakoutLifecycle?: { state?: string; zoneLow?: number; zoneHigh?: number };
  compressionCluster?: {
    active?: boolean;
    bbSqueezeActive?: boolean;
    keltnerBreakoutSide?: "upper" | "lower" | "none";
    healthLow?: boolean;
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
    sample?: { total?: number; completed?: number; wins?: number; losses?: number; pending?: number; winRate?: number };
    byMode?: {
      EXECUTE?: { total?: number; completed?: number; wins?: number; losses?: number; winRate?: number };
      PREPARE?: { total?: number; completed?: number; wins?: number; losses?: number; winRate?: number; promoted?: number; promotionRate?: number };
    };
    lead10m?: { total?: number; completed?: number; wins?: number; losses?: number; winRate?: number };
    byDirection?: Record<string, { total?: number; completed?: number; wins?: number; losses?: number; winRate?: number }>;
    topLeadProfiles?: Array<{ label?: string; total?: number; wins?: number; losses?: number; winRate?: number }>;
  };
}

interface EdgeTuningData {
  currentWindow?: {
    sample?: {
      edgeSampleCount?: number;
      completed?: number;
      wins?: number;
      losses?: number;
      winRate?: number;
      execute?: { completed?: number; wins?: number; losses?: number; winRate?: number };
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
  symbolsScanned?: number;
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
    state: "WATCH" | "ARMING" | "TRIGGERED";
    qualifies: boolean;
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
  state: "WATCH" | "ARMING" | "TRIGGERED";
}

interface TradingViewEvidenceData {
  success?: boolean;
  lookback?: { days?: number };
  baseline?: { total?: number; winRate?: number };
  topRules?: Array<{ rule?: string; support?: number; wins?: number; winRate?: number; lift?: number }>;
}

interface PatternData {
  patterns?: Array<{
    name?: string;
    type?: "bullish" | "bearish" | "neutral" | string;
    category?: string;
    confidence?: number;
    description?: string;
    priceTarget?: number;
    pt1?: number;
    pt2?: number;
    stopLoss?: number;
  }>;
}

function value(value: number | undefined): string {
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

export function WarRoomCommandDeck({ analysis, lastPrice, spotIsLive, timeframe }: WarRoomCommandDeckProps) {
  const [activeView, setActiveView] = useState<"execution" | "smart" | "evidence" | "flow" | "radar" | "patterns" | "review">("execution");
  const [heldContract, setHeldContract] = useState("");
  const [entryPremium, setEntryPremium] = useState("");
  const [positionSize, setPositionSize] = useState("");
  const [focusedScalpSymbol, setFocusedScalpSymbol] = useState<string | null>(null);
  const { data: fusion, dataUpdatedAt: fusionUpdatedAt } = useQuery<FusionCommandData>({
    queryKey: ["/api/fusion", analysis.symbol],
    enabled: Boolean(analysis.symbol),
    refetchInterval: 30000,
    staleTime: 10000,
    retry: false,
  });
  const { data: breakoutHistory } = useQuery<BreakoutHistoryData>({
    queryKey: ["/api/scanner/breakout-log/summary", "48h"],
    queryFn: async () => {
      const response = await fetch("/api/scanner/breakout-log/summary?hours=48");
      if (!response.ok) throw new Error("Unable to load breakout history");
      return response.json();
    },
    refetchInterval: 60000,
    staleTime: 30000,
    retry: false,
  });
  const { data: edgeTuning } = useQuery<EdgeTuningData>({
    queryKey: ["/api/scanner/edge-tuning/2d", "current"],
    queryFn: async () => {
      const response = await fetch("/api/scanner/edge-tuning/2d?limit=1");
      if (!response.ok) throw new Error("Unable to load edge calibration");
      return response.json();
    },
    refetchInterval: 60000,
    staleTime: 30000,
    retry: false,
  });
  const { data: scannerPlayAlerts } = useQuery<ScannerPlayAlertsData>({
    queryKey: ["/api/scanner/breakout-log", analysis.symbol],
    queryFn: async () => {
      const response = await fetch(`/api/scanner/breakout-log?symbol=${encodeURIComponent(analysis.symbol)}&hours=12&limit=25`);
      if (!response.ok) throw new Error("Unable to load scanner plays");
      return response.json();
    },
    enabled: Boolean(analysis.symbol),
    refetchInterval: 30000,
    staleTime: 10000,
    retry: false,
  });
  const { data: scalpScan } = useQuery<ScalpConfluenceData>({
    queryKey: ["/api/scanner/scalp-confluence"],
    refetchInterval: 30000,
    staleTime: 10000,
    retry: false,
  });
  const { data: evidence } = useQuery<TradingViewEvidenceData>({
    queryKey: ["/api/analytics/tradingview-evidence"],
    refetchInterval: 5 * 60 * 1000,
    staleTime: 4 * 60 * 1000,
    retry: false,
  });
  const { data: patternData } = useQuery<PatternData>({
    queryKey: ["/api/patterns", analysis.symbol, timeframe],
    queryFn: async () => {
      const response = await fetch(`/api/patterns/${encodeURIComponent(analysis.symbol)}/${encodeURIComponent(timeframe)}`);
      if (!response.ok) throw new Error("Unable to load chart patterns");
      return response.json();
    },
    enabled: Boolean(analysis.symbol && timeframe),
    refetchInterval: 30000,
    staleTime: 15000,
    retry: false,
  });

  const signal = fusion?.unifiedSignal;
  const smartSignal = fusion?.smartSignal;
  const zones = fusion?.breakoutZones;
  // Dashboard supplies the freshest validated /api/spot quote; fusion may belong to an older analysis cycle.
  const spot = lastPrice > 0 ? lastPrice : fusion?.currentPrice ?? 0;
  const direction = signal?.unifiedDirection ?? "WAIT";
  const smartTone = smartSignal?.direction === "CALL" ? "call" : smartSignal?.direction === "PUT" ? "put" : "neutral";
  const smartMove = smartSignal?.direction === "CALL"
    ? `+${value(fusion?.expectedMove?.dollars)}`
    : smartSignal?.direction === "PUT"
      ? `-${value(fusion?.expectedMove?.dollars)}`
      : value(fusion?.expectedMove?.dollars);
  const hasExecution = direction !== "WAIT" && Boolean(signal?.entryZone && signal.stopLoss && signal.priceTargets?.length);
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
  const breakoutSummary = breakoutHistory?.summary;
  const activeScannerPlay = (scannerPlayAlerts?.entries ?? []).find((entry) =>
    entry.outcome === "pending" && entry.direction !== "neutral" && entry.signalQuality !== "UNRELIABLE",
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
  const calibrationReady = executionResolved >= 20 && (executionCalibration ?? 0) >= 55;
  const calibrationTone = calibrationReady ? "validated" : executionResolved >= 20 ? "caution" : "building";
  const calibrationStatus = calibrationReady ? "EXECUTION VALIDATED" : executionResolved >= 20 ? "EXECUTION CAUTION" : "BUILDING SAMPLE";
  const scalpCandidates = scalpScan?.candidates ?? [];
  const radarTracks = scalpScan?.radarTracks ?? [];
  const displayScalpTracks: DisplayScalpTrack[] = (scalpCandidates.length ? scalpCandidates : radarTracks).map((track) => ({
    ...track,
    state: "state" in track ? track.state : track.breakout ? "TRIGGERED" : track.score >= 70 ? "ARMING" : "WATCH",
  }));
  const focusedScalpTrack = displayScalpTracks.find((track) => track.symbol === focusedScalpSymbol) ?? displayScalpTracks[0];
  const visibleScalpTracks = displayScalpTracks.slice(0, 3);
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
  const radarAlerting = radarState === "ARMING" || radarState === "TRIGGERED" || scalpCandidates.length > 0;
  const topEvidenceRule = evidence?.topRules?.[0];
  const compression = fusion?.compressionCluster;
  const monster = fusion?.monsterOtm;
  const monsterPlay = monster?.play;
  const monsterGate = fusion?.monsterGateDecision;
  const volumeRead = buildVolumeRead(analysis);
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
  const hasHeldPosition = heldContract.trim().length > 0;
  const tradeManagement = !isBreakoutTriggered || !breakoutDirection
    ? null
    : breakoutDirection === "CALL"
      ? spot <= (breakoutStop ?? Number.NEGATIVE_INFINITY)
        ? "Stop area reached: protect the position or exit according to your plan."
        : spot >= (breakoutTargetTwo ?? Number.POSITIVE_INFINITY)
          ? "Second target reached: protect gains and manage any runner."
          : spot >= (breakoutTargetOne ?? Number.POSITIVE_INFINITY)
            ? "First target reached: consider taking partial profit and protecting the remainder."
            : "Breakout is live: hold only while price stays above the invalidation level."
      : spot >= (breakoutStop ?? Number.POSITIVE_INFINITY)
        ? "Stop area reached: protect the position or exit according to your plan."
        : spot <= (breakoutTargetTwo ?? Number.NEGATIVE_INFINITY)
          ? "Second target reached: protect gains and manage any runner."
          : spot <= (breakoutTargetOne ?? Number.NEGATIVE_INFINITY)
            ? "First target reached: consider taking partial profit and protecting the remainder."
            : "Breakdown is live: hold only while price stays below the invalidation level.";
  const isCompressionArmed = Boolean(compression?.active && !compression.healthLow);
  const optionPlayLive = Boolean(monster?.hasPlay && monsterPlay && !monsterGate?.conflict);
  const ignitionState = optionPlayLive ? "PLAY LIVE" : isBreakoutTriggered ? "TRIGGERED" : isCompressionArmed ? "ARMED" : "WATCH";
  const ignitionTone = optionPlayLive ? "live" : isBreakoutTriggered ? "triggered" : isCompressionArmed ? "armed" : "watch";
  const chopDominant = chopProb >= upProb && chopProb >= downProb;
  const evidenceDirection = confirmedScannerPut
    ? "PUT"
    : direction === "CALL" && chopDominant
      ? "WAIT"
      : direction;
  const directionalProbability = evidenceDirection === "CALL" ? upProb : evidenceDirection === "PUT" ? downProb : Math.max(upProb, downProb);
  const calibrationDirection = evidenceDirection === "CALL" ? "bullish" : evidenceDirection === "PUT" ? "bearish" : "neutral";
  const calibration = breakoutSummary?.byDirection?.[calibrationDirection];
  const evidenceScore = Math.max(0, (topEvidenceRule?.winRate ?? evidence?.baseline?.winRate ?? 0) - 45) * 1.65;
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
  const preferredLevel = direction === "CALL" ? nextUpsideLevel : direction === "PUT" ? nextDownsideLevel : null;
  const nextStructureTest = preferredLevel
    ? `${direction === "CALL" ? "Clear" : "Hold above"} ${preferredLevel.label} ${value(preferredLevel.price)}`
    : "Await a clean break of the trigger range";
  const positionKey = `aegis-warroom-position:${analysis.symbol}`;
  const executionState = optionPlayLive ? "MANAGE" : isBreakoutTriggered ? "TRIGGERED" : isCompressionArmed ? "ARMED" : "WATCH";
  const executionTiltDirection = direction === "CALL" ? "CALL" : direction === "PUT" ? "PUT" : "WAIT";
  const executionTiltScore = executionTiltDirection === "CALL" ? upProb : executionTiltDirection === "PUT" ? downProb : Math.max(upProb, downProb);
  const executionTone = executionTiltDirection === "CALL" ? "call" : executionTiltDirection === "PUT" ? "put" : "neutral";
  const compressionStrength = clampScore((compression?.active ? 70 : 38) + (volumeRead.ratio >= 1.3 ? 22 : volumeRead.ratio >= 1 ? 8 : 0) + (isCompressionArmed ? 10 : 0));
  const fusionSyncLabel = fusionUpdatedAt
    ? `Fusion synced ${new Date(fusionUpdatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}`
    : "Fusion data pending";
  const mtfScore = toPercentScale(fusion?.mtfConsensus?.alignmentScore);
  const timeframeFrames = fusion?.timeframes ?? [];
  const bullishTimeframes = timeframeFrames.filter((frame) => frame.trendBias === "bullish").length;
  const bearishTimeframes = timeframeFrames.filter((frame) => frame.trendBias === "bearish").length;
  const gateChecks: Array<{ label: string; detail: string; passed: boolean; status?: "pass" | "blocked" | "caution" }> = [
    {
      label: "Price trigger",
      detail: direction === "CALL" ? `Needs ${value(zones?.upper)} reclaim` : direction === "PUT" ? `Needs ${value(zones?.lower)} hold` : "Await directional trigger",
      passed: isBreakoutTriggered,
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
  ];
  const gateBlockers = gateChecks.filter((check) => !check.passed && check.status !== "caution");

  useEffect(() => {
    const savedPosition = window.localStorage.getItem(positionKey);
    if (!savedPosition) return;
    try {
      const position = JSON.parse(savedPosition) as { contract?: string; premium?: string; size?: string };
      setHeldContract(position.contract ?? "");
      setEntryPremium(position.premium ?? "");
      setPositionSize(position.size ?? "");
    } catch {
      window.localStorage.removeItem(positionKey);
    }
  }, [positionKey]);

  useEffect(() => {
    const position = { contract: heldContract, premium: entryPremium, size: positionSize };
    if (!position.contract && !position.premium && !position.size) {
      window.localStorage.removeItem(positionKey);
      return;
    }
    window.localStorage.setItem(positionKey, JSON.stringify(position));
  }, [entryPremium, heldContract, positionKey, positionSize]);

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
          ["smart", "Smart Signal"],
          ["evidence", "Evidence"],
          ["flow", "Flow"],
          ["radar", "Radar"],
          ["patterns", "Patterns"],
          ["review", "Review"],
        ] as const).map(([view, label]) => (
          <button
            className={`${activeView === view ? "is-active" : ""} ${view === "radar" && radarAlerting ? `is-alerting is-${radarState.toLowerCase()}` : ""}`}
            key={view}
            onClick={() => setActiveView(view)}
            role="tab"
            aria-selected={activeView === view}
            type="button"
          >
            <span>{label}</span>
            {view === "radar" && radarAlerting ? <i>{radarState === "TRIGGERED" ? "LIVE" : "ARMING"}</i> : null}
          </button>
        ))}
      </div>

      {activeView === "execution" ? (
        <div className="warroom-execution">
          <div className={`warroom-execution__state is-${executionState.toLowerCase()}`}>
            <div className="warroom-execution__radar-pair">
              <div className={`warroom-execution__radar-card is-${executionTone}`}>
                <div className="warroom-command-deck__label"><Radar className="h-3.5 w-3.5" /> Market Tilt</div>
                <SmartEngineDial
                  probability={executionTiltScore}
                  confidence={Math.min(100, Math.round(executionTiltScore + 12))}
                  reliability={Math.min(100, Math.round((volumeRead.ratio / 1.5) * 100))}
                  direction={executionTiltDirection}
                  tone={executionTone as "call" | "put" | "neutral"}
                  levels={structureLevels}
                  spot={spot}
                />
              </div>
              <div className={`warroom-execution__radar-card is-${isCompressionArmed ? "neutral" : "neutral"} ${isCompressionArmed ? "is-active" : ""}`}>
                <div className="warroom-command-deck__label"><Activity className="h-3.5 w-3.5" /> Compression</div>
                <SmartEngineDial
                  probability={compressionStrength}
                  confidence={compressionStrength}
                  reliability={Math.min(100, compressionStrength + 10)}
                  direction={"WAIT"}
                  tone={isCompressionArmed ? "neutral" : "neutral"}
                />
              </div>
            </div>
            <div className="warroom-execution__state-copy">
              <span>Trade State</span>
              <strong>{executionState}</strong>
              <small>{action}</small>
              <em>{fusionSyncLabel}</em>
            </div>
          </div>
          <div className="warroom-execution__ladder-summary">
            <div className="warroom-command-deck__label"><Waves className="h-3.5 w-3.5" /> Live Price Ladder</div>
            <PriceLadderRadar levels={structureLevels} spot={spot} direction={direction} tone={executionTone as "call" | "put" | "neutral"} />
            <div className="warroom-structure-map__spot"><span>{spotIsLive ? "LIVE SPOT" : "ANALYSIS PRICE"}</span><strong>{value(spot)}</strong><small>{nextStructureTest}</small></div>
          </div>
          <div className="warroom-execution__gate">
            <div className="warroom-command-deck__label"><ShieldAlert className="h-3.5 w-3.5" /> {gateBlockers.length ? "Why Wait" : "Execution Gate Clear"}</div>
            <div className="warroom-gate-checks">
              {gateChecks.map((check) => <GateCheck key={check.label} {...check} />)}
            </div>
          </div>
          <div className={`warroom-calibration-guard is-${calibrationTone}`}>
            <div className="warroom-command-deck__intel-heading">
              <div className="warroom-command-deck__label"><Brain className="h-3.5 w-3.5" /> 48H Calibration Guard</div>
              <span>{calibrationStatus}</span>
            </div>
            <div className="warroom-calibration-guard__score">
              <strong>{percent(executionCalibration)}</strong>
              <div><span>Observed execution win rate</span><small>{executionResolved} completed alerts</small></div>
            </div>
            <div className="warroom-calibration-guard__metrics">
              <PlanValue label={`${calibrationDirection} edge`} value={`${percent(calibration?.winRate)} · ${calibration?.completed ?? 0}`} />
              <PlanValue label="Engine samples" value={`${tuningWindow?.sample?.edgeSampleCount ?? 0}`} />
              <PlanValue label="Avg trigger" value={percent(tuningWindow?.quality?.avgTriggerProbability)} />
            </div>
            <p>{calibrationReady ? "Historical execution supports the gate. A fresh price break and volume confirmation are still required." : "High model scores are not an entry by themselves. Require a fresh break, volume confirmation, and a live option gate."}</p>
          </div>
          {activeScannerPlay ? (
            <div className={`warroom-scanner-play is-${activeScannerPlay.direction}`}>
              <div className="warroom-command-deck__label"><Radar className="h-3.5 w-3.5" /> Scanner Play</div>
              <div className="warroom-scanner-play__heading">
                <strong>{activeScannerPlay.direction === "bearish" ? "POTENTIAL PUT" : "POTENTIAL CALL"}</strong>
                <span>{activeScannerPlay.mode === "EXECUTE" ? "EXECUTE" : "CONFIRM"}</span>
              </div>
              <p>{activeScannerPlay.warnings.includes("POTENTIAL_PUT_PLAY") ? "Failed upside breakout confirmed on closed candles." : `${activeScannerPlay.signal} scanner setup from ${activeScannerPlay.timeframe}.`}</p>
              <div className="warroom-scanner-play__levels">
                <PlanValue label="Entry" value={value(activeScannerPlay.priceAtCapture)} />
                <PlanValue label="Stop" value={value(activeScannerPlay.stopLoss)} />
                <PlanValue label="T1" value={value(activeScannerPlay.targets[0])} />
                <PlanValue label="Score" value={`${Math.round(activeScannerPlay.breakoutScore)}`} />
              </div>
            </div>
          ) : null}
          <div className="warroom-position-manager">
            <div className="warroom-command-deck__label"><Crosshair className="h-3.5 w-3.5" /> Position Manager</div>
            <div className="warroom-position-manager__inputs">
              <input value={heldContract} onChange={(event) => setHeldContract(event.target.value)} placeholder="Contract, e.g. SPY 640C" aria-label="Your option contract" />
              <input value={entryPremium} onChange={(event) => setEntryPremium(event.target.value)} inputMode="decimal" placeholder="Entry premium" aria-label="Option entry premium" />
              <input value={positionSize} onChange={(event) => setPositionSize(event.target.value)} inputMode="numeric" placeholder="Contracts" aria-label="Number of option contracts" />
            </div>
            <p>{hasHeldPosition ? `${heldContract.trim()}${entryPremium.trim() ? ` at ${entryPremium.trim()}` : ""}${positionSize.trim() ? ` x ${positionSize.trim()}` : ""}: ${tradeManagement ?? "Await a confirmed breakout to begin management."}` : "Enter a position to keep contract details visible while the setup evolves."}</p>
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
              <div className="warroom-breakout-manager__inputs">
                <input value={heldContract} onChange={(event) => setHeldContract(event.target.value)} placeholder="Your contract, e.g. SPY 640C" aria-label="Your option contract" />
                <input value={entryPremium} onChange={(event) => setEntryPremium(event.target.value)} inputMode="decimal" placeholder="Paid premium" aria-label="Option entry premium" />
              </div>
              <p className="warroom-breakout-manager__status">{hasHeldPosition ? `${heldContract.trim()}${entryPremium.trim() ? ` at ${entryPremium.trim()}` : ""}: ` : "Add your contract to manage it: "}{tradeManagement}</p>
            </div>
          ) : null}
        </div> : null}
        {activeView === "patterns" ? <div className="warroom-command-deck__intel-card warroom-command-deck__patterns-card">
          <div className="warroom-command-deck__intel-heading">
            <div className="warroom-command-deck__label"><Waves className="h-3.5 w-3.5" /> Live Chart Patterns</div>
            <span className="warroom-command-deck__patterns-window">{timeframe} MAP</span>
          </div>
          <WarRoomCandleChart candles={analysis.ohlc ?? []} spot={spot} upper={zones?.upper} lower={zones?.lower} />
          {(patternData?.patterns ?? []).length ? (
            <div className="warroom-pattern-grid">
              {(patternData?.patterns ?? []).slice(0, 6).map((pattern, index) => {
                const type = String(pattern.type ?? "neutral").toLowerCase();
                return <div className={`warroom-pattern-card is-${type}`} key={`${pattern.name}-${index}`}>
                  <div><span>{pattern.category ?? "STRUCTURE"}</span><strong>{pattern.name ?? "Pattern"}</strong></div>
                  <em>{percent(pattern.confidence)}</em>
                  <p>{pattern.description ?? "Live structure detected. Use the trigger level and confirmation gate before entry."}</p>
                  <div className="warroom-pattern-card__levels">
                    <PlanValue label="Target" value={value(pattern.pt1 ?? pattern.priceTarget)} />
                    <PlanValue label="Runner" value={value(pattern.pt2)} />
                    <PlanValue label="Stop" value={value(pattern.stopLoss)} />
                  </div>
                </div>;
              })}
            </div>
          ) : <div className="warroom-patterns-empty">No live chart pattern has cleared the current confidence threshold. The structure map remains active while the pattern engine rebuilds.</div>}
        </div> : null}
        {activeView === "execution" ? <div className={`warroom-command-deck__intel-card warroom-command-deck__ignition-card is-${ignitionTone}`}>
          <div className="warroom-command-deck__intel-heading">
            <div className="warroom-command-deck__label"><Zap className="h-3.5 w-3.5" /> Option Ignition</div>
            <span className={`warroom-command-deck__ignition-state is-${ignitionTone}`}>{ignitionState}</span>
          </div>
          <div className="warroom-command-deck__ignition-main">
            <div><span>Contract</span><strong>{optionPlayLive ? `${monsterPlay?.side?.toUpperCase()} ${monsterPlay?.strike?.toFixed(0)}` : "AWAIT GATE"}</strong></div>
            <div><span>OTM Print Odds</span><strong>{percent(monsterPlay?.probability ?? monster?.breakout?.hitProbability)}</strong></div>
            <div><span>Directional Edge</span><strong>{Math.round(directionalProbability)}%</strong></div>
          </div>
          <div className="warroom-command-deck__ignition-levels">
            <PlanValue label="Target" value={value(monsterPlay?.targetPrice ?? targets[0])} />
            <PlanValue label="Stop" value={value(monsterPlay?.stopPrice ?? signal?.stopLoss)} />
            <PlanValue label="Delta" value={decimalPercent((monsterPlay?.delta ?? 0) * 100)} />
            <PlanValue label="Room" value={monsterPlay?.roomPoints ? `${monsterPlay.roomPoints.toFixed(2)} pts` : "--"} />
          </div>
          <p className="warroom-command-deck__ignition-note">{monster?.breakout?.alert ?? monsterPlay?.reason ?? compression?.reasons?.[0] ?? "Waiting for compression, directional confirmation, and a valid option gate."}</p>
        </div> : null}
        {activeView === "flow" ? <div className="warroom-command-deck__intel-card warroom-command-deck__intent-card">
          <div className="warroom-command-deck__intel-heading">
            <div className="warroom-command-deck__label"><Brain className="h-3.5 w-3.5" /> Institutional Intent</div>
            <span className={`warroom-command-deck__intent-status is-${intentStatus.toLowerCase()}`}>{intentStatus}</span>
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
        {activeView === "flow" ? <div className="warroom-command-deck__intel-card warroom-command-deck__structure-card">
          <div className="warroom-command-deck__intel-heading">
            <div className="warroom-command-deck__label"><Waves className="h-3.5 w-3.5" /> Structure Map</div>
            <span className={`warroom-command-deck__structure-bias is-${orderBlockDirection.toLowerCase()}`}>{orderBlockDirection} BLOCK</span>
          </div>
          <div className="warroom-structure-map" aria-label="Live price structure ladder">
            {structureLevels.length ? structureLevels.map((level) => (
              <StructureLevelRow key={`${level.label}-${level.price}`} level={level} spot={spot} />
            )) : <div className="warroom-structure-map__empty">Synchronizing live structural levels...</div>}
          </div>
          <div className="warroom-structure-map__spot"><span>LIVE SPOT</span><strong>{value(spot)}</strong><small>{nextStructureTest}</small></div>
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
        {activeView === "flow" ? <div className="warroom-command-deck__intel-card warroom-command-deck__volume-card">
          <div className="warroom-command-deck__intel-heading">
            <div className="warroom-command-deck__label"><Activity className="h-3.5 w-3.5" /> Volume Confirmation</div>
            <span className={`warroom-command-deck__volume-state ${volumeRead.ratio >= 1.3 ? "is-confirmed" : ""}`}>{volumeRead.ratio >= 1.3 ? "CONFIRMED" : "NEUTRAL"}</span>
          </div>
          <VolumePulse bars={volumeRead.bars} average={volumeRead.average} ratio={volumeRead.ratio} />
          <div className="warroom-command-deck__volume-grid">
            <PlanValue label="Last / 20 Bar" value={`${volumeRead.ratio.toFixed(2)}x`} />
            <PlanValue label="Last / Baseline" value={volumeRead.latest ? `${Math.round(volumeRead.latest / 1000)}K / ${Math.round(volumeRead.average / 1000)}K` : "--"} />
            <PlanValue label="Compression" value={isCompressionArmed ? "ARMED" : compression?.bbSqueezeActive ? "SQUEEZE" : "OFF"} />
            <PlanValue label="Historical Edge" value={`${percent(calibration?.winRate)} · ${calibration?.completed ?? 0}`} />
          </div>
          <p className="warroom-command-deck__volume-note">Compare volume expansion with the directional probability and resolved alert history before changing thresholds.</p>
        </div> : null}
        {activeView === "radar" ? <div className="warroom-command-deck__intel-card warroom-command-deck__scalp-card">
          <div className="warroom-command-deck__intel-heading">
            <div className="warroom-command-deck__label"><Radar className="h-3.5 w-3.5" /> 3M Breakout Radar V2</div>
            <span className={`warroom-command-deck__radar-state is-${radarState.toLowerCase()}`}>{scalpScan?.isScanning ? "SCANNING" : radarState}</span>
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
              <strong>{radarState === "STANDBY" ? "WAITING" : radarState === "ARMING" ? "WATCHLIST ACTIVE" : "BREAKOUT LIVE"}</strong>
              <small>{radarTracks.length ? `${scalpCandidates.length} qualified / ${radarTracks.length} tracked` : "Scanning for the next completed bar."}</small>
            </div>
            <div className="warroom-smart-signal__sample">
              <span>Top Signal</span>
              <strong>{focusedScalpTrack?.symbol ?? "--"}</strong>
              <small>{focusedScalpTrack ? `${focusedScalpTrack.direction} · ${Math.round(focusedScalpTrack.score)} score` : "No focus yet"}</small>
            </div>
          </div>

          <div className="warroom-command-deck__radar-workspace" style={{ marginTop: "0.6rem" }}>
            <div className="warroom-command-deck__radar-stage">
              <ScalpRadar tracks={radarTracks} focusedSymbol={focusedScalpTrack?.symbol} />
              <div className="warroom-command-deck__radar-summary">
                <PlanValue label="Qualified" value={`${scalpCandidates.length} / ${radarTracks.length}`} />
                <PlanValue label="Confirmed" value={`${radarTracks.filter((track) => track.state === "TRIGGERED").length} breaks`} />
                <PlanValue label="Engine" value="MOMO + CLOSE + TREND" />
              </div>
              {focusedScalpTrack ? (
                <div className={`warroom-command-deck__scalp-focus is-${focusedScalpTrack.direction.toLowerCase()} is-${focusedScalpTrack.state.toLowerCase()}`}>
                  <div><span>Radar Focus</span><strong>{focusedScalpTrack.symbol} {focusedScalpTrack.direction}</strong></div>
                  <div><span>State</span><strong>{focusedScalpTrack.state}</strong></div>
                  <div><span>Break Strength</span><strong>{focusedScalpTrack.breakout ? `${(focusedScalpTrack.breakoutDistancePct ?? 0).toFixed(2)}%` : "SETTING UP"}</strong></div>
                  <div><span>Close / Trend</span><strong>{Math.round((focusedScalpTrack.closeStrength ?? 0) * 100)}% / {focusedScalpTrack.trendAligned ? "YES" : "NO"}</strong></div>
                </div>
              ) : <div className="warroom-command-deck__scalp-focus is-empty"><div><span>Radar Status</span><strong>MONITORING WATCHLIST</strong></div><div><span>Rule</span><strong>WAIT FOR CLOSE + TREND</strong></div></div>}
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
                      </div>
                      <div className="warroom-command-deck__scalp-score"><span>{candidate.state}</span><strong>{Math.round(candidate.score)}</strong></div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="warroom-command-deck__scalp-empty">No radar tracks yet. The engine is waiting for the next completed bar before it ranks breakout quality.</div>
              )}
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

function StructureLevelRow({ level, spot }: { level: StructureLevel; spot: number }) {
  const distance = ((level.price - spot) / spot) * 100;
  const isAbove = level.price > spot;
  const isActive = Math.abs(level.price - spot) / Math.max(Math.abs(spot), 1) <= 0.006 || level.kind === "trigger" || level.kind === "target" || level.kind === "liquidity";
  return (
    <div className={`warroom-structure-map__row is-${level.kind} ${isAbove ? "is-above" : "is-below"} ${isActive ? "is-active" : ""}`}>
      <span className="warroom-structure-map__marker" />
      <span className="warroom-structure-map__label">{level.label}</span>
      <strong>{value(level.price)}</strong>
      <small>{isAbove ? "+" : ""}{distance.toFixed(2)}%</small>
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

function ScalpRadar({ tracks, focusedSymbol }: { tracks: NonNullable<ScalpConfluenceData["radarTracks"]>; focusedSymbol?: string }) {
  return (
    <div className="warroom-scalp-radar" aria-label="Three-minute scanner radar">
      <svg viewBox="0 0 160 160" role="img" aria-label={`${tracks.length} ranked scanner tracks`}>
        <circle cx="80" cy="80" r="67" className="warroom-scalp-radar__ring" />
        <circle cx="80" cy="80" r="44" className="warroom-scalp-radar__ring" />
        <circle cx="80" cy="80" r="21" className="warroom-scalp-radar__ring" />
        <path d="M80 10V150M10 80H150" className="warroom-scalp-radar__axis" />
        {tracks.map((track, index) => {
          const angle = (index / Math.max(tracks.length, 1)) * Math.PI * 2 - Math.PI / 2;
          const closeStrength = Math.max(0, Math.min(1, track.closeStrength ?? 0));
          const alignment = track.trendAligned ? 1 : 0;
          const triggered = track.state === "TRIGGERED" ? 1 : track.state === "ARMING" ? 0.55 : 0.2;
          const strength = Math.max(0, Math.min(1, (track.score / 100) * 0.5 + closeStrength * 0.25 + alignment * 0.15 + triggered * 0.1));
          const fadingLong = track.direction === "LONG" && strength < 0.58;
          const distance = 68 - strength * 48;
          const x = 80 + Math.cos(angle) * distance;
          const y = 80 + Math.sin(angle) * distance;
          return (
            <g key={track.symbol} className={`warroom-scalp-radar__contact is-${track.direction.toLowerCase()} is-${track.state.toLowerCase()} ${fadingLong ? "is-fading" : ""} ${track.symbol === focusedSymbol ? "is-focused" : ""}`}>
              <title>{`${track.symbol}: ${track.direction} ${track.score} ${track.state}`}</title>
              <circle cx={x} cy={y} r={track.state === "TRIGGERED" ? 6 : 4.5} />
              <text x={x} y={y - 8} textAnchor="middle">{track.symbol}</text>
            </g>
          );
        })}
        <circle cx="80" cy="80" r="4" className="warroom-scalp-radar__core" />
      </svg>
      <div className="warroom-scalp-radar__legend"><span><i className="is-long" />LONG</span><span><i className="is-short" />SHORT</span><span>{tracks.length} TRACKS</span></div>
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

function SmartEngineDial({
  probability,
  confidence,
  reliability,
  direction,
  tone,
  levels = [],
  spot,
}: {
  probability: number;
  confidence: number;
  reliability: number;
  direction: SmartSignal["direction"];
  tone: "call" | "put" | "neutral";
  levels?: StructureLevel[];
  spot?: number;
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
    aria-label={`Smart signal engine ${direction} at ${score} percent`}
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
    <div className="warroom-smart-engine__spot" aria-label={`Live spot price ${value(spot)}`}>
      <span>SPOT</span>
      <strong>{value(spot)}</strong>
    </div>
    <div className="warroom-smart-engine__readout"><span>SMART ENGINE</span><strong>{score}</strong><em>{direction}</em><small>{reliabilityScore}% history lock</small></div>
  </div>;
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
  const visible = candles.slice(-52).filter((candle) => [candle.open, candle.high, candle.low, candle.close].every(Number.isFinite));
  if (visible.length < 3) return <div className="warroom-candle-chart is-empty">Waiting for live candle history...</div>;

  const width = 760;
  const height = 250;
  const plotTop = 18;
  const plotBottom = 218;
  const priceCandidates = visible.flatMap((candle) => [candle.high, candle.low]);
  if (Number.isFinite(upper as number)) priceCandidates.push(Number(upper));
  if (Number.isFinite(lower as number)) priceCandidates.push(Number(lower));
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

  return <div className="warroom-candle-chart">
    <div className="warroom-candle-chart__header"><span>Live Candle Structure</span><strong>{visible.length} bars · {value(spot)}</strong></div>
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${visible.length} candle live price chart`}>
      {[0, 1, 2, 3, 4].map((index) => {
        const gridY = plotTop + ((plotBottom - plotTop) / 4) * index;
        const gridPrice = maxPrice - (priceRange / 4) * index;
        return <g key={index}><line className="warroom-candle-chart__grid" x1="0" x2={width} y1={gridY} y2={gridY} /><text className="warroom-candle-chart__price" x={width - 5} y={gridY - 3} textAnchor="end">{gridPrice.toFixed(2)}</text></g>;
      })}
      {levels.map((level) => <g className={`warroom-candle-chart__level is-${level.tone}`} key={level.label}><line x1="0" x2={width} y1={y(level.price)} y2={y(level.price)} /><text x="6" y={y(level.price) - 4}>{level.label} {level.price.toFixed(2)}</text></g>)}
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