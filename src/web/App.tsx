import { BrowserRouter, Link, Route, Routes, useParams } from 'react-router-dom'
import { ProjectsScreen } from './screens/ProjectsScreen'
import { BoardScreen } from './screens/BoardScreen'

/**
 * The shell is a fixed-height flex column: header as fixed chrome, and one
 * `min-h-0 flex-1` content region that every screen fills. Screens declare how
 * they use that height with `<Screen scroll="document|canvas">` — the board is a
 * canvas whose columns scroll independently, so the page itself must not scroll.
 */
export function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen flex-col overflow-hidden bg-neutral-50 text-neutral-900">
        <header className="flex shrink-0 items-center gap-3 border-b border-neutral-200 bg-white px-4 py-3 md:px-6">
          <Link to="/" className="text-sm font-semibold tracking-tight">
            Crunchy
          </Link>
        </header>
        <main className="min-h-0 flex-1">
          <Routes>
            <Route path="/" element={<ProjectsScreen />} />
            <Route path="/projects/:projectId" element={<BoardRoute />} />
            {/* A card is a route, not component state — so it deep-links and Back closes it. */}
            <Route path="/projects/:projectId/cards/:cardId" element={<BoardRoute />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}

/** The URL is the source of truth for what's open — no in-memory "current project". */
function BoardRoute() {
  const { projectId, cardId } = useParams()
  return <BoardScreen projectId={projectId!} cardId={cardId} />
}

function NotFound() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-sm text-neutral-600">
      <p>Nothing here.</p>
      <Link to="/" className="mt-2 inline-block underline">
        Back to projects
      </Link>
    </div>
  )
}
