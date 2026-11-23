import { fetchJson, inRange, list, probe } from './http'
import type { CollectContext, CollectedFact, CollectedNeed, Collector } from './types'

const API = 'https://api.github.com'
const PER_PAGE = 100
const MAX_PAGES = 10

interface User { login: string }
interface Pull {
  number: number
  title: string
  body: string | null
  html_url: string
  state: 'open' | 'closed'
  draft?: boolean
  user: User | null
  updated_at: string
  closed_at: string | null
  merged_at: string | null
  requested_reviewers?: User[]
  requested_teams?: { slug: string }[]
}
interface Issue {
  number: number
  title: string
  body: string | null
  html_url: string
  state: 'open' | 'closed'
  user: User | null
  updated_at: string
  closed_at: string | null
  pull_request?: unknown
}
interface Commit {
  sha: string
  html_url: string
  author: User | null
  commit: { message: string, author: { name: string, date: string } | null, committer: { date: string } | null }
}

const get = <T>(path: string, signal: AbortSignal, query?: Record<string, string | number>) =>
  fetchJson<T>('github', `${API}${path}`, {
    signal,
    query,
    headers: {
      'accept': 'application/vnd.github+json',
      'authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
      'x-github-api-version': '2022-11-28',
    },
  })

async function pages<T>(path: string, ctx: CollectContext, query: Record<string, string | number>, stop?: (page: T[]) => boolean) {
  const items: T[] = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const batch = await get<T[]>(path, ctx.signal, { ...query, per_page: PER_PAGE, page })
    items.push(...batch)
    if (batch.length < PER_PAGE || stop?.(batch)) break
  }
  return items
}

function pullFact(repo: string, pr: Pull, ctx: CollectContext): CollectedFact {
  const merged = inRange(pr.merged_at, ctx.start, ctx.end)
  const closed = !merged && pr.state === 'closed' && inRange(pr.closed_at, ctx.start, ctx.end)
  const reviewing = pr.state === 'open' && !pr.draft && ((pr.requested_reviewers?.length ?? 0) + (pr.requested_teams?.length ?? 0)) > 0
  return {
    externalId: `pr:${repo}#${pr.number}`,
    kind: merged ? 'pr.merged' : closed ? 'pr.closed' : 'pr',
    status: merged ? 'done' : reviewing ? 'waiting' : 'info',
    title: pr.title,
    body: pr.body ?? '',
    url: pr.html_url,
    label: `${repo}#${pr.number}`,
    actor: pr.user?.login ?? null,
    project: repo.split('/')[1] ?? repo,
    occurredAt: merged ? pr.merged_at! : closed ? pr.closed_at! : pr.updated_at,
  }
}

async function collectRepo(repo: string, ctx: CollectContext) {
  const facts: CollectedFact[] = []
  const needs: CollectedNeed[] = []
  const project = repo.split('/')[1] ?? repo
  const updatedBeforeStart = (p: Pull[]) => Date.parse(p.at(-1)!.updated_at) < ctx.start.getTime()
  const pulls = await pages<Pull>(`/repos/${repo}/pulls`, ctx, { state: 'all', sort: 'updated', direction: 'desc' }, updatedBeforeStart)
  for (const pr of pulls.filter(p => inRange(p.updated_at, ctx.start, ctx.end))) {
    const fact = pullFact(repo, pr, ctx)
    facts.push(fact)
    if (fact.status === 'waiting') {
      const who = [...(pr.requested_reviewers ?? []).map(u => u.login), ...(pr.requested_teams ?? []).map(t => t.slug)]
      needs.push({ externalId: `review:${repo}#${pr.number}`, kind: 'review', title: `Review requested: ${pr.title}`, detail: `Requested from ${who.join(', ')}`, url: pr.html_url, actor: pr.user?.login ?? null })
    }
  }
  const issues = await pages<Issue>(`/repos/${repo}/issues`, ctx, { state: 'all', since: ctx.start.toISOString(), sort: 'updated', direction: 'desc' })
  for (const issue of issues.filter(i => !i.pull_request && inRange(i.updated_at, ctx.start, ctx.end))) {
    const closed = issue.state === 'closed' && inRange(issue.closed_at, ctx.start, ctx.end)
    facts.push({ externalId: `issue:${repo}#${issue.number}`, kind: closed ? 'issue.closed' : 'issue', status: closed ? 'done' : 'info', title: issue.title, body: issue.body ?? '', url: issue.html_url, label: `${repo}#${issue.number}`, actor: issue.user?.login ?? null, project, occurredAt: closed ? issue.closed_at! : issue.updated_at })
  }
  const commits = await pages<Commit>(`/repos/${repo}/commits`, ctx, { since: ctx.start.toISOString(), until: ctx.end.toISOString() })
  for (const c of commits) {
    const [title = c.sha, ...rest] = c.commit.message.split('\n')
    facts.push({ externalId: `commit:${repo}@${c.sha}`, kind: 'commit', status: 'done', title, body: rest.join('\n').trim(), url: c.html_url, label: `${repo}@${c.sha.slice(0, 7)}`, actor: c.author?.login ?? c.commit.author?.name ?? null, project, occurredAt: c.commit.committer?.date ?? c.commit.author?.date ?? ctx.start.toISOString() })
  }
  return { facts, needs }
}

export const github: Collector = {
  kind: 'github',
  label: 'GitHub',
  docsUrl: 'https://docs.github.com/en/rest',
  envVars: [
    { name: 'GITHUB_TOKEN', required: true, description: 'Fine-grained token with read access to Contents, Issues, Pull requests and Metadata' },
    { name: 'GITHUB_REPOS', required: true, description: 'Comma-separated owner/repo list' },
  ],
  configured: () => Boolean(process.env.GITHUB_TOKEN && list(process.env.GITHUB_REPOS).length),
  async collect(ctx) {
    const facts: CollectedFact[] = []
    const needs: CollectedNeed[] = []
    for (const repo of list(process.env.GITHUB_REPOS)) {
      const result = await collectRepo(repo, ctx)
      facts.push(...result.facts)
      needs.push(...result.needs)
    }
    return { facts, needs }
  },
  test: signal => probe(async () => {
    const [repo] = list(process.env.GITHUB_REPOS)
    if (!repo) throw new Error('GITHUB_REPOS is empty')
    const data = await get<{ full_name: string }>(`/repos/${repo}`, signal)
    return `Can read ${data.full_name}`
  }),
}
