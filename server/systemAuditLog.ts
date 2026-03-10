import fs from "fs";
import path from "path";

export type SystemAuditEventType =
  | 'scanner.scan'
  | 'fusion.snapshot'
  | 'signal.recorded'
  | 'signal.resolved'
  | 'thresholds.live';

export interface SystemAuditEvent {
  eventType: SystemAuditEventType;
  ts: number;
  date: string;
  payload: Record<string, any>;
}

const LOGS_DIR = path.join("logs");
const AUDIT_RETENTION_DAYS = 7;
const MAX_DAILY_AUDIT_FILE_BYTES = 4 * 1024 * 1024;
const TRUNCATE_KEEP_LINES = 4000;

function getNyDateKey(ts: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ts));
}

function getAuditFilePath(ts: number): string {
  const dateKey = getNyDateKey(ts).replace(/\//g, "-");
  return path.join(LOGS_DIR, `system_audit_${dateKey}.jsonl`);
}

function ensureLogsDir(): void {
  if (!fs.existsSync(LOGS_DIR)) {
    fs.mkdirSync(LOGS_DIR, { recursive: true });
  }
}

function pruneOldAuditFiles(): void {
  try {
    const cutoff = Date.now() - AUDIT_RETENTION_DAYS * 86400000;
    const files = fs.readdirSync(LOGS_DIR).filter((name) => /^system_audit_.*\.jsonl$/i.test(name));
    for (const fileName of files) {
      const fullPath = path.join(LOGS_DIR, fileName);
      const stats = fs.statSync(fullPath);
      if (stats.mtimeMs < cutoff) {
        fs.unlinkSync(fullPath);
      }
    }
  } catch {
  }
}

function capDailyAuditFile(ts: number): void {
  try {
    const filePath = getAuditFilePath(ts);
    if (!fs.existsSync(filePath)) return;
    const stats = fs.statSync(filePath);
    if (stats.size <= MAX_DAILY_AUDIT_FILE_BYTES) return;

    const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter(Boolean);
    const kept = lines.slice(-TRUNCATE_KEEP_LINES);
    fs.writeFileSync(filePath, `${kept.join("\n")}\n`, "utf8");
  } catch {
  }
}

export function appendSystemAudit(eventType: SystemAuditEventType, payload: Record<string, any>): void {
  try {
    const ts = Date.now();
    ensureLogsDir();
    const event: SystemAuditEvent = {
      eventType,
      ts,
      date: getNyDateKey(ts),
      payload,
    };
    fs.appendFileSync(getAuditFilePath(ts), `${JSON.stringify(event)}\n`, "utf8");
    capDailyAuditFile(ts);
    pruneOldAuditFiles();
  } catch (error) {
    if (process.env.DEBUG_SIGNALS === '1') {
      console.error('[SystemAudit] append failed:', error);
    }
  }
}

export function readRecentSystemAudit(limit: number = 200, daysBack: number = 1): SystemAuditEvent[] {
  const bounded = Number.isFinite(limit) && limit > 0 ? Math.min(2000, Math.floor(limit)) : 200;
  const boundedDays = Number.isFinite(daysBack) && daysBack > 0 ? Math.min(30, Math.floor(daysBack)) : 1;
  try {
    ensureLogsDir();
    const cutoff = Date.now() - boundedDays * 86400000;
    const files = fs
      .readdirSync(LOGS_DIR)
      .filter((name) => /^system_audit_.*\.jsonl$/i.test(name))
      .filter((name) => {
        try {
          const stats = fs.statSync(path.join(LOGS_DIR, name));
          return stats.mtimeMs >= cutoff;
        } catch {
          return false;
        }
      })
      .sort((a, b) => a.localeCompare(b));

    const events: SystemAuditEvent[] = [];
    for (let i = files.length - 1; i >= 0; i -= 1) {
      const fullPath = path.join(LOGS_DIR, files[i]);
      const lines = fs.readFileSync(fullPath, "utf8").split(/\r?\n/).filter(Boolean);
      for (let j = lines.length - 1; j >= 0; j -= 1) {
        try {
          const parsed = JSON.parse(lines[j]) as SystemAuditEvent;
          events.push(parsed);
        } catch {
        }
        if (events.length >= bounded) {
          return events;
        }
      }
    }

    return events;
  } catch {
    return [];
  }
}
