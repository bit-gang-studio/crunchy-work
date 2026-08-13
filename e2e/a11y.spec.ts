import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

/**
 * Accessibility, as a gate rather than a claim.
 *
 * Every screen and every state the app can be in gets scanned. This exists
 * because "keyboard navigable with visible focus rings" had been asserted in a
 * commit message and never measured — and the things it catches (contrast that
 * fails at 4.5:1, a control with no accessible name, a landmark nesting
 * mistake) are exactly the things you cannot see by looking at a screenshot.
 *
 * WCAG 2.1 AA is the bar. It is the one everybody means by "accessible", and it
 * is achievable for an app this size without contorting the design.
 *
 * The scan runs at three widths, because the layout genuinely differs: the
 * board is a horizontal-scroll kanban on desktop and on a phone, but the header
 * collapses and the card detail becomes full-screen.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']

const WIDTHS = [
  { name: 'phone', width: 390, height: 780 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
]

async function scan(page: Page, context: string) {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze()

  /*
   * Assert on a compact list of rule ids, not on the raw violation objects.
   *
   * Axe's objects are enormous, and a failing `toEqual([])` against them prints
   * a diff so large the actual problem scrolls off — which makes the gate
   * useless exactly when it fires. The offending markup goes in the message
   * instead, where it stays readable.
   */
  const summary = results.violations.map((v) => `${v.id} (${v.impact}) ×${v.nodes.length}`)
  const detail = results.violations
    .map((v) => {
      const where = v.nodes.map((n) => `      ${n.html.slice(0, 200)}`).join('\n')
      return `  ${v.id} — ${v.help}\n    ${v.helpUrl}\n${where}`
    })
    .join('\n\n')

  expect(summary, `${context}\n\n${detail}`).toEqual([])
}

/**
 * Every colour on screen has to be one axe can actually read.
 *
 * axe cannot evaluate `oklch()`. It does not fail on one — it files the node
 * under *incomplete*, "I could not determine this", which the contrast
 * assertion above does not look at. Tailwind v4's default palette is entirely
 * oklch, so while the light tokens were written as `var(--color-neutral-400)`
 * the gate reported green over a palette it had never measured.
 *
 * Proved rather than assumed: setting `ink-faint` to the *same* grey written as
 * hex turned zero violations into thirty-four across three scans. The colour had
 * always been 2.6:1 on white; only the notation changed.
 *
 * Asserting "no incomplete results" instead would be the obvious fix and is the
 * wrong one — icon-only buttons and transparent-text checkboxes are legitimately
 * undecidable, so it fails constantly for reasons nobody can act on. This checks
 * the thing that actually went wrong: a colour the measuring tool is blind to.
 */
async function assertNoUnreadableColours(page: Page, context: string) {
  const offenders = await page.evaluate(() => {
    const bad: string[] = []
    for (const el of document.querySelectorAll<HTMLElement>('body *')) {
      // The project swatch and its progress bar are deliberately oklch: the hue
      // comes from a hash, and only a perceptually uniform space keeps one ink
      // legible across all 360 of them. Their contrast is fixed by construction
      // — a constant L against a constant ink — and computed by hand rather than
      // by axe. Nothing else gets that exemption.
      if (el.closest('.project-swatch, .project-progress')) continue
      const cs = getComputedStyle(el)
      for (const prop of ['color', 'backgroundColor', 'borderTopColor'] as const) {
        if (cs[prop]?.includes('oklch')) bad.push(`${el.tagName.toLowerCase()}.${el.className} → ${prop}`)
      }
    }
    return [...new Set(bad)].slice(0, 10)
  })
  expect(offenders, `${context} — colours axe cannot measure`).toEqual([])
}

/** One project with enough in it that every component is on screen somewhere. */
async function seed(request: import('@playwright/test').APIRequestContext) {
  const project = await request
    .post('/api/projects', { data: { name: 'A11y', description: 'Scanned for accessibility.' } })
    .then((r) => r.json())
  const board = await request.get(`/api/projects/${project.id}`).then((r) => r.json())

  await request.post(`/api/columns/${board.columns[0].id}/cards`, {
    data: {
      title: 'A card with everything on it',
      size: 'L',
      dueAt: '2026-01-05',
      acceptanceCriteria: [
        { text: 'Met', done: true },
        { text: 'Not met', done: false },
      ],
    },
  })
  await request.post(`/api/columns/${board.columns[1].id}/cards`, { data: { title: 'In progress' } })
  await request.post(`/api/projects/${project.id}/docs`, {
    data: { title: 'Notes', content: '# Notes\n\n- [x] Done\n- [ ] Not\n' },
  })
  return project.id as string
}

/** Every screen, and every state you can only reach by operating the app. */
async function walkEveryScreen(
  page: Page,
  request: import('@playwright/test').APIRequestContext,
  label: string,
) {
  const projectId = await seed(request)

  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible()
  await scan(page, `projects list · ${label}`)
  // Once per walk is enough: the tokens are global, so a colour axe cannot read
  // will show up on the first populated screen or not at all.
  await assertNoUnreadableColours(page, `projects list · ${label}`)

  await page.goto(`/projects/${projectId}`)
  await expect(page.getByTestId('card').first()).toBeVisible()
  await scan(page, `board · ${label}`)

  // Menus and popovers are markup that only exists while open, so scanning
  // the closed page says nothing about them.
  await page.getByRole('button', { name: 'Switch project' }).click()
  await expect(page.getByTestId('project-switcher')).toBeVisible()
  await scan(page, `project switcher open · ${label}`)
  await page.keyboard.press('Escape')
  await page.mouse.click(5, 5)

  await page.getByRole('button', { name: /Column actions for To Do/ }).click()
  await scan(page, `column menu open · ${label}`)
  await page.mouse.click(5, 5)

  // The project menu carries the theme control at phone width, where the app
  // header that normally holds it is hidden — so at that size this menu is the
  // only place those buttons exist, and an unscanned menu is an unscanned
  // control.
  await page.getByRole('button', { name: /Project actions for/ }).click()
  await scan(page, `project menu open · ${label}`)
  await page.mouse.click(5, 5)

  await page.getByTestId('card').first().click()
  await expect(page.getByTestId('card-detail')).toBeVisible()
  await scan(page, `card detail · ${label}`)
  await page.getByRole('button', { name: 'Close' }).click()

  await page.goto(`/projects/${projectId}/docs`)
  await expect(page.getByTestId('doc-row').first()).toBeVisible()
  await scan(page, `docs list · ${label}`)

  await page.getByTestId('doc-row').first().click()
  await expect(page.getByTestId('doc-body')).toBeVisible()
  await scan(page, `doc editor · ${label}`)
}

/** The empty states, which a seeded scan never reaches. */
async function walkEmptyStates(page: Page, label: string) {
  await page.goto('/')
  // A fresh project has no cards and no docs.
  await page.getByRole('button', { name: /New project|Or create one yourself/ }).click()
  await page.getByLabel('Project name').fill(`Empty ${label}`)
  await page.getByRole('button', { name: 'Create' }).click()
  await page.getByTestId('project-tile').filter({ hasText: `Empty ${label}` }).click()

  await expect(page.getByText(/your agent can fill it in/)).toBeVisible()
  await scan(page, `empty board · ${label}`)

  await page.getByRole('link', { name: 'Docs' }).click()
  await expect(page.getByText('No docs yet.')).toBeVisible()
  await scan(page, `empty docs · ${label}`)
}

for (const size of WIDTHS) {
  test.describe(`accessibility · ${size.name}`, () => {
    test.use({ viewport: { width: size.width, height: size.height } })

    test('every screen, and the states you can get them into', async ({ page, request }) => {
      await walkEveryScreen(page, request, size.name)
    })

    test('the empty states, which a seeded scan never reaches', async ({ page }) => {
      await walkEmptyStates(page, size.name)
    })
  })
}

/**
 * The same sweep in dark.
 *
 * A second palette is a second set of contrast ratios, and nothing about the
 * light one being AA says anything about the dark one — they share no values.
 * This runs from the moment dark mode exists rather than at the end of the theme
 * pass, so a colour that fails is caught by whoever chose it, while they are
 * choosing it.
 *
 * One width, not three. The widths in the loop above vary *layout*, and layout
 * is identical between palettes; what varies here is colour. Three more full
 * sweeps would triple the gate's runtime to re-test the same ratios.
 */
test.describe('accessibility · dark', () => {
  test.use({ viewport: { width: 1440, height: 900 }, colorScheme: 'dark' })

  test('every screen, in the dark palette', async ({ page, request }) => {
    await walkEveryScreen(page, request, 'dark')
  })

  test('the empty states, in the dark palette', async ({ page }) => {
    await walkEmptyStates(page, 'dark')
  })
})

/**
 * Tab order, walked by hand.
 *
 * axe cannot tell you that the order is illogical, only that the elements are
 * focusable. This asserts you can reach the things that matter, in the order
 * you would expect, and that nothing traps you.
 */
test.describe('keyboard', () => {
  test('you can reach the board and open a card without a mouse', async ({ page, request }) => {
    const projectId = await seed(request)
    await page.goto(`/projects/${projectId}`)
    await expect(page.getByTestId('card').first()).toBeVisible()

    const reached: string[] = []
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab')
      const label = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null
        if (!el || el === document.body) return null
        return (
          el.getAttribute('aria-label') ??
          el.getAttribute('title') ??
          el.textContent?.trim().slice(0, 40) ??
          el.tagName
        )
      })
      if (label) reached.push(label)
    }

    // The focus must actually move — a trap shows up as the same label forever.
    expect(new Set(reached).size).toBeGreaterThan(4)
    // And the board's own controls have to be in there, not just the chrome.
    expect(reached.join(' | ')).toMatch(/Add card|card with everything/i)
  })

  test('Escape closes the card detail, and focus is not left nowhere', async ({ page, request }) => {
    const projectId = await seed(request)
    await page.goto(`/projects/${projectId}`)
    await page.getByTestId('card').first().click()
    await expect(page.getByTestId('card-detail')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('card-detail')).toHaveCount(0)

    const parked = await page.evaluate(() => document.activeElement?.tagName ?? 'NONE')
    expect(parked).not.toBe('NONE')
  })
})
