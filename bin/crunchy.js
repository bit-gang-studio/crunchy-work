#!/usr/bin/env node
/**
 * Entry point.
 *
 * Storage is `node:sqlite`, which is built into Node — nothing to compile and
 * nothing to download per platform. It is unflagged from Node 24; on Node 22 it
 * needs `--experimental-sqlite`, which has to be present at process start. So if
 * the module isn't there we re-exec ourselves once with the flag. Node 24+ users
 * never pay for this; Node 22 users pay a few milliseconds and notice nothing.
 */
import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

function hasSqlite() {
  try {
    require('node:sqlite')
    return true
  } catch {
    return false
  }
}

if (!hasSqlite()) {
  if (process.env.CRUNCHY_RESPAWNED) {
    console.error(
      `\n  Crunchy needs SQLite, which your Node build does not provide.\n` +
        `  You are on Node ${process.version}; Crunchy needs Node 22.5 or newer.\n` +
        `  Upgrade at https://nodejs.org and try again.\n`,
    )
    process.exit(1)
  }
  const result = spawnSync(
    process.execPath,
    ['--experimental-sqlite', '--no-warnings', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    { stdio: 'inherit', env: { ...process.env, CRUNCHY_RESPAWNED: '1' } },
  )
  process.exit(result.status ?? 1)
}

await import('../dist/server/boot.js')
