import { patternRegistry } from "./patternRegistry";
import type { OHLC, DrawablePattern } from "@shared/schema";

export function patternToGeometry(
  ohlc: OHLC[],
  pattern: DrawablePattern
): DrawablePattern["geometry"] | null {
  const entry = patternRegistry[pattern.name];

  if (entry && entry.showOnChart) {
    return entry.geometryBuilder(ohlc, pattern);
  }

  return pattern.geometry ?? null;
}
