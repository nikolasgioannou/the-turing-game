import { existsSync } from 'node:fs';
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests',
  testMatch: '*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://localhost:3100',
    headless: true,
    channel:
      process.env.PLAYWRIGHT_CHANNEL ??
      (existsSync('/Applications/Google Chrome.app') ? 'chrome' : undefined),
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'bun src/server/index.ts',
    url: 'http://localhost:3100/api/health',
    reuseExistingServer: false,
    env: {
      PORT: '3100',
      APP_ORIGIN: 'http://localhost:3100',
      PGLITE_PATH: 'memory://',
      DATABASE_URL: '',
    },
  },
});
