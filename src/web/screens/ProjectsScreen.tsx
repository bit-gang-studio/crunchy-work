import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ProjectSummary } from '../../shared/types'
import { api } from '../lib/api'
import { seedProject } from '../lib/seedProject'
import { Screen } from '../components/Screen'
import { ProjectGrid } from '../components/ProjectGrid'
import { EmptyState, ErrorState, Loading } from '../components/States'
import { useLiveUpdates } from '../lib/useLiveUpdates'
import { useDocumentTitle } from '../lib/useDocumentTitle'

/**
 * The projects screen: a grid of tiles rather than a list.
 *
 * Trello's board list works because colour makes each board recognisable at a
 * glance — you pattern-match instead of reading. Tiles buy that, and the colour
 * is derived from the name so it costs no schema and no picker.
 */
export function ProjectsScreen() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
  useDocumentTitle('Projects')
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  async function load() {
    try {
      setProjects(await api.listProjects())
      setError(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useLiveUpdates(() => void load())

  async function create(name: string) {
    const project = await api.createProject({ name })
    // Seeding must not be able to lose you the project you just made: if any of
    // it fails you get a plain empty board, which is the old behaviour.
    try {
      await seedProject(project.id, name)
    } catch {
      /* the project exists; the tutorial is a nicety */
    }
    setCreating(false)
    await load()
  }

  /** Applied optimistically — a tile that snaps back for a round trip reads as a failed drag. */
  async function reorder(projectId: string, toIndex: number) {
    setProjects((prev) => {
      if (!prev) return prev
      const from = prev.findIndex((p) => p.id === projectId)
      if (from < 0) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(toIndex, 0, moved!)
      return next
    })
    await api.moveProject(projectId, toIndex)
    await load()
  }

  return (
    <Screen scroll="document">
      <div className="mx-auto max-w-4xl px-4 py-8 md:px-6">
        {/* The count sits with the heading rather than being implied by the
            grid: it is the one fact about this screen you cannot get by
            glancing, once there are more projects than fit above the fold.
            `baseline`, not `center` — two different type sizes centred against
            each other never look aligned. */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
            {!!projects?.length && (
              <span className="text-sm tabular-nums text-ink-faint">{projects.length}</span>
            )}
          </div>
          {/*
            * The create action belongs in the header, not trailing the grid.
            * As a dashed tile it was the same size and weight as a project —
            * so the eye had to read it to discover it was not one — and it
            * pushed the grid's last row out of alignment. Up here it is always
            * in the same place whether you have one project or thirty, and the
            * grid is nothing but projects.
            *
            * It also stays put while the composer is open. Hiding it meant the
            * control you had just pressed vanished from under the cursor and
            * the header re-flowed; pressing it again re-focuses the field
            * instead, which is what pressing it again should do.
            */}
          {!!projects?.length && (
            <button
              type="button"
              onClick={() => {
                setCreating(true)
                document.querySelector<HTMLInputElement>('[data-testid="new-project-name"]')?.focus()
              }}
              className="shrink-0 rounded-control bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-hover"
            >
              New project
            </button>
          )}
        </div>

        {error && (
          <div className="mt-4">
            <ErrorState message={error} retry={() => void load()} />
          </div>
        )}
        {projects === null && !error && (
          <div className="mt-6">
            <Loading label="Loading projects" rows={3} />
          </div>
        )}

        {projects?.length === 0 && !creating && <NoProjects onStart={() => setCreating(true)} />}

        {(!!projects?.length || creating) && (
          <ProjectGrid projects={projects ?? []} onReorder={reorder}>
            {creating && <NewProjectTile onCreate={create} onCancel={() => setCreating(false)} />}
          </ProjectGrid>
        )}
      </div>
    </Screen>
  )
}

/** Creating in place, in the grid, so the new project appears where it will live. */
function NewProjectTile({
  onCreate,
  onCancel,
}: {
  onCreate: (name: string) => void | Promise<void>
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const busy = useRef(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || busy.current) return
    busy.current = true
    await onCreate(name.trim())
  }

  return (
    <form
      onSubmit={submit}
      className="flex min-h-[7.5rem] flex-col rounded-panel border border-line-strong bg-surface p-4"
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        placeholder="Project name"
        aria-label="Project name"
        data-testid="new-project-name"
        className="w-full rounded-card border border-line-strong px-3 py-2 text-sm focus:border-ink-muted focus:outline-none"
      />
      <div className="mt-auto flex gap-2 pt-3">
        <button type="submit" className="rounded-control bg-accent px-3 py-1.5 text-xs font-medium text-accent-ink">
          Create
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-control px-3 py-1.5 text-xs text-ink-muted hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}

/**
 * The highest-leverage screen in the product: where a new user lands with
 * nothing. It teaches the pitch rather than saying "no projects" — the point of
 * Crunchy is that you don't have to build the board yourself.
 */
function NoProjects({ onStart }: { onStart: () => void }) {
  return (
    <div className="mt-6">
      <EmptyState
        title="No projects yet."
        prompt="Make me a Crunchy project for this repo and add cards for the TODOs you find."
        action={
          <button
            type="button"
            onClick={onStart}
            // See DocList: `canvas` is a ground role, not a hover state, and
            // using it as one only reads correctly in the light palette.
            className="rounded-card border border-line-strong px-3 py-1.5 text-sm hover:bg-hover"
          >
            Or create one yourself
          </button>
        }
      >
        Let your agent make one. Paste this into Claude Code:
      </EmptyState>
    </div>
  )
}
