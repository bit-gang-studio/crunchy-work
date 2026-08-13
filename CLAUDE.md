# CLAUDE.md

Guidance for Claude Code (and any contributor) working in this repo.

## What this is

**Crunchy** — "Trello for coding agents". A kanban board and lean markdown docs that run
locally, which Claude Code, Cursor and the rest drive over MCP. Free, MIT, `npx`-installable, no account and no API key.

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

**Deliberately present, despite being Team-ish:** **acceptance criteria** and **effort
size** on a card. Criteria earn it on the thesis — the pitch is that the plan lives
somewhere the agent can read it, and without them an agent knows *what* the task is but not
what finished looks like. Size is there because it is genuinely used in practice. Both were
added knowing the cost: every field lands on `add_card` and `update_card` as more schema and
description text, and tool-description bloat measurably degrades accuracy across the *whole*
surface. That is the bar any further field has to clear.

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
- **TipTap v3, not pinned.** Crunchy Team pins TipTap to v2 because `tiptap-markdown`
  targeted v2; that is no longer true (0.9 requires `^3.0.1`), so Team's deferred
  "revisit when the markdown extension supports v3" is resolved upstream.
- **Docs store markdown, not a document model.** An agent reads and writes docs over MCP
  as plain markdown, so the editor's storage format has to be the same thing or one front
  door is looking at a lossy conversion of the other. The editor is **code-split**
  (`lazy` + `Suspense`) — TipTap is ~178 kB gzipped against the app's ~97 kB, and most
  sessions never open a doc.
- **Live updates come from watching the database file, not an event bus.** The agent that
  makes a board interesting is usually talking to `crunchy mcp` — a *separate process*
  writing straight to the same SQLite file. An in-process bus would never see those writes,
  so the one demo the product is built around would be exactly the case that didn't work.
  `src/server/events.ts` watches the data directory and nudges SSE subscribers; the payload
  is only a nudge, never rows, so a client can't drift from server state. Live refetch is
  **paused while a drag is in flight** — swapping the columns mid-drag would change what the
  drop resolves its rank against. `e2e/live.spec.ts` spawns a real stdio MCP process and
  asserts the card lands on an already-open board.
- **Autosave flushes on `pagehide`, with `keepalive`.** The unmount flush only covers
  in-app navigation; a reload, a closed tab or a followed link tears the page down without
  React cleanup completing, and anything typed inside the debounce window is silently lost.
  An e2e journey caught exactly that. `pagehide` (not `beforeunload` — it fires on mobile)
  plus `fetch(..., { keepalive: true })` means the browser finishes the request after the
  page is gone.
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
src/mcp            tool surface, name resolver, JSON-RPC, stdio transport
test/              Vitest
e2e/               Playwright journeys + the accessibility gate
e2e-dnd/           Playwright against the auth-free drag harness
dist/              build output: dist/server, dist/db, dist/web
~/.crunchy         runtime data — CRUNCHY_DATA overrides
```

**Data lives at `~/.crunchy`, globally, not per-directory.** An agent's stdio
server is spawned with whatever working directory its client happens to have, so
a cwd-relative default would silently hand it a different, empty board from the
one the user is looking at. Point `CRUNCHY_DATA` at a repo for a board that
lives with it.

One npm package, two build outputs, one process in production. `npm run dev` runs Vite on
**4420** proxying `/api` to the Node server on **4421**; the built binary serves both from
**4420**.

## Commands

`npm install` · `npm run dev` · `npm run dev:server` · `npm run build` ·
`npm run typecheck` · `npm run lint` · `npm test` · `npm run test:e2e` · `npm run test:dnd`

**On a fresh machine:** `git clone` → `npm install` → `npx playwright install chromium` →
`npm run dev`. Node **≥22.5.0**, and that is the whole list — there is no `.env`, no API
key, no Docker and no account. Local board data lives at `~/.crunchy` and does **not**
travel with the repo, by design.

## Testing

Vitest for logic, Playwright for the browser.

**Definition of done, per phase:** units for new logic · one integration test through each
new seam · one e2e journey per UI surface · all gates green on Node 22 **and** 24.

### Accessibility is a gate, not a claim (`e2e/a11y.spec.ts`)

axe-core runs against WCAG 2.1 AA over every screen, five states and three widths — 390,
768, 1440 — **including menus and modals open**, since that markup does not exist to scan
while they are closed. Plus a hand-walked tab order and a check that Escape does not strand
focus, neither of which an automated scan can tell you.

It exists because "keyboard navigable with visible focus rings" had been asserted in a
commit message and never measured. It failed on the first run and found three real bugs.
Assert on a compact list of rule ids, never the raw violation objects — axe's objects are
enormous and a `toEqual([])` diff against them buries the actual problem.

### The drag-and-drop harness (`npm run test:dnd`)

The Kanban DnD is genuinely **browser behaviour** — collision, pointer position, preview
relocation, scroll-container re-measurement — that unit tests cannot see. `src/web/dnd-harness.html`
mounts the real `<KanbanBoard>` over in-memory state with no server, no database and no auth,
and mirrors each column's order into a hidden `data-testid="state"` node the specs assert
against. It runs on **port 4424**, not 4420, so it never fights a running app server —
`reuseExistingServer` would otherwise happily reuse whatever is on 4420 and every spec would
404. It is absent from the production build (only `index.html` is a Vite input).

Seeds: default (small, exact orders) · `?big=1` (full columns, wrapping titles, real scroll
containers) · `?flick=1` (a short card above a much taller one).

What each spec pins down, and why it exists:

| Spec | The bug it guards |
|---|---|
| `reachability` | "Can't drop into the first position of another column" |
| `placeholder` | The commit **is** the preview — the dashed placeholder can never lie |
| `dnd` | The gap between cards was a dead zone that dropped everything at the bottom; a drag also opening the card; the tick starting a drag |
| `flicker` | A held drag oscillating when two cards had different heights |
| `loop` | React #185 — the measure→re-render→measure cascade that white-screened the board |
| `touch` | A swipe must scroll; only a 200ms long-press picks a card up |

**When a drag bug is reported, reproduce it in the harness first** — it's the fast,
deterministic loop. Instrument `collisionDetection` with a `window.__dbg` trace and a sweep
spec to see `over`/`after` per y. Reuse this pattern for any future draggable surface.

## Design rules that are load-bearing

- **MCP tools address by name, never by UUID.** `add_card(project, column, title)`, not
  `add_card(boardId)`. Resolve names server-side with a clear disambiguation error. An
  agent forced to look up IDs burns turns and gets them wrong.
- **The tool ceiling is 18, raised from 12 on purpose — and the descriptions stay terse.**
  Measured on Crunchy Team: verbose tool descriptions took a model from 0/7 to 4/7 failures
  on an *unrelated* task. Every tool added taxes every other tool, so the number is not
  free. It moved because the old surface let an agent create a column but never rename,
  reorder or delete one, and create a doc but never delete one — an agent could make a mess
  it had no way to clean up, and the only fix was a human opening the browser. That is a
  worse failure than a slightly larger surface.

  The rule that replaces the number: **every entity gets full CRUD, and reorder folds into
  update rather than getting its own tool.** `update_project` / `update_column` /
  `update_doc` all take an optional `position`, the way `move_card` does. One verb per tool
  would have been 21. `test/mcp.test.ts` asserts both the ceiling and that `move_card` is
  still the only `move_*`.
- **A "board" is not an entity — say project.** There are four tables: `projects`,
  `columns`, `cards`, `docs`. There is no `boards` table; a board is the *shape of a read*
  (`ProjectDetail = { project, columns, docs }`). The word came from Crunchy Team, where a
  project really does have many boards. Here it gave us a type called `Board` that contained
  `docs`, and an MCP tool called `get_board` — the first one an agent reaches for — named
  after something that does not exist. Renamed 13 Aug, before publish, because renaming a
  published tool is expensive. **"Board" is still the right word in the UI** (`<KanbanBoard>`,
  `BoardScreen`, the Board tab), where it means the kanban surface on screen.
- **Never hard-code a palette value in a component.** Every colour, radius and shadow goes
  through a role token in `src/web/index.css` — `bg-surface`, `text-ink-muted`, `border-line`,
  `rounded-panel`, `shadow-card`. A component written in `bg-white` has baked a decision into
  itself and has to be rewritten to change it. This is what makes the theme pass a re-valuing
  of one block rather than a tour of every screen, and dark mode the same job again.
- **We are a guest on the user's machine.** `crunchy connect` writes to config files we did
  not create. It once replaced a VS Code `mcp.json` that had a comment in it — valid JSONC,
  which VS Code accepts — with one containing only Crunchy, silently deleting every other MCP
  server the user had, while printing "Connected". Never write a file you could not first
  read and understand; absent ≠ unreadable. Back up before touching someone else's file. If
  in doubt, refuse and print the JSON to paste.
- **One cheap call that returns the whole board** as compact markdown, so an agent orients
  in one call rather than five. Token efficiency is the agent's UX.
- **Frictionlessness is the product.** Target: under 60 seconds from landing on the repo to
  an agent creating a card — one command, one keypress. Anything that adds a step (a config
  file to hand-edit, a signup, an API key, a manual migration) is a bug.

## Gotchas

- **WAL gives concurrent *readers*, not writers.** `src/db/index.ts` sets
  `busy_timeout`; without it the second writer took `SQLITE_BUSY` instantly and the write
  was simply lost — measured at 19 of 30 landing between the web server and an MCP process,
  with the browser showing a 500 for a card the user had just typed. That is the product's
  core demo, not an edge case. Fixing the timeout then exposed a second race: appending a
  card reads the last rank and inserts, and as two awaited steps another writer reads the
  same "last". `cards.create` does the read and the insert in one `BEGIN IMMEDIATE`
  transaction on the raw synchronous handle. `test/concurrency.test.ts` guards both.
- **Drizzle hides the useful half of a driver error.** `.message` is the entire failed SQL
  statement with parameters; the fact that matters ("database is locked") is on `.cause`.
  `src/mcp/jsonrpc.ts` unwraps it, because a model told "Failed query: insert into…" has no
  idea the call is retryable.
- **dnd-kit's `attributes` must not go on an element that wraps a button.** They are
  `role="button"` + `tabindex`, so a card wrapper carrying them around the complete-toggle
  is invalid nested interactives and a screen reader announces the whole card as one
  control. Put `listeners` on the big drag target and `attributes` on a real focusable child
  — the card title, the column name. **This bug has been introduced twice**; the axe gate is
  what now catches it.
- **`npm run test:e2e` runs two Playwright projects in order.** Every spec shares one server
  and one SQLite file, and the "from an empty install" journey needs an empty database. That
  used to work only because it sorted first alphabetically, and adding `a11y.spec.ts` broke
  it instantly. `playwright.config.ts` makes it explicit with a `dependencies` edge:
  `journeys` first against a clean database, then `a11y` against what they left behind.
- **The e2e config passes `--no-open`.** It boots the real binary, and the real binary opens
  your browser — which is correct for `npx crunchy-work` and wrong in a test run. Without it
  every local run threw a window in your face and CI tried to launch a browser on a machine
  with no display.
- **Don't run this and Crunchy Team's dev server at once** — both default to 4420/4421.
  `PORT` overrides here.
- **`serveStatic` resolves relative to the working directory**, not to the module, so
  `src/server/app.ts` converts the absolute web root to a cwd-relative path.
- Fractional ranks (from Phase 1) compare by code point. SQLite's default BINARY collation
  is already correct — this is the one place Crunchy Team had to force `C` collation on
  Postgres, and the bug it caused (a crash on dragging a card to the top of a column) is
  worth knowing about before touching rank code.
