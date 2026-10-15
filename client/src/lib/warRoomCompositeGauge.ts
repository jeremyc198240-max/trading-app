export type CompositeGaugeDirection = "CALL" | "PUT" | "WAIT";

export interface CompositeGaugeInput {
  name: string;
  score: number;
  confidence: number;
  reliability: number;
  direction: CompositeGaugeDirection;
  weight?: number;
}

export interface CompositeGaugeResult {
  score: number;
  confidence: number;
  reliability: number;
  direction: CompositeGaugeDirection;
  contributors: number;
  total: number;
}

function clamp(value: number): number {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function fuseCompositeGauge(inputs: CompositeGaugeInput[]): CompositeGaugeResult {
  if (!inputs.length) {
    return { score: 50, confidence: 0, reliability: 0, direction: "WAIT", contributors: 0, total: 0 };
  }

  let weightedDirection = 0;
  let totalWeight = 0;
  let weightedReliability = 0;
  let contributors = 0;

  for (const input of inputs) {
    const confidence = clamp(input.confidence);
    const reliability = clamp(input.reliability);
    const scoreStrength = clamp(input.score) / 100;
    const directionSign = input.direction === "CALL" ? 1 : input.direction === "PUT" ? -1 : 0;
    const modelWeight = Math.min(1.5, Math.max(0.5, input.weight ?? 1));
    const weight = Math.max(0.15, reliability / 100) * Math.max(0.25, confidence / 100) * modelWeight;

    weightedDirection += directionSign * scoreStrength * weight;
    totalWeight += weight;
    weightedReliability += reliability * weight;
    if (input.direction !== "WAIT") contributors += 1;
  }

  const alignment = totalWeight > 0 ? weightedDirection / totalWeight : 0;
  const direction: CompositeGaugeDirection = alignment >= 0.12 ? "CALL" : alignment <= -0.12 ? "PUT" : "WAIT";
  return {
    score: clamp(50 + alignment * 35),
    confidence: clamp(Math.abs(alignment) * 100),
    reliability: totalWeight > 0 ? clamp(weightedReliability / totalWeight) : 0,
    direction,
    contributors,
    total: inputs.length,
  };
}
