<script setup lang="ts">
import type { NuxtError } from '#app'

const props = defineProps<{ error: NuxtError }>()
const { t } = useI18n()
</script>

<template>
  <NuxtLayout name="default">
    <div class="max-w-xl space-y-5 py-12">
      <p class="eyebrow text-accent">{{ props.error.statusCode }}</p>
      <h1 class="display text-5xl sm:text-6xl">{{ props.error.statusCode === 404 ? t('common.notFound') : t('common.error') }}</h1>
      <Button class="btn btn-primary" @click="clearError({ redirect: '/' })">{{ t('nav.home') }}</Button>
    </div>
  </NuxtLayout>
</template>
