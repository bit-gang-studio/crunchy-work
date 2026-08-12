import { asc, eq, sql } from 'drizzle-orm'
import type { Store } from '../db/index.js'
import { newId } from '../db/id.js'
import { rankAfter, rankForIndex } from '../shared/rank.js'
import { cards, columns } from '../db/schema.js'
import { SIZES, type AcceptanceCriterion, type Card, type Size } from '../shared/types.js'
import { NotFoundError, ValidationError } from './errors.js'

const touch = { updatedAt: sql`(datetime('now'))` }

/** Enough to define done; beyond this it is a checklist pretending to be a project. */
const MAX_CRITERIA = 50

export interface CardPatch {
  title?: string
  description?: string
  dueAt?: string | null
  completed?: boolean
  acceptanceCriteria?: AcceptanceCriterion[]
  size?: Size | null
}

type Row = typeof cards.$inferSelect

/**
 * Acceptance criteria live as JSON in a text column, so the boundary is here:
 * every read maps a row into the shape the rest of the app and the API use, and
 * nothing outside this file ever sees the stored string.
 *
 * Parsing is forgiving. A hand-edited database, or a future format change,
 * should degrade to "no criteria" rather than breaking every read of the board.
 */
function parseCriteria(raw: string): AcceptanceCriterion[] {
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((c): c is AcceptanceCriterion => !!c && typeof (c as AcceptanceCriterion).text === 'string')
      .map((c) => ({ text: c.text, done: c.done === true }))
  } catch {
    return []
  }
}

function toCard(row: Row): Card {
  return {
    ...row,
    acceptanceCriteria: parseCriteria(row.acceptanceCriteria),
    size: (row.size as Size | null) ?? null,
  }
}

/** Validate and normalise what a client or a model sent. */
function normalizeCriteria(input: AcceptanceCriterion[]): string {
  if (!Array.isArray(input)) throw new ValidationError('acceptanceCriteria must be a list')
  if (input.length > MAX_CRITERIA) {
    throw new ValidationError(`A card can have at most ${MAX_CRITERIA} acceptance criteria`)
  }
  const cleaned = input
    .map((c) => ({ text: String(c?.text ?? '').trim(), done: c?.done === true }))
    // A blank line is a slip, not a criterion — drop it rather than storing it.
    .filter((c) => c.text.length > 0)
  return JSON.stringify(cleaned)
}

function normalizeSize(size: Size | null): string | null {
  if (size === null) return null
  if (!SIZES.includes(size)) {
    throw new ValidationError(`size must be one of ${SIZES.join(', ')}`)
  }
  return size
}

export function cardsService(store: Store) {
  const { db } = store

  async function listForColumn(columnId: string): Promise<Card[]> {
    const rows = await db.select().from(cards).where(eq(cards.columnId, columnId)).orderBy(asc(cards.rank))
    return rows.map(toCard)
  }

  async function get(id: string): Promise<Card> {
    const [row] = await db.select().from(cards).where(eq(cards.id, id)).limit(1)
    if (!row) throw new NotFoundError(`Card "${id}"`)
    return toCard(row)
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
    input: {
      title: string
      description?: string
      dueAt?: string | null
      acceptanceCriteria?: AcceptanceCriterion[]
      size?: Size | null
    },
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
      acceptanceCriteria: normalizeCriteria(input.acceptanceCriteria ?? []),
      size: normalizeSize(input.size ?? null),
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
    // Sending the whole list replaces it — the caller always has the full set on
    // screen, and per-item patching would need ids these never had.
    if (patch.acceptanceCriteria !== undefined) {
      next.acceptanceCriteria = normalizeCriteria(patch.acceptanceCriteria)
    }
    if (patch.size !== undefined) next.size = normalizeSize(patch.size)
    await db.update(cards).set(next).where(eq(cards.id, id))
    return get(id)
  }

  async function remove(id: string): Promise<void> {
    await get(id)
    await db.delete(cards).where(eq(cards.id, id))
  }

  /**
   * Move a card within its column or into another one.
   *
   * Two ways to say where, because the two callers know different things:
   *
   * - `rank` — an exact fractional key. The board's drag engine resolves the
   *   drop slot itself (its whole design is that the commit *is* the preview the
   *   user saw), so it must be able to persist precisely that.
   * - `index` — a position among the card's new neighbours. What an agent means
   *   by "put it at the top". The card is excluded before the rank is computed,
   *   so moving it to its own index is a no-op rather than a rank collision.
   */
  async function move(id: string, to: { columnId?: string; index?: number; rank?: string }): Promise<Card> {
    const card = await get(id)
    const columnId = to.columnId ?? card.columnId
    if (columnId !== card.columnId) await requireColumn(columnId)

    let rank = to.rank
    if (!rank) {
      const neighbours = (await listForColumn(columnId)).filter((c) => c.id !== id)
      rank = rankForIndex(
        neighbours.map((c) => c.rank),
        to.index ?? Number.MAX_SAFE_INTEGER,
      )
    }

    await db.update(cards).set({ columnId, rank, ...touch }).where(eq(cards.id, id))
    return get(id)
  }

  return { listForColumn, get, create, update, remove, move, toCard }
}

/**
 * Card titles are semantically single-line — a pasted newline should not turn
 * one card into a two-line title that breaks every row it appears in.
 */
function normalizeTitle(title: string): string {
  return (title ?? '').replace(/\s*\n+\s*/g, ' ').trim()
}

export type CardsService = ReturnType<typeof cardsService>
