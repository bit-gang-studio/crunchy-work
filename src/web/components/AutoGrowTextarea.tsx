import { useLayoutEffect, useRef, type TextareaHTMLAttributes } from 'react'

interface AutoGrowTextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  value: string
  minRows?: number
  maxRows?: number
}

/**
 * A textarea that grows with its content between `minRows` and `maxRows`, then scrolls
 * vertically. Long text wraps and stays fully visible — it never scrolls horizontally the
 * way a single-line <input> does. Used for editable card titles and descriptions so a long
 * value is readable in place instead of hidden behind a right-scroll.
 */
export function AutoGrowTextarea({
  value,
  minRows = 1,
  maxRows = 8,
  className,
  ...rest
}: AutoGrowTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return

    const fit = () => {
      el.style.height = 'auto' // reset first so scrollHeight reads the true content height
      const cs = window.getComputedStyle(el)
      const line = parseFloat(cs.lineHeight) || 20
      const frame =
        parseFloat(cs.paddingTop) +
        parseFloat(cs.paddingBottom) +
        parseFloat(cs.borderTopWidth) +
        parseFloat(cs.borderBottomWidth)
      const min = line * minRows + frame
      const max = line * maxRows + frame
      el.style.height = `${Math.max(min, Math.min(el.scrollHeight, max))}px`
      el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
    }

    fit()

    // Re-fit when the field's *width* changes (a viewport / layout resize re-wraps the text).
    // Guard on width so our own height writes can't feed back into a resize-observer loop.
    if (typeof ResizeObserver === 'undefined') return
    let lastWidth = el.clientWidth
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== lastWidth) {
        lastWidth = el.clientWidth
        fit()
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [value, minRows, maxRows])

  return (
    <textarea ref={ref} rows={minRows} value={value} className={`resize-none ${className ?? ''}`} {...rest} />
  )
}
