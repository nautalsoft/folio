<script setup lang="ts">
import { toast } from '@ui-sdk/vue/toast'
import type { NeedItem } from '~~/shared/types/folio'

const { t } = useI18n()
useHead({ title: () => t('needs.title') })
const showResolved = ref(false)
const { data, refresh } = await useFetch<{ needs: NeedItem[] }>('/api/needs', { query: computed(() => ({ status: showResolved.value ? 'all' : 'open' })) })
const formatDate = useFormatDate()
const relative = useRelativeTime()
const resolution = ref<Record<string, string>>({})
const overdue = (n: NeedItem) => n.status === 'open' && n.deadline && (parseTime(n.deadline)?.getTime() ?? Infinity) < Date.now()

async function act(need: NeedItem, action: 'resolve' | 'reopen') {
  await $fetch(`/api/needs/${need.id}`, { method: 'POST', body: { action, resolution: resolution.value[need.id] || undefined } })
  await refresh()
  refreshNuxtData('needs-count')
  if (action === 'resolve') toast(t('needs.done'), { action: { label: t('needs.undo'), onAction: () => act(need, 'reopen') } })
}
</script>

<template>
  <div class="space-y-10 max-w-3xl">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="display text-5xl sm:text-6xl">{{ t('needs.title') }}</h1>
        <p class="text-ink-2 text-lg mt-4">{{ t('needs.intro') }}</p>
      </div>
      <Toggle v-model:pressed="showResolved" class="btn btn-sm data-pressed:bg-ink data-pressed:text-paper">{{ t('needs.showResolved') }}</Toggle>
    </div>
    <p v-if="!data?.needs.length" class="border-t border-line pt-6 text-ink-2">{{ t('needs.empty') }}</p>
    <ol>
      <li v-for="need in data?.needs" :id="need.id" :key="need.id" class="border-t border-line py-8 space-y-3 scroll-mt-24" :class="need.status === 'resolved' ? 'opacity-70' : ''">
        <div class="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span class="chip" :data-status="need.kind === 'blocker' ? 'blocked' : 'waiting'">{{ t(`needs.kinds.${need.kind}`) }}</span>
          <span v-if="overdue(need)" class="chip" data-status="blocked">{{ t('needs.overdue') }}</span>
          <span v-if="need.status === 'resolved'" class="chip" data-status="done">{{ t('needs.resolved') }}</span>
          <span class="text-ink-2">{{ need.deadline ? t('needs.deadline', { when: formatDate(need.deadline) }) : t('needs.noDeadline') }}</span>
          <span v-if="need.agentName" class="text-ink-2">· {{ t('needs.from', { agent: need.agentName }) }} · {{ relative(need.createdAt) }}</span>
        </div>
        <h2 class="font-serif text-[1.75rem] leading-[1.15] font-normal tracking-tight text-balance">{{ need.title }}</h2>
        <p v-if="need.detail" class="text-ink-2 leading-relaxed">{{ need.detail }}</p>
        <div v-if="need.blocking.length" class="text-sm">
          <span class="font-semibold me-1">{{ t('needs.blocking') }} :</span>
          <ul class="inline">
            <li v-for="b in need.blocking" :key="b" class="inline after:content-['·'] after:mx-1.5 last:after:content-none">{{ b }}</li>
          </ul>
        </div>
        <p v-if="need.resolution" class="text-sm border-s-2 border-done ps-3">{{ need.resolution }}</p>
        <div class="flex flex-wrap items-end gap-2 pt-2">
          <template v-if="need.status === 'open'">
            <Field class="flex-1 min-w-56">
              <FieldLabel class="eyebrow">{{ t('needs.resolution') }}</FieldLabel>
              <Input v-model="resolution[need.id]" class="field-input mt-1" :placeholder="t('needs.resolutionPlaceholder')" />
            </Field>
            <Button class="btn btn-primary" @click="act(need, 'resolve')">{{ t('needs.resolve') }}</Button>
          </template>
          <Button v-else class="btn" @click="act(need, 'reopen')">{{ t('needs.reopen') }}</Button>
          <a v-if="need.sourceUrl" :href="need.sourceUrl" class="btn btn-ghost" target="_blank" rel="noreferrer">{{ t('needs.openSource') }}</a>
        </div>
      </li>
    </ol>
  </div>
</template>
