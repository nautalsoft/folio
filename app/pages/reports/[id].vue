<script setup lang="ts">
import type { ReportItem } from '~~/server/db/schema'

const { t } = useI18n()
const route = useRoute()
const { data, error } = await useFetch<{ id: string, title: string, summary: string, project: string | null, day: string, agentName: string, items: ReportItem[], createdAt: string }>(() => `/api/reports/${route.params.id}`)
if (error.value) throw createError({ statusCode: 404, statusMessage: t('common.notFound'), fatal: true })
useHead({ title: () => data.value?.title ?? t('report.title') })
const formatDate = useFormatDate()
</script>

<template>
  <article v-if="data" class="max-w-2xl space-y-5">
    <NuxtLink :to="`/read/${data.day}`" class="text-sm font-medium text-ink-2 hover:text-ink">← {{ t('report.back') }}</NuxtLink>
    <header>
      <p class="eyebrow text-accent">{{ t('report.title') }}</p>
      <h1 class="display text-4xl sm:text-5xl mt-3">{{ data.title }}</h1>
      <p class="text-ink-2 mt-4">{{ t('report.by', { agent: data.agentName }) }}<template v-if="data.project"> · {{ data.project }}</template> · {{ formatDate(data.createdAt) }}</p>
    </header>
    <p v-if="data.summary" class="font-serif text-xl leading-relaxed whitespace-pre-line">{{ data.summary }}</p>
    <section v-if="data.items.length" class="space-y-3">
      <h2 class="eyebrow">{{ t('report.items') }}</h2>
      <ul class="divide-y divide-line border-y border-line">
        <li v-for="(item, i) in data.items" :key="i" class="py-4 space-y-2">
          <p><span v-if="item.status" class="chip me-2" :data-status="item.status">{{ t(`reader.status.${item.status}`) }}</span>{{ item.text }}</p>
          <a v-if="item.url" :href="item.url" class="text-sm text-accent underline" target="_blank" rel="noreferrer">{{ item.label || item.url }}</a>
          <pre v-if="item.code" class="font-mono text-sm bg-paper-2 rounded p-3 overflow-auto"><code>{{ item.code.code }}</code></pre>
          <pre v-if="item.diff" class="font-mono text-sm bg-paper-2 rounded p-3 overflow-auto"><code>{{ item.diff.file }}&#10;{{ item.diff.patch }}</code></pre>
          <ol v-if="item.steps" class="text-sm space-y-1">
            <li v-for="(s, j) in item.steps" :key="j">{{ s.label }} <span class="text-ink-2">({{ t(`reader.trace.${s.status}`) }})</span></li>
          </ol>
        </li>
      </ul>
    </section>
  </article>
</template>
