import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { ProjectSummary } from '../../shared/types'
import { api } from '../lib/api'
import { filterProjects } from '../lib/projectSearch'
import { plural } from '../../shared/plural'
import { Loading } from './States'

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
        // No hover background of its own: the crumb it sits inside owns that, so
        // the pair lights up together as one control. An SVG rather than the
        // "▾" character, which renders at a different size and baseline in every
        // font and was the reason it never sat on the line properly.
        className="flex items-center rounded-control py-1 pl-0.5 pr-1.5 text-ink-faint hover:text-ink"
      >
        <svg viewBox="0 0 12 12" className="h-4 w-4" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 4.75 6 7.75l3-3" />
        </svg>
      </button>

      {open && (
        <div
          data-testid="project-switcher"
          className="absolute left-0 z-30 mt-1 w-72 rounded-card border border-line bg-surface p-1 shadow-raised"
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
              className="mb-1 w-full rounded border border-line-strong px-2 py-1 text-sm focus:border-ink-muted focus:outline-none"
            />
          )}

          <div className="max-h-72 overflow-y-auto">
            {/*
              * A skeleton, not the word "Loading…", for the reason the screens
              * already settled: a spinner or a word says "something is
              * happening", where a shape says "and here is what will be here",
              * so nothing jumps when the rows land. The screens got this
              * treatment in the states pass and this popover was missed — which
              * mattered more than it looks, because the switcher is opened far
              * more often than any screen is cold-loaded. The screenshot matrix
              * caught it mid-fetch.
              */}
            {projects === null && <Loading label="Loading projects" rows={3} compact />}
            {projects !== null && matches.length === 0 && (
              <p className="px-2 py-1.5 text-sm text-ink-faint">No project matches that.</p>
            )}
            {matches.map((project, i) => (
              <button
                key={project.id}
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(project)}
                aria-current={project.id === currentId ? 'true' : undefined}
                className={`flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-left text-sm ${
                  i === active ? 'bg-hover' : ''
                } ${project.id === currentId ? 'font-medium' : ''}`}
              >
                <span className="min-w-0 flex-1 truncate">{project.name}</span>
                <span className="shrink-0 text-xs text-ink-faint">
                  {plural(project.cardCount, 'card')}
                </span>
              </button>
            ))}
          </div>

          <Link
            to="/"
            onClick={() => setOpen(false)}
            className="mt-1 block border-t border-line px-2 pb-1 pt-2 text-xs text-ink-muted hover:text-ink"
          >
            All projects
          </Link>
        </div>
      )}
    </div>
  )
}
