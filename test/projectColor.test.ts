import { describe, expect, it } from 'vitest'
import { projectColor } from '../src/web/lib/projectColor'

describe('projectColor', () => {
  it('is stable — a project keeps its colour forever', () => {
    expect(projectColor('Crunchy')).toEqual(projectColor('Crunchy'))
  })

  it('ignores case and surrounding whitespace, so a rename that changes neither keeps the colour', () => {
    expect(projectColor('  crunchy ')).toEqual(projectColor('Crunchy'))
  })

  it('separates names that differ only by a suffix — the case that would defeat the point', () => {
    expect(projectColor('Website').bar).not.toBe(projectColor('Website 2').bar)
  })

  it('spreads across the hue circle rather than clustering', () => {
    const names = ['Crunchy', 'Website', 'Client work', 'Admin', 'Ideas', 'Personal', 'Ops', 'Docs']
    const hues = names.map((n) => Number(/hsl\((\d+)/.exec(projectColor(n).bar)![1]))
    expect(new Set(hues).size).toBe(names.length)
    // With eight names over 360°, an even-ish spread should reach past a single quadrant.
    expect(Math.max(...hues) - Math.min(...hues)).toBeGreaterThan(120)
  })

  it('emits valid CSS colours', () => {
    const { bar, tint } = projectColor('Crunchy')
    expect(bar).toMatch(/^hsl\(\d{1,3} \d{1,3}% \d{1,3}%\)$/)
    expect(tint).toMatch(/^hsl\(\d{1,3} \d{1,3}% \d{1,3}%\)$/)
  })
})
