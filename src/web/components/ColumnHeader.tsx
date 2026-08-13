import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { BoardColumn } from '../../shared/types'
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
  column: BoardColumn
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
          className="w-full rounded-md border border-neutral-400 px-2 py-1 text-sm font-semibold focus:outline-none"
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
    <div
      {...dragHandle?.listeners}
      className="mb-2 flex shrink-0 cursor-grab items-center gap-2 rounded-md px-1 py-0.5 hover:bg-neutral-100/70 active:cursor-grabbing"
    >
      <button
        type="button"
        {...dragHandle?.attributes}
        onClick={() => setEditing(true)}
        title="Rename, or drag to reorder"
        className="cursor-grab truncate text-left text-sm font-semibold text-neutral-700 active:cursor-grabbing"
      >
        {column.name}
      </button>
      <span className="shrink-0 text-xs text-neutral-400">{column.cards.length}</span>

      <button
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        type="button"
        onClick={onAddCard}
        aria-label={`Add card to top of ${column.name}`}
        title="Add card to top"
        className="ml-auto flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-base leading-none text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
      >
        +
      </button>

      <div className="relative shrink-0" ref={menuRef}>
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          onClick={() => setMenuOpen((open) => !open)}
          aria-label={`Column actions for ${column.name}`}
          aria-expanded={menuOpen}
          className="flex h-6 w-6 items-center justify-center rounded-md leading-none text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        >
          ⋯
        </button>
        {menuOpen && (
          <div className="absolute right-0 z-10 mt-1 w-48 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg">
            <button
              type="button"
              onClick={() => {
                setMenuOpen(false)
                setEditing(true)
              }}
              className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-100"
            >
              Rename
            </button>
            <div className="px-2 py-1">
              <ConfirmButton
                onConfirm={onDelete}
                confirmLabel={column.cards.length ? `Delete ${column.cards.length} cards` : 'Really delete'}
                className="w-full rounded px-0 py-0.5 text-left text-sm text-red-700"
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
