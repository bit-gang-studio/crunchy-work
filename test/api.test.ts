import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Hono } from 'hono'
import { openStore, type Store } from '../src/db/index.js'
import { createApp } from '../src/server/app.js'

/**
 * Integration through the real seam: a real SQLite file, the real service
 * layer, the real routes. No mocks — this is the test that would catch a
 * migration and a query disagreeing.
 */
let dir: string
let store: Store
let app: Hono

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crunchy-api-'))
  store = openStore(dir)
  app = createApp({ store })
})

afterEach(() => {
  store.close()
  rmSync(dir, { recursive: true, force: true })
})

async function req(method: string, path: string, payload?: unknown) {
  const res = await app.request(`/api${path}`, {
    method,
    headers: payload ? { 'content-type': 'application/json' } : undefined,
    body: payload ? JSON.stringify(payload) : undefined,
  })
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : null }
}

async function newProject(name = 'Crunchy') {
  const { json } = await req('POST', '/projects', { name })
  return json as { id: string; name: string }
}

async function board(projectId: string) {
  const { json } = await req('GET', `/projects/${projectId}`)
  return json as {
    project: { id: string; name: string }
    columns: { id: string; name: string; cards: { id: string; title: string }[] }[]
    docs: { id: string; title: string }[]
  }
}

describe('projects', () => {
  it('starts a new project usable, with default columns', async () => {
    const project = await newProject()
    const view = await board(project.id)
    expect(view.columns.map((c) => c.name)).toEqual(['To Do', 'In Progress', 'Done'])
  })

  it('lists projects with card and doc counts, without an N+1', async () => {
    const project = await newProject()
    const todo = (await board(project.id)).columns[0]!
    await req('POST', `/columns/${todo.id}/cards`, { title: 'One' })
    await req('POST', `/columns/${todo.id}/cards`, { title: 'Two' })
    await req('POST', `/projects/${project.id}/docs`, { title: 'Notes' })

    const { json } = await req('GET', '/projects')
    expect(json[0]).toMatchObject({ name: 'Crunchy', cardCount: 2, docCount: 1 })
  })

  it('rejects a blank name', async () => {
    const { status, json } = await req('POST', '/projects', { name: '   ' })
    expect(status).toBe(400)
    expect(json.error).toMatch(/needs a name/)
  })

  it('404s an unknown id', async () => {
    expect((await req('GET', '/projects/nope')).status).toBe(404)
  })

  it('renames', async () => {
    const project = await newProject()
    const { json } = await req('PATCH', `/projects/${project.id}`, { name: 'Renamed' })
    expect(json.name).toBe('Renamed')
  })

  it('deletes, cascading to columns, cards and docs', async () => {
    const project = await newProject()
    const view = await board(project.id)
    const columnId = view.columns[0]!.id
    await req('POST', `/columns/${columnId}/cards`, { title: 'Doomed' })
    await req('POST', `/projects/${project.id}/docs`, { title: 'Also doomed' })

    expect((await req('DELETE', `/projects/${project.id}`)).status).toBe(204)
    expect((await req('GET', `/projects/${project.id}`)).status).toBe(404)

    const counts = store.raw.prepare('SELECT (SELECT count(*) FROM columns) c, (SELECT count(*) FROM cards) k, (SELECT count(*) FROM docs) d').get() as {
      c: number
      k: number
      d: number
    }
    expect(counts).toEqual({ c: 0, k: 0, d: 0 })
  })

  it('orders projects and reorders on move', async () => {
    const a = await newProject('A')
    const b = await newProject('B')
    const c = await newProject('C')

    const names = async () =>
      ((await req('GET', '/projects')).json as { name: string }[]).map((p) => p.name)
    expect(await names()).toEqual(['A', 'B', 'C'])

    await req('POST', `/projects/${c.id}/move`, { index: 0 })
    expect(await names()).toEqual(['C', 'A', 'B'])

    await req('POST', `/projects/${a.id}/move`, { index: 2 })
    expect(await names()).toEqual(['C', 'B', 'A'])
    void b
  })
})

describe('columns', () => {
  it('adds, renames and deletes', async () => {
    const project = await newProject()
    const created = await req('POST', `/projects/${project.id}/columns`, { name: 'Blocked' })
    expect(created.status).toBe(201)

    const renamed = await req('PATCH', `/columns/${created.json.id}`, { name: 'Waiting' })
    expect(renamed.json.name).toBe('Waiting')

    expect((await req('DELETE', `/columns/${created.json.id}`)).status).toBe(204)
    const view = await board(project.id)
    expect(view.columns).toHaveLength(3)
  })

  it('moves to a new position', async () => {
    const project = await newProject()
    const view = await board(project.id)
    const done = view.columns[2]!

    await req('POST', `/columns/${done.id}/move`, { index: 0 })
    const after = await board(project.id)
    expect(after.columns.map((c) => c.name)).toEqual(['Done', 'To Do', 'In Progress'])
  })

  it('404s adding a column to an unknown project', async () => {
    expect((await req('POST', '/projects/nope/columns', { name: 'X' })).status).toBe(404)
  })
})

describe('cards', () => {
  it('creates in order and reads back on the board', async () => {
    const project = await newProject()
    const todo = (await board(project.id)).columns[0]!

    for (const title of ['First', 'Second', 'Third']) {
      await req('POST', `/columns/${todo.id}/cards`, { title })
    }

    const view = await board(project.id)
    expect(view.columns[0]!.cards.map((c) => c.title)).toEqual(['First', 'Second', 'Third'])
  })

  it('collapses newlines in a title, which is semantically single-line', async () => {
    const project = await newProject()
    const todo = (await board(project.id)).columns[0]!
    const { json } = await req('POST', `/columns/${todo.id}/cards`, {
      title: 'Pasted\n\nfrom somewhere',
    })
    expect(json.title).toBe('Pasted from somewhere')
  })

  it('reorders within a column', async () => {
    const project = await newProject()
    const todo = (await board(project.id)).columns[0]!
    for (const title of ['A', 'B', 'C']) {
      await req('POST', `/columns/${todo.id}/cards`, { title })
    }

    const cards = (await board(project.id)).columns[0]!.cards
    await req('POST', `/cards/${cards[2]!.id}/move`, { index: 0 })

    const after = (await board(project.id)).columns[0]!.cards
    expect(after.map((c) => c.title)).toEqual(['C', 'A', 'B'])
  })

  it('moves between columns at a chosen position', async () => {
    const project = await newProject()
    const view = await board(project.id)
    const [todo, doing] = [view.columns[0]!, view.columns[1]!]

    const { json: moving } = await req('POST', `/columns/${todo.id}/cards`, { title: 'Travels' })
    await req('POST', `/columns/${doing.id}/cards`, { title: 'Already here' })

    await req('POST', `/cards/${moving.id}/move`, { columnId: doing.id, index: 0 })

    const after = await board(project.id)
    expect(after.columns[0]!.cards).toHaveLength(0)
    expect(after.columns[1]!.cards.map((c) => c.title)).toEqual(['Travels', 'Already here'])
  })

  it('moving a card to its own index is a no-op, not a collision', async () => {
    const project = await newProject()
    const todo = (await board(project.id)).columns[0]!
    for (const title of ['A', 'B', 'C']) {
      await req('POST', `/columns/${todo.id}/cards`, { title })
    }
    const cards = (await board(project.id)).columns[0]!.cards
    await req('POST', `/cards/${cards[1]!.id}/move`, { index: 1 })

    const after = (await board(project.id)).columns[0]!.cards
    expect(after.map((c) => c.title)).toEqual(['A', 'B', 'C'])
  })

  it('updates fields and completion independently', async () => {
    const project = await newProject()
    const todo = (await board(project.id)).columns[0]!
    const { json: card } = await req('POST', `/columns/${todo.id}/cards`, { title: 'Work' })

    const { json: updated } = await req('PATCH', `/cards/${card.id}`, {
      description: 'Some detail',
      dueAt: '2026-09-01',
      completed: true,
    })
    expect(updated).toMatchObject({
      description: 'Some detail',
      dueAt: '2026-09-01',
      completed: true,
    })
    // Completion is a per-card tick, not a column — the card has not moved.
    const after = await board(project.id)
    expect(after.columns[0]!.cards).toHaveLength(1)
  })

  it('404s an unknown card and an unknown target column', async () => {
    expect((await req('GET', '/cards/nope')).status).toBe(404)
    expect((await req('POST', '/columns/nope/cards', { title: 'X' })).status).toBe(404)
  })
})

describe('docs', () => {
  it('creates, reads, updates and deletes', async () => {
    const project = await newProject()
    const created = await req('POST', `/projects/${project.id}/docs`, {
      title: 'Architecture',
      content: '# Heading\n\nBody.',
    })
    expect(created.status).toBe(201)

    const fetched = await req('GET', `/docs/${created.json.id}`)
    expect(fetched.json.content).toBe('# Heading\n\nBody.')

    await req('PATCH', `/docs/${created.json.id}`, { content: 'Rewritten.' })
    expect((await req('GET', `/docs/${created.json.id}`)).json.content).toBe('Rewritten.')

    expect((await req('DELETE', `/docs/${created.json.id}`)).status).toBe(204)
    expect((await req('GET', `/docs/${created.json.id}`)).status).toBe(404)
  })

  it('omits content from the list, so a list is cheap', async () => {
    const project = await newProject()
    await req('POST', `/projects/${project.id}/docs`, { title: 'One', content: 'x'.repeat(1000) })
    const { json } = await req('GET', `/projects/${project.id}/docs`)
    expect(json[0]).not.toHaveProperty('content')
    expect(json[0].title).toBe('One')
  })

  it('appears on the board read', async () => {
    const project = await newProject()
    await req('POST', `/projects/${project.id}/docs`, { title: 'Notes' })
    expect((await board(project.id)).docs.map((d) => d.title)).toEqual(['Notes'])
  })

  it('reorders on move, and the board read agrees', async () => {
    const project = await newProject()
    for (const title of ['Brief', 'Notes', 'Decisions'])
      await req('POST', `/projects/${project.id}/docs`, { title })

    const titles = async () => (await board(project.id)).docs.map((d) => d.title)
    expect(await titles()).toEqual(['Brief', 'Notes', 'Decisions'])

    const [, , decisions] = (await req('GET', `/projects/${project.id}/docs`)).json as {
      id: string
    }[]
    await req('POST', `/docs/${decisions!.id}/move`, { index: 0 })
    expect(await titles()).toEqual(['Decisions', 'Brief', 'Notes'])

    // To the end — the index is the slot among the *others*, so 2 is last of three.
    await req('POST', `/docs/${decisions!.id}/move`, { index: 2 })
    expect(await titles()).toEqual(['Brief', 'Notes', 'Decisions'])
  })

  it('leaves updatedAt alone when reordering — a move is not an edit', async () => {
    const project = await newProject()
    const { json: first } = await req('POST', `/projects/${project.id}/docs`, { title: 'Brief' })
    await req('POST', `/projects/${project.id}/docs`, { title: 'Notes' })

    const before = (await req('GET', `/docs/${first.id}`)).json.updatedAt
    await req('POST', `/docs/${first.id}/move`, { index: 1 })
    expect((await req('GET', `/docs/${first.id}`)).json.updatedAt).toBe(before)
  })

  it('404s a move on a doc that does not exist', async () => {
    expect((await req('POST', '/docs/nope/move', { index: 0 })).status).toBe(404)
  })
})
