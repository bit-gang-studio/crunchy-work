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
  /** Props that make this header the grip for reordering the column. */
  dragHandle?: React.HTMLAttributes<HTMLElement>
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
    <div className="mb-2 flex shrink-0 items-center gap-2 px-1">
      {/* The name is the grip: dragging anywhere on the header moves the column. */}
      <button
        type="button"
        {...dragHandle}
        onClick={() => setEditing(true)}
        title="Rename, or drag to reorder"
        className="cursor-grab truncate text-left text-sm font-semibold text-neutral-700 hover:text-neutral-900"
      >
        {column.name}
      </button>
      <span className="shrink-0 text-xs text-neutral-400">{column.cards.length}</span>

      <button
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
