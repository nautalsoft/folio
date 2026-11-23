import { z } from 'zod'
import { runDay } from '../folio/digest'

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, b => z.object({ day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(b ?? {}))
  const day = input.day ?? await todayDay()
  return runDay(day, { baseUrl: '' })
})
