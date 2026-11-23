import { hashId } from '../../utils/ids'
import { notifyNewNeeds } from '../../folio/digest'

export default defineEventHandler(async (event) => {
  requireIngestToken(event)
  const input = await readValidatedBody(event, reportInput.parse)
  const db = await useDb()
  const day = input.day ?? await todayDay()
  await ensureAgent(input.agent.id, input.agent.name, input.agent.kind)
  const id = input.key ? hashId('r', input.agent.id, input.key) : newId('r')
  const now = new Date().toISOString()
  const row = { agentId: input.agent.id, day, project: input.project ?? null, title: input.title, summary: input.summary, status: input.status, items: input.items, externalKey: input.key ?? id, updatedAt: now }
  await db.insert(schema.reports).values({ id, ...row }).onConflictDoUpdate({ target: schema.reports.id, set: row })
  for (const need of input.needs) {
    await db.insert(schema.needs).values({ id: hashId('n', 'agent', input.agent.id, need.key), day, kind: need.kind, title: need.title, detail: need.detail, agentId: input.agent.id, source: 'agent', sourceUrl: need.url ?? null, deadline: need.deadline ?? null, blocking: need.blocking, externalKey: `${input.agent.id}:${need.key}` })
      .onConflictDoUpdate({ target: [schema.needs.source, schema.needs.externalKey], set: { title: need.title, detail: need.detail, deadline: need.deadline ?? null, blocking: need.blocking, status: 'open', resolvedAt: null } })
  }
  await logActivity({ type: 'report', agentId: input.agent.id, title: input.title, detail: input.summary.slice(0, 300), url: `/reports/${id}` })
  await notifyNewNeeds()
  setResponseStatus(event, 201)
  return { id, day, url: `/reports/${id}` }
})
