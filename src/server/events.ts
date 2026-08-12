import { watch, type FSWatcher } from 'node:fs'

/**
 * "Something changed" — the signal behind live updates.
 *
 * It is driven by **watching the database files**, not by emitting from the
 * service layer, and that is the important decision. The agent that makes a
 * board interesting is usually talking to `crunchy mcp`, which is a *separate
 * process* writing straight to the same SQLite file. An in-process event bus
 * would never see those writes, so the one demo the product is built around —
 * watching cards appear while your agent works — would be exactly the case that
 * did not work.
 *
 * Watching the file catches every writer: this server, a stdio MCP session,
 * another instance, a person poking the database by hand. It also means the
 * service layer needs no knowledge of any of this.
 *
 * The payload is deliberately just a nudge, never the changed rows. Clients
 * refetch, so a client can never drift from the server's state — and the board
 * read is three queries, so refetching is cheaper than the bookkeeping that
 * fine-grained events would need.
 */
export interface ChangeStream {
  subscribe(listener: () => void): () => void
  close(): void
}

/** WAL mode writes land in `-wal`; a checkpoint touches the main file. Watch the directory. */
export function watchForChanges(dataDir: string, coalesceMs = 80): ChangeStream {
  const listeners = new Set<() => void>()
  let timer: ReturnType<typeof setTimeout> | null = null
  let watcher: FSWatcher | null = null

  const fire = () => {
    // A single write produces several filesystem events (wal, shm, main file).
    // Coalescing turns a burst into one refetch instead of three.
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      for (const listener of listeners) listener()
    }, coalesceMs)
  }

  try {
    watcher = watch(dataDir, (_event, filename) => {
      if (!filename || filename.toString().startsWith('crunchy.db')) fire()
    })
    // A watcher must never take the server down — losing live updates is a
    // degraded experience, not a failure.
    watcher.on('error', () => {})
  } catch {
    watcher = null
  }

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    close() {
      if (timer) clearTimeout(timer)
      watcher?.close()
      listeners.clear()
    },
  }
}
