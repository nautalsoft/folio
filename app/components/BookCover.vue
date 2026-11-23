<script setup lang="ts">
import type { BookSummary } from '~~/shared/types/folio'

const props = withDefaults(defineProps<{ book: BookSummary, size?: 'sm' | 'md' | 'lg' }>(), { size: 'md' })
const { t } = useI18n()
const unread = computed(() => !props.book.progress.lastOpenedAt)
const width = computed(() => ({ sm: 'w-28', md: 'w-36 sm:w-40', lg: 'w-52 sm:w-64 lg:w-72' })[props.size])
</script>

<template>
  <NuxtLink :to="`/read/${book.slug}`" class="group block shrink-0 rounded-[3px]" :class="width">
    <div class="relative aspect-[2/3] overflow-hidden rounded-[3px] shadow-[0_1px_1px_rgb(8_10_20/0.14),0_14px_28px_-16px_rgb(8_10_20/0.5)] ring-1 ring-black/10 dark:ring-white/10 transition-[translate,box-shadow] duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_1px_1px_rgb(8_10_20/0.14),0_22px_34px_-16px_rgb(8_10_20/0.55)] motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
      <img :src="`/covers/${book.slug}.svg?v=${book.version}`" :alt="t('book.cover', { title: book.title })" class="h-full w-full object-cover" loading="lazy" width="600" height="900">
      <div v-if="book.progress.percent > 0 && !book.progress.finished" class="absolute inset-x-0 bottom-0 h-1 bg-black/40" aria-hidden="true">
        <div class="h-full bg-white" :style="{ width: `${book.progress.percent}%` }" />
      </div>
    </div>
    <div class="cover-caption mt-3 space-y-1">
      <p class="font-serif text-[1.08rem] font-medium leading-tight line-clamp-2">{{ book.title }}</p>
      <p class="text-xs text-ink-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <span v-if="unread" class="inline-flex items-center gap-1.5 font-semibold text-accent"><span class="size-1.5 rounded-full bg-accent" aria-hidden="true" />{{ t('book.unread') }}</span>
        <span v-else-if="book.progress.finished">{{ t('book.finished') }}</span>
        <span v-else>{{ t('book.progress', { p: book.progress.percent }) }}</span>
        <span aria-hidden="true">·</span>
        <span>{{ t('book.minutes', { n: book.estimatedMinutes }) }}</span>
        <span v-if="book.incomplete" class="chip" data-status="waiting">{{ t('book.incomplete') }}</span>
      </p>
    </div>
  </NuxtLink>
</template>
