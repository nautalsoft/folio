import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const db = await useDb()
  await db.delete(schema.chats).where(eq(schema.chats.id, getRouterParam(event, 'id')!))
  return { ok: true }
})
