import type { Store } from '../db/index.js'
import { boardService } from './board.js'
import { cardsService } from './cards.js'
import { columnsService } from './columns.js'
import { docsService } from './docs.js'
import { projectsService } from './projects.js'

/**
 * The service layer. Both front doors — the HTTP API and the MCP tools — go
 * through exactly this, so behaviour can't drift between what a person does in
 * the UI and what an agent does with a tool. Routes hold no logic.
 */
export function createServices(store: Store) {
  const projects = projectsService(store)
  const columns = columnsService(store)
  const cards = cardsService(store)
  const docs = docsService(store)
  const board = boardService(store, { projects, columns, docs, cards })
  return { projects, columns, cards, docs, board }
}

export type Services = ReturnType<typeof createServices>

export { NotFoundError, ValidationError } from './errors.js'
