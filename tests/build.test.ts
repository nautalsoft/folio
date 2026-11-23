import { describe, expect, it } from 'vitest'
import { applyOverrides, buildDayBook, buildMonthBook, type DayInputs } from '../server/folio/build'
import { countWords } from '../shared/utils/reading'

const base = (over: Partial<DayInputs> = {}): DayInputs => ({
  day: '2026-11-23',
  baseUrl: '',
  timezone: 'Europe/Paris',
  agents: { atlas: { name: 'Atlas', kind: 'claude-code' } },
  facts: [],
  reports: [],
  needs: [],
  runs: [],
  ...over,
})

const fact = (id: string, over: Record<string, unknown> = {}) => ({
  id, source: 'github', kind: 'thread', status: 'done' as const, title: `Fact ${id}`, body: '', url: `https://example.com/${id}`, label: id, agentId: null, project: 'P', occurredAt: '2026-11-23T10:00:00Z', ...over,
})

describe('buildDayBook', () => {
  it('cites a clickable source for every fact', () => {
    const book = buildDayBook(base({ facts: [fact('a'), fact('b', { agentId: 'atlas' })] }), 'fr')
    const facts = book.content.chapters.flatMap(c => c.blocks).filter(b => b.type === 'fact')
    expect(facts).toHaveLength(2)
    for (const block of facts) {
      expect(block.type === 'fact' && block.cites.length).toBeTruthy()
      for (const id of (block as { cites: string[] }).cites) expect(book.content.citations[id]?.url).toMatch(/^https:\/\//)
    }
  })

  it('gives any custom source its own chapter and status line', () => {
    const book = buildDayBook(base({ facts: [fact('x', { source: 'linear' })], runs: [{ source: 'linear', status: 'ok', count: 1, at: '' }] }), 'en')
    expect(book.content.chapters.map(c => c.title)).toContain('Linear')
    const status = book.content.chapters.find(c => c.id === 'sources')!
    expect(status.blocks.some(b => 'text' in b && b.text.startsWith('Linear: 1'))).toBe(true)
  })

  it('says when a source failed or is not configured, and marks the book incomplete', () => {
    const book = buildDayBook(base({ facts: [fact('a')], runs: [{ source: 'slack', status: 'error', count: 0, message: 'HTTP 429', at: '' }] }), 'fr')
    expect(book.incomplete).toBe(true)
    const notices = book.content.chapters.flatMap(c => c.blocks).filter(b => b.type === 'notice').map(b => (b as { text: string }).text)
    expect(notices.some(t => t.includes('Slack a échoué') && t.includes('HTTP 429'))).toBe(true)
    expect(notices.some(t => t.includes('GitHub n’est pas configuré'))).toBe(true)
  })

  it('does not pretend an empty day is complete', () => {
    const book = buildDayBook(base(), 'fr')
    expect(book.empty).toBe(true)
  })

  it('lists needs-you items before agent chapters, sorted by deadline', () => {
    const book = buildDayBook(base({
      facts: [fact('a', { agentId: 'atlas' })],
      needs: [
        { id: 'n2', kind: 'decision', title: 'Later', detail: '', agentId: null, source: 'agent', sourceUrl: null, deadline: '2026-11-25T10:00:00Z', blocking: [], createdAt: '' },
        { id: 'n1', kind: 'blocker', title: 'Sooner', detail: '', agentId: null, source: 'agent', sourceUrl: null, deadline: '2026-11-24T10:00:00Z', blocking: ['Release'], createdAt: '' },
      ],
    }), 'en')
    expect(book.content.chapters.map(c => c.id).slice(0, 2)).toEqual(['preface', 'needs'])
    const titles = book.content.chapters[1]!.blocks.filter(b => b.type === 'fact').map(b => (b as { text: string }).text)
    expect(titles[0]).toMatch(/^Sooner/)
  })

  it('keeps block ids stable so manual edits survive a rebuild', () => {
    const input = base({ facts: [fact('a', { agentId: 'atlas' })] })
    const first = buildDayBook(input, 'fr')
    const block = first.content.chapters.find(c => c.kind === 'agent')!.blocks.find(b => b.type === 'fact')!
    const second = applyOverrides(buildDayBook(input, 'fr').content, { blocks: { [block.id]: 'Edited by hand' } })
    expect(second.chapters.flatMap(c => c.blocks).find(b => b.id === block.id)).toMatchObject({ text: 'Edited by hand' })
    expect(countWords(second)).toBeGreaterThan(0)
  })
})

describe('buildMonthBook', () => {
  it('turns published days into chapters', () => {
    const day = buildDayBook(base({ facts: [fact('a')] }), 'fr')
    const month = buildMonthBook('2026-11', [{ slug: '2026-11-23', day: '2026-11-23', title: day.title, content: day.content, agents: day.agents, projects: day.projects, incomplete: false }], 'fr')
    expect(month.title).toBe('Novembre 2026')
    expect(month.content.chapters.map(c => c.id)).toContain('day-2026-11-23')
  })
})

describe('pull requests', () => {
  it('gather every PR in their own chapter, failing ones first, linked to GitHub', () => {
    const book = buildDayBook(base({ facts: [
      fact('p1', { kind: 'pr.merged', status: 'done', source: 'board', label: 'acme/www#1', url: 'https://github.com/acme/www/pull/1' }),
      fact('p2', { kind: 'pr', status: 'blocked', source: 'board', label: 'acme/www#2', url: 'https://github.com/acme/www/pull/2', body: 'state open · CI failure' }),
      fact('x', { kind: 'thread', source: 'board' }),
    ] }), 'fr')
    const chapter = book.content.chapters.find(c => c.id === 'pull-requests')!
    const facts = chapter.blocks.filter(b => b.type === 'fact') as { text: string, cites: string[] }[]
    expect(facts.map(f => f.text.split(' ')[0])).toEqual(['acme/www#2', 'acme/www#1'])
    expect(book.content.citations[facts[0]!.cites[0]!]!.url).toBe('https://github.com/acme/www/pull/2')
    const boardChapter = book.content.chapters.find(c => c.id === 'source-board')!
    expect(boardChapter.blocks.filter(b => b.type === 'fact')).toHaveLength(1)
  })
})
