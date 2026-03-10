import { promises as fs } from "fs";
import path from "path";
import { fetchLiveOHLC } from "./marketData";
import { computeRSI } from "./indicators";
import { computeVWAPSeries } from "./finance";
import { getLiveTuningSnapshot } from "./signalHistory";

export type MarketMode = "TREND" | "BALANCED" | "CHOPPY";

export interface ModeSetupThreshold {
  setupScoreMin: number;
  setupTraitsMin: number;
  requireSweetSpotStack: boolean;
}

export interface BreakoutThresholdConfig {
  version: number;
  generatedAt: string;
  source: "default" | "auto-fit" | "auto-fit-live";
  modes: Record<MarketMode, ModeSetupThreshold>;
  stats?: {
    symbolsLoaded: number;
    candidateBars: number;
    positiveLabels: number;
    labelRate: number;
  };
}

type Candle = {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  time: number;
};

type SetupVector = {
  score: number;
  traits: number;
  preRsi: number;
  preMomentum3: number;
  preRangeCompression: number;
  preCloseLocation: number;
  preNearSessionHigh: boolean;
  preAboveVwap: boolean;
};

type Sample = {
  mode: MarketMode;
  isBreakout: boolean;
  vector: SetupVector;
};

type FitResult = {
  mode: MarketMode;
  scoreThreshold: number;
  traitsThreshold: number;
  precision: number;
  recall: number;
  f1: number;
  supportPos: number;
  supportNeg: number;
};

const CONFIG_PATH = path.resolve(process.cwd(), "shared", "breakout-thresholds.json");
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;
const STALE_AFTER_MS = 23 * 60 * 60 * 1000;

const SYMBOLS = Array.from(new Set([
  "SPY", "QQQ", "IWM", "DIA",
  "AAPL", "MSFT", "NVDA", "AMZN", "GOOGL", "META", "TSLA", "AMD", "AVGO", "NFLX", "SMH",
  "XLF", "XLE", "XLK", "XLY", "XLI", "XLP", "XLV",
  "JPM", "BAC", "GS", "WFC",
  "UNH", "LLY", "JNJ", "ABBV",
  "WMT", "COST", "HD", "LOW", "TGT",
  "BA", "CAT", "GE", "LMT",
  "ORCL", "CRM", "ADBE", "INTC", "QCOM", "TXN", "NOW",
  "COIN", "PLTR", "SOFI", "SHOP", "UBER", "ABNB", "SNOW"
]));

const DEFAULT_CONFIG: BreakoutThresholdConfig = {
  version: 1,
  generatedAt: new Date(0).toISOString(),
  source: "default",
  modes: {
    TREND: { setupScoreMin: 68, setupTraitsMin: 4, requireSweetSpotStack: false },
    BALANCED: { setupScoreMin: 78, setupTraitsMin: 5, requireSweetSpotStack: true },
    CHOPPY: { setupScoreMin: 76, setupTraitsMin: 5, requireSweetSpotStack: true },
  },
};

let cachedConfig: BreakoutThresholdConfig | null = null;
let refreshInFlight: Promise<BreakoutThresholdConfig> | null = null;
let refreshTimerStarted = false;

function clampInt(value: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, value)));
}

function applyLiveTuningBias(config: BreakoutThresholdConfig): BreakoutThresholdConfig {
  try {
    const live = getLiveTuningSnapshot(8);
    const completed = live.scanner.completed;
    const decisive = live.scanner.wins + live.scanner.losses;
    if (completed < 6 || decisive < 4) return config;

    const winRate = decisive > 0 ? live.scanner.wins / decisive : 0.5;
    const error = 0.55 - winRate;
    const scoreShift = clampInt(error * 12, -4, 6);
    const traitsShift = clampInt(error * 3, -1, 1);

    const adjustedModes: Record<MarketMode, ModeSetupThreshold> = {
      TREND: {
        ...config.modes.TREND,
        setupScoreMin: clampInt(config.modes.TREND.setupScoreMin + Math.round(scoreShift * 0.5), 56, 86),
        setupTraitsMin: clampInt(config.modes.TREND.setupTraitsMin + (traitsShift > 0 ? 0 : traitsShift), 3, 6),
      },
      BALANCED: {
        ...config.modes.BALANCED,
        setupScoreMin: clampInt(config.modes.BALANCED.setupScoreMin + scoreShift, 58, 90),
        setupTraitsMin: clampInt(config.modes.BALANCED.setupTraitsMin + traitsShift, 3, 6),
      },
      CHOPPY: {
        ...config.modes.CHOPPY,
        setupScoreMin: clampInt(config.modes.CHOPPY.setupScoreMin + Math.round(scoreShift * 1.15), 60, 92),
        setupTraitsMin: clampInt(config.modes.CHOPPY.setupTraitsMin + traitsShift, 3, 6),
      },
    };

    return {
      ...config,
      source: config.source === 'default' ? 'default' : 'auto-fit-live',
      modes: adjustedModes,
      stats: {
        ...(config.stats || {
          symbolsLoaded: 0,
          candidateBars: 0,
          positiveLabels: 0,
          labelRate: 0,
        }),
      },
    };
  } catch {
    return config;
  }
}

function nyDateKey(tsSeconds: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(tsSeconds * 1000));
}

function classifyMarketDay(candles: Candle[]): MarketMode {
  if (candles.length < 20) return "BALANCED";
  const dayOpen = candles[0].open;
  const dayClose = candles[candles.length - 1].close;
  const dayHigh = Math.max(...candles.map((c) => c.high));
  const dayLow = Math.min(...candles.map((c) => c.low));
  const trendPct = dayOpen !== 0 ? Math.abs(((dayClose - dayOpen) / dayOpen) * 100) : 0;
  const rangePct = dayOpen !== 0 ? ((dayHigh - dayLow) / dayOpen) * 100 : 0;

  if (trendPct >= 1.0 || rangePct >= 2.0) return "TREND";
  if (trendPct <= 0.45 && rangePct <= 1.2) return "CHOPPY";
  return "BALANCED";
}

function deriveModeByDate(spy: Candle[], qqq: Candle[]): Record<string, MarketMode> {
  const byDate: Record<string, { spy: Candle[]; qqq: Candle[] }> = {};

  for (const candle of spy) {
    const key = nyDateKey(candle.time);
    const day = byDate[key] ?? { spy: [], qqq: [] };
    day.spy.push(candle);
    byDate[key] = day;
  }
  for (const candle of qqq) {
    const key = nyDateKey(candle.time);
    const day = byDate[key] ?? { spy: [], qqq: [] };
    day.qqq.push(candle);
    byDate[key] = day;
  }

  const out: Record<string, MarketMode> = {};
  Object.entries(byDate).forEach(([date, day]) => {
    if (day.spy.length < 20 || day.qqq.length < 20) {
      out[date] = "BALANCED";
      return;
    }
    const spyMode = classifyMarketDay(day.spy);
    const qqqMode = classifyMarketDay(day.qqq);
    if (spyMode === qqqMode) {
      out[date] = spyMode;
      return;
    }
    const priority: MarketMode[] = ["TREND", "BALANCED", "CHOPPY"];
    out[date] = priority.find((mode) => mode === spyMode || mode === qqqMode) ?? "BALANCED";
  });

  return out;
}

function computeSetupVector(candles: Candle[], preIndex: number, vwapSeries: number[]): SetupVector {
  const pre = candles[preIndex];
  const prev20 = candles.slice(Math.max(0, preIndex - 20), preIndex);
  const prev20High = Math.max(...prev20.map((c) => c.high));
  const prev20Low = Math.min(...prev20.map((c) => c.low));
  const baseRange = Math.max(0.0001, prev20High - prev20Low);

  const rsiSeries = candles.slice(0, preIndex + 1).map((c) => ({ close: c.close }));
  const preRsi = Math.round(computeRSI(rsiSeries as any).value || 0);
  const preMomentum3 = preIndex >= 3
    ? ((pre.close - candles[preIndex - 3].close) / Math.max(0.0001, candles[preIndex - 3].close)) * 100
    : 0;

  const preWindow = candles.slice(Math.max(0, preIndex - 5), preIndex);
  const preWindowHigh = preWindow.length > 0 ? Math.max(...preWindow.map((c) => c.high)) : pre.high;
  const preWindowLow = preWindow.length > 0 ? Math.min(...preWindow.map((c) => c.low)) : pre.low;
  const preRangeCompression = baseRange > 0 ? (preWindowHigh - preWindowLow) / baseRange : 1;

  const preCloseLocation = ((pre.close - prev20Low) / baseRange) * 100;
  const sessionHighToPre = Math.max(...candles.slice(0, preIndex + 1).map((c) => c.high));
  const preNearSessionHigh = pre.close >= sessionHighToPre * 0.995;
  const preAboveVwap = pre.close >= (vwapSeries[preIndex] ?? pre.close);

  let score = 0;
  let traits = 0;

  if (preAboveVwap) {
    score += 24;
    traits += 1;
  }
  if (preCloseLocation >= 88) {
    score += 24;
    traits += 1;
  } else if (preCloseLocation >= 80) {
    score += 14;
  } else if (preCloseLocation >= 72) {
    score += 6;
  }
  if (preRsi >= 62) {
    score += 20;
    traits += 1;
  } else if (preRsi >= 58) {
    score += 10;
  }
  if (preMomentum3 >= 0.16) {
    score += 16;
    traits += 1;
  } else if (preMomentum3 >= 0.08) {
    score += 8;
  }
  if (preRangeCompression <= 0.58) {
    score += 12;
    traits += 1;
  } else if (preRangeCompression <= 0.72) {
    score += 6;
  }
  if (preNearSessionHigh) {
    score += 10;
    traits += 1;
  }

  const hasCoreSweetSpot = preAboveVwap && preCloseLocation >= 85 && preRsi >= 60 && preMomentum3 >= 0.1;
  if (hasCoreSweetSpot) {
    score += 10;
    traits += 1;
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    traits,
    preRsi,
    preMomentum3,
    preRangeCompression,
    preCloseLocation,
    preNearSessionHigh,
    preAboveVwap,
  };
}

function isUpBreakout(candles: Candle[], nextIndex: number): boolean {
  const next = candles[nextIndex];
  const prev20 = candles.slice(nextIndex - 20, nextIndex);
  const prev20High = Math.max(...prev20.map((c) => c.high));
  return next.close > prev20High && next.close > next.open;
}

function fitThresholds(samples: Sample[], mode: MarketMode): FitResult {
  const modeSamples = samples.filter((sample) => sample.mode === mode);
  const positives = modeSamples.filter((sample) => sample.isBreakout);
  const negatives = modeSamples.filter((sample) => !sample.isBreakout);

  let best: FitResult = {
    mode,
    scoreThreshold: DEFAULT_CONFIG.modes[mode].setupScoreMin,
    traitsThreshold: DEFAULT_CONFIG.modes[mode].setupTraitsMin,
    precision: 0,
    recall: 0,
    f1: 0,
    supportPos: positives.length,
    supportNeg: negatives.length,
  };

  if (positives.length === 0 || negatives.length === 0) return best;

  for (let scoreThreshold = 52; scoreThreshold <= 84; scoreThreshold += 2) {
    for (let traitsThreshold = 3; traitsThreshold <= 6; traitsThreshold += 1) {
      let tp = 0;
      let fp = 0;
      let fn = 0;

      for (const sample of modeSamples) {
        const predicted = sample.vector.score >= scoreThreshold && sample.vector.traits >= traitsThreshold;
        if (predicted && sample.isBreakout) tp += 1;
        if (predicted && !sample.isBreakout) fp += 1;
        if (!predicted && sample.isBreakout) fn += 1;
      }

      const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
      const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
      const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;

      const objective = f1 + precision * 0.25;
      const bestObjective = best.f1 + best.precision * 0.25;
      if (objective > bestObjective) {
        best = {
          mode,
          scoreThreshold,
          traitsThreshold,
          precision,
          recall,
          f1,
          supportPos: positives.length,
          supportNeg: negatives.length,
        };
      }
    }
  }

  return best;
}

function isValidConfig(config: any): config is BreakoutThresholdConfig {
  if (!config || typeof config !== "object") return false;
  if (!config.modes || typeof config.modes !== "object") return false;
  const requiredModes: MarketMode[] = ["TREND", "BALANCED", "CHOPPY"];
  for (const mode of requiredModes) {
    const m = config.modes[mode];
    if (!m || typeof m.setupScoreMin !== "number" || typeof m.setupTraitsMin !== "number") return false;
  }
  return true;
}

async function loadConfigFromDisk(): Promise<BreakoutThresholdConfig | null> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (isValidConfig(parsed)) return parsed;
    return null;
  } catch {
    return null;
  }
}

export async function getBreakoutThresholdConfig(): Promise<BreakoutThresholdConfig> {
  if (cachedConfig) return applyLiveTuningBias(cachedConfig);
  const disk = await loadConfigFromDisk();
  cachedConfig = disk ?? DEFAULT_CONFIG;
  return applyLiveTuningBias(cachedConfig);
}

async function writeConfigToDisk(config: BreakoutThresholdConfig): Promise<void> {
  await fs.mkdir(path.dirname(CONFIG_PATH), { recursive: true });
  await fs.writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

function isStale(config: BreakoutThresholdConfig): boolean {
  const generated = Date.parse(config.generatedAt);
  if (!Number.isFinite(generated)) return true;
  return Date.now() - generated > STALE_AFTER_MS;
}

async function computeAutoFitConfig(): Promise<BreakoutThresholdConfig> {
  const [spyRaw, qqqRaw] = await Promise.all([
    fetchLiveOHLC("SPY", "5m", "FULL"),
    fetchLiveOHLC("QQQ", "5m", "FULL"),
  ]);

  const spy = (spyRaw.data || []) as Candle[];
  const qqq = (qqqRaw.data || []) as Candle[];
  const modeByDate = deriveModeByDate(spy, qqq);

  const samples: Sample[] = [];
  let symbolsLoaded = 0;

  for (const symbol of SYMBOLS) {
    try {
      const res = await fetchLiveOHLC(symbol, "5m", "FULL");
      const candles = (res.data || []) as Candle[];
      if (candles.length < 40) continue;

      const vwapSeries = computeVWAPSeries(candles as any[]);

      for (let preIndex = 21; preIndex < candles.length - 1; preIndex++) {
        const nextIndex = preIndex + 1;
        const preDate = nyDateKey(candles[preIndex].time);
        const nextDate = nyDateKey(candles[nextIndex].time);
        if (preDate !== nextDate) continue;

        const mode = modeByDate[preDate] ?? "BALANCED";
        const vector = computeSetupVector(candles, preIndex, vwapSeries);
        const breakout = isUpBreakout(candles, nextIndex);
        samples.push({ mode, isBreakout: breakout, vector });
      }

      symbolsLoaded += 1;
    } catch {
      continue;
    }
  }

  const positives = samples.filter((s) => s.isBreakout);
  const trendFit = fitThresholds(samples, "TREND");
  const balancedFit = fitThresholds(samples, "BALANCED");
  const choppyFit = fitThresholds(samples, "CHOPPY");

  const choppyHasSupport = choppyFit.supportPos > 0 && choppyFit.supportNeg > 0;
  const choppyScore = choppyHasSupport ? choppyFit.scoreThreshold : Math.max(74, balancedFit.scoreThreshold - 2);
  const choppyTraits = choppyHasSupport ? choppyFit.traitsThreshold : 5;

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: "auto-fit",
    modes: {
      TREND: {
        setupScoreMin: trendFit.scoreThreshold,
        setupTraitsMin: trendFit.traitsThreshold,
        requireSweetSpotStack: false,
      },
      BALANCED: {
        setupScoreMin: balancedFit.scoreThreshold,
        setupTraitsMin: balancedFit.traitsThreshold,
        requireSweetSpotStack: true,
      },
      CHOPPY: {
        setupScoreMin: choppyScore,
        setupTraitsMin: choppyTraits,
        requireSweetSpotStack: true,
      },
    },
    stats: {
      symbolsLoaded,
      candidateBars: samples.length,
      positiveLabels: positives.length,
      labelRate: positives.length / Math.max(1, samples.length),
    },
  };
}

export async function refreshBreakoutThresholdConfig(force = false): Promise<BreakoutThresholdConfig> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const current = await getBreakoutThresholdConfig();
      if (!force && !isStale(current)) return current;

      const fitted = await computeAutoFitConfig();
      cachedConfig = fitted;
      await writeConfigToDisk(fitted);
      return fitted;
    } catch (error) {
      console.error("[BreakoutThresholds] refresh failed:", error);
      return (await getBreakoutThresholdConfig()) ?? DEFAULT_CONFIG;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

export function startBreakoutThresholdAutoRefresh(): void {
  if (refreshTimerStarted) return;
  refreshTimerStarted = true;

  setTimeout(() => {
    refreshBreakoutThresholdConfig(false).catch((error) => {
      console.error("[BreakoutThresholds] initial refresh failed:", error);
    });
  }, 3000);

  setInterval(() => {
    refreshBreakoutThresholdConfig(false).catch((error) => {
      console.error("[BreakoutThresholds] scheduled refresh failed:", error);
    });
  }, REFRESH_INTERVAL_MS);
}
