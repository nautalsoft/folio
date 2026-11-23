<script setup lang="ts">
import type { ActivityEvent } from '~~/shared/types/folio'

const { t } = useI18n()
useHead({ title: () => t('live.title') })
const { data } = await useFetch<{ events: ActivityEvent[] }>('/api/activity')
const events = ref<ActivityEvent[]>([...(data.value?.events ?? [])].reverse())
const state = ref<'connected' | 'reconnecting' | 'paused'>('reconnecting')
const paused = ref(false)
const formatDate = useFormatDate()
const NuxtLink = resolveComponent('NuxtLink')
let source: EventSource | null = null

function connect() {
  source?.close()
  const after = events.value[0]?.id ?? 0
  source = new EventSource(`/api/live?after=${after}`)
  source.onopen = () => (state.value = 'connected')
  source.onerror = () => (state.value = paused.value ? 'paused' : 'reconnecting')
  source.addEventListener('activity', (message) => {
    const event = JSON.parse((message as MessageEvent).data) as ActivityEvent
    if (!events.value.some(e => e.id === event.id)) events.value = [event, ...events.value].slice(0, 300)
  })
}
watch(paused, (p) => {
  if (p) {
    source?.close()
    state.value = 'paused'
  }
  else connect()
})
onMounted(connect)
onBeforeUnmount(() => source?.close())
</script>

<template>
  <div class="space-y-10 max-w-3xl">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="display text-5xl sm:text-6xl">{{ t('live.title') }}</h1>
        <p class="text-ink-2 text-lg mt-4">{{ t('live.intro') }}</p>
      </div>
      <div class="flex items-center gap-3">
        <span class="inline-flex items-center gap-2 text-sm font-medium" role="status">
          <span class="size-2 rounded-full" :class="state === 'connected' ? 'bg-done animate-pulse' : state === 'paused' ? 'bg-ink-2' : 'bg-waiting'" aria-hidden="true" />
          {{ t(`live.${state}`) }}
        </span>
        <Toggle v-model:pressed="paused" class="btn btn-sm">{{ paused ? t('live.resume') : t('live.pause') }}</Toggle>
      </div>
    </div>
    <p v-if="!events.length" class="border-t border-line pt-6 text-ink-2">{{ t('live.empty') }}</p>
    <Timeline v-else :aria-label="t('live.title')" class="border-t border-line pt-8" aria-live="polite">
      <TimelineItem v-for="event in events" :key="event.id" class="relative grid grid-cols-[1.25rem_1fr] gap-x-3 pb-6 last:pb-0">
        <TimelineMarker class="mt-[0.45rem] ms-[0.15rem] size-2 rounded-full bg-ink" />
        <TimelineConnector class="absolute start-[0.37rem] top-5 bottom-0 w-px bg-line" />
        <div class="min-w-0">
          <TimelineTitle class="font-semibold">
            <component :is="event.url ? NuxtLink : 'span'" :to="event.url ?? undefined" :class="event.url ? 'hover:underline' : ''">{{ event.title }}</component>
          </TimelineTitle>
          <TimelineTime :date-time="parseTime(event.at)?.toISOString()" class="text-xs text-ink-2 tabular-nums">{{ formatDate(event.at, { timeStyle: 'medium' }) }} · {{ event.agentName ?? sourceTitle(event.source) }} · {{ event.type }}</TimelineTime>
          <TimelineDescription v-if="event.detail" class="text-sm text-ink-2 mt-0.5">{{ event.detail }}</TimelineDescription>
        </div>
      </TimelineItem>
    </Timeline>
  </div>
</template>
