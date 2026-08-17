import { useCallback, useEffect, useRef, useState } from 'react'
import { Outlet, useLocation, useOutletContext, useParams } from 'react-router-dom'
import type { ProjectDetail } from '../../shared/types'
import { api } from '../lib/api'
import { ProjectHeader } from '../components/ProjectHeader'
import { ErrorState } from '../components/States'
import { useLiveUpdates } from '../lib/useLiveUpdates'
import { useRecentChanges } from '../lib/useRecentChanges'
import { countCompleted, useShowCompleted } from '../lib/completedFilter'
import { cacheProject, readCachedProject } from '../lib/projectCache'

/** Matches `.screen-veil` in index.css. The two have to agree. */
const VEIL_MS = 250

export interface ProjectContext {
  board: ProjectDetail | null
  reload: () => void
  recentlyChanged: ReadonlySet<string>
  markLocalChange: (cardId: string) => void
  showCompleted: boolean
  setDragging: (dragging: boolean) => void
  /**
   * Apply a local change before the server has confirmed it.
   *
   * The board owns the optimistic half of a drag — the engine has already
   * resolved the exact rank for the slot you saw, so the card can land there
   * immediately and reconcile afterwards. Without this a dragged card snaps
   * back to its old position for the length of a round trip, which reads as a
   * failed drag. The state lives up here now, so the setter has to come down.
   */
  patchBoard: (patch: (board: ProjectDetail) => ProjectDetail) => void
}

export function useProject(): ProjectContext {
  return useOutletContext<ProjectContext>()
}

/**
 * Everything a project screen shares, rendered once and kept.
 *
 * **The header used to belong to each screen, and that was the bug.** Board and
 * Docs each rendered their own `<ProjectHeader>`, so switching section threw one
 * away and built another — identical, in the same place, one frame later. Three
 * separate problems fell out of that, and all three were reported:
 *
 * - The section indicator could not slide, because a brand-new element has no
 *   previous position to animate from. That was worked around with a
 *   module-scope `lastSection` and a one-frame replay.
 * - Any transition wrapped around the *screen* necessarily included the header,
 *   so switching section faded out chrome that had not changed. That is the
 *   flash.
 * - Both screens fetched the same project and both subscribed to live updates,
 *   so a project was read twice and every SSE nudge refetched it twice.
 *
 * A layout route fixes all three at the cause. React Router keeps a parent
 * element mounted while its children change, so the header is now rendered once
 * per project and simply stays — and only the content below it transitions.
 *
 * The project read moves up here with it, which is where it always belonged:
 * `get_project` returns the board *and* the docs in one call, so both screens
 * were asking for the same thing.
 */
export function ProjectLayout() {
  const { projectId } = useParams()
  const id = projectId!
  const { pathname } = useLocation()

  // Seeded from the last read, so switching section does not blank the screen
  // for a round trip.
  const [board, setBoard] = useState<ProjectDetail | null>(() => readCachedProject(id))
  const [error, setError] = useState<string | null>(null)
  const [showCompleted, setShowCompleted] = useShowCompleted()

  const reload = useCallback(async () => {
    try {
      const next = await api.getProject(id)
      cacheProject(next)
      setBoard(next)
    } catch (e) {
      setError((e as Error).message)
    }
  }, [id])

  useEffect(() => {
    void reload()
  }, [reload])

  // Paused while a drag is in flight: swapping the columns mid-drag would
  // change what the drop resolves its rank against. The board sets it.
  const [dragging, setDragging] = useState(false)
  useLiveUpdates(() => void reload(), { paused: dragging })

  const [recentlyChanged, markLocalChange] = useRecentChanges(board)

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-12">
        <ErrorState message={error} retry={() => void reload()} backTo="/" />
      </div>
    )
  }

  const onDocs = pathname.includes('/docs')

  return (
    <div className="flex h-full flex-col">
      <ProjectHeader
        projectId={id}
        name={board?.project.name ?? '…'}
        description={board?.project.description}
        onChanged={() => void reload()}
        completedCount={onDocs ? 0 : countCompleted(board?.columns ?? [])}
        showCompleted={showCompleted}
        onShowCompleted={setShowCompleted}
      />
      <ContentFade transitionKey={onDocs ? 'docs' : 'board'}>
        <Outlet
          context={
            {
              board,
              reload: () => void reload(),
              recentlyChanged,
              markLocalChange,
              showCompleted,
              setDragging,
              patchBoard: (patch) => setBoard((prev) => (prev ? patch(prev) : prev)),
            } satisfies ProjectContext
          }
        />
      </ContentFade>
    </div>
  )
}

/**
 * The content region, and the only thing that transitions.
 *
 * **No second screen is mounted.** Two earlier attempts kept the outgoing tree
 * so it could be cross-faded, and both were wrong. Ghosting first — `opacity`
 * fades a layer *including* its background, so an "opaque" outgoing layer still
 * showed the incoming screen through it, and the board's columns rendered
 * straight through the doc list. Then, once that was sequenced, the cost the
 * original note warned about showed up as a stutter: a whole second board,
 * built and thrown away, on every switch.
 *
 * A veil needs neither. It is one empty div the colour of the page: opaque at
 * the moment the screen changes — so the outgoing content is covered rather
 * than seen to vanish — then lifted, revealing the incoming screen that has
 * been sitting underneath at full opacity the whole time. One element, no
 * duplicate tree, and nothing can ghost because there is only ever one screen.
 */
function ContentFade({
  transitionKey,
  children,
}: {
  transitionKey: string
  children: React.ReactNode
}) {
  const [veiling, setVeiling] = useState(false)
  const last = useRef(transitionKey)

  useEffect(() => {
    if (last.current === transitionKey) return
    last.current = transitionKey
    setVeiling(true)
    const timer = setTimeout(() => setVeiling(false), VEIL_MS)
    return () => clearTimeout(timer)
  }, [transitionKey])

  return (
    <div className="relative min-h-0 flex-1">
      {children}
      {veiling && (
        // Keyed, so a second switch inside the first restarts the animation
        // rather than inheriting a veil that is already half gone.
        <div
          key={transitionKey}
          aria-hidden
          className="screen-veil pointer-events-none absolute inset-0 bg-canvas"
        />
      )}
    </div>
  )
}
