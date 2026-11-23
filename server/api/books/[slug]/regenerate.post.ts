import { z } from 'zod'
import { compileDay, compileMonth } from '../../../folio/compile'

const body = z.object({ discardEdits: z.boolean().default(false), useModel: z.boolean().default(true) })

export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, 'slug')!
  const options = await readValidatedBody(event, b => body.parse(b ?? {}))
  if (isMonth(slug)) {
    await compileMonth(slug)
    return { ok: true }
  }
  if (!isDay(slug)) throw createError({ statusCode: 400 })
  const result = await compileDay(slug, { baseUrl: '', publish: true, ...options })
  await logActivity({ type: 'book.regenerated', title: slug, url: `/read/${slug}` })
  return result
})
