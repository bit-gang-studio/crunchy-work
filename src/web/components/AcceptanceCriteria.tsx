import { useState, type FormEvent } from 'react'
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
  const met = criteria.filter((c) => c.done).length

  function add(e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text) return
    onChange([...criteria, { text, done: false }])
    setDraft('')
  }

  const toggle = (index: number) =>
    onChange(criteria.map((c, i) => (i === index ? { ...c, done: !c.done } : c)))

  const remove = (index: number) => onChange(criteria.filter((_, i) => i !== index))

  return (
    <section data-testid="acceptance-criteria">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-medium text-ink-muted">Done when</span>
        {criteria.length > 0 && (
          <span className="text-xs text-ink-faint">
            {met}/{criteria.length}
          </span>
        )}
      </div>

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
      <ul className="mt-1 space-y-1">
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
              className="mt-1 h-3.5 w-3.5 shrink-0 accent-accent"
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

      <form onSubmit={add} className="mt-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a criterion…"
          aria-label="Add a criterion"
          className="w-full rounded-control border border-line-strong px-2 py-1.5 text-sm focus:border-ink-muted focus:outline-none"
        />
      </form>
    </section>
  )
}
