import { useEffect, useRef } from 'react'
import type { SlashMenuState } from '../lib/useSlashMenu'

/**
 * The `/` command list, rendered at the caret.
 *
 * `position: fixed` against the caret's viewport coordinates rather than an
 * absolutely-positioned child of the editor: the editor scrolls with the page,
 * and a fixed element measured at open time needs no layout maths to stay put
 * for the life of the menu (the hook closes it on scroll).
 *
 * Rows are `onMouseDown`-with-`preventDefault`, not `onClick` — a click would
 * first blur the editor, and the command needs the selection it is about to
 * replace to still exist.
 */
export function SlashMenu({ state }: { state: SlashMenuState }) {
  const listRef = useRef<HTMLDivElement>(null)

  // Keyboard navigation has to bring its target into view, or arrowing past the
  // fold looks like the menu stopped responding.
  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  }, [state.activeIndex, state.open])

  if (!state.open || !state.coords) return null

  // Flip above the caret when there is not room below it.
  const room = window.innerHeight - state.coords.bottom
  const below = room > 260
  const style = below
    ? { top: state.coords.bottom + 6, left: state.coords.left }
    : { bottom: window.innerHeight - state.coords.top + 6, left: state.coords.left }

  return (
    <div
      ref={listRef}
      role="listbox"
      aria-label="Insert block"
      data-testid="slash-menu"
      style={{ position: 'fixed', ...style, maxWidth: 'calc(100vw - 2rem)' }}
      className="z-50 max-h-64 w-64 overflow-y-auto rounded-card border border-line bg-surface p-1 shadow-raised"
    >
      {state.items.map((block, i) => (
        <button
          key={block.id}
          type="button"
          role="option"
          aria-selected={i === state.activeIndex}
          data-active={i === state.activeIndex}
          onMouseEnter={() => state.setActiveIndex(i)}
          onMouseDown={(e) => {
            e.preventDefault()
            state.select(i)
          }}
          className={`flex w-full items-baseline gap-3 rounded px-2 py-1.5 text-left text-sm ${
            i === state.activeIndex ? 'bg-hover' : ''
          }`}
        >
          <span className="min-w-0 flex-1 truncate">{block.label}</span>
          {block.hint && (
            <span className="shrink-0 font-mono text-xs text-ink-faint">{block.hint}</span>
          )}
        </button>
      ))}
    </div>
  )
}
