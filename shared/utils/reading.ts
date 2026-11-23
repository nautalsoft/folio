import type { Block, BookContent } from '../types/folio'

export const WORDS_PER_MINUTE = 230

export function blockText(block: Block): string {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'fact':
    case 'quote':
    case 'notice':
      return block.text
    case 'code':
      return `${block.caption ?? ''} ${block.code}`
    case 'diff':
      return `${block.file} ${block.patch}`
    case 'trace':
      return `${block.title} ${block.steps.map(s => `${s.label} ${s.detail ?? ''}`).join(' ')}`
  }
}

export function countWords(content: BookContent): number {
  let words = 0
  for (const chapter of content.chapters) {
    words += chapter.title.split(/\s+/).length
    for (const block of chapter.blocks) words += blockText(block).split(/\s+/).filter(Boolean).length
  }
  return words
}

export const estimateMinutes = (words: number) => Math.max(1, Math.round(words / WORDS_PER_MINUTE))
