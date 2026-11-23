import type { WorkStatus } from '../../shared/types/folio'
import { fetchJson, probe } from './http'
import type { CollectedFact, Collector } from './types'

const API = 'https://api.clickup.com/api/v2'
const MAX_PAGES = 20
const PAGE_SIZE = 100

interface Task {
  id: string
  name: string
  text_content?: string | null
  url: string
  status: { status: string, type: string }
  assignees?: { username: string | null }[]
  creator?: { username: string | null }
  list?: { name: string } | null
  date_updated: string
  date_closed?: string | null
  date_done?: string | null
}
interface TasksPage { tasks: Task[] }

const get = <T>(path: string, signal: AbortSignal, query?: Record<string, string | number | boolean>) =>
  fetchJson<T>('clickup', `${API}${path}`, { signal, query, headers: { authorization: process.env.CLICKUP_TOKEN ?? '' } })

function status(task: Task): WorkStatus {
  const type = task.status.type.toLowerCase()
  if (type === 'closed' || type === 'done') return 'done'
  if (task.status.status.toLowerCase().includes('block')) return 'blocked'
  return 'info'
}

function toFact(task: Task): CollectedFact {
  return {
    externalId: `task:${task.id}`,
    kind: 'task',
    status: status(task),
    title: task.name,
    body: task.text_content ?? '',
    url: task.url,
    label: task.status.status,
    actor: task.assignees?.[0]?.username ?? null,
    project: task.list?.name ?? null,
    occurredAt: new Date(Number(task.date_updated)).toISOString(),
  }
}

export const clickup: Collector = {
  kind: 'clickup',
  label: 'ClickUp',
  docsUrl: 'https://developer.clickup.com/reference/getfilteredteamtasks',
  envVars: [
    { name: 'CLICKUP_TOKEN', required: true, description: 'Personal API token (pk_…)' },
    { name: 'CLICKUP_TEAM_ID', required: true, description: 'Workspace ID (the number after app.clickup.com/ in the URL)' },
  ],
  configured: () => Boolean(process.env.CLICKUP_TOKEN && process.env.CLICKUP_TEAM_ID),
  async collect(ctx) {
    const facts: CollectedFact[] = []
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await get<TasksPage>(`/team/${process.env.CLICKUP_TEAM_ID}/task`, ctx.signal, {
        page,
        date_updated_gt: ctx.start.getTime() - 1,
        date_updated_lt: ctx.end.getTime(),
        include_closed: true,
        subtasks: true,
        order_by: 'updated',
      })
      facts.push(...data.tasks.map(toFact))
      if (data.tasks.length < PAGE_SIZE) break
    }
    return { facts }
  },
  test: signal => probe(async () => {
    const data = await get<{ user: { username: string } }>('/user', signal)
    return `Authenticated as ${data.user.username}`
  }),
}
