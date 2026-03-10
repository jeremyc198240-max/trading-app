import { OHLC, BreakoutZones } from './fusion';

export interface CorvonaLevels {
  // Tight levels for 0DTE (closest to price)
  H1: number;  // +0.15% - scalp resistance
  H2: number;  // +0.30% - minor resistance  
  H3: number;  // +0.50% - major resistance
  H4: number;  // +0.75% - extreme resistance
  L1: number;  // -0.15% - scalp support
  L2: number;  // -0.30% - minor support
  L3: number;  // -0.50% - major support
  L4: number;  // -0.75% - extreme support
  pivot: number;  // Central pivot point
  atr: number;    // ATR for context
}

export function computeCorvonaLevels(sessionOHLC: OHLC[]): CorvonaLevels | null {
  if (!sessionOHLC.length) return null;

  const highs = sessionOHLC.map(c => c.high);
  const lows = sessionOHLC.map(c => c.low);
  const closes = sessionOHLC.map(c => c.close);

  const prevHigh = Math.max(...highs);
  const prevLow = Math.min(...lows);
  const prevClose = closes[closes.length - 1];

  // Calculate ATR for volatility-adjusted levels
  let atrSum = 0;
  const atrPeriod = Math.min(14, sessionOHLC.length);
  for (let i = sessionOHLC.length - atrPeriod; i < sessionOHLC.length; i++) {
    if (i < 0) continue;
    const candle = sessionOHLC[i];
    const prevCandle = i > 0 ? sessionOHLC[i - 1] : candle;
    const tr = Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - prevCandle.close),
      Math.abs(candle.low - prevCandle.close)
    );
    atrSum += tr;
  }
  const atr = atrSum / atrPeriod;

  // Classic pivot point
  const pivot = (prevHigh + prevLow + prevClose) / 3;

  // 0DTE PREMIUM-OPTIMIZED levels (target 25-100% contract gains)
  // H1/L1 = 0.30% underlying = ~25-30% premium gain
  // H2/L2 = 0.50% underlying = ~40-50% premium gain (stop here = ~30% loss)
  // H3/L3 = 0.75% underlying = ~60-75% premium gain
  // H4/L4 = 1.00% underlying = ~80-100% premium gain
  
  const pctH1 = 0.003, pctH2 = 0.005, pctH3 = 0.0075, pctH4 = 0.01;

  return {
    H1: Math.round((prevClose * (1 + pctH1)) * 100) / 100,
    H2: Math.round((prevClose * (1 + pctH2)) * 100) / 100,
    H3: Math.round((prevClose * (1 + pctH3)) * 100) / 100,
    H4: Math.round((prevClose * (1 + pctH4)) * 100) / 100,
    L1: Math.round((prevClose * (1 - pctH1)) * 100) / 100,
    L2: Math.round((prevClose * (1 - pctH2)) * 100) / 100,
    L3: Math.round((prevClose * (1 - pctH3)) * 100) / 100,
    L4: Math.round((prevClose * (1 - pctH4)) * 100) / 100,
    pivot: Math.round(pivot * 100) / 100,
    atr: Math.round(atr * 100) / 100
  };
}

export function corvonaToBreakoutZones(levels: CorvonaLevels): BreakoutZones {
  return {
    upper: levels.H4,
    lower: levels.L4,
    invalidation: levels.H3,
    retest: levels.L3
  };
}
