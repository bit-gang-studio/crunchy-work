import { describe, expect, it } from 'vitest'
import { formatDueDate, formatRelative, parseDbTime, todayISO } from '../src/shared/time'

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

describe('todayISO', () => {
  /**
   * Due dates are calendar days, so "is this overdue?" has to be asked in the
   * viewer's day, not UTC's. Using `toISOString().slice(0,10)` directly — which
   * is what this replaced — makes a card due today read "Overdue" all evening
   * for anyone west of Greenwich.
   */
  it('is the local day, not the UTC one', () => {
    const lateEvening = new Date('2026-08-12T23:30:00Z')
    const offsetMinutes = lateEvening.getTimezoneOffset()
    const expected = new Date(lateEvening.getTime() - offsetMinutes * 60_000)
      .toISOString()
      .slice(0, 10)
    expect(todayISO(lateEvening)).toBe(expected)
  })
})

describe('formatDueDate', () => {
  const NOW_LOCAL = new Date(`${todayISO(NOW)}T12:00:00`)

  it('names the days a person would name', () => {
    expect(formatDueDate(todayISO(NOW_LOCAL), NOW_LOCAL)).toBe('Today')
    expect(formatDueDate(todayISO(new Date(NOW_LOCAL.getTime() + 86_400_000)), NOW_LOCAL)).toBe(
      'Tomorrow',
    )
  })

  it('drops the year in the current year and keeps it otherwise', () => {
    const thisYear = `${todayISO(NOW_LOCAL).slice(0, 4)}-03-05`
    expect(formatDueDate(thisYear, NOW_LOCAL)).not.toMatch(/\d{4}/)
    expect(formatDueDate('2031-03-05', NOW_LOCAL)).toMatch(/2031/)
  })

  it('reads as a date, not as stored data', () => {
    // Day/month order is the viewer's locale, deliberately — so the assertion
    // has to accept either rather than pinning the runner's default. (Asserting
    // '5 Mar' passes on a machine set to en-GB and fails on en-US.)
    expect(formatDueDate('2026-03-05', new Date('2026-08-12T12:00:00'))).toMatch(
      /^(5 Mar|Mar 5)$/,
    )
  })

  it('does not slip a day for a viewer behind UTC', () => {
    // The stored value is a calendar day with no zone. Formatting it through a
    // local-midnight Date would render 4 Mar for anyone west of Greenwich, so
    // the format is pinned to UTC even though the *wording* is localised.
    expect(formatDueDate('2026-03-05', new Date('2026-08-12T12:00:00'))).toMatch(/5|05/)
  })

  it('shows an unexpected value rather than hiding it', () => {
    // The service refuses these, so one here means a row was written another
    // way — blanking it would make the bad data invisible.
    expect(formatDueDate('2026-08-20T00:00:00.000Z', NOW_LOCAL)).toBe('2026-08-20T00:00:00.000Z')
  })
})
