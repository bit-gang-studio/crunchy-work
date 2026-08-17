import { useCallback, useEffect, useState } from 'react'

/**
 * Dark mode — the mechanism, not the palette.
 *
 * The token layer already did the hard part: every colour in the app resolves
 * through a role token (`--color-surface`, `--color-ink`, `--color-line`), so a
 * second theme is a second set of *values* plus a way to choose between them.
 * No component knows this file exists.
 *
 * The values themselves are deliberately provisional — see index.css. Light and
 * dark get designed together in the theme pass, because a dark palette
 * retrofitted onto a light-first one looks exactly like what it is.
 *
 * Three choices, not two. "System" has to be a real, sticky state rather than
 * the absence of a choice: a user who wants to follow their OS should keep
 * following it when the OS changes at sunset, and that is not the same thing as
 * having once picked whatever it happened to be that morning.
 */
export type ThemeChoice = 'light' | 'dark' | 'system'
export type Theme = 'light' | 'dark'

export const THEME_KEY = 'crunchy.theme'

/** Anything unrecognised means "system" — including nothing stored at all. */
export function parseChoice(raw: unknown): ThemeChoice {
  return raw === 'light' || raw === 'dark' || raw === 'system' ? raw : 'system'
}

export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): Theme {
  return choice === 'system' ? (prefersDark ? 'dark' : 'light') : choice
}

/*
 * localStorage throws rather than no-ops in a few real situations (Safari with
 * cookies blocked, an iframe with third-party storage denied). A theme
 * preference is not worth a white screen, so both directions swallow it and the
 * app falls back to following the system.
 */
function readChoice(): ThemeChoice {
  try {
    return parseChoice(localStorage.getItem(THEME_KEY))
  } catch {
    return 'system'
  }
}

function writeChoice(choice: ThemeChoice) {
  try {
    localStorage.setItem(THEME_KEY, choice)
  } catch {
    /* preference simply won't survive the reload */
  }
}

/** How long the cross-fade runs. The value itself lives in `index.css`. */
export const THEME_SHIFT_MS = 220

/** Silences every component's own colour transition while the cross-fade runs. */
export const THEME_SHIFT_CLASS = 'theme-shifting'

/**
 * Only a *change between two known themes* animates.
 *
 * Two cases must not: the first apply after boot, where `index.html` has
 * already stamped the attribute before paint and React is merely agreeing with
 * it — animating there would fade the whole app in from the wrong palette on
 * every load, which is worse than the flash the inline script exists to
 * prevent. And any apply where the value is unchanged, which happens on every
 * `prefers-color-scheme` event while the choice is explicit.
 */
export function shouldAnimateShift(previous: string | undefined, next: Theme): boolean {
  return previous === 'light' || previous === 'dark' ? previous !== next : false
}

/**
 * Chrome, Edge and Safari have this; where it is missing the theme just changes.
 *
 * `ready` is declared even though nothing here awaits it, because it is a
 * promise the browser *rejects*: skip a transition — toggle twice before the
 * first finishes, or change theme on a hidden tab — and it rejects with
 * `AbortError: Transition was skipped`. Handling only `finished` leaves that
 * rejection unhandled, which surfaces as a console error on an ordinary click
 * and would page anyone who later wires up error reporting. Typing it is what
 * makes it possible to attach a handler at all.
 */
type WithViewTransition = Document & {
  startViewTransition?: (update: () => void) => {
    finished: Promise<void>
    ready: Promise<void>
  }
}

/**
 * `data-theme` on the root element is what the CSS keys off. It is set for
 * *both* themes, not just dark, so an explicit "light" still wins over a system
 * that prefers dark — which is the whole point of choosing.
 *
 * The transition is switched on for the length of the change and then switched
 * off again, rather than living permanently on every element. Permanent is the
 * obvious implementation and it is wrong three ways: it would re-time every
 * hover in the app on top of the deliberate `transition-colors` those controls
 * already carry, it would animate colour during a drag — where the harness
 * measures a lifted card the instant it is picked up — and it would make the
 * first paint fade rather than simply be correct.
 */
export function applyTheme(theme: Theme) {
  const root = document.documentElement
  const set = () => {
    root.dataset.theme = theme
  }

  // A hidden tab has nobody watching and throttles its frames: change it now and
  // let it simply be right when the tab comes back.
  const animate = shouldAnimateShift(root.dataset.theme, theme) && !document.hidden
  const start = (document as WithViewTransition).startViewTransition

  if (!animate || typeof start !== 'function') {
    set()
    return
  }

  /*
   * One cross-fade of the whole page, not a transition per element.
   *
   * Every colour here resolves through a role token, so a palette swap repaints
   * the entire document in a single frame — which is the one case view
   * transitions exist for. The browser snapshots before and after and fades
   * between the two images, so every surface and every piece of text is at the
   * same point of the same curve because they are literally the same animation.
   *
   * The per-element version of this is in the git history and it did not work:
   * giving an element a `transition-property` in the same recalculation that
   * changes its colour makes the browser cancel and restart that transition
   * every frame, so anything without a `transition-colors` utility of its own
   * crawled while its neighbours faded.
   *
   * The class goes on inside the callback so the new palette is computed with
   * every component's own colour transition already suppressed — otherwise 65
   * of them run underneath the cross-fade, finish early, and show through.
   */
  const transition = start.call(document, () => {
    root.classList.add(THEME_SHIFT_CLASS)
    set()
  })

  const done = () => root.classList.remove(THEME_SHIFT_CLASS)
  transition.finished.then(done, done)

  /*
   * A skipped transition rejects `ready`, and a rejection nobody catches is a
   * console error on a button press. Skipping is normal, not exceptional — a
   * second toggle before the first settles is the obvious way to reach it — so
   * this is swallowed rather than reported. `finished` above still resolves and
   * still takes the class off, which is the part that matters.
   */
  transition.ready.catch(() => {})
}

export function useTheme() {
  const [choice, setChoice] = useState<ThemeChoice>(readChoice)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => applyTheme(resolveTheme(choice, media.matches))
    apply()
    // Subscribed even when the choice is explicit: `apply` then recomputes the
    // same answer, which is cheaper than getting the subscribe/unsubscribe
    // bookkeeping wrong. This is what makes "system" keep tracking the OS
    // rather than latching to whatever it was when the tab opened.
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [choice])

  const choose = useCallback((next: ThemeChoice) => {
    writeChoice(next)
    setChoice(next)
  }, [])

  return { choice, choose }
}
