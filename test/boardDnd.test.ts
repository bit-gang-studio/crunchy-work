import { describe, expect, it } from 'vitest'
import type { ColumnWithCards, Card } from '../src/shared/types'
import {
  COLUMN_PREFIX,
  containerOf,
  pastMidpoint,
  previewMove,
  resolveCommit,
  sameOrder,
} from '../src/web/lib/boardDnd'
import { initialRanks } from '../src/shared/rank'

/**
 * The drag engine ported from Crunchy Team. These cover the properties that were
 * won by fixing real bugs: every slot reachable, the placeholder never lying,
 * placement decided by the pointer rather than an index direction.
 */

function board(shape: Record<string, string[]>): ColumnWithCards[] {
  return Object.entries(shape).map(([name, titles], ci) => {
    const ranks = initialRanks(Math.max(titles.length, 1))
    return {
      id: `col${ci}`,
      projectId: 'p',
      name,
      rank: `a${ci}`,
      createdAt: '',
      updatedAt: '',
      cards: titles.map(
        (title, i): Card => ({
          id: title,
          columnId: `col${ci}`,
          title,
          description: '',
          rank: ranks[i]!,
          completed: false,
          dueAt: null,
          createdAt: '',
          updatedAt: '',
        }),
      ),
    }
  })
}

const order = (cols: ColumnWithCards[]) => cols.map((c) => c.cards.map((k) => k.id))

describe('pastMidpoint', () => {
  it('is the pointer against the card midpoint, not the dragged rect', () => {
    const rect = { top: 100, height: 40 }
    expect(pastMidpoint(119, rect)).toBe(false)
    expect(pastMidpoint(121, rect)).toBe(true)
  })
})

describe('containerOf', () => {
  const cols = board({ A: ['a1', 'a2'], B: ['b1'] })

  it('finds the column holding a card', () => {
    expect(containerOf(cols, 'a2')).toBe('col0')
  })

  it('reads a column droppable id', () => {
    expect(containerOf(cols, `${COLUMN_PREFIX}col1`)).toBe('col1')
  })

  it('returns null for an unknown id', () => {
    expect(containerOf(cols, 'nope')).toBeNull()
  })
})

describe('previewMove', () => {
  it('lands before the hovered card', () => {
    const cols = board({ A: ['a1', 'a2', 'a3'] })
    expect(order(previewMove(cols, 'a3', 'a1', false))).toEqual([['a3', 'a1', 'a2']])
  })

  it('lands after the hovered card when past its midpoint', () => {
    const cols = board({ A: ['a1', 'a2', 'a3'] })
    expect(order(previewMove(cols, 'a1', 'a2', true))).toEqual([['a2', 'a1', 'a3']])
  })

  it('moves across columns', () => {
    const cols = board({ A: ['a1', 'a2'], B: ['b1'] })
    expect(order(previewMove(cols, 'a1', 'b1', false))).toEqual([['a2'], ['a1', 'b1']])
  })

  it('appends when the target is the column itself — an empty column or the tail', () => {
    const cols = board({ A: ['a1'], B: [] })
    expect(order(previewMove(cols, 'a1', `${COLUMN_PREFIX}col1`, false))).toEqual([[], ['a1']])
  })

  it('keeps the first slot reachable', () => {
    const cols = board({ A: ['a1', 'a2', 'a3'] })
    expect(order(previewMove(cols, 'a2', 'a1', false))[0]?.[0]).toBe('a2')
  })

  it('returns the input untouched for an unknown target', () => {
    const cols = board({ A: ['a1'] })
    expect(previewMove(cols, 'a1', 'ghost', false)).toBe(cols)
  })
})

describe('sameOrder', () => {
  it('is true for identical layouts, so an unchanged preview can skip a re-render', () => {
    expect(sameOrder(board({ A: ['a1', 'a2'] }), board({ A: ['a1', 'a2'] }))).toBe(true)
  })

  it('is false once anything moves', () => {
    expect(sameOrder(board({ A: ['a1', 'a2'] }), board({ A: ['a2', 'a1'] }))).toBe(false)
  })
})

describe('resolveCommit', () => {
  it('is null when the card is dropped back where it started', () => {
    const cols = board({ A: ['a1', 'a2', 'a3'] })
    expect(resolveCommit(cols, cols, 'a2')).toBeNull()
  })

  it('reports the destination column on a cross-column move', () => {
    const cols = board({ A: ['a1'], B: ['b1'] })
    const preview = previewMove(cols, 'a1', 'b1', false)
    expect(resolveCommit(cols, preview, 'a1')?.toColumnId).toBe('col1')
  })

  it('ranks a top drop below its new neighbour', () => {
    const cols = board({ A: ['a1', 'a2', 'a3'] })
    const preview = previewMove(cols, 'a3', 'a1', false)
    const move = resolveCommit(cols, preview, 'a3')!
    expect(move.rank < cols[0]!.cards[0]!.rank).toBe(true)
  })

  it('ranks a middle drop strictly between its neighbours', () => {
    const cols = board({ A: ['a1', 'a2', 'a3'] })
    const preview = previewMove(cols, 'a1', 'a2', true)
    const move = resolveCommit(cols, preview, 'a1')!
    const [, second, third] = cols[0]!.cards
    expect(move.rank > second!.rank).toBe(true)
    expect(move.rank < third!.rank).toBe(true)
  })

  it('commits exactly the preview — the placeholder cannot lie', () => {
    const cols = board({ A: ['a1', 'a2', 'a3'], B: [] })
    const preview = previewMove(cols, 'a2', `${COLUMN_PREFIX}col1`, false)
    const move = resolveCommit(cols, preview, 'a2')!

    // Re-sorting the destination by the committed rank must reproduce the preview.
    const dest = preview.find((c) => c.id === move.toColumnId)!
    const ranked = dest.cards.map((c) => (c.id === 'a2' ? { ...c, rank: move.rank } : c))
    expect([...ranked].sort((a, b) => (a.rank < b.rank ? -1 : 1)).map((c) => c.id)).toEqual(
      dest.cards.map((c) => c.id),
    )
  })
})
