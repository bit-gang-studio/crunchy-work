import { asc, eq, sql } from 'drizzle-orm'
import type { Store } from '../db/index.js'
import { newId } from '../db/id.js'
import { initialRanks, rankAfter, rankForIndex } from '../db/rank.js'
import { columns, projects, type Project } from '../db/schema.js'
import { NotFoundError, ValidationError } from './errors.js'

/** A new project starts usable, not empty — an empty board teaches nothing. */
const DEFAULT_COLUMNS = ['To Do', 'In Progress', 'Done']

const touch = { updatedAt: sql`(datetime('now'))` }

export function projectsService(store: Store) {
  const { db } = store

  async function list(): Promise<Project[]> {
    return db.select().from(projects).orderBy(asc(projects.rank))
  }

  async function get(id: string): Promise<Project> {
    const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
    if (!row) throw new NotFoundError(`Project "${id}"`)
    return row
  }

  async function create(input: { name: string; description?: string }): Promise<Project> {
    const name = input.name?.trim()
    if (!name) throw new ValidationError('A project needs a name')

    const existing = await db
      .select({ rank: projects.rank })
      .from(projects)
      .orderBy(asc(projects.rank))
    const id = newId()

    await db.insert(projects).values({
      id,
      name,
      description: input.description ?? '',
      rank: rankAfter(existing.at(-1)?.rank ?? null),
    })

    const ranks = initialRanks(DEFAULT_COLUMNS.length)
    await db.insert(columns).values(
      DEFAULT_COLUMNS.map((columnName, i) => ({
        id: newId(),
        projectId: id,
        name: columnName,
        rank: ranks[i]!,
      })),
    )

    return get(id)
  }

  async function update(
    id: string,
    patch: { name?: string; description?: string },
  ): Promise<Project> {
    await get(id)
    const next: Record<string, unknown> = { ...touch }
    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (!name) throw new ValidationError('A project needs a name')
      next.name = name
    }
    if (patch.description !== undefined) next.description = patch.description
    await db.update(projects).set(next).where(eq(projects.id, id))
    return get(id)
  }

  /** Deleting cascades to columns, cards and docs via the schema's FKs. */
  async function remove(id: string): Promise<void> {
    await get(id)
    await db.delete(projects).where(eq(projects.id, id))
  }

  async function move(id: string, index: number): Promise<Project> {
    await get(id)
    const others = (await list()).filter((p) => p.id !== id)
    await db
      .update(projects)
      .set({ rank: rankForIndex(others.map((p) => p.rank), index), ...touch })
      .where(eq(projects.id, id))
    return get(id)
  }

  return { list, get, create, update, remove, move }
}

export type ProjectsService = ReturnType<typeof projectsService>
