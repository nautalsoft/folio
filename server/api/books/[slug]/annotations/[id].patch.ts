import { and, eq } from 'drizzle-orm'
import { z } from 'zod'
import { toAnnotation } from '../../../../folio/library'

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, z.object({ note: z.string().max(5000).optional(), color: z.enum(['yellow', 'green', 'blue', 'pink']).optional() }).parse)
  const db = await useDb()
  const [row] = await db.update(schema.annotations).set({ ...input, ...(input.note ? { kind: 'note' } : {}) })
    .where(and(eq(schema.annotations.id, getRouterParam(event, 'id')!), eq(schema.annotations.bookSlug, getRouterParam(event, 'slug')!))).returning()
  if (!row) throw createError({ statusCode: 404 })
  return toAnnotation(row)
})
