import { useEffect, useRef, useState } from 'react'
import { SIZES, type Card, type Size } from '../../shared/types'
import { api } from '../lib/api'
import { normalizeCardTitle } from '../lib/title'
import { useDebouncedSave } from '../lib/useDebouncedSave'
import { AutoGrowTextarea } from './AutoGrowTextarea'
import { CompleteToggle } from './CompleteToggle'
import { ConfirmButton } from './ConfirmButton'
import { AcceptanceCriteria } from './AcceptanceCriteria'

/**
 * The card detail panel.
 *
 * It is a route, not a piece of component state (`/projects/:p/cards/:c`), so a
 * card is deep-linkable and the back button closes it — the same reason the
 * project is in the URL. Edits autosave; there is no Save button to forget.
 */
export function CardDetail({
  cardId,
  columnName,
  onClose,
  onChanged,
}: {
  cardId: string
  /**
   * Which column it is in. Trello's equivalent header says "in list To Do", and
   * that is the one fact worth the space: an eyebrow reading "CARD" over a card
   * tells you what you can already see.
   */
  columnName?: string
  onClose: () => void
  onChanged: () => void
}) {
  const [card, setCard] = useState<Card | null>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * Edits accumulate into one patch rather than replacing each other. Typing a
   * title and then a description inside the debounce window must save both —
   * scheduling only the latest field would silently drop the earlier one.
   */
  const queued = useRef<Partial<Card>>({})
  const save = useDebouncedSave<Partial<Card>>(async (patch, options) => {
    queued.current = {}
    await api.updateCard(cardId, patch, { keepalive: options?.unloading })
    onChanged()
  })

  useEffect(() => {
    let live = true
    api
      .getCard(cardId)
      .then((c) => live && setCard(c))
      .catch((e: Error) => live && setError(e.message))
    return () => {
      live = false
    }
  }, [cardId])

  // Escape closes. Registered on the document so it works wherever focus is.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function edit(patch: Partial<Card>) {
    setCard((c) => (c ? { ...c, ...patch } : c))
    queued.current = { ...queued.current, ...patch }
    save.schedule(queued.current)
  }

  /** Completion and the due date are single decisive actions — no reason to debounce them. */
  async function commit(patch: Partial<Card>) {
    setCard((c) => (c ? { ...c, ...patch } : c))
    await api.updateCard(cardId, patch)
    onChanged()
  }

  async function remove() {
    await api.deleteCard(cardId)
    onChanged()
    onClose()
  }

  return (
    /*
     * A centered modal over a dimmed board, which is what Trello does and what
     * Crunchy Team does — we invoke Trello by name, so arriving with Trello's
     * interaction model should be rewarded. It also gives descriptions a
     * comfortable reading measure, which a narrow side rail does not.
     *
     * Full-screen below `md`: on a phone a centered dialog is just a worse
     * full-screen one.
     */
    <div
      className="fixed inset-0 z-20 flex items-stretch justify-center bg-ink/40 md:items-start md:p-8 md:pt-16"
      onClick={onClose}
      role="presentation"
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Card detail"
        data-testid="card-detail"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col overflow-y-auto bg-surface shadow-overlay md:h-auto md:max-h-full md:w-[36rem] md:rounded-panel"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
          <span className="min-w-0 truncate text-xs text-ink-muted">
            {columnName ? (
              <>
                in <span className="font-medium text-ink">{columnName}</span>
              </>
            ) : (
              'Card'
            )}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-control px-2 py-1 text-sm text-ink-muted hover:bg-hover hover:text-ink"
          >
            ✕
          </button>
        </div>

        {error && <p className="p-4 text-sm text-danger">{error}</p>}
        {!card && !error && <p className="p-4 text-sm text-ink-muted">Loading…</p>}

        {card && (
          <div className="flex flex-1 flex-col gap-5 p-4">
            <div className="flex items-start gap-3">
              <CompleteToggle
                completed={card.completed}
                onToggle={() => void commit({ completed: !card.completed })}
                className="mt-1.5"
              />
              <AutoGrowTextarea
                value={card.title}
                onChange={(e) => edit({ title: e.target.value })}
                // Titles are semantically single-line: normalise a paste rather than
                // storing embedded newlines the board would render differently.
                onBlur={(e) => {
                  const clean = normalizeCardTitle(e.target.value)
                  if (clean && clean !== card.title) edit({ title: clean })
                }}
                aria-label="Card title"
                minRows={1}
                maxRows={4}
                className="flex-1 rounded-control border border-transparent px-2 py-1 text-lg font-medium hover:border-line focus:border-ink-faint focus:outline-none"
              />
            </div>

            <div className="flex flex-wrap gap-5">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-muted">Due date</span>
                <input
                  type="date"
                  value={card.dueAt ?? ''}
                  onChange={(e) => void commit({ dueAt: e.target.value || null })}
                  className="w-44 rounded-control border border-line-strong px-2 py-1.5 text-sm focus:border-ink-muted focus:outline-none"
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-muted">Size</span>
                <select
                  value={card.size ?? ''}
                  onChange={(e) => void commit({ size: (e.target.value || null) as Size | null })}
                  className="w-28 rounded-control border border-line-strong px-2 py-1.5 text-sm focus:border-ink-muted focus:outline-none"
                >
                  {/* Unsized is the normal state, so it leads. */}
                  <option value="">—</option>
                  {SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <AcceptanceCriteria
              criteria={card.acceptanceCriteria}
              onChange={(next) => void commit({ acceptanceCriteria: next })}
            />

            {/* Not `flex-1`. It was, which had the description field claiming
                all the leftover height of the full-screen phone sheet and then
                not using it — the textarea inside sizes itself, so the growth
                went nowhere. Removing it moves no pixels: the footer's
                `mt-auto` already collects the slack, so the ~200px gap above
                "Delete card" on a phone is unchanged, and it is the right place
                for it — separation before a destructive action. The field just
                no longer claims space it cannot use. */}
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-ink-muted">Description</span>
              <AutoGrowTextarea
                value={card.description}
                onChange={(e) => edit({ description: e.target.value })}
                placeholder="Markdown welcome."
                minRows={6}
                maxRows={24}
                className="rounded-control border border-line-strong px-3 py-2 text-sm focus:border-ink-muted focus:outline-none"
              />
            </label>

            <div className="mt-auto border-t border-line pt-4">
              <ConfirmButton onConfirm={remove}>Delete card</ConfirmButton>
            </div>
          </div>
        )}
      </aside>
    </div>
  )
}
