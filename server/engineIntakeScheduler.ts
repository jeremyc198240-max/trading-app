/**
 * Engine Intake Log Scheduler
 * 
 * Manages the 10-minute interval collection and rolling of the engine intake log.
 * Call startEngineIntakeScheduler() from your main server startup.
 */

import { rollEngineIntakeLog, startEngineIntakeInterval, getIntakeStatus } from "./engineIntakeLog";

let intakeSchedulerId: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Start the engine intake log scheduler (10m intervals)
 */
export function startEngineIntakeScheduler() {
  if (isRunning) {
    console.log("[EngineIntakeScheduler] Already running");
    return;
  }

  isRunning = true;
  console.log("[EngineIntakeScheduler] Starting 10-minute interval collection");

  // Calculate delay until next 10-minute boundary
  const now = Date.now();
  const minutes = Math.floor(now / 60000);
  const nextBoundary = (minutes + 10) * 60000;
  const delayMs = nextBoundary - now;

  console.log(`[EngineIntakeScheduler] First roll in ${Math.round(delayMs / 1000)}s (next 10m boundary)`);

  // Start the current 10-minute collection window immediately
  startEngineIntakeInterval();

  // Schedule first roll at the next 10-minute boundary
  const initialTimer = setTimeout(() => {
    rollEngineIntakeLog();
    
    // Then every 10 minutes after
    intakeSchedulerId = setInterval(() => {
      try {
        rollEngineIntakeLog();
      } catch (err) {
        console.error("[EngineIntakeScheduler] Error rolling log:", err);
      }
    }, 10 * 60 * 1000);
  }, delayMs);

  // Store initial timer for cleanup if needed
  (globalThis as any).engineIntakeInitialTimer = initialTimer;
}

/**
 * Stop the engine intake log scheduler
 */
export function stopEngineIntakeScheduler() {
  if (intakeSchedulerId) {
    clearInterval(intakeSchedulerId);
    intakeSchedulerId = null;
  }
  if ((globalThis as any).engineIntakeInitialTimer) {
    clearTimeout((globalThis as any).engineIntakeInitialTimer);
    (globalThis as any).engineIntakeInitialTimer = null;
  }
  isRunning = false;
  console.log("[EngineIntakeScheduler] Stopped");
}

/**
 * Check scheduler status (for monitoring)
 */
export function getIntakeSchedulerStatus() {
  return {
    isRunning,
    intakeStatus: getIntakeStatus(),
  };
}

// Auto-start if imported with market hours check
if (typeof window === "undefined") {
  // Only in Node.js environment
  setTimeout(() => {
    try {
      startEngineIntakeScheduler();
    } catch (err) {
      console.error("[EngineIntakeScheduler] Failed to auto-start:", err);
    }
  }, 5000); // Give server time to initialize
}
