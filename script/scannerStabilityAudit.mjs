const args = process.argv.slice(2);

function getArg(name, fallback) {
  const idx = args.findIndex((a) => a === `--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return fallback;
  const raw = args[idx + 1];
  const num = Number(raw);
  return Number.isFinite(num) ? num : fallback;
}

const snapshots = Math.max(2, getArg('snapshots', 3));
const sleepMs = Math.max(1000, getArg('sleepMs', 65000));
const scoreJumpThreshold = getArg('scoreJumpThreshold', 8);
const endpoint = 'http://localhost:5000/api/scanner/results';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function sleepWithProgress(ms, tickMs = 10000) {
  const started = Date.now();
  while (true) {
    const elapsed = Date.now() - started;
    const remaining = ms - elapsed;
    if (remaining <= 0) {
      return;
    }
    const step = Math.min(tickMs, remaining);
    await sleep(step);
    const nowRemaining = Math.max(0, ms - (Date.now() - started));
    console.log(`WAIT remainingMs=${nowRemaining}`);
  }
}

function compactRow(row) {
  return {
    symbol: row.symbol,
    signal: row.breakoutSignal,
    score: Number(row.breakoutScore ?? 0),
    degraded: Boolean(row.isDegraded),
    bias: row?.timeframeStack?.bias ?? 'n/a',
  };
}

function didFlip(a, b, threshold) {
  if (!a || !b) return false;
  if (a.signal !== b.signal) return true;
  if (a.bias !== b.bias) return true;
  if (a.degraded !== b.degraded) return true;
  if (Math.abs(a.score - b.score) >= threshold) return true;
  return false;
}

async function takeSnapshot() {
  const res = await fetch(endpoint, { method: 'GET' });
  if (!res.ok) {
    throw new Error(`Snapshot request failed: ${res.status}`);
  }
  const data = await res.json();
  const map = new Map();
  for (const row of data) {
    const c = compactRow(row);
    map.set(c.symbol, c);
  }
  return map;
}

async function main() {
  const samples = [];
  for (let i = 0; i < snapshots; i += 1) {
    console.log(`SNAPSHOT_START index=${i + 1}/${snapshots}`);
    samples.push(await takeSnapshot());
    console.log(`SNAPSHOT_DONE index=${i + 1}/${snapshots}`);
    if (i < snapshots - 1) {
      await sleepWithProgress(sleepMs);
    }
  }

  const symbols = Array.from(samples[0].keys()).sort();
  const transitionsPerSymbol = snapshots - 1;

  let totalTransitions = 0;
  let totalFlipTransitions = 0;
  const perSymbol = [];

  for (const symbol of symbols) {
    let flips = 0;
    let signalFlips = 0;
    let biasFlips = 0;
    let degradedFlips = 0;
    let scoreJumps = 0;

    for (let i = 1; i < samples.length; i += 1) {
      const prev = samples[i - 1].get(symbol);
      const curr = samples[i].get(symbol);
      if (!prev || !curr) continue;
      totalTransitions += 1;

      let changed = false;
      if (prev.signal !== curr.signal) {
        signalFlips += 1;
        changed = true;
      }
      if (prev.bias !== curr.bias) {
        biasFlips += 1;
        changed = true;
      }
      if (prev.degraded !== curr.degraded) {
        degradedFlips += 1;
        changed = true;
      }
      if (Math.abs(prev.score - curr.score) >= scoreJumpThreshold) {
        scoreJumps += 1;
        changed = true;
      }
      if (changed) {
        flips += 1;
        totalFlipTransitions += 1;
      }
    }

    perSymbol.push({
      symbol,
      transitions: transitionsPerSymbol,
      flipTransitions: flips,
      signalFlips,
      biasFlips,
      degradedFlips,
      scoreJumpsGeThreshold: scoreJumps,
    });
  }

  const flipRatePct = totalTransitions > 0
    ? Number(((totalFlipTransitions / totalTransitions) * 100).toFixed(2))
    : 0;

  console.log(
    `AUDIT snapshots=${snapshots} transitionsPerSymbol=${transitionsPerSymbol} symbols=${symbols.length} totalTransitions=${totalTransitions} totalFlipTransitions=${totalFlipTransitions} flipRatePct=${flipRatePct}`
  );

  for (const row of perSymbol) {
    console.log(
      `${row.symbol} transitions=${row.transitions} flipTransitions=${row.flipTransitions} signalFlips=${row.signalFlips} biasFlips=${row.biasFlips} degradedFlips=${row.degradedFlips} scoreJumpsGeThreshold=${row.scoreJumpsGeThreshold}`
    );
  }
}

main().catch((err) => {
  console.error(`AUDIT_ERROR ${err.message}`);
  process.exitCode = 1;
});
