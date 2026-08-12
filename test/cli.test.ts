import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openStore, type Store } from '../src/db/index.js'
import { createServices, type Services } from '../src/services/index.js'
import { parseArgs } from '../src/cli/args.js'
import { exportAll, slugify } from '../src/cli/export.js'

describe('parseArgs', () => {
  it('defaults to starting the app', () => {
    expect(parseArgs([])).toMatchObject({ command: 'start', open: true })
  })

  it('reads the commands', () => {
    expect(parseArgs(['mcp']).command).toBe('mcp')
    expect(parseArgs(['connect']).command).toBe('connect')
    expect(parseArgs(['export']).command).toBe('export')
  })

  it('takes a positional target after a command', () => {
    expect(parseArgs(['export', './out'])).toMatchObject({ command: 'export', target: './out' })
  })

  it('accepts flags in either form', () => {
    expect(parseArgs(['--port', '5000']).port).toBe(5000)
    expect(parseArgs(['--port=5000']).port).toBe(5000)
    expect(parseArgs(['--data', '/tmp/x']).data).toBe('/tmp/x')
    expect(parseArgs(['--data=/tmp/x']).data).toBe('/tmp/x')
  })

  it('handles flags before or after the command', () => {
    expect(parseArgs(['--port=1', 'export', 'out'])).toMatchObject({ command: 'export', target: 'out', port: 1 })
    expect(parseArgs(['export', 'out', '--port=1'])).toMatchObject({ command: 'export', target: 'out', port: 1 })
  })

  it('rejects a non-numeric port rather than starting on NaN', () => {
    expect(() => parseArgs(['--port', 'abc'])).toThrow(/number/)
  })

  it('recognises help and version anywhere', () => {
    expect(parseArgs(['--help']).command).toBe('help')
    expect(parseArgs(['export', '--version']).command).toBe('version')
  })

  it('understands the boolean flags', () => {
    expect(parseArgs(['--no-open']).open).toBe(false)
    expect(parseArgs(['-y']).yes).toBe(true)
    expect(parseArgs(['connect', '--dry-run']).dryRun).toBe(true)
  })
})

describe('slugify', () => {
  it('makes a readable, filesystem-safe name', () => {
    expect(slugify('Launch plan')).toBe('launch-plan')
    expect(slugify('  Q3 / Q4 — goals!  ')).toBe('q3-q4-goals')
  })

  it('never returns an empty name', () => {
    expect(slugify('!!!')).toBe('untitled')
    expect(slugify('')).toBe('untitled')
  })
})

describe('export', () => {
  let dir: string
  let out: string
  let store: Store
  let services: Services

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'crunchy-exp-'))
    out = mkdtempSync(join(tmpdir(), 'crunchy-out-'))
    store = openStore(dir)
    services = createServices(store)
  })

  afterEach(() => {
    store.close()
    rmSync(dir, { recursive: true, force: true })
    rmSync(out, { recursive: true, force: true })
  })

  it('writes a readable board and every doc, plus a complete JSON dump', async () => {
    const project = await services.projects.create({ name: 'Launch plan', description: 'The bet.' })
    const [todo, doing] = await services.columns.listForProject(project.id)
    await services.cards.create(todo!.id, { title: 'Write the announcement', description: 'Lead with MCP.' })
    await services.cards.create(doing!.id, { title: 'Ship it', dueAt: '2026-09-01' })
    await services.docs.create(project.id, { title: 'Architecture', content: '# Notes\n\nSQLite.' })

    const result = await exportAll(services, out)
    expect(result).toMatchObject({ projects: 1, cards: 2, docs: 1 })

    const board = readFileSync(join(out, 'launch-plan', 'board.md'), 'utf8')
    expect(board).toContain('# Launch plan')
    expect(board).toContain('## To Do')
    expect(board).toContain('- [ ] Write the announcement')
    expect(board).toContain('Lead with MCP.')
    expect(board).toContain('(due 2026-09-01)')

    const doc = readFileSync(join(out, 'launch-plan', 'docs', 'architecture.md'), 'utf8')
    expect(doc).toContain('# Architecture')
    expect(doc).toContain('SQLite.')

    // The JSON is the complete, re-importable version.
    const dump = JSON.parse(readFileSync(join(out, 'crunchy.json'), 'utf8'))
    expect(dump.projects).toHaveLength(1)
    expect(dump.projects[0].docs[0].content).toContain('SQLite.')
    expect(dump.exportedAt).toBeTruthy()
  })

  it('marks completed cards', async () => {
    const project = await services.projects.create({ name: 'Ticks' })
    const [todo] = await services.columns.listForProject(project.id)
    const card = await services.cards.create(todo!.id, { title: 'Done thing' })
    await services.cards.update(card.id, { completed: true })

    await exportAll(services, out)
    expect(readFileSync(join(out, 'ticks', 'board.md'), 'utf8')).toContain('- [x] Done thing')
  })

  it('exports an empty install without failing', async () => {
    const result = await exportAll(services, out)
    expect(result.projects).toBe(0)
    expect(JSON.parse(readFileSync(join(out, 'crunchy.json'), 'utf8')).projects).toEqual([])
  })
})
