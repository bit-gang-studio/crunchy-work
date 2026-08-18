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

/**
 * Scan settled UI, never mid-animation.
 *
 * Screens fade in when you switch section, so for 200ms every colour on them is
 * being composited at partial opacity — and axe, measuring what is painted,
 * quite correctly reports the lot as failing contrast. It flagged eight nodes
 * on the board including plain ink on plain surface, which is the tell that the
 * measurement rather than the palette was wrong.
 *
 * Waiting for animations to finish is not softening the gate: a contrast ratio
 * is a property of the resting screen, and a fade that is still running has not
 * shown the user anything to have an opinion about yet.
 */
async function settle(page: Page) {
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running'))
}

async function scan(page: Page, context: string) {
  await settle(page)
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
  await assertNoUnreadableColours(page, `projects list · ${label}`)

  await page.goto(`/projects/${projectId}`)
  await expect(page.getByTestId('card').first()).toBeVisible()
  await scan(page, `board · ${label}`)

  // Menus and popovers are markup that only exists while open, so scanning
  // the closed page says nothing about them.
  // The project name is the switcher's trigger, so that is what opens it.
  await page.getByRole('button', { name: 'A11y', exact: true }).click()
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
  /*
   * **The doc editor gets its own colour check, and it is not redundant.**
   *
   * This used to run once per walk, on the projects list, reasoning that "the
   * tokens are global, so a colour axe cannot read will show up on the first
   * populated screen or not at all". True of our tokens — and the typography
   * plugin is the documented exception to it: `prose` ships its own ink, and it
   * only exists on this screen and inside a card description. The projects list
   * has no prose on it, so the check structurally could not see them.
   *
   * It was not a hypothetical. Measured here before the fix: twelve oklch
   * colours, `oklch(0.371 0 none)` for body text, on the one screen in the app
   * that is mostly text. They happened to resolve to 10.4:1 — but that is the
   * position `ink-faint` was in at 2.6:1, and the whole point of this check is
   * that "happened to be fine" is not a measurement.
   */
  await assertNoUnreadableColours(page, `doc editor · ${label}`)

  // And the card description, which is the same editor on a different screen.
  await page.goto(`/projects/${projectId}`)
  await page.getByTestId('card').first().click()
  await expect(page.getByTestId('card-description')).toBeVisible()
  await assertNoUnreadableColours(page, `card description · ${label}`)
}

/**
 * The empty states, which a seeded scan never reaches.
 *
 * Created over the API rather than through the UI on purpose. Creating a project
 * in the browser seeds it with two cards that teach — see `lib/seedProject.ts` —
 * so the UI flow no longer produces an empty board at all. The API is the honest
 * way to reach the state this test is named after, and it is a state a user does
 * reach: by deleting those cards, or by letting an agent create the project.
 */
async function walkEmptyStates(
  page: Page,
  request: import('@playwright/test').APIRequestContext,
  label: string,
) {
  const project = await request
    .post('/api/projects', { data: { name: `Empty ${label}` } })
    .then((r) => r.json())

  await page.goto(`/projects/${project.id}`)
  await expect(page.getByRole('heading', { name: `Empty ${label}` })).toBeVisible()
  await expect(page.getByTestId('card')).toHaveCount(0)
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

    test('the empty states, which a seeded scan never reaches', async ({ page, request }) => {
      await walkEmptyStates(page, request, size.name)
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

  test('the empty states, in the dark palette', async ({ page, request }) => {
    await walkEmptyStates(page, request, 'dark')
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

  test('Escape closes the card detail, and focus goes back to the card', async ({
    page,
    request,
  }) => {
    const projectId = await seed(request)
    await page.goto(`/projects/${projectId}`)
    await page.getByTestId('card').first().click()
    await expect(page.getByTestId('card-detail')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('card-detail')).toHaveCount(0)

    // Not merely "somewhere" — `document.body` satisfies that and is exactly
    // the failure this is meant to catch. Focus belongs on the card you came
    // from, so the next Tab continues from where you were.
    /*
     * Back on the board, not merely "somewhere" — `document.body` satisfies
     * somewhere, and is exactly the failure this exists to catch: focus lost to
     * the top of the document means the next Tab restarts from the app header
     * rather than continuing from the card you were just on.
     *
     * Which element inside the board takes it depends on where in the card you
     * clicked — the title button if you hit the title, the column otherwise —
     * so this pins the region, which is the part that is a promise.
     */
    const parked = await page.evaluate(() => {
      const el = document.activeElement
      if (!el || el === document.body) return 'BODY'
      return el.closest('[aria-label="Board columns"]') ? 'BOARD' : (el.tagName ?? 'NONE')
    })
    expect(parked).toBe('BOARD')
  })

  /**
   * The card panel says `role="dialog" aria-modal="true"`, which tells assistive
   * tech the rest of the page is inert. Nothing enforced it: Tab walked out of
   * the dialog, through the app header, and into the columns behind the scrim —
   * so the markup made a promise the keyboard broke. Survivable when the panel
   * held three controls; it now holds fifteen.
   */
  test('an open card keeps the keyboard inside it', async ({ page, request }) => {
    const projectId = await seed(request)
    await page.goto(`/projects/${projectId}`)
    await page.getByTestId('card').first().click()
    await expect(page.getByTestId('card-detail')).toBeVisible()

    const inside = async () =>
      page.evaluate(
        () => document.querySelector('[data-testid="card-detail"]')?.contains(document.activeElement) ?? false,
      )

    // Opening lands focus in the dialog rather than leaving it on the board.
    expect(await inside()).toBe(true)

    // More stops than the dialog has, so a leak has somewhere to leak to.
    const labels: string[] = []
    for (let i = 0; i < 24; i++) {
      await page.keyboard.press('Tab')
      expect(await inside()).toBe(true)
      labels.push(await page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? ''))
    }
    // And it is a cycle, not one control swallowing every press.
    expect(new Set(labels).size).toBeGreaterThan(5)

    // Backwards off the top wraps too, rather than stepping out behind the scrim.
    for (let i = 0; i < 30; i++) {
      await page.keyboard.press('Shift+Tab')
      expect(await inside()).toBe(true)
    }
  })
})
