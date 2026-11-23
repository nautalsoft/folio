<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()
const { data, error } = await useFetch<{ id: string, day: string, source: string, kind: string, status: string, title: string, body: string, label: string, actor: string | null, project: string | null, occurredAt: string }>(() => `/api/facts/${route.params.id}`)
if (error.value) throw createError({ statusCode: 404, statusMessage: t('common.notFound'), fatal: true })
useHead({ title: () => data.value?.title ?? t('fact.title') })
const formatDate = useFormatDate()
</script>

<template>
  <article v-if="data" class="max-w-2xl space-y-5">
    <NuxtLink :to="`/read/${data.day}`" class="text-sm font-semibold text-accent">← {{ t('report.back') }}</NuxtLink>
    <header>
      <p class="text-sm font-semibold uppercase tracking-wide text-accent">{{ sourceTitle(data.source) }} · {{ data.label }}</p>
      <h1 class="font-serif text-3xl mt-1">{{ data.title }}</h1>
      <p class="text-ink-2 mt-1">
        <span class="chip me-2" :data-status="data.status">{{ t(`reader.status.${data.status}`) }}</span>
        <template v-if="data.actor">{{ data.actor }} · </template><template v-if="data.project">{{ data.project }} · </template>{{ formatDate(data.occurredAt) }}
      </p>
    </header>
    <p v-if="data.body" class="font-serif text-lg leading-relaxed whitespace-pre-line break-words">{{ data.body }}</p>
    <p class="text-sm text-ink-2">{{ t('fact.noLink') }}</p>
  </article>
</template>
