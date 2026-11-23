import { collectors } from '../../../collectors'

export default defineEventHandler(async (event) => {
  const kind = getRouterParam(event, 'kind') as keyof typeof collectors
  const collector = collectors[kind]
  if (!collector) throw createError({ statusCode: 404 })
  if (!collector.configured()) return { ok: false, message: 'not_configured' }
  try {
    return await collector.test(AbortSignal.timeout(15_000))
  }
  catch (error) {
    return { ok: false, message: error instanceof Error ? error.message.slice(0, 300) : 'error' }
  }
})
