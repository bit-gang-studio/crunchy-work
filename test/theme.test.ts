import { describe, expect, it } from 'vitest'
import { parseChoice, resolveTheme } from '../src/web/lib/theme'

/**
 * The pure half of dark mode. The browser half — that the attribute lands before
 * first paint and survives a reload — is `e2e/theme.spec.ts`, because neither
 * fact is observable from here.
 */
describe('parseChoice', () => {
  it('accepts the three real choices', () => {
    expect(parseChoice('light')).toBe('light')
    expect(parseChoice('dark')).toBe('dark')
    expect(parseChoice('system')).toBe('system')
  })

  /*
   * localStorage is user-writable and survives upgrades, so this reads whatever
   * a previous version wrote, whatever a user typed into a console, and `null`
   * on a first run. Falling back to "system" means a junk value behaves like no
   * value rather than like a broken theme.
   */
  it('treats anything else as system, including nothing', () => {
    expect(parseChoice(null)).toBe('system')
    expect(parseChoice(undefined)).toBe('system')
    expect(parseChoice('')).toBe('system')
    expect(parseChoice('Dark')).toBe('system')
    expect(parseChoice('midnight')).toBe('system')
    expect(parseChoice(0)).toBe('system')
    expect(parseChoice({ theme: 'dark' })).toBe('system')
  })
})

describe('resolveTheme', () => {
  it('follows the system only when the choice is system', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })

  /* The point of an explicit choice: a dark OS does not override it. */
  it('ignores the system when the choice is explicit', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})
