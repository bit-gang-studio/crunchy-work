import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { Doc } from '../../shared/types'
import { api } from '../lib/api'
import { useDebouncedSave } from '../lib/useDebouncedSave'
import { ConfirmButton } from '../components/ConfirmButton'
import { ErrorState, Loading } from '../components/States'
import { useDocumentTitle } from '../lib/useDocumentTitle'
/**
 * The editor is code-split. TipTap and ProseMirror are by far the heaviest
 * dependency in the app, and most sessions never open a document — making the
 * board pay for it on every first load would be the wrong trade for a tool whose
 * pitch is that it starts instantly.
 */
const DocEditor = lazy(() => import('../components/DocEditor').then((m) => ({ default: m.DocEditor })))

/** One document. Autosaves; the markdown on disk is the source of truth. */
export function DocScreen() {
  const navigate = useNavigate()
  const { projectId, docId } = useParams() as { projectId: string; docId: string }
  const [doc, setDoc] = useState<Doc | null>(null)
  useDocumentTitle(doc?.title, 'Docs')
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
    // Only the doc: the project is the layout's, already fetched and on screen.
    api
      .getDoc(docId)
      .then((d) => {
        if (!live) return
        setDoc(d)
      })
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [docId, projectId])

  function edit(patch: { title?: string; content?: string }) {
    setDoc((d) => (d ? { ...d, ...patch } : d))
    queued.current = { ...queued.current, ...patch }
    /*
     * Say "Saving…" from the keystroke, not from the flush.
     *
     * The state only moved off 'saved' inside the debounced callback, 500ms
     * later — so for half a second after every edit the indicator claimed the
     * document was written when the change had not left the browser. That is
     * the one thing a save indicator must never do; "Saved" is a promise, and a
     * user who reads it and closes the tab is entitled to keep their work.
     * (The `pagehide` flush means they usually do — but the label was lying
     * regardless, and it is the label people act on.)
     *
     * Found by an e2e assertion that trusted the indicator, read the API inside
     * that window, and got a document one character long.
     */
    setSaved('saving')
    save.schedule(queued.current)
  }

  async function remove() {
    await api.deleteDoc(docId)
    navigate(`/projects/${projectId}/docs`)
  }

  if (error) {
    return (
      <div className="absolute inset-0 overflow-y-auto">
        <div className="mx-auto max-w-2xl px-6 py-12">
          <ErrorState
            message={error}
            backTo={`/projects/${projectId}/docs`}
            backLabel="Back to docs"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="absolute inset-0 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-8 md:px-6">
          {!doc && <Loading label="Loading document" rows={4} />}
          {doc && (
            <>
              <div className="mb-2 flex items-center justify-between gap-4">
                <Link
                  to={`/projects/${projectId}/docs`}
                  className="text-xs text-ink-muted hover:text-ink"
                >
                  ← All docs
                </Link>
                <span className="text-xs text-ink-faint" data-testid="save-state">
                  {saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved' : ''}
                </span>
              </div>

              {/* A quiet but *visible* border: a field that only reveals itself on
                  hover is undiscoverable on touch, where there is no hover. */}
              <input
                value={doc.title}
                onChange={(e) => edit({ title: e.target.value })}
                aria-label="Doc title"
                className="w-full rounded-control border border-line bg-surface px-2 py-1 text-2xl font-semibold tracking-tight hover:border-line-strong focus:border-ink-muted focus:outline-none"
              />

              <div className="mt-4 rounded-panel border border-line bg-surface px-4 py-3">
                <Suspense fallback={<p className="text-sm text-ink-faint">Loading editor…</p>}>
                  <DocEditor
                    docId={doc.id}
                    initialMarkdown={doc.content}
                    onChange={(content) => edit({ content })}
                  />
                </Suspense>
              </div>

              <div className="mt-6 border-t border-line pt-4">
                <ConfirmButton onConfirm={remove}>Delete doc</ConfirmButton>
              </div>
            </>
        )}
      </div>
    </div>
  )
}
