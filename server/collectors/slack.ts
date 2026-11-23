import { CollectorError } from './types'
import { fetchJson, list, probe } from './http'
import type { CollectedFact, CollectedNeed, Collector } from './types'

const API = 'https://slack.com/api'
const MAX_PAGES = 20
const SKIPPED_SUBTYPES = new Set(['channel_join', 'channel_leave', 'group_join', 'group_leave'])

interface SlackResponse { ok: boolean, error?: string }
interface Message {
  ts: string
  text?: string
  user?: string
  bot_id?: string
  username?: string
  subtype?: string
  thread_ts?: string
  reply_count?: number
}
interface History extends SlackResponse {
  messages: Message[]
  has_more?: boolean
  response_metadata?: { next_cursor?: string }
}

// Slack answers HTTP 200 with `ok: false` for API errors, so check both.
async function call<T extends SlackResponse>(method: string, signal: AbortSignal, query: Record<string, string | number | undefined> = {}) {
  const data = await fetchJson<T>('slack', `${API}/${method}`, { signal, query, headers: { authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}` } })
  if (!data.ok) throw new CollectorError('slack', `${method}: ${data.error ?? 'unknown_error'}`)
  return data
}

const seconds = (date: Date) => (date.getTime() / 1000).toFixed(6)
const neededKeyword = () => (process.env.FOLIO_SLACK_NEEDS_KEYWORD || ':raised_hand:').toLowerCase()

export const slack: Collector = {
  kind: 'slack',
  label: 'Slack',
  docsUrl: 'https://docs.slack.dev/reference/methods/conversations.history',
  envVars: [
    { name: 'SLACK_BOT_TOKEN', required: true, description: 'Bot token (xoxb-…) with channels:history (and groups:history for private channels)' },
    { name: 'SLACK_CHANNEL_IDS', required: true, description: 'Comma-separated channel IDs (C…); the bot must be a member' },
    { name: 'FOLIO_SLACK_NEEDS_KEYWORD', required: false, description: 'Text marker that turns a message into a "needs you" item (default :raised_hand:)' },
  ],
  configured: () => Boolean(process.env.SLACK_BOT_TOKEN && list(process.env.SLACK_CHANNEL_IDS).length),
  async collect(ctx) {
    const facts: CollectedFact[] = []
    const needs: CollectedNeed[] = []
    const { url: workspace } = await call<SlackResponse & { url: string }>('auth.test', ctx.signal)
    const keyword = neededKeyword()
    for (const channel of list(process.env.SLACK_CHANNEL_IDS)) {
      let cursor: string | undefined
      for (let page = 0; page < MAX_PAGES; page++) {
        const data = await call<History>('conversations.history', ctx.signal, { channel, oldest: seconds(ctx.start), latest: seconds(ctx.end), limit: 200, cursor })
        for (const m of data.messages) {
          if (m.subtype && SKIPPED_SUBTYPES.has(m.subtype)) continue
          const text = (m.text ?? '').trim()
          const url = `${workspace.replace(/\/?$/, '/')}archives/${channel}/p${m.ts.replace('.', '')}`
          const actor = m.user ?? m.username ?? m.bot_id ?? null
          const title = text.split('\n')[0]!.slice(0, 200) || '(no text)'
          facts.push({ externalId: `${channel}:${m.ts}`, kind: m.reply_count ? 'thread' : 'message', status: 'info', title, body: text, url, label: `#${channel}`, actor, occurredAt: new Date(Number(m.ts) * 1000).toISOString() })
          if (keyword && text.toLowerCase().includes(keyword)) {
            needs.push({ externalId: `${channel}:${m.ts}`, kind: 'decision', title, detail: text, url, actor })
          }
        }
        cursor = data.response_metadata?.next_cursor || undefined
        if (!data.has_more || !cursor) break
      }
    }
    return { facts, needs }
  },
  test: signal => probe(async () => {
    const data = await call<SlackResponse & { team: string, user: string }>('auth.test', signal)
    return `Authenticated as ${data.user} in ${data.team}`
  }),
}
