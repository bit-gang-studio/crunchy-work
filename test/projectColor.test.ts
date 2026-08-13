import { describe, expect, it } from 'vitest'
import { projectHue } from '../src/web/lib/projectColor'

/**
 * This covers the hue only. The lightness that used to live here moved into
 * `.project-bar` / `.project-tint` in index.css when dark mode arrived — a
 * finished `hsl(h 62% 97%)` computed in JS is a light palette baked into a
 * TypeScript file, and it stayed pale in the dark. That half is now covered
 * where it can actually be judged: the dark pass of the axe gate.
 */
describe('projectHue', () => {
  it('is stable — a project keeps its colour forever', () => {
    expect(projectHue('Crunchy')).toBe(projectHue('Crunchy'))
  })

  it('ignores case and surrounding whitespace, so a rename that changes neither keeps the colour', () => {
    expect(projectHue('  crunchy ')).toBe(projectHue('Crunchy'))
  })

  it('separates names that differ only by a suffix — the case that would defeat the point', () => {
    expect(projectHue('Website')).not.toBe(projectHue('Website 2'))
  })

  it('spreads across the hue circle rather than clustering', () => {
    const names = ['Crunchy', 'Website', 'Client work', 'Admin', 'Ideas', 'Personal', 'Ops', 'Docs']
    const hues = names.map(projectHue)
    expect(new Set(hues).size).toBe(names.length)
    // With eight names over 360°, an even-ish spread should reach past a single quadrant.
    expect(Math.max(...hues) - Math.min(...hues)).toBeGreaterThan(120)
  })

  it('stays on the hue circle, so it is always a usable CSS angle', () => {
    for (const name of ['', 'a', 'A much longer project name', '🍪', '  ']) {
      const hue = projectHue(name)
      expect(Number.isInteger(hue)).toBe(true)
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(360)
    }
  })
})
