import { serve } from '@hono/node-server'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { openStore, resolveDataDir } from '../db/index.js'
import { createApp } from './app.js'
import { watchForChanges } from './events.js'

const DEFAULT_PORT = 4420

export async function boot(): Promise<void> {
  const dataDir = resolveDataDir()
  const store = openStore(dataDir)

  // dist/server/boot.js -> dist/web
  const webRoot = join(dirname(dirname(fileURLToPath(import.meta.url))), 'web')
  const changes = watchForChanges(dataDir)
  const app = createApp({ store, webRoot, changes })

  const port = Number(process.env.PORT ?? DEFAULT_PORT)
  serve({ fetch: app.fetch, port }, (info) => {
    process.stdout.write(
      `\n  Crunchy\n` +
        `  data  ${dataDir}\n` +
        `  web   http://localhost:${info.port}\n\n`,
    )
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
