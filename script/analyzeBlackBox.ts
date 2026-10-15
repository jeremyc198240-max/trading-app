import fs from "node:fs";
import path from "node:path";

type Row = Record<string, any>;

const logsDir = path.resolve(process.cwd(), "logs");
const symbol = String(process.argv[2] ?? "SPY").toUpperCase();

function readJsonl(prefix: string): Row[] {
  return fs.readdirSync(logsDir)
    .filter((file) => file.startsWith(prefix) && file.endsWith(".jsonl"))
    .flatMap((file) => fs.readFileSync(path.join(logsDir, file), "utf8").split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try { return [JSON.parse(line)]; } catch { return []; }
      }));
}

function decisionId(row: Row): string {
  return String(row.decisionId ?? `${row.symbol}:${row.candleTimeMs}`);
}

function percent(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return number <= 1 ? number * 100 : number;
}

function isTrusted(snapshot: Row): boolean {
  const bars = Array.isArray(snapshot.priceAction?.bars) ? snapshot.priceAction.bars : [];
  const latestBar = bars.at(-1);
  const nonzeroVolumeBars = bars.filter((bar: Row) => Number(bar.volume) > 0).length;
  const change = Math.abs(Number(snapshot.priceAction?.change1BarPct));
  const range = Number(snapshot.priceAction?.range20BarPct);
  const closeLocation = Number(snapshot.priceAction?.closeLocationPct);
  const volumeRatio = Number(snapshot.priceAction?.volumeRatio20Bar);
  const latestBarIsComplete = latestBar &&
    Number(latestBar.open) > 0 &&
    Number(latestBar.high) > 0 &&
    Number(latestBar.low) > 0 &&
    Number(latestBar.close) > 0 &&
    Number(latestBar.volume) > 0;
  return snapshot.dataQuality?.accepted === true &&
    snapshot.source === "live" &&
    bars.length >= 8 &&
    latestBarIsComplete &&
    nonzeroVolumeBars >= 6 &&
    Number.isFinite(change) &&
    change < 5 &&
    Number.isFinite(range) &&
    range > 0 &&
    range < 10 &&
    Number.isFinite(closeLocation) &&
    closeLocation > 0 &&
    Number.isFinite(volumeRatio) &&
    volumeRatio > 0;
}

function tapeDirection(snapshot: Row): "CALL" | "PUT" | "WAIT" {
  const bars = (snapshot.priceAction?.bars ?? []).filter((bar: Row) => Number(bar.close) > 0).slice(-6);
  let up = 0;
  let down = 0;
  for (let index = 1; index < bars.length; index += 1) {
    if (bars[index].close > bars[index - 1].close) up += 1;
    if (bars[index].close < bars[index - 1].close) down += 1;
  }
  if (down >= up + 2) return "PUT";
  if (up >= down + 2) return "CALL";
  return "WAIT";
}

function completedCandleMetrics(snapshot: Row) {
  const bars = (snapshot.priceAction?.bars ?? []).filter((bar: Row) =>
    Number(bar.volume) > 0 && Number(bar.open) > 0 && Number(bar.high) > 0 && Number(bar.low) > 0 && Number(bar.close) > 0,
  );
  const latest = bars.at(-1);
  const prior = bars.at(-2);
  if (!latest) return null;
  const baseline = bars.slice(-21, -1);
  const averageVolume = baseline.length
    ? baseline.reduce((sum: number, bar: Row) => sum + Number(bar.volume), 0) / baseline.length
    : 0;
  const range = Math.max(Number(latest.high) - Number(latest.low), 0.000001);
  return {
    change1BarPct: prior ? Number((((Number(latest.close) - Number(prior.close)) / Number(prior.close)) * 100).toFixed(3)) : null,
    closeLocationPct: Number((((Number(latest.close) - Number(latest.low)) / range) * 100).toFixed(1)),
    volumeRatio20Bar: Number((Number(latest.volume) / Math.max(averageVolume, 1)).toFixed(3)),
  };
}

function rate(rows: Row[]): string {
  const decided = rows.filter((row) => row.result === "win" || row.result === "loss");
  const wins = decided.filter((row) => row.result === "win").length;
  return decided.length ? `${(wins / decided.length * 100).toFixed(1)}% (${wins}/${decided.length})` : "n/a";
}

const snapshots = readJsonl("black_box_15m_").filter((row) => row.symbol === symbol);
const snapshotById = new Map(snapshots.map((row) => [decisionId(row), row]));
const joined = readJsonl("black_box_outcomes_")
  .filter((row) => row.symbol === symbol && row.horizonMinutes === 15)
  .map((outcome) => ({ ...outcome, snapshot: snapshotById.get(String(outcome.decisionId ?? String(outcome.outcomeId).replace(/:15$/, ""))) }))
  .filter((row) => row.snapshot);
const trusted = joined.filter((row) => isTrusted(row.snapshot));
const acceptedSnapshots = snapshots.filter((row) => row.dataQuality?.accepted === true);
const acceptedWithZeroLatestVolume = acceptedSnapshots.filter((row) => Number(row.priceAction?.bars?.at(-1)?.volume) === 0);
const acceptedWithZeroVolumeRatio = acceptedSnapshots.filter((row) => Number(row.priceAction?.volumeRatio20Bar) === 0);
const acceptedWithZeroCloseLocation = acceptedSnapshots.filter((row) => Number(row.priceAction?.closeLocationPct) === 0);
const latestAccepted = [...acceptedSnapshots].sort((left, right) => Number(right.capturedAtMs) - Number(left.capturedAtMs)).slice(0, 5);

function summarize(rows: Row[]) {
  const directional = rows.filter((row) => row.fusionDirection === "CALL" || row.fusionDirection === "PUT");
  const aligned = directional.filter((row) => tapeDirection(row.snapshot) === row.fusionDirection);
  const conflicted = directional.filter((row) => {
    const tape = tapeDirection(row.snapshot);
    return tape !== "WAIT" && tape !== row.fusionDirection;
  });
  const chopDominant = directional.filter((row) => {
    const probabilities = row.snapshot.engineState?.fusion?.probabilities ?? {};
    const up = percent(probabilities.up);
    const down = percent(probabilities.down);
    const chop = percent(probabilities.chop);
    return chop >= up && chop >= down;
  });
  const lowConfidence = directional.filter((row) => Number(row.fusionConfidence) < 55);
  return {
    rows: rows.length,
    directional: directional.length,
    directionalWinRate: rate(directional),
    aligned: { count: aligned.length, winRate: rate(aligned) },
    conflicted: { count: conflicted.length, winRate: rate(conflicted) },
    chopDominant: { count: chopDominant.length, winRate: rate(chopDominant) },
    lowConfidence: { count: lowConfidence.length, winRate: rate(lowConfidence) },
    wait: rows.filter((row) => row.fusionDirection === "WAIT").length,
    flat: rows.filter((row) => row.result === "flat").length,
  };
}

console.log(JSON.stringify({
  symbol,
  snapshots: snapshots.length,
  joined15mOutcomes: joined.length,
  trusted15mOutcomes: trusted.length,
  captureQuality: {
    acceptedSnapshots: acceptedSnapshots.length,
    zeroLatestVolume: acceptedWithZeroLatestVolume.length,
    zeroVolumeRatio: acceptedWithZeroVolumeRatio.length,
    zeroCloseLocation: acceptedWithZeroCloseLocation.length,
    latest: latestAccepted.map((row) => ({
      capturedAt: row.capturedAt,
      price: row.price,
      direction: row.engineState?.fusion?.direction,
      confidence: row.engineState?.fusion?.confidence,
      change1BarPct: row.priceAction?.change1BarPct,
      closeLocationPct: row.priceAction?.closeLocationPct,
      volumeRatio20Bar: row.priceAction?.volumeRatio20Bar,
      correctedCompletedCandleMetrics: completedCandleMetrics(row),
      chop: percent(row.engineState?.fusion?.probabilities?.chop),
    })),
  },
  all: summarize(joined),
  trusted: summarize(trusted),
}, null, 2));