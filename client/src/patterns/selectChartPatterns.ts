import type { DrawablePattern, PatternLifecycle } from "@shared/schema";

export const MAX_CHART_OVERLAYS = 3;

const LIFECYCLE_PRIORITY: Record<PatternLifecycle, number> = {
  breaking: 3,
  forming: 2,
  valid: 1,
  failed: 0,
  expired: -1,
};

function canonicalPatternName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/\b(?:bullish|bearish)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function intervalsOverlap(left: DrawablePattern, right: DrawablePattern): boolean {
  const overlap = Math.max(0, Math.min(left.endIndex, right.endIndex) - Math.max(left.startIndex, right.startIndex) + 1);
  const shorterSpan = Math.max(1, Math.min(left.endIndex - left.startIndex + 1, right.endIndex - right.startIndex + 1));
  return overlap / shorterSpan >= 0.75;
}

function geometrySignature(pattern: DrawablePattern): string {
  const lines = pattern.geometry.lines.map((line) => [
    line.start.x,
    line.start.y.toFixed(4),
    line.end.x,
    line.end.y.toFixed(4),
    line.style,
  ].join(":"));
  return `${pattern.type}|${pattern.startIndex}|${pattern.endIndex}|${lines.join("|")}`;
}

function comparePatternPriority(left: DrawablePattern, right: DrawablePattern): number {
  return LIFECYCLE_PRIORITY[right.lifecycle] - LIFECYCLE_PRIORITY[left.lifecycle]
    || right.confidence - left.confidence
    || (right.quality ?? 0) - (left.quality ?? 0)
    || right.endIndex - left.endIndex
    || left.name.length - right.name.length;
}

function patternsAreDuplicates(left: DrawablePattern, right: DrawablePattern): boolean {
  if (left.type !== right.type) return false;
  if (geometrySignature(left) === geometrySignature(right)) return true;
  return canonicalPatternName(left.name) === canonicalPatternName(right.name)
    && intervalsOverlap(left, right);
}

export function dedupeAndRankChartPatterns(patterns: DrawablePattern[]): DrawablePattern[] {
  const ranked = [...patterns].sort(comparePatternPriority);
  return ranked.filter((candidate, index) => (
    !ranked.slice(0, index).some((kept) => patternsAreDuplicates(candidate, kept))
  ));
}

export function selectChartOverlays(
  patterns: DrawablePattern[],
  selectedPatternId: string | null,
  limit = MAX_CHART_OVERLAYS,
): DrawablePattern[] {
  const selected = selectedPatternId ? patterns.find((pattern) => pattern.id === selectedPatternId) : undefined;
  const lifecycleBuckets: PatternLifecycle[] = ["breaking", "forming", "valid"];
  const selectedPatterns: DrawablePattern[] = selected ? [selected] : [];

  for (const lifecycle of lifecycleBuckets) {
    if (selectedPatterns.length >= limit) break;
    if (selected?.lifecycle === lifecycle) continue;
    const candidate = patterns.find((pattern) => pattern.lifecycle === lifecycle && pattern.id !== selected?.id);
    if (candidate) selectedPatterns.push(candidate);
  }

  return selectedPatterns.slice(0, limit);
}