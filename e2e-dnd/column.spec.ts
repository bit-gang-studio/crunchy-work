import { expect, test } from '@playwright/test'
import { dragColumnOnto, openHarness, readColumnOrder } from './drag'

/**
 * Reordering columns, every slot.
 *
 * The sibling of `reachability.spec.ts`, which exists because a *card* could not
 * be dropped into the first position of another column. Columns shipped with the
 * same bug in the same place and no spec at all: their only coverage was one
 * mouse-drag buried in a full-app e2e journey, which is the slow,
 * nondeterministic loop this harness exists to replace.
 *
 * The seed is `?cols=1` — four columns, enough to overflow the board at 1280.
 * That matters: once the board scrolls horizontally, auto-scroll and scroll-snap
 * both engage during a drag, and a seed that fits on screen does not reproduce
 * what users hit.
 */
test.describe('column reorder', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page, '?cols=1')
    expect(await readColumnOrder(page)).toEqual(['c1', 'c2', 'c3', 'c4'])
  })

  test('the last column can reach the first slot', async ({ page }) => {
    await dragColumnOnto(page, 'c4', 'c1')
    expect(await readColumnOrder(page)).toEqual(['c4', 'c1', 'c2', 'c3'])
  })

  test('the first column can reach the last slot', async ({ page }) => {
    await dragColumnOnto(page, 'c1', 'c4')
    expect(await readColumnOrder(page)).toEqual(['c2', 'c3', 'c4', 'c1'])
  })

  test('a column can move one slot left', async ({ page }) => {
    await dragColumnOnto(page, 'c3', 'c2')
    expect(await readColumnOrder(page)).toEqual(['c1', 'c3', 'c2', 'c4'])
  })

  test('a column can move one slot right', async ({ page }) => {
    await dragColumnOnto(page, 'c2', 'c3')
    expect(await readColumnOrder(page)).toEqual(['c1', 'c3', 'c2', 'c4'])
  })

  test('a column dropped on itself does not move, and commits nothing', async ({ page }) => {
    await dragColumnOnto(page, 'c2', 'c2')
    expect(await readColumnOrder(page)).toEqual(['c1', 'c2', 'c3', 'c4'])
    expect(await page.evaluate(() => window.__columnMoves ?? [])).toEqual([])
  })

  /**
   * The committed index is what reaches the server, and the server ranks against
   * the list with the moved column already taken out. An index that happens to
   * render correctly but means something else to `columns.move` is a bug that
   * only shows up after a reload.
   */
  test('the committed index is the slot among the other columns', async ({ page }) => {
    await dragColumnOnto(page, 'c4', 'c1')
    expect(await page.evaluate(() => window.__columnMoves ?? [])).toEqual([{ columnId: 'c4', index: 0 }])
  })
})
