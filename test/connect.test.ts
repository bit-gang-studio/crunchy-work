import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { CLIENTS } from '../src/cli/clients.js'
import { connect, renderConnect, type ConnectOptions, type Launch } from '../src/cli/connect.js'

let home: string

const LAUNCH: Launch = { command: 'npx', args: ['-y', 'crunchy-work', 'mcp'] }

/** No `claude` binary unless a test says otherwise, so nothing shells out. */
const noCli = () => ({ ok: false, message: 'not found' })

function run(overrides: Partial<ConnectOptions> = {}) {
  return connect({
    home,
    platform: 'linux',
    env: {},
    launch: LAUNCH,
    serverName: 'crunchy',
    runCli: noCli,
    ...overrides,
  })
}

function pathFor(id: string, platform: 'linux' | 'win32' | 'darwin' = 'linux', env = {}) {
  return CLIENTS.find((c) => c.id === id)!.path(home, platform, env)!
}

/**
 * Simulate a client being present. Most are detected by their own config
 * directory; ones that live directly in the home directory need the file.
 */
function install(id: string) {
  const path = pathFor(id)
  const parent = join(path, '..')
  mkdirSync(parent, { recursive: true })
  if (resolve(parent) === resolve(home)) writeFileSync(path, '{}')
}

function read(path: string) {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, Record<string, unknown>>
}

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'crunchy-home-'))
})

afterEach(() => {
  rmSync(home, { recursive: true, force: true })
})

describe('detection', () => {
  it('reports nothing installed on a bare home directory', () => {
    expect(run().every((r) => r.status === 'not-installed')).toBe(true)
  })

  it('writes only for clients that are actually present', () => {
    install('cursor')
    const results = run()
    expect(results.find((r) => r.id === 'cursor')!.status).toBe('written')
    expect(results.find((r) => r.id === 'windsurf')!.status).toBe('not-installed')
    expect(existsSync(pathFor('windsurf'))).toBe(false)
  })

  it('resolves platform-specific paths', () => {
    // `join` emits native separators, so compare on a normalised form.
    const slash = (p: string) => p.replaceAll('\\', '/')
    expect(slash(pathFor('claude-desktop', 'darwin'))).toContain(
      'Library/Application Support/Claude',
    )
    expect(slash(pathFor('claude-desktop', 'win32', { APPDATA: 'C:/AppData' }))).toContain(
      'C:/AppData/Claude',
    )
    expect(slash(pathFor('claude-desktop', 'linux'))).toContain('.config/Claude')
    expect(slash(pathFor('vscode', 'linux'))).toContain('.config/Code/User/mcp.json')
  })
})

describe('writing config', () => {
  it('creates a valid entry', () => {
    install('cursor')
    run()
    expect(read(pathFor('cursor')).mcpServers.crunchy).toEqual({
      command: 'npx',
      args: ['-y', 'crunchy-work', 'mcp'],
    })
  })

  it('uses `servers`, not `mcpServers`, for VS Code', () => {
    install('vscode')
    run()
    const config = read(pathFor('vscode'))
    expect(config.servers?.crunchy).toBeDefined()
    expect(config.mcpServers).toBeUndefined()
  })

  it('preserves other servers and unrelated keys', () => {
    install('cursor')
    writeFileSync(
      pathFor('cursor'),
      JSON.stringify({ mcpServers: { other: { command: 'thing' } }, somethingElse: 42 }),
    )
    run()
    const config = read(pathFor('cursor'))
    expect(config.mcpServers.other).toEqual({ command: 'thing' })
    expect(config.somethingElse).toBe(42)
    expect(config.mcpServers.crunchy).toBeDefined()
  })

  it('backs up a file before changing it', () => {
    install('cursor')
    writeFileSync(pathFor('cursor'), JSON.stringify({ mcpServers: {} }))
    run()
    expect(existsSync(`${pathFor('cursor')}.crunchy-backup`)).toBe(true)
  })

  it('is idempotent — a second run changes nothing', () => {
    install('cursor')
    expect(run().find((r) => r.id === 'cursor')!.status).toBe('written')
    expect(run().find((r) => r.id === 'cursor')!.status).toBe('unchanged')
  })

  it('recovers from a corrupt config rather than throwing', () => {
    install('cursor')
    writeFileSync(pathFor('cursor'), '{ not json at all')
    expect(run().find((r) => r.id === 'cursor')!.status).toBe('written')
    expect(read(pathFor('cursor')).mcpServers.crunchy).toBeDefined()
  })

  it('writes nothing on a dry run', () => {
    install('cursor')
    const results = run({ dryRun: true })
    expect(results.find((r) => r.id === 'cursor')!.status).toBe('written')
    expect(existsSync(pathFor('cursor'))).toBe(false)
  })
})

describe('Claude Code', () => {
  it('delegates to the CLI when it is on PATH, rather than editing its config', () => {
    install('claude-code')
    const calls: string[][] = []
    const results = run({
      runCli: (bin, args) => {
        calls.push([bin, ...args])
        return { ok: true }
      },
    })

    expect(results.find((r) => r.id === 'claude-code')!.status).toBe('written')
    expect(calls.some((c) => c[1] === 'mcp' && c[2] === 'add')).toBe(true)
    // The point of delegating: we never rewrote the file ourselves.
    expect(existsSync(`${pathFor('claude-code')}.crunchy-backup`)).toBe(false)
  })

  it('falls back to writing the file when the CLI is missing', () => {
    install('claude-code')
    writeFileSync(pathFor('claude-code'), JSON.stringify({ projects: { keep: 'me' } }))
    run()
    const config = read(pathFor('claude-code'))
    expect(config.mcpServers.crunchy).toBeDefined()
    expect(config.projects).toEqual({ keep: 'me' })
  })

  it('surfaces a CLI failure instead of reporting success', () => {
    install('claude-code')
    const results = run({
      runCli: (_bin, args) =>
        args[0] === '--version' ? { ok: true } : { ok: false, message: 'boom' },
    })
    const claude = results.find((r) => r.id === 'claude-code')!
    expect(claude.status).toBe('failed')
    expect(claude.detail).toBe('boom')
  })
})

describe('output', () => {
  it('always offers a copyable command for anything it could not do', () => {
    const text = renderConnect(run(), LAUNCH, 'crunchy')
    expect(text).toContain('npx -y crunchy-work mcp')
    expect(text).toContain('No agent clients found')
  })

  it('names what it connected', () => {
    install('cursor')
    expect(renderConnect(run(), LAUNCH, 'crunchy')).toContain('Cursor')
  })
})
