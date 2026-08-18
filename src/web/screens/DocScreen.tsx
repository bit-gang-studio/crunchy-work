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
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

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
      {/*
        * `max-w-2xl`, down from `max-w-3xl`.
        *
        * The old column put **87 characters** on a line at 1440 — measured, not
        * estimated. Comfortable reading is 45–75, and this is the one screen in
        * the app where line length is the whole job: a board is scanned, a
        * document is read.
        */}
      <div className="mx-auto w-full max-w-2xl px-4 py-8 md:px-6">
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
                <div className="flex items-center gap-2">
                  <span className="text-xs text-ink-faint" data-testid="save-state">
                    {saved === 'saving' ? 'Saving…' : saved === 'saved' ? 'Saved' : ''}
                  </span>
                  {/*
                    * Delete lives behind the ⋯, the way the card's does.
                    *
                    * It was a red link under the document, so the foot of every
                    * doc read as a warning — and on a page that scrolls it sat
                    * wherever the text happened to end, which for a medium
                    * document was 425px below the fold. The card modal moved
                    * this exact control for this exact reason; leaving the doc
                    * page as it was had the two surfaces disagreeing about how
                    * dangerous the same action is.
                    */}
                  <div className="relative" ref={menuRef}>
                    <button
                      type="button"
                      onClick={() => setMenuOpen((open) => !open)}
                      aria-label="Doc actions"
                      aria-expanded={menuOpen}
                      className="flex h-7 w-7 items-center justify-center rounded-control text-ink-faint hover:bg-hover hover:text-ink"
                    >
                      <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
                        <circle cx="3.5" cy="8" r="1.3" />
                        <circle cx="8" cy="8" r="1.3" />
                        <circle cx="12.5" cy="8" r="1.3" />
                      </svg>
                    </button>
                    {menuOpen && (
                      <div className="absolute right-0 z-20 mt-1 w-52 rounded-card border border-line bg-surface p-1 shadow-raised">
                        <ConfirmButton onConfirm={remove}>Delete doc</ConfirmButton>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/*
                * **One sheet, not two boxes.**
                *
                * The title sat in its own bordered box above the body's bordered
                * box, so a document read as two form fields stacked — and with
                * `min-h-[60vh]` under it, a short doc was a 558px empty panel
                * with two lines at the top, which looks like something you
                * failed to fill in rather than something you are writing.
                *
                * A document is one piece of paper. The title is set on it and
                * separated by a rule, which is what a title *is*, and the body
                * runs on below.
                *
                * The old note on the title's border is still right — a field
                * that only appears on hover is undiscoverable on touch — so the
                * rule under it is permanent and only its weight moves on focus.
                * `text-3xl` because a document's title has to outrank the `h2`s
                * inside it, and at `text-2xl` the two were both exactly 24px.
                */}
              <div className="rounded-panel border border-line bg-surface">
                <input
                  value={doc.title}
                  onChange={(e) => edit({ title: e.target.value })}
                  aria-label="Doc title"
                  className="w-full rounded-t-panel border-b border-line bg-transparent px-4 py-3 text-3xl font-semibold tracking-tight focus:border-ink-muted focus:outline-none"
                />
                <div className="px-4 py-3">
                  <Suspense fallback={<p className="text-sm text-ink-faint">Loading editor…</p>}>
                    <DocEditor
                      docId={doc.id}
                      initialMarkdown={doc.content}
                      onChange={(content) => edit({ content })}
                    />
                  </Suspense>
                </div>
              </div>
            </>
        )}
      </div>
    </div>
  )
}
