import { and, eq } from 'drizzle-orm'
import type { AgentKind } from '../../../../shared/types/folio'
import { buildEpub, type ExportBook } from '../../../folio/export-epub'
import { buildPdf } from '../../../folio/export-pdf'

const FORMATS = {
  epub: { type: 'application/epub+zip', build: buildEpub },
  pdf: { type: 'application/pdf', build: buildPdf },
}

export default defineEventHandler(async (event) => {
  const format = String(getQuery(event).format ?? 'epub')
  if (format !== 'epub' && format !== 'pdf') throw createError({ statusCode: 400, statusMessage: 'Unknown format', message: 'format must be "epub" or "pdf".' })

  const slug = getRouterParam(event, 'slug') ?? ''
  const db = await useDb()
  const [row] = await db.select().from(schema.books).where(and(eq(schema.books.slug, slug), eq(schema.books.status, 'published'))).limit(1)
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Book not found' })

  const book: ExportBook = {
    slug: row.slug,
    kind: row.kind === 'month' ? 'month' : 'day',
    title: row.title,
    subtitle: row.subtitle,
    language: row.language === 'en' ? 'en' : 'fr',
    version: row.version,
    updatedAt: row.updatedAt,
    agents: row.agents.map(a => ({ name: a.name, kind: a.kind as AgentKind })),
    content: row.content,
    cover: row.cover,
  }
  const bytes = await FORMATS[format].build(book, { origin: getRequestURL(event).origin })
  const filename = `folio-${row.slug.replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80)}.${format}`
  setResponseHeaders(event, {
    'Content-Type': FORMATS[format].type,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Content-Length': String(bytes.byteLength),
    'Cache-Control': 'private, no-cache',
  })
  return bytes
})
