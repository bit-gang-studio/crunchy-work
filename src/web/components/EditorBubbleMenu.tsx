import { useEffect, useRef, useState, type FormEvent } from 'react'
import { BubbleMenu } from '@tiptap/react/menus'
import type { Editor } from '@tiptap/react'
import { BLOCKS } from '../lib/editorBlocks'

/**
 * The formatting toolbar, shown on a text selection.
 *
 * Notion and Linear both landed on the same three-way answer — markdown
 * shortcuts while you type, `/` to insert a block, and a bubble on selection to
 * restyle what already exists — and a permanently visible toolbar is the thing
 * neither of them kept. It costs vertical space on every document to serve the
 * minority of moments you are reformatting rather than writing, and the
 * selection is the only moment the buttons have an object to act on anyway.
 *
 * The block buttons are a subset of {@link BLOCKS}, because "turn this into a
 * heading" is the case `/` cannot serve: `/` inserts at the caret, and here you
 * already have the text.
 */
const TURN_INTO = ['h1', 'h2', 'bulletList', 'taskList', 'blockquote'] as const
const TURN_INTO_LABELS: Record<string, string> = {
  h1: 'H1',
  h2: 'H2',
  bulletList: 'List',
  taskList: 'To-do',
  blockquote: 'Quote',
}

export function EditorBubbleMenu({ editor }: { editor: Editor }) {
  const [linking, setLinking] = useState(false)

  return (
    <BubbleMenu
      editor={editor}
      // Hide over an image-less empty selection *and* inside a code block,
      // where "bold" is not a thing that exists.
      shouldShow={({ editor, from, to }) =>
        from !== to && !editor.isActive('codeBlock')
      }
    >
      <div
        data-testid="bubble-menu"
        className="flex items-center gap-0.5 rounded-card border border-line bg-surface p-1 shadow-raised"
      >
        {linking ? (
          <LinkInput editor={editor} onDone={() => setLinking(false)} />
        ) : (
          <>
            <EditorMark editor={editor} name="bold" label="B" title="Bold" className="font-bold" />
            <EditorMark editor={editor} name="italic" label="I" title="Italic" className="italic" />
            <EditorMark
              editor={editor}
              name="strike"
              label="S"
              title="Strikethrough"
              className="line-through"
            />
            <EditorMark editor={editor} name="code" label="<>" title="Inline code" className="font-mono" />
            <EditorButton
              active={editor.isActive('link')}
              title="Link"
              onClick={() => setLinking(true)}
            >
              Link
            </EditorButton>

            <span className="mx-1 h-4 w-px bg-hover-strong" aria-hidden />

            {TURN_INTO.map((id) => {
              const block = BLOCKS.find((b) => b.id === id)!
              return (
                <EditorButton
                  key={id}
                  active={isBlockActive(editor, id)}
                  title={`Turn into ${block.label.toLowerCase()}`}
                  onClick={() => {
                    // Toggling off returns to plain text, so a second press on
                    // the active button undoes it rather than doing nothing.
                    const chain = editor.chain().focus()
                    if (isBlockActive(editor, id)) chain.setParagraph().run()
                    else block.run(chain).run()
                  }}
                >
                  {TURN_INTO_LABELS[id]}
                </EditorButton>
              )
            })}
          </>
        )}
      </div>
    </BubbleMenu>
  )
}

function isBlockActive(editor: Editor, id: string): boolean {
  if (id === 'h1') return editor.isActive('heading', { level: 1 })
  if (id === 'h2') return editor.isActive('heading', { level: 2 })
  return editor.isActive(id)
}

/**
 * Exported so the card description's toolbar can use the same buttons. Two
 * formatting surfaces drawn from two sets of primitives would drift in a week.
 */
export function EditorMark({
  editor,
  name,
  label,
  title,
  className,
  children,
  showActive = true,
}: {
  editor: Editor
  name: 'bold' | 'italic' | 'strike' | 'code'
  /** A letterform that demonstrates the mark. Omit and pass `children` for a glyph. */
  label?: string
  title: string
  className?: string
  children?: React.ReactNode
  /**
   * Whether the active state means anything right now.
   *
   * The bubble only exists over a selection in a focused editor, so it leaves
   * this alone. A permanent toolbar outlives the cursor — see `EditorToolbar`.
   */
  showActive?: boolean
}) {
  return (
    <EditorButton
      active={showActive && editor.isActive(name)}
      title={title}
      onClick={() => {
        const chain = editor.chain().focus()
        if (name === 'bold') chain.toggleBold().run()
        else if (name === 'italic') chain.toggleItalic().run()
        else if (name === 'strike') chain.toggleStrike().run()
        else chain.toggleCode().run()
      }}
      className={className}
    >
      {children ?? label}
    </EditorButton>
  )
}

export function EditorButton({
  active,
  title,
  onClick,
  className,
  children,
}: {
  active: boolean
  title: string
  onClick: () => void
  className?: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={title}
      aria-pressed={active}
      title={title}
      // A click blurs the editor before it fires, and the command needs the
      // selection it is about to act on. mousedown, prevented, keeps it.
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
      className={`min-w-7 rounded px-1.5 py-1 text-xs leading-none ${
        active ? 'bg-accent text-accent-ink' : 'text-ink-muted hover:bg-hover'
      } ${className ?? ''}`}
    >
      {children}
    </button>
  )
}

/** The bubble becomes a URL field rather than opening a second popup over itself. */
function LinkInput({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const [href, setHref] = useState(() => (editor.getAttributes('link').href as string) ?? '')
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => input.current?.focus(), [])

  function submit(e: FormEvent) {
    e.preventDefault()
    const url = href.trim()
    const chain = editor.chain().focus().extendMarkRange('link')
    if (!url) chain.unsetLink().run()
    // Bare domains are what people paste; without a scheme the browser would
    // resolve them against this app's origin.
    else chain.setLink({ href: /^\w+:/.test(url) ? url : `https://${url}` }).run()
    onDone()
  }

  return (
    <form onSubmit={submit} className="flex items-center gap-1">
      <input
        ref={input}
        value={href}
        onChange={(e) => setHref(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onDone()}
        placeholder="Paste a link"
        aria-label="Link URL"
        className="w-48 rounded border border-line-strong px-2 py-1 text-xs focus:border-ink-muted focus:outline-none"
      />
      <button type="submit" className="rounded bg-accent px-2 py-1 text-xs text-accent-ink">
        {href.trim() ? 'Apply' : 'Remove'}
      </button>
    </form>
  )
}
