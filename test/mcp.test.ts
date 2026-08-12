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

  it('keeps the tool surface small — the ceiling is 12', async () => {
    const listed = (await rpc('tools/list'))!.result as { tools: { name: string; description: string }[] }
    expect(listed.tools.length).toBeLessThanOrEqual(12)
    expect(listed.tools.length).toBe(tools.length)
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

    const { text } = await call('get_board', { project: 'Crunchy' })
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
    const { text } = await call('get_board', { project: 'Crunchy' })
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
    const { isError, text } = await call('get_board', { project: 'Crunchie' })
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

    const board = await services.board.get((await services.projects.list())[0]!.id)
    const id = board.columns[0]!.cards[0]!.id

    const { isError, text } = await call('get_card', { project: 'Crunchy', card: id })
    expect(isError).toBe(false)
    expect(text).toContain('column: To Do')
  })

  it('reports an empty workspace usefully', async () => {
    const { text } = await call('get_board', { project: 'Anything' })
    expect(text).toContain('(none exist yet)')
  })
})
