export default defineEventHandler(async (event) => {
  if (event.path.startsWith('/api/') && !event.path.startsWith('/api/health')) await ensureDemo()
})
