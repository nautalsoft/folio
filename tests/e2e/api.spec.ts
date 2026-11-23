import { expect, test } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

test('agents push reports and facts from any source', async ({ request }) => {
  const report = await request.post('/api/ingest/report', { data: { agent: { id: 'e2e-agent', name: 'E2E', kind: 'other' }, key: 'e2e-1', title: 'E2E report', items: [{ text: 'Did a thing', status: 'done', url: 'https://example.com/1' }] } })
  expect(report.status()).toBe(201)
  const facts = await request.post('/api/ingest/facts', { data: { source: 'Linear', facts: [{ id: 'LIN-1', title: 'Closed LIN-1', url: 'https://example.com/lin-1', status: 'done' }] } })
  expect((await facts.json()).source).toBe('linear')
})

test('a second claim on the same task is refused while the first agent is alive', async ({ request }) => {
  const first = await request.post('/api/ingest/work', { data: { agent: 'e2e-a', action: 'claim', task: { key: 'e2e-task', title: 'E2E task' } } })
  expect(first.status()).toBe(200)
  const second = await request.post('/api/ingest/work', { data: { agent: 'e2e-b', action: 'claim', task: { key: 'e2e-task' } } })
  expect(second.status()).toBe(409)
  expect((await second.json()).claimedBy).toBe('e2e-a')
})

test('the daily run is idempotent and reports unconfigured sources', async ({ request }) => {
  const first = await request.post('/api/automation/run', { data: { useModel: false } })
  const second = await request.post('/api/automation/run', { data: { useModel: false } })
  const a = await first.json()
  const b = await second.json()
  expect(a.book.slug).toBe(b.book.slug)
  expect(b.book.version).toBeGreaterThan(a.book.version)
  const library = await (await request.get('/api/library')).json()
  expect(library.books.filter((book: { slug: string }) => book.slug === a.book.slug)).toHaveLength(1)
  expect(b.sources.find((s: { source: string }) => s.source === 'github').status).toMatch(/not_configured|ok|error/)
})
