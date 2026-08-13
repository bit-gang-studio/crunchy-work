import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ProjectDetail } from '../../shared/types'
import { api } from '../lib/api'
import { Screen } from '../components/Screen'
import { DocList } from '../components/DocList'
import { ProjectHeader } from '../components/ProjectHeader'
import { EmptyState, ErrorState, Loading } from '../components/States'
import { useLiveUpdates } from '../lib/useLiveUpdates'

/** A project's documents. The board read already carries them, so this is one call. */
export function DocsScreen({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const [board, setBoard] = useState<ProjectDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')

  const load = useCallback(async () => {
    try {
      setBoard(await api.getProject(projectId))
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
    <Screen scroll="document">
      <div className="flex min-h-full flex-col">
        <ProjectHeader
          projectId={projectId}
          name={board?.project.name ?? '…'}
          description={board?.project.description}
          onChanged={() => void load()}
        />
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
    </Screen>
  )
}
