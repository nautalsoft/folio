import PDFDocument from 'pdfkit'
import type { Block, Chapter, Citation } from '../../shared/types/folio'
import { coverPalette } from '../../shared/utils/cover'
import { bookStrings, sourceTitle } from '../../shared/utils/book-strings'
import { absoluteUrl, chapterCitations, exportLabels, type ExportBook } from './export-epub'

// Non-Latin-1 code points that WinAnsiEncoding (cp1252) can still represent.
const WIN_ANSI_EXTRA = new Set('€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ')
const REPLACEMENTS: Record<string, string> = {
  '\t': '  ',
  ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ', ' ': ' ',
  ' ': ' ',
  '‐': '-', '‑': '-', '‒': '–', '―': '—', '−': '-',
  '′': '\'', '″': '"', '‛': '’', '‟': '”', '‹': '‹', '›': '›',
  '→': '->', '←': '<-', '↔': '<->', '⇒': '=>', '≤': '<=', '≥': '>=', '≠': '!=',
  '✓': 'v', '✔': 'v', '✗': 'x', '✘': 'x', '•': '•', '●': '•', '‣': '•',
  'Œ': 'Œ', 'œ': 'œ',
}

/** Maps text onto what the standard PDF fonts (WinAnsi) can draw: keeps Latin-1 and cp1252 punctuation, drops emoji, turns other scripts into '?'. */
export function toWinAnsi(text: string): string {
  let out = ''
  for (const ch of String(text ?? '').normalize('NFC')) {
    const code = ch.codePointAt(0)!
    if (ch === '\n' || (code >= 0x20 && code <= 0x7E) || (code >= 0xA0 && code <= 0xFF) || WIN_ANSI_EXTRA.has(ch)) out += ch
    else if (ch in REPLACEMENTS) out += REPLACEMENTS[ch]
    else if (code < 0xA0 || /[\p{Extended_Pictographic}\p{M}\p{Cf}︀-️]/u.test(ch)) continue
    else {
      // Letters with diacritics outside Latin-1 (ő, č…) degrade to their base letter.
      const base = ch.normalize('NFKD').replace(/\p{M}/gu, '')
      out += base && [...base].every(c => c.codePointAt(0)! < 0x7F) ? base : '?'
    }
  }
  return out
}

const PAGE: [number, number] = [419.53, 595.28] // A5
const MARGIN = { top: 54, bottom: 58, left: 50, right: 50 }
const INK = '#1f1c18'
const MUTED = '#6a645c'
const STATUS_COLOR = { done: '#2f6b45', blocked: '#a33a2a', waiting: '#9a6a12', info: '#4d5a6a' }

type Doc = PDFKit.PDFDocument

export async function buildPdf(book: ExportBook, opts: { origin: string }): Promise<Uint8Array> {
  const L = exportLabels(book.language)
  const t = toWinAnsi
  const doc: Doc = new PDFDocument({
    size: PAGE,
    margins: MARGIN,
    bufferPages: true,
    lang: book.language,
    displayTitle: true,
    info: { Title: t(book.title), Subject: t(book.subtitle), Author: 'Folio', Creator: 'Folio', Keywords: `folio ${book.slug} v${book.version}` },
  })
  const chunks: Buffer[] = []
  doc.on('data', (chunk: Buffer) => chunks.push(chunk))
  const done = new Promise<void>((resolve, reject) => {
    doc.on('end', () => resolve())
    doc.on('error', reject)
  })

  const width = PAGE[0] - MARGIN.left - MARGIN.right
  const bottom = () => doc.page.height - doc.page.margins.bottom
  const ensure = (height: number) => {
    if (doc.y + height > bottom()) doc.addPage()
  }
  const link = (citation: Citation) => absoluteUrl(citation.url, opts.origin)
  const citationsOf = (ids?: string[]) => (ids ?? []).map(id => book.content.citations[id]).filter((c): c is Citation => !!c)

  // Writes linked citation labels; `continued` lets them follow text already started on the line.
  const writeCites = (list: Citation[]) => {
    list.forEach((c, i) => {
      const last = i === list.length - 1
      doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(i ? ' · ' : '  — ', { continued: true })
      const href = link(c)
      doc.fillColor(href ? '#1f4f8a' : MUTED).text(t(c.label), { continued: !last, link: href, underline: !!href })
    })
    if (!list.length) doc.text('', { continued: false })
    doc.fillColor(INK)
  }

  // Monospace block drawn line by line so the background follows page breaks.
  const monoBlock = (lines: { text: string, bg: string, color: string }[]) => {
    doc.font('Courier').fontSize(7.5)
    const pad = 5
    ensure(24)
    doc.rect(MARGIN.left, doc.y, width, pad).fill(lines[0]?.bg ?? '#f4f1ea')
    doc.y += pad
    for (const line of lines) {
      const text = t(line.text) || ' '
      const h = doc.heightOfString(text, { width: width - pad * 2 })
      ensure(h)
      doc.rect(MARGIN.left, doc.y, width, h).fill(line.bg)
      doc.fillColor(line.color).text(text, MARGIN.left + pad, doc.y, { width: width - pad * 2 })
    }
    doc.rect(MARGIN.left, doc.y, width, pad).fill(lines.at(-1)?.bg ?? '#f4f1ea')
    doc.y += pad
    doc.x = MARGIN.left
    doc.fillColor(INK).moveDown(0.6)
  }

  const renderBlock = (block: Block) => {
    doc.x = MARGIN.left
    switch (block.type) {
      case 'heading':
        ensure(60)
        doc.moveDown(0.4).font('Times-Bold').fontSize(13).fillColor(INK).text(t(block.text), { width }).moveDown(0.3)
        break
      case 'paragraph': {
        const cites = citationsOf(block.cites)
        doc.font('Times-Roman').fontSize(10.5).fillColor(INK).text(t(block.text), { width, lineGap: 1.5, continued: cites.length > 0 })
        writeCites(cites)
        doc.moveDown(0.5)
        break
      }
      case 'fact': {
        const cites = citationsOf(block.cites)
        ensure(28)
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor(STATUS_COLOR[block.status]).text(`${t(L.status[block.status]).toUpperCase()}  `, { width, continued: true })
        doc.font('Times-Roman').fontSize(10.5).fillColor(INK).text(t(block.text), { lineGap: 1.5, continued: cites.length > 0 })
        writeCites(cites)
        doc.moveDown(0.35)
        break
      }
      case 'quote': {
        const cites = citationsOf(block.cites)
        const startPage = doc.page
        const startY = doc.y
        doc.font('Times-Italic').fontSize(10.5).fillColor('#3b3631').text(t(block.text), MARGIN.left + 12, doc.y, { width: width - 12, lineGap: 1.5, continued: cites.length > 0 })
        writeCites(cites)
        if (doc.page === startPage) doc.moveTo(MARGIN.left + 2, startY).lineTo(MARGIN.left + 2, doc.y).lineWidth(1.5).strokeColor('#bbb5aa').stroke()
        doc.x = MARGIN.left
        doc.moveDown(0.5)
        break
      }
      case 'notice': {
        ensure(30)
        const label = `${L.notice[block.tone]}${book.language === 'fr' ? ' : ' : ': '}`
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(block.tone === 'warning' ? '#9a5a12' : '#4d5a6a').text(t(label), { width, continued: true })
        doc.font('Helvetica').fillColor(INK).text(t(block.text))
        doc.moveDown(0.5)
        break
      }
      case 'code':
        if (block.caption) {
          ensure(40)
          doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(t(block.caption), { width }).moveDown(0.2)
        }
        monoBlock(block.code.replace(/\n$/, '').split('\n').map(text => ({ text, bg: '#f4f1ea', color: INK })))
        break
      case 'diff':
        ensure(40)
        doc.font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(t(block.file), { width }).moveDown(0.2)
        monoBlock(block.patch.replace(/\n$/, '').split('\n').map((text) => {
          if (text.startsWith('+') && !text.startsWith('+++')) return { text, bg: '#e3f2e6', color: '#1d5530' }
          if (text.startsWith('-') && !text.startsWith('---')) return { text, bg: '#f8e2e2', color: '#7d2222' }
          if (text.startsWith('@@')) return { text, bg: '#f4f1ea', color: MUTED }
          return { text, bg: '#f4f1ea', color: INK }
        }))
        break
      case 'trace':
        ensure(40)
        doc.font('Helvetica-Bold').fontSize(8.5).fillColor(INK).text(t(block.title), { width }).moveDown(0.2)
        block.steps.forEach((step, i) => {
          doc.font('Helvetica').fontSize(8.5).fillColor(step.status === 'error' ? STATUS_COLOR.blocked : INK)
            .text(`${i + 1}. [${t(L.step[step.status])}] `, MARGIN.left + 8, doc.y, { width: width - 8, continued: true })
            .fillColor(INK).text(t(step.label) + (step.detail ? t(` — ${step.detail}`) : ''))
        })
        doc.x = MARGIN.left
        doc.moveDown(0.5)
        break
    }
  }

  const renderChapter = (chapter: Chapter, index: number) => {
    doc.addPage()
    doc.addNamedDestination(`chapter-${index}`)
    doc.font('Times-Bold').fontSize(18).fillColor(INK).text(t(chapter.title), { width })
    const meta = [chapter.agent?.name, chapter.sources.map(s => sourceTitle(s, book.language)).join(', ')].filter(Boolean).join(' · ')
    if (meta) doc.moveDown(0.2).font('Helvetica').fontSize(8).fillColor(MUTED).text(t(meta), { width })
    doc.moveDown(1)
    for (const block of chapter.blocks) renderBlock(block)

    const used = chapterCitations(chapter, book.content.citations)
    if (used.length) {
      ensure(60)
      doc.x = MARGIN.left
      doc.moveDown(0.8).font('Times-Bold').fontSize(11).fillColor(INK).text(L.sources, { width }).moveDown(0.3)
      used.forEach((c, i) => {
        const href = link(c)
        doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(`${i + 1}. `, { width, continued: true })
          .fillColor(href ? '#1f4f8a' : INK).text(t(c.label), { link: href, underline: !!href, continued: true })
          .fillColor(MUTED).text(t(` (${sourceTitle(c.source, book.language)})`), { link: null, underline: false })
      })
    }
  }

  // Title page
  const palette = coverPalette(book.cover.seed)
  doc.rect(0, 0, PAGE[0], 14).fill(palette.bg)
  doc.rect(0, 14, PAGE[0], 4).fill(palette.accent)
  doc.y = 170
  doc.font('Times-Bold').fontSize(28).fillColor(INK).text(t(book.title), MARGIN.left, doc.y, { width })
  if (book.subtitle) doc.moveDown(0.4).font('Times-Italic').fontSize(14).fillColor('#3b3631').text(t(book.subtitle), { width })
  if (book.agents.length) {
    doc.moveDown(1.5).font('Helvetica-Bold').fontSize(8).fillColor(MUTED).text(L.agents.toUpperCase(), { width, characterSpacing: 0.8 })
    doc.moveDown(0.2).font('Helvetica').fontSize(10).fillColor(INK).text(t(book.agents.map(a => a.name).join(' · ')), { width })
  }
  if (book.cover.incomplete) doc.moveDown(1).font('Helvetica-Oblique').fontSize(9).fillColor(STATUS_COLOR.blocked).text(t(bookStrings(book.language).incomplete), { width })
  doc.font('Times-Italic').fontSize(11).fillColor(MUTED).text('Folio', MARGIN.left, PAGE[1] - MARGIN.bottom - 20, { width, lineBreak: false })

  // Reserve enough pages for the contents, then fill them once chapter page numbers are known.
  const chapters = book.content.chapters
  const numberWidth = 28
  const entryHeight = (chapter: Chapter) => doc.font('Times-Roman').fontSize(10.5).heightOfString(t(chapter.title), { width: width - numberWidth }) + 6
  const tocUsable = PAGE[1] - MARGIN.top - MARGIN.bottom - 50
  const tocPages: Chapter[][] = [[]]
  let used = 0
  for (const chapter of chapters) {
    const h = entryHeight(chapter)
    if (used + h > tocUsable && tocPages.at(-1)!.length) {
      tocPages.push([])
      used = 0
    }
    tocPages.at(-1)!.push(chapter)
    used += h
  }
  const tocStart = doc.bufferedPageRange().count
  for (let i = 0; i < tocPages.length; i++) doc.addPage()

  // renderChapter() opens a new page, so its index is the current page count.
  const chapterStart = chapters.map((chapter, i) => {
    const start = doc.bufferedPageRange().count
    renderChapter(chapter, i)
    return start
  })

  let entry = 0
  tocPages.forEach((page, p) => {
    doc.switchToPage(tocStart + p)
    doc.x = MARGIN.left
    doc.y = MARGIN.top
    if (p === 0) doc.font('Times-Bold').fontSize(18).fillColor(INK).text(L.contents, { width }).moveDown(1)
    for (const chapter of page) {
      const i = entry++
      const y = doc.y
      doc.font('Times-Roman').fontSize(10.5).fillColor(INK)
      doc.text(String(chapterStart[i]! + 1), MARGIN.left + width - numberWidth, y, { width: numberWidth, align: 'right', goTo: `chapter-${i}`, lineBreak: false })
      doc.text(t(chapter.title), MARGIN.left, y, { width: width - numberWidth, goTo: `chapter-${i}` })
      doc.y += 6
    }
  })

  // Footer page numbers (skip the title page). Bottom margin is lifted so pdfkit doesn't add a page.
  const range = doc.bufferedPageRange()
  for (let i = range.start + 1; i < range.start + range.count; i++) {
    doc.switchToPage(i)
    const margin = doc.page.margins.bottom
    doc.page.margins.bottom = 0
    doc.font('Helvetica').fontSize(8).fillColor(MUTED).text(String(i + 1), MARGIN.left, PAGE[1] - 34, { width, align: 'center', lineBreak: false })
    doc.page.margins.bottom = margin
  }

  doc.end()
  await done
  return new Uint8Array(Buffer.concat(chunks))
}
