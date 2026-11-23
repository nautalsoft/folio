import { listWork } from '../../folio/library'

export default defineEventHandler(async () => ({ items: await listWork() }))
