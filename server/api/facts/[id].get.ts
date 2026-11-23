import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const db = await useDb()
  const [fact] = await db.select().from(schema.facts).where(eq(schema.facts.id, getRouterParam(event, 'id')!))
  if (!fact) throw createError({ statusCode: 404 })
  return { id: fact.id, day: fact.day, source: fact.source, kind: fact.kind, status: fact.status, title: fact.title, body: fact.body, label: fact.label, actor: fact.actor, project: fact.project, occurredAt: fact.occurredAt }
})
