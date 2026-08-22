const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const files = ['logs/signal_history.json', 'logs/system_audit_2026-07-02.jsonl'];
for (const file of files) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) {
    console.log('MISSING', file);
    continue;
  }
  const text = fs.readFileSync(full, 'utf8');
  console.log('FILE', file, 'SIZE', text.length);
  if (file.endsWith('.json')) {
    const obj = JSON.parse(text);
    const keys = Object.keys(obj);
    console.log('KEYS', keys);
    for (const symbol of keys) {
      console.log('SYMBOL', symbol, 'COUNT', obj[symbol].length);
      console.log('SAMPLE', JSON.stringify(obj[symbol].slice(0, 2), null, 2));
    }
  } else {
    const lines = text.trim().split(/\r?\n/).filter(Boolean);
    console.log('LINES', lines.length);
    const parsed = lines.slice(0, 3).map(l => JSON.parse(l));
    console.log('TYPES', [...new Set(parsed.map(p => p.eventType))]);
    console.log('SAMPLE', JSON.stringify(parsed, null, 2));
  }
}
