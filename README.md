# Crunchy

**Trello for AI.** A kanban board and lean docs that live on your machine, which your
AI agent can drive over [MCP](https://modelcontextprotocol.io).

No account. No API key. No database to set up. Free and MIT.

> **Status: pre-release.** Phase 0 of 5. Not yet published to npm.

```bash
npx crunchy-work
```

That's it — it creates `~/.crunchy`, opens your browser, and offers to connect any agent
clients it finds. Or skip the UI entirely and give your agent the tools directly:

```bash
claude mcp add crunchy -- npx -y crunchy-work mcp
```

Already have clients installed? One command wires up all of them:

```bash
npx crunchy-work connect          # add --dry-run to see what it would do
```

It finds Claude Code, Claude Desktop, Cursor, VS Code and Windsurf, writes each one's
config in its own format, and backs up anything it touches.

## What it is

- **Projects** — each with one kanban board and its own markdown docs
- **A board** — columns and cards, drag and drop, live-updating
- **Docs** — markdown per project, for the context that isn't a task
- **MCP** — every capability is a tool, so an agent can do anything you can

## What it isn't

Crunchy is deliberately small. No workspaces, no multiple boards per project, no list
view, no calendar, no roles or permissions, no built-in AI chat. If you want those,
they belong to [Crunchy Team](https://crunchy.team).

## Requirements

Node 22.5 or newer. Nothing else.

## Development

```bash
npm install
npm run dev          # web on :4420
npm run dev:server   # api on :4421
npm test
npm run build
```

## Licence

MIT
