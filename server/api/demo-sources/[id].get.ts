import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const db = await useDb()
  const [row] = await db.select().from(schema.demoSources).where(eq(schema.demoSources.id, getRouterParam(event, 'id')!))
  if (!row) throw createError({ statusCode: 404 })
  return row
})
