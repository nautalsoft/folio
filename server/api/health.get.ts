export default defineEventHandler(async () => {
  await useDb()
  return { ok: true, version: useRuntimeConfig().public.version }
})
