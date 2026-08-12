import { createRequire } from 'node:module'
import { defineConfig } from 'vitest/config'

/**
 * `node:sqlite` is unflagged from Node 24 but needs `--experimental-sqlite` on
 * Node 22, and the flag must be set when a process starts — including the worker
 * processes Vitest forks to run the tests.
 *
 * Setting NODE_OPTIONS here (config is evaluated before any worker spawns) is
 * both cross-platform and independent of Vitest's pool-option naming, which has
 * moved between majors. Probe for the module rather than comparing versions, so
 * CI on Node 22 and Node 24 both work off this one config.
 */
function ensureSqliteAvailable(): void {
  try {
    createRequire(import.meta.url)('node:sqlite')
  } catch {
    const flags = '--experimental-sqlite --no-warnings'
    process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS ?? ''} ${flags}`.trim()
  }
}

ensureSqliteAvailable()

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    pool: 'forks',
  },
})
