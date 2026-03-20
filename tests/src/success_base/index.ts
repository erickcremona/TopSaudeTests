import * as fs from 'fs';
import * as path from 'path';
import { createHash } from 'crypto';

export type SuccessBaseEntry = {
  key: string;
  file: string;
  titlePath: string[];
  code: string;
  codeHash: string;
  firstSeen: string;
  lastSeen: string;
};

export type SuccessBase = {
  version: number;
  entries: SuccessBaseEntry[];
};

export function getSuccessBasePath(repoRoot: string): string {
  return path.resolve(repoRoot, 'tests', 'src', 'success_base', 'success_base.json');
}

export function readSuccessBase(repoRoot: string): SuccessBase {
  const filePath = getSuccessBasePath(repoRoot);
  if (!fs.existsSync(filePath)) {
    return { version: 1, entries: [] };
  }
  const raw = fs.readFileSync(filePath, { encoding: 'utf-8' });
  const parsed = JSON.parse(raw) as SuccessBase;
  if (!parsed || typeof parsed !== 'object') return { version: 1, entries: [] };
  return {
    version: typeof parsed.version === 'number' ? parsed.version : 1,
    entries: Array.isArray(parsed.entries) ? parsed.entries : [],
  };
}

export function writeSuccessBase(repoRoot: string, base: SuccessBase): void {
  const filePath = getSuccessBasePath(repoRoot);
  const json = JSON.stringify(base, null, 2);
  fs.writeFileSync(filePath, json, { encoding: 'utf-8' });
}

export function buildEntryKey(file: string, titlePath: string[]): string {
  return `${file}::${titlePath.join(' > ')}`;
}

export function hashCode(code: string): string {
  return createHash('sha256').update(code, 'utf-8').digest('hex');
}

export function upsertSuccessEntry(repoRoot: string, entry: Omit<SuccessBaseEntry, 'firstSeen' | 'lastSeen'>): boolean {
  const base = readSuccessBase(repoRoot);
  const now = new Date().toISOString();
  const existing = base.entries.find((e) => e.key === entry.key);

  if (!existing) {
    base.entries.push({ ...entry, firstSeen: now, lastSeen: now });
    writeSuccessBase(repoRoot, base);
    return true;
  }

  if (existing.codeHash !== entry.codeHash) {
    existing.code = entry.code;
    existing.codeHash = entry.codeHash;
    existing.titlePath = entry.titlePath;
    existing.file = entry.file;
  }
  existing.lastSeen = now;
  writeSuccessBase(repoRoot, base);
  return false;
}
