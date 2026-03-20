import { defineConfig } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

function loadDotEnv(): void {
  const envPath = path.resolve(__dirname, '.env');
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, { encoding: 'utf-8' });
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv();

export default defineConfig({
  testDir: '.',
  testMatch: ['**/*.spec.ts'],
  outputDir: 'test-results',
  reporter: [['list'], ['html', { open: 'never' }], ['./tests/src/success_base/reporter.ts']],
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
});
