<script setup lang="ts">
import type { Citation } from '~~/shared/types/folio'

const props = defineProps<{ citation: Citation, n: number }>()
const { t } = useI18n()
const formatDate = useFormatDate()
const external = computed(() => /^https?:\/\//.test(props.citation.url))
</script>

<template>
  <HoverCard>
    <HoverCardTrigger
      class="cite" :href="citation.url"
      :target="external ? '_blank' : undefined" :rel="external ? 'noreferrer' : undefined"
      :aria-label="t('reader.citation', { label: citation.label })"
    >{{ n }}</HoverCardTrigger>
    <HoverCardContent class="popup-surface p-3 max-w-72 text-sm font-sans" side="top" :side-offset="6">
      <p class="eyebrow">{{ sourceTitle(citation.source) }}</p>
      <p class="text-ink-2 break-words">{{ citation.label }}</p>
      <p v-if="citation.at" class="text-ink-2 text-xs mt-1">{{ formatDate(citation.at) }}</p>
    </HoverCardContent>
  </HoverCard>
</template>
