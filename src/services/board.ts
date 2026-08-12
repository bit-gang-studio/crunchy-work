import { asc, inArray } from 'drizzle-orm'
import type { Store } from '../db/index.js'
import { cards, type Card, type Column, type Project } from '../db/schema.js'
import type { ColumnsService } from './columns.js'
import type { DocsService } from './docs.js'
import type { ProjectsService } from './projects.js'

export interface BoardColumn extends Column {
  cards: Card[]
}

export interface Board {
  project: Project
  columns: BoardColumn[]
  docs: Awaited<ReturnType<DocsService['listForProject']>>
}

/**
 * The whole board in one call.
 *
 * This is the read an agent should reach for first: it orients in a single
 * round trip rather than walking project → columns → cards. It is three
 * queries regardless of how many columns there are — the cards come back in one
 * `IN` and are grouped in memory, so adding a column never adds a query.
 */
export function boardService(
  store: Store,
  services: { projects: ProjectsService; columns: ColumnsService; docs: DocsService },
) {
  async function get(projectId: string): Promise<Board> {
    const project = await services.projects.get(projectId)
    const cols = await services.columns.listForProject(projectId)

    const ids = cols.map((c) => c.id)
    const all = ids.length
      ? await store.db.select().from(cards).where(inArray(cards.columnId, ids)).orderBy(asc(cards.rank))
      : []

    const byColumn = new Map<string, Card[]>(ids.map((id) => [id, []]))
    for (const card of all) byColumn.get(card.columnId)?.push(card)

    return {
      project,
      columns: cols.map((c) => ({ ...c, cards: byColumn.get(c.id) ?? [] })),
      docs: await services.docs.listForProject(projectId),
    }
  }

  return { get }
}

export type BoardService = ReturnType<typeof boardService>
