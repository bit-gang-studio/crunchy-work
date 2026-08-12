import { ValidationError } from '../services/errors.js'

/**
 * Tool arguments arrive from a model over JSON-RPC, so they are untrusted in a
 * specific way: not malicious, but frequently the wrong shape — a number where
 * a string belongs, a string where a boolean does. Coerce and check here so a
 * mistake comes back as a message the model can act on, rather than a type
 * assertion that fails somewhere less obvious.
 */
export type Args = Record<string, unknown>

export function requireString(args: Args, key: string): string {
  const value = args[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(`"${key}" is required and must be a non-empty string.`)
  }
  return value
}

export function optionalString(args: Args, key: string): string | undefined {
  const value = args[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') throw new ValidationError(`"${key}" must be a string.`)
  return value
}

export function optionalBoolean(args: Args, key: string): boolean | undefined {
  const value = args[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'boolean') throw new ValidationError(`"${key}" must be true or false.`)
  return value
}

export function optionalNumber(args: Args, key: string): number | undefined {
  const value = args[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(`"${key}" must be a number.`)
  }
  return value
}

/**
 * A "done when…" checklist.
 *
 * Accepts either plain strings or `{text, done}` objects, because those are the
 * two things a model naturally sends: bare lines when drafting a card, objects
 * when ticking one off later. Being permissive here costs nothing and saves a
 * retry.
 */
export function optionalCriteria(args: Args, key: string): { text: string; done: boolean }[] | undefined {
  const value = args[key]
  if (value === undefined || value === null) return undefined
  if (!Array.isArray(value)) throw new ValidationError(`"${key}" must be a list`)

  return value.map((item) => {
    if (typeof item === 'string') return { text: item, done: false }
    if (item && typeof item === 'object' && typeof (item as { text?: unknown }).text === 'string') {
      return { text: (item as { text: string }).text, done: (item as { done?: unknown }).done === true }
    }
    throw new ValidationError(`"${key}" items must be a string or {text, done}`)
  })
}

export function optionalStringArray(args: Args, key: string): string[] {
  const value = args[key]
  if (value === undefined || value === null) return []
  if (!Array.isArray(value) || value.some((v) => typeof v !== 'string')) {
    throw new ValidationError(`"${key}" must be an array of strings.`)
  }
  return value as string[]
}
