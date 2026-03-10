import { analyzeSymbol, generateSampleOHLC } from "./finance";
import { fetchLiveOHLC, fetchLiveSpot } from "./marketData";
import { detectAllPatterns, type PatternResult } from "./patterns";
import { runMonsterOTMEngine } from "./monsterOtmEngine";

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
}

interface ScannerStatus {
	isScanning: boolean;
	lastScanTime: number;
	watchlistCount: number;
	resultCount: number;
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

const state = {
	watchlist: new Set<string>(DEFAULT_WATCHLIST),
	results: new Map<string, ScannerResult>(),
	lastScanTime: 0,
	scanTimer: null as ReturnType<typeof setInterval> | null,
	scanInFlight: false,
	symbolState: new Map<string, SymbolScanState>(),
};

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

function normalizeSymbol(symbol: string): string {
	return String(symbol ?? "")
		.trim()
		.toUpperCase()
		.replace(/[^A-Z0-9.-]/g, "")
		.slice(0, 10);
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

function computeSignalAndSqueezeState(
	symbol: string,
	compression: CompressionSnapshot,
	momentumStrength: number,
	volumeSpike: number,
	isNewHigh: boolean,
	isNewLow: boolean
): {
	breakoutSignal: BreakoutSignal;
	breakoutScore: number;
	expansionDirection: "bullish" | "bearish" | null;
	wasInSqueeze: boolean;
	squeezeCandles: number;
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

	let expansionDirection: "bullish" | "bearish" | null = null;
	if (hasBreakoutUp || momentumStrength >= 20) expansionDirection = "bullish";
	if (hasBreakoutDown || momentumStrength <= -20) expansionDirection = "bearish";

	let breakoutSignal: BreakoutSignal = null;
	if (wasInSqueeze && (hasBreakoutUp || hasBreakoutDown || Math.abs(momentumStrength) >= 35)) {
		breakoutSignal = "EXPANSION";
	} else if (hasBreakoutUp && volumeSpike >= 1.1) {
		breakoutSignal = "BREAKOUT";
	} else if (hasBreakoutDown && volumeSpike >= 1.1) {
		breakoutSignal = "BREAKDOWN";
	} else if (inSqueeze && squeezeCandles >= 2) {
		breakoutSignal = "SQUEEZE";
	} else if (Math.abs(momentumStrength) >= 45 && volumeSpike >= 1.2) {
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
	} = params;

	const warnings: string[] = [];

	if (volumeSpike < 0.85) warnings.push("LOW_VOLUME");
	if ((isNewHigh && momentumStrength < 0) || (isNewLow && momentumStrength > 0)) {
		warnings.push("CONFLICT_MOMENTUM");
	}
	if ((momentumStrength > 20 && cmfContribution < -1) || (momentumStrength < -20 && cmfContribution > 1)) {
		warnings.push("CMF_DIVERGE");
	}
	if (breakoutSignal === "CONSOLIDATING") warnings.push("CONSOLIDATION");
	if (breakoutSignal === "BUILDING" || breakoutSignal === "SQUEEZE") warnings.push("BUILDING_PRESSURE");

	let signalQuality: "HIGH" | "MEDIUM" | "LOW" | "UNRELIABLE" = "LOW";

	if (warnings.includes("CONFLICT_MOMENTUM") && warnings.includes("LOW_VOLUME")) {
		signalQuality = "UNRELIABLE";
	} else if (breakoutScore >= 65 && volumeSpike >= 1.2 && Math.abs(momentumStrength) >= 25) {
		signalQuality = "HIGH";
	} else if (breakoutScore >= 45) {
		signalQuality = "MEDIUM";
	} else if (breakoutScore < 25) {
		signalQuality = "LOW";
	}

	return { warnings, signalQuality };
}

async function scanSymbol(symbol: string, timeframe: string): Promise<ScannerResult | null> {
	try {
		const upperSymbol = normalizeSymbol(symbol);
		if (!upperSymbol) return null;

		const liveSpot = await fetchLiveSpot(upperSymbol).catch(() => null);
		const live = await fetchLiveOHLC(upperSymbol, timeframe, "FULL");

		const ohlc =
			live.isLive && live.data.length > 0
				? live.data
				: generateSampleOHLC(upperSymbol, getCandleCount(timeframe), liveSpot?.spot);

		if (!ohlc.length) return null;

		const sessionSplit =
			live.isLive && live.data.length > 0
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

		const breakoutState = computeSignalAndSqueezeState(
			upperSymbol,
			compression,
			momentumStrength,
			volumeSpike,
			isNewHigh,
			isNewLow
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
			breakoutScore: breakoutState.breakoutScore,
			cmfContribution: analysis.marketHealth?.cmf?.contribution ?? 0,
		});

		return {
			symbol: upperSymbol,
			patterns: sortedPatterns,
			lastPrice,
			priceChange,
			priceChangePercent,
			volume: lastCandle.volume ?? 0,
			scanTime: Date.now(),
			healthScore: analysis.marketHealth?.overallHealth ?? analysis.overall ?? 50,
			healthGrade: analysis.marketHealth?.healthGrade ?? analysis.grade ?? "C",
			hasMonsterPlay: Boolean(monster?.hasPlay),
			volumeSpike,
			breakoutScore: breakoutState.breakoutScore,
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
		};
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
		for (const symbol of symbols) {
			const result = await scanSymbol(symbol, DEFAULT_TIMEFRAME);
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
