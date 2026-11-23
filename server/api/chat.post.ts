import { convertToModelMessages, createUIMessageStream, createUIMessageStreamResponse, generateId, streamText, toUIMessageStream, type UIMessage } from 'ai'
import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { BookContent, Citation } from '../../shared/types/folio'
import { blockText } from '../../shared/utils/reading'

const body = z.object({
  id: z.string().max(100),
  messages: z.array(z.any()).max(100),
  context: z.object({
    bookSlug: z.string().max(20).nullish(),
    chapterId: z.string().max(200).nullish(),
    selection: z.string().max(2000).nullish(),
    screen: z.string().max(40).nullish(),
  }).default({}),
})

interface Passage { n: number, book: string, chapter: string, text: string, citation: Citation | null, status: string | null }

const normalize = (value: string) => value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()

function passages(books: { slug: string, title: string, content: BookContent }[], focusChapter?: string | null): Passage[] {
  const out: Passage[] = []
  for (const book of books) {
    for (const chapter of book.content.chapters) {
      for (const block of chapter.blocks) {
        const cite = 'cites' in block && block.cites?.length ? book.content.citations[block.cites[0]!] ?? null : null
        out.push({ n: 0, book: book.title, chapter: chapter.id === focusChapter ? `${chapter.title} (being read)` : chapter.title, text: blockText(block).slice(0, 700), citation: cite, status: block.type === 'fact' ? block.status : null })
      }
    }
  }
  return out.map((p, i) => ({ ...p, n: i + 1 }))
}

const STOP = new Set(['quest', 'quoi', 'what', 'about', 'aujourd', 'today', 'est', 'sont', 'dans', 'avec', 'pour', 'this', 'that', 'livre', 'book', 'jour', 'journee'])
const INTENTS: [RegExp, string][] = [
  [/bloqu|block|coince|stuck/, 'blocked'],
  [/attend|decision|decid|needs?|valider|approve|review|relire/, 'waiting'],
  [/termin|fini|fait|done|finish|complete|livre|merged|fusionn/, 'done'],
]

function rank(question: string, list: Passage[]): Passage[] {
  const q = normalize(question)
  const intent = INTENTS.find(([re]) => re.test(q))?.[1]
  const terms = q.split(/[^a-z0-9]+/).filter(t => t.length > 3 && !STOP.has(t))
  const facts = list.filter(p => p.status)
  if (intent) {
    const matching = facts.filter(p => p.status === intent)
    const scored = matching.map(p => ({ p, score: terms.reduce((s, t) => s + (normalize(p.text).includes(t) ? 1 : 0), 0) }))
    return scored.sort((a, b) => b.score - a.score).slice(0, 8).map(x => x.p)
  }
  return list
    .map(p => ({ p, score: terms.reduce((s, t) => s + (normalize(p.text).includes(t) ? 1 : 0), 0) + (p.status ? 0.5 : 0) }))
    .filter(x => x.score >= 1)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(x => x.p)
}

export default defineEventHandler(async (event) => {
  const input = await readValidatedBody(event, body.parse)
  const messages = input.messages as UIMessage[]
  const db = await useDb()
  const settings = await getSettings()
  const ctx = input.context
  const books = ctx.bookSlug
    ? await db.select({ slug: schema.books.slug, title: schema.books.title, content: schema.books.content }).from(schema.books).where(eq(schema.books.slug, ctx.bookSlug))
    : await db.select({ slug: schema.books.slug, title: schema.books.title, content: schema.books.content }).from(schema.books).where(eq(schema.books.kind, 'day')).orderBy(desc(schema.books.day)).limit(7)
  const all = passages(books, ctx.chapterId)
  const last = messages.at(-1)
  const question = last?.parts?.map(p => (p.type === 'text' ? p.text : '')).join(' ') ?? ''
  const save = async (finalMessages: UIMessage[]) => {
    await db.insert(schema.chats).values({ id: input.id, bookSlug: ctx.bookSlug ?? null, messages: finalMessages, updatedAt: new Date().toISOString() })
      .onConflictDoUpdate({ target: schema.chats.id, set: { messages: finalMessages, updatedAt: new Date().toISOString() } })
  }
  const writeSources = (writer: { write: (part: never) => void }, used: Passage[]) => {
    const seen = new Set<string>()
    for (const p of used) {
      if (!p.citation || seen.has(p.citation.url)) continue
      seen.add(p.citation.url)
      writer.write({ type: 'source-url', sourceId: `${p.n}`, url: p.citation.url, title: p.citation.label } as never)
    }
  }
  const model = languageModel(settings.model)

  const stream = createUIMessageStream({
    originalMessages: messages,
    onEnd: ({ messages: finalMessages }) => save(finalMessages),
    execute: async ({ writer }) => {
      writer.write({ type: 'start', messageId: generateId() })
      const fallback = () => {
        const found = rank(question, all)
        const id = generateId()
        const lang = settings.reportLanguage
        const text = found.length
          ? `${lang === 'en' ? 'Here is what the book says' : 'Voici ce que dit le livre'} :\n\n${[...new Map(found.map(p => [p.text, p])).values()].map(p => `- ${p.text} (${p.chapter}) [${p.n}]`).join('\n')}`
          : lang === 'en' ? 'I could not find anything about that in this book.' : 'Je n’ai rien trouvé à ce sujet dans ce livre.'
        writer.write({ type: 'text-start', id })
        writer.write({ type: 'text-delta', id, delta: text })
        writer.write({ type: 'text-end', id })
        writeSources(writer as never, found)
        writer.write({ type: 'finish' })
      }
      if (!model) return fallback()
      try {
        const result = streamText({
          model,
          reasoning: reasoningLevel(),
          system: [
            `You answer questions about a daily book that reports what AI agents did. Answer in ${settings.reportLanguage === 'en' ? 'English' : 'French'}, briefly and plainly.`,
            'Use only the numbered passages. After each claim, cite the passage numbers in square brackets, like [3] or [3][7]. If the passages do not answer, say so. Never invent facts.',
            ctx.selection ? 'The reader selected a passage; prioritise it.' : '',
            `The reader is on the "${ctx.screen ?? 'reader'}" screen.`,
            untrustedDataRules,
          ].filter(Boolean).join('\n'),
          messages: [
            { role: 'user', content: `Passages:\n${isolate(all.map(p => ({ n: p.n, book: p.book, chapter: p.chapter, text: p.text })))}${ctx.selection ? `\n\nSelected by the reader:\n${isolate(ctx.selection)}` : ''}` },
            { role: 'assistant', content: 'Understood. I will answer only from these passages and cite them.' },
            ...await convertToModelMessages(messages),
          ],
          abortSignal: AbortSignal.timeout(60_000),
        })
        writer.merge(toUIMessageStream({ stream: result.stream, sendStart: false, sendFinish: false }))
        const text = await result.text
        const used = [...new Set([...text.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1])))].map(n => all[n - 1]).filter((p): p is Passage => Boolean(p))
        writeSources(writer as never, used)
        writer.write({ type: 'finish' })
      }
      catch {
        fallback()
      }
    },
  })
  return createUIMessageStreamResponse({ stream })
})
