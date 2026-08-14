import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ProjectDetail } from '../../shared/types'
import { api } from '../lib/api'
import { Screen } from '../components/Screen'
import { DocList } from '../components/DocList'
import { ProjectHeader } from '../components/ProjectHeader'
import { EmptyState, ErrorState, Loading } from '../components/States'
import { useLiveUpdates } from '../lib/useLiveUpdates'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { cacheProject, readCachedProject } from '../lib/projectCache'

/** A project's documents. The board read already carries them, so this is one call. */
export function DocsScreen({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  // Start from the last read of this project if there is one, so switching
  // section does not empty the screen for the length of a round trip.
  const [board, setBoard] = useState<ProjectDetail | null>(() => readCachedProject(projectId))
  useDocumentTitle('Docs', board?.project.name)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')

  const load = useCallback(async () => {
    try {
      const next = await api.getProject(projectId)
      cacheProject(next)
      setBoard(next)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  useLiveUpdates(() => void load())

  /** Optimistic, like the projects grid — a row that snaps back reads as a failed drag. */
  async function reorder(docId: string, toIndex: number) {
    setBoard((prev) => {
      if (!prev) return prev
      const from = prev.docs.findIndex((d) => d.id === docId)
      if (from < 0) return prev
      const docs = [...prev.docs]
      const [moved] = docs.splice(from, 1)
      docs.splice(toIndex, 0, moved!)
      return { ...prev, docs }
    })
    await api.moveDoc(docId, toIndex)
    await load()
  }

  async function create(e: FormEvent) {
    e.preventDefault()
    const name = title.trim()
    if (!name) return
    const doc = await api.createDoc(projectId, { title: name })
    setTitle('')
    navigate(`/projects/${projectId}/docs/${doc.id}`)
  }

  if (error) {
    return (
      <Screen scroll="document">
        <div className="mx-auto max-w-2xl px-6 py-12">
          <ErrorState message={error} retry={() => void load()} backTo="/" />
        </div>
      </Screen>
    )
  }

  return (
    /*
     * `canvas`, not `document`, so the scrollbar lives *below* the header
     * instead of beside it.
     *
     * As a scrolling document this screen grew a page scrollbar the board did
     * not have, so every right-aligned control in the project header — the
     * section switch, the ⋯ menu — moved 15px left the moment you switched to
     * Docs, and 15px back when you left. Always true; animating the section
     * indicator is what finally made it visible, as a backwards jerk at the
     * start of the slide. Scrolling the content and not the page fixes it at
     * the cause, and the header now behaves the same way on both sections.
     */
    <Screen scroll="canvas">
      <div className="flex h-full flex-col">
        <ProjectHeader
          projectId={projectId}
          name={board?.project.name ?? '…'}
          description={board?.project.description}
          onChanged={() => void load()}
        />
        {/* The scroller, and the thing that fades in on arrival. Content only,
            not the header — that is identical either side of the switch. */}
        <div className="screen-in min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6">
            {!board && <Loading label="Loading docs" rows={3} />}

          {board?.docs.length === 0 && (
            <EmptyState
              title="No docs yet."
              prompt={`Write up what we decided today as a doc on ${board.project.name}.`}
            >
              Docs are for the context that isn&apos;t a task — decisions, notes, a brief. Your agent
              can write them too:
            </EmptyState>
          )}

          {!!board?.docs.length && (
            <DocList projectId={projectId} docs={board.docs} onReorder={reorder} />
          )}

          <form onSubmit={create} className="mt-4 flex gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New doc title"
              aria-label="New doc title"
              className="flex-1 rounded-card border border-line-strong px-3 py-2 text-sm focus:border-ink-muted focus:outline-none"
            />
            <button type="submit" className="rounded-card bg-accent px-4 py-2 text-sm font-medium text-accent-ink">
              Create
            </button>
            </form>
          </div>
        </div>
      </div>
    </Screen>
  )
}
