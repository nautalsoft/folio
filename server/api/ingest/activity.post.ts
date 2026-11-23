import { z } from 'zod'
import { redactSecrets } from '../../../shared/utils/redact'

const body = z.object({ agent: agentRef, type: z.string().trim().max(40).default('note'), title: z.string().trim().min(1).max(500).transform(redactSecrets), detail: z.string().max(2000).transform(redactSecrets).optional(), url: z.string().max(2000).refine(v => /^https?:\/\//.test(v) || v.startsWith('/'), 'must be an http(s) URL or an instance path').optional(), source: sourceName.optional() })

export default defineEventHandler(async (event) => {
  requireIngestToken(event)
  const input = await readValidatedBody(event, body.parse)
  await ensureAgent(input.agent.id, input.agent.name, input.agent.kind)
  await logActivity({ type: input.type, agentId: input.agent.id, title: input.title, detail: input.detail, url: input.url, source: input.source ?? 'agent' })
  setResponseStatus(event, 201)
  return { ok: true }
})
