import { z } from 'zod'

function isPrivateHost(host: string) {
  const h = host.replace(/^\[|\]$/g, '').toLowerCase()
  return h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || h === '::1' || h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')
    || /^(127|10|0)\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(h)
}

const body = z.object({
  digestTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  timezone: z.string().max(60).refine((tz) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: tz })
      return true
    }
    catch {
      return false
    }
  }, 'Unknown time zone').optional(),
  model: z.string().trim().min(1).max(120).optional(),
  reportLanguage: z.enum(['fr', 'en']).optional(),
  sources: z.record(z.string(), z.boolean()).optional(),
  addWebhook: z.object({ url: z.url({ protocol: /^https?$/ }).max(2000).refine(url => process.env.FOLIO_ALLOW_PRIVATE_WEBHOOKS === 'true' || !isPrivateHost(new URL(url).hostname), 'Private or local addresses are refused (set FOLIO_ALLOW_PRIVATE_WEBHOOKS=true to allow them)'), events: z.array(z.enum(['book.published', 'needs_you.created', 'digest.failed'])).min(1) }).optional(),
  removeWebhook: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, body.parse)
  const current = await getSettings()
  const next = {
    ...current,
    ...(input.digestTime ? { digestTime: input.digestTime } : {}),
    ...(input.timezone ? { timezone: input.timezone } : {}),
    ...(input.model ? { model: input.model } : {}),
    ...(input.reportLanguage ? { reportLanguage: input.reportLanguage } : {}),
    sources: { ...current.sources, ...(input.sources ?? {}) } as typeof current.sources,
    webhooks: [
      ...current.webhooks.filter(w => w.id !== input.removeWebhook),
      ...(input.addWebhook ? [{ id: newId('wh'), ...input.addWebhook }] : []),
    ],
  }
  await saveSettings(next)
  return { ok: true }
})
