import { fetchJson, inRange, probe } from './http'
import type { CollectedFact, Collector } from './types'

const API = 'https://api.notion.com/v1'
const NOTION_VERSION = '2022-06-28'
const MAX_PAGES = 20

interface Page {
  object: 'page'
  id: string
  url: string
  created_time: string
  last_edited_time: string
  last_edited_by?: { id: string }
  properties: Record<string, { type: string, title?: { plain_text: string }[] }>
}
interface SearchResult { results: Page[], has_more: boolean, next_cursor: string | null }

const request = <T>(path: string, signal: AbortSignal, body?: unknown) =>
  fetchJson<T>('notion', `${API}${path}`, {
    signal,
    body,
    headers: { 'authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'notion-version': NOTION_VERSION },
  })

function title(page: Page) {
  const prop = Object.values(page.properties).find(p => p.type === 'title')
  return prop?.title?.map(t => t.plain_text).join('').trim() || 'Untitled'
}

export const notion: Collector = {
  kind: 'notion',
  label: 'Notion',
  docsUrl: 'https://developers.notion.com/reference/post-search',
  envVars: [
    { name: 'NOTION_TOKEN', required: true, description: 'Internal integration secret; share the pages/databases to collect with the integration' },
  ],
  configured: () => Boolean(process.env.NOTION_TOKEN),
  async collect(ctx) {
    const facts: CollectedFact[] = []
    let cursor: string | undefined
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await request<SearchResult>('/search', ctx.signal, {
        filter: { property: 'object', value: 'page' },
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
        page_size: 100,
        start_cursor: cursor,
      })
      for (const p of data.results.filter(r => inRange(r.last_edited_time, ctx.start, ctx.end))) {
        const created = inRange(p.created_time, ctx.start, ctx.end)
        facts.push({ externalId: `page:${p.id}`, kind: created ? 'page.created' : 'page.edited', status: 'info', title: title(p), url: p.url, label: 'Notion', actor: p.last_edited_by?.id ?? null, occurredAt: p.last_edited_time })
      }
      const oldest = data.results.at(-1)?.last_edited_time
      if (!data.has_more || !data.next_cursor || (oldest && Date.parse(oldest) < ctx.start.getTime())) break
      cursor = data.next_cursor
    }
    return { facts }
  },
  test: signal => probe(async () => {
    const me = await request<{ name?: string | null, bot?: { workspace_name?: string | null } }>('/users/me', signal)
    return `Authenticated as ${me.name ?? 'integration'}${me.bot?.workspace_name ? ` in ${me.bot.workspace_name}` : ''}`
  }),
}
