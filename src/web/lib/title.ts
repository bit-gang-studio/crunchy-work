/**
 * A card title is single-line. Collapse any newlines (and the whitespace hugging them) to a
 * single space and trim the ends — so a value pasted into the multi-line title textarea can't
 * persist embedded line breaks that the card face and the board inputs would render
 * differently. Other internal spacing is left exactly as typed.
 *
 * The server normalises identically (`cardsService`), so an agent writing over MCP and a
 * person pasting into the UI get the same result.
 */
export function normalizeCardTitle(raw: string): string {
  return raw.replace(/\s*[\r\n]+\s*/g, ' ').trim()
}
