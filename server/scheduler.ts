import { recordData } from "./dataRecorder";

declare global {
  var currentPrice: number | null;
  var activeSignals: unknown[];

  var currentVolume: any;
  var trendState: any;
  var volatilityLevel: any;

  var engineState: any;
  var patternFusionState: any;

  var marketStructure: any;
  var swingHighs: any;
  var swingLows: any;
  var chochState: any;
  var bosState: any;

  var vwap: any;
  var rsi: any;
  var macd: any;
  var stochastic: any;
  var obv: any;
  var adx: any;
  var breadth: any;
  var bollingerBands: any;
  var emaCloud: any;

  var patternDetections: any;
  var wedgeDetections: any;
  var flagDetections: any;
  var pennantDetections: any;
  var triangleDetections: any;
  var channelDetections: any;
  var chochDetections: any;
  var nr7Detections: any;
  var insideBarDetections: any;
  var candlestickDetections: any;
  var patternGeometryMap: any;
  var patternScores: any;
  var patternLifecycleStates: any;
  var patternConfidenceMap: any;

  var orderFlow: any;
  var liquidityZones: any;
  var orderBlocks: any;
  var breakerBlocks: any;
  var gapDetections: any;

  var optionsData: any;
  var gexData: any;
  var expectedMove: any;

  var marketHealthScore: any;
}

function isMarketOpenEST() {
  const now = new Date();
  const est = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));

  const h = est.getHours();
  const m = est.getMinutes();

  const afterOpen = h > 8 || (h === 8 && m >= 30);
  const beforeClose = h < 16;

  return afterOpen && beforeClose;
}

async function getSnapshot() {
  const g = globalThis as any;
  // gather every piece of state we track on the client so the
  // 15‑minute log contains a full market picture for ML training
  return {
    price: g.currentPrice || null,
    volume: g.currentVolume || null,
    trendState: g.trendState || null,
    volatilityLevel: g.volatilityLevel || null,

    engineState: g.engineState || null,
    patternFusionState: g.patternFusionState || null,

    marketStructure: g.marketStructure || null,
    swingHighs: g.swingHighs || null,
    swingLows: g.swingLows || null,
    chochState: g.chochState || null,
    bosState: g.bosState || null,

    vwap: g.vwap || null,
    rsi: g.rsi || null,
    macd: g.macd || null,
    stochastic: g.stochastic || null,
    obv: g.obv || null,
    adx: g.adx || null,
    breadth: g.breadth || null,
    bollingerBands: g.bollingerBands || null,
    emaCloud: g.emaCloud || null,

    patternDetections: g.patternDetections || null,
    wedgeDetections: g.wedgeDetections || null,
    flagDetections: g.flagDetections || null,
    pennantDetections: g.pennantDetections || null,
    triangleDetections: g.triangleDetections || null,
    channelDetections: g.channelDetections || null,
    chochDetections: g.chochDetections || null,
    nr7Detections: g.nr7Detections || null,
    insideBarDetections: g.insideBarDetections || null,
    candlestickDetections: g.candlestickDetections || null,
    patternGeometryMap: g.patternGeometryMap || null,
    patternScores: g.patternScores || null,
    patternLifecycleStates: g.patternLifecycleStates || null,
    patternConfidenceMap: g.patternConfidenceMap || null,

    // orderflow / liquidity / options
    orderFlow: g.orderFlow || null,
    liquidityZones: g.liquidityZones || null,
    orderBlocks: g.orderBlocks || null,
    breakerBlocks: g.breakerBlocks || null,
    gapDetections: g.gapDetections || null,

    optionsData: g.optionsData || null,
    gexData: g.gexData || null,
    expectedMove: g.expectedMove || null,

    marketHealthScore: g.marketHealthScore || null,

    // active signals is still useful as a separate field
    signals: g.activeSignals || []
  };
}

// Removed 15m market recorder to prevent log overload

setTimeout(async () => {
  const s = await getSnapshot();
  console.log("TEST SNAPSHOT:", s);
  recordData(s);
}, 2000);

setTimeout(async () => {
  const s = await getSnapshot();
  console.log("LIVE TEST SNAPSHOT:", s);
  recordData(s);
}, 15000);
