<script setup lang="ts">
import { BookOpenIcon, LibraryIcon, HandIcon, UsersIcon, RadioIcon, SettingsIcon, MessageCircleQuestionIcon, SunMoonIcon } from '@lucide/vue'

const { t, locale, locales, setLocale } = useI18n()
const route = useRoute()
const { data: instance } = await useInstance()
const { data: needs } = await useFetch('/api/needs', { key: 'needs-count', transform: (d: { needs: unknown[] }) => d.needs.length })
const chatOpen = useChatOpen()
const scheme = usePreference(colorScheme)

const links = computed(() => [
  { to: '/', label: t('nav.home'), icon: BookOpenIcon },
  { to: '/library', label: t('nav.library'), icon: LibraryIcon },
  { to: '/needs', label: t('nav.needs'), icon: HandIcon, count: needs.value ?? 0 },
  { to: '/work', label: t('nav.work'), icon: UsersIcon },
  { to: '/live', label: t('nav.live'), icon: RadioIcon },
  { to: '/settings', label: t('nav.settings'), icon: SettingsIcon },
])
const isActive = (to: string) => (to === '/' ? route.path === '/' : route.path.startsWith(to))
</script>

<template>
  <div class="min-h-dvh flex flex-col">
    <a href="#main" class="sr-only-focusable fixed top-2 left-2 z-50 btn btn-primary">{{ t('app.skip') }}</a>
    <div v-if="instance?.demo" class="border-b border-line text-ink-2 text-xs px-4 py-2 text-center">
      {{ t('app.demo') }}
      <NuxtLink to="/settings" class="underline underline-offset-2 font-semibold text-ink ms-1">{{ t('app.demoAction') }}</NuxtLink>
    </div>
    <header class="sticky top-0 z-30 bg-paper/95 backdrop-blur supports-[backdrop-filter]:bg-paper/80">
      <div class="mx-auto max-w-6xl px-4 sm:px-8 h-16 flex items-center gap-3 border-b border-line">
        <NuxtLink to="/" class="flex items-center gap-2.5 font-serif text-[1.7rem] leading-none font-medium tracking-tight shrink-0">
          <img src="/favicon.svg" alt="" width="22" height="22">
          Folio
        </NuxtLink>
        <nav :aria-label="t('nav.label')" class="ms-8 hidden md:flex items-center gap-7 overflow-x-auto self-stretch">
          <NuxtLink
            v-for="link in links" :key="link.to" :to="link.to"
            class="inline-flex items-center gap-1.5 h-full text-sm font-medium text-ink-2 transition-colors hover:text-ink aria-[current=page]:text-ink aria-[current=page]:font-semibold aria-[current=page]:shadow-[inset_0_-2px_0_var(--ink)] focus-visible:-outline-offset-2"
            :aria-current="isActive(link.to) ? 'page' : undefined"
          >
            {{ link.label }}
            <span v-if="link.count" class="rounded-full bg-accent text-accent-ink text-[0.68rem] font-semibold leading-[1.15rem] px-1.5 min-w-[1.15rem] text-center tabular-nums">{{ link.count }}</span>
          </NuxtLink>
        </nav>
        <div class="ms-auto flex items-center gap-1">
          <Button class="btn btn-ghost btn-sm" :aria-label="t('nav.chat')" @click="chatOpen = true">
            <MessageCircleQuestionIcon :size="18" aria-hidden="true" />
            <span class="hidden sm:inline">{{ t('nav.chat') }}</span>
          </Button>
          <Menu>
            <MenuTrigger class="btn btn-ghost btn-sm btn-icon" :aria-label="t('nav.scheme')">
              <SunMoonIcon :size="18" aria-hidden="true" />
            </MenuTrigger>
            <MenuContent class="popup-surface" side="bottom" align="end" :side-offset="6">
              <MenuRadioGroup :value="scheme.value" @value-change="(v: string) => colorScheme.set(v as 'system' | 'light' | 'dark')">
                <MenuGroupLabel class="eyebrow px-3 pt-2 pb-1">{{ t('nav.scheme') }}</MenuGroupLabel>
                <MenuRadioItem v-for="v in (['system', 'light', 'dark'] as const)" :key="v" :value="v">
                  <MenuItemIndicator class="w-4">✓</MenuItemIndicator>
                  {{ t(`nav.scheme${v.charAt(0).toUpperCase()}${v.slice(1)}`) }}
                </MenuRadioItem>
              </MenuRadioGroup>
              <MenuSeparator class="my-1 h-px bg-line" />
              <MenuRadioGroup :value="locale" @value-change="(v: string) => setLocale(v as 'fr' | 'en')">
                <MenuGroupLabel class="eyebrow px-3 pt-2 pb-1">{{ t('nav.language') }}</MenuGroupLabel>
                <MenuRadioItem v-for="l in locales" :key="l.code" :value="l.code">
                  <MenuItemIndicator class="w-4">✓</MenuItemIndicator>
                  {{ l.name }}
                </MenuRadioItem>
              </MenuRadioGroup>
            </MenuContent>
          </Menu>
        </div>
      </div>
    </header>
    <main id="main" class="flex-1 mx-auto w-full max-w-6xl px-4 sm:px-8 pt-8 sm:pt-12 pb-28 md:pb-20" tabindex="-1">
      <slot />
    </main>
    <nav :aria-label="t('nav.label')" class="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-line bg-paper/95 backdrop-blur pb-[env(safe-area-inset-bottom)]">
      <ul class="grid grid-cols-6">
        <li v-for="link in links" :key="link.to">
          <NuxtLink
            :to="link.to" :aria-current="isActive(link.to) ? 'page' : undefined"
            class="relative flex flex-col items-center gap-1 pt-2.5 pb-2 text-[0.6rem] tracking-tight font-medium text-ink-2 aria-[current=page]:text-ink aria-[current=page]:font-semibold aria-[current=page]:shadow-[inset_0_2px_0_var(--ink)] focus-visible:-outline-offset-2"
          >
            <component :is="link.icon" :size="20" :stroke-width="1.6" aria-hidden="true" />
            <span class="truncate max-w-full px-0.5">{{ link.label }}</span>
            <span v-if="link.count" class="absolute top-1.5 right-2.5 rounded-full bg-accent text-accent-ink text-[0.6rem] font-semibold leading-4 min-w-4 px-1 text-center tabular-nums">{{ link.count }}</span>
          </NuxtLink>
        </li>
      </ul>
    </nav>
    <ChatPanel />
  </div>
</template>
