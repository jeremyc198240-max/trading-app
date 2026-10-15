import fs from "fs";
import path from "path";
import type { OHLC } from "./fusion";

const LOGS_DIR = path.join("logs");
const RETENTION_DAYS = 90;
const HORIZONS_MINUTES = [15] as const;
const FLAT_MOVE_THRESHOLD = 0.0007;
const MODEL_VERSION = "war-room-gauges-v2";
const LEGACY_MODEL_VERSION = "war-room-gauges-v1";

export type WarRoomGaugeDirection = "CALL" | "PUT" | "WAIT";

export interface WarRoomGaugeValue {
  name: string;
  score: number;
  confidence: number;
  reliability: number;
  direction: WarRoomGaugeDirection;
}

export interface WarRoomGaugeCapture {
  snapshotId: string;
  symbol: string;
  timeframe: string;
  capturedAtMs: number;
  candleTimeMs: number;
  price: number;
  marketRegime: string;
  features: Record<string, number | boolean | null>;
  feedFresh: boolean;
  feedAgeMs: number | null;
  gauges: WarRoomGaugeValue[];
}

type GaugeOutcome = {
  type: "war_room_gauge_outcome";
  outcomeId: string;
  snapshotId: string;
  modelVersion: string;
  symbol: string;
  timeframe: string;
  gauge: WarRoomGaugeValue;
  horizonMinutes: number;
  isPrimaryHorizon: boolean;
  capturedAtMs: number;
  resolvedAtMs: number;
  capturePrice: number;
  resolvedPrice: number;
  movePct: number;
  marketRegime: string;
  result: "win" | "loss" | "flat" | "neutral";
  feedFresh: boolean;
  feedAgeMs: number | null;
};

const snapshotIds = new Set<string>();
const snapshotSymbols = new Map<string, number>();
const snapshotsBySymbol = new Map<string, Array<Record<string, any>>>();
const outcomeIds = new Set<string>();
const outcomeRows: GaugeOutcome[] = [];
let indexesLoaded = false;

function nyDateKey(timestamp: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(timestamp)).replace(/\//g, "-");
}

function readJsonl(fileName: string): Array<Record<string, any>> {
  const filePath = path.join(LOGS_DIR, fileName);
  if (!fs.existsSync(filePath)) return [];
  const records: Array<Record<string, any>> = [];
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line) as Record<string, any>);
    } catch (error) {
      console.warn(`[WarRoomCalibration] Skipping malformed record in ${fileName}:`, error);
    }
  }
  return records;
}

function ensureIndexesLoaded(): void {
  if (indexesLoaded) return;
  if (fs.existsSync(LOGS_DIR)) {
    for (const fileName of fs.readdirSync(LOGS_DIR)) {
      if (/^war_room_gauges_.*\.jsonl$/i.test(fileName)) {
        for (const row of readJsonl(fileName)) {
          if (typeof row.snapshotId === "string") snapshotIds.add(row.snapshotId);
          if (typeof row.symbol === "string" && Number.isFinite(row.capturedAtMs)) {
            snapshotSymbols.set(row.symbol, Math.max(snapshotSymbols.get(row.symbol) ?? 0, Number(row.capturedAtMs)));
            const symbolSnapshots = snapshotsBySymbol.get(row.symbol) ?? [];
            symbolSnapshots.push(row);
            snapshotsBySymbol.set(row.symbol, symbolSnapshots);
          }
        }
      } else if (/^war_room_gauge_outcomes_.*\.jsonl$/i.test(fileName)) {
        for (const row of readJsonl(fileName)) {
          if (typeof row.outcomeId === "string") outcomeIds.add(row.outcomeId);
          if (row.type === "war_room_gauge_outcome") outcomeRows.push(row as GaugeOutcome);
        }
      }
    }
  }
  indexesLoaded = true;
}

export function isValidWarRoomGaugeCapture(value: unknown): value is WarRoomGaugeCapture {
  if (!value || typeof value !== "object") return false;
  const capture = value as Partial<WarRoomGaugeCapture>;
  const now = Date.now();
  return typeof capture.snapshotId === "string" && capture.snapshotId.length > 0 && capture.snapshotId.length <= 180 &&
    typeof capture.symbol === "string" && /^[A-Z0-9.-]{1,12}$/i.test(capture.symbol) &&
    typeof capture.timeframe === "string" && capture.timeframe.length > 0 && capture.timeframe.length <= 12 &&
    Number.isFinite(capture.capturedAtMs) && capture.capturedAtMs! >= now - RETENTION_DAYS * 86400000 && capture.capturedAtMs! <= now + 60_000 &&
    Number.isFinite(capture.candleTimeMs) && capture.candleTimeMs! <= capture.capturedAtMs! + 60_000 &&
    Number.isFinite(capture.price) && capture.price! > 0 &&
    typeof capture.marketRegime === "string" && /^[a-z0-9_-]{1,32}$/i.test(capture.marketRegime) &&
    capture.features != null && typeof capture.features === "object" && !Array.isArray(capture.features) &&
    Object.keys(capture.features).length <= 32 &&
    Object.entries(capture.features).every(([name, feature]) =>
      /^[a-z0-9_-]{1,40}$/i.test(name) &&
      (feature == null || typeof feature === "boolean" || typeof feature === "number" && Number.isFinite(feature)),
    ) &&
    typeof capture.feedFresh === "boolean" &&
    (capture.feedAgeMs == null || Number.isFinite(capture.feedAgeMs) && capture.feedAgeMs >= 0) &&
    Array.isArray(capture.gauges) && capture.gauges.length > 0 && capture.gauges.length <= 12 &&
    new Set(capture.gauges.map((gauge) => gauge?.name)).size === capture.gauges.length &&
    capture.gauges.every((gauge) =>
      gauge && typeof gauge.name === "string" && /^[a-z0-9_-]{1,32}$/i.test(gauge.name) &&
      Number.isFinite(gauge.score) && gauge.score >= 0 && gauge.score <= 100 &&
      Number.isFinite(gauge.confidence) && gauge.confidence >= 0 && gauge.confidence <= 100 &&
      Number.isFinite(gauge.reliability) && gauge.reliability >= 0 && gauge.reliability <= 100 &&
      (gauge.direction === "CALL" || gauge.direction === "PUT" || gauge.direction === "WAIT"),
    );
}

export function appendWarRoomGaugeCapture(capture: WarRoomGaugeCapture): boolean {
  ensureIndexesLoaded();
  if (snapshotIds.has(capture.snapshotId)) return false;

  const receivedAt = Date.now();
  const record = {
    ...capture,
    type: "war_room_gauge_capture",
    schemaVersion: 1,
    modelVersion: MODEL_VERSION,
    capturedAt: new Date(capture.capturedAtMs).toISOString(),
    recordedAt: new Date(receivedAt).toISOString(),
    symbol: capture.symbol.trim().toUpperCase(),
  };
  fs.mkdirSync(LOGS_DIR, { recursive: true });
  fs.appendFileSync(
    path.join(LOGS_DIR, `war_room_gauges_${nyDateKey(receivedAt)}.jsonl`),
    `${JSON.stringify(record)}\n`,
    "utf8",
  );
  snapshotIds.add(capture.snapshotId);
  const symbol = capture.symbol.trim().toUpperCase();
  snapshotSymbols.set(symbol, Math.max(snapshotSymbols.get(symbol) ?? 0, capture.capturedAtMs));
  const symbolSnapshots = snapshotsBySymbol.get(symbol) ?? [];
  symbolSnapshots.push(record);
  snapshotsBySymbol.set(symbol, symbolSnapshots);
  pruneLogs(receivedAt);
  return true;
}

function pruneLogs(now: number): void {
  const cutoff = now - RETENTION_DAYS * 86400000;
  for (const fileName of fs.readdirSync(LOGS_DIR)) {
    if (!/^war_room_gauge(s|_outcomes)_.*\.jsonl$/i.test(fileName)) continue;
    const filePath = path.join(LOGS_DIR, fileName);
    if (fs.statSync(filePath).mtimeMs < cutoff) fs.unlinkSync(filePath);
  }
  for (const [symbol, capturedAtMs] of snapshotSymbols) {
    if (capturedAtMs < cutoff) snapshotSymbols.delete(symbol);
  }
  for (const [symbol, snapshots] of snapshotsBySymbol) {
    const recent = snapshots.filter((snapshot) => Number(snapshot.capturedAtMs) >= cutoff);
    if (recent.length) snapshotsBySymbol.set(symbol, recent);
    else snapshotsBySymbol.delete(symbol);
  }
  for (let index = outcomeRows.length - 1; index >= 0; index--) {
    if (outcomeRows[index].capturedAtMs < cutoff) outcomeRows.splice(index, 1);
  }
}

export function getWarRoomGaugeSymbols(): string[] {
  ensureIndexesLoaded();
  const cutoff = Date.now() - RETENTION_DAYS * 86400000;
  return [...snapshotSymbols.entries()]
    .filter(([, capturedAtMs]) => capturedAtMs >= cutoff)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 20)
    .map(([symbol]) => symbol);
}

function readSnapshots(symbol: string): Array<Record<string, any>> {
  return snapshotsBySymbol.get(symbol) ?? [];
}

export function resolveWarRoomGaugeOutcomes(symbol: string, candles: OHLC[]): void {
  if (!candles.length || !fs.existsSync(LOGS_DIR)) return;
  ensureIndexesLoaded();
  const normalizedSymbol = symbol.toUpperCase();
  const outcomes: GaugeOutcome[] = [];
  const latestByTime = [...candles].sort((left, right) =>
    Number(left.timeMs ?? (left.time ? left.time * 1000 : 0)) -
    Number(right.timeMs ?? (right.time ? right.time * 1000 : 0)),
  );

  for (const snapshot of readSnapshots(normalizedSymbol)) {
    const captureTimeMs = Number(snapshot.capturedAtMs);
    const capturePrice = Number(snapshot.price);
    if (!Number.isFinite(captureTimeMs) || !Number.isFinite(capturePrice) || capturePrice <= 0) continue;

    for (const horizonMinutes of HORIZONS_MINUTES) {
      const outcomeId = `${snapshot.snapshotId}:${horizonMinutes}`;
      const targetTimeMs = captureTimeMs + horizonMinutes * 60_000;
      const resolvedBar = latestByTime.find((bar) =>
        Number(bar.timeMs ?? (bar.time ? bar.time * 1000 : 0)) >= targetTimeMs &&
        Number(bar.timeMs ?? (bar.time ? bar.time * 1000 : 0)) <= targetTimeMs + 5 * 60_000,
      );
      if (!resolvedBar) continue;

      const resolvedTimeMs = Number(resolvedBar.timeMs ?? (resolvedBar.time ? resolvedBar.time * 1000 : 0));
      const resolvedPrice = Number(resolvedBar.close);
      if (!Number.isFinite(resolvedPrice) || resolvedPrice <= 0) continue;
      const move = (resolvedPrice - capturePrice) / capturePrice;
      for (const gauge of snapshot.gauges as WarRoomGaugeValue[]) {
        const gaugeOutcomeId = `${outcomeId}:${gauge.name}`;
        if (outcomeIds.has(gaugeOutcomeId)) continue;
        const result = Math.abs(move) < FLAT_MOVE_THRESHOLD
          ? "flat"
          : gauge.direction === "WAIT"
            ? "neutral"
            : (gauge.direction === "CALL" ? move > 0 : move < 0) ? "win" : "loss";
        outcomes.push({
          type: "war_room_gauge_outcome",
          outcomeId: gaugeOutcomeId,
          snapshotId: snapshot.snapshotId,
          modelVersion: snapshot.modelVersion ?? LEGACY_MODEL_VERSION,
          symbol: normalizedSymbol,
          timeframe: snapshot.timeframe,
          gauge,
          horizonMinutes,
          isPrimaryHorizon: horizonMinutes === HORIZONS_MINUTES[0],
          capturedAtMs: Number(snapshot.capturedAtMs),
          resolvedAtMs: resolvedTimeMs,
          capturePrice,
          resolvedPrice,
          movePct: Number((move * 100).toFixed(3)),
          marketRegime: String(snapshot.marketRegime ?? "unknown"),
          result,
          feedFresh: snapshot.feedFresh === true,
          feedAgeMs: Number.isFinite(snapshot.feedAgeMs) ? snapshot.feedAgeMs : null,
        });
      }
    }
  }

  if (!outcomes.length) return;
  fs.appendFileSync(
    path.join(LOGS_DIR, `war_room_gauge_outcomes_${nyDateKey(Date.now())}.jsonl`),
    `${outcomes.map((outcome) => JSON.stringify(outcome)).join("\n")}\n`,
    "utf8",
  );
  for (const outcome of outcomes) outcomeIds.add(outcome.outcomeId);
  outcomeRows.push(...outcomes);
}

function summarizeOutcomes(rows: GaugeOutcome[]) {
  const freshRows = rows.filter((row) => row.feedFresh);
  const wins = freshRows.filter((row) => row.result === "win").length;
  const losses = freshRows.filter((row) => row.result === "loss").length;
  const flats = freshRows.filter((row) => row.result === "flat").length;
  const neutrals = freshRows.filter((row) => row.result === "neutral").length;
  const decisive = wins + losses;
  const regimes = [...new Set(freshRows.map((row) => row.marketRegime || "unknown"))].map((marketRegime) => {
    const regimeRows = freshRows.filter((row) => (row.marketRegime || "unknown") === marketRegime);
    const regimeWins = regimeRows.filter((row) => row.result === "win").length;
    const regimeLosses = regimeRows.filter((row) => row.result === "loss").length;
    const regimeDecisive = regimeWins + regimeLosses;
    return {
      name: marketRegime,
      total: regimeRows.length,
      wins: regimeWins,
      losses: regimeLosses,
      flats: regimeRows.filter((row) => row.result === "flat").length,
      neutrals: regimeRows.filter((row) => row.result === "neutral").length,
      decisive: regimeDecisive,
      winRate: regimeDecisive ? Number((regimeWins / regimeDecisive * 100).toFixed(1)) : null,
    };
  });
  const bins = [
    { label: "0-39", min: 0, max: 40 },
    { label: "40-59", min: 40, max: 60 },
    { label: "60-79", min: 60, max: 80 },
    { label: "80-100", min: 80, max: 101 },
  ].map(({ label, min, max }) => {
    const bucket = freshRows.filter((row) => row.gauge.score >= min && row.gauge.score < max);
    const bucketWins = bucket.filter((row) => row.result === "win").length;
    const bucketLosses = bucket.filter((row) => row.result === "loss").length;
    const bucketDecisive = bucketWins + bucketLosses;
    return {
      label,
      total: bucket.length,
      wins: bucketWins,
      losses: bucketLosses,
      flats: bucket.filter((row) => row.result === "flat").length,
      neutrals: bucket.filter((row) => row.result === "neutral").length,
      winRate: bucketDecisive ? Number((bucketWins / bucketDecisive * 100).toFixed(1)) : null,
    };
  });
  return {
    total: rows.length,
    fresh: freshRows.length,
    stale: rows.length - freshRows.length,
    wins,
    losses,
    flats,
    neutrals,
    decisive,
    winRate: decisive ? Number((wins / decisive * 100).toFixed(1)) : null,
    regimes,
    bins,
  };
}

export function getWarRoomGaugeCalibration(hours = 168, symbol?: string, timeframe?: string) {
  ensureIndexesLoaded();
  const boundedHours = Number.isFinite(hours) ? Math.min(24 * 90, Math.max(1, hours)) : 168;
  const cutoff = Date.now() - boundedHours * 3600000;
  const normalizedSymbol = symbol?.trim().toUpperCase();
  const scoped = outcomeRows.filter((row) =>
    row.type === "war_room_gauge_outcome" &&
    row.modelVersion === MODEL_VERSION &&
    row.isPrimaryHorizon &&
    row.horizonMinutes === HORIZONS_MINUTES[0] &&
    row.capturedAtMs >= cutoff &&
    (!normalizedSymbol || row.symbol === normalizedSymbol) &&
    (!timeframe || row.timeframe === timeframe),
  );
  const names = [...new Set(scoped.map((row) => row.gauge.name))];
  const gauges = names.map((name) => ({
    name,
    ...summarizeOutcomes(scoped.filter((row) => row.gauge.name === name)),
  }));
  const snapshots = [...snapshotsBySymbol.values()]
    .flat()
    .filter((row) =>
      row.type === "war_room_gauge_capture" &&
      row.modelVersion === MODEL_VERSION &&
      Number(row.capturedAtMs) >= cutoff &&
      (!normalizedSymbol || row.symbol === normalizedSymbol) &&
      (!timeframe || row.timeframe === timeframe),
    )
    .sort((left, right) => Number(right.capturedAtMs) - Number(left.capturedAtMs))
    .slice(0, 12)
    .map((row) => ({
      snapshotId: row.snapshotId,
      symbol: row.symbol,
      timeframe: row.timeframe,
      capturedAtMs: row.capturedAtMs,
      marketRegime: row.marketRegime ?? "unknown",
      features: row.features ?? {},
      feedFresh: row.feedFresh === true,
      feedAgeMs: row.feedAgeMs ?? null,
      gauges: row.gauges,
      outcomes: outcomeRows.filter((outcome) =>
        outcome.snapshotId === row.snapshotId && outcome.horizonMinutes === HORIZONS_MINUTES[0],
      ).map((outcome) => ({
        gauge: outcome.gauge.name,
        result: outcome.result,
        movePct: outcome.movePct,
      })),
    }));
  return {
    success: true,
    modelVersion: MODEL_VERSION,
    horizonMinutes: HORIZONS_MINUTES[0],
    lookbackHours: boundedHours,
    gauges,
    recentSnapshots: snapshots,
    timestamp: Date.now(),
  };
}
