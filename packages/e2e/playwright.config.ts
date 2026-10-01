import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  // The full-editor example installs a service worker that caches the page.
  // Left on, it would answer requests a test means to route or to fail, so
  // it is off except in the spec about working offline, which turns it on.
  use: { serviceWorkers: 'block' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      // Half again as long as the default 30s, because this engine is that
      // much slower here: the same suite takes 3.8 minutes on WebKit against
      // 2.4 on Chromium, on the same machine and the same two workers. At the
      // shared timeout a run would lose one test to the clock roughly every
      // other time. A different test each time, which is what says it is the
      // clock rather than the test. Raising it is not papering over a failure:
      // every one of them passes in isolation, and passes here with the time
      // the engine actually needs.
      timeout: 45_000,
    },
  ],
})
