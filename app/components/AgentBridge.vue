<script setup lang="ts">
import { confirm } from '@ui-sdk/vue/alert-dialog'
import { createAgent, registerTools } from '@ui-sdk/vue/agent'

const { t } = useI18n()
const mode = usePreference(webmcpMode)

const ask = (text: string) => confirm({ title: t('settings.agents'), description: text, confirmLabel: 'OK' })

const agent = createAgent({
  allow: (step) => {
    if (mode.value.value === 'off') return false
    if (step.confirm) return ask(step.confirm)
    if (mode.value.value === 'ask') return ask(`${step.action} → ${step.label ?? step.component}${step.args?.length ? ` (${step.args.join(', ')})` : ''}`)
    return true
  },
})

let unregister: (() => void) | null = null
watchEffect(() => {
  unregister?.()
  unregister = mode.value.value === 'off' ? null : registerTools(agent, { allow: () => true })
})
onBeforeUnmount(() => unregister?.())

Object.assign(window, { folioAgent: agent })
</script>

<template>
  <span hidden />
</template>
