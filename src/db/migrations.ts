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
]
