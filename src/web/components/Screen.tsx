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
    <div className={scroll === 'document' ? 'h-full overflow-y-auto' : 'h-full overflow-hidden'}>
      {children}
    </div>
  )
}
