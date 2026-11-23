import { collectors } from '../collectors'

export default defineEventHandler(async () => {
  const settings = await getSettings()
  const db = await useDb()
  const deliveries = await db.select().from(schema.webhookDeliveries).orderBy(schema.webhookDeliveries.id)
  return {
    settings: { ...settings, webhooks: settings.webhooks.map(w => ({ ...w, url: maskUrl(w.url) })) },
    sources: Object.values(collectors).map(c => ({ kind: c.kind, label: c.label, docsUrl: c.docsUrl, configured: c.configured(), enabled: settings.sources[c.kind], envVars: c.envVars })),
    ingest: { protected: Boolean(env.ingestToken), cronProtected: Boolean(env.cronSecret || env.ingestToken) },
    ai: { available: aiAvailable(), provider: env.aiBaseUrl ? 'openai-compatible' : env.aiGatewayKey || env.onVercel ? 'ai-gateway' : null },
    deliveries: deliveries.slice(-10).reverse(),
  }
})
