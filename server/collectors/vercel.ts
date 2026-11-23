import type { WorkStatus } from '../../shared/types/folio'
import { fetchJson, list, probe } from './http'
import type { CollectContext, CollectedFact, Collector } from './types'

const API = 'https://api.vercel.com'
const MAX_PAGES = 20

interface Deployment {
  uid: string
  name: string
  url: string | null
  created: number
  state?: string
  readyState?: string
  target?: string | null
  inspectorUrl?: string | null
  creator?: { uid: string, username?: string, githubLogin?: string }
  meta?: Record<string, string>
}
interface DeploymentsPage {
  deployments: Deployment[]
  pagination?: { next: number | null }
}

const get = <T>(path: string, signal: AbortSignal, query: Record<string, string | number | undefined> = {}) =>
  fetchJson<T>('vercel', `${API}${path}`, {
    signal,
    query: { ...query, teamId: process.env.VERCEL_TEAM_ID || undefined },
    headers: { authorization: `Bearer ${process.env.VERCEL_TOKEN}` },
  })

function status(state: string): WorkStatus {
  if (state === 'READY') return 'done'
  if (state === 'ERROR') return 'blocked'
  return 'info'
}

async function deployments(ctx: CollectContext, projectId?: string) {
  const items: Deployment[] = []
  let until: number | undefined = ctx.end.getTime()
  for (let page = 0; page < MAX_PAGES && until; page++) {
    const data: DeploymentsPage = await get<DeploymentsPage>('/v7/deployments', ctx.signal, { since: ctx.start.getTime(), until, limit: 100, projectId })
    items.push(...data.deployments)
    const next = data.pagination?.next ?? null
    until = next && next > ctx.start.getTime() && next < until ? next : undefined
  }
  return items
}

function toFact(d: Deployment): CollectedFact {
  const state = d.state ?? d.readyState ?? 'UNKNOWN'
  const target = d.target ?? 'preview'
  return {
    externalId: `deployment:${d.uid}`,
    kind: 'deployment',
    status: status(state),
    title: `${d.name} ${target} deployment ${state.toLowerCase()}`,
    body: d.meta?.githubCommitMessage ?? '',
    url: d.inspectorUrl || (d.url ? `https://${d.url}` : 'https://vercel.com/dashboard'),
    label: d.url ?? d.uid,
    actor: d.creator?.username ?? d.creator?.githubLogin ?? d.creator?.uid ?? null,
    project: d.name,
    occurredAt: new Date(d.created).toISOString(),
  }
}

export const vercel: Collector = {
  kind: 'vercel',
  label: 'Vercel',
  docsUrl: 'https://vercel.com/docs/rest-api/reference/endpoints/deployments/list-deployments',
  envVars: [
    { name: 'VERCEL_TOKEN', required: true, description: 'Vercel access token scoped to the team that owns the projects' },
    { name: 'VERCEL_TEAM_ID', required: false, description: 'Team ID (team_…); omit for a personal account' },
    { name: 'FOLIO_VERCEL_PROJECTS', required: false, description: 'Comma-separated project IDs or names; all projects when empty' },
  ],
  configured: () => Boolean(process.env.VERCEL_TOKEN),
  async collect(ctx) {
    const projects = list(process.env.FOLIO_VERCEL_PROJECTS)
    const all: Deployment[] = []
    for (const project of projects.length ? projects : [undefined]) all.push(...await deployments(ctx, project))
    const seen = new Set<string>()
    const facts = all
      .filter(d => d.created >= ctx.start.getTime() && d.created < ctx.end.getTime())
      .filter(d => !seen.has(d.uid) && seen.add(d.uid))
      .map(toFact)
    return { facts }
  },
  test: signal => probe(async () => {
    const data = await get<DeploymentsPage>('/v7/deployments', signal, { limit: 1 })
    return `Token can list deployments (${data.deployments.length ? 'latest: ' + data.deployments[0]!.name : 'none yet'})`
  }),
}
