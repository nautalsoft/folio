import { listNeeds } from '../../folio/library'

export default defineEventHandler(async (event) => {
  const status = String(getQuery(event).status ?? 'open') as 'open' | 'resolved' | 'all'
  return { needs: await listNeeds(['open', 'resolved', 'all'].includes(status) ? status : 'open') }
})
