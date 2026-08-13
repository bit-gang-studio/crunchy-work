/**
 * The switch for finished work.
 *
 * Two rules make hiding content safe, and this is built on both.
 *
 * **The control that hides things is visible.** A board quietly showing fewer
 * cards than it has is a board lying to you; a board with "3 done" sitting in
 * its chrome is a board you can interrogate. This is why the filter is not in
 * the ⋯ menu, where it would be a setting you cannot see the effect of.
 *
 * **It says how many.** "Show completed" alone leaves you wondering whether
 * anything is behind it. The count is the difference between a control you
 * ignore and one you trust.
 *
 * It disappears entirely when there is nothing completed, because a filter with
 * nothing to filter is chrome that has to be read and then dismissed.
 */
export function CompletedFilter({
  showing,
  hidden,
  onChange,
}: {
  showing: boolean
  /** How many cards the filter is currently holding back. */
  hidden: number
  onChange: (next: boolean) => void
}) {
  if (!showing && hidden === 0) return null

  return (
    <button
      type="button"
      role="switch"
      aria-checked={showing}
      onClick={() => onChange(!showing)}
      className={`flex items-center gap-1.5 rounded-control px-2 py-1 text-xs transition-colors ${
        showing ? 'bg-hover text-ink' : 'text-ink-faint hover:bg-hover hover:text-ink'
      }`}
    >
      <svg
        viewBox="0 0 16 16"
        className="h-3.5 w-3.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 8.5 6.2 11.5 13 4.5" />
      </svg>
      {showing ? 'Hide completed' : `Show completed${hidden ? ` (${hidden})` : ''}`}
    </button>
  )
}
