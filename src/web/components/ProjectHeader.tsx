import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api } from '../lib/api'
import { AutoGrowTextarea } from './AutoGrowTextarea'
import { CompletedFilter } from './CompletedFilter'
import { ConfirmButton } from './ConfirmButton'
import { ProjectSwitcher } from './ProjectSwitcher'
import { ThemeToggle } from './ThemeToggle'
import { forgetProject } from '../lib/projectCache'

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
  completedCount = 0,
  showCompleted = false,
  onShowCompleted,
  animateFilterEntrance = true,
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
  /**
   * The completed filter's state, from the screen that has a board.
   *
   * These were a generic `actions?: React.ReactNode` slot, filled by
   * `BoardScreen`. That could not work: Docs passed nothing, so on Docs the
   * control did not exist to *leave*, and it vanished on the first frame of the
   * section switch. A control cannot animate out of a screen that never rendered
   * it. The header owns it now, and a screen without a board simply omits the
   * props — the header still renders the control, at zero, which is what gives
   * it something to fade.
   */
  completedCount?: number
  showCompleted?: boolean
  onShowCompleted?: (next: boolean) => void
  /** False while the board is arriving for the first time — see `ProjectLayout`. */
  animateFilterEntrance?: boolean
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
    // Or the next visit to this id would render a board that no longer exists
    // for a frame before the fetch fails.
    forgetProject(projectId)
    navigate('/')
  }

  return (
    <div className="shrink-0 border-b border-line bg-surface px-4 py-2.5 md:px-6">
      {/*
        * `gap-1` and a separator with its own tighter margins.
        *
        * At `gap-1.5` every element in the path sat the same distance apart —
        * crumb, slash, name — so the row read as three peers rather than as
        * "this, inside that". A path wants the separator closer to both sides
        * than the items are to anything else; that difference is the only thing
        * that makes it scan as one address instead of a list.
        */}
      <div className="flex min-h-8 flex-wrap items-center gap-x-1 gap-y-2">
        {/*
          * The project name *is* the switcher, and there is no crumb before it.
          *
          * It was `Projects ⌄ / Crunchy` — a quiet grey crumb and a loud
          * headline sharing one row at one type size. That is the thing no
          * amount of spacing ever fixed: a breadcrumb wants to be small and
          * recessive, a page title wants to be dominant, and every adjustment
          * that helped one hurt the other. Crunchy has no sidebar and exactly
          * one board per project, so there is no hierarchy for a crumb to
          * express — "Projects /" was 94px spent saying something the reader
          * already knew, and its only real jobs (reach the list, switch
          * project) are precisely what the panel does.
          *
          * Rename is the ⋯ menu's now, not a click on the title. The title
          * cannot be both a menu trigger and a text field, and the menu has
          * carried "Rename project" the whole time.
          */}
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
              className="w-full max-w-sm rounded-control border border-ink-faint px-2 py-0.5 text-xl font-semibold focus:outline-none"
            />
          </form>
        ) : (
          <ProjectSwitcher currentId={projectId} name={name} />
        )}

        {/*
          * Everything that acts on this screen, in one cluster at the trailing
          * edge: what is filtered out of this screen, which section you are
          * looking at, and the project's own menu.
          *
          * The tabs used to have a row to themselves, which is a third of this
          * header's height spent on a two-item switch. As a segmented control
          * they are the same object the theme toggle already is, and they sit
          * where controls sit.
          *
          * **The filter comes first, and that ordering is load-bearing.** The
          * cluster is `ml-auto`, so its right edge is pinned and its left edge
          * is the one that moves. Anything in here that changes width therefore
          * has to be the leading member: it grows into empty slack and
          * everything to its right keeps its position. Put the variable thing
          * in the middle and it shoves its neighbours instead.
          *
          * Measured, because it was wrong. With the completed filter between
          * the tabs and the menu, the tabs sat at x=1257 on an empty board and
          * x=1165 with one card ticked — and at 1257 again on Docs, which does
          * not render the filter at all. So they jumped 92px every time you
          * ticked a card *and* 92px every time you switched section. The
          * section switch was the worse of the two: it is the thing you do
          * constantly, and the header is rebuilt per screen (see `lastSection`)
          * so that jump had nothing to animate it and simply snapped.
          *
          * The rule generalises to whatever goes into `actions` next, and
          * `board.spec.ts` asserts the tabs' x rather than trusting this
          * comment — the ordering is a one-line thing to undo while tidying.
          */}
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {/* Rendered on every screen, including the ones with no board — see
              the prop docs. At zero it is a collapsed, empty wrapper. */}
          <CompletedFilter
            showing={showCompleted}
            count={completedCount}
            onChange={onShowCompleted}
            animateEntrance={animateFilterEntrance}
          />

          <SectionSwitch projectId={projectId} onDocs={onDocs} />

          <div className="relative shrink-0" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-label={`Project actions for ${name}`}
            aria-expanded={menuOpen}
            className="flex h-8 w-8 items-center justify-center rounded-control text-ink-faint hover:bg-hover hover:text-ink"
          >
            <svg viewBox="0 0 16 16" className="h-4 w-4" fill="currentColor" aria-hidden>
              <circle cx="3.5" cy="8" r="1.3" />
              <circle cx="8" cy="8" r="1.3" />
              <circle cx="12.5" cy="8" r="1.3" />
            </svg>
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
      </div>

      {/*
        * One row, one control, whether or not there is a description in it.
        *
        * The prompt used to sit on the title row instead, to the right of the
        * name, on the reasoning that an empty project should not spend a whole
        * row on a faint line saying nothing. The cost of that was a control
        * that *moved when you used it*: you clicked "Add a description" beside
        * the title, and what you wrote appeared somewhere else. Two states of
        * the same thing in two places is harder to learn than a quiet row is to
        * ignore, and it is the same rule the drag placeholder follows — what
        * you see before is where the thing lands.
        *
        * It also steadies the header. The row exists either way now, so moving
        * between a project with a description and one without no longer changes
        * the header's height and shifts the board underneath it.
        *
        * The vertical padding lives on the block above, not on the title row —
        * it used to be the row's own `py`, which meant the description hung
        * below all of it and ended 1px from the bottom border. Measured: 12px
        * of air above the description and 1px below. That asymmetry is what
        * read as broken; no type size would have fixed it.
        *
        * `px-1.5` rather than `px-1` so its left edge lands on the name's text,
        * not 2px inside it.
        */}
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
          className="mt-1.5 w-full max-w-2xl resize-none rounded-control border border-line-strong px-2 py-1 text-sm focus:border-ink-muted focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onClick={() => setEditingAbout(true)}
          title={description ? 'Edit description' : 'Add a description'}
          // `w-full` is load-bearing, not decoration. A <button> shrink-to-fits
          // even at `display: block`, so without a width it sizes to its text
          // and `truncate` never engages — the description then ran past the
          // right edge and was cut mid-word by the shell's `overflow-hidden`,
          // on every project screen below ~700px. The heading button beside it
          // has always had `w-full`, which is why it truncated correctly and
          // this did not. Caught by the screenshot matrix at 390; invisible to
          // the responsive spec, which asserts the *page* does not overflow —
          // and it did not, because the shell was hiding it.
          className={`mt-1.5 hidden w-full max-w-2xl truncate rounded px-1.5 text-left text-sm hover:bg-hover hover:text-ink md:block ${
            description ? 'text-ink-muted' : 'text-ink-faint'
          }`}
        >
          {description || 'Add a description'}
        </button>
      )}

    </div>
  )
}

/**
 * A segment, not an underlined tab.
 *
 * Underlined tabs want a row to themselves — the underline has to sit on the
 * container's bottom edge to mean anything, which is why they cost a full row
 * plus its border. Two items do not justify that. As a segmented control they
 * fit beside the title, and they are the same object the theme toggle already
 * is, so the app has one way of showing "one of these is selected".
 */
type Section = 'board' | 'docs'

/**
 * Where the indicator was before this header existed.
 *
 * Module scope, and it has to be: Board and Docs are separate screens that each
 * render their own `<ProjectHeader>`, so switching section unmounts the whole
 * header and builds a new one. Component state cannot survive that, and a CSS
 * transition on a brand-new element has nothing to animate *from* — which is
 * why the indicator snapped while the theme toggle, which lives in the app
 * shell and is never rebuilt, slid perfectly. This remembers across the gap.
 */
let lastSection: Section | null = null

/**
 * Board / Docs, with one indicator that slides between them.
 *
 * `grid-cols-2` so the two segments are equal — "Board" and "Docs" are 57px and
 * 50px of text, so left to size themselves the thing being moved would have to
 * change width mid-slide.
 *
 * This was built on view transitions first, letting the browser morph a named
 * element between two positions. It animated on every browser I could drive and
 * on none that anyone was actually looking at, so it is plain CSS now: render
 * where the indicator *was* for one frame, then move it, and the transition has
 * a start and an end like any other.
 */
function SectionSwitch({ projectId, onDocs }: { projectId: string; onDocs: boolean }) {
  const target: Section = onDocs ? 'docs' : 'board'
  const [from, setFrom] = useState<Section | null>(() =>
    lastSection && lastSection !== target ? lastSection : null,
  )

  useEffect(() => {
    lastSection = target
    if (!from) return
    // Next frame, not this one: the browser has to paint the old position once
    // for there to be anything to transition away from.
    const frame = requestAnimationFrame(() => setFrom(null))
    return () => cancelAnimationFrame(frame)
  }, [target, from])

  // Where it is drawn, which lags where it belongs by exactly one frame.
  const at = from ?? target

  return (
    <nav
      className="relative grid shrink-0 grid-cols-2 gap-0.5 rounded-control bg-sunken p-0.5"
      aria-label="Project sections"
    >
      {/*
        * One object that moves, rather than two taking turns being lit. The
        * width is a segment: the rail's 2px padding on both sides plus the 2px
        * gap leaves `calc(50% - 3px)` each, and moving by its own width plus
        * the gap lands it exactly on the other one.
        */}
      <span
        aria-hidden
        className={`absolute inset-y-0.5 left-0.5 w-[calc(50%-3px)] rounded-control bg-surface shadow-card transition-transform duration-[250ms] ease-out motion-reduce:transition-none ${
          at === 'docs' ? 'translate-x-[calc(100%+2px)]' : 'translate-x-0'
        }`}
      />
      {/* `aria-current` follows the real route, never the animation — the
          indicator may be a frame behind, and a screen reader must not be. */}
      <Tab to={`/projects/${projectId}`} active={!onDocs}>
        Board
      </Tab>
      <Tab to={`/projects/${projectId}/docs`} active={onDocs}>
        Docs
      </Tab>
    </nav>
  )
}

/** A segment, not an underlined tab. */
function Tab({ to, active, children }: { to: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      aria-current={active ? 'page' : undefined}
      /*
       * No background and no weight change of its own.
       *
       * The background belongs to the indicator behind it — two things drawing
       * the selection would fight during the slide. The weight had to go for a
       * duller reason: `font-medium` on whichever tab was active made that
       * segment's text wider, so the rail itself changed size when you switched,
       * and the indicator's travel did not match the gap between the tabs. It
       * measured 60.4px of slide against a 59.4px pitch.
       */
      className={`relative z-10 rounded-control px-2.5 py-1 text-center text-sm transition-colors ${
        active ? 'text-ink' : 'text-ink-muted hover:text-ink'
      }`}
    >
      {children}
    </Link>
  )
}
