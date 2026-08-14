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
 * **The project name is the trigger, and it is also the page's `h1`.** It hung
 * off a "Projects" crumb until now, on the reasoning that the name was already
 * click-to-rename and one control cannot mean two things. Both halves of that
 * turned out to be the problem rather than the solution: a breadcrumb wants to
 * be small and quiet while a page title wants to be large and loud, and asking
 * one row to be both is why no amount of adjusting the spacing ever settled it.
 * Crunchy has no sidebar and exactly one board per project, so there is no
 * hierarchy for a crumb to express — "Projects /" was 94px spent on a word the
 * reader already knew. Rename moves to the ⋯ menu, which always carried a copy.
 *
 * Going to the grid is the "All projects" row at the foot of the panel. That
 * row is load-bearing now, not a convenience: on a phone the app header is
 * hidden, so it is the only way back.
 *
 * The list is fetched when it opens, not held in the header: it is a handful of
 * rows, it must not be stale, and nothing else on the page needs it.
 */
export function ProjectSwitcher({ currentId, name }: { currentId: string; name: string }) {
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
    // `-ml-1` so the pill's *ink* lands on x=30 with the description below it,
    // while its background bleeds 4px into the gutter. The alignment you can
    // see is the text, not the box edge.
    //
    // The `<h1>` is inside this wrapper rather than around it, because a heading
    // takes phrasing content and this needs a positioned box for the panel to
    // anchor to. Making the title a button must not cost the document its
    // heading, which is the one thing every screen-reader user navigates by.
    <div className="relative -ml-1 min-w-0" ref={wrapRef}>
      <h1 className="min-w-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Switch project"
        // No `aria-label`: the accessible name is the project's own name. Naming
        // it "Switch project" over a button that reads "Crunchy" is exactly the
        // label-in-name mismatch that leaves voice control with nothing sayable.
        //
        // The chevron box is the size of the mark, near enough, and that is the
        // point. It used to be `h-4 w-4` around a path spanning 6 of 12 units,
        // so it drew 8px wide inside a 16px box — 4px of invisible padding on
        // each side, on top of whatever the CSS asked for. The gaps either side
        // measured 8px and 12px while the CSS said 4px and 8px, which is why no
        // amount of adjusting the padding ever tightened it.
        className="group flex w-full min-w-0 items-center rounded-control bg-hover py-1 pl-2.5 pr-2 text-left text-lg font-semibold leading-6 tracking-tight text-ink hover:bg-hover-strong"
      >
        <span className="truncate">{name}</span>
        {/* Stroke renders at its nominal width now the box is 1:1 with the
            viewBox. At `h-4` it was scaled by 16/12 and drew at 2.13px —
            heavier than the stems of the 20px text beside it, so the mark read
            as fat as well as adrift.

            The path sits 2 units low in its box rather than centred, because
            centring it in the *line* is what made it look high. Measured
            against the word it belongs to: the baseline is at 87, caps run
            73–87 and the x-height band 77–87, so those bands centre on 80 and
            82 — and a mark centred on the 28px line box lands on 79, above
            both. At 81 it sits between them.

            `shrink-0` so a long project name truncates instead of squeezing the
            chevron out of the control that needs it. */}
        <svg viewBox="0 0 12 12" className="ml-1.5 h-3 w-3 shrink-0 text-ink-faint group-hover:text-ink" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 6 6 10l4-4" />
        </svg>
      </button>
      </h1>

      {open && (
        <div
          data-testid="project-switcher"
          className="absolute left-0 top-full z-30 mt-1 w-72 rounded-card border border-line bg-surface p-1 shadow-raised"
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
