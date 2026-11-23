import { describe, expect, it } from 'vitest'
import { renderCoverSvg } from '../shared/utils/cover'

describe('covers', () => {
  const spec = { title: 'Lundi <23> novembre', subtitle: '2 agents', agents: [{ name: 'A&B', kind: 'codex' as const }], seed: '2026-11-23', incomplete: true, kind: 'day' as const }
  it('is deterministic and escapes text', () => {
    const svg = renderCoverSvg(spec)
    expect(svg).toBe(renderCoverSvg(spec))
    expect(svg).not.toContain('<23>')
    expect(svg).toContain('A&amp;B')
    expect(svg).toContain('role="img"')
  })
})
