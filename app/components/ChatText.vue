<script setup lang="ts">
const props = defineProps<{ text: string, sources: Record<string, { url: string, title?: string }> }>()

type Segment = { kind: 'text', value: string } | { kind: 'cite', n: string }
interface Line { bullet: boolean, segments: Segment[] }

const lines = computed<Line[]>(() => props.text.split('\n').filter(l => l.trim()).map((raw) => {
  const bullet = /^\s*[-*•]\s+/.test(raw)
  const text = raw.replace(/^\s*[-*•]\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1')
  const segments: Segment[] = []
  let last = 0
  for (const m of text.matchAll(/\[(\d+)\]/g)) {
    if (m.index! > last) segments.push({ kind: 'text', value: text.slice(last, m.index) })
    segments.push({ kind: 'cite', n: m[1]! })
    last = m.index! + m[0].length
  }
  if (last < text.length) segments.push({ kind: 'text', value: text.slice(last) })
  return { bullet, segments }
}))
</script>

<template>
  <div class="space-y-2">
    <template v-for="(line, i) in lines" :key="i">
      <p :class="line.bullet ? 'ps-4 relative before:content-[\'•\'] before:absolute before:start-0 before:text-ink-2' : ''">
        <template v-for="(seg, j) in line.segments" :key="j">
          <template v-if="seg.kind === 'text'">{{ seg.value }}</template>
          <a
            v-else-if="sources[seg.n]" :href="sources[seg.n]!.url" target="_blank" rel="noreferrer"
            class="align-super text-[0.7em] font-semibold px-0.5 text-accent no-underline hover:underline tabular-nums"
            :aria-label="sources[seg.n]!.title || sources[seg.n]!.url"
          >{{ seg.n }}</a>
          <span v-else class="align-super text-[0.7em] text-ink-2">{{ seg.n }}</span>
        </template>
      </p>
    </template>
  </div>
</template>
