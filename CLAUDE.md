# CLAUDE.md

Guidance for Claude Code (and any contributor) working in this repo.

## What this is

**Crunchy** — "Trello for AI". A kanban board and lean markdown docs that run locally,
which an AI agent drives over MCP. Free, MIT, `npx`-installable, no account and no API key.

The thesis in one line: **the MCP surface *is* the product, and the web UI is a second
client over the same service layer.** If a capability can't be expressed as a tool, it
probably doesn't belong here.

## The two-product boundary — don't relitigate

| | Crunchy (this repo) | Crunchy Team (`crunchy.team`, separate repo) |
|---|---|---|
| Shape | Local, single-player, MIT | Hosted, collaborative, paid |
| Hierarchy | Projects → **one** board + docs | Workspaces → projects → **many** boards |
| Auth | **None at all** in v1 | Clerk |
| Extras | — | AI copilot, GitHub, calendar, list view, My Tasks, roles & access, recurring tasks, scheduling |

Crunchy does not grow into Team — you graduate to it. Anything collaborative,
permissioned, copiloted or multi-view belongs on the other side of that line.

**Scope that is deliberately absent:** workspaces · multiple boards per project · list
view · calendar · labels · recurring tasks · roles/permissions · in-app AI chat · email.

## Locked decisions

- **Storage is `node:sqlite`** — built into Node, so there is no native module to compile
  and nothing to download per platform. This was measured, not assumed: `better-sqlite3`
  **segfaulted** on the dev machine (Windows, both Git Bash and PowerShell), and PGlite
  cost 6.6 s on first init / 396 ms warm against `node:sqlite`'s **4–6 ms**. Cold start
  matters because the stdio MCP server spawns fresh on every agent session.
- **`--experimental-sqlite` on Node 22.** `node:sqlite` is unflagged from Node 24 but
  needs the flag on Node 22, and it must be set at process start. Two places handle it,
  both by *probing for the module* rather than comparing version numbers:
  `bin/crunchy.js` re-execs itself once with the flag; `vitest.config.ts` sets
  `NODE_OPTIONS` (which propagates to forked workers — a pool-option `execArgv` does not
  survive Vitest major versions). CI runs both 22 and 24 to keep this honest.
- **Drizzle via `sqlite-proxy`.** Drizzle has no first-party `node:sqlite` driver, so
  `src/db/index.ts` adapts one in ~15 lines. Chosen over Prisma because Prisma ships a
  Rust engine binary and a codegen step — real weight in a package distributed by `npx`.
- **Hono, not NestJS.** Nest's DI and dep tree cost cold-start time we can't spare.
- **Migrations are inlined TypeScript** (`src/db/migrations.ts`), not `.sql` files, so the
  build has no asset-copying step and nothing can go missing from the npm tarball. They
  run automatically at boot — **upgrading is never a manual step**. Never edit a shipped
  migration; add the next one.
- **TypeScript is pinned to 6.0.3.** TS 7 is out but `typescript-eslint` peer-caps at
  `<6.1.0`. *Revisit when typescript-eslint supports TS 7.*
- **Package `crunchy-work`, binary `crunchy`, repo `bit-gang-studio/crunchy-work`, site
  `crunchy.work`.** The bare `crunchy` npm name is taken (an anime downloader, still
  getting downloads). `bit-gang-studio/crunchy` is Crunchy Team's repo and **cannot be
  renamed casually** — its production deploy is keyless via GitHub OIDC and the AWS IAM
  trust policy pins `repo:bit-gang-studio/crunchy:ref:refs/heads/main`
  (`infra/lib/cicd-stack.ts`), so a rename breaks deploys until the CicdStack is
  redeployed. Repo, package and domain all being `crunchy-work` is the coherent outcome
  anyway.

## Structure

```
bin/crunchy.js     entry; handles the Node 22 SQLite flag, then boots
src/db             node:sqlite + Drizzle adapter, migrations
src/server         Hono app; serves the API and the built SPA
src/web            Vite + React 19 + Tailwind v4 SPA
test/              Vitest
dist/              build output: dist/server, dist/db, dist/web
.crunchy/          runtime data (gitignored) — CRUNCHY_DATA overrides
```

One npm package, two build outputs, one process in production. `npm run dev` runs Vite on
**4420** proxying `/api` to the Node server on **4421**; the built binary serves both from
**4420**.

## Commands

`npm install` · `npm run dev` · `npm run dev:server` · `npm run build` ·
`npm run typecheck` · `npm run lint` · `npm test`

## Testing

Vitest for logic; Playwright for browser journeys (from Phase 3). Ported harnesses —
the DnD and autogrow-textarea harnesses from Crunchy Team — come with their specs.

**Definition of done, per phase:** units for new logic · one integration test through each
new seam · one e2e journey per UI surface · all gates green on Node 22 **and** 24.

## Design rules that are load-bearing

- **MCP tools address by name, never by UUID.** `add_card(project, column, title)`, not
  `add_card(boardId)`. Resolve names server-side with a clear disambiguation error. An
  agent forced to look up IDs burns turns and gets them wrong.
- **Keep the tool surface ≤ ~12 tools and the descriptions terse.** Measured on Crunchy
  Team: verbose tool descriptions took a model from 0/7 to 4/7 failures on an *unrelated*
  task. Every tool added taxes every other tool.
- **One cheap call that returns the whole board** as compact markdown, so an agent orients
  in one call rather than five. Token efficiency is the agent's UX.
- **Frictionlessness is the product.** Target: under 60 seconds from landing on the repo to
  an agent creating a card — one command, one keypress. Anything that adds a step (a config
  file to hand-edit, a signup, an API key, a manual migration) is a bug.

## Gotchas

- **Don't run this and Crunchy Team's dev server at once** — both default to 4420/4421.
  `PORT` overrides here.
- **`serveStatic` resolves relative to the working directory**, not to the module, so
  `src/server/app.ts` converts the absolute web root to a cwd-relative path.
- Fractional ranks (from Phase 1) compare by code point. SQLite's default BINARY collation
  is already correct — this is the one place Crunchy Team had to force `C` collation on
  Postgres, and the bug it caused (a crash on dragging a card to the top of a column) is
  worth knowing about before touching rank code.
