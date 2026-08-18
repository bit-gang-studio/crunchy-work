import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { AcceptanceCriterion } from '../../shared/types'

/**
 * The "done when…" checklist.
 *
 * It is advisory on purpose: ticking every line does not complete the card, and
 * completing the card does not tick the lines. They answer different questions —
 * "is the work finished?" versus "did we agree what finished meant?" — and
 * coupling them would quietly destroy the second one.
 *
 * Edits replace the whole list rather than patching an item, because the caller
 * always has the full set on screen and the lines carry no ids to patch by.
 */
export function AcceptanceCriteria({
  criteria,
  onChange,
}: {
  criteria: AcceptanceCriterion[]
  onChange: (next: AcceptanceCriterion[]) => void
}) {
  const [draft, setDraft] = useState('')
  /*
   * Adding is a secondary action and should not wear primary furniture.
   *
   * It was a permanent full-width bordered input, which on an empty card was the
   * single most prominent thing in the modal — a 540px field inviting you to
   * write a criterion before you had written the card. It is a quiet "+ Add"
   * until you mean it.
   */
  const [adding, setAdding] = useState(false)
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (adding) field.current?.focus()
  }, [adding])

  const met = criteria.filter((c) => c.done).length

  function add(e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    onChange([...criteria, { text, done: false }])
    setDraft('')
    // Stay open: adding criteria is something you do in a run of three or four,
    // not once. Escape or a blur on an empty field closes it.
    field.current?.focus()
  }

  const toggle = (index: number) =>
    onChange(criteria.map((c, i) => (i === index ? { ...c, done: !c.done } : c)))

  const remove = (index: number) => onChange(criteria.filter((_, i) => i !== index))

  return (
    /*
     * The same container as the description, because they are the same kind of
     * thing: two blocks of what the card *says*. One was a bordered field with a
     * header strip and the other was bare text on the panel, so two peers read
     * as a form field and a caption — which is most of what made the modal feel
     * assembled rather than designed.
     *
     * The header strip is the counterpart of the editor's toolbar: same height,
     * same hairline, same job of labelling the box it sits on.
     */
    <section
      data-testid="acceptance-criteria"
      className="rounded-control border border-line transition-colors focus-within:border-ink-muted hover:border-line-strong"
    >
      <div className="flex items-baseline justify-between border-b border-line px-3 py-1.5">
        <span className="text-xs font-medium text-ink-muted">Done when</span>
        {criteria.length > 0 && (
          <span className="text-xs text-ink-faint">
            {met}/{criteria.length}
          </span>
        )}
      </div>
      <div className="px-2 py-1.5">

      {/*
        * Each row is a row: it has its own hover, and the remove control only
        * appears on it.
        *
        * The ✕ used to sit permanently at the right edge, which in a 576px
        * modal put it some 400px from the words it deletes — a destructive
        * control, always visible, attached to nothing the eye had grouped it
        * with. On hover, or on keyboard focus (which is why it is `opacity`
        * and not `hidden`), it belongs to the line under the pointer, and the
        * list at rest is just the criteria.
        */}
      <ul className="space-y-0.5">
        {criteria.map((criterion, index) => (
          <li
            key={index}
            className="group flex items-start gap-2 rounded-control px-1 py-0.5 hover:bg-hover"
          >
            <input
              type="checkbox"
              checked={criterion.done}
              onChange={() => toggle(index)}
              aria-label={criterion.text}
              className="tick mt-1"
            />
            <span className={`flex-1 text-sm ${criterion.done ? 'text-ink-faint line-through' : ''}`}>
              {criterion.text}
            </span>
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`Remove "${criterion.text}"`}
              className="shrink-0 rounded p-0.5 text-ink-faint opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
            >
              <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
                <path d="M4 4l8 8M12 4l-8 8" />
              </svg>
            </button>
          </li>
        ))}
      </ul>

      {adding ? (
        <form onSubmit={add} className="mt-1">
          <input
            ref={field}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                /*
                 * Stop it here. `CardDetail` listens for Escape on the document
                 * so it works wherever focus is, which means an unhandled
                 * Escape in this field closed the entire card — you dismissed a
                 * one-line input and lost the modal. Innermost thing closes
                 * first, which is what Escape means everywhere else.
                 */
                e.stopPropagation()
                setDraft('')
                setAdding(false)
              }
            }}
            // Closing on an empty blur is what makes the quiet state the resting
            // state: click away without typing and the field was never there.
            onBlur={() => {
              if (!draft.trim()) setAdding(false)
            }}
            placeholder="Done when…"
            aria-label="Add a criterion"
            className="w-full rounded-control border border-line-strong px-2 py-1.5 text-sm focus:border-ink-muted focus:outline-none"
          />
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={`flex items-center gap-1.5 rounded-control py-1 pl-1 pr-2 text-sm text-ink-faint transition-colors hover:text-ink ${
            criteria.length ? 'mt-0.5' : 'mt-1'
          }`}
        >
          <svg
            viewBox="0 0 14 14"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M7 2.5v9M2.5 7h9" />
          </svg>
          Add a criterion
        </button>
      )}
      </div>
    </section>
  )
}
