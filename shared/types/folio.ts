export type CollectorKind = 'board' | 'github' | 'vercel' | 'slack' | 'clickup' | 'notion'
export type BuiltinSource = 'agent' | CollectorKind
// Any tool can push facts under its own source name (linear, jira, discord, a home-made tool…).
export type SourceKind = BuiltinSource | (string & {})
export type WorkStatus = 'done' | 'blocked' | 'waiting' | 'info'
export type AgentKind = 't3code' | 'claude-code' | 'codex' | 'grok' | 'cloud' | 'other'

export interface Citation {
  id: string
  source: SourceKind
  label: string
  url: string
  at?: string
}

export interface TraceStep {
  label: string
  status: 'done' | 'error' | 'running' | 'skipped'
  detail?: string
}

interface BlockBase { id: string }

export type Block =
  | (BlockBase & { type: 'heading', text: string })
  | (BlockBase & { type: 'paragraph', text: string, cites?: string[] })
  | (BlockBase & { type: 'fact', text: string, status: WorkStatus, cites: string[], at?: string })
  | (BlockBase & { type: 'code', lang: string, code: string, caption?: string })
  | (BlockBase & { type: 'diff', file: string, patch: string })
  | (BlockBase & { type: 'trace', title: string, steps: TraceStep[] })
  | (BlockBase & { type: 'quote', text: string, cites?: string[] })
  | (BlockBase & { type: 'notice', tone: 'info' | 'warning', text: string })

export interface ChapterAgent {
  id: string
  name: string
  kind: AgentKind
}

export interface Chapter {
  id: string
  title: string
  kind: 'preface' | 'agent' | 'source' | 'needs' | 'day' | 'sources'
  agent?: ChapterAgent
  sources: SourceKind[]
  status: WorkStatus | 'mixed'
  startedAt?: string
  endedAt?: string
  blocks: Block[]
}

export interface SourceRunSummary {
  source: SourceKind
  status: 'ok' | 'error' | 'not_configured' | 'skipped'
  count: number
  message?: string
  at: string
}

export interface BookContent {
  chapters: Chapter[]
  citations: Record<string, Citation>
  sourceRuns: SourceRunSummary[]
}

export interface CoverSpec {
  title: string
  subtitle: string
  agents: { name: string, kind: AgentKind }[]
  seed: string
  incomplete: boolean
  kind: 'day' | 'month'
}

export interface ReadingLocation {
  chapterId: string
  blockId: string
  percent: number
}

export interface BookSummary {
  slug: string
  kind: 'day' | 'month'
  title: string
  subtitle: string
  day: string
  status: 'draft' | 'published'
  incomplete: boolean
  agents: ChapterAgent[]
  projects: string[]
  wordCount: number
  estimatedMinutes: number
  publishedAt: string | null
  updatedAt: string
  version: number
  progress: { percent: number, secondsRead: number, lastOpenedAt: string | null, finished: boolean }
  favorite: boolean
  needsCount: number
}

export interface Annotation {
  id: string
  bookSlug: string
  kind: 'bookmark' | 'highlight' | 'note'
  chapterId: string
  blockId: string
  start: number
  end: number
  quote: string
  note: string
  color: 'yellow' | 'green' | 'blue' | 'pink'
  createdAt: string
}

export interface NeedItem {
  id: string
  day: string
  kind: 'decision' | 'blocker' | 'review'
  title: string
  detail: string
  agentId: string | null
  agentName: string | null
  source: SourceKind
  sourceUrl: string | null
  deadline: string | null
  blocking: string[]
  status: 'open' | 'resolved'
  resolution: string | null
  createdAt: string
}

export interface Checkpoint {
  id: string
  note: string
  step: string | null
  resumeHint: string | null
  createdAt: string
  agentId: string | null
}

export interface WorkItem {
  id: string
  title: string
  project: string | null
  source: SourceKind
  sourceUrl: string | null
  claimedBy: string | null
  claimedByName: string | null
  claimedAt: string | null
  heartbeatAt: string | null
  status: 'claimed' | 'released' | 'done' | 'open'
  stale: boolean
  previousClaim: { agentId: string, claimedAt: string } | null
  checkpoints: Checkpoint[]
}

export interface ActivityEvent {
  id: number
  at: string
  type: string
  agentId: string | null
  agentName: string | null
  title: string
  detail: string | null
  url: string | null
  source: SourceKind
}

export interface FolioSettings {
  digestTime: string
  timezone: string
  model: string
  reportLanguage: 'fr' | 'en'
  sources: Record<CollectorKind, boolean>
  webhooks: { id: string, url: string, events: ('book.published' | 'needs_you.created' | 'digest.failed')[] }[]
}
