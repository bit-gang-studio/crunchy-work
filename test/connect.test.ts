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

  /**
   * Claude Code delegates the write to `claude mcp add`, but it still has to
   * answer "already done?" itself. It used to return `written` unconditionally,
   * so boot offered to connect it on *every* start — contradicting the promise
   * in `boot.ts` that once you say yes, it never asks again.
   */
  it('reports Claude Code as unchanged once it is configured', () => {
    const claudeCli = () => ({ ok: true })
    const path = join(home, '.claude.json')
    writeFileSync(path, JSON.stringify({ mcpServers: {} }))

    expect(run({ runCli: claudeCli }).find((r) => r.id === 'claude-code')!.status).toBe('written')

    // What `claude mcp add` would have left behind.
    writeFileSync(
      path,
      JSON.stringify({ mcpServers: { crunchy: { command: LAUNCH.command, args: LAUNCH.args } } }),
    )
    expect(run({ runCli: claudeCli }).find((r) => r.id === 'claude-code')!.status).toBe('unchanged')
  })

  it('re-writes Claude Code when the launch command has changed', () => {
    const claudeCli = () => ({ ok: true })
    writeFileSync(
      join(home, '.claude.json'),
      JSON.stringify({ mcpServers: { crunchy: { command: 'npx', args: ['-y', 'crunchy-work', 'mcp', '--data', '/elsewhere'] } } }),
    )
    expect(run({ runCli: claudeCli }).find((r) => r.id === 'claude-code')!.status).toBe('written')
  })

  it('is idempotent — a second run changes nothing', () => {
    install('cursor')
    expect(run().find((r) => r.id === 'cursor')!.status).toBe('written')
    expect(run().find((r) => r.id === 'cursor')!.status).toBe('unchanged')
  })

  /**
   * This test used to assert the opposite — that an unparseable config gets
   * replaced — and that "recovery" was destroying people's setups. A config we
   * cannot read is not an empty config; it is someone else's file that we do
   * not understand, and the only safe move is to leave it alone and say so.
   */
  it('refuses an unreadable config rather than replacing it', () => {
    install('cursor')
    writeFileSync(pathFor('cursor'), '{ not json at all')

    const result = run().find((r) => r.id === 'cursor')!
    expect(result.status).toBe('failed')
    expect(result.detail).toMatch(/could not parse/i)
    // Untouched — byte for byte.
    expect(readFileSync(pathFor('cursor'), 'utf8')).toBe('{ not json at all')
  })

  /**
   * The case that actually bit: VS Code officially allows comments in
   * `mcp.json`, so a perfectly valid file parsed as "corrupt" and every other
   * MCP server the user had configured was silently deleted.
   */
  it('keeps other servers in a commented (JSONC) config', () => {
    install('vscode')
    writeFileSync(
      pathFor('vscode'),
      `{
  // the servers I already use
  "servers": {
    "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"] }
  }
}
`,
    )

    expect(run().find((r) => r.id === 'vscode')!.status).toBe('written')
    const config = read(pathFor('vscode'))
    expect(config.servers.github).toBeDefined()
    expect(config.servers.crunchy).toBeDefined()
  })

  it('does not mistake a // inside a string for a comment', () => {
    install('cursor')
    writeFileSync(
      pathFor('cursor'),
      JSON.stringify({ mcpServers: { docs: { command: 'open', args: ['https://example.com'] } } }),
    )

    expect(run().find((r) => r.id === 'cursor')!.status).toBe('written')
    const config = read(pathFor('cursor'))
    expect(config.mcpServers.docs.args).toEqual(['https://example.com'])
    expect(config.mcpServers.crunchy).toBeDefined()
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
