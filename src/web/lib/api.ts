import type {
  AcceptanceCriterion,
  Board,
  Card,
  Doc,
  DocSummary,
  Project,
  ProjectSummary,
  Size,
} from '../../shared/types'

/**
 * The HTTP client. Thin on purpose — the service layer holds the logic, and this
 * is the browser's way of reaching the same seam the MCP tools use.
 */

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
  })
  return handle<T>(res)
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const detail = await res
      .json()
      .then((b: { error?: string }) => b.error)
      .catch(() => null)
    throw new ApiError(detail ?? `Request failed (${res.status})`, res.status)
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T)
}

const send = (method: string, path: string, body?: unknown) =>
  request<never>(path, { method, body: body === undefined ? undefined : JSON.stringify(body) })

export const api = {
  listProjects: () => request<ProjectSummary[]>('/projects'),
  createProject: (input: { name: string; description?: string }) =>
    request<Project>('/projects', { method: 'POST', body: JSON.stringify(input) }),
  getBoard: (id: string) => request<Board>(`/projects/${id}`),
  updateProject: (id: string, patch: { name?: string; description?: string }) =>
    request<Project>(`/projects/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteProject: (id: string) => send('DELETE', `/projects/${id}`),
  moveProject: (id: string, index: number) => send('POST', `/projects/${id}/move`, { index }),

  addColumn: (projectId: string, name: string) =>
    request<unknown>(`/projects/${projectId}/columns`, { method: 'POST', body: JSON.stringify({ name }) }),
  renameColumn: (id: string, name: string) => send('PATCH', `/columns/${id}`, { name }),
  deleteColumn: (id: string) => send('DELETE', `/columns/${id}`),
  moveColumn: (id: string, index: number) => send('POST', `/columns/${id}/move`, { index }),

  addCard: (columnId: string, input: { title: string; description?: string; dueAt?: string | null }) =>
    request<Card>(`/columns/${columnId}/cards`, { method: 'POST', body: JSON.stringify(input) }),
  getCard: (id: string) => request<Card>(`/cards/${id}`),
  /**
   * `keepalive` lets a save survive the page being torn down — the browser
   * finishes the request after the document is gone. Used by the autosave's
   * pagehide flush, so a reload or a closed tab never eats the last edit.
   */
  updateCard: (
    id: string,
    patch: {
      title?: string
      description?: string
      dueAt?: string | null
      completed?: boolean
      acceptanceCriteria?: AcceptanceCriterion[]
      size?: Size | null
    },
    options?: { keepalive?: boolean },
  ) =>
    request<Card>(`/cards/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
      keepalive: options?.keepalive,
    }),
  deleteCard: (id: string) => send('DELETE', `/cards/${id}`),
  /** The drag engine resolves the exact rank for the slot the user saw, so we persist that. */
  moveCard: (id: string, to: { columnId?: string; rank?: string; index?: number }) =>
    send('POST', `/cards/${id}/move`, to),

  listDocs: (projectId: string) => request<DocSummary[]>(`/projects/${projectId}/docs`),
  getDoc: (id: string) => request<Doc>(`/docs/${id}`),
  createDoc: (projectId: string, input: { title: string; content?: string }) =>
    request<Doc>(`/projects/${projectId}/docs`, { method: 'POST', body: JSON.stringify(input) }),
  updateDoc: (id: string, patch: { title?: string; content?: string }, options?: { keepalive?: boolean }) =>
    request<Doc>(`/docs/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
      keepalive: options?.keepalive,
    }),
  moveDoc: (id: string, index: number) => send('POST', `/docs/${id}/move`, { index }),
  deleteDoc: (id: string) => send('DELETE', `/docs/${id}`),
}
