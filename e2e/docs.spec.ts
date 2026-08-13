import { expect, test } from '@playwright/test'

/**
 * Documents, end to end.
 *
 * The assertion that matters most is that what gets **stored is markdown**, not
 * a proprietary document model. An agent reads and writes docs over MCP as plain
 * markdown, so if the editor stored anything else, one of the two front doors
 * would be looking at a lossy conversion of the other.
 */
test.describe('docs', () => {
  test('write a doc in the browser and it is markdown on disk', async ({ page, request }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /New project|Or create one yourself/ }).click()
    await page.getByLabel('Project name').fill('Docs project')
    await page.getByRole('button', { name: 'Create' }).click()
    await page.getByTestId('project-tile').filter({ hasText: 'Docs project' }).click()

    // The Docs tab exists alongside the board — a project is one board plus docs.
    await page.getByRole('link', { name: 'Docs' }).click()
    await expect(page.getByText('No docs yet.')).toBeVisible()

    await page.getByLabel('New doc title').fill('Architecture')
    await page.getByRole('button', { name: 'Create' }).click()

    // Creating opens the doc straight away.
    await expect(page.getByLabel('Doc title', { exact: true })).toHaveValue('Architecture')
    await expect(page).toHaveURL(/\/docs\/\w+$/)

    // An empty document is not a featureless void: the placeholder is also the
    // only discoverability the markdown shortcuts have.
    // Rendered as a CSS pseudo-element (`content: attr(data-placeholder)`), so
    // assert the attribute the stylesheet reads rather than the text content.
    const body = page.getByTestId('doc-body')
    await expect(body.locator('p.is-editor-empty').first()).toHaveAttribute(
      'data-placeholder',
      /Markdown works/,
    )

    await body.click()
    await page.keyboard.type('# Storage')
    await page.keyboard.press('Enter')
    await page.keyboard.type('SQLite, because it has no native module.')

    // The input rule turned the line into a real heading, not literal text.
    await expect(body.locator('h1')).toHaveText('Storage')

    await expect(page.getByTestId('save-state')).toHaveText('Saved', { timeout: 5000 })

    // What is on disk is markdown.
    const docId = page.url().split('/').pop()!
    const stored = await request.get(`/api/docs/${docId}`).then((r) => r.json())
    expect(stored.content).toContain('# Storage')
    expect(stored.content).toContain('SQLite, because it has no native module.')
    expect(stored.content).not.toContain('<h1>')

    // And it survives a reload.
    await page.reload()
    await expect(page.getByTestId('doc-body').locator('h1')).toHaveText('Storage')
  })

  test('a doc is listed, renamed and deleted', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /New project|Or create one yourself/ }).click()
    await page.getByLabel('Project name').fill('Doc lifecycle')
    await page.getByRole('button', { name: 'Create' }).click()
    await page.getByTestId('project-tile').filter({ hasText: 'Doc lifecycle' }).click()
    await page.getByRole('link', { name: 'Docs' }).click()

    await page.getByLabel('New doc title').fill('Draft')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page).toHaveURL(/\/docs\/\w+$/)

    // Rename it, then prove the rename reached the database by reloading.
    //
    // Wait for "Saved" before reloading — not as the assertion (the effect
    // after reload is what actually matters) but as the *signal* that the
    // debounced save has landed. Reloading straight after typing races the
    // autosave's pagehide flush: it usually wins, and occasionally does not.
    await page.getByLabel('Doc title', { exact: true }).fill('Final')
    await expect(page.getByTestId('save-state')).toHaveText('Saved', { timeout: 5000 })

    await page.reload()
    await expect(page.getByLabel('Doc title', { exact: true })).toHaveValue('Final')

    await page.getByRole('link', { name: '← All docs' }).click()
    await expect(page.getByTestId('doc-row').filter({ hasText: 'Final' })).toBeVisible()

    // The project tile counts it.
    await page.goto('/')
    await expect(page.getByTestId('project-tile').filter({ hasText: 'Doc lifecycle' })).toContainText('1 doc')

    await page.getByTestId('project-tile').filter({ hasText: 'Doc lifecycle' }).click()
    await page.getByRole('link', { name: 'Docs' }).click()
    await page.getByTestId('doc-row').filter({ hasText: 'Final' }).click()

    // Deleting asks first — it is the only irrecoverable action in the app.
    await page.getByRole('button', { name: 'Delete doc' }).click()
    await expect(page.getByRole('button', { name: 'Really delete' })).toBeVisible()

    // Backing out leaves the document alone.
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(page.getByLabel('Doc title', { exact: true })).toHaveValue('Final')

    await page.getByRole('button', { name: 'Delete doc' }).click()
    await page.getByRole('button', { name: 'Really delete' }).click()

    await expect(page.getByText('No docs yet.')).toBeVisible()
  })

  test('the / menu inserts blocks and the bubble restyles a selection', async ({ page, request }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /New project|Or create one yourself/ }).click()
    await page.getByLabel('Project name').fill('Editor project')
    await page.getByRole('button', { name: 'Create' }).click()
    await page.getByTestId('project-tile').filter({ hasText: 'Editor project' }).click()
    await page.getByRole('link', { name: 'Docs' }).click()
    await page.getByLabel('New doc title').fill('Formatting')
    await page.getByRole('button', { name: 'Create' }).click()
    await expect(page).toHaveURL(/\/docs\/\w+$/)

    const body = page.getByTestId('doc-body')
    const menu = page.getByTestId('slash-menu')
    await body.click()

    // "/" opens the menu; typing filters it; Enter runs the highlighted item.
    await page.keyboard.type('/')
    await expect(menu).toBeVisible()
    await page.keyboard.type('head')
    await expect(menu.getByRole('option')).toHaveCount(3)
    await page.keyboard.press('Enter')
    await expect(menu).toBeHidden()

    // The "/head" text is gone — the block replaced it, rather than being
    // inserted alongside it.
    await page.keyboard.type('Decisions')
    await expect(body.locator('h1')).toHaveText('Decisions')

    // Arrow keys move the highlight, and the choice sticks.
    await page.keyboard.press('Enter')
    await page.keyboard.type('/todo')
    await expect(menu).toBeVisible()
    await page.keyboard.press('Enter')
    await page.keyboard.type('Ship it')
    await expect(body.locator('ul[data-type="taskList"] li')).toHaveCount(1)

    // Escape dismisses without inserting anything.
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter') // leave the list
    await page.keyboard.type('/quo')
    await expect(menu).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(body.locator('blockquote')).toHaveCount(0)

    // And the dismissal sticks to that slash. Putting the caret back directly
    // after it is the case that would otherwise spring the menu open again.
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft')
    await expect(menu).toBeHidden()
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')

    // A "/" mid-word is not a command — it is a path or a URL.
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await page.keyboard.press('Backspace')
    await page.keyboard.type('src/web')
    await expect(menu).toBeHidden()

    // The bubble appears on a selection and restyles what is already there.
    await page.keyboard.down('Shift')
    for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowLeft')
    await page.keyboard.up('Shift')
    const bubble = page.getByTestId('bubble-menu')
    await expect(bubble).toBeVisible()
    await bubble.getByRole('button', { name: 'Bold' }).click()
    await expect(body.locator('strong')).toHaveText('web')

    await expect(page.getByTestId('save-state')).toHaveText('Saved', { timeout: 5000 })

    // All of it is markdown on disk — including the checkbox, which is what an
    // agent reading this doc over MCP will see.
    const docId = page.url().split('/').pop()!
    const stored = await request.get(`/api/docs/${docId}`).then((r) => r.json())
    expect(stored.content).toContain('# Decisions')
    expect(stored.content).toContain('[ ] Ship it')
    expect(stored.content).toContain('**web**')
    expect(stored.content).not.toContain('/head')
  })

  test('docs are dragged into the order the author wants', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /New project|Or create one yourself/ }).click()
    await page.getByLabel('Project name').fill('Doc order')
    await page.getByRole('button', { name: 'Create' }).click()
    await page.getByTestId('project-tile').filter({ hasText: 'Doc order' }).click()
    await page.getByRole('link', { name: 'Docs' }).click()

    // Creating opens the new doc, so come back to the list between each.
    const list = page.url()
    for (const title of ['Brief', 'Notes', 'Decisions']) {
      await page.goto(list)
      await page.getByLabel('New doc title').fill(title)
      await page.getByRole('button', { name: 'Create' }).click()
      await expect(page).toHaveURL(/\/docs\/\w+$/)
    }
    await page.goto(list)

    const titles = () =>
      page
        .getByTestId('doc-row')
        .evaluateAll((els) => els.map((el) => el.querySelectorAll('span')[1]?.textContent ?? ''))
    await expect.poll(titles).toEqual(['Brief', 'Notes', 'Decisions'])

    // Drag Decisions up onto Brief.
    const row = (name: string) => page.getByTestId('doc-row').filter({ hasText: name })
    const from = (await row('Decisions').boundingBox())!
    const to = (await row('Brief').boundingBox())!
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 8, { steps: 3 })
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 })
    await page.waitForTimeout(150)
    await page.mouse.up()

    await expect.poll(titles).toEqual(['Decisions', 'Brief', 'Notes'])

    // A drag must not also open the doc it was released on.
    await expect(page).not.toHaveURL(/\/docs\/\w+$/)

    // And the order is persisted, not just optimistic local state.
    await page.reload()
    await expect.poll(titles).toEqual(['Decisions', 'Brief', 'Notes'])
  })
})
