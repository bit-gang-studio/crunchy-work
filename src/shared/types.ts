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

/** A project plus the counts the projects screen shows on its tile. */
export interface ProjectSummary extends Project {
  cardCount: number
  /** Cards ticked complete — the tile shows progress, not a raw pile size. */
  doneCount: number
  docCount: number
}

/** One line of a card's "done when…" checklist. */
export interface AcceptanceCriterion {
  text: string
  done: boolean
}

/** Rough effort. Deliberately a gut-feel scale, not hours. */
export const SIZES = ['XS', 'S', 'M', 'L', 'XL'] as const
export type Size = (typeof SIZES)[number]

export interface Card {
  id: string
  columnId: string
  title: string
  description: string
  rank: string
  completed: boolean
  dueAt: string | null
  /**
   * What "done" means for this card. Advisory — ticking every line does not
   * complete the card, and completing the card does not tick the lines. They
   * answer different questions: "is the work finished?" versus "did we agree
   * what finished meant?".
   */
  acceptanceCriteria: AcceptanceCriterion[]
  size: Size | null
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
export interface ColumnWithCards extends Column {
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
export interface ProjectDetail {
  project: Project
  columns: ColumnWithCards[]
  docs: DocSummary[]
}
