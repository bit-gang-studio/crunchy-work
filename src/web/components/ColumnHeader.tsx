import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ColumnWithCards } from '../../shared/types'
import { ConfirmButton } from './ConfirmButton'

/**
 * A column's name, count, and the actions on it.
 *
 * Renaming is click-to-edit in place rather than a dialog — a column name is one
 * short string and a modal for it would be heavier than the change itself.
 *
 * Deleting a column takes its cards with it (the FK cascades), so the
 * confirmation says so. "Delete" on something that silently destroys work you
 * cannot see from here is the wrong kind of surprise.
 */
export function ColumnHeader({
  column,
  onAddCard,
  onRename,
  onDelete,
  dragHandle,
}: {
  column: ColumnWithCards
  onAddCard: () => void
  onRename: (name: string) => void | Promise<void>
  onDelete: () => void | Promise<void>
  /**
   * Split deliberately. The pointer `listeners` go on the whole bar so the grip
   * is big (Trello's list headers work this way), but the ARIA `attributes` —
   * `role="button"`, tabindex, roledescription — go on the *name button*.
   *
   * Putting them on the container makes a role="button" that contains other
   * buttons: invalid nested interactive elements, and its accessible name
   * swallows every child's label into one long string. A screen reader would
   * announce the whole header as a single control.
   */
  dragHandle?: {
    listeners?: React.HTMLAttributes<HTMLElement>
    attributes?: React.HTMLAttributes<HTMLElement>
  }
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(column.name)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => setName(column.name), [column.name])

  // Any click outside closes the menu — including on another column's menu.
  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    setEditing(false)
    if (!trimmed) return setName(column.name)
    if (trimmed !== column.name) void onRename(trimmed)
  }

  if (editing) {
    return (
      <form onSubmit={submit} className="mb-2 shrink-0 px-1">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={submit}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setName(column.name)
              setEditing(false)
            }
          }}
          aria-label={`Rename ${column.name}`}
          className="w-full rounded-control border border-ink-faint px-2 py-1 text-sm font-semibold focus:outline-none"
        />
      </form>
    )
  }

  return (
    /*
     * The whole header bar is the grip, which is how Trello's lists work — a
     * small text-sized target is the difference between "draggable" and
     * "draggable if you aim". The buttons inside stop propagation so they still
     * behave as buttons, and clicking the name still renames because a plain
     * click never crosses the 5px drag threshold.
     */
    /*
      * Two groups, not four peers.
      *
      * Name, count, `+` and `⋯` all sat in one row at the same `gap-2`, so the
      * count read as part of the name and the two controls read as part of the
      * count. Grouping the label tightly and pushing the controls to their own
      * cluster is the same fix the breadcrumb needed: what makes a row scan is
      * the *difference* between the gaps, not the gaps themselves.
      */
    <div
      {...dragHandle?.listeners}
      className="mb-2 flex h-7 shrink-0 cursor-grab items-center rounded-control px-1 hover:bg-hover-strong/70 active:cursor-grabbing"
    >
      <button
        type="button"
        {...dragHandle?.attributes}
        onClick={() => setEditing(true)}
        title="Rename, or drag to reorder"
        className="cursor-grab truncate text-left text-sm font-semibold text-ink active:cursor-grabbing"
      >
        {column.name}
      </button>
      {/* `tabular-nums` so a column going 9 → 10 does not shift its own name. */}
      <span className="ml-1.5 shrink-0 text-xs tabular-nums text-ink-faint">
        {column.cards.length}
      </span>

      <button
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        type="button"
        onClick={onAddCard}
        aria-label={`Add card to top of ${column.name}`}
        title="Add card to top"
        className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-control text-ink-faint hover:bg-hover-strong hover:text-ink"
      >
        {/* SVG rather than a "+" character, for the reason the switcher's
            chevron is one: a glyph's size and baseline depend on the font that
            resolves, and these two sit next to each other where any mismatch
            shows. */}
        <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
          <path d="M8 3.5v9M3.5 8h9" />
        </svg>
      </button>

      <div className="relative shrink-0" ref={menuRef}>
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={`Column actions for ${column.name}`}
          aria-expanded={menuOpen}
          className="flex h-6 w-6 items-center justify-center rounded-control text-ink-faint hover:bg-hover-strong hover:text-ink"
        >
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="currentColor" aria-hidden>
            <circle cx="3.5" cy="8" r="1.2" />
            <circle cx="8" cy="8" r="1.2" />
            <circle cx="12.5" cy="8" r="1.2" />
          </svg>
        </button>
        {menuOpen && (
          <div className="absolute right-0 z-10 mt-1 w-48 rounded-card border border-line bg-surface p-1 shadow-raised">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                setEditing(true)
              }}
              className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-hover"
            >
              Rename
            </button>
            <div className="px-2 py-1">
              <ConfirmButton
                onConfirm={onDelete}
                confirmLabel={column.cards.length ? `Delete ${column.cards.length} cards` : 'Really delete'}
                className="w-full rounded px-0 py-0.5 text-left text-sm text-danger"
              >
                Delete column
              </ConfirmButton>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
