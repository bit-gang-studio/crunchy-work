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

/**
 * `data-theme` on the root element is what the CSS keys off. It is set for
 * *both* themes, not just dark, so an explicit "light" still wins over a system
 * that prefers dark — which is the whole point of choosing.
 */
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
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
