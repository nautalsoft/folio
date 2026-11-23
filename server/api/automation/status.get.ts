import { desc, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  requireIngestToken(event)
  const db = await useDb()
  const day = String(getQuery(event).day ?? '') || await todayDay()
  const [book] = await db.select({ slug: schema.books.slug, status: schema.books.status, version: schema.books.version, incomplete: schema.books.incomplete, updatedAt: schema.books.updatedAt, publishedAt: schema.books.publishedAt }).from(schema.books).where(eq(schema.books.slug, day))
  const runs = await db.select().from(schema.sourceRuns).where(eq(schema.sourceRuns.day, day)).orderBy(desc(schema.sourceRuns.id))
  const latest = new Map<string, typeof runs[number]>()
  for (const run of runs) if (!latest.has(run.source)) latest.set(run.source, run)
  return { day, book: book ?? null, sources: [...latest.values()].map(r => ({ source: r.source, status: r.status, count: r.count, message: r.message, at: r.finishedAt })) }
})
