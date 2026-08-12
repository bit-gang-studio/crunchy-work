import { sql } from 'drizzle-orm'
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * The whole data model. Four tables, one hierarchy:
 *
 *   project ──┬── columns ── cards
 *             └── docs
 *
 * There is deliberately no `boards` table. A project has exactly one board, so
 * columns hang off the project directly — one less level in every query, URL
 * and tool signature. Many boards per project is Crunchy Team's job.
 */

const timestamps = {
  createdAt: text('created_at')
    .notNull()
    .default(sql`(datetime('now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(datetime('now'))`),
}

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  rank: text('rank').notNull(),
  ...timestamps,
})

export const columns = sqliteTable(
  'columns',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    rank: text('rank').notNull(),
    ...timestamps,
  },
  (t) => [index('columns_project_idx').on(t.projectId, t.rank)],
)

export const cards = sqliteTable(
  'cards',
  {
    id: text('id').primaryKey(),
    columnId: text('column_id')
      .notNull()
      .references(() => columns.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    rank: text('rank').notNull(),
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    /** ISO date (`YYYY-MM-DD`) or date-time. Null means unscheduled. */
    dueAt: text('due_at'),
    /**
     * A "done when…" checklist, stored as a JSON array of `{text, done}`.
     *
     * JSON in a text column rather than its own table: criteria are only ever
     * read and written as a whole list belonging to one card, never queried
     * across cards, so a table would buy joins and ordering we would never use.
     * The service layer owns the parse/serialise so nothing else sees a string.
     */
    acceptanceCriteria: text('acceptance_criteria').notNull().default('[]'),
    /** Rough effort: XS–XL. Null means unsized, which is the normal state. */
    size: text('size'),
    ...timestamps,
  },
  (t) => [index('cards_column_idx').on(t.columnId, t.rank)],
)

export const docs = sqliteTable(
  'docs',
  {
    id: text('id').primaryKey(),
    projectId: text('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    /** Markdown. The editor is a view over this, not the source of truth. */
    content: text('content').notNull().default(''),
    rank: text('rank').notNull(),
    ...timestamps,
  },
  (t) => [index('docs_project_idx').on(t.projectId, t.rank)],
)

export type Project = typeof projects.$inferSelect
export type Column = typeof columns.$inferSelect
export type Card = typeof cards.$inferSelect
export type Doc = typeof docs.$inferSelect
