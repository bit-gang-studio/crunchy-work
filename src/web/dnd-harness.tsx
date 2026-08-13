import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import type { ColumnWithCards, Card } from '../shared/types'
import { rankAfter, rankBefore } from '../shared/rank'
import { KanbanBoard } from './components/KanbanBoard'
import './index.css'

/**
 * A stand-alone harness for driving the Kanban drag-and-drop in a real browser
 * (see e2e-dnd/). It mounts the real <KanbanBoard> over in-memory state and
 * mirrors each column's order into a hidden `data-testid="state"` node, so a
 * Playwright spec can assert exactly where a card landed.
 *
 * This exists because the drag engine is genuinely browser behaviour —
 * collision, pointer position, preview relocation, scroll-container
 * re-measurement — that jsdom cannot see. Unit tests cover the pure reducers;
 * only this covers the parts that actually broke in the first place.
 *
 * It needs no server, no database and no build config: Vite serves it in dev,
 * and it is deliberately absent from the production bundle (only index.html is
 * an input).
 */

const card = (id: string, rank: string, columnId: string, title = id): Card => ({
  id,
  columnId,
  title,
  description: '',
  rank,
  completed: false,
  dueAt: null,
  acceptanceCriteria: [],
  size: null,
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
})

const column = (id: string, name: string, cards: Card[], i: number): ColumnWithCards => ({
  id,
  projectId: 'p',
  name,
  rank: `a${i}`,
  createdAt: '',
  updatedAt: '',
  cards,
})

function seed(): ColumnWithCards[] {
  const params = new URLSearchParams(window.location.search)

  // `?flick=1`: one column with a SHORT card above a TALL one — the height delta that used
  // to make a same-column hover oscillate (the mid-drag flicker). Kept separate from the
  // default seed so the exact-order specs stay untouched.
  if (params.get('flick') === '1') {
    return [
      column(
        'todo',
        'To Do',
        [
          card('short', 'a0', 'todo'),
          card(
            'tall',
            'a1',
            'todo',
            'A deliberately long card title that wraps onto several lines so this card is much taller than the short card above it',
          ),
        ],
        0,
      ),
    ]
  }

  // `?cols=1`: four columns, which is what it takes to overflow the board
  // horizontally at 1280 — the shape the failing journey uses. Column reorder
  // behaves differently once the board scrolls (auto-scroll and scroll-snap both
  // engage), so a seed that fits on screen would not reproduce it.
  if (params.get('cols') === '1') {
    const names = [
      ['c1', 'Backlog'],
      ['c2', 'In Progress'],
      ['c3', 'Done'],
      ['c4', 'Blocked'],
    ]
    return names.map(([id, name], ci) =>
      column(id!, name!, [card(`${id}-1`, 'a0', id!), card(`${id}-2`, 'a1', id!)], ci),
    )
  }

  // `?big=1` fills the columns like a real board — many cards, some with long wrapping
  // titles (variable heights) — to exercise the drag-measuring loop regression. Default is
  // the small, exact seed the reachability/placeholder specs assert against.
  const big = params.get('big') === '1'
  const many = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) =>
      i % 3 === 0
        ? `${prefix}${i + 1}|a much longer title that wraps across a couple of lines to vary the card height`
        : `${prefix}${i + 1}`,
    )
  const shape = big
    ? [
        { id: 'todo', name: 'To Do', cards: many('T', 13) },
        { id: 'doing', name: 'Doing', cards: many('D', 12) },
        { id: 'done', name: 'Done', cards: many('E', 6) },
      ]
    : [
        { id: 'todo', name: 'To Do', cards: ['T1', 'T2', 'T3', 'T4'] },
        { id: 'doing', name: 'Doing', cards: ['D1', 'D2', 'D3'] },
        { id: 'done', name: 'Done', cards: [] as string[] },
      ]

  return shape.map((c, ci) =>
    column(
      c.id,
      c.name,
      c.cards.map((spec, i) => {
        const [id, title] = spec.split('|')
        return card(id!, `a${i}`, c.id, title ? `${id} ${title}` : id!)
      }),
      ci,
    ),
  )
}

/** Apply a committed move locally — the harness's stand-in for the server. */
function applyMove(cols: ColumnWithCards[], cardId: string, toColumnId: string, rank: string): ColumnWithCards[] {
  const moved = cols.flatMap((c) => c.cards).find((c) => c.id === cardId)
  if (!moved) return cols
  const next = { ...moved, columnId: toColumnId, rank }
  return cols.map((c) => {
    const without = c.cards.filter((k) => k.id !== cardId)
    if (c.id !== toColumnId) return { ...c, cards: without }
    return { ...c, cards: [...without, next].sort((a, b) => (a.rank < b.rank ? -1 : 1)) }
  })
}

/**
 * Apply a committed column reorder locally — the harness's stand-in for the server.
 *
 * `index` is the target position among the *other* columns, i.e. after the moved
 * one is taken out. That is exactly what `services/columns.move` does (it ranks
 * against `others`) and what BoardScreen's optimistic splice does, so the harness
 * agrees with production rather than inventing its own semantics.
 */
function applyColumnMove(cols: ColumnWithCards[], columnId: string, index: number): ColumnWithCards[] {
  const from = cols.findIndex((c) => c.id === columnId)
  if (from < 0) return cols
  const next = [...cols]
  const [moved] = next.splice(from, 1)
  next.splice(index, 0, moved!)
  return next
}

declare global {
  interface Window {
    __moves?: { cardId: string; toColumnId: string; rank: string }[]
    __columnMoves?: { columnId: string; index: number }[]
    __opens?: string[]
  }
}

function App() {
  const [columns, setColumns] = useState<ColumnWithCards[]>(seed)

  const onMove = (cardId: string, toColumnId: string, rank: string) => {
    ;(window.__moves ??= []).push({ cardId, toColumnId, rank })
    setColumns((cols) => applyMove(cols, cardId, toColumnId, rank))
  }

  // Mirrors the real screen's add: same rank helpers, same top/bottom placement, so the
  // harness exercises both entry points for real.
  const onAddCard = (columnId: string, title: string, position: 'top' | 'bottom' = 'bottom') => {
    setColumns((cols) =>
      cols.map((c) => {
        if (c.id !== columnId) return c
        const rank =
          position === 'top'
            ? rankBefore(c.cards[0]?.rank ?? null)
            : rankAfter(c.cards.at(-1)?.rank ?? null)
        const created = card(title, rank, columnId)
        return { ...c, cards: position === 'top' ? [created, ...c.cards] : [...c.cards, created] }
      }),
    )
  }

  // Recorded so a spec can assert that ticking a card never bubbles into opening it, and
  // that a drag never fires the card's click.
  const onOpenCard = (cardId: string) => {
    ;(window.__opens ??= []).push(cardId)
  }

  const onToggleComplete = (cardId: string, completed: boolean) => {
    setColumns((cols) =>
      cols.map((c) => ({ ...c, cards: c.cards.map((k) => (k.id === cardId ? { ...k, completed } : k)) })),
    )
  }

  // Columns are draggable here for the same reason cards are: reordering one is
  // browser behaviour — collision against rects that a sortable transform has
  // already moved — and it shipped with no coverage at all, which is how "drop a
  // column in the first slot" could be wrong most of the time without anyone
  // seeing it. Passing this handler is also what turns `sortable` on at all.
  const onMoveColumn = (columnId: string, index: number) => {
    ;(window.__columnMoves ??= []).push({ columnId, index })
    setColumns((cols) => applyColumnMove(cols, columnId, index))
  }

  // Present so the board carries its real trailing "+ Add column" affordance.
  // That is not cosmetic: it is ~200px of board width, and it is the difference
  // between four columns fitting at 1280 and the board scrolling horizontally —
  // which is the state auto-scroll and scroll-snap only engage in.
  const onAddColumn = (name: string) => {
    setColumns((cols) => [...cols, column(name, name, [], cols.length)])
  }

  const state = columns.map((c) => ({ id: c.id, cards: c.cards.map((k) => k.id) }))

  // Mirror the app's canvas layout: a fixed-height region so columns actually scroll — the
  // scroll container dnd-kit re-measures mid-drag, which is the #185 surface loop.spec needs.
  return (
    <div className="flex h-screen flex-col">
      <div className="min-h-0 flex-1 overflow-hidden">
        <KanbanBoard
          columns={columns}
          onMove={onMove}
          onOpenCard={onOpenCard}
          onAddCard={onAddCard}
          onToggleComplete={onToggleComplete}
          onMoveColumn={onMoveColumn}
          onAddColumn={onAddColumn}
        />
      </div>
      <pre data-testid="state" style={{ display: 'none' }}>
        {JSON.stringify(state)}
      </pre>
      {/* Column order gets its own node rather than being read off `state`'s key
          order — the card specs parse that into an object, where order is an
          accident of JS key iteration rather than something asserted. */}
      <pre data-testid="column-order" style={{ display: 'none' }}>
        {JSON.stringify(columns.map((c) => c.id))}
      </pre>
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
