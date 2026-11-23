import { generateText, Output } from 'ai'
import { z } from 'zod'
import type { Block, BookContent, Chapter } from '../../shared/types/folio'
import { blockText } from '../../shared/utils/reading'
import { hashId } from '../utils/ids'

const proseSchema = z.object({
  paragraphs: z.array(z.object({
    text: z.string().min(1).max(1200),
    cites: z.array(z.string()).max(8),
  })).min(1).max(3),
})

function chapterMaterial(chapter: Chapter) {
  return chapter.blocks
    .filter(b => b.type === 'fact' || (b.type === 'paragraph' && b.cites?.length))
    .map(b => ({ text: blockText(b).slice(0, 600), status: b.type === 'fact' ? b.status : undefined, cites: 'cites' in b ? b.cites : [] }))
}

export async function writeProse(content: BookContent, opts: { modelId: string, language: 'fr' | 'en', dayTitle: string }): Promise<{ content: BookContent, writer: string, error?: string }> {
  const model = languageModel(opts.modelId)
  if (!model) return { content, writer: 'compiler' }
  const language = opts.language === 'en' ? 'English' : 'French'
  try {
    const chapters = await Promise.all(content.chapters.map(async (chapter) => {
      if (chapter.kind !== 'agent' && chapter.kind !== 'source' && chapter.kind !== 'preface') return chapter
      const material = chapter.kind === 'preface'
        ? content.chapters.filter(c => c.kind !== 'preface' && c.kind !== 'sources').flatMap(c => chapterMaterial(c).slice(0, 6).map(m => ({ chapter: c.title, ...m })))
        : chapterMaterial(chapter)
      if (!material.length) return chapter
      const allowed = new Set(material.flatMap(m => m.cites ?? []))
      const { output } = await generateText({
        model,
        reasoning: reasoningLevel(),
        output: Output.object({ schema: proseSchema }),
        system: [
          `You write one short section of a daily book that reports what AI coding agents did. Write in ${language}, plainly, like a good editor: concrete, calm, no hype, no emojis, no headings.`,
          'Only state facts present in the data. Do not invent numbers, names, outcomes or causes. If something is unclear, leave it out.',
          'Each paragraph lists in "cites" the ids of the items it relies on, chosen only from the ids given in the data.',
          untrustedDataRules,
        ].join('\n'),
        prompt: `Book: ${opts.dayTitle}. Section: ${chapter.title}${chapter.kind === 'preface' ? ' (an overview of the whole day, 1 or 2 paragraphs)' : ' (1 to 3 paragraphs)'}.\n\n${isolate(material)}`,
        maxRetries: 1,
        abortSignal: AbortSignal.timeout(60_000),
      })
      const prose: Block[] = output.paragraphs.map((p, i) => ({
        id: hashId('p', chapter.id, String(i)),
        type: 'paragraph',
        text: p.text,
        cites: p.cites.filter(id => allowed.has(id)),
      }))
      const [first, ...rest] = chapter.blocks
      const keep = first?.type === 'paragraph' && !first.cites?.length ? rest : chapter.blocks
      return { ...chapter, blocks: [...prose, ...keep] }
    }))
    return { content: { ...content, chapters }, writer: opts.modelId }
  }
  catch (error) {
    return { content, writer: 'compiler', error: error instanceof Error ? error.message.slice(0, 200) : 'model error' }
  }
}
