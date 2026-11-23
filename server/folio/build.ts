import type { AgentKind, Block, BookContent, Chapter, ChapterAgent, Citation, CollectorKind, SourceKind, SourceRunSummary, WorkStatus } from '../../shared/types/folio'
import { bookStrings, formatDayTitle, formatMonthTitle, formatPrState, sourceTitle, type ReportLanguage } from '../../shared/utils/book-strings'
import type { ReportItem } from '../db/schema'
import { hashId } from '../utils/ids'

export interface FactInput {
  id: string
  source: SourceKind
  kind: string
  status: WorkStatus
  title: string
  body: string
  url: string
  label: string
  agentId: string | null
  project: string | null
  occurredAt: string
}

export interface ReportInput {
  id: string
  agentId: string
  project: string | null
  title: string
  summary: string
  status: WorkStatus
  items: ReportItem[]
  createdAt: string
}

export interface NeedInput {
  id: string
  day?: string
  kind: string
  title: string
  detail: string
  agentId: string | null
  source: SourceKind
  sourceUrl: string | null
  deadline: string | null
  blocking: string[]
  createdAt: string
}

export interface DayInputs {
  day: string
  agents: Record<string, { name: string, kind: AgentKind }>
  facts: FactInput[]
  reports: ReportInput[]
  needs: NeedInput[]
  runs: SourceRunSummary[]
  baseUrl: string
  timezone?: string
}

export interface BuiltBook {
  title: string
  subtitle: string
  content: BookContent
  agents: ChapterAgent[]
  projects: string[]
  incomplete: boolean
  empty: boolean
}

function formatDeadline(value: string, lang: ReportLanguage, timeZone = 'UTC') {
  const date = new Date(/^\d{4}-\d{2}-\d{2} /.test(value) ? value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00') : value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone }).format(date)
}

const isPullRequest = (fact: FactInput) => fact.kind === 'pr' || fact.kind.startsWith('pr.') || fact.kind === 'pull_request'
const PR_ORDER: Record<WorkStatus, number> = { blocked: 0, waiting: 1, info: 2, done: 3 }

const COLLECTOR_ORDER: CollectorKind[] = ['board', 'github', 'vercel', 'slack', 'clickup', 'notion']

function chapterStatus(statuses: WorkStatus[]): WorkStatus | 'mixed' {
  if (statuses.includes('blocked')) return 'blocked'
  if (statuses.includes('waiting')) return 'waiting'
  if (statuses.length && statuses.every(s => s === 'done' || s === 'info')) return 'done'
  return 'mixed'
}

function span(times: string[]) {
  const sorted = [...times].filter(Boolean).sort()
  return { startedAt: sorted[0], endedAt: sorted[sorted.length - 1] }
}

export function buildDayBook(input: DayInputs, lang: ReportLanguage): BuiltBook {
  const t = bookStrings(lang)
  const citations: Record<string, Citation> = {}
  const cite = (c: Citation) => {
    citations[c.id] = c
    return c.id
  }
  const agentOf = (id: string): ChapterAgent => ({ id, name: input.agents[id]?.name ?? id, kind: input.agents[id]?.kind ?? 'other' })

  const byAgent = new Map<string, { reports: ReportInput[], facts: FactInput[] }>()
  const bySource = new Map<SourceKind, FactInput[]>()
  for (const report of input.reports) {
    const entry = byAgent.get(report.agentId) ?? { reports: [], facts: [] }
    entry.reports.push(report)
    byAgent.set(report.agentId, entry)
  }
  for (const fact of input.facts) {
    if (fact.agentId) {
      const entry = byAgent.get(fact.agentId) ?? { reports: [], facts: [] }
      entry.facts.push(fact)
      byAgent.set(fact.agentId, entry)
    }
    else if (!isPullRequest(fact)) {
      bySource.set(fact.source, [...(bySource.get(fact.source) ?? []), fact])
    }
  }

  const statuses: WorkStatus[] = []
  const projects = new Set<string>()
  const chapters: Chapter[] = []

  const factBlock = (chapterId: string, fact: FactInput): Block => {
    statuses.push(fact.status)
    if (fact.project) projects.add(fact.project)
    const id = cite({ id: `c_${fact.id}`, source: fact.source, label: fact.label, url: fact.url, at: fact.occurredAt })
    return { id: hashId('b', chapterId, fact.id), type: 'fact', text: fact.body ? `${fact.title} — ${fact.body}` : fact.title, status: fact.status, cites: [id], at: fact.occurredAt }
  }

  const agentIds = [...byAgent.keys()].sort((a, b) => agentOf(a).name.localeCompare(agentOf(b).name))
  for (const agentId of agentIds) {
    const { reports, facts } = byAgent.get(agentId)!
    const chapterId = `agent-${agentId}`
    const blocks: Block[] = []
    const chapterStatuses: WorkStatus[] = []
    const sources = new Set<SourceKind>()
    const times: string[] = []
    for (const report of reports) {
      sources.add('agent')
      times.push(report.createdAt)
      if (report.project) projects.add(report.project)
      const reportCite = cite({ id: `c_${report.id}`, source: 'agent', label: `${agentOf(agentId).name} — ${report.title}`, url: `${input.baseUrl}/reports/${report.id}`, at: report.createdAt })
      if (reports.length > 1 || report.title) blocks.push({ id: hashId('b', chapterId, report.id, 'h'), type: 'heading', text: report.project ? `${report.title} · ${report.project}` : report.title })
      if (report.summary) blocks.push({ id: hashId('b', chapterId, report.id, 's'), type: 'quote', text: report.summary, cites: [reportCite] })
      report.items.forEach((item, index) => {
        const key = `${report.id}:${index}`
        const itemCite = item.url ? cite({ id: `c_${hashId('i', key)}`, source: 'agent', label: item.label || item.url, url: item.url, at: report.createdAt }) : reportCite
        const status = item.status ?? 'info'
        statuses.push(status)
        chapterStatuses.push(status)
        if (item.text) blocks.push({ id: hashId('b', chapterId, key), type: 'fact', text: item.text, status, cites: [itemCite], at: report.createdAt })
        if (item.code) blocks.push({ id: hashId('b', chapterId, key, 'code'), type: 'code', lang: item.code.lang, code: item.code.code })
        if (item.diff) blocks.push({ id: hashId('b', chapterId, key, 'diff'), type: 'diff', file: item.diff.file, patch: item.diff.patch })
        if (item.steps?.length) blocks.push({ id: hashId('b', chapterId, key, 'trace'), type: 'trace', title: item.text || report.title, steps: item.steps })
      })
      if (!report.items.length) {
        statuses.push(report.status)
        chapterStatuses.push(report.status)
      }
    }
    for (const fact of [...facts].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))) {
      sources.add(fact.source)
      times.push(fact.occurredAt)
      chapterStatuses.push(fact.status)
      blocks.push(factBlock(chapterId, fact))
    }
    const sourceNames = [...sources].map(s => sourceTitle(s, lang)).join(', ')
    blocks.unshift({ id: hashId('b', chapterId, 'intro'), type: 'paragraph', text: t.agentIntro(agentOf(agentId).name, reports.length + facts.length, sourceNames) })
    chapters.push({ id: chapterId, title: agentOf(agentId).name, kind: 'agent', agent: agentOf(agentId), sources: [...sources], status: chapterStatus(chapterStatuses), ...span(times), blocks })
  }

  const otherSources = [...bySource.keys()].filter(s => !COLLECTOR_ORDER.includes(s as CollectorKind)).sort()
  for (const source of [...COLLECTOR_ORDER, ...otherSources]) {
    const facts = bySource.get(source)
    if (!facts?.length) continue
    const chapterId = `source-${source}`
    const sorted = [...facts].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
    const blocks: Block[] = [{ id: hashId('b', chapterId, 'intro'), type: 'paragraph', text: t.sourceIntro(sourceTitle(source, lang), facts.length) }]
    for (const fact of sorted) blocks.push(factBlock(chapterId, fact))
    chapters.push({ id: chapterId, title: sourceTitle(source, lang), kind: 'source', sources: [source], status: chapterStatus(sorted.map(f => f.status)), ...span(sorted.map(f => f.occurredAt)), blocks })
  }

  const needsBlocks: Block[] = [{ id: hashId('b', 'needs', 'intro'), type: 'paragraph', text: t.needsIntro(input.needs.length) }]
  const sortedNeeds = [...input.needs].sort((a, b) => (a.deadline ?? '9999').localeCompare(b.deadline ?? '9999') || b.blocking.length - a.blocking.length)
  for (const need of sortedNeeds) {
    const url = need.sourceUrl || `${input.baseUrl}/needs#${need.id}`
    const id = cite({ id: `c_${need.id}`, source: need.source, label: need.title, url, at: need.createdAt })
    const extra = [
      need.deadline ? `${t.deadline} ${formatDeadline(need.deadline, lang, input.timezone)}` : '',
      need.blocking.length ? `${t.blocking} : ${need.blocking.join(', ')}` : '',
    ].filter(Boolean).join(' · ')
    needsBlocks.push({ id: hashId('b', 'needs', need.id), type: 'fact', text: `${need.title}${need.detail ? ` — ${need.detail}` : ''}${extra ? ` (${extra})` : ''}`, status: need.kind === 'blocker' ? 'blocked' : 'waiting', cites: [id], at: need.createdAt })
  }

  const prs = input.facts.filter(isPullRequest).sort((a, b) => PR_ORDER[a.status] - PR_ORDER[b.status] || b.occurredAt.localeCompare(a.occurredAt))
  const prBlocks: Block[] = []
  if (prs.length) {
    prBlocks.push({ id: hashId('b', 'prs', 'intro'), type: 'paragraph', text: t.prIntro(prs.filter(p => p.status === 'done').length, prs.filter(p => p.status !== 'done').length, prs.filter(p => p.status === 'blocked').length) })
    for (const pr of prs) {
      if (pr.project) projects.add(pr.project)
      const id = cite({ id: `c_${pr.id}`, source: pr.source, label: pr.label, url: pr.url, at: pr.occurredAt })
      prBlocks.push({ id: hashId('b', 'prs', pr.id), type: 'fact', text: `${pr.label} — ${pr.title}${pr.body ? ` (${formatPrState(pr.body, lang)})` : ''}`, status: pr.status, cites: [id], at: pr.occurredAt })
    }
  }

  const runBlocks: Block[] = []
  let incomplete = false
  const reportedSources = input.runs.map(r => r.source).filter(s => !COLLECTOR_ORDER.includes(s as CollectorKind))
  for (const source of [...COLLECTOR_ORDER, ...new Set([...reportedSources, ...otherSources])]) {
    const run = input.runs.find(r => r.source === source) ?? (otherSources.includes(source) ? { source, status: 'ok' as const, count: bySource.get(source)!.length, at: '' } : undefined)
    const name = sourceTitle(source, lang)
    if (!run || run.status === 'not_configured') runBlocks.push({ id: hashId('b', 'sources', source), type: 'notice', tone: 'info', text: t.notConfigured(name) })
    else if (run.status === 'error') {
      incomplete = true
      runBlocks.push({ id: hashId('b', 'sources', source), type: 'notice', tone: 'warning', text: t.failed(name, run.message) })
    }
    else if (run.status === 'skipped') runBlocks.push({ id: hashId('b', 'sources', source), type: 'notice', tone: 'info', text: t.skipped(name) })
    else runBlocks.push({ id: hashId('b', 'sources', source), type: 'paragraph', text: t.ok(name, run.count) })
  }

  const done = statuses.filter(s => s === 'done').length
  const blocked = statuses.filter(s => s === 'blocked').length
  const agents = agentIds.map(agentOf)
  const empty = !input.reports.length && !input.facts.length && !input.needs.some(n => !n.day || n.day === input.day)
  const preface: Block[] = [{ id: hashId('b', 'preface', 'overview'), type: 'paragraph', text: empty ? t.nothing : t.overview(agents.length, projects.size, done, blocked, input.needs.length) }]
  if (input.needs.length) preface.push({ id: hashId('b', 'preface', 'needs'), type: 'notice', tone: 'warning', text: t.readFirst })
  for (const block of runBlocks) if (block.type === 'notice' && block.tone === 'warning') preface.push({ ...block, id: `${block.id}_p` })

  const all: Chapter[] = [
    { id: 'preface', title: t.preface, kind: 'preface', sources: [], status: input.needs.length ? 'waiting' : 'info', blocks: preface },
  ]
  if (input.needs.length) all.push({ id: 'needs', title: t.needs, kind: 'needs', sources: [...new Set(input.needs.map(n => n.source))], status: 'waiting', blocks: needsBlocks })
  if (prs.length) all.push({ id: 'pull-requests', title: t.pullRequests, kind: 'source', sources: [...new Set(prs.map(p => p.source))], status: chapterStatus(prs.map(p => p.status)), ...span(prs.map(p => p.occurredAt)), blocks: prBlocks })
  all.push(...chapters)
  all.push({ id: 'sources', title: t.sourcesChapter, kind: 'sources', sources: [], status: incomplete ? 'blocked' : 'info', blocks: runBlocks })

  return {
    title: formatDayTitle(input.day, lang),
    subtitle: t.agentsProjects(agents.length, projects.size),
    content: { chapters: all, citations, sourceRuns: input.runs },
    agents,
    projects: [...projects].sort(),
    incomplete,
    empty,
  }
}

export interface DayBookForMonth {
  slug: string
  day: string
  title: string
  content: BookContent
  agents: ChapterAgent[]
  projects: string[]
  incomplete: boolean
}

export function buildMonthBook(month: string, days: DayBookForMonth[], lang: ReportLanguage): BuiltBook {
  const t = bookStrings(lang)
  const citations: Record<string, Citation> = {}
  const chapters: Chapter[] = []
  const agents = new Map<string, ChapterAgent>()
  const projects = new Set<string>()
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day))
  for (const day of sorted) {
    day.agents.forEach(a => agents.set(a.id, a))
    day.projects.forEach(p => projects.add(p))
    Object.assign(citations, day.content.citations)
    const blocks: Block[] = []
    for (const chapter of day.content.chapters) {
      if (chapter.kind === 'sources') continue
      if (chapter.kind !== 'preface') blocks.push({ id: hashId('b', day.day, chapter.id, 'h'), type: 'heading', text: chapter.title })
      for (const block of chapter.blocks) {
        if (block.type === 'fact' || block.type === 'paragraph' || block.type === 'quote' || block.type === 'notice') blocks.push({ ...block, id: hashId('b', day.day, block.id) })
      }
    }
    const statuses = day.content.chapters.map(c => c.status).filter((s): s is WorkStatus => s !== 'mixed')
    chapters.push({ id: `day-${day.day}`, title: day.title, kind: 'day', sources: [...new Set(day.content.chapters.flatMap(c => c.sources))], status: chapterStatus(statuses), blocks })
  }
  chapters.unshift({ id: 'preface', title: t.preface, kind: 'preface', sources: [], status: 'info', blocks: [{ id: hashId('b', month, 'intro'), type: 'paragraph', text: t.monthIntro(sorted.length) }] })
  return {
    title: formatMonthTitle(month, lang),
    subtitle: `${t.month} · ${t.agentsProjects(agents.size, projects.size)}`,
    content: { chapters, citations, sourceRuns: [] },
    agents: [...agents.values()],
    projects: [...projects].sort(),
    incomplete: sorted.some(d => d.incomplete),
    empty: !sorted.length,
  }
}

export function applyOverrides(content: BookContent, overrides: { blocks?: Record<string, string> }): BookContent {
  if (!overrides.blocks || !Object.keys(overrides.blocks).length) return content
  const edits = overrides.blocks
  return {
    ...content,
    chapters: content.chapters.map(chapter => ({
      ...chapter,
      blocks: chapter.blocks.map((block) => {
        const text = edits[block.id]
        if (text === undefined || !('text' in block)) return block
        return { ...block, text } as Block
      }),
    })),
  }
}
