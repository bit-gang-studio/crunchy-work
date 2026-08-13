import { useEffect, useRef, useState } from 'react'

/**
 * A destructive action that asks first.
 *
 * Deleting a card or a document is the only thing in Crunchy that can destroy
 * work irrecoverably — there is no trash and no undo — and it was a single
 * click. That is the kind of accident that loses someone on their first real
 * session.
 *
 * It confirms **inline** rather than in a dialog, deliberately: the card detail
 * is already a modal, and a modal opened over a modal is both an accessibility
 * problem and a focus-management one. Two clicks, in place, no nesting.
 *
 * The confirmation times out on its own, so an armed button left alone can't be
 * hit later by accident.
 */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = 'Really delete',
  timeoutMs = 4000,
  className,
}: {
  onConfirm: () => void | Promise<void>
  children: React.ReactNode
  confirmLabel?: string
  timeoutMs?: number
  className?: string
}) {
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!armed) return
    timer.current = setTimeout(() => setArmed(false), timeoutMs)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [armed, timeoutMs])

  if (!armed) {
    return (
      <button
        type="button"
        onClick={() => setArmed(true)}
        className={className ?? 'rounded-control px-3 py-1.5 text-sm text-danger hover:bg-danger-soft'}
      >
        {children}
      </button>
    )
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        autoFocus
        onClick={() => void onConfirm()}
        className="rounded-control bg-danger px-3 py-1.5 text-sm font-medium text-danger-ink hover:bg-danger"
      >
        {confirmLabel}
      </button>
      <button
        type="button"
        onClick={() => setArmed(false)}
        className="rounded-control px-2 py-1.5 text-sm text-ink-muted hover:text-ink"
      >
        Cancel
      </button>
    </span>
  )
}
