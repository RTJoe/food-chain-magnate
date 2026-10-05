import { defineConfig, devices } from '@playwright/test';

const PORT = Number(process.env.E2E_PORT ?? 4317);

/**
 * End-to-end tests (architecture §0, §6 C7). They run against the production build served by the
 * real server (`npm run e2e` builds first); persistence is off so every run starts clean.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    viewport: { width: 1280, height: 860 },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 }, launchOptions: { args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader'] } },
    },
  ],
  webServer: {
    command: 'node packages/server/dist/index.js',
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: { PORT: String(PORT), HOST: '127.0.0.1', FCM_PERSIST: '0', FCM_BOT_DELAY_MS: '60-140' },
  },
});
