import { defineConfig, devices } from '@playwright/test';

const PORT = 5290;

/**
 * UI checks (plan 12.2): Chromium, local basemap, fixtures in public/data.
 * Run `npm run fixtures` first. The dev server is started for the run.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 2,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        // Chromium flags for software WebGL. WebKit on Linux refuses to start with unknown flags.
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
    // Safari's engine for the phone checks (the swipe checks need Chromium's DevTools Protocol).
    { name: 'webkit-phone', testMatch: /mobile\.spec\.ts/, use: { browserName: 'webkit' } },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://127.0.0.1:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { VITE_BASEMAP: 'local' },
  },
});
