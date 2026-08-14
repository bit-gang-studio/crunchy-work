import { describe, expect, it } from 'vitest'
import { parseChoice, resolveTheme, shouldAnimateShift } from '../src/web/lib/theme'

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

/**
 * Whether a theme apply is a *change* the user should see move, or a restatement
 * of what is already on screen. Only the first earns a cross-fade.
 */
describe('shouldAnimateShift', () => {
  it('animates a real change, in both directions', () => {
    expect(shouldAnimateShift('light', 'dark')).toBe(true)
    expect(shouldAnimateShift('dark', 'light')).toBe(true)
  })

  /*
   * `useTheme` re-applies on every `prefers-color-scheme` event even when the
   * choice is explicit, and it applies once on mount agreeing with what the
   * inline script already stamped. Neither is a change, and fading on either
   * would mean the app arrives in the wrong palette on ordinary loads.
   */
  it('stays still when nothing changed', () => {
    expect(shouldAnimateShift('dark', 'dark')).toBe(false)
    expect(shouldAnimateShift('light', 'light')).toBe(false)
  })

  /*
   * No previous value means the inline script did not run — storage blocked, or
   * the attribute stripped. There is no palette to fade *from*, so the honest
   * thing is to land on the right one immediately.
   */
  it('stays still when there was no theme to come from', () => {
    expect(shouldAnimateShift(undefined, 'dark')).toBe(false)
    expect(shouldAnimateShift('', 'dark')).toBe(false)
    expect(shouldAnimateShift('midnight', 'dark')).toBe(false)
  })
})
