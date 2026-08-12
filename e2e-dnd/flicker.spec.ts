import { expect, test } from '@playwright/test'
import { openHarness } from './drag'

/**
 * A held drag must not oscillate.
 *
 * The original bug: placement was decided by index direction, so when two cards had very
 * different heights, swapping them reflowed the column, which flipped the decision, which
 * swapped them back — a visible flicker while the pointer sat perfectly still.
 *
 * The fix was to decide from the **pointer** against the hovered card's midpoint. The
 * midpoint is a fixed reference, so a stationary pointer produces a stationary answer.
 * `?flick=1` seeds exactly the pathological case: a short card above a much taller one.
 */
test('a held drag over a taller neighbour does not oscillate', async ({ page }) => {
  await openHarness(page, '?flick=1')
  await expect(page.locator('[data-card="short"]')).toBeVisible()

  const short = (await page.locator('[data-card="short"]').boundingBox())!
  const tall = (await page.locator('[data-card="tall"]').boundingBox())!

  await page.mouse.move(short.x + short.width / 2, short.y + short.height / 2)
  await page.mouse.down()
  await page.mouse.move(short.x + short.width / 2, short.y + short.height / 2 + 8, { steps: 3 })

  // Park the pointer past the tall card's midpoint and hold it perfectly still.
  await page.mouse.move(tall.x + tall.width / 2, tall.y + tall.height * 0.75, { steps: 20 })
  await page.waitForTimeout(250)

  const order = () =>
    page
      .locator('[data-column="todo"] [data-card]')
      .evaluateAll((els) => els.map((el) => el.getAttribute('data-card')!).join(','))

  const settled = await order()
  const samples: string[] = []
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(60)
    samples.push(await order())
  }

  await page.mouse.up()

  // Every sample identical: the preview never moved while the pointer didn't.
  expect(samples).toEqual(Array.from({ length: 8 }, () => settled))
})
