import type { SourceKind } from '../../shared/types/folio'

export async function logActivity(entry: { type: string, title: string, agentId?: string | null, source?: SourceKind, detail?: string | null, url?: string | null }) {
  const db = await useDb()
  await db.insert(schema.activity).values({
    type: entry.type,
    title: entry.title.slice(0, 500),
    agentId: entry.agentId ?? null,
    source: entry.source ?? 'agent',
    detail: entry.detail?.slice(0, 2000) ?? null,
    url: entry.url ?? null,
  })
}

export async function ensureAgent(id: string, name?: string, kind?: string) {
  const db = await useDb()
  const set = { ...(name ? { name } : {}), ...(kind ? { kind } : {}) }
  const insert = db.insert(schema.agents).values({ id, name: name || id, kind: kind || 'other' })
  await (Object.keys(set).length ? insert.onConflictDoUpdate({ target: schema.agents.id, set }) : insert.onConflictDoNothing())
}
