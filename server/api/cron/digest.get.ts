import { digestIfDue } from '../../folio/digest'

export default defineEventHandler(async (event) => {
  requireCronSecret(event)
  const result = await digestIfDue(env.publicUrl || getRequestURL(event).origin, new Date(), { ignoreTime: env.onVercel && process.env.FOLIO_CRON_HOURLY !== 'true' })
  return result ? { ran: true, day: result.day, published: result.book.published, incomplete: result.book.incomplete } : { ran: false }
})
