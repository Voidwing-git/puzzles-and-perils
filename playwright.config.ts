import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.browser.spec.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  globalSetup: './tests/setup.browser.ts',
  reporter: [['list'], ['json', { outputFile: 'docs/evidence/m3-browser-results.json' }]],
  use: {
    baseURL: `http://localhost:${process.env.PW_TEST_PORT ?? 4183}`,
    channel: process.env.PW_CHANNEL ?? 'msedge',
    viewport: { width: 1600, height: 1000 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
