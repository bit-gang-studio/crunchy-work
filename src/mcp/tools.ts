import type { Services } from '../services/index.js'
import {
  optionalBoolean,
  optionalNumber,
  optionalString,
  optionalStringArray,
  requireString,
  type Args,
} from './args.js'
import { renderBoard, renderCard, renderProjects } from './format.js'
import { resolveCard, resolveColumn, resolveDoc, resolveProject } from './resolve.js'

/**
 * The tool surface — this is the product.
 *
 * Two rules hold it together, both measured rather than assumed on Crunchy Team:
 *
 * 1. **Keep it small.** Every tool taxes every other tool's accuracy. Twelve is
 *    the ceiling; if something new is needed, something should probably merge.
 * 2. **Keep descriptions terse.** Verbose tool text took a model from 0/7 to
 *    4/7 failures on an *unrelated* task. One line each, and argument
 *    descriptions only where the format isn't self-evident.
 */

export interface Tool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  run(services: Services, args: Args): Promise<string>
}

/** A schema property. */
const field = (description?: string) =>
  description ? { type: 'string', description } : { type: 'string' }

function schema(properties: Record<string, unknown>, required: string[] = []) {
  return { type: 'object', properties, required, additionalProperties: false }
}

/** Every tool that works inside a project takes it by name. */
const PROJECT = { project: field('Project name.') }

export const tools: Tool[] = [
  {
    name: 'list_projects',
    description: 'List all projects with their card and doc counts.',
    inputSchema: schema({}),
    async run(services) {
      const projects = await services.projects.list()
      const counts = new Map<string, { cards: number; docs: number }>()
      for (const project of projects) {
        const board = await services.board.get(project.id)
        counts.set(project.id, {
          cards: board.columns.reduce((n, c) => n + c.cards.length, 0),
          docs: board.docs.length,
        })
      }
      return renderProjects(projects, counts)
    },
  },

  {
    name: 'get_board',
    description: "Read a project's whole board — every column, its cards, and the doc titles.",
    inputSchema: schema({ ...PROJECT }, ['project']),
    async run(services, args) {
      const project = await resolveProject(services, requireString(args, 'project'))
      return renderBoard(await services.board.get(project.id))
    },
  },

  {
    name: 'create_project',
    description: 'Create a project. Starts with To Do / In Progress / Done.',
    inputSchema: schema(
      {
        name: field(),
        description: field(),
        cards: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional starter card titles, added to the first column.',
        },
      },
      ['name'],
    ),
    async run(services, args) {
      const project = await services.projects.create({
        name: requireString(args, 'name'),
        description: optionalString(args, 'description'),
      })
      const titles = optionalStringArray(args, 'cards')
      if (titles.length) {
        const [first] = await services.columns.listForProject(project.id)
        for (const title of titles) await services.cards.create(first!.id, { title })
      }
      return renderBoard(await services.board.get(project.id))
    },
  },

  {
    name: 'add_card',
    description: 'Add a card to a column.',
    inputSchema: schema(
      {
        ...PROJECT,
        column: field('Column name.'),
        title: field(),
        description: field(),
        due: field('Due date, YYYY-MM-DD.'),
      },
      ['project', 'column', 'title'],
    ),
    async run(services, args) {
      const project = await resolveProject(services, requireString(args, 'project'))
      const column = await resolveColumn(services, project.id, requireString(args, 'column'))
      const card = await services.cards.create(column.id, {
        title: requireString(args, 'title'),
        description: optionalString(args, 'description'),
        dueAt: optionalString(args, 'due') ?? null,
      })
      return `Added "${card.title}" to ${column.name}.`
    },
  },

  {
    name: 'get_card',
    description: "Read one card's full detail, including its description.",
    inputSchema: schema(
      { ...PROJECT, card: field('Card title, or its id if the title is ambiguous.') },
      ['project', 'card'],
    ),
    async run(services, args) {
      const project = await resolveProject(services, requireString(args, 'project'))
      const card = await resolveCard(services, project.id, requireString(args, 'card'))
      const column = await services.columns.get(card.columnId)
      return renderCard(card, column.name)
    },
  },

  {
    name: 'update_card',
    description: 'Change a card — title, description, due date, or completion.',
    inputSchema: schema(
      {
        ...PROJECT,
        card: field(),
        title: field(),
        description: field(),
        due: field('Due date YYYY-MM-DD, or empty string to clear.'),
        completed: { type: 'boolean' },
      },
      ['project', 'card'],
    ),
    async run(services, args) {
      const project = await resolveProject(services, requireString(args, 'project'))
      const card = await resolveCard(services, project.id, requireString(args, 'card'))
      const due = optionalString(args, 'due')
      const updated = await services.cards.update(card.id, {
        title: optionalString(args, 'title'),
        description: optionalString(args, 'description'),
        dueAt: due === undefined ? undefined : due === '' ? null : due,
        completed: optionalBoolean(args, 'completed'),
      })
      return `Updated "${updated.title}".`
    },
  },

  {
    name: 'move_card',
    description: 'Move a card to another column, optionally to a position (0 is the top).',
    inputSchema: schema(
      {
        ...PROJECT,
        card: field(),
        column: field('Destination column.'),
        position: { type: 'number' },
      },
      ['project', 'card', 'column'],
    ),
    async run(services, args) {
      const project = await resolveProject(services, requireString(args, 'project'))
      const card = await resolveCard(services, project.id, requireString(args, 'card'))
      const column = await resolveColumn(services, project.id, requireString(args, 'column'))
      await services.cards.move(card.id, {
        columnId: column.id,
        index: optionalNumber(args, 'position') ?? Number.MAX_SAFE_INTEGER,
      })
      return `Moved "${card.title}" to ${column.name}.`
    },
  },

  {
    name: 'delete_card',
    description: 'Delete a card. Permanent.',
    inputSchema: schema({ ...PROJECT, card: field() }, ['project', 'card']),
    async run(services, args) {
      const project = await resolveProject(services, requireString(args, 'project'))
      const card = await resolveCard(services, project.id, requireString(args, 'card'))
      await services.cards.remove(card.id)
      return `Deleted "${card.title}".`
    },
  },

  {
    name: 'add_column',
    description: "Add a column to the end of a project's board.",
    inputSchema: schema({ ...PROJECT, name: field() }, ['project', 'name']),
    async run(services, args) {
      const project = await resolveProject(services, requireString(args, 'project'))
      const column = await services.columns.create(project.id, {
        name: requireString(args, 'name'),
      })
      return `Added column "${column.name}".`
    },
  },

  {
    name: 'list_docs',
    description: "List a project's doc titles.",
    inputSchema: schema({ ...PROJECT }, ['project']),
    async run(services, args) {
      const project = await resolveProject(services, requireString(args, 'project'))
      const docs = await services.docs.listForProject(project.id)
      return docs.length ? docs.map((d) => `- ${d.title}`).join('\n') : 'No docs yet.'
    },
  },

  {
    name: 'get_doc',
    description: "Read a doc's markdown.",
    inputSchema: schema({ ...PROJECT, doc: field('Doc title.') }, ['project', 'doc']),
    async run(services, args) {
      const project = await resolveProject(services, requireString(args, 'project'))
      const doc = await resolveDoc(services, project.id, requireString(args, 'doc'))
      return `# ${doc.title}\n\n${doc.content}`
    },
  },

  {
    name: 'write_doc',
    description: 'Create a doc, or replace an existing one with the same title. Markdown.',
    inputSchema: schema(
      { ...PROJECT, title: field(), content: field() },
      ['project', 'title', 'content'],
    ),
    async run(services, args) {
      const project = await resolveProject(services, requireString(args, 'project'))
      const title = requireString(args, 'title')
      const content = optionalString(args, 'content') ?? ''

      const existing = await services.docs.listForProject(project.id)
      const match = existing.find((d) => d.title.trim().toLowerCase() === title.trim().toLowerCase())
      if (match) {
        await services.docs.update(match.id, { content })
        return `Rewrote "${match.title}".`
      }
      const doc = await services.docs.create(project.id, { title, content })
      return `Created "${doc.title}".`
    },
  },
]

export const toolsByName = new Map(tools.map((t) => [t.name, t]))
