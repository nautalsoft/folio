import { timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

function bearer(event: H3Event) {
  const header = getHeader(event, 'authorization') || ''
  return header.startsWith('Bearer ') ? header.slice(7).trim() : ''
}

export function requireIngestToken(event: H3Event) {
  const token = env.ingestToken
  if (!token) return
  if (!safeEqual(bearer(event), token)) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'FOLIO_INGEST_TOKEN is set on this instance: send it as "Authorization: Bearer <token>".' })
  }
}

export function requireCronSecret(event: H3Event) {
  const secrets = [env.cronSecret, env.ingestToken].filter(Boolean)
  if (!secrets.length) return
  const given = bearer(event)
  if (!secrets.some(secret => safeEqual(given, secret))) throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
}
