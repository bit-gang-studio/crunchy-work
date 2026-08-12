import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Hono } from 'hono'
import { openStore, type Store } from '../src/db/index.js'
import { createApp } from '../src/server/app.js'
import { handleRpc } from '../src/mcp/jsonrpc.js'
import { createServices, type Services } from '../src/services/index.js'

let dir: string
let store: Store
let services: Services
let app: Hono

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crunchy-ac-'))
  store = openStore(dir)
  services = createServices(store)
  app = createApp({ store })
})

afterEach(() => {
  store.close()
  rmSync(dir, { recursive: true, force: true })
})

async function seedCard(input: Parameters<Services['cards']['create']>[1] = { title: 'A card' }) {
  const project = await services.projects.create({ name: 'P' })
  const [todo] = await services.columns.listForProject(project.id)
  return { project, card: await services.cards.create(todo!.id, input) }
}

let rpcId = 1
async function call(name: string, args: Record<string, unknown>) {
  const res = await handleRpc(services, {
    jsonrpc: '2.0',
    id: rpcId++,
    method: 'tools/call',
    params: { name, arguments: args },
  })
  const result = res!.result as { content: { text: string }[]; isError: boolean }
  return { text: result.content[0]!.text, isError: result.isError }
}

describe('acceptance criteria', () => {
  it('round-trips as a list, not the JSON string it is stored as', async () => {
    const { card } = await seedCard({
      title: 'With criteria',
      acceptanceCriteria: [
        { text: 'Tests pass', done: true },
        { text: 'Docs updated', done: false },
      ],
    })
    expect(card.acceptanceCriteria).toEqual([
      { text: 'Tests pass', done: true },
      { text: 'Docs updated', done: false },
    ])
    expect(typeof card.acceptanceCriteria).not.toBe('string')
  })

  it('defaults to an empty list', async () => {
    const { card } = await seedCard()
    expect(card.acceptanceCriteria).toEqual([])
    expect(card.size).toBeNull()
  })

  it('replaces the whole list on update, rather than merging', async () => {
    const { card } = await seedCard({ title: 'x', acceptanceCriteria: [{ text: 'One', done: false }] })
    const updated = await services.cards.update(card.id, {
      acceptanceCriteria: [{ text: 'Two', done: true }],
    })
    expect(updated.acceptanceCriteria).toEqual([{ text: 'Two', done: true }])
  })

  it('drops blank lines, which are a slip rather than a criterion', async () => {
    const { card } = await seedCard({
      title: 'x',
      acceptanceCriteria: [{ text: '  Real  ', done: false }, { text: '   ', done: false }],
    })
    expect(card.acceptanceCriteria).toEqual([{ text: 'Real', done: false }])
  })

  it('refuses an absurd number of criteria', async () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ text: `c${i}`, done: false }))
    await expect(seedCard({ title: 'x', acceptanceCriteria: many })).rejects.toThrow(/at most 50/)
  })

  /**
   * Criteria and completion answer different questions — "is the work finished?"
   * versus "did we agree what finished meant?" — so neither drives the other.
   */
  it('is advisory: ticking every line does not complete the card', async () => {
    const { card } = await seedCard({
      title: 'x',
      acceptanceCriteria: [{ text: 'Only one', done: true }],
    })
    expect(card.completed).toBe(false)

    const done = await services.cards.update(card.id, { completed: true })
    expect(done.acceptanceCriteria).toEqual([{ text: 'Only one', done: true }])
  })

  it('survives a corrupt stored value rather than breaking every read', async () => {
    const { card } = await seedCard()
    store.raw.prepare('UPDATE cards SET acceptance_criteria = ? WHERE id = ?').run('{not json', card.id)
    expect((await services.cards.get(card.id)).acceptanceCriteria).toEqual([])
  })
})

describe('size', () => {
  it('accepts the scale and clears back to null', async () => {
    const { card } = await seedCard({ title: 'x', size: 'M' })
    expect(card.size).toBe('M')
    expect((await services.cards.update(card.id, { size: null })).size).toBeNull()
  })

  it('rejects anything off the scale', async () => {
    await expect(seedCard({ title: 'x', size: 'HUGE' as never })).rejects.toThrow(/must be one of/)
  })
})

describe('over the API', () => {
  it('carries both fields through create, read and the board', async () => {
    const project = await services.projects.create({ name: 'API' })
    const [todo] = await services.columns.listForProject(project.id)

    const created = await app.request(`/api/columns/${todo!.id}/cards`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: 'Shipped',
        size: 'L',
        acceptanceCriteria: [{ text: 'CI green', done: true }],
      }),
    })
    expect(created.status).toBe(201)

    const board = (await (await app.request(`/api/projects/${project.id}`)).json()) as {
      columns: { cards: { size: string | null; acceptanceCriteria: unknown[] }[] }[]
    }
    expect(board.columns[0]!.cards[0]).toMatchObject({
      size: 'L',
      acceptanceCriteria: [{ text: 'CI green', done: true }],
    })
  })
})

describe('over MCP', () => {
  it('accepts bare strings when drafting, and objects when ticking', async () => {
    await call('create_project', { name: 'MCP' })
    // A model drafting a card naturally sends lines, not objects.
    await call('add_card', {
      project: 'MCP',
      column: 'To Do',
      title: 'Build it',
      size: 'S',
      criteria: ['Tests pass', 'Docs updated'],
    })

    const drafted = await call('get_card', { project: 'MCP', card: 'Build it' })
    expect(drafted.text).toContain('size: S')
    expect(drafted.text).toContain('- [ ] Tests pass')

    // Ticking one off means resending the list with flags.
    await call('update_card', {
      project: 'MCP',
      card: 'Build it',
      criteria: [
        { text: 'Tests pass', done: true },
        { text: 'Docs updated', done: false },
      ],
    })
    const ticked = await call('get_card', { project: 'MCP', card: 'Build it' })
    expect(ticked.text).toContain('- [x] Tests pass')
    expect(ticked.text).toContain('- [ ] Docs updated')
  })

  it('shows only a tally on the board, so a big board stays cheap to read', async () => {
    await call('create_project', { name: 'Tally' })
    await call('add_card', {
      project: 'Tally',
      column: 'To Do',
      title: 'Counted',
      size: 'XL',
      criteria: [{ text: 'a', done: true }, { text: 'b', done: false }],
    })

    const board = await call('get_board', { project: 'Tally' })
    expect(board.text).toContain('[XL]')
    expect(board.text).toContain('(1/2)')
    // The lines themselves are not on the board read.
    expect(board.text).not.toContain('- [x] a')
  })

  it('normalises a lowercase size rather than rejecting it', async () => {
    await call('create_project', { name: 'Case' })
    const result = await call('add_card', { project: 'Case', column: 'To Do', title: 'x', size: 'm' })
    expect(result.isError).toBe(false)
    expect((await call('get_card', { project: 'Case', card: 'x' })).text).toContain('size: M')
  })

  it('reports a bad size as a tool error the model can act on', async () => {
    await call('create_project', { name: 'Bad' })
    const result = await call('add_card', {
      project: 'Bad',
      column: 'To Do',
      title: 'x',
      size: 'ENORMOUS',
    })
    expect(result.isError).toBe(true)
    expect(result.text).toMatch(/must be one of/)
  })
})

describe('the migration', () => {
  /**
   * 0003 adds columns to a table that already exists in the wild. A database
   * created before it must come forward without losing anything — this is the
   * first migration where that is a real risk rather than a formality.
   */
  it('brings a pre-0003 database forward, preserving its cards', async () => {
    const legacyDir = mkdtempSync(join(tmpdir(), 'crunchy-legacy-'))
    try {
      // Build a database at the 0002 shape by hand, then let the runner upgrade it.
      const first = openStore(legacyDir)
      const svc = createServices(first)
      const project = await svc.projects.create({ name: 'Legacy' })
      const [todo] = await svc.columns.listForProject(project.id)
      await svc.cards.create(todo!.id, { title: 'Old card' })

      first.raw.exec('ALTER TABLE cards DROP COLUMN acceptance_criteria')
      first.raw.exec('ALTER TABLE cards DROP COLUMN size')
      first.raw.prepare('DELETE FROM _migrations WHERE id = ?').run('0003_acceptance_and_size')
      first.close()

      const upgraded = openStore(legacyDir)
      const after = createServices(upgraded)
      const [card] = await after.cards.listForColumn(todo!.id)

      expect(card!.title).toBe('Old card')
      expect(card!.acceptanceCriteria).toEqual([])
      expect(card!.size).toBeNull()
      upgraded.close()
    } finally {
      rmSync(legacyDir, { recursive: true, force: true })
    }
  })
})
