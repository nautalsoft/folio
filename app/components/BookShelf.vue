<script setup lang="ts">
import type { BookSummary } from '~~/shared/types/folio'

defineProps<{ title: string, books: BookSummary[], to?: string, moreLabel?: string }>()
</script>

<template>
  <section v-if="books.length" class="space-y-5 border-t border-line pt-5">
    <div class="flex items-baseline justify-between gap-4">
      <h2 class="font-serif text-[1.7rem] leading-tight font-normal tracking-tight">{{ title }}</h2>
      <NuxtLink v-if="to" :to="to" class="text-sm font-medium text-ink-2 underline decoration-line underline-offset-4 hover:text-ink hover:decoration-ink">{{ moreLabel }}</NuxtLink>
    </div>
    <ul class="flex gap-6 overflow-x-auto pt-1 pb-4 -mx-4 px-4 sm:-mx-8 sm:px-8 snap-x scroll-px-4 sm:scroll-px-8 [scrollbar-width:thin]" role="list">
      <li v-for="book in books" :key="book.slug" class="snap-start">
        <BookCover :book="book" />
      </li>
    </ul>
  </section>
</template>
