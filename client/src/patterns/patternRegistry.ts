import type { OHLC, DrawablePattern } from "@shared/schema";
import {
  buildSMCOrderBlock,
  buildSMCBreakerBlock,
  buildSMCLiquiditySweep,
  buildSMCLiquidityGrab,
  buildSMCBOS,
  buildSMCCHOCH,
  buildSMCSwingPoint,
} from "./smcGeometry";

export interface PatternRegistryEntry {
  name: string;
  category: string;
  geometryBuilder: (ohlc: OHLC[], pattern: DrawablePattern) => DrawablePattern["geometry"] | null;
  showOnChart: boolean;
}

function buildTwoTrendlineGeometry(_ohlc: OHLC[], pattern: DrawablePattern): DrawablePattern["geometry"] | null {
  return pattern.geometry ?? null;
}

function buildDoubleTopGeometry(_ohlc: OHLC[], pattern: DrawablePattern): DrawablePattern["geometry"] | null {
  return pattern.geometry ?? null;
}

function buildDoubleBottomGeometry(_ohlc: OHLC[], pattern: DrawablePattern): DrawablePattern["geometry"] | null {
  return pattern.geometry ?? null;
}

function buildTripleTopGeometry(_ohlc: OHLC[], pattern: DrawablePattern): DrawablePattern["geometry"] | null {
  return pattern.geometry ?? null;
}

function buildTripleBottomGeometry(_ohlc: OHLC[], pattern: DrawablePattern): DrawablePattern["geometry"] | null {
  return pattern.geometry ?? null;
}

function buildHeadAndShouldersGeometry(_ohlc: OHLC[], pattern: DrawablePattern): DrawablePattern["geometry"] | null {
  return pattern.geometry ?? null;
}

function buildInverseHeadAndShouldersGeometry(_ohlc: OHLC[], pattern: DrawablePattern): DrawablePattern["geometry"] | null {
  return pattern.geometry ?? null;
}

function buildFlagGeometry(_ohlc: OHLC[], pattern: DrawablePattern): DrawablePattern["geometry"] | null {
  return pattern.geometry ?? null;
}

function buildRoundedTopGeometry(_ohlc: OHLC[], pattern: DrawablePattern): DrawablePattern["geometry"] | null {
  return pattern.geometry ?? null;
}

function buildRoundedBottomGeometry(_ohlc: OHLC[], pattern: DrawablePattern): DrawablePattern["geometry"] | null {
  return pattern.geometry ?? null;
}

export const patternRegistry: Record<string, PatternRegistryEntry> = {
  "Rising Wedge": {
    name: "Rising Wedge",
    category: "Classical",
    geometryBuilder: buildTwoTrendlineGeometry,
    showOnChart: true,
  },
  "Falling Wedge": {
    name: "Falling Wedge",
    category: "Classical",
    geometryBuilder: buildTwoTrendlineGeometry,
    showOnChart: true,
  },
  "Ascending Triangle": {
    name: "Ascending Triangle",
    category: "Classical",
    geometryBuilder: buildTwoTrendlineGeometry,
    showOnChart: true,
  },
  "Descending Triangle": {
    name: "Descending Triangle",
    category: "Classical",
    geometryBuilder: buildTwoTrendlineGeometry,
    showOnChart: true,
  },
  "Symmetrical Triangle": {
    name: "Symmetrical Triangle",
    category: "Classical",
    geometryBuilder: buildTwoTrendlineGeometry,
    showOnChart: true,
  },
  "Bull Flag": {
    name: "Bull Flag",
    category: "Classical",
    geometryBuilder: buildFlagGeometry,
    showOnChart: true,
  },
  "Bear Flag": {
    name: "Bear Flag",
    category: "Classical",
    geometryBuilder: buildFlagGeometry,
    showOnChart: true,
  },
  "Bull Pennant": {
    name: "Bull Pennant",
    category: "Classical",
    geometryBuilder: buildFlagGeometry,
    showOnChart: true,
  },
  "Bear Pennant": {
    name: "Bear Pennant",
    category: "Classical",
    geometryBuilder: buildFlagGeometry,
    showOnChart: true,
  },
  "Horizontal Channel": {
    name: "Horizontal Channel",
    category: "Classical",
    geometryBuilder: buildTwoTrendlineGeometry,
    showOnChart: true,
  },
  "Channel Up": {
    name: "Channel Up",
    category: "Classical",
    geometryBuilder: buildTwoTrendlineGeometry,
    showOnChart: true,
  },
  "Channel Down": {
    name: "Channel Down",
    category: "Classical",
    geometryBuilder: buildTwoTrendlineGeometry,
    showOnChart: true,
  },
  "Broadening Formation": {
    name: "Broadening Formation",
    category: "Classical",
    geometryBuilder: buildTwoTrendlineGeometry,
    showOnChart: true,
  },
  "Double Top": {
    name: "Double Top",
    category: "Classical",
    geometryBuilder: buildDoubleTopGeometry,
    showOnChart: true,
  },
  "Double Bottom": {
    name: "Double Bottom",
    category: "Classical",
    geometryBuilder: buildDoubleBottomGeometry,
    showOnChart: true,
  },
  "Triple Top": {
    name: "Triple Top",
    category: "Classical",
    geometryBuilder: buildTripleTopGeometry,
    showOnChart: true,
  },
  "Triple Bottom": {
    name: "Triple Bottom",
    category: "Classical",
    geometryBuilder: buildTripleBottomGeometry,
    showOnChart: true,
  },
  "Head & Shoulders": {
    name: "Head & Shoulders",
    category: "Classical",
    geometryBuilder: buildHeadAndShouldersGeometry,
    showOnChart: true,
  },
  "Inverse Head & Shoulders": {
    name: "Inverse Head & Shoulders",
    category: "Classical",
    geometryBuilder: buildInverseHeadAndShouldersGeometry,
    showOnChart: true,
  },
  "Cup and Handle": {
    name: "Cup and Handle",
    category: "Classical",
    geometryBuilder: buildTwoTrendlineGeometry,
    showOnChart: true,
  },
  "Rounded Bottom": {
    name: "Rounded Bottom",
    category: "Classical",
    geometryBuilder: buildRoundedBottomGeometry,
    showOnChart: true,
  },
  "Rounded Top": {
    name: "Rounded Top",
    category: "Classical",
    geometryBuilder: buildRoundedTopGeometry,
    showOnChart: true,
  },

  "Bullish Order Block": {
    name: "Bullish Order Block",
    category: "SMC",
    geometryBuilder: buildSMCOrderBlock,
    showOnChart: true,
  },
  "Bearish Order Block": {
    name: "Bearish Order Block",
    category: "SMC",
    geometryBuilder: buildSMCOrderBlock,
    showOnChart: true,
  },
  "Bullish Breaker Block": {
    name: "Bullish Breaker Block",
    category: "SMC",
    geometryBuilder: buildSMCBreakerBlock,
    showOnChart: true,
  },
  "Bearish Breaker Block": {
    name: "Bearish Breaker Block",
    category: "SMC",
    geometryBuilder: buildSMCBreakerBlock,
    showOnChart: true,
  },
  "Liquidity Sweep High": {
    name: "Liquidity Sweep High",
    category: "SMC",
    geometryBuilder: buildSMCLiquiditySweep,
    showOnChart: true,
  },
  "Liquidity Sweep Low": {
    name: "Liquidity Sweep Low",
    category: "SMC",
    geometryBuilder: buildSMCLiquiditySweep,
    showOnChart: true,
  },
  "Bullish Liquidity Grab": {
    name: "Bullish Liquidity Grab",
    category: "SMC",
    geometryBuilder: buildSMCLiquidityGrab,
    showOnChart: true,
  },
  "Bearish Liquidity Grab": {
    name: "Bearish Liquidity Grab",
    category: "SMC",
    geometryBuilder: buildSMCLiquidityGrab,
    showOnChart: true,
  },
  "Bullish BOS": {
    name: "Bullish BOS",
    category: "SMC",
    geometryBuilder: buildSMCBOS,
    showOnChart: true,
  },
  "Bearish BOS": {
    name: "Bearish BOS",
    category: "SMC",
    geometryBuilder: buildSMCBOS,
    showOnChart: true,
  },
  "Bullish CHOCH": {
    name: "Bullish CHOCH",
    category: "SMC",
    geometryBuilder: buildSMCCHOCH,
    showOnChart: true,
  },
  "Bearish CHOCH": {
    name: "Bearish CHOCH",
    category: "SMC",
    geometryBuilder: buildSMCCHOCH,
    showOnChart: true,
  },
  "Higher High / Higher Low": {
    name: "Higher High / Higher Low",
    category: "SMC",
    geometryBuilder: buildSMCSwingPoint,
    showOnChart: true,
  },
  "Lower High / Lower Low": {
    name: "Lower High / Lower Low",
    category: "SMC",
    geometryBuilder: buildSMCSwingPoint,
    showOnChart: true,
  },
};
