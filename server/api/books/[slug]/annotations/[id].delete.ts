import { and, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const db = await useDb()
  await db.delete(schema.annotations).where(and(eq(schema.annotations.id, getRouterParam(event, 'id')!), eq(schema.annotations.bookSlug, getRouterParam(event, 'slug')!)))
  return { ok: true }
})
