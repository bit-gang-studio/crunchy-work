import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useMatch,
  useParams,
} from 'react-router-dom'
import { ProjectsScreen } from './screens/ProjectsScreen'
import { BoardScreen } from './screens/BoardScreen'
import { DocsScreen } from './screens/DocsScreen'
import { DocScreen } from './screens/DocScreen'
import { ProjectLayout } from './screens/ProjectLayout'
import { ThemeToggle } from './components/ThemeToggle'

/**
 * The shell is a fixed-height flex column: header as fixed chrome, and one
 * `min-h-0 flex-1` content region that every screen fills. Screens declare how
 * they use that height with `<Screen scroll="document|canvas">` — the board is a
 * canvas whose columns scroll independently, so the page itself must not scroll.
 */
export function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  )
}

/** Inside the router, so the shell can see which route is showing. */
function Shell() {
  /*
   * A phone showed two stacked bars before any card: this one, and the project
   * header's breadcrumb + name + description + tabs. Together they spent about
   * a fifth of an 800px screen on orientation, on the surface you are meant to
   * be reading.
   *
   * So on a project screen, at phone width, this bar goes away. It is the one
   * that carries the least: the wordmark links home, and the project header's
   * "Projects" breadcrumb already does exactly that, two rows below — the app
   * was spending 48px of a phone on a duplicate. The theme toggle moves into
   * the project menu, where a setting you change twice a year belongs.
   *
   * Everywhere else — the projects list, and every screen from `md` up — it
   * stays, because there the bar is the only thing carrying the product's name.
   */
  const onProject = useMatch('/projects/*')

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-canvas text-ink">
      <header
        className={`shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-3 md:flex md:px-6 ${
          onProject ? 'hidden' : 'flex'
        }`}
      >
        {/* A mark, not just a word. The wordmark alone read as a label rather
            than as a product — and this is the shape the favicon becomes, so
            the tab and the app agree. It is the accent's one appearance in the
            chrome, which is what makes the accent legible as *the* colour. */}
        <Link to="/" className="flex items-center gap-2" aria-label="Crunchy — all projects">
          <span
            aria-hidden
            className="flex h-6 w-6 items-center justify-center rounded-card bg-accent text-[13px] font-bold leading-none text-accent-ink"
          >
            C
          </span>
          <span className="text-sm font-semibold tracking-tight">Crunchy</span>
        </Link>
        {/* Pushed to the trailing edge: the theme is app chrome, not part of
            the navigation, and it should not sit between the wordmark and
            whatever the project header adds next to it. */}
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col">
        <Routes>
          <Route path="/" element={<ProjectsScreen />} />
          {/*
            * A layout route, so the project header is rendered once and stays
            * put while you move between Board and Docs — see `ProjectLayout`.
            * It is keyed by project, because a different project is a different
            * screen rather than the same one handed new data.
            */}
          <Route path="/projects/:projectId" element={<ProjectRoute />}>
            <Route index element={<BoardScreen />} />
            {/* A card is a route, not component state — so it deep-links and Back closes it. */}
            <Route path="cards/:cardId" element={<BoardScreen />} />
            <Route path="docs" element={<DocsScreen />} />
            <Route path="docs/:docId" element={<DocScreen />} />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </div>
  )
}

/*
 * The URL is the source of truth for what's open — no in-memory "current
 * project".
 *
 * `key={projectId}` so a different project is a different mount rather than the
 * same layout handed a new prop. Without it React reuses the instance, which
 * quietly kept three things belonging to the project you just left:
 *
 * - `useRecentChanges` held the previous project's board as its baseline, so
 *   the incoming project diffed as entirely new and **every card played the
 *   amber "just changed" pulse** — a 2.2s glow announcing nothing.
 * - the previous project's cards stayed on screen under the new project's name
 *   until the fetch landed.
 * - the fade never ran, because nothing mounted.
 */
function ProjectRoute() {
  const { projectId } = useParams()
  return <ProjectLayout key={projectId} />
}

function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-sm text-ink-muted">
      <p>Nothing here.</p>
      <Link to="/" className="mt-2 inline-block underline">
        Back to projects
      </Link>
    </div>
  )
}
