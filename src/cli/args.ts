/**
 * A very small argument parser.
 *
 * Deliberately hand-rolled: the whole surface is four commands and four flags,
 * and a dependency here would be weight on every `npx` run for something a
 * dozen lines can do. If this ever grows past a screen, reach for a library.
 */
export interface Options {
  command: 'start' | 'mcp' | 'connect' | 'export' | 'help' | 'version'
  /** Positional argument after the command, e.g. the export destination. */
  target?: string
  port?: number
  data?: string
  open: boolean
  dryRun: boolean
  /** Skip the interactive "connect your agent?" prompt. */
  yes: boolean
}

const COMMANDS = new Set(['mcp', 'connect', 'export'])

export function parseArgs(argv: string[]): Options {
  const options: Options = { command: 'start', open: true, dryRun: false, yes: false }
  const rest: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '--help' || arg === '-h') return { ...options, command: 'help' }
    if (arg === '--version' || arg === '-v') return { ...options, command: 'version' }
    else if (arg === '--no-open') options.open = false
    else if (arg === '--dry-run') options.dryRun = true
    else if (arg === '--yes' || arg === '-y') options.yes = true
    else if (arg === '--port') options.port = Number(argv[++i])
    else if (arg.startsWith('--port=')) options.port = Number(arg.slice(7))
    else if (arg === '--data') options.data = argv[++i]
    else if (arg.startsWith('--data=')) options.data = arg.slice(7)
    else if (!arg.startsWith('-')) rest.push(arg)
  }

  const [first, ...others] = rest
  if (first && COMMANDS.has(first)) {
    options.command = first as Options['command']
    options.target = others[0]
  } else if (first) {
    options.target = first
  }

  if (options.port !== undefined && !Number.isInteger(options.port)) {
    throw new Error(`--port needs a number`)
  }
  return options
}

export const HELP = `
  Crunchy — a kanban board and docs your coding agent can drive.

  Usage
    crunchy                 Start the app and open it in your browser
    crunchy mcp             Run the MCP server on stdio (no server needed)
    crunchy connect         Wire up installed agent clients
    crunchy export [dir]    Write everything out as markdown and JSON

  Options
    --port <n>              Port for the app (default 4420)
    --data <dir>            Where the database lives (default ~/.crunchy)
    --no-open               Don't open a browser
    --yes, -y               Don't ask anything; accept the defaults
    --dry-run               For connect: show what would change
    --help, --version

  Docs  https://crunchy.work
`
