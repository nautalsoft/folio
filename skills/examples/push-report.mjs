#!/usr/bin/env node
// Push a report to Folio with Node 22+ (built-in fetch, no dependencies).
//
// Usage:
//   FOLIO_URL=https://folio.example.com FOLIO_INGEST_TOKEN=YOUR_TOKEN \
//     node push-report.mjs "Title of the task" "What changed." [done|blocked|waiting|info] [url]
//
// Optional environment: FOLIO_AGENT_ID, FOLIO_AGENT_NAME, FOLIO_AGENT_KIND, FOLIO_REPORT_KEY, FOLIO_PROJECT.
// Exits non-zero if the request fails or Folio answers with an error.
import { hostname } from 'node:os'

const { FOLIO_URL, FOLIO_INGEST_TOKEN } = process.env
const [title, summary = '', status = 'done', url] = process.argv.slice(2)

if (!FOLIO_URL) {
  console.error('Set FOLIO_URL, for example https://folio.example.com')
  process.exit(2)
}
if (!title) {
  console.error('Usage: node push-report.mjs TITLE [SUMMARY] [STATUS] [URL]')
  process.exit(2)
}
if (!['done', 'blocked', 'waiting', 'info'].includes(status)) {
  console.error('status must be done, blocked, waiting or info')
  process.exit(2)
}

const agentId = process.env.FOLIO_AGENT_ID || hostname()
const report = {
  agent: { id: agentId, name: process.env.FOLIO_AGENT_NAME || agentId, kind: process.env.FOLIO_AGENT_KIND || 'other' },
  key: process.env.FOLIO_REPORT_KEY || undefined,
  project: process.env.FOLIO_PROJECT || undefined,
  title,
  summary,
  status,
  items: url ? [{ text: title, status, url }] : [],
}

try {
  const response = await fetch(`${FOLIO_URL.replace(/\/$/, '')}/api/ingest/report`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(FOLIO_INGEST_TOKEN ? { authorization: `Bearer ${FOLIO_INGEST_TOKEN}` } : {}),
      ...(process.env.FOLIO_PROTECTION_BYPASS ? { 'x-vercel-protection-bypass': process.env.FOLIO_PROTECTION_BYPASS } : {}),
    },
    body: JSON.stringify(report),
    signal: AbortSignal.timeout(30_000),
  })
  const text = await response.text()
  if (!response.ok) {
    console.error(`Folio answered HTTP ${response.status}: ${text}`)
    process.exit(1)
  }
  console.log(text)
}
catch (error) {
  console.error(`Could not reach Folio: ${error instanceof Error ? error.message : error}`)
  process.exit(1)
}
