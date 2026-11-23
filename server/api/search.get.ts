import { desc } from 'drizzle-orm'
import { blockText } from '../../shared/utils/reading'

const normalize = (value: string) => value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default defineEventHandler(async (event) => {
  const q = String(getQuery(event).q ?? '').trim()
  if (q.length < 2) return { hits: [] }
  const needle = normalize(q)
  const db = await useDb()
  const books = await db.select({ slug: schema.books.slug, title: schema.books.title, kind: schema.books.kind, content: schema.books.content }).from(schema.books).orderBy(desc(schema.books.day))
  const hits: { slug: string, bookTitle: string, chapterId: string, chapterTitle: string, blockId: string, snippet: string }[] = []
  for (const book of books) {
    if (book.kind === 'month') continue
    for (const chapter of book.content.chapters) {
      for (const block of chapter.blocks) {
        const text = blockText(block)
        const at = normalize(text).indexOf(needle)
        if (at < 0) continue
        const start = Math.max(0, at - 60)
        hits.push({ slug: book.slug, bookTitle: book.title, chapterId: chapter.id, chapterTitle: chapter.title, blockId: block.id, snippet: `${start ? '…' : ''}${text.slice(start, at + q.length + 80)}` })
        if (hits.length >= 50) return { hits }
      }
    }
  }
  return { hits }
})
