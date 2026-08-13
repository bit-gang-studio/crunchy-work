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
  /*
   * Two projects, ordered — not one.
   *
   * Every spec shares a single server and a single SQLite file, and one journey
   * ("from an empty install") legitimately depends on the database being empty.
   * That worked only because it happened to sort first alphabetically, which is
   * not a guarantee — adding `a11y.spec.ts` broke it immediately, since the
   * accessibility scan has to seed a project full of content.
   *
   * `dependencies` makes the ordering explicit instead of accidental: the
   * journeys run first against a clean database, then the accessibility scan
   * runs against whatever they left behind, which is a more realistic board to
   * scan anyway.
   */
  projects: [
    {
      name: 'journeys',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /a11y\.spec\.ts/,
    },
    {
      name: 'a11y',
      use: { ...devices['Desktop Chrome'] },
      testMatch: /a11y\.spec\.ts/,
      dependencies: ['journeys'],
    },
  ],
  webServer: {
    // `--no-open` matters: booting the real binary is the point of this config,
    // and the real binary opens your browser — so without it every local test
    // run threw a window in your face, and CI tried to on a machine with no
    // display. Playwright's own browsers were headless all along.
    command: 'npm run build && node bin/crunchy.js --no-open',
    url: 'http://localhost:4425/api/health',
    // Never reuse: a stale server would be serving an old build and a different database.
    reuseExistingServer: false,
    timeout: 180_000,
    env: { PORT: '4425', CRUNCHY_DATA: '.crunchy-e2e' },
  },
})
