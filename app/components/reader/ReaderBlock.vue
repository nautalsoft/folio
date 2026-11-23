<script setup lang="ts">
import type { Block, Citation } from '~~/shared/types/folio'

const props = defineProps<{ block: Block, citations: Record<string, Citation>, citeNumbers: Record<string, number>, bookmarked?: boolean }>()
const { t } = useI18n()
const formatDate = useFormatDate()

const cites = computed(() => ('cites' in props.block ? props.block.cites ?? [] : []).map(id => props.citations[id]).filter((c): c is Citation => Boolean(c)))
const diffLines = computed(() => (props.block.type === 'diff' ? props.block.patch.split('\n') : []))
const traceIcon = { done: '✓', error: '✕', running: '…', skipped: '–' } as const
const time = computed(() => ('at' in props.block && props.block.at ? formatDate(props.block.at, { timeStyle: 'short' }) : ''))
</script>

<template>
  <h3 v-if="block.type === 'heading'" :data-block="block.id" :data-bookmarked="bookmarked || undefined">{{ block.text }}</h3>
  <p v-else-if="block.type === 'paragraph'" :data-block="block.id" :data-bookmarked="bookmarked || undefined">
    {{ block.text }}<ReaderCite v-for="c in cites" :key="c.id" :citation="c" :n="citeNumbers[c.id] ?? 0" />
  </p>
  <p v-else-if="block.type === 'fact'" :data-block="block.id" :data-bookmarked="bookmarked || undefined" class="block">
    <span class="status" :data-status="block.status">{{ t(`reader.status.${block.status}`) }}</span>
    <span v-if="time" class="status" data-status="info">{{ time }}</span>
    {{ block.text }}<ReaderCite v-for="c in cites" :key="c.id" :citation="c" :n="citeNumbers[c.id] ?? 0" />
  </p>
  <blockquote v-else-if="block.type === 'quote'" :data-block="block.id">
    {{ block.text }}<ReaderCite v-for="c in cites" :key="c.id" :citation="c" :n="citeNumbers[c.id] ?? 0" />
  </blockquote>
  <aside v-else-if="block.type === 'notice'" :data-block="block.id" class="notice block" :data-tone="block.tone">{{ block.text }}</aside>
  <figure v-else-if="block.type === 'code'" :data-block="block.id" class="block m-0">
    <pre :aria-label="block.lang"><code>{{ block.code }}</code></pre>
    <figcaption v-if="block.caption" class="chapter-meta mt-1">{{ block.caption }}</figcaption>
  </figure>
  <figure v-else-if="block.type === 'diff'" :data-block="block.id" class="block m-0">
    <figcaption class="chapter-meta mb-1 font-mono">{{ block.file }}</figcaption>
    <pre class="diff"><code><template v-for="(line, i) in diffLines" :key="i"><ins v-if="line.startsWith('+')">{{ line }}</ins><del v-else-if="line.startsWith('-')">{{ line }}</del><span v-else class="block">{{ line }}</span></template></code></pre>
  </figure>
  <div v-else-if="block.type === 'trace'" :data-block="block.id" class="trace block">
    <p class="font-semibold m-0">{{ block.title }}</p>
    <ol>
      <li v-for="(step, i) in block.steps" :key="i">
        <span aria-hidden="true">{{ traceIcon[step.status] }}</span>
        <span>{{ step.label }} <span class="sr-only">({{ t(`reader.trace.${step.status}`) }})</span><span v-if="step.detail" class="block text-[0.9em] opacity-80 font-mono">{{ step.detail }}</span></span>
      </li>
    </ol>
  </div>
</template>
