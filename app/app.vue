<script setup lang="ts">
import { allPreferences } from '~/utils/preferences'
const { t, locale } = useI18n()
useHead({
  htmlAttrs: { lang: locale },
  titleTemplate: title => (title ? `${title} · Folio` : 'Folio'),
  meta: [{ name: 'description', content: () => t('app.tagline') }],
})
</script>

<template>
  <Preferences :preferences="allPreferences">
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <ToastRegion>
      <template #default="{ toast: item }">
        <Toast>
          <ToastTitle />
          <ToastDescription />
          <ToastAction v-if="item.action" />
        </Toast>
      </template>
    </ToastRegion>
    <OverlayHost />
    <ClientOnly>
      <AgentBridge />
    </ClientOnly>
  </Preferences>
</template>
