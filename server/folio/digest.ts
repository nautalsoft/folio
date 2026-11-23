import { and, eq, isNull } from 'drizzle-orm'
import type { CollectorKind, SourceRunSummary, WorkStatus } from '../../shared/types/folio'
import { dayBounds, dayIn, timeIn } from '../../shared/utils/time'
import { collectors } from '../collectors'
import { hashId } from '../utils/ids'
import { redactSecrets } from '../../shared/utils/redact'
import { compileDay, type CompileResult } from './compile'

export function resolveAgent(source: string, actor: string | null | undefined, agentIds: Set<string>): string | null {
  if (!actor) return null
  const key = actor.toLowerCase()
  for (const pair of (process.env.FOLIO_AGENT_ALIASES || '').split(',')) {
    const [left, agent] = pair.split('=').map(s => s?.trim())
    if (!left || !agent) continue
    const [aliasSource, alias] = left.includes(':') ? left.split(/:(.*)/s) : ['*', left]
    if ((aliasSource === '*' || aliasSource === source) && alias?.toLowerCase() === key) return agent
  }
  return agentIds.has(key) ? key : null
}

export async function collectSource(kind: CollectorKind, day: string): Promise<SourceRunSummary> {
  const db = await useDb()
  const settings = await getSettings()
  const collector = collectors[kind]
  const at = new Date().toISOString()
  const record = async (status: SourceRunSummary['status'], count: number, message?: string) => {
    await db.insert(schema.sourceRuns).values({ day, source: kind, status, count, message: message ?? null, finishedAt: new Date().toISOString() })
    return { source: kind, status, count, message, at }
  }
  if (!settings.sources[kind]) return record('skipped', 0)
  if (!collector.configured()) return record('not_configured', 0)
  const { start, end } = dayBounds(day, settings.timezone)
  try {
    const result = await collector.collect({ day, start, end, timezone: settings.timezone, signal: AbortSignal.timeout(90_000) })
    const agentIds = new Set((await db.select({ id: schema.agents.id }).from(schema.agents)).map(a => a.id))
    for (const fact of result.facts) {
      const id = hashId('f', kind, fact.externalId, day)
      const row = {
        id,
        day,
        source: kind,
        externalId: fact.externalId,
        kind: fact.kind,
        status: fact.status,
        title: redactSecrets(fact.title).slice(0, 500),
        body: redactSecrets(fact.body ?? '').slice(0, 2000),
        url: fact.url || `/facts/${id}`,
        label: fact.label.slice(0, 200),
        actor: fact.actor ?? null,
        agentId: resolveAgent(kind, fact.actor, agentIds),
        project: fact.project ?? null,
        occurredAt: fact.occurredAt,
        collectedAt: new Date().toISOString(),
      }
      await db.insert(schema.facts).values(row).onConflictDoUpdate({ target: [schema.facts.source, schema.facts.externalId, schema.facts.day], set: row })
    }
    for (const need of result.needs ?? []) {
      await db.insert(schema.needs).values({
        id: hashId('n', kind, need.externalId),
        day,
        kind: need.kind,
        title: redactSecrets(need.title).slice(0, 500),
        detail: redactSecrets(need.detail ?? '').slice(0, 2000),
        agentId: resolveAgent(kind, need.actor, agentIds),
        source: kind,
        sourceUrl: need.url,
        deadline: need.deadline ?? null,
        blocking: need.blocking ?? [],
        externalKey: need.externalId,
      }).onConflictDoUpdate({ target: [schema.needs.source, schema.needs.externalKey], set: { sourceUrl: need.url, title: redactSecrets(need.title).slice(0, 500), detail: redactSecrets(need.detail ?? '').slice(0, 2000), deadline: need.deadline ?? null, blocking: need.blocking ?? [] } })
    }
    for (const work of result.work ?? []) {
      const id = hashId('w', kind, work.externalId)
      const claimedBy = resolveAgent(kind, work.claimedBy, agentIds) ?? work.claimedBy
      await db.insert(schema.workItems).values({ id, title: redactSecrets(work.title).slice(0, 500), project: work.project ?? null, source: kind, sourceUrl: work.url, status: work.status, claimedBy, claimedAt: work.claimedAt, heartbeatAt: work.heartbeatAt, updatedAt: new Date().toISOString() })
        .onConflictDoUpdate({ target: schema.workItems.id, set: { title: redactSecrets(work.title).slice(0, 500), sourceUrl: work.url, status: work.status, claimedBy, claimedAt: work.claimedAt, heartbeatAt: work.heartbeatAt, updatedAt: new Date().toISOString() } })
      if (work.checkpoint) {
        await db.insert(schema.checkpoints).values({ id: hashId('k', id, work.checkpoint.at), workItemId: id, agentId: claimedBy, note: redactSecrets(work.checkpoint.note).slice(0, 2000), createdAt: work.checkpoint.at }).onConflictDoNothing()
      }
    }
    await logActivity({ type: 'source.collected', source: kind, title: `${collector.label} : ${result.facts.length}` })
    return record('ok', result.facts.length)
  }
  catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : 'unknown error'
    await logActivity({ type: 'source.failed', source: kind, title: `${collector.label}`, detail: message })
    return record('error', 0, message)
  }
}

export async function notifyNewNeeds() {
  const db = await useDb()
  const pending = await db.select().from(schema.needs).where(and(eq(schema.needs.status, 'open'), isNull(schema.needs.notifiedAt)))
  for (const need of pending) {
    await emitWebhook('needs_you.created', { id: need.id, kind: need.kind, title: need.title, detail: need.detail, deadline: need.deadline, blocking: need.blocking, url: env.publicUrl ? `${env.publicUrl}/needs#${need.id}` : null, sourceUrl: need.sourceUrl })
    await db.update(schema.needs).set({ notifiedAt: new Date().toISOString() }).where(eq(schema.needs.id, need.id))
  }
}

export interface RunReport {
  day: string
  sources: SourceRunSummary[]
  book: CompileResult
}

export async function runDay(day: string, options: { baseUrl: string, collect?: boolean, publish?: boolean, useModel?: boolean }): Promise<RunReport> {
  const sources: SourceRunSummary[] = []
  if (options.collect !== false) {
    for (const kind of Object.keys(collectors) as CollectorKind[]) sources.push(await collectSource(kind, day))
  }
  await notifyNewNeeds()
  const book = await compileDay(day, { baseUrl: options.baseUrl, useModel: options.useModel, publish: options.publish !== false })
  const failed = sources.filter(s => s.status === 'error').map(s => s.source)
  if (book.published) {
    await logActivity({ type: 'book.published', source: 'agent', title: day, detail: book.incomplete ? `incomplete: ${failed.join(', ')}` : null, url: `/read/${day}` })
    await emitWebhook('book.published', { slug: day, version: book.version, updated: !book.created, incomplete: book.incomplete, failedSources: failed, url: options.baseUrl ? `${options.baseUrl}/read/${day}` : null })
  }
  else if (options.publish !== false) {
    await logActivity({ type: 'digest.failed', source: 'agent', title: day, detail: 'empty' })
    await emitWebhook('digest.failed', { day, reason: book.empty ? 'empty' : 'not_published', sources })
  }
  return { day, sources, book }
}

let lastAttempt = { day: '', at: 0 }

export async function digestIfDue(baseUrl: string, now = new Date(), opts: { ignoreTime?: boolean } = {}) {
  const settings = await getSettings()
  const day = dayIn(settings.timezone, now)
  if (!opts.ignoreTime && timeIn(settings.timezone, now) < settings.digestTime) return null
  const db = await useDb()
  const [existing] = await db.select({ status: schema.books.status, publishedAt: schema.books.publishedAt }).from(schema.books).where(eq(schema.books.slug, day))
  if (existing?.status === 'published') return null
  if (lastAttempt.day === day && now.getTime() - lastAttempt.at < 60 * 60_000) return null
  lastAttempt = { day, at: now.getTime() }
  return runDay(day, { baseUrl })
}

export type { WorkStatus }
