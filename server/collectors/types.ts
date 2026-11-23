import type { CollectorKind, WorkStatus } from '../../shared/types/folio'

export interface CollectContext {
  day: string
  start: Date
  end: Date
  timezone: string
  signal: AbortSignal
}

export interface CollectedFact {
  externalId: string
  kind: string
  status: WorkStatus
  title: string
  body?: string
  url: string
  label: string
  actor?: string | null
  project?: string | null
  occurredAt: string
}

export interface CollectedNeed {
  externalId: string
  kind: 'decision' | 'blocker' | 'review'
  title: string
  detail?: string
  url: string | null
  actor?: string | null
  deadline?: string | null
  blocking?: string[]
}

export interface CollectedWork {
  externalId: string
  title: string
  url: string | null
  project?: string | null
  claimedBy: string | null
  claimedAt: string | null
  heartbeatAt: string | null
  status: 'open' | 'claimed' | 'done' | 'released'
  checkpoint?: { note: string, at: string } | null
}

export interface CollectResult {
  facts: CollectedFact[]
  needs?: CollectedNeed[]
  work?: CollectedWork[]
}

export interface Collector {
  kind: CollectorKind
  label: string
  docsUrl: string
  envVars: { name: string, required: boolean, description: string }[]
  configured(): boolean
  collect(ctx: CollectContext): Promise<CollectResult>
  test(signal: AbortSignal): Promise<{ ok: boolean, message: string }>
}

export class CollectorError extends Error {
  constructor(public source: CollectorKind, message: string, public status?: number) {
    super(message)
  }
}
