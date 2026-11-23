import { mkdirSync } from 'node:fs'
import { sql } from 'drizzle-orm'
import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import * as schema from '../db/schema'

export type Database = ReturnType<typeof drizzlePostgres<typeof schema>>

let ready: Promise<Database> | null = null

async function connect(): Promise<Database> {
  if (env.databaseUrl) {
    const client = postgres(env.databaseUrl, { max: env.onVercel ? 1 : 5, prepare: false })
    return drizzlePostgres(client, { schema })
  }
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle } = await import('drizzle-orm/pglite')
  const dir = env.dataDir
  if (dir) mkdirSync(dir, { recursive: true })
  const client = new PGlite(dir || undefined)
  return drizzle(client, { schema }) as unknown as Database
}

async function migrate(db: Database) {
  await db.execute(sql`create table if not exists folio_migrations (name text primary key, applied_at timestamptz not null default now())`)
  const storage = useStorage('assets:migrations')
  const keys = (await storage.getKeys()).filter(k => k.endsWith('.sql')).sort()
  const done = await db.execute<{ name: string }>(sql`select name from folio_migrations`)
  const rows = (Array.isArray(done) ? done : (done as unknown as { rows: { name: string }[] }).rows) as { name: string }[]
  const applied = new Set(rows.map(r => r.name))
  for (const key of keys) {
    if (applied.has(key)) continue
    const raw = await storage.getItem<string>(key)
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw as unknown as Uint8Array)
    await db.transaction(async (tx) => {
      for (const statement of text.split('--> statement-breakpoint')) {
        if (statement.trim()) await tx.execute(sql.raw(statement))
      }
      await tx.execute(sql`insert into folio_migrations (name) values (${key})`)
    })
  }
}

export function useDb(): Promise<Database> {
  ready ??= (async () => {
    const db = await connect()
    await migrate(db)
    return db
  })().catch((error) => {
    ready = null
    throw error
  })
  return ready
}

let demo: Promise<void> | null = null

export function ensureDemo(): Promise<void> {
  if (!env.demo) return Promise.resolve()
  demo ??= import('../folio/seed').then(m => m.seedDemoIfEmpty()).catch((error) => {
    demo = null
    throw error
  })
  return demo
}

export { schema }
