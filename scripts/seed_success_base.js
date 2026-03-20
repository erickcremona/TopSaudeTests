const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');

const repoRoot = path.resolve(__dirname, '..');
const basePath = path.resolve(repoRoot, 'tests', 'src', 'success_base', 'success_base.json');

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'out',
  'test-results',
  'playwright-report',
  '.vscode',
]);

const CODE_EXTS = new Set(['.ts', '.js']);

function readBase() {
  if (!fs.existsSync(basePath)) {
    return { version: 1, entries: [] };
  }
  const raw = fs.readFileSync(basePath, { encoding: 'utf-8' });
  const parsed = JSON.parse(raw);
  return {
    version: typeof parsed?.version === 'number' ? parsed.version : 1,
    entries: Array.isArray(parsed?.entries) ? parsed.entries : [],
  };
}

function writeBase(base) {
  const json = JSON.stringify(base, null, 2);
  fs.writeFileSync(basePath, json, { encoding: 'utf-8' });
}

function hashCode(code) {
  return createHash('sha256').update(code, 'utf-8').digest('hex');
}

function walk(dir, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      walk(path.join(dir, ent.name), out);
      continue;
    }
    if (!ent.isFile()) continue;
    const full = path.join(dir, ent.name);
    const ext = path.extname(ent.name).toLowerCase();
    if (!CODE_EXTS.has(ext)) continue;
    out.push(full);
  }
}

function upsert(base, entry) {
  const existing = base.entries.find((e) => e.key === entry.key);
  const now = new Date().toISOString();
  if (!existing) {
    base.entries.push({ ...entry, firstSeen: now, lastSeen: now });
    return true;
  }
  if (existing.codeHash !== entry.codeHash) {
    existing.code = entry.code;
    existing.codeHash = entry.codeHash;
    existing.titlePath = entry.titlePath;
    existing.file = entry.file;
  }
  existing.lastSeen = now;
  return false;
}

function main() {
  const base = readBase();
  const files = [];
  walk(repoRoot, files);

  let added = 0;
  for (const file of files) {
    const code = fs.readFileSync(file, { encoding: 'utf-8' });
    const rel = path.relative(repoRoot, file);
    const titlePath = ['SEED', rel];
    const key = `${file}::${titlePath.join(' > ')}`;
    const codeHash = hashCode(code);
    const created = upsert(base, { key, file, titlePath, code, codeHash });
    if (created) added += 1;
  }

  writeBase(base);
  // eslint-disable-next-line no-console
  console.log(`Seed concluido. Arquivos processados: ${files.length}. Novas entradas: ${added}.`);
}

main();
