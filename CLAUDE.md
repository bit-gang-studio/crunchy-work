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
- **A save indicator must never be ahead of the save.** The doc editor's state only left
  `saved` inside the debounced callback, so for the 500ms between a keystroke and the flush
  the label read "Saved" over a change that had not left the browser. `pagehide` meant the
  work was usually rescued anyway — but the label is the thing people act on, and it was
  lying. It says "Saving…" from the keystroke now. Found because an e2e assertion trusted
  the indicator, read the API inside that window, and got back a one-character document;
  the test had been passing on timing for as long as it existed, and a 4px change to an
  unrelated header was enough to tip it.
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

**axe cannot read `oklch()`, and it does not tell you so.** It files an
unreadable colour under *incomplete* — "could not determine" — which is not a
violation, so a gate asserting on violations reports green over a palette it
never measured. Tailwind v4's entire default palette is oklch, so while the
light tokens were `var(--color-neutral-400)` none of them were being checked;
`ink-faint` was **2.6:1** on white the whole time. Proved, not assumed: writing
the *same* grey as hex turned 0 violations into 34 across three scans. **Both
palettes are now written in explicit hex**, and `assertNoUnreadableColours`
fails the build if an oklch colour reaches a screen. The one exemption is the
project swatch, whose hue comes from a hash and needs a perceptually uniform
space; its contrast is fixed by construction and computed by hand.

**And a dark pass**, at one width only: the widths vary *layout*, which is identical between
palettes, while what a second palette changes is colour. It caught 28 contrast failures the
first time it ran and has caught every dark regression since — run it from the moment a
palette exists, not at the end of a theme pass, so whoever picks a colour is told immediately.

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
containers) · `?flick=1` (a short card above a much taller one) · `?cols=1` (four columns —
enough to overflow the board at 1280, which is the only state auto-scroll and scroll-snap
engage in).

**The harness must carry the real board's affordances, not just its cards.** Column reorder
went untested for a release because the harness mounted `<KanbanBoard>` without
`onMoveColumn`, which silently sets `sortable={false}` — the columns were not draggable there
at all. The `+ Add column` button matters for the same reason: it is ~200px of board width,
and it is the difference between four columns fitting on screen and the board scrolling. A
harness that is a simplified board tests a board that does not ship.

What each spec pins down, and why it exists:

| Spec | The bug it guards |
|---|---|
| `reachability` | "Can't drop into the first position of another column" |
| `placeholder` | The commit **is** the preview — the dashed placeholder can never lie |
| `dnd` | The gap between cards was a dead zone that dropped everything at the bottom; a drag also opening the card; the tick starting a drag |
| `flicker` | A held drag oscillating when two cards had different heights |
| `loop` | React #185 — the measure→re-render→measure cascade that white-screened the board |
| `touch` | A swipe must scroll; only a 200ms long-press picks a card up |
| `column` | Dropping a column in the first slot landed it second, 3 runs in 5 |
| `geometry` | Picking a card up nudged every card below it down by 4px |

**A placeholder is drawn with `outline`, never `border`.** The dragged card's slot wraps an
invisible copy of the card so it reserves the exact height — and then a 2px dashed *border*
added 4px to an auto-height box, so the column shifted the moment you picked anything up.
An outline paints without participating in layout; `-outline-offset-2` puts it where the
border was. The same trap applies to any hover or drop-target ring drawn on a card.

**Collision is decided by the pointer, never by the dragged element's rect** — on both the
card path and the column path. The column path used dnd-kit's stock `closestCenter`, which
measures from the dragged element's translated centre; a column is 288px wide and you grab it
by its header, so that centre sits ~100px right of your pointer and aiming at the first
column landed exactly on the boundary with the second. Scroll drift then broke the tie: the
board scrolls horizontally, a pointer near the left edge sits inside dnd-kit's auto-scroll
band, and the first column's measured centre swung from -26 to +5 across consecutive
collision passes **while the pointer was stationary**. Horizontal distance from the pointer to
each column's box does not care where you gripped and cannot be flipped by 100px of drift.

**When a drag bug is reported, reproduce it in the harness first** — it's the fast,
deterministic loop. Instrument `collisionDetection` with a `window.__dbg` trace and a sweep
spec to see `over`/`after` per y. Reuse this pattern for any future draggable surface. Note
the harness reproduced the column bug only *after* it was made to match the real board's
width — a bug that needs a scrolling container will not appear on a board that fits.

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

  **Dark mode proved it: it is one block of CSS and zero component changes.** The two places
  the rule had leaked are worth knowing, because both are shapes a token can't reach:
  a colour *computed* in TypeScript (`projectColor` returned a finished `hsl(h 62% 97%)` for
  project tiles, which stayed near-white while the ink on it inverted — it now returns the hue
  and CSS owns the lightness), and a colour owned by *someone else's* CSS (the typography
  plugin's `prose` classes carried their own ink).

  **Both leaks are now closed, and with them the `dark:` variant.** The plugin's colour
  variables — `--tw-prose-body` and the seventeen beside it — are mapped onto our tokens in
  `index.css`, so a document's ink is `--color-ink` like every other screen's. Our tokens
  already flip with the theme, so one set of values is right in both palettes and
  `dark:prose-invert` is no longer needed. `@custom-variant dark` was defined *only* to power
  that one utility, so it has been **removed**: the rule that every colour goes through a role
  token now enforces itself, because `dark:` does not compile. Two things followed from
  closing it that are worth knowing. The doc page's ink had been Tailwind neutral in
  **oklch** — the one colour space axe silently cannot measure — on the app's most text-heavy
  screen. And `assertNoUnreadableColours` could never have caught it: it ran once per walk on
  the projects list, reasoning that "the tokens are global", which is true of *our* tokens and
  was exactly what prose was the exception to. It now also runs on the doc editor and the card
  description, the two screens where prose exists.

  **Dark ink is not light ink mirrored.** Inverting the light scale gives a faint step of
  `#737373`, which measures **3.19:1** on the dark surface — ten failures on the switcher's
  card counts, first time the dark scan ran. Dark needs a *narrower* ink range than light,
  because dim grey on black is genuinely harder to read than its mirror image on white. The
  binding constraint is small text on `surface` and on a hovered row; solve for that, then
  push `muted` up so it stays visibly above `faint`. The ratios are in the comments beside
  the values, and the axe gate now runs a dark pass so nobody has to take them on trust.

  **The theme is applied by an inline script in `index.html`, before first paint.** The bundle
  is a module, so it runs after the document paints — React's first effect is a whole frame
  too late, and every load flashes light. Those six duplicated lines are the point of them.
- **A project screen spends one bar of chrome on a phone, not two.** Below `md` the app
  header is hidden on `/projects/*`: everything it carried was either a duplicate (the
  wordmark went home; the project header's "Projects" breadcrumb already did, two rows
  below) or belonged elsewhere (the theme toggle moved into the project menu — a setting
  you change twice a year does not earn 120px of a 390px bar). The project description is
  hidden at that width too, because truncated to one line it delivered its first six words
  and cost a row; it is still shown in full from `md` up and editable from the menu. Both
  changes are phone-only and the two bars remain everywhere else — the projects list has no
  project header to carry the name, so hiding it there would leave the app anonymous.
  Together they moved the first card from 218px down the screen to 146px.
- **A loading state renders the whole shell, not just the missing part.** The board's
  skeleton was column-shaped so the columns would not jump — but it rendered *without the
  project header*, so the entire board dropped by the header's height (~120px) the instant
  the fetch returned. A few pixels of care nested inside a hundred-pixel jump. The docs
  screens already had it right: render `<ProjectHeader>` immediately with a placeholder
  name, because the one thing you know before a fetch returns is that a header will be
  there. Only visible with the response held open — locally the board reads in single-digit
  milliseconds, so the wrong layout was on screen for one frame and looked like the page
  simply appearing. `e2e/board.spec.ts` routes a delay in and measures it.
- **We are a guest on the user's machine.** `crunchy connect` writes to config files we did
  not create. It once replaced a VS Code `mcp.json` that had a comment in it — valid JSONC,
  which VS Code accepts — with one containing only Crunchy, silently deleting every other MCP
  server the user had, while printing "Connected". Never write a file you could not first
  read and understand; absent ≠ unreadable. Back up before touching someone else's file. If
  in doubt, refuse and print the JSON to paste.
- **A card description is the doc editor, and a card is not a document.** Both store
  markdown, so a `## heading` written by an agent over MCP and one typed in the browser have
  to be the same object — the description was a textarea that stored markdown and rendered
  none of it. What differs is everything around the text. The doc page deliberately has **no
  permanent toolbar** (Notion and Linear both dropped theirs; markdown-as-you-type, `/`, and
  the selection bubble cover it) and a card **has one**, because a description is short, it
  is entered in a modal by someone who came to change one thing, and nothing else on it
  announces that it is a rich editor. Both surfaces draw from one `BLOCKS` list and one pair
  of button primitives so they cannot drift. The typography differs too: `prose-card` is
  **panel metrics, not page metrics** — measured in the modal, the plugin's scale gave a 30px
  `h1` over an 18px card title and 601px of height for eleven short blocks. Headings sit only
  just above body size and are carried by weight; the card's `h1` is 17px, deliberately under
  the title it lives beneath.
- **A document screen is measured, not just styled.** Line length is the one metric that
  only matters here — a board is scanned, a document is read — and the doc column was putting
  **87 characters** on a line at 1440. `max-w-2xl` brings it to about 75, the top of the
  comfortable 45–75 range. Two more things were artifacts rather than decisions: TipTap wraps
  every list item's content in a `<p>`, and `prose` gives a paragraph 20px of bottom margin,
  so a three-bullet list rendered with paragraph air between its items and read as three
  separate thoughts (`.prose li > p { margin: 0 }` — the same fix `prose-card` already had);
  and the plugin draws literal backticks around inline `code`, which in an *editor* reads as a
  markdown parser that failed.
- **A document is one sheet.** The title had its own bordered box above the body's bordered
  box, so a doc read as two stacked form fields — and with `min-h-[60vh]` under it, a short
  document was a 558px empty panel with two lines at the top, which looks like something you
  failed to fill in rather than something you are writing. Title and body now share one
  panel, separated by a rule, which is what a title *is*. The title is `text-3xl` because it
  has to outrank the `h2`s inside the document, and at `text-2xl` the two were both 24px.
- **Destructive actions live behind the ⋯ on every surface.** Cards and docs both had a
  permanently visible red delete, so the foot of each read as a warning; on a doc, which
  scrolls, it also sat wherever the text happened to end. Both are in an overflow menu now,
  and any new surface owes the same. The composers match too: `+ New doc` and `+ Add a
  criterion` are quiet until pressed, because a permanent full-width input is the loudest
  thing on a screen whose subject is the content above it. Empty states are the exception —
  with nothing to be quieter than, the next thing to do *is* the page.
- **A control the user cannot see cannot show its own focus.** Two chips here are a visible
  thing we draw over a real control that is invisible — the due date's `sr-only` input, the
  column picker's `opacity-0` select. Both are the right shape (the platform keeps the date
  picker and the select menu; we keep the look), and both hide a focus ring as effectively as
  `display: none` would: tabbing to the due date focused a **1×1 element at (455, 190)** and
  nothing on screen changed. The visible chip wears the focus through `peer-focus-visible`,
  which is only possible if the real control is the chip's *previous sibling*. The axe gate
  cannot catch this — the input has a ring, it is simply invisible — so `e2e/board.spec.ts`
  asserts it.
- **`appearance-none` is half of owning a `<select>`; the other half is width.** A native
  select sizes itself to its **widest option**, not its current one, so the column picker was
  172px wide to show 61px of text with our chevron marooned 87px from the word — because
  somewhere in the project there was a column called "Another Another Another". The header
  control's size was set by a column the card was not in. Draw the chip, lay the select over
  it at `opacity-0`, and let the span do the sizing.
- **A permanent toolbar must gate its active state on focus.** A bubble menu cannot get this
  wrong — it only exists over a live selection. A strip outlives the cursor, and
  `editor.isActive` answers from the last selection whether or not the editor still has
  focus, so opening a card whose description ended in a task list drew "to-do list" in full
  accent and told a screen reader `aria-pressed="true"` about a caret that was not there.
  Focus is **not a transaction**, so subscribing to `focus`/`blur` is required; `useEditor`'s
  re-render-on-transaction does not cover it.
- **`aria-modal="true"` is a promise the Tab key has to keep.** The card panel carried
  `role="dialog" aria-modal="true"` from the day it was built with nothing enforcing it:
  tabbing from an open card walked the app header, the project menu, the tabs and then the
  columns *behind the scrim* — twelve stops without landing in the dialog, every one of them
  announced to assistive tech as inert. Focus starts on the panel (`tabIndex={-1}`, so it is
  a landing spot and not a tab stop), Tab cycles within it, and closing returns focus to the
  board rather than the top of the document. Any future dialog owes the same three things.
- **One cheap call that returns the whole board** as compact markdown, so an agent orients
  in one call rather than five. Token efficiency is the agent's UX.
- **Frictionlessness is the product.** Target: under 60 seconds from landing on the repo to
  an agent creating a card — one command, one keypress. Anything that adds a step (a config
  file to hand-edit, a signup, an API key, a manual migration) is a bug.

## Gotchas

- **A local write has to mark itself, or the live-update pulse lies.** `useRecentChanges`
  diffs two reads, which is what makes an agent's write and a browser tab's write look
  identical — the point of the design. The cost is that every local mutation must call
  `markLocalChange`, or the "this changed while you were not looking" ring fires on the card
  you are looking at and just clicked. **This has now shipped twice**: ticking a card, then
  adding one. Adding is the harder case, because the id is the server's to assign, so it can
  only be marked *after* the response — a window the 80ms watcher coalesce makes safe in
  practice. `e2e/board.spec.ts` pins both, each paired with an assertion that a write from
  outside the tab still pulses, so a fix cannot degrade into a mute button.
- **`contenteditable` has no implicit ARIA role**, so an `aria-label` on it is naming a
  generic div — `aria-prohibited-attr`. The doc editor had carried one since it was built and
  the gate never saw it, because the scan never opened a document; putting the same editor in
  the card modal walked it straight onto a screen the scan does visit. It needs
  `role="textbox"` and `aria-multiline="true"` before the label means anything.
- **`@tiptap/extension-placeholder` renders nothing on its own.** It sets `data-placeholder`
  and marks the empty node; the CSS is the caller's. That CSS did not exist, so every empty
  document had been silently blank since the editor was built — the string was in the source
  and had never been on screen. Noticed only because a card needed a different one.
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
