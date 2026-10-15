import type { NormalizedPattern } from "@shared/schema";

const PATTERN_ALIASES: Record<string, string> = {
  "rounding top": "rounded top",
  "rounding bottom": "rounded bottom",
  "head & shoulders": "head and shoulders",
  "inverse head & shoulders": "inverse head and shoulders",
  "ascending flag": "bull flag",
  "channel flag (bullish)": "bull flag",
  "descending flag": "bear flag",
  "channel flag (bearish)": "bear flag",
  "falling wedge (bullish reversal)": "falling wedge",
  "rising wedge (bearish reversal)": "rising wedge",
  "ascending channel": "channel up",
  "descending channel": "channel down",
  "cup & handle (bullish reversal)": "cup and handle",
  "tri-star doji (bullish)": "bullish tri-star doji",
  "tri-star doji (bearish)": "bearish tri-star doji",
  "piercing line (piercing pattern)": "piercing line",
  "stick sandwich": "stick sandwich (bullish)",
  "bullish separating lines": "separating lines (bullish)",
  "bearish separating lines": "separating lines (bearish)",
  "bullish engulfing": "engulfing",
  "bearish engulfing": "engulfing",
  "bullish harami": "harami",
  "bearish harami": "harami",
  "bullish harami cross": "harami cross",
  "bearish harami cross": "harami cross",
  "bullish kicker": "kicker",
  "bearish kicker": "kicker",
  "bullish counterattack": "counterattack",
  "bearish counterattack": "counterattack",
  "bullish meeting lines": "meeting lines",
  "bearish meeting lines": "meeting lines",
  "bullish gap reversal": "gap reversal",
  "bearish gap reversal": "gap reversal",
  "bullish window reversal": "window reversal",
  "bearish window reversal": "window reversal",
};

const LIFECYCLE_PRIORITY: Record<NormalizedPattern["state"], number> = {
  breaking: 5,
  valid: 4,
  forming: 3,
  failed: 2,
  expired: 1,
};

export function canonicalPatternName(name: string): string {
  const normalized = name.toLowerCase()
    .replace(/\s*\(forming\)$/, "")
    .replace(/\s*\(piercing pattern\)$/, "")
    .replace(/\s+pattern$/, "")
    .trim();
  return PATTERN_ALIASES[normalized] ?? normalized;
}

function duplicateFormation(left: NormalizedPattern, right: NormalizedPattern): boolean {
  if (canonicalPatternName(left.name) !== canonicalPatternName(right.name) || left.direction !== right.direction) return false;
  const leftStart = Math.min(left.startIndex, left.endIndex);
  const leftEnd = Math.max(left.startIndex, left.endIndex);
  const rightStart = Math.min(right.startIndex, right.endIndex);
  const rightEnd = Math.max(right.startIndex, right.endIndex);
  const overlap = Math.max(0, Math.min(leftEnd, rightEnd) - Math.max(leftStart, rightStart) + 1);
  const shorterLength = Math.min(leftEnd - leftStart + 1, rightEnd - rightStart + 1);
  return overlap / shorterLength >= 0.75;
}

export function dedupeNormalizedPatterns(patterns: NormalizedPattern[]): NormalizedPattern[] {
  const preferred = [...patterns].sort((left, right) => {
    const leftActive = left.state === "failed" || left.state === "expired" ? 0 : 1;
    const rightActive = right.state === "failed" || right.state === "expired" ? 0 : 1;
    return rightActive - leftActive ||
      LIFECYCLE_PRIORITY[right.state] - LIFECYCLE_PRIORITY[left.state] ||
      right.confidence * right.quality - left.confidence * left.quality;
  });
  const unique: NormalizedPattern[] = [];
  for (const pattern of preferred) {
    if (!unique.some((existing) => duplicateFormation(existing, pattern))) unique.push(pattern);
  }
  return unique;
}
