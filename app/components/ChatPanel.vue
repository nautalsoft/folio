<script setup lang="ts">
import { useChat } from '@ai-sdk/vue'
import { DefaultChatTransport, type UIMessage } from 'ai'
import { SendIcon, SquareIcon, XIcon, Trash2Icon, QuoteIcon, ArrowDownIcon } from '@lucide/vue'

const { t, tm, rt } = useI18n()
const open = useChatOpen()
const ctx = useReadingContext()
const route = useRoute()
const { data: instance } = useInstance()
const input = ref('')

const chatId = computed(() => (ctx.value.bookSlug ? `book-${ctx.value.bookSlug}` : 'library'))
const screen = computed(() => String(route.name ?? 'home'))

const chat = useChat(() => ({
  id: chatId.value,
  transport: new DefaultChatTransport({
    api: '/api/chat',
    prepareSendMessagesRequest: ({ id, messages }) => ({
      body: { id, messages, context: { bookSlug: ctx.value.bookSlug, chapterId: ctx.value.chapterId, selection: ctx.value.selection, screen: screen.value } },
    }),
  }),
}))

const loaded = new Set<string>()
watch([open, chatId], async ([isOpen, id]) => {
  if (!isOpen || loaded.has(id)) return
  loaded.add(id)
  const saved = await $fetch<{ messages: UIMessage[] }>(`/api/chats/${id}`).catch(() => ({ messages: [] }))
  if (saved.messages.length && !chat.messages.value.length) chat.messages.value = saved.messages
}, { immediate: true })

const busy = computed(() => chat.status.value === 'submitted' || chat.status.value === 'streaming')
const suggestions = computed(() => (tm('chat.suggestions') as unknown[]).map(s => rt(s as never)))

function sourcesOf(message: UIMessage) {
  const out: Record<string, { url: string, title?: string }> = {}
  for (const part of message.parts) if (part.type === 'source-url') out[part.sourceId] = { url: part.url, title: part.title }
  return out
}
const textOf = (message: UIMessage) => message.parts.map(p => (p.type === 'text' ? p.text : '')).join('')

async function send(text = input.value) {
  const value = text.trim()
  if (!value || busy.value) return
  input.value = ''
  await chat.sendMessage({ text: value })
}

function clear() {
  chat.messages.value = []
  $fetch(`/api/chats/${chatId.value}`, { method: 'DELETE' }).catch(() => {})
}
</script>

<template>
  <Drawer v-model:open="open" side="right" :modal="false">
    <DrawerContent class="sheet" :aria-describedby="undefined">
      <div class="flex items-center gap-2 border-b border-line px-4 h-14 shrink-0">
        <DrawerTitle class="font-serif text-2xl leading-none font-medium">{{ t('chat.title') }}</DrawerTitle>
        <Button v-if="chat.messages.value.length" class="btn btn-ghost btn-sm btn-icon ms-auto" :aria-label="t('chat.clear')" @click="clear">
          <Trash2Icon :size="16" aria-hidden="true" />
        </Button>
        <DrawerClose class="btn btn-ghost btn-sm btn-icon" :class="chat.messages.value.length ? '' : 'ms-auto'" :aria-label="t('chat.close')">
          <XIcon :size="18" aria-hidden="true" />
        </DrawerClose>
      </div>
      <div class="px-4 py-2.5 text-xs text-ink-2 border-b border-line space-y-1">
        <p>{{ ctx.bookSlug ? t('chat.context', { title: [ctx.bookTitle, ctx.chapterTitle].filter(Boolean).join(' · ') }) : t('chat.contextLibrary') }}</p>
        <p v-if="ctx.selection" class="flex gap-1.5 items-start">
          <QuoteIcon :size="12" class="mt-0.5 shrink-0" aria-hidden="true" />
          <span class="line-clamp-2 italic">{{ ctx.selection }}</span>
          <Button class="ms-auto shrink-0 underline font-semibold" @click="ctx.selection = null">{{ t('common.close') }}</Button>
        </p>
        <p v-if="instance && !instance.ai">{{ t('chat.noAi') }}</p>
      </div>
      <ScrollArea class="flex-1 min-h-0 relative" stick-to-end>
        <ScrollAreaViewport class="h-full" role="log" :aria-label="t('chat.title')" :aria-busy="busy">
          <ScrollAreaContent class="px-4 py-4 space-y-4">
            <div v-if="!chat.messages.value.length" class="space-y-3">
              <p class="font-serif text-xl leading-snug">{{ t('chat.empty') }}</p>
              <div class="flex flex-col items-start gap-2">
                <Button v-for="s in suggestions" :key="s" class="btn btn-sm text-start h-auto py-2 leading-snug justify-start" @click="send(s)">{{ s }}</Button>
              </div>
            </div>
            <article v-for="message in chat.messages.value" :key="message.id" :class="message.role === 'user' ? 'flex justify-end' : ''">
              <div v-if="message.role === 'user'" class="max-w-[85%] rounded-md bg-ink text-paper px-3.5 py-2 text-[0.95rem] leading-relaxed">{{ textOf(message) }}</div>
              <div v-else class="space-y-2 text-[0.95rem] leading-relaxed">
                <ChatText :text="textOf(message)" :sources="sourcesOf(message)" />
                <details v-if="Object.keys(sourcesOf(message)).length" class="text-sm">
                  <summary class="cursor-pointer font-semibold text-ink-2">{{ t('chat.sources') }} ({{ Object.keys(sourcesOf(message)).length }})</summary>
                  <ol class="mt-1 space-y-1">
                    <li v-for="(s, n) in sourcesOf(message)" :key="n">
                      <span class="font-semibold me-1">{{ n }}.</span>
                      <a :href="s.url" target="_blank" rel="noreferrer" class="text-accent underline underline-offset-2">{{ s.title || s.url }}</a>
                    </li>
                  </ol>
                </details>
              </div>
            </article>
            <p v-if="chat.status.value === 'submitted'" class="text-ink-2 text-sm" role="status">{{ t('common.loading') }}</p>
            <div v-if="chat.error.value" class="text-sm text-blocked flex items-center gap-2" role="alert">
              {{ t('chat.error') }}
              <Button class="btn btn-sm" @click="chat.regenerate()">{{ t('chat.retry') }}</Button>
            </div>
          </ScrollAreaContent>
        </ScrollAreaViewport>
        <ScrollAreaScrollToEnd class="btn btn-sm btn-icon absolute bottom-3 end-4 shadow" :aria-label="t('chat.send')">
          <ArrowDownIcon :size="16" aria-hidden="true" />
        </ScrollAreaScrollToEnd>
      </ScrollArea>
      <form class="border-t border-line p-3 flex items-end gap-2 shrink-0" @submit.prevent="send()">
        <Field class="flex-1">
          <FieldLabel class="sr-only">{{ t('chat.placeholder') }}</FieldLabel>
          <Textarea v-model="input" class="field-input resize-none max-h-40" rows="1" auto-resize :placeholder="t('chat.placeholder')" submit-shortcut="enter" @submit="send()" />
        </Field>
        <Button v-if="busy" type="button" class="btn btn-icon" :aria-label="t('chat.stop')" @click="chat.stop()">
          <SquareIcon :size="16" aria-hidden="true" />
        </Button>
        <Button v-else type="submit" class="btn btn-primary btn-icon" :aria-label="t('chat.send')" :disabled="!input.trim()">
          <SendIcon :size="16" aria-hidden="true" />
        </Button>
      </form>
    </DrawerContent>
  </Drawer>
</template>
