import { eq, sql } from 'drizzle-orm'
import { z } from 'zod'

const body = z.object({
  location: z.object({ chapterId: z.string(), blockId: z.string(), percent: z.number().min(0).max(100) }).optional(),
  secondsDelta: z.number().int().min(0).max(600).default(0),
  opened: z.boolean().optional(),
})

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')!
  const input = await readValidatedBody(event, body.parse)
  const db = await useDb()
  const now = new Date().toISOString()
  const percent = input.location ? Math.round(input.location.percent) : undefined
  await db.insert(schema.readingState).values({ bookSlug: slug, location: input.location ?? null, percent: percent ?? 0, secondsRead: input.secondsDelta, lastOpenedAt: now, finishedAt: percent !== undefined && percent >= 98 ? now : null })
    .onConflictDoUpdate({
      target: schema.readingState.bookSlug,
      set: {
        ...(input.location ? { location: input.location, percent } : {}),
        secondsRead: sql`${schema.readingState.secondsRead} + ${input.secondsDelta}`,
        lastOpenedAt: now,
        ...(percent !== undefined && percent >= 98 ? { finishedAt: sql`coalesce(${schema.readingState.finishedAt}, ${now})` } : {}),
      },
    })
  const [state] = await db.select().from(schema.readingState).where(eq(schema.readingState.bookSlug, slug))
  return state
})
