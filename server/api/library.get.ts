import { listBooks } from '../folio/library'

export default defineEventHandler(async () => {
  const settings = await getSettings()
  return { books: await listBooks(), today: dayIn(settings.timezone), digestTime: settings.digestTime, timezone: settings.timezone }
})
