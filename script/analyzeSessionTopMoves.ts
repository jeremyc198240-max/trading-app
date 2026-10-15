import fs from 'node:fs';
import path from 'node:path';

type Direction = 'CALL' | 'PUT' | 'WAIT';
type RawRow = Record<string, any>;

interface Bar {
  timeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface MoveCandidate {
  symbol: string;
  sessionDate: string;
  entryTimeMs: number;
  extremeTimeMs: number;
  entryPrice: number;
  extremePrice: number;
  direction: Exclude<Direction, 'WAIT'>;
  magnitudePct: number;
}

interface MoveResult extends MoveCandidate {
  rank: number;
  snapshotTimeMs: number | null;
  leadMinutes: number | null;
  predictedDirection: Direction;
  confidence: number;
  directionCorrect: boolean;
  actionable: boolean;
  features: Record<string, number | string | boolean | null>;
}

const logsDir = path.resolve(process.cwd(), 'logs');
const outputPath = path.join(logsDir, 'session_top_moves_report.json');
const topMovesPerSession = Math.max(1, Number(process.argv[2] ?? 3));
const horizonBars = Math.max(1, Number(process.argv[3] ?? 6));
const minConfidence = Math.max(0, Number(process.argv[4] ?? 55));

function asNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function nyDate(timeMs: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timeMs));
}

function nyMinute(timeMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timeMs));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

function readSnapshots(): RawRow[] {
  if (!fs.existsSync(logsDir)) return [];
  return fs.readdirSync(logsDir)
    .filter((fileName) => /^black_box_15m_.*\.jsonl$/i.test(fileName))
    .sort()
    .flatMap((fileName) => fs.readFileSync(path.join(logsDir, fileName), 'utf8').split(/\r?\n/)
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const row = JSON.parse(line) as RawRow;
          return row.type === 'black_box_15m' && row.dataQuality?.accepted === true ? [row] : [];
        } catch {
          return [];
        }
      }));
}

function normalizeDirection(value: unknown): Direction {
  const direction = String(value ?? 'WAIT').toUpperCase();
  return direction === 'CALL' || direction === 'PUT' ? direction : 'WAIT';
}

function reconstructBars(snapshots: RawRow[]): Map<string, Bar[]> {
  const grouped = new Map<string, Map<number, Bar>>();
  for (const snapshot of snapshots) {
    const symbol = String(snapshot.symbol ?? '').toUpperCase();
    if (!symbol) continue;
    for (const rawBar of Array.isArray(snapshot.priceAction?.bars) ? snapshot.priceAction.bars : []) {
      const timeMs = asNumber(rawBar.timeMs);
      const bar: Bar = {
        timeMs,
        open: asNumber(rawBar.open),
        high: asNumber(rawBar.high),
        low: asNumber(rawBar.low),
        close: asNumber(rawBar.close),
        volume: asNumber(rawBar.volume),
      };
      const minute = nyMinute(timeMs);
      if (!timeMs || !bar.open || !bar.high || !bar.low || !bar.close || bar.volume <= 0 || minute < 570 || minute >= 960) continue;
      const key = `${symbol}|${nyDate(timeMs)}`;
      const sessionBars = grouped.get(key) ?? new Map<number, Bar>();
      sessionBars.set(timeMs, bar);
      grouped.set(key, sessionBars);
    }
  }
  return new Map(Array.from(grouped.entries()).map(([key, bars]) => [key, Array.from(bars.values()).sort((a, b) => a.timeMs - b.timeMs)]));
}

function findTopMoves(symbol: string, sessionDate: string, bars: Bar[]): MoveCandidate[] {
  const candidates: MoveCandidate[] = [];
  for (let index = 0; index < bars.length - 1; index += 1) {
    const entry = bars[index];
    const forward = bars.slice(index + 1, Math.min(bars.length, index + horizonBars + 1));
    if (!forward.length) continue;
    const highest = forward.reduce((best, bar) => bar.high > best.high ? bar : best, forward[0]);
    const lowest = forward.reduce((best, bar) => bar.low < best.low ? bar : best, forward[0]);
    const upPct = (highest.high - entry.close) / entry.close * 100;
    const downPct = (entry.close - lowest.low) / entry.close * 100;
    const callWins = upPct >= downPct;
    candidates.push({
      symbol,
      sessionDate,
      entryTimeMs: entry.timeMs,
      extremeTimeMs: callWins ? highest.timeMs : lowest.timeMs,
      entryPrice: entry.close,
      extremePrice: callWins ? highest.high : lowest.low,
      direction: callWins ? 'CALL' : 'PUT',
      magnitudePct: Number(Math.max(upPct, downPct).toFixed(3)),
    });
  }

  const selected: MoveCandidate[] = [];
  const minimumSeparationMs = horizonBars * 5 * 60 * 1000;
  for (const candidate of candidates.sort((left, right) => right.magnitudePct - left.magnitudePct)) {
    if (selected.some((move) => Math.abs(move.entryTimeMs - candidate.entryTimeMs) < minimumSeparationMs)) continue;
    selected.push(candidate);
    if (selected.length >= topMovesPerSession) break;
  }
  return selected.sort((left, right) => left.entryTimeMs - right.entryTimeMs);
}

function latestPriorSnapshot(move: MoveCandidate, snapshots: RawRow[]): RawRow | null {
  const eligible = snapshots.filter((snapshot) => {
    const candleTimeMs = asNumber(snapshot.candleTimeMs);
    return String(snapshot.symbol ?? '').toUpperCase() === move.symbol
      && nyDate(candleTimeMs) === move.sessionDate
      && candleTimeMs < move.entryTimeMs
      && move.entryTimeMs - candleTimeMs <= 30 * 60 * 1000;
  });
  return eligible.sort((left, right) => asNumber(right.candleTimeMs) - asNumber(left.candleTimeMs))[0] ?? null;
}

function featureSnapshot(snapshot: RawRow | null): MoveResult['features'] {
  if (!snapshot) return {};
  const probabilities = snapshot.engineState?.fusion?.probabilities ?? {};
  return {
    adx: asNumber(snapshot.engineState?.health?.adx, NaN),
    rsi: asNumber(snapshot.engineState?.health?.rsi, NaN),
    macd: asNumber(snapshot.engineState?.health?.macd, NaN),
    volumeRatio: asNumber(snapshot.priceAction?.volumeRatio20Bar, NaN),
    closeLocationPct: asNumber(snapshot.priceAction?.closeLocationPct, NaN),
    rangePct: asNumber(snapshot.priceAction?.range20BarPct, NaN),
    upProbability: asNumber(probabilities.up, NaN),
    downProbability: asNumber(probabilities.down, NaN),
    chopProbability: asNumber(probabilities.chop, NaN),
    mtfDirection: String(snapshot.engineState?.fusion?.mtf?.direction ?? snapshot.engineState?.fusion?.mtf?.bias ?? 'unknown'),
    orderBlockDirection: String(snapshot.engineState?.institutional?.orderBlock?.direction ?? 'neutral'),
    monsterHasPlay: Boolean(snapshot.engineState?.monster?.hasPlay),
    liquiditySweep: Boolean(snapshot.engineState?.patternSignals?.liquiditySweep),
    failedVwapReclaim: Boolean(snapshot.engineState?.patternSignals?.failedVwapReclaim),
  };
}

function average(rows: MoveResult[], feature: string): number | null {
  const values = rows.map((row) => row.features[feature]).filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(3)) : null;
}

function summarizeFeatures(rows: MoveResult[]): Record<string, number | null> {
  return Object.fromEntries(['adx', 'rsi', 'macd', 'volumeRatio', 'closeLocationPct', 'rangePct', 'upProbability', 'downProbability', 'chopProbability']
    .map((feature) => [feature, average(rows, feature)]));
}

function main(): void {
  const snapshots = readSnapshots();
  const reconstructed = reconstructBars(snapshots);
  const moves: MoveResult[] = [];

  for (const [key, bars] of reconstructed.entries()) {
    const separator = key.indexOf('|');
    const symbol = key.slice(0, separator);
    const sessionDate = key.slice(separator + 1);
    findTopMoves(symbol, sessionDate, bars).forEach((move, index) => {
      const snapshot = latestPriorSnapshot(move, snapshots);
      const predictedDirection = normalizeDirection(snapshot?.engineState?.fusion?.direction);
      const confidence = asNumber(snapshot?.engineState?.fusion?.confidence);
      const directionCorrect = predictedDirection === move.direction;
      moves.push({
        ...move,
        rank: index + 1,
        snapshotTimeMs: snapshot ? asNumber(snapshot.candleTimeMs) : null,
        leadMinutes: snapshot ? Number(((move.entryTimeMs - asNumber(snapshot.candleTimeMs)) / 60000).toFixed(1)) : null,
        predictedDirection,
        confidence,
        directionCorrect,
        actionable: directionCorrect && confidence >= minConfidence,
        features: featureSnapshot(snapshot),
      });
    });
  }

  const withSnapshot = moves.filter((move) => move.snapshotTimeMs != null);
  const correct = withSnapshot.filter((move) => move.directionCorrect);
  const actionable = withSnapshot.filter((move) => move.actionable);
  const missed = withSnapshot.filter((move) => !move.actionable);
  const sessions = new Set(moves.map((move) => `${move.symbol}|${move.sessionDate}`)).size;
  const report = {
    generatedAt: new Date().toISOString(),
    methodology: {
      topMovesPerSession,
      horizonBars,
      horizonMinutes: horizonBars * 5,
      minConfidence,
      lookaheadControl: 'Only the latest accepted snapshot with candleTimeMs strictly before the candidate move is evaluated.',
      caveat: 'Move labels use underlying OHLC. Contract profitability still requires historical option quotes or the versioned 0DTE premium proxy.',
    },
    coverage: {
      snapshots: snapshots.length,
      sessions,
      reconstructedBars: Array.from(reconstructed.values()).reduce((sum, bars) => sum + bars.length, 0),
      topMoves: moves.length,
      movesWithPriorSnapshot: withSnapshot.length,
    },
    performance: {
      directionCorrect: correct.length,
      directionAccuracyPct: withSnapshot.length ? Number((correct.length / withSnapshot.length * 100).toFixed(1)) : 0,
      actionable: actionable.length,
      actionableRecallPct: withSnapshot.length ? Number((actionable.length / withSnapshot.length * 100).toFixed(1)) : 0,
      waitPredictions: withSnapshot.filter((move) => move.predictedDirection === 'WAIT').length,
      wrongDirection: withSnapshot.filter((move) => move.predictedDirection !== 'WAIT' && !move.directionCorrect).length,
    },
    featureComparison: {
      actionable: summarizeFeatures(actionable),
      missed: summarizeFeatures(missed),
    },
    bySymbol: Array.from(new Set(moves.map((move) => move.symbol))).sort().map((symbol) => {
      const symbolMoves = moves.filter((move) => move.symbol === symbol && move.snapshotTimeMs != null);
      const symbolActionable = symbolMoves.filter((move) => move.actionable);
      return {
        symbol,
        moves: symbolMoves.length,
        actionable: symbolActionable.length,
        actionableRecallPct: symbolMoves.length ? Number((symbolActionable.length / symbolMoves.length * 100).toFixed(1)) : 0,
        averageMovePct: symbolMoves.length ? Number((symbolMoves.reduce((sum, move) => sum + move.magnitudePct, 0) / symbolMoves.length).toFixed(3)) : 0,
      };
    }),
    moves,
  };

  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ outputPath, coverage: report.coverage, performance: report.performance, bySymbol: report.bySymbol }, null, 2));
}

main();