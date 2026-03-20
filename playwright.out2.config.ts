import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '.',
  testMatch: ['**/*.spec.ts'],
  outputDir: 'test-results2',
  reporter: [['list']],
});

