import { useRef } from 'react'

/**
 * A due date that looks like ours and picks like the platform's.
 *
 * **What was wrong.** This was a bare `<input type="date">` sitting next to the
 * size select — and that select had already been given `appearance-none` and a
 * hand-drawn chevron *specifically* so it would not wear the operating
 * system's arrow. So one row held two controls, one of them ours and one of
 * them Windows'. It also printed `04/09/2026`, which is either the 4th of
 * September or the 9th of April depending on whose machine it is.
 *
 * **What it does now.** The visible control is a button we draw, showing a date
 * written the one way that cannot be misread — `4 Sep 2026`. The native input
 * is still there, and still does the actual picking: `showPicker()` opens the
 * platform's calendar, which is the part worth keeping. Keyboard and screen
 * readers get the real input, which is why it is hidden with `sr-only` rather
 * than `display: none` — a hidden input is not a focusable one, and this
 * control has to stay operable without a mouse.
 *
 * `showPicker()` throws if it is called without a user gesture and does not
 * exist in older browsers; both fall back to focusing the input, which opens
 * the picker on every platform we care about anyway.
 */
export function DateField({
  value,
  onChange,
  label,
}: {
  /** ISO `YYYY-MM-DD`, or null for no date. */
  value: string | null
  onChange: (next: string | null) => void
  label: string
}) {
  const input = useRef<HTMLInputElement>(null)

  const open = () => {
    const el = input.current
    if (!el) return
    try {
      el.showPicker()
    } catch {
      el.focus()
    }
  }

  return (
    <div className="relative">
      <input
        ref={input}
        type="date"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label={label}
        className="peer sr-only"
      />
      <button
        type="button"
        onClick={open}
        // Not a label for the input: clicking a label focuses it, and a focused
        // date input is a different thing from an open picker.
        aria-hidden
        tabIndex={-1}
        /*
         * **`peer-focus-visible`, because the focused element is 1px wide.**
         *
         * The real input is `sr-only` so it stays operable without a mouse —
         * but `sr-only` clips it to a 1×1 box, and a focus ring drawn on a 1×1
         * box is not a visible focus indicator. Tabbing to the due date put the
         * caret somewhere the eye could not follow: measured at 1×1 at
         * (455, 190), with the chip you can actually see wearing no focus state
         * at all. That is WCAG 2.4.7, and the axe scan cannot catch it —
         * the input *has* a ring, it is just invisible.
         *
         * So the chip wears the input's focus for it. `peer` works because the
         * input is the button's previous sibling, and the ring is the same
         * weight the description field's focus border is, for the same reason:
         * whatever is focused should look focused.
         */
        className={`flex h-8 items-center gap-1.5 rounded-control border border-line px-2 text-sm transition-colors hover:border-line-strong peer-focus-visible:border-ink-muted peer-focus-visible:ring-2 peer-focus-visible:ring-ink-muted ${
          value ? 'text-ink' : 'text-ink-faint'
        }`}
      >
        <svg
          viewBox="0 0 16 16"
          className="h-3.5 w-3.5 shrink-0 text-ink-faint"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <rect x="2.25" y="3.25" width="11.5" height="10.5" rx="2" />
          <path d="M2.25 6.5h11.5M5.5 2v2.5M10.5 2v2.5" />
        </svg>
        {value ? formatDate(value) : 'Add date'}
      </button>
      {value && (
        <button
          type="button"
          onClick={() => onChange(null)}
          aria-label={`Clear ${label.toLowerCase()}`}
          className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full border border-line bg-surface text-ink-faint opacity-0 transition-opacity hover:text-ink focus-visible:opacity-100 group-hover/date:opacity-100"
        >
          <svg viewBox="0 0 8 8" className="h-2 w-2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
            <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" />
          </svg>
        </button>
      )}
    </div>
  )
}

/**
 * `4 Sep 2026` — never `04/09/2026`.
 *
 * A numeric month is ambiguous across locales and this app has no locale
 * setting to disambiguate it with. Spelling the month costs a few pixels and
 * removes the question.
 *
 * Built from the parts rather than through `toLocaleDateString`, because the
 * point is that the format does *not* follow the machine.
 */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  if (!y || !m || !d) return iso
  return `${d} ${MONTHS[m - 1]} ${y}`
}
