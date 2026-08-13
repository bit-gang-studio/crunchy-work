import type { ProjectSummary } from '../../shared/types'

/**
 * Match projects in the switcher by name, best first.
 *
 * Same ranking rule as the editor's `/` menu — a prefix beats a match buried
 * mid-word — because both are "type a few letters, hit Enter" lists and they
 * should behave the same way. An empty query is everything, in board order,
 * which is the order the user arranged on the projects grid.
 */
export function filterProjects(projects: ProjectSummary[], query: string): ProjectSummary[] {
  const q = query.trim().toLowerCase()
  if (!q) return projects

  return projects
    .map((project) => {
      const name = project.name.toLowerCase()
      if (name.startsWith(q)) return { project, score: 0 }
      // A word inside the name counts as a prefix: "auth" should find
      // "Spike: auth" ahead of something that merely contains the letters.
      if (name.split(/\s+/).some((word) => word.startsWith(q))) return { project, score: 1 }
      if (name.includes(q)) return { project, score: 2 }
      return { project, score: -1 }
    })
    .filter((s) => s.score >= 0)
    .sort((a, b) => a.score - b.score)
    .map((s) => s.project)
}
