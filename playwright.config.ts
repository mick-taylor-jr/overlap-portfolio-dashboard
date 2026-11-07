import { defineConfig, devices } from '@playwright/test';

/**
 * Smoke tests run against a production build on port 3100 (chromium only).
 * PW_CHANNEL=chrome uses a system Chrome when Playwright's bundled browser cannot be downloaded.
 * PW_BASE_URL points the tests at an already-running server and skips the build.
 */
const PORT = 3100;
const external = process.env.PW_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: external ?? `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], ...(process.env.PW_CHANNEL ? { channel: process.env.PW_CHANNEL } : {}) },
    },
  ],
  webServer: external
    ? undefined
    : {
        command: `pnpm build && pnpm start --port ${PORT}`,
        url: `http://localhost:${PORT}`,
        timeout: 240_000,
        reuseExistingServer: !process.env.CI,
      },
});
