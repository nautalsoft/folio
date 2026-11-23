import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = await useDb()
  const [item] = await db.select().from(schema.workItems).where(eq(schema.workItems.id, id))
  if (!item) throw createError({ statusCode: 404 })
  if (item.status !== 'claimed' || !item.claimedBy) throw createError({ statusCode: 409, statusMessage: 'Not claimed' })
  const previousClaim = { agentId: item.claimedBy, claimedAt: item.claimedAt ?? new Date().toISOString() }
  await db.update(schema.workItems).set({ status: 'released', claimedBy: null, previousClaim, updatedAt: new Date().toISOString() }).where(eq(schema.workItems.id, id))
  await logActivity({ type: 'claim.released', agentId: previousClaim.agentId, title: item.title, detail: 'released from Folio', url: '/work' })
  return { ok: true, previousClaim }
})
