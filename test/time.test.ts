import { describe, expect, it } from 'vitest'
import { formatRelative, parseDbTime } from '../src/shared/time'

const NOW = new Date('2026-08-12T12:00:00Z')
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString().replace('T', ' ').slice(0, 19)

describe('parseDbTime', () => {
  /**
   * The trap: SQLite's `datetime('now')` is UTC but carries no marker, so a
   * naive parse reads it as local time and every timestamp shifts by the
   * viewer's offset — "in 5 hours" for something that just happened.
   */
  it('reads an unmarked SQLite timestamp as UTC, not local', () => {
    expect(parseDbTime('2026-08-12 06:45:53')?.toISOString()).toBe('2026-08-12T06:45:53.000Z')
  })

  it('leaves an explicit ISO string alone', () => {
    expect(parseDbTime('2026-08-12T06:45:53.000Z')?.toISOString()).toBe('2026-08-12T06:45:53.000Z')
  })

  it('returns null rather than an Invalid Date', () => {
    expect(parseDbTime('')).toBeNull()
    expect(parseDbTime('not a date')).toBeNull()
  })
})

describe('formatRelative', () => {
  it('describes recent times relatively', () => {
    expect(formatRelative(ago(5_000), NOW)).toBe('just now')
    expect(formatRelative(ago(60_000), NOW)).toBe('1 minute ago')
    expect(formatRelative(ago(12 * 60_000), NOW)).toBe('12 minutes ago')
    expect(formatRelative(ago(3 * 3_600_000), NOW)).toBe('3 hours ago')
    expect(formatRelative(ago(2 * 86_400_000), NOW)).toBe('2 days ago')
  })

  it('falls back to a date once relative stops being useful', () => {
    expect(formatRelative(ago(30 * 86_400_000), NOW)).toMatch(/2026/)
  })

  it('does not say "in the future" for a small clock skew', () => {
    const slightlyAhead = new Date(NOW.getTime() + 2_000).toISOString().replace('T', ' ').slice(0, 19)
    expect(formatRelative(slightlyAhead, NOW)).toBe('just now')
  })

  it('renders nothing for an unparseable value rather than "Invalid Date"', () => {
    expect(formatRelative('nonsense', NOW)).toBe('')
  })
})
