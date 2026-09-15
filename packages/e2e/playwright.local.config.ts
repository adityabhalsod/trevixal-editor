/**
 * The config to run the browser tests with locally.
 *
 * One project, against the Chrome already installed on the machine, with
 * `--no-sandbox`: the sandbox cannot open under WSL or in a container, and
 * without the flag every test fails before the page loads.
 *
 * `playwright.config.ts` next to this one is the CI config: chromium, firefox
 * and webkit, on the browsers Playwright downloads itself. That is the one
 * that gates a merge; this one is the fast local loop.
 *
 *   cd packages/e2e && pnpm exec playwright test -c playwright.local.config.ts
 */
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: 'list',
  projects: [
    {
      name: 'chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',
        launchOptions: { args: ['--no-sandbox'] },
      },
    },
  ],
})
