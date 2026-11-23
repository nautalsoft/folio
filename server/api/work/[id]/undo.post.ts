import { eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')!
  const db = await useDb()
  const [item] = await db.select().from(schema.workItems).where(eq(schema.workItems.id, id))
  if (!item?.previousClaim) throw createError({ statusCode: 409, statusMessage: 'Nothing to undo' })
  if (item.status === 'claimed') throw createError({ statusCode: 409, statusMessage: 'Already claimed again' })
  await db.update(schema.workItems).set({ status: 'claimed', claimedBy: item.previousClaim.agentId, claimedAt: item.previousClaim.claimedAt, previousClaim: null, updatedAt: new Date().toISOString() }).where(eq(schema.workItems.id, id))
  await logActivity({ type: 'claim.restored', agentId: item.previousClaim.agentId, title: item.title, url: '/work' })
  return { ok: true }
})
