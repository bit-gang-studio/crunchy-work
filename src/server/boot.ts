import { serve } from '@hono/node-server'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { openStore, resolveDataDir } from '../db/index.js'
import { parseArgs } from '../cli/args.js'
import { connect, renderConnect, resolveLaunch } from '../cli/connect.js'
import { openBrowser } from '../cli/open.js'
import { createApp } from './app.js'
import { watchForChanges } from './events.js'

const DEFAULT_PORT = 4420

/**
 * Ask a yes/no question, defaulting to yes on a bare Enter.
 *
 * Only ever called on an interactive terminal. Piped into a script, or run by a
 * process manager, this would hang forever waiting for input that never comes —
 * so the caller checks `isTTY` first.
 */
function ask(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout })
    rl.question(question, (answer) => {
      rl.close()
      resolve(!/^n/i.test(answer.trim()))
    })
  })
}

/**
 * Offer to wire up agent clients — the "one keypress" half of the promise.
 *
 * It only asks when there is something to do: `connect` reports `unchanged` for
 * a client already pointing at Crunchy, so once you have said yes, this never
 * asks again. A prompt that reappears every start would be worse than no prompt.
 */
async function offerToConnect(yes: boolean, dataDir: string): Promise<void> {
  // Wire clients to the board actually being served, not the default one.
  const launch = resolveLaunch(dataDir === resolveDataDir() ? undefined : dataDir)
  const preview = connect({ dryRun: true, launch })
  const pending = preview.filter((r) => r.status === 'written')
  if (!pending.length) return

  const names = pending.map((r) => r.label).join(' and ')
  const accepted = yes || (await ask(`  Connect ${names} to Crunchy? [Y/n] `))
  if (!accepted) {
    process.stdout.write(`\n  Skipped. Run \`crunchy connect\` any time.\n\n`)
    return
  }

  const results = connect({ launch })
  process.stdout.write(`\n${renderConnect(results, launch, 'crunchy')}\n\n`)
}

export async function boot(): Promise<void> {
  const options = parseArgs(process.argv.slice(2))
  const dataDir = resolveDataDir(options.data)
  const store = openStore(dataDir)

  // dist/server/boot.js -> dist/web
  const webRoot = join(dirname(dirname(fileURLToPath(import.meta.url))), 'web')
  const changes = watchForChanges(dataDir)
  const app = createApp({ store, webRoot, changes })

  const port = options.port ?? Number(process.env.PORT ?? DEFAULT_PORT)

  /*
   * A busy port is the most likely first failure for an `npx` product — you
   * left one running in another tab. Unhandled, Node prints twenty lines of
   * EADDRINUSE with internal frames and exits 0, which reads like a crash and
   * says nothing about what to do.
   */
  const server = serve({ fetch: app.fetch, port }, (info) => {
    const url = `http://localhost:${info.port}`
    process.stdout.write(`\n  Crunchy is running\n\n  ${url}\n  data · ${dataDir}\n\n`)

    if (options.open) openBrowser(url)

    // Only prompt on a real terminal — piped or supervised, this would hang.
    const interactive = process.stdin.isTTY && process.stdout.isTTY
    if (interactive || options.yes) {
      void offerToConnect(options.yes, dataDir).then(() => {
        process.stdout.write(`  Ctrl-C to stop.\n\n`)
      })
    }
  })

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      process.stderr.write(
        `\n  Port ${port} is already in use.\n\n` +
          `  Another Crunchy may already be running — try http://localhost:${port}\n` +
          `  Or start this one elsewhere:  crunchy --port ${port + 1}\n\n`,
      )
    } else {
      process.stderr.write(`\n  Could not start Crunchy: ${err.message}\n\n`)
    }
    changes.close()
    store.close()
    process.exit(1)
  })

  const shutdown = () => {
    changes.close()
    store.close()
    process.exit(0)
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
}

await boot()
