import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { existsSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import type { Store } from '../db/index.js'
import { createServices } from '../services/index.js'
import { createRoutes } from './routes.js'

export interface AppOptions {
  store: Store
  /** Absolute path to the built web assets. Omitted in tests and in dev, where Vite serves them. */
  webRoot?: string
}

export function createApp({ store, webRoot }: AppOptions): Hono {
  const app = new Hono()
  const services = createServices(store)

  app.get('/api/health', (c) => {
    const row = store.raw.prepare('SELECT value FROM meta WHERE key = ?').get('created_at') as
      | { value: string }
      | undefined
    return c.json({ ok: true, createdAt: row?.value ?? null })
  })

  app.route('/api', createRoutes(services))

  if (webRoot && existsSync(webRoot)) {
    // serveStatic resolves relative to the working directory, not to us.
    const root = relative(process.cwd(), resolve(webRoot)).replaceAll('\\', '/') || '.'
    app.use('/*', serveStatic({ root }))
    // SPA fallback: any unmatched GET renders the app shell so deep links work.
    app.get('*', serveStatic({ root, path: 'index.html' }))
  }

  return app
}
