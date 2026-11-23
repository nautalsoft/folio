export default defineEventHandler(async () => {
  await emitWebhook('book.published', { test: true, slug: 'test', message: 'Folio webhook test' })
  return { ok: true }
})
