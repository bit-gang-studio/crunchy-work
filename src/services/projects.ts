import { asc, count, eq, sql } from 'drizzle-orm'
import type { Store } from '../db/index.js'
import { newId } from '../db/id.js'
import { initialRanks, rankAfter, rankForIndex } from '../shared/rank.js'
import { cards, columns, docs, projects, type Project } from '../db/schema.js'
import type { ProjectSummary } from '../shared/types.js'
import { NotFoundError, ValidationError } from './errors.js'
import { MAX_NAME } from '../shared/limits.js'

/** A new project starts usable, not empty — an empty board teaches nothing. */
const DEFAULT_COLUMNS = ['To Do', 'In Progress', 'Done']

const touch = { updatedAt: sql`(datetime('now'))` }

/** A project name heads every listing, so it gets the same cap titles get. */
function normalizeName(name: string): string {
  const clean = (name ?? '').replace(/\s*\n+\s*/g, ' ').trim()
  if (!clean) throw new ValidationError('A project needs a name')
  if (clean.length > MAX_NAME) {
    throw new ValidationError(`A project name is one line (max ${MAX_NAME} characters).`)
  }
  return clean
}

export function projectsService(store: Store) {
  const { db } = store

  async function list(): Promise<Project[]> {
    return db.select().from(projects).orderBy(asc(projects.rank))
  }

  /**
   * Projects with their card and doc counts, in one query.
   *
   * Both the projects screen (tiles show counts) and the MCP `list_projects`
   * tool want this. Doing it with correlated subqueries keeps it a single round
   * trip — the obvious alternative, fetching each project's board in a loop, is
   * an N+1 that grows with the number of projects.
   */
  async function listWithCounts(): Promise<ProjectSummary[]> {
    const [rows, cardCounts, docCounts] = await Promise.all([
      db.select().from(projects).orderBy(asc(projects.rank)),
      db
        .select({ projectId: columns.projectId, n: count() })
        .from(cards)
        .innerJoin(columns, eq(cards.columnId, columns.id))
        .groupBy(columns.projectId),
      db.select({ projectId: docs.projectId, n: count() }).from(docs).groupBy(docs.projectId),
    ])

    const byProject = (list: { projectId: string; n: number }[]) =>
      new Map(list.map((r) => [r.projectId, r.n]))
    const cardsBy = byProject(cardCounts)
    const docsBy = byProject(docCounts)

    return rows.map((p) => ({
      ...p,
      cardCount: cardsBy.get(p.id) ?? 0,
      docCount: docsBy.get(p.id) ?? 0,
    }))
  }

  async function get(id: string): Promise<Project> {
    const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1)
    if (!row) throw new NotFoundError(`Project "${id}"`)
    return row
  }

  async function create(input: { name: string; description?: string }): Promise<Project> {
    const name = normalizeName(input.name)

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
    if (patch.name !== undefined) next.name = normalizeName(patch.name)
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

  return { list, listWithCounts, get, create, update, remove, move }
}

export type ProjectsService = ReturnType<typeof projectsService>
