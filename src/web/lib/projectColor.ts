/**
 * A project's colour, derived from its name.
 *
 * Trello's board tiles carry colour so you pattern-match rather than read, and
 * that recognisability is most of why its board list works. Deriving the hue
 * from the name buys the same effect for zero schema cost and with no colour
 * picker to build — and it's stable, so a project keeps its colour forever.
 *
 * A picker can be added later without migrating anything: store a colour when
 * one is chosen and fall back to this when it's absent.
 */

/** FNV-1a. Small, fast, and well distributed across short strings — which matters, because
 * "Website" and "Website 2" landing on the same hue would defeat the point. */
function hash(value: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/**
 * The hue, and only the hue.
 *
 * This used to return finished colours — `hsl(${hue} 62% 97%)` for the tile
 * body. That baked a *light* palette into a TypeScript file, which is the one
 * thing the token system exists to prevent, and it stayed near-white when dark
 * mode arrived: the tile kept its pale tint while the ink on it inverted to
 * near-white, failing contrast on every project tile at once. The dark axe scan
 * caught it the first time it ran.
 *
 * So the split is: this file decides *which* hue a project gets — the part that
 * is a computation — and `.project-bar` / `.project-tint` in index.css decide
 * how light it is in each theme, alongside every other value the theme pass will
 * re-value. The component passes the hue through as `--project-hue`.
 */
export function projectHue(name: string): number {
  return hash(name.trim().toLowerCase()) % 360
}
