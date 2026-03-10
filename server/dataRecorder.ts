import fs from "fs";
import path from "path";

export function recordData(snapshot: any) {
  const logsDir = path.join("logs");
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
  }

  // rotate among three files (one per day) so we only ever hold three
  // days of data. dayIndex changes at midnight UTC; timestamps may be
  // off by your local zone but the 3‑file scheme still enforces retention.
  const dayIndex = Math.floor(Date.now() / 86400000) % 3;
  const filePath = path.join(logsDir, `market_15m_${dayIndex}.jsonl`);

  // clear the file if its last modification was before the start of
  // the current UTC day (i.e. a new day has begun for this slot). This
  // handles restarts that occur mid‑day.
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    const now = new Date();
    const startOfDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    if (stats.mtimeMs < startOfDay) {
      fs.writeFileSync(filePath, ""); // wipe old entries
    }
  }

  // purge any stale files older than three days to be safe (in case
  // somebody manually drops a file or we ever change rotation logic).
  const files = fs.readdirSync(logsDir);
  const cutoff = Date.now() - 3 * 86400000;
  for (const f of files) {
    const p = path.join(logsDir, f);
    try {
      const st = fs.statSync(p);
      if (st.mtimeMs < cutoff) {
        fs.unlinkSync(p);
      }
    } catch {
      // ignore if cannot stat/unlink
    }
  }

  const entry = {
    timestamp: new Date().toISOString(),
    ...snapshot
  };

  fs.appendFileSync(filePath, JSON.stringify(entry) + "\n");
}
