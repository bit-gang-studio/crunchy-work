import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { ConfirmButton } from './ConfirmButton'

/**
 * The project chrome: the project's name, what you can do to it, and the
 * Board / Docs switch.
 *
 * A project is exactly one board and its docs, so this is the whole navigation
 * a project needs — two tabs, no menu tree.
 *
 * The name is the headline rather than a breadcrumb crumb. It is what the page
 * is *about*, and it used to be set in the same small grey type as the "/" next
 * to it, which made the most important label on the screen the least readable.
 *
 * Rename and delete live here because until they did they existed nowhere: the
 * REST routes had them, no front door called them, and a project created with a
 * typo was permanent. Renaming is click-to-edit in place, like a column.
 */
export function ProjectHeader({
  projectId,
  name,
  onChanged,
}: {
  projectId: string
  name: string
  /** Optional: live updates will catch a rename anyway, this just makes it instant. */
  onChanged?: () => void
}) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const onDocs = pathname.startsWith(`/projects/${projectId}/docs`)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => setDraft(name), [name])

  useEffect(() => {
    if (!menuOpen) return
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuOpen])

  async function submit(e: FormEvent) {
    e.preventDefault()
    const trimmed = draft.trim()
    setEditing(false)
    if (!trimmed) return setDraft(name)
    if (trimmed === name) return
    await api.updateProject(projectId, { name: trimmed })
    onChanged?.()
  }

  async function remove() {
    await api.deleteProject(projectId)
    navigate('/')
  }

  return (
    <div className="shrink-0 border-b border-neutral-200 bg-white px-4 md:px-6">
      <div className="flex items-center gap-2 pt-3">
        <Link to="/" className="shrink-0 text-xs text-neutral-500 hover:text-neutral-800">
          Projects
        </Link>
        <span className="shrink-0 text-xs text-neutral-300">/</span>

        {editing ? (
          <form onSubmit={submit} className="min-w-0 flex-1">
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={submit}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setDraft(name)
                  setEditing(false)
                }
              }}
              aria-label={`Rename ${name}`}
              className="w-full max-w-sm rounded-md border border-neutral-400 px-2 py-0.5 text-base font-semibold focus:outline-none"
            />
          </form>
        ) : (
          // Still a real heading: the name is what the page is about, and making
          // it click-to-rename must not cost the document its h1.
          <h1 className="min-w-0">
            <button
              type="button"
              onClick={() => setEditing(true)}
              title="Rename project"
              className="w-full truncate rounded px-1 text-left text-base font-semibold tracking-tight hover:bg-neutral-100"
            >
              {name}
            </button>
          </h1>
        )}

        <div className="relative ml-auto shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={`Project actions for ${name}`}
            aria-expanded={menuOpen}
            className="flex h-7 w-7 items-center justify-center rounded-md leading-none text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-20 mt-1 w-56 rounded-lg border border-neutral-200 bg-white p-1 shadow-lg">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setEditing(true)
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-100"
              >
                Rename project
              </button>
              <div className="px-2 py-1">
                {/* Says what goes with it: deleting a project takes its board,
                    its cards and its docs, none of which are visible from here. */}
                <ConfirmButton
                  onConfirm={remove}
                  confirmLabel="Delete the board and docs too"
                  className="w-full rounded px-0 py-0.5 text-left text-sm text-red-700"
                >
                  Delete project
                </ConfirmButton>
              </div>
            </div>
          )}
        </div>
      </div>

      <nav className="-mb-px flex gap-4 pt-2" aria-label="Project sections">
        <Tab to={`/projects/${projectId}`} active={!onDocs}>
          Board
        </Tab>
        <Tab to={`/projects/${projectId}/docs`} active={onDocs}>
          Docs
        </Tab>
      </nav>
    </div>
  )
}

function Tab({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      className={`border-b-2 pb-2 text-sm ${
        active
          ? 'border-neutral-900 font-medium text-neutral-900'
          : 'border-transparent text-neutral-500 hover:text-neutral-800'
      }`}
    >
      {children}
    </Link>
  )
}
