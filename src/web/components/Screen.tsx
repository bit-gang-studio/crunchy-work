import type { ReactNode } from 'react'

/**
 * The layout contract for a top-level screen inside the fixed-height app shell.
 * The shell gives each screen a viewport-sized content region; a screen then
 * declares how it uses that height:
 *
 * - `document` — an ordinary page that scrolls vertically within the region.
 *   Keep your own width/padding container (`mx-auto max-w-… px-… py-…`) inside.
 * - `canvas` — fills the region exactly and owns its *internal* scroll; the
 *   region itself never scrolls (the board, whose columns scroll independently).
 *
 * Screen owns only height and overflow, so widths and padding stay with each screen.
 */
export function Screen({ scroll, children }: { scroll: 'document' | 'canvas'; children: ReactNode }) {
  return (
    /*
     * No `scrollbar-gutter` here, and that was tried: reserving the gutter on
     * this element keeps the header from jumping when a scrollbar appears, but
     * the header is *inside* it, so its background and bottom rule then stop
     * 15px short of the window and the app grows a bare strip down its right
     * edge. A screen that scrolls keeps the scrollbar below its header instead
     * — see DocsScreen — which fixes the jump without costing the edge.
     */
    <div className={scroll === 'document' ? 'h-full overflow-y-auto' : 'h-full overflow-hidden'}>
      {children}
    </div>
  )
}
