import { eq } from 'drizzle-orm'
import { renderCoverSvg } from '../../../shared/utils/cover'
import { bookStrings } from '../../../shared/utils/book-strings'

export default defineEventHandler(async (event) => {
  await ensureDemo()
  const slug = getRouterParam(event, 'slug')!.replace(/\.svg$/, '')
  const db = await useDb()
  const [book] = await db.select({ cover: schema.books.cover, language: schema.books.language, version: schema.books.version }).from(schema.books).where(eq(schema.books.slug, slug))
  if (!book) throw createError({ statusCode: 404 })
  setHeader(event, 'content-type', 'image/svg+xml; charset=utf-8')
  setHeader(event, 'cache-control', 'public, max-age=300')
  return renderCoverSvg(book.cover, { incomplete: bookStrings(book.language === 'en' ? 'en' : 'fr').incomplete })
})
