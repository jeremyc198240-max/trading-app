import { analyzeSymbol, generateSampleOHLC } from "./finance";
import { fetchLiveOHLC, fetchLiveSpot, getCachedSpot, getLastKnownSpotFromCandles } from "./marketData";
import { detectAllPatterns, type PatternResult } from "./patterns";
import { runMonsterOTMEngine } from "./monsterOtmEngine";
import { getBreakoutAlertLog, getBreakoutAlertSummary, recordBreakoutAlert, updateBreakoutAlertOutcomes } from "./breakoutAlertHistory";

interface OHLC {
	open: number;
	high: number;
	low: number;
	close: number;
	volume: number;
	time?: number;
	timeMs?: number;
}

type BreakoutSignal =
	| "BREAKOUT"
	| "BREAKDOWN"
	| "SQUEEZE"
	| "CONSOLIDATING"
	| "EXPANSION"
	| "BUILDING"
	| "MOMENTUM"
	| null;

type CompressionPhase = "WAIT" | "PREPARE" | "READY" | "NOW";

interface CompressionSnapshot {
	sparkScore: number;
	triggers: string[];
	phase: CompressionPhase;
	bbWidth: string;
	rangePct: string;
	volRatio: string;
}

interface ScannerResult {
	symbol: string;
	patterns: PatternResult[];
	lastPrice: number;
	priceChange: number;
	priceChangePercent: number;
	volume: number;
	scanTime: number;
	healthScore: number;
	healthGrade: string;
	hasMonsterPlay: boolean;
	volumeSpike?: number;
	breakoutScore?: number;
	isNewHigh?: boolean;
	isNewLow?: boolean;
	momentumStrength?: number;
	rsiValue?: number;
	breakoutSignal?: BreakoutSignal;
	wasInSqueeze?: boolean;
	squeezeCandles?: number;
	expansionDirection?: "bullish" | "bearish" | null;
	warnings?: string[];
	signalQuality?: "HIGH" | "MEDIUM" | "LOW" | "UNRELIABLE";
	compression?: CompressionSnapshot;
	tvRsi?: number;
	tvAdx?: number;
	tvRecommendAll?: number;
	tvTrendDirection?: DirectionalBias | "neutral";
	tvTrendStrength?: number;
}

interface ScannerStatus {
	isScanning: boolean;
	lastScanTime: number;
	watchlistCount: number;
	resultCount: number;
}

interface TrendContext {
	trendDirection: DirectionalBias | "neutral";
	trendStrength: number;
	ema10: number;
	ema20: number;
	ema50: number;
}

interface TradingViewSnapshot {
	close: number | null;
	change: number | null;
	rsi: number | null;
	adx: number | null;
	ema10: number | null;
	ema20: number | null;
	ema50: number | null;
	macd: number | null;
	macdSignal: number | null;
	vwap: number | null;
	recommendAll: number | null;
	fetchedAt: number;
}

interface TradingViewSignalContext {
	scoreBias: number;
	warnings: string[];
	trendAlignment: "aligned" | "conflict" | "neutral";
	trendDirection: DirectionalBias | "neutral";
	trendStrength: number;
}

interface SymbolScanState {
	inSqueeze: boolean;
	squeezeCandles: number;
}

const DEFAULT_WATCHLIST = [
	"SPY",
	"QQQ",
	"AAPL",
	"MSFT",
	"GOOGL",
	"AMZN",
	"TSLA",
	"NVDA",
];

const DEFAULT_TIMEFRAME = "15m";
const SCAN_INTERVAL_MS = 30_000;
const ADAPTIVE_TUNING_CACHE_MS = 90_000;
const TRADINGVIEW_SCAN_CACHE_MS = 25_000;
const TRADINGVIEW_SCAN_ENDPOINT = "https://scanner.tradingview.com/america/scan";
const TRADINGVIEW_COLUMNS = [
	"name",
	"close",
	"change",
	"RSI",
	"ADX",
	"EMA10",
	"EMA20",
	"EMA50",
	"MACD.macd",
	"MACD.signal",
	"VWAP",
	"Recommend.All",
] as const;
const TRADINGVIEW_EXCHANGE_BY_SYMBOL: Record<string, string> = {
	SPY: "AMEX",
};

type TunableSignal = Exclude<BreakoutSignal, null>;
type DirectionalBias = "bullish" | "bearish";

interface AdaptiveBreakoutTuning {
	breakoutVolumeMin: number;
	expansionMomentumMin: number;
	momentumSignalMin: number;
	qualityHighScoreMin: number;
	qualityMediumScoreMin: number;
	globalScoreBias: number;
	signalScoreBias: Partial<Record<TunableSignal, number>>;
	signalQualityScoreOffset: Partial<Record<TunableSignal, number>>;
	signalMomentumFloor: Partial<Record<TunableSignal, number>>;
	directionalVolumeOffset: Record<DirectionalBias, number>;
	directionalMomentumOffset: Record<DirectionalBias, number>;
	directionalScoreBias: Record<DirectionalBias, number>;
	bearishBreakdownExtraVolumeMin: number;
	lowAdxQualityDemotion: number;
	hourlyScoreBias: Partial<Record<number, number>>;
}

const DEFAULT_ADAPTIVE_TUNING: AdaptiveBreakoutTuning = {
	breakoutVolumeMin: 1.1,
	expansionMomentumMin: 35,
	momentumSignalMin: 45,
	qualityHighScoreMin: 65,
	qualityMediumScoreMin: 45,
	globalScoreBias: 0,
	signalScoreBias: {},
	signalQualityScoreOffset: {},
	signalMomentumFloor: {},
	directionalVolumeOffset: { bullish: 0, bearish: 0 },
	directionalMomentumOffset: { bullish: 0, bearish: 0 },
	directionalScoreBias: { bullish: 0, bearish: 0 },
	bearishBreakdownExtraVolumeMin: 0,
	lowAdxQualityDemotion: 1,
	hourlyScoreBias: {},
};

const state = {
	watchlist: new Set<string>(DEFAULT_WATCHLIST),
	results: new Map<string, ScannerResult>(),
	lastScanTime: 0,
	scanTimer: null as ReturnType<typeof setInterval> | null,
	scanInFlight: false,
	symbolState: new Map<string, SymbolScanState>(),
};

let adaptiveTuningCache: { computedAt: number; value: AdaptiveBreakoutTuning } | null = null;
let tradingViewIndicatorCache: { computedAt: number; bySymbol: Map<string, TradingViewSnapshot> } | null = null;

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function avg(values: number[]): number {
	if (values.length === 0) return 0;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toNumber(value: string | number | undefined): number {
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	const parsed = Number.parseFloat(value ?? "0");
	return Number.isFinite(parsed) ? parsed : 0;
}

function roundTo(value: number, decimals: number): number {
	const factor = Math.pow(10, Math.max(0, decimals));
	return Math.round(value * factor) / factor;
}

function normalizeSymbol(symbol: string): string {
	return String(symbol ?? "")
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9.-]/g, "")
		.slice(0, 10);
}

const nyHourFormatter = new Intl.DateTimeFormat("en-US", {
	timeZone: "America/New_York",
	hour: "2-digit",
	hour12: false,
});

function getNyHour(ts: number): number {
	const hourPart = nyHourFormatter.formatToParts(new Date(ts)).find((part) => part.type === "hour")?.value;
	const hour = Number.parseInt(hourPart ?? "0", 10);
	return Number.isFinite(hour) ? hour : 0;
}

function getCandleCount(timeframe: string): number {
	switch (timeframe) {
		case "5m":
			return 72;
		case "15m":
			return 96;
		case "30m":
			return 96;
		case "1h":
			return 100;
		case "4h":
			return 90;
		case "1d":
		case "1D":
			return 120;
		default:
			return 96;
	}
}

function analyzeCompression(candles: OHLC[]): CompressionSnapshot {
	if (candles.length < 20) {
		return {
			sparkScore: 0,
			triggers: [],
			phase: "WAIT",
			bbWidth: "0.00",
			rangePct: "0.00",
			volRatio: "0.00",
		};
	}

	const triggers: string[] = [];
	let sparkScore = 0;

	const closes = candles.slice(-20).map((c) => c.close);
	const last = candles[candles.length - 1];

	const sma = avg(closes);
	const stdDev = Math.sqrt(avg(closes.map((close) => Math.pow(close - sma, 2))));
	const bbWidth = sma > 0 ? (stdDev * 4) / sma * 100 : 0;

	if (bbWidth < 1.5) {
		sparkScore += 25;
		triggers.push(`BB squeeze ${bbWidth.toFixed(1)}%`);
	} else if (bbWidth < 2.5) {
		sparkScore += 15;
		triggers.push(`Tight BB ${bbWidth.toFixed(1)}%`);
	}

	const highs = candles.slice(-10).map((c) => c.high);
	const lows = candles.slice(-10).map((c) => c.low);
	const rangeHigh = Math.max(...highs);
	const rangeLow = Math.min(...lows);
	const rangePct = last.close > 0 ? ((rangeHigh - rangeLow) / last.close) * 100 : 0;

	if (rangePct < 0.5) {
		sparkScore += 20;
		triggers.push(`Tight range ${rangePct.toFixed(2)}%`);
	}

	const volumes = candles.slice(-10).map((c) => c.volume);
	const avgVol = avg(volumes.slice(0, 5));
	const recentVol = avg(volumes.slice(-2));
	const volRatio = avgVol > 0 ? recentVol / avgVol : 0;

	if (volRatio > 2) {
		sparkScore += 25;
		triggers.push(`Volume surge ${volRatio.toFixed(1)}x`);
	} else if (volRatio > 1.5) {
		sparkScore += 15;
		triggers.push(`Volume building ${volRatio.toFixed(1)}x`);
	}

	const prev5 = candles.slice(-6, -1);
	const prev5High = prev5.length ? Math.max(...prev5.map((c) => c.high)) : last.high;
	const prev5Low = prev5.length ? Math.min(...prev5.map((c) => c.low)) : last.low;

	if (last.close > prev5High) {
		sparkScore += 30;
		triggers.push("BREAKOUT UP");
	}
	if (last.close < prev5Low) {
		sparkScore += 30;
		triggers.push("BREAKOUT DOWN");
	}

	if (candles.length >= 2) {
		const prev = candles[candles.length - 2];
		const lastRange = last.close > 0 ? ((last.high - last.low) / last.close) * 100 : 0;
		const prevRange = prev.close > 0 ? ((prev.high - prev.low) / prev.close) * 100 : 0;
		if (prevRange > 0 && lastRange > prevRange * 1.5) {
			sparkScore += 15;
			triggers.push("Range expanding");
		}
	}

	let phase: CompressionPhase = "WAIT";
	if (sparkScore >= 70) phase = "NOW";
	else if (sparkScore >= 50) phase = "READY";
	else if (sparkScore >= 30) phase = "PREPARE";

	return {
		sparkScore,
		triggers,
		phase,
		bbWidth: bbWidth.toFixed(2),
		rangePct: rangePct.toFixed(2),
		volRatio: volRatio.toFixed(2),
	};
}

function computeMomentumStrength(candles: OHLC[]): number {
	if (candles.length < 12) return 0;
	const closes = candles.slice(-12).map((c) => c.close);
	const last = closes[closes.length - 1];
	const first = closes[0];
	const fast = avg(closes.slice(-4));
	const slow = avg(closes.slice(0, 8));

	const driftPct = first > 0 ? ((last - first) / first) * 100 : 0;
	const accelPct = slow > 0 ? ((fast - slow) / slow) * 100 : 0;

	const score = driftPct * 50 + accelPct * 120;
	return Math.round(clamp(score, -100, 100));
}

function computeVolumeSpike(candles: OHLC[]): number {
	if (candles.length < 6) return 1;
	const recent = candles[candles.length - 1]?.volume ?? 0;
	const prior = candles.slice(-21, -1).map((c) => c.volume).filter((v) => v > 0);
	const baseline = avg(prior);
	if (baseline <= 0) return 1;
	return Math.round((recent / baseline) * 100) / 100;
}

function computeRangeBreaks(candles: OHLC[]) {
	const lookback = candles.slice(-21, -1);
	if (lookback.length === 0) {
		return { isNewHigh: false, isNewLow: false };
	}
	const last = candles[candles.length - 1];
	const recentHigh = Math.max(...lookback.map((c) => c.high));
	const recentLow = Math.min(...lookback.map((c) => c.low));

	return {
		isNewHigh: last.high >= recentHigh,
		isNewLow: last.low <= recentLow,
	};
}

function computeEMA(values: number[], period: number): number {
	if (values.length === 0) return 0;
	const k = 2 / (period + 1);
	let ema = values[0];
	for (let i = 1; i < values.length; i++) {
		ema = values[i] * k + ema * (1 - k);
	}
	return ema;
}

function computeTrendContext(candles: OHLC[]): TrendContext {
	const closes = candles.map((c) => c.close).filter((v) => Number.isFinite(v) && v > 0);
	if (closes.length < 50) {
		return {
			trendDirection: "neutral",
			trendStrength: 0,
			ema10: 0,
			ema20: 0,
			ema50: 0,
		};
	}

	const sample = closes.slice(-120);
	const ema10 = computeEMA(sample, 10);
	const ema20 = computeEMA(sample, 20);
	const ema50 = computeEMA(sample, 50);

	let trendDirection: DirectionalBias | "neutral" = "neutral";
	if (ema10 > ema20 && ema20 > ema50) trendDirection = "bullish";
	if (ema10 < ema20 && ema20 < ema50) trendDirection = "bearish";

	const base = ema50 > 0 ? Math.abs((ema10 - ema50) / ema50) * 100 : 0;
	const trendStrength = Math.round(clamp(base * 110, 0, 100));

	return {
		trendDirection,
		trendStrength,
		ema10,
		ema20,
		ema50,
	};
}

function parseTvNumber(value: unknown): number | null {
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function toTradingViewTicker(symbol: string): string {
	const upper = normalizeSymbol(symbol);
	const exchange = TRADINGVIEW_EXCHANGE_BY_SYMBOL[upper] ?? "NASDAQ";
	return `${exchange}:${upper}`;
}

function extractSymbolFromTicker(ticker: string): string {
	const upper = String(ticker ?? "").toUpperCase();
	if (!upper.includes(":")) return normalizeSymbol(upper);
	return normalizeSymbol(upper.split(":").pop() ?? "");
}

function resolveSignalDirection(
	breakoutSignal: BreakoutSignal,
	expansionDirection: "bullish" | "bearish" | null,
	momentumStrength: number,
): DirectionalBias | null {
	if (breakoutSignal === "BREAKOUT") return "bullish";
	if (breakoutSignal === "BREAKDOWN") return "bearish";
	if ((breakoutSignal === "EXPANSION" || breakoutSignal === "MOMENTUM") && expansionDirection) {
		return expansionDirection;
	}
	if (breakoutSignal === "EXPANSION" || breakoutSignal === "MOMENTUM") {
		return momentumStrength >= 0 ? "bullish" : "bearish";
	}
	return null;
}

async function getTradingViewIndicatorMap(symbols: string[]): Promise<Map<string, TradingViewSnapshot>> {
	const unique = Array.from(new Set(symbols.map(normalizeSymbol).filter(Boolean)));
	if (unique.length === 0) return new Map();

	const selectFromCache = (): Map<string, TradingViewSnapshot> => {
		const subset = new Map<string, TradingViewSnapshot>();
		if (!tradingViewIndicatorCache) return subset;
		for (const symbol of unique) {
			const snapshot = tradingViewIndicatorCache.bySymbol.get(symbol);
			if (snapshot) subset.set(symbol, snapshot);
		}
		return subset;
	};

	const now = Date.now();
	if (tradingViewIndicatorCache && now - tradingViewIndicatorCache.computedAt <= TRADINGVIEW_SCAN_CACHE_MS) {
		const cached = selectFromCache();
		if (cached.size === unique.length) return cached;
	}

	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 2500);

		const response = await fetch(TRADINGVIEW_SCAN_ENDPOINT, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({
				symbols: {
					tickers: unique.map(toTradingViewTicker),
					query: { types: [] as string[] },
				},
				columns: Array.from(TRADINGVIEW_COLUMNS),
			}),
			signal: controller.signal,
		});

		clearTimeout(timeout);
		if (!response.ok) {
			return selectFromCache();
		}

		const payload = (await response.json()) as {
			data?: Array<{ s?: string; d?: unknown[] }>;
		};

		const fetched = new Map<string, TradingViewSnapshot>();
		for (const row of Array.isArray(payload?.data) ? payload.data : []) {
			const symbol = extractSymbolFromTicker(String(row?.s ?? ""));
			if (!symbol) continue;

			const d = Array.isArray(row?.d) ? row.d : [];
			const snapshot: TradingViewSnapshot = {
				close: parseTvNumber(d[1]),
				change: parseTvNumber(d[2]),
				rsi: parseTvNumber(d[3]),
				adx: parseTvNumber(d[4]),
				ema10: parseTvNumber(d[5]),
				ema20: parseTvNumber(d[6]),
				ema50: parseTvNumber(d[7]),
				macd: parseTvNumber(d[8]),
				macdSignal: parseTvNumber(d[9]),
				vwap: parseTvNumber(d[10]),
				recommendAll: parseTvNumber(d[11]),
				fetchedAt: now,
			};
			fetched.set(symbol, snapshot);
		}

		if (fetched.size > 0 || !tradingViewIndicatorCache) {
			const merged = new Map<string, TradingViewSnapshot>(tradingViewIndicatorCache?.bySymbol ?? []);
			for (const [symbol, snapshot] of fetched) {
				merged.set(symbol, snapshot);
			}
			tradingViewIndicatorCache = {
				computedAt: now,
				bySymbol: merged,
			};
		}

		return selectFromCache();
	} catch {
		return selectFromCache();
	}
}

function deriveTradingViewSignalContext(
	snapshot: TradingViewSnapshot | undefined,
	breakoutSignal: BreakoutSignal,
	expansionDirection: "bullish" | "bearish" | null,
	momentumStrength: number,
): TradingViewSignalContext {
	const base: TradingViewSignalContext = {
		scoreBias: 0,
		warnings: [],
		trendAlignment: "neutral",
		trendDirection: "neutral",
		trendStrength: 0,
	};
	if (!snapshot) return base;

	let bullVotes = 0;
	let bearVotes = 0;

	if (
		snapshot.ema10 != null &&
		snapshot.ema20 != null &&
		snapshot.ema50 != null
	) {
		if (snapshot.ema10 > snapshot.ema20 && snapshot.ema20 > snapshot.ema50) bullVotes += 2;
		else if (snapshot.ema10 < snapshot.ema20 && snapshot.ema20 < snapshot.ema50) bearVotes += 2;
	}

	if (snapshot.macd != null && snapshot.macdSignal != null) {
		if (snapshot.macd > snapshot.macdSignal) bullVotes += 1;
		else if (snapshot.macd < snapshot.macdSignal) bearVotes += 1;
	}

	if (snapshot.recommendAll != null) {
		if (snapshot.recommendAll >= 0.2) bullVotes += 1;
		else if (snapshot.recommendAll <= -0.2) bearVotes += 1;
	}

	if (snapshot.rsi != null) {
		if (snapshot.rsi >= 56) bullVotes += 1;
		else if (snapshot.rsi <= 44) bearVotes += 1;
	}

	let trendDirection: DirectionalBias | "neutral" = "neutral";
	if (bullVotes - bearVotes >= 2) trendDirection = "bullish";
	else if (bearVotes - bullVotes >= 2) trendDirection = "bearish";

	const adx = snapshot.adx ?? 0;
	const voteEdge = Math.abs(bullVotes - bearVotes);
	const trendStrength = Math.round(
		clamp(voteEdge * 18 + clamp(adx - 14, 0, 30) * 1.6, 0, 100),
	);

	const signalDirection = resolveSignalDirection(
		breakoutSignal,
		expansionDirection,
		momentumStrength,
	);

	let trendAlignment: "aligned" | "conflict" | "neutral" = "neutral";
	let scoreBias = 0;
	const warnings = new Set<string>();

	if (signalDirection && trendDirection !== "neutral") {
		if (signalDirection === trendDirection) {
			trendAlignment = "aligned";
			scoreBias += Math.round(clamp(1 + trendStrength / 40, 1, 4));
		} else {
			trendAlignment = "conflict";
			scoreBias -= Math.round(clamp(2 + trendStrength / 24, 2, 7));
			warnings.add("TV_TREND_CONFLICT");
		}
	}

	if (
		signalDirection &&
		adx > 0 &&
		adx < 16 &&
		(breakoutSignal === "BREAKOUT" ||
			breakoutSignal === "BREAKDOWN" ||
			breakoutSignal === "EXPANSION" ||
			breakoutSignal === "MOMENTUM")
	) {
		scoreBias -= 2;
		warnings.add("TV_LOW_ADX");
	}

	if (signalDirection === "bullish" && snapshot.rsi != null && snapshot.rsi >= 72) {
		scoreBias -= 2;
		warnings.add("TV_RSI_OVERBOUGHT");
	}
	if (signalDirection === "bearish" && snapshot.rsi != null && snapshot.rsi <= 28) {
		scoreBias -= 2;
		warnings.add("TV_RSI_OVERSOLD");
	}

	if (signalDirection && snapshot.recommendAll != null) {
		if (signalDirection === "bullish" && snapshot.recommendAll <= -0.25) {
			scoreBias -= 2;
			warnings.add("TV_RECOMMEND_OPPOSE");
		}
		if (signalDirection === "bearish" && snapshot.recommendAll >= 0.25) {
			scoreBias -= 2;
			warnings.add("TV_RECOMMEND_OPPOSE");
		}
	}

	return {
		scoreBias: Math.round(clamp(scoreBias, -10, 6)),
		warnings: Array.from(warnings),
		trendAlignment,
		trendDirection,
		trendStrength,
	};
}

function getAdaptiveBreakoutTuning(now: number = Date.now()): AdaptiveBreakoutTuning {
	if (adaptiveTuningCache && now - adaptiveTuningCache.computedAt <= ADAPTIVE_TUNING_CACHE_MS) {
		return adaptiveTuningCache.value;
	}

	try {
		const summary = getBreakoutAlertSummary(48);
		const overallWins = summary.sample?.wins ?? 0;
		const overallLosses = summary.sample?.losses ?? 0;
		const overallDecisive = overallWins + overallLosses;

		if (overallDecisive < 8) {
			adaptiveTuningCache = { computedAt: now, value: DEFAULT_ADAPTIVE_TUNING };
			return DEFAULT_ADAPTIVE_TUNING;
		}

		const overallWinRate = overallWins / Math.max(1, overallDecisive);

		const breakoutSlice = summary.bySignal?.BREAKOUT;
		const breakdownSlice = summary.bySignal?.BREAKDOWN;
		const directionalWins = (breakoutSlice?.wins ?? 0) + (breakdownSlice?.wins ?? 0);
		const directionalLosses = (breakoutSlice?.losses ?? 0) + (breakdownSlice?.losses ?? 0);
		const directionalDecisive = directionalWins + directionalLosses;
		const directionalWinRate = directionalDecisive > 0
			? directionalWins / directionalDecisive
			: overallWinRate;

		const globalScoreBias = Math.round(clamp((overallWinRate - 0.58) * 18, -4, 3));
		const baseVolumeFloor = clamp(1.1 + (0.58 - overallWinRate) * 0.35, 1.0, 1.3);
		const directionalVolumeAdjust = clamp((0.58 - directionalWinRate) * 0.55, -0.06, 0.15);

		const signalScoreBias: Partial<Record<TunableSignal, number>> = {};
		const signalQualityScoreOffset: Partial<Record<TunableSignal, number>> = {};
		const signalMomentumFloor: Partial<Record<TunableSignal, number>> = {};
		const directionalVolumeOffset: Record<DirectionalBias, number> = {
			bullish: 0,
			bearish: 0,
		};
		const directionalMomentumOffset: Record<DirectionalBias, number> = {
			bullish: 0,
			bearish: 0,
		};
		const directionalScoreBias: Record<DirectionalBias, number> = {
			bullish: 0,
			bearish: 0,
		};
		const hourlyScoreBias: Partial<Record<number, number>> = {};
		const trackedSignals: TunableSignal[] = [
			"BREAKOUT",
			"BREAKDOWN",
			"SQUEEZE",
			"EXPANSION",
			"BUILDING",
			"MOMENTUM",
		];

		for (const signal of trackedSignals) {
			const slice = summary.bySignal?.[signal];
			if (!slice) continue;

			const signalDecisive = (slice.wins ?? 0) + (slice.losses ?? 0);
			if (signalDecisive < 3) continue;

			const signalWinRate = (slice.wins ?? 0) / Math.max(1, signalDecisive);
			const delta = signalWinRate - overallWinRate;
			const underperformance = overallWinRate - signalWinRate;

			let bias = 0;
			if (delta <= -0.12) bias = -4;
			else if (delta <= -0.06) bias = -2;
			else if (delta >= 0.12) bias = 3;
			else if (delta >= 0.06) bias = 1;

			const completed = slice.completed ?? signalDecisive;
			const missRate = (slice.missed ?? 0) / Math.max(1, completed);
			if (missRate > 0.25) bias -= 1;
			if (signalDecisive >= 10 && bias !== 0) bias += bias > 0 ? 1 : -1;

			signalScoreBias[signal] = Math.round(clamp(bias, -6, 5));

			let qualityOffset = 0;
			if (underperformance >= 0.1) qualityOffset = 6;
			else if (underperformance >= 0.06) qualityOffset = 4;
			else if (underperformance >= 0.03) qualityOffset = 2;
			else if (underperformance <= -0.08) qualityOffset = -3;
			else if (underperformance <= -0.04) qualityOffset = -2;
			if (qualityOffset !== 0) {
				signalQualityScoreOffset[signal] = qualityOffset;
			}

			if (signal === "BREAKOUT" || signal === "BREAKDOWN" || signal === "EXPANSION" || signal === "MOMENTUM") {
				const baseFloor =
					signal === "BREAKDOWN"
						? 12
						: signal === "BREAKOUT"
							? 10
							: signal === "MOMENTUM"
								? 24
								: 22;
				const floorAdjust = underperformance >= 0.06 ? 4 : underperformance >= 0.03 ? 2 : underperformance <= -0.06 ? -2 : 0;
				signalMomentumFloor[signal] = Math.round(clamp(baseFloor + floorAdjust, 6, 36));
			}
		}

		for (const direction of ["bullish", "bearish"] as DirectionalBias[]) {
			const slice = summary.byDirection?.[direction];
			if (!slice) continue;

			const decisive = (slice.wins ?? 0) + (slice.losses ?? 0);
			if (decisive < 5) continue;

			const directionWinRate = (slice.wins ?? 0) / Math.max(1, decisive);
			const confidence = clamp((decisive - 4) / 10, 0, 1);
			const drift = overallWinRate - directionWinRate;

			directionalVolumeOffset[direction] = roundTo(
				clamp(drift * 0.3 * confidence, -0.06, 0.08),
				2,
			);
			directionalMomentumOffset[direction] = Math.round(
				clamp(drift * 20 * confidence, -4, 6),
			);
			directionalScoreBias[direction] = Math.round(
				clamp(-drift * 14 * confidence, -3, 3),
			);
		}

		const lookbackCutoff = now - 48 * 60 * 60 * 1000;
		const scopedRows = getBreakoutAlertLog(2000).filter((row) => row.timestamp >= lookbackCutoff);
		const hourlyStats = new Map<number, { wins: number; losses: number }>();
		for (const row of scopedRows) {
			const decisive = row.outcome === "win_t1" || row.outcome === "win_t2" || row.outcome === "loss";
			if (!decisive) continue;
			const hour = getNyHour(row.timestamp);
			const current = hourlyStats.get(hour) ?? { wins: 0, losses: 0 };
			if (row.outcome === "loss") current.losses += 1;
			else current.wins += 1;
			hourlyStats.set(hour, current);
		}
		for (const [hour, stats] of hourlyStats.entries()) {
			const decisive = stats.wins + stats.losses;
			if (decisive < 12) continue;
			const winRate = stats.wins / Math.max(1, decisive);
			if (winRate <= 0.47) hourlyScoreBias[hour] = -6;
			else if (winRate <= 0.52) hourlyScoreBias[hour] = -4;
			else if (winRate >= 0.64) hourlyScoreBias[hour] = 2;
		}

		const breakdownDecisive = (breakdownSlice?.wins ?? 0) + (breakdownSlice?.losses ?? 0);
		const breakdownWinRate = breakdownDecisive > 0
			? (breakdownSlice?.wins ?? 0) / Math.max(1, breakdownDecisive)
			: overallWinRate;
		const bearishBreakdownExtraVolumeMin = roundTo(
			clamp((overallWinRate - breakdownWinRate) * 0.9, 0, 0.18),
			2,
		);
		if (breakdownDecisive >= 8 && breakdownWinRate < overallWinRate - 0.04) {
			directionalMomentumOffset.bearish = Math.round(
				clamp(directionalMomentumOffset.bearish + 2, -4, 8),
			);
		}

		const bearishSlice = summary.byDirection?.bearish;
		const bearishDecisive = (bearishSlice?.wins ?? 0) + (bearishSlice?.losses ?? 0);
		const bearishWinRate = bearishDecisive > 0
			? (bearishSlice?.wins ?? 0) / Math.max(1, bearishDecisive)
			: overallWinRate;
		const lowAdxQualityDemotion =
			overallWinRate < 0.56 || bearishWinRate < overallWinRate - 0.05 || breakdownWinRate < overallWinRate - 0.05
				? 2
				: 1;

		const tuned: AdaptiveBreakoutTuning = {
			breakoutVolumeMin: roundTo(clamp(baseVolumeFloor + directionalVolumeAdjust, 1.0, 1.35), 2),
			expansionMomentumMin: Math.round(clamp(35 + (0.56 - overallWinRate) * 24, 30, 44)),
			momentumSignalMin: Math.round(clamp(45 + (0.56 - overallWinRate) * 28, 38, 55)),
			qualityHighScoreMin: Math.round(clamp(65 + (0.55 - overallWinRate) * 18, 58, 74)),
			qualityMediumScoreMin: Math.round(clamp(45 + (0.55 - overallWinRate) * 14, 38, 56)),
			globalScoreBias,
			signalScoreBias,
			signalQualityScoreOffset,
			signalMomentumFloor,
			directionalVolumeOffset,
			directionalMomentumOffset,
			directionalScoreBias,
			bearishBreakdownExtraVolumeMin,
			lowAdxQualityDemotion,
			hourlyScoreBias,
		};

		adaptiveTuningCache = { computedAt: now, value: tuned };
		return tuned;
	} catch {
		adaptiveTuningCache = { computedAt: now, value: DEFAULT_ADAPTIVE_TUNING };
		return DEFAULT_ADAPTIVE_TUNING;
	}
}

function computeSignalAndSqueezeState(
	symbol: string,
	compression: CompressionSnapshot,
	momentumStrength: number,
	volumeSpike: number,
	isNewHigh: boolean,
	isNewLow: boolean,
	tuning: AdaptiveBreakoutTuning,
	trend: TrendContext
): {
	breakoutSignal: BreakoutSignal;
	breakoutScore: number;
	expansionDirection: "bullish" | "bearish" | null;
	wasInSqueeze: boolean;
	squeezeCandles: number;
	trendAlignment: "aligned" | "conflict" | "neutral";
} {
	const prev = state.symbolState.get(symbol) ?? {
		inSqueeze: false,
		squeezeCandles: 0,
	};

	const bbWidth = toNumber(compression.bbWidth);
	const rangePct = toNumber(compression.rangePct);
	const inSqueeze =
		compression.phase === "PREPARE" ||
		compression.phase === "READY" ||
		(bbWidth <= 1.2 && rangePct <= 0.8);

	const squeezeCandles = inSqueeze ? prev.squeezeCandles + 1 : 0;
	const wasInSqueeze = prev.inSqueeze && !inSqueeze && prev.squeezeCandles >= 2;

	const hasBreakoutUp = isNewHigh || compression.triggers.some((t) => t.includes("BREAKOUT UP"));
	const hasBreakoutDown = isNewLow || compression.triggers.some((t) => t.includes("BREAKOUT DOWN"));
	const breakoutVolumeMin = clamp(tuning.breakoutVolumeMin, 1, 1.5);
	const expansionMomentumMin = Math.max(
		20,
		tuning.signalMomentumFloor.EXPANSION ?? tuning.expansionMomentumMin,
	);
	const momentumSignalMin = Math.max(
		24,
		tuning.signalMomentumFloor.MOMENTUM ?? tuning.momentumSignalMin,
	);
	const breakoutMomentumFloor = Math.max(
		6,
		tuning.signalMomentumFloor.BREAKOUT ?? 10,
	);
	const breakdownMomentumFloor = Math.max(
		6,
		tuning.signalMomentumFloor.BREAKDOWN ?? 12,
	);
	const bullishVolumeMin = clamp(
		breakoutVolumeMin + tuning.directionalVolumeOffset.bullish,
		1,
		1.55,
	);
	const bearishVolumeMin = clamp(
		breakoutVolumeMin + tuning.directionalVolumeOffset.bearish,
		1,
		1.55,
	);

	let expansionDirection: "bullish" | "bearish" | null = null;
	if (hasBreakoutUp || momentumStrength >= 20) expansionDirection = "bullish";
	if (hasBreakoutDown || momentumStrength <= -20) expansionDirection = "bearish";
	const expansionMomentumDirection = hasBreakoutUp
		? "bullish"
		: hasBreakoutDown
			? "bearish"
			: momentumStrength >= 0
				? "bullish"
				: "bearish";
	const expansionMomentumThreshold = Math.max(
		20,
		expansionMomentumMin + tuning.directionalMomentumOffset[expansionMomentumDirection],
	);
	const momentumDirection: DirectionalBias = momentumStrength >= 0 ? "bullish" : "bearish";
	const momentumThreshold = Math.max(
		24,
		momentumSignalMin + tuning.directionalMomentumOffset[momentumDirection],
	);
	const momentumVolumeThreshold = clamp(
		(momentumDirection === "bullish" ? bullishVolumeMin : bearishVolumeMin) + 0.1,
		1.05,
		1.7,
	);
	const counterTrendUpPenalty = trend.trendDirection === "bearish" ? 0.08 : 0;
	const counterTrendDownPenalty = trend.trendDirection === "bullish" ? 0.08 : 0;
	const breakoutUpVolumeMin = clamp(bullishVolumeMin + counterTrendUpPenalty, 1, 1.65);
	const breakoutDownVolumeMin = clamp(
		bearishVolumeMin + counterTrendDownPenalty + tuning.bearishBreakdownExtraVolumeMin,
		1,
		1.8,
	);
	const breakoutUpMomentumMin = trend.trendDirection === "bearish"
		? Math.max(12, breakoutMomentumFloor + 4)
		: breakoutMomentumFloor;
	const breakoutDownMomentumMax = trend.trendDirection === "bullish"
		? -Math.max(12, breakdownMomentumFloor + 4)
		: -breakdownMomentumFloor;

	let breakoutSignal: BreakoutSignal = null;
	if (wasInSqueeze && (hasBreakoutUp || hasBreakoutDown || Math.abs(momentumStrength) >= expansionMomentumThreshold)) {
		breakoutSignal = "EXPANSION";
	} else if (hasBreakoutUp && volumeSpike >= breakoutUpVolumeMin && momentumStrength >= breakoutUpMomentumMin) {
		breakoutSignal = "BREAKOUT";
	} else if (hasBreakoutDown && volumeSpike >= breakoutDownVolumeMin && momentumStrength <= breakoutDownMomentumMax) {
		breakoutSignal = "BREAKDOWN";
	} else if (inSqueeze && squeezeCandles >= 2) {
		breakoutSignal = "SQUEEZE";
	} else if (Math.abs(momentumStrength) >= momentumThreshold && volumeSpike >= momentumVolumeThreshold) {
		breakoutSignal = "MOMENTUM";
	} else if (compression.phase === "PREPARE" || compression.phase === "READY") {
		breakoutSignal = "BUILDING";
	} else {
		breakoutSignal = "CONSOLIDATING";
	}

	let breakoutScore = compression.sparkScore * 0.45;
	if (volumeSpike >= 1.5) breakoutScore += 20;
	else if (volumeSpike >= 1.2) breakoutScore += 10;
	if (isNewHigh || isNewLow) breakoutScore += 18;
	if (Math.abs(momentumStrength) >= 45) breakoutScore += 18;
	else if (Math.abs(momentumStrength) >= 25) breakoutScore += 10;
	if (breakoutSignal === "EXPANSION") breakoutScore += 16;
	if (breakoutSignal === "BREAKOUT" || breakoutSignal === "BREAKDOWN") breakoutScore += 12;
	let directionScoreBias = 0;
	if (breakoutSignal === "BREAKOUT") directionScoreBias = tuning.directionalScoreBias.bullish;
	else if (breakoutSignal === "BREAKDOWN") directionScoreBias = tuning.directionalScoreBias.bearish;
	else if (
		(breakoutSignal === "EXPANSION" || breakoutSignal === "MOMENTUM") &&
		expansionDirection
	) {
		directionScoreBias = tuning.directionalScoreBias[expansionDirection];
	}

	let signalDirection: DirectionalBias | null = null;
	if (breakoutSignal === "BREAKOUT") signalDirection = "bullish";
	if (breakoutSignal === "BREAKDOWN") signalDirection = "bearish";
	if ((breakoutSignal === "EXPANSION" || breakoutSignal === "MOMENTUM") && expansionDirection) {
		signalDirection = expansionDirection;
	}

	let trendAlignment: "aligned" | "conflict" | "neutral" = "neutral";
	let trendScoreBias = 0;
	if (signalDirection && trend.trendDirection !== "neutral") {
		if (signalDirection === trend.trendDirection) {
			trendAlignment = "aligned";
			trendScoreBias = Math.round(clamp(trend.trendStrength / 24, 1, 4));
		} else {
			trendAlignment = "conflict";
			trendScoreBias = -Math.round(clamp(trend.trendStrength / 16, 2, 6));
		}
	}

	const signalBias = breakoutSignal
		? tuning.signalScoreBias[breakoutSignal as TunableSignal] ?? 0
		: 0;
	breakoutScore += tuning.globalScoreBias + signalBias + directionScoreBias + trendScoreBias;
	breakoutScore = Math.round(clamp(breakoutScore, 0, 100));

	state.symbolState.set(symbol, {
		inSqueeze,
		squeezeCandles,
	});

	return {
		breakoutSignal,
		breakoutScore,
		expansionDirection,
		wasInSqueeze,
		squeezeCandles: breakoutSignal === "EXPANSION" ? prev.squeezeCandles : squeezeCandles,
		trendAlignment,
	};
}

function computeWarningsAndQuality(params: {
	volumeSpike: number;
	momentumStrength: number;
	breakoutSignal: BreakoutSignal;
	isNewHigh: boolean;
	isNewLow: boolean;
	breakoutScore: number;
	cmfContribution: number;
	tuning: AdaptiveBreakoutTuning;
	trendAlignment: "aligned" | "conflict" | "neutral";
	additionalWarnings?: string[];
	timeWindowBias?: number;
}): {
	warnings: string[];
	signalQuality: "HIGH" | "MEDIUM" | "LOW" | "UNRELIABLE";
} {
	const {
		volumeSpike,
		momentumStrength,
		breakoutSignal,
		isNewHigh,
		isNewLow,
		breakoutScore,
		cmfContribution,
		tuning,
		trendAlignment,
		additionalWarnings,
		timeWindowBias,
	} = params;

	const demoteQuality = (
		quality: "HIGH" | "MEDIUM" | "LOW" | "UNRELIABLE",
		steps: number,
	): "HIGH" | "MEDIUM" | "LOW" | "UNRELIABLE" => {
		let next = quality;
		for (let i = 0; i < Math.max(0, steps); i++) {
			if (next === "HIGH") next = "MEDIUM";
			else if (next === "MEDIUM") next = "LOW";
			else if (next === "LOW") next = "UNRELIABLE";
		}
		return next;
	};

	const warnings: string[] = [];

	if (volumeSpike < 0.85) warnings.push("LOW_VOLUME");
	if ((isNewHigh && momentumStrength < 0) || (isNewLow && momentumStrength > 0)) {
		warnings.push("CONFLICT_MOMENTUM");
	}
	if ((momentumStrength > 20 && cmfContribution < -1) || (momentumStrength < -20 && cmfContribution > 1)) {
		warnings.push("CMF_DIVERGE");
	}
	if (trendAlignment === "conflict") warnings.push("TREND_CONFLICT");
	if (breakoutSignal === "CONSOLIDATING") warnings.push("CONSOLIDATION");
	if (breakoutSignal === "BUILDING" || breakoutSignal === "SQUEEZE") warnings.push("BUILDING_PRESSURE");
	if ((timeWindowBias ?? 0) <= -3) warnings.push("WEAK_TIME_WINDOW");
	for (const warning of additionalWarnings ?? []) {
		if (!warnings.includes(warning)) warnings.push(warning);
	}

	if (breakoutSignal === "BREAKOUT" || breakoutSignal === "BREAKDOWN") {
		const directionalFloor =
			breakoutSignal === "BREAKOUT"
				? tuning.signalMomentumFloor.BREAKOUT ?? 10
				: tuning.signalMomentumFloor.BREAKDOWN ?? 12;
		if (Math.abs(momentumStrength) < Math.max(6, directionalFloor)) {
			warnings.push("WEAK_DIRECTIONAL_MOMENTUM");
		}
	}

	const scoreOffset = breakoutSignal
		? tuning.signalQualityScoreOffset[breakoutSignal as TunableSignal] ?? 0
		: 0;
	const highScoreMin = Math.round(clamp(tuning.qualityHighScoreMin + scoreOffset, 52, 86));
	const mediumScoreMin = Math.round(
		clamp(tuning.qualityMediumScoreMin + Math.round(scoreOffset * 0.75), 34, highScoreMin - 8),
	);
	const highVolumeMin = clamp(tuning.breakoutVolumeMin + 0.08, 1.1, 1.35);
	const highMomentumMin = Math.max(
		22,
		Math.max(tuning.expansionMomentumMin - 10, (breakoutSignal ? tuning.signalMomentumFloor[breakoutSignal as TunableSignal] : 0) ?? 0),
	);

	let signalQuality: "HIGH" | "MEDIUM" | "LOW" | "UNRELIABLE" = "LOW";

	if (warnings.includes("CONFLICT_MOMENTUM") && warnings.includes("LOW_VOLUME")) {
		signalQuality = "UNRELIABLE";
	} else if (breakoutScore >= highScoreMin && volumeSpike >= highVolumeMin && Math.abs(momentumStrength) >= highMomentumMin) {
		signalQuality = "HIGH";
	} else if (breakoutScore >= mediumScoreMin) {
		signalQuality = "MEDIUM";
	} else if (breakoutScore < Math.max(25, mediumScoreMin - 20)) {
		signalQuality = "LOW";
	}

	if (trendAlignment === "conflict" && signalQuality === "HIGH") {
		signalQuality = "MEDIUM";
	}
	if (warnings.includes("TV_TREND_CONFLICT")) {
		signalQuality = demoteQuality(signalQuality, 1);
		if (signalQuality === "MEDIUM" && breakoutScore < highScoreMin + 6) signalQuality = "LOW";
	}
	if (warnings.includes("TV_LOW_ADX")) {
		signalQuality = demoteQuality(signalQuality, Math.max(1, tuning.lowAdxQualityDemotion));
		if (breakoutSignal === "BREAKDOWN" && !warnings.includes("BEARISH_TREND_WEAK")) {
			warnings.push("BEARISH_TREND_WEAK");
		}
	}
	if (warnings.includes("WEAK_DIRECTIONAL_MOMENTUM") && signalQuality !== "UNRELIABLE") {
		signalQuality = demoteQuality(signalQuality, 1);
	}
	if (warnings.includes("WEAK_TIME_WINDOW") && (timeWindowBias ?? 0) <= -4 && breakoutScore < highScoreMin + 10) {
		signalQuality = demoteQuality(signalQuality, 1);
	}

	return { warnings, signalQuality };
}

async function scanSymbol(
	symbol: string,
	timeframe: string,
	tvSnapshotInput?: TradingViewSnapshot,
): Promise<ScannerResult | null> {
	try {
		const upperSymbol = normalizeSymbol(symbol);
		if (!upperSymbol) return null;
		const tvSnapshot = tvSnapshotInput ?? (await getTradingViewIndicatorMap([upperSymbol])).get(upperSymbol);

		const liveSpot = await fetchLiveSpot(upperSymbol).catch(() => {
			const cached = getCachedSpot(upperSymbol);
			if (cached) return cached.data;
			const candleSpot = getLastKnownSpotFromCandles(upperSymbol);
			return candleSpot ? candleSpot.data : null;
		});
		const live = await fetchLiveOHLC(upperSymbol, timeframe, "FULL");
		const hasOhlcData = live.data.length > 0;

		const ohlc =
			hasOhlcData
				? live.data
				: generateSampleOHLC(upperSymbol, getCandleCount(timeframe), liveSpot?.spot);

		if (!ohlc.length) return null;

		const sessionSplit =
			hasOhlcData
				? {
						rth: live.rth,
						overnight: live.overnight,
						prevDayRth: live.prevDayRth,
					}
				: {
						rth: ohlc,
						overnight: [] as OHLC[],
						prevDayRth: [] as OHLC[],
					};

		const analysis = analyzeSymbol(
			upperSymbol,
			ohlc,
			{ maxAbsGammaStrike: null },
			sessionSplit
		);

		const sortedPatterns = detectAllPatterns(ohlc, timeframe)
			.sort((a, b) => b.confidence - a.confidence)
			.slice(0, 8);

		const lastCandle = ohlc[ohlc.length - 1];
		const prevCandle = ohlc[ohlc.length - 2] ?? lastCandle;
		const lastPrice = liveSpot?.spot ?? lastCandle.close;
		const prevClose = liveSpot?.prevClose ?? prevCandle.close;
		const priceChange = lastPrice - prevClose;
		const priceChangePercent = prevClose > 0 ? (priceChange / prevClose) * 100 : 0;

		const compression = analyzeCompression(ohlc);
		const momentumStrength = computeMomentumStrength(ohlc);
		const volumeSpike = computeVolumeSpike(ohlc);
		const { isNewHigh, isNewLow } = computeRangeBreaks(ohlc);
		const trendContext = computeTrendContext(ohlc);
		const adaptiveTuning = getAdaptiveBreakoutTuning();

		const breakoutState = computeSignalAndSqueezeState(
			upperSymbol,
			compression,
			momentumStrength,
			volumeSpike,
			isNewHigh,
			isNewLow,
			adaptiveTuning,
			trendContext
		);
		const scanTime = Date.now();
		const tvSignalContext = deriveTradingViewSignalContext(
			tvSnapshot,
			breakoutState.breakoutSignal,
			breakoutState.expansionDirection,
			momentumStrength,
		);
		const nyHour = getNyHour(scanTime);
		const timeWindowBias = adaptiveTuning.hourlyScoreBias[nyHour] ?? 0;
		const timeWindowWarnings: string[] = [];
		if (timeWindowBias <= -3) timeWindowWarnings.push("WEAK_TIME_WINDOW");
		else if (timeWindowBias >= 2) timeWindowWarnings.push("FAVORABLE_TIME_WINDOW");
		const tunedBreakoutScore = Math.round(
			clamp(breakoutState.breakoutScore + tvSignalContext.scoreBias + timeWindowBias, 0, 100),
		);

		const now = new Date();
		const nowMinutes = now.getHours() * 60 + now.getMinutes();
		const monster = runMonsterOTMEngine(
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

		const { warnings, signalQuality } = computeWarningsAndQuality({
			volumeSpike,
			momentumStrength,
			breakoutSignal: breakoutState.breakoutSignal,
			isNewHigh,
			isNewLow,
			breakoutScore: tunedBreakoutScore,
			cmfContribution: analysis.marketHealth?.cmf?.contribution ?? 0,
			tuning: adaptiveTuning,
			trendAlignment: breakoutState.trendAlignment,
			additionalWarnings: [...tvSignalContext.warnings, ...timeWindowWarnings],
			timeWindowBias,
		});

		const result: ScannerResult = {
			symbol: upperSymbol,
			patterns: sortedPatterns,
			lastPrice,
			priceChange,
			priceChangePercent,
			volume: lastCandle.volume ?? 0,
			scanTime,
			healthScore: analysis.marketHealth?.overallHealth ?? analysis.overall ?? 50,
			healthGrade: analysis.marketHealth?.healthGrade ?? analysis.grade ?? "C",
			hasMonsterPlay: Boolean(monster?.hasPlay),
			volumeSpike,
			breakoutScore: tunedBreakoutScore,
			isNewHigh,
			isNewLow,
			momentumStrength,
			rsiValue: analysis.marketHealth?.rsi?.value ?? 50,
			breakoutSignal: breakoutState.breakoutSignal,
			wasInSqueeze: breakoutState.wasInSqueeze,
			squeezeCandles: breakoutState.squeezeCandles,
			expansionDirection: breakoutState.expansionDirection,
			warnings,
			signalQuality,
			compression,
			tvRsi: tvSnapshot?.rsi ?? undefined,
			tvAdx: tvSnapshot?.adx ?? undefined,
			tvRecommendAll: tvSnapshot?.recommendAll ?? undefined,
			tvTrendDirection: tvSignalContext.trendDirection,
			tvTrendStrength: tvSignalContext.trendStrength,
		};

		if (timeframe === DEFAULT_TIMEFRAME) {
			updateBreakoutAlertOutcomes(upperSymbol, lastPrice, {
				high: lastCandle.high,
				low: lastCandle.low,
				now: scanTime,
			});

			recordBreakoutAlert({
				symbol: upperSymbol,
				timeframe,
				timestamp: result.scanTime,
				lastPrice: result.lastPrice,
				priceChangePercent: result.priceChangePercent,
				breakoutSignal: result.breakoutSignal,
				breakoutScore: result.breakoutScore,
				momentumStrength: result.momentumStrength,
				volumeSpike: result.volumeSpike,
				rsiValue: result.rsiValue,
				healthScore: result.healthScore,
				healthGrade: result.healthGrade,
				signalQuality: result.signalQuality,
				expansionDirection: result.expansionDirection,
				warnings: result.warnings,
				compression: result.compression,
				tvRsi: result.tvRsi,
				tvAdx: result.tvAdx,
				tvRecommendAll: result.tvRecommendAll,
				tvTrendDirection: result.tvTrendDirection,
				tvTrendStrength: result.tvTrendStrength,
			});
		}

		return result;
	} catch (error) {
		console.error(`[Scanner] Failed scan for ${symbol}:`, error);
		return null;
	}
}

async function runScanCycle(): Promise<void> {
	if (state.scanInFlight) return;
	state.scanInFlight = true;

	try {
		const symbols = Array.from(state.watchlist);
		const tvBySymbol = await getTradingViewIndicatorMap(symbols);
		for (const symbol of symbols) {
			const upperSymbol = normalizeSymbol(symbol);
			const result = await scanSymbol(
				symbol,
				DEFAULT_TIMEFRAME,
				upperSymbol ? tvBySymbol.get(upperSymbol) : undefined,
			);
			if (result) {
				state.results.set(result.symbol, result);
			}
		}

		state.lastScanTime = Date.now();
	} finally {
		state.scanInFlight = false;
	}
}

export function startScanner(): void {
	if (state.scanTimer) return;
	void runScanCycle();
	state.scanTimer = setInterval(() => {
		void runScanCycle();
	}, SCAN_INTERVAL_MS);
}

export function getScannerStatus(): ScannerStatus {
	return {
		isScanning: state.scanTimer !== null,
		lastScanTime: state.lastScanTime,
		watchlistCount: state.watchlist.size,
		resultCount: state.results.size,
	};
}

export function getScannerResults(): ScannerResult[] {
	const watchlistOrder = new Map<string, number>();
	Array.from(state.watchlist).forEach((symbol, idx) => {
		watchlistOrder.set(symbol, idx);
	});

	return Array.from(state.results.values()).sort((a, b) => {
		const aOrder = watchlistOrder.get(a.symbol) ?? Number.MAX_SAFE_INTEGER;
		const bOrder = watchlistOrder.get(b.symbol) ?? Number.MAX_SAFE_INTEGER;
		if (aOrder !== bOrder) return aOrder - bOrder;
		return a.symbol.localeCompare(b.symbol);
	});
}

export function getScannerResult(symbol: string): ScannerResult | null {
	const upperSymbol = normalizeSymbol(symbol);
	if (!upperSymbol) return null;
	return state.results.get(upperSymbol) ?? null;
}

export function getWatchlist(): string[] {
	return Array.from(state.watchlist);
}

export function addToWatchlist(symbol: string): boolean {
	const upperSymbol = normalizeSymbol(symbol);
	if (!upperSymbol) return false;

	const before = state.watchlist.size;
	state.watchlist.add(upperSymbol);
	const added = state.watchlist.size > before;

	if (added) {
		void scanSymbol(upperSymbol, DEFAULT_TIMEFRAME).then((result) => {
			if (result) {
				state.results.set(upperSymbol, result);
				state.lastScanTime = Date.now();
			}
		});
	}

	return added;
}

export function removeFromWatchlist(symbol: string): boolean {
	const upperSymbol = normalizeSymbol(symbol);
	if (!upperSymbol) return false;

	const removed = state.watchlist.delete(upperSymbol);
	if (removed) {
		state.results.delete(upperSymbol);
		state.symbolState.delete(upperSymbol);
	}
	return removed;
}

export async function scanSingleSymbol(
	symbol: string,
	timeframe: string = DEFAULT_TIMEFRAME
): Promise<ScannerResult | null> {
	const upperSymbol = normalizeSymbol(symbol);
	if (!upperSymbol) return null;

	const result = await scanSymbol(upperSymbol, timeframe);
	if (result) {
		state.results.set(upperSymbol, result);
		state.lastScanTime = Date.now();
	}
	return result;
}
