import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const db = await useDb()
  const [chat] = await db.select().from(schema.chats).where(eq(schema.chats.id, getRouterParam(event, 'id')!))
  return { messages: chat?.messages ?? [] }
})
