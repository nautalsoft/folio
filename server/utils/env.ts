export const env = {
  get databaseUrl() { return process.env.DATABASE_URL || process.env.POSTGRES_URL || '' },
  get dataDir() { return process.env.FOLIO_DATA_DIR || '' },
  get ingestToken() { return process.env.FOLIO_INGEST_TOKEN || '' },
  get cronSecret() { return process.env.CRON_SECRET || '' },
  get webhookSecret() { return process.env.FOLIO_WEBHOOK_SECRET || '' },
  get demo() { return process.env.FOLIO_DEMO !== 'false' },
  get aiGatewayKey() { return process.env.AI_GATEWAY_API_KEY || '' },
  get aiBaseUrl() { return process.env.FOLIO_AI_BASE_URL || '' },
  get aiApiKey() { return process.env.FOLIO_AI_API_KEY || '' },
  get onVercel() { return Boolean(process.env.VERCEL) },
  get publicUrl() { return (process.env.FOLIO_PUBLIC_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '')).replace(/\/$/, '') },
}
