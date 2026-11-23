import { z } from 'zod'
import { redactSecrets } from '../../shared/utils/redact'

export const sourceName = z.string().trim().min(1).max(40).transform(v => sourceSlug(v)).refine(v => v.length > 0, 'invalid source name')
const text = (max: number) => z.string().max(max).transform(redactSecrets)
const status = z.enum(['done', 'blocked', 'waiting', 'info'])
const url = z.string().trim().max(2000).refine(v => /^https?:\/\//.test(v) || v.startsWith('/'), 'must be an http(s) URL or an instance path')

export const agentRef = z.union([
  z.string().trim().min(1).max(60),
  z.object({ id: z.string().trim().min(1).max(60), name: z.string().trim().max(80).optional(), kind: z.enum(['t3code', 'claude-code', 'codex', 'grok', 'cloud', 'other']).optional() }),
]).transform(v => (typeof v === 'string' ? { id: slugify(v), name: undefined, kind: undefined } : { ...v, id: slugify(v.id) }))

export const needInput = z.object({
  key: z.string().trim().min(1).max(200),
  kind: z.enum(['decision', 'blocker', 'review']).default('decision'),
  title: z.string().trim().min(1).max(500).transform(redactSecrets),
  detail: text(2000).default(''),
  url: url.optional(),
  deadline: z.iso.datetime({ offset: true }).optional(),
  blocking: z.array(z.string().trim().max(200)).max(20).default([]),
})

export const reportInput = z.object({
  agent: agentRef,
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  key: z.string().trim().max(200).optional(),
  project: z.string().trim().max(120).optional(),
  title: z.string().trim().min(1).max(300).transform(redactSecrets),
  summary: text(8000).default(''),
  status: status.default('done'),
  items: z.array(z.object({
    text: text(2000).default(''),
    status: status.optional(),
    url: url.optional(),
    label: z.string().max(200).optional(),
    code: z.object({ lang: z.string().max(30).default('text'), code: text(20000) }).optional(),
    diff: z.object({ file: z.string().max(300), patch: text(40000) }).optional(),
    steps: z.array(z.object({ label: z.string().max(300), status: z.enum(['done', 'error', 'running', 'skipped']), detail: text(1000).optional() })).max(50).optional(),
  })).max(100).default([]),
  needs: z.array(needInput).max(20).default([]),
})

export const factsInput = z.object({
  source: sourceName,
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  run: z.object({ status: z.enum(['ok', 'error']), message: z.string().max(300).optional() }).optional(),
  facts: z.array(z.object({
    id: z.string().trim().min(1).max(200),
    kind: z.string().trim().max(40).default('item'),
    status: status.default('info'),
    title: z.string().trim().min(1).max(500).transform(redactSecrets),
    body: text(2000).default(''),
    url,
    label: z.string().trim().max(200).optional(),
    actor: z.string().trim().max(120).optional(),
    agent: z.string().trim().max(60).optional(),
    project: z.string().trim().max(120).optional(),
    occurredAt: z.iso.datetime({ offset: true }).optional(),
  })).max(500).default([]),
})

export const workInput = z.object({
  agent: agentRef,
  action: z.enum(['claim', 'heartbeat', 'checkpoint', 'release', 'done']),
  task: z.object({
    key: z.string().trim().min(1).max(200),
    title: z.string().trim().max(500).optional(),
    project: z.string().trim().max(120).optional(),
    url: url.optional(),
    source: sourceName.optional(),
  }),
  checkpoint: z.object({ note: z.string().trim().min(1).max(2000).transform(redactSecrets), step: z.string().max(100).optional(), resumeHint: z.string().max(2000).optional() }).optional(),
  force: z.boolean().default(false),
})

export async function todayDay() {
  return dayIn((await getSettings()).timezone)
}
