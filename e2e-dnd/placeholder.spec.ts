import { expect, test, type Page } from '@playwright/test'
import { onCard, openHarness, readState } from './drag'

/**
 * The placeholder cannot lie.
 *
 * The engine's central claim is that a `preview` copy of the columns is the only place
 * order lives while dragging, and **the drop commits exactly that preview** — so the dashed
 * placeholder marking the dragged card's slot is precisely where it lands. This is the spec
 * that holds that claim honest; if the commit ever diverges from the preview, the user
 * watches a card land somewhere other than the gap they aimed at.
 */

/** The DOM order of cards in a column. Mid-drag this is the preview, including the
 * dragged card's placeholder — which still carries its `data-card`. */
async function domOrder(page: Page, columnId: string): Promise<string[]> {
  return page.locator(`[data-column="${columnId}"] [data-card]`).evaluateAll((els) =>
    els.map((el) => el.getAttribute('data-card')!),
  )
}

/** Drag to a target and pause mid-flight so the preview can be read before dropping. */
async function dragAndHold(page: Page, cardId: string, getTarget: () => Promise<{ x: number; y: number }>) {
  const box = (await page.locator(`[data-card="${cardId}"]`).boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 8, { steps: 3 })
  const target = await getTarget()
  await page.mouse.move(target.x, target.y, { steps: 25 })
  await page.waitForTimeout(250)
}

test.describe('the placeholder matches the commit', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page)
    await expect(page.locator('[data-card="T1"]')).toBeVisible()
  })

  test('cross-column: what the preview shows is what gets saved', async ({ page }) => {
    await dragAndHold(page, 'T1', onCard(page, 'D2'))
    const preview = await domOrder(page, 'doing')
    expect(preview).toContain('T1')

    await page.mouse.up()
    await page.waitForTimeout(350)

    expect((await readState(page)).doing).toEqual(preview)
  })

  test('same-column: what the preview shows is what gets saved', async ({ page }) => {
    await dragAndHold(page, 'T4', onCard(page, 'T1', 'top'))
    const preview = await domOrder(page, 'todo')

    await page.mouse.up()
    await page.waitForTimeout(350)

    expect((await readState(page)).todo).toEqual(preview)
  })

  test('the dragged card leaves a placeholder in its slot, not a gap at the end', async ({ page }) => {
    await dragAndHold(page, 'T1', onCard(page, 'D2'))
    const preview = await domOrder(page, 'doing')
    // Landing before the hovered card means index 1, not appended.
    expect(preview.indexOf('T1')).toBe(1)
    await page.mouse.up()
  })
})
