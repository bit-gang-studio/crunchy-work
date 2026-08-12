import { describe, expect, it } from 'vitest'
import { newId } from '../src/db/id.js'
import { initialRanks, rankAfter, rankBefore, rankBetween, rankForIndex } from '../src/shared/rank.js'

describe('ranks', () => {
  it('appends after the last key', () => {
    const first = rankAfter(null)
    const second = rankAfter(first)
    expect(second > first).toBe(true)
  })

  it('prepends before the first key', () => {
    const first = rankAfter(null)
    expect(rankBefore(first) < first).toBe(true)
  })

  it('lands strictly between two neighbours', () => {
    const [a, b] = initialRanks(2) as [string, string]
    const mid = rankBetween(a, b)
    expect(mid > a).toBe(true)
    expect(mid < b).toBe(true)
  })

  it('can subdivide repeatedly without collapsing', () => {
    const [low, top] = initialRanks(2) as [string, string]
    let high = top
    for (let i = 0; i < 50; i++) {
      const mid = rankBetween(low, high)
      expect(mid > low).toBe(true)
      expect(mid < high).toBe(true)
      high = mid
    }
    expect(low < high).toBe(true)
  })

  it('generates n ascending keys', () => {
    const keys = initialRanks(6)
    expect(keys).toHaveLength(6)
    expect([...keys].sort()).toEqual(keys)
  })

  it('sorts by code point, which is what SQLite BINARY collation does', () => {
    // The Crunchy Team bug: a case-insensitive collation put `Z…` after `a…`
    // on the server and before it on the client, so a drop computed a key
    // between two out-of-order neighbours and the generator threw.
    const top = rankBefore('a0')
    expect(top < 'a0').toBe(true)
    expect([top, 'a0'].sort()).toEqual([top, 'a0'])
  })

  describe('rankForIndex', () => {
    const ranks = initialRanks(3)

    it('places at the front', () => {
      expect(rankForIndex(ranks, 0) < ranks[0]!).toBe(true)
    })

    it('places in the middle', () => {
      const r = rankForIndex(ranks, 1)
      expect(r > ranks[0]!).toBe(true)
      expect(r < ranks[1]!).toBe(true)
    })

    it('places at the end', () => {
      expect(rankForIndex(ranks, ranks.length) > ranks.at(-1)!).toBe(true)
    })

    it('clamps an out-of-range index instead of throwing', () => {
      expect(rankForIndex(ranks, 99) > ranks.at(-1)!).toBe(true)
      expect(rankForIndex(ranks, -5) < ranks[0]!).toBe(true)
    })

    it('handles an empty list', () => {
      expect(typeof rankForIndex([], 0)).toBe('string')
    })
  })
})

describe('ids', () => {
  it('is 12 URL-safe characters', () => {
    expect(newId()).toMatch(/^[a-zA-Z0-9]{12}$/)
  })

  it('does not collide across many draws', () => {
    const seen = new Set(Array.from({ length: 5000 }, () => newId()))
    expect(seen.size).toBe(5000)
  })
})
