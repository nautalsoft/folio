import { count } from 'drizzle-orm'

export default defineEventHandler(async () => {
  const db = await useDb()
  const [{ value: demo } = { value: 0 }] = await db.select({ value: count() }).from(schema.demoSources)
  return {
    demo: demo > 0,
    ai: aiAvailable(),
    ingestProtected: Boolean(env.ingestToken),
    persistent: Boolean(env.databaseUrl || env.dataDir),
    vercel: env.onVercel,
    version: useRuntimeConfig().public.version,
  }
})
