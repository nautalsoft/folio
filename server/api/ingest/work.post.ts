import { eq } from 'drizzle-orm'
import { hashId } from '../../utils/ids'
import { STALE_MINUTES } from '../../folio/library'

export default defineEventHandler(async (event) => {
  requireIngestToken(event)
  const input = await readValidatedBody(event, workInput.parse)
  const db = await useDb()
  await ensureAgent(input.agent.id, input.agent.name, input.agent.kind)
  const id = hashId('w', 'ingest', input.task.key)
  const now = new Date().toISOString()
  const [current] = await db.select().from(schema.workItems).where(eq(schema.workItems.id, id))
  const lastCheckpoint = async () => (await db.select().from(schema.checkpoints).where(eq(schema.checkpoints.workItemId, id)).orderBy(schema.checkpoints.createdAt)).pop() ?? null
  const heldByOther = current?.status === 'claimed' && current.claimedBy && current.claimedBy !== input.agent.id
  const stale = !current?.heartbeatAt || Date.now() - Date.parse(current.heartbeatAt) > STALE_MINUTES * 60_000

  if (input.action === 'claim') {
    if (heldByOther && !stale && !input.force) {
      setResponseStatus(event, 409)
      return { ok: false, reason: 'claimed', claimedBy: current!.claimedBy, claimedAt: current!.claimedAt, heartbeatAt: current!.heartbeatAt, checkpoint: await lastCheckpoint() }
    }
    const previousClaim = heldByOther ? { agentId: current!.claimedBy!, claimedAt: current!.claimedAt! } : null
    const values = { title: input.task.title ?? current?.title ?? input.task.key, project: input.task.project ?? current?.project ?? null, source: input.task.source ?? current?.source ?? 'agent', sourceUrl: input.task.url ?? current?.sourceUrl ?? null, status: 'claimed', claimedBy: input.agent.id, claimedAt: now, heartbeatAt: now, previousClaim, updatedAt: now }
    await db.insert(schema.workItems).values({ id, ...values }).onConflictDoUpdate({ target: schema.workItems.id, set: values })
    await logActivity({ type: 'claim', agentId: input.agent.id, title: values.title, detail: previousClaim ? `took over from ${previousClaim.agentId}` : null, url: '/work' })
    return { ok: true, id, resumeFrom: previousClaim || current ? await lastCheckpoint() : null }
  }
  if (!current) throw createError({ statusCode: 404, statusMessage: 'Unknown task: claim it first' })
  if (heldByOther) {
    setResponseStatus(event, 409)
    return { ok: false, reason: 'claimed', claimedBy: current.claimedBy }
  }
  if (input.action === 'heartbeat') {
    await db.update(schema.workItems).set({ heartbeatAt: now, updatedAt: now }).where(eq(schema.workItems.id, id))
    return { ok: true }
  }
  if (input.action === 'checkpoint') {
    if (!input.checkpoint) throw createError({ statusCode: 400, statusMessage: 'checkpoint is required' })
    await db.insert(schema.checkpoints).values({ id: newId('k'), workItemId: id, agentId: input.agent.id, note: input.checkpoint.note, step: input.checkpoint.step ?? null, resumeHint: input.checkpoint.resumeHint ?? null })
    await db.update(schema.workItems).set({ heartbeatAt: now, updatedAt: now }).where(eq(schema.workItems.id, id))
    await logActivity({ type: 'checkpoint', agentId: input.agent.id, title: `${current.title} : ${input.checkpoint.note}`, url: '/work' })
    return { ok: true }
  }
  const status = input.action === 'done' ? 'done' : 'released'
  await db.update(schema.workItems).set({ status, claimedBy: status === 'done' ? current.claimedBy : null, updatedAt: now }).where(eq(schema.workItems.id, id))
  await logActivity({ type: input.action, agentId: input.agent.id, title: current.title, url: '/work' })
  return { ok: true }
})
