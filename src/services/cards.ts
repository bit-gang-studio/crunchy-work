import { asc, eq, sql } from 'drizzle-orm'
import type { Store } from '../db/index.js'
import { newId } from '../db/id.js'
import { rankAfter, rankForIndex } from '../db/rank.js'
import { cards, columns, type Card } from '../db/schema.js'
import { NotFoundError, ValidationError } from './errors.js'

const touch = { updatedAt: sql`(datetime('now'))` }

export interface CardPatch {
  title?: string
  description?: string
  dueAt?: string | null
  completed?: boolean
}

export function cardsService(store: Store) {
  const { db } = store

  async function listForColumn(columnId: string): Promise<Card[]> {
    return db.select().from(cards).where(eq(cards.columnId, columnId)).orderBy(asc(cards.rank))
  }

  async function get(id: string): Promise<Card> {
    const [row] = await db.select().from(cards).where(eq(cards.id, id)).limit(1)
    if (!row) throw new NotFoundError(`Card "${id}"`)
    return row
  }

  async function requireColumn(columnId: string): Promise<void> {
    const [row] = await db
      .select({ id: columns.id })
      .from(columns)
      .where(eq(columns.id, columnId))
      .limit(1)
    if (!row) throw new NotFoundError(`Column "${columnId}"`)
  }

  async function create(
    columnId: string,
    input: { title: string; description?: string; dueAt?: string | null },
  ): Promise<Card> {
    await requireColumn(columnId)
    const title = normalizeTitle(input.title)
    if (!title) throw new ValidationError('A card needs a title')

    const existing = await listForColumn(columnId)
    const id = newId()
    await db.insert(cards).values({
      id,
      columnId,
      title,
      description: input.description ?? '',
      dueAt: input.dueAt ?? null,
      rank: rankAfter(existing.at(-1)?.rank ?? null),
    })
    return get(id)
  }

  async function update(id: string, patch: CardPatch): Promise<Card> {
    await get(id)
    const next: Record<string, unknown> = { ...touch }
    if (patch.title !== undefined) {
      const title = normalizeTitle(patch.title)
      if (!title) throw new ValidationError('A card needs a title')
      next.title = title
    }
    if (patch.description !== undefined) next.description = patch.description
    if (patch.dueAt !== undefined) next.dueAt = patch.dueAt
    if (patch.completed !== undefined) next.completed = patch.completed
    await db.update(cards).set(next).where(eq(cards.id, id))
    return get(id)
  }

  async function remove(id: string): Promise<void> {
    await get(id)
    await db.delete(cards).where(eq(cards.id, id))
  }

  /**
   * Move a card within its column or into another one. `index` is the position
   * among the cards that will be its neighbours — the card itself is excluded
   * before the rank is computed, so moving a card to its own index is a no-op
   * rather than a rank collision.
   */
  async function move(id: string, to: { columnId?: string; index: number }): Promise<Card> {
    const card = await get(id)
    const columnId = to.columnId ?? card.columnId
    if (columnId !== card.columnId) await requireColumn(columnId)

    const neighbours = (await listForColumn(columnId)).filter((c) => c.id !== id)
    await db
      .update(cards)
      .set({
        columnId,
        rank: rankForIndex(neighbours.map((c) => c.rank), to.index),
        ...touch,
      })
      .where(eq(cards.id, id))
    return get(id)
  }

  return { listForColumn, get, create, update, remove, move }
}

/**
 * Card titles are semantically single-line — a pasted newline should not turn
 * one card into a two-line title that breaks every row it appears in.
 */
function normalizeTitle(title: string): string {
  return (title ?? '').replace(/\s*\n+\s*/g, ' ').trim()
}

export type CardsService = ReturnType<typeof cardsService>
