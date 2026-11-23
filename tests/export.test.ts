// @vitest-environment node
import { strFromU8, unzipSync } from 'fflate'
// @ts-ignore -- @types/jsdom is not a dependency
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'
import type { BookContent } from '../shared/types/folio'
import { buildEpub, type ExportBook } from '../server/folio/export-epub'
import { buildPdf, toWinAnsi } from '../server/folio/export-pdf'

const evil = 'Déployé 🚀 </p><script>alert(1)</script> & co'

const content: BookContent = {
  citations: {
    c1: { id: 'c1', source: 'github', label: 'PR #12', url: 'https://github.com/acme/app/pull/12' },
    c2: { id: 'c2', source: 'linear', label: 'LIN-42 « ticket »', url: '/demo/source/lin-42' },
    c3: { id: 'c3', source: 'agent', label: 'rapport', url: '/reports/r1' },
    c4: { id: 'c4', source: 'slack', label: 'bad', url: 'javascript:alert(1)' },
  },
  sourceRuns: [],
  chapters: [
    {
      id: 'preface',
      title: 'Ouverture — lundi',
      kind: 'preface',
      sources: ['agent'],
      status: 'mixed',
      blocks: [
        { id: 'b1', type: 'heading', text: 'Vue d’ensemble' },
        { id: 'b2', type: 'paragraph', text: evil, cites: ['c3'] },
        { id: 'b3', type: 'notice', tone: 'warning', text: 'Slack a échoué <b>' },
        { id: 'b4', type: 'notice', tone: 'info', text: 'Info ✓ 日本語' },
      ],
    },
    {
      id: 'agent-1',
      title: 'Claude <Code>',
      kind: 'agent',
      agent: { id: 'a1', name: 'Claude & Co', kind: 'claude-code' },
      sources: ['agent', 'github', 'linear'],
      status: 'mixed',
      blocks: [
        { id: 'f1', type: 'fact', text: 'Migration terminée', status: 'done', cites: ['c1'] },
        { id: 'f2', type: 'fact', text: 'Bloqué par l’API', status: 'blocked', cites: ['c2', 'c4'] },
        { id: 'f3', type: 'fact', text: 'Attend une décision', status: 'waiting', cites: [] },
        { id: 'f4', type: 'fact', text: 'Note 💡', status: 'info', cites: ['c3'] },
        { id: 'k1', type: 'code', lang: 'ts', code: 'const a = 1 < 2 && "x"\nconsole.log(a)\n', caption: 'exemple' },
        { id: 'd1', type: 'diff', file: 'src/a.ts', patch: '--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,2 @@\n-const a = 1\n+const a = 2 // </pre>\n context' },
        { id: 't1', type: 'trace', title: 'Déploiement', steps: [
          { label: 'build', status: 'done' },
          { label: 'tests', status: 'error', detail: '3 échecs' },
          { label: 'deploy', status: 'skipped' },
          { label: 'watch', status: 'running' },
        ] },
        { id: 'q1', type: 'quote', text: '« Ça marche » — l’agent', cites: ['c1'] },
      ],
    },
  ],
}

const book: ExportBook = {
  slug: '2026-11-23',
  kind: 'day',
  title: 'Lundi 23 novembre',
  subtitle: '2 agents · 1 projet',
  language: 'fr',
  version: 3,
  updatedAt: '2026-11-23T18:04:05.123Z',
  agents: [{ name: 'Claude & Co', kind: 'claude-code' }, { name: 'Codex', kind: 'codex' }],
  content,
  cover: { title: 'Lundi 23 novembre', subtitle: '2 agents', agents: [{ name: 'Claude & Co', kind: 'claude-code' }], seed: 'x', incomplete: true, kind: 'day' },
}

const origin = 'https://folio.example'

function parseXml(xml: string, type: 'application/xhtml+xml' | 'application/xml' | 'image/svg+xml' = 'application/xhtml+xml') {
  const { DOMParser } = new JSDOM('').window
  const doc = new DOMParser().parseFromString(xml, type)
  expect(doc.getElementsByTagName('parsererror').length, xml.slice(0, 400)).toBe(0)
  return doc
}

describe('buildEpub', () => {
  const bytes = buildEpub(book, { origin })
  const files = unzipSync(bytes)
  const names = Object.keys(files)

  it('starts with an uncompressed mimetype entry', () => {
    // Local file header: signature, version(2), flags(2), method(2) at offset 8, name at offset 30.
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    expect(view.getUint32(0, true)).toBe(0x04034B50)
    expect(view.getUint16(8, true)).toBe(0)
    const nameLength = view.getUint16(26, true)
    expect(strFromU8(bytes.subarray(30, 30 + nameLength))).toBe('mimetype')
    expect(view.getUint16(28, true)).toBe(0)
    expect(names[0]).toBe('mimetype')
    expect(strFromU8(files.mimetype!)).toBe('application/epub+zip')
  })

  it('points container.xml at a valid OPF', () => {
    const container = parseXml(strFromU8(files['META-INF/container.xml']!), 'application/xml')
    const path = container.getElementsByTagName('rootfile')[0]!.getAttribute('full-path')!
    expect(path).toBe('OEBPS/content.opf')
    const opf = strFromU8(files[path]!)
    parseXml(opf, 'application/xml')
    expect(opf).toContain('urn:folio:2026-11-23:v3')
    expect(opf).toContain('<dc:language>fr</dc:language>')
    expect(opf).toContain('<meta property="dcterms:modified">2026-11-23T18:04:05Z</meta>')
    expect(opf).toContain('properties="cover-image"')
    for (const href of [...opf.matchAll(/href="([^"]+)"/g)].map(m => m[1]!)) expect(names).toContain(`OEBPS/${href}`)
  })

  it('produces well-formed XHTML with escaped, semantic content', () => {
    const pages = names.filter(n => n.endsWith('.xhtml'))
    expect(pages).toEqual(expect.arrayContaining(['OEBPS/nav.xhtml', 'OEBPS/cover.xhtml', 'OEBPS/chapter-1.xhtml', 'OEBPS/chapter-2.xhtml']))
    for (const name of pages) {
      const xml = strFromU8(files[name]!)
      parseXml(xml)
      expect(xml).not.toMatch(/<script/i)
    }
    parseXml(strFromU8(files['OEBPS/cover.svg']!), 'image/svg+xml')

    const ch1 = parseXml(strFromU8(files['OEBPS/chapter-1.xhtml']!))
    expect(ch1.querySelector('section > p:not(.meta)')?.textContent).toContain('</p><script>alert(1)</script>')
    expect(ch1.querySelector('aside.warning')).not.toBeNull()

    const ch2 = parseXml(strFromU8(files['OEBPS/chapter-2.xhtml']!))
    const facts = [...ch2.querySelectorAll('ul.facts li')]
    expect(facts.map(li => li.querySelector('.status')?.textContent)).toEqual(['Fait', 'Bloqué', 'En attente', 'Info'])
    const hrefs = [...ch2.querySelectorAll('a')].map(a => a.getAttribute('href'))
    expect(hrefs).toContain('https://folio.example/demo/source/lin-42')
    expect(hrefs).toContain('https://folio.example/reports/r1')
    expect(hrefs).not.toContain('javascript:alert(1)')
    expect(ch2.querySelector('pre code')?.textContent).toContain('1 < 2 && "x"')
    expect(ch2.querySelector('figure.diff ins')?.textContent).toBe('+const a = 2 // </pre>')
    expect(ch2.querySelector('figure.diff del')?.textContent).toBe('-const a = 1')
    expect(ch2.querySelectorAll('ol.trace li')).toHaveLength(4)
    expect(ch2.querySelector('section.sources')?.textContent).toContain('Linear')

    const nav = strFromU8(files['OEBPS/nav.xhtml']!)
    expect(nav).toContain('href="chapter-2.xhtml">Claude &lt;Code&gt;</a>')
  })
})

describe('toWinAnsi', () => {
  it('keeps French typography and drops what the standard fonts cannot draw', () => {
    expect(toWinAnsi('« Été » – à l’œil — “ok” … 10 €')).toBe('« Été » – à l’œil — “ok” … 10 €')
    expect(toWinAnsi('Déployé 🚀 ok')).toBe('Déployé  ok')
    expect(toWinAnsi('日本')).toBe('??')
    expect(toWinAnsi('a → b, Łódź, ő')).toBe('a -> b, ?ódz, o')
    expect(toWinAnsi('x !')).toBe('x !')
  })
})

describe('buildPdf', () => {
  it('produces a multi-page PDF', async () => {
    const bytes = await buildPdf(book, { origin })
    const text = Buffer.from(bytes).toString('latin1')
    expect(text.startsWith('%PDF-')).toBe(true)
    expect(bytes.byteLength).toBeGreaterThan(3000)
    expect(text).toContain('/URI (https://folio.example/demo/source/lin-42)')
    expect(text).not.toContain('javascript:')
    expect((text.match(/\/Type \/Page\b/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })

  it('handles a book with no chapters', async () => {
    const bytes = await buildPdf({ ...book, content: { chapters: [], citations: {}, sourceRuns: [] } }, { origin })
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe('%PDF-')
  })
})
