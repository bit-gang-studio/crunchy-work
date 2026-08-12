import { useEffect, useState } from 'react'

interface Health {
  ok: boolean
  createdAt: string | null
}

export function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch((e: Error) => setError(e.message))
  }, [])

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col justify-center gap-4 px-6">
      <h1 className="text-3xl font-semibold tracking-tight">Crunchy</h1>
      <p className="text-neutral-600">
        A lean kanban board and docs, on your machine, that your AI agent can drive.
      </p>
      <p className="text-sm text-neutral-500">
        {error ? `API unreachable: ${error}` : health ? `Connected — store created ${health.createdAt}` : 'Connecting…'}
      </p>
    </main>
  )
}
