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

  test('projects can be dragged into a different order, and it sticks', async ({ page }) => {
    await page.goto('/')
    for (const name of ['Alpha', 'Beta', 'Gamma']) {
      await page.getByRole('button', { name: /New project|Or create one yourself/ }).click()
      await page.getByLabel('Project name').fill(name)
      await page.getByRole('button', { name: 'Create' }).click()
      await expect(page.getByTestId('project-tile').filter({ hasText: name })).toBeVisible()
    }

    // Specs share one database within a run, so assert the relative order of
    // this test's own projects rather than the whole list.
    const mine = ['Alpha', 'Beta', 'Gamma']
    const names = async () => {
      const all = await page
        .getByTestId('project-tile')
        .evaluateAll((els) => els.map((el) => el.querySelector('span')?.textContent ?? ''))
      return all.filter((n) => mine.includes(n))
    }
    expect(await names()).toEqual(['Alpha', 'Beta', 'Gamma'])

    // Drag Gamma onto Alpha's position.
    const tile = (name: string) => page.getByTestId('project-tile').filter({ hasText: name })
    const gamma = (await tile('Gamma').boundingBox())!
    const alpha = (await tile('Alpha').boundingBox())!
    await page.mouse.move(gamma.x + gamma.width / 2, gamma.y + gamma.height / 2)
    await page.mouse.down()
    await page.mouse.move(gamma.x + gamma.width / 2, gamma.y + gamma.height / 2 + 8, { steps: 3 })
    await page.mouse.move(alpha.x + alpha.width / 2, alpha.y + alpha.height / 2, { steps: 20 })
    await page.waitForTimeout(150)
    await page.mouse.up()
    await page.waitForTimeout(400)

    expect(await names()).toEqual(['Gamma', 'Alpha', 'Beta'])

    // A drag must not also navigate into the project it was released on.
    await expect(page).toHaveURL(/\/$/)

    // And the new order is persisted, not just local state.
    await page.reload()
    expect(await names()).toEqual(['Gamma', 'Alpha', 'Beta'])
  })

  test('the card detail is a centered modal over a dimmed board', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /New project|Or create one yourself/ }).click()
    await page.getByLabel('Project name').fill('Modal check')
    await page.getByRole('button', { name: 'Create' }).click()
    await page.getByTestId('project-tile').filter({ hasText: 'Modal check' }).click()

    await page.locator('[data-column]').first().getByRole('button', { name: '+ Add card' }).click()
    await page.getByPlaceholder('Card title').fill('Open me')
    await page.getByPlaceholder('Card title').press('Enter')
    await page.getByTestId('card').filter({ hasText: 'Open me' }).click()

    const modal = page.getByTestId('card-detail')
    await expect(modal).toBeVisible()
    await expect(modal).toHaveAttribute('aria-modal', 'true')

    // Centred rather than flush to an edge — the Trello model, not a side rail.
    const box = (await modal.boundingBox())!
    const viewport = page.viewportSize()!
    const leftGap = box.x
    const rightGap = viewport.width - (box.x + box.width)
    expect(Math.abs(leftGap - rightGap)).toBeLessThan(8)
    expect(leftGap).toBeGreaterThan(20)

    // Clicking the dimmed backdrop closes it.
    await page.mouse.click(10, viewport.height / 2)
    await expect(modal).toHaveCount(0)
  })

  test('a card carries a size and a done-when checklist', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /New project|Or create one yourself/ }).click()
    await page.getByLabel('Project name').fill('Criteria project')
    await page.getByRole('button', { name: 'Create' }).click()
    await page.getByTestId('project-tile').filter({ hasText: 'Criteria project' }).click()

    await page.locator('[data-column]').first().getByRole('button', { name: '+ Add card' }).click()
    await page.getByPlaceholder('Card title').fill('Ship the thing')
    await page.getByPlaceholder('Card title').press('Enter')
    await page.getByTestId('card').filter({ hasText: 'Ship the thing' }).click()

    await page.getByLabel('Size').selectOption('M')

    const criteria = page.getByTestId('acceptance-criteria')
    for (const line of ['Tests pass', 'Docs updated']) {
      await page.getByLabel('Add a criterion').fill(line)
      await page.getByLabel('Add a criterion').press('Enter')
      await expect(criteria).toContainText(line)
    }
    await criteria.getByRole('checkbox', { name: 'Tests pass' }).check()
    await expect(criteria).toContainText('1/2')

    await page.getByRole('button', { name: 'Close' }).click()

    // The card face carries the size and the tally, but not the lines.
    const card = page.getByTestId('card').filter({ hasText: 'Ship the thing' })
    await expect(card).toContainText('M')
    await expect(card).toContainText('1/2')
    await expect(card).not.toContainText('Tests pass')

    // All of it reached the database.
    await page.reload()
    await expect(page.getByTestId('card').filter({ hasText: 'Ship the thing' })).toContainText('1/2')
    await page.getByTestId('card').filter({ hasText: 'Ship the thing' }).click()
    await expect(page.getByLabel('Size')).toHaveValue('M')
    await expect(page.getByTestId('acceptance-criteria')).toContainText('Docs updated')
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
