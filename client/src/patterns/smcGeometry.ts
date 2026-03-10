import type { OHLC, DrawablePattern, PatternGeometry, GeometryPoint, GeometryLine } from "@shared/schema";

function getSlice(ohlc: OHLC[], pattern: DrawablePattern) {
  const s = Math.max(0, Math.min(pattern.startIndex, ohlc.length - 1));
  const e = Math.max(0, Math.min(pattern.endIndex, ohlc.length - 1));
  return { s, e, slice: ohlc.slice(s, e + 1) };
}

export function buildSMCOrderBlock(ohlc: OHLC[], pattern: DrawablePattern): PatternGeometry | null {
  const { s, e, slice } = getSlice(ohlc, pattern);
  if (slice.length === 0) return null;

  const isBullish = pattern.type === "bullish";
  const obHigh = Math.max(...slice.map(c => c.high));
  const obLow = Math.min(...slice.map(c => c.low));
  const extend = Math.min(e + 8, ohlc.length - 1);

  const points: GeometryPoint[] = [
    { x: s, y: obHigh, label: "OB" },
  ];

  const lines: GeometryLine[] = [
    { start: { x: s, y: obHigh }, end: { x: extend, y: obHigh }, style: "solid" },
    { start: { x: s, y: obLow }, end: { x: extend, y: obLow }, style: "solid" },
  ];

  const fill = {
    points: [
      { x: s, y: obHigh },
      { x: extend, y: obHigh },
      { x: extend, y: obLow },
      { x: s, y: obLow },
    ],
    opacity: 0.15,
  };

  return {
    points,
    lines,
    breakoutLevel: isBullish ? obHigh : obLow,
    invalidationLevel: isBullish ? obLow : obHigh,
    fill,
  };
}

export function buildSMCBreakerBlock(ohlc: OHLC[], pattern: DrawablePattern): PatternGeometry | null {
  const { s, e, slice } = getSlice(ohlc, pattern);
  if (slice.length === 0) return null;

  const isBullish = pattern.type === "bullish";
  const bbHigh = Math.max(...slice.map(c => c.high));
  const bbLow = Math.min(...slice.map(c => c.low));
  const extend = Math.min(e + 8, ohlc.length - 1);

  const points: GeometryPoint[] = [
    { x: s, y: isBullish ? bbLow : bbHigh, label: "Breaker" },
  ];

  const lines: GeometryLine[] = [
    { start: { x: s, y: bbHigh }, end: { x: extend, y: bbHigh }, style: "solid" },
    { start: { x: s, y: bbLow }, end: { x: extend, y: bbLow }, style: "solid" },
  ];

  const fill = {
    points: [
      { x: s, y: bbHigh },
      { x: extend, y: bbHigh },
      { x: extend, y: bbLow },
      { x: s, y: bbLow },
    ],
    opacity: 0.12,
  };

  return {
    points,
    lines,
    breakoutLevel: isBullish ? bbHigh : bbLow,
    invalidationLevel: isBullish ? bbLow : bbHigh,
    fill,
  };
}

export function buildSMCLiquiditySweep(ohlc: OHLC[], pattern: DrawablePattern): PatternGeometry | null {
  const { e } = getSlice(ohlc, pattern);
  const candle = ohlc[e];
  if (!candle) return null;

  const isSweepHigh = pattern.name.toLowerCase().includes("high");
  const wickLevel = isSweepHigh ? candle.high : candle.low;
  const label = isSweepHigh ? "Sweep High" : "Sweep Low";

  const points: GeometryPoint[] = [
    { x: e, y: wickLevel, label },
  ];

  const lines: GeometryLine[] = [
    { start: { x: Math.max(0, e - 3), y: wickLevel }, end: { x: Math.min(ohlc.length - 1, e + 3), y: wickLevel }, style: "dashed" },
  ];

  return {
    points,
    lines,
    breakoutLevel: null,
    invalidationLevel: null,
  };
}

export function buildSMCLiquidityGrab(ohlc: OHLC[], pattern: DrawablePattern): PatternGeometry | null {
  const { e } = getSlice(ohlc, pattern);
  const candle = ohlc[e];
  if (!candle) return null;

  const isBullish = pattern.type === "bullish";
  const grabLevel = isBullish ? Math.min(candle.open, candle.close) : Math.max(candle.open, candle.close);

  const points: GeometryPoint[] = [
    { x: e, y: grabLevel, label: "Grab" },
  ];

  const lines: GeometryLine[] = [
    { start: { x: Math.max(0, e - 2), y: grabLevel }, end: { x: Math.min(ohlc.length - 1, e + 4), y: grabLevel }, style: "dashed" },
  ];

  return {
    points,
    lines,
    breakoutLevel: null,
    invalidationLevel: null,
  };
}

export function buildSMCBOS(ohlc: OHLC[], pattern: DrawablePattern): PatternGeometry | null {
  const { s, e, slice } = getSlice(ohlc, pattern);
  if (slice.length === 0) return null;

  const isBullish = pattern.type === "bullish";
  const swingLevel = isBullish
    ? Math.max(...slice.map(c => c.high))
    : Math.min(...slice.map(c => c.low));
  const extend = Math.min(e + 5, ohlc.length - 1);

  const points: GeometryPoint[] = [
    { x: e, y: swingLevel, label: "BOS" },
  ];

  const lines: GeometryLine[] = [
    { start: { x: s, y: swingLevel }, end: { x: extend, y: swingLevel }, style: "solid" },
  ];

  return {
    points,
    lines,
    breakoutLevel: swingLevel,
    invalidationLevel: null,
  };
}

export function buildSMCCHOCH(ohlc: OHLC[], pattern: DrawablePattern): PatternGeometry | null {
  const { s, e, slice } = getSlice(ohlc, pattern);
  if (slice.length === 0) return null;

  const isBullish = pattern.type === "bullish";
  const swingLevel = isBullish
    ? Math.max(...slice.map(c => c.high))
    : Math.min(...slice.map(c => c.low));
  const extend = Math.min(e + 5, ohlc.length - 1);

  const points: GeometryPoint[] = [
    { x: e, y: swingLevel, label: "CHOCH" },
  ];

  const lines: GeometryLine[] = [
    { start: { x: s, y: swingLevel }, end: { x: extend, y: swingLevel }, style: "dashed" },
  ];

  return {
    points,
    lines,
    breakoutLevel: swingLevel,
    invalidationLevel: null,
  };
}

export function buildSMCSwingPoint(ohlc: OHLC[], pattern: DrawablePattern): PatternGeometry | null {
  const { e } = getSlice(ohlc, pattern);
  const candle = ohlc[e];
  if (!candle) return null;

  const name = pattern.name.toLowerCase();
  let label: string;
  let markerY: number;

  if (name.includes("higher high")) {
    label = "HH";
    markerY = candle.high;
  } else if (name.includes("higher low") || name.includes("hl")) {
    label = "HL";
    markerY = candle.low;
  } else if (name.includes("lower high") || name.includes("lh")) {
    label = "LH";
    markerY = candle.high;
  } else if (name.includes("lower low")) {
    label = "LL";
    markerY = candle.low;
  } else {
    const isBullish = pattern.type === "bullish";
    label = isBullish ? "HH" : "LL";
    markerY = isBullish ? candle.high : candle.low;
  }

  const points: GeometryPoint[] = [
    { x: e, y: markerY, label },
  ];

  return {
    points,
    lines: [],
    breakoutLevel: null,
    invalidationLevel: null,
  };
}
