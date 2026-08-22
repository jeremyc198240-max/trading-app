import { analyzeSymbol } from "./finance";
import { fetchLiveOHLC, fetchLiveSpot, getCachedSpot, getLastKnownSpotFromCandles } from "./marketData";
import { detectAllPatterns, type PatternResult } from "./patterns";
import { runMonsterOTMEngine, type MonsterOTMEngineOutput } from "./monsterOtmEngine";
import {
	getBreakoutAlertLog,
	getBreakoutAlertSummary,
	recordBreakoutAlert,
	recordEdgeTuningSample,
	type BreakoutOptionsReadinessSnapshot,
	updateBreakoutAlertOutcomes,
} from "./breakoutAlertHistory";
import { recordScannerSignal } from "./scannerIntegration";

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

interface ScannerOptionPlay {
	score?: number;
	openInterest?: number;
	oi?: number;
	direction?: "CALL" | "PUT" | "NEUTRAL";
	pt?: number;
	targetPrice?: number;
	stopLoss?: number;
	stopPrice?: number;
	strike?: number;
	premium?: number;
	rr?: number;
	riskReward?: number;
	rationale?: string;
}

interface ScannerTimeframeStackComponent {
	timeframe: string;
	breakoutSignal: string | null;
	breakoutScore: number;
	momentumStrength: number;
	direction: DirectionalBias | "neutral";
	weight: number;
}

interface ScannerTimeframeStack {
	primary: string;
	aggregateScore: number;
	agreement: number;
	bias: DirectionalBias | "mixed" | "neutral";
	components: ScannerTimeframeStackComponent[];
}

interface ScannerPreBreakoutSetup {
	score: number;
	traits: string[];
	preVolumeRatio: number;
	preRsi: number;
	preMomentum3: number;
	preRangeCompression: number;
	preCloseLocation: number;
	preNearSessionHigh: boolean;
	preAboveVwap: boolean;
	etaMinutes?: number;
}

interface ScannerTradePlan {
	entry?: number;
	entryZoneLow?: number;
	entryZoneHigh?: number;
	stop?: number;
	targets?: number[];
	rrLadder?: number[];
	riskRewardLabel?: string;
	confidencePct?: number;
	confidenceLabel?: string;
	confidenceReasons?: string[];
	positionSizing?: string;
	timeline?: string;
}

interface ScannerSpotMeta {
	timestamp?: string;
	quoteAgeMs?: number;
	source?: "finnhub" | "yahoo";
	marketState?: string;
	isFresh: boolean;
}

type EdgeSignal = "BREAK_UP" | "BREAK_DOWN" | "WAIT";
type EdgeState = "STANDBY" | "ARMING" | "PRIMED" | "TRIGGERED";
type SarBias = "above" | "below" | "neutral";

interface EdgeIndicatorSnapshot {
	rsi: number;
	macdHistogram: number;
	macdTrend: DirectionalBias | "neutral";
	bbPercentB: number;
	bbSqueeze: boolean;
	stochasticK: number;
	stochasticD: number;
	adx: number;
	tvRsi: number;
	tvAdx: number;
	tvRecommendAll: number;
	momentum: number;
	volumeSpike: number;
	sarBias: SarBias;
}

interface EdgeEngineSnapshot {
	signal: EdgeSignal;
	direction: DirectionalBias | "neutral";
	state: EdgeState;
	edgeScore: number;
	confidence: number;
	leadMinutes: number;
	triggerProbability: number;
	reasons: string[];
	indicators: EdgeIndicatorSnapshot;
}

interface TimeframeStackInput {
	timeframe: string;
	breakoutSignal: BreakoutSignal;
	breakoutScore: number;
	momentumStrength: number;
	expansionDirection: "bullish" | "bearish" | null;
	candleDirection?: DirectionalBias | "neutral";
	weight: number;
}

interface TimeframeSignalSnapshot {
	breakoutSignal: BreakoutSignal;
	breakoutScore: number;
	momentumStrength: number;
	volumeSpike: number;
	expansionDirection: "bullish" | "bearish" | null;
	compression: CompressionSnapshot;
}

interface SetupSignature {
	closeLocation: number;
	rsi: number;
	momentum3: number;
	rangeCompression: number;
	volumeRatio: number;
}

interface RepeatedSetupPatternSignal {
	matched: boolean;
	sampleSize: number;
	hitRate: number;
	avgSimilarity: number;
	scoreBoost: number;
	leadBars: number;
	traits: string[];
}

interface ScannerResult {
	symbol: string;
	patterns: PatternResult[];
	lastPrice: number;
	priceChange: number;
	priceChangePercent: number;
	spotMeta?: ScannerSpotMeta;
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
	lastIndex?: number;
	dailyVolume?: number;
	pattern?: string;
	optionPlays?: ScannerOptionPlay[];
	optionsReadiness?: BreakoutOptionsReadinessSnapshot;
	timeframeStack?: ScannerTimeframeStack;
	preBreakoutSetup?: ScannerPreBreakoutSetup;
	tradePlan?: ScannerTradePlan;
	setupReasoning?: string[];
	edgeEngine?: EdgeEngineSnapshot;
	isDegraded?: boolean;
	degradedReason?: string;
}

interface ScannerStatus {
	isScanning: boolean;
	lastScanTime: number;
	watchlistCount: number;
	resultCount: number;
}

interface ScannerStabilityRow {
	symbol: string;
	signal: BreakoutSignal | null;
	score: number;
	bias: DirectionalBias | "neutral" | "n/a";
	isDegraded: boolean;
}

interface ScannerStabilitySnapshot {
	capturedAt: number;
	rows: Map<string, ScannerStabilityRow>;
}

interface ScannerSymbolStability {
	symbol: string;
	transitions: number;
	flipTransitions: number;
	signalFlips: number;
	biasFlips: number;
	degradedFlips: number;
	scoreJumps: number;
}

interface ScannerStabilitySummary {
	snapshots: number;
	symbols: number;
	transitionsPerSymbol: number;
	totalTransitions: number;
	totalFlipTransitions: number;
	flipRatePct: number;
	scoreJumpThreshold: number;
	fromTimestamp: number | null;
	toTimestamp: number | null;
	windowMinutes: number;
	currentDegradedCount: number;
	currentDegradedRatioPct: number;
	perSymbol: ScannerSymbolStability[];
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

interface MonsterConfirmState {
	streak: number;
	direction: "bullish" | "bearish" | null;
}

// A monster play must agree across this many consecutive scans before it is
// surfaced as a valid play; prevents single-bar noise from flipping signals.
const MONSTER_PLAY_CONFIRMATION_SCANS = 2;

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
const SCAN_INTERVAL_MS = 60_000;
const SCANNER_LIVE_SPOT_MAX_AGE_MS = 2 * 60 * 1000;
const SCANNER_STALE_OHLC_SPOT_DIVERGENCE_PCT = 0.015;
const DEGRADED_RESULT_HOLD_MS = 5 * 60 * 1000;
const DEGRADED_RESULT_STRONG_SHIFT_SCORE = 14;
const SCANNER_STABILITY_HISTORY_LIMIT = 32;
const SCANNER_STABILITY_DEFAULT_WINDOW = 6;
const SCANNER_STABILITY_DEFAULT_SCORE_JUMP = 8;
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
	stabilityHistory: [] as ScannerStabilitySnapshot[],
	lastScanTime: 0,
	scanTimer: null as ReturnType<typeof setInterval> | null,
	scanInFlight: false,
	symbolState: new Map<string, SymbolScanState>(),
	monsterConfirmState: new Map<string, MonsterConfirmState>(),
};

function signalQualityRank(quality: ScannerResult["signalQuality"] | undefined): number {
	if (quality === "HIGH") return 4;
	if (quality === "MEDIUM") return 3;
	if (quality === "LOW") return 2;
	if (quality === "UNRELIABLE") return 1;
	return 0;
}

function shouldKeepExistingScannerResult(
	existing: ScannerResult | undefined,
	incoming: ScannerResult,
	nowMs: number = Date.now(),
): boolean {
	if (!existing) return false;

	const existingAgeMs = Math.max(0, nowMs - (existing.scanTime || 0));

	if (!existing.isDegraded && incoming.isDegraded === true && existingAgeMs <= 20 * 60 * 1000) {
		return true;
	}

	if (existing.isDegraded === true && incoming.isDegraded === true) {
		const existingScore = Number.isFinite(existing.breakoutScore) ? (existing.breakoutScore as number) : 0;
		const incomingScore = Number.isFinite(incoming.breakoutScore) ? (incoming.breakoutScore as number) : 0;
		const scoreShift = Math.abs(incomingScore - existingScore);
		const qualityImproved = signalQualityRank(incoming.signalQuality) > signalQualityRank(existing.signalQuality);
		const strongShift = qualityImproved || scoreShift >= DEGRADED_RESULT_STRONG_SHIFT_SCORE;

		if (existingAgeMs <= DEGRADED_RESULT_HOLD_MS && !strongShift) {
			return true;
		}
	}

	return false;
}

function toStabilitySignal(signal: BreakoutSignal | undefined): BreakoutSignal | null {
	return signal ?? null;
}

function toStabilityScore(result: ScannerResult): number {
	const score = result.breakoutScore;
	return Number.isFinite(score) ? (score as number) : 0;
}

function toStabilityBias(result: ScannerResult): DirectionalBias | "neutral" | "n/a" {
	const stackBias = result.timeframeStack?.bias;
	return stackBias === "mixed" ? "neutral" : (stackBias ?? result.expansionDirection ?? "n/a");
}

function pushScannerStabilitySnapshot(capturedAt: number): void {
	if (state.results.size === 0) {
		return;
	}

	const rows = new Map<string, ScannerStabilityRow>();
	for (const [symbol, result] of state.results.entries()) {
		rows.set(symbol, {
			symbol,
			signal: toStabilitySignal(result.breakoutSignal),
			score: toStabilityScore(result),
			bias: toStabilityBias(result),
			isDegraded: result.isDegraded === true,
		});
	}

	state.stabilityHistory.push({ capturedAt, rows });

	if (state.stabilityHistory.length > SCANNER_STABILITY_HISTORY_LIMIT) {
		state.stabilityHistory.splice(0, state.stabilityHistory.length - SCANNER_STABILITY_HISTORY_LIMIT);
	}
}

let adaptiveTuningCache: { computedAt: number; value: AdaptiveBreakoutTuning } | null = null;
let tradingViewIndicatorCache: { computedAt: number; bySymbol: Map<string, TradingViewSnapshot> } | null = null;

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

function avg(values: number[]): number {
	if (values.length === 0) return 0;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function toNumber(value: string | number | null | undefined): number {
	if (typeof value === "number") return Number.isFinite(value) ? value : 0;
	const parsed = Number.parseFloat(value ?? "0");
	return Number.isFinite(parsed) ? parsed : 0;
}

type ScannerSpotQuote = {
	symbol: string;
	spot: number;
	prevClose: number;
	marketState: string;
	timestamp: string;
	source: "finnhub" | "yahoo";
};

export function roundTo(value: number, decimals: number): number {
	const factor = Math.pow(10, Math.max(0, decimals));
	return Math.round(value * factor) / factor;
}

function getOhlcTimeMs(candle: OHLC | undefined): number | null {
	if (!candle) return null;
	const raw = Number.isFinite(candle.timeMs as number)
		? Number(candle.timeMs)
		: Number.isFinite(candle.time as number)
			? Number(candle.time)
			: Number.NaN;
	if (!Number.isFinite(raw) || raw <= 0) return null;
	return raw >= 1_000_000_000_000 ? raw : raw * 1000;
}

function isFlatOhlcCandle(candle: OHLC | undefined): boolean {
	if (!candle) return false;
	const open = toNumber(candle.open);
	const high = toNumber(candle.high);
	const low = toNumber(candle.low);
	const close = toNumber(candle.close);
	if (close <= 0) return false;
	const rangePct = Math.abs(high - low) / close;
	const bodyPct = Math.abs(open - close) / close;
	return rangePct <= 0.0002 && bodyPct <= 0.0001;
}

function hasBrokenOhlcTape(params: {
	lastCandle: OHLC | undefined;
	freshSpot: ScannerSpotQuote | null;
	spotMeta?: ScannerSpotMeta;
}): boolean {
	const { lastCandle, freshSpot, spotMeta } = params;
	if (!lastCandle || !freshSpot || spotMeta?.isFresh !== true) return false;

	const close = toNumber(lastCandle.close);
	if (close <= 0) return false;

	const spot = toNumber(freshSpot.spot);
	if (spot <= 0) return false;

	const divergencePct = Math.abs(spot - close) / close;
	if (divergencePct < SCANNER_STALE_OHLC_SPOT_DIVERGENCE_PCT) return false;

	const candleTimeMs = getOhlcTimeMs(lastCandle);
	return candleTimeMs == null || isFlatOhlcCandle(lastCandle);
}

function isExecuteLikeBreakoutSignal(signal: string | null | undefined): boolean {
	const upper = String(signal ?? "").toUpperCase();
	return upper === "BREAKOUT" || upper === "BREAKDOWN" || upper === "EXPANSION" || upper === "MOMENTUM";
}

function getStrongAlignedStackExecuteComponent(
	stack: ScannerTimeframeStack | undefined,
): ScannerTimeframeStackComponent | null {
	if (!stack) return null;
	if (stack.bias !== "bullish" && stack.bias !== "bearish") return null;
	if ((stack.agreement ?? 0) < 75) return null;

	const candidates = (stack.components ?? [])
		.filter((component) => {
			return (
				component.timeframe !== stack.primary &&
				component.direction === stack.bias &&
				isExecuteLikeBreakoutSignal(component.breakoutSignal) &&
				(
					(component.breakoutScore ?? 0) >= 45 ||
					Math.abs(component.momentumStrength ?? 0) >= 40
				)
			);
		})
		.sort((left, right) => {
			const scoreDelta = (right.breakoutScore ?? 0) - (left.breakoutScore ?? 0);
			if (scoreDelta !== 0) return scoreDelta;
			return Math.abs(right.momentumStrength ?? 0) - Math.abs(left.momentumStrength ?? 0);
		});

	return candidates[0] ?? null;
}

function buildScannerSpotMeta(
	quote: ScannerSpotQuote | null | undefined,
	nowMs: number = Date.now(),
): ScannerSpotMeta | undefined {
	if (!quote) return undefined;

	const quoteTimeMs = Date.parse(String(quote.timestamp ?? ""));
	const quoteAgeMs = Number.isFinite(quoteTimeMs)
		? Math.max(0, nowMs - quoteTimeMs)
		: undefined;

	return {
		timestamp: quote.timestamp,
		quoteAgeMs,
		source: quote.source,
		marketState: quote.marketState,
		isFresh: quoteAgeMs != null && quoteAgeMs <= SCANNER_LIVE_SPOT_MAX_AGE_MS,
	};
}

function getFreshScannerSpot(
	quote: ScannerSpotQuote | null | undefined,
	nowMs: number = Date.now(),
): { quote: ScannerSpotQuote | null; meta?: ScannerSpotMeta } {
	const meta = buildScannerSpotMeta(quote, nowMs);
	return {
		quote: meta?.isFresh ? (quote ?? null) : null,
		meta,
	};
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

function timeframeToMs(timeframe: string): number | null {
	switch (String(timeframe ?? "").toLowerCase()) {
		case "1m":
			return 60_000;
		case "5m":
			return 5 * 60_000;
		case "15m":
			return 15 * 60_000;
		case "30m":
			return 30 * 60_000;
		case "1h":
			return 60 * 60_000;
		case "2h":
			return 2 * 60 * 60_000;
		case "4h":
			return 4 * 60 * 60_000;
		case "1d":
			return 24 * 60 * 60_000;
		default:
			return null;
	}
}

function getCandleTimestampMs(candle: OHLC | undefined): number | null {
	if (!candle) return null;
	const timeMs = Number(candle.timeMs);
	if (Number.isFinite(timeMs) && timeMs > 0) return timeMs;

	const timeRaw = Number(candle.time);
	if (!Number.isFinite(timeRaw) || timeRaw <= 0) return null;

	return timeRaw > 10_000_000_000 ? timeRaw : timeRaw * 1000;
}

function getStableClosedCandles(candles: OHLC[], timeframe: string, nowMs: number = Date.now()): OHLC[] {
	if (candles.length < 3) return candles;

	const tfMs = timeframeToMs(timeframe);
	if (!tfMs) return candles;

	const lastMs = getCandleTimestampMs(candles[candles.length - 1]);
	if (!Number.isFinite(lastMs)) return candles;

	const isClosed = nowMs >= ((lastMs as number) + tfMs - 2_000);
	return isClosed ? candles : candles.slice(0, -1);
}

function getLastCandleDirection(candles: OHLC[]): DirectionalBias | "neutral" {
	const last = candles[candles.length - 1];
	if (!last) return "neutral";

	const open = Number(last.open);
	const close = Number(last.close);
	if (!Number.isFinite(open) || !Number.isFinite(close)) return "neutral";

	if (close > open) return "bullish";
	if (close < open) return "bearish";
	return "neutral";
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

function blendScannerMomentumStrength(params: {
	primaryMomentum: number;
	microMomentum?: number | null;
	microBreakoutSignal?: BreakoutSignal;
	microBreakoutScore?: number;
	priceChangePercent: number;
}): number {
	const primaryMomentum = clamp(toNumber(params.primaryMomentum), -100, 100);
	const microMomentumRaw = params.microMomentum;
	if (!Number.isFinite(microMomentumRaw as number)) return Math.round(primaryMomentum);

	const microMomentum = clamp(toNumber(microMomentumRaw), -100, 100);
	const primaryDirection = primaryMomentum >= 8 ? "bullish" : primaryMomentum <= -8 ? "bearish" : "neutral";
	const microDirection = microMomentum >= 8 ? "bullish" : microMomentum <= -8 ? "bearish" : "neutral";
	if (primaryDirection === "neutral" || microDirection === "neutral" || primaryDirection === microDirection) {
		return Math.round(primaryMomentum);
	}

	const dayMovePct = toNumber(params.priceChangePercent);
	const dayDirection = dayMovePct >= 0.75 ? "bullish" : dayMovePct <= -0.75 ? "bearish" : "neutral";
	const microSignal = String(params.microBreakoutSignal ?? "").toUpperCase();
	const microBreakoutScore = clamp(toNumber(params.microBreakoutScore), 0, 100);
	const microSupportsReversal =
		Math.abs(microMomentum) >= 40 ||
		microSignal === "BREAKOUT" ||
		microSignal === "BREAKDOWN" ||
		microSignal === "EXPANSION" ||
		microSignal === "MOMENTUM" ||
		microBreakoutScore >= 40;

	if (dayDirection !== microDirection || !microSupportsReversal) {
		return Math.round(primaryMomentum);
	}

	const blended = primaryMomentum * 0.35 + microMomentum * 0.65;
	return Math.round(clamp(blended, -100, 100));
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

function computeSessionVolume(candles: OHLC[]): number {
	if (candles.length === 0) return 0;
	const sessionSlice = candles.slice(-26);
	const total = sessionSlice.reduce((sum, candle) => sum + Math.max(0, candle.volume || 0), 0);
	return Math.round(total);
}

function computeRSIFromCandles(candles: OHLC[], period: number = 14): number | null {
	if (candles.length < period + 1) return null;
	const closes = candles.map((candle) => candle.close).filter((value) => Number.isFinite(value));
	if (closes.length < period + 1) return null;

	let gains = 0;
	let losses = 0;
	for (let i = closes.length - period; i < closes.length; i++) {
		const delta = closes[i] - closes[i - 1];
		if (delta >= 0) gains += delta;
		else losses += Math.abs(delta);
	}
	const avgGain = gains / period;
	const avgLoss = losses / period;
	if (avgLoss === 0 && avgGain === 0) return 50;
	if (avgLoss === 0) return 100;
	const rs = avgGain / avgLoss;
	return clamp(100 - 100 / (1 + rs), 0, 100);
}

function computeVwapFromCandles(candles: OHLC[]): number {
	if (candles.length === 0) return 0;
	let numerator = 0;
	let denominator = 0;
	for (const candle of candles) {
		const typicalPrice = (candle.high + candle.low + candle.close) / 3;
		const volume = Math.max(0, candle.volume || 0);
		numerator += typicalPrice * volume;
		denominator += volume;
	}
	if (denominator <= 0) return candles[candles.length - 1]?.close ?? 0;
	return numerator / denominator;
}

function resolveDirectionalBias(
	breakoutSignal: BreakoutSignal,
	expansionDirection: "bullish" | "bearish" | null,
	momentumStrength: number,
): DirectionalBias | "neutral" {
	if (breakoutSignal === "BREAKOUT") return "bullish";
	if (breakoutSignal === "BREAKDOWN") return "bearish";
	if (expansionDirection) return expansionDirection;
	if (momentumStrength >= 8) return "bullish";
	if (momentumStrength <= -8) return "bearish";
	return "neutral";
}

function computeParabolicSarBias(candles: OHLC[]): SarBias {
	if (!Array.isArray(candles) || candles.length < 3) return "neutral";

	const step = 0.02;
	const maxAf = 0.2;
	let isUptrend = candles[1].close >= candles[0].close;
	let ep = isUptrend ? candles[0].high : candles[0].low;
	let sar = isUptrend ? candles[0].low : candles[0].high;
	let af = step;

	for (let i = 1; i < candles.length; i++) {
		const curr = candles[i];
		const prev = candles[Math.max(0, i - 1)];
		const prev2 = candles[Math.max(0, i - 2)];

		sar = sar + af * (ep - sar);

		if (isUptrend) {
			sar = Math.min(sar, prev.low, prev2.low);
			if (curr.low < sar) {
				isUptrend = false;
				sar = ep;
				ep = curr.low;
				af = step;
			} else {
				if (curr.high > ep) {
					ep = curr.high;
					af = Math.min(maxAf, af + step);
				}
			}
		} else {
			sar = Math.max(sar, prev.high, prev2.high);
			if (curr.high > sar) {
				isUptrend = true;
				sar = ep;
				ep = curr.high;
				af = step;
			} else {
				if (curr.low < ep) {
					ep = curr.low;
					af = Math.min(maxAf, af + step);
				}
			}
		}
	}

	const lastClose = candles[candles.length - 1]?.close;
	if (!Number.isFinite(lastClose) || !Number.isFinite(sar)) return "neutral";
	if (lastClose > sar) return "below";
	if (lastClose < sar) return "above";
	return "neutral";
}

function computeEdgeEngineSnapshot(params: {
	breakoutSignal: BreakoutSignal;
	breakoutScore?: number;
	priceChangePercent?: number;
	compression: CompressionSnapshot | undefined;
	momentumStrength: number;
	volumeSpike: number;
	timeframeStack?: ScannerTimeframeStack;
	preBreakoutSetup?: ScannerPreBreakoutSetup;
	tvRsi?: number | null;
	tvAdx?: number | null;
	tvRecommendAll?: number | null;
	tvTrendDirection?: DirectionalBias | "neutral" | null;
	rsi?: number | null;
	macdHistogram?: number | null;
	macdTrend?: DirectionalBias | "neutral" | null;
	bbPercentB?: number | null;
	bbSqueeze?: boolean | null;
	stochasticK?: number | null;
	stochasticD?: number | null;
	adx?: number | null;
	sarBias?: SarBias;
}): EdgeEngineSnapshot {
	const rsi = clamp(toNumber(params.rsi ?? params.tvRsi ?? 50), 0, 100);
	const macdHistogram = clamp(toNumber(params.macdHistogram ?? 0), -2.5, 2.5);
	const macdTrend = params.macdTrend ?? "neutral";
	const bbPercentB = clamp(toNumber(params.bbPercentB ?? 50), 0, 100);
	const bbSqueeze = Boolean(params.bbSqueeze);
	const stochasticK = clamp(toNumber(params.stochasticK ?? rsi), 0, 100);
	const stochasticD = clamp(toNumber(params.stochasticD ?? stochasticK), 0, 100);
	const adx = clamp(toNumber(params.adx ?? params.tvAdx ?? 15), 0, 100);
	const tvRsi = clamp(toNumber(params.tvRsi ?? rsi), 0, 100);
	const tvAdx = clamp(toNumber(params.tvAdx ?? adx), 0, 100);
	const tvRecommendAll = clamp(toNumber(params.tvRecommendAll ?? 0), -1, 1);
	const momentum = clamp(toNumber(params.momentumStrength ?? 0), -100, 100);
	const volumeSpike = clamp(toNumber(params.volumeSpike ?? 1), 0, 4);
	const sarBias = params.sarBias ?? "neutral";
	const breakoutScore = clamp(toNumber(params.breakoutScore ?? 0), 0, 100);
	const dayMovePct = toNumber(params.priceChangePercent ?? 0);
	const dayMoveAbsPct = Math.abs(dayMovePct);
	const setupScore = clamp(toNumber(params.preBreakoutSetup?.score ?? 0), 0, 100);
	const setupTraits = Array.isArray(params.preBreakoutSetup?.traits) ? params.preBreakoutSetup.traits.length : 0;
	const setupEtaRaw = Number(params.preBreakoutSetup?.etaMinutes);
	const setupEta = Number.isFinite(setupEtaRaw) ? setupEtaRaw : null;
	const stackBias = params.timeframeStack?.bias ?? "neutral";
	const stackAgreement = clamp(toNumber(params.timeframeStack?.agreement ?? 0), 0, 100);
	const momentumAbs = Math.abs(momentum);
	const phase = String(params.compression?.phase ?? "WAIT").toUpperCase();
	const spark = clamp(toNumber(params.compression?.sparkScore ?? 0), 0, 100);
	const bbWidth = clamp(toNumber(params.compression?.bbWidth ?? 1.2), 0, 10);
	const strongAlignedExecuteComponent = getStrongAlignedStackExecuteComponent(params.timeframeStack);
	const stackExecuteDirection = strongAlignedExecuteComponent?.direction ?? "neutral";
	const microCompressionComponent = (params.timeframeStack?.components ?? []).find((component) => {
		if (component.timeframe !== "5m") return false;
		if (component.direction !== "bullish" && component.direction !== "bearish") return false;
		return (
			component.breakoutSignal === "BUILDING" ||
			component.breakoutSignal === "SQUEEZE" ||
			component.breakoutSignal === "CONSOLIDATING" ||
			(component.breakoutScore ?? 0) >= 24 ||
			Math.abs(component.momentumStrength ?? 0) >= 8
		);
	});
	const microCompressionDirection = microCompressionComponent?.direction ?? "neutral";
	const primaryDirectionalRelease =
		(stackBias === "bullish" || stackBias === "bearish") &&
		stackAgreement >= 60 &&
		isExecuteLikeBreakoutSignal(params.breakoutSignal) &&
		momentumAbs >= 40 &&
		(
			(stackBias === "bullish" && momentum >= 24 && params.breakoutSignal !== "BREAKDOWN") ||
			(stackBias === "bearish" && momentum <= -24 && params.breakoutSignal !== "BREAKOUT")
		);
	const stackExecuteConfirmed =
		(stackExecuteDirection === "bullish" || stackExecuteDirection === "bearish") &&
		stackExecuteDirection === stackBias &&
		stackAgreement >= 75;
	const stackExecuteStrong =
		stackExecuteConfirmed &&
		(
			(strongAlignedExecuteComponent?.breakoutScore ?? 0) >= 60 ||
			Math.abs(strongAlignedExecuteComponent?.momentumStrength ?? 0) >= 55 ||
			momentumAbs >= 40
		);
	const preBreakoutSignal =
		params.breakoutSignal === "BUILDING" ||
		params.breakoutSignal === "SQUEEZE" ||
		params.breakoutSignal === "CONSOLIDATING";
	const releasedSignal =
		params.breakoutSignal === "BREAKOUT" ||
		params.breakoutSignal === "BREAKDOWN" ||
		params.breakoutSignal === "EXPANSION" ||
		params.breakoutSignal === "MOMENTUM";
	const strongTrendConflict =
		(stackBias === "bullish" && params.tvTrendDirection === "bearish") ||
		(stackBias === "bearish" && params.tvTrendDirection === "bullish");
	const strongDayMoveConflict =
		(stackBias === "bullish" && dayMovePct <= -0.45) ||
		(stackBias === "bearish" && dayMovePct >= 0.45);
	const alignedCompressionPressure =
		preBreakoutSignal &&
		(phase === "PREPARE" || phase === "READY") &&
		(stackBias === "bullish" || stackBias === "bearish") &&
		stackAgreement >= 60 &&
		microCompressionComponent != null &&
		microCompressionDirection === stackBias &&
		(spark >= 34 || setupScore >= 40 || breakoutScore >= 28) &&
		!strongTrendConflict &&
		!strongDayMoveConflict;
	const compressionAlignmentBonus = alignedCompressionPressure
		? spark >= 45 && setupScore >= 45
			? 10
			: 6
		: 0;

	let bullishVotes = 0;
	let bearishVotes = 0;

	if (macdTrend === "bullish" || macdHistogram > 0.05) bullishVotes += 1;
	if (macdTrend === "bearish" || macdHistogram < -0.05) bearishVotes += 1;
	if (rsi >= 56) bullishVotes += 1;
	if (rsi <= 44) bearishVotes += 1;
	if (stochasticK > stochasticD + 2 && stochasticK >= 52) bullishVotes += 1;
	if (stochasticK < stochasticD - 2 && stochasticK <= 48) bearishVotes += 1;
	if (bbPercentB >= 58) bullishVotes += 1;
	if (bbPercentB <= 42) bearishVotes += 1;
	if (momentum >= 18) bullishVotes += 1;
	if (momentum <= -18) bearishVotes += 1;
	if (tvRecommendAll >= 0.15) bullishVotes += 1;
	if (tvRecommendAll <= -0.15) bearishVotes += 1;
	if (params.timeframeStack?.bias === "bullish") bullishVotes += 2;
	if (params.timeframeStack?.bias === "bearish") bearishVotes += 2;
	if (params.tvTrendDirection === "bullish") bullishVotes += 1;
	if (params.tvTrendDirection === "bearish") bearishVotes += 1;
	if (sarBias === "below") bullishVotes += 1;
	if (sarBias === "above") bearishVotes += 1;

	const trendNotConfirmed = adx < 20 || tvAdx < 20;
	const bullishExhaustion = bbPercentB >= 78 && stochasticK >= 78 && rsi >= 58;
	const bearishExhaustion = bbPercentB <= 22 && stochasticK <= 22 && rsi <= 42;

	if (stackAgreement >= 58 && stackBias === "bullish") bullishVotes += 1;
	if (stackAgreement >= 58 && stackBias === "bearish") bearishVotes += 1;
	if (dayMovePct >= 0.35 && stackBias === "bullish") bullishVotes += 1;
	if (dayMovePct <= -0.35 && stackBias === "bearish") bearishVotes += 1;
	if (stackExecuteConfirmed && stackExecuteDirection === "bullish") bullishVotes += 4;
	if (stackExecuteConfirmed && stackExecuteDirection === "bearish") bearishVotes += 4;
	if (stackExecuteStrong && stackExecuteDirection === "bullish") bullishVotes += 2;
	if (stackExecuteStrong && stackExecuteDirection === "bearish") bearishVotes += 2;
	if (alignedCompressionPressure && stackBias === "bullish") bullishVotes += 4;
	if (alignedCompressionPressure && stackBias === "bearish") bearishVotes += 4;
	if (alignedCompressionPressure && spark >= 40 && stackBias === "bullish") bullishVotes += 1;
	if (alignedCompressionPressure && spark >= 40 && stackBias === "bearish") bearishVotes += 1;

	if (trendNotConfirmed && bullishExhaustion) bullishVotes = Math.max(0, bullishVotes - 1);
	if (trendNotConfirmed && bearishExhaustion) bearishVotes = Math.max(0, bearishVotes - 1);
	if (trendNotConfirmed && bullishExhaustion && tvRecommendAll <= -0.18) bearishVotes += 3;
	if (trendNotConfirmed && bearishExhaustion && tvRecommendAll >= 0.18) bullishVotes += 3;

	const voteDelta = bullishVotes - bearishVotes;
	let direction: DirectionalBias | "neutral" = voteDelta >= 2
		? "bullish"
		: voteDelta <= -2
			? "bearish"
			: "neutral";
	const weakSetup = setupScore < 70 || setupTraits < 3 || (setupEta != null && setupEta > 10);
	const strongBearContext =
		(stackAgreement >= 60 && stackBias === "bearish") ||
		params.tvTrendDirection === "bearish" ||
		tvRecommendAll <= -0.28 ||
		dayMovePct <= -0.45;
	const strongBullContext =
		(stackAgreement >= 60 && stackBias === "bullish") ||
		params.tvTrendDirection === "bullish" ||
		tvRecommendAll >= 0.28 ||
		dayMovePct >= 0.45;
	const intradayExecuteOverride =
		stackExecuteConfirmed &&
		(
			(stackExecuteDirection === "bullish" && momentum >= 24) ||
			(stackExecuteDirection === "bearish" && momentum <= -24) ||
			breakoutScore >= 42
		);
	const directionalReleaseOverride = intradayExecuteOverride || primaryDirectionalRelease;

	if (direction === "bullish" && strongBearContext && weakSetup && breakoutScore < 72 && !directionalReleaseOverride) {
		direction = "neutral";
	}
	if (direction === "bearish" && strongBullContext && weakSetup && breakoutScore < 72 && !directionalReleaseOverride) {
		direction = "neutral";
	}

	const phaseWeight = phase === "NOW"
		? 20
		: phase === "READY"
			? 16
			: phase === "PREPARE"
				? 10
				: 4;
	const compressionScore = clamp(
		spark * 0.28 +
			phaseWeight +
			(bbSqueeze || bbWidth <= 0.8 ? 12 : bbWidth <= 1.2 ? 8 : bbWidth <= 1.8 ? 4 : 1),
		0,
		35,
	);

	const trendScore = clamp((adx >= 25 ? 17 : adx >= 20 ? 13 : adx >= 15 ? 8 : 4) + (Math.abs(voteDelta) >= 4 ? 4 : 0), 0, 22);
	const momentumScore = clamp(Math.abs(momentum) * 0.2 + Math.abs(macdHistogram) * 40, 0, 20);
	const volumeScore = clamp(volumeSpike >= 1.2 ? 12 : volumeSpike >= 1.0 ? 8 : volumeSpike >= 0.85 ? 5 : 2, 0, 12);
	const consensusScore = clamp((Math.abs(voteDelta) / 10) * 11, 0, 11);
	const setupScoreContribution = clamp(
		(setupScore - 55) * 0.18 +
			Math.min(4, setupTraits * 1.25) +
			(setupEta == null ? 0 : setupEta <= 5 ? 4 : setupEta <= 10 ? 2 : -2),
		-8,
		12,
	);
	const counterTrendPenalty = directionalReleaseOverride
		? (
			direction === "bullish" && strongBearContext
				? 2
				: direction === "bearish" && strongBullContext
					? 2
					: 0
		)
		: direction === "bullish" && strongBearContext
			? weakSetup ? 10 : 5
			: direction === "bearish" && strongBullContext
				? weakSetup ? 10 : 5
				: 0;
	const exhaustionPenalty =
		direction === "bullish" && trendNotConfirmed && bullishExhaustion
			? 8
			: direction === "bearish" && trendNotConfirmed && bearishExhaustion
				? 8
				: 0;

	const edgeScore = Math.round(
		clamp(
			compressionScore +
				trendScore +
				momentumScore +
				volumeScore +
				consensusScore +
				compressionAlignmentBonus +
				setupScoreContribution -
				counterTrendPenalty -
				exhaustionPenalty,
			0,
			100,
		),
	);
	const confidence = Math.round(
		clamp(
			edgeScore +
				(direction !== "neutral" ? 5 : -8) +
				(alignedCompressionPressure ? 6 : 0) +
				(phase === "READY" || phase === "NOW" ? 4 : 0) +
				(tvAdx >= 25 ? 2 : 0) +
				Math.max(-4, Math.min(6, Math.round(setupScoreContribution * 0.6))) -
				Math.round(counterTrendPenalty * 0.6) -
				Math.round(exhaustionPenalty * 0.5),
			0,
			99,
		),
	);

	const setupEligible =
		preBreakoutSignal &&
		(phase === "PREPARE" || phase === "READY") &&
		setupScore >= 62 &&
		setupTraits >= 2 &&
		(setupEta == null || setupEta <= 10);
	const compressionSetupEligible =
		alignedCompressionPressure &&
		setupScore >= 40 &&
		(setupEta == null || setupEta <= 15);
	const strongSetupEligible =
		preBreakoutSignal &&
		(phase === "PREPARE" || phase === "READY") &&
		setupScore >= 72 &&
		setupTraits >= 3 &&
		(setupEta == null || setupEta <= 10);
	const breakoutReleased =
		(releasedSignal && breakoutScore >= 68 && Math.abs(momentum) >= 22 && volumeSpike >= 1.05) ||
		directionalReleaseOverride;
	const directionalPressure =
		direction !== "neutral" &&
		edgeScore >= (alignedCompressionPressure ? 54 : 60) &&
		(
			phase === "PREPARE" ||
			phase === "READY" ||
			phase === "NOW" ||
			momentumAbs >= 26 ||
			dayMoveAbsPct >= 0.6 ||
			stackAgreement >= 55
		);
	const elevatedDirectionalPressure =
		direction !== "neutral" &&
		edgeScore >= (alignedCompressionPressure ? 66 : 72) &&
		(
			strongSetupEligible ||
			(alignedCompressionPressure && spark >= 42 && setupScore >= 44) ||
			breakoutReleased ||
			phase === "PREPARE" ||
			phase === "READY" ||
			phase === "NOW" ||
			momentumAbs >= 34 ||
			dayMoveAbsPct >= 0.8 ||
			stackAgreement >= 58
		);

	let state: EdgeState = "STANDBY";
	if (
		direction !== "neutral" &&
		breakoutReleased &&
		edgeScore >= 82 &&
		(setupScore >= 78 || momentumAbs >= 40 || dayMoveAbsPct >= 1)
	) {
		state = "TRIGGERED";
	} else if (elevatedDirectionalPressure) {
		state = "PRIMED";
	} else if ((direction !== "neutral" && (setupEligible || compressionSetupEligible) && edgeScore >= 52) || directionalPressure) {
		state = "ARMING";
	}

	const signal: EdgeSignal = direction === "bullish"
		? "BREAK_UP"
		: direction === "bearish"
			? "BREAK_DOWN"
			: "WAIT";

	const leadMinutes = state === "TRIGGERED"
		? edgeScore >= 88
			? 3
			: 5
		: state === "PRIMED"
			? edgeScore >= 75
				? 6
				: 10
			: state === "ARMING"
				? 15
				: 25;

	const triggerProbability = Math.round(
		clamp(
			confidence *
				(state === "TRIGGERED"
					? 1
					: state === "PRIMED"
						? 0.84
						: state === "ARMING"
							? 0.58
							: 0.3),
			0,
			99,
		),
	);

	const reasons: string[] = [];
	if (setupScore >= 70) reasons.push(`Setup score ${Math.round(setupScore)}${setupEta != null ? `, ETA ${Math.round(setupEta)}m.` : "."}`);
	if (phase === "READY" || phase === "NOW") reasons.push(`Compression phase ${phase} with spark ${Math.round(spark)}.`);
	if (bbSqueeze || bbWidth <= 0.8) reasons.push(`Bollinger squeeze active (width ${roundTo(bbWidth, 2)}).`);
	if (adx >= 25) reasons.push(`Trend strength confirmed (ADX ${Math.round(adx)}).`);
	if (Math.abs(momentum) >= 30) reasons.push(`Momentum pressure elevated (${Math.round(momentum)}).`);
	if (volumeSpike >= 1.0) reasons.push(`Participation rising (volume x${roundTo(volumeSpike, 2)}).`);
	if (alignedCompressionPressure && microCompressionComponent) {
		reasons.push(
			`5m compression leg aligned ${stackBias} ` +
			`(${String(microCompressionComponent.breakoutSignal ?? "").toUpperCase()} ${Math.round(microCompressionComponent.breakoutScore ?? 0)}).`,
		);
	}
	if (tvRecommendAll <= -0.35 || tvRecommendAll >= 0.35) reasons.push(`TradingView directional pressure ${roundTo(tvRecommendAll, 2)}.`);
	if (stochasticK > stochasticD + 2 || stochasticK < stochasticD - 2) reasons.push(`Stochastic rotation K/D ${Math.round(stochasticK)}/${Math.round(stochasticD)}.`);
	if (sarBias !== "neutral") reasons.push(`SAR is ${sarBias === "below" ? "below" : "above"} price.`);
	if (intradayExecuteOverride && strongAlignedExecuteComponent) {
		reasons.push(
			`${strongAlignedExecuteComponent.timeframe} execute leg confirmed ${stackExecuteDirection} ` +
				`(${String(strongAlignedExecuteComponent.breakoutSignal ?? "").toUpperCase()} ${Math.round(strongAlignedExecuteComponent.breakoutScore ?? 0)}).`,
		);
	}
	if (primaryDirectionalRelease) reasons.push(`Primary ${String(params.breakoutSignal ?? "").toUpperCase()} release is aligned ${stackBias}.`);
	if (direction === "bullish" && strongBearContext) reasons.push("Broader context is still leaning bearish.");
	if (direction === "bearish" && strongBullContext) reasons.push("Broader context is still leaning bullish.");
	if (direction === "bullish" && trendNotConfirmed && bullishExhaustion) reasons.push("Bullish move is extended without strong trend confirmation.");
	if (direction === "bearish" && trendNotConfirmed && bearishExhaustion) reasons.push("Bearish move is extended without strong trend confirmation.");
	if (reasons.length === 0) reasons.push("Edge engine is monitoring for directional compression release.");

	return {
		signal,
		direction,
		state,
		edgeScore,
		confidence,
		leadMinutes,
		triggerProbability,
		reasons: reasons.slice(0, 5),
		indicators: {
			rsi: roundTo(rsi, 2),
			macdHistogram: roundTo(macdHistogram, 3),
			macdTrend,
			bbPercentB: roundTo(bbPercentB, 2),
			bbSqueeze,
			stochasticK: roundTo(stochasticK, 2),
			stochasticD: roundTo(stochasticD, 2),
			adx: roundTo(adx, 2),
			tvRsi: roundTo(tvRsi, 2),
			tvAdx: roundTo(tvAdx, 2),
			tvRecommendAll: roundTo(tvRecommendAll, 3),
			momentum: roundTo(momentum, 2),
			volumeSpike: roundTo(volumeSpike, 2),
			sarBias,
		},
	};
}

function buildTimeframeSignalSnapshot(candles: OHLC[]): TimeframeSignalSnapshot {
	const compression = analyzeCompression(candles);
	const momentumStrength = computeMomentumStrength(candles);
	const volumeSpike = computeVolumeSpike(candles);
	const { isNewHigh, isNewLow } = computeRangeBreaks(candles);

	let expansionDirection: "bullish" | "bearish" | null = null;
	if (momentumStrength >= 8 || isNewHigh) expansionDirection = "bullish";
	else if (momentumStrength <= -8 || isNewLow) expansionDirection = "bearish";

	const absMomentum = Math.abs(momentumStrength);
	const strongDirectionalMomentum = expansionDirection != null && absMomentum >= 36;
	let breakoutSignal: BreakoutSignal = "CONSOLIDATING";
	if ((isNewHigh || isNewLow) && volumeSpike >= 1.05 && absMomentum >= 14) {
		breakoutSignal = isNewHigh ? "BREAKOUT" : "BREAKDOWN";
	} else if ((compression.phase === "READY" || compression.phase === "NOW") && absMomentum >= 20 && volumeSpike >= 1.0) {
		breakoutSignal = "EXPANSION";
	} else if (strongDirectionalMomentum) {
		breakoutSignal = "MOMENTUM";
	} else if (absMomentum >= 26 && volumeSpike >= 1.05) {
		breakoutSignal = "MOMENTUM";
	} else if (compression.phase === "PREPARE" || compression.phase === "READY") {
		breakoutSignal = "BUILDING";
	} else if (compression.phase === "NOW" && absMomentum < 22) {
		breakoutSignal = "SQUEEZE";
	}

	const breakoutScore = Math.round(
		clamp(
			compression.sparkScore * 0.5 +
				Math.min(34, absMomentum * 0.55) +
				Math.max(0, (volumeSpike - 0.95) * 24) +
				(isNewHigh || isNewLow ? 8 : 0),
			0,
			100,
		),
	);

	return {
		breakoutSignal,
		breakoutScore,
		momentumStrength,
		volumeSpike,
		expansionDirection,
		compression,
	};
}

function buildTimeframeStack(
	primary: TimeframeStackInput,
	micro: TimeframeStackInput | null,
): ScannerTimeframeStack {
	const inputs = [primary, micro].filter((entry): entry is TimeframeStackInput => Boolean(entry));
	const totalWeight = Math.max(0.0001, inputs.reduce((sum, entry) => sum + entry.weight, 0));
	const components: ScannerTimeframeStackComponent[] = inputs.map((entry) => {
		const resolvedDirection = resolveDirectionalBias(entry.breakoutSignal, entry.expansionDirection, entry.momentumStrength);
		const candleDirection = entry.candleDirection && entry.candleDirection !== "neutral"
			? entry.candleDirection
			: null;
		const strongResolvedDirection =
			resolvedDirection !== "neutral" &&
			(
				Math.abs(entry.momentumStrength) >= 10 ||
				entry.breakoutSignal === "BREAKOUT" ||
				entry.breakoutSignal === "BREAKDOWN" ||
				entry.breakoutSignal === "EXPANSION" ||
				entry.breakoutSignal === "MOMENTUM" ||
				entry.breakoutScore >= 24
			);
		const direction = candleDirection == null
			? resolvedDirection
			: resolvedDirection === "neutral" || resolvedDirection === candleDirection
				? candleDirection
				: strongResolvedDirection
					? resolvedDirection
					: "neutral";
		return {
			timeframe: entry.timeframe,
			breakoutSignal: entry.breakoutSignal,
			breakoutScore: Math.round(clamp(entry.breakoutScore, 0, 100)),
			momentumStrength: Math.round(clamp(entry.momentumStrength, -100, 100)),
			direction,
			weight: roundTo(entry.weight, 2),
		};
	});

	const weightedBull = components
		.filter((component) => component.direction === "bullish")
		.reduce((sum, component) => sum + component.weight, 0);
	const weightedBear = components
		.filter((component) => component.direction === "bearish")
		.reduce((sum, component) => sum + component.weight, 0);

	let bias: DirectionalBias | "mixed" | "neutral" = "neutral";
	if (weightedBull > 0 && weightedBear > 0) {
		const edge = Math.abs(weightedBull - weightedBear);
		if (edge >= 0.22) bias = weightedBull > weightedBear ? "bullish" : "bearish";
		else bias = "mixed";
	} else if (weightedBull > 0) {
		bias = "bullish";
	} else if (weightedBear > 0) {
		bias = "bearish";
	}

	let agreement = 50;
	if (bias === "bullish") {
		agreement = Math.round(clamp((weightedBull / totalWeight) * 100, 0, 100));
	} else if (bias === "bearish") {
		agreement = Math.round(clamp((weightedBear / totalWeight) * 100, 0, 100));
	} else if (bias === "mixed") {
		agreement = Math.round(clamp((1 - Math.abs(weightedBull - weightedBear) / totalWeight) * 100, 40, 60));
	}

	const aggregateScore = Math.round(
		clamp(
			components.reduce((sum, component) => sum + component.breakoutScore * component.weight, 0) / totalWeight,
			0,
			100,
		),
	);

	return {
		primary: primary.timeframe,
		aggregateScore,
		agreement,
		bias,
		components,
	};
}

function computePreBreakoutSetup(params: {
	primaryCandles: OHLC[];
	microCandles: OHLC[];
	breakoutSignal: BreakoutSignal;
	breakoutScore: number;
	momentumStrength: number;
	volumeSpike: number;
	expansionDirection: "bullish" | "bearish" | null;
	compression: CompressionSnapshot;
	timeframeStack: ScannerTimeframeStack;
	tvAdx?: number;
	tvRecommendAll?: number;
	tvTrendDirection?: DirectionalBias | "neutral";
}): ScannerPreBreakoutSetup | undefined {
	const {
		primaryCandles,
		microCandles,
		breakoutSignal,
		breakoutScore,
		momentumStrength,
		volumeSpike,
		expansionDirection,
		compression,
		timeframeStack,
		tvAdx,
		tvRecommendAll,
		tvTrendDirection,
	} = params;

	if (primaryCandles.length < 24) return undefined;
	const micro = microCandles.length >= 24 ? microCandles : primaryCandles;
	const last = micro[micro.length - 1];

	const direction = resolveDirectionalBias(breakoutSignal, expansionDirection, momentumStrength);
	const lookback20 = primaryCandles.slice(-20);
	const lookbackHigh = Math.max(...lookback20.map((candle) => candle.high));
	const lookbackLow = Math.min(...lookback20.map((candle) => candle.low));
	const range = Math.max(0.0001, lookbackHigh - lookbackLow);

	const directionalCloseLocation = direction === "bearish"
		? ((lookbackHigh - last.close) / range) * 100
		: ((last.close - lookbackLow) / range) * 100;

	const preRsiRaw = computeRSIFromCandles(micro) ?? computeRSIFromCandles(primaryCandles) ?? 50;
	const preRsi = roundTo(preRsiRaw, 2);
	const preMomentum3 = micro.length >= 4
		? ((last.close - micro[micro.length - 4].close) / Math.max(0.0001, micro[micro.length - 4].close)) * 100
		: 0;

	const microRecent = micro.slice(-6);
	const microWindow = micro.slice(-24, -6);
	const microHigh = Math.max(...microRecent.map((candle) => candle.high));
	const microLow = Math.min(...microRecent.map((candle) => candle.low));
	const microBaseHigh = microWindow.length > 0 ? Math.max(...microWindow.map((candle) => candle.high)) : microHigh;
	const microBaseLow = microWindow.length > 0 ? Math.min(...microWindow.map((candle) => candle.low)) : microLow;
	const preRangeCompression = (microHigh - microLow) / Math.max(0.0001, microBaseHigh - microBaseLow);

	const recentSessionSlice = primaryCandles.slice(-26);
	const sessionHigh = Math.max(...recentSessionSlice.map((candle) => candle.high));
	const sessionLow = Math.min(...recentSessionSlice.map((candle) => candle.low));
	const preNearSessionHigh = direction === "bearish"
		? last.close <= sessionLow * 1.005
		: last.close >= sessionHigh * 0.995;

	const microVwap = computeVwapFromCandles(micro);
	const preAboveVwap = last.close >= microVwap;
	const preVolumeRatio = microCandles.length > 0 ? computeVolumeSpike(microCandles) : volumeSpike;
	const compressionBbWidth = clamp(Number.parseFloat(String(compression.bbWidth ?? "0")), 0, 10);
	const normalizedTvAdx = clamp(Number.isFinite(tvAdx as number) ? Number(tvAdx) : 0, 0, 100);
	const normalizedTvRecommend = clamp(Number.isFinite(tvRecommendAll as number) ? Number(tvRecommendAll) : 0, -1, 1);
	const tvDirectionAligned =
		(direction === "bullish" && tvTrendDirection === "bullish") ||
		(direction === "bearish" && tvTrendDirection === "bearish");
	const tvDirectionConflict =
		(direction === "bullish" && tvTrendDirection === "bearish") ||
		(direction === "bearish" && tvTrendDirection === "bullish");
	const tvPressureSupport =
		(direction === "bullish" && normalizedTvRecommend >= 0.18) ||
		(direction === "bearish" && normalizedTvRecommend <= -0.18);
	const tvPressureConflict =
		(direction === "bullish" && normalizedTvRecommend <= -0.35) ||
		(direction === "bearish" && normalizedTvRecommend >= 0.35);

	const traits: string[] = [];
	let score = 0;

	if (directionalCloseLocation >= 88) {
		score += 24;
		traits.push("PRE_HIGH_CLOSE_LOCATION");
	} else if (directionalCloseLocation >= 80) {
		score += 14;
	} else if (directionalCloseLocation >= 72) {
		score += 6;
	}

	const rsiAligned = direction === "bearish" ? preRsi <= 42 : preRsi >= 58;
	if (rsiAligned) {
		score += 20;
		traits.push("PRE_RSI_ALIGN");
	} else if ((direction === "bearish" && preRsi <= 48) || (direction !== "bearish" && preRsi >= 52)) {
		score += 10;
	}

	const directionalMomentum = direction === "bearish" ? -preMomentum3 : preMomentum3;
	if (directionalMomentum >= 0.16) {
		score += 16;
		traits.push("PRE_MOMENTUM_BUILD");
	} else if (directionalMomentum >= 0.08) {
		score += 8;
	}

	if (preRangeCompression <= 0.58) {
		score += 12;
		traits.push("PRE_RANGE_COMPRESSION");
	} else if (preRangeCompression <= 0.72) {
		score += 6;
	}

	if (compressionBbWidth >= 0.75 && compressionBbWidth <= 1.15) {
		score += 10;
		traits.push("BB_SWEET_SPOT");
	} else if (compressionBbWidth > 0 && compressionBbWidth < 0.5) {
		score -= 6;
		traits.push("BB_TOO_EARLY");
	}

	if (preNearSessionHigh) {
		score += 10;
		traits.push("PRE_NEAR_SESSION_EXTREME");
	}

	if (preVolumeRatio >= 1.2) {
		score += 12;
		traits.push("PRE_VOL_PRELOAD");
	} else if (preVolumeRatio >= 1.0) {
		score += 6;
	}

	const directionalVwapAligned = direction === "bearish" ? !preAboveVwap : preAboveVwap;
	if (directionalVwapAligned) {
		score += 10;
		traits.push(direction === "bearish" ? "PRE_BELOW_VWAP" : "PRE_ABOVE_VWAP");
	}

	if (timeframeStack.agreement >= 58) {
		score += 10;
		traits.push("MTF_ALIGNMENT");
	}

	if (tvDirectionAligned) {
		score += 12;
		traits.push("TV_DIRECTION_MATCH");
	} else if (tvDirectionConflict && normalizedTvAdx >= 20) {
		score -= 12;
		traits.push("TV_DIRECTION_CONFLICT");
	}

	if (normalizedTvAdx >= 25) {
		score += 12;
		traits.push("TV_ADX_SUPPORT");
	} else if (normalizedTvAdx >= 20) {
		score += 6;
	} else if (normalizedTvAdx > 0) {
		score -= 8;
		traits.push("TV_LOW_ADX");
	}

	if (tvPressureSupport) {
		score += 8;
		traits.push("TV_PRESSURE_SUPPORT");
	} else if (tvPressureConflict) {
		score -= 10;
		traits.push("TV_PRESSURE_CONFLICT");
	}

	const sweetSpot =
		directionalCloseLocation >= 82 &&
		preRangeCompression <= 0.72 &&
		directionalMomentum >= 0.1 &&
		preVolumeRatio >= 1.0 &&
		timeframeStack.agreement >= 52;
	if (sweetSpot) {
		score += 10;
		traits.push("SWEET_SPOT_STACK");
	}

	if (breakoutScore >= 60) score += 6;
	if (compression.phase === "PREPARE" || compression.phase === "READY") score += 4;

	score = Math.round(clamp(score, 0, 100));

	let etaMinutes: number | undefined;
	const setupSignal = breakoutSignal === "BUILDING" || breakoutSignal === "SQUEEZE" || breakoutSignal === "CONSOLIDATING";
	if (
		setupSignal &&
		score >= 70 &&
		Math.abs(momentumStrength) >= 12 &&
		(preVolumeRatio >= 0.9 || normalizedTvAdx >= 25 || tvDirectionAligned) &&
		(compression.phase === "PREPARE" || compression.phase === "READY" || compression.phase === "NOW")
	) {
		etaMinutes = 5;
	} else if (setupSignal && score >= 60) {
		etaMinutes = 10;
	}

	return {
		score,
		traits,
		preVolumeRatio: roundTo(preVolumeRatio, 2),
		preRsi,
		preMomentum3: roundTo(preMomentum3, 3),
		preRangeCompression: roundTo(preRangeCompression, 3),
		preCloseLocation: roundTo(directionalCloseLocation, 2),
		preNearSessionHigh,
		preAboveVwap,
		etaMinutes,
	};
}

function computeDirectionalMovePct(
	candles: OHLC[],
	startIndex: number,
	lookaheadBars: number,
	direction: DirectionalBias,
): number {
	if (startIndex < 0 || startIndex >= candles.length) return 0;
	const entry = candles[startIndex]?.close;
	if (!Number.isFinite(entry) || (entry ?? 0) <= 0) return 0;

	const future = candles.slice(startIndex + 1, startIndex + 1 + Math.max(1, lookaheadBars));
	if (future.length === 0) return 0;

	if (direction === "bearish") {
		const minLow = Math.min(...future.map((candle) => candle.low));
		return ((entry - minLow) / entry) * 100;
	}

	const maxHigh = Math.max(...future.map((candle) => candle.high));
	return ((maxHigh - entry) / entry) * 100;
}

function buildSetupSignature(
	candles: OHLC[],
	index: number,
	direction: DirectionalBias,
): SetupSignature | null {
	if (index < 24 || index >= candles.length) return null;

	const anchor = candles[index];
	if (!anchor || !Number.isFinite(anchor.close) || anchor.close <= 0) return null;

	const window = candles.slice(index - 20, index + 1);
	if (window.length < 21) return null;

	const recent = window.slice(-6);
	const base = window.slice(0, 15);
	if (recent.length === 0 || base.length === 0) return null;

	const windowHigh = Math.max(...window.map((candle) => candle.high));
	const windowLow = Math.min(...window.map((candle) => candle.low));
	const windowRange = Math.max(0.0001, windowHigh - windowLow);

	const closeLocation = direction === "bearish"
		? ((windowHigh - anchor.close) / windowRange) * 100
		: ((anchor.close - windowLow) / windowRange) * 100;

	const rsi = computeRSIFromCandles(candles.slice(0, index + 1)) ?? 50;
	const reference = candles[index - 3];
	const momentum3 = reference
		? ((anchor.close - reference.close) / Math.max(0.0001, reference.close)) * 100
		: 0;

	const recentHigh = Math.max(...recent.map((candle) => candle.high));
	const recentLow = Math.min(...recent.map((candle) => candle.low));
	const baseHigh = Math.max(...base.map((candle) => candle.high));
	const baseLow = Math.min(...base.map((candle) => candle.low));
	const rangeCompression = (recentHigh - recentLow) / Math.max(0.0001, baseHigh - baseLow);

	const recentVolume = avg(recent.map((candle) => Math.max(0, candle.volume || 0)));
	const baseVolume = avg(base.map((candle) => Math.max(0, candle.volume || 0)));
	const volumeRatio = baseVolume > 0 ? recentVolume / baseVolume : 1;

	return {
		closeLocation: clamp(closeLocation, 0, 100),
		rsi: clamp(rsi, 0, 100),
		momentum3,
		rangeCompression: clamp(rangeCompression, 0, 3),
		volumeRatio: clamp(volumeRatio, 0, 4),
	};
}

function computeSetupSignatureSimilarity(
	current: SetupSignature,
	candidate: SetupSignature,
	direction: DirectionalBias,
): number {
	const closeLocationScore = clamp(1 - Math.abs(current.closeLocation - candidate.closeLocation) / 28, 0, 1);
	const rsiScore = clamp(1 - Math.abs(current.rsi - candidate.rsi) / 22, 0, 1);
	const rangeScore = clamp(1 - Math.abs(current.rangeCompression - candidate.rangeCompression) / 0.45, 0, 1);
	const volumeScore = clamp(1 - Math.abs(current.volumeRatio - candidate.volumeRatio) / 0.9, 0, 1);

	const directionalCurrentMomentum = direction === "bearish" ? -current.momentum3 : current.momentum3;
	const directionalCandidateMomentum = direction === "bearish" ? -candidate.momentum3 : candidate.momentum3;
	const momentumSignAligned =
		Math.sign(directionalCurrentMomentum) === Math.sign(directionalCandidateMomentum) ||
		(Math.abs(directionalCurrentMomentum) < 0.04 && Math.abs(directionalCandidateMomentum) < 0.04);
	const momentumScore = momentumSignAligned
		? clamp(1 - Math.abs(directionalCurrentMomentum - directionalCandidateMomentum) / 0.45, 0, 1)
		: 0;

	const blended =
		closeLocationScore * 0.28 +
		rsiScore * 0.22 +
		rangeScore * 0.22 +
		volumeScore * 0.16 +
		momentumScore * 0.12;

	return clamp(blended, 0, 1);
}

function detectRepeatedSetupPattern(params: {
	candles: OHLC[];
	breakoutSignal: BreakoutSignal;
	expansionDirection: "bullish" | "bearish" | null;
	momentumStrength: number;
	volumeSpike: number;
	tvSnapshot?: TradingViewSnapshot;
	tvSignalContext: TradingViewSignalContext;
}): RepeatedSetupPatternSignal | null {
	const {
		candles,
		breakoutSignal,
		expansionDirection,
		momentumStrength,
		volumeSpike,
		tvSnapshot,
		tvSignalContext,
	} = params;

	if (candles.length < 180) return null;

	const direction = resolveDirectionalBias(breakoutSignal, expansionDirection, momentumStrength);
	if (direction === "neutral") return null;

	const currentSignature = buildSetupSignature(candles, candles.length - 1, direction);
	if (!currentSignature) return null;

	const lookaheadBars = 3;
	const historyStart = 26;
	const historyEnd = candles.length - lookaheadBars - 24;
	if (historyEnd <= historyStart) return null;

	const minMovePct = 0.32;
	let sampleSize = 0;
	let wins = 0;
	let similarityTotal = 0;

	for (let index = historyStart; index <= historyEnd; index++) {
		const historical = buildSetupSignature(candles, index, direction);
		if (!historical) continue;

		const directionalMomentum = direction === "bearish" ? -historical.momentum3 : historical.momentum3;
		if (historical.rangeCompression > 0.98) continue;
		if (historical.volumeRatio < 0.65 || historical.volumeRatio > 2.4) continue;
		if (directionalMomentum < -0.12) continue;

		const similarity = computeSetupSignatureSimilarity(currentSignature, historical, direction);
		if (similarity < 0.64) continue;

		sampleSize += 1;
		similarityTotal += similarity;

		const movePct = computeDirectionalMovePct(candles, index, lookaheadBars, direction);
		if (movePct >= minMovePct) {
			wins += 1;
		}
	}

	if (sampleSize === 0) return null;

	const hitRate = wins / sampleSize;
	const avgSimilarity = similarityTotal / sampleSize;
	const tvAligned = tvSignalContext.trendAlignment === "aligned";
	const tvAdx = Number.isFinite(tvSnapshot?.adx as number) ? (tvSnapshot?.adx as number) : 0;
	const adjustedHitRate = clamp(hitRate + (tvAligned ? 0.04 : 0) + (tvAdx >= 20 ? 0.02 : 0), 0, 1);
	const sampleStrength = clamp(sampleSize / 8, 0, 1);
	const repeatStrength = clamp(
		adjustedHitRate * 100 * 0.62 + avgSimilarity * 100 * 0.24 + sampleStrength * 100 * 0.14,
		0,
		100,
	);

	const setupSignal =
		breakoutSignal === "BUILDING" ||
		breakoutSignal === "SQUEEZE" ||
		breakoutSignal === "CONSOLIDATING" ||
		breakoutSignal == null;

	const matched =
		sampleSize >= 3 &&
		adjustedHitRate >= 0.56 &&
		avgSimilarity >= 0.64 &&
		(setupSignal || Math.abs(momentumStrength) < 26);

	const scoreBoost = Math.round(
		clamp(
			(matched ? 4 : 0) +
				(repeatStrength - 55) / 8 +
				(setupSignal ? 2 : 0) +
				(volumeSpike >= 1 ? 1 : 0),
			0,
			14,
		),
	);

	const traits: string[] = [];
	if (sampleSize >= 3) traits.push("REPEAT_PATTERN_3W");
	if (matched) traits.push("REPEAT_PATTERN_MATCH");
	if (adjustedHitRate >= 0.62) traits.push("REPEAT_PATTERN_HIGH_HIT");
	if (tvAligned) traits.push("TV_REPEAT_ALIGNED");

	return {
		matched,
		sampleSize,
		hitRate: adjustedHitRate,
		avgSimilarity,
		scoreBoost,
		leadBars: lookaheadBars,
		traits,
	};
}

function buildOptionPlaysFromAnalysis(
	analysis: any,
	monster: any,
	directionHint: DirectionalBias | "neutral",
): ScannerOptionPlay[] {
	const plays: ScannerOptionPlay[] = [];
	const tactical = analysis?.tactical;
	const tradePlan = tactical?.tradePlan;
	const tradePlanRr = Array.isArray(tradePlan?.rrLadder) && tradePlan.rrLadder.length > 0
		? Number(tradePlan.rrLadder[0])
		: undefined;

	const otm = tactical?.otm;
	if (otm && typeof otm === "object") {
		const type = String(otm.type ?? "").toLowerCase();
		const direction = type === "call"
			? "CALL"
			: type === "put"
				? "PUT"
				: directionHint === "bullish"
					? "CALL"
					: directionHint === "bearish"
						? "PUT"
						: "NEUTRAL";

		const confidenceScoreRaw = Number(tradePlan?.confidencePct ?? otm.probability ?? 0);
		const score = Number.isFinite(confidenceScoreRaw)
			? Math.round(clamp(confidenceScoreRaw, 0, 100))
			: undefined;

		plays.push({
			score,
			openInterest: Number.isFinite(Number(otm.openInterest ?? otm.oi)) ? Number(otm.openInterest ?? otm.oi) : undefined,
			oi: Number.isFinite(Number(otm.oi ?? otm.openInterest)) ? Number(otm.oi ?? otm.openInterest) : undefined,
			direction,
			strike: Number.isFinite(Number(otm.strike)) ? Number(otm.strike) : undefined,
			premium: Number.isFinite(Number(otm.premium)) ? Number(otm.premium) : undefined,
			targetPrice: Number.isFinite(Number(otm.targetPrice)) ? Number(otm.targetPrice) : undefined,
			stopPrice: Number.isFinite(Number(otm.stopPrice)) ? Number(otm.stopPrice) : undefined,
			rr: Number.isFinite(Number(tradePlanRr)) ? Number(tradePlanRr) : undefined,
			riskReward: Number.isFinite(Number(tradePlanRr)) ? Number(tradePlanRr) : undefined,
			rationale: typeof otm.rationale === "string" ? otm.rationale : undefined,
		});
	}

	const monsterPlay = monster?.play;
	if (monsterPlay && typeof monsterPlay === "object") {
		const side = String(monsterPlay.side ?? "").toLowerCase();
		const direction = side === "call"
			? "CALL"
			: side === "put"
				? "PUT"
				: "NEUTRAL";
		const quality = String(monsterPlay.quality ?? "none").toUpperCase();
		const baseScore = quality === "A" ? 78 : quality === "B" ? 64 : 50;
		const monsterBoost = monsterPlay.monster ? 8 : 0;

		plays.push({
			score: Math.round(clamp(baseScore + monsterBoost, 0, 100)),
			openInterest: Number.isFinite(Number(monsterPlay.openInterest ?? monsterPlay.oi))
				? Number(monsterPlay.openInterest ?? monsterPlay.oi)
				: undefined,
			oi: Number.isFinite(Number(monsterPlay.oi ?? monsterPlay.openInterest))
				? Number(monsterPlay.oi ?? monsterPlay.openInterest)
				: undefined,
			direction,
			strike: Number.isFinite(Number(monsterPlay.strike)) ? Number(monsterPlay.strike) : undefined,
			premium: Number.isFinite(Number(monsterPlay.premium)) ? Number(monsterPlay.premium) : undefined,
			riskReward: Number.isFinite(Number(tradePlanRr)) ? Number(tradePlanRr) : undefined,
			rr: Number.isFinite(Number(tradePlanRr)) ? Number(tradePlanRr) : undefined,
			rationale: typeof monsterPlay.reason === "string" ? monsterPlay.reason : undefined,
		});
	}

	const deduped = new Map<string, ScannerOptionPlay>();
	for (const play of plays) {
		const key = `${play.direction ?? "NEUTRAL"}-${play.strike ?? "na"}`;
		const existing = deduped.get(key);
		if (!existing || (play.score ?? 0) > (existing.score ?? 0)) {
			deduped.set(key, play);
		}
	}

	const sortedPlays = Array.from(deduped.values())
		.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

	if (directionHint === "bullish" || directionHint === "bearish") {
		const expectedDirection = directionHint === "bullish" ? "CALL" : "PUT";
		const alignedPlays = sortedPlays.filter((play) => play.direction === expectedDirection);
		if (alignedPlays.length > 0) {
			return alignedPlays.slice(0, 3);
		}
		return [];
	}

	return sortedPlays.slice(0, 3);
}

function getOptionOpenInterest(play: ScannerOptionPlay | undefined): number | undefined {
	if (!play) return undefined;
	const raw = toNumber(play.openInterest ?? play.oi);
	return Number.isFinite(raw) && raw > 0 ? raw : undefined;
}

function getOptionRiskRewardPercent(play: ScannerOptionPlay | undefined): number | undefined {
	if (!play) return undefined;
	const raw = toNumber(play.riskReward ?? play.rr);
	if (!Number.isFinite(raw) || raw <= 0) return undefined;
	return raw <= 20 ? raw * 100 : raw;
}

function getBestOptionPlay(
	plays: ScannerOptionPlay[] | undefined,
	expectedDirection: "CALL" | "PUT" | null,
): ScannerOptionPlay | undefined {
	if (!Array.isArray(plays) || plays.length === 0) return undefined;

	const ranked = [...plays].sort((a, b) => {
		const scoreGap = toNumber(b.score) - toNumber(a.score);
		if (scoreGap !== 0) return scoreGap;
		return toNumber(b.riskReward ?? b.rr) - toNumber(a.riskReward ?? a.rr);
	});

	if (!expectedDirection) return ranked[0];
	return ranked.find((play) => play.direction === expectedDirection) ?? ranked[0];
}

function computeOptionsReadiness(params: {
	breakoutScore?: number;
	momentumStrength?: number;
	preBreakoutSetup?: ScannerPreBreakoutSetup;
	edgeEngine?: EdgeEngineSnapshot;
	timeframeStack?: ScannerTimeframeStack;
	signalQuality?: ScannerResult["signalQuality"];
	optionPlays?: ScannerOptionPlay[];
	expectedDirection: "CALL" | "PUT" | null;
}): BreakoutOptionsReadinessSnapshot | undefined {
	const breakoutScore = clamp(toNumber(params.breakoutScore), 0, 100);
	const momentumScore = clamp(Math.abs(toNumber(params.momentumStrength)), 0, 100);
	const setupScore = clamp(toNumber(params.preBreakoutSetup?.score), 0, 100);
	const confidenceScore = clamp(toNumber(params.edgeEngine?.confidence), 0, 100);
	const triggerScore = clamp(toNumber(params.edgeEngine?.triggerProbability), 0, 100);
	const stackScore = clamp(toNumber(params.timeframeStack?.aggregateScore), 0, 100);
	const qualityBonus = params.signalQuality === "HIGH"
		? 6
		: params.signalQuality === "MEDIUM"
			? 2
			: params.signalQuality === "LOW"
				? -6
				: params.signalQuality === "UNRELIABLE"
					? -12
					: 0;

	const moveScore = clamp(
		breakoutScore * 0.34 +
			momentumScore * 0.22 +
			setupScore * 0.18 +
			triggerScore * 0.12 +
			confidenceScore * 0.08 +
			stackScore * 0.06 +
			qualityBonus,
		0,
		100,
	);

	const bestPlay = getBestOptionPlay(params.optionPlays, params.expectedDirection);
	const optionScore = clamp(toNumber(bestPlay?.score), 0, 100);
	const optionOpenInterest = getOptionOpenInterest(bestPlay);
	const riskRewardPercent = getOptionRiskRewardPercent(bestPlay);
	const oiScore = optionOpenInterest == null
		? 28
		: clamp((Math.log10(optionOpenInterest + 1) / 3) * 100, 0, 100);
	const rrScore = riskRewardPercent == null
		? 35
		: clamp((riskRewardPercent / 250) * 100, 0, 100);
	const alignedDirection = params.expectedDirection == null || !bestPlay
		? undefined
		: bestPlay.direction === params.expectedDirection;
	const alignmentScore = params.expectedDirection == null
		? 50
		: alignedDirection === true
			? 100
			: bestPlay
				? 15
				: 35;

	const chainScore = clamp(
		bestPlay
			? optionScore * 0.55 + oiScore * 0.2 + rrScore * 0.15 + alignmentScore * 0.1
			: params.expectedDirection
				? 28
				: 18,
		0,
		100,
	);

	const score = clamp(
		moveScore * (bestPlay ? 0.6 : 0.72) + chainScore * (bestPlay ? 0.4 : 0.28),
		0,
		100,
	);

	return {
		score: roundTo(score, 1),
		moveScore: roundTo(moveScore, 1),
		chainScore: roundTo(chainScore, 1),
		optionScore: bestPlay ? roundTo(optionScore, 1) : undefined,
		optionOpenInterest,
		riskRewardPercent: riskRewardPercent != null ? roundTo(riskRewardPercent, 1) : undefined,
		hasOptionData: Boolean(bestPlay),
		expectedDirection: params.expectedDirection,
		alignedDirection,
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
		const directionalSignals: TunableSignal[] = ["BREAKOUT", "BREAKDOWN", "EXPANSION", "MOMENTUM"];
		const directionalSignalSlices = directionalSignals
			.map((signal) => summary.bySignal?.[signal])
			.filter((slice): slice is NonNullable<typeof summary.bySignal[string]> => Boolean(slice));
		const overallWins = directionalSignalSlices.reduce((sum, slice) => sum + (slice.wins ?? 0), 0);
		const overallLosses = directionalSignalSlices.reduce((sum, slice) => sum + (slice.losses ?? 0), 0);
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
			"EXPANSION",
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
			const signal = String(row.signal ?? "").toUpperCase();
			if (!directionalSignals.includes(signal as TunableSignal)) continue;
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
			if (decisive < 16) continue;
			const winRate = stats.wins / Math.max(1, decisive);
			if (winRate <= 0.45) hourlyScoreBias[hour] = -4;
			else if (winRate <= 0.5) hourlyScoreBias[hour] = -2;
			else if (winRate >= 0.66) hourlyScoreBias[hour] = 2;
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
		28,
		momentumSignalMin + tuning.directionalMomentumOffset[momentumDirection],
	);
	const strongDirectionalMomentum =
		expansionDirection != null &&
		Math.abs(momentumStrength) >= Math.max(36, momentumThreshold + 6) &&
		(volumeSpike >= 0.95 || Math.abs(momentumStrength) >= 45) &&
		(
			trend.trendDirection === "neutral" ||
			trend.trendDirection === expansionDirection ||
			trend.trendStrength <= 12
		);
	const momentumVolumeThreshold = clamp(
		(momentumDirection === "bullish" ? bullishVolumeMin : bearishVolumeMin) + 0.1,
		1.05,
		1.7,
	);
	const counterTrendUpPenalty = trend.trendDirection === "bearish" ? 0.08 : 0;
	const counterTrendDownPenalty = trend.trendDirection === "bullish" ? 0.08 : 0;
	const breakoutUpVolumeMin = clamp(bullishVolumeMin + counterTrendUpPenalty + 0.04, 1.02, 1.7);
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
	const breakoutUpWithoutVolume =
		hasBreakoutUp &&
		momentumStrength >= Math.max(18, breakoutUpMomentumMin + 8) &&
		(trend.trendDirection !== "bearish" || trend.trendStrength <= 12);
	const breakoutDownWithoutVolume =
		hasBreakoutDown &&
		momentumStrength <= Math.min(-18, breakoutDownMomentumMax - 8) &&
		(trend.trendDirection !== "bullish" || trend.trendStrength <= 12);

	let breakoutSignal: BreakoutSignal = null;
	if (wasInSqueeze && (hasBreakoutUp || hasBreakoutDown || Math.abs(momentumStrength) >= expansionMomentumThreshold)) {
		breakoutSignal = "EXPANSION";
	} else if (hasBreakoutUp && volumeSpike >= breakoutUpVolumeMin && momentumStrength >= breakoutUpMomentumMin) {
		breakoutSignal = "BREAKOUT";
	} else if (hasBreakoutDown && volumeSpike >= breakoutDownVolumeMin && momentumStrength <= breakoutDownMomentumMax) {
		breakoutSignal = "BREAKDOWN";
	} else if (breakoutUpWithoutVolume && strongDirectionalMomentum) {
		breakoutSignal = "BREAKOUT";
	} else if (breakoutDownWithoutVolume && strongDirectionalMomentum) {
		breakoutSignal = "BREAKDOWN";
	} else if (strongDirectionalMomentum) {
		breakoutSignal = "MOMENTUM";
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
	let phaseScoreBias = 0;
	if (breakoutSignal === "BREAKOUT" || breakoutSignal === "BREAKDOWN" || breakoutSignal === "EXPANSION") {
		if (compression.phase === "WAIT") phaseScoreBias += 2;
		if (compression.phase === "NOW") phaseScoreBias -= 3;
	}
	if (breakoutSignal === "MOMENTUM" && compression.phase === "NOW") {
		phaseScoreBias -= 2;
	}
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
	breakoutScore += tuning.globalScoreBias + signalBias + directionScoreBias + trendScoreBias + phaseScoreBias;
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
	compressionPhase?: CompressionPhase;
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
		compressionPhase,
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
	if (
		(breakoutSignal === "BREAKOUT" || breakoutSignal === "BREAKDOWN" || breakoutSignal === "EXPANSION") &&
		compressionPhase === "NOW" &&
		volumeSpike < 1.2 &&
		Math.abs(momentumStrength) < 32
	) {
		warnings.push("LATE_PHASE_UNCONFIRMED");
	}
	if (breakoutSignal === "MOMENTUM" && Math.abs(momentumStrength) < 32) {
		warnings.push("WEAK_MOMENTUM_SIGNAL");
	}
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
	let highMomentumMin = Math.max(
		22,
		Math.max(tuning.expansionMomentumMin - 10, (breakoutSignal ? tuning.signalMomentumFloor[breakoutSignal as TunableSignal] : 0) ?? 0),
	);
	if (breakoutSignal === "MOMENTUM") {
		highMomentumMin = Math.max(highMomentumMin, 30);
	}

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

	if (trendAlignment === "conflict") {
		if (
			breakoutSignal === "BREAKOUT" ||
			breakoutSignal === "BREAKDOWN" ||
			breakoutSignal === "EXPANSION" ||
			breakoutSignal === "MOMENTUM"
		) {
			signalQuality = demoteQuality(signalQuality, 1);
		}
		if (signalQuality === "HIGH") signalQuality = "MEDIUM";
	}
	if (warnings.includes("TV_TREND_CONFLICT")) {
		const directionalTrendConflict =
			breakoutSignal === "BREAKOUT" ||
			breakoutSignal === "BREAKDOWN" ||
			breakoutSignal === "EXPANSION" ||
			breakoutSignal === "MOMENTUM";
		signalQuality = demoteQuality(signalQuality, directionalTrendConflict && breakoutScore < highScoreMin + 12 ? 2 : 1);
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
	if (warnings.includes("LATE_PHASE_UNCONFIRMED")) {
		signalQuality = demoteQuality(signalQuality, 1);
	}
	if (warnings.includes("WEAK_MOMENTUM_SIGNAL")) {
		signalQuality = demoteQuality(signalQuality, 1);
	}
	if (
		warnings.includes("WEAK_TIME_WINDOW") &&
		(timeWindowBias ?? 0) <= -5 &&
		breakoutScore < highScoreMin + 6 &&
		(warnings.includes("TREND_CONFLICT") || warnings.includes("TV_TREND_CONFLICT") || warnings.includes("LOW_VOLUME"))
	) {
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
		const nowMs = Date.now();

		const liveSpot = await fetchLiveSpot(upperSymbol, { mode: "bulk" }).catch(() => {
			const cached = getCachedSpot(upperSymbol);
			if (cached && cached.quoteAgeMs <= 15 * 60 * 1000) return cached.data;
			const candleSpot = getLastKnownSpotFromCandles(upperSymbol);
			if (candleSpot && candleSpot.ageMs <= 15 * 60 * 1000) return candleSpot.data;
			return null;
		});
		const { quote: freshSpot, meta: spotMeta } = getFreshScannerSpot(liveSpot, nowMs);
		const live = await fetchLiveOHLC(upperSymbol, timeframe, "FULL");
		const hasOhlcData = live.data.length > 0;
		if (!hasOhlcData) {
			const snapshotClose = Number.isFinite(tvSnapshot?.close as number) && (tvSnapshot?.close as number) > 0
				? (tvSnapshot?.close as number)
				: null;
			const fallbackPrice = Number.isFinite(freshSpot?.spot as number) && (freshSpot?.spot as number) > 0
				? (freshSpot?.spot as number)
				: snapshotClose;
			if (!Number.isFinite(fallbackPrice as number) || (fallbackPrice as number) <= 0) {
				// If we have neither candles nor spot, skip this cycle for this symbol.
				return null;
			}

			const tvChangePercent = Number.isFinite(tvSnapshot?.change as number) ? (tvSnapshot?.change as number) : null;
			let prevClose = Number.isFinite(liveSpot?.prevClose as number) && (liveSpot?.prevClose as number) > 0
				? (liveSpot?.prevClose as number)
				: null;
			if ((!prevClose || prevClose <= 0) && tvChangePercent != null && Math.abs(tvChangePercent) < 95) {
				const denominator = 1 + tvChangePercent / 100;
				if (Math.abs(denominator) > 0.001) {
					prevClose = (fallbackPrice as number) / denominator;
				}
			}
			if (!Number.isFinite(prevClose as number) || (prevClose as number) <= 0) {
				prevClose = fallbackPrice as number;
			}
			const priceChange = (fallbackPrice as number) - (prevClose as number);
			const priceChangePercent = (prevClose as number) > 0 ? (priceChange / (prevClose as number)) * 100 : 0;

			const tvRsi = Number.isFinite(tvSnapshot?.rsi as number) ? (tvSnapshot?.rsi as number) : null;
			const tvAdx = Number.isFinite(tvSnapshot?.adx as number) ? (tvSnapshot?.adx as number) : 0;
			const tvRecommendAll = Number.isFinite(tvSnapshot?.recommendAll as number)
				? (tvSnapshot?.recommendAll as number)
				: 0;
			const normalizedTvChange = Number.isFinite(tvChangePercent as number) ? (tvChangePercent as number) : priceChangePercent;

			let momentumStrength = tvRecommendAll * 82 + normalizedTvChange * 2.4;
			if (tvRsi != null) {
				if (tvRsi >= 62) momentumStrength += 9;
				else if (tvRsi <= 38) momentumStrength -= 9;
			}
			momentumStrength = Math.round(clamp(momentumStrength, -100, 100));

			const absMomentum = Math.abs(momentumStrength);
			const fallbackVolumeSpike = 1;
			let expansionDirection: "bullish" | "bearish" | null = null;
			if (momentumStrength >= 8) expansionDirection = "bullish";
			else if (momentumStrength <= -8) expansionDirection = "bearish";

			let breakoutSignal: BreakoutSignal = "CONSOLIDATING";
			if (tvAdx >= 24 && absMomentum >= 26) {
				breakoutSignal = momentumStrength >= 0 ? "BREAKOUT" : "BREAKDOWN";
			} else if (tvAdx >= 19 && absMomentum >= 20) {
				breakoutSignal = "EXPANSION";
			} else if (absMomentum >= 16) {
				breakoutSignal = "MOMENTUM";
			} else if (tvAdx >= 15 && absMomentum >= 10) {
				breakoutSignal = "BUILDING";
			}

			const tvSignalContext = deriveTradingViewSignalContext(
				tvSnapshot,
				breakoutSignal,
				expansionDirection,
				momentumStrength,
			);

			const breakoutScore = Math.round(
				clamp(
					absMomentum * 0.72 +
						clamp(tvAdx - 12, 0, 28) * 1.7 +
						Math.abs(tvRecommendAll) * 14 +
						tvSignalContext.scoreBias,
					0,
					100,
				),
			);

			let signalQuality: "HIGH" | "MEDIUM" | "LOW" | "UNRELIABLE" = "LOW";
			if (breakoutScore >= 74 && tvAdx >= 24 && absMomentum >= 24) signalQuality = "HIGH";
			else if (breakoutScore >= 56 && absMomentum >= 16) signalQuality = "MEDIUM";
			else if (breakoutScore < 32) signalQuality = "UNRELIABLE";

			const warnings = new Set<string>([...tvSignalContext.warnings, "TV_DERIVED_NO_OHLC"]);
			if (tvAdx > 0 && tvAdx < 16) warnings.add("TV_LOW_ADX");
			if (breakoutSignal === "CONSOLIDATING") warnings.add("RANGE_BOUND");
			if (signalQuality === "UNRELIABLE") warnings.add("LOW_CONFIDENCE");

			const trendType: "bullish" | "bearish" | "neutral" = momentumStrength > 6
				? "bullish"
				: momentumStrength < -6
					? "bearish"
					: "neutral";
			const fallbackPatternName = breakoutSignal === "BREAKOUT"
				? "TV Trend Breakout"
				: breakoutSignal === "BREAKDOWN"
					? "TV Trend Breakdown"
					: breakoutSignal === "EXPANSION"
						? "TV Volatility Expansion"
						: breakoutSignal === "MOMENTUM"
							? "TV Momentum Push"
							: breakoutSignal === "BUILDING"
								? "TV Base Build"
								: "TV Trend Snapshot";
			const fallbackPattern: PatternResult = {
				name: fallbackPatternName,
				type: trendType,
				category: "structure",
				confidence: Math.round(clamp(40 + breakoutScore * 0.45, 35, 88)),
				description: "Derived from TradingView trend metrics while intraday OHLC candles are unavailable.",
				startIndex: 0,
				endIndex: 0,
			};

			const healthScore = Math.round(
				clamp(
					35 + breakoutScore * 0.55 + (tvSignalContext.trendAlignment === "aligned" ? 8 : 0),
					25,
					92,
				),
			);
			const healthGrade = healthScore >= 85
				? "A"
				: healthScore >= 70
					? "B"
					: healthScore >= 55
						? "C"
						: healthScore >= 40
							? "D"
							: "F";

			const fallbackDirection = resolveDirectionalBias(
				breakoutSignal,
				expansionDirection,
				momentumStrength,
			);
			const fallbackTimeframeStack = buildTimeframeStack(
				{
					timeframe,
					breakoutSignal,
					breakoutScore,
					momentumStrength,
					expansionDirection,
					weight: 1,
				},
				null,
			);
			const fallbackSarBias: SarBias = tvSignalContext.trendDirection === "bullish"
				? "below"
				: tvSignalContext.trendDirection === "bearish"
					? "above"
					: "neutral";
			const fallbackEdgeEngine = computeEdgeEngineSnapshot({
				breakoutSignal,
				compression: {
					sparkScore: breakoutScore,
					triggers: [],
					phase: tvAdx >= 22 ? "READY" : tvAdx >= 18 ? "PREPARE" : "WAIT",
					bbWidth: tvAdx >= 22 ? "0.80" : "1.20",
					rangePct: "0.00",
					volRatio: "1.00",
				},
				momentumStrength,
				volumeSpike: fallbackVolumeSpike,
				timeframeStack: fallbackTimeframeStack,
				tvRsi,
				tvAdx,
				tvRecommendAll,
				tvTrendDirection: tvSignalContext.trendDirection,
				rsi: tvRsi,
				macdHistogram: Number.isFinite(tvSnapshot?.macd as number) && Number.isFinite(tvSnapshot?.macdSignal as number)
					? (tvSnapshot?.macd as number) - (tvSnapshot?.macdSignal as number)
					: momentumStrength / 120,
				macdTrend: momentumStrength >= 6 ? "bullish" : momentumStrength <= -6 ? "bearish" : "neutral",
				bbPercentB: tvRsi,
				bbSqueeze: breakoutSignal === "BUILDING" || breakoutSignal === "CONSOLIDATING",
				stochasticK: tvRsi,
				stochasticD: clamp((tvRsi ?? 50) + (momentumStrength >= 0 ? -4 : 4), 0, 100),
				adx: tvAdx,
				sarBias: fallbackSarBias,
			});

			const fallbackTraits: string[] = [];
			if (tvSignalContext.trendAlignment === "aligned") fallbackTraits.push("TV_TREND_ALIGNED");
			if (tvAdx >= 22) fallbackTraits.push("TV_ADX_SUPPORT");
			if (Math.abs(momentumStrength) >= 20) fallbackTraits.push("TV_MOMENTUM_PRELOAD");
			if (breakoutSignal === "BUILDING" || breakoutSignal === "CONSOLIDATING") {
				fallbackTraits.push("STRUCTURE_COILING");
			}
			if (breakoutSignal === "EXPANSION" || breakoutSignal === "BREAKOUT" || breakoutSignal === "BREAKDOWN") {
				fallbackTraits.push("STRUCTURE_ACTIVE");
			}

			const fallbackSetupScore = Math.round(
				clamp(
					breakoutScore * 0.72 +
						(tvSignalContext.trendAlignment === "aligned" ? 10 : -4) +
						(tvAdx >= 22 ? 8 : 0) +
						(Math.abs(momentumStrength) >= 28 ? 8 : 0),
					20,
					92,
				),
			);

			const fallbackSetupSignal = breakoutSignal === "BUILDING" || breakoutSignal === "CONSOLIDATING";
			let fallbackEtaMinutes: number | undefined;
			if (fallbackSetupSignal && fallbackSetupScore >= 72 && Math.abs(momentumStrength) >= 14 && tvAdx >= 18) {
				fallbackEtaMinutes = 5;
			} else if (fallbackSetupSignal && fallbackSetupScore >= 60) {
				fallbackEtaMinutes = 10;
			}

			const fallbackPreBreakoutSetup: ScannerPreBreakoutSetup = {
				score: fallbackSetupScore,
				traits: fallbackTraits,
				preVolumeRatio: roundTo(clamp(fallbackVolumeSpike, 0, 4), 2),
				preRsi: roundTo(tvRsi ?? 50, 2),
				preMomentum3: roundTo(momentumStrength / 100, 3),
				preRangeCompression: roundTo(
					breakoutSignal === "BUILDING" ? 0.7 : breakoutSignal === "CONSOLIDATING" ? 0.56 : 0.9,
					3,
				),
				preCloseLocation: roundTo(
					clamp(50 + Math.sign(momentumStrength) * Math.min(45, Math.abs(momentumStrength) * 0.8), 5, 95),
					2,
				),
				preNearSessionHigh: fallbackDirection === "bullish"
					? momentumStrength >= 20
					: fallbackDirection === "bearish"
						? momentumStrength <= -20
						: false,
				preAboveVwap: fallbackDirection !== "bearish",
				etaMinutes: fallbackEtaMinutes,
			};

			const fallbackRiskUnit = Math.max((fallbackPrice as number) * 0.003, Math.abs(priceChange) * 0.6, 0.25);
			const fallbackEntry = roundTo(fallbackPrice as number, 2);
			const fallbackStop = fallbackDirection === "bearish"
				? roundTo(fallbackEntry + fallbackRiskUnit, 2)
				: fallbackDirection === "bullish"
					? roundTo(fallbackEntry - fallbackRiskUnit, 2)
					: undefined;
			const fallbackTargets = fallbackDirection === "bearish"
				? [roundTo(fallbackEntry - fallbackRiskUnit * 1.4, 2), roundTo(fallbackEntry - fallbackRiskUnit * 2.1, 2)]
				: fallbackDirection === "bullish"
					? [roundTo(fallbackEntry + fallbackRiskUnit * 1.4, 2), roundTo(fallbackEntry + fallbackRiskUnit * 2.1, 2)]
					: [];
			const fallbackTradePlan: ScannerTradePlan | undefined = fallbackStop
				? {
					entry: fallbackEntry,
					entryZoneLow: roundTo(fallbackEntry - fallbackRiskUnit * 0.3, 2),
					entryZoneHigh: roundTo(fallbackEntry + fallbackRiskUnit * 0.3, 2),
					stop: fallbackStop,
					targets: fallbackTargets,
					rrLadder: [1.4, 2.1],
					riskRewardLabel: "1:1.4 / 1:2.1",
					confidencePct: Math.round(clamp(fallbackSetupScore, 20, 92)),
					confidenceLabel: signalQuality,
					confidenceReasons: [
						"Fallback model is using TradingView structure because intraday candles are delayed.",
						`Signal quality ${signalQuality.toLowerCase()} with breakout score ${breakoutScore}.`,
					],
					positionSizing: "Reduce size while OHLC feed is delayed",
					timeline: fallbackEtaMinutes ? `Expected trigger window: ${fallbackEtaMinutes}m` : "Await candle feed confirmation",
				}
				: undefined;

			const fallbackOptionPlays: ScannerOptionPlay[] = fallbackDirection === "neutral"
				? []
				: [
					{
						direction: fallbackDirection === "bullish" ? "CALL" : "PUT",
						score: Math.round(clamp(fallbackSetupScore, 20, 90)),
						rr: 1.4,
						riskReward: 1.4,
						targetPrice: fallbackTargets[0],
						stopPrice: fallbackStop,
						rationale: "TV-derived directional setup while OHLC candles are unavailable.",
					},
				];
			const fallbackExpectedOptionDirection = fallbackDirection === "bullish"
				? "CALL"
				: fallbackDirection === "bearish"
					? "PUT"
					: null;
			const fallbackOptionsReadiness = computeOptionsReadiness({
				breakoutScore,
				momentumStrength,
				preBreakoutSetup: fallbackPreBreakoutSetup,
				edgeEngine: fallbackEdgeEngine,
				timeframeStack: fallbackTimeframeStack,
				signalQuality,
				optionPlays: fallbackOptionPlays,
				expectedDirection: fallbackExpectedOptionDirection,
			});

			const fallbackReasoning = [
				"Intraday OHLC feed is delayed; using TradingView-derived structure.",
				`Breakout score ${breakoutScore} with ${signalQuality.toLowerCase()} confidence.`,
				...(fallbackEtaMinutes ? [`Setup ETA estimated around ${fallbackEtaMinutes} minutes.`] : []),
			];

			return {
				symbol: upperSymbol,
				patterns: [fallbackPattern],
				lastPrice: fallbackPrice as number,
				priceChange,
				priceChangePercent,
				spotMeta,
				volume: 0,
				scanTime: Date.now(),
				healthScore,
				healthGrade,
				hasMonsterPlay: false,
				volumeSpike: fallbackVolumeSpike,
				breakoutScore,
				isNewHigh: false,
				isNewLow: false,
				momentumStrength,
				rsiValue: tvRsi ?? 50,
				breakoutSignal,
				wasInSqueeze: false,
				squeezeCandles: 0,
				expansionDirection,
				warnings: Array.from(warnings),
				signalQuality,
				compression: {
					sparkScore: 0,
					triggers: [],
					phase: "WAIT",
					bbWidth: "0.00",
					rangePct: "0.00",
					volRatio: "0.00",
				},
				tvRsi: tvRsi ?? undefined,
				tvAdx: tvAdx || undefined,
				tvRecommendAll: tvRecommendAll || undefined,
				tvTrendDirection: tvSignalContext.trendDirection,
				tvTrendStrength: tvSignalContext.trendStrength,
				timeframeStack: fallbackTimeframeStack,
				preBreakoutSetup: fallbackPreBreakoutSetup,
				optionPlays: fallbackOptionPlays,
				optionsReadiness: fallbackOptionsReadiness,
				tradePlan: fallbackTradePlan,
				edgeEngine: fallbackEdgeEngine,
				setupReasoning: fallbackReasoning,
				isDegraded: true,
				degradedReason: "TV_DERIVED_NO_OHLC",
			};
		}

		const ohlc = live.data;

		if (!ohlc.length) return null;

		const sessionSplit = {
			rth: live.rth,
			overnight: live.overnight,
			prevDayRth: live.prevDayRth,
		};

		const analysis = analyzeSymbol(
			upperSymbol,
			ohlc,
			{ maxAbsGammaStrike: null },
			sessionSplit,
			freshSpot?.spot
		);

		const sortedPatterns = detectAllPatterns(ohlc, timeframe)
			.sort((a, b) => b.confidence - a.confidence)
			.slice(0, 8);
		const closedCandles = getStableClosedCandles(ohlc, timeframe);
		const failedUpsideBreakout = closedCandles.length >= 25
			? detectAllPatterns(closedCandles, timeframe).find((pattern) =>
				pattern.name === "Bearish Breakout Failure Reversal" && pattern.type === "bearish",
			)
			: undefined;

		const lastCandle = ohlc[ohlc.length - 1];
		const prevCandle = ohlc[ohlc.length - 2] ?? lastCandle;
		const lastPrice = freshSpot?.spot ?? lastCandle.close;
		const prevClose = liveSpot?.prevClose ?? prevCandle.close;
		const priceChange = lastPrice - prevClose;
		const priceChangePercent = prevClose > 0 ? (priceChange / prevClose) * 100 : 0;
		const brokenOhlcTape = hasBrokenOhlcTape({ lastCandle, freshSpot, spotMeta });

		let microCandles: OHLC[] = [];
		try {
			if (brokenOhlcTape) {
				microCandles = [];
			} else if (timeframe === "5m") {
				microCandles = ohlc;
			} else {
				const micro = await fetchLiveOHLC(upperSymbol, "5m", "FULL");
				if (micro.data.length > 0) microCandles = micro.data;
			}
		} catch {
			microCandles = [];
		}

		const compression = analyzeCompression(ohlc);
		const baseMomentumStrength = brokenOhlcTape ? 0 : computeMomentumStrength(ohlc);
		const volumeSpike = brokenOhlcTape ? 1 : computeVolumeSpike(ohlc);
		const { isNewHigh, isNewLow } = brokenOhlcTape ? { isNewHigh: false, isNewLow: false } : computeRangeBreaks(ohlc);
		const trendContext = computeTrendContext(ohlc);
		const adaptiveTuning = getAdaptiveBreakoutTuning();
		const stableMicroCandles = getStableClosedCandles(microCandles, "5m");
		const microStackCandles = stableMicroCandles.length >= 24 ? stableMicroCandles : microCandles;
		const microSnapshot = microStackCandles.length >= 24 ? buildTimeframeSignalSnapshot(microStackCandles) : null;
		let momentumStrength = blendScannerMomentumStrength({
			primaryMomentum: baseMomentumStrength,
			microMomentum: microSnapshot?.momentumStrength,
			microBreakoutSignal: microSnapshot?.breakoutSignal,
			microBreakoutScore: microSnapshot?.breakoutScore,
			priceChangePercent,
		});
		if (brokenOhlcTape) {
			momentumStrength = 0;
		}

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
		if (brokenOhlcTape) {
			breakoutState.breakoutSignal = "CONSOLIDATING";
			breakoutState.breakoutScore = Math.min(breakoutState.breakoutScore, 12);
			breakoutState.expansionDirection = null;
		}
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
		let breakoutScoreForResult = Math.round(
			clamp(breakoutState.breakoutScore + tvSignalContext.scoreBias + timeWindowBias, 0, 100),
		);
		let breakoutSignalForResult = breakoutState.breakoutSignal;
		if (failedUpsideBreakout && !brokenOhlcTape) {
			breakoutSignalForResult = "BREAKDOWN";
			breakoutState.expansionDirection = "bearish";
			breakoutScoreForResult = Math.max(breakoutScoreForResult, failedUpsideBreakout.confidence);
		}

		const repeatedPatternSignal = detectRepeatedSetupPattern({
			candles: ohlc,
			breakoutSignal: breakoutSignalForResult,
			expansionDirection: breakoutState.expansionDirection,
			momentumStrength,
			volumeSpike,
			tvSnapshot,
			tvSignalContext,
		});

		const setupSignalLike =
			breakoutSignalForResult === "BUILDING" ||
			breakoutSignalForResult === "SQUEEZE" ||
			breakoutSignalForResult === "CONSOLIDATING" ||
			breakoutSignalForResult == null;

		if (repeatedPatternSignal?.sampleSize != null && repeatedPatternSignal.sampleSize >= 3) {
			breakoutScoreForResult = Math.round(
				clamp(breakoutScoreForResult + repeatedPatternSignal.scoreBoost, 0, 100),
			);

			if (
				repeatedPatternSignal.matched &&
				setupSignalLike &&
				breakoutScoreForResult >= 56 &&
				Math.abs(momentumStrength) >= 10
			) {
				breakoutSignalForResult = "BUILDING";
			}
		}

		const now = new Date();
		const nowMinutes = now.getHours() * 60 + now.getMinutes();
		const rawMonster = runMonsterOTMEngine(
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
			sessionSplit,
			lastPrice
		);

		const rawMonsterDirection: "bullish" | "bearish" | null =
			rawMonster.hasPlay && rawMonster.play
				? rawMonster.play.side === "call"
					? "bullish"
					: "bearish"
				: null;
		const prevMonsterConfirm = state.monsterConfirmState.get(upperSymbol) ?? { streak: 0, direction: null };
		const monsterStreak =
			rawMonsterDirection && rawMonsterDirection === prevMonsterConfirm.direction
				? prevMonsterConfirm.streak + 1
				: rawMonsterDirection
					? 1
					: 0;
		state.monsterConfirmState.set(upperSymbol, { streak: monsterStreak, direction: rawMonsterDirection });
		const monsterConfirmed = Boolean(rawMonsterDirection) && monsterStreak >= MONSTER_PLAY_CONFIRMATION_SCANS;
		const monster: MonsterOTMEngineOutput = monsterConfirmed
			? rawMonster
			: {
				...rawMonster,
				hasPlay: false,
				play: null,
				breakout: rawMonster.breakout
					? { ...rawMonster.breakout, triggered: false, alert: undefined }
					: rawMonster.breakout,
			};

		const warningPayload = computeWarningsAndQuality({
			volumeSpike,
			momentumStrength,
			breakoutSignal: breakoutSignalForResult,
			compressionPhase: compression.phase,
			isNewHigh,
			isNewLow,
			breakoutScore: breakoutScoreForResult,
			cmfContribution: analysis.marketHealth?.cmf?.contribution ?? 0,
			tuning: adaptiveTuning,
			trendAlignment: breakoutState.trendAlignment,
			additionalWarnings: [...tvSignalContext.warnings, ...timeWindowWarnings],
			timeWindowBias,
		});
		const warnings = [...warningPayload.warnings];
		if (failedUpsideBreakout) {
			warnings.push("FAILED_UPSIDE_BREAKOUT", "POTENTIAL_PUT_PLAY");
		}
		let signalQuality = warningPayload.signalQuality;
		if (brokenOhlcTape) {
			if (!warnings.includes("STALE_OHLC_SPOT_DIVERGENCE")) {
				warnings.push("STALE_OHLC_SPOT_DIVERGENCE");
			}
			signalQuality = "UNRELIABLE";
			breakoutSignalForResult = "CONSOLIDATING";
			breakoutScoreForResult = Math.min(breakoutScoreForResult, 12);
		}

		const stablePrimaryCandles = getStableClosedCandles(ohlc, timeframe);
		const primaryStackCandles = stablePrimaryCandles.length > 0 ? stablePrimaryCandles : ohlc;
		const primaryCandleDirection = brokenOhlcTape ? "neutral" : getLastCandleDirection(primaryStackCandles);
		const microCandleDirection = brokenOhlcTape ? "neutral" : getLastCandleDirection(microStackCandles);

		const primaryStackInput: TimeframeStackInput = {
			timeframe,
			breakoutSignal: breakoutSignalForResult,
			breakoutScore: breakoutScoreForResult,
			momentumStrength,
			expansionDirection: breakoutState.expansionDirection,
			candleDirection: primaryCandleDirection,
			weight: 0.64,
		};
		const microStackInput: TimeframeStackInput | null = !brokenOhlcTape && microSnapshot
			? {
				timeframe: "5m",
				breakoutSignal: microSnapshot.breakoutSignal,
				breakoutScore: microSnapshot.breakoutScore,
				momentumStrength: microSnapshot.momentumStrength,
				expansionDirection: microSnapshot.expansionDirection,
				candleDirection: microCandleDirection,
				weight: 0.36,
			}
			: null;
		const timeframeStack = buildTimeframeStack(primaryStackInput, microStackInput);
		const liveSarBias = computeParabolicSarBias(primaryStackCandles);

		let preBreakoutSetup = brokenOhlcTape ? undefined : computePreBreakoutSetup({
			primaryCandles: ohlc,
			microCandles,
			breakoutSignal: breakoutSignalForResult,
			breakoutScore: breakoutScoreForResult,
			momentumStrength,
			volumeSpike,
			expansionDirection: breakoutState.expansionDirection,
			compression,
			timeframeStack,
				tvAdx: tvSnapshot?.adx ?? undefined,
				tvRecommendAll: tvSnapshot?.recommendAll ?? undefined,
			tvTrendDirection: tvSignalContext.trendDirection,
		});

		if (preBreakoutSetup && repeatedPatternSignal?.sampleSize != null && repeatedPatternSignal.sampleSize >= 3) {
			const mergedTraits = Array.from(new Set([
				...preBreakoutSetup.traits,
				...repeatedPatternSignal.traits,
			]));

			const repeatEtaMinutes =
				repeatedPatternSignal.matched && breakoutSignalForResult === "BUILDING"
					? preBreakoutSetup.score >= 78
						? 5
						: preBreakoutSetup.score >= 68
							? 10
							: undefined
					: undefined;

			preBreakoutSetup = {
				...preBreakoutSetup,
				score: Math.round(clamp(preBreakoutSetup.score + repeatedPatternSignal.scoreBoost, 0, 100)),
				traits: mergedTraits,
				etaMinutes: preBreakoutSetup.etaMinutes ?? repeatEtaMinutes,
			};
		}

		if (repeatedPatternSignal?.matched && !warnings.includes("REPEAT_SETUP_PATTERN")) {
			warnings.push("REPEAT_SETUP_PATTERN");
		}

		if (
			preBreakoutSetup?.etaMinutes != null &&
			preBreakoutSetup.etaMinutes <= 5 &&
			(breakoutSignalForResult === "BUILDING" ||
				breakoutSignalForResult === "SQUEEZE" ||
				breakoutSignalForResult === "CONSOLIDATING") &&
			!warnings.includes("PRE_BREAKOUT_IMMINENT")
		) {
			warnings.push("PRE_BREAKOUT_IMMINENT");
		}

		const edgeEngine = computeEdgeEngineSnapshot({
			breakoutSignal: breakoutSignalForResult,
			breakoutScore: breakoutScoreForResult,
			priceChangePercent,
			compression,
			momentumStrength,
			volumeSpike,
			timeframeStack,
			preBreakoutSetup,
			tvRsi: tvSnapshot?.rsi,
			tvAdx: tvSnapshot?.adx,
			tvRecommendAll: tvSnapshot?.recommendAll,
			tvTrendDirection: tvSignalContext.trendDirection,
			rsi: analysis.marketHealth?.rsi?.value,
			macdHistogram: analysis.marketHealth?.macd?.histogram,
			macdTrend: analysis.marketHealth?.macd?.trend,
			bbPercentB: analysis.marketHealth?.bollingerBands?.percentB,
			bbSqueeze: analysis.marketHealth?.bollingerBands?.squeeze,
			stochasticK: analysis.marketHealth?.stochastic?.k,
			stochasticD: analysis.marketHealth?.stochastic?.d,
			adx: analysis.marketHealth?.adx?.value,
			sarBias: liveSarBias,
		});
		const safeEdgeEngine = brokenOhlcTape
			? {
				signal: "WAIT" as EdgeSignal,
				direction: "neutral" as DirectionalBias | "neutral",
				state: "STANDBY" as EdgeState,
				edgeScore: 0,
				confidence: 0,
				leadMinutes: 25,
				triggerProbability: 0,
				reasons: ["Directional tape invalid: fresh spot diverges from stale OHLC candles."],
				indicators: {
					rsi: roundTo(analysis.marketHealth?.rsi?.value ?? 50, 2),
					macdHistogram: roundTo(analysis.marketHealth?.macd?.histogram ?? 0, 3),
					macdTrend: analysis.marketHealth?.macd?.trend ?? "neutral",
					bbPercentB: roundTo(analysis.marketHealth?.bollingerBands?.percentB ?? 50, 2),
					bbSqueeze: Boolean(analysis.marketHealth?.bollingerBands?.squeeze),
					stochasticK: roundTo(analysis.marketHealth?.stochastic?.k ?? 50, 2),
					stochasticD: roundTo(analysis.marketHealth?.stochastic?.d ?? 50, 2),
					adx: roundTo(analysis.marketHealth?.adx?.value ?? 0, 2),
					tvRsi: roundTo(tvSnapshot?.rsi ?? analysis.marketHealth?.rsi?.value ?? 50, 2),
					tvAdx: roundTo(tvSnapshot?.adx ?? analysis.marketHealth?.adx?.value ?? 0, 2),
					tvRecommendAll: roundTo(tvSnapshot?.recommendAll ?? 0, 3),
					momentum: 0,
					volumeSpike: roundTo(volumeSpike, 2),
					sarBias: liveSarBias,
				},
			}
			: edgeEngine;

		const optionDirectionHint = safeEdgeEngine.direction !== "neutral"
			? safeEdgeEngine.direction
			: resolveDirectionalBias(
				breakoutSignalForResult,
				breakoutState.expansionDirection,
				momentumStrength,
			);

		const optionPlays = buildOptionPlaysFromAnalysis(
			analysis,
			monster,
			optionDirectionHint,
		);
		const expectedOptionDirection = optionDirectionHint === "bullish"
			? "CALL"
			: optionDirectionHint === "bearish"
				? "PUT"
				: null;
		const optionsReadiness = computeOptionsReadiness({
			breakoutScore: breakoutScoreForResult,
			momentumStrength,
			preBreakoutSetup,
			edgeEngine: safeEdgeEngine,
			timeframeStack,
			signalQuality,
			optionPlays,
			expectedDirection: expectedOptionDirection,
		});
		const tradePlan = analysis?.tactical?.tradePlan as ScannerTradePlan | undefined;
		const baseSetupReasoning = Array.isArray(tradePlan?.confidenceReasons)
			? tradePlan.confidenceReasons
			: Array.isArray(analysis?.tactical?.notes)
				? analysis.tactical.notes
				: [];
		const repeatReasoning = repeatedPatternSignal?.sampleSize != null && repeatedPatternSignal.sampleSize >= 3
			? [
				`3W repeat setup ${Math.round(repeatedPatternSignal.hitRate * 100)}% (${repeatedPatternSignal.sampleSize} analogs, ${repeatedPatternSignal.leadBars}-bar lead${tvSignalContext.trendAlignment === "aligned" ? ", TV aligned" : ""}).`,
			]
			: [];
		const setupReasoning = [...repeatReasoning, ...baseSetupReasoning].slice(0, 4);
		const dailyVolume = computeSessionVolume(ohlc);

		const result: ScannerResult = {
			symbol: upperSymbol,
			patterns: sortedPatterns,
			pattern: sortedPatterns[0]?.name,
			lastIndex: ohlc.length - 1,
			dailyVolume,
			lastPrice,
			priceChange,
			priceChangePercent,
			spotMeta,
			volume: lastCandle.volume ?? 0,
			scanTime,
			healthScore: analysis.marketHealth?.overallHealth ?? analysis.overall ?? 50,
			healthGrade: analysis.marketHealth?.healthGrade ?? analysis.grade ?? "C",
			hasMonsterPlay: Boolean(monster?.hasPlay),
			volumeSpike,
			breakoutScore: breakoutScoreForResult,
			isNewHigh,
			isNewLow,
			momentumStrength,
			rsiValue: analysis.marketHealth?.rsi?.value ?? 50,
			breakoutSignal: breakoutSignalForResult,
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
			timeframeStack,
			preBreakoutSetup,
			optionPlays,
			optionsReadiness,
			edgeEngine: safeEdgeEngine,
			tradePlan,
			setupReasoning,
		};

		if (timeframe === DEFAULT_TIMEFRAME) {
			recordEdgeTuningSample({
				symbol: upperSymbol,
				timeframe,
				timestamp: result.scanTime,
				breakoutSignal: result.breakoutSignal,
				breakoutScore: result.breakoutScore,
				edgeEngine: result.edgeEngine
					? {
						signal: result.edgeEngine.signal,
						direction: result.edgeEngine.direction,
						state: result.edgeEngine.state,
						edgeScore: result.edgeEngine.edgeScore,
						confidence: result.edgeEngine.confidence,
						leadMinutes: result.edgeEngine.leadMinutes,
						triggerProbability: result.edgeEngine.triggerProbability,
						reasons: result.edgeEngine.reasons,
						indicators: result.edgeEngine.indicators,
					}
					: undefined,
			});

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
				preBreakoutSetup: result.preBreakoutSetup
					? {
						score: result.preBreakoutSetup.score,
						etaMinutes: result.preBreakoutSetup.etaMinutes,
						traits: result.preBreakoutSetup.traits,
					}
					: undefined,
				timeframeStack: result.timeframeStack
					? {
						agreement: result.timeframeStack.agreement,
						aggregateScore: result.timeframeStack.aggregateScore,
						bias: result.timeframeStack.bias,
					}
					: undefined,
				tvRsi: result.tvRsi,
				tvAdx: result.tvAdx,
				tvRecommendAll: result.tvRecommendAll,
				tvTrendDirection: result.tvTrendDirection,
				tvTrendStrength: result.tvTrendStrength,
				optionsReadiness: result.optionsReadiness,
				edgeEngine: result.edgeEngine
					? {
						signal: result.edgeEngine.signal,
						direction: result.edgeEngine.direction,
						state: result.edgeEngine.state,
						edgeScore: result.edgeEngine.edgeScore,
						confidence: result.edgeEngine.confidence,
						leadMinutes: result.edgeEngine.leadMinutes,
						triggerProbability: result.edgeEngine.triggerProbability,
						reasons: result.edgeEngine.reasons,
						indicators: result.edgeEngine.indicators,
					}
					: undefined,
			});

			// Record signal to engine intake log for tuning analysis
			recordScannerSignal({
				symbol: upperSymbol,
				timeframe,
				breakoutSignal: result.breakoutSignal ?? null,
				breakoutScore: result.breakoutScore,
				momentumStrength: result.momentumStrength,
				volumeSpike: result.volumeSpike,
				rsiValue: result.rsiValue,
				edgeEngine: result.edgeEngine,
				warnings: result.warnings,
				compression: result.compression,
				preBreakoutSetup: result.preBreakoutSetup,
				timeframeStack: result.timeframeStack,
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
		let tvBySymbol = new Map<string, TradingViewSnapshot>();
		try {
			tvBySymbol = await getTradingViewIndicatorMap(symbols);
		} catch (error) {
			console.warn("[Scanner] TradingView snapshot fetch failed; continuing without TV overlay.", error);
		}
		const now = Date.now();
		for (const symbol of symbols) {
			const upperSymbol = normalizeSymbol(symbol);
			const result = await scanSymbol(
				symbol,
				DEFAULT_TIMEFRAME,
				upperSymbol ? tvBySymbol.get(upperSymbol) : undefined,
			);
			if (result) {
				const existing = state.results.get(result.symbol);
				const keepExisting = shouldKeepExistingScannerResult(existing, result, now);

				if (!keepExisting) {
					state.results.set(result.symbol, result);
				}
			}
		}

		state.lastScanTime = Date.now();
		pushScannerStabilitySnapshot(state.lastScanTime);
	} catch (error) {
		console.error("[Scanner] Scan cycle failed:", error);
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
	if (!state.scanTimer) {
		startScanner();
	}

	return {
		isScanning: state.scanTimer !== null,
		lastScanTime: state.lastScanTime,
		watchlistCount: state.watchlist.size,
		resultCount: state.results.size,
	};
}

export function getScannerStability(
	windowSnapshots: number = SCANNER_STABILITY_DEFAULT_WINDOW,
	scoreJumpThreshold: number = SCANNER_STABILITY_DEFAULT_SCORE_JUMP,
): ScannerStabilitySummary {
	const clampedWindow = Math.max(2, Math.min(SCANNER_STABILITY_HISTORY_LIMIT, Math.floor(windowSnapshots)));
	const scoreJump = Math.max(0, scoreJumpThreshold);
	const snapshots = state.stabilityHistory.slice(-clampedWindow);
	const latestSnapshot = snapshots[snapshots.length - 1];

	const watchlistOrder = new Map<string, number>();
	Array.from(state.watchlist).forEach((symbol, idx) => {
		watchlistOrder.set(symbol, idx);
	});

	const symbols = latestSnapshot
		? Array.from(latestSnapshot.rows.keys()).sort((a, b) => {
			const aOrder = watchlistOrder.get(a) ?? Number.MAX_SAFE_INTEGER;
			const bOrder = watchlistOrder.get(b) ?? Number.MAX_SAFE_INTEGER;
			if (aOrder !== bOrder) return aOrder - bOrder;
			return a.localeCompare(b);
		})
		: Array.from(state.watchlist);

	let totalTransitions = 0;
	let totalFlipTransitions = 0;
	const transitionsPerSymbol = Math.max(0, snapshots.length - 1);

	const perSymbol: ScannerSymbolStability[] = symbols.map((symbol) => {
		let transitions = 0;
		let flipTransitions = 0;
		let signalFlips = 0;
		let biasFlips = 0;
		let degradedFlips = 0;
		let scoreJumps = 0;

		for (let idx = 1; idx < snapshots.length; idx++) {
			const prev = snapshots[idx - 1].rows.get(symbol);
			const curr = snapshots[idx].rows.get(symbol);
			if (!prev || !curr) continue;

			transitions += 1;
			totalTransitions += 1;

			let changed = false;
			if (prev.signal !== curr.signal) {
				signalFlips += 1;
				changed = true;
			}
			if (prev.bias !== curr.bias) {
				biasFlips += 1;
				changed = true;
			}
			if (prev.isDegraded !== curr.isDegraded) {
				degradedFlips += 1;
				changed = true;
			}
			if (Math.abs(curr.score - prev.score) >= scoreJump) {
				scoreJumps += 1;
				changed = true;
			}
			if (changed) {
				flipTransitions += 1;
				totalFlipTransitions += 1;
			}
		}

		return {
			symbol,
			transitions,
			flipTransitions,
			signalFlips,
			biasFlips,
			degradedFlips,
			scoreJumps,
		};
	});

	const fromTimestamp = snapshots[0]?.capturedAt ?? null;
	const toTimestamp = snapshots[snapshots.length - 1]?.capturedAt ?? null;
	const windowMinutes =
		fromTimestamp !== null && toTimestamp !== null && toTimestamp >= fromTimestamp
			? roundTo((toTimestamp - fromTimestamp) / 60_000, 2)
			: 0;

	const currentRows = latestSnapshot ? Array.from(latestSnapshot.rows.values()) : [];
	const currentDegradedCount = currentRows.filter((row) => row.isDegraded).length;
	const currentDegradedRatioPct =
		currentRows.length > 0 ? roundTo((currentDegradedCount / currentRows.length) * 100, 2) : 0;

	return {
		snapshots: snapshots.length,
		symbols: symbols.length,
		transitionsPerSymbol,
		totalTransitions,
		totalFlipTransitions,
		flipRatePct: totalTransitions > 0 ? roundTo((totalFlipTransitions / totalTransitions) * 100, 2) : 0,
		scoreJumpThreshold: scoreJump,
		fromTimestamp,
		toTimestamp,
		windowMinutes,
		currentDegradedCount,
		currentDegradedRatioPct,
		perSymbol,
	};
}

export function getScannerResults(): ScannerResult[] {
	if (!state.scanTimer) {
		startScanner();
	}

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
				const now = Date.now();
				const existing = state.results.get(upperSymbol);
				if (!shouldKeepExistingScannerResult(existing, result, now)) {
					state.results.set(upperSymbol, result);
				}
				state.lastScanTime = now;
				pushScannerStabilitySnapshot(now);
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
		state.monsterConfirmState.delete(upperSymbol);
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
		const now = Date.now();
		const existing = state.results.get(upperSymbol);
		if (!shouldKeepExistingScannerResult(existing, result, now)) {
			state.results.set(upperSymbol, result);
		}
		state.lastScanTime = now;
		pushScannerStabilitySnapshot(now);
	}
	return result;
}
