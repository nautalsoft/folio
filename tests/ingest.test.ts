import { describe, expect, it, vi } from 'vitest'

vi.stubGlobal('sourceSlug', (v: string) => v.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40))
vi.stubGlobal('slugify', (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '-'))
const { factsInput, reportInput, workInput } = await import('../server/utils/ingest')

describe('ingest schemas', () => {
  it('accepts any source name and normalizes it', () => {
    const parsed = factsInput.parse({ source: 'My Tool', facts: [{ id: '1', title: 'x', url: 'https://example.com' }] })
    expect(parsed.source).toBe('my-tool')
  })
  it('rejects non-http links', () => {
    expect(() => factsInput.parse({ source: 'x', facts: [{ id: '1', title: 'x', url: 'javascript:alert(1)' }] })).toThrow()
  })
  it('accepts an agent given as a plain string without renaming it', () => {
    const parsed = reportInput.parse({ agent: 'Claude Code', title: 'Hello' })
    expect(parsed.agent).toEqual({ id: 'claude-code', name: undefined, kind: undefined })
  })
  it('requires a checkpoint note for checkpoints', () => {
    expect(workInput.parse({ agent: 'a', action: 'checkpoint', task: { key: 'k' }, checkpoint: { note: 'n' } }).checkpoint?.note).toBe('n')
  })
})
