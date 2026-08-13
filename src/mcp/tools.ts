import type { Services } from '../services/index.js'
import { SIZES, type Size } from '../shared/types.js'
import { ValidationError } from '../services/errors.js'
import {
  optionalBoolean,
  optionalCriteria,
  optionalNumber,
  optionalString,
  optionalStringArray,
  requireString,
  type Args,
} from './args.js'

/** An empty string clears the size, which is how a model asks to unset one. */
function optionalSize(args: Args): Size | null {
  const value = optionalString(args, 'size')
  if (value === undefined) return null
  if (value === '') return null
  const upper = value.toUpperCase() as Size
  if (!SIZES.includes(upper)) throw new ValidationError(`size must be one of ${SIZES.join(', ')}`)
  return upper
}
import { renderProject, renderCard, renderProjects } from './format.js'
import { resolveCard, resolveColumn, resolveDoc, resolveProject } from './resolve.js'

/**
 * The tool surface — this is the product.
 *
 * Two rules hold it together, both measured rather than assumed on Crunchy Team:
 *
 * 1. **Keep it small.** Every tool taxes every other tool's accuracy. The
 *    ceiling was twelve; it is now **eighteen**, raised deliberately to give
 *    every entity full CRUD. The old surface let an agent create a column but
 *    never rename, reorder or remove one, and create a doc but never delete
 *    one — so an agent could make a mess it had no way to clean up, and the
 *    only fix was a human opening the browser. That is a worse failure than a
 *    slightly larger surface.
 *
 *    The rule that replaces the number: **reorder folds into update**, it never
 *    gets its own tool. `update_project`, `update_column` and `update_doc` all
 *    take an optional `position`, the way `move_card` already did. One-verb-
 *    per-tool would have been twenty-one.
 *
 * 2. **Keep descriptions terse.** Verbose tool text took a model from 0/7 to
 *    4/7 failures on an *unrelated* task. One line each, and argument
 *    descriptions only where the format isn't self-evident. This matters more
 *    now than it did at twelve.
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

/** Shared by add_card and update_card so the two can't describe them differently. */
const CARD_EXTRAS = {
  size: { type: 'string', enum: [...SIZES], description: 'Rough effort.' },
  criteria: {
    type: 'array',
    items: {
      type: 'object',
      properties: { text: { type: 'string' }, done: { type: 'boolean' } },
      required: ['text'],
    },
    description: '"Done when" checklist. Send the whole list; it replaces the previous one.',
  },
}

export const tools: Tool[] = [
  {
    name: 'list_projects',
    description: 'List all projects with their card and doc counts.',
    inputSchema: schema({}),
    async run(services) {
      return renderProjects(await services.projects.listWithCounts())
    },
  },

  {
    name: 'get_project',
    description: "Read a project's whole board — every column, its cards, and the doc titles.",
    inputSchema: schema({ ...PROJECT }, ['project']),
    async run(services, args) {
      const project = await resolveProject(services, requireString(args, 'project'))
      return renderProject(await services.projectDetail.get(project.id))
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
      return renderProject(await services.projectDetail.get(project.id))
    },
  },

  {
    name: 'update_project',
    description: "Rename a project, change its description, or move it in the projects list.",
    inputSchema: schema(
      {
        ...PROJECT,
        name: field('New name.'),
        description: field(),
        position: { type: 'number', description: 'New place in the list; 0 is first.' },
      },
      ['project'],
    ),
    async run(services, args) {
      const project = await resolveProject(services, requireString(args, 'project'))
      const position = optionalNumber(args, 'position')
      const updated = await services.projects.update(project.id, {
        name: optionalString(args, 'name'),
        description: optionalString(args, 'description'),
      })
      if (position !== undefined) await services.projects.move(project.id, position)
      return `Updated "${updated.name}".`
    },
  },

  {
    name: 'delete_project',
    description: 'Delete a project and everything in it — columns, cards and docs. Permanent.',
    inputSchema: schema({ ...PROJECT }, ['project']),
    async run(services, args) {
      const project = await resolveProject(services, requireString(args, 'project'))
      await services.projects.remove(project.id)
      return `Deleted "${project.name}" and everything in it.`
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
        ...CARD_EXTRAS,
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
        acceptanceCriteria: optionalCriteria(args, 'criteria'),
        size: optionalSize(args),
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
        ...CARD_EXTRAS,
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
        acceptanceCriteria: optionalCriteria(args, 'criteria'),
        size: args.size === undefined ? undefined : optionalSize(args),
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
    name: 'update_column',
    description: 'Rename a column, or move it along the board.',
    inputSchema: schema(
      {
        ...PROJECT,
        column: field(),
        name: field('New name.'),
        position: { type: 'number', description: 'New place on the board; 0 is leftmost.' },
      },
      ['project', 'column'],
    ),
    async run(services, args) {
      const project = await resolveProject(services, requireString(args, 'project'))
      const column = await resolveColumn(services, project.id, requireString(args, 'column'))
      const name = optionalString(args, 'name')
      const position = optionalNumber(args, 'position')
      if (name !== undefined) await services.columns.rename(column.id, name)
      if (position !== undefined) await services.columns.move(column.id, position)
      return `Updated column "${name ?? column.name}".`
    },
  },

  {
    name: 'delete_column',
    description: 'Delete a column and every card in it. Permanent.',
    inputSchema: schema({ ...PROJECT, column: field() }, ['project', 'column']),
    async run(services, args) {
      const project = await resolveProject(services, requireString(args, 'project'))
      const column = await resolveColumn(services, project.id, requireString(args, 'column'))
      const count = (await services.cards.listForColumn(column.id)).length
      await services.columns.remove(column.id)
      return count
        ? `Deleted column "${column.name}" and its ${count} card${count === 1 ? '' : 's'}.`
        : `Deleted column "${column.name}".`
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

  {
    /*
     * `write_doc` addresses a doc by title and replaces its content, which means
     * it can never *rename* one — asking it to would quietly create a second
     * doc. That is what this exists for.
     */
    name: 'update_doc',
    description: "Rename a doc, or move it in the project's doc list.",
    inputSchema: schema(
      {
        ...PROJECT,
        doc: field('Current doc title.'),
        title: field('New title.'),
        position: { type: 'number', description: 'New place in the list; 0 is first.' },
      },
      ['project', 'doc'],
    ),
    async run(services, args) {
      const project = await resolveProject(services, requireString(args, 'project'))
      const doc = await resolveDoc(services, project.id, requireString(args, 'doc'))
      const title = optionalString(args, 'title')
      const position = optionalNumber(args, 'position')
      if (title !== undefined) await services.docs.update(doc.id, { title })
      if (position !== undefined) await services.docs.move(doc.id, position)
      return `Updated "${title ?? doc.title}".`
    },
  },

  {
    name: 'delete_doc',
    description: 'Delete a doc. Permanent.',
    inputSchema: schema({ ...PROJECT, doc: field() }, ['project', 'doc']),
    async run(services, args) {
      const project = await resolveProject(services, requireString(args, 'project'))
      const doc = await resolveDoc(services, project.id, requireString(args, 'doc'))
      await services.docs.remove(doc.id)
      return `Deleted "${doc.title}".`
    },
  },
]

export const toolsByName = new Map(tools.map((t) => [t.name, t]))
