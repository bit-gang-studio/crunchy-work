import { useEffect, useState } from 'react'

/**
 * How long the control takes to grow in or fade out. Kept beside the class that
 * sets it — the `filter-out` keyframes — because the two have to agree: unmount early
 * and the exit is cut off, unmount late and the slot sits empty for a beat.
 */
const EXIT_MS = 250

/**
 * What the last render of this control left on screen, and whether there has
 * been one at all.
 *
 * Module scope, and it has to be — exactly as `lastSection` in ProjectHeader
 * does, for exactly the same reason. Board and Docs are separate screens that
 * each build their own header, so switching section unmounts this component and
 * mounts a new one. Component state cannot survive that, and a CSS transition
 * on a brand-new element has nothing to animate *from*: it paints at its final
 * value. Measured, before this existed — going to Docs the filter read `gone`
 * on the first frame, and coming back it read full width on the second. A hard
 * snap in both directions, on the navigation you do most.
 *
 * **A cold load does fade the control in, and that is deliberate.** Measured:
 * opening a board that already has ticked cards traces `0.0/0 → 0.4/84 →
 * 1.0/84`. A guard against it was written first and turned out to be dead code
 * — `BoardScreen` renders a skeleton header before the fetch returns, so the
 * filter's first mount is always at zero and the count arriving is a genuine
 * change to an element that is already on screen, not a first paint.
 *
 * Which is the right answer anyway. "Nothing animates on first paint" is about
 * a load being correct rather than performed; the columns beside this already
 * fade in on `screen-in` as their data lands, so a control that popped into
 * finished chrome while the board faded would be the odd one out. The rule it
 * would break is the one being fixed: never just appear.
 */
let lastCount = 0

/**
 * The switch for finished work.
 *
 * Two rules make hiding content safe, and this is built on both.
 *
 * **The control that hides things is visible.** A board quietly showing fewer
 * cards than it has is a board lying to you; a board with "3 done" sitting in
 * its chrome is a board you can interrogate. This is why the filter is not in
 * the ⋯ menu, where it would be a setting you cannot see the effect of.
 *
 * **It says how many.** A bare "Show completed" leaves you wondering whether
 * anything is behind it. The count is the difference between a control you
 * ignore and one you trust.
 *
 * ---
 *
 * **Reported as "it jumps out awkwardly, and I don't like the toggle."** Both
 * halves were right, and there were three separate causes:
 *
 * 1. **It was the only unenclosed thing in a row of enclosed things.** Its
 *    neighbours are a bordered segmented control and a square icon button; this
 *    was bare text floating between them, so it read as a stray label rather
 *    than a control. It now has a container at rest, quieter than the segmented
 *    control beside it — a border on nothing, against that control's filled
 *    rail — so it belongs to the row without competing with it.
 *
 * 2. **It changed shape *and* width when you clicked it.** Off it was naked
 *    text reading "Show completed (1)"; on it became a filled pill reading
 *    "Hide completed". Two different objects, so every toggle reflowed the
 *    cluster and shoved Board/Docs sideways. The label is the same in both
 *    states now — the count, which is a fact about the board and does not
 *    change when you look at it — and only the tick fills in.
 *
 *    That needed a change underneath, not just here: `withoutCompleted`'s
 *    `hidden` is how many the filter is *holding back*, so it is zero the
 *    moment you reveal them. The control had nothing to count in one of its two
 *    states, which is exactly why it had to change its words instead.
 *
 * 3. **It appeared and disappeared rather than arriving and leaving.** Ticking
 *    the first card conjured ~130px of control out of nothing.
 *
 *    Reserving a fixed slot was tried first and was worse: it fixed the jump by
 *    leaving a permanent hole in the cluster on every board with nothing
 *    completed, which is most boards and every new one. A constant gap costs
 *    more than a moment of movement, because it is there the whole time.
 *
 *    So it fades instead, over 200ms, in all four directions — first card
 *    ticked, last card unticked, and both ways across the Board/Docs switch.
 *    Nothing pops.
 *
 *    It grew in from zero width first, which was right at the time: the control
 *    then sat *between* the tabs and the ⋯ menu, so appearing shoved them 92px
 *    and the growth was what made that shove legible. Moving it to the leading
 *    edge of a right-aligned cluster removed the shove, and with nothing left
 *    to soften the slide was just a slide. It fades in place now.
 *
 *    Two mechanisms are still needed, and each covers a case the other cannot:
 *
 *    - **The button outlives the count** (`label`). Unticking the last card
 *      used to unmount the button in the same commit that started the fade, so
 *      the wrapper animated its opacity to zero over an element that had
 *      already gone — an instant disappearance. The label also keeps saying
 *      "3 done" while it leaves, rather than flicking to "0 done" on the way.
 *    - **The module remembers across the rebuild** (`lastCount`). Without it a
 *      fresh mount has no previous opacity to transition from, so it appears at
 *      full strength — the same class of problem the project header had before
 *      it was hoisted out of the screens.
 *
 * The label flip was also two patterns crossed. A `switch` keeps a stable name
 * and shows its state; a button says what it will do. It was doing both, which
 * is the part that felt wrong before you could point at why. It is a switch now
 * and behaves like one.
 */
export function CompletedFilter({
  showing,
  count,
  onChange,
  animateEntrance = true,
}: {
  showing: boolean
  /** How many cards are ticked — the same number whether or not they show. */
  count: number
  /** Absent on a screen that has no board to filter, which is how Docs renders. */
  onChange?: (next: boolean) => void
  /**
   * Whether this appearance is a change or simply the first sight of it.
   *
   * False while the board is arriving for the first time, so a load is correct
   * rather than performed; true once there is a board to have changed.
   */
  animateEntrance?: boolean
}) {
  /*
   * The number on the face, which lags on the way out so the control does not
   * read "0 done" as it leaves. Seeded from the module on a fresh mount, so a
   * control fading out on Docs still says what it said on the board.
   */
  const [label, setLabel] = useState(() => count || lastCount)
  useEffect(() => {
    if (count > 0) {
      lastCount = count
      setLabel(count)
      return
    }
    const timer = setTimeout(() => setLabel(0), EXIT_MS)
    return () => clearTimeout(timer)
  }, [count])

  const leaving = count === 0

  /*
   * Nothing is drawn at all once it has finished leaving. Keeping a
   * zero-opacity button mounted looked equivalent and was not: `opacity: 0`
   * hides a box, it does not unmake it, and at 390px the 84px button still had
   * a bounding rect running off the right edge of the screen —
   * `responsive.spec.ts` caught exactly that, correctly.
   */
  if (label === 0) return null

  return (
    <FilterPill
      showing={showing}
      label={label}
      leaving={leaving}
      onChange={onChange}
      animateEntrance={animateEntrance}
    />
  )
}

/**
 * The visible control, split out for one reason: it mounts and unmounts with
 * each appearance, and `CompletedFilter` does not.
 *
 * That matters because the entrance has to be decided *once*, when the control
 * appears, and then left alone — `useState`'s initialiser only runs at mount,
 * so it has to be a component whose mount coincides with the thing being
 * decided. Put it a level up, where the parent stays mounted and merely returns
 * `null`, and the first decision would stick for the life of the page.
 */
function FilterPill({
  showing,
  label,
  leaving,
  onChange,
  animateEntrance,
}: {
  showing: boolean
  label: number
  leaving: boolean
  onChange?: (next: boolean) => void
  animateEntrance: boolean
}) {
  const [entrance] = useState(() => (animateEntrance ? 'filter-in' : ''))

  return (
    <div
      /*
       * **Opacity only. The width is not animated.**
       *
       * It used to grow in from zero width, which was the right answer while
       * this control sat *between* the tabs and the ⋯ menu: appearing was a
       * 92px shove and the growth made that shove legible instead of abrupt.
       *
       * Moving it to the leading edge of the cluster removed the reason. The
       * cluster is right-aligned, so a change of width here moves nothing but
       * this control's own left edge, into empty space. With nothing to soften,
       * a slide is just a slide — and next to a header that now stays perfectly
       * still, it read as the one thing fidgeting. So it fades in place.
       */
      /*
       * **The entrance is decided once, at mount, and never re-evaluated.**
       *
       * Opening a board that already has ticked cards must show the control
       * rather than perform it arriving — you did not do anything, so nothing
       * announced itself. But ticking the first card *is* something you did,
       * and that should fade.
       *
       * The two are indistinguishable from inside this component: both are the
       * count going from nothing to something. `entrance` therefore comes from
       * the layout, which knows whether it had a board before this render, and
       * is frozen in a `useState` initialiser — recomputing it on a later
       * render would restart the animation while the control was already on
       * screen, which is worse than either behaviour.
       */
      className={`shrink-0 ${leaving ? 'filter-out pointer-events-none' : entrance}`}
    >
      {/* `aria-hidden` while leaving: for those 200ms it is a switch on its way
          out, and on Docs it is a board control on a screen with no board. It
          should not be reachable or announced there. */}
      {(
        <button
          type="button"
          role="switch"
          aria-checked={showing}
          aria-hidden={leaving}
          tabIndex={leaving ? -1 : undefined}
          /*
           * Stable, and it carries the count: the visible text is a bare "3
           * done", which alone would name this control "3 done" and never say
           * what it does.
           */
          aria-label={`Show completed cards — ${label} completed`}
          onClick={() => onChange?.(!showing)}
          className={`flex h-8 min-w-[5.25rem] shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-control border px-2 text-xs transition-colors ${
            showing
              ? 'border-line-strong bg-sunken text-ink'
              : 'border-line text-ink-faint hover:border-line-strong hover:text-ink'
          }`}
        >
          {/*
            * The same mark as the tick on a card, at the same 14px — this
            * filter is about that tick, and drawing it as anything else makes
            * the connection something you have to be told. Empty box when the
            * cards are hidden, filled when they are on screen, which is the
            * state the switch is in.
            */}
          <span
            aria-hidden
            className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border text-[9px] leading-none transition-colors ${
              showing
                ? 'border-ink-muted bg-ink-muted text-surface'
                : 'border-line-strong text-transparent'
            }`}
          >
            ✓
          </span>
          {/*
            * Tabular figures, so 1 → 2 digits does not nudge the word beside
            * it — and a shade under a pixel up, because `items-center` centres
            * the line box rather than the letters.
            *
            * Measured: the box spans 72–86 and the ink of "1 done" spans 75–84,
            * so there is 3px of box above the letters and 2px below and the
            * label reads low. That is not a mistake in the flexbox — the line
            * box is symmetric, the *ink* inside it is not, because 12px text
            * with no descenders leaves the space under the baseline unused.
            * Anything that centres a fixed-size box against a text label has
            * this; it is only visible here because the box is small enough for
            * half a pixel to be a fifteenth of it.
            */}
          <span className="relative -top-[0.8px] tabular-nums">{label} done</span>
        </button>
      )}
    </div>
  )
}
