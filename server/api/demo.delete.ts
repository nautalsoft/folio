export default defineEventHandler(async () => {
  const db = await useDb()
  await db.transaction(async (tx) => {
    for (const table of [schema.books, schema.readingState, schema.annotations, schema.facts, schema.reports, schema.sourceRuns, schema.chats, schema.demoSources, schema.activity, schema.checkpoints, schema.workItems, schema.needs, schema.agents, schema.webhookDeliveries] as const) await tx.delete(table)
    await tx.insert(schema.settings).values({ key: 'demo_dismissed', value: true }).onConflictDoNothing()
  })
  return { ok: true }
})
