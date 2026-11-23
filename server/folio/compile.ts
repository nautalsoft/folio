import { and, desc, eq, gte, inArray, lt, or } from 'drizzle-orm'
import type { AgentKind, BookContent, CoverSpec, SourceKind, SourceRunSummary, WorkStatus } from '../../shared/types/folio'
import { countWords } from '../../shared/utils/reading'
import { dayBounds } from '../../shared/utils/time'
import { applyOverrides, buildDayBook, buildMonthBook, type DayInputs } from './build'
import { writeProse } from './writer'

export async function loadDayInputs(day: string, baseUrl: string): Promise<DayInputs> {
  const db = await useDb()
  const settings = await getSettings()
  const { end } = dayBounds(day, settings.timezone)
  const [agentRows, factRows, reportRows, needRows, runRows] = await Promise.all([
    db.select().from(schema.agents),
    db.select().from(schema.facts).where(eq(schema.facts.day, day)),
    db.select().from(schema.reports).where(eq(schema.reports.day, day)),
    db.select().from(schema.needs).where(or(eq(schema.needs.day, day), and(eq(schema.needs.status, 'open'), lt(schema.needs.createdAt, end.toISOString())))),
    db.select().from(schema.sourceRuns).where(eq(schema.sourceRuns.day, day)).orderBy(desc(schema.sourceRuns.id)),
  ])
  const runs: SourceRunSummary[] = []
  for (const run of runRows) {
    if (runs.some(r => r.source === run.source)) continue
    runs.push({ source: run.source as SourceRunSummary['source'], status: run.status as SourceRunSummary['status'], count: run.count, message: run.message ?? undefined, at: run.finishedAt ?? run.startedAt })
  }
  return {
    day,
    baseUrl,
    timezone: settings.timezone,
    agents: Object.fromEntries(agentRows.map(a => [a.id, { name: a.name, kind: a.kind as AgentKind }])),
    facts: factRows.map(f => ({ id: f.id, source: f.source as SourceKind, kind: f.kind, status: f.status as WorkStatus, title: f.title, body: f.body, url: f.url, label: f.label, agentId: f.agentId, project: f.project, occurredAt: f.occurredAt })),
    reports: reportRows.map(r => ({ id: r.id, agentId: r.agentId, project: r.project, title: r.title, summary: r.summary, status: r.status as WorkStatus, items: r.items, createdAt: r.createdAt })),
    needs: needRows.filter(n => n.day === day || n.status === 'open').map(n => ({ id: n.id, day: n.day, kind: n.kind, title: n.title, detail: n.detail, agentId: n.agentId, source: n.source as SourceKind, sourceUrl: n.sourceUrl, deadline: n.deadline, blocking: n.blocking, createdAt: n.createdAt })),
    runs,
  }
}

export interface CompileOptions {
  baseUrl: string
  useModel?: boolean
  discardEdits?: boolean
  publish?: boolean
}

export interface CompileResult {
  slug: string
  created: boolean
  empty: boolean
  incomplete: boolean
  published: boolean
  version: number
  writer: string
  writerError?: string
}

async function saveBook(input: {
  slug: string
  kind: 'day' | 'month'
  day: string
  title: string
  subtitle: string
  content: BookContent
  agents: { id: string, name: string, kind: AgentKind }[]
  projects: string[]
  incomplete: boolean
  writer: string
  publish: boolean
  discardEdits: boolean
  language: string
}) {
  const db = await useDb()
  const [existing] = await db.select().from(schema.books).where(eq(schema.books.slug, input.slug))
  const overrides = input.discardEdits ? {} : existing?.overrides ?? {}
  const content = applyOverrides(input.content, overrides)
  const title = overrides.title || input.title
  const subtitle = overrides.subtitle || input.subtitle
  const cover: CoverSpec = { title, subtitle, agents: input.agents.map(a => ({ name: a.name, kind: a.kind })), seed: input.slug, incomplete: input.incomplete, kind: input.kind }
  const now = new Date().toISOString()
  const status = input.publish ? 'published' : existing?.status ?? 'draft'
  const values = {
    kind: input.kind,
    day: input.day,
    title,
    subtitle,
    status,
    incomplete: input.incomplete,
    language: input.language,
    content,
    cover,
    agents: input.agents,
    projects: input.projects,
    wordCount: countWords(content),
    writer: input.writer,
    overrides,
    edited: Boolean(Object.keys(overrides).length),
    updatedAt: now,
    publishedAt: input.publish ? (existing?.publishedAt ?? now) : existing?.publishedAt ?? null,
  }
  if (existing) {
    await db.update(schema.books).set({ ...values, version: existing.version + 1 }).where(eq(schema.books.slug, input.slug))
    return { created: false, version: existing.version + 1, wasPublished: existing.status === 'published' }
  }
  await db.insert(schema.books).values({ slug: input.slug, ...values, version: 1 })
  return { created: true, version: 1, wasPublished: false }
}

export async function compileDay(day: string, options: CompileOptions): Promise<CompileResult> {
  const settings = await getSettings()
  const inputs = await loadDayInputs(day, options.baseUrl)
  const built = buildDayBook(inputs, settings.reportLanguage)
  let content = built.content
  let writer = 'compiler'
  let writerError: string | undefined
  if (options.useModel !== false && !built.empty) {
    const written = await writeProse(content, { modelId: settings.model, language: settings.reportLanguage, dayTitle: built.title })
    content = written.content
    writer = written.writer
    writerError = written.error
  }
  const publish = Boolean(options.publish) && !built.empty
  const saved = await saveBook({ slug: day, kind: 'day', day, title: built.title, subtitle: built.subtitle, content, agents: built.agents, projects: built.projects, incomplete: built.incomplete, writer, publish, discardEdits: Boolean(options.discardEdits), language: settings.reportLanguage })
  if (publish) await compileMonth(day.slice(0, 7))
  return { slug: day, created: saved.created, empty: built.empty, incomplete: built.incomplete, published: publish, version: saved.version, writer, writerError }
}

export async function compileMonth(month: string) {
  const db = await useDb()
  const settings = await getSettings()
  const rows = await db.select().from(schema.books).where(and(eq(schema.books.kind, 'day'), eq(schema.books.status, 'published'), gte(schema.books.day, `${month}-01`), lt(schema.books.day, `${month}-32`)))
  if (!rows.length) return
  const built = buildMonthBook(month, rows.map(r => ({ slug: r.slug, day: r.day, title: r.title, content: r.content, agents: r.agents as { id: string, name: string, kind: AgentKind }[], projects: r.projects, incomplete: r.incomplete })), settings.reportLanguage)
  await saveBook({ slug: month, kind: 'month', day: `${month}-01`, title: built.title, subtitle: built.subtitle, content: built.content, agents: built.agents, projects: built.projects, incomplete: built.incomplete, writer: 'compiler', publish: true, discardEdits: false, language: settings.reportLanguage })
}

export async function bookExists(slugs: string[]) {
  const db = await useDb()
  return db.select({ slug: schema.books.slug }).from(schema.books).where(inArray(schema.books.slug, slugs))
}
