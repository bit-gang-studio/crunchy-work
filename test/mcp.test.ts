import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStore, type Store } from '../src/db/index.js'
import { createServices, type Services } from '../src/services/index.js'
import { handleRpc } from '../src/mcp/jsonrpc.js'
import { tools } from '../src/mcp/tools.js'

let dir: string
let store: Store
let services: Services

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'crunchy-mcp-'))
  store = openStore(dir)
  services = createServices(store)
})

afterEach(() => {
  store.close()
  rmSync(dir, { recursive: true, force: true })
})

let nextId = 1
async function rpc(method: string, params?: Record<string, unknown>) {
  return handleRpc(services, { jsonrpc: '2.0', id: nextId++, method, params })
}

async function call(name: string, args: Record<string, unknown> = {}) {
  const res = await rpc('tools/call', { name, arguments: args })
  const result = res!.result as { content: { text: string }[]; isError: boolean }
  return { text: result.content[0]!.text, isError: result.isError }
}

describe('protocol', () => {
  it('initializes and echoes the client protocol version', async () => {
    const res = await rpc('initialize', { protocolVersion: '2025-03-26' })
    expect(res!.result).toMatchObject({
      protocolVersion: '2025-03-26',
      serverInfo: { name: 'crunchy' },
    })
  })

  it('answers ping', async () => {
    expect((await rpc('ping'))!.result).toEqual({})
  })

  it('returns null for a notification, which expects no response', async () => {
    expect(await handleRpc(services, { jsonrpc: '2.0', method: 'notifications/initialized' })).toBeNull()
  })

  it('errors on an unknown method', async () => {
    expect((await rpc('nope/nope'))!.error?.code).toBe(-32601)
  })

  it('keeps the tool surface small — the ceiling is 18', async () => {
    // Raised from 12 to give every entity full CRUD. The guard stays because
    // tool count measurably degrades model accuracy — the number moved, the
    // discipline did not.
    const listed = (await rpc('tools/list'))!.result as { tools: { name: string; description: string }[] }
    expect(listed.tools.length).toBeLessThanOrEqual(18)
    expect(listed.tools.length).toBe(tools.length)
  })

  /**
   * The rule that replaced the old number: an agent must be able to undo any
   * structural change it can make. Before this, it could create a column but
   * never rename, reorder or delete one — so a wrongly-named column needed a
   * human with a browser.
   */
  it('gives every entity full CRUD', async () => {
    const names = new Set(tools.map((t) => t.name))
    const expected = [
      'list_projects', 'get_project', 'create_project', 'update_project', 'delete_project',
      'add_column', 'update_column', 'delete_column',
      'add_card', 'get_card', 'update_card', 'move_card', 'delete_card',
      'list_docs', 'get_doc', 'write_doc', 'update_doc', 'delete_doc',
    ]
    for (const name of expected) expect(names).toContain(name)
    expect(names.size).toBe(expected.length)
  })

  it('folds reorder into update rather than a tool per entity', () => {
    // One-verb-per-tool would have been 21. Anything named move_* other than
    // move_card means that decision drifted.
    const movers = tools.map((t) => t.name).filter((n) => n.startsWith('move_'))
    expect(movers).toEqual(['move_card'])

    for (const name of ['update_project', 'update_column', 'update_doc']) {
      const tool = tools.find((t) => t.name === name)!
      const properties = (tool.inputSchema as { properties: Record<string, unknown> }).properties
      expect(properties).toHaveProperty('position')
    }
  })

  it('keeps every tool description to a single terse line', () => {
    for (const tool of tools) {
      expect(tool.description).not.toContain('\n')
      expect(tool.description.length).toBeLessThan(100)
    }
  })

  it('reports an unknown tool as a tool error, not a protocol error', async () => {
    const { isError, text } = await call('no_such_tool')
    expect(isError).toBe(true)
    expect(text).toMatch(/No tool called/)
  })
})

describe('tools', () => {
  it('creates a project with starter cards and renders it as markdown', async () => {
    const { text } = await call('create_project', {
      name: 'Crunchy',
      cards: ['Write the spec', 'Ship it'],
    })
    expect(text).toContain('# Crunchy')
    expect(text).toContain('## To Do (2)')
    expect(text).toContain('- [ ] Write the spec')
  })

  it('lists projects with counts', async () => {
    await call('create_project', { name: 'Alpha', cards: ['One'] })
    const { text } = await call('list_projects')
    expect(text).toBe('- Alpha — 1 card, 0 docs')
  })

  it('adds, moves and completes a card by name', async () => {
    await call('create_project', { name: 'Crunchy' })
    await call('add_card', { project: 'Crunchy', column: 'To Do', title: 'Build MCP' })

    const moved = await call('move_card', {
      project: 'Crunchy',
      card: 'Build MCP',
      column: 'In Progress',
    })
    expect(moved.isError).toBe(false)

    await call('update_card', { project: 'crunchy', card: 'build mcp', completed: true })

    const { text } = await call('get_project', { project: 'Crunchy' })
    expect(text).toContain('## In Progress (1)')
    expect(text).toContain('- [x] Build MCP')
  })

  it('matches names case-insensitively', async () => {
    await call('create_project', { name: 'Crunchy' })
    const { isError } = await call('add_card', {
      project: 'CRUNCHY',
      column: 'to do',
      title: 'Case test',
    })
    expect(isError).toBe(false)
  })

  it('reads one card in full', async () => {
    await call('create_project', { name: 'Crunchy' })
    await call('add_card', {
      project: 'Crunchy',
      column: 'To Do',
      title: 'Detailed',
      description: 'The body.',
      due: '2026-09-01',
    })
    const { text } = await call('get_card', { project: 'Crunchy', card: 'Detailed' })
    expect(text).toContain('column: To Do')
    expect(text).toContain('due: 2026-09-01')
    expect(text).toContain('The body.')
  })

  it('deletes a card and adds a column', async () => {
    await call('create_project', { name: 'Crunchy', cards: ['Doomed'] })
    await call('delete_card', { project: 'Crunchy', card: 'Doomed' })
    await call('add_column', { project: 'Crunchy', name: 'Blocked' })
    const { text } = await call('get_project', { project: 'Crunchy' })
    expect(text).toContain('## Blocked (0)')
    expect(text).not.toContain('Doomed')
  })

  it('write_doc creates then replaces by title', async () => {
    await call('create_project', { name: 'Crunchy' })
    const created = await call('write_doc', {
      project: 'Crunchy',
      title: 'Architecture',
      content: 'First.',
    })
    expect(created.text).toMatch(/Created/)

    const rewritten = await call('write_doc', {
      project: 'Crunchy',
      title: 'architecture',
      content: 'Second.',
    })
    expect(rewritten.text).toMatch(/Rewrote/)

    const { text } = await call('get_doc', { project: 'Crunchy', doc: 'Architecture' })
    expect(text).toContain('Second.')

    const list = await call('list_docs', { project: 'Crunchy' })
    expect(list.text).toBe('- Architecture')
  })
})

describe('name resolution', () => {
  it('tells the model what does exist when a name is wrong', async () => {
    await call('create_project', { name: 'Crunchy' })
    const { isError, text } = await call('get_project', { project: 'Crunchie' })
    expect(isError).toBe(true)
    expect(text).toContain('No project called "Crunchie"')
    expect(text).toContain('"Crunchy"')
  })

  it('says so, with ids, when a name is ambiguous', async () => {
    await call('create_project', { name: 'Crunchy' })
    await call('add_card', { project: 'Crunchy', column: 'To Do', title: 'Same' })
    await call('add_card', { project: 'Crunchy', column: 'Done', title: 'Same' })

    const { isError, text } = await call('get_card', { project: 'Crunchy', card: 'Same' })
    expect(isError).toBe(true)
    expect(text).toContain('More than one card is called "Same"')
    expect(text).toMatch(/id \w{12}/)
  })

  it('accepts an id where a name is ambiguous', async () => {
    await call('create_project', { name: 'Crunchy' })
    await call('add_card', { project: 'Crunchy', column: 'To Do', title: 'Same' })
    await call('add_card', { project: 'Crunchy', column: 'Done', title: 'Same' })

    const board = await services.projectDetail.get((await services.projects.list())[0]!.id)
    const id = board.columns[0]!.cards[0]!.id

    const { isError, text } = await call('get_card', { project: 'Crunchy', card: id })
    expect(isError).toBe(false)
    expect(text).toContain('column: To Do')
  })

  it('reports an empty workspace usefully', async () => {
    const { text } = await call('get_project', { project: 'Anything' })
    expect(text).toContain('(none exist yet)')
  })
})

/**
 * The findings from the real-world testing pass — an adversarial agent session
 * against the packed tarball. Each of these was a silent wrong answer, which is
 * worse than an error: the agent reported success and told its user something
 * untrue.
 */
describe('mistakes a model actually makes', () => {
  it('refuses an argument the tool does not have, instead of ignoring it', async () => {
    await call('create_project', { name: 'P' })
    await call('add_card', { project: 'P', column: 'To Do', title: 'Task' })

    // "Change a card" — moving is a change, so a model tries this.
    const { text, isError } = await call('update_card', {
      project: 'P',
      card: 'Task',
      column: 'Done',
    })
    expect(isError).toBe(true)
    expect(text).toContain('"column"')
    expect(text).toContain('move_card')
    expect(text).toContain('Nothing was changed')

    // And it really did not move.
    const board = await services.projectDetail.get((await services.projects.list())[0]!.id)
    expect(board.columns[0]!.cards.map((c) => c.title)).toEqual(['Task'])
  })

  it('names the arguments that do exist, so the retry is one turn', async () => {
    await call('create_project', { name: 'P' })
    const { text } = await call('add_card', {
      project: 'P',
      column: 'To Do',
      title: 'X',
      assignee: 'someone',
      priority: 'high',
    })
    expect(text).toContain('"assignee"')
    expect(text).toContain('"priority"')
    expect(text).toContain('title')
  })

  it('does not reorder the board when a card is moved to the column it is in', async () => {
    await call('create_project', { name: 'P' })
    for (const title of ['A', 'B', 'C']) await call('add_card', { project: 'P', column: 'To Do', title })

    const { text } = await call('move_card', { project: 'P', card: 'A', column: 'To Do' })
    expect(text).toContain('already in')

    const board = await services.projectDetail.get((await services.projects.list())[0]!.id)
    expect(board.columns[0]!.cards.map((c) => c.title)).toEqual(['A', 'B', 'C'])
  })

  it('still honours an explicit position within the same column', async () => {
    await call('create_project', { name: 'P' })
    for (const title of ['A', 'B', 'C']) await call('add_card', { project: 'P', column: 'To Do', title })

    await call('move_card', { project: 'P', card: 'A', column: 'To Do', position: 2 })
    const board = await services.projectDetail.get((await services.projects.list())[0]!.id)
    expect(board.columns[0]!.cards.map((c) => c.title)).toEqual(['B', 'C', 'A'])
  })

  it('places a fractional position without corrupting the column', async () => {
    await call('create_project', { name: 'P' })
    for (const title of ['A', 'B', 'C', 'D']) await call('add_card', { project: 'P', column: 'To Do', title })

    await call('move_card', { project: 'P', card: 'D', column: 'To Do', position: 1.5 })

    const board = await services.projectDetail.get((await services.projects.list())[0]!.id)
    const cards = board.columns[0]!.cards
    expect(cards.map((c) => c.title)).toEqual(['A', 'D', 'B', 'C'])
    // The bug was two cards sharing a rank, which poisoned every later move.
    expect(new Set(cards.map((c) => c.rank)).size).toBe(cards.length)

    // The move that used to die with an error reading, in full, ">=".
    const after = await call('move_card', { project: 'P', card: 'C', column: 'To Do', position: 0 })
    expect(after.isError).toBe(false)
  })

  it('round-trips a doc without stacking a heading each time', async () => {
    await call('create_project', { name: 'P' })
    await call('write_doc', { project: 'P', title: 'Plan', content: '# Plan\n\n## Strategy\n' })

    // The only way to extend a doc is read-modify-write, so this is the default
    // path, not an edge case. It used to gain a heading on every cycle.
    for (let i = 0; i < 3; i++) {
      const read = await call('get_doc', { project: 'P', doc: 'Plan' })
      await call('write_doc', { project: 'P', title: 'Plan', content: `${read.text}\n## More ${i}\n` })
    }

    const final = await call('get_doc', { project: 'P', doc: 'Plan' })
    expect(final.text.match(/^# Plan$/gm)).toHaveLength(1)
    expect(final.text).toContain('## More 2')
  })
})

/**
 * Full CRUD, from the agent's side.
 *
 * The point of these is the round trip: an agent that creates something must be
 * able to rename it, move it and remove it without a human opening a browser.
 */
describe('projects: update and delete', () => {
  it('renames, re-describes and reorders', async () => {
    await call('create_project', { name: 'Frist' })
    await call('create_project', { name: 'Second' })

    await call('update_project', { project: 'Frist', name: 'First', description: 'Fixed.' })
    const [renamed] = await services.projects.list()
    expect(renamed!.name).toBe('First')
    expect(renamed!.description).toBe('Fixed.')

    await call('update_project', { project: 'Second', position: 0 })
    expect((await services.projects.list()).map((p) => p.name)).toEqual(['Second', 'First'])
  })

  it('deletes a project and everything in it', async () => {
    await call('create_project', { name: 'Doomed', cards: ['One'] })
    await call('write_doc', { project: 'Doomed', title: 'Notes', content: 'x' })

    const { text, isError } = await call('delete_project', { project: 'Doomed' })
    expect(isError).toBe(false)
    expect(text).toContain('everything in it')
    expect(await services.projects.list()).toEqual([])
  })

  it('says what exists when the project is not found', async () => {
    await call('create_project', { name: 'Real' })
    const { text, isError } = await call('update_project', { project: 'Ghost', name: 'x' })
    expect(isError).toBe(true)
    expect(text).toContain('"Real"')
  })
})

describe('columns: update and delete', () => {
  it('renames and reorders', async () => {
    await call('create_project', { name: 'P' })

    await call('update_column', { project: 'P', column: 'To Do', name: 'Backlog' })
    await call('update_column', { project: 'P', column: 'Done', position: 0 })

    const project = (await services.projects.list())[0]!
    const names = (await services.columns.listForProject(project.id)).map((c) => c.name)
    expect(names).toEqual(['Done', 'Backlog', 'In Progress'])
  })

  it('deletes a column and says how many cards went with it', async () => {
    await call('create_project', { name: 'P' })
    await call('add_card', { project: 'P', column: 'To Do', title: 'A' })
    await call('add_card', { project: 'P', column: 'To Do', title: 'B' })

    const { text } = await call('delete_column', { project: 'P', column: 'To Do' })
    expect(text).toContain('2 cards')

    const project = (await services.projects.list())[0]!
    const names = (await services.columns.listForProject(project.id)).map((c) => c.name)
    expect(names).toEqual(['In Progress', 'Done'])
  })

  it('an agent can undo a column it added', async () => {
    await call('create_project', { name: 'P' })
    await call('add_column', { project: 'P', name: 'Tpyo' })
    await call('update_column', { project: 'P', column: 'Tpyo', name: 'Typo' })
    const { isError } = await call('delete_column', { project: 'P', column: 'Typo' })
    expect(isError).toBe(false)

    const project = (await services.projects.list())[0]!
    const names = (await services.columns.listForProject(project.id)).map((c) => c.name)
    expect(names).toEqual(['To Do', 'In Progress', 'Done'])
  })
})

describe('docs: update and delete', () => {
  it('renames a doc — which write_doc cannot do, because it matches on title', async () => {
    await call('create_project', { name: 'P' })
    await call('write_doc', { project: 'P', title: 'Draft', content: 'Body.' })

    await call('update_doc', { project: 'P', doc: 'Draft', title: 'Final' })

    const project = (await services.projects.list())[0]!
    const docs = await services.docs.listForProject(project.id)
    expect(docs.map((d) => d.title)).toEqual(['Final'])
    // The rename kept the content — it is the same doc, not a new one.
    expect((await services.docs.get(docs[0]!.id)).content).toBe('Body.')
  })

  it('reorders docs', async () => {
    await call('create_project', { name: 'P' })
    for (const title of ['A', 'B', 'C']) await call('write_doc', { project: 'P', title, content: '' })

    await call('update_doc', { project: 'P', doc: 'C', position: 0 })

    const project = (await services.projects.list())[0]!
    const docs = await services.docs.listForProject(project.id)
    expect(docs.map((d) => d.title)).toEqual(['C', 'A', 'B'])
  })

  it('deletes a doc', async () => {
    await call('create_project', { name: 'P' })
    await call('write_doc', { project: 'P', title: 'Scratch', content: '' })

    const { isError } = await call('delete_doc', { project: 'P', doc: 'Scratch' })
    expect(isError).toBe(false)

    const project = (await services.projects.list())[0]!
    expect(await services.docs.listForProject(project.id)).toEqual([])
  })

  it('lists the docs that exist when one is not found', async () => {
    await call('create_project', { name: 'P' })
    await call('write_doc', { project: 'P', title: 'Real', content: '' })
    const { text, isError } = await call('delete_doc', { project: 'P', doc: 'Imaginary' })
    expect(isError).toBe(true)
    expect(text).toContain('"Real"')
  })
})
