import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { serveStatic } from '@hono/node-server/serve-static'
import type { ChangeStream } from './events.js'
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
  /** Live-update source. Omitted in tests, where nothing is watching. */
  changes?: ChangeStream
}

export function createApp({ store, webRoot, changes }: AppOptions): Hono {
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
   * Live updates. The payload is only a nudge — clients refetch, so they can
   * never drift from the server's state.
   */
  app.get('/api/events', (c) =>
    streamSSE(c, async (stream) => {
      // Tell the browser to reconnect quickly; a dropped stream should not mean
      // a board that has quietly stopped updating.
      await stream.writeSSE({ event: 'ready', data: '1', retry: 2000 })

      const unsubscribe = changes?.subscribe(() => {
        void stream.writeSSE({ event: 'change', data: String(Date.now()) })
      })
      stream.onAbort(() => unsubscribe?.())

      // Proxies and browsers drop idle connections; a periodic comment keeps it open.
      while (!stream.closed && !stream.aborted) {
        await stream.sleep(25_000)
        if (!stream.closed && !stream.aborted) await stream.writeSSE({ event: 'ping', data: '' })
      }
      unsubscribe?.()
    }),
  )

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
