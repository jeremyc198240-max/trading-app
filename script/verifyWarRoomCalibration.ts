import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function main(): Promise<void> {
  const repositoryRoot = process.cwd();
  const temporaryDirectory = fs.mkdtempSync(path.join(os.tmpdir(), "war-room-calibration-"));

  try {
    process.chdir(temporaryDirectory);
    const moduleUrl = pathToFileURL(path.join(repositoryRoot, "server", "warRoomCalibration.ts")).href;
    const calibration = await import(moduleUrl);
    const candleTimeMs = Date.now() - 60 * 60_000;
    const capturedAtMs = candleTimeMs + 2 * 60_000;
    const capture = {
      snapshotId: "XYZ:5m:verification",
      symbol: "XYZ",
      timeframe: "5m",
      capturedAtMs,
      candleTimeMs,
      price: 100,
      marketRegime: "trending",
      features: { upProbability: 65, volumeRatio: 1.3, optionPlayLive: true },
      feedFresh: true,
      feedAgeMs: 2500,
      gauges: [
        { name: "market_tilt", score: 72, confidence: 68, reliability: 55, direction: "CALL" as const },
        { name: "put_check", score: 40, confidence: 42, reliability: 50, direction: "PUT" as const },
        { name: "wait_check", score: 50, confidence: 50, reliability: 50, direction: "WAIT" as const },
      ],
    };
    assert.equal(calibration.isValidWarRoomGaugeCapture(capture), true);
    assert.equal(calibration.appendWarRoomGaugeCapture(capture), true);
    assert.equal(calibration.appendWarRoomGaugeCapture(capture), false, "duplicate captures are ignored");

    const staleCapture = {
      ...capture,
      snapshotId: "XYZ:15m:verification-stale",
      timeframe: "15m",
      candleTimeMs: candleTimeMs - 1,
      feedFresh: false,
    };
    assert.equal(calibration.appendWarRoomGaugeCapture(staleCapture), true);
    const candles = [
      { timeMs: candleTimeMs + 15 * 60_000, open: 100, high: 100.5, low: 100, close: 100.5, volume: 1000 },
      ...[15, 30, 60].map((minutes) => ({
      timeMs: capturedAtMs + minutes * 60_000,
      open: 100,
      high: 102,
      low: 100,
      close: 101,
      volume: 1000,
      })),
    ];
    calibration.resolveWarRoomGaugeOutcomes("XYZ", candles);
    calibration.resolveWarRoomGaugeOutcomes("XYZ", candles);

    const result = calibration.getWarRoomGaugeCalibration(168);
    assert.equal(result.modelVersion, "war-room-gauges-v2");
    const marketTilt = result.gauges.find((gauge: { name: string }) => gauge.name === "market_tilt");
    assert.equal(marketTilt.total, 2);
    assert.equal(marketTilt.fresh, 1);
    assert.equal(marketTilt.stale, 1);
    assert.equal(marketTilt.wins, 1);
    assert.equal(marketTilt.winRate, 100);
    const waitCheck = result.gauges.find((gauge: { name: string }) => gauge.name === "wait_check");
    assert.equal(waitCheck.neutrals, 1);
    assert.equal(result.recentSnapshots.length, 2);
    assert.equal(result.recentSnapshots[0].marketRegime, "trending");
    assert.equal(result.recentSnapshots[0].outcomes[0].movePct, 1, "resolution is anchored to capture time, not candle open");
    assert.ok(calibration.getWarRoomGaugeSymbols().includes("XYZ"), "captured symbols are added to server outcome collection");
    const selectedTimeframe = calibration.getWarRoomGaugeCalibration(168, "XYZ", "5m");
    assert.equal(selectedTimeframe.recentSnapshots.length, 1, "summary filters to the selected timeframe");
    assert.equal(selectedTimeframe.recentSnapshots[0].features.volumeRatio, 1.3);
    console.log("Verified War Room gauge capture deduplication, freshness filtering, 15-minute outcome matching, and calibration summary.");
  } finally {
    process.chdir(repositoryRoot);
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
