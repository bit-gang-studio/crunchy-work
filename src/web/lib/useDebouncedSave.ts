import { useCallback, useEffect, useRef } from 'react'

/**
 * Debounced autosave: no Save button, but also not a request per keystroke.
 *
 * Two properties matter beyond the delay. It flushes on unmount, so closing a
 * panel mid-edit still persists — losing the last sentence because you clicked
 * away is the kind of bug that destroys trust in autosave. And it keeps the
 * latest value in a ref rather than a closure, so a flush always writes what is
 * on screen now, not what was there when the timer was set.
 */
export function useDebouncedSave<T>(save: (value: T) => Promise<unknown> | void, delay = 500) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pending = useRef<{ value: T } | null>(null)
  const saveRef = useRef(save)
  saveRef.current = save

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    const next = pending.current
    pending.current = null
    if (next) void saveRef.current(next.value)
  }, [])

  const schedule = useCallback(
    (value: T) => {
      pending.current = { value }
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(flush, delay)
    },
    [delay, flush],
  )

  // Flush on unmount so closing mid-edit doesn't drop the last change.
  useEffect(() => () => flush(), [flush])

  return { schedule, flush }
}
