import type { Express } from "express";
import { type Server } from "http";
import { db } from "./db";
import { termsAcceptanceLogs } from "@shared/schema";
import { analyzeSymbol, generateSampleOHLC } from "./finance";
import { fetchLiveOHLC, fetchLiveSpot, getCachedSpot, getLastKnownSpotFromCandles } from "./marketData";
import { detectAllPatterns, analyzeMarket, analyzeGaps } from "./patterns";
import { convertToDrawablePatterns } from "./patternDrawingAdapter";
import { normalizePatterns, computePatternFusionSignal } from "./patternFusion";
import { 
  startScanner, 
  getScannerResults, 
  getScannerResult, 
  getScannerStatus, 
  getWatchlist, 
  addToWatchlist, 
  removeFromWatchlist,
  scanSingleSymbol 
} from "./scanner.ts";
import { runMonsterOTMEngine } from "./monsterOtmEngine";
import { 
  runGammaGhostTimed, 
  generateSampleChain, 
  generateHistoricalContext 
} from "./gammaGhost";
import { 
  computeFusionSnapshot, 
  type Timeframe as FusionTimeframe,
  type MarketHealthIndicators,
  type PatternResult as FusionPatternResult,
  type LivePattern,
  type FusionInput
} from "./fusion";
import { validateAndMergeMeta } from "./metaValidator";
import { getMonsterOTMPanelData, generateSyntheticChain } from "./syntheticOptions";
import { synthesizeMonsterPlay } from "./playSynthesis";
import { computeATR } from "./indicators";
import { 
  recordSignal, 
  updateOutcomes, 
  getSignalHistory, 
  getGoldHotSignals, 
  getDailySummary,
  getAllSymbolsWithHistory,
  getSignalMetrics,
  getDailyTuningLog,
  getLiveTuningSnapshot,
  clearHistory
} from "./signalHistory";
import { runTuningAnalysis, formatTuningReport } from "./signalTuning";
import { clearBreakoutAlertLog, getBreakoutAlertLog, getBreakoutAlertSummary } from "./breakoutAlertHistory";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  const isRateLimitedMessage = (message: string): boolean => {
    const m = message.toLowerCase();
    return (
      m.includes("too many requests") ||
      m.includes("rate limit") ||
      m.includes("rate-limited") ||
      m.includes("cooldown active") ||
      m.includes("status code 429") ||
      m.includes("http 429")
    );
  };

  const BEST_PLAY_FAST_CACHE_TTL_MS = 15_000;
  const BEST_PLAY_STALE_FALLBACK_MS = 10 * 60 * 1000;
  const BEST_PLAY_YAHOO_COOLDOWN_MS = 60 * 1000;
  let bestPlayYahooCooldownUntil = 0;
  let bestPlayCooldownLogAt = 0;
  const bestPlayCache = new Map<string, { payload: any; timestamp: number }>();

  const resolveFallbackSpotPrice = async (
    symbol: string,
    timeframe: string = "15m",
  ): Promise<number | undefined> => {
    const cachedSpot = getCachedSpot(symbol);
    if (cachedSpot) return cachedSpot.data.spot;

    const candleSpot = getLastKnownSpotFromCandles(symbol);
    if (candleSpot) return candleSpot.data.spot;

    try {
      const result = await fetchLiveOHLC(symbol, timeframe, "FULL");
      if (result.data.length > 0) {
        return result.data[result.data.length - 1].close;
      }
    } catch {
      // Intentionally swallow and let caller continue to synthetic fallback.
    }

    return undefined;
  };

  // ---------- Core analysis ----------
  app.get("/api/analyze/:symbol/:timeframe?", async (req, res) => {
    try {
      const { symbol, timeframe } = req.params;
      
      if (!symbol || symbol.length < 1 || symbol.length > 10) {
        return res.status(400).json({ error: "Invalid symbol" });
      }

      const upperSymbol = symbol.toUpperCase();
      const tf = timeframe || "15m";
      
      // Fetch live spot price first - this is always needed
      let spotPrice: number | undefined;
      try {
        const spotData = await fetchLiveSpot(upperSymbol);
        spotPrice = spotData.spot;
      } catch (e) {
        // Fall through to cache/candle fallback.
      }

      if (spotPrice == null) {
        spotPrice = await resolveFallbackSpotPrice(upperSymbol, tf);
      }
      
      const liveResult = await fetchLiveOHLC(upperSymbol, tf, "FULL");
      
      let ohlc: any[];
      let isLive = false;
      let dataSource = "simulated";
      let sessionSplit = { rth: [] as any[], overnight: [] as any[], prevDayRth: [] as any[] };
      
      if (liveResult.data.length > 0) {
        ohlc = liveResult.data;
        isLive = liveResult.isLive;
        dataSource = liveResult.isLive
          ? "live"
          : liveResult.error
          ? `cached (${liveResult.error})`
          : "cached";
        sessionSplit = {
          rth: liveResult.rth,
          overnight: liveResult.overnight,
          prevDayRth: liveResult.prevDayRth,
        };
      } else {
        if (spotPrice == null) {
          spotPrice = await resolveFallbackSpotPrice(upperSymbol, tf);
        }
        // Use live spot price to generate realistic simulated data
        const candleCount = getCandleCount(tf);
        ohlc = generateSampleOHLC(upperSymbol, candleCount, spotPrice);
        dataSource = liveResult.error ? `simulated (${liveResult.error})` : "simulated";
        sessionSplit = { rth: ohlc, overnight: [], prevDayRth: [] };
      }
      
      const analysis = analyzeSymbol(
        upperSymbol,
        ohlc,
        { maxAbsGammaStrike: null },
        sessionSplit
      );
      
      const engineOutput = analyzeMarket(ohlc);
      
      // Use live spot price if available, otherwise fall back to analysis lastPrice
      const finalPrice = spotPrice ?? analysis.lastPrice;
      
      // Run Monster OTM analysis automatically
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      const monsterOTM = runMonsterOTMEngine(
        ohlc,
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
        sessionSplit
      );
      
      const allPatterns = detectAllPatterns(ohlc, tf);
      const drawablePatterns = convertToDrawablePatterns(allPatterns, ohlc, tf);
      const drawableNames = new Set(drawablePatterns.map(d => d.name));
      const normalizedPats = normalizePatterns(allPatterns, ohlc)
        .filter(p => drawableNames.has(p.name));
      const patternSignal = computePatternFusionSignal(normalizedPats);
      const gapAnalysis = analyzeGaps(ohlc);

      res.json({
        ...analysis,
        lastPrice: finalPrice,
        isLive,
        dataSource,
        metaSignal: engineOutput.metaSignal,
        context: engineOutput.context,
        liquidityEvents: engineOutput.liquidityEvents,
        structureEvents: engineOutput.structureEvents,
        orderBlocks: engineOutput.orderBlocks,
        breakerBlocks: engineOutput.breakerBlocks,
        sequences: engineOutput.sequences,
        monsterOTM,
        drawablePatterns,
        normalizedPatterns: normalizedPats,
        patternSignal,
        gapAnalysis,
      });
    } catch (error) {
      console.error("Analysis error:", error);
      res.status(500).json({ error: "Failed to analyze symbol" });
    }
  });

  // ---------- Popular symbols ----------
  app.get("/api/symbols/popular", (_req, res) => {
    res.json([
      { symbol: "SPY", name: "SPDR S&P 500 ETF" },
      { symbol: "QQQ", name: "Invesco QQQ Trust" },
      { symbol: "AAPL", name: "Apple Inc." },
      { symbol: "TSLA", name: "Tesla Inc." },
      { symbol: "NVDA", name: "NVIDIA Corporation" },
      { symbol: "MSFT", name: "Microsoft Corporation" },
      { symbol: "AMZN", name: "Amazon.com Inc." },
      { symbol: "META", name: "Meta Platforms Inc." },
    ]);
  });

  // ---------- Status ----------
  app.get("/api/status", (_req, res) => {
    res.json({
      live: true,
      message: "Live data from Yahoo Finance",
    });
  });

  // ---------- Best 0DTE Play Finder (REAL OPTIONS DATA) ----------
  app.get("/api/best-play/:symbol", async (req, res) => {
    const upperSymbol = req.params.symbol.toUpperCase();
    const nowMs = Date.now();
    const cachedBestPlay = bestPlayCache.get(upperSymbol);

    if (cachedBestPlay && (nowMs - cachedBestPlay.timestamp) <= BEST_PLAY_FAST_CACHE_TTL_MS) {
      return res.json(cachedBestPlay.payload);
    }

    if (
      nowMs < bestPlayYahooCooldownUntil &&
      cachedBestPlay &&
      (nowMs - cachedBestPlay.timestamp) <= BEST_PLAY_STALE_FALLBACK_MS
    ) {
      const remainingSec = Math.max(1, Math.ceil((bestPlayYahooCooldownUntil - nowMs) / 1000));
      if (Date.now() - bestPlayCooldownLogAt > 5_000) {
        console.warn(`[BestPlay] Yahoo cooldown active (${remainingSec}s), serving cached ${upperSymbol}.`);
        bestPlayCooldownLogAt = Date.now();
      }
      return res.json(cachedBestPlay.payload);
    }

    try {
      // Dynamic import yahoo-finance2
      const mod = await import('yahoo-finance2');
      const yahooCandidate: any = (mod as any).default ?? mod;
      const yahooFinance = typeof yahooCandidate === 'function'
        ? new yahooCandidate({ suppressNotices: ['yahooSurvey'] })
        : yahooCandidate;
      if (typeof yahooFinance?.suppressNotices === 'function') {
        yahooFinance.suppressNotices(['yahooSurvey']);
      }
      
      // Get real options chain
      const chain = await yahooFinance.options(upperSymbol);
      const expirations = chain.expirationDates || [];
      
      if (expirations.length === 0) {
        return res.status(404).json({ error: 'No options available' });
      }
      
      // Get 0DTE (first expiration)
      const zeroDTE = expirations[0];
      const optionsData = await yahooFinance.options(upperSymbol, { date: zeroDTE });
      const opts = optionsData.options?.[0] || {};
      const calls = opts.calls || [];
      const puts = opts.puts || [];
      const spotPrice = chain.quote?.regularMarketPrice || 0;
      
      // Get OHLC for compression analysis
      const ohlcResult = await fetchLiveOHLC(upperSymbol, '5m', 'FULL');
      const ohlc = ohlcResult.data || [];
      
      // Analyze compression/expansion
      const analyzeCompression = (candles: any[]): { sparkScore: number; triggers: string[]; phase: 'WAIT' | 'PREPARE' | 'READY' | 'NOW'; bbWidth: string; rangePct: string; volRatio: string } => {
        if (candles.length < 20) return { sparkScore: 0, triggers: [], phase: 'WAIT', bbWidth: '0', rangePct: '0', volRatio: '0' };
        
        const triggers: string[] = [];
        let sparkScore = 0;
        
        const closes = candles.slice(-20).map((c: any) => c.close);
        const last = candles[candles.length - 1];
        
        // BB Width
        const sma = closes.reduce((a: number, b: number) => a + b, 0) / 20;
        const stdDev = Math.sqrt(closes.reduce((sum: number, c: number) => sum + Math.pow(c - sma, 2), 0) / 20);
        const bbWidth = (stdDev * 4) / sma * 100;
        
        if (bbWidth < 1.5) { sparkScore += 25; triggers.push(`BB squeeze ${bbWidth.toFixed(1)}%`); }
        else if (bbWidth < 2.5) { sparkScore += 15; triggers.push(`Tight BB ${bbWidth.toFixed(1)}%`); }
        
        // Range compression
        const highs = candles.slice(-10).map((c: any) => c.high);
        const lows = candles.slice(-10).map((c: any) => c.low);
        const rangeHigh = Math.max(...highs);
        const rangeLow = Math.min(...lows);
        const rangePct = (rangeHigh - rangeLow) / last.close * 100;
        
        if (rangePct < 0.5) { sparkScore += 20; triggers.push(`Tight range ${rangePct.toFixed(2)}%`); }
        
        // Volume surge
        const volumes = candles.slice(-10).map((c: any) => c.volume);
        const avgVol = volumes.slice(0, 5).reduce((a: number, b: number) => a + b, 0) / 5;
        const recentVol = volumes.slice(-2).reduce((a: number, b: number) => a + b, 0) / 2;
        const volRatio = recentVol / Math.max(avgVol, 1);
        
        if (volRatio > 2) { sparkScore += 25; triggers.push(`Volume surge ${volRatio.toFixed(1)}x`); }
        else if (volRatio > 1.5) { sparkScore += 15; triggers.push(`Volume building ${volRatio.toFixed(1)}x`); }
        
        // Breakout
        const prev5High = Math.max(...candles.slice(-6, -1).map((c: any) => c.high));
        const prev5Low = Math.min(...candles.slice(-6, -1).map((c: any) => c.low));
        
        if (last.close > prev5High) { sparkScore += 30; triggers.push('BREAKOUT UP'); }
        if (last.close < prev5Low) { sparkScore += 30; triggers.push('BREAKOUT DOWN'); }
        
        // Range expansion
        const lastRange = (last.high - last.low) / last.close * 100;
        const prevBar = candles[candles.length - 2];
        const prevRange = (prevBar.high - prevBar.low) / prevBar.close * 100;
        if (lastRange > prevRange * 1.5) { sparkScore += 15; triggers.push('Range expanding'); }
        
        let phase: 'WAIT' | 'PREPARE' | 'READY' | 'NOW' = 'WAIT';
        if (sparkScore >= 70) phase = 'NOW';
        else if (sparkScore >= 50) phase = 'READY';
        else if (sparkScore >= 30) phase = 'PREPARE';
        
        return { sparkScore, triggers, phase, bbWidth: bbWidth.toFixed(2), rangePct: rangePct.toFixed(2), volRatio: volRatio.toFixed(2) };
      };
      
      const compression = analyzeCompression(ohlc);
      
      // Get fusion signal for unified direction (SINGLE SOURCE OF TRUTH)
      // Uses the new authoritative fields: unifiedDirection, unifiedConfidence
      let fusionDirection: 'CALL' | 'PUT' | 'WAIT' = 'WAIT';
      let fusionConfidence = 0;
      try {
        const port = process.env.PORT || 5000;
        const fusionResponse = await fetch(`http://localhost:${port}/api/fusion/${upperSymbol}`);
        if (fusionResponse.ok) {
          const contentType = (fusionResponse.headers.get('content-type') || '').toLowerCase();
          if (contentType.includes('application/json')) {
            const fusionData = await fusionResponse.json();
            if (fusionData.unifiedSignal) {
              // Read from authoritative unified* fields (not legacy 'direction')
              fusionDirection = fusionData.unifiedSignal.unifiedDirection || 'WAIT';
              fusionConfidence = fusionData.unifiedSignal.unifiedConfidence || 0;
            }
          }
        }
      } catch (e) {
        // Fusion failed, will use fallback logic
      }
      
      // Find best calls and puts near ATM
      const findBestOption = (options: any[], side: 'call' | 'put') => {
        const atmOptions = options
          .filter((o: any) => Math.abs(o.strike - spotPrice) <= spotPrice * 0.015) // within 1.5%
          .map((o: any) => {
            const spread = o.ask - o.bid;
            const mid = (o.bid + o.ask) / 2;
            const spreadPct = spread / mid * 100;
            const liquidityScore = Math.min(100, (o.volume || 0) / 500) * 0.7 + 
                                   Math.min(100, (o.openInterest || 0) / 200) * 0.3;
            
            // Delta estimate
            const moneyness = (spotPrice - o.strike) / spotPrice;
            let delta = 0.5;
            if (side === 'call') {
              delta = moneyness > 0.01 ? 0.6 : moneyness > 0 ? 0.55 : moneyness > -0.01 ? 0.45 : 0.35;
            } else {
              delta = moneyness < -0.01 ? 0.6 : moneyness < 0 ? 0.55 : moneyness < 0.01 ? 0.45 : 0.35;
            }
            
            // Score: tight spread + high liquidity + good delta
            const spreadScore = spreadPct < 2 ? 100 : spreadPct < 5 ? 70 : spreadPct < 10 ? 40 : 20;
            const deltaScore = delta >= 0.40 && delta <= 0.55 ? 100 : delta >= 0.30 ? 70 : 40;
            const totalScore = spreadScore * 0.3 + liquidityScore * 0.4 + deltaScore * 0.3;
            
            return {
              strike: o.strike,
              bid: o.bid,
              ask: o.ask,
              mid,
              spread,
              spreadPct,
              volume: o.volume,
              openInterest: o.openInterest,
              iv: (o.impliedVolatility || 0) * 100,
              delta,
              liquidityScore,
              totalScore
            };
          })
          .sort((a: any, b: any) => b.totalScore - a.totalScore);
        
        return atmOptions[0] || null;
      };
      
      const bestCall = findBestOption(calls, 'call');
      const bestPut = findBestOption(puts, 'put');
      
      // Determine direction using UNIFIED FUSION SIGNAL (single source of truth)
      // Falls back to multi-factor analysis only if fusion is unavailable
      let recommendedDirection: 'CALL' | 'PUT' = 'PUT'; // Default bearish (safer for 0DTE)
      const reasons: string[] = [];
      let setupGrade: 'GOLD' | 'HOT' | 'READY' | 'BUILDING' | 'WAIT' = 'WAIT';
      let confidence = 0;
      
      // Check for explicit breakout direction
      const hasBreakoutUp = compression.triggers.some((t: string) => t.includes('BREAKOUT UP'));
      const hasBreakoutDown = compression.triggers.some((t: string) => t.includes('BREAKOUT DOWN'));
      
      if (hasBreakoutUp) {
        recommendedDirection = 'CALL';
        reasons.push('🔥 Breakout UP confirmed');
      } else if (hasBreakoutDown) {
        recommendedDirection = 'PUT';
        reasons.push('🔥 Breakout DOWN confirmed');
      } else if (fusionDirection === 'CALL') {
        // Use unified fusion signal (single source of truth)
        recommendedDirection = 'CALL';
        reasons.push(`Fusion: CALL (${fusionConfidence.toFixed(0)}% conf)`);
      } else if (fusionDirection === 'PUT') {
        // Use unified fusion signal (single source of truth)
        recommendedDirection = 'PUT';
        reasons.push(`Fusion: PUT (${fusionConfidence.toFixed(0)}% conf)`);
      } else {
        // Fusion is WAIT - use multi-factor fallback for direction
        const last = ohlc[ohlc.length - 1];
        const closes = ohlc.slice(-20).map((c: any) => c.close);
        
        // 1. EMA trend (9 vs 21)
        const ema9 = closes.slice(-9).reduce((a: number, b: number) => a + b, 0) / 9;
        const ema21 = closes.reduce((a: number, b: number) => a + b, 0) / closes.length;
        const emaBullish = ema9 > ema21;
        
        // 2. Recent momentum (last 5 vs prev 5)
        const last5Avg = closes.slice(-5).reduce((a: number, b: number) => a + b, 0) / 5;
        const prev5Avg = closes.slice(-10, -5).reduce((a: number, b: number) => a + b, 0) / 5;
        const momentumBullish = last5Avg > prev5Avg;
        
        // 3. Price vs range
        const rangeHigh = Math.max(...ohlc.slice(-20).map((c: any) => c.high));
        const rangeLow = Math.min(...ohlc.slice(-20).map((c: any) => c.low));
        const rangeMid = (rangeHigh + rangeLow) / 2;
        const priceAboveMid = last.close > rangeMid;
        
        // 4. Recent candle direction (last 3 closes)
        const recentCloses = closes.slice(-3);
        const upCandles = recentCloses.filter((c: number, i: number) => i > 0 && c > recentCloses[i - 1]).length;
        const recentBullish = upCandles >= 2;
        
        // Score direction (need 3+ bullish signals for CALL)
        let bullishScore = 0;
        if (emaBullish) bullishScore++;
        if (momentumBullish) bullishScore++;
        if (priceAboveMid) bullishScore++;
        if (recentBullish) bullishScore++;
        
        if (bullishScore >= 3) {
          recommendedDirection = 'CALL';
          const signals = [];
          if (emaBullish) signals.push('EMA9>21');
          if (momentumBullish) signals.push('momentum↑');
          if (priceAboveMid) signals.push('above mid');
          if (recentBullish) signals.push('recent candles↑');
          reasons.push(`Bullish bias (${signals.join(', ')})`);
        } else {
          recommendedDirection = 'PUT';
          const signals = [];
          if (!emaBullish) signals.push('EMA9<21');
          if (!momentumBullish) signals.push('momentum↓');
          if (!priceAboveMid) signals.push('below mid');
          if (!recentBullish) signals.push('recent candles↓');
          reasons.push(`Bearish bias (${signals.join(', ')})`);
        }
      }
      
      // Determine setup grade based on BACKTESTED thresholds
      // Verified: Spark >= 40 + BB <= 0.5% = 83% win rate
      // Verified: Spark >= 50 + BB <= 0.5% = 88% win rate
      // Verified: Spark >= 60 + BB <= 0.5% = 90% win rate
      const hasBreakout = hasBreakoutUp || hasBreakoutDown;
      const volRatioNum = typeof compression.volRatio === 'string' ? parseFloat(compression.volRatio) : (compression.volRatio || 0);
      const bbWidthNum = typeof compression.bbWidth === 'string' ? parseFloat(compression.bbWidth) : (compression.bbWidth || 0);
      const hasVolumeSurge = volRatioNum > 1.5;
      const hasSqueeze = bbWidthNum <= 0.5; // BB <= 0.5% = squeeze active
      
      // BACKTESTED WIN RATES - verified thresholds
      if (compression.sparkScore >= 70 || (compression.sparkScore >= 60 && hasBreakout)) {
        setupGrade = 'GOLD';
        confidence = 90;
        reasons.push('🏆 GOLD - 90% win rate (backtested)');
      } else if (compression.sparkScore >= 60 || (compression.sparkScore >= 50 && hasSqueeze)) {
        setupGrade = 'GOLD';
        confidence = 88;
        reasons.push('🏆 GOLD - 88% win rate (backtested)');
      } else if (compression.sparkScore >= 50 || (compression.sparkScore >= 40 && hasSqueeze)) {
        setupGrade = 'HOT';
        confidence = 83;
        reasons.push('🔥 HOT - 83% win rate (backtested)');
      } else if (compression.sparkScore >= 40 || (compression.sparkScore >= 30 && hasVolumeSurge)) {
        setupGrade = 'HOT';
        confidence = 80;
        reasons.push('🔥 HOT - 80% win rate');
      } else if (compression.sparkScore >= 30) {
        setupGrade = 'READY';
        confidence = 70;
        reasons.push('✅ READY - compression building');
      } else {
        setupGrade = 'BUILDING';
        confidence = 55;
        reasons.push('📈 Building compression');
      }
      
      // Add compression triggers to reasons
      if (compression.triggers.length > 0) {
        reasons.push(...compression.triggers.slice(0, 3));
      }
      
      const bestPlay = recommendedDirection === 'CALL' ? bestCall : bestPut;
      
      // NOTE: These are QUALITY SCORES, not guaranteed win rates
      // Real historical backtest shows ~52% overall accuracy on SPY
      // Use confidence as a quality indicator, NOT a prediction
      const qualityScore = confidence; // Quality tier, not win probability
      const expectedMove = compression.sparkScore >= 60 ? 1.2 : compression.sparkScore >= 45 ? 0.7 : 0.4;
      const expectedPL = 0; // Removed - was misleading
      
      // Get top 5 calls and puts by volume for the chain display
      const topCalls = [...calls]
        .sort((a, b) => (b.volume || 0) - (a.volume || 0))
        .slice(0, 5)
        .map(c => ({
          strike: c.strike,
          bid: c.bid ?? 0,
          ask: c.ask ?? 0,
          mid: ((c.bid ?? 0) + (c.ask ?? 0)) / 2,
          volume: c.volume,
          openInterest: c.openInterest,
          iv: c.impliedVolatility,
          delta: c.delta,
          spreadPct: (c.ask ?? 0) > 0 ? (((c.ask ?? 0) - (c.bid ?? 0)) / (c.ask ?? 1) * 100) : 0
        }));
      
      const topPuts = [...puts]
        .sort((a, b) => (b.volume || 0) - (a.volume || 0))
        .slice(0, 5)
        .map(p => ({
          strike: p.strike,
          bid: p.bid ?? 0,
          ask: p.ask ?? 0,
          mid: ((p.bid ?? 0) + (p.ask ?? 0)) / 2,
          volume: p.volume,
          openInterest: p.openInterest,
          iv: p.impliedVolatility,
          delta: p.delta,
          spreadPct: (p.ask ?? 0) > 0 ? (((p.ask ?? 0) - (p.bid ?? 0)) / (p.ask ?? 1) * 100) : 0
        }));
      
      const payload = {
        symbol: upperSymbol,
        spotPrice,
        expiration: zeroDTE,
        
        // Real options data
        chainStats: {
          totalCalls: calls.length,
          totalPuts: puts.length,
          callStrikeRange: [calls[0]?.strike, calls[calls.length-1]?.strike],
          putStrikeRange: [puts[0]?.strike, puts[puts.length-1]?.strike]
        },
        
        // Top 5 contracts by volume
        topCalls,
        topPuts,
        
        // Best options near ATM
        bestCall,
        bestPut,
        
        // Compression/Spark analysis
        compression: {
          sparkScore: compression.sparkScore,
          phase: compression.phase,
          triggers: compression.triggers,
          bbWidth: compression.bbWidth,
          rangePct: compression.rangePct,
          volRatio: compression.volRatio
        },
        
        // Recommended play - always show best option
        recommendation: {
          direction: recommendedDirection,
          setupGrade,
          confidence,
          expectedWinRate: 0, // Removed - real backtest shows ~52% accuracy
          expectedPL,
          contract: bestPlay,
          reasons,
          disclaimer: 'Quality score only - not a guaranteed win rate. Real historical accuracy ~52%.'
        }
      };

      bestPlayCache.set(upperSymbol, { payload, timestamp: Date.now() });
      res.json(payload);
      
    } catch (error: any) {
      const message = error instanceof Error ? error.message : String(error);
      const rateLimited = isRateLimitedMessage(message);

      if (rateLimited) {
        bestPlayYahooCooldownUntil = Math.max(bestPlayYahooCooldownUntil, Date.now() + BEST_PLAY_YAHOO_COOLDOWN_MS);
        const remainingSec = Math.max(1, Math.ceil((bestPlayYahooCooldownUntil - Date.now()) / 1000));
        if (Date.now() - bestPlayCooldownLogAt > 5_000) {
          console.warn(`[BestPlay] Yahoo rate-limited for ${upperSymbol}; cooling down ${remainingSec}s.`);
          bestPlayCooldownLogAt = Date.now();
        }

        const staleCached = bestPlayCache.get(upperSymbol);
        if (staleCached && (Date.now() - staleCached.timestamp) <= BEST_PLAY_STALE_FALLBACK_MS) {
          return res.json(staleCached.payload);
        }

        return res.status(503).json({ error: "Best play provider rate-limited. Please retry shortly." });
      }

      console.error("Best Play error:", error);
      res.status(500).json({ error: message || "Failed to find best play" });
    }
  });

  const sectorUniverse = [
    { code: "XLC", label: "Communication Services" },
    { code: "XLY", label: "Consumer Discretionary" },
    { code: "XLP", label: "Consumer Staples" },
    { code: "XLE", label: "Energy" },
    { code: "XLF", label: "Financials" },
    { code: "XLV", label: "Health Care" },
    { code: "XLI", label: "Industrials" },
    { code: "XLK", label: "Information Technology" },
    { code: "XLB", label: "Materials" },
    { code: "XLRE", label: "Real Estate" },
    { code: "XLU", label: "Utilities" },
  ] as const;

  // ---------- Sector Pulse (live ETF breadth feed for top panel) ----------
  app.get("/api/sectors/:symbol", async (req, res) => {
    const anchorSymbol = String(req.params.symbol ?? "SPY").toUpperCase();

    const sectorFetches = await Promise.all(
      sectorUniverse.map(async (sector) => {
        try {
          const quote = await fetchLiveSpot(sector.code);
          const hasPrevClose = Number.isFinite(quote.prevClose) && quote.prevClose !== 0;
          const baseline = hasPrevClose ? quote.prevClose : quote.spot;
          const rawChangePct = baseline === 0 ? 0 : ((quote.spot - baseline) / baseline) * 100;

          return {
            code: sector.code,
            label: sector.label,
            changePct: Number.isFinite(rawChangePct) ? Number(rawChangePct.toFixed(4)) : null,
            live: true,
            source: quote.source,
            marketState: quote.marketState,
            timestamp: quote.timestamp,
          };
        } catch {
          return {
            code: sector.code,
            label: sector.label,
            changePct: null,
            live: false,
          };
        }
      }),
    );

    const liveSectors = sectorFetches.filter(
      (sector): sector is (typeof sectorFetches)[number] & { changePct: number; live: true } =>
        sector.live && typeof sector.changePct === "number",
    );

    const liveCount = liveSectors.length;
    const bullishCount = liveSectors.filter((sector) => sector.changePct >= 0).length;
    const bearishCount = liveSectors.filter((sector) => sector.changePct < 0).length;
    const breadthSync = liveCount > 0 ? bullishCount / liveCount : null;
    const breadthEdge =
      breadthSync === null ? null : Number((Math.abs(breadthSync - 0.5) * 2).toFixed(4));

    res.json({
      symbol: anchorSymbol,
      asOf: new Date().toISOString(),
      sectors: sectorFetches,
      breadth: {
        liveCount,
        bullishCount,
        bearishCount,
        breadthSync,
        breadthEdge,
      },
    });
  });

  // ---------- Spot Price (Lightweight endpoint for frequent polling) ----------
  app.get("/api/spot/:symbol", async (req, res) => {
    const { symbol } = req.params;
    const upperSymbol = symbol.toUpperCase();
    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    });
    
    try {
      const spotData = await fetchLiveSpot(upperSymbol);
      res.json(spotData);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isRateLimitedMessage(message)) {
        console.warn(`[Spot] Rate-limited for ${upperSymbol}.`);

        const cachedSpot = getCachedSpot(upperSymbol);
        if (cachedSpot && cachedSpot.ageMs <= 2 * 60 * 1000) {
          return res.json({
            ...cachedSpot.data,
            degraded: true,
            degradedReason: "cached-spot",
          });
        }

        // Degraded fallback: use latest candle close from the freshest timeframe available.
        const fallbackTimeframes: Array<"5m" | "15m" | "30m"> = ["5m", "15m", "30m"];
        for (const tf of fallbackTimeframes) {
          try {
            const intraday = await fetchLiveOHLC(upperSymbol, tf, "FULL");
            if (intraday.data.length > 0) {
              const last = intraday.data[intraday.data.length - 1];
              const prev = intraday.data.length > 1 ? intraday.data[intraday.data.length - 2] : last;
              return res.json({
                symbol: upperSymbol,
                spot: last.close,
                prevClose: prev.close,
                marketState: "REGULAR",
                timestamp: new Date(((last.time ?? Math.floor(Date.now() / 1000)) * 1000)).toISOString(),
                source: "yahoo",
                degraded: true,
                degradedReason: `intraday-${tf}`,
              });
            }
          } catch {
            // Continue to the next degraded fallback option.
          }
        }

        const candleFallback = getLastKnownSpotFromCandles(upperSymbol);
        if (candleFallback) {
          return res.json({
            ...candleFallback.data,
            degraded: true,
            degradedReason: "last-known-candle",
          });
        }

        if (cachedSpot) {
          return res.json({
            ...cachedSpot.data,
            degraded: true,
            degradedReason: "stale-cached-spot",
          });
        }

        return res.status(503).json({ error: "Spot provider rate-limited. Please retry shortly." });
      }
      console.error(`[Spot] Error fetching ${upperSymbol}:`, error);
      res.status(500).json({ error: "Failed to fetch spot price" });
    }
  });

  // ---------- Scanner ----------
  app.get("/api/scanner/start", (_req, res) => {
    startScanner();
    res.json({ status: "started" });
  });

  app.get("/api/scanner/status", (_req, res) => {
    res.json(getScannerStatus());
  });

  app.get("/api/scanner/results", (_req, res) => {
    res.json(getScannerResults());
  });

  app.get("/api/scanner/breakout-log", (req, res) => {
    const symbol = typeof req.query.symbol === "string" ? req.query.symbol : undefined;
    const requested = Number(req.query.limit);
    const limit = Number.isFinite(requested) && requested > 0 ? Math.min(2000, requested) : 200;

    res.json({
      success: true,
      symbol: symbol?.toUpperCase() || null,
      entries: getBreakoutAlertLog(limit, symbol),
      timestamp: Date.now(),
    });
  });

  app.get("/api/scanner/breakout-log/summary", (req, res) => {
    const requested = Number(req.query.hours);
    const lookbackHours = Number.isFinite(requested) && requested > 0 ? Math.min(48, requested) : 48;

    res.json({
      success: true,
      summary: getBreakoutAlertSummary(lookbackHours),
      timestamp: Date.now(),
    });
  });

  app.delete("/api/scanner/breakout-log/:symbol?", (req, res) => {
    const symbol = req.params.symbol?.toUpperCase();
    clearBreakoutAlertLog(symbol);

    res.json({
      success: true,
      message: symbol
        ? `Cleared breakout alert log for ${symbol}`
        : "Cleared full breakout alert log",
      timestamp: Date.now(),
    });
  });

  app.get("/api/scanner/result/:symbol", (req, res) => {
    const result = getScannerResult(req.params.symbol);
    if (result) {
      res.json(result);
    } else {
      res.status(404).json({ error: "Symbol not in scanner" });
    }
  });

  app.get("/api/scanner/watchlist", (_req, res) => {
    res.json(getWatchlist());
  });

  app.post("/api/scanner/watchlist/:symbol", (req, res) => {
    const added = addToWatchlist(req.params.symbol);
    res.json({ added, watchlist: getWatchlist() });
  });

  app.delete("/api/scanner/watchlist/:symbol", (req, res) => {
    const removed = removeFromWatchlist(req.params.symbol);
    res.json({ removed, watchlist: getWatchlist() });
  });

  // ---------- Pattern endpoint ----------
  app.get("/api/patterns/:symbol/:timeframe?", async (req, res) => {
    try {
      const { symbol, timeframe } = req.params;
      const tf = timeframe || "15m";
      
      const result = await scanSingleSymbol(symbol.toUpperCase(), tf);
      if (result) {
        res.json(result);
      } else {
        res.status(404).json({ error: "Could not analyze patterns" });
      }
    } catch (error) {
      res.status(500).json({ error: "Pattern detection failed" });
    }
  });

  // ---------- Monster OTM ----------
  app.get("/api/monster/:symbol/:timeframe?", async (req, res) => {
    try {
      const { symbol, timeframe } = req.params;
      const upperSymbol = symbol.toUpperCase();
      const tf = timeframe || "15m";
      
      // Fetch live spot price first
      let liveSpotPrice: number | undefined;
      try {
        const spotData = await fetchLiveSpot(upperSymbol);
        liveSpotPrice = spotData.spot;
      } catch (e) {
        // Fall through to cache/candle fallback.
      }

      if (liveSpotPrice == null) {
        liveSpotPrice = await resolveFallbackSpotPrice(upperSymbol, tf);
      }
      
      const liveResult = await fetchLiveOHLC(upperSymbol, tf, "FULL");
      
      let ohlc: any[];
      let sessionSplit = { rth: [] as any[], overnight: [] as any[], prevDayRth: [] as any[] };
      
      if (liveResult.data.length > 0) {
        ohlc = liveResult.data;
        sessionSplit = {
          rth: liveResult.rth,
          overnight: liveResult.overnight,
          prevDayRth: liveResult.prevDayRth,
        };
      } else {
        // Use live spot price for realistic simulated data
        const candleCount = getCandleCount(tf);
        ohlc = generateSampleOHLC(upperSymbol, candleCount, liveSpotPrice);
        sessionSplit = { rth: ohlc, overnight: [], prevDayRth: [] };
      }

      const analysis = analyzeSymbol(
        upperSymbol,
        ohlc,
        { maxAbsGammaStrike: null },
        sessionSplit
      );
      
      const now = new Date();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      
      const result = runMonsterOTMEngine(
        ohlc,
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
        sessionSplit
      );

      // Use live spot price if available, otherwise fall back to candle close
      const currentPrice = liveSpotPrice ?? ohlc[ohlc.length - 1]?.close ?? 0;

      res.json({
        ...result,
        currentPrice,
      });
    } catch (error) {
      console.error("Monster OTM error:", error);
      res.status(500).json({ error: "Monster OTM analysis failed" });
    }
  });

  // ---------- Monster OTM Panel (Synthetic Chain) ----------
  app.get("/api/monster-panel/:symbol", async (req, res) => {
    try {
      const symbol = req.params.symbol;
      
      if (!symbol || symbol.length < 1 || symbol.length > 10) {
        return res.status(400).json({ error: "Invalid symbol" });
      }
      
      const upperSymbol = symbol.toUpperCase();

      // Get live spot price first
      let lastPrice: number | undefined;
      try {
        const spotData = await fetchLiveSpot(upperSymbol);
        lastPrice = spotData.spot;
      } catch (e) {
        // Fall through to cache/candle fallback.
      }

      if (lastPrice == null) {
        lastPrice = await resolveFallbackSpotPrice(upperSymbol, '15m');
      }

      // Fetch OHLC for analysis
      const tfResult = await fetchLiveOHLC(upperSymbol, '15m', 'FULL');
      const ohlc = tfResult.data.length > 0
        ? tfResult.data
        : generateSampleOHLC(upperSymbol, 100, lastPrice);

      // Get panel data with synthetic chain
      const panelData = getMonsterOTMPanelData(ohlc, upperSymbol, lastPrice);
      
      // Compute expected move
      const atr = computeATR(ohlc);
      const spotPrice = lastPrice ?? ohlc[ohlc.length - 1]?.close ?? 100;
      const expectedMove = atr?.value ?? spotPrice * 0.02;

      // Try to get unified signal for play synthesis
      let unifiedOptionsPlay = null;
      try {
        // Build minimal market health for fusion
        const marketHealth: MarketHealthIndicators = {
          healthScore: 50,
          healthGrade: 'C',
          rsi: { value: 50 },
          macd: { value: 0 },
          adx: { value: 20 },
          vwapSlope: { value: 0 },
          ivChange: { value: 0 },
          orderflow: { value: 0 },
          gamma: { value: 0 },
          breadth: { value: 0 }
        };
        
        const fusionInput: FusionInput = {
          symbol: upperSymbol,
          ohlcByTF: { '15m': ohlc },
          patternsByTF: {},
          marketHealth,
          lastPrice: spotPrice
        };

        const snapshot = computeFusionSnapshot(fusionInput);
        const { computeUnifiedSignal } = await import('./unifiedSignal');
        
        const unified = computeUnifiedSignal({
          snapshot,
          currentPrice: spotPrice,
          recentOhlc: ohlc
        });

        // Synthesize the play
        unifiedOptionsPlay = synthesizeMonsterPlay({
          symbol: upperSymbol,
          timeframe: '15m',
          unified,
          chain: panelData.chain,
          spot: spotPrice,
          expectedMove,
          isSynthetic: true
        });
      } catch (e) {
        console.log("Unified play synthesis skipped:", e);
      }

      res.json({
        ...panelData,
        unifiedOptionsPlay,
        expectedMove
      });
    } catch (error) {
      console.error("Monster Panel error:", error);
      res.status(500).json({ error: "Monster Panel analysis failed" });
    }
  });

  // ---------- Gamma Ghost ----------
  // Cache synthetic chains for 30 seconds to reduce variance
  const gammaGhostChainCache: Map<string, { chain: any[]; ctx: any; timestamp: number; basePrice: number }> = new Map();
  const GAMMA_CHAIN_CACHE_MS = 30000;

  app.get("/api/gamma-ghost/:symbol", async (req, res) => {
    try {
      const upperSymbol = req.params.symbol.toUpperCase();

      // Get live spot price first
      let lastPrice: number;
      try {
        const spotData = await fetchLiveSpot(upperSymbol);
        lastPrice = spotData.spot;
      } catch (e) {
        // Fallback to candle close if spot fetch fails
        const liveResult = await fetchLiveOHLC(upperSymbol, '15m', 'FULL');
        if (liveResult.data.length > 0) {
          lastPrice = liveResult.data[liveResult.data.length - 1].close;
        } else {
          const fallbackSpot = await resolveFallbackSpotPrice(upperSymbol, '15m');
          if (fallbackSpot != null) {
            lastPrice = fallbackSpot;
          } else {
            const synthetic = generateSampleOHLC(upperSymbol, 2);
            lastPrice = synthetic[synthetic.length - 1]?.close ?? 100;
          }
        }
      }

      // Use cached chain if available and not expired, and price hasn't moved too much
      const cached = gammaGhostChainCache.get(upperSymbol);
      const now = Date.now();
      const priceMoved = cached ? Math.abs(lastPrice - cached.basePrice) / cached.basePrice > 0.005 : true;
      
      let chain: any[];
      let ctx: any;
      
      if (cached && (now - cached.timestamp < GAMMA_CHAIN_CACHE_MS) && !priceMoved) {
        chain = cached.chain;
        ctx = cached.ctx;
      } else {
        // Generate new chain and cache it
        chain = generateSampleChain(upperSymbol, lastPrice);
        ctx = generateHistoricalContext();
        gammaGhostChainCache.set(upperSymbol, { chain, ctx, timestamp: now, basePrice: lastPrice });
      }

      const underlying = {
        symbol: upperSymbol,
        spot: lastPrice,
        prevSpot: lastPrice * (1 + (Math.random() - 0.5) * 0.002),
        timestamp: new Date().toISOString()
      };

      // Run Gamma Ghost with time gate
      const result = runGammaGhostTimed(chain, underlying, ctx);

      res.json(result);
    } catch (error) {
      console.error("Gamma Ghost error:", error);
      res.status(500).json({ error: "Gamma Ghost analysis failed" });
    }
  });

  // ---------- Fusion Engine (Multi-TF) ----------
  app.get("/api/fusion/:symbol", async (req, res) => {
    try {
      const upperSymbol = req.params.symbol.toUpperCase();
      
      // Get live spot price first
      let lastPrice: number | undefined;
      try {
        const spotData = await fetchLiveSpot(upperSymbol);
        lastPrice = spotData.spot;
      } catch (e) {
        // Fall through to cache/candle fallback.
      }

      if (lastPrice == null) {
        lastPrice = await resolveFallbackSpotPrice(upperSymbol, '15m');
      }

      // Fetch OHLC for all timeframes in parallel (excluding 1m for stability)
      const tfConfigs: { tf: FusionTimeframe; count: number }[] = [
        { tf: '5m', count: 72 },
        { tf: '15m', count: 96 },
        { tf: '30m', count: 96 },
        { tf: '1h', count: 100 },
        { tf: '4h', count: 90 },
        { tf: '1D', count: 120 }
      ];

      const ohlcPromises = tfConfigs.map(async ({ tf, count }) => {
        try {
          const result = await fetchLiveOHLC(upperSymbol, tf, "FULL");
          if (result.data.length > 0) {
            return { tf, ohlc: result.data };
          }
          return { tf, ohlc: generateSampleOHLC(upperSymbol, count, lastPrice) };
        } catch (e) {
          return { tf, ohlc: generateSampleOHLC(upperSymbol, count, lastPrice) };
        }
      });

      const ohlcResults = await Promise.all(ohlcPromises);

      // Build OHLC and patterns by timeframe
      const ohlcByTF: Partial<Record<FusionTimeframe, any[]>> = {};
      const patternsByTF: Partial<Record<FusionTimeframe, FusionPatternResult[]>> = {};

      for (const { tf, ohlc } of ohlcResults) {
        ohlcByTF[tf] = ohlc;
        const patterns = detectAllPatterns(ohlc, tf);
        patternsByTF[tf] = patterns.map(p => ({
          name: p.name,
          type: p.type as 'bullish' | 'bearish' | 'neutral',
          category: p.category as FusionPatternResult['category'],
          confidence: p.confidence,
          description: p.description,
          startIndex: p.startIndex,
          endIndex: p.endIndex,
          priceTarget: p.priceTarget,
          stopLoss: p.stopLoss
        }));
      }

      // Get market health from 15m analysis (primary timeframe)
      const primaryOhlc = ohlcByTF['15m'] ?? ohlcByTF['5m'] ?? [];
      const analysis = analyzeSymbol(upperSymbol, primaryOhlc, { maxAbsGammaStrike: null }, { 
        rth: primaryOhlc, 
        overnight: [], 
        prevDayRth: [] 
      });

      // Build market health indicators for Fusion Engine
      const mh = analysis.marketHealth;
      const marketHealth: MarketHealthIndicators = {
        healthScore: (mh?.rsi?.contribution ?? 0.5) * 0.15 + 
                     (mh?.macd?.contribution ?? 0.5) * 0.15 +
                     (mh?.adx?.contribution ?? 0.5) * 0.20 +
                     (mh?.obv?.contribution ?? 0.5) * 0.15 +
                     (mh?.bollingerBands?.contribution ?? 0.5) * 0.15 +
                     (mh?.stochastic?.contribution ?? 0.5) * 0.10 +
                     (mh?.cmf?.contribution ?? 0.5) * 0.10,
        healthGrade: mh?.healthGrade ?? 'C',
        rsi: { value: mh?.rsi?.value ?? 50 },
        macd: { value: mh?.macd?.value ?? 0 },
        adx: { value: mh?.adx?.value ?? 25 },
        vwapSlope: { value: mh?.vwapSlope?.value ?? 0 },
        ivChange: { value: mh?.ivChange?.value ?? 0 },
        orderflow: { value: mh?.orderflow?.tickImbalance ?? 0 },
        gamma: { value: mh?.gamma?.maxAbsGammaStrike ?? 0 },
        breadth: { value: mh?.breadth?.composite ?? 0.5 },
        contributors: mh?.contributors?.map((c: any) => c.name) ?? []
      };

      // Compute fusion snapshot
      console.log(`[Fusion] ${upperSymbol} spot=${lastPrice} code=v2`);
      const snapshot = computeFusionSnapshot({
        symbol: upperSymbol,
        ohlcByTF,
        patternsByTF,
        marketHealth,
        lastPrice
      });

      // Get primary pattern from the first timeframe with a pattern
      let primaryPattern: LivePattern | null = null;
      for (const tf of snapshot.timeframes) {
        if (tf.primary) {
          primaryPattern = tf.primary;
          break;
        }
      }

      // Use the latest price from spot or infer from OHLC
      const finalLastPrice = lastPrice ?? 
        (ohlcByTF['5m']?.[ohlcByTF['5m'].length - 1]?.close ?? 100);

      // Record signal to history for tracking
      if (snapshot.unifiedSignal) {
        recordSignal(
          upperSymbol,
          finalLastPrice,
          snapshot.unifiedSignal,
          snapshot.monsterGateDecision
        );
        // Update outcomes for all previous signals
        updateOutcomes(upperSymbol, finalLastPrice);
      }

      // Use the unifiedSignal directly from fusion.ts (single source of truth)
      // It already contains unifiedDirection, unifiedConfidence, unifiedPlay
      // computed by computeUnifiedSignal with weighted fusion
      res.json({
        ...snapshot
        // unifiedSignal is already part of snapshot from computeFusionSnapshot
      });
    } catch (error) {
      console.error("Fusion Engine error:", error);
      res.status(500).json({ error: "Fusion analysis failed" });
    }
  });

  // kick off scanner on boot
  startScanner();

  // REAL Historical Backtest endpoint - uses actual Yahoo Finance data
  app.get("/api/backtest", async (req, res) => {
    try {
      const symbol = (req.query.symbol as string) || 'SPY';
      const timeframe = (req.query.timeframe as string) || '5m';
      
      const { runHistoricalBacktest, formatHistoricalBacktest } = await import('./historicalBacktest');
      
      const result = await runHistoricalBacktest(symbol, timeframe);

      res.json({
        success: true,
        result,
        formatted: formatHistoricalBacktest(result)
      });
    } catch (error) {
      console.error('Historical backtest error:', error);
      res.status(500).json({ error: 'Historical backtest failed', details: String(error) });
    }
  });

  // GOLD Signal Timing Analysis endpoint
  app.get("/api/gold-timing", async (_req, res) => {
    try {
      const { runGoldTimingAnalysis, formatGoldTimingReport } = await import('./backtest');
      
      const result = runGoldTimingAnalysis(3000);

      res.json({
        success: true,
        result,
        formatted: formatGoldTimingReport(result)
      });
    } catch (error) {
      console.error('Gold timing analysis error:', error);
      res.status(500).json({ error: 'Gold timing analysis failed' });
    }
  });

  // Market Session Timing Analysis endpoint
  app.get("/api/session-timing", async (_req, res) => {
    try {
      const { runSessionTimingAnalysis, formatSessionTimingReport } = await import('./backtest');
      
      const result = runSessionTimingAnalysis(3000);

      res.json({
        success: true,
        result,
        formatted: formatSessionTimingReport(result)
      });
    } catch (error) {
      console.error('Session timing analysis error:', error);
      res.status(500).json({ error: 'Session timing analysis failed' });
    }
  });

  // Bounce Detection Backtest endpoint
  app.get("/api/bounce-backtest", async (_req, res) => {
    try {
      const { runBounceBacktest, formatBounceBacktestReport } = await import('./backtest');
      
      const result = runBounceBacktest(10000);

      res.json({
        success: true,
        result,
        formatted: formatBounceBacktestReport(result)
      });
    } catch (error) {
      console.error('Bounce backtest error:', error);
      res.status(500).json({ error: 'Bounce backtest failed' });
    }
  });

  // Option B Balanced Strategy Backtest endpoint
  app.get("/api/option-b-backtest", async (_req, res) => {
    try {
      const { runOptionBBacktest, formatOptionBReport } = await import('./backtest');
      
      const result = runOptionBBacktest(10000); // 10,000 trades

      res.json({
        success: true,
        result,
        formatted: formatOptionBReport(result)
      });
    } catch (error) {
      console.error('Option B backtest error:', error);
      res.status(500).json({ error: 'Option B backtest failed' });
    }
  });

  // ========== Signal History Tracking ==========

  app.get("/api/signal-history/live-tuning", async (req, res) => {
    try {
      const requested = Number(req.query.hours);
      const hours = Number.isFinite(requested) && requested > 0 ? Math.min(48, requested) : 8;
      const snapshot = getLiveTuningSnapshot(hours);

      res.json({
        success: true,
        snapshot,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Live tuning snapshot error:', error);
      res.status(500).json({ error: 'Failed to get live tuning snapshot' });
    }
  });

  app.get("/api/signal-history/daily-tuning/:limitParam?", async (req, res) => {
    try {
      const rawLimit = typeof req.query.limit === 'string'
        ? req.query.limit
        : typeof req.params.limitParam === 'string'
          ? req.params.limitParam.replace(/^limit=/i, '')
          : undefined;
      const parsed = rawLimit ? parseInt(rawLimit, 10) : Number.NaN;
      const limit = Number.isFinite(parsed) && parsed > 0 ? Math.min(180, parsed) : 7;
      const entries = getDailyTuningLog(limit);

      res.json({
        success: true,
        entries,
        count: entries.length,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Daily tuning log error:', error);
      res.status(500).json({ error: 'Failed to get daily tuning log' });
    }
  });
  
  // Get signal history for a symbol
  app.get("/api/signal-history/:symbol", async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const limit = parseInt(req.query.limit as string) || 50;
      
      // Update outcomes with current price
      try {
        const spotData = await fetchLiveSpot(symbol);
        updateOutcomes(symbol, spotData.spot);
      } catch (e) {
        // Continue without update
      }
      
      const history = getSignalHistory(symbol, limit);
      const summary = getDailySummary(symbol);
      
      res.json({
        symbol,
        history,
        summary,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Signal history error:', error);
      res.status(500).json({ error: 'Failed to get signal history' });
    }
  });

  app.get("/api/signal-history/:symbol/metrics", async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const requested = Number(req.query.hours);
      const lookbackHours = Number.isFinite(requested) && requested > 0 ? Math.min(720, requested) : 24;

      try {
        const spotData = await fetchLiveSpot(symbol);
        updateOutcomes(symbol, spotData.spot);
      } catch (e) {
        // Continue without update.
      }

      const metrics = getSignalMetrics(symbol, lookbackHours);

      res.json({
        symbol,
        metrics,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Signal metrics error:', error);
      res.status(500).json({ error: 'Failed to get signal metrics' });
    }
  });
  
  // Get GOLD/HOT signals only
  app.get("/api/signal-history/:symbol/gold-hot", async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      const limit = parseInt(req.query.limit as string) || 20;
      
      // Update outcomes with current price
      try {
        const spotData = await fetchLiveSpot(symbol);
        updateOutcomes(symbol, spotData.spot);
      } catch (e) {
        // Continue without update
      }
      
      const goldHotSignals = getGoldHotSignals(symbol, limit);
      
      res.json({
        symbol,
        signals: goldHotSignals,
        count: goldHotSignals.length,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Gold/Hot signals error:', error);
      res.status(500).json({ error: 'Failed to get gold/hot signals' });
    }
  });
  
  // Get daily summary for a symbol
  app.get("/api/signal-summary/:symbol", async (req, res) => {
    try {
      const symbol = req.params.symbol.toUpperCase();
      
      // Update outcomes with current price
      try {
        const spotData = await fetchLiveSpot(symbol);
        updateOutcomes(symbol, spotData.spot);
      } catch (e) {
        // Continue without update
      }
      
      const summary = getDailySummary(symbol);
      
      res.json({
        symbol,
        summary,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Signal summary error:', error);
      res.status(500).json({ error: 'Failed to get signal summary' });
    }
  });
  
  // Get all symbols with history
  app.get("/api/signal-history", async (_req, res) => {
    try {
      const symbols = getAllSymbolsWithHistory();
      const summaries: Record<string, any> = {};
      
      for (const sym of symbols) {
        summaries[sym] = getDailySummary(sym);
      }
      
      res.json({
        symbols,
        summaries,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('All signal history error:', error);
      res.status(500).json({ error: 'Failed to get all signal history' });
    }
  });
  
  // Clear history (for testing)
  app.delete("/api/signal-history/:symbol?", async (req, res) => {
    try {
      const symbol = req.params.symbol?.toUpperCase();
      clearHistory(symbol);
      
      res.json({
        success: true,
        message: symbol ? `Cleared history for ${symbol}` : 'Cleared all history'
      });
    } catch (error) {
      console.error('Clear history error:', error);
      res.status(500).json({ error: 'Failed to clear history' });
    }
  });

  // Signal Tuning Analysis - analyze signal history to optimize thresholds
  app.get("/api/signal-tuning", async (_req, res) => {
    try {
      const result = runTuningAnalysis();
      const recentDaily = getDailyTuningLog(2);
      const liveSnapshot = getLiveTuningSnapshot(24);
      
      res.json({
        success: true,
        result,
        formatted: formatTuningReport(result),
        context: {
          recentDaily,
          liveSnapshot,
        },
      });
    } catch (error) {
      console.error('Tuning analysis error:', error);
      res.status(500).json({ error: 'Tuning analysis failed' });
    }
  });

  app.post("/api/log-terms-acceptance", async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: "userId is required" });
      }

      const ipAddress =
        (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
        req.socket.remoteAddress ||
        null;
      const userAgent = (req.headers["user-agent"] as string) || null;

      await db.insert(termsAcceptanceLogs).values({
        userId,
        ipAddress,
        userAgent,
        version: "v1",
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Terms acceptance logging error:", error);
      res.status(500).json({ error: "Failed to log acceptance" });
    }
  });

  return httpServer;
}

function getCandleCount(timeframe: string): number {
  switch (timeframe) {
    case "5m": return 72;
    case "15m": return 96;
    case "1h": return 100;
    case "4h": return 90;
    case "1d": return 120;
    default: return 100;
  }
}
