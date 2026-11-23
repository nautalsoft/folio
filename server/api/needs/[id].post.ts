import { eq } from 'drizzle-orm'
import { z } from 'zod'

const body = z.object({ action: z.enum(['resolve', 'reopen']), resolution: z.string().trim().max(2000).optional() })

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const input = await readValidatedBody(event, body.parse)
  const db = await useDb()
  const [need] = await db.update(schema.needs).set(input.action === 'resolve'
    ? { status: 'resolved', resolution: input.resolution ?? null, resolvedAt: new Date().toISOString() }
    : { status: 'open', resolution: null, resolvedAt: null }).where(eq(schema.needs.id, id)).returning()
  if (!need) throw createError({ statusCode: 404 })
  await logActivity({ type: input.action === 'resolve' ? 'needs_you.resolved' : 'needs_you.reopened', agentId: need.agentId, title: need.title, detail: input.resolution ?? null, url: `/needs#${id}` })
  return { ok: true }
})
