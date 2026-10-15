export interface MacroMarketInputs {
  treasuryYields: {
    twoYear: number;
    tenYear: number;
    thirtyYear: number;
    threeMonth: number;
    fiveYear: number;
  };
  inflation: {
    inflationExpectations: number;
    tipsRealYield: number;
  };
  creditSpreads: {
    highYield: number;
    investmentGrade: number;
  };
  liquidityMetrics: {
    fedBalanceSheetChange: number;
    treasuryGeneralAccountChange: number;
    reverseRepoChange: number;
    fundingStress: number;
  };
  source: "FRED";
  observedAt: string;
  series: Record<string, { value: number; observedAt: string }>;
}

const FRED_BASE_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv?id=";
const FRED_TIMEOUT_MS = 6_000;
const FRED_RETRY_DELAY_MS = 250;
const MACRO_CACHE_TTL_MS = 5 * 60 * 1000;
let lastKnownMacroInputs: MacroMarketInputs | null = null;
let lastKnownMacroFetchedAt = 0;

async function fetchFredResponse(seriesId: string): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetch(`${FRED_BASE_URL}${encodeURIComponent(seriesId)}`, {
        signal: AbortSignal.timeout(FRED_TIMEOUT_MS),
        headers: { Accept: "text/csv" },
      });
    } catch (error) {
      lastError = error;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, FRED_RETRY_DELAY_MS));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`FRED ${seriesId} request failed`);
}

async function fetchFredLatest(seriesId: string): Promise<{ value: number; observedAt: string }> {
  const response = await fetchFredResponse(seriesId);
  if (!response.ok) throw new Error(`FRED ${seriesId} returned HTTP ${response.status}`);
  const rows = (await response.text()).trim().split(/\r?\n/).slice(1).reverse();
  for (const row of rows) {
    const separator = row.indexOf(",");
    if (separator < 0) continue;
    const observedAt = row.slice(0, separator).trim();
    const value = Number(row.slice(separator + 1).trim());
    if (observedAt && Number.isFinite(value)) return { value, observedAt };
  }
  throw new Error(`FRED ${seriesId} has no usable observation`);
}

async function fetchFredLatestTwo(seriesId: string): Promise<[{ value: number; observedAt: string }, { value: number; observedAt: string }]> {
  const response = await fetchFredResponse(seriesId);
  if (!response.ok) throw new Error(`FRED ${seriesId} returned HTTP ${response.status}`);
  const observations: Array<{ value: number; observedAt: string }> = [];
  for (const row of (await response.text()).trim().split(/\r?\n/).slice(1).reverse()) {
    const separator = row.indexOf(",");
    if (separator < 0) continue;
    const observedAt = row.slice(0, separator).trim();
    const value = Number(row.slice(separator + 1).trim());
    if (observedAt && Number.isFinite(value)) observations.push({ value, observedAt });
    if (observations.length === 2) return [observations[0], observations[1]];
  }
  throw new Error(`FRED ${seriesId} has fewer than two usable observations`);
}

function changePct(current: number, prior: number): number {
  return prior === 0 ? 0 : ((current - prior) / Math.abs(prior)) * 100;
}

/** Fetch the latest real observations used by the Macro Yields tab. */
export async function fetchRealMacroInputs(): Promise<MacroMarketInputs> {
  if (lastKnownMacroInputs && Date.now() - lastKnownMacroFetchedAt < MACRO_CACHE_TTL_MS) {
    return lastKnownMacroInputs;
  }

  try {
    const ids = ["DGS2", "DGS10", "DGS30", "DGS3MO", "DGS5", "T5YIE", "DFII10", "BAMLH0A0HYM2", "BAMLC0A0CM", "WALCL", "WTREGEN", "RRPONTSYD"];
    const entries = await Promise.all(ids.map(async (id) => [id, await fetchFredLatest(id)] as const));
    const liquidityEntries = await Promise.all(["WALCL", "WTREGEN", "RRPONTSYD"].map(async (id) => [id, await fetchFredLatestTwo(id)] as const));
    const series = Object.fromEntries(entries);
    const liquiditySeries = Object.fromEntries(liquidityEntries);
  const value = (id: string) => series[id].value;
  const observedAt = Object.values(series).map((entry) => entry.observedAt).sort().at(-1) ?? new Date().toISOString();

    const result: MacroMarketInputs = {
    treasuryYields: { twoYear: value("DGS2"), tenYear: value("DGS10"), thirtyYear: value("DGS30"), threeMonth: value("DGS3MO"), fiveYear: value("DGS5") },
    inflation: { inflationExpectations: value("T5YIE"), tipsRealYield: value("DFII10") },
    creditSpreads: { highYield: value("BAMLH0A0HYM2"), investmentGrade: value("BAMLC0A0CM") },
    liquidityMetrics: {
      fedBalanceSheetChange: changePct(liquiditySeries.WALCL[0].value, liquiditySeries.WALCL[1].value),
      treasuryGeneralAccountChange: changePct(liquiditySeries.WTREGEN[0].value, liquiditySeries.WTREGEN[1].value),
      reverseRepoChange: changePct(liquiditySeries.RRPONTSYD[0].value, liquiditySeries.RRPONTSYD[1].value),
      fundingStress: Math.max(0, value("BAMLH0A0HYM2") - 3) * 10,
    },
    source: "FRED",
    observedAt,
    series,
    };
    lastKnownMacroInputs = result;
    lastKnownMacroFetchedAt = Date.now();
    return result;
  } catch (error) {
    if (lastKnownMacroInputs) {
      return { ...lastKnownMacroInputs, source: "FRED", observedAt: lastKnownMacroInputs.observedAt };
    }
    throw error;
  }
}
