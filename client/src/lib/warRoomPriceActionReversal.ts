export type ReversalDirection = "CALL" | "PUT" | "MIXED" | "NONE";

export interface ReversalPatternEvidence {
  name: string;
  direction: "bullish" | "bearish";
  score: number;
}

export interface PriceActionReversalInput {
  bullishCandle: boolean;
  bearishCandle: boolean;
  bodyQuality: number;
  volumeRatio: number;
  patterns: ReversalPatternEvidence[];
  scalpExitWarning: string | null;
}

export interface PriceActionReversalRead {
  direction: ReversalDirection;
  strength: number;
  bullishStrength: number;
  bearishStrength: number;
  patternNames: string[];
}

const reversalPatternName = /engulf|harami|piercing|dark cloud|tweezer|kicker|matching|homing pigeon|counterattack|meeting|separating|sandwich|belt hold|neck|thrust|gap reversal|island reversal|tasuki|doji star|descending hawk/i;

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

export function readPriceActionReversal(input: PriceActionReversalInput): PriceActionReversalRead {
  const bullishPatterns = input.patterns.filter(
    (pattern) => pattern.direction === "bullish" && reversalPatternName.test(pattern.name),
  );
  const bearishPatterns = input.patterns.filter(
    (pattern) => pattern.direction === "bearish" && reversalPatternName.test(pattern.name),
  );
  const candleStrength = input.bullishCandle || input.bearishCandle
    ? clampScore(55 + clampScore(input.bodyQuality * 100) * 0.25 + Math.min(Math.max(input.volumeRatio, 0), 2) * 10)
    : 0;
  const bullishStrength = Math.max(
    input.bullishCandle ? candleStrength : 0,
    ...bullishPatterns.map((pattern) => clampScore(pattern.score)),
    input.scalpExitWarning === "EXIT PUTS WATCH" ? 85 : 0,
  );
  const bearishStrength = Math.max(
    input.bearishCandle ? candleStrength : 0,
    ...bearishPatterns.map((pattern) => clampScore(pattern.score)),
    input.scalpExitWarning === "EXIT CALLS WATCH" ? 85 : 0,
  );
  const hasBullish = bullishStrength >= 55;
  const hasBearish = bearishStrength >= 55;
  const direction: ReversalDirection = hasBullish && hasBearish
    ? "MIXED"
    : hasBullish ? "CALL"
      : hasBearish ? "PUT" : "NONE";
  const patternNames = (direction === "CALL"
    ? bullishPatterns
    : direction === "PUT" ? bearishPatterns : [])
    .slice(0, 2)
    .map((pattern) => pattern.name);

  return {
    direction,
    strength: Math.max(bullishStrength, bearishStrength),
    bullishStrength,
    bearishStrength,
    patternNames,
  };
}
