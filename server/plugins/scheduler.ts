import { digestIfDue } from '../folio/digest'

export default defineNitroPlugin(() => {
  if (env.onVercel || process.env.FOLIO_SCHEDULER === 'false' || import.meta.prerender) return
  const tick = () => {
    ensureDemo()
      .then(() => digestIfDue(env.publicUrl))
      .catch(error => console.error('[folio] digest failed:', error instanceof Error ? error.message : error))
  }
  setTimeout(tick, 5_000)
  setInterval(tick, 60_000)
})
