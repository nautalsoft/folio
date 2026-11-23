<script setup lang="ts">
import { toast } from '@ui-sdk/vue/toast'
import type { WorkItem } from '~~/shared/types/folio'

const { t } = useI18n()
useHead({ title: () => t('work.title') })
const { data, refresh } = await useFetch<{ items: WorkItem[] }>('/api/work')
const relative = useRelativeTime()
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => (timer = setInterval(refresh, 15_000)))
onBeforeUnmount(() => clearInterval(timer))

async function release(item: WorkItem) {
  await $fetch(`/api/work/${item.id}/release`, { method: 'POST' })
  await refresh()
  toast(t('work.released'), {
    action: {
      label: t('work.undo'),
      onAction: async () => {
        await $fetch(`/api/work/${item.id}/undo`, { method: 'POST' })
        await refresh()
        toast(t('work.restored'))
      },
    },
  })
}

const resumeItem = ref<WorkItem | null>(null)
const resumeOpen = computed({ get: () => Boolean(resumeItem.value), set: (v) => { if (!v) resumeItem.value = null } })
const resumePrompt = computed(() => {
  const item = resumeItem.value
  if (!item) return ''
  const last = item.checkpoints[0]
  return [
    `Reprends la tâche « ${item.title} »${item.project ? ` (projet ${item.project})` : ''}.`,
    item.claimedByName ? `Elle était tenue par ${item.claimedByName}, qui s’est arrêté.` : '',
    last ? `Dernier point d’étape${last.step ? ` (${last.step})` : ''} : ${last.note}` : 'Aucun point d’étape enregistré : repars de la description.',
    last?.resumeHint ? `Consigne de reprise : ${last.resumeHint}` : '',
    item.checkpoints.length > 1 ? `Étapes déjà faites :\n${item.checkpoints.slice(1).reverse().map(c => `- ${c.note}`).join('\n')}` : '',
    item.sourceUrl ? `Source : ${item.sourceUrl}` : '',
    `Avant de commencer, réclame-la dans Folio (POST /api/ingest/work, action "claim", task.key = "${item.id}", force: true).`,
  ].filter(Boolean).join('\n')
})
async function copyResume() {
  await navigator.clipboard.writeText(resumePrompt.value)
  toast(t('reader.copied'))
}
</script>

<template>
  <div class="space-y-10 max-w-5xl">
    <div>
      <h1 class="display text-5xl sm:text-6xl">{{ t('work.title') }}</h1>
      <p class="text-ink-2 text-lg mt-4 max-w-2xl">{{ t('work.intro', { n: 30 }) }}</p>
    </div>
    <p v-if="!data?.items.length" class="border-t border-line pt-6 text-ink-2">{{ t('work.empty') }}</p>
    <ul class="grid gap-x-14 md:grid-cols-2">
      <li v-for="item in data?.items" :key="item.id" class="border-t border-line py-7 space-y-3">
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="eyebrow">{{ item.project }} · {{ sourceTitle(item.source) }}</p>
            <h2 class="font-serif text-2xl leading-tight font-normal tracking-tight mt-1.5">{{ item.title }}</h2>
          </div>
          <span v-if="item.status !== 'claimed'" class="chip" data-status="info">{{ t('work.free') }}</span>
          <span v-else-if="item.stale" class="chip" data-status="blocked">{{ t('work.stale') }}</span>
          <span v-else class="chip" data-status="done">{{ item.claimedByName }}</span>
        </div>
        <p v-if="item.status === 'claimed'" class="text-sm">
          {{ t('work.claimedBy', { agent: item.claimedByName, since: relative(item.claimedAt) }) }} · {{ t('work.lastSeen', { when: relative(item.heartbeatAt) }) }}
        </p>
        <p v-else-if="item.previousClaim" class="text-sm text-ink-2">{{ t('work.previous', { agent: item.previousClaim.agentId }) }}</p>
        <Collapsible v-if="item.checkpoints.length">
          <div class="text-sm border-s-2 border-edge ps-3">
            <p class="font-semibold">{{ t('work.lastCheckpoint') }} <span class="font-normal text-ink-2">· {{ relative(item.checkpoints[0]!.createdAt) }}</span></p>
            <p>{{ item.checkpoints[0]!.note }}</p>
          </div>
          <CollapsibleTrigger v-if="item.checkpoints.length > 1" class="mt-2 text-sm font-medium text-accent underline underline-offset-4 decoration-1 cursor-pointer">{{ t('work.checkpoints') }} ({{ item.checkpoints.length }})</CollapsibleTrigger>
          <CollapsiblePanel>
            <ol class="mt-2 space-y-1 text-sm text-ink-2">
              <li v-for="c in item.checkpoints.slice(1)" :key="c.id">{{ c.step ? `${c.step} · ` : '' }}{{ c.note }} · {{ relative(c.createdAt) }}</li>
            </ol>
          </CollapsiblePanel>
        </Collapsible>
        <p v-else class="text-sm text-ink-2">{{ t('work.noCheckpoint') }}</p>
        <div class="flex flex-wrap gap-2 pt-1">
          <Button v-if="item.stale || (item.status !== 'claimed' && item.checkpoints.length)" class="btn btn-primary btn-sm" @click="resumeItem = item">{{ t('work.resume') }}</Button>
          <Button v-if="item.status === 'claimed'" class="btn btn-sm" :data-agent-confirm="t('work.releaseConfirm')" @click="release(item)">{{ t('work.release') }}</Button>
          <a v-if="item.sourceUrl" :href="item.sourceUrl" target="_blank" rel="noreferrer" class="btn btn-ghost btn-sm">{{ t('work.open') }}</a>
        </div>
      </li>
    </ul>

    <Dialog v-model:open="resumeOpen">
      <DialogBackdrop class="fixed inset-0" />
      <DialogContent class="popup-surface w-[min(36rem,calc(100vw-2rem))] p-6 space-y-4">
        <DialogTitle class="font-serif text-2xl leading-tight font-medium">{{ t('work.resumeTitle', { title: resumeItem?.title }) }}</DialogTitle>
        <DialogDescription class="text-ink-2">{{ t('work.resumeIntro') }}</DialogDescription>
        <pre class="whitespace-pre-wrap font-mono text-sm bg-paper rounded p-3 max-h-80 overflow-auto">{{ resumePrompt }}</pre>
        <div class="flex justify-end gap-2">
          <DialogClose class="btn">{{ t('common.close') }}</DialogClose>
          <Button class="btn btn-primary" @click="copyResume">{{ t('work.copyResume') }}</Button>
        </div>
      </DialogContent>
    </Dialog>
  </div>
</template>
