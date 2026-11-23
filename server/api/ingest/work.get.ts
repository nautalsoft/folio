import { listWork } from '../../folio/library'
import { hashId } from '../../utils/ids'

export default defineEventHandler(async (event) => {
  requireIngestToken(event)
  const key = String(getQuery(event).key ?? '')
  const items = await listWork()
  if (!key) return { items }
  const item = items.find(i => i.id === hashId('w', 'ingest', key) || i.id === key)
  return { item: item ?? null, status: item?.status ?? null, free: !item || (item.status !== 'claimed' && item.status !== 'done') || item.stale }
})
