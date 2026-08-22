import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Radio, BarChart3, Activity, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/ThemeToggle";
import ChronosBadge from "@/components/ChronosBadge";
import { GradeDisplay } from "@/components/GradeDisplay";
import { TacticalAdvicePanel } from "@/components/TacticalAdvicePanel";
import { SignalCardsGrid, DivergenceWarningCard } from "@/components/SignalCard";
import { TickerInput } from "@/components/TickerInput";
import { TimeframeSelector } from "@/components/TimeframeSelector";
import { PriceCard, BreakoutAlertBar, GapAnalysisCard, SMCAnalysisCard } from "@/components/MetricCard";
import { EdgeAlertBar } from "@/components/EdgeAlertBar";
import { PriceChart } from "@/components/PriceChart";
import { MarketHealth } from "@/components/MarketHealth";
import { ScannerPanel, PatternMatrix } from "@/components/ScannerPanel";
import { MetaEngineStrip, LiquidityLevelsCard, ProbabilityBars } from "@/components/MetaEnginePanel";
import { GammaGhostPanel } from "@/components/GammaGhostPanel";
import { MetaSignalPanel } from "@/components/MetaSignalPanel";
import { FusionPanel } from "@/components/FusionPanel";
import { EdgeTuningCard } from "@/components/EdgeTuningCard";
import { TradeAnalysisPanel } from "@/components/TradeAnalysisPanel";
import { MonsterOTMPanel } from "@/components/MonsterOTMPanel";
import { WarRoomCommandDeck } from "@/components/WarRoomCommandDeck";
import { DashboardSkeleton, EmptyState, ErrorState } from "@/components/LoadingSkeleton";
import { SignalHistoryPanel } from "@/components/SignalHistoryPanel";
import { PatternListPanel } from "@/components/PatternListPanel";
import { PatternDetailPanel } from "@/components/PatternDetailPanel";
import { CompressionStatusCard } from "@/components/CompressionStatusCard";
import { ChronosCallout } from "@/components/FriendBreakoutCallout";
import { SignalLoggingPanel } from "@/components/SignalLoggingPanel";
import { queryClient } from "@/lib/queryClient";
import { MLCalibrationGauge } from "@/components/MLCalibrationGauge";
import type { AnalysisPayload, Timeframe, NormalizedPattern } from "@shared/schema";

export default function Dashboard() {
  const [ticker, setTicker] = useState("");
  const [searchTicker, setSearchTicker] = useState("");
  const [timeframe, setTimeframe] = useState<Timeframe>("15m");

  const {
    data: analysis,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useQuery<AnalysisPayload>({
    queryKey: ["/api/analyze", searchTicker, timeframe],
    enabled: !!searchTicker,
    refetchInterval: 30000, // Refresh every 30 seconds for live price updates
    staleTime: 25000, // Consider data stale after 25 seconds
    retry: false,
    refetchOnWindowFocus: false,
  });

  const { data: spotData } = useQuery<SpotData>({
    queryKey: ["/api/spot", searchTicker],
    enabled: !!searchTicker,
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
    staleTime: 5000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    retry: false,
  });

  const analysisDataSource = String((analysis as Record<string, unknown> | undefined)?.dataSource ?? "").toLowerCase();
  const lastCandleClose =
    analysis?.ohlc && analysis.ohlc.length > 0
      ? analysis.ohlc[analysis.ohlc.length - 1].close
      : undefined;
  const spotPrice = spotData?.spot;
  const spotTimestampMs = spotData?.timestamp ? Date.parse(spotData.timestamp) : Number.NaN;
  const spotAgeMs = Number.isFinite(spotTimestampMs) ? Date.now() - spotTimestampMs : Number.POSITIVE_INFINITY;
  const spotIsFresh =
    spotPrice != null &&
    Number.isFinite(spotAgeMs) &&
    spotAgeMs >= 0 &&
    spotAgeMs <= 20 * 60 * 1000;
  const spotDivergencePct =
    spotPrice != null &&
    lastCandleClose != null &&
    Number.isFinite(lastCandleClose) &&
    lastCandleClose > 0
      ? Math.abs(spotPrice - lastCandleClose) / lastCandleClose
      : 0;
  const analysisAllowsSpot =
    analysisDataSource.startsWith("live") ||
    analysisDataSource.startsWith("cached") ||
    analysisDataSource.startsWith("simulated");
  const spotLooksAligned =
    spotIsFresh &&
    (
      lastCandleClose == null ||
      spotDivergencePct <= 0.03 ||
      analysisAllowsSpot
    );

  const lastPrice =
    (spotLooksAligned ? spotPrice : undefined) ??
    analysis?.lastPrice ??
    lastCandleClose ??
    0;
  const prevClose =
    (spotLooksAligned ? spotData?.prevClose : undefined) ??
    (analysis?.ohlc && analysis.ohlc.length > 1
      ? analysis.ohlc[analysis.ohlc.length - 2].close
      : lastPrice);
  const priceChange = lastPrice - prevClose;
  const priceChangePercent = prevClose ? (priceChange / prevClose) * 100 : 0;

  const handleSubmit = (value: string) => {
    setSearchTicker(value);
    setTicker(value);
  };

  const handleRefresh = () => {
    if (searchTicker) {
      queryClient.invalidateQueries({ queryKey: ["/api/analyze", searchTicker, timeframe] });
      queryClient.invalidateQueries({ queryKey: ["/api/spot", searchTicker] });
      queryClient.invalidateQueries({ queryKey: ["/api/scanner/results"] });
      queryClient.invalidateQueries({ queryKey: ["/api/fusion", searchTicker] });
    }
  };

  const handleTimeframeChange = (tf: Timeframe) => {
    setTimeframe(tf);
    if (searchTicker) {
      queryClient.invalidateQueries({ queryKey: ["/api/analyze", searchTicker, tf] });
    }
  };

  return (
    <div className="terminal-shell warroom-shell min-h-screen text-foreground">
      <header className="terminal-header sticky top-0 z-50 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80">
        <div className="neon-divider h-1" />
        <div className="px-4 lg:px-6 py-2.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg hud-chip">
                  <BarChart3 className="w-5 h-5 text-cyan-400" />
                </div>
                <h1 className="font-display text-lg font-extrabold tracking-tight hidden sm:block bg-gradient-to-r from-cyan-300 via-teal-300 to-sky-400 bg-clip-text text-transparent" data-testid="text-title">
                  Aegis Neural Terminal
                </h1>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-md hud-chip">
                <Radio className="w-2.5 h-2.5 text-emerald-400 animate-pulse" />
                <span className="text-[10px] font-bold text-emerald-400 tracking-wider">LIVE</span>
              </div>
              <ChronosBadge />
            </div>

            <div className="flex-1 max-w-md mx-4 relative z-[100]">
              <div onClick={(e) => e.stopPropagation()}>
                <TickerInput
                  value={ticker}
                  onChange={setTicker}
                  onSubmit={handleSubmit}
                  isLoading={isFetching}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <TimeframeSelector value={timeframe} onChange={handleTimeframeChange} />
              {searchTicker && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleRefresh}
                  disabled={isFetching}
                  className="hover:bg-cyan-500/10 hover:text-cyan-400"
                  data-testid="button-refresh"
                >
                  <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin text-cyan-400" : ""}`} />
                </Button>
              )}
              <a href="/manage-subscription" data-testid="link-manage-subscription">
                <Button variant="ghost" size="icon" title="Manage Subscription">
                  <CreditCard className="w-4 h-4" />
                </Button>
              </a>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-col lg:flex-row h-[calc(100vh-57px)] animate-panel-rise">
        <aside className="quantum-sidebar hidden lg:block w-72 p-3 overflow-y-auto space-y-3">
          <ScannerPanel onSelectSymbol={handleSubmit} selectedSymbol={searchTicker} />
          {analysis?.tactical && (
            <TacticalAdvicePanel
              tactical={analysis.tactical}
              directionScore={analysis.directionScore}
            />
          )}
          {analysis?.metaEngine && (
            <MetaEngineStrip metaEngine={analysis.metaEngine} currentPrice={lastPrice} />
          )}
        </aside>

        <main className="quantum-main flex-1 overflow-y-auto p-3 lg:p-4">
          {!searchTicker && !isLoading ? (
            <div className="h-full flex flex-col">
              <div className="lg:hidden mb-6">
                <Card className="glass-panel">
                  <CardContent className="p-4">
                    <ScannerPanel onSelectSymbol={handleSubmit} selectedSymbol={searchTicker} />
                  </CardContent>
                </Card>
              </div>
              <EmptyState onSelectTicker={handleSubmit} />
            </div>
          ) : isLoading ? (
            <DashboardSkeleton />
          ) : error ? (
            <ErrorState
              message={error instanceof Error ? error.message : "Failed to analyze ticker"}
              onRetry={handleRefresh}
            />
          ) : analysis ? (
            <DashboardContent
              analysis={analysis}
              timeframe={timeframe}
              lastPrice={lastPrice}
              spotIsLive={spotLooksAligned}
              priceChange={priceChange}
              priceChangePercent={priceChangePercent}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}

interface SpotData {
  symbol: string;
  spot: number;
  prevClose: number;
  marketState: string;
  timestamp: string;
  source: 'finnhub' | 'yahoo';
}

interface SectorSnapshot {
  sectors: Array<{
    code: string;
    label: string;
    changePct: number | null;
    live: boolean;
  }>;
}

function DashboardContent({
  analysis,
  timeframe,
  lastPrice,
  spotIsLive,
  priceChange,
  priceChangePercent,
}: {
  analysis: AnalysisPayload;
  timeframe: Timeframe;
  lastPrice: number;
  spotIsLive: boolean;
  priceChange: number;
  priceChangePercent: number;
}) {
  const [selectedPattern, setSelectedPattern] = useState<NormalizedPattern | null>(null);

  const { data: patternData } = useQuery<{patterns: any[]}>({
    queryKey: ["/api/patterns", analysis.symbol, timeframe],
    enabled: !!analysis.symbol,
  });


  const { data: sectorSnapshot } = useQuery<SectorSnapshot>({
    queryKey: ["/api/sectors", "SPY"],
    enabled: !!analysis.symbol,
    refetchInterval: 30000,
    staleTime: 20000,
  });
  const {
    data: gammaGhostData,
    isLoading: gammaGhostLoading,
    error: gammaGhostError,
  } = useQuery<any>({
    queryKey: ["/api/gamma-ghost", analysis.symbol],
    enabled: !!analysis.symbol,
    retry: false,
    refetchInterval: (query) => (query.state.data ? 30000 : false),
  });

  const tapeLookbackBars =
    timeframe === "5m" ? 12 :
    timeframe === "15m" ? 8 :
    timeframe === "30m" ? 6 :
    timeframe === "1h" ? 4 :
    timeframe === "4h" ? 3 : 2;

  const ohlcSeries = analysis.ohlc ?? [];
  const latestBar = ohlcSeries.length > 0 ? ohlcSeries[ohlcSeries.length - 1] : null;
  const anchorIndex = Math.max(0, ohlcSeries.length - 1 - tapeLookbackBars);
  const anchorBar = ohlcSeries.length > 0 ? ohlcSeries[anchorIndex] : null;
  const anchorClose = anchorBar?.close;
  const tapeChange =
    latestBar && typeof anchorClose === "number" && Number.isFinite(anchorClose)
      ? lastPrice - anchorClose
      : undefined;
  const tapeChangePct =
    typeof tapeChange === "number" && typeof anchorClose === "number" && anchorClose > 0
      ? (tapeChange / anchorClose) * 100
      : undefined;

  return (
    <div className="space-y-4" data-testid="dashboard-content">
      <WarRoomCommandDeck analysis={analysis} lastPrice={lastPrice} spotIsLive={spotIsLive} timeframe={timeframe} />

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-4">
        <div className="xl:col-span-8 space-y-4">
          <MonsterOTMPanel symbol={analysis.symbol} currentPriceOverride={lastPrice} />

          <PriceCard
            symbol={analysis.symbol}
            price={lastPrice}
            change={priceChange}
            changePercent={priceChangePercent}
            intradayChange={tapeChange}
            intradayChangePercent={tapeChangePct}
            sectorData={sectorSnapshot?.sectors}
          />

          <ChronosCallout symbol={analysis.symbol} timeframe={timeframe} analysis={analysis} />

          <CompressionStatusCard
            symbol={analysis.symbol}
            timeframe={timeframe}
            marketHealth={analysis.marketHealth}
            trendExhaustion={analysis.trendExhaustion}
            tactical={analysis.tactical}
            directionalBias={analysis.directionalBias}
          />

          <BreakoutAlertBar
            drawablePatterns={analysis.drawablePatterns}
            marketHealth={analysis.marketHealth}
            timeframe={timeframe}
          />

          <EdgeAlertBar />

          <DivergenceWarningCard data={analysis.divergenceWarning} />

          <MetaSignalPanel
            metaSignal={analysis.metaSignal}
            currentPrice={lastPrice}
            symbol={analysis.symbol}
            timeframe={timeframe}
          />

          <TradeAnalysisPanel symbol={analysis.symbol} currentPriceOverride={lastPrice} />

          {analysis.ohlc && analysis.vwapSeries && (
            <PriceChart
              ohlc={analysis.ohlc}
              vwapSeries={analysis.vwapSeries}
              symbol={analysis.symbol}
              drawablePatterns={analysis.drawablePatterns}
              liveSpotPrice={lastPrice}
              externalSelectedPattern={selectedPattern ? { name: selectedPattern.name, startIndex: selectedPattern.startIndex, endIndex: selectedPattern.endIndex } : null}
            />
          )}

          <PatternListPanel
            normalizedPatterns={analysis.normalizedPatterns}
            patternSignal={analysis.patternSignal}
            onSelectPattern={setSelectedPattern}
            selectedPatternName={selectedPattern?.name ?? null}
          />

          <PatternMatrix symbol={analysis.symbol} timeframe={timeframe} />

          <GammaGhostPanel
            data={gammaGhostData}
            symbol={analysis.symbol}
            isLoading={gammaGhostLoading}
            error={gammaGhostError}
            currentPriceOverride={lastPrice}
          />

          <Card className="overflow-hidden glass-panel">
            <div className="h-0.5 neon-divider" />
            <CardHeader className="py-3 px-4 border-b border-border/50 bg-gradient-to-r from-cyan-500/5 via-transparent to-teal-500/5">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" />
                Technical Signals
                <span className="ml-auto text-[10px] font-normal text-muted-foreground">Real-time analysis</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <SignalCardsGrid
                momentumDivergence={analysis.momentumDivergence}
                volumeSpike={analysis.volumeSpike}
                trendExhaustion={analysis.trendExhaustion}
                liquiditySweep={analysis.liquiditySweep}
                bullishPower={analysis.bullishPower}
                candleStrength={analysis.candleStrength}
                emaCloud={analysis.emaCloud}
                failedVwapReclaim={analysis.failedVwapReclaim}
                divergenceWarning={analysis.divergenceWarning}
              />
            </CardContent>
          </Card>

        </div>

        <div className="xl:col-span-4 space-y-4">
          <FusionPanel symbol={analysis.symbol} />

          <MLCalibrationGauge symbol={analysis.symbol} timeframe={timeframe} />

          <SignalLoggingPanel />

          <EdgeTuningCard />

          <Card className="overflow-hidden glass-panel">
            <div className="h-0.5 bg-gradient-to-r from-amber-500/50 via-orange-500/50 to-red-500/50" />
            <CardHeader className="py-3 px-4 border-b border-border/50 bg-gradient-to-r from-amber-500/5 via-transparent to-orange-500/5">
              <CardTitle className="text-sm font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-2">
                <Activity className="w-4 h-4" />
                Grade
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 flex justify-center">
              <GradeDisplay
                grade={analysis.grade}
                overall={analysis.overall}
                setupQuality={analysis.setupQuality}
              />
            </CardContent>
          </Card>

          {analysis.metaEngine && (
            <ProbabilityBars probabilities={analysis.metaEngine.probabilities} />
          )}

          {analysis.metaEngine && (
            <LiquidityLevelsCard metaEngine={analysis.metaEngine} currentPrice={lastPrice} />
          )}

          <SMCAnalysisCard
            orderBlocks={(analysis as Record<string, any>).orderBlocks}
            breakerBlocks={(analysis as Record<string, any>).breakerBlocks}
            structureEvents={(analysis as Record<string, any>).structureEvents}
            liquidityEvents={(analysis as Record<string, any>).liquidityEvents}
          />

          <GapAnalysisCard data={(analysis as Record<string, any>).gapAnalysis} />

          <SignalHistoryPanel symbol={analysis.symbol} />
        </div>
      </div>

      {analysis.marketHealth && (
        <MarketHealth marketHealth={analysis.marketHealth} />
      )}

      <PatternDetailPanel
        pattern={selectedPattern}
        onClose={() => setSelectedPattern(null)}
      />
    </div>
  );
}

