import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import { useEffect, useRef } from 'react'

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
  const editor = useEditor({
    extensions: [StarterKit, Markdown.configure({ html: false, breaks: true })],
    content: initialMarkdown,
    editorProps: {
      attributes: {
        class:
          'prose prose-neutral max-w-none focus:outline-none min-h-[60vh] prose-headings:font-semibold prose-pre:bg-neutral-900 prose-pre:text-neutral-100',
        'aria-label': 'Document body',
        'data-testid': 'doc-body',
      },
    },
    onUpdate: ({ editor }) => onChange(editor.storage.markdown.getMarkdown()),
  })

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

  return <EditorContent editor={editor} />
}
