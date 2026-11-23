import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CollectContext } from '../server/collectors/types'

const boardMock = vi.hoisted(() => {
  class BoardError extends Error {
    constructor(public code: string, message: string, public status: number) {
      super(message)
    }
  }
  return { BoardError, handle: null as unknown }
})
vi.mock('@vercel/board', () => ({ board: () => boardMock.handle, BoardError: boardMock.BoardError }))

const { board } = await import('../server/collectors/board')
const { github } = await import('../server/collectors/github')
const { vercel } = await import('../server/collectors/vercel')
const { slack } = await import('../server/collectors/slack')
const { clickup } = await import('../server/collectors/clickup')
const { notion } = await import('../server/collectors/notion')

const ENV_KEYS = ['BOARD_TOKEN', 'BOARD_URL', 'BOARD_NAME', 'FOLIO_BOARD_TEAM', 'FOLIO_BOARD_CHANNELS', 'GITHUB_TOKEN', 'GITHUB_REPOS', 'VERCEL_TOKEN', 'VERCEL_TEAM_ID', 'FOLIO_VERCEL_PROJECTS', 'SLACK_BOT_TOKEN', 'SLACK_CHANNEL_IDS', 'FOLIO_SLACK_NEEDS_KEYWORD', 'CLICKUP_TOKEN', 'CLICKUP_TEAM_ID', 'NOTION_TOKEN']

const ctx = (): CollectContext => ({
  day: '2026-11-23',
  start: new Date('2026-11-23T00:00:00Z'),
  end: new Date('2026-11-24T00:00:00Z'),
  timezone: 'UTC',
  signal: new AbortController().signal,
})

type Route = [RegExp, (url: URL, init: RequestInit) => Response]
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
let calls: { url: URL, init: RequestInit }[] = []

function route(...routes: Route[]) {
  calls = []
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit) => {
    const url = new URL(input)
    calls.push({ url, init })
    const match = routes.find(([pattern]) => pattern.test(url.href))
    if (!match) throw new Error(`unexpected fetch ${url.href}`)
    return match[1](url, init)
  }))
}

beforeEach(() => {
  for (const key of ENV_KEYS) vi.stubEnv(key, '')
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe('github', () => {
  it('is not configured without token and repos', () => {
    expect(github.configured()).toBe(false)
    vi.stubEnv('GITHUB_TOKEN', 'x')
    expect(github.configured()).toBe(false)
  })

  it('maps merged PRs, review requests, issues and commits', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'secret')
    vi.stubEnv('GITHUB_REPOS', 'acme/www')
    route(
      [/\/pulls\?/, () => json([
        { number: 1, title: 'Fix login', body: 'b', html_url: 'https://github.com/acme/www/pull/1', state: 'closed', user: { login: 'claude' }, updated_at: '2026-11-23T10:00:00Z', closed_at: '2026-11-23T10:00:00Z', merged_at: '2026-11-23T10:00:00Z' },
        { number: 2, title: 'Add cache', body: null, html_url: 'https://github.com/acme/www/pull/2', state: 'open', draft: false, user: { login: 'codex' }, updated_at: '2026-11-23T09:00:00Z', closed_at: null, merged_at: null, requested_reviewers: [{ login: 'ada' }], requested_teams: [] },
        { number: 3, title: 'Old', body: null, html_url: 'https://github.com/acme/www/pull/3', state: 'open', user: { login: 'x' }, updated_at: '2026-11-20T09:00:00Z', closed_at: null, merged_at: null },
      ])],
      [/\/issues\?/, () => json([
        { number: 4, title: 'Bug', body: null, html_url: 'https://github.com/acme/www/issues/4', state: 'closed', user: { login: 'ada' }, updated_at: '2026-11-23T11:00:00Z', closed_at: '2026-11-23T11:00:00Z' },
        { number: 1, title: 'Fix login', html_url: 'https://github.com/acme/www/pull/1', state: 'closed', user: { login: 'claude' }, updated_at: '2026-11-23T10:00:00Z', closed_at: null, pull_request: {} },
      ])],
      [/\/commits\?/, () => json([{ sha: 'abcdef1234567', html_url: 'https://github.com/acme/www/commit/abcdef1', author: { login: 'claude' }, commit: { message: 'feat: cache\n\nbody', author: { name: 'Claude', date: '2026-11-23T08:00:00Z' }, committer: { date: '2026-11-23T08:00:00Z' } } }])],
    )
    const result = await github.collect(ctx())
    expect(result.facts.map(f => [f.externalId, f.status])).toEqual([
      ['pr:acme/www#1', 'done'],
      ['pr:acme/www#2', 'waiting'],
      ['issue:acme/www#4', 'done'],
      ['commit:acme/www@abcdef1234567', 'done'],
    ])
    expect(result.facts[0]).toMatchObject({ actor: 'claude', project: 'www', url: 'https://github.com/acme/www/pull/1' })
    expect(result.needs).toEqual([expect.objectContaining({ kind: 'review', externalId: 'review:acme/www#2', actor: 'codex' })])
    expect(calls[0]!.url.searchParams.get('state')).toBe('all')
    expect((calls[0]!.init.headers as Record<string, string>)['x-github-api-version']).toBe('2022-11-28')
  })

  it('throws the API status and message', async () => {
    vi.stubEnv('GITHUB_TOKEN', 'secret')
    vi.stubEnv('GITHUB_REPOS', 'acme/www')
    route([/./, () => json({ message: 'Bad credentials' }, 401)])
    await expect(github.collect(ctx())).rejects.toMatchObject({ source: 'github', status: 401, message: 'HTTP 401 — Bad credentials' })
    const test = await github.test(new AbortController().signal)
    expect(test).toEqual({ ok: false, message: 'HTTP 401 — Bad credentials' })
    expect(test.message).not.toContain('secret')
  })
})

describe('vercel', () => {
  it('is not configured without a token', () => expect(vercel.configured()).toBe(false))

  it('maps deployment states to statuses', async () => {
    vi.stubEnv('VERCEL_TOKEN', 'secret')
    vi.stubEnv('VERCEL_TEAM_ID', 'team_1')
    route([/\/v7\/deployments/, () => json({
      deployments: [
        { uid: 'dpl_1', name: 'www', url: 'www-1.vercel.app', created: Date.parse('2026-11-23T12:00:00Z'), state: 'READY', target: 'production', inspectorUrl: 'https://vercel.com/acme/www/dpl1', creator: { uid: 'u1', username: 'ada' } },
        { uid: 'dpl_2', name: 'www', url: 'www-2.vercel.app', created: Date.parse('2026-11-23T13:00:00Z'), state: 'ERROR', target: null, inspectorUrl: null, creator: { uid: 'u2' } },
        { uid: 'dpl_3', name: 'api', url: 'api-3.vercel.app', created: Date.parse('2026-11-23T14:00:00Z'), state: 'BUILDING', creator: { uid: 'u3' } },
      ],
      pagination: { count: 3, next: null, prev: null },
    })])
    const { facts } = await vercel.collect(ctx())
    expect(facts.map(f => f.status)).toEqual(['done', 'blocked', 'info'])
    expect(facts[0]).toMatchObject({ url: 'https://vercel.com/acme/www/dpl1', actor: 'ada', project: 'www' })
    expect(facts[1]!.url).toBe('https://www-2.vercel.app')
    expect(calls[0]!.url.searchParams.get('teamId')).toBe('team_1')
    expect(calls[0]!.url.searchParams.get('since')).toBe(String(Date.parse('2026-11-23T00:00:00Z')))
  })

  it('retries once on 429 then throws the API error', async () => {
    vi.stubEnv('VERCEL_TOKEN', 'secret')
    route([/./, () => json({ error: { code: 'forbidden', message: 'Not authorized' } }, calls.length === 1 ? 429 : 403, { 'retry-after': '0' })])
    await expect(vercel.collect(ctx())).rejects.toMatchObject({ source: 'vercel', status: 403, message: 'HTTP 403 — forbidden: Not authorized' })
    expect(calls).toHaveLength(2)
  })
})

describe('slack', () => {
  it('is not configured without token and channels', () => expect(slack.configured()).toBe(false))

  it('maps messages, skips joins and flags the needs keyword', async () => {
    vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-secret')
    vi.stubEnv('SLACK_CHANNEL_IDS', 'C1')
    route(
      [/auth\.test/, () => json({ ok: true, url: 'https://acme.slack.com/', team: 'Acme', user: 'folio' })],
      [/conversations\.history/, () => json({
        ok: true,
        has_more: false,
        messages: [
          { ts: '1795435200.000100', user: 'U1', text: 'Deployed v2\nall good' },
          { ts: '1795435300.000200', user: 'U2', subtype: 'channel_join', text: 'joined' },
          { ts: '1795435400.000300', bot_id: 'B1', username: 'claude', text: ':raised_hand: approve the migration?' },
        ],
      })],
    )
    const result = await slack.collect(ctx())
    expect(result.facts).toHaveLength(2)
    expect(result.facts[0]).toMatchObject({ title: 'Deployed v2', actor: 'U1', url: 'https://acme.slack.com/archives/C1/p1795435200000100' })
    expect(result.needs).toEqual([expect.objectContaining({ kind: 'decision', actor: 'claude' })])
    const history = calls.find(c => c.url.pathname.endsWith('conversations.history'))!
    expect(history.url.searchParams.get('oldest')).toBe('1795392000.000000')
  })

  it('throws Slack ok:false errors', async () => {
    vi.stubEnv('SLACK_BOT_TOKEN', 'xoxb-secret')
    vi.stubEnv('SLACK_CHANNEL_IDS', 'C1')
    route([/auth\.test/, () => json({ ok: false, error: 'invalid_auth' })])
    await expect(slack.collect(ctx())).rejects.toMatchObject({ source: 'slack', message: 'auth.test: invalid_auth' })
  })
})

describe('clickup', () => {
  it('is not configured without token and team', () => expect(clickup.configured()).toBe(false))

  it('maps task statuses and sends the raw token', async () => {
    vi.stubEnv('CLICKUP_TOKEN', 'pk_secret')
    vi.stubEnv('CLICKUP_TEAM_ID', '42')
    const task = (id: string, status: string, type: string) => ({ id, name: `Task ${id}`, url: `https://app.clickup.com/t/${id}`, status: { status, type }, assignees: [{ username: 'claude' }], list: { name: 'Sprint' }, date_updated: String(Date.parse('2026-11-23T10:00:00Z')) })
    route([/\/team\/42\/task/, () => json({ tasks: [task('a', 'complete', 'closed'), task('b', 'Blocked', 'custom'), task('c', 'in progress', 'custom')] })])
    const { facts } = await clickup.collect(ctx())
    expect(facts.map(f => f.status)).toEqual(['done', 'blocked', 'info'])
    expect(facts[0]).toMatchObject({ actor: 'claude', project: 'Sprint', url: 'https://app.clickup.com/t/a' })
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('pk_secret')
    expect(calls[0]!.url.searchParams.get('include_closed')).toBe('true')
  })

  it('throws ClickUp errors', async () => {
    vi.stubEnv('CLICKUP_TOKEN', 'pk_secret')
    vi.stubEnv('CLICKUP_TEAM_ID', '42')
    route([/./, () => json({ err: 'Token invalid', ECODE: 'OAUTH_025' }, 401)])
    await expect(clickup.collect(ctx())).rejects.toMatchObject({ source: 'clickup', status: 401, message: 'HTTP 401 — OAUTH_025: Token invalid' })
  })
})

describe('notion', () => {
  it('is not configured without a token', () => expect(notion.configured()).toBe(false))

  it('keeps pages edited during the day', async () => {
    vi.stubEnv('NOTION_TOKEN', 'secret')
    const page = (id: string, edited: string, created = '2026-01-01T00:00:00Z') => ({ object: 'page', id, url: `https://www.notion.so/${id}`, created_time: created, last_edited_time: edited, last_edited_by: { id: 'user-1' }, properties: { Name: { type: 'title', title: [{ plain_text: `Page ${id}` }] } } })
    route([/\/v1\/search/, () => json({ results: [page('a', '2026-11-24T01:00:00Z'), page('b', '2026-11-23T10:00:00Z', '2026-11-23T09:00:00Z'), page('c', '2026-11-22T10:00:00Z')], has_more: true, next_cursor: 'next' })])
    const { facts } = await notion.collect(ctx())
    expect(facts).toEqual([expect.objectContaining({ externalId: 'page:b', kind: 'page.created', title: 'Page b', actor: 'user-1', url: 'https://www.notion.so/b' })])
    expect(calls).toHaveLength(1)
    expect((calls[0]!.init.headers as Record<string, string>)['notion-version']).toBe('2022-06-28')
    expect(JSON.parse(calls[0]!.init.body as string)).toMatchObject({ filter: { property: 'object', value: 'page' } })
  })

  it('throws Notion errors', async () => {
    vi.stubEnv('NOTION_TOKEN', 'secret')
    route([/./, () => json({ object: 'error', status: 401, code: 'unauthorized', message: 'API token is invalid.' }, 401)])
    await expect(notion.collect(ctx())).rejects.toMatchObject({ source: 'notion', status: 401, message: 'HTTP 401 — unauthorized: API token is invalid.' })
  })
})

describe('board', () => {
  const message = (id: string, extra: Record<string, unknown> = {}) => ({ id, channel: 'work', text: `text ${id}`, re: null, labels: {}, by: { actor: 'vercel:user:u1+claude', principal: 'vercel:user:u1', profile: 'claude' }, author: { handle: 'julian/claude' }, createdAt: '2026-11-23T10:00:00Z', deleted: false, ...extra })

  it('is not configured without a board setting', () => expect(board.configured()).toBe(false))

  it('maps messages, labelled needs, and tasks', async () => {
    vi.stubEnv('BOARD_TOKEN', 'secret')
    vi.stubEnv('BOARD_URL', 'https://board.example/api/board')
    vi.stubEnv('FOLIO_BOARD_CHANNELS', 'work')
    const blocked = message('t1', { task: { state: 'blocked', by: 'vercel:user:u1+claude', claim: null, blocked: { kind: 'awaiting_approval', reason: 'approve prod?' } } })
    const claimed = message('t2', { createdAt: '2026-11-20T10:00:00Z', task: { state: 'claimed', by: 'vercel:user:u1', claim: { actor: 'vercel:user:u1+codex', until: '2026-11-23T10:05:00Z' } } })
    boardMock.handle = {
      threads: vi.fn(async () => ({ threads: [
        { message: message('m0', { createdAt: '2026-11-22T10:00:00Z' }), replies: 0, last: null },
        { message: message('m1', { labels: { needs: 'review' } }), replies: 1, last: message('m2', { re: 'm1' }) },
      ], cursor: 'c', older: null })),
      thread: vi.fn(async () => ({ message: message('m1', { labels: { needs: 'review' } }), replies: [message('m2', { re: 'm1', createdAt: '2026-11-23T11:00:00Z' })], cursor: 'c' })),
      tasks: { list: vi.fn(async ({ state }: { state: string }) => ({ tasks: state === 'open' ? [{ message: blocked, replies: 0, last: null }, { message: claimed, replies: 1, last: message('r', { re: 't2', text: 'running tests', createdAt: '2026-11-23T12:00:00Z' }) }] : [], cursor: 'x' })) },
    }
    const result = await board.collect(ctx())
    expect(result.facts.map(f => [f.externalId, f.kind, f.actor])).toEqual([['msg:m1', 'thread', 'claude'], ['msg:m2', 'reply', 'claude']])
    expect(result.facts[0]!.url).toBe('')
    expect(result.needs).toEqual([
      expect.objectContaining({ externalId: 'label:m1', kind: 'review' }),
      expect.objectContaining({ externalId: 'task:t1', kind: 'blocker', detail: 'awaiting_approval: approve prod?' }),
    ])
    expect(result.work).toEqual([
      expect.objectContaining({ externalId: 'task:t1', status: 'open', claimedBy: null }),
      expect.objectContaining({ externalId: 'task:t2', status: 'claimed', claimedBy: 'codex', heartbeatAt: '2026-11-23T12:00:00Z', checkpoint: { note: 'running tests', at: '2026-11-23T12:00:00Z' } }),
    ])
  })

  it('surfaces SDK errors with code and status', async () => {
    vi.stubEnv('BOARD_TOKEN', 'secret')
    vi.stubEnv('BOARD_URL', 'https://board.example/api/board')
    vi.stubEnv('FOLIO_BOARD_CHANNELS', 'work')
    boardMock.handle = { threads: vi.fn(async () => { throw new boardMock.BoardError('forbidden', 'You can\'t read work.', 403) }) }
    await expect(board.collect(ctx())).rejects.toMatchObject({ source: 'board', status: 403, message: 'forbidden: You can\'t read work.' })
  })
})
