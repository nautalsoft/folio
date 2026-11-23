import { strToU8, zipSync, type Zippable } from 'fflate'
import type { AgentKind, Block, BookContent, Chapter, Citation, CoverSpec, TraceStep, WorkStatus } from '../../shared/types/folio'
import { renderCoverSvg } from '../../shared/utils/cover'
import { bookStrings, sourceTitle } from '../../shared/utils/book-strings'

export interface ExportBook {
  slug: string
  kind: 'day' | 'month'
  title: string
  subtitle: string
  language: 'fr' | 'en'
  version: number
  updatedAt: string
  agents: { name: string, kind: AgentKind }[]
  content: BookContent
  cover: CoverSpec
}

const LABELS = {
  fr: {
    status: { done: 'Fait', blocked: 'Bloqué', waiting: 'En attente', info: 'Info' } as Record<WorkStatus, string>,
    step: { done: 'fait', error: 'erreur', running: 'en cours', skipped: 'ignoré' } as Record<TraceStep['status'], string>,
    notice: { info: 'Note', warning: 'Attention' },
    contents: 'Sommaire',
    sources: 'Sources',
    cover: 'Couverture',
    agents: 'Agents',
  },
  en: {
    status: { done: 'Done', blocked: 'Blocked', waiting: 'Waiting', info: 'Info' } as Record<WorkStatus, string>,
    step: { done: 'done', error: 'error', running: 'running', skipped: 'skipped' } as Record<TraceStep['status'], string>,
    notice: { info: 'Note', warning: 'Warning' },
    contents: 'Contents',
    sources: 'Sources',
    cover: 'Cover',
    agents: 'Agents',
  },
}

export const exportLabels = (lang: 'fr' | 'en') => LABELS[lang]

// Characters that are not allowed in XML 1.0, including lone surrogates.
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g

const stripInvalid = (value: string) => String(value ?? '').replace(INVALID_XML, '')

export function escapeXml(value: string): string {
  return stripInvalid(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]!)
}

/** Resolves relative citation URLs against the instance origin; drops anything that is not http(s)/mailto. */
export function absoluteUrl(url: string, origin: string): string | null {
  try {
    const parsed = new URL(url, origin.endsWith('/') ? origin : `${origin}/`)
    return ['http:', 'https:', 'mailto:'].includes(parsed.protocol) ? parsed.href : null
  }
  catch {
    return null
  }
}

/** Citations referenced by a chapter, in order of first appearance. */
export function chapterCitations(chapter: Chapter, citations: Record<string, Citation>): Citation[] {
  const seen = new Map<string, Citation>()
  for (const block of chapter.blocks) {
    const ids = 'cites' in block ? block.cites ?? [] : []
    for (const id of ids) {
      const citation = citations[id]
      if (citation && !seen.has(id)) seen.set(id, citation)
    }
  }
  return [...seen.values()]
}

const CSS = `body { font-family: Georgia, 'Iowan Old Style', 'Times New Roman', serif; line-height: 1.5; margin: 0 5%; }
h1 { font-size: 1.6em; margin: 1.2em 0 0.3em; line-height: 1.2; }
h2 { font-size: 1.2em; margin: 1.4em 0 0.4em; }
p.meta { font-family: sans-serif; font-size: 0.8em; color: #555; margin-top: 0; }
ul.facts { list-style: none; padding-left: 0; }
ul.facts li { margin: 0.5em 0; padding-left: 0.6em; border-left: 3px solid #999; }
li.fact-done { border-left-color: #2f6b45; }
li.fact-blocked { border-left-color: #a33a2a; }
li.fact-waiting { border-left-color: #b07a1a; }
.status { font-family: sans-serif; font-size: 0.75em; font-weight: bold; text-transform: uppercase; letter-spacing: 0.04em; margin-right: 0.4em; }
.cites { font-family: sans-serif; font-size: 0.8em; }
pre { font-family: 'Courier New', Courier, monospace; font-size: 0.8em; line-height: 1.35; background: #f4f1ea; padding: 0.6em; white-space: pre-wrap; word-wrap: break-word; }
figure { margin: 1em 0; }
figcaption, p.file, p.trace-title { font-family: sans-serif; font-size: 0.8em; color: #444; margin-bottom: 0.2em; }
ins { text-decoration: none; background: #e3f2e6; }
del { text-decoration: none; background: #f8e2e2; }
span.hunk { color: #666; }
ol.trace li { margin: 0.2em 0; }
.step-error { color: #a33a2a; }
.detail { color: #555; }
blockquote { margin: 1em 0; padding-left: 1em; border-left: 2px solid #bbb; font-style: italic; }
aside { margin: 1em 0; padding: 0.5em 0.8em; background: #f2efe8; font-family: sans-serif; font-size: 0.9em; }
aside.warning { background: #fbeedd; }
section.sources { margin-top: 2em; font-size: 0.85em; }
nav ol { list-style: none; padding-left: 0; }
nav li { margin: 0.4em 0; }
div.cover { text-align: center; margin: 0; padding: 0; }
div.cover img { max-width: 100%; max-height: 100vh; }
`

function xhtml(lang: string, title: string, body: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="${lang}" xml:lang="${lang}">
<head>
<meta charset="UTF-8"/>
<title>${escapeXml(title)}</title>
<link rel="stylesheet" type="text/css" href="style.css"/>
</head>
<body>
${body}
</body>
</html>
`
}

function renderChapter(chapter: Chapter, book: ExportBook, origin: string): string {
  const L = LABELS[book.language]
  const link = (citation: Citation) => {
    const href = absoluteUrl(citation.url, origin)
    return href ? `<a href="${escapeXml(href)}">${escapeXml(citation.label)}</a>` : escapeXml(citation.label)
  }
  const cites = (ids?: string[]) => {
    const list = (ids ?? []).map(id => book.content.citations[id]).filter((c): c is Citation => !!c)
    return list.length ? ` <span class="cites">— ${list.map(link).join(' · ')}</span>` : ''
  }

  const parts: string[] = []
  let facts: string[] = []
  const flushFacts = () => {
    if (facts.length) parts.push(`<ul class="facts">\n${facts.join('\n')}\n</ul>`)
    facts = []
  }
  const render = (block: Block): string => {
    switch (block.type) {
      case 'heading': return `<h2>${escapeXml(block.text)}</h2>`
      case 'paragraph': return `<p>${escapeXml(block.text)}${cites(block.cites)}</p>`
      case 'quote': return `<blockquote><p>${escapeXml(block.text)}</p>${block.cites?.length ? `<p>${cites(block.cites)}</p>` : ''}</blockquote>`
      case 'notice': return `<aside class="${block.tone}" epub:type="note"><p><strong>${escapeXml(L.notice[block.tone])}${book.language === 'fr' ? ' :' : ':'}</strong> ${escapeXml(block.text)}</p></aside>`
      case 'code': {
        const lang = block.lang.replace(/[^\w-]/g, '')
        return `<figure class="code">${block.caption ? `<figcaption>${escapeXml(block.caption)}</figcaption>` : ''}<pre><code${lang ? ` class="language-${lang}"` : ''}>${escapeXml(block.code)}</code></pre></figure>`
      }
      case 'diff': {
        const lines = block.patch.split('\n').map((line) => {
          const text = escapeXml(line)
          if (line.startsWith('+') && !line.startsWith('+++')) return `<ins>${text}</ins>`
          if (line.startsWith('-') && !line.startsWith('---')) return `<del>${text}</del>`
          if (line.startsWith('@@')) return `<span class="hunk">${text}</span>`
          return text
        })
        return `<figure class="diff"><figcaption>${escapeXml(block.file)}</figcaption><pre>${lines.join('\n')}</pre></figure>`
      }
      case 'trace': {
        const steps = block.steps.map(step => `<li class="step-${step.status}"><span class="status">[${escapeXml(L.step[step.status])}]</span> ${escapeXml(step.label)}${step.detail ? ` <span class="detail">— ${escapeXml(step.detail)}</span>` : ''}</li>`)
        return `<section class="trace"><p class="trace-title">${escapeXml(block.title)}</p><ol class="trace">${steps.join('')}</ol></section>`
      }
      case 'fact': return ''
    }
  }
  for (const block of chapter.blocks) {
    if (block.type === 'fact') {
      facts.push(`<li class="fact fact-${block.status}"><span class="status">${escapeXml(L.status[block.status])}</span> ${escapeXml(block.text)}${cites(block.cites)}</li>`)
      continue
    }
    flushFacts()
    parts.push(render(block))
  }
  flushFacts()

  const meta = [chapter.agent?.name, chapter.sources.map(s => sourceTitle(s, book.language)).join(', ')].filter(Boolean).join(' · ')
  const used = chapterCitations(chapter, book.content.citations)
  const notes = used.length
    ? `<section class="sources" epub:type="endnotes"><h2>${L.sources}</h2><ol>${used.map(c => `<li>${link(c)} <span class="detail">(${escapeXml(sourceTitle(c.source, book.language))})</span></li>`).join('')}</ol></section>`
    : ''
  return xhtml(book.language, chapter.title, `<section epub:type="chapter">
<h1>${escapeXml(chapter.title)}</h1>
${meta ? `<p class="meta">${escapeXml(meta)}</p>\n` : ''}${parts.join('\n')}
${notes}
</section>`)
}

export function buildEpub(book: ExportBook, opts: { origin: string }): Uint8Array {
  const L = LABELS[book.language]
  const lang = book.language
  const chapters = book.content.chapters.map((chapter, i) => ({ chapter, file: `chapter-${i + 1}.xhtml`, id: `c${i + 1}` }))
  const modified = new Date(Number.isNaN(Date.parse(book.updatedAt)) ? Date.now() : Date.parse(book.updatedAt)).toISOString().replace(/\.\d{3}Z$/, 'Z')
  const identifier = `urn:folio:${book.slug}:v${book.version}`

  const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`
  const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${escapeXml(identifier)}</dc:identifier>
<dc:title>${escapeXml(book.title)}</dc:title>
<dc:language>${lang}</dc:language>
<dc:creator>Folio</dc:creator>
${book.subtitle ? `<dc:description>${escapeXml(book.subtitle)}</dc:description>\n` : ''}${book.agents.map(a => `<dc:contributor>${escapeXml(a.name)}</dc:contributor>\n`).join('')}<meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="css" href="style.css" media-type="text/css"/>
<item id="cover-image" href="cover.svg" media-type="image/svg+xml" properties="cover-image"/>
<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
${chapters.map(c => `<item id="${c.id}" href="${c.file}" media-type="application/xhtml+xml"/>`).join('\n')}
</manifest>
<spine>
<itemref idref="cover"/>
<itemref idref="nav"/>
${chapters.map(c => `<itemref idref="${c.id}"/>`).join('\n')}
</spine>
</package>
`
  const nav = xhtml(lang, L.contents, `<nav epub:type="toc" id="toc">
<h1>${L.contents}</h1>
<ol>
${chapters.map(c => `<li><a href="${c.file}">${escapeXml(c.chapter.title)}</a></li>`).join('\n')}
</ol>
</nav>
<nav epub:type="landmarks" hidden="hidden">
<ol>
<li><a epub:type="cover" href="cover.xhtml">${L.cover}</a></li>
<li><a epub:type="toc" href="nav.xhtml">${L.contents}</a></li>
${chapters.length ? `<li><a epub:type="bodymatter" href="${chapters[0]!.file}">${escapeXml(chapters[0]!.chapter.title)}</a></li>\n` : ''}</ol>
</nav>`)
  const coverPage = xhtml(lang, book.title, `<div class="cover" epub:type="cover"><img src="cover.svg" alt="${escapeXml(book.title)}"/></div>`)

  const cover = { ...book.cover, title: stripInvalid(book.cover.title), subtitle: stripInvalid(book.cover.subtitle), agents: book.cover.agents.map(a => ({ ...a, name: stripInvalid(a.name) })) }

  const files: Zippable = {
    // Must be the first entry and stored uncompressed (OCF spec).
    'mimetype': [strToU8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': strToU8(container),
    'OEBPS/content.opf': strToU8(opf),
    'OEBPS/nav.xhtml': strToU8(nav),
    'OEBPS/style.css': strToU8(CSS),
    'OEBPS/cover.svg': strToU8(renderCoverSvg(cover, { incomplete: bookStrings(lang).incomplete })),
    'OEBPS/cover.xhtml': strToU8(coverPage),
  }
  for (const c of chapters) files[`OEBPS/${c.file}`] = strToU8(renderChapter(c.chapter, book, opts.origin))
  return zipSync(files, { level: 6 })
}
