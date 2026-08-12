import type { Board } from '../services/board.js'
import type { Card } from '../db/schema.js'
import type { ProjectSummary } from '../shared/types.js'
import { plural } from '../shared/plural.js'

/**
 * Tool results are rendered as compact markdown rather than JSON.
 *
 * Token efficiency is the agent's user experience: a JSON board with full
 * timestamps and ids on every card costs several times what this does, and the
 * model reads none of it. Ids appear only where a follow-up call might need
 * one — on ambiguity, the caller can still pass a title.
 */

function cardLine(card: Card): string {
  const bits = [card.completed ? '[x]' : '[ ]', card.title]
  if (card.dueAt) bits.push(`(due ${card.dueAt})`)
  return `  - ${bits.join(' ')}`
}

export function renderBoard(board: Board): string {
  const lines = [`# ${board.project.name}`]
  if (board.project.description) lines.push(board.project.description)

  for (const column of board.columns) {
    lines.push('', `## ${column.name} (${column.cards.length})`)
    if (!column.cards.length) lines.push('  (empty)')
    else lines.push(...column.cards.map(cardLine))
  }

  if (board.docs.length) {
    lines.push('', `## Docs`, ...board.docs.map((d) => `  - ${d.title}`))
  }
  return lines.join('\n')
}

export function renderProjects(projects: ProjectSummary[]): string {
  if (!projects.length) {
    return 'No projects yet. Create one with create_project.'
  }
  return projects
    .map((p) => `- ${p.name} — ${plural(p.cardCount, 'card')}, ${plural(p.docCount, 'doc')}`)
    .join('\n')
}

export function renderCard(card: Card, columnName: string): string {
  const lines = [
    `${card.completed ? '[x]' : '[ ]'} ${card.title}`,
    `column: ${columnName}`,
  ]
  if (card.dueAt) lines.push(`due: ${card.dueAt}`)
  if (card.description) lines.push('', card.description)
  return lines.join('\n')
}
