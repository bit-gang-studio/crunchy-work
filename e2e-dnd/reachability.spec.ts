import { expect, test } from '@playwright/test'
import { atColumnBottom, dragTo, onCard, openHarness, readState } from './drag'

/**
 * Every slot must be reachable.
 *
 * The bugs this guards were reported as "can't drop into the first position of another
 * column" and "can't drop between two specific cards after crossing columns". The rule the
 * engine settled on: hovering a card drops the dragged card next to it — before it when
 * entering a new column or dragging up, after it when dragging down past its midpoint — and
 * the empty space below a column drops it last.
 */
test.describe('every slot is reachable', () => {
  test.beforeEach(async ({ page }) => {
    await openHarness(page)
    await expect(page.locator('[data-card="T1"]')).toBeVisible()
  })

  test('cross-column, first slot — hover the first card', async ({ page }) => {
    await dragTo(page, 'T1', onCard(page, 'D1'))
    expect((await readState(page)).doing).toEqual(['T1', 'D1', 'D2', 'D3'])
  })

  test('cross-column, between 1st and 2nd — hover the second card', async ({ page }) => {
    await dragTo(page, 'T1', onCard(page, 'D2'))
    expect((await readState(page)).doing).toEqual(['D1', 'T1', 'D2', 'D3'])
  })

  test('cross-column, between 2nd and 3rd — hover the third card', async ({ page }) => {
    await dragTo(page, 'T1', onCard(page, 'D3'))
    expect((await readState(page)).doing).toEqual(['D1', 'D2', 'T1', 'D3'])
  })

  test('cross-column, last slot — the column bottom', async ({ page }) => {
    await dragTo(page, 'T1', atColumnBottom(page, 'doing'), true) // reaim: the column grows
    expect((await readState(page)).doing).toEqual(['D1', 'D2', 'D3', 'T1'])
  })

  test('into an empty column', async ({ page }) => {
    await dragTo(page, 'T1', atColumnBottom(page, 'done'))
    expect((await readState(page)).done).toEqual(['T1'])
  })

  test('same-column, first slot — hover T1 on its top half', async ({ page }) => {
    await dragTo(page, 'T3', onCard(page, 'T1', 'top'))
    expect((await readState(page)).todo).toEqual(['T3', 'T1', 'T2', 'T4'])
  })

  test('same-column, between T2 and T3 — drag down onto T2 bottom half', async ({ page }) => {
    await dragTo(page, 'T1', onCard(page, 'T2', 'bottom'))
    expect((await readState(page)).todo).toEqual(['T2', 'T1', 'T3', 'T4'])
  })

  test('same-column, last slot — the column bottom', async ({ page }) => {
    await dragTo(page, 'T1', atColumnBottom(page, 'todo'))
    expect((await readState(page)).todo).toEqual(['T2', 'T3', 'T4', 'T1'])
  })
})
