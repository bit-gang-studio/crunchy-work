import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { CLIENTS, type ClientDef, type Platform } from './clients.js'

export interface Launch {
  command: string
  args: string[]
}

export type Status = 'written' | 'unchanged' | 'not-installed' | 'failed'

export interface ConnectResult {
  id: string
  label: string
  path: string
  status: Status
  detail?: string
}

export interface ConnectOptions {
  home?: string
  platform?: Platform
  env?: NodeJS.ProcessEnv
  serverName?: string
  launch?: Launch
  dryRun?: boolean
  /** Injected in tests so we never shell out to a real `claude` binary. */
  runCli?: (bin: string, args: string[]) => { ok: boolean; message?: string }
}

/**
 * How a client should start us.
 *
 * From an installed package that's `npx -y crunchy-work mcp`, which always
 * resolves the published version. From a source checkout it has to be this
 * checkout's own binary, or a developer's connect would silently point their
 * agent at whatever npm last published.
 */
/**
 * The command a client should run to reach this Crunchy.
 *
 * `dataDir` is passed through as `--data`, and leaving it out was the failure
 * `db/index.ts` calls "the most confusing failure this product could have":
 * start with `crunchy --data ./repo-board`, accept the connect prompt, and your
 * agent is wired to `~/.crunchy` while the browser in front of you shows
 * `./repo-board`. Two different boards, no indication, and every question you
 * ask the agent answered from the wrong one.
 *
 * Omitted when the default directory is in use, so the common case stays a
 * short, readable command.
 */
export function resolveLaunch(dataDir?: string): Launch {
  const binPath = fileURLToPath(new URL('../../bin/crunchy.js', import.meta.url))
  const isCheckout = existsSync(join(dirname(dirname(binPath)), 'src'))
  const data = dataDir ? ['--data', dataDir.replaceAll('\\', '/')] : []
  return isCheckout
    ? { command: 'node', args: [binPath.replaceAll('\\', '/'), 'mcp', ...data] }
    : { command: 'npx', args: ['-y', 'crunchy-work', 'mcp', ...data] }
}

function defaultRunCli(bin: string, args: string[]) {
  const result = spawnSync(bin, args, { encoding: 'utf8', shell: process.platform === 'win32' })
  if (result.error) return { ok: false, message: result.error.message }
  if (result.status !== 0) {
    return { ok: false, message: (result.stderr || result.stdout || '').trim().split('\n')[0] }
  }
  return { ok: true }
}

function onPath(bin: string, run: NonNullable<ConnectOptions['runCli']>): boolean {
  return run(bin, ['--version']).ok
}

/**
 * Strip `//` and block comments so JSONC parses.
 *
 * VS Code officially allows comments in `mcp.json`, and people annotate these
 * files. Skips anything inside a string, so a `//` in a URL or a Windows path
 * survives.
 */
function stripJsonComments(text: string): string {
  let out = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (inString) {
      out += char
      if (escaped) escaped = false
      else if (char === '\\') escaped = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      out += char
      continue
    }
    if (char === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
      continue
    }
    if (char === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2)
      i = end === -1 ? text.length : end + 1
      continue
    }
    out += char
  }
  return out
}

/** A config we could not read. Distinct from "no config" — see `readConfig`. */
class UnreadableConfigError extends Error {}

/**
 * Read a config file.
 *
 * **Absent is not the same as unreadable**, and conflating the two destroyed
 * people's setups: this used to return `{}` on a parse failure, so a VS Code
 * `mcp.json` with a comment in it — which VS Code accepts — was replaced
 * wholesale by a fresh object containing only Crunchy. Every other MCP server
 * the user had configured silently disappeared, and the command printed
 * "Connected".
 *
 * So comments are tolerated, and anything still unparseable is refused rather
 * than overwritten. We are a guest in this file.
 */
function readConfig(path: string): Record<string, unknown> {
  if (!existsSync(path)) return {}
  const raw = readFileSync(path, 'utf8')
  if (!raw.trim()) return {}

  for (const candidate of [raw, stripJsonComments(raw)]) {
    try {
      const parsed = JSON.parse(candidate) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>
      }
    } catch {
      /* try the next candidate */
    }
  }

  throw new UnreadableConfigError(
    `could not parse ${path} — left it alone. Fix the JSON, or add Crunchy by hand.`,
  )
}

/**
 * A client counts as installed if its config file exists, or the dedicated
 * directory that would hold it does — a client creates `~/.cursor` on first
 * run, so the directory is a fair signal.
 *
 * The exception matters: some clients keep their config directly in the home
 * directory (`~/.claude.json`), where "does the parent exist?" is always true
 * and would report every client as installed. For those, only the file counts.
 */
function isInstalled(path: string, home: string): boolean {
  if (existsSync(path)) return true
  const parent = dirname(path)
  return parent !== home && existsSync(parent)
}

function writeInto(
  client: ClientDef,
  path: string,
  serverName: string,
  launch: Launch,
  dryRun: boolean,
): ConnectResult {
  const base = { id: client.id, label: client.label, path }
  try {
    const config = readConfig(path)
    const section = (config[client.key] ?? {}) as Record<string, unknown>
    const desired = { command: launch.command, args: launch.args }

    if (JSON.stringify(section[serverName]) === JSON.stringify(desired)) {
      return { ...base, status: 'unchanged' }
    }
    if (dryRun) return { ...base, status: 'written', detail: 'dry run' }

    // Back up before touching a file we didn't create — these hold other state.
    // It is also what makes rewriting a commented (JSONC) config acceptable:
    // we preserve the servers but not the comments, and the backup has both.
    if (existsSync(path)) copyFileSync(path, `${path}.crunchy-backup`)
    else mkdirSync(dirname(path), { recursive: true })

    config[client.key] = { ...section, [serverName]: desired }
    writeFileSync(path, JSON.stringify(config, null, 2) + '\n', 'utf8')
    return { ...base, status: 'written' }
  } catch (err) {
    return { ...base, status: 'failed', detail: (err as Error).message }
  }
}

export function connect(options: ConnectOptions = {}): ConnectResult[] {
  const home = options.home ?? homedir()
  const platform = options.platform ?? (process.platform as Platform)
  const env = options.env ?? process.env
  const serverName = options.serverName ?? 'crunchy'
  const launch = options.launch ?? resolveLaunch()
  const dryRun = options.dryRun ?? false
  const runCli = options.runCli ?? defaultRunCli

  return CLIENTS.map((client): ConnectResult => {
    const path = client.path(home, platform, env)
    if (!path) return { id: client.id, label: client.label, path: '', status: 'not-installed' }
    if (!isInstalled(path, home)) {
      return { id: client.id, label: client.label, path, status: 'not-installed' }
    }

    /*
     * Claude Code's ~/.claude.json carries a lot of its own state, and it owns
     * the format. When its CLI is available let it do the write — rewriting
     * someone's config by hand is not a risk worth taking for one entry. The
     * file path stays as the fallback for when the CLI isn't installed.
     */
    if (client.id === 'claude-code' && onPath('claude', runCli)) {
      const base = { id: client.id, label: client.label, path: 'via `claude mcp add`' }

      /*
       * We delegate the *write*, but we still have to answer "is this already
       * done?" ourselves — and returning `written` unconditionally meant
       * Claude Code could never report `unchanged`, so boot offered to connect
       * it on every single start. That directly contradicts what `boot.ts`
       * promises: "once you have said yes, this never asks again."
       *
       * The CLI writes into the same `~/.claude.json` we already know how to
       * read, so read it. A parse failure here is not fatal — fall through and
       * let the CLI decide, which is the safe direction to be wrong in.
       */
      try {
        const existing = readConfig(path)[client.key] as Record<string, unknown> | undefined
        const current = existing?.[serverName] as { command?: string; args?: string[] } | undefined
        if (
          current?.command === launch.command &&
          JSON.stringify(current?.args) === JSON.stringify(launch.args)
        ) {
          return { ...base, status: 'unchanged' }
        }
      } catch {
        /* unreadable — let the CLI handle it */
      }

      if (dryRun) return { ...base, status: 'written', detail: 'dry run' }
      const result = runCli('claude', [
        'mcp',
        'add',
        serverName,
        '-s',
        'user',
        '--',
        launch.command,
        ...launch.args,
      ])
      return result.ok
        ? { ...base, status: 'written' }
        : { ...base, status: 'failed', detail: result.message }
    }

    return writeInto(client, path, serverName, launch, dryRun)
  })
}

/** What the user sees. Anything not written gets a copyable line instead. */
export function renderConnect(results: ConnectResult[], launch: Launch, serverName: string): string {
  const lines: string[] = []
  const done = results.filter((r) => r.status === 'written' || r.status === 'unchanged')
  const failed = results.filter((r) => r.status === 'failed')
  const missing = results.filter((r) => r.status === 'not-installed')

  if (done.length) {
    lines.push('  Connected:')
    for (const r of done) {
      lines.push(`    ${r.label}${r.status === 'unchanged' ? ' (already set up)' : ''}`)
    }
  }

  if (failed.length) {
    lines.push('', '  Could not write:')
    for (const r of failed) lines.push(`    ${r.label} — ${r.detail ?? 'unknown error'}`)
  }

  if (!done.length && !failed.length) {
    lines.push('  No agent clients found.')
  }

  if (missing.length) {
    lines.push('', `  Not installed: ${missing.map((r) => r.label).join(', ')}`)
  }

  lines.push(
    '',
    '  To connect anything else, point it at:',
    `    ${launch.command} ${launch.args.join(' ')}`,
    `  (server name: ${serverName})`,
  )
  return lines.join('\n')
}
