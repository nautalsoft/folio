import { createHmac } from 'node:crypto'

type WebhookEvent = 'book.published' | 'needs_you.created' | 'digest.failed'

export async function emitWebhook(event: WebhookEvent, data: Record<string, unknown>) {
  const settings = await getSettings()
  const targets = settings.webhooks.filter(w => w.events.includes(event))
  if (!targets.length) return
  const db = await useDb()
  const body = JSON.stringify({ event, at: new Date().toISOString(), instance: env.publicUrl || null, data })
  await Promise.all(targets.map(async (target) => {
    const headers: Record<string, string> = { 'content-type': 'application/json', 'user-agent': 'Folio-Webhook/1.0', 'x-folio-event': event }
    if (env.webhookSecret) headers['x-folio-signature'] = `sha256=${createHmac('sha256', env.webhookSecret).update(body).digest('hex')}`
    let status = 'error'
    let code: number | null = null
    try {
      const response = await fetch(target.url, { method: 'POST', headers, body, signal: AbortSignal.timeout(10_000) })
      code = response.status
      status = response.ok ? 'ok' : 'error'
    }
    catch {
      status = 'error'
    }
    await db.insert(schema.webhookDeliveries).values({ event, target: maskUrl(target.url), status, code })
  }))
}
