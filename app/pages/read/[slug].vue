<script setup lang="ts">
import { announce } from '@ui-sdk/core'
import { toast } from '@ui-sdk/vue/toast'
import { useShortcut } from '@ui-sdk/vue/shortcuts'
import { SearchIcon, ArrowLeftIcon, ListIcon, BookmarkIcon, MessageCircleQuestionIcon, ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon, HighlighterIcon, StickyNoteIcon, CopyIcon } from '@lucide/vue'
import type { Annotation, BookContent, BookSummary, ReadingLocation } from '~~/shared/types/folio'
import { blockText, WORDS_PER_MINUTE } from '~~/shared/utils/reading'

definePageMeta({ layout: 'reader' })

interface BookPayload { summary: BookSummary, content: BookContent, writer: string, edited: boolean, language: string, location: ReadingLocation | null, annotations: Annotation[] }

const { t, locale } = useI18n()
const route = useRoute()
const slug = computed(() => String(route.params.slug))
const { data, error, refresh } = await useFetch<BookPayload>(() => `/api/books/${slug.value}`)
if (error.value) throw createError({ statusCode: 404, statusMessage: t('common.notFound'), fatal: true })
useHead({ title: () => data.value?.summary.title ?? '' })

const ctx = useReadingContext()
const chatOpen = useChatOpen()
const mode = usePreference(readerMode)
const guide = usePreference(readerGuide)
const prefStates = readerPreferences.map(p => usePreference(p as unknown as typeof readerMode))
const prefsKey = computed(() => prefStates.map(s => String((s.value as { value: string }).value)).join('|'))

const content = computed(() => data.value?.content ?? { chapters: [], citations: {}, sourceRuns: [] })
const annotations = ref<Annotation[]>(data.value?.annotations ?? [])
watch(() => data.value?.annotations, a => (annotations.value = a ?? []))

const citeNumbers = computed(() => {
  const numbers: Record<string, number> = {}
  let n = 0
  for (const chapter of content.value.chapters) {
    for (const block of chapter.blocks) {
      if ('cites' in block) for (const id of block.cites ?? []) numbers[id] ??= ++n
    }
  }
  return numbers
})
const blockIndex = computed(() => {
  const list: { chapterId: string, blockId: string, words: number }[] = []
  for (const chapter of content.value.chapters) {
    list.push({ chapterId: chapter.id, blockId: `chapter-${chapter.id}`, words: chapter.title.split(/\s+/).length })
    for (const block of chapter.blocks) list.push({ chapterId: chapter.id, blockId: block.id, words: blockText(block).split(/\s+/).length })
  }
  return list
})
const bookmarkedBlocks = computed(() => new Set(annotations.value.filter(a => a.kind === 'bookmark').map(a => a.blockId)))

// ---------- Pagination ----------
const viewport = ref<HTMLElement | null>(null)
const columns = ref<HTMLElement | null>(null)
const page = ref(0)
const pages = ref(1)
const perSpread = ref(1)
const stride = ref(0)
const currentBlock = ref<string | null>(null)
const scrollPercent = ref(0)
const paged = computed(() => mode.value.value !== 'scroll')

function blockElements(): HTMLElement[] {
  return columns.value ? [...columns.value.querySelectorAll<HTMLElement>('[data-block]')] : []
}

function layout() {
  const v = viewport.value
  const c = columns.value
  if (!v || !c) return
  if (!paged.value) {
    c.style.columnWidth = ''
    c.style.translate = ''
    return
  }
  const styles = getComputedStyle(v)
  const inner = v.clientWidth - parseFloat(styles.paddingLeft) - parseFloat(styles.paddingRight)
  const gap = parseFloat(getComputedStyle(c).columnGap) || 0
  perSpread.value = v.clientWidth >= 960 ? 2 : 1
  const colWidth = (inner - gap * (perSpread.value - 1)) / perSpread.value
  c.style.columnWidth = `${colWidth}px`
  c.style.width = `${inner}px`
  stride.value = inner + gap
  pages.value = Math.max(1, Math.ceil((c.scrollWidth + gap - 1) / stride.value))
}

function spreadOf(el: HTMLElement): number {
  const c = columns.value!
  const left = (el.getClientRects()[0]?.left ?? el.getBoundingClientRect().left) - c.getBoundingClientRect().left
  return Math.max(0, Math.floor((left + 2) / stride.value))
}

function applyPage(animate = true) {
  const c = columns.value
  if (!c || !paged.value) return
  page.value = Math.min(Math.max(0, page.value), pages.value - 1)
  c.style.transitionDuration = animate ? '' : '0ms'
  c.style.translate = `${-page.value * stride.value}px 0`
}

function onFocusIn(event: FocusEvent) {
  const el = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-block]')
  if (!el || !paged.value) return
  const spread = spreadOf(el)
  if (spread !== page.value) {
    page.value = spread
    applyPage(false)
    detectBlock()
  }
}

function detectBlock() {
  const els = blockElements()
  if (!els.length) return
  if (paged.value) {
    currentBlock.value = els.find(el => spreadOf(el) === page.value)?.dataset.block ?? currentBlock.value
  }
  else {
    const top = (document.querySelector('.reader-bar')?.getBoundingClientRect().bottom ?? 0) + 8
    currentBlock.value = els.find(el => el.getBoundingClientRect().bottom > top)?.dataset.block ?? currentBlock.value
    const max = document.documentElement.scrollHeight - innerHeight
    scrollPercent.value = max > 0 ? Math.round((scrollY / max) * 100) : 100
  }
}

function goToBlock(blockId: string, animate = false) {
  const el = columns.value?.querySelector<HTMLElement>(`[data-block="${CSS.escape(blockId)}"]`)
  if (!el) return
  if (paged.value) {
    page.value = spreadOf(el)
    applyPage(animate)
  }
  else {
    el.scrollIntoView({ block: 'start', behavior: animate && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' })
  }
  currentBlock.value = blockId
}

function turn(delta: number) {
  if (!paged.value) {
    scrollBy({ top: delta * innerHeight * 0.85, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
    return
  }
  const next = Math.min(Math.max(0, page.value + delta), pages.value - 1)
  if (next === page.value) return
  page.value = next
  applyPage(true)
  detectBlock()
  announce(t('reader.page', { page: page.value + 1, total: pages.value }))
}

const percent = computed(() => (paged.value ? Math.round(((page.value + 1) / pages.value) * 100) : scrollPercent.value))
const currentChapter = computed(() => blockIndex.value.find(b => b.blockId === currentBlock.value)?.chapterId ?? content.value.chapters[0]?.id ?? null)
const minutesLeftInChapter = computed(() => {
  const i = blockIndex.value.findIndex(b => b.blockId === currentBlock.value)
  if (i < 0) return 0
  const words = blockIndex.value.slice(i).filter(b => b.chapterId === currentChapter.value).reduce((s, b) => s + b.words, 0)
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE))
})
const chapterPages = ref<Record<string, number>>({})
function measureChapters() {
  if (!paged.value || !columns.value) return
  const out: Record<string, number> = {}
  columns.value.querySelectorAll<HTMLElement>('[data-chapter]').forEach((el) => {
    out[el.dataset.chapter!] = spreadOf(el) + 1
  })
  chapterPages.value = out
}

async function relayout(keep = currentBlock.value) {
  await nextTick()
  if (document.fonts?.ready) await document.fonts.ready
  layout()
  if (keep) goToBlock(keep)
  else applyPage(false)
  measureChapters()
  applyHighlights()
}

// ---------- Reading state ----------
let pendingSeconds = 0
let lastInteraction = Date.now()
let saveTimer: ReturnType<typeof setTimeout> | undefined
function saveState(immediate = false) {
  clearTimeout(saveTimer)
  const send = () => {
    if (!currentBlock.value || !currentChapter.value) return
    const body = { location: { chapterId: currentChapter.value, blockId: currentBlock.value, percent: percent.value }, secondsDelta: Math.min(600, pendingSeconds) }
    pendingSeconds = 0
    fetch(`/api/books/${slug.value}/state`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), keepalive: true }).catch(() => {})
  }
  if (immediate) send()
  else saveTimer = setTimeout(send, 800)
}
watch([currentBlock, percent], () => {
  ctx.value = { ...ctx.value, bookSlug: slug.value, bookTitle: data.value?.summary.title ?? null, chapterId: currentChapter.value, chapterTitle: content.value.chapters.find(c => c.id === currentChapter.value)?.title ?? null }
  saveState()
})

// ---------- Highlights (CSS Custom Highlight API) ----------
function rangeFor(blockId: string, start: number, end: number): Range | null {
  const el = columns.value?.querySelector(`[data-block="${CSS.escape(blockId)}"]`)
  if (!el) return null
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const range = document.createRange()
  let offset = 0
  let started = false
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const len = node.textContent?.length ?? 0
    if (!started && start <= offset + len) {
      range.setStart(node, Math.max(0, start - offset))
      started = true
    }
    if (started && end <= offset + len) {
      range.setEnd(node, Math.max(0, end - offset))
      return range
    }
    offset += len
  }
  return null
}

const searchTerm = ref(String(route.query.q ?? ''))
function applyHighlights() {
  if (typeof CSS === 'undefined' || !('highlights' in CSS)) return
  const registry = (CSS as unknown as { highlights: Map<string, unknown> }).highlights
  const HighlightCtor = (window as unknown as { Highlight: new (...r: Range[]) => unknown }).Highlight
  for (const color of ['yellow', 'green', 'blue', 'pink'] as const) {
    const ranges = annotations.value.filter(a => a.kind !== 'bookmark' && a.color === color).map(a => rangeFor(a.blockId, a.start, a.end)).filter((r): r is Range => Boolean(r))
    registry.set(`folio-${color}`, new HighlightCtor(...ranges))
  }
  const term = searchTerm.value.trim().toLowerCase()
  const hits: Range[] = []
  if (term.length >= 2) {
    for (const el of blockElements()) {
      const text = (el.textContent ?? '').toLowerCase()
      for (let i = text.indexOf(term); i >= 0 && hits.length < 200; i = text.indexOf(term, i + term.length)) {
        const r = rangeFor(el.dataset.block!, i, i + term.length)
        if (r) hits.push(r)
      }
    }
  }
  registry.set('folio-search', new HighlightCtor(...hits))
}
watch([annotations, searchTerm], () => nextTick(applyHighlights), { deep: true })

// ---------- Selection ----------
const selection = ref<{ blockId: string, chapterId: string, start: number, end: number, quote: string } | null>(null)
function offsetWithin(el: Element, node: Node, offset: number) {
  const range = document.createRange()
  range.setStart(el, 0)
  range.setEnd(node, offset)
  return range.toString().length
}
function onSelectionChange() {
  const sel = getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount || editing.value) {
    selection.value = null
    return
  }
  const range = sel.getRangeAt(0)
  const startEl = (range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement)?.closest<HTMLElement>('[data-block]')
  if (!startEl || !columns.value?.contains(startEl)) {
    selection.value = null
    return
  }
  const endInside = startEl.contains(range.endContainer)
  const start = offsetWithin(startEl, range.startContainer, range.startOffset)
  const end = endInside ? offsetWithin(startEl, range.endContainer, range.endOffset) : (startEl.textContent ?? '').length
  const quote = (startEl.textContent ?? '').slice(start, end).trim()
  if (!quote) return
  const chapterId = startEl.closest<HTMLElement>('[data-chapter]')?.dataset.chapter ?? currentChapter.value ?? ''
  selection.value = { blockId: startEl.dataset.block!, chapterId, start, end, quote }
}

async function addAnnotation(kind: Annotation['kind'], extra: Partial<Annotation> = {}) {
  const target = kind === 'bookmark'
    ? { blockId: currentBlock.value!, chapterId: currentChapter.value!, start: 0, end: 0, quote: (columns.value?.querySelector(`[data-block="${CSS.escape(currentBlock.value!)}"]`)?.textContent ?? '').trim().slice(0, 160) }
    : selection.value
  if (!target) return
  const created = await $fetch<Annotation>(`/api/books/${slug.value}/annotations`, { method: 'POST', body: { kind, color: 'yellow', ...target, ...extra } })
  annotations.value = [...annotations.value, created]
  getSelection()?.removeAllRanges()
  selection.value = null
  return created
}
async function removeAnnotation(id: string) {
  await $fetch(`/api/books/${slug.value}/annotations/${id}`, { method: 'DELETE' })
  annotations.value = annotations.value.filter(a => a.id !== id)
}
async function updateAnnotation(id: string, patch: Partial<Annotation>) {
  const updated = await $fetch<Annotation>(`/api/books/${slug.value}/annotations/${id}`, { method: 'PATCH', body: patch })
  annotations.value = annotations.value.map(a => (a.id === id ? updated : a))
}

const pageBookmark = computed(() => {
  if (!columns.value) return null
  const onPage = new Set(paged.value ? blockElements().filter(el => spreadOf(el) === page.value).map(el => el.dataset.block) : [currentBlock.value])
  void page.value
  return annotations.value.find(a => a.kind === 'bookmark' && onPage.has(a.blockId)) ?? null
})
async function toggleBookmark() {
  if (pageBookmark.value) await removeAnnotation(pageBookmark.value.id)
  else await addAnnotation('bookmark')
}

const noteOpen = ref(false)
const noteText = ref('')
async function saveNote() {
  await addAnnotation('note', { note: noteText.value })
  noteText.value = ''
  noteOpen.value = false
}

function askAboutSelection() {
  if (!selection.value) return
  ctx.value = { ...ctx.value, selection: selection.value.quote }
  chatOpen.value = true
}
async function copySelection() {
  if (!selection.value) return
  await navigator.clipboard.writeText(selection.value.quote)
  toast(t('reader.copied'))
}

// ---------- Line guide ----------
const guideTop = ref(120)
function moveGuide(delta: number) {
  const lh = parseFloat(getComputedStyle(columns.value!).lineHeight) || 28
  guideTop.value = Math.max(0, Math.min((viewport.value?.clientHeight ?? 600) - lh, guideTop.value + delta * lh))
}
function onPointerMove(event: PointerEvent) {
  if (guide.value.value !== 'on' || event.pointerType !== 'mouse' || !viewport.value) return
  guideTop.value = event.clientY - viewport.value.getBoundingClientRect().top - 14
}

// ---------- Swipe ----------
let swipeStart: { x: number, y: number } | null = null
function onPointerDown(event: PointerEvent) {
  if (event.pointerType !== 'mouse') swipeStart = { x: event.clientX, y: event.clientY }
}
function onPointerUp(event: PointerEvent) {
  if (!swipeStart || !paged.value || getSelection()?.toString()) return
  const dx = event.clientX - swipeStart.x
  const dy = event.clientY - swipeStart.y
  swipeStart = null
  if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) turn(dx < 0 ? 1 : -1)
}

// ---------- Shortcuts ----------
useShortcut(() => (paged.value ? 'arrowright' : null), () => turn(1), { description: t('reader.next') })
useShortcut(() => (paged.value ? 'arrowleft' : null), () => turn(-1), { description: t('reader.prev') })
useShortcut('pagedown', () => turn(1), { description: t('reader.next') })
useShortcut('pageup', () => turn(-1), { description: t('reader.prev') })
useShortcut(() => (guide.value.value === 'on' ? 'arrowdown' : null), () => moveGuide(1), { description: t('settingsReader.guide'), repeat: true })
useShortcut(() => (guide.value.value === 'on' ? 'arrowup' : null), () => moveGuide(-1), { description: t('settingsReader.guide'), repeat: true })

// ---------- Edit / regenerate / export ----------
const editing = ref(false)
const edits = ref<Record<string, string>>({})
const titleEdit = ref('')
function startEditing() {
  titleEdit.value = data.value?.summary.title ?? ''
  edits.value = {}
  editing.value = true
}
async function saveEdits() {
  await $fetch(`/api/books/${slug.value}`, { method: 'PATCH', body: { title: titleEdit.value, blocks: edits.value } })
  editing.value = false
  await refresh()
  toast.success(t('settings.saved'))
}
async function regenerate(discardEdits: boolean) {
  const id = toast.loading(t('home.compiling'))
  try {
    await $fetch(`/api/books/${slug.value}/regenerate`, { method: 'POST', body: { discardEdits } })
    await refresh()
    toast.success(t('reader.regenerated'), { id })
  }
  catch {
    toast.error(t('common.error'), { id })
  }
}
async function onMenuAction(value: string) {
  if (value === 'notes') openPanel('notes')
  if (value === 'search-panel') openPanel('search')
  if (value === 'edit') startEditing()
  if (value === 'regen-keep') regenerate(false)
  if (value === 'regen-discard') regenerate(true)
  if (value === 'epub' || value === 'pdf') window.location.href = `/api/books/${slug.value}/export?format=${value}`
  if (value === 'share') {
    await navigator.clipboard.writeText(`${location.origin}/read/${slug.value}`)
    toast(t('reader.linkCopied'))
  }
  if (value === 'favorite') {
    const favorite = !data.value?.summary.favorite
    await $fetch(`/api/books/${slug.value}/favorite`, { method: 'PUT', body: { favorite } })
    await refresh()
  }
}

// ---------- In-book search ----------
const searchResults = computed(() => {
  const term = searchTerm.value.trim().toLowerCase()
  if (term.length < 2) return []
  const out: { chapterTitle: string, blockId: string, snippet: string }[] = []
  for (const chapter of content.value.chapters) {
    for (const block of chapter.blocks) {
      const text = blockText(block)
      const i = text.toLowerCase().indexOf(term)
      if (i >= 0) out.push({ chapterTitle: chapter.title, blockId: block.id, snippet: `${i > 40 ? '…' : ''}${text.slice(Math.max(0, i - 40), i + term.length + 60)}` })
    }
  }
  return out
})
const panelOpen = ref(false)
const panelTab = ref<'toc' | 'notes' | 'search'>('toc')
function openPanel(tab: 'toc' | 'notes' | 'search') {
  panelTab.value = tab
  panelOpen.value = true
}
function jump(blockId: string) {
  panelOpen.value = false
  nextTick(() => goToBlock(blockId, true))
}

// ---------- Lifecycle ----------
let ro: ResizeObserver | undefined
let tick: ReturnType<typeof setInterval> | undefined
const markInteraction = () => (lastInteraction = Date.now())
const ready = ref(false)
onMounted(async () => {
  await relayout(String(route.query.block ?? '') || data.value?.location?.blockId || null)
  detectBlock()
  fetch(`/api/books/${slug.value}/state`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ opened: true, secondsDelta: 0 }) }).catch(() => {})
  ro = new ResizeObserver(() => relayout())
  if (viewport.value) ro.observe(viewport.value)
  await new Promise(resolve => requestAnimationFrame(resolve))
  ready.value = true
  document.addEventListener('selectionchange', onSelectionChange)
  addEventListener('scroll', detectBlock, { passive: true })
  for (const type of ['pointerdown', 'keydown', 'scroll', 'wheel'] as const) addEventListener(type, markInteraction, { passive: true })
  tick = setInterval(() => {
    if (document.visibilityState === 'visible' && Date.now() - lastInteraction < 120_000) pendingSeconds += 5
    if (pendingSeconds >= 30) saveState(true)
  }, 5000)
  addEventListener('pagehide', () => saveState(true))
})
onBeforeUnmount(() => {
  saveState(true)
  ro?.disconnect()
  clearInterval(tick)
  document.removeEventListener('selectionchange', onSelectionChange)
  removeEventListener('scroll', detectBlock)
  for (const type of ['pointerdown', 'keydown', 'scroll', 'wheel'] as const) removeEventListener(type, markInteraction)
})
watch(prefsKey, () => relayout())
watch(content, () => relayout(), { deep: false })

const formatDate = useFormatDate()
</script>

<template>
  <div v-if="data" class="reader flex flex-col" :class="paged && !editing ? 'h-dvh overflow-hidden' : 'min-h-dvh'" @pointermove="onPointerMove">
    <header class="reader-bar sticky top-0 z-20 flex items-center gap-1 px-2 sm:px-4 h-14 font-sans" style="background: var(--r-bg); color: var(--r-ink)">
      <NuxtLink to="/" class="btn btn-ghost btn-icon" :aria-label="t('reader.close')" @click="saveState(true)">
        <ArrowLeftIcon :size="20" aria-hidden="true" />
      </NuxtLink>
      <Button class="btn btn-ghost btn-icon" :aria-label="t('reader.toc')" @click="openPanel('toc')">
        <ListIcon :size="20" aria-hidden="true" />
      </Button>
      <div class="flex-1 min-w-0 text-center px-2">
        <h1 class="truncate font-serif text-lg leading-tight font-medium">{{ data.summary.title }}</h1>
        <p class="truncate text-[0.68rem] font-medium uppercase tracking-[0.1em]" style="color: var(--r-ink-2)">{{ content.chapters.find(c => c.id === currentChapter)?.title }}</p>
      </div>
      <Toolbar :aria-label="t('reader.toolbar')" class="flex items-center gap-1">
        <ToolbarButton class="btn btn-ghost btn-icon hidden sm:inline-flex" :aria-label="t('reader.search')" @click="openPanel('search')">
          <SearchIcon :size="20" aria-hidden="true" />
        </ToolbarButton>
        <ToolbarButton class="btn btn-ghost btn-icon" :aria-label="t('reader.chat')" @click="chatOpen = true">
          <MessageCircleQuestionIcon :size="20" aria-hidden="true" />
        </ToolbarButton>
        <Toggle class="btn btn-ghost btn-icon data-pressed:text-[var(--r-accent)]" :pressed="Boolean(pageBookmark)" :aria-label="t('reader.bookmark')" @pressed-change="toggleBookmark">
          <BookmarkIcon :size="20" :fill="pageBookmark ? 'currentColor' : 'none'" aria-hidden="true" />
        </Toggle>
      </Toolbar>
      <ReaderSettings />
      <Menu @action="onMenuAction">
        <MenuTrigger class="btn btn-ghost btn-icon" :aria-label="t('reader.export')">
          <MoreHorizontalIcon :size="20" aria-hidden="true" />
        </MenuTrigger>
        <MenuContent class="popup-surface" side="bottom" align="end" :side-offset="6">
          <MenuItem value="favorite">{{ data.summary.favorite ? t('book.removeFavorite') : t('book.addFavorite') }}</MenuItem>
          <MenuItem value="notes">{{ t('reader.notes') }}</MenuItem>
          <MenuItem value="search-panel">{{ t('reader.search') }}</MenuItem>
          <MenuSeparator class="my-1 h-px bg-line" />
          <MenuItem value="epub">{{ t('reader.epub') }}</MenuItem>
          <MenuItem value="pdf">{{ t('reader.pdf') }}</MenuItem>
          <MenuItem value="share">{{ t('reader.share') }}</MenuItem>
          <MenuSeparator class="my-1 h-px bg-line" />
          <MenuItem value="edit">{{ t('reader.edit') }}</MenuItem>
          <MenuItem value="regen-keep" :data-agent-confirm="t('reader.regenerateDesc')">{{ t('reader.regenerateKeep') }}</MenuItem>
          <MenuItem value="regen-discard" :data-agent-confirm="t('reader.regenerateDesc')">{{ t('reader.regenerateDiscard') }}</MenuItem>
        </MenuContent>
      </Menu>
    </header>

    <div v-if="editing" class="mx-auto w-full max-w-2xl px-4 py-6 space-y-4 font-sans">
      <p class="text-sm" style="color: var(--r-ink-2)">{{ t('reader.editing') }}</p>
      <Field>
        <FieldLabel class="eyebrow">{{ t('reader.edit') }}</FieldLabel>
        <Input v-model="titleEdit" class="field-input mt-2 font-serif text-2xl" />
      </Field>
      <template v-for="chapter in content.chapters" :key="chapter.id">
        <h2 class="font-serif text-2xl font-medium pt-4">{{ chapter.title }}</h2>
        <template v-for="block in chapter.blocks" :key="block.id">
          <Field v-if="'text' in block">
            <FieldLabel class="sr-only">{{ chapter.title }}</FieldLabel>
            <Textarea :default-value="block.text" auto-resize class="field-input font-serif text-lg min-h-12" @value-change="(v: string) => (edits[block.id] = v)" />
          </Field>
        </template>
      </template>
      <div class="sticky bottom-4 flex gap-2 justify-end">
        <Button class="btn" @click="editing = false">{{ t('reader.cancel') }}</Button>
        <Button class="btn btn-primary" @click="saveEdits">{{ t('reader.saveEdits') }}</Button>
      </div>
    </div>

    <div
      v-show="!editing" ref="viewport"
      class="reader-viewport flex-1 min-h-0"
      :style="{ paddingInline: 'var(--r-margin)' }"
      @pointerdown="onPointerDown" @pointerup="onPointerUp"
    >
      <article ref="columns" class="reader-columns reader-text" :aria-label="data.summary.title" :lang="data.language" :data-ready="ready || undefined" @focusin="onFocusIn">
        <section v-for="(chapter, i) in content.chapters" :key="chapter.id" class="chapter" :data-chapter="chapter.id" :aria-labelledby="`h-${chapter.id}`">
          <h2 :id="`h-${chapter.id}`" :data-block="`chapter-${chapter.id}`">{{ chapter.title }}</h2>
          <p class="chapter-meta">
            <span>{{ t('reader.chapterOf', { n: i + 1 }) }}</span>
            <template v-if="chapter.agent"> · {{ chapter.agent.kind }}</template>
            <template v-if="chapter.sources.length"> · {{ chapter.sources.map(s => sourceTitle(s, locale === 'en' ? 'en' : 'fr')).join(', ') }}</template>
            <template v-if="chapter.startedAt"> · {{ formatDate(chapter.startedAt, { timeStyle: 'short' }) }}<template v-if="chapter.endedAt && chapter.endedAt !== chapter.startedAt">–{{ formatDate(chapter.endedAt, { timeStyle: 'short' }) }}</template></template>
            <template v-if="chapter.kind === 'agent' || chapter.kind === 'source'"> · <span class="status" :data-status="chapter.status">{{ t(`reader.status.${chapter.status}`) }}</span></template>
          </p>
          <ReaderBlock v-for="block in chapter.blocks" :key="block.id" :block="block" :citations="content.citations" :cite-numbers="citeNumbers" :bookmarked="bookmarkedBlocks.has(block.id)" />
        </section>
      </article>
      <div v-if="guide.value === 'on'" class="reader-guide" :style="{ top: `${guideTop}px` }" aria-hidden="true" />
      <template v-if="paged">
        <Button class="reader-page-turn absolute inset-y-0 start-0 w-[max(2.5rem,calc(var(--r-margin)*0.9))] grid place-items-center opacity-0 hover:opacity-60 focus-visible:opacity-100" :aria-label="t('reader.prev')" :disabled="page === 0" @click="turn(-1)">
          <ChevronLeftIcon :size="28" aria-hidden="true" />
        </Button>
        <Button class="reader-page-turn absolute inset-y-0 end-0 w-[max(2.5rem,calc(var(--r-margin)*0.9))] grid place-items-center opacity-0 hover:opacity-60 focus-visible:opacity-100" :aria-label="t('reader.next')" :disabled="page >= pages - 1" @click="turn(1)">
          <ChevronRightIcon :size="28" aria-hidden="true" />
        </Button>
      </template>
    </div>

    <footer v-show="!editing" class="sticky bottom-0 z-10 px-4 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 font-sans text-[0.7rem] tabular-nums" style="background: var(--r-bg); color: var(--r-ink-2)">
      <Progress :value="percent" class="mx-auto max-w-3xl space-y-1.5" :aria-label="t('reader.percent', { p: percent })">
        <ProgressTrack><ProgressIndicator /></ProgressTrack>
        <div class="flex justify-between gap-2">
          <span>{{ paged ? t('reader.page', { page: page + 1, total: pages }) : t('reader.percent', { p: percent }) }}</span>
          <span>{{ t('reader.left', { n: minutesLeftInChapter }) }}</span>
          <span>{{ t('reader.percent', { p: percent }) }}</span>
        </div>
      </Progress>
    </footer>

    <div v-if="selection" class="fixed bottom-16 inset-x-0 z-30 flex justify-center px-4 font-sans">
      <Toolbar :aria-label="t('reader.selection')" class="popup-surface flex items-center gap-1 p-1.5">
        <ToolbarButton class="btn btn-ghost btn-sm" @click="addAnnotation('highlight')"><HighlighterIcon :size="16" aria-hidden="true" />{{ t('reader.highlight') }}</ToolbarButton>
        <ToolbarButton class="btn btn-ghost btn-sm" @click="noteOpen = true"><StickyNoteIcon :size="16" aria-hidden="true" />{{ t('reader.note') }}</ToolbarButton>
        <ToolbarButton class="btn btn-ghost btn-sm" @click="askAboutSelection"><MessageCircleQuestionIcon :size="16" aria-hidden="true" />{{ t('reader.ask') }}</ToolbarButton>
        <ToolbarButton class="btn btn-ghost btn-sm btn-icon" :aria-label="t('reader.copy')" @click="copySelection"><CopyIcon :size="16" aria-hidden="true" /></ToolbarButton>
      </Toolbar>
    </div>

    <Dialog v-model:open="noteOpen">
      <DialogBackdrop class="fixed inset-0" />
      <DialogContent class="popup-surface w-[min(30rem,calc(100vw-2rem))] p-6 space-y-4 font-sans">
        <DialogTitle class="font-serif text-2xl leading-none font-medium">{{ t('reader.note') }}</DialogTitle>
        <blockquote v-if="selection" class="border-s-2 border-accent ps-3 font-serif text-lg italic text-ink-2 line-clamp-4">{{ selection.quote }}</blockquote>
        <Field>
          <FieldLabel class="sr-only">{{ t('reader.note') }}</FieldLabel>
          <Textarea v-model="noteText" auto-resize class="field-input min-h-24" :placeholder="t('reader.notePlaceholder')" />
        </Field>
        <div class="flex justify-end gap-2">
          <DialogClose class="btn">{{ t('reader.cancel') }}</DialogClose>
          <Button class="btn btn-primary" :disabled="!noteText.trim()" @click="saveNote">{{ t('reader.save') }}</Button>
        </div>
      </DialogContent>
    </Dialog>

    <Drawer v-model:open="panelOpen" side="left">
      <DrawerBackdrop />
      <DrawerContent class="sheet font-sans">
        <div class="flex items-center justify-between px-4 h-14 border-b border-line shrink-0">
          <DrawerTitle class="font-serif text-2xl leading-tight font-medium truncate">{{ data.summary.title }}</DrawerTitle>
          <DrawerClose class="btn btn-ghost btn-sm">{{ t('common.close') }}</DrawerClose>
        </div>
        <Tabs v-model:value="panelTab" class="flex-1 min-h-0 flex flex-col">
          <TabsList :aria-label="data.summary.title" class="px-4">
            <TabsTab value="toc">{{ t('reader.toc') }}</TabsTab>
            <TabsTab value="notes">{{ t('reader.notes') }}</TabsTab>
            <TabsTab value="search">{{ t('reader.search') }}</TabsTab>
          </TabsList>
          <TabsPanel value="toc" class="flex-1 overflow-y-auto">
            <ol class="py-2">
              <li v-for="(chapter, i) in content.chapters" :key="chapter.id">
                <Button class="w-full text-start px-4 py-3 flex items-baseline gap-3 cursor-pointer hover:bg-paper aria-[current=true]:font-semibold aria-[current=true]:shadow-[inset_2px_0_0_var(--ink)]" :aria-current="chapter.id === currentChapter ? 'true' : undefined" @click="jump(`chapter-${chapter.id}`)">
                  <span class="text-ink-2 w-6 text-end font-serif text-lg leading-none tabular-nums">{{ i + 1 }}</span>
                  <span class="flex-1 min-w-0">
                    <span class="block truncate">{{ chapter.title }}</span>
                    <span v-if="chapter.kind === 'agent' || chapter.kind === 'source'" class="chip mt-1.5" :data-status="chapter.status">{{ t(`reader.status.${chapter.status}`) }}</span>
                  </span>
                  <span v-if="paged && chapterPages[chapter.id]" class="text-xs text-ink-2 tabular-nums">{{ chapterPages[chapter.id] }}</span>
                </Button>
              </li>
            </ol>
            <div class="px-4 py-3 border-t border-line text-xs text-ink-2 space-y-1">
              <p>{{ t('book.version', { v: data.summary.version }) }} · {{ t('book.writer', { w: data.writer === 'compiler' ? t('book.compiler') : data.writer }) }}</p>
              <p v-if="data.edited">{{ t('book.edited') }}</p>
            </div>
          </TabsPanel>
          <TabsPanel value="notes" class="flex-1 overflow-y-auto p-4 space-y-5">
            <p v-if="!annotations.length" class="text-ink-2 text-sm">{{ t('reader.noNotes') }}</p>
            <section v-if="annotations.some(a => a.kind === 'bookmark')">
              <h3 class="eyebrow mb-2">{{ t('reader.bookmarks') }}</h3>
              <ul class="space-y-2">
                <li v-for="a in annotations.filter(a => a.kind === 'bookmark')" :key="a.id" class="flex items-start gap-2">
                  <Button class="flex-1 text-start text-sm line-clamp-2 hover:underline" @click="jump(a.blockId)">{{ a.quote || a.blockId }}</Button>
                  <Button class="btn btn-ghost btn-sm" :aria-label="`${t('reader.delete')} : ${a.quote.slice(0, 40)}`" @click="removeAnnotation(a.id)">{{ t('reader.delete') }}</Button>
                </li>
              </ul>
            </section>
            <section v-if="annotations.some(a => a.kind !== 'bookmark')">
              <h3 class="eyebrow mb-2">{{ t('reader.highlights') }}</h3>
              <ul class="divide-y divide-line">
                <li v-for="a in annotations.filter(a => a.kind !== 'bookmark')" :key="a.id" class="py-4 space-y-2">
                  <Button class="text-start font-serif text-lg leading-snug border-s-4 ps-3 hover:underline" :style="{ borderColor: `var(--r-mark-${a.color})` }" @click="jump(a.blockId)">{{ a.quote }}</Button>
                  <p v-if="a.note" class="text-sm">{{ a.note }}</p>
                  <div class="flex items-center gap-1">
                    <ToggleGroup :value="[a.color]" :aria-label="t('reader.highlight')" class="flex gap-1" @value-change="(v: string[]) => v[0] && updateAnnotation(a.id, { color: v[0] as Annotation['color'] })">
                      <Toggle v-for="c in (['yellow', 'green', 'blue', 'pink'] as const)" :key="c" :value="c" :aria-label="c" class="size-6 rounded-full border-2 border-transparent data-pressed:border-ink" :style="{ background: `var(--r-mark-${c})` }" />
                    </ToggleGroup>
                    <span class="text-xs text-ink-2 ms-2">{{ formatDate(a.createdAt) }}</span>
                    <Button class="btn btn-ghost btn-sm ms-auto" @click="removeAnnotation(a.id)">{{ t('reader.delete') }}</Button>
                  </div>
                </li>
              </ul>
            </section>
          </TabsPanel>
          <TabsPanel value="search" class="flex-1 overflow-y-auto p-4 space-y-3">
            <Field>
              <FieldLabel class="sr-only">{{ t('reader.search') }}</FieldLabel>
              <Input v-model="searchTerm" type="search" class="field-input" :placeholder="t('reader.searchPlaceholder')" />
            </Field>
            <p v-if="searchTerm.trim().length >= 2" class="text-xs text-ink-2" role="status">{{ t('reader.searchResults', { n: searchResults.length }, searchResults.length) }}</p>
            <ul class="divide-y divide-line">
              <li v-for="r in searchResults" :key="r.blockId">
                <Button class="w-full text-start py-2.5" @click="jump(r.blockId)">
                  <span class="block eyebrow">{{ r.chapterTitle }}</span>
                  <span class="block font-serif text-lg leading-snug mt-1">{{ r.snippet }}</span>
                </Button>
              </li>
            </ul>
          </TabsPanel>
        </Tabs>
      </DrawerContent>
    </Drawer>
  </div>
</template>
