import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { applyOverrides } from '../../folio/build'
import { countWords } from '../../../shared/utils/reading'

const body = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  subtitle: z.string().trim().max(300).optional(),
  blocks: z.record(z.string(), z.string().max(5000)).optional(),
})

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')!
  const edit = await readValidatedBody(event, body.parse)
  const db = await useDb()
  const [book] = await db.select().from(schema.books).where(eq(schema.books.slug, slug))
  if (!book) throw createError({ statusCode: 404 })
  const overrides = { ...book.overrides, ...(edit.title ? { title: edit.title } : {}), ...(edit.subtitle !== undefined ? { subtitle: edit.subtitle } : {}), blocks: { ...book.overrides.blocks, ...edit.blocks } }
  const content = applyOverrides(book.content, overrides)
  const title = overrides.title || book.title
  const subtitle = overrides.subtitle ?? book.subtitle
  await db.update(schema.books).set({ overrides, content, title, subtitle, cover: { ...book.cover, title, subtitle }, edited: true, wordCount: countWords(content), updatedAt: new Date().toISOString(), version: book.version + 1 }).where(eq(schema.books.slug, slug))
  await logActivity({ type: 'book.edited', title: `${title}`, url: `/read/${slug}` })
  return { ok: true }
})
