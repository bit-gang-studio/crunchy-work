import { describe, expect, it } from 'vitest'
import { filterProjects } from '../src/web/lib/projectSearch.js'
import type { ProjectSummary } from '../src/shared/types.js'

/**
 * The switcher's matching. It is the part of "jump to another project" that can
 * be wrong without ever throwing — a list that ranks badly just feels like the
 * search does not work.
 */
const projects = (...names: string[]): ProjectSummary[] =>
  names.map((name, i) => ({
    id: `p${i}`,
    name,
    description: '',
    rank: `a${i}`,
    createdAt: '',
    updatedAt: '',
    cardCount: 0,
    doneCount: 0,
    docCount: 0,
  }))

const names = (list: ProjectSummary[]) => list.map((p) => p.name)

describe('filterProjects', () => {
  it('keeps the arranged order when there is no query', () => {
    const all = projects('Website', 'Crunchy Work', 'Spike: auth')
    expect(names(filterProjects(all, ''))).toEqual(['Website', 'Crunchy Work', 'Spike: auth'])
    expect(names(filterProjects(all, '  '))).toEqual(['Website', 'Crunchy Work', 'Spike: auth'])
  })

  it('puts a name that starts with the query first', () => {
    const all = projects('Crunchy Work', 'Website')
    expect(names(filterProjects(all, 'web'))).toEqual(['Website'])
    expect(names(filterProjects(all, 'cr'))).toEqual(['Crunchy Work'])
  })

  it('matches a word inside the name ahead of letters buried mid-word', () => {
    // "auth" is a whole word in "Spike: auth" but sits inside "Coauthoring".
    const all = projects('Coauthoring', 'Spike: auth')
    expect(names(filterProjects(all, 'auth'))).toEqual(['Spike: auth', 'Coauthoring'])
  })

  it('ignores case', () => {
    const all = projects('Crunchy Work')
    expect(names(filterProjects(all, 'CRUNCHY'))).toEqual(['Crunchy Work'])
  })

  it('returns nothing when nothing matches, so the menu can say so', () => {
    expect(filterProjects(projects('Website'), 'zzz')).toEqual([])
  })
})
