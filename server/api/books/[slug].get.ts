import { getBook } from '../../folio/library'

export default defineEventHandler(async (event) => {
  const book = await getBook(getRouterParam(event, 'slug')!)
  if (!book) throw createError({ statusCode: 404, statusMessage: 'Book not found' })
  return book
})
