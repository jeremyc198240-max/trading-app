import { z } from "zod";
import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const termsAcceptanceLogs = pgTable("terms_acceptance_logs", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  version: text("version").default("v1").notNull(),
});

export const insertTermsAcceptanceSchema = createInsertSchema(termsAcceptanceLogs).omit({
  id: true,
  timestamp: true,
});

export type InsertTermsAcceptance = z.infer<typeof insertTermsAcceptanceSchema>;
export type TermsAcceptanceLog = typeof termsAcceptanceLogs.$inferSelect;

// OHLC candle data
export const ohlcSchema = z.object({
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  time: z.number().optional(),
});

export type OHLC = z.infer<typeof ohlcSchema>;

// Grade types
export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

// Momentum divergence
export const momentumDivergenceSchema = z.object({
  vwapSlope: z.number(),
  divergence: z.string().nullable(),
});

export type MomentumDivergence = z.infer<typeof momentumDivergenceSchema>;

// Volume spike
export const volumeSpikeSchema = z.object({
  lastVolume: z.number(),
  avgVolume: z.number(),
  isSpike: z.boolean(),
});

export type VolumeSpike = z.infer<typeof volumeSpikeSchema>;

// Trend exhaustion
export const trendExhaustionSchema = z.object({
  rangeCompression: z.number(),
  volumeFade: z.number(),
  isExhausted: z.boolean(),
});

export type TrendExhaustion = z.infer<typeof trendExhaustionSchema>;

// Bullish power
export const bullishPowerSchema = z.object({
  rawScore: z.number(),
  meter: z.number(),
});

export type BullishPower = z.infer<typeof bullishPowerSchema>;

// Candle strength
export const candleStrengthSchema = z.object({
  score: z.number(),
  bodyRatio: z.number(),
  wickRatio: z.number(),
});

export type CandleStrength = z.infer<typeof candleStrengthSchema>;

// EMA Cloud
export const emaCloudSchema = z.object({
  trend: z.enum(['bullish', 'bearish', 'neutral']),
  top: z.number().optional(),
  bottom: z.number().optional(),
});

export type EMACloud = z.infer<typeof emaCloudSchema>;

// Liquidity sweep
export const liquiditySweepSchema = z.object({
  detected: z.boolean(),
  type: z.enum(['high_sweep', 'low_sweep']).nullable(),
  level: z.number().nullable(),
  reclaimed: z.boolean().nullable(),
  description: z.string().nullable(),
  sweepSize: z.number().nullable().optional(),
  sweepSizePct: z.number().nullable().optional(),
});

export type LiquiditySweep = z.infer<typeof liquiditySweepSchema>;

// Divergence Warning - protection system for market divergence
export const divergenceWarningSchema = z.object({
  type: z.enum(['bullish_divergence', 'bearish_divergence', 'volume_divergence', 'exhaustion_warning', 'none']),
  severity: z.enum(['low', 'medium', 'high']),
  description: z.string(),
  protection: z.string(),
  reduceSize: z.boolean(),
  tightenStops: z.boolean(),
});

export type DivergenceWarning = z.infer<typeof divergenceWarningSchema>;

// Contributor (for tactical and market health)
export const contributorSchema = z.object({
  name: z.string(),
  value: z.number(),
  strength: z.number().optional(),
});

export type Contributor = z.infer<typeof contributorSchema>;

export const tacticalIndicatorsSchema = z.object({
  agreementPct: z.number(),
  confirmCount: z.number().optional(),
  totalChecks: z.number().optional(),
  rsi: z.object({
    value: z.number(),
    signal: z.enum(['overbought', 'oversold', 'neutral']),
    confirms: z.boolean(),
  }),
  macd: z.object({
    histogram: z.number(),
    trend: z.enum(['bullish', 'bearish', 'neutral']),
    confirms: z.boolean(),
  }),
  bb: z.object({
    percentB: z.number(),
    squeeze: z.boolean(),
    confirms: z.boolean(),
  }),
  atr: z.object({
    value: z.number(),
    percent: z.number(),
  }),
  adx: z.object({
    value: z.number(),
    trendStrength: z.enum(['weak', 'moderate', 'strong']),
  }),
  momentum: z.object({
    score: z.number(),
    trend: z.enum(['bullish', 'bearish', 'neutral']),
    confirms: z.boolean(),
  }).optional(),
});

export type TacticalIndicators = z.infer<typeof tacticalIndicatorsSchema>;

export const tacticalOtmSchema = z.object({
  type: z.enum(['call', 'put']),
  strike: z.number(),
  delta: z.number(),
  dte: z.number(),
  probability: z.number(),
  targetPrice: z.number().optional(),
  stopPrice: z.number().optional(),
  rationale: z.string().optional(),
});

export type TacticalOtm = z.infer<typeof tacticalOtmSchema>;

// Tactical advice
export const tacticalAdviceSchema = z.object({
  strategy: z.string(),
  bias: z.enum(['bullish', 'bearish', 'neutral']),
  confidence: z.enum(['low', 'medium', 'high']),
  volRegime: z.enum(['normal', 'elevated']),
  notes: z.array(z.string()),
  directionScore: z.number(),
  contributors: z.array(contributorSchema).optional(),
  indicators: tacticalIndicatorsSchema.optional(),
  entryWindow: z.string().optional(),
  actionPlan: z.array(z.string()).optional(),
  keyLevel: z.number().optional(),
  atrValue: z.number().optional(),
  otm: tacticalOtmSchema.optional(),
});

export type TacticalAdvice = z.infer<typeof tacticalAdviceSchema>;

// Gamma summary
export const gammaSummarySchema = z.object({
  maxAbsGammaStrike: z.number().nullable(),
});

export type GammaSummary = z.infer<typeof gammaSummarySchema>;

// Grade result
export const gradeResultSchema = z.object({
  overall: z.number(),
  trendConfidence: z.number(),
  volumeConfidence: z.number(),
  patternConfidence: z.number(),
  marketConfidence: z.number(),
  grade: z.enum(['A', 'B', 'C', 'D', 'F']),
  signals: z.any(),
});

export type GradeResult = z.infer<typeof gradeResultSchema>;

// Market Health Indicators
export const marketHealthSchema = z.object({
  rsi: z.object({
    value: z.number(),
    signal: z.enum(['overbought', 'oversold', 'neutral']),
    contribution: z.number(),
  }),
  macd: z.object({
    value: z.number(),
    signal: z.number(),
    histogram: z.number(),
    trend: z.enum(['bullish', 'bearish', 'neutral']),
    contribution: z.number(),
  }),
  adx: z.object({
    value: z.number(),
    plusDI: z.number(),
    minusDI: z.number(),
    trendStrength: z.enum(['weak', 'moderate', 'strong']),
    contribution: z.number(),
  }),
  obv: z.object({
    value: z.number(),
    trend: z.enum(['bullish', 'bearish', 'neutral']),
    contribution: z.number(),
  }),
  cmf: z.object({
    value: z.number(),
    signal: z.enum(['accumulation', 'distribution', 'neutral']),
    contribution: z.number(),
  }),
  atr: z.object({
    value: z.number(),
    percent: z.number(),
  }),
  bollingerBands: z.object({
    upper: z.number(),
    middle: z.number(),
    lower: z.number(),
    squeeze: z.boolean(),
    percentB: z.number(),
    contribution: z.number(),
  }),
  keltnerChannel: z.object({
    upper: z.number(),
    middle: z.number(),
    lower: z.number(),
    breakout: z.enum(['upper', 'lower']).nullable(),
    contribution: z.number(),
  }),
  stochastic: z.object({
    k: z.number(),
    d: z.number(),
    signal: z.enum(['overbought', 'oversold', 'neutral']),
    contribution: z.number(),
  }),
  vwapSlope: z.object({
    value: z.number(),
    trend: z.enum(['bullish', 'bearish', 'neutral']),
    contribution: z.number(),
  }),
  ivChange: z.object({
    value: z.number(),
    signal: z.enum(['elevated', 'low', 'neutral']),
    contribution: z.number(),
  }),
  orderflow: z.object({
    tickImbalance: z.number(),
    volumeDelta: z.number(),
    contribution: z.number(),
  }),
  gamma: z.object({
    maxAbsGammaStrike: z.number().nullable(),
    contribution: z.number(),
  }),
  breadth: z.object({
    advanceDecline: z.number(),
    newHighsLows: z.number(),
    composite: z.number(),
    contribution: z.number(),
  }),
  overallHealth: z.number(),
  healthGrade: z.enum(['A', 'B', 'C', 'D', 'F']),
  contributors: z.array(contributorSchema),
});

export type MarketHealth = z.infer<typeof marketHealthSchema>;

// 0DTE Meta Engine Types
export const regimeTypeSchema = z.enum(['trend', 'range', 'liquidity_hunt', 'dealer_pinned', 'news_expansion']);
export type RegimeType = z.infer<typeof regimeTypeSchema>;

export const regimeClassificationSchema = z.object({
  regime: regimeTypeSchema,
  bias: z.enum(['bullish', 'bearish', 'neutral']),
  confidence: z.number(),
  notes: z.array(z.string()),
});

export type RegimeClassification = z.infer<typeof regimeClassificationSchema>;

export const liquidityLevelTypeSchema = z.enum(['PDH', 'PDL', 'ONH', 'ONL', 'VWAP', 'SWING_HIGH', 'SWING_LOW', 'GAMMA']);
export type LiquidityLevelType = z.infer<typeof liquidityLevelTypeSchema>;

export const liquidityLevelSchema = z.object({
  price: z.number(),
  type: liquidityLevelTypeSchema,
  liquidityScore: z.number(),
  sweepProbability: z.number(),
  distance: z.number(),
});

export type LiquidityLevel = z.infer<typeof liquidityLevelSchema>;

export const liquidityMapSchema = z.object({
  levels: z.array(liquidityLevelSchema),
  nearestAbove: liquidityLevelSchema.nullable().optional(),
  nearestBelow: liquidityLevelSchema.nullable().optional(),
});

export type LiquidityMap = z.infer<typeof liquidityMapSchema>;

export const patternSignalSchema = z.object({
  name: z.string(),
  baseTF: z.enum(['5m', '15m']),
  confirmTF: z.enum(['5m', '15m', '30m']),
  direction: z.enum(['bullish', 'bearish', 'neutral']),
  strength: z.number(),
  notes: z.array(z.string()),
});

export type PatternSignal = z.infer<typeof patternSignalSchema>;

export const patternMatrixMetaSchema = z.object({
  patterns: z.array(patternSignalSchema),
  strongest: patternSignalSchema.nullable().optional(),
});

export type PatternMatrixMeta = z.infer<typeof patternMatrixMetaSchema>;

export const directionalProbabilitiesSchema = z.object({
  continuationUp: z.number(),
  continuationDown: z.number(),
  reversalUp: z.number(),
  reversalDown: z.number(),
  chop: z.number(),
  dominant: z.string(),
  confidence: z.number(),
});

export type DirectionalProbabilities = z.infer<typeof directionalProbabilitiesSchema>;

export const timeOfDayVolatilitySchema = z.object({
  session: z.enum(['open', 'midday', 'power_hour', 'after_hours']),
  volBias: z.enum(['high', 'normal', 'low']),
  weight: z.number(),
});

export type TimeOfDayVolatility = z.infer<typeof timeOfDayVolatilitySchema>;

export const recommended0DTEPlaySchema = z.object({
  structure: z.string(),
  direction: z.enum(['bullish', 'bearish', 'neutral']),
  aggressiveness: z.enum(['scalp', 'swing', 'lotto', 'premium_sell']),
  notes: z.array(z.string()),
});

export type Recommended0DTEPlay = z.infer<typeof recommended0DTEPlaySchema>;

export const metaEngineOutputSchema = z.object({
  regime: regimeClassificationSchema,
  liquidity: liquidityMapSchema,
  patterns: patternMatrixMetaSchema,
  probabilities: directionalProbabilitiesSchema,
  timeOfDay: timeOfDayVolatilitySchema,
  metaConfidence: z.number(),
  recommendedPlay: recommended0DTEPlaySchema,
});

export type MetaEngineOutput = z.infer<typeof metaEngineOutputSchema>;

// Meta Signal from pattern engine
export const metaSignalSchema = z.object({
  active: z.boolean(),
  bias: z.enum(['bullish', 'bearish', 'neutral']),
  strength: z.number(),
  playType: z.enum(['reversal', 'continuation', 'breakout', 'mean_reversion', 'none']),
  entryZone: z.object({
    min: z.number(),
    max: z.number(),
  }).optional(),
  stopLoss: z.number().optional(),
  targetPrimary: z.number().optional(),
  targetStretch: z.number().optional(),
  invalidationReason: z.string().optional(),
});

export type MetaSignal = z.infer<typeof metaSignalSchema>;

// Pattern geometry types for chart drawing
export const patternLifecycleSchema = z.enum(['forming', 'valid', 'breaking', 'failed', 'expired']);
export type PatternLifecycle = z.infer<typeof patternLifecycleSchema>;

export const geometryPointSchema = z.object({
  x: z.number(),
  y: z.number(),
  label: z.string().optional(),
});
export type GeometryPoint = z.infer<typeof geometryPointSchema>;

export const geometryLineSchema = z.object({
  start: geometryPointSchema,
  end: geometryPointSchema,
  style: z.enum(['solid', 'dashed']).optional(),
});
export type GeometryLine = z.infer<typeof geometryLineSchema>;

export const patternGeometrySchema = z.object({
  points: z.array(geometryPointSchema),
  lines: z.array(geometryLineSchema),
  breakoutLevel: z.number().nullable(),
  invalidationLevel: z.number().nullable(),
  fill: z.object({
    points: z.array(geometryPointSchema),
    opacity: z.number(),
  }).optional(),
});
export type PatternGeometry = z.infer<typeof patternGeometrySchema>;

export const patternCategorySchema = z.enum([
  'candlestick', 'classical', 'continuation', 'reversal',
  'breakout', 'structure', 'volatility', 'gap', 'liquidity'
]);
export type PatternCategory = z.infer<typeof patternCategorySchema>;

// Pattern detection
export const patternResultSchema = z.object({
  name: z.string(),
  type: z.enum(['bullish', 'bearish', 'neutral']),
  category: patternCategorySchema,
  confidence: z.number(),
  description: z.string(),
  startIndex: z.number(),
  endIndex: z.number(),
  priceTarget: z.number().optional(),
  pt1: z.number().optional(),
  pt2: z.number().optional(),
  stopLoss: z.number().optional(),
  confirmationTF: z.string().optional(),
  strengthWeight: z.number().optional(),
});

export type PatternResult = z.infer<typeof patternResultSchema>;

export const normalizedPatternSchema = z.object({
  name: z.string(),
  category: patternCategorySchema,
  direction: z.enum(['bullish', 'bearish', 'neutral']),
  confidence: z.number(),
  quality: z.number(),
  state: patternLifecycleSchema,
  startIndex: z.number(),
  endIndex: z.number(),
  breakoutLevel: z.number().nullable(),
  invalidationLevel: z.number().nullable(),
  geometry: patternGeometrySchema,
  howToTrade: z.array(z.string()),
  description: z.string(),
  priceTarget: z.number().nullable(),
  stopLoss: z.number().nullable(),
});

export type NormalizedPattern = z.infer<typeof normalizedPatternSchema>;

export const fusionPatternSignalSchema = z.object({
  direction: z.enum(['CALL', 'PUT', 'WAIT']),
  confidence: z.number(),
  reasons: z.array(z.string()),
  howToTrade: z.array(z.string()),
  dominantPattern: z.string().nullable(),
  patternCount: z.number(),
});

export type FusionPatternSignal = z.infer<typeof fusionPatternSignalSchema>;

export const breakoutValidationSchema = z.object({
  confirmed: z.boolean(),
  score: z.number(),
  checks: z.object({
    closeBeyondLevel: z.boolean(),
    volumeConfirm: z.boolean(),
    holdAboveLevel: z.boolean(),
    bodyCloseStrong: z.boolean(),
  }),
  reason: z.string(),
});

export type BreakoutValidation = z.infer<typeof breakoutValidationSchema>;

export const drawablePatternSchema = z.object({
  id: z.string(),
  name: z.string(),
  type: z.enum(['bullish', 'bearish', 'neutral']),
  category: patternCategorySchema,
  confidence: z.number(),
  lifecycle: patternLifecycleSchema,
  geometry: patternGeometrySchema,
  startIndex: z.number(),
  endIndex: z.number(),
  quality: z.number().optional(),
  howToTrade: z.array(z.string()).optional(),
  pt1: z.number().optional(),
  pt2: z.number().optional(),
  stopLoss: z.number().optional(),
  breakoutValidation: breakoutValidationSchema.optional(),
});

export type DrawablePattern = z.infer<typeof drawablePatternSchema>;

// Analysis payload (returned from API)
export const analysisPayloadSchema = z.object({
  symbol: z.string(),
  overall: z.number(),
  grade: z.enum(['A', 'B', 'C', 'D', 'F']),
  setupQuality: z.enum(['strong', 'medium', 'weak']),
  directionalBias: z.enum(['bullish', 'bearish', 'neutral']),
  strategy: z.string(),
  confidence: z.enum(['low', 'medium', 'high']),
  directionScore: z.number(),
  liquiditySweep: liquiditySweepSchema,
  notes: z.array(z.string()),
  trendConfidence: z.number().optional(),
  volumeConfidence: z.number().optional(),
  patternConfidence: z.number().optional(),
  marketConfidence: z.number().optional(),
  bullishPower: bullishPowerSchema.optional(),
  candleStrength: candleStrengthSchema.optional(),
  momentumDivergence: momentumDivergenceSchema.nullable().optional(),
  volumeSpike: volumeSpikeSchema.nullable().optional(),
  trendExhaustion: trendExhaustionSchema.nullable().optional(),
  emaCloud: emaCloudSchema.nullable().optional(),
  failedVwapReclaim: z.object({
    type: z.string(),
    description: z.string(),
  }).nullable().optional(),
  marketHealth: marketHealthSchema.optional(),
  vwapSeries: z.array(z.number()).optional(),
  ohlc: z.array(ohlcSchema).optional(),
  lastPrice: z.number().optional(),
  tactical: tacticalAdviceSchema.optional(),
  metaEngine: metaEngineOutputSchema.optional(),
  metaSignal: metaSignalSchema.optional(),
  divergenceWarning: divergenceWarningSchema.optional(),
  drawablePatterns: z.array(drawablePatternSchema).optional(),
  normalizedPatterns: z.array(normalizedPatternSchema).optional(),
  patternSignal: fusionPatternSignalSchema.optional(),
});

export type AnalysisPayload = z.infer<typeof analysisPayloadSchema>;

// Scanner result
export const scannerResultSchema = z.object({
  symbol: z.string(),
  patterns: z.array(patternResultSchema),
  lastPrice: z.number(),
  priceChange: z.number(),
  priceChangePercent: z.number(),
  volume: z.number(),
  scanTime: z.number(),
  healthScore: z.number(),
  healthGrade: z.enum(['A', 'B', 'C', 'D', 'F']),
});

export type ScannerResult = z.infer<typeof scannerResultSchema>;

// Timeframe type
export type Timeframe = '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

// Unified Meta Signal (validated, merged output for UI)
export const unifiedMetaSignalSchema = z.object({
  direction: z.enum(['bullish', 'bearish', 'neutral']),
  entryZone: z.object({
    min: z.number(),
    max: z.number(),
  }).optional(),
  stopLoss: z.number().optional(),
  priceTargets: z.array(z.number()).optional(),
  rr: z.number().nullable().optional(),
  
  regime: z.string(),
  probabilities: z.object({
    up: z.number(),
    down: z.number(),
    chop: z.number(),
  }),
  fusionBias: z.string(),
  breakoutLifecycle: z.object({
    state: z.enum(['PRE', 'IN_ZONE', 'POST_LATE']),
    zoneLow: z.number(),
    zoneHigh: z.number(),
    lateMoveSide: z.enum(['bullish', 'bearish', 'none']),
    tolerance: z.number(),
  }),
  riskModel: z.object({
    riskIndex: z.number(),
    failureProb: z.number(),
    factors: z.array(z.string()),
  }),
  
  status: z.enum(['active', 'expired', 'invalidated', 'stale', 'awaiting']),
  confidence: z.number(),
  notes: z.array(z.string()),
  
  zoneLow: z.number(),
  zoneHigh: z.number(),
});

export type UnifiedMetaSignal = z.infer<typeof unifiedMetaSignalSchema>;

// Analysis request
export const analysisRequestSchema = z.object({
  symbol: z.string().min(1),
  timeframe: z.enum(['5m', '15m', '30m', '1h', '4h', '1d']).optional(),
});

export type AnalysisRequest = z.infer<typeof analysisRequestSchema>;

// Unified Options Play (Monster OTM synthesis)
export type MonsterDirection = 'CALLS' | 'PUTS';

export const unifiedOptionsPlayReasonSchema = z.object({
  label: z.string(),
  weight: z.number(),
});

export type UnifiedOptionsPlayReason = z.infer<typeof unifiedOptionsPlayReasonSchema>;

export const unifiedOptionsPlaySchema = z.object({
  symbol: z.string(),
  timeframe: z.string(),
  direction: z.enum(['CALLS', 'PUTS']),
  isSynthetic: z.boolean(),
  expiration: z.string(),
  strike: z.number(),
  premium: z.number(),
  delta: z.number(),
  entryTrigger: z.number(),
  stop: z.number(),
  target: z.number(),
  rr: z.number(),
  score: z.number(),
  confidence: z.number(),
  pceScore: z.number(),
  monsterGate: z.number(),
  spot: z.number(),
  expectedMove: z.number(),
  unifiedState: z.string(),
  unifiedDirection: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL']),
  reasons: z.array(unifiedOptionsPlayReasonSchema),
  notes: z.string().optional(),
});

export type UnifiedOptionsPlay = z.infer<typeof unifiedOptionsPlaySchema>;
