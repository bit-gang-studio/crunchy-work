import { expect, test } from '@playwright/test'
import { atColumnBottom, dragTo, onCard, openHarness, readState } from './drag'

/**
 * The render-loop regression (React error #185).
 *
 * dnd-kit re-measures the dragged card's scrollable ancestors on every preview relocation.
 * Doing that synchronously on each drag-over — cross-column, with many cards of varying
 * height — set up a measure → re-render → measure cascade that tripped React's update limit
 * and killed the board. The fix is coalescing relocations to one per animation frame, so our
 * re-render is decoupled from dnd-kit's measure pass.
 *
 * `?big=1` is the shape that reproduced it: full columns, wrapping titles, real scroll
 * containers. The harness mounts without StrictMode, like the production build where this
 * only ever appeared.
 */
test('repeated cross-column drags on a full board never trip a render loop', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(e.message))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })

  await openHarness(page, '?big=1')
  await expect(page.locator('[data-card="T1"]')).toBeVisible()

  // Several cross-column round trips, the motion that produced the cascade.
  await dragTo(page, 'T2', onCard(page, 'D2'))
  await dragTo(page, 'T3', atColumnBottom(page, 'doing'), true)
  await dragTo(page, 'D1', onCard(page, 'T1', 'top'))
  await dragTo(page, 'E1', onCard(page, 'D3'))

  // The board is still alive and rendering.
  await expect(page.locator('[data-testid="kanban-board"]')).toBeVisible()
  const state = await readState(page)
  expect(Object.values(state).flat().length).toBe(31)

  // The ErrorBoundary backstop never had to catch anything.
  await expect(page.getByText('Something broke rendering this view.')).toHaveCount(0)

  const fatal = errors.filter((e) => /Minified React error #185|Maximum update depth/.test(e))
  expect(fatal).toEqual([])
})
