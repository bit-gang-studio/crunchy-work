import { defineConfig, devices } from '@playwright/test'

/**
 * A focused, server-free Playwright config for the drag-and-drop harness
 * (`dnd-harness.html` → the real <KanbanBoard>). No API, no database, no auth —
 * just the Vite dev server — so the drag engine can be driven and asserted in a
 * real browser, fast.
 *
 * Run: `npm run test:dnd` (reuses an already-running dev server locally).
 */
export default defineConfig({
  testDir: './e2e-dnd',
  reporter: 'list',
  timeout: 30_000,
  // Drag specs are timing-sensitive; running them in parallel on one machine makes
  // them flaky for reasons that have nothing to do with the code.
  workers: 1,
  use: {
    // The harness gets its own port (still inside Crunchy's 44xx block) so it never
    // fights a running app server on 4420 — otherwise `reuseExistingServer` happily
    // reuses whatever is there and every spec 404s on the harness page.
    baseURL: 'http://localhost:4424',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev -- --port 4424 --strictPort',
    url: 'http://localhost:4424/dnd-harness.html',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
