import { z } from 'zod'
import { runDay } from '../../folio/digest'

const body = z.object({
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  collect: z.boolean().default(true),
  publish: z.boolean().default(true),
  useModel: z.boolean().default(true),
})

export default defineEventHandler(async (event) => {
  requireIngestToken(event)
  const input = await readValidatedBody(event, b => body.parse(b ?? {}))
  const day = input.day ?? await todayDay()
  const report = await runDay(day, { baseUrl: env.publicUrl || getRequestURL(event).origin, ...input })
  const failed = report.sources.filter(s => s.status === 'error')
  if (report.book.empty) setResponseStatus(event, 422)
  else if (failed.length || report.book.incomplete) setResponseStatus(event, 207)
  return { ...report, ok: !report.book.empty && !failed.length && !report.book.incomplete }
})
