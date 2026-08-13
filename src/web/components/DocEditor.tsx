import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Markdown } from 'tiptap-markdown'
import { useEffect, useRef } from 'react'
import { useSlashMenu, type KeyInterceptor } from '../lib/useSlashMenu'
import { SlashMenu } from './SlashMenu'
import { EditorBubbleMenu } from './EditorBubbleMenu'

/**
 * `tiptap-markdown` adds this at runtime but does not declare it, so without the
 * augmentation reading the markdown back out is an untyped hole. Declaring it
 * here keeps the cast out of the call site.
 */
declare module '@tiptap/core' {
  interface Storage {
    markdown: { getMarkdown: () => string }
  }
}

/**
 * The document editor: WYSIWYG on the surface, **markdown underneath**.
 *
 * Markdown is the stored format, not a rendering of some richer internal
 * document, and that is the point. An agent reads and writes docs over MCP as
 * plain markdown (`get_doc` / `write_doc`), so what a person edits here and what
 * a model writes there have to be the same thing. A proprietary JSON document
 * model would make one of those two a lossy conversion.
 *
 * Three ways to format, which is the arrangement Notion and Linear converged on
 * and neither of them spends a permanent toolbar on:
 *
 * 1. **Markdown as you type** — `# `, `- `, `> `, `` ``` ``. The fastest path,
 *    and the one this product's audience already has in their fingers.
 * 2. **`/` at the caret** — a command list for inserting a block, which also
 *    displays each block's markdown shortcut and so teaches route 1.
 * 3. **A bubble on selection** — for restyling text that already exists, the
 *    one case `/` cannot serve.
 *
 * TipTap v3. Crunchy Team is pinned to v2 because `tiptap-markdown` targeted v2
 * — that is no longer true (0.9 requires ^3.0.1), so this carries no pin.
 */
export function DocEditor({
  docId,
  initialMarkdown,
  onChange,
}: {
  /** Changing this replaces the content; edits within one doc must not reset the cursor. */
  docId: string
  initialMarkdown: string
  onChange: (markdown: string) => void
}) {
  /*
   * The slash menu's arrow/Enter handling has to run before ProseMirror sees the
   * key, and `editorProps` is captured once when the editor is created — so the
   * handler is reached through a ref the hook keeps current.
   */
  const keys: KeyInterceptor = useRef<(event: KeyboardEvent) => boolean>(() => false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      // Checklists round-trip as `- [ ]` / `- [x]`, so an agent writing a
      // checklist over MCP and a person ticking it here are the same document.
      TaskList,
      TaskItem.configure({ nested: true }),
      Markdown.configure({ html: false, breaks: true }),
      Placeholder.configure({
        placeholder: 'Start writing. Markdown works, or press "/" for blocks.',
      }),
    ],
    content: initialMarkdown,
    editorProps: {
      handleKeyDown: (_view, event) => keys.current(event),
      attributes: {
        class:
          'prose prose-neutral max-w-none focus:outline-none min-h-[60vh] prose-headings:font-semibold prose-pre:bg-accent prose-pre:text-ink-inverse',
        'aria-label': 'Document body',
        'data-testid': 'doc-body',
      },
    },
    onUpdate: ({ editor }) => onChange(editor.storage.markdown.getMarkdown()),
  })

  const slash = useSlashMenu(editor, keys)

  /*
   * Only reload content when the *document* changes. Syncing on every content
   * change would fight the user: each keystroke round-trips through markdown and
   * resets the selection to the start.
   *
   * The markdown is read through a ref so the effect's dependencies are exactly
   * what it reacts to, rather than suppressing a lint rule about the difference.
   */
  const latest = useRef(initialMarkdown)
  latest.current = initialMarkdown

  useEffect(() => {
    if (editor && !editor.isDestroyed) editor.commands.setContent(latest.current)
  }, [docId, editor])

  return (
    <>
      <EditorContent editor={editor} />
      {editor && <EditorBubbleMenu editor={editor} />}
      <SlashMenu state={slash} />
    </>
  )
}
