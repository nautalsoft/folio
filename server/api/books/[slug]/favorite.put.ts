import { z } from 'zod'

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')!
  const { favorite } = await readValidatedBody(event, z.object({ favorite: z.boolean() }).parse)
  const db = await useDb()
  await db.insert(schema.readingState).values({ bookSlug: slug, favorite }).onConflictDoUpdate({ target: schema.readingState.bookSlug, set: { favorite } })
  return { favorite }
})
