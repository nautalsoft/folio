import { z } from 'zod'
import { hashId } from '../../utils/ids'
import { notifyNewNeeds } from '../../folio/digest'

const body = z.object({ agent: agentRef, needs: z.array(needInput).min(1).max(20) })

export default defineEventHandler(async (event) => {
  requireIngestToken(event)
  const input = await readValidatedBody(event, body.parse)
  const db = await useDb()
  const day = await todayDay()
  await ensureAgent(input.agent.id, input.agent.name, input.agent.kind)
  const ids: string[] = []
  for (const need of input.needs) {
    const id = hashId('n', 'agent', input.agent.id, need.key)
    ids.push(id)
    await db.insert(schema.needs).values({ id, day, kind: need.kind, title: need.title, detail: need.detail, agentId: input.agent.id, source: 'agent', sourceUrl: need.url ?? null, deadline: need.deadline ?? null, blocking: need.blocking, externalKey: `${input.agent.id}:${need.key}` })
      .onConflictDoUpdate({ target: [schema.needs.source, schema.needs.externalKey], set: { title: need.title, detail: need.detail, deadline: need.deadline ?? null, blocking: need.blocking, status: 'open', resolvedAt: null } })
    await logActivity({ type: 'needs_you', agentId: input.agent.id, title: need.title, url: `/needs#${id}` })
  }
  await notifyNewNeeds()
  setResponseStatus(event, 201)
  return { ids }
})
