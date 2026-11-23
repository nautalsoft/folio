import { listActivity } from '../folio/library'

export default defineEventHandler(async (event) => {
  const after = Number(getQuery(event).after ?? 0) || 0
  return { events: await listActivity(after, 100) }
})
