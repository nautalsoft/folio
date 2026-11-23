import { board as connect, BoardError, type Board, type MessageView, type ThreadSummaryView } from '@vercel/board'
import type { WorkStatus } from '../../shared/types/folio'
import { inRange, list, probe } from './http'
import { CollectorError, type CollectContext, type CollectedFact, type CollectedNeed, type CollectedWork, type Collector } from './types'

const MAX_PAGES = 20
const TASK_PAGE = 50
const NEED_KINDS = new Set(['decision', 'blocker', 'review'])

const TASK_STATUS: Record<string, WorkStatus> = { completed: 'done', blocked: 'blocked', failed: 'blocked', waiting: 'waiting' }
const WORK_STATUS: Record<string, CollectedWork['status']> = { claimed: 'claimed', completed: 'done', failed: 'released', canceled: 'released' }

function client(): Board {
  return connect({ name: process.env.BOARD_NAME || undefined, team: process.env.FOLIO_BOARD_TEAM || undefined, ensure: false })
}

// SDK errors carry the board's code, message and status: keep them, drop nothing else.
async function call<T>(run: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted()
  try {
    return await run()
  }
  catch (error) {
    if (error instanceof BoardError) throw new CollectorError('board', `${error.code}: ${error.message}`, error.status || undefined)
    throw error
  }
}

// An actor ID is `principal` or `principal+profile`; the profile (an agent's name) is what Folio maps to agents.
const profileOf = (actor: string) => actor.includes('+') ? actor.slice(actor.lastIndexOf('+') + 1) : actor
const actorOf = (m: MessageView) => m.by.profile ?? m.author?.handle ?? m.by.actor
const firstLine = (text: string) => text.trim().split('\n')[0]!.slice(0, 200) || '(attachment)'
const activity = (t: ThreadSummaryView) => t.last?.createdAt ?? t.message.createdAt

async function channels(team: Board, signal: AbortSignal) {
  const configured = list(process.env.FOLIO_BOARD_CHANNELS)
  if (configured.length) return configured
  const paths: string[] = []
  let after: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await call(() => team.channels({ limit: 100, after }), signal)
    paths.push(...data.channels.map(c => c.path))
    if (!data.next) break
    after = data.next
  }
  return paths
}

// Threads come newest-activity last; page back with `older` until a page reaches before the day.
async function activeThreads(team: Board, channel: string, ctx: CollectContext) {
  const threads: ThreadSummaryView[] = []
  let before: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await call(() => team.threads({ channel, limit: 100, before }), ctx.signal)
    threads.push(...data.threads.filter(t => Date.parse(activity(t)) >= ctx.start.getTime()))
    const oldest = data.threads[0]
    if (!data.older || !oldest || Date.parse(activity(oldest)) < ctx.start.getTime()) break
    before = data.older
  }
  return threads
}

const PR_URL = /https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+/i

// GitHub sync (Board's, or any mirror script) labels a PR thread's root `pr=owner/repo#n`, with `state`, `ci` and `review`.
function pullRequest(t: ThreadSummaryView, ctx: CollectContext): CollectedFact | null {
  const m = t.message
  const ref = m.labels.pr
  if (!ref || m.deleted) return null
  const state = (m.labels.state || 'open').toLowerCase()
  const ci = (m.labels.ci || '').toLowerCase()
  const review = (m.labels.review || '').toLowerCase()
  const active = Date.parse(activity(t)) >= ctx.start.getTime() && Date.parse(activity(t)) < ctx.end.getTime()
  const open = state === 'open' || state === 'draft'
  if (!open && !active) return null
  const [, repo = '', number = ''] = /^([^#]+)#(\d+)$/.exec(ref) ?? []
  const url = PR_URL.exec(m.text)?.[0] ?? (repo && number ? `https://github.com/${repo}/pull/${number}` : '')
  if (!url) return null
  const status: WorkStatus = state === 'merged' || state === 'closed'
    ? 'done'
    : ci === 'failure' || review === 'changes_requested' ? 'blocked' : /request|pending/.test(review) ? 'waiting' : 'info'
  return {
    externalId: `pr:${ref.toLowerCase()}`,
    kind: state === 'merged' ? 'pr.merged' : state === 'closed' ? 'pr.closed' : 'pr',
    status,
    title: firstLine(m.text),
    body: [`state ${state}`, ci && `CI ${ci}`, review && `review ${review}`].filter(Boolean).join(' · '),
    url,
    label: ref,
    actor: actorOf(m),
    project: m.labels.repo || repo.split('/').pop() || m.channel,
    occurredAt: activity(t),
  }
}

async function pullRequests(team: Board, channel: string, ctx: CollectContext) {
  const found: CollectedFact[] = []
  let before: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await call(() => team.threads({ channel, label: ['pr'], limit: 500, before }), ctx.signal)
    for (const t of data.threads) {
      const pr = pullRequest(t, ctx)
      if (pr) found.push(pr)
    }
    if (!data.older) break
    before = data.older
  }
  return found
}

function need(m: MessageView, url: string): CollectedNeed | null {
  if (m.task?.state === 'blocked') {
    const reason = m.task.blocked ? [m.task.blocked.kind, m.task.blocked.reason].filter(Boolean).join(': ') : ''
    return { externalId: `task:${m.id}`, kind: 'blocker', title: firstLine(m.text), detail: reason, url, actor: profileOf(m.task.by) }
  }
  const label = m.labels[process.env.FOLIO_BOARD_NEEDS_LABEL || 'needs']
  if (!label) return null
  return { externalId: `label:${m.id}`, kind: NEED_KINDS.has(label) ? label as CollectedNeed['kind'] : 'decision', title: firstLine(m.text), detail: m.text, url, actor: actorOf(m) }
}

async function tasks(team: Board, channel: string | undefined, signal: AbortSignal) {
  const found = new Map<string, ThreadSummaryView>()
  let after: string | undefined
  for (let page = 0; page < MAX_PAGES; page++) {
    const data = await call(() => team.tasks.list({ channel, state: 'open', limit: TASK_PAGE, after }), signal)
    for (const t of data.tasks) found.set(t.message.id, t)
    if (data.tasks.length < TASK_PAGE) break
    after = data.cursor
  }
  const recent = await call(() => team.tasks.list({ channel, state: 'all', latest: true, limit: TASK_PAGE }), signal)
  for (const t of recent.tasks) found.set(t.message.id, t)
  return [...found.values()]
}

function workItem(t: ThreadSummaryView, url: string): CollectedWork {
  const { message: m, last } = t
  const state = m.task!.state
  return {
    externalId: `task:${m.id}`,
    title: firstLine(m.text),
    url,
    project: m.channel,
    claimedBy: state === 'claimed' && m.task!.claim ? profileOf(m.task!.claim.actor) : null,
    claimedAt: null,
    heartbeatAt: state === 'claimed' ? activity(t) : null,
    status: WORK_STATUS[state] ?? 'open',
    checkpoint: last && !last.deleted ? { note: last.text, at: last.createdAt } : null,
  }
}

export const board: Collector = {
  kind: 'board',
  label: 'Vercel Board',
  docsUrl: 'https://github.com/vercel/board#readme',
  envVars: [
    { name: 'BOARD_TOKEN', required: false, description: 'OIDC token for the board (outside Vercel); on a Vercel deployment the deployment\'s OIDC token is used' },
    { name: 'BOARD_NAME', required: false, description: 'Which of the team\'s boards to read (default board when empty)' },
    { name: 'BOARD_URL', required: false, description: 'A board\'s URL instead of the team board; it never receives the deployment\'s OIDC token, so pair it with BOARD_TOKEN' },
    { name: 'FOLIO_BOARD_TEAM', required: false, description: 'Team ID or slug owning the board (else VERCEL_ORG_ID or the deployment\'s team)' },
    { name: 'FOLIO_BOARD_NEEDS_LABEL', required: false, description: 'Label key that marks a thread root as needing a person (default: needs)' },
    { name: 'FOLIO_BOARD_CHANNELS', required: false, description: 'Comma-separated channels to read; all readable channels when empty' },
  ],
  configured: () => Boolean(process.env.BOARD_TOKEN || process.env.BOARD_URL || process.env.BOARD_NAME || process.env.FOLIO_BOARD_TEAM),
  async collect(ctx) {
    const team = client()
    const url = process.env.BOARD_URL || (await call(() => team.discovery(), ctx.signal)).url
    const facts: CollectedFact[] = []
    const needs = new Map<string, CollectedNeed>()
    const names = await channels(team, ctx.signal)
    for (const channel of names) {
      for (const t of await activeThreads(team, channel, ctx)) {
        const thread = t.replies === 0 ? { message: t.message, replies: [] } : await call(() => team.thread(t.message.id), ctx.signal)
        for (const m of [thread.message, ...thread.replies]) {
          if (m.deleted || !inRange(m.createdAt, ctx.start, ctx.end) || (!m.re && m.labels.pr)) continue
          const state = m.re ? undefined : m.task?.state
          facts.push({ externalId: `msg:${m.id}`, kind: m.re ? 'reply' : m.task ? 'task' : 'thread', status: (state && TASK_STATUS[state]) || 'info', title: firstLine(m.text), body: m.text, url, label: `#${m.channel}`, actor: actorOf(m), project: m.channel, occurredAt: m.createdAt })
        }
        const n = need(t.message, url)
        if (n) needs.set(n.externalId, n)
      }
      facts.push(...await pullRequests(team, channel, ctx))
    }
    const work: CollectedWork[] = []
    const scopes = list(process.env.FOLIO_BOARD_CHANNELS)
    for (const channel of scopes.length ? scopes : [undefined]) {
      for (const t of await tasks(team, channel, ctx.signal)) {
        work.push(workItem(t, url))
        const n = need(t.message, url)
        if (n) needs.set(n.externalId, n)
      }
    }
    return { facts, needs: [...needs.values()], work }
  },
  test: signal => probe(async () => {
    const me = await call(() => client().me(), signal)
    return `Authenticated as ${me.handle}`
  }),
}
