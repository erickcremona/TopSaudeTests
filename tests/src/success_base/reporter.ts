import type { FullConfig, Reporter, TestCase, TestResult } from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';
import { buildEntryKey, hashCode, upsertSuccessEntry } from './index';

export default class SuccessBaseReporter implements Reporter {
  private repoRoot = '';

  onBegin(config: FullConfig): void {
    this.repoRoot = config?.rootDir ? path.resolve(config.rootDir) : process.cwd();
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    if (result.status !== 'passed') return;
    const file = test.location?.file ? path.resolve(test.location.file) : '';
    if (!file || !fs.existsSync(file)) return;

    const code = fs.readFileSync(file, { encoding: 'utf-8' });
    const titlePath = test.titlePath();
    const key = buildEntryKey(file, titlePath);
    const codeHash = hashCode(code);

    upsertSuccessEntry(this.repoRoot, {
      key,
      file,
      titlePath,
      code,
      codeHash,
    });
  }
}
