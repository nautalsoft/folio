import { boolean, index, integer, jsonb, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import type { BookContent, Citation, CoverSpec, ReadingLocation } from '../../shared/types/folio'

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'string' })

export const agents = pgTable('agents', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('other'),
  createdAt: ts('created_at').notNull().defaultNow(),
})

export const reports = pgTable('reports', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  day: text('day').notNull(),
  project: text('project'),
  title: text('title').notNull(),
  summary: text('summary').notNull().default(''),
  status: text('status').notNull().default('done'),
  items: jsonb('items').$type<ReportItem[]>().notNull().default([]),
  externalKey: text('external_key'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, t => [
  index('reports_day_idx').on(t.day),
  uniqueIndex('reports_external_key_idx').on(t.agentId, t.externalKey),
])

export interface BookOverrides {
  title?: string
  subtitle?: string
  blocks?: Record<string, string>
}

export interface ReportItem {
  text: string
  status?: 'done' | 'blocked' | 'waiting' | 'info'
  url?: string
  label?: string
  code?: { lang: string, code: string }
  diff?: { file: string, patch: string }
  steps?: { label: string, status: 'done' | 'error' | 'running' | 'skipped', detail?: string }[]
}

export const facts = pgTable('facts', {
  id: text('id').primaryKey(),
  day: text('day').notNull(),
  source: text('source').notNull(),
  externalId: text('external_id').notNull(),
  kind: text('kind').notNull(),
  status: text('status').notNull().default('info'),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  url: text('url').notNull(),
  label: text('label').notNull(),
  agentId: text('agent_id'),
  actor: text('actor'),
  project: text('project'),
  occurredAt: ts('occurred_at').notNull(),
  collectedAt: ts('collected_at').notNull().defaultNow(),
}, t => [
  index('facts_day_idx').on(t.day),
  uniqueIndex('facts_source_external_idx').on(t.source, t.externalId, t.day),
])

export const sourceRuns = pgTable('source_runs', {
  id: serial('id').primaryKey(),
  day: text('day').notNull(),
  source: text('source').notNull(),
  status: text('status').notNull(),
  count: integer('count').notNull().default(0),
  message: text('message'),
  startedAt: ts('started_at').notNull().defaultNow(),
  finishedAt: ts('finished_at'),
}, t => [index('source_runs_day_idx').on(t.day)])

export const books = pgTable('books', {
  slug: text('slug').primaryKey(),
  kind: text('kind').notNull().default('day'),
  day: text('day').notNull(),
  title: text('title').notNull(),
  subtitle: text('subtitle').notNull().default(''),
  status: text('status').notNull().default('draft'),
  incomplete: boolean('incomplete').notNull().default(false),
  language: text('language').notNull().default('fr'),
  content: jsonb('content').$type<BookContent>().notNull(),
  cover: jsonb('cover').$type<CoverSpec>().notNull(),
  agents: jsonb('agents').$type<{ id: string, name: string, kind: string }[]>().notNull().default([]),
  projects: jsonb('projects').$type<string[]>().notNull().default([]),
  wordCount: integer('word_count').notNull().default(0),
  writer: text('writer').notNull().default('compiler'),
  edited: boolean('edited').notNull().default(false),
  overrides: jsonb('overrides').$type<BookOverrides>().notNull().default({}),
  version: integer('version').notNull().default(1),
  publishedAt: ts('published_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
}, t => [index('books_day_idx').on(t.day)])

export const readingState = pgTable('reading_state', {
  bookSlug: text('book_slug').primaryKey(),
  location: jsonb('location').$type<ReadingLocation | null>(),
  percent: integer('percent').notNull().default(0),
  secondsRead: integer('seconds_read').notNull().default(0),
  favorite: boolean('favorite').notNull().default(false),
  lastOpenedAt: ts('last_opened_at'),
  finishedAt: ts('finished_at'),
})

export const annotations = pgTable('annotations', {
  id: text('id').primaryKey(),
  bookSlug: text('book_slug').notNull(),
  kind: text('kind').notNull(),
  chapterId: text('chapter_id').notNull(),
  blockId: text('block_id').notNull(),
  start: integer('start').notNull().default(0),
  end: integer('end').notNull().default(0),
  quote: text('quote').notNull().default(''),
  note: text('note').notNull().default(''),
  color: text('color').notNull().default('yellow'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, t => [index('annotations_book_idx').on(t.bookSlug)])

export const needs = pgTable('needs', {
  id: text('id').primaryKey(),
  day: text('day').notNull(),
  kind: text('kind').notNull().default('decision'),
  title: text('title').notNull(),
  detail: text('detail').notNull().default(''),
  agentId: text('agent_id'),
  source: text('source').notNull().default('agent'),
  sourceUrl: text('source_url'),
  deadline: ts('deadline'),
  blocking: jsonb('blocking').$type<string[]>().notNull().default([]),
  status: text('status').notNull().default('open'),
  resolution: text('resolution'),
  externalKey: text('external_key'),
  notifiedAt: ts('notified_at'),
  createdAt: ts('created_at').notNull().defaultNow(),
  resolvedAt: ts('resolved_at'),
}, t => [uniqueIndex('needs_external_key_idx').on(t.source, t.externalKey)])

export const workItems = pgTable('work_items', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  project: text('project'),
  source: text('source').notNull().default('agent'),
  sourceUrl: text('source_url'),
  status: text('status').notNull().default('open'),
  claimedBy: text('claimed_by'),
  claimedAt: ts('claimed_at'),
  heartbeatAt: ts('heartbeat_at'),
  previousClaim: jsonb('previous_claim').$type<{ agentId: string, claimedAt: string } | null>(),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const checkpoints = pgTable('checkpoints', {
  id: text('id').primaryKey(),
  workItemId: text('work_item_id').notNull(),
  agentId: text('agent_id'),
  note: text('note').notNull(),
  step: text('step'),
  resumeHint: text('resume_hint'),
  createdAt: ts('created_at').notNull().defaultNow(),
}, t => [index('checkpoints_item_idx').on(t.workItemId)])

export const activity = pgTable('activity', {
  id: serial('id').primaryKey(),
  at: ts('at').notNull().defaultNow(),
  type: text('type').notNull(),
  agentId: text('agent_id'),
  source: text('source').notNull().default('agent'),
  title: text('title').notNull(),
  detail: text('detail'),
  url: text('url'),
})

export const chats = pgTable('chats', {
  id: text('id').primaryKey(),
  bookSlug: text('book_slug'),
  messages: jsonb('messages').$type<unknown[]>().notNull().default([]),
  updatedAt: ts('updated_at').notNull().defaultNow(),
})

export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
})

export const webhookDeliveries = pgTable('webhook_deliveries', {
  id: serial('id').primaryKey(),
  event: text('event').notNull(),
  target: text('target').notNull(),
  status: text('status').notNull(),
  code: integer('code'),
  at: ts('at').notNull().defaultNow(),
})

export const demoSources = pgTable('demo_sources', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  meta: jsonb('meta').$type<Record<string, string>>().notNull().default({}),
})

export type { Citation }
