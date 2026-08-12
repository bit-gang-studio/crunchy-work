/**
 * Timestamps come out of SQLite as `datetime('now')` — `YYYY-MM-DD HH:MM:SS`,
 * in **UTC**, with nothing in the string saying so.
 *
 * That missing marker is a real trap: `new Date('2026-08-12 06:45:53')` is
 * interpreted as *local* time, so anyone east or west of UTC sees every
 * timestamp shifted by their offset — "in 5 hours" for something that just
 * happened. Parsing has to say UTC explicitly.
 */
export function parseDbTime(value: string): Date | null {
  if (!value) return null
  // Already an ISO string with a zone? Trust it. Otherwise it is our UTC format.
  const iso = /[TZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? null : date
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/**
 * "just now" / "12 minutes ago" / "3 days ago", falling back to a plain date
 * once relative stops being useful. A raw `2026-08-12 06:45:53` in a list reads
 * like a debug view, not a product.
 */
export function formatRelative(value: string, now: Date = new Date()): string {
  const date = parseDbTime(value)
  if (!date) return ''

  const elapsed = now.getTime() - date.getTime()
  // Small clock differences shouldn't produce "in 2 seconds".
  if (elapsed < MINUTE) return 'just now'
  if (elapsed < HOUR) return count(Math.floor(elapsed / MINUTE), 'minute')
  if (elapsed < DAY) return count(Math.floor(elapsed / HOUR), 'hour')
  if (elapsed < 7 * DAY) return count(Math.floor(elapsed / DAY), 'day')

  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

const count = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`
