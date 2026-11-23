<script setup lang="ts">
import { toast } from '@ui-sdk/vue/toast'
import type { FolioSettings } from '~~/shared/types/folio'

interface SettingsPayload {
  settings: FolioSettings
  sources: { kind: string, label: string, docsUrl: string, configured: boolean, enabled: boolean, envVars: { name: string, required: boolean, description: string }[] }[]
  ingest: { protected: boolean, cronProtected: boolean }
  ai: { available: boolean, provider: string | null }
  deliveries: { id: number, event: string, target: string, status: string, code: number | null, at: string }[]
}

const { t, locale, locales, setLocale } = useI18n()
useHead({ title: () => t('settings.title') })
const { data, refresh } = await useFetch<SettingsPayload>('/api/settings')
const { data: instance } = await useInstance()
const formatDate = useFormatDate()
const agentsMode = usePreference(webmcpMode)

const form = reactive({ digestTime: '', timezone: '', model: '', reportLanguage: 'fr' as 'fr' | 'en' })
watchEffect(() => {
  if (!data.value) return
  Object.assign(form, { digestTime: data.value.settings.digestTime, timezone: data.value.settings.timezone, model: data.value.settings.model, reportLanguage: data.value.settings.reportLanguage })
})
const timezones = computed(() => {
  const list = typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  return list.includes(form.timezone) ? list : [form.timezone, ...list]
})

async function save() {
  try {
    await $fetch('/api/settings', { method: 'PUT', body: form })
    await refresh()
    toast.success(t('settings.saved'))
  }
  catch (error) {
    toast.error((error as { data?: { message?: string } }).data?.message ?? t('common.error'))
  }
}
async function toggleSource(kind: string, enabled: boolean) {
  await $fetch('/api/settings', { method: 'PUT', body: { sources: { [kind]: enabled } } })
  await refresh()
}
async function testSource(kind: string) {
  const id = toast.loading(t('common.loading'))
  const result = await $fetch<{ ok: boolean, message: string }>(`/api/sources/${kind}/test`, { method: 'POST' })
  if (result.ok) toast.success(t('settings.testOk'), { id, description: result.message })
  else toast.error(t('settings.testFail', { message: result.message === 'not_configured' ? t('settings.notConfigured') : result.message }), { id })
}

const webhook = reactive({ url: '', events: ['book.published', 'needs_you.created', 'digest.failed'] as string[] })
async function addWebhook() {
  await $fetch('/api/settings', { method: 'PUT', body: { addWebhook: { url: webhook.url, events: webhook.events } } })
  webhook.url = ''
  await refresh()
  toast.success(t('settings.saved'))
}
async function removeWebhook(id: string) {
  await $fetch('/api/settings', { method: 'PUT', body: { removeWebhook: id } })
  await refresh()
}
async function testWebhooks() {
  await $fetch('/api/webhooks/test', { method: 'POST' })
  await refresh()
}

const running = ref(false)
async function runNow() {
  running.value = true
  try {
    await $fetch('/api/digest', { method: 'POST', body: {} })
    toast.success(t('settings.runDone'))
    await refresh()
  }
  catch {
    toast.error(t('common.error'))
  }
  finally {
    running.value = false
  }
}
async function resetInstance() {
  await $fetch('/api/demo', { method: 'DELETE' })
  toast.success(t('settings.resetDone'))
  await navigateTo('/', { external: true })
}
const eventsList = ['book.published', 'needs_you.created', 'digest.failed'] as const
</script>

<template>
  <div v-if="data" class="max-w-3xl space-y-12">
    <h1 class="display text-5xl sm:text-6xl">{{ t('settings.title') }}</h1>

    <section class="space-y-5 border-t border-line pt-8" aria-labelledby="s-digest">
      <h2 id="s-digest" class="font-serif text-[1.9rem] leading-tight font-normal tracking-tight">{{ t('settings.digest') }}</h2>
      <form class="grid gap-x-8 gap-y-6 sm:grid-cols-2" @submit.prevent="save">
        <Field>
          <FieldLabel class="eyebrow">{{ t('settings.digestTime') }}</FieldLabel>
          <TimeInput :value="form.digestTime" class="field-input mt-2 flex items-center" @value-change="(v: string | null) => v && (form.digestTime = v.slice(0, 5))" />
          <FieldDescription class="text-xs text-ink-2 mt-1.5 leading-relaxed">{{ t('settings.digestHelp') }}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel class="eyebrow">{{ t('settings.timezone') }}</FieldLabel>
          <Combobox v-model="form.timezone" :items="timezones">
            <ComboboxInput class="field-input mt-2" />
            <ComboboxContent class="popup-surface max-h-72 overflow-auto p-1" />
          </Combobox>
        </Field>
        <Field class="sm:col-span-2">
          <FieldLabel class="eyebrow">{{ t('settings.model') }}</FieldLabel>
          <Input v-model="form.model" class="field-input mt-2 font-mono" />
          <FieldDescription class="text-xs text-ink-2 mt-1.5 leading-relaxed">{{ t('settings.modelHelp') }} {{ data.ai.available ? t('settings.aiOn', { provider: data.ai.provider }) : t('settings.aiOff') }}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel class="eyebrow">{{ t('settings.language') }}</FieldLabel>
          <SegmentedControl v-model:value="form.reportLanguage" class="mt-2">
            <SegmentedControlIndicator />
            <SegmentedControlItem value="fr">Français</SegmentedControlItem>
            <SegmentedControlItem value="en">English</SegmentedControlItem>
          </SegmentedControl>
        </Field>
        <Field>
          <FieldLabel class="eyebrow">{{ t('settings.languageUi') }}</FieldLabel>
          <SegmentedControl :value="locale" class="mt-2" @value-change="(v: string | null) => v && setLocale(v as 'fr' | 'en')">
            <SegmentedControlIndicator />
            <SegmentedControlItem v-for="l in locales" :key="l.code" :value="l.code">{{ l.name }}</SegmentedControlItem>
          </SegmentedControl>
        </Field>
        <p v-if="instance?.vercel" class="sm:col-span-2 text-xs text-ink-2">{{ t('settings.vercelCron') }}</p>
        <div class="sm:col-span-2 flex flex-wrap gap-2 justify-end">
          <Button type="button" class="btn" :disabled="running" @click="runNow">{{ running ? t('settings.running') : t('settings.runNow') }}</Button>
          <Button type="submit" class="btn btn-primary">{{ t('settings.save') }}</Button>
        </div>
      </form>
    </section>

    <section class="space-y-5 border-t border-line pt-8" aria-labelledby="s-sources">
      <div>
        <h2 id="s-sources" class="font-serif text-[1.9rem] leading-tight font-normal tracking-tight">{{ t('settings.sources') }}</h2>
        <p class="text-sm text-ink-2 mt-1">{{ t('settings.sourcesIntro') }}</p>
      </div>
      <ul class="divide-y divide-line border-y border-line">
        <li v-for="source in data.sources" :key="source.kind" class="py-4 flex flex-wrap items-center gap-x-4 gap-y-3">
          <div class="flex-1 min-w-52">
            <p class="font-semibold flex flex-wrap items-center gap-x-3">{{ source.label }} <span class="chip" :data-status="source.configured ? 'done' : 'info'">{{ source.configured ? t('settings.configured') : t('settings.notConfigured') }}</span></p>
            <p class="text-[0.72rem] text-ink-2 mt-1.5 font-mono break-words">{{ t('settings.envVars', { vars: source.envVars.map(v => v.name).join(', ') }) }}</p>
          </div>
          <Field class="flex items-center gap-2">
            <FieldLabel class="text-sm">{{ t('settings.enabled') }}</FieldLabel>
            <Switch :checked="source.enabled" :aria-label="`${t('settings.enabled')} : ${source.label}`" @checked-change="(c: boolean) => toggleSource(source.kind, c)"><SwitchThumb /></Switch>
          </Field>
          <Button class="btn btn-sm" :aria-label="`${t('settings.test')} ${source.label}`" @click="testSource(source.kind)">{{ t('settings.test') }}</Button>
          <a :href="source.docsUrl" target="_blank" rel="noreferrer" class="text-sm font-medium text-accent underline underline-offset-4 decoration-1">{{ t('settings.docs') }}</a>
        </li>
        <li class="py-4">
          <p class="font-semibold">{{ t('settings.otherSources') }}</p>
          <p class="text-sm text-ink-2 mt-1">{{ t('settings.otherSourcesHelp') }}</p>
        </li>
      </ul>
    </section>

    <section class="space-y-4 border-t border-line pt-8" aria-labelledby="s-ingest">
      <h2 id="s-ingest" class="font-serif text-[1.9rem] leading-tight font-normal tracking-tight">{{ t('settings.ingest') }}</h2>
      <p class="border-s-2 ps-4 py-1 text-sm" :class="data.ingest.protected ? 'border-done' : 'border-waiting'" data-agent-hidden>{{ data.ingest.protected ? t('settings.ingestOn') : t('settings.ingestOff') }}</p>
      <p class="text-sm text-ink-2">{{ instance?.persistent ? t('settings.persistentOn') : t('settings.persistentOff') }}</p>
    </section>

    <section class="space-y-5 border-t border-line pt-8" aria-labelledby="s-webhooks">
      <div>
        <h2 id="s-webhooks" class="font-serif text-[1.9rem] leading-tight font-normal tracking-tight">{{ t('settings.webhooks') }}</h2>
        <p class="text-sm text-ink-2 mt-1">{{ t('settings.webhooksHelp') }}</p>
      </div>
      <ul class="divide-y divide-line border-y border-line" data-agent-hidden>
        <li v-if="!data?.settings.webhooks.length" class="py-4 text-sm text-ink-2">{{ t('settings.noWebhooks') }}</li>
        <li v-for="hook in data?.settings.webhooks" :key="hook.id" class="py-4 flex flex-wrap items-center gap-3">
          <span class="font-mono text-sm flex-1 min-w-40 break-all">{{ hook.url }}</span>
          <span class="text-xs text-ink-2">{{ hook.events.map(e => t(`settings.events.${e.replace('.', '_')}`)).join(', ') }}</span>
          <Button class="btn btn-sm btn-danger" :aria-label="t('settings.removeWebhook')" @click="removeWebhook(hook.id)">{{ t('reader.delete') }}</Button>
        </li>
      </ul>
      <form class="space-y-5" data-agent-confirm="Ajoute un webhook sortant" @submit.prevent="addWebhook">
        <Field data-agent-secret>
          <FieldLabel class="eyebrow">{{ t('settings.webhookUrl') }}</FieldLabel>
          <Input v-model="webhook.url" type="url" required class="field-input mt-2 font-mono" placeholder="https://" />
        </Field>
        <Field>
          <FieldLabel class="eyebrow">{{ t('settings.webhookEvents') }}</FieldLabel>
          <CheckboxGroup v-model:value="webhook.events" class="mt-2.5 flex flex-wrap gap-x-6 gap-y-3">
            <label v-for="e in eventsList" :key="e" class="inline-flex items-center gap-2 text-sm">
              <Checkbox :value="e" class="size-[1.15rem] rounded-[3px] border border-edge grid place-items-center cursor-pointer data-checked:bg-accent data-checked:border-accent"><CheckboxIndicator class="text-accent-ink text-[0.7rem] leading-none font-semibold">✓</CheckboxIndicator></Checkbox>
              {{ t(`settings.events.${e.replace('.', '_')}`) }}
            </label>
          </CheckboxGroup>
        </Field>
        <div class="flex justify-end gap-2">
          <Button type="button" class="btn" :disabled="!data?.settings.webhooks.length" @click="testWebhooks">{{ t('settings.testWebhooks') }}</Button>
          <Button type="submit" class="btn btn-primary" :disabled="!webhook.url || !webhook.events.length">{{ t('settings.addWebhook') }}</Button>
        </div>
      </form>
      <div v-if="data?.deliveries.length" class="text-sm">
        <h3 class="eyebrow mb-2">{{ t('settings.deliveries') }}</h3>
        <ul class="space-y-1 text-ink-2">
          <li v-for="d in data?.deliveries" :key="d.id"><span :class="d.status === 'ok' ? 'text-done' : 'text-blocked'" class="font-semibold">{{ d.status }}{{ d.code ? ` ${d.code}` : '' }}</span> · {{ t(`settings.events.${d.event.replace('.', '_')}`) }} · {{ d.target }} · {{ formatDate(d.at) }}</li>
        </ul>
      </div>
    </section>

    <section class="space-y-4 border-t border-line pt-8" aria-labelledby="s-agents">
      <h2 id="s-agents" class="font-serif text-[1.9rem] leading-tight font-normal tracking-tight">{{ t('settings.agents') }}</h2>
      <p class="text-sm text-ink-2">{{ t('settings.agentsHelp') }}</p>
      <Field data-agent-confirm="Change ce que les agents du navigateur ont le droit de faire">
        <FieldLabel class="sr-only">{{ t('settings.agents') }}</FieldLabel>
        <SegmentedControl :value="agentsMode.value" @value-change="(v: string | null) => v && webmcpMode.set(v as 'ask' | 'marked' | 'off')">
          <SegmentedControlIndicator />
          <SegmentedControlItem v-for="m in (['ask', 'marked', 'off'] as const)" :key="m" :value="m">{{ t(`settings.agentsModes.${m}`) }}</SegmentedControlItem>
        </SegmentedControl>
      </Field>
    </section>

    <section class="space-y-4 border-t border-line pt-8" aria-labelledby="s-danger">
      <h2 id="s-danger" class="font-serif text-[1.9rem] leading-tight font-normal tracking-tight">{{ t('settings.danger') }}</h2>
      <div class="flex flex-wrap items-center gap-4 justify-between">
        <p class="text-sm text-ink-2 max-w-md">{{ t('settings.resetDesc') }}</p>
        <AlertDialog>
          <AlertDialogTrigger class="btn btn-danger">{{ t('settings.reset') }}</AlertDialogTrigger>
          <AlertDialogBackdrop class="fixed inset-0" />
          <AlertDialogContent>
            <AlertDialogTitle>{{ t('settings.reset') }} ?</AlertDialogTitle>
            <AlertDialogDescription>{{ t('settings.resetDesc') }}</AlertDialogDescription>
            <div class="flex justify-end">
              <AlertDialogClose class="btn">{{ t('reader.cancel') }}</AlertDialogClose>
              <AlertDialogClose value="confirm" class="btn btn-primary" :data-agent-confirm="t('settings.resetConfirm')" @click="resetInstance">{{ t('settings.resetConfirm') }}</AlertDialogClose>
            </div>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </section>
  </div>
</template>
