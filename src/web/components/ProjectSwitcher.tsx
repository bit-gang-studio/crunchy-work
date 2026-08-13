import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { ProjectSummary } from '../../shared/types'
import { api } from '../lib/api'
import { filterProjects } from '../lib/projectSearch'
import { plural } from '../../shared/plural'

/**
 * Jump straight to another project, from inside one.
 *
 * Without it every project-to-project move was a round trip through the
 * projects grid, which is the move you make constantly when an agent is working
 * across a couple of repos. Linear keeps a permanent sidebar for exactly this;
 * a dropdown buys the same thing without spending a column of chrome on every
 * screen forever, which matters more for a tool whose pitch is that there is
 * nothing to learn.
 *
 * It hangs off the "Projects" crumb rather than the project name, because the
 * name is already click-to-rename and one control cannot mean two things.
 *
 * The list is fetched when it opens, not held in the header: it is a handful of
 * rows, it must not be stale, and nothing else on the page needs it.
 */
export function ProjectSwitcher({ currentId }: { currentId: string }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    let live = true
    api
      .listProjects()
      .then((list) => live && setProjects(list))
      .catch(() => live && setProjects([]))
    return () => {
      live = false
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const matches = filterProjects(projects ?? [], query)
  // A filter field for three projects is clutter; for twenty it is the point.
  const searchable = (projects?.length ?? 0) > 7

  function go(project: ProjectSummary | undefined) {
    if (!project) return
    setOpen(false)
    navigate(`/projects/${project.id}`)
  }

  return (
    <div className="relative shrink-0" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Switch project"
        aria-expanded={open}
        title="Switch project"
        className="rounded px-1 text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
      >
        ▾
      </button>

      {open && (
        <div
          data-testid="project-switcher"
          className="absolute left-0 z-30 mt-1 w-72 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg"
        >
          {searchable && (
            <input
              autoFocus
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setActive(0)
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') setActive((i) => Math.min(i + 1, matches.length - 1))
                else if (e.key === 'ArrowUp') setActive((i) => Math.max(i - 1, 0))
                else if (e.key === 'Enter') go(matches[active])
                else if (e.key === 'Escape') setOpen(false)
                else return
                e.preventDefault()
              }}
              placeholder="Find a project"
              aria-label="Find a project"
              className="mb-1 w-full rounded border border-neutral-300 px-2 py-1 text-sm focus:border-neutral-500 focus:outline-none"
            />
          )}

          <div className="max-h-72 overflow-y-auto">
            {projects === null && <p className="px-2 py-1.5 text-sm text-neutral-400">Loading…</p>}
            {projects !== null && matches.length === 0 && (
              <p className="px-2 py-1.5 text-sm text-neutral-400">No project matches that.</p>
            )}
            {matches.map((project, i) => (
              <button
                key={project.id}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(project)}
                aria-current={project.id === currentId ? 'true' : undefined}
                className={`flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-left text-sm ${
                  i === active ? 'bg-neutral-100' : ''
                } ${project.id === currentId ? 'font-medium' : ''}`}
              >
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                <span className="shrink-0 text-xs text-neutral-400">
                  {plural(project.cardCount, 'card')}
                </span>
              </button>
            ))}
          </div>

          <Link
            to="/"
            onClick={() => setOpen(false)}
            className="mt-1 block border-t border-neutral-200 px-2 pb-1 pt-2 text-xs text-neutral-500 hover:text-neutral-800"
          >
            All projects
          </Link>
        </div>
      )}
    </div>
  )
}
