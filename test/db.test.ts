import { describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStore } from '../src/db/index.js'
import { runMigrations } from '../src/db/migrate.js'
import { createApp } from '../src/server/app.js'

function tempStore() {
  const dir = mkdtempSync(join(tmpdir(), 'crunchy-test-'))
  const store = openStore(dir)
  return {
    store,
    cleanup: () => {
      store.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

describe('store', () => {
  it('creates the database and applies migrations on first open', () => {
    const { store, cleanup } = tempStore()
    try {
      const row = store.raw.prepare('SELECT value FROM meta WHERE key = ?').get('created_at')
      expect(row).toBeDefined()
    } finally {
      cleanup()
    }
  })

  it('is idempotent — a second migration run applies nothing', () => {
    const { store, cleanup } = tempStore()
    try {
      expect(runMigrations(store.raw)).toEqual([])
    } finally {
      cleanup()
    }
  })

  it('queries through drizzle', async () => {
    const { store, cleanup } = tempStore()
    try {
      const rows = await store.db.run('SELECT 1')
      expect(rows).toBeDefined()
    } finally {
      cleanup()
    }
  })
})

describe('api', () => {
  it('reports health', async () => {
    const { store, cleanup } = tempStore()
    try {
      const app = createApp({ store })
      const res = await app.request('/api/health')
      expect(res.status).toBe(200)
      await expect(res.json()).resolves.toMatchObject({ ok: true })
    } finally {
      cleanup()
    }
  })
})
