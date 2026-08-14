import type { ProjectDetail } from '../../shared/types'

/**
 * The last read of each project, held across screen mounts.
 *
 * Board and Docs are separate screens that each fetch the project on mount, so
 * switching section unmounted one, mounted the other, and showed a loading
 * state for however long the round trip took. Locally that is about 30ms —
 * short enough that you do not read it as loading, and long enough to read as a
 * flicker: the content area emptied between the two screens every single time.
 * Painting the skeleton differently only changed the flicker's colour.
 *
 * So the screens start from whatever was last seen and revalidate behind it.
 * The fetch still runs on every mount and live updates still refresh, which
 * makes this stale-while-revalidate rather than a cache anyone has to trust:
 * the worst case is one frame of data that was correct a moment ago, which is
 * strictly better than one frame of nothing.
 *
 * A plain module-level Map, deliberately. It holds a handful of small objects
 * for the lifetime of a tab, and reaching for a cache library to avoid a
 * 30ms blank would be the wrong trade in a package that ships over `npx`.
 */
const cache = new Map<string, ProjectDetail>()

export function readCachedProject(projectId: string): ProjectDetail | null {
  return cache.get(projectId) ?? null
}

export function cacheProject(detail: ProjectDetail): void {
  cache.set(detail.project.id, detail)
}

/** After a delete, so a stale board cannot flash on the way out. */
export function forgetProject(projectId: string): void {
  cache.delete(projectId)
}
