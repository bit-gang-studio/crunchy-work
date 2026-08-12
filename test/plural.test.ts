import { describe, expect, it } from 'vitest'
import { plural } from '../src/shared/plural'

describe('plural', () => {
  it('agrees with the count', () => {
    expect(plural(0, 'card')).toBe('0 cards')
    expect(plural(1, 'card')).toBe('1 card')
    expect(plural(2, 'card')).toBe('2 cards')
  })

  /**
   * The real case: a running server can be older than the assets it serves,
   * because Node loads the compiled server once at boot while static files are
   * read per request. A field the UI expects can genuinely be missing, and
   * "undefined cards" on screen is what that looked like.
   */
  it('never renders undefined when the field is missing', () => {
    expect(plural(undefined, 'card')).toBe('0 cards')
    expect(plural(null, 'card')).toBe('0 cards')
    expect(plural(NaN, 'card')).toBe('0 cards')
  })
})
