/**
 * Swallow the single `click` the browser fires right after a drag ends, so a drag never also
 * fires the dragged element's own click handler (opening the card's detail). It's registered on
 * `document` in the capture phase — NOT on the drag container — because the drop's optimistic
 * re-render moves the card's DOM node, so a container-scoped handler misses the click entirely
 * (a real bug hit on Crunchy Team). Document-level capture is immune to that reflow: it sees the
 * click first, kills it, and removes itself. A 0ms fallback disarms it if the drag produced no
 * trailing click (e.g. released over empty space), so a later genuine click is never wrongly
 * eaten — the trailing click always fires before that macrotask.
 */
export function suppressNextClick() {
  const swallow = (e: Event) => {
    e.preventDefault()
    e.stopPropagation()
    ;(e as MouseEvent).stopImmediatePropagation()
  }
  document.addEventListener('click', swallow, { capture: true, once: true })
  setTimeout(() => document.removeEventListener('click', swallow, true), 0)
}
