import { generateText, Output } from 'ai'
import { z } from 'zod'
import type { Block, BookContent, Chapter } from '../../shared/types/folio'
import { blockText } from '../../shared/utils/reading'
import { hashId } from '../utils/ids'

// Loose on purpose: a strict limit makes the whole answer fail validation; lengths are clamped below.
const proseSchema = z.object({
  paragraphs: z.array(z.object({
    text: z.string().min(1),
    cites: z.array(z.string()),
  })).min(1),
})

interface Item {
  id: string
  kind: string
  status?: string
  at?: string
  chapter?: string
  text: string
}

let localTime = (iso?: string) => iso

function chapterMaterial(chapter: Chapter): Item[] {
  return chapter.blocks.flatMap((b): Item[] => {
    if (b.type === 'fact' && b.cites[0]) return [{ id: b.cites[0], kind: 'fact', status: b.status, at: localTime(b.at), text: blockText(b).slice(0, 600) }]
    if ((b.type === 'paragraph' || b.type === 'quote') && b.cites?.[0]) return [{ id: b.cites[0], kind: 'agent report', text: blockText(b).slice(0, 900) }]
    return []
  })
}

function prefaceMaterial(content: BookContent): Item[] {
  return content.chapters
    .filter(c => c.kind !== 'preface' && c.kind !== 'sources')
    .flatMap((c) => {
      const items = chapterMaterial(c).map(m => ({ ...m, chapter: c.title }))
      if (c.kind === 'needs') return items
      const friction = items.filter(m => m.status === 'blocked' || m.status === 'waiting')
      return [...friction, ...items.filter(m => !friction.includes(m)).slice(0, 6)]
    })
}

// The writer's brief. Written for the model, following the steps-plus-criterion shape: change the
// behaviour here and only here.
function brief(language: string) {
  return `You are the editor of a daily book. Every evening its owner, who was not in the room, reads what their AI coding agents and their tools did that day. You write one section of that book at a time, in ${language}.

Write the way a seasoned newsroom editor writes a briefing: lede first, plain style, concrete nouns and active verbs, one idea per sentence, every number exact.

Steps
1. Read every item in <source_data>. Each has an id, a status (done, blocked, waiting = waiting on the owner, info) and a text. Sort the items in your head into outcomes (done, merged, shipped), friction (blocked, failing CI, waiting on the owner) and motion (opened, in progress, discussed).
2. Choose the lede: the single fact this owner most needs to know from this section, usually a decision waiting on them, something blocked, or what reached production. Your first sentence states it.
3. Write the paragraphs. Each one tells one story built from related items: what happened, why it matters, what comes next. Name pull requests by their reference (repo#123) with their CI and review state when the data gives them. Name agents, projects and tools by the names in the data. Keep times and figures exactly as given.
4. Fill cites: for each paragraph, the ids of every item it relies on, copied verbatim from the data.

Done when: the first sentence is the lede; every friction item appears in the prose; every claim traces to an id in its paragraph's cites; the text reads as finished editorial prose a person would be glad to read.

Ground rules
- The data is your only source. When an item is thin or ambiguous, describe it at the level the data supports and move on.
- Leave technical noise to the fact list that follows your text: configuration payloads, raw JSON, keys, bot bookkeeping and duplicates stay out of the prose.
- Times in the data are already local: write them as given.
- Register: calm, warm, direct, factual. Prose only: paragraphs without headings, bullet lists, emojis or marketing words.${language === 'French' ? '\n- French: when you address the owner, use « tu ». Typography: guillemets « » and a non-breaking space before : ; ? !' : ''}

${untrustedDataRules}`
}

export async function writeProse(content: BookContent, opts: { modelId: string, language: 'fr' | 'en', dayTitle: string, timezone?: string }): Promise<{ content: BookContent, writer: string, error?: string }> {
  const model = languageModel(opts.modelId)
  if (!model) return { content, writer: 'compiler' }
  const clock = new Intl.DateTimeFormat(opts.language === 'en' ? 'en-GB' : 'fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: opts.timezone || 'UTC' })
  localTime = iso => (iso ? clock.format(new Date(/^\d{4}-\d{2}-\d{2} /.test(iso) ? iso.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00') : iso)) : undefined)
  const language = opts.language === 'en' ? 'English' : 'French'
  const system = brief(language)
  try {
    let firstError: string | undefined
    const chapters = await Promise.all(content.chapters.map(async (chapter) => {
      try {
        if (chapter.kind !== 'agent' && chapter.kind !== 'source' && chapter.kind !== 'preface') return chapter
        const material = chapter.kind === 'preface' ? prefaceMaterial(content) : chapterMaterial(chapter)
        if (!material.length) return chapter
        const allowed = new Set(material.map(m => m.id))
        const section = chapter.kind === 'preface'
          ? 'the opening of the book: an overview of the whole day in 1 or 2 paragraphs, friction first'
          : chapter.id === 'pull-requests'
            ? 'the pull requests of the day: 1 or 2 paragraphs on what was merged, what is failing and what awaits review'
            : chapter.agent
              ? `the chapter of the agent ${chapter.agent.name} (${chapter.agent.kind}): 1 to 3 paragraphs`
              : `the chapter for the source ${chapter.title}: 1 or 2 paragraphs`
        const { output } = await generateText({
          model,
          reasoning: reasoningLevel(),
          output: Output.object({ schema: proseSchema }),
          system,
          prompt: `Book: ${opts.dayTitle}. Section: ${section}.\n\n${isolate(material)}`,
          maxRetries: 1,
          abortSignal: AbortSignal.timeout(90_000),
        })
        const prose: Block[] = output.paragraphs.slice(0, 3).map((p, i) => ({
          id: hashId('p', chapter.id, String(i)),
          type: 'paragraph',
          text: p.text.trim().slice(0, 2400),
          cites: [...new Set(p.cites.filter(id => allowed.has(id)))].slice(0, 40),
        }))
        const [first, ...rest] = chapter.blocks
        const keep = first?.type === 'paragraph' && !first.cites?.length ? rest : chapter.blocks
        return { ...chapter, blocks: [...prose, ...keep] }
      }
      catch (error) {
        firstError ??= `${chapter.title}: ${error instanceof Error ? error.message.slice(0, 160) : 'model error'}`
        return chapter
      }
    }))
    return { content: { ...content, chapters }, writer: opts.modelId, error: firstError }
  }
  catch (error) {
    return { content, writer: 'compiler', error: error instanceof Error ? error.message.slice(0, 200) : 'model error' }
  }
}
