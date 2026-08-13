import { expect, test, type Page } from '@playwright/test'

/**
 * Mobile, at the narrowest phone worth supporting.
 *
 * The rule this enforces is simple and unforgiving: **the page itself must never
 * scroll horizontally.** Individual regions may — the board is a horizontal
 * kanban on purpose, and wide content like a code block scrolls inside its own
 * container — but if the document overflows, every screen is subtly broken and
 * the app feels like a desktop site someone shrank.
 */
test.use({ viewport: { width: 390, height: 844 } })

/** True when the document itself overflows, ignoring regions that scroll on purpose. */
async function pageOverflows(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement
    return doc.scrollWidth > doc.clientWidth + 1
  })
}

/** Anything wider than the viewport that is not inside a deliberate scroll container. */
async function offendingElements(page: Page) {
  return page.evaluate(() => {
    const scrolls = (el: Element) => {
      const o = getComputedStyle(el).overflowX
      return o === 'auto' || o === 'scroll'
    }
    const bad: string[] = []
    for (const el of Array.from(document.querySelectorAll('body *'))) {
      const rect = el.getBoundingClientRect()
      if (rect.width === 0 || rect.right <= window.innerWidth + 1) continue
      let inScroller = false
      for (let p = el.parentElement; p; p = p.parentElement) {
        if (scrolls(p)) {
          inScroller = true
          break
        }
      }
      if (!inScroller) {
        bad.push(`${el.tagName.toLowerCase()}.${(el.className || '').toString().slice(0, 60)}`)
      }
    }
    return bad.slice(0, 5)
  })
}

async function seed(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('button', { name: /New project|Or create one yourself/ }).click()
  await page.getByLabel('Project name').fill(name)
  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByTestId('project-tile').filter({ hasText: name }).click()
}

test.describe('at 390px', () => {
  /**
   * A project screen shows one bar of chrome, not two.
   *
   * The app header is hidden here because everything it carried is either
   * duplicated by the project header ("Projects" goes home, exactly as the
   * wordmark did) or moved into the project menu (the theme). That leaves the
   * theme with a single phone-sized route to reach it, so this asserts the
   * route exists — a change that drops the menu row would otherwise strand the
   * control at this width with nothing failing.
   */
  test('a project screen spends one bar on chrome, and the theme is still reachable', async ({
    page,
  }) => {
    await seed(page, 'Phone chrome')

    // The wordmark's bar is gone here...
    await expect(page.getByRole('link', { name: 'Crunchy' })).toBeHidden()
    // ...and the thing it duplicated is what remains.
    await expect(page.getByRole('link', { name: 'Projects' })).toBeVisible()

    await page.getByRole('button', { name: /Project actions for Phone chrome/ }).click()
    const dark = page.getByRole('button', { name: 'Dark' })
    await expect(dark).toBeVisible()
    await dark.click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark')

    // The projects list keeps its header — there is no project chrome there to
    // carry the name, so hiding it would leave the app anonymous.
    await page.getByRole('link', { name: 'Projects' }).click()
    await expect(page.getByRole('link', { name: 'Crunchy' })).toBeVisible()
  })

  test('the projects screen does not overflow', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /New project|Or create one yourself/ }).click()
    await page.getByLabel('Project name').fill('A phone-sized project name that is quite long')
    await page.getByRole('button', { name: 'Create' }).click()

    expect(await offendingElements(page)).toEqual([])
    expect(await pageOverflows(page)).toBe(false)
  })

  test('the board scrolls its columns without the page overflowing', async ({ page }) => {
    await seed(page, 'Phone board')
    await page.locator('[data-column]').first().getByRole('button', { name: '+ Add card' }).click()
    await page.getByPlaceholder('Card title').fill('A card with a fairly long title that has to wrap on a phone')
    await page.getByPlaceholder('Card title').press('Enter')

    expect(await offendingElements(page)).toEqual([])
    expect(await pageOverflows(page)).toBe(false)

    // The board itself is still a horizontal kanban — that is the intended design.
    const board = page.getByTestId('kanban-board')
    const scrollable = await board.evaluate((el) => el.scrollWidth > el.clientWidth)
    expect(scrollable).toBe(true)
  })

  test('the card detail fills the screen rather than floating', async ({ page }) => {
    await seed(page, 'Phone card')
    await page.locator('[data-column]').first().getByRole('button', { name: '+ Add card' }).click()
    await page.getByPlaceholder('Card title').fill('Open on a phone')
    await page.getByPlaceholder('Card title').press('Enter')
    await page.getByTestId('card').filter({ hasText: 'Open on a phone' }).click()

    const modal = page.getByTestId('card-detail')
    await expect(modal).toBeVisible()
    const box = (await modal.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(389)

    expect(await pageOverflows(page)).toBe(false)
  })

  test('docs and the editor survive a narrow viewport, including wide content', async ({ page }) => {
    await seed(page, 'Phone docs')
    await page.getByRole('link', { name: 'Docs' }).click()
    await page.getByLabel('New doc title').fill('Wide content')
    await page.getByRole('button', { name: 'Create' }).click()

    const body = page.getByTestId('doc-body')
    await body.click()
    // A long unbroken code span is the classic thing that blows out a mobile layout.
    await page.keyboard.type('```')
    await page.keyboard.type('npx crunchy-work mcp --some-very-long-flag=and-a-long-value-that-cannot-wrap')
    // Assert the code block really formed — otherwise this test passes for the
    // wrong reason, having laid out ordinary wrapping prose.
    await expect(body.locator('pre')).toHaveCount(1)

    expect(await offendingElements(page)).toEqual([])
    expect(await pageOverflows(page)).toBe(false)
  })
})
