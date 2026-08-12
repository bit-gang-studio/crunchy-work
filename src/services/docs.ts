import { asc, eq, sql } from 'drizzle-orm'
import type { Store } from '../db/index.js'
import { newId } from '../db/id.js'
import { rankAfter } from '../db/rank.js'
import { docs, projects, type Doc } from '../db/schema.js'
import { NotFoundError, ValidationError } from './errors.js'

const touch = { updatedAt: sql`(datetime('now'))` }

export function docsService(store: Store) {
  const { db } = store

  /** Listing omits `content` — a doc list shouldn't drag every document's body with it. */
  async function listForProject(projectId: string) {
    return db
      .select({
        id: docs.id,
        projectId: docs.projectId,
        title: docs.title,
        rank: docs.rank,
        createdAt: docs.createdAt,
        updatedAt: docs.updatedAt,
      })
      .from(docs)
      .where(eq(docs.projectId, projectId))
      .orderBy(asc(docs.rank))
  }

  async function get(id: string): Promise<Doc> {
    const [row] = await db.select().from(docs).where(eq(docs.id, id)).limit(1)
    if (!row) throw new NotFoundError(`Doc "${id}"`)
    return row
  }

  async function requireProject(projectId: string): Promise<void> {
    const [row] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.id, projectId))
      .limit(1)
    if (!row) throw new NotFoundError(`Project "${projectId}"`)
  }

  async function create(
    projectId: string,
    input: { title: string; content?: string },
  ): Promise<Doc> {
    await requireProject(projectId)
    const title = input.title?.trim()
    if (!title) throw new ValidationError('A doc needs a title')

    const existing = await listForProject(projectId)
    const id = newId()
    await db.insert(docs).values({
      id,
      projectId,
      title,
      content: input.content ?? '',
      rank: rankAfter(existing.at(-1)?.rank ?? null),
    })
    return get(id)
  }

  async function update(id: string, patch: { title?: string; content?: string }): Promise<Doc> {
    await get(id)
    const next: Record<string, unknown> = { ...touch }
    if (patch.title !== undefined) {
      const title = patch.title.trim()
      if (!title) throw new ValidationError('A doc needs a title')
      next.title = title
    }
    if (patch.content !== undefined) next.content = patch.content
    await db.update(docs).set(next).where(eq(docs.id, id))
    return get(id)
  }

  async function remove(id: string): Promise<void> {
    await get(id)
    await db.delete(docs).where(eq(docs.id, id))
  }

  return { listForProject, get, create, update, remove }
}

export type DocsService = ReturnType<typeof docsService>
