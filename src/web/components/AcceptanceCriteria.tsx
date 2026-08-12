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
        <span className="text-xs font-medium text-neutral-500">Done when</span>
        {criteria.length > 0 && (
          <span className="text-xs text-neutral-400">
            {met}/{criteria.length}
          </span>
        )}
      </div>

      <ul className="mt-1 space-y-1">
        {criteria.map((criterion, index) => (
          <li key={index} className="group flex items-start gap-2">
            <input
              type="checkbox"
              checked={criterion.done}
              onChange={() => toggle(index)}
              aria-label={criterion.text}
              className="mt-1 h-3.5 w-3.5 shrink-0 accent-neutral-800"
            />
            <span className={`flex-1 text-sm ${criterion.done ? 'text-neutral-400 line-through' : ''}`}>
              {criterion.text}
            </span>
            <button
              type="button"
              onClick={() => remove(index)}
              aria-label={`Remove "${criterion.text}"`}
              className="shrink-0 px-1 text-xs text-neutral-300 hover:text-red-700 group-hover:text-neutral-500"
            >
              ✕
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
          className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm focus:border-neutral-500 focus:outline-none"
        />
      </form>
    </section>
  )
}
