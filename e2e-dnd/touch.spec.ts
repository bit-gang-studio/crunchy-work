import { expect, test, type CDPSession, type Page } from '@playwright/test'
import { openHarness, readState } from './drag'

/**
 * Touch has to distinguish a swipe from a drag.
 *
 * On a phone the same gesture means two things: dragging your finger up a column should
 * *scroll* it, while picking a card up should *move* it. The board resolves this with
 * separate sensors — Mouse activates instantly after 5px, Touch only after a 200ms
 * long-press — which is why it isn't one PointerSensor (that can't give touch a delay
 * while leaving mouse instant).
 *
 * Playwright's touchscreen API only taps, so these drive raw CDP touch events. One session
 * per gesture: the protocol tracks touch state across events, so a fresh session mid-gesture
 * fails with "Must send a TouchStart first".
 */
test.use({ hasTouch: true })

class Finger {
  private constructor(
    private readonly client: CDPSession,
    private readonly page: Page,
  ) {}

  static async open(page: Page) {
    return new Finger(await page.context().newCDPSession(page), page)
  }

  private send(type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) {
    return this.client.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }],
    })
  }

  down = (x: number, y: number) => this.send('touchStart', x, y)
  move = (x: number, y: number) => this.send('touchMove', x, y)
  up = (x: number, y: number) => this.send('touchEnd', x, y)

  async glide(from: { x: number; y: number }, to: { x: number; y: number }, steps: number, gap: number) {
    for (let i = 1; i <= steps; i++) {
      await this.move(from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps)
      await this.page.waitForTimeout(gap)
    }
  }

  close = () => this.client.detach()
}

async function centre(page: Page, cardId: string) {
  const box = (await page.locator(`[data-card="${cardId}"]`).boundingBox())!
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

test.describe('touch', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page)
    await expect(page.locator('[data-card="T1"]')).toBeVisible()
  })

  test('a long-press picks a card up and moves it', async ({ page }) => {
    const from = await centre(page, 'T1')
    const to = await centre(page, 'D2')
    const finger = await Finger.open(page)

    await finger.down(from.x, from.y)
    await page.waitForTimeout(350) // past the 200ms press delay
    await finger.glide(from, to, 12, 16)
    await page.waitForTimeout(150)
    await finger.up(to.x, to.y)
    await page.waitForTimeout(350)
    await finger.close()

    const state = await readState(page)
    expect(state.doing).toContain('T1')
    expect(state.todo).not.toContain('T1')
  })

  test('a quick swipe does not pick a card up', async ({ page }) => {
    const before = await readState(page)
    const from = await centre(page, 'T1')
    const finger = await Finger.open(page)

    await finger.down(from.x, from.y)
    // Move immediately — under the 200ms threshold, so this is a scroll, not a drag.
    await finger.glide(from, { x: from.x, y: from.y + 120 }, 6, 10)
    await finger.up(from.x, from.y + 120)
    await page.waitForTimeout(300)
    await finger.close()

    expect(await readState(page)).toEqual(before)
  })
})
