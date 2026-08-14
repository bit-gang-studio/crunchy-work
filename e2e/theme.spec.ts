import { expect, test } from '@playwright/test'

/**
 * Dark mode's mechanism, in the only place the facts are observable.
 *
 * Choosing a theme is easy to get right and easy to get subtly wrong: the
 * attribute has to land *before first paint* (or every load flashes light), the
 * choice has to outlive a reload, and "Auto" has to keep following the system
 * rather than latching to whatever it was when the tab opened.
 */
test.describe('theme', () => {
  test('follows the system on a first run, with no stored choice', async ({ browser }) => {
    const dark = await browser.newContext({ colorScheme: 'dark' })
    const page = await dark.newPage()
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true')
    await dark.close()

    const light = await browser.newContext({ colorScheme: 'light' })
    const lightPage = await light.newPage()
    await lightPage.goto('/')
    await expect(lightPage.locator('html')).toHaveAttribute('data-theme', 'light')
    await light.close()
  })

  test('an explicit choice beats the system, and survives a reload', async ({ browser }) => {
    // A dark system, so choosing Light proves the choice wins rather than
    // coinciding with what the OS wanted anyway.
    const context = await browser.newContext({ colorScheme: 'dark' })
    const page = await context.newPage()
    await page.goto('/')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    await page.getByRole('button', { name: 'Light' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')
    await expect(page.getByRole('button', { name: 'Light' })).toHaveAttribute('aria-pressed', 'true')

    /*
     * The attribute is set by an inline script in the head, so by the time the
     * document has parsed it is already correct — no frame of the wrong palette
     * before React mounts. Asserting on `domcontentloaded` is the closest a spec
     * can get to "before first paint" without screenshotting frames.
     */
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light')

    await context.close()
  })

  /*
   * The whole page cross-fades as one animation, and nothing else animates
   * while it does.
   *
   * Both halves earn a guard. The first because the obvious implementation — a
   * colour transition on every element — was tried and could not be made to
   * stay in step: handing an element a `transition-property` in the same style
   * recalculation that changes its colour makes the browser cancel and restart
   * that transition every frame, so anything without a `transition-colors`
   * utility of its own crawled while its neighbours faded. The second because
   * the components' own 150ms hover transitions finish before a 220ms
   * cross-fade does, and the live page showing through at the end is a pop.
   *
   * Sampled inside one evaluate rather than asserted across awaits: the window
   * being measured is 220ms wide, which is not something to race a poller on.
   */
  test('the whole page cross-fades as one animation, and alone', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'light' })
    const page = await context.newPage()
    await page.goto('/')
    const html = page.locator('html')

    // Landing on a page is not a change: the inline script already stamped the
    // attribute before paint, so there is nothing to fade from.
    await expect(html).not.toHaveClass(/theme-shifting/)

    const shift = await page.evaluate(async () => {
      const root = document.documentElement
      const dark = [...document.querySelectorAll('button')].find(
        (b) => (b.getAttribute('aria-label') ?? b.textContent ?? '').trim() === 'Dark',
      ) as HTMLButtonElement
      let cancelled = 0
      document.addEventListener('transitioncancel', () => (cancelled += 1), true)

      dark.click()
      await new Promise((r) => requestAnimationFrame(r))
      await new Promise((r) => requestAnimationFrame(r))

      const running = document.getAnimations()
      const effect = (a: Animation) => a.effect as KeyframeEffect | null
      const crossFade = running.filter((a) =>
        effect(a)?.pseudoElement?.includes('view-transition'),
      )
      return {
        suppressing: root.classList.contains('theme-shifting'),
        crossFades: crossFade.length,
        // Colour transitions specifically. `transform` is deliberately spared
        // by the suppression, so a segmented control's indicator keeps sliding
        // to the choice you just clicked while the palette fades around it.
        colourTransitions: running.filter(
          (a) => a instanceof CSSTransition && a.transitionProperty !== 'transform',
        ).length,
        // Every layer of the fade on one clock. Scoped to the cross-fade itself:
        // unrelated animations elsewhere on the page are not this test's business.
        durations: [...new Set(crossFade.map((a) => effect(a)?.getTiming().duration))],
        cancelled,
      }
    })

    expect(shift.crossFades).toBeGreaterThan(0)
    // The one that matters: no element is running its own colour animation, so
    // there is nothing that can finish at a different moment from the fade.
    expect(shift.colourTransitions).toBe(0)
    expect(shift.cancelled).toBe(0)
    expect(shift.suppressing).toBe(true)
    expect(shift.durations).toEqual([220])

    // ...and the suppression lifts, so hovers animate normally again after.
    await expect(html).not.toHaveClass(/theme-shifting/)
    await expect(html).toHaveAttribute('data-theme', 'dark')

    await context.close()
  })

  test('going back to Auto starts following the system again', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark' })
    const page = await context.newPage()
    await page.goto('/')

    await page.getByRole('button', { name: 'Light' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await page.getByRole('button', { name: 'Auto' }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    // And it keeps following: the OS flipping mid-session must move the app,
    // which is the entire difference between Auto and "dark, chosen once".
    await page.emulateMedia({ colorScheme: 'light' })
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light')

    await context.close()
  })

  test('a corrupt stored choice falls back to the system, it does not break the page', async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme: 'dark' })
    const page = await context.newPage()
    await page.goto('/')
    await page.evaluate(() => localStorage.setItem('crunchy.theme', 'midnight'))
    await page.reload()

    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')
    await expect(page.getByRole('button', { name: 'Auto' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()

    await context.close()
  })
})
