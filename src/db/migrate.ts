import type { DatabaseSync } from 'node:sqlite'
import { migrations } from './migrations.js'

/**
 * Apply any migrations this database hasn't seen, in order, each in its own
 * transaction. Runs at every boot — upgrading is never a manual step.
 */
export function runMigrations(raw: DatabaseSync): string[] {
  raw.exec(`CREATE TABLE IF NOT EXISTS _migrations (
    id         TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)

  const applied = new Set(
    (raw.prepare('SELECT id FROM _migrations').all() as { id: string }[]).map((r) => r.id),
  )

  const ran: string[] = []
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue
    raw.exec('BEGIN')
    try {
      raw.exec(migration.sql)
      raw.prepare('INSERT INTO _migrations (id) VALUES (?)').run(migration.id)
      raw.exec('COMMIT')
      ran.push(migration.id)
    } catch (err) {
      raw.exec('ROLLBACK')
      throw new Error(`Migration ${migration.id} failed: ${(err as Error).message}`, { cause: err })
    }
  }
  return ran
}
