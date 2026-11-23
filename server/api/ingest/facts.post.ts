import { hashId } from '../../utils/ids'
import { resolveAgent } from '../../folio/digest'

export default defineEventHandler(async (event) => {
  requireIngestToken(event)
  const input = await readValidatedBody(event, factsInput.parse)
  const db = await useDb()
  const day = input.day ?? await todayDay()
  const agentIds = new Set((await db.select({ id: schema.agents.id }).from(schema.agents)).map(a => a.id))
  for (const fact of input.facts) {
    const agentId = fact.agent ? slugify(fact.agent) : resolveAgent(input.source, fact.actor, agentIds)
    if (agentId && !agentIds.has(agentId)) {
      await ensureAgent(agentId, fact.agent)
      agentIds.add(agentId)
    }
    const row = {
      id: hashId('f', input.source, fact.id, day), day, source: input.source, externalId: fact.id, kind: fact.kind, status: fact.status,
      title: fact.title, body: fact.body, url: fact.url, label: fact.label ?? sourceTitle(input.source), actor: fact.actor ?? null,
      agentId, project: fact.project ?? null, occurredAt: fact.occurredAt ?? new Date().toISOString(), collectedAt: new Date().toISOString(),
    }
    await db.insert(schema.facts).values(row).onConflictDoUpdate({ target: [schema.facts.source, schema.facts.externalId, schema.facts.day], set: row })
  }
  const run = input.run ?? { status: 'ok' as const }
  await db.insert(schema.sourceRuns).values({ day, source: input.source, status: run.status, count: input.facts.length, message: run.message ?? null, finishedAt: new Date().toISOString() })
  await logActivity({ type: run.status === 'ok' ? 'source.collected' : 'source.failed', source: input.source, title: `${sourceTitle(input.source)} : ${input.facts.length}`, detail: run.message ?? null })
  setResponseStatus(event, 201)
  return { day, source: input.source, accepted: input.facts.length }
})
