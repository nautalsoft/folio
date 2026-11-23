import { eq } from 'drizzle-orm'
import type { CollectorKind, FolioSettings } from '../../shared/types/folio'

export const COLLECTORS: CollectorKind[] = ['board', 'github', 'vercel', 'slack', 'clickup', 'notion']

export const DEFAULT_SETTINGS: FolioSettings = {
  digestTime: process.env.FOLIO_DIGEST_TIME || '18:00',
  timezone: process.env.FOLIO_TIMEZONE || 'Europe/Paris',
  model: process.env.FOLIO_MODEL || 'anthropic/claude-sonnet-5.5',
  reportLanguage: (process.env.FOLIO_REPORT_LANGUAGE as 'fr' | 'en') || 'fr',
  sources: { board: true, github: true, vercel: true, slack: true, clickup: true, notion: true },
  webhooks: [],
}

export async function getSettings(): Promise<FolioSettings> {
  const db = await useDb()
  const [row] = await db.select().from(schema.settings).where(eq(schema.settings.key, 'settings'))
  const stored = (row?.value ?? {}) as Partial<FolioSettings>
  return { ...DEFAULT_SETTINGS, ...stored, sources: { ...DEFAULT_SETTINGS.sources, ...stored.sources } }
}

export async function saveSettings(next: FolioSettings) {
  const db = await useDb()
  // Only what differs from the environment defaults is stored, so changing an env var still takes effect.
  const value = Object.fromEntries(Object.entries(next).filter(([key, v]) => JSON.stringify(v) !== JSON.stringify(DEFAULT_SETTINGS[key as keyof FolioSettings])))
  await db.insert(schema.settings).values({ key: 'settings', value })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value } })
}

export function maskUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.host}/…${u.pathname.length > 1 ? u.pathname.slice(-4) : ''}`
  }
  catch {
    return '…'
  }
}
