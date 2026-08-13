import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Services } from '../services/index.js'

/**
 * Write everything out as markdown and JSON.
 *
 * This exists so leaving is easy, and that is a feature rather than an
 * afterthought: a tool that holds your work hostage is one you have to think
 * carefully before adopting. `crunchy export` and deleting the folder should be
 * all it takes to walk away with everything.
 *
 * Both formats, because they serve different readers. The JSON is complete and
 * re-importable; the markdown is what a person (or an agent, or a git diff)
 * actually reads.
 */
export interface ExportResult {
  directory: string
  projects: number
  docs: number
  cards: number
  files: string[]
}

/** Filesystem-safe, readable, and stable for the same name. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  return slug || 'untitled'
}

function boardMarkdown(board: {
  project: { name: string; description: string }
  columns: { name: string; cards: { title: string; completed: boolean; dueAt: string | null; description: string }[] }[]
}): string {
  const lines = [`# ${board.project.name}`]
  if (board.project.description) lines.push('', board.project.description)

  for (const column of board.columns) {
    lines.push('', `## ${column.name}`, '')
    if (!column.cards.length) lines.push('_empty_')

    for (const card of column.cards) {
      const due = card.dueAt ? ` (due ${card.dueAt})` : ''
      // No blank line between items: a blank line makes markdown treat this as a
      // "loose" list and wrap every card in its own paragraph when rendered.
      lines.push(`- [${card.completed ? 'x' : ' '}] ${card.title}${due}`)
      if (card.description) {
        // Indent so the body stays part of its list item.
        lines.push(...card.description.split('\n').map((line) => (line ? `      ${line}` : '')))
      }
    }
  }
  return lines.join('\n') + '\n'
}

export async function exportAll(services: Services, directory: string): Promise<ExportResult> {
  const projects = await services.projects.list()
  const files: string[] = []
  let docCount = 0
  let cardCount = 0

  mkdirSync(directory, { recursive: true })

  const dump: unknown[] = []

  for (const project of projects) {
    const board = await services.projectDetail.get(project.id)
    const folder = join(directory, slugify(project.name))
    mkdirSync(folder, { recursive: true })

    writeFileSync(join(folder, 'board.md'), boardMarkdown(board), 'utf8')
    files.push(join(folder, 'board.md'))
    cardCount += board.columns.reduce((n, c) => n + c.cards.length, 0)

    const docs = []
    if (board.docs.length) mkdirSync(join(folder, 'docs'), { recursive: true })
    for (const summary of board.docs) {
      const doc = await services.docs.get(summary.id)
      const path = join(folder, 'docs', `${slugify(doc.title)}.md`)
      writeFileSync(path, `# ${doc.title}\n\n${doc.content}\n`, 'utf8')
      files.push(path)
      docs.push(doc)
      docCount++
    }

    dump.push({ ...board, docs })
  }

  const jsonPath = join(directory, 'crunchy.json')
  writeFileSync(jsonPath, JSON.stringify({ exportedAt: new Date().toISOString(), projects: dump }, null, 2), 'utf8')
  files.push(jsonPath)

  return { directory, projects: projects.length, docs: docCount, cards: cardCount, files }
}
