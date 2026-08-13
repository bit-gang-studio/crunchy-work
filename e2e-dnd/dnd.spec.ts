import { expect, test } from '@playwright/test'
import { dragTo, inGapBetween, onCard, openHarness, readState } from './drag'

/**
 * Behaviours, plus the two regressions that are easiest to reintroduce.
 */
test.describe('drag behaviours', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page)
    await expect(page.locator('[data-card="T1"]')).toBeVisible()
  })

  /**
   * The gap regression.
   *
   * `pointerWithin` finds no card in the 8px gaps between cards — only the column
   * droppable, which means "append to the end". That made the gaps a dead zone where every
   * drop silently landed at the bottom. The engine now snaps to the nearest card in that
   * column by the pointer's distance to each card's centre.
   */
  test('dropping in the gap between two cards lands between them, not at the bottom', async ({ page }) => {
    await dragTo(page, 'T1', inGapBetween(page, 'D1', 'D2'))
    const doing = (await readState(page)).doing!
    expect(doing).not.toEqual(['D1', 'D2', 'D3', 'T1'])
    expect(Math.abs(doing.indexOf('T1') - doing.indexOf('D1'))).toBe(1)
  })

  test('a card dropped back where it started is a no-op', async ({ page }) => {
    const before = await readState(page)
    await dragTo(page, 'T2', onCard(page, 'T2', 'center'))
    expect(await readState(page)).toEqual(before)
  })

  /**
   * Click-vs-drag. The card is both draggable and click-to-open, so the browser's trailing
   * click after a drop must be swallowed or every drag also opens the card's detail.
   */
  test('a drag does not also open the card', async ({ page }) => {
    await dragTo(page, 'T1', onCard(page, 'D2'))
    expect(await page.evaluate(() => window.__opens ?? [])).toEqual([])
  })

  test('a plain click still opens the card', async ({ page }) => {
    await page.locator('[data-card="T1"]').click()
    expect(await page.evaluate(() => window.__opens ?? [])).toEqual(['T1'])
  })

  /**
   * Controls inside a draggable card must stop `mousedown` and `touchstart`, not just
   * `pointerdown` — the board uses separate Mouse and Touch sensors, each listening to its
   * own event.
   */
  test('ticking a card completes it without dragging or opening it', async ({ page }) => {
    const before = await readState(page)
    await page.locator('[data-card="T1"] [role="checkbox"]').click()

    await expect(page.locator('[data-card="T1"] [role="checkbox"]')).toHaveAttribute('aria-checked', 'true')
    expect(await readState(page)).toEqual(before)
    expect(await page.evaluate(() => window.__opens ?? [])).toEqual([])
  })

  test('adding a card at the top and at the bottom both land where they say', async ({ page }) => {
    await page.getByRole('button', { name: 'Add card to top of To Do' }).click()
    await page.getByPlaceholder('Card title').fill('Topper')
    await page.getByPlaceholder('Card title').press('Enter')
    await expect(page.locator('[data-card="Topper"]')).toBeVisible()

    await page.locator('[data-column="todo"]').getByRole('button', { name: 'Add card', exact: true }).click()
    await page.getByPlaceholder('Card title').fill('Bottomer')
    await page.getByPlaceholder('Card title').press('Enter')
    await expect(page.locator('[data-card="Bottomer"]')).toBeVisible()

    const todo = (await readState(page)).todo!
    expect(todo[0]).toBe('Topper')
    expect(todo.at(-1)).toBe('Bottomer')
  })
})
