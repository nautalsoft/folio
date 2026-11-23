import { z } from 'zod'
import { toAnnotation } from '../../../../folio/library'

const body = z.object({
  kind: z.enum(['bookmark', 'highlight', 'note']),
  chapterId: z.string().max(200),
  blockId: z.string().max(200),
  start: z.number().int().min(0).default(0),
  end: z.number().int().min(0).default(0),
  quote: z.string().max(2000).default(''),
  note: z.string().max(5000).default(''),
  color: z.enum(['yellow', 'green', 'blue', 'pink']).default('yellow'),
})

export default defineEventHandler(async (event) => {
  const bookSlug = getRouterParam(event, 'slug')!
  const input = await readValidatedBody(event, body.parse)
  const db = await useDb()
  const [row] = await db.insert(schema.annotations).values({ id: newId('a'), bookSlug, ...input }).returning()
  return toAnnotation(row!)
})
