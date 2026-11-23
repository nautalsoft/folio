import { count, eq } from 'drizzle-orm'
import type { CollectorKind, WorkStatus } from '../../shared/types/folio'
import { dayIn, shiftDay, zonedToUtc } from '../../shared/utils/time'
import type { ReportItem } from '../db/schema'
import { hashId } from '../utils/ids'
import { compileDay } from './compile'

// Every name, project, link and message below is fictional. Links point to /demo/source/<id>,
// a page of this instance that shows the fictional record, never to a real service.

const AGENTS = [
  { id: 'atlas', name: 'Atlas', kind: 'claude-code' },
  { id: 'brindille', name: 'Brindille', kind: 'codex' },
  { id: 'cobalt', name: 'Cobalt', kind: 't3code' },
  { id: 'dune', name: 'Dune', kind: 'grok' },
  { id: 'ecume', name: 'Écume', kind: 'cloud' },
] as const

const PROJECTS = ['Herbier', 'Phare', 'Marelle'] as const

function rng(seed: string) {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return ((h ^= h >>> 16) >>> 0) / 4294967296
  }
}

const pick = <T>(r: () => number, list: readonly T[]) => list[Math.floor(r() * list.length)]!

interface ReportTemplate {
  agent: typeof AGENTS[number]['id']
  project: typeof PROJECTS[number]
  title: string
  summary: string
  items: ReportItem[]
}

const REPORTS: ReportTemplate[] = [
  {
    agent: 'atlas',
    project: 'Herbier',
    title: 'Recherche plein texte des fiches plantes',
    summary: 'J’ai remplacé le filtre par préfixe par une recherche plein texte sur le nom latin, le nom commun et les notes de culture. Les tests passent ; l’index est créé par une migration réversible.',
    items: [
      { text: 'Migration 0042 : index GIN sur les fiches, réversible', status: 'done', label: 'PR #128 — recherche plein texte' },
      { text: 'Tests de recherche : 14 nouveaux cas, dont les accents et les noms latins', status: 'done', code: { lang: 'ts', code: 'it(\'trouve « érable » sans accent\', async () => {\n  const results = await search(\'erable\')\n  expect(results.map(r => r.slug)).toContain(\'acer-campestre\')\n})' } },
      { text: 'Choisir la langue de l’index : français seul ou français + latin', status: 'waiting' },
    ],
  },
  {
    agent: 'atlas',
    project: 'Phare',
    title: 'Limiter le débit de l’API publique',
    summary: 'Ajout d’une limite de 60 requêtes par minute et par clé, avec un en-tête Retry-After. Le tableau de bord affiche désormais les clés qui atteignent la limite.',
    items: [
      { text: 'Middleware de limite de débit par clé', status: 'done', diff: { file: 'server/middleware/rate-limit.ts', patch: '@@ -1,6 +1,14 @@\n-export default defineEventHandler(() => {})\n+export default defineEventHandler(async (event) => {\n+  const key = getHeader(event, \'x-api-key\')\n+  if (!key) return\n+  const { allowed, retryAfter } = await bucket.take(key)\n+  if (!allowed) {\n+    setHeader(event, \'retry-after\', retryAfter)\n+    throw createError({ statusCode: 429 })\n+  }\n+})' } },
      { text: 'Documenter la limite dans la référence de l’API', status: 'done' },
    ],
  },
  {
    agent: 'brindille',
    project: 'Marelle',
    title: 'Corriger le crash au lancement sur tablette',
    summary: 'Le crash venait d’une image de fond chargée avant que la taille de l’écran soit connue. Le correctif attend la première mesure. Reste à valider sur un appareil réel.',
    items: [
      { text: 'Reproduit dans le simulateur en orientation paysage', status: 'done', steps: [{ label: 'Lancer le simulateur tablette', status: 'done' }, { label: 'Ouvrir l’app en paysage', status: 'done' }, { label: 'Observer le crash au premier rendu', status: 'error', detail: 'TypeError: cannot read width of undefined' }, { label: 'Appliquer le correctif et relancer', status: 'done' }] },
      { text: 'Correctif : attendre la première mesure de l’écran', status: 'done', label: 'PR #57 — crash tablette' },
      { text: 'Validation sur appareil réel', status: 'blocked' },
    ],
  },
  {
    agent: 'brindille',
    project: 'Herbier',
    title: 'Export CSV des inventaires',
    summary: 'L’export CSV respecte maintenant le séparateur choisi et échappe les guillemets. Un fichier d’exemple est joint à la PR.',
    items: [
      { text: 'Échappement des guillemets et des retours à la ligne', status: 'done', code: { lang: 'ts', code: 'const cell = (v: string) => /[";\\n]/.test(v) ? `"${v.replaceAll(\'"\', \'""\')}"` : v' } },
      { text: 'Option de séparateur ; ou , dans les réglages', status: 'done' },
    ],
  },
  {
    agent: 'cobalt',
    project: 'Phare',
    title: 'Migration vers le nouveau client de base de données',
    summary: 'Trois modules sur cinq utilisent le nouveau client. Les deux restants dépendent d’une décision sur le pool de connexions.',
    items: [
      { text: 'Modules comptes, clés et journaux migrés', status: 'done' },
      { text: 'Taille du pool en production : 10 ou 20 connexions ?', status: 'waiting' },
      { text: 'Module facturation : en attente de la décision sur le pool', status: 'blocked' },
    ],
  },
  {
    agent: 'cobalt',
    project: 'Marelle',
    title: 'Accessibilité des niveaux',
    summary: 'Chaque case du plateau a maintenant un nom lisible par un lecteur d’écran et le jeu se joue entièrement au clavier.',
    items: [
      { text: 'Noms accessibles sur les 48 cases', status: 'done' },
      { text: 'Navigation au clavier testée avec un lecteur d’écran', status: 'done' },
    ],
  },
  {
    agent: 'dune',
    project: 'Herbier',
    title: 'Tri des tickets de la semaine',
    summary: 'Douze tickets triés : quatre doublons fermés, cinq étiquetés « bon premier ticket », trois remontés en priorité haute.',
    items: [
      { text: 'Quatre doublons fermés avec un lien vers le ticket d’origine', status: 'done' },
      { text: 'Trois tickets passés en priorité haute : à confirmer', status: 'waiting' },
    ],
  },
  {
    agent: 'dune',
    project: 'Phare',
    title: 'Veille sur les dépendances',
    summary: 'Deux dépendances ont une mise à jour de sécurité. La première est appliquée ; la seconde change une API et demande une revue.',
    items: [
      { text: 'Mise à jour de sécurité appliquée sur le parseur YAML', status: 'done' },
      { text: 'Mise à jour du client HTTP : changement d’API, revue nécessaire', status: 'waiting' },
    ],
  },
  {
    agent: 'ecume',
    project: 'Phare',
    title: 'Préparation de la mise en production',
    summary: 'La préproduction est verte. La mise en production attend le feu vert pour la fenêtre de jeudi.',
    items: [
      { text: 'Suite de bout en bout en préproduction : 212 tests verts', status: 'done', steps: [{ label: 'Construire l’image', status: 'done' }, { label: 'Déployer en préproduction', status: 'done' }, { label: 'Lancer la suite de bout en bout', status: 'done', detail: '212 passés, 0 échec' }, { label: 'Attendre le feu vert', status: 'running' }] },
      { text: 'Feu vert pour la mise en production', status: 'waiting' },
    ],
  },
  {
    agent: 'ecume',
    project: 'Marelle',
    title: 'Nettoyage des environnements de prévisualisation',
    summary: 'Quarante environnements de prévisualisation inactifs depuis plus de quinze jours ont été supprimés.',
    items: [{ text: '40 environnements supprimés, 6 conservés car liés à une PR ouverte', status: 'done' }],
  },
]

interface FactTemplate {
  source: CollectorKind
  kind: string
  status: WorkStatus
  title: string
  body: string
  label: string
  actor: string | null
  agent: string | null
  project: string
}

const FACTS: FactTemplate[] = [
  { source: 'github', kind: 'pull_request', status: 'done', title: 'PR #128 fusionnée : recherche plein texte', body: 'Relue et fusionnée dans main.', label: 'herbier#128', actor: 'atlas-bot', agent: 'atlas', project: 'Herbier' },
  { source: 'github', kind: 'pull_request', status: 'info', title: 'PR #57 ouverte : crash tablette au lancement', body: 'En attente de relecture.', label: 'marelle#57', actor: 'brindille-bot', agent: 'brindille', project: 'Marelle' },
  { source: 'github', kind: 'issue', status: 'info', title: 'Ticket #301 : la carte ne se centre pas sur la parcelle', body: 'Ouvert par une personne de l’équipe.', label: 'herbier#301', actor: 'camille', agent: null, project: 'Herbier' },
  { source: 'github', kind: 'commit', status: 'done', title: '3 commits sur main : documentation de la limite de débit', body: '', label: 'phare@main', actor: 'atlas-bot', agent: 'atlas', project: 'Phare' },
  { source: 'vercel', kind: 'deployment', status: 'done', title: 'Déploiement de production prêt : phare-api', body: 'Construit en 48 s.', label: 'phare-api · production', actor: 'ecume', agent: 'ecume', project: 'Phare' },
  { source: 'vercel', kind: 'deployment', status: 'blocked', title: 'Échec du déploiement de prévisualisation : marelle-web', body: 'Erreur de build : module « canvas-size » introuvable.', label: 'marelle-web · preview', actor: 'brindille', agent: null, project: 'Marelle' },
  { source: 'slack', kind: 'message', status: 'info', title: '#produit : retour des testeurs sur la recherche', body: 'Les testeurs trouvent les noms latins sans accents, mais pas les synonymes.', label: '#produit', actor: 'noemie', agent: null, project: 'Herbier' },
  { source: 'slack', kind: 'message', status: 'info', title: '#ops : fenêtre de mise en production confirmée pour jeudi 14 h', body: '', label: '#ops', actor: 'sacha', agent: null, project: 'Phare' },
  { source: 'board', kind: 'thread', status: 'done', title: 'Tâche « Index de recherche » terminée par Atlas', body: 'Réclamée à 9 h 12, terminée à 15 h 40.', label: 'board · herbier/taches', actor: 'atlas', agent: 'atlas', project: 'Herbier' },
  { source: 'board', kind: 'thread', status: 'blocked', title: 'Tâche « Pool de connexions » bloquée', body: 'Cobalt attend une décision humaine.', label: 'board · phare/taches', actor: 'cobalt', agent: 'cobalt', project: 'Phare' },
  { source: 'clickup', kind: 'task', status: 'done', title: 'Tâche « Export CSV » passée à Terminé', body: '', label: 'ClickUp · Inventaires', actor: 'brindille', agent: 'brindille', project: 'Herbier' },
  { source: 'clickup', kind: 'task', status: 'info', title: 'Tâche « Maquettes des niveaux 7 à 9 » mise à jour', body: 'Nouvelle échéance : vendredi.', label: 'ClickUp · Niveaux', actor: 'jules', agent: null, project: 'Marelle' },
  { source: 'notion', kind: 'page', status: 'info', title: 'Page « Décisions d’architecture » modifiée', body: 'Ajout d’une section sur le pool de connexions.', label: 'Notion · Phare', actor: 'cobalt', agent: 'cobalt', project: 'Phare' },
  { source: 'notion', kind: 'page', status: 'info', title: 'Page « Notes de version 2.4 » créée', body: '', label: 'Notion · Herbier', actor: 'atlas', agent: 'atlas', project: 'Herbier' },
]

const NEEDS = [
  { kind: 'decision', title: 'Taille du pool de connexions en production', detail: 'Cobalt propose 20 connexions ; la base en accepte 100 au total pour trois services.', agent: 'cobalt', blocking: ['Migration du module facturation', 'Mise en production de jeudi'], deadlineDays: 1 },
  { kind: 'review', title: 'Relire la PR #57 (crash tablette)', detail: 'Correctif prêt, validé dans le simulateur.', agent: 'brindille', blocking: ['Publication 1.8 de Marelle'], deadlineDays: 2 },
  { kind: 'blocker', title: 'Accès à une tablette réelle pour valider le correctif', detail: 'Le simulateur ne reproduit pas le capteur d’orientation.', agent: 'brindille', blocking: [], deadlineDays: 3 },
  { kind: 'decision', title: 'Feu vert pour la mise en production de jeudi', detail: 'Préproduction verte, 212 tests passés.', agent: 'ecume', blocking: ['Annonce aux clients'], deadlineDays: 2 },
] as const

export async function seedDemoIfEmpty() {
  const db = await useDb()
  const [{ value: books } = { value: 0 }] = await db.select({ value: count() }).from(schema.books)
  const [{ value: agents } = { value: 0 }] = await db.select({ value: count() }).from(schema.agents)
  if (books > 0 || agents > 0) return
  const [dismissed] = await db.select().from(schema.settings).where(eq(schema.settings.key, 'demo_dismissed'))
  if (dismissed) return
  await seedDemo()
}

export async function seedDemo() {
  const db = await useDb()
  const settings = await getSettings()
  const today = dayIn(settings.timezone)
  const days = Array.from({ length: 12 }, (_, i) => shiftDay(today, i - 11))

  for (const agent of AGENTS) await ensureAgent(agent.id, agent.name, agent.kind)

  for (const [index, day] of days.entries()) {
    const r = rng(`folio-demo-${index}`)
    const dayStart = zonedToUtc(day, '00:00', settings.timezone).getTime()
    const at = (hour: number, minute: number) => {
      const real = zonedToUtc(day, `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`, settings.timezone).getTime()
      if (day !== today) return new Date(real).toISOString()
      // Today's demo events are squeezed into the hours that already passed, so nothing happens "in the future".
      const elapsed = Math.max(60_000, Date.now() - dayStart - 60_000)
      return new Date(dayStart + elapsed * Math.min(1, Math.max(0, (real - dayStart) / 86_400_000))).toISOString()
    }
    const reports = REPORTS.filter(() => r() < 0.55)
    if (!reports.length) reports.push(pick(r, REPORTS))
    for (const [i, report] of reports.entries()) {
      const id = hashId('r', 'demo', day, String(i))
      const items = report.items.map((item) => {
        if (!item.label) return item
        const sourceId = hashId('demo', day, item.label)
        return { ...item, url: `/demo/source/${sourceId}` }
      })
      for (const item of items.filter(i => i.url)) {
        await db.insert(schema.demoSources).values({ id: item.url!.split('/').pop()!, source: 'github', title: item.label!, body: `${item.text}\n\nEnregistrement fictif généré pour la démonstration de Folio.`, meta: { projet: report.project, agent: report.agent } }).onConflictDoNothing()
      }
      await db.insert(schema.reports).values({ id, agentId: report.agent, day, project: report.project, title: report.title, summary: report.summary, status: items.some(i => i.status === 'blocked') ? 'blocked' : 'done', items, externalKey: id, createdAt: at(9 + i * 2, Math.floor(r() * 59)) })
    }
    const facts = FACTS.filter(() => r() < 0.6)
    for (const [i, fact] of facts.entries()) {
      const id = hashId('f', 'demo', day, String(i), fact.title)
      const sourceId = hashId('demo', id)
      await db.insert(schema.demoSources).values({ id: sourceId, source: fact.source, title: fact.title, body: `${fact.body || fact.title}\n\nEnregistrement fictif généré pour la démonstration de Folio.`, meta: { source: fact.source, projet: fact.project, auteur: fact.actor ?? '—' } })
      await db.insert(schema.facts).values({ id, day, source: fact.source, externalId: id, kind: fact.kind, status: fact.status, title: fact.title, body: fact.body, url: `/demo/source/${sourceId}`, label: fact.label, agentId: fact.agent, actor: fact.actor, project: fact.project, occurredAt: at(8 + Math.floor(r() * 10), Math.floor(r() * 59)) })
    }
    const failing = index === days.length - 3 ? 'slack' : null
    for (const source of ['board', 'github', 'vercel', 'slack', 'clickup', 'notion'] as const) {
      const n = facts.filter(f => f.source === source).length
      await db.insert(schema.sourceRuns).values(source === failing
        ? { day, source, status: 'error', count: 0, message: 'Slack API: ratelimited (HTTP 429) — démo', finishedAt: at(18, 0) }
        : { day, source, status: 'ok', count: n, finishedAt: at(18, 0) })
    }
    if (index === days.length - 1) {
      for (const [i, need] of NEEDS.entries()) {
        await db.insert(schema.needs).values({ id: hashId('n', 'demo', day, String(i)), day, kind: need.kind, title: need.title, detail: need.detail, agentId: need.agent, source: 'agent', deadline: zonedToUtc(shiftDay(day, need.deadlineDays), '12:00', settings.timezone).toISOString(), blocking: [...need.blocking], externalKey: `demo-${day}-${i}`, notifiedAt: at(18, 0), createdAt: at(10 + i, 15) }).onConflictDoNothing()
      }
    }
    if (index === days.length - 2) {
      await db.insert(schema.needs).values({ id: hashId('n', 'demo', day, 'resolved'), day, kind: 'decision', title: 'Nom de la nouvelle offre', detail: 'Deux propositions de Dune.', agentId: 'dune', source: 'agent', blocking: [], externalKey: `demo-${day}-resolved`, status: 'resolved', resolution: 'On garde « Phare Pro ».', resolvedAt: at(17, 30), notifiedAt: at(18, 0), createdAt: at(11, 0) })
    }
    await compileDay(day, { baseUrl: '', useModel: false, publish: true })
  }

  const now = Date.now()
  const iso = (minutesAgo: number) => new Date(now - minutesAgo * 60_000).toISOString()
  const work = [
    { id: 'w_demo_search', title: 'Synonymes dans la recherche', project: 'Herbier', agent: 'atlas', claimedMin: 95, beatMin: 3, notes: ['Table des synonymes créée', 'Indexation des synonymes en cours (2 400 / 6 100 fiches)'] },
    { id: 'w_demo_pool', title: 'Pool de connexions du module facturation', project: 'Phare', agent: 'cobalt', claimedMin: 300, beatMin: 140, notes: ['Mesure de la charge actuelle : 34 connexions au pic', 'Arrêt : en attente de la décision sur la taille du pool'] },
    { id: 'w_demo_tablet', title: 'Valider le correctif tablette', project: 'Marelle', agent: 'brindille', claimedMin: 60, beatMin: 8, notes: ['Build de test signé'] },
    { id: 'w_demo_levels', title: 'Niveaux 7 à 9', project: 'Marelle', agent: null, claimedMin: 0, beatMin: 0, notes: [] },
  ]
  for (const item of work) {
    await db.insert(schema.workItems).values({ id: item.id, title: item.title, project: item.project, source: 'board', sourceUrl: null, status: item.agent ? 'claimed' : 'open', claimedBy: item.agent, claimedAt: item.agent ? iso(item.claimedMin) : null, heartbeatAt: item.agent ? iso(item.beatMin) : null })
    for (const [i, note] of item.notes.entries()) {
      await db.insert(schema.checkpoints).values({ id: hashId('k', item.id, String(i)), workItemId: item.id, agentId: item.agent, note, step: `${i + 1}/${item.notes.length + 1}`, resumeHint: i === item.notes.length - 1 ? 'Reprendre à l’étape suivante en relisant la note ci-dessus.' : null, createdAt: iso(item.claimedMin - (i + 1) * 20) })
    }
  }
  const events = [
    { type: 'claim', agent: 'atlas', title: 'Atlas a réclamé « Synonymes dans la recherche »', min: 95 },
    { type: 'checkpoint', agent: 'atlas', title: 'Atlas : indexation des synonymes en cours', min: 40 },
    { type: 'report', agent: 'brindille', title: 'Brindille a poussé un compte-rendu : crash tablette', min: 25 },
    { type: 'deploy', agent: 'ecume', title: 'Écume : préproduction déployée', min: 12 },
    { type: 'heartbeat', agent: 'atlas', title: 'Atlas est toujours sur « Synonymes dans la recherche »', min: 3 },
  ]
  for (const event of events) await db.insert(schema.activity).values({ type: event.type, agentId: event.agent, source: 'agent', title: event.title, at: iso(event.min) })
  await saveSettings({ ...settings })
}
