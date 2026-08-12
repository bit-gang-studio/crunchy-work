import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/sqlite-proxy'
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy'
import { runMigrations } from './migrate.js'

export type Db = SqliteRemoteDatabase<Record<string, never>>

export interface Store {
  /** Drizzle query builder — the way application code should read and write. */
  db: Db
  /** The underlying handle. Only for migrations and transactions, which the proxy driver can't express. */
  raw: DatabaseSync
  close(): void
}

/**
 * Resolve where data lives: `CRUNCHY_DATA` if set, else `~/.crunchy`.
 *
 * The default is **global, not per-directory**, and that is deliberate. An
 * agent's stdio server is spawned with whatever working directory its client
 * happens to have, so a cwd-relative default would silently hand it a different
 * (empty) board from the one the user is looking at — the most confusing
 * failure this product could have. Projects are the organising unit here, not
 * folders. Point `CRUNCHY_DATA` at a repo to get a board that lives with it.
 */
export function resolveDataDir(explicit?: string): string {
  return resolve(explicit ?? process.env.CRUNCHY_DATA ?? join(homedir(), '.crunchy'))
}

/**
 * Open (creating if needed) the database and bring it up to the current schema.
 *
 * We drive `node:sqlite` — built into Node, so there is no native module to
 * compile and nothing to download per platform. Drizzle has no first-party
 * driver for it, so we adapt through `sqlite-proxy`: a small shim that takes
 * the SQL Drizzle generates and runs it on the real handle.
 */
export function openStore(dataDir?: string): Store {
  const dir = resolveDataDir(dataDir)
  const file = join(dir, 'crunchy.db')
  mkdirSync(dirname(file), { recursive: true })

  const raw = new DatabaseSync(file)
  // WAL lets the web server and a stdio MCP process hold the file at the same
  // time — the whole reason an agent can reach your board with nothing running.
  raw.exec('PRAGMA journal_mode = WAL')
  raw.exec('PRAGMA foreign_keys = ON')

  runMigrations(raw)

  const db = drizzle(async (sql, params, method) => {
    const stmt = raw.prepare(sql)
    if (method === 'run') {
      stmt.run(...(params as never[]))
      return { rows: [] }
    }
    if (method === 'get') {
      const row = stmt.get(...(params as never[]))
      return { rows: row ? Object.values(row) : [] }
    }
    const rows = stmt.all(...(params as never[])) as Record<string, unknown>[]
    return { rows: rows.map((r) => Object.values(r)) }
  })

  return { db, raw, close: () => raw.close() }
}
