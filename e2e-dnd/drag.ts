import { expect, type Page } from '@playwright/test'

/** The harness mirrors each column's order into a hidden node; this is the assertion surface. */
export async function readState(page: Page): Promise<Record<string, string[]>> {
  const raw = (await page.getByTestId('state').textContent()) ?? '[]'
  const parsed = JSON.parse(raw) as { id: string; cards: string[] }[]
  return Object.fromEntries(parsed.map((c) => [c.id, c.cards]))
}

export const columnOf = (state: Record<string, string[]>, cardId: string) =>
  Object.keys(state).find((k) => state[k]!.includes(cardId))

/**
 * One continuous gesture: grip the card, drag to the target in one motion, drop.
 *
 * `reaim` re-reads the target once after a settle — needed only when a *cross-column* drop
 * grows the destination and slides its bottom (a real user watches the moving gap and
 * follows it). Same-column drops stay stationary.
 */
export async function dragTo(
  page: Page,
  cardId: string,
  getTarget: () => Promise<{ x: number; y: number }>,
  reaim = false,
) {
  const card = page.locator(`[data-card="${cardId}"]`)
  const box = (await card.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  // Past the 5px activation constraint.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 8, { steps: 3 })
  let target = await getTarget()
  await page.mouse.move(target.x, target.y, { steps: 25 })
  if (reaim) {
    await page.waitForTimeout(60)
    target = await getTarget()
    await page.mouse.move(target.x, target.y, { steps: 6 })
  }
  await page.waitForTimeout(200)
  await page.mouse.up()
  await page.waitForTimeout(350)
}

/**
 * Aim at a card. Same-column placement is decided by the pointer against the card's
 * midpoint, so `half` picks the side: 'top' → land before, 'bottom' → land after (the
 * centre is the ambiguous boundary). Cross-column always lands before the hovered card.
 */
export const onCard =
  (page: Page, targetCard: string, half: 'top' | 'bottom' | 'center' = 'center') =>
  async () => {
    const box = (await page.locator(`[data-card="${targetCard}"]`).boundingBox())!
    const frac = half === 'top' ? 0.25 : half === 'bottom' ? 0.75 : 0.5
    return { x: box.x + box.width / 2, y: box.y + box.height * frac }
  }

export const atColumnBottom = (page: Page, columnId: string) => async () => {
  const box = (await page.locator(`[data-dropzone="${columnId}"]`).boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height - 6 }
}

/** The vertical gap between two stacked cards — `pointerWithin` finds no card here. */
export const inGapBetween = (page: Page, above: string, below: string) => async () => {
  const a = (await page.locator(`[data-card="${above}"]`).boundingBox())!
  const b = (await page.locator(`[data-card="${below}"]`).boundingBox())!
  return { x: a.x + a.width / 2, y: (a.y + a.height + b.y) / 2 }
}

export async function openHarness(page: Page, query = '') {
  await page.goto(`/dnd-harness.html${query}`)
  await expect(page.locator('[data-testid="card"]').first()).toBeVisible()
}
