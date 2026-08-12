/**
 * The wire contract, shared by the server and the browser.
 *
 * These are declared by hand rather than inferred from the Drizzle schema on
 * purpose: importing the schema into web code would drag the ORM into the
 * browser bundle for the sake of some type aliases. The API returns exactly
 * these shapes, and `test/api.test.ts` is what keeps the two honest.
 */

export interface Project {
  id: string
  name: string
  description: string
  rank: string
  createdAt: string
  updatedAt: string
}

export interface Card {
  id: string
  columnId: string
  title: string
  description: string
  rank: string
  completed: boolean
  dueAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Column {
  id: string
  projectId: string
  name: string
  rank: string
  createdAt: string
  updatedAt: string
}

/** A column as the board renders it. */
export interface BoardColumn extends Column {
  cards: Card[]
}

/** Doc listings omit `content` so listing a project stays cheap. */
export interface DocSummary {
  id: string
  projectId: string
  title: string
  rank: string
  createdAt: string
  updatedAt: string
}

export interface Doc extends DocSummary {
  content: string
}

/** What `GET /api/projects/:id` returns — the whole board in one call. */
export interface Board {
  project: Project
  columns: BoardColumn[]
  docs: DocSummary[]
}
