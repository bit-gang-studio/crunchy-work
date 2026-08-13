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

/** Today, as `YYYY-MM-DD` in the viewer's own timezone — the form due dates are stored in. */
export function todayISO(now: Date = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

/**
 * A due date as a person would say it: "Today", "Tomorrow", "20 Aug".
 *
 * The stored value is a calendar day (`YYYY-MM-DD`) and printing it raw reads
 * like a debug view — the same reason `formatRelative` exists for timestamps.
 * The year only appears when it is not the current one, because on a board where
 * everything is due this year it is four characters of noise on every card.
 */
export function formatDueDate(dueAt: string, now: Date = new Date()): string {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueAt)
  // Anything else is a value the service should have rejected; show it rather
  // than hiding it, so a bad row is visible instead of silently blank.
  if (!parts) return dueAt

  const today = todayISO(now)
  if (dueAt === today) return 'Today'

  const tomorrow = todayISO(new Date(now.getTime() + DAY))
  if (dueAt === tomorrow) return 'Tomorrow'

  const year = parts[1]!
  const date = new Date(`${dueAt}T00:00:00Z`)
  const formatted = date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
  return year === today.slice(0, 4) ? formatted : `${formatted} ${year}`
}
