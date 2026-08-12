/**
 * Forward-only migrations, in order, applied automatically at boot.
 *
 * They live in TypeScript rather than `.sql` files on purpose: the published
 * package is compiled JavaScript, and inlining means there is no asset-copying
 * step in the build and nothing that can go missing from the npm tarball.
 *
 * Never edit a migration that has shipped — add the next one.
 */
export interface Migration {
  id: string
  sql: string
}

export const migrations: Migration[] = [
  {
    id: '0001_init',
    sql: `
      CREATE TABLE meta (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      INSERT INTO meta (key, value) VALUES ('created_at', datetime('now'));
    `,
  },
  {
    id: '0002_core',
    sql: `
      CREATE TABLE projects (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        rank        TEXT NOT NULL,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE columns (
        id         TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name       TEXT NOT NULL,
        rank       TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX columns_project_idx ON columns(project_id, rank);

      CREATE TABLE cards (
        id          TEXT PRIMARY KEY,
        column_id   TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
        title       TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        rank        TEXT NOT NULL,
        completed   INTEGER NOT NULL DEFAULT 0,
        due_at      TEXT,
        created_at  TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX cards_column_idx ON cards(column_id, rank);

      CREATE TABLE docs (
        id         TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        title      TEXT NOT NULL,
        content    TEXT NOT NULL DEFAULT '',
        rank       TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX docs_project_idx ON docs(project_id, rank);
    `,
  },
]
