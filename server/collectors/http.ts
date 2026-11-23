import type { CollectorKind } from '../../shared/types/folio'
import { CollectorError } from './types'

export interface JsonRequest {
  signal: AbortSignal
  method?: 'GET' | 'POST'
  headers?: Record<string, string>
  query?: Record<string, string | number | boolean | undefined>
  body?: unknown
}

const MAX_RETRY_WAIT_MS = 30_000

export function withQuery(url: string, query: JsonRequest['query'] = {}) {
  const target = new URL(url)
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) target.searchParams.set(key, String(value))
  }
  return target.toString()
}

// Retry-After (seconds or HTTP date); ClickUp and GitHub send X-RateLimit-Reset (epoch seconds) instead.
function retryDelay(headers: Headers) {
  const retryAfter = headers.get('retry-after')
  const reset = Number(headers.get('x-ratelimit-reset'))
  let ms = 1000
  if (retryAfter) ms = Number.isFinite(Number(retryAfter)) ? Number(retryAfter) * 1000 : Date.parse(retryAfter) - Date.now()
  else if (reset) ms = reset * 1000 - Date.now()
  return Math.min(Math.max(ms || 0, 0), MAX_RETRY_WAIT_MS)
}

function sleep(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      reject(signal.reason)
    }, { once: true })
  })
}

// Pulls the API's own error text out of the common shapes (GitHub, Vercel, Notion, ClickUp, Slack).
export function apiErrorText(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const error = b.error
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>
    if (typeof e.message === 'string') return e.code ? `${e.code}: ${e.message}` : e.message
  }
  if (typeof b.message === 'string') return b.code && typeof b.code === 'string' ? `${b.code}: ${b.message}` : b.message
  if (typeof b.err === 'string') return b.ECODE ? `${b.ECODE}: ${b.err}` : b.err
  if (typeof error === 'string') return error
  return null
}

async function readBody(response: Response) {
  const text = await response.text()
  try {
    return JSON.parse(text) as unknown
  }
  catch {
    return text
  }
}

export async function fetchJson<T>(source: CollectorKind, url: string, init: JsonRequest): Promise<T> {
  const headers: Record<string, string> = { accept: 'application/json', ...init.headers }
  if (init.body !== undefined) headers['content-type'] = 'application/json'
  const request = () => fetch(withQuery(url, init.query), {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    headers,
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    signal: init.signal,
  })
  let response = await request()
  if (response.status === 429) {
    await sleep(retryDelay(response.headers), init.signal)
    response = await request()
  }
  const body = await readBody(response)
  if (!response.ok) {
    const detail = apiErrorText(body) ?? (typeof body === 'string' ? body.trim().slice(0, 200) : '')
    throw new CollectorError(source, `HTTP ${response.status}${detail ? ` — ${detail}` : ` ${response.statusText}`}`.trim(), response.status)
  }
  return body as T
}

export function list(value: string | undefined) {
  return (value ?? '').split(',').map(s => s.trim()).filter(Boolean)
}

export function inRange(iso: string | null | undefined, start: Date, end: Date) {
  if (!iso) return false
  const t = Date.parse(iso)
  return t >= start.getTime() && t < end.getTime()
}

export async function probe(run: () => Promise<string>): Promise<{ ok: boolean, message: string }> {
  try {
    return { ok: true, message: await run() }
  }
  catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error) }
  }
}
