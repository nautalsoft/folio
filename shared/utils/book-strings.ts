import type { SourceKind } from '../types/folio'

export type ReportLanguage = 'fr' | 'en'

const fr = {
  preface: 'Ouverture',
  needs: 'Besoin de toi',
  pullRequests: 'Pull requests',
  prIntro: (done: number, open: number, failing: number) => [
    done ? `${done} PR fusionnée${done > 1 ? 's' : ''} ou fermée${done > 1 ? 's' : ''}` : '',
    open ? `${open} ouverte${open > 1 ? 's' : ''}` : '',
    failing ? `dont ${failing} en échec (CI ou relecture)` : '',
  ].filter(Boolean).join(', ').replace(/^./, c => c.toUpperCase()) + '.',
  sourcesChapter: 'État des sources',
  sourceTitles: {
    agent: 'Rapports d’agents',
    board: 'Vercel Board',
    github: 'GitHub',
    vercel: 'Déploiements Vercel',
    slack: 'Slack',
    clickup: 'ClickUp',
    notion: 'Notion',
  } as Record<string, string>,
  overview: (agents: number, projects: number, done: number, blocked: number, waiting: number) =>
    `${agents} agent${agents > 1 ? 's' : ''} ${agents > 1 ? 'ont' : 'a'} travaillé aujourd’hui${projects ? ` sur ${projects} projet${projects > 1 ? 's' : ''}` : ''}. ${done} fait${done > 1 ? 's' : ''} terminé${done > 1 ? 's' : ''}, ${blocked} bloqué${blocked > 1 ? 's' : ''}, ${waiting} en attente de toi.`,
  nothing: 'Aucune activité n’a été reçue pour ce jour. Ce livre ne contient que l’état des sources.',
  readFirst: 'À lire d’abord : les décisions et bloqueurs qui t’attendent.',
  notConfigured: (s: string) => `${s} n’est pas configuré : ce livre ne contient aucun fait venant de ${s}.`,
  failed: (s: string, m?: string) => `${s} a échoué pendant la collecte${m ? ` (${m})` : ''}. Les faits de ${s} manquent peut-être dans ce livre.`,
  skipped: (s: string) => `${s} est désactivé dans les réglages.`,
  ok: (s: string, n: number) => `${s} : ${n} élément${n > 1 ? 's' : ''} collecté${n > 1 ? 's' : ''}.`,
  agentIntro: (name: string, n: number, sources: string) => `${name} a laissé ${n} trace${n > 1 ? 's' : ''} aujourd’hui (${sources}).`,
  sourceIntro: (name: string, n: number) => `${n} élément${n > 1 ? 's' : ''} venant de ${name}, sans agent identifié.`,
  needsIntro: (n: number) => n ? `${n} point${n > 1 ? 's' : ''} attend${n > 1 ? 'ent' : ''} une décision ou un déblocage de ta part.` : 'Rien n’attend de décision de ta part.',
  deadline: 'échéance',
  blocking: 'bloque',
  month: 'Recueil',
  monthIntro: (n: number) => `${n} jour${n > 1 ? 's' : ''} de travail réunis en un recueil.`,
  agentsProjects: (a: number, p: number) => `${a} agent${a > 1 ? 's' : ''}${p ? ` · ${p} projet${p > 1 ? 's' : ''}` : ''}`,
  incomplete: 'incomplet',
}

const en: typeof fr = {
  preface: 'Opening',
  needs: 'Needs you',
  pullRequests: 'Pull requests',
  prIntro: (done, open, failing) => [
    done ? `${done} PR merged or closed` : '',
    open ? `${open} open` : '',
    failing ? `${failing} of them failing (CI or review)` : '',
  ].filter(Boolean).join(', ').replace(/^./, c => c.toUpperCase()) + '.',
  sourcesChapter: 'Source status',
  sourceTitles: {
    agent: 'Agent reports',
    board: 'Vercel Board',
    github: 'GitHub',
    vercel: 'Vercel deployments',
    slack: 'Slack',
    clickup: 'ClickUp',
    notion: 'Notion',
  },
  overview: (agents, projects, done, blocked, waiting) =>
    `${agents} agent${agents > 1 ? 's' : ''} worked today${projects ? ` across ${projects} project${projects > 1 ? 's' : ''}` : ''}. ${done} done, ${blocked} blocked, ${waiting} waiting on you.`,
  nothing: 'No activity was received for this day. This book only contains the source status.',
  readFirst: 'Read first: the decisions and blockers waiting on you.',
  notConfigured: s => `${s} is not configured: this book has no facts from ${s}.`,
  failed: (s, m) => `${s} failed during collection${m ? ` (${m})` : ''}. Facts from ${s} may be missing from this book.`,
  skipped: s => `${s} is turned off in settings.`,
  ok: (s, n) => `${s}: ${n} item${n > 1 ? 's' : ''} collected.`,
  agentIntro: (name, n, sources) => `${name} left ${n} trace${n > 1 ? 's' : ''} today (${sources}).`,
  sourceIntro: (name, n) => `${n} item${n > 1 ? 's' : ''} from ${name}, with no identified agent.`,
  needsIntro: n => n ? `${n} item${n > 1 ? 's' : ''} need${n > 1 ? '' : 's'} a decision or an unblock from you.` : 'Nothing is waiting on a decision from you.',
  deadline: 'deadline',
  blocking: 'blocks',
  month: 'Collection',
  monthIntro: n => `${n} working day${n > 1 ? 's' : ''} gathered in one collection.`,
  agentsProjects: (a, p) => `${a} agent${a > 1 ? 's' : ''}${p ? ` · ${p} project${p > 1 ? 's' : ''}` : ''}`,
  incomplete: 'incomplete',
}

export const bookStrings = (lang: ReportLanguage) => (lang === 'en' ? en : fr)

export function sourceTitle(source: SourceKind, lang: ReportLanguage = 'fr'): string {
  const known = bookStrings(lang).sourceTitles[source]
  if (known) return known
  return source.split(/[-_\s]+/).filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || source
}

export const sourceSlug = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

const PR_WORDS: Record<ReportLanguage, Record<string, string>> = {
  fr: { 'state open': 'ouverte', 'state draft': 'brouillon', 'state merged': 'fusionnée', 'state closed': 'fermée', 'CI success': 'CI réussie', 'CI failure': 'CI en échec', 'CI pending': 'CI en cours', 'CI none': 'sans CI', 'review none': 'aucune revue', 'review approved': 'approuvée', 'review changes_requested': 'modifications demandées', 'review requested': 'revue demandée', 'review commented': 'commentée' },
  en: { 'state open': 'open', 'state draft': 'draft', 'state merged': 'merged', 'state closed': 'closed', 'CI success': 'CI passing', 'CI failure': 'CI failing', 'CI pending': 'CI running', 'CI none': 'no CI', 'review none': 'no review', 'review approved': 'approved', 'review changes_requested': 'changes requested', 'review requested': 'review requested', 'review commented': 'commented' },
}

export function formatPrState(body: string, lang: ReportLanguage) {
  return body.split(' · ').map(part => PR_WORDS[lang][part] ?? part).join(' · ')
}

export function formatDayTitle(day: string, lang: ReportLanguage) {
  const date = new Date(`${day}T12:00:00Z`)
  const text = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(date)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function formatMonthTitle(month: string, lang: ReportLanguage) {
  const date = new Date(`${month}-15T12:00:00Z`)
  const text = new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(date)
  return text.charAt(0).toUpperCase() + text.slice(1)
}
