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

export interface ProjectColor {
  /** The tile's colour band. */
  bar: string
  /** A tint for the tile body — kept very pale so titles stay high-contrast. */
  tint: string
}

export function projectColor(name: string): ProjectColor {
  const hue = hash(name.trim().toLowerCase()) % 360
  return {
    bar: `hsl(${hue} 62% 52%)`,
    tint: `hsl(${hue} 62% 97%)`,
  }
}
