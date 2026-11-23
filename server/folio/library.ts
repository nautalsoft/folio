import { desc, eq, gt, inArray } from 'drizzle-orm'
import type { Annotation, BookSummary, ChapterAgent, NeedItem, WorkItem, Checkpoint, ActivityEvent } from '../../shared/types/folio'
import { estimateMinutes } from '../../shared/utils/reading'

type BookRow = typeof schema.books.$inferSelect
type StateRow = typeof schema.readingState.$inferSelect

export function toSummary(book: BookRow, state: StateRow | undefined, needsCount: number): BookSummary {
  return {
    slug: book.slug,
    kind: book.kind as BookSummary['kind'],
    title: book.title,
    subtitle: book.subtitle,
    day: book.day,
    status: book.status as BookSummary['status'],
    incomplete: book.incomplete,
    agents: book.agents as ChapterAgent[],
    projects: book.projects,
    wordCount: book.wordCount,
    estimatedMinutes: estimateMinutes(book.wordCount),
    publishedAt: book.publishedAt,
    updatedAt: book.updatedAt,
    version: book.version,
    progress: {
      percent: state?.percent ?? 0,
      secondsRead: state?.secondsRead ?? 0,
      lastOpenedAt: state?.lastOpenedAt ?? null,
      finished: Boolean(state?.finishedAt),
    },
    favorite: state?.favorite ?? false,
    needsCount,
  }
}

export async function listBooks(): Promise<BookSummary[]> {
  const db = await useDb()
  const rows = await db.select({
    slug: schema.books.slug, kind: schema.books.kind, day: schema.books.day, title: schema.books.title, subtitle: schema.books.subtitle,
    status: schema.books.status, incomplete: schema.books.incomplete, agents: schema.books.agents, projects: schema.books.projects,
    wordCount: schema.books.wordCount, publishedAt: schema.books.publishedAt, updatedAt: schema.books.updatedAt, version: schema.books.version,
    content: schema.books.content,
  }).from(schema.books).orderBy(desc(schema.books.day), desc(schema.books.kind))
  const states = await db.select().from(schema.readingState)
  const bySlug = new Map(states.map(s => [s.bookSlug, s]))
  return rows.map((row) => {
    const needs = row.content.chapters.find(c => c.kind === 'needs')?.blocks.filter(b => b.type === 'fact').length ?? 0
    return toSummary(row as BookRow, bySlug.get(row.slug), needs)
  })
}

export async function getBook(slug: string) {
  const db = await useDb()
  const [book] = await db.select().from(schema.books).where(eq(schema.books.slug, slug))
  if (!book) return null
  const [state] = await db.select().from(schema.readingState).where(eq(schema.readingState.bookSlug, slug))
  const notes = await db.select().from(schema.annotations).where(eq(schema.annotations.bookSlug, slug)).orderBy(schema.annotations.createdAt)
  const needs = book.content.chapters.find(c => c.kind === 'needs')?.blocks.filter(b => b.type === 'fact').length ?? 0
  return {
    summary: toSummary(book, state, needs),
    content: book.content,
    writer: book.writer,
    language: book.language,
    edited: book.edited,
    location: state?.location ?? null,
    annotations: notes.map(toAnnotation),
  }
}

export function toAnnotation(row: typeof schema.annotations.$inferSelect): Annotation {
  return { id: row.id, bookSlug: row.bookSlug, kind: row.kind as Annotation['kind'], chapterId: row.chapterId, blockId: row.blockId, start: row.start, end: row.end, quote: row.quote, note: row.note, color: row.color as Annotation['color'], createdAt: row.createdAt }
}

export async function listNeeds(status: 'open' | 'resolved' | 'all' = 'open'): Promise<NeedItem[]> {
  const db = await useDb()
  const rows = status === 'all'
    ? await db.select().from(schema.needs)
    : await db.select().from(schema.needs).where(eq(schema.needs.status, status))
  const agents = new Map((await db.select().from(schema.agents)).map(a => [a.id, a.name]))
  return rows.map(n => ({
    id: n.id, day: n.day, kind: n.kind as NeedItem['kind'], title: n.title, detail: n.detail, agentId: n.agentId,
    agentName: n.agentId ? agents.get(n.agentId) ?? n.agentId : null, source: n.source, sourceUrl: n.sourceUrl,
    deadline: n.deadline, blocking: n.blocking, status: n.status as NeedItem['status'], resolution: n.resolution, createdAt: n.createdAt,
  })).sort((a, b) => {
    if (a.status !== b.status) return a.status === 'open' ? -1 : 1
    const kindRank = (k: string) => (k === 'blocker' ? 0 : k === 'decision' ? 1 : 2)
    return (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || b.blocking.length - a.blocking.length || kindRank(a.kind) - kindRank(b.kind)
  })
}

export const STALE_MINUTES = 30

export async function listWork(): Promise<WorkItem[]> {
  const db = await useDb()
  const rows = await db.select().from(schema.workItems).where(inArray(schema.workItems.status, ['open', 'claimed', 'released'])).orderBy(desc(schema.workItems.updatedAt))
  const ids = rows.map(r => r.id)
  const points = ids.length ? await db.select().from(schema.checkpoints).where(inArray(schema.checkpoints.workItemId, ids)).orderBy(desc(schema.checkpoints.createdAt)) : []
  const agents = new Map((await db.select().from(schema.agents)).map(a => [a.id, a.name]))
  const now = Date.now()
  return rows.map(r => ({
    id: r.id, title: r.title, project: r.project, source: r.source, sourceUrl: r.sourceUrl,
    claimedBy: r.claimedBy, claimedByName: r.claimedBy ? agents.get(r.claimedBy) ?? r.claimedBy : null,
    claimedAt: r.claimedAt, heartbeatAt: r.heartbeatAt, status: r.status as WorkItem['status'],
    stale: r.status === 'claimed' && (!r.heartbeatAt || now - Date.parse(r.heartbeatAt) > STALE_MINUTES * 60_000),
    previousClaim: r.previousClaim ?? null,
    checkpoints: points.filter(p => p.workItemId === r.id).map((p): Checkpoint => ({ id: p.id, note: p.note, step: p.step, resumeHint: p.resumeHint, createdAt: p.createdAt, agentId: p.agentId })),
  })).sort((a, b) => Number(b.status === 'claimed') - Number(a.status === 'claimed') || Number(b.stale) - Number(a.stale))
}

export async function listActivity(after = 0, limit = 100): Promise<ActivityEvent[]> {
  const db = await useDb()
  const agents = new Map((await db.select().from(schema.agents)).map(a => [a.id, a.name]))
  const rows = await db.select().from(schema.activity).where(gt(schema.activity.id, after)).orderBy(desc(schema.activity.id)).limit(limit)
  return rows.reverse().map(r => ({ id: r.id, at: r.at, type: r.type, agentId: r.agentId, agentName: r.agentId ? agents.get(r.agentId) ?? r.agentId : null, title: r.title, detail: r.detail, url: r.url, source: r.source }))
}

