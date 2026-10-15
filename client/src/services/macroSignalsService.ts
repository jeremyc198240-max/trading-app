export type MacroRegime = "Expansion" | "Tightening" | "Stress" | "Crisis";
export type SpyBias = "Bullish" | "Bearish" | "Neutral";
export type VolatilityBias = "IV Expansion" | "IV Compression";

export interface TreasuryYields {
  twoYear: number;
  tenYear: number;
  thirtyYear: number;
  threeMonth: number;
  fiveYear: number;
}

export interface InflationData {
  inflationExpectations?: number;
  tipsRealYield?: number;
}

export interface CreditSpreads {
  highYield: number;
  investmentGrade: number;
}

export interface LiquidityMetrics {
  fedBalanceSheetChange: number;
  treasuryGeneralAccountChange: number;
  reverseRepoChange: number;
  fundingStress: number;
}

export interface YieldSpreads {
  twoSTen: number;
  threeM10Y: number;
  fiveSThirty: number;
}

export interface RealYields {
  twoYear: number;
  tenYear: number;
  thirtyYear: number;
}

export interface CreditStress {
  score: number;
  label: "Low" | "Moderate" | "High" | "Severe";
}

export interface LiquidityStress {
  score: number;
  label: "Low" | "Moderate" | "High" | "Severe";
}

export interface MacroSnapshot {
  treasuryYields: TreasuryYields;
  inflation: InflationData;
  creditSpreads: CreditSpreads;
  liquidityMetrics: LiquidityMetrics;
  yieldSpreads: YieldSpreads;
  realYields: RealYields;
  creditStress: CreditStress;
  liquidityStress: LiquidityStress;
  regime: MacroRegime;
  spyBias: SpyBias;
  volatilityBias: VolatilityBias;
  optionsStructures: OptionsStructure[];
  updatedAt: number;
  source?: "FRED";
  observedAt?: string;
}

export interface OptionsStructure {
  name: string;
  stance: "Bullish" | "Bearish" | "Neutral";
  description: string;
  trigger: string;
  timing: string;
  risk: string;
  invalidation: string;
}

const clamp = (value: number, min = 0, max = 100): number => Math.min(max, Math.max(min, value));

/** Compute the requested curve spreads in percentage points. */
export function computeYieldSpreads(yields: TreasuryYields): YieldSpreads {
  return {
    twoSTen: yields.tenYear - yields.twoYear,
    threeM10Y: yields.tenYear - yields.threeMonth,
    fiveSThirty: yields.thirtyYear - yields.fiveYear,
  };
}

/** Compute nominal minus inflation real yields, unless a TIPS real yield is available. */
export function computeRealYields(yields: TreasuryYields, inflation: InflationData): RealYields {
  if (inflation.tipsRealYield != null) {
    return { twoYear: inflation.tipsRealYield, tenYear: inflation.tipsRealYield, thirtyYear: inflation.tipsRealYield };
  }
  const expected = inflation.inflationExpectations ?? 0;
  return { twoYear: yields.twoYear - expected, tenYear: yields.tenYear - expected, thirtyYear: yields.thirtyYear - expected };
}

/** Convert HY and IG spreads into a normalized credit stress score. */
export function computeCreditStress(spreads: CreditSpreads): CreditStress {
  const score = clamp(((spreads.highYield - 2.5) / 4.5) * 70 + ((spreads.investmentGrade - 0.7) / 1.8) * 30);
  return { score, label: score >= 75 ? "Severe" : score >= 50 ? "High" : score >= 25 ? "Moderate" : "Low" };
}

/** Convert liquidity and funding inputs into a normalized stress score. */
export function computeLiquidityStress(metrics: LiquidityMetrics): LiquidityStress {
  const contraction = Math.max(0, -metrics.fedBalanceSheetChange) * 35 + Math.max(0, metrics.treasuryGeneralAccountChange) * 30 + Math.max(0, metrics.reverseRepoChange) * 20;
  const score = clamp(contraction + metrics.fundingStress * 0.55);
  return { score, label: score >= 75 ? "Severe" : score >= 50 ? "High" : score >= 25 ? "Moderate" : "Low" };
}

/** Classify macro conditions using curve shape, real yields, credit, and liquidity. */
export function classifyMacroRegime(spreads: YieldSpreads, realYields: RealYields, credit: CreditStress, liquidity: LiquidityStress): MacroRegime {
  if (credit.score >= 75 || liquidity.score >= 75) return "Crisis";
  if (credit.score >= 50 || liquidity.score >= 50 || spreads.twoSTen < -0.35) return "Stress";
  if (realYields.tenYear > 2 || spreads.twoSTen < 0) return "Tightening";
  return "Expansion";
}

/** Derive SPY and volatility bias from the classified macro state. */
export function deriveSpyBias(regime: MacroRegime, spreads: YieldSpreads, credit: CreditStress, liquidity: LiquidityStress): { spyBias: SpyBias; volatilityBias: VolatilityBias } {
  if (regime === "Crisis") return { spyBias: "Bearish", volatilityBias: "IV Expansion" };
  if (regime === "Stress") return { spyBias: "Bearish", volatilityBias: "IV Expansion" };
  if (regime === "Tightening") return { spyBias: spreads.twoSTen > 0.2 && credit.score < 35 ? "Neutral" : "Bearish", volatilityBias: "IV Expansion" };
  return { spyBias: liquidity.score < 35 ? "Bullish" : "Neutral", volatilityBias: "IV Compression" };
}

/** Suggest defined-risk structures appropriate for the current macro regime. */
export function suggestOptionsStructures(regime: MacroRegime, spyBias: SpyBias, volatilityBias: VolatilityBias): OptionsStructure[] {
  if (regime === "Crisis") return [
    { name: "Put debit spread", stance: "Bearish", description: "Defined-risk downside exposure while credit and liquidity stress are elevated.", trigger: "SPY loses VWAP + opening low", timing: "5m close / 0-2 DTE", risk: "Debit paid", invalidation: "Reclaim of VWAP" },
    { name: "Put calendar", stance: "Bearish", description: "Use when near-term protection is expensive but downside risk remains persistent.", trigger: "Failed retest under 10Y yield shock", timing: "15m rejection / 1-3 DTE", risk: "Debit paid", invalidation: "Higher low above resistance" },
  ];
  if (regime === "Stress") return [
    { name: "Bear put spread", stance: "Bearish", description: "Express a bearish SPY view with capped loss and reduced premium versus a long put.", trigger: "Breakdown, then failed 5m retest", timing: "5m confirmation / 0-2 DTE", risk: "Debit paid", invalidation: "Close back above breakdown" },
    { name: "Call credit spread", stance: "Bearish", description: "Consider only when implied volatility is elevated and price fails resistance.", trigger: "Rejected prior-day high", timing: "Opening range / 0-1 DTE", risk: "Defined spread width", invalidation: "Acceptance above high" },
  ];
  if (regime === "Tightening") return [
    { name: "Call debit spread", stance: spyBias === "Neutral" ? "Neutral" : "Bearish", description: "Keep upside exposure defined while higher real yields pressure multiples.", trigger: "5m EMA9 reclaim with volume", timing: "Trend shift / 0-2 DTE", risk: "Debit paid", invalidation: "Close below EMA9" },
    { name: "Put calendar", stance: "Neutral", description: "Useful for a choppy transition when volatility is expected to reprice between expiries.", trigger: "Range rejection at supply", timing: "15m range / 1-3 DTE", risk: "Debit paid", invalidation: "Range expansion" },
  ];
  return [
    { name: "Call debit spread", stance: "Bullish", description: "Defined-risk participation when growth and liquidity conditions support SPY.", trigger: "5m EMA9 break + VWAP hold", timing: "Opening range / 0-2 DTE", risk: "Debit paid", invalidation: "Close below VWAP" },
    { name: volatilityBias === "IV Compression" ? "Call calendar" : "Put spread", stance: "Neutral", description: "Use a calendar for stable volatility or a put spread for measured downside protection.", trigger: "Pullback holds prior breakout", timing: "15m continuation / 1-3 DTE", risk: "Debit paid", invalidation: "Breakout failure" },
  ];
}

/** Fetch live server-provided macro inputs and derive one macro snapshot. */
export async function fetchMacroSnapshot(timeframe?: string, signal?: AbortSignal): Promise<MacroSnapshot> {
  const query = timeframe ? `?timeframe=${encodeURIComponent(timeframe)}` : "";
  const response = await fetch(`/api/macro/signals${query}`, { cache: "no-store", signal });
  if (!response.ok) throw new Error("LIVE DATA UNAVAILABLE");
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    throw new Error("Macro API returned a non-JSON response. Restart the API server and retry.");
  }
  const live = await response.json() as { treasuryYields: TreasuryYields; inflation: InflationData; creditSpreads: CreditSpreads; liquidityMetrics: LiquidityMetrics; source?: "FRED"; observedAt?: string };
  const { treasuryYields, creditSpreads, liquidityMetrics, inflation } = live;
  const yieldSpreads = computeYieldSpreads(treasuryYields);
  const realYields = computeRealYields(treasuryYields, inflation);
  const creditStress = computeCreditStress(creditSpreads);
  const liquidityStress = computeLiquidityStress(liquidityMetrics);
  const regime = classifyMacroRegime(yieldSpreads, realYields, creditStress, liquidityStress);
  const { spyBias, volatilityBias } = deriveSpyBias(regime, yieldSpreads, creditStress, liquidityStress);
  return {
    treasuryYields, inflation, creditSpreads, liquidityMetrics, yieldSpreads, realYields,
    creditStress, liquidityStress, regime, spyBias, volatilityBias,
    optionsStructures: suggestOptionsStructures(regime, spyBias, volatilityBias),
    updatedAt: Date.now(), source: live.source, observedAt: live.observedAt,
  };
}
