import { api } from './api'

/**
 * A new project arrives with two cards that explain what to do with it.
 *
 * The empty board used to teach instead: a line of copy and a prompt in a block
 * above the columns. It never worked. It assumed an agent was already connected,
 * so the one instruction on screen was the one that could not do anything yet;
 * it taught on every empty board forever, so your tenth project got a tutorial;
 * and squeezed into the gutter above three empty columns it read as debris.
 *
 * Trello and Linear both answered this the same way — don't have an empty state,
 * arrive with content — and it fits Crunchy better than either, because the
 * thing being taught *is* a card. The product demonstrates itself rather than
 * describing itself, the second card says to delete them both, and an empty
 * board goes back to meaning nothing more than an empty board.
 *
 * Browser-created projects only, which is why this lives in the web client and
 * not in the service layer. An agent calling `create_project` is already doing
 * the thing these cards teach, and seeded cards would be noise in the board it
 * reads back.
 */
export async function seedProject(projectId: string, name: string): Promise<void> {
  const detail = await api.getProject(projectId)
  const first = detail.columns[0]
  if (!first) return

  // Appended in order, so "connect" ends up above "ask" — which is the order
  // they have to happen in.
  const connect = await api.addCard(first.id, {
    title: 'Connect your coding agent',
    description: [
      'Crunchy is a board your coding agent can read and write — but it has to be connected first.',
      '',
      'Run this in a terminal:',
      '',
      '    npx crunchy-work connect',
      '',
      'It finds Claude Code, Claude Desktop, Cursor, VS Code and Windsurf, writes each one’s config in its own format, and backs up anything it touches.',
    ].join('\n'),
  })

  // On this card and not the other, because two demonstrations of the same field
  // is one too many.
  await api.updateCard(connect.id, {
    acceptanceCriteria: [
      { text: 'Ran npx crunchy-work connect', done: false },
      { text: 'Crunchy’s tools show up in your agent', done: false },
    ],
  })

  await api.addCard(first.id, {
    title: 'Ask your agent to fill this board',
    description: [
      'Once it is connected, paste this at your agent:',
      '',
      `    Look at this repo and add cards to ${name} for what needs doing.`,
      '',
      'Cards appear here as it writes them — nothing to refresh.',
      '',
      'Then delete these two cards. They are only here to get you started.',
    ].join('\n'),
  })
}
