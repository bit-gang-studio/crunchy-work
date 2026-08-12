import { asc, eq, sql } from 'drizzle-orm'
import type { Store } from '../db/index.js'
import { newId } from '../db/id.js'
import { rankAfter, rankForIndex } from '../db/rank.js'
import { columns, projects, type Column } from '../db/schema.js'
import { NotFoundError, ValidationError } from './errors.js'

const touch = { updatedAt: sql`(datetime('now'))` }

export function columnsService(store: Store) {
  const { db } = store

  async function listForProject(projectId: string): Promise<Column[]> {
    return db.select().from(columns).where(eq(columns.projectId, projectId)).orderBy(asc(columns.rank))
  }

  async function get(id: string): Promise<Column> {
    const [row] = await db.select().from(columns).where(eq(columns.id, id)).limit(1)
    if (!row) throw new NotFoundError(`Column "${id}"`)
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

  async function create(projectId: string, input: { name: string }): Promise<Column> {
    await requireProject(projectId)
    const name = input.name?.trim()
    if (!name) throw new ValidationError('A column needs a name')

    const existing = await listForProject(projectId)
    const id = newId()
    await db.insert(columns).values({
      id,
      projectId,
      name,
      rank: rankAfter(existing.at(-1)?.rank ?? null),
    })
    return get(id)
  }

  async function rename(id: string, name: string): Promise<Column> {
    await get(id)
    const trimmed = name?.trim()
    if (!trimmed) throw new ValidationError('A column needs a name')
    await db.update(columns).set({ name: trimmed, ...touch }).where(eq(columns.id, id))
    return get(id)
  }

  /** Deleting a column deletes its cards — the FK cascade, not a soft delete. */
  async function remove(id: string): Promise<void> {
    await get(id)
    await db.delete(columns).where(eq(columns.id, id))
  }

  async function move(id: string, index: number): Promise<Column> {
    const column = await get(id)
    const others = (await listForProject(column.projectId)).filter((c) => c.id !== id)
    await db
      .update(columns)
      .set({ rank: rankForIndex(others.map((c) => c.rank), index), ...touch })
      .where(eq(columns.id, id))
    return get(id)
  }

  return { listForProject, get, create, rename, remove, move }
}

export type ColumnsService = ReturnType<typeof columnsService>
