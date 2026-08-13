import type { ChainedCommands } from '@tiptap/core'

/**
 * The block types a document can contain, defined **once**.
 *
 * Both the `/` menu and the selection bubble read this list, so the two can
 * never drift into offering different things. Each entry carries its markdown
 * shortcut as `hint`, shown greyed at the end of the row — the menu is then also
 * the only place that teaches the shortcuts, which is how a user graduates from
 * clicking to typing.
 *
 * `run` takes a chain rather than the editor so the caller decides what else is
 * in it. The `/` menu prepends a `deleteRange` for the "/query" text, which
 * makes inserting a block a *single* undo step instead of two.
 */
export type BlockCommand = {
  id: string
  label: string
  /** The markdown shortcut that does the same thing. */
  hint: string
  /** Extra words the `/` menu should match on, beyond the label. */
  keywords: string[]
  run: (chain: ChainedCommands) => ChainedCommands
}

export const BLOCKS: BlockCommand[] = [
  {
    id: 'paragraph',
    label: 'Text',
    hint: '',
    keywords: ['paragraph', 'body', 'plain'],
    run: (c) => c.setParagraph(),
  },
  {
    id: 'h1',
    label: 'Heading 1',
    hint: '#',
    keywords: ['title', 'big'],
    run: (c) => c.setNode('heading', { level: 1 }),
  },
  {
    id: 'h2',
    label: 'Heading 2',
    hint: '##',
    keywords: ['subtitle', 'section'],
    run: (c) => c.setNode('heading', { level: 2 }),
  },
  {
    id: 'h3',
    label: 'Heading 3',
    hint: '###',
    keywords: ['subsection'],
    run: (c) => c.setNode('heading', { level: 3 }),
  },
  {
    id: 'bulletList',
    label: 'Bullet list',
    hint: '-',
    keywords: ['unordered', 'ul', 'points'],
    run: (c) => c.toggleBulletList(),
  },
  {
    id: 'orderedList',
    label: 'Numbered list',
    hint: '1.',
    keywords: ['ordered', 'ol', 'steps'],
    run: (c) => c.toggleOrderedList(),
  },
  {
    id: 'taskList',
    label: 'To-do list',
    hint: '- [ ]',
    keywords: ['todo', 'checkbox', 'task', 'check'],
    run: (c) => c.toggleTaskList(),
  },
  {
    id: 'blockquote',
    label: 'Quote',
    hint: '>',
    keywords: ['citation', 'callout'],
    run: (c) => c.toggleBlockquote(),
  },
  {
    id: 'codeBlock',
    label: 'Code block',
    hint: '```',
    keywords: ['snippet', 'pre', 'monospace'],
    run: (c) => c.toggleCodeBlock(),
  },
  {
    id: 'horizontalRule',
    label: 'Divider',
    hint: '---',
    keywords: ['rule', 'separator', 'hr', 'line'],
    run: (c) => c.setHorizontalRule(),
  },
]

/**
 * The blocks a `/` query matches, best first.
 *
 * A prefix of the label beats a match anywhere, so "co" offers **Co**de block
 * before Quote (which matches only via its "callout" keyword). An empty query
 * is the whole list, in the order above — that ordering is the menu's opinion
 * about what people reach for.
 */
export function filterBlocks(query: string): BlockCommand[] {
  const q = query.trim().toLowerCase()
  if (!q) return BLOCKS

  const scored = BLOCKS.map((block) => {
    const label = block.label.toLowerCase()
    if (label.startsWith(q)) return { block, score: 0 }
    if (block.keywords.some((k) => k.startsWith(q))) return { block, score: 1 }
    if (label.includes(q) || block.keywords.some((k) => k.includes(q))) return { block, score: 2 }
    return { block, score: -1 }
  })

  return scored
    .filter((s) => s.score >= 0)
    .sort((a, b) => a.score - b.score)
    .map((s) => s.block)
}
