import { Link, useLocation } from 'react-router-dom'

/**
 * The project chrome: breadcrumb plus the Board / Docs switch.
 *
 * A project is exactly one board and its docs, so this is the whole navigation
 * a project needs — two tabs, no menu.
 */
export function ProjectHeader({ projectId, name }: { projectId: string; name: string }) {
  const { pathname } = useLocation()
  const onDocs = pathname.startsWith(`/projects/${projectId}/docs`)

  return (
    <div className="shrink-0 border-b border-neutral-200 bg-white px-4 md:px-6">
      <div className="flex flex-wrap items-baseline gap-2 pt-3">
        <Link to="/" className="text-xs text-neutral-500 hover:text-neutral-800">
          Projects
        </Link>
        <span className="text-xs text-neutral-300">/</span>
        <h1 className="text-sm font-semibold">{name}</h1>
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
