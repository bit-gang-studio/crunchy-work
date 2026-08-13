import { describe, expect, it } from 'vitest'
import { diffBoards, isUnchanged } from '../src/web/lib/boardDiff.js'
import type { Board, BoardColumn, Card } from '../src/shared/types.js'

/**
 * The client-side answer to "what changed?".
 *
 * The server cannot tell us — it watches the database file, so it only knows
 * that *something* did (deliberately: that is the only signal that catches a
 * separate `crunchy mcp` process writing to the same SQLite file). So this
 * comparison is what everything change-aware in the UI is built on, and it has
 * to be right about the boring cases: the first load is not a change, and a
 * refetch that returns identical data is not a change.
 */
function card(id: string, over: Partial<Card> = {}): Card {
  return {
    id,
    columnId: 'todo',
    title: id,
    description: '',
    rank: 'a0',
    dueAt: null,
    completed: false,
    completedAt: null,
    acceptanceCriteria: [],
    size: null,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...over,
  }
}

function board(columns: Record<string, Card[]>, docIds: string[] = []): Board {
  return {
    project: { id: 'p', name: 'P', description: '', rank: 'a0', createdAt: '', updatedAt: '' },
    columns: Object.entries(columns).map(
      ([id, cards]): BoardColumn => ({ id, projectId: 'p', name: id, rank: 'a0', cards }),
    ),
    docs: docIds.map((id) => ({
      id,
      projectId: 'p',
      title: id,
      rank: 'a0',
      createdAt: '',
      updatedAt: '',
    })),
  }
}

describe('diffBoards', () => {
  it('reports nothing on the first read, so a page load does not announce itself', () => {
    const changes = diffBoards(null, board({ todo: [card('a'), card('b')] }, ['d1']))
    expect(isUnchanged(changes)).toBe(true)
  })

  it('reports nothing when a refetch returns the same board', () => {
    const before = board({ todo: [card('a')], done: [] })
    const after = board({ todo: [card('a')], done: [] })
    expect(isUnchanged(diffBoards(before, after))).toBe(true)
  })

  it('spots a card an agent added', () => {
    const before = board({ todo: [card('a')] })
    const after = board({ todo: [card('a'), card('b')] })
    expect(diffBoards(before, after).added).toEqual(['b'])
  })

  it('spots a card being ticked off, but not one that was already done', () => {
    const before = board({ todo: [card('a'), card('b', { completed: true })] })
    const after = board({
      todo: [card('a', { completed: true }), card('b', { completed: true })],
    })
    expect(diffBoards(before, after).completed).toEqual(['a'])
  })

  it('does not report un-completing as a completion', () => {
    const before = board({ todo: [card('a', { completed: true })] })
    const after = board({ todo: [card('a')] })
    expect(diffBoards(before, after).completed).toEqual([])
  })

  it('spots a card moved between columns, and does not call it added', () => {
    const before = board({ todo: [card('a')], done: [] })
    const after = board({ todo: [], done: [card('a', { columnId: 'done' })] })
    const changes = diffBoards(before, after)
    expect(changes.moved).toEqual(['a'])
    expect(changes.added).toEqual([])
  })

  it('does not report a reorder within a column as a move', () => {
    const before = board({ todo: [card('a'), card('b')] })
    const after = board({ todo: [card('b'), card('a')] })
    expect(isUnchanged(diffBoards(before, after))).toBe(true)
  })

  it('spots a new doc', () => {
    const before = board({ todo: [] }, ['d1'])
    const after = board({ todo: [] }, ['d1', 'd2'])
    expect(diffBoards(before, after).addedDocs).toEqual(['d2'])
  })

  it('treats a deleted card as no change — there is nothing left to animate', () => {
    const before = board({ todo: [card('a'), card('b')] })
    const after = board({ todo: [card('a')] })
    expect(isUnchanged(diffBoards(before, after))).toBe(true)
  })
})
