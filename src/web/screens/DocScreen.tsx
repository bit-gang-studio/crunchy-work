import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Doc } from '../../shared/types'
import { api } from '../lib/api'
import { useDebouncedSave } from '../lib/useDebouncedSave'
import { Screen } from '../components/Screen'
import { ProjectHeader } from '../components/ProjectHeader'
import { ConfirmButton } from '../components/ConfirmButton'
/**
 * The editor is code-split. TipTap and ProseMirror are by far the heaviest
 * dependency in the app, and most sessions never open a document — making the
 * board pay for it on every first load would be the wrong trade for a tool whose
 * pitch is that it starts instantly.
 */
const DocEditor = lazy(() => import('../components/DocEditor').then((m) => ({ default: m.DocEditor })))

/** One document. Autosaves; the markdown on disk is the source of truth. */
export function DocScreen({ projectId, docId }: { projectId: string; docId: string }) {
  const navigate = useNavigate()
  const [doc, setDoc] = useState<Doc | null>(null)
  const [project, setProject] = useState<{ name: string; description: string } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<'idle' | 'saving' | 'saved'>('idle')

  const queued = useRef<{ title?: string; content?: string }>({})
  const save = useDebouncedSave<{ title?: string; content?: string }>(async (patch, options) => {
    queued.current = {}
    setSaved('saving')
    await api.updateDoc(docId, patch, { keepalive: options?.unloading })
    setSaved('saved')
  })

  useEffect(() => {
    let live = true
    Promise.all([api.getDoc(docId), api.getProject(projectId)])
      .then(([d, board]) => {
        if (!live) return
        setDoc(d)
        setProject(board.project)
      })
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [docId, projectId])

  function edit(patch: { title?: string; content?: string }) {
    setDoc((d) => (d ? { ...d, ...patch } : d))
    queued.current = { ...queued.current, ...patch }
    save.schedule(queued.current)
  }

  async function remove() {
    await api.deleteDoc(docId)
    navigate(`/projects/${projectId}/docs`)
  }

  if (error) {
    return (
      <Screen scroll="document">
        <div className="mx-auto max-w-2xl px-6 py-12 text-sm">
          <p className="text-red-700">{error}</p>
          <Link to={`/projects/${projectId}/docs`} className="mt-2 inline-block underline">
            Back to docs
          </Link>
        </div>
      </Screen>
    )
  }

  return (
    <Screen scroll="document">
      <div className="flex min-h-full flex-col">
        <ProjectHeader
          projectId={projectId}
          name={project?.name ?? '…'}
          description={project?.description}
        />
        <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6">
          {!doc && <p className="text-sm text-neutral-500">Loading…</p>}
          {doc && (
            <>
              <div className="mb-2 flex items-center justify-between gap-4">
                <Link
                  to={`/projects/${projectId}/docs`}
                  className="text-xs text-neutral-500 hover:text-neutral-800"
                >
                  ← All docs
                </Link>
                <span className="text-xs text-neutral-400" data-testid="save-state">
                  {saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved' : ''}
                </span>
              </div>

              {/* A quiet but *visible* border: a field that only reveals itself on
                  hover is undiscoverable on touch, where there is no hover. */}
              <input
                value={doc.title}
                onChange={(e) => edit({ title: e.target.value })}
                aria-label="Doc title"
                className="w-full rounded-md border border-neutral-200 bg-white px-2 py-1 text-2xl font-semibold tracking-tight hover:border-neutral-300 focus:border-neutral-500 focus:outline-none"
              />

              <div className="mt-4 rounded-xl border border-neutral-200 bg-white px-4 py-3">
                <Suspense fallback={<p className="text-sm text-neutral-400">Loading editor…</p>}>
                  <DocEditor
                    docId={doc.id}
                    initialMarkdown={doc.content}
                    onChange={(content) => edit({ content })}
                  />
                </Suspense>
              </div>

              <div className="mt-6 border-t border-neutral-200 pt-4">
                <ConfirmButton onConfirm={remove}>Delete doc</ConfirmButton>
              </div>
            </>
          )}
        </div>
      </div>
    </Screen>
  )
}
