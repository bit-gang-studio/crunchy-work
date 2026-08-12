import { Hono } from 'hono'
import { serveStatic } from '@hono/node-server/serve-static'
import { existsSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import type { Store } from '../db/index.js'
import { createServices } from '../services/index.js'
import { handleRpc, type RpcRequest } from '../mcp/jsonrpc.js'
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

  /**
   * The HTTP transport — the same tool surface as `crunchy mcp`, for clients
   * that talk to a URL rather than spawning a process. Stateless: no session,
   * so any request stands alone.
   */
  app.post('/mcp', async (c) => {
    let message: RpcRequest
    try {
      message = (await c.req.json()) as RpcRequest
    } catch {
      return c.json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }, 400)
    }
    const response = await handleRpc(services, message)
    return response ? c.json(response) : c.body(null, 202)
  })

  if (webRoot && existsSync(webRoot)) {
    // serveStatic resolves relative to the working directory, not to us.
    const root = relative(process.cwd(), resolve(webRoot)).replaceAll('\\', '/') || '.'
    app.use('/*', serveStatic({ root }))
    // SPA fallback: any unmatched GET renders the app shell so deep links work.
    app.get('*', serveStatic({ root, path: 'index.html' }))
  }

  return app
}
