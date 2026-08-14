import { CopyPrompt } from './CopyPrompt'
import { Link } from 'react-router-dom'

/**
 * Loading, error and empty — the three states every async surface has and none
 * of them had been designed.
 *
 * They live together in one file on purpose. Written per-screen they drift:
 * one says "Loading…", the next spins, a third shows nothing at all, and the
 * error states were unstyled red text. A user reads that as three different
 * levels of broken.
 */

/**
 * A skeleton, not a spinner.
 *
 * A spinner says "something is happening"; a skeleton says "something is
 * happening *and here is the shape it will take*", so the layout does not jump
 * when the data lands. The board read is a handful of milliseconds locally, so
 * this is mostly seen for an instant — which is exactly why it must not be a
 * flash of centred spinner in a different place from the content.
 */
export function Loading({
  label = 'Loading',
  rows = 3,
  /**
   * `compact` swaps card-shaped placeholders for line-shaped ones, for the
   * inside of a popover rather than a screen. Same component because the
   * decision — a shape, never a word, and the same `role="status"` wiring — is
   * the same one; only the shape it is standing in for differs.
   */
  compact = false,
}: {
  label?: string
  rows?: number
  compact?: boolean
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={compact ? 'space-y-1.5 px-2 py-1.5' : 'space-y-3'}
    >
      <span className="sr-only">{label}…</span>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          aria-hidden
          className={
            compact
              ? 'h-4 animate-pulse rounded bg-hover'
              : 'h-16 animate-pulse rounded-card border border-line bg-surface'
          }
          // Descending width reads as a list of things rather than a grey slab.
          style={{ width: compact ? `${75 - i * 15}%` : `${100 - i * 6}%` }}
        />
      ))}
    </div>
  )
}

/**
 * Something failed. Says what, and offers the way back.
 *
 * `retry` is offered whenever the caller can actually retry — an error with no
 * exit is a dead end, and "go home" is not the same as "try that again".
 */
export function ErrorState({
  message,
  retry,
  backTo,
  backLabel = 'Back to projects',
}: {
  message: string
  retry?: () => void
  backTo?: string
  backLabel?: string
}) {
  return (
    <div
      role="alert"
      className="rounded-panel border border-danger/30 bg-danger-soft p-4 text-sm"
      data-testid="error-state"
    >
      <p className="font-medium text-danger">That didn&apos;t work.</p>
      <p className="mt-1 text-danger">{message}</p>
      <div className="mt-3 flex items-center gap-3">
        {retry && (
          <button
            type="button"
            onClick={retry}
            className="rounded-control bg-danger px-3 py-1.5 text-xs font-medium text-danger-ink"
          >
            Try again
          </button>
        )}
        {backTo && (
          <Link to={backTo} className="text-xs text-danger underline">
            {backLabel}
          </Link>
        )}
      </div>
    </div>
  )
}

/**
 * Nothing here yet — and what to do about it.
 *
 * Every empty state in Crunchy teaches, because the product's whole pitch is
 * that you do not have to build the board yourself. `prompt` is the line to
 * paste at an agent; it is the fastest possible demonstration of what this is
 * for, and it costs the user nothing to try.
 */
export function EmptyState({
  title,
  children,
  prompt,
  action,
}: {
  title: string
  children?: React.ReactNode
  prompt?: string
  action?: React.ReactNode
}) {
  return (
    <div className="rounded-panel border border-dashed border-line-strong bg-surface p-6">
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="mt-1 text-sm text-ink-muted">{children}</div>}
      {/* The same control the empty board uses, for the same reason: a line you
          are told to paste needs a button that pastes it. */}
      {prompt && (
        <div className="mt-3">
          <CopyPrompt text={prompt} />
        </div>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
