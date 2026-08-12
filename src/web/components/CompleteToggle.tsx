/**
 * The per-card completion tick.
 *
 * It lives inside a draggable card, so it must stop `mousedown` **and**
 * `touchstart` — not just `pointerdown`. The board uses separate Mouse and
 * Touch sensors (so touch can require a press-delay while mouse stays instant),
 * and each listens to its own event; stopping only `pointerdown` leaves a press
 * on the tick starting a drag.
 */
export function CompleteToggle({
  completed,
  onToggle,
  className,
}: {
  completed: boolean
  onToggle?: () => void
  className?: string
}) {
  const stop = (e: { stopPropagation(): void }) => e.stopPropagation()
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={completed}
      aria-label={completed ? 'Mark as not done' : 'Mark as done'}
      disabled={!onToggle}
      onMouseDown={stop}
      onTouchStart={stop}
      onClick={(e) => {
        e.stopPropagation()
        onToggle?.()
      }}
      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] leading-none ${
        completed
          ? 'border-neutral-800 bg-neutral-800 text-white'
          : 'border-neutral-300 bg-white text-transparent hover:border-neutral-500'
      } ${className ?? ''}`}
    >
      ✓
    </button>
  )
}
