import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStore, type Store } from '../src/db/index.js'
import { createServices } from '../src/services/index.js'

/**
 * Two writers on the same database file.
 *
 * This is not an edge case — it is the product's core demo. The web server is
 * open in a browser while an agent writes over MCP from a **separate process**,
 * which is the whole reason `events.ts` watches the file rather than using an
 * in-process event bus.
 *
 * It did not work. WAL gives concurrent *readers*, not writers, and without a
 * `busy_timeout` the second writer took SQLITE_BUSY immediately and the write
 * was simply lost: measured at 26 of 40 landing between two MCP sessions, and
 * 19 of 30 between the server and MCP — where the browser showed a 500 for a
 * card the user had just typed.
 *
 * Two stores over one file is the same contention as two processes: SQLite
 * locks the file, not the handle.
 */
let dir: string
let stores: Store[]

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crunchy-conc-'))
  stores = []
})

afterEach(() => {
  for (const store of stores) store.close()
  rmSync(dir, { recursive: true, force: true })
})

function open() {
  const store = openStore(dir)
  stores.push(store)
  return createServices(store)
}

describe('two writers', () => {
  it('sets a busy timeout, so a blocked write waits instead of vanishing', () => {
    const store = openStore(dir)
    stores.push(store)
    const [row] = store.raw.prepare('PRAGMA busy_timeout').all() as { timeout: number }[]
    expect(row!.timeout).toBeGreaterThan(0)
  })

  it('lands every card when two connections interleave writes', async () => {
    const a = open()
    const b = open()

    const project = await a.projects.create({ name: 'Shared' })
    const column = (await a.columns.listForProject(project.id))[0]!

    // Interleaved rather than sequential — the point is contention.
    const writes: Promise<unknown>[] = []
    for (let i = 0; i < 20; i++) {
      writes.push(a.cards.create(column.id, { title: `a-${i}` }))
      writes.push(b.cards.create(column.id, { title: `b-${i}` }))
    }
    await Promise.all(writes)

    const cards = await a.cards.listForColumn(column.id)
    expect(cards).toHaveLength(40)
    // Ranks must stay unique under contention, or ordering is undefined.
    expect(new Set(cards.map((c) => c.rank)).size).toBe(40)
  })

  it('a reader sees what the other writer committed', async () => {
    const a = open()
    const b = open()

    const project = await a.projects.create({ name: 'Shared' })
    const column = (await a.columns.listForProject(project.id))[0]!
    await b.cards.create(column.id, { title: 'written by b' })

    const board = await a.projectDetail.get(project.id)
    expect(board.columns[0]!.cards.map((c) => c.title)).toEqual(['written by b'])
  })
})
