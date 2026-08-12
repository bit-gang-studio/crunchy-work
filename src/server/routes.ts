import { Hono } from 'hono'
import type { Services } from '../services/index.js'
import type { AcceptanceCriterion, Size } from '../shared/types.js'
import { NotFoundError, ValidationError } from '../services/index.js'

/** Tolerate an absent or empty body so `PATCH` with no fields isn't a 500. */
async function body<T extends object>(c: { req: { json: () => Promise<unknown> } }): Promise<T> {
  try {
    return ((await c.req.json()) ?? {}) as T
  } catch {
    return {} as T
  }
}

export function createRoutes(services: Services): Hono {
  const api = new Hono()

  api.onError((err, c) => {
    if (err instanceof NotFoundError) return c.json({ error: err.message }, 404)
    if (err instanceof ValidationError) return c.json({ error: err.message }, 400)
    console.error(err)
    return c.json({ error: 'Internal error' }, 500)
  })

  // ── projects ────────────────────────────────────────────────────────────
  api.get('/projects', async (c) => c.json(await services.projects.listWithCounts()))

  api.post('/projects', async (c) => {
    const input = await body<{ name: string; description?: string }>(c)
    return c.json(await services.projects.create(input), 201)
  })

  /** A project id returns the whole board — the one call that orients a client. */
  api.get('/projects/:id', async (c) => c.json(await services.board.get(c.req.param('id'))))

  api.patch('/projects/:id', async (c) => {
    const patch = await body<{ name?: string; description?: string }>(c)
    return c.json(await services.projects.update(c.req.param('id'), patch))
  })

  api.delete('/projects/:id', async (c) => {
    await services.projects.remove(c.req.param('id'))
    return c.body(null, 204)
  })

  api.post('/projects/:id/move', async (c) => {
    const { index } = await body<{ index: number }>(c)
    return c.json(await services.projects.move(c.req.param('id'), index ?? 0))
  })

  // ── columns ─────────────────────────────────────────────────────────────
  api.post('/projects/:id/columns', async (c) => {
    const input = await body<{ name: string }>(c)
    return c.json(await services.columns.create(c.req.param('id'), input), 201)
  })

  api.patch('/columns/:id', async (c) => {
    const { name } = await body<{ name: string }>(c)
    return c.json(await services.columns.rename(c.req.param('id'), name))
  })

  api.delete('/columns/:id', async (c) => {
    await services.columns.remove(c.req.param('id'))
    return c.body(null, 204)
  })

  api.post('/columns/:id/move', async (c) => {
    const { index } = await body<{ index: number }>(c)
    return c.json(await services.columns.move(c.req.param('id'), index ?? 0))
  })

  // ── cards ───────────────────────────────────────────────────────────────
  api.post('/columns/:id/cards', async (c) => {
    const input = await body<{
      title: string
      description?: string
      dueAt?: string | null
      acceptanceCriteria?: AcceptanceCriterion[]
      size?: Size | null
    }>(c)
    return c.json(await services.cards.create(c.req.param('id'), input), 201)
  })

  api.get('/cards/:id', async (c) => c.json(await services.cards.get(c.req.param('id'))))

  api.patch('/cards/:id', async (c) => {
    const patch = await body<{
      title?: string
      description?: string
      dueAt?: string | null
      completed?: boolean
      acceptanceCriteria?: AcceptanceCriterion[]
      size?: Size | null
    }>(c)
    return c.json(await services.cards.update(c.req.param('id'), patch))
  })

  api.delete('/cards/:id', async (c) => {
    await services.cards.remove(c.req.param('id'))
    return c.body(null, 204)
  })

  api.post('/cards/:id/move', async (c) => {
    const to = await body<{ columnId?: string; index?: number; rank?: string }>(c)
    return c.json(await services.cards.move(c.req.param('id'), to))
  })

  // ── docs ────────────────────────────────────────────────────────────────
  api.get('/projects/:id/docs', async (c) =>
    c.json(await services.docs.listForProject(c.req.param('id'))),
  )

  api.post('/projects/:id/docs', async (c) => {
    const input = await body<{ title: string; content?: string }>(c)
    return c.json(await services.docs.create(c.req.param('id'), input), 201)
  })

  api.get('/docs/:id', async (c) => c.json(await services.docs.get(c.req.param('id'))))

  api.patch('/docs/:id', async (c) => {
    const patch = await body<{ title?: string; content?: string }>(c)
    return c.json(await services.docs.update(c.req.param('id'), patch))
  })

  api.delete('/docs/:id', async (c) => {
    await services.docs.remove(c.req.param('id'))
    return c.body(null, 204)
  })

  return api
}
