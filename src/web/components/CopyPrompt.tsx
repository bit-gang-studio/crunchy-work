import { useEffect, useRef, useState } from 'react'

/**
 * A line to hand to an agent, with the button that actually hands it over.
 *
 * This is the product's activation moment: the pitch is that your agent fills
 * the board, and on an empty board the one thing a new user does not know is
 * what to do about it. So the prompt is worth screen space — the execution was
 * the problem.
 *
 * It used to be a `<pre className="bg-code">`, and that role is for code sitting
 * *inside a document*, surrounded by prose. On a board it fails in opposite
 * directions in the two palettes: in light, `code` is near-black, so the heaviest
 * object on the entire screen was a hint above the content it introduces; in
 * dark, `code` is the page colour, so the same element all but disappeared. Ask
 * what a token *does*, not what it looks like — this is a control, so it is
 * built like one.
 *
 * The bigger miss was functional. It said "paste this" and gave you no way to
 * copy it: the whole job is getting this string into an agent, and you had to
 * select it by hand. A copy button is the feature; the text is the label.
 */
export function CopyPrompt({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  // The timeout outlives a fast unmount otherwise — setting state on a gone
  // component, on the one screen people leave quickest.
  useEffect(() => () => clearTimeout(timer.current), [])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Clipboard blocked, which happens. The text stays selectable, so there
      // is still a way through — better than an error about a convenience.
      return
    }
    setCopied(true)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1600)
  }

  return (
    <div className="flex items-start gap-2 rounded-card border border-line bg-surface py-1.5 pl-3 pr-1.5">
      {/*
        * Wraps rather than scrolls. This is a line to *copy*, so on a phone half
        * of it disappearing off the right edge is the worst possible behaviour —
        * and a horizontally scrollable region is unreachable by keyboard unless
        * it is also focusable, which a block of sample text has no business
        * being. Wrapping solves both.
        */}
      <code className="min-w-0 flex-1 break-words py-1 font-mono text-xs leading-5 text-ink-muted">
        {text}
      </code>
      {/* Fixed width so the row does not twitch when the label becomes "Copied". */}
      <button
        type="button"
        onClick={() => void copy()}
        className="w-16 shrink-0 rounded-control px-2 py-1.5 text-xs font-medium text-ink-muted hover:bg-hover hover:text-ink"
      >
        <span aria-live="polite">{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  )
}
