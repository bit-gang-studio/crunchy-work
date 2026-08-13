import { useEffect } from 'react'

const NAME = 'Crunchy'

/**
 * What the browser tab says.
 *
 * Every screen said "Crunchy", which is useless at exactly the moment a title
 * matters: when the app is one of nine tabs and you are looking for the board
 * you left open. It is also what a bookmark and a window-switcher entry get.
 *
 * Most specific part first, because tabs truncate from the right — "Brief ·
 * Crunchy Work · …" survives a narrow tab, "Crunchy · Crunchy Work · Brief"
 * does not. Falsy parts drop out, so a screen can pass data that has not
 * loaded yet and get a sensible title until it does.
 */
export function useDocumentTitle(...parts: (string | undefined | null | false)[]) {
  const title = [...parts.filter(Boolean), NAME].join(' · ')
  useEffect(() => {
    document.title = title
  }, [title])
}
