import { BrowserRouter, Link, Route, Routes, useParams } from 'react-router-dom'
import { ProjectsScreen } from './screens/ProjectsScreen'
import { BoardScreen } from './screens/BoardScreen'
import { DocsScreen } from './screens/DocsScreen'
import { DocScreen } from './screens/DocScreen'

/**
 * The shell is a fixed-height flex column: header as fixed chrome, and one
 * `min-h-0 flex-1` content region that every screen fills. Screens declare how
 * they use that height with `<Screen scroll="document|canvas">` — the board is a
 * canvas whose columns scroll independently, so the page itself must not scroll.
 */
export function App() {
  return (
    <BrowserRouter>
      <div className="flex h-screen flex-col overflow-hidden bg-canvas text-ink">
        <header className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-4 py-3 md:px-6">
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
            <Route path="/projects/:projectId/docs" element={<DocsRoute />} />
            <Route path="/projects/:projectId/docs/:docId" element={<DocRoute />} />
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

function DocsRoute() {
  const { projectId } = useParams()
  return <DocsScreen projectId={projectId!} />
}

function DocRoute() {
  const { projectId, docId } = useParams()
  return <DocScreen projectId={projectId!} docId={docId!} />
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
