/**
 * The one length that has to be enforced: a **title**.
 *
 * Descriptions and doc bodies are deliberately uncapped — they are read on
 * demand (`get_card`, `get_doc`) and a long one costs only the call that asked
 * for it.
 *
 * Titles are different, because every title in a project rides in every board
 * read. A single 5,000-character card title turns `get_project` from a 4,000-
 * token orientation into a context-eating wall, on every call, forever — and it
 * is exactly what happens when someone pastes a paragraph into the wrong field.
 *
 * Enforced by **refusal, not truncation**: silently cutting text is data loss,
 * and the error is a useful nudge toward the field the content actually wants.
 */
export const MAX_TITLE = 500

/** Names that appear in listings — same reasoning as titles. */
export const MAX_NAME = 200
