import { describe, expect, it } from 'vitest'
import { BLOCKS, filterBlocks } from '../src/web/lib/editorBlocks.js'

/**
 * The `/` menu's matching. Everything else about the menu is browser behaviour
 * (caret coordinates, key interception) and lives in the e2e journey — this is
 * the part that is pure string logic, and the part where a bad ranking makes the
 * menu feel wrong without ever failing.
 */
describe('filterBlocks', () => {
  it('offers everything for an empty query, in the list order', () => {
    expect(filterBlocks('')).toEqual(BLOCKS)
    expect(filterBlocks('   ')).toEqual(BLOCKS)
  })

  it('matches a label prefix ahead of a keyword match', () => {
    // "Code block" starts with "c"; Quote reaches "c" only via "callout", and
    // To-do list only via "checkbox". The named block has to come first.
    const ids = filterBlocks('c').map((b) => b.id)
    expect(ids[0]).toBe('codeBlock')
    expect(ids).toContain('blockquote')
    expect(ids).toContain('taskList')
    expect(ids.indexOf('codeBlock')).toBeLessThan(ids.indexOf('blockquote'))
  })

  it('matches a substring inside a label', () => {
    // Nothing is called "list" first, so all three list types come back.
    expect(filterBlocks('list').map((b) => b.id)).toEqual([
      'bulletList',
      'orderedList',
      'taskList',
    ])
  })

  it('finds a block by a word that is not in its name', () => {
    expect(filterBlocks('todo').map((b) => b.id)).toContain('taskList')
    expect(filterBlocks('checkbox').map((b) => b.id)).toContain('taskList')
    expect(filterBlocks('hr').map((b) => b.id)).toEqual(['horizontalRule'])
  })

  it('ignores case', () => {
    expect(filterBlocks('HEAD').map((b) => b.id)).toEqual(filterBlocks('head').map((b) => b.id))
    expect(filterBlocks('Head').map((b) => b.id)).toEqual(['h1', 'h2', 'h3'])
  })

  it('returns nothing when nothing matches, so the menu can close itself', () => {
    expect(filterBlocks('zzzz')).toEqual([])
  })

  it('gives every block a markdown hint except plain text', () => {
    for (const block of BLOCKS) {
      if (block.id === 'paragraph') expect(block.hint).toBe('')
      else expect(block.hint).not.toBe('')
    }
  })
})
