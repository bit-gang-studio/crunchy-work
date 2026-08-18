import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/react'
import { BLOCKS } from '../lib/editorBlocks'
import { EditorButton, EditorMark } from './EditorBubbleMenu'

/**
 * A always-visible formatting strip, for the card description.
 *
 * **The doc editor deliberately does not have one**, and that decision stands:
 * Notion and Linear both dropped the permanent toolbar because it spends
 * vertical space on every document to serve the minority of moments you are
 * reformatting rather than writing, and markdown-as-you-type plus `/` plus the
 * selection bubble already cover it.
 *
 * A card description is a different object. It is short, it is entered inside a
 * modal by someone who came to change one thing, and — unlike a doc page —
 * nothing about it announces that it is a rich editor at all. The bubble only
 * appears once you have selected text, and `/` only helps if you know to press
 * it. The strip is the affordance: it says "this is formattable" without
 * needing to be used.
 *
 * Same commands as the bubble, from the same {@link BLOCKS} list, so the two
 * cannot drift.
 */
const TURN_INTO = ['h1', 'h2', 'bulletList', 'orderedList', 'taskList', 'blockquote'] as const

/*
 * Icons, except the headings.
 *
 * Ten text labels — B I S <> H1 H2 List 1. To-do Quote — made the strip the
 * second-noisiest row in the modal: a bar you glance at, written out in words.
 * Every editor draws these as glyphs for that reason.
 *
 * `H1` and `H2` stay lettered, which is what Notion and Linear also do. A
 * heading has no shape to draw — the usual attempts are a big A next to a small
 * A, or lines of differing length, and neither says "heading" faster than the
 * letter does.
 */
function Icon({ d, label }: { d: string; label?: string }) {
  /*
   * A quotation mark's ink sits at the top of its em box with nothing under it,
   * so centring the *box* leaves the mark riding about 3px high. Nudged down by
   * a transform rather than a margin, so it cannot shift the row it is in.
   */
  if (label === '“')
    return <span className="translate-y-[3px] text-lg font-semibold leading-none">{label}</span>
  if (label) return <span className="text-[11px] font-semibold">{label}</span>
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={d} />
    </svg>
  )
}

const GLYPHS: Record<string, { d?: string; label?: string }> = {
  h1: { label: 'H1' },
  h2: { label: 'H2' },
  // Three rules with a dot beside each.
  bulletList: { d: 'M6 4h7M6 8h7M6 12h7M3 4h.01M3 8h.01M3 12h.01' },
  orderedList: { d: 'M6.5 4h6.5M6.5 8h6.5M6.5 12h6.5M2.4 3.2 3.3 2.8v2.6M2.3 7.2h1.5L2.3 9.1h1.6M2.3 11h1.5v1.2H2.9l.9 1.2H2.3' },
  /*
   * **A to-do is a box with a tick in it, not another list of rules.**
   *
   * These four sat side by side as bullet, ordered, to-do, quote — and every
   * one of them was drawn as horizontal rules with something to their left, so
   * the strip read as the same button four times. Bullets-vs-numbers is a
   * distinction every editor makes and everyone can read; the other two were
   * carrying no shape of their own.
   *
   * So a to-do wears the tick this app already draws everywhere else — the
   * `.tick` box, the card's complete toggle, the criteria rows — which makes it
   * the only glyph here that names a thing in our own vocabulary rather than a
   * generic list.
   */
  taskList: {
    d: 'M3 5.5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM5.75 8l1.6 1.6 3-3.4',
  },
  /*
   * And a quote is a quotation mark.
   *
   * Drawn as a bar beside rules it was indistinguishable from the list above
   * it — which is doubly wrong, because our blockquote *renders* as a left bar,
   * so the icon was a picture of the result rather than a name for the action.
   * A `“` has no such problem, and the letterform precedent is already set
   * above by H1 and H2: when a mark reads faster than a drawing, use the mark.
   */
  blockquote: { label: '“' },
}

export function EditorToolbar({ editor }: { editor: Editor }) {
  /*
   * **The strip only reports a format while there is a cursor to report it for.**
   *
   * A bubble menu cannot have this problem: it exists only over a selection, so
   * whatever it highlights is where you are. A permanent strip outlives the
   * cursor, and `editor.isActive` answers from the last selection whether or not
   * the editor still has focus. Opening a card whose description ends in a task
   * list therefore drew "Turn into to-do list" in full accent — the loudest
   * object in the modal describing an invisible caret, with `aria-pressed="true"`
   * telling a screen reader the same thing.
   *
   * Focus is not a transaction, so a re-render has to be asked for: `useEditor`
   * re-renders on transactions, which is what keeps the active states honest
   * while you type, but blurring the editor dispatches nothing.
   */
  const [focused, setFocused] = useState(() => editor.isFocused)
  useEffect(() => {
    const on = () => setFocused(true)
    const off = () => setFocused(false)
    editor.on('focus', on)
    editor.on('blur', off)
    return () => {
      editor.off('focus', on)
      editor.off('blur', off)
    }
  }, [editor])

  return (
    <div
      data-testid="editor-toolbar"
      /*
       * A permanent rule, because the field around it is permanent too.
       *
       * This briefly followed the container's hover state, which was the right
       * answer to the wrong design: the container's border used to be
       * transparent at rest, and a fixed rule inside a vanishing box left the
       * description looking like it had a top and bottom edge and no sides. The
       * box is always drawn now, so the strip can be too.
       */
      className="flex flex-wrap items-center gap-0.5 border-b border-line px-1 py-1"
    >
{/*
        * The marks keep their letterforms — a bold B, an italic I, a struck-out
        * S. They are not words standing in for icons; they *are* the icons, and
        * they demonstrate what they do.
        */}
      <EditorMark editor={editor} showActive={focused} name="bold" label="B" title="Bold" className="font-bold" />
      <EditorMark editor={editor} showActive={focused} name="italic" label="I" title="Italic" className="italic" />
      <EditorMark
        editor={editor}
        showActive={focused}
        name="strike"
        label="S"
        title="Strikethrough"
        className="line-through"
      />
      <EditorMark editor={editor} showActive={focused} name="code" title="Inline code">
        <Icon d="M6 3.5 3 8l3 4.5M10 3.5 13 8l-3 4.5" />
      </EditorMark>

      <span className="mx-1 h-4 w-px bg-line-strong" aria-hidden />

      {TURN_INTO.map((id) => {
        const block = BLOCKS.find((b) => b.id === id)
        if (!block) return null
        return (
          <EditorButton
            key={id}
            active={focused && isActive(editor, id)}
            title={`Turn into ${block.label.toLowerCase()}`}
            onClick={() => {
              // A second press on the active button returns to plain text,
              // rather than doing nothing — same behaviour as the bubble.
              const chain = editor.chain().focus()
              if (isActive(editor, id)) chain.setParagraph().run()
              else block.run(chain).run()
            }}
          >
            <Icon d={GLYPHS[id]?.d ?? ''} label={GLYPHS[id]?.label} />
          </EditorButton>
        )
      })}
    </div>
  )
}

function isActive(editor: Editor, id: string): boolean {
  if (id === 'h1') return editor.isActive('heading', { level: 1 })
  if (id === 'h2') return editor.isActive('heading', { level: 2 })
  return editor.isActive(id)
}
