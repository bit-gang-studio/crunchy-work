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
    // A tile leads with progress, not a pile size — so a project with nothing
    // in it says so, rather than reporting "0 cards".
    await expect(tile).toContainText('Nothing on the board yet')
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

  test('an empty board teaches, and stops once there is a card', async ({ page }) => {
    // The board is the surface you land on, and a project with columns and no
    // cards used to say nothing at all — at the exact moment a new user decides
    // whether this is worth their time.
    await page.goto('/')
    await page.getByRole('button', { name: /New project|Or create one yourself/ }).click()
    await page.getByLabel('Project name').fill('Empty board')
    await page.getByRole('button', { name: 'Create' }).click()
    await page.getByTestId('project-tile').filter({ hasText: 'Empty board' }).click()

    await expect(page.getByText('No cards yet.')).toBeVisible()
    // The prompt is the point: it names this project, so it can be pasted as-is.
    await expect(page.getByText(/add cards to Empty board for what needs doing/)).toBeVisible()

    await page.locator('[data-column]').first().getByRole('button', { name: '+ Add card' }).click()
    await page.getByPlaceholder('Card title').fill('The first one')
    await page.getByPlaceholder('Card title').press('Enter')

    await expect(page.getByTestId('card')).toHaveCount(1)
    await expect(page.getByText('No cards yet.')).toHaveCount(0)
  })

  test('a project can be renamed and deleted', async ({ page }) => {
    // Until this existed the REST routes had rename and delete and no front
    // door called them — a project made with a typo was permanent.
    await page.goto('/')
    await page.getByRole('button', { name: /New project|Or create one yourself/ }).click()
    await page.getByLabel('Project name').fill('Untitledd')
    await page.getByRole('button', { name: 'Create' }).click()
    await page.getByTestId('project-tile').filter({ hasText: 'Untitledd' }).click()

    // The name is click-to-edit, like a column.
    await page.getByRole('heading', { name: 'Untitledd' }).click()
    await page.getByLabel('Rename Untitledd').fill('Untitled')
    await page.getByLabel('Rename Untitledd').press('Enter')
    await expect(page.getByRole('heading', { name: 'Untitled', exact: true })).toBeVisible()

    // It reached the database, not just the header's local state.
    await page.goto('/')
    await expect(page.getByTestId('project-tile').filter({ hasText: 'Untitled' })).toBeVisible()

    await page.getByTestId('project-tile').filter({ hasText: 'Untitled' }).click()
    await page.getByRole('button', { name: 'Project actions for Untitled', exact: true }).click()

    // Deleting asks first, and says what goes with it.
    await page.getByRole('button', { name: 'Delete project' }).click()
    await page.getByRole('button', { name: 'Delete the board and docs too' }).click()

    await expect(page).toHaveURL(/\/$/)
    await expect(page.getByTestId('project-tile').filter({ hasText: 'Untitled' })).toHaveCount(0)
  })

  test('you can hop between projects and describe one, without going home', async ({ page }) => {
    await page.goto('/')
    for (const name of ['Hopper A', 'Hopper B']) {
      await page.getByRole('button', { name: /New project|Or create one yourself/ }).click()
      await page.getByLabel('Project name').fill(name)
      await page.getByRole('button', { name: 'Create' }).click()
      await expect(page.getByTestId('project-tile').filter({ hasText: name })).toBeVisible()
    }

    await page.getByTestId('project-tile').filter({ hasText: 'Hopper A' }).click()
    await expect(page.getByRole('heading', { name: 'Hopper A' })).toBeVisible()

    // The switcher hangs off the "Projects" crumb, not the name — the name is
    // already click-to-rename and one control cannot mean two things.
    await page.getByRole('button', { name: 'Switch project' }).click()
    await page.getByTestId('project-switcher').getByRole('button', { name: /Hopper B/ }).click()
    await expect(page.getByRole('heading', { name: 'Hopper B' })).toBeVisible()
    await expect(page).toHaveURL(/\/projects\/\w+$/)

    // A description: settable at last, and it reaches the projects grid.
    await page.getByRole('button', { name: 'Project actions for Hopper B', exact: true }).click()
    await page.getByRole('button', { name: 'Add a description' }).click()
    await page.getByLabel('Project description').fill('The second one.')
    // Tab out rather than clicking the heading — the heading is click-to-rename,
    // so using it to dismiss this field would open the other editor.
    await page.keyboard.press('Tab')

    await expect(page.getByRole('button', { name: 'The second one.' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'The second one.' })).toBeVisible()

    await page.goto('/')
    await expect(page.getByTestId('project-tile').filter({ hasText: 'Hopper B' })).toContainText(
      'The second one.',
    )
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
      // By its own testid, not "the first span in the tile" — which is what
      // this used to do, and which silently started reading the monogram the
      // moment a tile grew one.
      const all = await page
        .getByTestId('project-tile')
        .evaluateAll((els) =>
          els.map((el) => el.querySelector('[data-testid="project-name"]')?.textContent ?? ''),
        )
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

  test('columns can be added, renamed, reordered and deleted', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: /New project|Or create one yourself/ }).click()
    await page.getByLabel('Project name').fill('Column work')
    await page.getByRole('button', { name: 'Create' }).click()
    await page.getByTestId('project-tile').filter({ hasText: 'Column work' }).click()

    await expect(page.locator('[data-column]').first()).toBeVisible()
    const names = () =>
      page.locator('[data-column]').evaluateAll((els) =>
        els.map((el) => el.querySelector('button')?.textContent?.trim() ?? ''),
      )
    await expect.poll(names).toEqual(['To Do', 'In Progress', 'Done'])

    // Add
    await page.getByRole('button', { name: '+ Add column' }).click()
    await page.getByLabel('Column name').fill('Blocked')
    await page.getByLabel('Column name').press('Enter')
    await expect.poll(names).toEqual(['To Do', 'In Progress', 'Done', 'Blocked'])

    // Rename, by clicking the name
    // `exact` matters: "To Do" is a substring of "Add card to top of To Do".
    await page.locator('[data-column]').first().getByRole('button', { name: 'To Do', exact: true }).click()
    await page.getByLabel('Rename To Do').fill('Backlog')
    await page.getByLabel('Rename To Do').press('Enter')
    await expect.poll(names).toEqual(['Backlog', 'In Progress', 'Done', 'Blocked'])

    // Reorder by dragging the header
    const from = (await page.locator('[data-column]').nth(3).boundingBox())!
    const to = (await page.locator('[data-column]').nth(0).boundingBox())!
    await page.mouse.move(from.x + 40, from.y + 12)
    await page.mouse.down()
    await page.mouse.move(from.x + 40, from.y + 20, { steps: 3 })
    await page.mouse.move(to.x + 40, to.y + 12, { steps: 25 })
    await page.waitForTimeout(200)
    await page.mouse.up()
    await expect.poll(names).toEqual(['Blocked', 'Backlog', 'In Progress', 'Done'])

    // The order is persisted, not just local state.
    await page.reload()
    expect(await names()).toEqual(['Blocked', 'Backlog', 'In Progress', 'Done'])

    // Delete, which asks first because it takes the column's cards with it.
    await page.getByRole('button', { name: 'Column actions for Blocked' }).click()
    await page.getByRole('button', { name: 'Delete column' }).click()
    await page.getByRole('button', { name: 'Really delete' }).click()
    await expect.poll(names).toEqual(['Backlog', 'In Progress', 'Done'])
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

  /**
   * The board must not jump when it loads.
   *
   * The loading state used to render columns with no project header, so the
   * skeleton sat under the app header and the whole board dropped by the
   * header's height — about 120px — the instant the fetch returned. A
   * column-shaped skeleton was carefully avoiding a few pixels of movement
   * inside a very large one.
   *
   * This is only observable with the response held open, which is why it went
   * unnoticed: locally the board reads in single-digit milliseconds, so the
   * wrong layout was on screen for one frame and the jump looked like the page
   * simply appearing.
   */
  test('the board does not jump when it finishes loading', async ({ page }) => {
    await page.goto('/')
    await page.getByRole('button', { name: 'New project' }).click()
    await page.getByLabel('Project name').fill('No jump')
    await page.getByRole('button', { name: 'Create' }).click()
    await page.getByTestId('project-tile').filter({ hasText: 'No jump' }).click()
    await expect(page.locator('[data-column]').first()).toBeVisible()

    // One card, so the loaded board is not showing the empty-board banner —
    // which sits above the columns and would be measured as a "jump" that is
    // really just a different, correct layout.
    await page.locator('[data-column]').first().getByRole('button', { name: '+ Add card' }).click()
    await page.getByPlaceholder('Card title').fill('Anything')
    await page.getByPlaceholder('Card title').press('Enter')
    await expect(page.getByTestId('card').filter({ hasText: 'Anything' })).toBeVisible()
    const url = page.url()

    // Hold the board read open so the skeleton is on screen long enough to measure.
    await page.route('**/api/projects/*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 600))
      await route.continue()
    })

    await page.goto(url)
    const skeleton = page.locator('[data-testid="column-skeleton"]').first()
    await expect(skeleton).toBeVisible()
    const loadingTop = (await skeleton.boundingBox())!.y

    await page.unroute('**/api/projects/*')
    const column = page.locator('[data-column]').first()
    await expect(column).toBeVisible()
    const loadedTop = (await column.boundingBox())!.y

    // A couple of pixels of tolerance for the header's own content settling;
    // what this rules out is the board arriving in a different place entirely.
    expect(Math.abs(loadedTop - loadingTop)).toBeLessThanOrEqual(2)
  })
})
