import type { Services } from '../services/index.js'
import type { Column, Doc, Project } from '../db/schema.js'
import type { Card } from '../shared/types.js'

/**
 * Name resolution — the single most important ergonomic decision in the tool
 * surface.
 *
 * Tools take `project: "Crunchy"`, not `projectId: "8f3c…"`. A model handed
 * UUID-only tools burns two or three turns on lookups before it can act, and
 * still gets them wrong. So every reference resolves here: an exact id, or a
 * case-insensitive name.
 *
 * Both failure modes are answered with the information needed to retry rather
 * than a bare error, because the model's next turn is the only thing that
 * matters: "not found" lists what *does* exist, and "ambiguous" lists the
 * candidates with their ids so the retry can be exact.
 */
export class ResolutionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ResolutionError'
  }
}

function norm(value: string): string {
  return value.trim().toLowerCase()
}

function pick<T extends { id: string }>(
  items: T[],
  needle: string,
  label: (item: T) => string,
  kind: string,
): T {
  const wanted = norm(needle ?? '')
  if (!wanted) throw new ResolutionError(`Which ${kind}? Give a name or an id.`)

  const byId = items.find((i) => i.id === needle)
  if (byId) return byId

  const matches = items.filter((i) => norm(label(i)) === wanted)
  if (matches.length === 1) return matches[0]!

  if (matches.length > 1) {
    const list = matches.map((m) => `"${label(m)}" (id ${m.id})`).join(', ')
    throw new ResolutionError(
      `More than one ${kind} is called "${needle}": ${list}. Pass the id instead.`,
    )
  }

  const available = items.length
    ? items.map((i) => `"${label(i)}"`).join(', ')
    : '(none exist yet)'
  throw new ResolutionError(`No ${kind} called "${needle}". Available: ${available}`)
}

export async function resolveProject(services: Services, name: string): Promise<Project> {
  return pick(await services.projects.list(), name, (p) => p.name, 'project')
}

export async function resolveColumn(
  services: Services,
  projectId: string,
  name: string,
): Promise<Column> {
  return pick(await services.columns.listForProject(projectId), name, (c) => c.name, 'column')
}

/** Cards are addressed by title across the whole project — a model rarely knows the column. */
export async function resolveCard(
  services: Services,
  projectId: string,
  title: string,
): Promise<Card> {
  const board = await services.projectDetail.get(projectId)
  const all = board.columns.flatMap((c) => c.cards)
  return pick(all, title, (c) => c.title, 'card')
}

export async function resolveDoc(
  services: Services,
  projectId: string,
  title: string,
): Promise<Doc> {
  const list = await services.docs.listForProject(projectId)
  const found = pick(list, title, (d) => d.title, 'doc')
  return services.docs.get(found.id)
}
