import { useEffect, useRef } from 'react'

/**
 * Subscribe to server-sent change events and refetch.
 *
 * This is what makes the product look like what it claims to be: you watch cards
 * appear while your agent works, without touching anything. It is a v1
 * requirement rather than polish — it is the demo.
 *
 * `EventSource` reconnects on its own, so a dropped connection heals without any
 * retry logic here.
 */
export function useLiveUpdates(onChange: () => void, { paused = false }: { paused?: boolean } = {}) {
  // The callback is read through a ref so re-renders never tear down the stream.
  const handler = useRef(onChange)
  handler.current = onChange

  // Likewise the pause flag: a drag starting must not reopen the connection.
  const isPaused = useRef(paused)
  isPaused.current = paused

  // Changes that arrived while paused are applied once it lifts, so nothing is lost.
  const missed = useRef(false)

  useEffect(() => {
    if (!paused && missed.current) {
      missed.current = false
      handler.current()
    }
  }, [paused])

  useEffect(() => {
    const source = new EventSource('/api/events')
    source.addEventListener('change', () => {
      if (isPaused.current) missed.current = true
      else handler.current()
    })
    return () => source.close()
  }, [])
}
