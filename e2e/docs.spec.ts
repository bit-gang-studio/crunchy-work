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

    const body = page.getByTestId('doc-body')
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

    // Rename it. Assert the effect, not the transient "Saved" label — the
    // indicator is a race by construction and would make this flaky.
    await page.getByLabel('Doc title', { exact: true }).fill('Final')
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
    await page.getByRole('button', { name: 'Delete doc' }).click()

    await expect(page.getByText('No docs yet.')).toBeVisible()
  })
})
