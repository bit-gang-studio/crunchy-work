import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import type { Project } from '../../shared/types'
import { api } from '../lib/api'
import { Screen } from '../components/Screen'

export function ProjectsScreen() {
  const [projects, setProjects] = useState<Project[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')

  async function load() {
    try {
      setProjects(await api.listProjects())
    } catch (e) {
      setError((e as Error).message)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  async function create(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    await api.createProject({ name: name.trim() })
    setName('')
    await load()
  }

  return (
    <Screen scroll="document">
      <div className="mx-auto max-w-2xl px-4 py-8 md:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>

        {error && <p className="mt-4 text-sm text-red-700">{error}</p>}

        {projects === null && !error && <p className="mt-6 text-sm text-neutral-500">Loading…</p>}

        {projects?.length === 0 && <EmptyState />}

        {!!projects?.length && (
          <ul className="mt-6 space-y-2">
            {projects.map((project) => (
              <li key={project.id}>
                <Link
                  to={`/projects/${project.id}`}
                  className="block rounded-lg border border-neutral-200 bg-white p-4 hover:border-neutral-300"
                >
                  <span className="font-medium">{project.name}</span>
                  {project.description && (
                    <span className="mt-1 block text-sm text-neutral-500">{project.description}</span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={create} className="mt-6 flex gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="New project name"
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm focus:border-neutral-500 focus:outline-none"
          />
          <button type="submit" className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white">
            Create
          </button>
        </form>
      </div>
    </Screen>
  )
}

/**
 * The highest-leverage screen in the product: where a new user lands with
 * nothing. It should teach the pitch, not just say "no projects" — so it shows
 * the exact line to paste into an agent.
 */
function EmptyState() {
  return (
    <div className="mt-6 rounded-lg border border-dashed border-neutral-300 bg-white p-6">
      <p className="text-sm font-medium">No projects yet.</p>
      <p className="mt-1 text-sm text-neutral-600">
        Create one below — or let your agent do it. Paste this into Claude Code:
      </p>
      <pre className="mt-3 overflow-x-auto rounded-md bg-neutral-900 px-3 py-2 text-xs text-neutral-100">
        Make me a Crunchy project for this repo and add cards for the TODOs you find.
      </pre>
    </div>
  )
}
