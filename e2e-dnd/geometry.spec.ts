import { expect, test, type Page } from '@playwright/test'
import { openHarness } from './drag'

/**
 * Nothing jumps.
 *
 * `placeholder.spec.ts` holds the engine's claim about *order* — the drop
 * commits exactly the preview. This holds the claim about *geometry*, which is a
 * different promise and was never measured: the slot the dragged card leaves
 * behind has to be exactly as tall as the card was, and letting go has to change
 * nothing except which card is where.
 *
 * Both are invisible to a screenshot. A still frame cannot show you a column
 * settling by nine pixels the instant you release, and that settle is the
 * difference between a drag that feels placed and one that feels dropped.
 */

/** Every card's box in a column, keyed by card id. */
async function boxes(page: Page, columnId: string) {
  return page.locator(`[data-column="${columnId}"] [data-card]`).evaluateAll((els) =>
    Object.fromEntries(
      els.map((el) => {
        const r = el.getBoundingClientRect()
        return [el.getAttribute('data-card')!, { top: Math.round(r.top), height: Math.round(r.height) }]
      }),
    ),
  )
}

test.describe('drag geometry', () => {
  test.beforeEach(async ({ page }) => {
    // `?flick=1` deliberately: a short card above a much taller one is where a
    // height mismatch actually shows. Equal-height cards would hide it.
    await openHarness(page, '?flick=1')
  })

  test('the placeholder is exactly as tall as the card it stands in for', async ({ page }) => {
    const before = await boxes(page, 'todo')
    const tall = before.tall!
    expect(tall.height).toBeGreaterThan(before.short!.height)

    const box = (await page.locator('[data-card="tall"]').boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 12, { steps: 4 })
    await page.waitForTimeout(200)

    const during = await boxes(page, 'todo')
    /*
     * The placeholder keeps the dragged card's `data-card`, so it is measured
     * here in the same lookup. It wraps an invisible copy of the card in a
     * 2px dashed border — so "identical" means identical, borders included, and
     * a tolerance of 1px is for sub-pixel rounding only.
     */
    expect(Math.abs(during.tall!.height - tall.height)).toBeLessThanOrEqual(1)

    await page.mouse.up()
  })

  test('releasing changes nothing but the order', async ({ page }) => {
    const box = (await page.locator('[data-card="short"]').boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 12, { steps: 4 })

    // Onto the lower half of the tall card, so `short` lands after it.
    const target = (await page.locator('[data-card="tall"]').boundingBox())!
    await page.mouse.move(target.x + target.width / 2, target.y + target.height * 0.75, { steps: 20 })
    await page.waitForTimeout(250)

    // What the user is looking at at the moment they let go.
    const preview = await boxes(page, 'todo')

    await page.mouse.up()
    await page.waitForTimeout(400)

    const after = await boxes(page, 'todo')
    expect(Object.keys(after).sort()).toEqual(Object.keys(preview).sort())
    for (const id of Object.keys(after)) {
      // The card you dropped is allowed to have moved — it was in your hand, not
      // in the column. Every *other* card must be exactly where it already was;
      // if one shifts, the column re-flowed on release and the preview lied.
      if (id === 'short') continue
      expect(after[id]!.top, `${id} moved on release`).toBe(preview[id]!.top)
      expect(after[id]!.height, `${id} changed height on release`).toBe(preview[id]!.height)
    }
  })
})
