import { describe, expect, it } from 'vitest'
import { withoutCompleted } from '../src/web/lib/completedFilter'
import type { Card, ColumnWithCards } from '../src/shared/types'

const card = (id: string, completed = false): Card => ({
  id,
  columnId: 'c',
  title: id,
  description: '',
  rank: 'a0',
  completed,
  dueAt: null,
  acceptanceCriteria: [],
  size: null,
  createdAt: '',
  updatedAt: '',
})

const column = (id: string, cards: Card[]): ColumnWithCards => ({
  id,
  projectId: 'p',
  name: id,
  rank: 'a0',
  createdAt: '',
  updatedAt: '',
  cards,
})

describe('withoutCompleted', () => {
  it('drops completed cards and counts them', () => {
    const { columns, hidden } = withoutCompleted([
      column('todo', [card('a'), card('b', true)]),
      column('done', [card('c', true), card('d', true)]),
    ])
    expect(columns.map((c) => c.cards.map((k) => k.id))).toEqual([['a'], []])
    expect(hidden).toBe(3)
  })

  /*
   * `completed` is a per-card tick, deliberately independent of the column, so
   * a ticked card in To Do is exactly as hidden as one in Done. If this ever
   * filtered by column name instead, everything would look right on a board
   * whose Done column is named "Done" and wrong on every other board.
   */
  it('hides by the tick, not by the column', () => {
    const { columns, hidden } = withoutCompleted([column('todo', [card('ticked-in-todo', true)])])
    expect(columns[0]!.cards).toEqual([])
    expect(hidden).toBe(1)
  })

  /*
   * Identity matters: the board re-renders on every live update, and returning
   * fresh arrays for untouched columns would make every column look changed to
   * React on every poll.
   */
  it('returns the same references when nothing is completed', () => {
    const input = [column('todo', [card('a')]), column('doing', [card('b')])]
    const { columns, hidden } = withoutCompleted(input)
    expect(hidden).toBe(0)
    expect(columns).toBe(input)
  })

  it('leaves untouched columns identical when another column changes', () => {
    const untouched = column('todo', [card('a')])
    const { columns } = withoutCompleted([untouched, column('done', [card('b', true)])])
    expect(columns[0]).toBe(untouched)
  })
})
