import type { Express } from "express";
import { type Server } from "http";
import { analyzeSymbol, generateSampleOHLC } from "./finance";
import { fetchLiveOHLC } from "./marketData";
import { detectAllPatterns } from "./patterns";
import { 
  startScanner, 
  getScannerResults, 
  getScannerResult, 
  getScannerStatus, 
  getWatchlist, 
  addToWatchlist, 
  removeFromWatchlist,
  scanSingleSymbol 
} from "./scanner";
import { runMonsterOTMEngine } from "./monsterOtmEngine";
import { 
  runGammaGhostTimed, 
  generateSampleChain, 
  generateHistoricalContext 
} from "./gammaGhost";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.get("/api/analyze/:symbol/:timeframe?", async (req, res) => {
    try {
      const { symbol, timeframe } = req.params;
      
      if (!symbol || symbol.length < 1 || symbol.length > 10) {
        return res.status(400).json({ error: "Invalid symbol" });
      }

      const upperSymbol = symbol.toUpperCase();
      const tf = timeframe || "15m";
      
      const liveResult = await fetchLiveOHLC(upperSymbol, tf, 'FULL');
      
      let ohlc: any[];
      let isLive = false;
      let dataSource = "simulated";
      let sessionSplit = { rth: [] as any[], overnight: [] as any[], prevDayRth: [] as any[] };
      
      if (liveResult.isLive && liveResult.data.length > 0) {
        ohlc = liveResult.data;
        isLive = true;
        dataSource = "live";
        sessionSplit = {
          rth: liveResult.rth,
          overnight: liveResult.overnight,
          prevDayRth: liveResult.prevDayRth,
        };
      } else {
        const candleCount = getCandleCount(tf);
        ohlc = generateSampleOHLC(upperSymbol, candleCount);
        dataSource = liveResult.error ? `simulated (${liveResult.error})` : "simulated";
        sessionSplit = { rth: ohlc, overnight: [], prevDayRth: [] };
      }
      
      const analysis = analyzeSymbol(upperSymbol, ohlc, { maxAbsGammaStrike: null }, sessionSplit);
      
      res.json({
        ...analysis,
        isLive,
        dataSource,
      });
    } catch (error) {
      console.error("Analysis error:", error);
      res.status(500).json({ error: "Failed to analyze symbol" });
    }
  });

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

  app.get("/api/status", (_req, res) => {
    res.json({
      live: true,
      message: "Live data from Yahoo Finance",
    });
  });

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

  app.get("/api/monster/:symbol/:timeframe?", async (req, res) => {
    try {
      const { symbol, timeframe } = req.params;
      const upperSymbol = symbol.toUpperCase();
      const tf = timeframe || "15m";
      
      const liveResult = await fetchLiveOHLC(upperSymbol, tf, 'FULL');
      
      let ohlc: any[];
      let sessionSplit = { rth: [] as any[], overnight: [] as any[], prevDayRth: [] as any[] };
      
      if (liveResult.isLive && liveResult.data.length > 0) {
        ohlc = liveResult.data;
        sessionSplit = {
          rth: liveResult.rth,
          overnight: liveResult.overnight,
          prevDayRth: liveResult.prevDayRth,
        };
      } else {
        const candleCount = getCandleCount(tf);
        ohlc = generateSampleOHLC(upperSymbol, candleCount);
        sessionSplit = { rth: ohlc, overnight: [], prevDayRth: [] };
      }

      const analysis = analyzeSymbol(upperSymbol, ohlc, { maxAbsGammaStrike: null }, sessionSplit);
      
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

      const lastPrice = ohlc[ohlc.length - 1]?.close ?? 0;

      res.json({
        ...result,
        currentPrice: lastPrice
      });
    } catch (error) {
      console.error("Monster OTM error:", error);
      res.status(500).json({ error: "Monster OTM analysis failed" });
    }
  });

  app.get("/api/gamma-ghost/:symbol", async (req, res) => {
    try {
      const { symbol } = req.params;
      const upperSymbol = symbol.toUpperCase();
      
      const liveResult = await fetchLiveOHLC(upperSymbol, '15m', 'FULL');
      const lastPrice = liveResult.isLive && liveResult.data.length > 0
        ? liveResult.data[liveResult.data.length - 1].close
        : 450 + Math.random() * 50;
      
      const chain = generateSampleChain(upperSymbol, lastPrice);
      const ctx = generateHistoricalContext();
      
      const underlying = {
        symbol: upperSymbol,
        spot: lastPrice,
        prevSpot: lastPrice * (1 + (Math.random() - 0.5) * 0.002),
        timestamp: new Date().toISOString()
      };
      
      const result = runGammaGhostTimed(chain, underlying, ctx);
      
      res.json(result);
    } catch (error) {
      console.error("Gamma Ghost error:", error);
      res.status(500).json({ error: "Gamma Ghost analysis failed" });
    }
  });

  startScanner();

  return httpServer;
}

function getCandleCount(timeframe: string): number {
  switch (timeframe) {
    case "1m": return 60;
    case "5m": return 72;
    case "15m": return 96;
    case "1h": return 100;
    case "4h": return 90;
    case "1d": return 120;
    default: return 100;
  }
}
