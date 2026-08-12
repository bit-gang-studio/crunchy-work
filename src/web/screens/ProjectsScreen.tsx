import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { ProjectSummary } from '../../shared/types'
import { api } from '../lib/api'
import { Screen } from '../components/Screen'
import { ProjectGrid } from '../components/ProjectGrid'
import { useLiveUpdates } from '../lib/useLiveUpdates'

/**
 * The projects screen: a grid of tiles rather than a list.
 *
 * Trello's board list works because colour makes each board recognisable at a
 * glance — you pattern-match instead of reading. Tiles buy that, and the colour
 * is derived from the name so it costs no schema and no picker.
 */
export function ProjectsScreen() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null)
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
    await api.createProject({ name })
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
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>

        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}
        {projects === null && !error && <p className="mt-6 text-sm text-neutral-500">Loading…</p>}

        {projects?.length === 0 && !creating && <EmptyState onStart={() => setCreating(true)} />}

        {(!!projects?.length || creating) && (
          <ProjectGrid projects={projects ?? []} onReorder={reorder}>
            {creating ? (
              <NewProjectTile onCreate={create} onCancel={() => setCreating(false)} />
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex min-h-[7.5rem] flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-neutral-300 text-sm text-neutral-500 hover:border-neutral-400 hover:text-neutral-700"
              >
                <span className="text-xl leading-none">+</span>
                New project
              </button>
            )}
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
      className="flex min-h-[7.5rem] flex-col rounded-xl border border-neutral-300 bg-white p-4"
    >
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        placeholder="Project name"
        aria-label="Project name"
        className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
      />
      <div className="mt-auto flex gap-2 pt-3">
        <button type="submit" className="rounded-md bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white">
          Create
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-xs text-neutral-500 hover:text-neutral-800"
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
function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="mt-6 rounded-xl border border-dashed border-neutral-300 bg-white p-6">
      <p className="text-sm font-medium">No projects yet.</p>
      <p className="mt-1 text-sm text-neutral-600">Let your agent make one. Paste this into Claude Code:</p>
      <pre className="mt-3 overflow-x-auto rounded-md bg-neutral-900 px-3 py-2 text-xs text-neutral-100">
        Make me a Crunchy project for this repo and add cards for the TODOs you find.
      </pre>
      <button
        type="button"
        onClick={onStart}
        className="mt-4 rounded-lg border border-neutral-300 px-3 py-1.5 text-sm hover:bg-neutral-50"
      >
        Or create one yourself
      </button>
    </div>
  )
}
