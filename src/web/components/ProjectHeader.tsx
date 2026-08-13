import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { AutoGrowTextarea } from './AutoGrowTextarea'
import { ConfirmButton } from './ConfirmButton'
import { ProjectSwitcher } from './ProjectSwitcher'
import { ThemeToggle } from './ThemeToggle'

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
  description = '',
  onChanged,
  actions,
}: {
  projectId: string
  name: string
  /**
   * One line on what this project is. The column and the projects grid have
   * always rendered it — nothing could ever *set* it, so in practice every
   * project's description was empty unless someone curled the API.
   */
  description?: string
  /** Optional: live updates will catch a rename anyway, this just makes it instant. */
  onChanged?: () => void
  /** Board-scoped controls, rendered at the trailing edge of the tabs row. */
  actions?: React.ReactNode
}) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const onDocs = pathname.startsWith(`/projects/${projectId}/docs`)

  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editingAbout, setEditingAbout] = useState(false)
  const [about, setAbout] = useState(description)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => setDraft(name), [name])
  useEffect(() => setAbout(description), [description])

  async function saveAbout() {
    setEditingAbout(false)
    const trimmed = about.trim()
    if (trimmed === description) return
    setAbout(trimmed)
    await api.updateProject(projectId, { description: trimmed })
    onChanged?.()
  }

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
    <div className="shrink-0 border-b border-line bg-surface px-4 md:px-6">
      {/*
        * `gap-1` and a separator with its own tighter margins.
        *
        * At `gap-1.5` every element in the path sat the same distance apart —
        * crumb, slash, name — so the row read as three peers rather than as
        * "this, inside that". A path wants the separator closer to both sides
        * than the items are to anything else; that difference is the only thing
        * that makes it scan as one address instead of a list.
        */}
      <div className="flex items-center gap-1 pt-3">
        {/*
          * "Projects" and its chevron are one object, not two.
          *
          * They are still a link and a button — going to the list and opening
          * the switcher are different actions, and the switcher belongs to the
          * crumb rather than to the name, because the name is already
          * click-to-rename and one control cannot mean two things. That
          * decision was right; the rendering was not. With a gap between them
          * the chevron sat orphaned mid-row, attached to nothing, at a third
          * type size — it read as a stray mark rather than as "…or jump
          * somewhere else". Joined, with no gap and one hover, they read as the
          * single control they behave as.
          *
          * The crumb is `text-sm` rather than `text-xs` too: xs against the
          * name's base was a two-step jump inside four words, which is what
          * made the line look assembled rather than designed.
          */}
        <span className="flex shrink-0 items-center rounded-control hover:bg-hover">
          <Link
            to="/"
            className="rounded-control py-0.5 pl-1.5 pr-0.5 text-sm text-ink-muted hover:text-ink"
          >
            Projects
          </Link>
          <ProjectSwitcher currentId={projectId} />
        </span>
        <span className="-mx-0.5 shrink-0 select-none text-sm text-ink-faint">/</span>

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
              className="w-full max-w-sm rounded-control border border-ink-faint px-2 py-0.5 text-base font-semibold focus:outline-none"
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
              className="w-full truncate rounded px-1 text-left text-base font-semibold tracking-tight hover:bg-hover"
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
            className="flex h-7 w-7 items-center justify-center rounded-control leading-none text-ink-faint hover:bg-hover hover:text-ink"
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="absolute right-0 z-20 mt-1 w-56 rounded-card border border-line bg-surface p-1 shadow-raised">
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setEditing(true)
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-hover"
              >
                Rename project
              </button>
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false)
                  setEditingAbout(true)
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-sm hover:bg-hover"
              >
                {description ? 'Edit description' : 'Add a description'}
              </button>
              {/* Phone only, and only because the app header — which carries
                  the toggle everywhere else — is hidden on a project screen at
                  this width. A setting you change twice a year does not earn a
                  permanent 120px of a 390px bar; it earns a row in the menu. */}
              <div className="border-b border-line px-2 pb-2 pt-1 md:hidden">
                <span className="mb-1 block text-xs text-ink-muted">Theme</span>
                <ThemeToggle />
              </div>
              <div className="px-2 py-1">
                {/* Says what goes with it: deleting a project takes its board,
                    its cards and its docs, none of which are visible from here. */}
                <ConfirmButton
                  onConfirm={remove}
                  confirmLabel="Delete the board and docs too"
                  className="w-full rounded px-0 py-0.5 text-left text-sm text-danger"
                >
                  Delete project
                </ConfirmButton>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Costs a row only when there is one to show, or you are writing it —
          an always-present empty field would tax every board with a prompt
          nobody asked for. */}
      {editingAbout ? (
        <AutoGrowTextarea
          autoFocus
          value={about}
          onChange={(e) => setAbout(e.target.value)}
          onBlur={() => void saveAbout()}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setAbout(description)
              setEditingAbout(false)
            }
          }}
          placeholder="What is this project?"
          aria-label="Project description"
          minRows={1}
          maxRows={3}
          className="mt-1 w-full max-w-2xl resize-none rounded-control border border-line-strong px-2 py-1 text-sm focus:border-ink-muted focus:outline-none"
        />
      ) : (
        /*
         * With no description there was no affordance on the page at all — the
         * only way in was "Add a description" inside the ⋯ menu, which is a
         * fine place for it to *also* live and a terrible place for it to only
         * live. It read as "you cannot describe this project", which is what it
         * was reported as.
         *
         * So the empty state is the same control, in the same slot, saying what
         * it does. Faint, because an unwritten description should not compete
         * with a written one, and it disappears the moment there is something
         * to show.
         */
        !description ? (
          <button
            type="button"
            onClick={() => setEditingAbout(true)}
            className="mt-0.5 hidden rounded px-1 text-left text-sm text-ink-faint hover:bg-hover hover:text-ink md:block"
          >
            Add a description
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setEditingAbout(true)}
            title="Edit description"
            // `w-full` is load-bearing, not decoration. A <button> shrink-to-fits
            // even at `display: block`, so without a width it sizes to its text
            // and `truncate` never engages — the description then ran past the
            // right edge and was cut mid-word by the shell's `overflow-hidden`,
            // on every project screen below ~700px. The heading button beside it
            // has always had `w-full`, which is why it truncated correctly and
            // this did not. Caught by the screenshot matrix at 390; invisible to
            // the responsive spec, which asserts the *page* does not overflow —
            // and it did not, because the shell was hiding it.
            className="mt-0.5 hidden w-full max-w-2xl truncate rounded px-1 text-left text-sm text-ink-muted hover:bg-hover hover:text-ink md:block"
          >
            {description}
          </button>
        )
      )}

      {/* `actions` rides the tabs row rather than taking a row of its own —
          board-scoped controls belong beside the thing that selects the board,
          and the phone header has no spare vertical space to give away. */}
      <div className="flex items-end justify-between gap-4">
        <nav className="-mb-px flex gap-4 pt-2" aria-label="Project sections">
          <Tab to={`/projects/${projectId}`} active={!onDocs}>
            Board
          </Tab>
          <Tab to={`/projects/${projectId}/docs`} active={onDocs}>
            Docs
          </Tab>
        </nav>
        {actions && <div className="shrink-0 pb-1.5">{actions}</div>}
      </div>
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
          ? 'border-accent font-medium text-ink'
          : 'border-transparent text-ink-muted hover:text-ink'
      }`}
    >
      {children}
    </Link>
  )
}
