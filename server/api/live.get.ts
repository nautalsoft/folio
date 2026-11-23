import { listActivity } from '../folio/library'

export default defineEventHandler(async (event) => {
  let after = Number(getQuery(event).after ?? getHeader(event, 'last-event-id') ?? 0) || 0
  const stream = createEventStream(event)
  let open = true
  const deadline = Date.now() + 55_000
  stream.onClosed(() => {
    open = false
  })
  ;(async () => {
    while (open && Date.now() < deadline) {
      const events = await listActivity(after, 50)
      for (const e of events) {
        after = e.id
        await stream.push({ id: String(e.id), event: 'activity', data: JSON.stringify(e) })
      }
      if (!events.length) await stream.push({ event: 'ping', data: String(Date.now()) })
      await new Promise(r => setTimeout(r, 2000))
    }
    await stream.close()
  })()
  return stream.send()
})
