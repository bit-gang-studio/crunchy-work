import { expect, test } from '@playwright/test'

/**
 * The journey, end to end against the real binary: land with nothing, create a
 * project, add a card, open it, edit it, and see the edit survive a reload.
 *
 * Everything here is real — the built SPA, the HTTP API, the service layer, a
 * SQLite file on disk. Nothing is stubbed.
 */
test.describe('a new user builds a board', () => {
  test('from an empty install to an edited card', async ({ page }) => {
    await page.goto('/')

    // The empty state teaches the pitch rather than just saying "nothing here".
    await expect(page.getByText('No projects yet.')).toBeVisible()
    await expect(page.getByText(/Make me a Crunchy project for this repo/)).toBeVisible()

    await page.getByRole('button', { name: 'Or create one yourself' }).click()
    await page.getByLabel('Project name').fill('Launch plan')
    await page.getByRole('button', { name: 'Create' }).click()

    // The project appears as a tile, and a new project starts usable.
    const tile = page.getByTestId('project-tile').filter({ hasText: 'Launch plan' })
    await expect(tile).toBeVisible()
    await expect(tile).toContainText('0 cards')
    await tile.click()

    await expect(page.getByRole('heading', { name: 'Launch plan' })).toBeVisible()
    for (const name of ['To Do', 'In Progress', 'Done']) {
      await expect(page.locator('[data-testid="column"]').filter({ hasText: name })).toBeVisible()
    }

    // Add a card to To Do.
    await page.locator('[data-column]').first().getByRole('button', { name: '+ Add card' }).click()
    await page.getByPlaceholder('Card title').fill('Write the announcement')
    await page.getByPlaceholder('Card title').press('Enter')
    await expect(page.getByTestId('card').filter({ hasText: 'Write the announcement' })).toBeVisible()

    // Opening a card is a route, so it deep-links.
    await page.getByTestId('card').filter({ hasText: 'Write the announcement' }).click()
    await expect(page.getByTestId('card-detail')).toBeVisible()
    await expect(page).toHaveURL(/\/cards\/\w+$/)

    // Edits autosave — there is no Save button.
    await page.getByLabel('Card title').fill('Write the launch announcement')
    await page.getByPlaceholder('Markdown welcome.').fill('Cover the MCP story first.')
    await page.getByRole('button', { name: 'Close' }).click()
    await expect(page.getByTestId('card-detail')).toHaveCount(0)

    // The edit reached the database, not just React state.
    await page.reload()
    await expect(page.getByTestId('card').filter({ hasText: 'Write the launch announcement' })).toBeVisible()

    // And the deep link opens the card straight from a cold load.
    await page.getByTestId('card').filter({ hasText: 'Write the launch announcement' }).click()
    const url = page.url()
    await page.goto(url)
    await expect(page.getByTestId('card-detail')).toBeVisible()
    await expect(page.getByPlaceholder('Markdown welcome.')).toHaveValue('Cover the MCP story first.')
  })

  test('completion is a per-card tick, independent of the column', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'New project' }).click()
    await page.getByLabel('Project name').fill('Ticks')
    await page.getByRole('button', { name: 'Create' }).click()
    await page.getByTestId('project-tile').filter({ hasText: 'Ticks' }).click()

    await page.locator('[data-column]').first().getByRole('button', { name: '+ Add card' }).click()
    await page.getByPlaceholder('Card title').fill('Done but still To Do')
    await page.getByPlaceholder('Card title').press('Enter')

    const card = page.getByTestId('card').filter({ hasText: 'Done but still To Do' })
    await card.getByRole('checkbox').click()
    await expect(card.getByRole('checkbox')).toHaveAttribute('aria-checked', 'true')

    // Ticking does not move the card to the Done column.
    await page.reload()
    const todo = page.locator('[data-column]').first()
    await expect(todo.getByTestId('card').filter({ hasText: 'Done but still To Do' })).toBeVisible()
  })
})
