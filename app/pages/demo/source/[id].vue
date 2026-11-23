<script setup lang="ts">
const { t } = useI18n()
const route = useRoute()
const { data, error } = await useFetch<{ id: string, source: string, title: string, body: string, meta: Record<string, string> }>(() => `/api/demo-sources/${route.params.id}`)
if (error.value) throw createError({ statusCode: 404, statusMessage: t('common.notFound'), fatal: true })
useHead({ title: () => data.value?.title ?? t('demoSource.title'), meta: [{ name: 'robots', content: 'noindex' }] })
</script>

<template>
  <article v-if="data" class="max-w-2xl space-y-5">
    <p class="chip" data-status="waiting">{{ t('demoSource.title') }} · {{ sourceTitle(data.source) }}</p>
    <h1 class="display text-4xl sm:text-5xl">{{ data.title }}</h1>
    <p class="whitespace-pre-line font-serif text-xl leading-relaxed">{{ data.body }}</p>
    <dl class="border-y border-line py-4 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
      <template v-for="(value, key) in data.meta" :key="key">
        <dt class="eyebrow leading-[1.45rem]">{{ key }}</dt>
        <dd>{{ value }}</dd>
      </template>
    </dl>
    <p class="text-sm text-ink-2">{{ t('demoSource.fictional') }}</p>
  </article>
</template>
