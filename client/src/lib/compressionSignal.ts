export type CompressionState = "WAIT" | "PREPARE" | "READY" | "NOW";

export interface CompressionSignalInput {
  bbSqueeze?: boolean;
  rangeCompression?: number | null;
  atrPercent?: number | null;
  previousState?: CompressionState;
}

export interface CompressionSignalOutput {
  score: number;
  state: CompressionState;
  reasons: string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function getState(score: number, previousState?: CompressionState): CompressionState {
  if (!previousState) {
    if (score >= 80) return "NOW";
    if (score >= 62) return "READY";
    if (score >= 40) return "PREPARE";
    return "WAIT";
  }

  if (previousState === "WAIT") {
    return score >= 40 ? "PREPARE" : "WAIT";
  }

  if (previousState === "PREPARE") {
    if (score >= 62) return "READY";
    if (score < 32) return "WAIT";
    return "PREPARE";
  }

  if (previousState === "READY") {
    if (score >= 80) return "NOW";
    if (score < 55) return "PREPARE";
    return "READY";
  }

  if (score < 72) return "READY";
  return "NOW";
}

export function deriveCompressionSignal(input: CompressionSignalInput): CompressionSignalOutput {
  const rawRange = Number.isFinite(input.rangeCompression)
    ? Number(input.rangeCompression)
    : Number.NaN;
  const normalizedRange = Number.isFinite(rawRange)
    ? clamp(rawRange > 1 ? rawRange / 100 : rawRange, 0, 1)
    : Number.NaN;

  const rangeTightnessScore = Number.isFinite(normalizedRange)
    ? clamp((1 - normalizedRange) * 60, 0, 60)
    : 0;

  const atrPct = Number.isFinite(input.atrPercent) ? Number(input.atrPercent) : Number.NaN;
  const atrCompressionScore = Number.isFinite(atrPct)
    ? clamp(((2.5 - atrPct) / 2.5) * 20, 0, 20)
    : 10;

  const bbScore = input.bbSqueeze ? 20 : 0;
  const score = Math.round(clamp(rangeTightnessScore + atrCompressionScore + bbScore, 0, 100));

  const reasons: string[] = [];
  if (input.bbSqueeze) reasons.push("Bollinger squeeze active");

  if (Number.isFinite(normalizedRange)) {
    const rangePct = Math.round(normalizedRange * 100);
    if (normalizedRange <= 0.5) reasons.push(`Range compressed (${rangePct}%)`);
    else if (normalizedRange <= 0.7) reasons.push(`Range tightening (${rangePct}%)`);
    else reasons.push(`Range expanded (${rangePct}%)`);
  }

  if (Number.isFinite(atrPct)) {
    if (atrPct <= 1) reasons.push(`Low ATR (${atrPct.toFixed(2)}%)`);
    else if (atrPct <= 2) reasons.push(`Moderate ATR (${atrPct.toFixed(2)}%)`);
    else reasons.push(`High ATR (${atrPct.toFixed(2)}%)`);
  }

  const state = getState(score, input.previousState);
  return { score, state, reasons };
}
