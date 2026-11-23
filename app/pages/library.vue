<script setup lang="ts">
import { SearchIcon } from '@lucide/vue'
import type { BookSummary } from '~~/shared/types/folio'

const { t } = useI18n()
useHead({ title: () => t('library.title') })
const route = useRoute()
const router = useRouter()
const { data } = await useFetch<{ books: BookSummary[], today: string }>('/api/library')

const tabs = ['all', 'today', 'week', 'favorites', 'collected', 'agents', 'projects'] as const
type Tab = typeof tabs[number]
const tab = ref<Tab>(tabs.includes(route.query.c as Tab) ? route.query.c as Tab : 'all')
watch(tab, c => router.replace({ query: { ...route.query, c: c === 'all' ? undefined : c } }))

const query = ref(String(route.query.q ?? ''))
const books = computed(() => data.value?.books ?? [])
const days = computed(() => books.value.filter(b => b.kind === 'day'))
const weekStart = computed(() => shiftDay(data.value?.today ?? '', -6))
const norm = (v: string) => v.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
const matches = (b: BookSummary) => !query.value.trim() || norm([b.title, b.subtitle, ...b.agents.map(a => a.name), ...b.projects].join(' ')).includes(norm(query.value.trim()))

const byTab = computed<Record<Tab, BookSummary[]>>(() => ({
  all: books.value,
  today: days.value.filter(b => b.day === data.value?.today),
  week: days.value.filter(b => b.day >= weekStart.value),
  favorites: books.value.filter(b => b.favorite),
  collected: books.value.filter(b => b.kind === 'month'),
  agents: days.value,
  projects: days.value,
}))
const visible = computed(() => byTab.value[tab.value].filter(matches))
const groups = computed(() => {
  if (tab.value !== 'agents' && tab.value !== 'projects') return []
  const map = new Map<string, BookSummary[]>()
  for (const book of visible.value) {
    const keys = tab.value === 'agents' ? book.agents.map(a => a.name) : book.projects
    for (const key of keys) map.set(key, [...(map.get(key) ?? []), book])
  }
  return [...map.entries()].sort(([a], [b]) => a.localeCompare(b))
})

const hits = ref<{ slug: string, bookTitle: string, chapterTitle: string, blockId: string, snippet: string }[]>([])
let timer: ReturnType<typeof setTimeout> | undefined
watch(query, (q) => {
  clearTimeout(timer)
  router.replace({ query: { ...route.query, q: q || undefined } })
  if (q.trim().length < 2) {
    hits.value = []
    return
  }
  timer = setTimeout(async () => {
    hits.value = (await $fetch<{ hits: typeof hits.value }>('/api/search', { query: { q } })).hits
  }, 250)
}, { immediate: true })
</script>

<template>
  <div class="space-y-10">
    <div class="flex flex-col sm:flex-row sm:items-end gap-6 justify-between">
      <h1 class="display text-5xl sm:text-6xl">{{ t('library.title') }}</h1>
      <Field class="w-full sm:w-80">
        <FieldLabel class="sr-only">{{ t('library.search') }}</FieldLabel>
        <InputGroup class="relative flex items-center">
          <SearchIcon :size="16" class="absolute start-3 text-ink-2 pointer-events-none" aria-hidden="true" />
          <Input v-model="query" type="search" class="field-input ps-9" :placeholder="t('library.searchPlaceholder')" />
          <InputClear class="absolute end-2 btn btn-ghost btn-sm btn-icon" :aria-label="t('common.close')">×</InputClear>
        </InputGroup>
      </Field>
    </div>

    <Tabs v-model:value="tab">
      <TabsList :aria-label="t('library.collections')" class="-mx-4 px-4 sm:mx-0 sm:px-0">
        <TabsTab v-for="c in tabs" :key="c" :value="c">{{ t(`library.${c}`) }}</TabsTab>
      </TabsList>
      <TabsPanel v-for="c in tabs" :key="c" :value="c" class="pt-10">
        <template v-if="c === tab">
          <div v-if="groups.length" class="space-y-12 [&>section:first-child]:border-t-0 [&>section:first-child]:pt-0">
            <BookShelf v-for="[name, list] in groups" :key="name" :title="name" :books="list" />
          </div>
          <ul v-else-if="visible.length" class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-x-6 sm:gap-x-10 gap-y-12" role="list">
            <li v-for="book in visible" :key="book.slug"><BookCover :book="book" class="w-full" /></li>
          </ul>
          <p v-else class="text-ink-2">{{ t('library.noBooks') }}</p>
        </template>
      </TabsPanel>
    </Tabs>

    <section v-if="query.trim().length >= 2" aria-live="polite" class="space-y-3">
      <h2 class="font-serif text-[1.7rem] leading-tight font-normal tracking-tight">{{ hits.length ? t('library.results', { n: hits.length }, hits.length) : t('library.noResults') }}</h2>
      <ul class="divide-y divide-line border-y border-line" role="list">
        <li v-for="hit in hits" :key="`${hit.slug}-${hit.blockId}`">
          <NuxtLink :to="{ path: `/read/${hit.slug}`, query: { block: hit.blockId, q: query } }" class="block py-4 hover:bg-paper-2">
            <p class="eyebrow">{{ hit.bookTitle }} · {{ hit.chapterTitle }}</p>
            <p class="mt-1.5 font-serif text-lg leading-snug">{{ hit.snippet }}</p>
          </NuxtLink>
        </li>
      </ul>
    </section>
  </div>
</template>
