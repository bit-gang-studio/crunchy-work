import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { DocList } from '../components/DocList'
import { EmptyState, Loading } from '../components/States'
import { useDocumentTitle } from '../lib/useDocumentTitle'
import { useProject } from './ProjectLayout'

/**
 * A project's documents.
 *
 * The project read used to live here *and* in `BoardScreen`, both asking for the
 * same thing — `get_project` returns the board and the docs together. It is the
 * layout's now, along with the header and the live-update subscription.
 */
export function DocsScreen() {
  const navigate = useNavigate()
  const { projectId } = useParams() as { projectId: string }
  const { board, reload: load, patchBoard } = useProject()
  useDocumentTitle('Docs', board?.project.name)
  const [title, setTitle] = useState('')

  /** Optimistic, like the projects grid — a row that snaps back reads as a failed drag. */
  async function reorder(docId: string, toIndex: number) {
    patchBoard((prev) => {
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

  return (
    /*
     * Scrolls its own content rather than the page, so the scrollbar sits below
     * the header instead of beside it. As a scrolling document this screen grew
     * a page scrollbar the board did not have, and every right-aligned control
     * in the project header moved 15px left the moment you switched to Docs.
     */
    <div className="absolute inset-0 overflow-y-auto">
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
  )
}
