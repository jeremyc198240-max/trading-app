import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Brain, Sparkles } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { AnalysisPayload, Timeframe } from "@shared/schema";

interface ChronosCalloutProps {
  symbol: string;
  timeframe: Timeframe;
  analysis: AnalysisPayload;
}

interface CompressionAiResponse {
  aiScore: number;
  confidenceBand: "low" | "medium" | "high";
  decision: "HOLD" | "PREPARE" | "ENTER";
  direction: "CALL" | "PUT" | "NEUTRAL";
  deltaPlan: {
    targetMin: number;
    targetMax: number;
    inBand: boolean | null;
    liveDelta?: number | null;
  };
  reasons: string[];
  priceActionSafety?: {
    direction: string;
    strength: number;
    consistency: number;
    action: "allow" | "reduce_confidence" | "force_wait";
    contradiction: boolean;
  };
}

interface WatchlistScannerResult {
  symbol: string;
  breakoutSignal?: string | null;
  breakoutScore?: number;
  priceChangePercent: number;
  healthGrade?: string;
  volumeSpike?: number;
  tradePlan?: {
    entry?: number;
    entryZoneLow?: number;
    entryZoneHigh?: number;
    stop?: number;
    targets?: number[];
    confidenceLabel?: string;
    confidencePct?: number;
    riskRewardLabel?: string;
  };
  optionPlays?: Array<{
    direction?: "CALL" | "PUT" | "NEUTRAL";
    strike?: number;
    premium?: number;
    targetPrice?: number;
    stopPrice?: number;
    rationale?: string;
  }>;
}

interface ChronosMessage {
  title: string;
  detail: string;
  note: string;
  playLabel: string;
  playAdvice: string;
  playBook: string;
  supportAdvice: string;
}

interface SignalSummary {
  totalSignals: number;
  goldSignals: number;
  hotSignals: number;
  callSignals: number;
  putSignals: number;
  winRate: number;
  wins: number;
  losses: number;
  pending: number;
  missed: number;
  avgConfidence: number;
}

interface SignalSnapshot {
  timestamp: number;
  symbol: string;
  direction: string;
  outcome?: string;
  priceDeltaPct?: number;
  grade?: string;
}

interface SignalHistoryApiResponse {
  symbol: string;
  history: SignalSnapshot[];
  summary: SignalSummary;
  timestamp: number;
}

interface SignalMetrics {
  symbol: string;
  lookbackHours: number;
  rates: {
    winRate: number;
    completionRate: number;
    decisiveWinRate: number;
  };
  expectancy: {
    avgR: number;
    medianR: number;
    profitFactor: number;
    avgMfePct: number;
    avgMaePct: number;
  };
}

interface DirectionalHistoryStats {
  callSignals: number;
  putSignals: number;
  callWins: number;
  putWins: number;
  callLosses: number;
  putLosses: number;
  callWinRate: number;
  putWinRate: number;
  callAvgDeltaPct: number;
  putAvgDeltaPct: number;
  netDirectionalBias: number;
}

function normalizeDirection(direction: string | null | undefined) {
  const value = String(direction ?? '').toUpperCase();
  if (value.includes('CALL') || value.includes('BULL')) return 'CALL';
  if (value.includes('PUT') || value.includes('BEAR') || value.includes('DOWN') || value.includes('SHORT')) return 'PUT';
  return 'NEUTRAL';
}

function computeDirectionalHistoryStats(history: SignalSnapshot[]): DirectionalHistoryStats {
  const stats: DirectionalHistoryStats = {
    callSignals: 0,
    putSignals: 0,
    callWins: 0,
    putWins: 0,
    callLosses: 0,
    putLosses: 0,
    callWinRate: 50,
    putWinRate: 50,
    callAvgDeltaPct: 0,
    putAvgDeltaPct: 0,
    netDirectionalBias: 0,
  };

  const callDeltas: number[] = [];
  const putDeltas: number[] = [];

  for (const item of history) {
    const dir = normalizeDirection(item.direction);
    if (dir === 'CALL') {
      stats.callSignals += 1;
      if (item.outcome?.startsWith('win')) stats.callWins += 1;
      if (item.outcome === 'loss') stats.callLosses += 1;
      if (Number.isFinite(item.priceDeltaPct ?? NaN)) callDeltas.push(item.priceDeltaPct ?? 0);
    } else if (dir === 'PUT') {
      stats.putSignals += 1;
      if (item.outcome?.startsWith('win')) stats.putWins += 1;
      if (item.outcome === 'loss') stats.putLosses += 1;
      if (Number.isFinite(item.priceDeltaPct ?? NaN)) putDeltas.push(item.priceDeltaPct ?? 0);
    }
  }

  stats.callWinRate = stats.callSignals > 0 ? (stats.callWins / stats.callSignals) * 100 : 50;
  stats.putWinRate = stats.putSignals > 0 ? (stats.putWins / stats.putSignals) * 100 : 50;
  stats.callAvgDeltaPct = callDeltas.length > 0 ? callDeltas.reduce((sum, value) => sum + value, 0) / callDeltas.length : 0;
  stats.putAvgDeltaPct = putDeltas.length > 0 ? putDeltas.reduce((sum, value) => sum + value, 0) / putDeltas.length : 0;
  stats.netDirectionalBias = stats.putWinRate - stats.callWinRate;

  return stats;
}

function formatPercent(value: number | null | undefined, digits = 1) {
  if (value == null || Number.isNaN(value)) return "--";
  return `${value.toFixed(digits)}%`;
}

function formatVolume(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return "--";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return `${value}`;
}

function deriveWatchlistPriceActionGauge(item: WatchlistScannerResult) {
  const baseScore = item.breakoutScore ?? 0;
  const optionBonus = item.optionPlays?.length ? 10 : 0;
  const momentum = Math.min(
    100,
    Math.max(
      0,
      (baseScore || Math.abs(item.priceChangePercent) * 7 + (item.volumeSpike ?? 0) * 4) + optionBonus,
    ),
  );

  const explicitOptionDirection = item.optionPlays?.[0]?.direction;
  let bias: "CALL" | "PUT" = "CALL";

  if (explicitOptionDirection === "PUT" || explicitOptionDirection === "CALL") {
    bias = explicitOptionDirection;
  } else if (item.breakoutSignal) {
    const signal = item.breakoutSignal.toUpperCase();
    if (signal.includes("BREAKDOWN") || signal.includes("DOWN") || signal.includes("SHORT")) {
      bias = "PUT";
    } else if (signal.includes("BREAKOUT") || signal.includes("UP") || signal.includes("LONG")) {
      bias = "CALL";
    } else {
      bias = item.priceChangePercent >= 0 ? "CALL" : "PUT";
    }
  } else {
    bias = item.priceChangePercent >= 0 ? "CALL" : "PUT";
  }

  return {
    momentum,
    bias,
    label: item.optionPlays?.length ? "Option-ready strength" : item.breakoutScore != null ? "Breakout strength" : "Price-action strength",
  };
}

function deriveBreakoutVolumeAlert(
  analysis: AnalysisPayload,
  response: CompressionAiResponse | null,
  timeframe: Timeframe,
) {
  if (timeframe !== "5m") return null;
  const spike = analysis.volumeSpike;
  if (!spike || !spike.isSpike || spike.lastVolume < 750_000) return null;

  const bearishMarket = response?.direction === "PUT" || analysis.directionalBias === "bearish";
  const alertType = bearishMarket ? "breakdown" : "breakout";
  const directionText = bearishMarket ? "downside" : "upside";

  return `High 5m volume ${formatVolume(spike.lastVolume)} detected; watch for ${directionText} ${alertType} confirmation.`;
}

function derivePlayLabel(
  analysis: AnalysisPayload,
  data: CompressionAiResponse,
): string {
  const strategy = analysis.strategy ? analysis.strategy.toLowerCase() : "market play";
  if (data.decision === "ENTER") {
    if (data.direction === "CALL") return `Long breakout / trend continuation (${strategy})`;
    if (data.direction === "PUT") return `Short breakdown / fade setup (${strategy})`;
    return `Directional edge (${strategy})`;
  }

  if (data.decision === "PREPARE") {
    return `Developing ${analysis.directionalBias ?? "market"} setup (${strategy})`;
  }

  return `No new commitment / tactical reset (${strategy})`;
}

function derivePlayAdvice(
  analysis: AnalysisPayload,
  data: CompressionAiResponse,
  watchlistHighlights: WatchlistScannerResult[],
): string {
  const watchlistLead = watchlistHighlights[0];
  const leaderText = watchlistLead
    ? `${watchlistLead.symbol} is the freshest watchlist leader with ${watchlistLead.breakoutSignal?.toLowerCase() ?? "momentum"}`
    : "No obvious watchlist leader yet";

  if (data.decision === "ENTER") {
    return `Primary play is to respect the breakout bias with defined risk. ${leaderText}; use tight invalidation and let the trend prove itself before adding size.`;
  }

  if (data.decision === "PREPARE") {
    return `This is a setup that needs confirmation. Monitor the high-probability trigger level and keep strikes or shares light until follow-through aligns.`;
  }

  return `Hold and observe the broader market. Wait for compression, volume, and breadth to move into clear alignment before taking a new position.`;
}

function derivePlayBook(analysis: AnalysisPayload, data: CompressionAiResponse): string {
  const metaPlay = analysis.metaSignal?.playType;
  const playDesc = metaPlay ? metaPlay.replace('_', ' ') : analysis.strategy?.toLowerCase() ?? 'market play';
  const direction = data.direction === 'CALL' ? 'long' : data.direction === 'PUT' ? 'short' : analysis.directionalBias || 'neutral';
  if (data.decision === 'ENTER') {
    return `Playbook: ${direction.toUpperCase()} ${playDesc}`;
  }
  if (data.decision === 'PREPARE') {
    return `Playbook: developing ${direction} ${playDesc}`;
  }
  return `Playbook: wait for clean price action confirmation`; 
}

function deriveSupportAdvice(analysis: AnalysisPayload): string {
  const entry = analysis.metaSignal?.entryZone;
  const stop = analysis.metaSignal?.stopLoss;
  const targets = analysis.metaSignal?.targetPrimary ? [analysis.metaSignal.targetPrimary, analysis.metaSignal.targetStretch].filter(Boolean) as number[] : [];
  const supportText = entry ? `Entry zone ${entry.min.toFixed(2)}-${entry.max.toFixed(2)}` : analysis.tactical?.entryWindow ? `Entry window ${analysis.tactical.entryWindow}` : 'No defined entry zone yet.';
  const stopText = stop != null ? `Stop ${stop.toFixed(2)}` : analysis.tactical?.tradePlan?.stop != null ? `Stop ${analysis.tactical.tradePlan.stop.toFixed(2)}` : 'Stop level pending.';
  const targetText = targets.length > 0 ? `Targets ${targets.map((t) => t.toFixed(2)).join(' / ')}` : analysis.tactical?.tradePlan?.targets ? `Targets ${analysis.tactical.tradePlan.targets.map((t) => t.toFixed(2)).join(' / ')}` : 'Targets pending.';

  return `${supportText}. ${stopText}. ${targetText}`;
}

function formatWatchlistPlaySummary(item: WatchlistScannerResult) {
  const parts: string[] = [];
  if (item.tradePlan) {
    const plan = item.tradePlan;
    if (plan.entryZoneLow != null && plan.entryZoneHigh != null) {
      parts.push(`Entry ${plan.entryZoneLow.toFixed(2)}-${plan.entryZoneHigh.toFixed(2)}`);
    } else if (plan.entry != null) {
      parts.push(`Entry ${plan.entry.toFixed(2)}`);
    }
    if (plan.stop != null) parts.push(`Stop ${plan.stop.toFixed(2)}`);
    if (plan.targets?.length) parts.push(`Targets ${plan.targets.map((t) => t.toFixed(2)).join(", ")}`);
    if (plan.riskRewardLabel) parts.push(plan.riskRewardLabel);
  }
  if (item.optionPlays?.length) {
    const strike = item.optionPlays[0];
    if (strike.direction && strike.strike != null) {
      parts.push(`${strike.direction} ${strike.strike}${strike.premium != null ? ` @ $${strike.premium.toFixed(2)}` : ""}`);
    }
  }
  return parts.length ? parts.join(" · ") : "No explicit play details available.";
}

function summarizeCompression(analysis: AnalysisPayload) {
  const squeeze = Boolean(analysis.marketHealth?.bollingerBands?.squeeze);
  const rangeCompression = analysis.trendExhaustion?.rangeCompression;
  const volumeRatio = typeof analysis.volumeSpike?.avgVolume === "number" && analysis.volumeSpike.avgVolume > 0
    ? analysis.volumeSpike.lastVolume / analysis.volumeSpike.avgVolume
    : undefined;

  return {
    label: squeeze ? "Compression detected" : "Compression easing",
    detail: squeeze
      ? "Market is squeezed and a breakout is becoming more likely."
      : "Compression is lightening; wait for confirmed momentum before committing.",
    range: rangeCompression != null ? `${Math.round(rangeCompression * 100)}% range` : "Range unknown",
    volume: typeof volumeRatio === "number" ? `${volumeRatio.toFixed(2)}x volume` : "Volume unknown",
    tone: squeeze ? "emerald" : "slate",
  } as const;
}

function derivePressureMetrics(analysis: AnalysisPayload, response: CompressionAiResponse | null) {
  const clampPressure = (value: number) => Math.round(Math.min(100, Math.max(0, value)));

  const aiBull = response
    ? response.direction === "CALL"
      ? Math.min(Math.max(response.aiScore, 0), 100)
      : response.direction === "PUT"
        ? Math.min(Math.max(100 - response.aiScore, 0), 100)
        : 50
    : 50;

  const aiBear = response
    ? response.direction === "PUT"
      ? Math.min(Math.max(response.aiScore, 0), 100)
      : response.direction === "CALL"
        ? Math.min(Math.max(100 - response.aiScore, 0), 100)
        : 50
    : 50;

  const bullishMeter = analysis.bullishPower?.meter ?? 50;
  const bearishMeter = 100 - bullishMeter;
  const trendConfidence = analysis.trendConfidence ?? 50;
  const volumeConfidence = analysis.volumeConfidence ?? 50;
  const marketConfidence = analysis.marketConfidence ?? 50;
  const candleStrength = analysis.candleStrength?.score ?? 50;
  const buyingBiasAdjustment = analysis.directionalBias === "bullish"
    ? 10
    : analysis.directionalBias === "bearish"
      ? -10
      : 0;
  const sellingBiasAdjustment = analysis.directionalBias === "bearish"
    ? 10
    : analysis.directionalBias === "bullish"
      ? -10
      : 0;

  const neutralSupport = trendConfidence * 0.08
    + volumeConfidence * 0.08
    + marketConfidence * 0.08
    + candleStrength * 0.08;

  const buyingPressure = clampPressure(
    aiBull * 0.45 + bullishMeter * 0.2 + neutralSupport + buyingBiasAdjustment,
  );

  const sellingPressure = clampPressure(
    aiBear * 0.45 + bearishMeter * 0.2 + neutralSupport + sellingBiasAdjustment,
  );
  const label = buyingPressure >= 65
    ? "High buying pressure"
    : sellingPressure >= 65
      ? "High selling pressure"
      : "Balanced pressure";
  const volumeRatio = typeof analysis.volumeSpike?.avgVolume === "number" && analysis.volumeSpike.avgVolume > 0
    ? analysis.volumeSpike.lastVolume / analysis.volumeSpike.avgVolume
    : undefined;
  const spikeDetail = analysis.volumeSpike?.isSpike
    ? ` · ${formatVolume(analysis.volumeSpike.lastVolume)} vol spike`
    : "";
  const detail = `Live log tuning · trend ${trendConfidence.toFixed(0)} · volume ${volumeConfidence.toFixed(0)} · market ${marketConfidence.toFixed(0)}${
    typeof volumeRatio === "number" ? ` · ${volumeRatio.toFixed(2)}x volume` : ""
  }${spikeDetail}`;

  return {
    buyingPressure,
    sellingPressure,
    label,
    detail,
  } as const;
}

function deriveReadinessState(
  analysis: AnalysisPayload,
  response: CompressionAiResponse | null,
) {
  if (!response) {
    return {
      label: "Waiting for model",
      detail: "Chronos is analyzing compression, price action, and trigger readiness.",
      tone: "slate" as const,
    };
  }

  if (response.decision === "ENTER") {
    return {
      label: "Execute",
      detail: "Pull the trigger when price clears the setup and volume confirms the bias.",
      tone: "emerald" as const,
    };
  }

  if (response.decision === "PREPARE") {
    return {
      label: "Get ready",
      detail: "Compression is building. Watch for a breakout zone test and higher-volume follow-through.",
      tone: "amber" as const,
    };
  }

  return {
    label: "Hold",
    detail: "Wait for clearer alignment and stronger compression release before acting.",
    tone: "slate" as const,
  };
}

function buildChronosMessage(
  analysis: AnalysisPayload,
  data: CompressionAiResponse | null,
  watchlistHighlights: WatchlistScannerResult[] = [],
  timeframe: Timeframe,
  historyStats: DirectionalHistoryStats,
  historyEdgeNote: string,
): ChronosMessage {
  if (!data) {
    return {
      title: "Chronos is reading SPY from every signal on the page…",
      detail: "The agent parses bias, market health, compression, edge, and tactical readiness to recommend the next best move.",
      note: "Refreshes every 20 seconds with the latest engine score.",
      playLabel: "Scanning for the best play",
      playAdvice: "Chronos is building the market context and will recommend the clearest play once the engine score refreshes.",
      playBook: "Playbook is warming up from live price action and support levels.",
      supportAdvice: "Price-action support and resistance are still being assessed.",
    };
  }

  const biasPhrase = analysis.directionalBias === "bullish"
    ? "upside bias"
    : analysis.directionalBias === "bearish"
      ? "downside bias"
      : "neutral momentum";

  const gradePhrase = analysis.grade ? `grade ${analysis.grade}` : "no grade";
  const confidencePhrase = analysis.confidence === "high"
    ? "high confidence"
    : analysis.confidence === "medium"
      ? "balanced confidence"
      : "low confidence";

  const marketHealth = analysis.marketHealth;
  const compressionState = summarizeCompression(analysis);
  const squeeze = marketHealth?.bollingerBands?.squeeze ? "tight compression" : "open range";
  const atrLevel = marketHealth?.atr?.percent != null ? `${(marketHealth.atr.percent * 100).toFixed(0)}% ATR` : null;
  const volumeRatio = typeof analysis.volumeSpike?.avgVolume === "number" && analysis.volumeSpike.avgVolume > 0
    ? analysis.volumeSpike.lastVolume / analysis.volumeSpike.avgVolume
    : undefined;
  const volumePhrase = typeof volumeRatio === "number" && volumeRatio > 1.1
    ? "volume is supportive"
    : typeof volumeRatio === "number" && volumeRatio < 0.9
      ? "volume is weak"
      : "volume is normal";
  const breakoutAlert = deriveBreakoutVolumeAlert(analysis, data, timeframe);
  const compressionPhrase = compressionState.detail;

  const entryText = analysis.tactical?.tradePlan
    ? `Entry zone ${analysis.tactical.tradePlan.entryZoneLow.toFixed(2)}-${analysis.tactical.tradePlan.entryZoneHigh.toFixed(2)}, stop ${analysis.tactical.tradePlan.stop.toFixed(2)}, target ${analysis.tactical.tradePlan.targets[0]?.toFixed(2) ?? "n/a"}.`
    : analysis.tactical?.entryWindow
      ? `Watch for a clean move inside the ${analysis.tactical.entryWindow} entry window.`
      : "No precise tactical entry logged yet.";

  const stopSuggestion = analysis.tactical?.tradePlan
    ? `Move stops to break-even once ${analysis.tactical.tradePlan.targets[0]?.toFixed(2) ?? "the first target"} is tagged.`
    : "Keep the stop tight until the breakout validates.";

  const signalScore = data.aiScore;
  const decision = data.decision;
  const actionLine = decision === "ENTER"
    ? `Ready to enter now if SPY sustains its trigger and stays above the breakout shelf.`
    : decision === "PREPARE"
      ? `This is a watch-and-wait setup. Let the move confirm before taking a position.`
      : `Hold off for now. Wait for clearer alignment across compression, edge, and momentum.`;

  const priceActionSummary = data?.priceActionSafety
    ? data.priceActionSafety.contradiction
      ? `Price action is contradicting the bias (${data.priceActionSafety.direction}, ${data.priceActionSafety.strength}%, ${data.priceActionSafety.consistency}% consistency).`
      : `Price action supports the bias (${data.priceActionSafety.direction}, ${data.priceActionSafety.strength}%, ${data.priceActionSafety.consistency}% consistency).`
    : null;
  const topReasons = data.reasons.length > 0 ? data.reasons.slice(0, 3).join(" · ") : "No dominant reason yet.";
  const onPageNotes = analysis.notes?.length > 0 ? analysis.notes.slice(0, 3).join(" · ") : null;
  const watchlistSummary = watchlistHighlights.length > 0
    ? `Watchlist pulse: ${watchlistHighlights.map((item) => `${item.symbol} ${item.breakoutSignal ? item.breakoutSignal.toLowerCase() : "moving"} ${formatPercent(item.priceChangePercent)}`).join(" · ")}.`
    : "No watchlist ticker is staging a high-probability move right now.";

  const detailParts = [`The model sees ${signalScore}% confidence`, squeeze, compressionPhrase, volumePhrase];
  if (atrLevel) detailParts.push(atrLevel);
  if (priceActionSummary) detailParts.push(priceActionSummary);
  if (historyStats.callSignals + historyStats.putSignals > 0) {
    detailParts.push(`History edge: ${historyStats.callWinRate.toFixed(0)}% CALL / ${historyStats.putWinRate.toFixed(0)}% PUT`);
  }

  const playLabel = data ? derivePlayLabel(analysis, data) : "Scanning for the best play";
  const playAdvice = data ? derivePlayAdvice(analysis, data, watchlistHighlights) : "Chronos is building the market context and will recommend the clearest play once the engine score refreshes.";

  return {
    title: `SPY is showing ${biasPhrase} with ${gradePhrase} and ${confidencePhrase}.`,
    detail: `${analysis.strategy ? `${analysis.strategy}. ` : ""}${detailParts.join(" · ")}. ${watchlistSummary} ${actionLine}${breakoutAlert ? ` ${breakoutAlert}` : ""}`,
    note: `${entryText} ${stopSuggestion} ${topReasons}${onPageNotes ? ` Notes: ${onPageNotes}` : ""} ${historyStats.callSignals + historyStats.putSignals > 0 ? historyEdgeNote : ""}`.trim(),
    playLabel,
    playAdvice,
    playBook: derivePlayBook(analysis, data),
    supportAdvice: deriveSupportAdvice(analysis),
  };
}

export function ChronosCallout({ symbol, timeframe, analysis }: ChronosCalloutProps) {
  const { data } = useQuery<CompressionAiResponse>({
    queryKey: ["/api/compression-ai", symbol, timeframe],
    enabled: Boolean(symbol),
    staleTime: 15000,
    refetchInterval: 30000,
    retry: false,
  });

  const { data: historyResponse } = useQuery<SignalHistoryApiResponse>({
    queryKey: ["/api/signal-history", symbol],
    enabled: Boolean(symbol),
    staleTime: 30000,
    refetchInterval: 30000,
    retry: false,
  });

  const { data: historyMetrics } = useQuery<SignalMetrics>({
    queryKey: ["/api/signal-history", symbol, "metrics"],
    enabled: Boolean(symbol),
    staleTime: 30000,
    refetchInterval: 30000,
    retry: false,
  });

  const historySummary = historyResponse?.summary;
  const history = historyResponse?.history ?? [];
  const historyStats = useMemo(() => computeDirectionalHistoryStats(history), [history]);

  const historyEdgeNote = historySummary
    ? `Historical edge: ${historyStats.putWinRate.toFixed(0)}% PUT win rate vs ${historyStats.callWinRate.toFixed(0)}% CALL win rate across ${history.length} tracked signals.`
    : "Historical edge is warming up from recent signal outcomes.";

  const historyBiasLabel = historyStats.netDirectionalBias > 6
    ? "PUT-favored history"
    : historyStats.netDirectionalBias < -6
      ? "CALL-favored history"
      : "Balanced directional history";

  const historyEdgeStrength = Math.max(0, Math.min(100, 50 + historyStats.netDirectionalBias / 2));
  const historyPerformanceLabel = historyStats.callWinRate > historyStats.putWinRate
    ? `CALL edge ${historyStats.callWinRate.toFixed(0)}%` 
    : `PUT edge ${historyStats.putWinRate.toFixed(0)}%`;

  const { data: watchlistResults } = useQuery<WatchlistScannerResult[]>({
    queryKey: ["/api/scanner/results"],
    staleTime: 12000,
    refetchInterval: 30000,
    retry: false,
  });

  const watchlistHighlights = useMemo(() => {
    if (!watchlistResults) return [];

    return watchlistResults
      .filter((item) => item.symbol !== symbol)
      .map((item) => ({
        ...item,
        score: Math.max(item.breakoutScore ?? 0, Math.abs(item.priceChangePercent) * 10, item.volumeSpike ?? 0),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);
  }, [watchlistResults, symbol]);

  const watchlistPulseStrength = useMemo(() => {
    if (!watchlistHighlights.length) return 0;
    const total = watchlistHighlights.reduce((sum, item) => {
      const baseScore = item.breakoutScore ?? 0;
      return sum + (baseScore || Math.abs(item.priceChangePercent) * 7 + (item.volumeSpike ?? 0) * 4);
    }, 0);
    return Math.min(100, Math.round(total / watchlistHighlights.length));
  }, [watchlistHighlights]);

  const message = useMemo(
    () => buildChronosMessage(analysis, data ?? null, watchlistHighlights, timeframe, historyStats, historyEdgeNote),
    [analysis, data, watchlistHighlights, timeframe, historyStats, historyEdgeNote],
  );
  const decisionTone = data?.decision === "ENTER" ? "text-emerald-300" : data?.decision === "PREPARE" ? "text-sky-300" : "text-slate-300";
  const statusLabel = data?.decision ?? "CALCULATING";
  const priceActionLabel = data?.priceActionSafety
    ? data.priceActionSafety.contradiction
      ? `Contradictory · ${data.priceActionSafety.direction} ${data.priceActionSafety.strength}%`
      : `Supporting · ${data.priceActionSafety.direction} ${data.priceActionSafety.strength}%`
    : "Assessing price action";
  const priceActionTone = data?.priceActionSafety
    ? data.priceActionSafety.action === "force_wait"
      ? "text-rose-300"
      : data.priceActionSafety.action === "reduce_confidence"
        ? "text-amber-300"
        : "text-emerald-300"
    : "text-slate-300";
  const signalConfidenceLabel = analysis.confidence?.toUpperCase() ?? "UNKNOWN";
  const aiScoreLabel = data ? `${data.aiScore}%` : "--";

  function resolveDirectionalConfidence(response: CompressionAiResponse, analysis: AnalysisPayload, historyStats: DirectionalHistoryStats) {
    const rawScore = Math.round(Math.min(Math.max(response.aiScore, 0), 100));
    let adjustedScore = rawScore;

    const biasAdjustment = analysis.directionalBias === "bullish"
      ? response.direction === "CALL"
        ? 8
        : response.direction === "PUT"
          ? -22
          : 0
      : analysis.directionalBias === "bearish"
        ? response.direction === "PUT"
          ? 8
          : response.direction === "CALL"
            ? -22
            : 0
        : 0;

    adjustedScore = Math.max(0, Math.min(100, adjustedScore + biasAdjustment));

    if (response.priceActionSafety) {
      if (response.priceActionSafety.action === "reduce_confidence") {
        adjustedScore += Math.round((50 - adjustedScore) * 0.35);
      }
      if (response.priceActionSafety.action === "force_wait") {
        adjustedScore += Math.round((50 - adjustedScore) * 0.5);
      }
      if (response.priceActionSafety.contradiction) {
        adjustedScore += Math.round((50 - adjustedScore) * 0.3);
      }
    }

    if (historyStats.callSignals + historyStats.putSignals >= 6) {
      if (response.direction === "CALL" && historyStats.callWinRate > historyStats.putWinRate + 8) {
        adjustedScore += 6;
      }
      if (response.direction === "PUT" && historyStats.putWinRate > historyStats.callWinRate + 8) {
        adjustedScore += 6;
      }
      if (response.direction === "CALL" && historyStats.putWinRate > historyStats.callWinRate + 10) {
        adjustedScore -= 8;
      }
      if (response.direction === "PUT" && historyStats.callWinRate > historyStats.putWinRate + 10) {
        adjustedScore -= 8;
      }
    }

    adjustedScore = Math.max(0, Math.min(100, adjustedScore));

    if (response.direction === "CALL") {
      return {
        call: adjustedScore,
        put: 100 - adjustedScore,
        note: response.priceActionSafety?.action === "force_wait"
          ? "Force-wait safety reduced directional conviction."
          : response.priceActionSafety?.action === "reduce_confidence"
            ? "Price action softened confidence."
            : response.priceActionSafety?.contradiction
              ? "Signal conflicted with price action; confidence pulled toward neutral."
              : "Directional conviction from AI signal and bias alignment.",
      };
    }

    if (response.direction === "PUT") {
      return {
        put: adjustedScore,
        call: 100 - adjustedScore,
        note: response.priceActionSafety?.action === "force_wait"
          ? "Force-wait safety reduced directional conviction."
          : response.priceActionSafety?.action === "reduce_confidence"
            ? "Price action softened confidence."
            : response.priceActionSafety?.contradiction
              ? "Signal conflicted with price action; confidence pulled toward neutral."
              : "Directional conviction from AI signal and bias alignment.",
      };
    }

    return { call: 50, put: 50, note: "No clear directional edge yet." };
  }

  function computeMarketLean(response: CompressionAiResponse | null, analysis: AnalysisPayload) {
    const score = response ? Math.min(Math.max(response.aiScore, 0), 100) : 50;
    const baseBull = response
      ? response.direction === "CALL"
        ? score
        : response.direction === "PUT"
          ? 100 - score
          : 50
      : 50;

    const adjustment = analysis.directionalBias === "bullish"
      ? 10
      : analysis.directionalBias === "bearish"
        ? -10
        : 0;

    const bull = Math.min(100, Math.max(0, Math.round(baseBull + adjustment)));
    const bear = 100 - bull;
    const lean = bull >= 55 ? "Bullish" : bear >= 55 ? "Bearish" : "Neutral";
    return { bull, bear, lean } as const;
  }

  const directionalConfidence = data
    ? resolveDirectionalConfidence(data, analysis, historyStats)
    : { call: 50, put: 50, note: "Calibrating directional confidence." };
  const { call: callConfidence, put: putConfidence, note: confidenceNote } = directionalConfidence;
  const signalMeterLabel = data
    ? `${data.direction === "NEUTRAL" ? "Neutral" : data.direction} bias`
    : "Awaiting signal";
  const signalMeterTone = data?.direction === "PUT"
    ? "text-rose-300"
    : data?.direction === "CALL"
      ? "text-emerald-300"
      : "text-slate-300";
  const compressionSummary = summarizeCompression(analysis);
  const readinessState = deriveReadinessState(analysis, data ?? null);
  const marketLean = computeMarketLean(data ?? null, analysis);
  const pressureMetrics = derivePressureMetrics(analysis, data ?? null);
  const marketLeanSummary = data
    ? `${marketLean.lean} lean · ${Math.max(marketLean.bull, marketLean.bear)}% strength`
    : "Calibrating market lean";
  const brainSignalLabel = data
    ? data.direction === "CALL"
      ? "Bull signal"
      : data.direction === "PUT"
        ? "Bear signal"
        : "Neutral signal"
    : "Calibrating market bias";
  const brainTone = marketLean.lean === "Bullish"
    ? "text-emerald-300"
    : marketLean.lean === "Bearish"
      ? "text-rose-300"
      : "text-slate-300";
  const entryAdvice = analysis.tactical?.tradePlan
    ? analysis.tactical.tradePlan.entryZoneLow != null && analysis.tactical.tradePlan.entryZoneHigh != null
      ? `Entry ${analysis.tactical.tradePlan.entryZoneLow.toFixed(2)}-${analysis.tactical.tradePlan.entryZoneHigh.toFixed(2)}`
      : analysis.tactical.tradePlan.entry != null
        ? `Entry ${analysis.tactical.tradePlan.entry.toFixed(2)}`
        : "Entry zone pending"
    : analysis.tactical?.entryWindow
      ? `Entry window ${analysis.tactical.entryWindow}`
      : "Entry zone pending";
  const stopAdvice = analysis.tactical?.tradePlan?.stop != null
    ? `Stop ${analysis.tactical.tradePlan.stop.toFixed(2)}`
    : "Stop pending";
  const targetAdvice = analysis.tactical?.tradePlan?.targets?.length
    ? `Targets ${analysis.tactical.tradePlan.targets.map((t) => t.toFixed(2)).join(" / ")}`
    : "Targets pending";
  const lookForAdvice = data?.decision === "ENTER"
    ? "Watch for clean breakout follow-through, supportive volume, and no conflicting candles."
    : "Watch for compression release, volume pickup, and trend alignment before entering.";

  return (
    <Card className="relative overflow-hidden border border-cyan-500/25 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.14),transparent_32%),linear-gradient(135deg,rgba(4,8,20,0.98),rgba(7,12,24,0.95))] shadow-[0_0_36px_rgba(34,211,238,0.16)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.045),transparent_30%,rgba(255,255,255,0.03))]" />
      <CardHeader className="relative border-b border-cyan-500/15 bg-gradient-to-r from-cyan-500/10 via-transparent to-slate-600/5 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-cyan-300/85">CHRONOS · Live signal agent</div>
            <div className="mt-1 text-sm text-slate-300">{symbol.toUpperCase()} · {timeframe.toUpperCase()}</div>
          </div>
          <div className={cn("rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em]", decisionTone, data?.decision === "ENTER" ? "border-emerald-500/30 bg-emerald-500/10" : data?.decision === "PREPARE" ? "border-sky-500/30 bg-sky-500/10" : "border-slate-600/30 bg-slate-700/15")}>
            {statusLabel}
          </div>
        </div>
      </CardHeader>
      <CardContent className="relative space-y-4 p-4">
        <div className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <div className="rounded-3xl border border-cyan-500/15 bg-slate-950/70 p-4 shadow-[inset_0_0_28px_rgba(34,211,238,0.08)]">
            <div className="flex items-start gap-3">
              <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500/20 to-sky-500/10 text-cyan-100 shadow-lg shadow-cyan-500/10">
                <Sparkles className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-base font-semibold leading-tight text-white">{message.title}</p>
                <p className="mt-1 text-xs uppercase tracking-[0.26em] text-slate-400">Chronos is summarizing the clearest edge and best action</p>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/80 p-3">
                <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Bias</div>
                <div className="mt-1 text-sm font-semibold text-white">{analysis.directionalBias.toUpperCase()}</div>
              </div>
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/80 p-3">
                <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Confidence</div>
                <div className="mt-1 text-sm font-semibold text-white">{signalConfidenceLabel}</div>
              </div>
              <div className="rounded-2xl border border-slate-800/80 bg-slate-900/80 p-3">
                <div className="text-[10px] uppercase tracking-[0.24em] text-slate-400">Readiness</div>
                <div className={`mt-1 text-sm font-semibold ${readinessState.tone === "emerald" ? "text-emerald-300" : readinessState.tone === "amber" ? "text-amber-300" : "text-slate-300"}`}>{readinessState.label}</div>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-800/80 bg-slate-950/80 p-4">
            <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300">Action now</div>
            <div className="mt-2 text-sm font-semibold text-white">{message.playLabel}</div>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <div className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-2.5">
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Primary move</div>
                <div className="mt-1 text-sm font-semibold text-white">{message.playAdvice}</div>
              </div>
              <div className="rounded-2xl border border-slate-800/70 bg-slate-900/70 p-2.5">
                <div className="text-[10px] uppercase tracking-[0.22em] text-slate-500">What to watch</div>
                <div className="mt-1 text-sm font-semibold text-white">{lookForAdvice}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-3xl border border-cyan-500/15 bg-[#081124]/95 p-4 shadow-[inset_0_0_24px_rgba(34,211,238,0.08)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300">Pressure balance</div>
                <div className="mt-2 text-sm font-semibold text-white">{pressureMetrics.label}</div>
              </div>
              <div className={cn("rounded-full border px-3 py-1 text-[10px] uppercase tracking-[0.2em] font-semibold", pressureMetrics.buyingPressure > pressureMetrics.sellingPressure ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : pressureMetrics.sellingPressure > pressureMetrics.buyingPressure ? "border-rose-500/20 bg-rose-500/10 text-rose-300" : "border-slate-600/30 bg-slate-700/20 text-slate-300")}>
                {Math.max(pressureMetrics.buyingPressure, pressureMetrics.sellingPressure)}%
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-3">
                <div className="text-[10px] uppercase tracking-[0.22em] text-emerald-200">Buying pressure</div>
                <div className="mt-2 text-sm font-semibold text-white">{pressureMetrics.buyingPressure}%</div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-900">
                  <div className="h-full bg-gradient-to-r from-emerald-400 via-emerald-300 to-cyan-300 transition-all duration-300" style={{ width: `${pressureMetrics.buyingPressure}%` }} />
                </div>
              </div>
              <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-3">
                <div className="text-[10px] uppercase tracking-[0.22em] text-rose-200">Selling pressure</div>
                <div className="mt-2 text-sm font-semibold text-white">{pressureMetrics.sellingPressure}%</div>
                <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-900">
                  <div className="h-full bg-gradient-to-r from-rose-400 via-rose-300 to-slate-400 transition-all duration-300" style={{ width: `${pressureMetrics.sellingPressure}%` }} />
                </div>
              </div>
            </div>
            <div className="mt-3 text-[11px] text-slate-400">{pressureMetrics.detail}</div>
          </div>

          <div className="rounded-3xl border border-cyan-500/15 bg-gradient-to-b from-[#04111f]/95 via-[#061725]/95 to-[#05111d]/95 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.28em] text-cyan-300">Directional confidence</div>
                <div className={`mt-2 text-sm font-semibold ${signalMeterTone}`}>{signalMeterLabel}</div>
              </div>
              <div className="inline-flex items-center gap-2 rounded-full border border-slate-700/60 bg-slate-900/80 px-3 py-1 text-[10px] uppercase tracking-[0.22em] text-slate-300">
                <span className={cn("inline-flex h-2.5 w-2.5 rounded-full", data?.confidenceBand === "high" ? "bg-emerald-400" : data?.confidenceBand === "medium" ? "bg-sky-400" : "bg-slate-400")} />
                {data ? data.confidenceBand.toUpperCase() : "SYNC"}
              </div>
            </div>
            <div className="mt-4 space-y-3">
              <div className="rounded-2xl border border-slate-800/60 bg-slate-950/90 p-3">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-slate-400">
                  <span>PUT pressure</span>
                  <span className="text-sm font-semibold text-white">{putConfidence.toFixed(0)}%</span>
                </div>
                <div className="relative mt-3 h-3 rounded-full bg-slate-900 overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_right,rgba(248,113,113,0.18),transparent_40%)]" />
                  <div className="relative h-full rounded-full bg-gradient-to-r from-rose-500 via-fuchsia-400 to-cyan-400 transition-all duration-500" style={{ width: `${putConfidence}%` }} />
                </div>
              </div>
              <div className="rounded-2xl border border-slate-800/60 bg-slate-950/90 p-3">
                <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.24em] text-slate-400">
                  <span>CALL pressure</span>
                  <span className="text-sm font-semibold text-white">{callConfidence.toFixed(0)}%</span>
                </div>
                <div className="relative mt-3 h-3 rounded-full bg-slate-900 overflow-hidden">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_left,rgba(52,211,153,0.18),transparent_40%)]" />
                  <div className="relative h-full rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-sky-400 transition-all duration-500" style={{ width: `${callConfidence}%` }} />
                </div>
              </div>
            </div>
            <div className="mt-3 rounded-2xl border border-slate-800/60 bg-[#03131e]/80 p-3 text-[11px] uppercase tracking-[0.22em] text-slate-400">
              {confidenceNote}
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-800/80 bg-slate-950/90 p-4 text-slate-300 shadow-[0_0_24px_rgba(0,0,0,0.16)]">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl bg-slate-900/80 p-3 border border-slate-800/70">
              <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Entry</p>
              <p className="mt-2 text-sm font-semibold text-white">{entryAdvice}</p>
            </div>
            <div className="rounded-2xl bg-slate-900/80 p-3 border border-slate-800/70">
              <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Stop</p>
              <p className="mt-2 text-sm font-semibold text-white">{stopAdvice}</p>
            </div>
            <div className="rounded-2xl bg-slate-900/80 p-3 border border-slate-800/70">
              <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">Targets</p>
              <p className="mt-2 text-sm font-semibold text-white">{targetAdvice}</p>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-slate-800/60 bg-[#040b14]/80 p-3 text-sm text-slate-300">
            <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">What to look for</p>
            <p className="mt-2 text-sm font-semibold text-white">{lookForAdvice}</p>
          </div>
        </div>

        {historySummary && (
          <div className="rounded-3xl border border-slate-800/70 bg-[#08121f]/95 p-4 text-sm text-slate-300 shadow-[0_0_22px_rgba(0,0,0,0.16)]">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.28em] text-cyan-300">History performance</p>
                <p className="mt-2 text-sm font-semibold text-white">{historyBiasLabel}</p>
              </div>
              <span className="rounded-full bg-slate-900/80 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-slate-300">
                {historySummary.totalSignals} signals
              </span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-950/80 p-3 border border-slate-800/80">
                <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">CALL win rate</p>
                <p className="mt-2 text-sm font-semibold text-emerald-300">{historyStats.callWinRate.toFixed(0)}%</p>
              </div>
              <div className="rounded-2xl bg-slate-950/80 p-3 border border-slate-800/80">
                <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">PUT win rate</p>
                <p className="mt-2 text-sm font-semibold text-rose-300">{historyStats.putWinRate.toFixed(0)}%</p>
              </div>
              <div className="rounded-2xl bg-slate-950/80 p-3 border border-slate-800/80">
                <p className="text-[10px] uppercase tracking-[0.22em] text-slate-500">Avg outcome delta</p>
                <p className="mt-2 text-sm font-semibold text-white">{historyStats.callSignals + historyStats.putSignals > 0 ? `${historyStats.callAvgDeltaPct.toFixed(1)}% / ${historyStats.putAvgDeltaPct.toFixed(1)}%` : "--"}</p>
              </div>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-slate-400">{historyEdgeNote}</p>
          </div>
        )}

        <div className="rounded-3xl border border-cyan-500/20 bg-slate-950/80 p-4 text-sm text-slate-300">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-cyan-300">Watchlist pulse</p>
              <p className="text-[11px] text-slate-400">Live alerts from all tracked tickers</p>
            </div>
            <span className="rounded-full bg-slate-800/70 px-2.5 py-1 text-[11px] uppercase tracking-[0.18em] text-slate-300">
              {watchlistHighlights.length > 0 ? `${watchlistHighlights.length} strong moves` : "No urgent moves"}
            </span>
          </div>

          <div className="mb-4 rounded-[1.75rem] border border-slate-800/80 bg-[#08101f]/90 p-3 shadow-[inset_0_0_24px_rgba(14,165,233,0.14)]">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.26em] text-slate-400">
              <span>Overall price action pulse</span>
              <span className="font-semibold text-slate-200">{watchlistPulseStrength}%</span>
            </div>
            <div className="relative mt-3 h-4 overflow-hidden rounded-full border border-cyan-500/15 bg-[#04101b]/80">
              <div className="absolute inset-y-0 left-0 h-full rounded-full bg-gradient-to-r from-fuchsia-400/90 via-cyan-300/90 to-sky-400/80 shadow-[0_0_22px_rgba(56,189,248,0.25)]" style={{ width: `${watchlistPulseStrength}%` }} />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.12),_transparent_40%)] pointer-events-none" />
              <div className="absolute inset-y-0 left-0 right-0 grid grid-cols-8 opacity-15">
                {Array.from({ length: 8 }).map((_, index) => (
                  <span key={index} className="h-full border-r border-slate-500/15" />
                ))}
              </div>
            </div>
          </div>

          {watchlistHighlights.length === 0 ? (
            <p className="text-sm leading-6 text-slate-400">Nothing outside SPY is flashing a high-confidence move right now. Stay focused on the active setup.</p>
          ) : (
            <div className="grid gap-3">
              {watchlistHighlights.map((item) => (
                <div key={item.symbol} className="rounded-2xl border border-slate-800/80 bg-slate-900/75 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{item.symbol}</p>
                      <p className="text-[11px] text-slate-400">{item.breakoutSignal ? item.breakoutSignal : "Momentum"} · {item.healthGrade ?? "neutral"}</p>
                    </div>
                    <span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${item.priceChangePercent >= 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>
                      {formatPercent(item.priceChangePercent)}
                    </span>
                  </div>
                  <div className="mt-3 rounded-[1.75rem] border border-slate-800/80 bg-[#06101c]/90 p-3 shadow-[0_0_20px_rgba(56,189,248,0.08)]">
                    <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.28em] text-slate-400">
                      <span>{deriveWatchlistPriceActionGauge(item).label}</span>
                      <span className={`font-semibold ${deriveWatchlistPriceActionGauge(item).bias === "CALL" ? "text-emerald-300" : "text-rose-300"}`}>
                        {deriveWatchlistPriceActionGauge(item).bias}
                      </span>
                    </div>
                    <div className="relative mt-3 h-4 overflow-hidden rounded-full border border-cyan-500/10 bg-[#04111d]/80">
                      <div
                        className="absolute inset-y-0 left-0 h-full rounded-full bg-gradient-to-r from-cyan-300/90 via-fuchsia-400/90 to-rose-400/80 shadow-[0_0_18px_rgba(56,189,248,0.22)]"
                        style={{ width: `${deriveWatchlistPriceActionGauge(item).momentum}%` }}
                      />
                      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.14),_transparent_45%)] pointer-events-none" />
                      <div className="absolute inset-y-0 left-0 right-0 grid grid-cols-7 opacity-15">
                        {Array.from({ length: 7 }).map((_, index) => (
                          <span key={index} className="h-full border-r border-slate-500/15" />
                        ))}
                      </div>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-slate-500">
                      <span>Pulse {deriveWatchlistPriceActionGauge(item).momentum.toFixed(0)}%</span>
                      <span className="text-slate-400">Advanced price action metric</span>
                    </div>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-slate-200">{formatWatchlistPlaySummary(item)}</p>
                  {item.optionPlays?.length ? (
                    <p className="mt-2 text-xs leading-5 text-slate-400">Recommended strike: {item.optionPlays[0].direction ?? "Option"} {item.optionPlays[0].strike ?? "n/a"} {item.optionPlays[0].premium != null ? `@ $${item.optionPlays[0].premium.toFixed(2)}` : ""}. {item.optionPlays[0].rationale ?? "Use this if the move confirms."}</p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
