import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const db = await useDb()
  const [report] = await db.select().from(schema.reports).where(eq(schema.reports.id, getRouterParam(event, 'id')!))
  if (!report) throw createError({ statusCode: 404 })
  const [agent] = await db.select().from(schema.agents).where(eq(schema.agents.id, report.agentId))
  return { ...report, agentName: agent?.name ?? report.agentId, agentKind: agent?.kind ?? 'other' }
})
