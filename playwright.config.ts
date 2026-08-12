import { defineConfig, devices } from '@playwright/test'

/**
 * The app end-to-end config: the real binary, the real server, a real SQLite
 * file, the built SPA. Nothing is stubbed — this is the journey a user actually
 * takes, and it's the only place the whole stack is exercised together.
 *
 * It runs against its own data directory and its own port (4425) so it can never
 * touch your working board or collide with a dev server.
 *
 * Run: `npm run test:e2e`
 */
export default defineConfig({
  testDir: './e2e',
  reporter: 'list',
  timeout: 30_000,
  workers: 1,
  // The data directory is cleared by the `test:e2e` script, NOT a globalSetup hook:
  // Playwright starts `webServer` first, so by the time a hook ran the server would
  // already hold the SQLite file open and the delete fails (EBUSY on Windows).
  use: {
    baseURL: 'http://localhost:4425',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run build && node bin/crunchy.js',
    url: 'http://localhost:4425/api/health',
    // Never reuse: a stale server would be serving an old build and a different database.
    reuseExistingServer: false,
    timeout: 180_000,
    env: { PORT: '4425', CRUNCHY_DATA: '.crunchy-e2e' },
  },
})
