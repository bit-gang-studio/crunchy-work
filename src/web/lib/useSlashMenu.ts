import { useCallback, useEffect, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { filterBlocks, type BlockCommand } from './editorBlocks'

/**
 * The `/` command menu, hand-rolled.
 *
 * TipTap's own slash menu leans on `@tiptap/suggestion` plus a popup library.
 * Both would be new dependencies for what is, in the end, "read the text behind
 * the caret and put a list next to it" — and this repo's habit is to hand-roll
 * the small thing rather than install the general one.
 *
 * Two details that are easy to get wrong:
 *
 * - **The trigger is anchored, not re-derived.** We remember the document
 *   position of the `/` that opened the menu and read the query forward from
 *   it. Re-matching the text behind the caret on every keystroke instead would
 *   reopen the menu whenever the caret later wandered past an unrelated slash.
 * - **Keys are intercepted in ProseMirror, not in React.** Arrow keys and Enter
 *   have to be swallowed *before* the editor acts on them, and by then no DOM
 *   element of ours has focus — the caret is still in the document. So the
 *   handler is installed through `editorProps.handleKeyDown` via a ref.
 */
export type SlashMenuState = {
  open: boolean
  items: BlockCommand[]
  activeIndex: number
  /** Viewport coordinates of the caret, for positioning. */
  coords: { top: number; bottom: number; left: number } | null
  select: (index: number) => void
  setActiveIndex: (index: number) => void
  close: () => void
}

/** Set as `editorProps.handleKeyDown`; returns true when the menu consumed the key. */
export type KeyInterceptor = { current: (event: KeyboardEvent) => boolean }

export function useSlashMenu(editor: Editor | null, keys: KeyInterceptor): SlashMenuState {
  const [from, setFrom] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const [coords, setCoords] = useState<SlashMenuState['coords']>(null)

  const items = from === null ? [] : filterBlocks(query)
  const open = from !== null && items.length > 0

  /**
   * The `/` the user explicitly dismissed. Without this, Escape only closes the
   * menu until the next transaction re-reads the same slash and reopens it —
   * moving the caret one character is enough. A dismissal has to stick to the
   * character it dismissed.
   */
  const dismissed = useRef<number | null>(null)

  const close = useCallback(() => {
    setFrom(null)
    setQuery('')
    setActiveIndex(0)
  }, [])

  const dismiss = useCallback(() => {
    dismissed.current = from
    close()
  }, [from, close])

  /** Replace the "/query" with the chosen block, as one undoable step. */
  const select = useCallback(
    (index: number) => {
      const block = items[index]
      if (!editor || from === null || !block) return
      const to = editor.state.selection.from
      block.run(editor.chain().focus().deleteRange({ from, to })).run()
      close()
    },
    [editor, from, items, close],
  )

  // `select` closes over the current items, so the key handler must see the
  // latest render's copy rather than the one captured when the editor was made.
  const latest = useRef({ open, items, activeIndex, select, dismiss })
  latest.current = { open, items, activeIndex, select, dismiss }

  keys.current = (event: KeyboardEvent) => {
    const s = latest.current
    if (!s.open) return false
    if (event.key === 'ArrowDown') {
      setActiveIndex((i) => (i + 1) % s.items.length)
      return true
    }
    if (event.key === 'ArrowUp') {
      setActiveIndex((i) => (i - 1 + s.items.length) % s.items.length)
      return true
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      s.select(s.activeIndex)
      return true
    }
    if (event.key === 'Escape') {
      s.dismiss()
      return true
    }
    return false
  }

  useEffect(() => {
    if (!editor) return

    function sync() {
      if (!editor) return
      const { state } = editor
      const { $from, empty } = state.selection

      if (!empty || !$from.parent.isTextblock || $from.parent.type.name === 'codeBlock') {
        return close()
      }

      // Opening: a "/" typed at the start of a block or after whitespace. The
      // "after whitespace" rule is what stops a URL's slashes triggering it.
      if (from === null) {
        const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '￼')
        if (!/(?:^|\s)\/$/.test(before)) return
        if (dismissed.current === $from.pos - 1) return
        dismissed.current = null
        setFrom($from.pos - 1)
        setQuery('')
        setActiveIndex(0)
        setCoords(caretCoords(editor))
        return
      }

      // Open already: read the query forward from the remembered "/".
      if ($from.pos <= from) return close()
      const typed = state.doc.textBetween(from + 1, $from.pos, undefined, '￼')
      if (/\s/.test(typed)) return close()
      setQuery(typed)
      setActiveIndex(0)
    }

    editor.on('transaction', sync)
    return () => {
      editor.off('transaction', sync)
    }
  }, [editor, from, close])

  // A click elsewhere in the document should dismiss it, like any menu.
  useEffect(() => {
    if (!open) return
    const dismiss = () => close()
    window.addEventListener('scroll', dismiss, true)
    return () => window.removeEventListener('scroll', dismiss, true)
  }, [open, close])

  return { open, items, activeIndex, coords, select, setActiveIndex, close }
}

function caretCoords(editor: Editor) {
  const { top, bottom, left } = editor.view.coordsAtPos(editor.state.selection.from)
  return { top, bottom, left }
}
