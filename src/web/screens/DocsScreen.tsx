import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Board } from '../../shared/types'
import { api } from '../lib/api'
import { Screen } from '../components/Screen'
import { ProjectHeader } from '../components/ProjectHeader'
import { useLiveUpdates } from '../lib/useLiveUpdates'

/** A project's documents. The board read already carries them, so this is one call. */
export function DocsScreen({ projectId }: { projectId: string }) {
  const navigate = useNavigate()
  const [board, setBoard] = useState<Board | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState('')

  const load = useCallback(async () => {
    try {
      setBoard(await api.getBoard(projectId))
    } catch (e) {
      setError((e as Error).message)
    }
  }, [projectId])

  useEffect(() => {
    void load()
  }, [load])

  useLiveUpdates(() => void load())

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
        <div className="mx-auto max-w-2xl px-6 py-12 text-sm">
          <p className="text-red-700">{error}</p>
          <Link to="/" className="mt-2 inline-block underline">
            Back to projects
          </Link>
        </div>
      </Screen>
    )
  }

  return (
    <Screen scroll="document">
      <div className="flex min-h-full flex-col">
        <ProjectHeader projectId={projectId} name={board?.project.name ?? '…'} />
        <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6">
          {!board && <p className="text-sm text-neutral-500">Loading…</p>}

          {board?.docs.length === 0 && (
            <div className="rounded-xl border border-dashed border-neutral-300 bg-white p-6">
              <p className="text-sm font-medium">No docs yet.</p>
              <p className="mt-1 text-sm text-neutral-600">
                Docs are for the context that isn&apos;t a task — decisions, notes, a brief. Your
                agent can write them too:
              </p>
              <pre className="mt-3 overflow-x-auto rounded-md bg-neutral-900 px-3 py-2 text-xs text-neutral-100">
                Write up what we decided today as a doc on {board.project.name}.
              </pre>
            </div>
          )}

          {!!board?.docs.length && (
            <ul className="divide-y divide-neutral-200 overflow-hidden rounded-xl border border-neutral-200 bg-white">
              {board.docs.map((doc) => (
                <li key={doc.id}>
                  <Link
                    to={`/projects/${projectId}/docs/${doc.id}`}
                    data-testid="doc-row"
                    className="flex items-baseline justify-between gap-4 px-4 py-3 hover:bg-neutral-50"
                  >
                    <span className="font-medium">{doc.title}</span>
                    <span className="shrink-0 text-xs text-neutral-500">{doc.updatedAt}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <form onSubmit={create} className="mt-4 flex gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New doc title"
              aria-label="New doc title"
              className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
            />
            <button type="submit" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
              Create
            </button>
          </form>
        </div>
      </div>
    </Screen>
  )
}
