<script setup lang="ts">
import { toast } from '@ui-sdk/vue/toast'
import type { BookSummary } from '~~/shared/types/folio'

const { t, locale } = useI18n()
useHead({ title: () => t('home.title') })
const { data, refresh } = await useFetch<{ books: BookSummary[], today: string, digestTime: string }>('/api/library')
const { data: needsData } = await useFetch<{ needs: unknown[] }>('/api/needs', { key: 'needs-home' })

const books = computed(() => data.value?.books ?? [])
const days = computed(() => books.value.filter(b => b.kind === 'day' && b.status === 'published'))
const todayBook = computed(() => days.value.find(b => b.day === data.value?.today) ?? null)
const lastOpened = (b: BookSummary) => parseTime(b.progress.lastOpenedAt)?.getTime() ?? 0
const continuing = computed(() => days.value.filter(b => b.progress.lastOpenedAt && !b.progress.finished && b.slug !== todayBook.value?.slug).sort((a, b) => lastOpened(b) - lastOpened(a)))
const unread = computed(() => days.value.filter(b => !b.progress.lastOpenedAt && b.slug !== todayBook.value?.slug))
const collections = computed(() => books.value.filter(b => b.kind === 'month'))
const openedToday = computed(() => {
  const opened = parseTime(todayBook.value?.progress.lastOpenedAt)
  return Boolean(opened && dayIn(Intl.DateTimeFormat().resolvedOptions().timeZone, opened) === data.value?.today)
})
const needsCount = computed(() => needsData.value?.needs.length ?? 0)

const compiling = ref(false)
async function compileNow() {
  compiling.value = true
  try {
    await $fetch('/api/digest', { method: 'POST', body: {} })
    await refresh()
    toast.success(t('settings.runDone'))
  }
  catch {
    toast.error(t('common.error'))
  }
  finally {
    compiling.value = false
  }
}
</script>

<template>
  <div class="space-y-14">
    <h1 class="sr-only">{{ t('home.title') }}</h1>
    <section :aria-labelledby="'today-title'" class="grid gap-8 md:gap-16 md:grid-cols-[auto_1fr] items-center md:py-6">
      <template v-if="todayBook">
        <BookCover :book="todayBook" size="lg" class="mx-auto md:mx-0 [&_.cover-caption]:hidden" />
        <div class="space-y-7 max-w-xl">
          <div>
            <p id="today-title" class="eyebrow text-accent">{{ t('home.today') }}</p>
            <h2 class="display text-5xl sm:text-6xl lg:text-7xl mt-3">{{ todayBook.title }}</h2>
            <p class="text-ink-2 text-lg mt-4">{{ todayBook.subtitle }}</p>
          </div>
          <Progress :value="todayBook.progress.percent" class="max-w-sm space-y-2">
            <div class="flex justify-between text-sm">
              <ProgressLabel class="font-semibold tabular-nums">{{ t('book.progress', { p: todayBook.progress.percent }) }}</ProgressLabel>
              <span class="text-ink-2">{{ t('book.readTime', { read: formatDuration(todayBook.progress.secondsRead, locale), total: formatDuration(todayBook.estimatedMinutes * 60, locale) }) }}</span>
            </div>
            <ProgressTrack><ProgressIndicator /></ProgressTrack>
          </Progress>
          <div class="flex flex-wrap gap-3">
            <NuxtLink :to="`/read/${todayBook.slug}`" class="btn btn-primary">{{ todayBook.progress.lastOpenedAt ? t('home.continue') : t('home.open') }}</NuxtLink>
            <NuxtLink v-if="needsCount" to="/needs" class="btn">{{ t('home.seeNeeds') }}</NuxtLink>
          </div>
          <p v-if="needsCount" class="text-sm font-medium text-waiting">{{ t('home.needsTeaser', { n: needsCount }, needsCount) }}</p>
        </div>
      </template>
      <div v-else class="md:col-span-2 space-y-4 py-6 max-w-2xl">
        <p id="today-title" class="eyebrow text-accent">{{ t('home.today') }}</p>
        <p class="display text-4xl sm:text-5xl">{{ t('home.todayMissing') }}</p>
        <p class="text-ink-2">{{ t('home.todayAt', { time: data?.digestTime ?? '18:00' }) }}</p>
        <Button class="btn btn-primary" :disabled="compiling" @click="compileNow">{{ compiling ? t('home.compiling') : t('home.compileNow') }}</Button>
      </div>
    </section>

    <section class="flex items-center gap-4 border-t border-line pt-5" aria-labelledby="goal-title">
      <Progress :value="openedToday ? 1 : 0" :max="1" class="relative size-11 shrink-0" :aria-label="t('home.goalText')">
        <svg viewBox="0 0 36 36" class="size-11 -rotate-90" aria-hidden="true">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" class="text-edge" stroke-width="2" />
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" class="text-accent" stroke-width="2.5" stroke-linecap="round" :stroke-dasharray="`${openedToday ? 97.4 : 0} 97.4`" />
        </svg>
        <span class="absolute inset-0 grid place-items-center text-xs font-semibold tabular-nums" aria-hidden="true">{{ openedToday ? '✓' : '0/1' }}</span>
      </Progress>
      <div>
        <h2 id="goal-title" class="font-semibold text-[0.95rem]">{{ t('home.goal') }} · {{ t('home.goalText') }}</h2>
        <p class="text-sm text-ink-2">{{ openedToday ? t('home.goalDone') : t('home.goalTodo') }}</p>
      </div>
    </section>

    <BookShelf :title="t('home.continue')" :books="continuing" />
    <BookShelf :title="t('home.unread')" :books="unread" to="/library" :more-label="t('home.allBooks')" />
    <BookShelf :title="t('library.collected')" :books="collections" to="/library?c=collected" :more-label="t('home.allBooks')" />
    <p v-if="!books.length" class="text-ink-2">{{ t('home.empty') }}</p>
  </div>
</template>
