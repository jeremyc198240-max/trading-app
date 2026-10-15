import fs from 'node:fs';
import path from 'node:path';

type Outcome = 'win' | 'loss' | 'other';

type RawRow = Record<string, any>;

interface FingerprintRow {
  symbol: string;
  direction: 'bullish' | 'bearish' | 'neutral';
  timeframe: string;
  session: string;
  phase: string;
  volumeBucket: string;
  momentumBucket: string;
  adxBucket: string;
  bbWidthBucket: string;
  traitSignature: string;
  outcome: Outcome;
}

interface PatternStat {
  key: string;
  sample: number;
  wins: number;
  losses: number;
  winRate: number;
  symbol: string;
  direction: string;
  timeframe: string;
  session: string;
  phase: string;
  volumeBucket: string;
  momentumBucket: string;
  adxBucket: string;
  bbWidthBucket: string;
  traitSignature: string;
  liftVsSymbolDirection: number;
}

const logsDir = path.resolve(process.cwd(), 'logs');
const sourcePath = path.join(logsDir, 'breakout_alert_history.json');
const outputPath = path.join(logsDir, 'repeated_algo_pattern_report.json');

const MIN_SAMPLE = Number(process.argv[2] ?? 8);

function asNumber(value: unknown, fallback = NaN): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function classifyOutcome(raw: RawRow): Outcome {
  const text = String(raw.outcome ?? '').toLowerCase();
  if (text.startsWith('win')) return 'win';
  if (text === 'loss' || text.includes('stop')) return 'loss';
  return 'other';
}

function sessionBucket(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return 'unknown';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(timestamp));
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 'unknown';
  const m = hour * 60 + minute;
  if (m < 600) return 'open_0930_0959';
  if (m < 660) return 'morning_1000_1059';
  if (m < 750) return 'midday_1100_1229';
  if (m < 840) return 'afternoon_1230_1359';
  if (m < 960) return 'late_1400_1559';
  return 'offhours';
}

function bucketVolume(value: number): string {
  if (!Number.isFinite(value)) return 'vol_unknown';
  if (value < 1.0) return 'vol_lt_1.0';
  if (value < 1.1) return 'vol_1.0_1.1';
  if (value < 1.25) return 'vol_1.1_1.25';
  if (value < 1.5) return 'vol_1.25_1.5';
  return 'vol_ge_1.5';
}

function bucketMomentum(value: number): string {
  if (!Number.isFinite(value)) return 'mom_unknown';
  const abs = Math.abs(value);
  if (abs < 25) return 'mom_lt_25';
  if (abs < 35) return 'mom_25_35';
  if (abs < 50) return 'mom_35_50';
  if (abs < 65) return 'mom_50_65';
  return 'mom_ge_65';
}

function bucketAdx(value: number): string {
  if (!Number.isFinite(value)) return 'adx_unknown';
  if (value < 20) return 'adx_lt_20';
  if (value < 25) return 'adx_20_25';
  if (value < 30) return 'adx_25_30';
  if (value < 35) return 'adx_30_35';
  return 'adx_ge_35';
}

function bucketBbWidth(value: number): string {
  if (!Number.isFinite(value)) return 'bbw_unknown';
  if (value < 0.5) return 'bbw_lt_0.5';
  if (value < 0.8) return 'bbw_0.5_0.8';
  if (value < 1.2) return 'bbw_0.8_1.2';
  return 'bbw_ge_1.2';
}

function traitSignature(raw: RawRow): string {
  const traitsRaw = Array.isArray(raw.preBreakoutSetup?.traits) ? raw.preBreakoutSetup.traits : [];
  const keep = traitsRaw.filter((t: unknown) => typeof t === 'string').map((t: string) => t.trim()).filter(Boolean);
  const prioritized = keep.filter((t: string) =>
    t.startsWith('PRE_') ||
    t.startsWith('REPEAT_') ||
    t === 'MTF_ALIGNMENT' ||
    t === 'TV_CONFIRMATION' ||
    t === 'EDGE_TRIGGERED' ||
    t === 'EARLY_SESSION_FLOW',
  );
  if (prioritized.length === 0) return 'traits_none';
  return prioritized.sort().join('+');
}

function strictReal(raw: RawRow): boolean {
  const warnings = Array.isArray(raw.warnings) ? raw.warnings.map((w) => String(w)) : [];
  return !warnings.some((w) => /TV_DERIVED_NO_OHLC|SIMULATED|DEGRADED/i.test(w));
}

function toFingerprint(raw: RawRow): FingerprintRow | null {
  if (!strictReal(raw)) return null;
  const outcome = classifyOutcome(raw);
  if (outcome === 'other') return null;

  const symbol = String(raw.symbol ?? '').toUpperCase();
  if (!symbol) return null;

  const directionRaw = String(raw.direction ?? 'neutral').toLowerCase();
  const direction: 'bullish' | 'bearish' | 'neutral' =
    directionRaw === 'bullish' || directionRaw === 'bearish' ? directionRaw : 'neutral';

  const timestamp = asNumber(raw.timestamp);
  const timeframe = String(raw.timeframe ?? 'unknown');
  const phase = String(raw.compression?.phase ?? 'UNKNOWN').toUpperCase();
  const volumeRatio = asNumber(raw.volumeSpike, asNumber(raw.compression?.volRatio));
  const momentum = asNumber(raw.momentumStrength, asNumber(raw.edgeEngine?.indicators?.momentum));
  const adx = asNumber(raw.edgeEngine?.indicators?.adx, asNumber(raw.tvAdx));
  const bbWidth = asNumber(raw.compression?.bbWidth);

  return {
    symbol,
    direction,
    timeframe,
    session: sessionBucket(timestamp),
    phase,
    volumeBucket: bucketVolume(volumeRatio),
    momentumBucket: bucketMomentum(momentum),
    adxBucket: bucketAdx(adx),
    bbWidthBucket: bucketBbWidth(bbWidth),
    traitSignature: traitSignature(raw),
    outcome,
  };
}

function keyFor(row: FingerprintRow): string {
  return [
    row.symbol,
    row.direction,
    row.timeframe,
    row.session,
    row.phase,
    row.volumeBucket,
    row.momentumBucket,
    row.adxBucket,
    row.bbWidthBucket,
    row.traitSignature,
  ].join('|');
}

function baselineMap(rows: FingerprintRow[]): Map<string, number> {
  const byBase = new Map<string, { wins: number; losses: number }>();
  for (const row of rows) {
    const base = `${row.symbol}|${row.direction}`;
    const current = byBase.get(base) ?? { wins: 0, losses: 0 };
    if (row.outcome === 'win') current.wins += 1;
    if (row.outcome === 'loss') current.losses += 1;
    byBase.set(base, current);
  }

  const out = new Map<string, number>();
  for (const [base, stat] of byBase.entries()) {
    const total = stat.wins + stat.losses;
    out.set(base, total > 0 ? (stat.wins / total) * 100 : 0);
  }
  return out;
}

function summarize(rows: FingerprintRow[]): PatternStat[] {
  const byKey = new Map<string, { row: FingerprintRow; wins: number; losses: number }>();
  const baselines = baselineMap(rows);

  for (const row of rows) {
    const key = keyFor(row);
    const current = byKey.get(key) ?? { row, wins: 0, losses: 0 };
    if (row.outcome === 'win') current.wins += 1;
    if (row.outcome === 'loss') current.losses += 1;
    byKey.set(key, current);
  }

  const result: PatternStat[] = [];
  for (const [key, value] of byKey.entries()) {
    const sample = value.wins + value.losses;
    if (sample < MIN_SAMPLE) continue;
    const winRate = (value.wins / sample) * 100;
    const baseline = baselines.get(`${value.row.symbol}|${value.row.direction}`) ?? 0;
    result.push({
      key,
      sample,
      wins: value.wins,
      losses: value.losses,
      winRate: Number(winRate.toFixed(2)),
      symbol: value.row.symbol,
      direction: value.row.direction,
      timeframe: value.row.timeframe,
      session: value.row.session,
      phase: value.row.phase,
      volumeBucket: value.row.volumeBucket,
      momentumBucket: value.row.momentumBucket,
      adxBucket: value.row.adxBucket,
      bbWidthBucket: value.row.bbWidthBucket,
      traitSignature: value.row.traitSignature,
      liftVsSymbolDirection: Number((winRate - baseline).toFixed(2)),
    });
  }

  return result;
}

function topBy(rows: PatternStat[], selector: (row: PatternStat) => number, limit = 20): PatternStat[] {
  return [...rows].sort((a, b) => selector(b) - selector(a)).slice(0, limit);
}

function volumeDiagnostics(rows: FingerprintRow[]) {
  const volumeMap = new Map<string, { sample: number; wins: number; losses: number }>();

  for (const row of rows) {
    const key = `${row.symbol}|${row.direction}|${row.volumeBucket}`;
    const current = volumeMap.get(key) ?? { sample: 0, wins: 0, losses: 0 };
    current.sample += 1;
    if (row.outcome === 'win') current.wins += 1;
    if (row.outcome === 'loss') current.losses += 1;
    volumeMap.set(key, current);
  }

  const report = Array.from(volumeMap.entries()).map(([key, value]) => {
    const [symbol, direction, volumeBucket] = key.split('|');
    const winRate = value.sample > 0 ? (value.wins / value.sample) * 100 : 0;
    return {
      symbol,
      direction,
      volumeBucket,
      sample: value.sample,
      winRate: Number(winRate.toFixed(2)),
    };
  }).filter((row) => row.sample >= MIN_SAMPLE)
    .sort((a, b) => {
      if (a.symbol !== b.symbol) return a.symbol.localeCompare(b.symbol);
      if (a.direction !== b.direction) return a.direction.localeCompare(b.direction);
      return b.winRate - a.winRate;
    });

  return report;
}

function main() {
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Missing source file: ${sourcePath}`);
  }

  const raw = JSON.parse(fs.readFileSync(sourcePath, 'utf8')) as RawRow[];
  const usable = raw.map(toFingerprint).filter((row): row is FingerprintRow => row != null);

  const stats = summarize(usable);
  const strongest = topBy(
    stats.filter((row) => row.winRate >= 55 && row.liftVsSymbolDirection >= 5),
    (row) => row.liftVsSymbolDirection * Math.log10(row.sample + 1),
  );
  const weakest = topBy(
    stats.filter((row) => row.winRate <= 45 && row.liftVsSymbolDirection <= -5),
    (row) => Math.abs(row.liftVsSymbolDirection) * Math.log10(row.sample + 1),
  );

  const volumeReport = volumeDiagnostics(usable);

  const payload = {
    generatedAt: new Date().toISOString(),
    minSample: MIN_SAMPLE,
    sourceRows: raw.length,
    usableRows: usable.length,
    uniqueFingerprints: stats.length,
    strongestFingerprints: strongest,
    weakestFingerprints: weakest,
    volumeDiagnostics: volumeReport,
  };

  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2), 'utf8');

  console.log(`[REPEAT_MINE] source=${raw.length} usable=${usable.length} patterns=${stats.length}`);
  console.log(`[REPEAT_MINE] strongest=${strongest.length} weakest=${weakest.length}`);
  console.log(`[REPEAT_MINE] output=${outputPath}`);
}

main();
