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
