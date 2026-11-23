<script setup lang="ts">
import { TypeIcon } from '@lucide/vue'
import { READER_FONTS, READER_SIZES, READER_THEMES, resetReaderPreferences } from '~/utils/preferences'

const { t } = useI18n()
const theme = usePreference(readerTheme)
const font = usePreference(readerFont)
const size = usePreference(readerSize)
const leading = usePreference(readerLeading)
const margins = usePreference(readerMargins)
const justify = usePreference(readerJustify)
const bold = usePreference(readerBold)
const mode = usePreference(readerMode)
const guide = usePreference(readerGuide)

const swatches: Record<string, string> = { original: '#ffffff', sepia: '#f3ead6', night: '#000000', quiet: '#4a4a4d' }
const swatchInk: Record<string, string> = { original: '#18181b', sepia: '#3b2f20', night: '#cfc9bf', quiet: '#dcdcdc' }
const sizeNumber = computed(() => Number(size.value.value))
const setSize = (n: number) => readerSize.set(String(Math.min(9, Math.max(1, Math.round(n)))) as typeof READER_SIZES[number])
</script>

<template>
  <Popover>
    <PopoverTrigger class="btn btn-ghost btn-icon" :aria-label="t('reader.settings')">
      <TypeIcon :size="20" aria-hidden="true" />
    </PopoverTrigger>
    <PopoverContent class="popup-surface w-[min(22rem,calc(100vw-1rem))] p-4 space-y-5 font-sans" side="bottom" align="end" :side-offset="8">
      <div class="flex items-center justify-between">
        <PopoverTitle class="font-serif text-2xl leading-none font-medium">{{ t('settingsReader.title') }}</PopoverTitle>
        <Button class="btn btn-sm" @click="resetReaderPreferences()">{{ t('settingsReader.reset') }}</Button>
      </div>

      <Field>
        <FieldLabel class="eyebrow">{{ t('settingsReader.theme') }}</FieldLabel>
        <SegmentedControl :value="theme.value" class="mt-2 !grid-cols-4" @value-change="(v: string | null) => v && readerTheme.set(v as typeof READER_THEMES[number])">
          <SegmentedControlIndicator />
          <SegmentedControlItem v-for="v in READER_THEMES" :key="v" :value="v" class="!min-h-14 flex flex-col items-center justify-center gap-1">
            <span class="size-7 rounded-full border border-edge grid place-items-center text-[0.8rem] font-serif" :style="{ background: swatches[v], color: swatchInk[v] }" aria-hidden="true">Aa</span>
            <span class="text-[0.72rem]">{{ t(`settingsReader.themes.${v}`) }}</span>
          </SegmentedControlItem>
        </SegmentedControl>
      </Field>

      <Field>
        <FieldLabel class="eyebrow">{{ t('settingsReader.font') }}</FieldLabel>
        <SegmentedControl :value="font.value" class="mt-2" @value-change="(v: string | null) => v && readerFont.set(v as typeof READER_FONTS[number])">
          <SegmentedControlIndicator />
          <SegmentedControlItem v-for="v in READER_FONTS" :key="v" :value="v" :class="{ 'font-serif text-[0.95rem]': v === 'system', 'font-mono': v === 'mono' }" :style="v === 'serif' ? { fontFamily: 'var(--font-reading)' } : v === 'sans' ? { fontFamily: 'var(--font-legible)' } : undefined">
            {{ t(`settingsReader.fonts.${v}`) }}
          </SegmentedControlItem>
        </SegmentedControl>
      </Field>

      <Field>
        <FieldLabel class="eyebrow">{{ t('settingsReader.size') }}</FieldLabel>
        <div class="mt-2 flex items-center gap-3">
          <Button class="btn btn-sm btn-icon text-xs" :aria-label="t('settingsReader.smaller')" :disabled="sizeNumber <= 1" @click="setSize(sizeNumber - 1)">A</Button>
          <Slider :value="sizeNumber" :min="1" :max="9" :step="1" class="flex-1" @value-change="(v: number | number[]) => setSize(Array.isArray(v) ? v[0]! : v)">
            <SliderControl>
              <SliderTrack>
                <SliderIndicator />
                <SliderThumb />
              </SliderTrack>
            </SliderControl>
          </Slider>
          <Button class="btn btn-sm btn-icon text-lg" :aria-label="t('settingsReader.larger')" :disabled="sizeNumber >= 9" @click="setSize(sizeNumber + 1)">A</Button>
        </div>
      </Field>

      <Field>
        <FieldLabel class="eyebrow">{{ t('settingsReader.leading') }}</FieldLabel>
        <SegmentedControl :value="leading.value" class="mt-2" @value-change="(v: string | null) => v && readerLeading.set(v as 'tight' | 'normal' | 'loose')">
          <SegmentedControlIndicator />
          <SegmentedControlItem v-for="v in (['tight', 'normal', 'loose'] as const)" :key="v" :value="v">{{ t(`settingsReader.leadings.${v}`) }}</SegmentedControlItem>
        </SegmentedControl>
      </Field>

      <Field>
        <FieldLabel class="eyebrow">{{ t('settingsReader.margins') }}</FieldLabel>
        <SegmentedControl :value="margins.value" class="mt-2" @value-change="(v: string | null) => v && readerMargins.set(v as 'narrow' | 'normal' | 'wide')">
          <SegmentedControlIndicator />
          <SegmentedControlItem v-for="v in (['narrow', 'normal', 'wide'] as const)" :key="v" :value="v">{{ t(`settingsReader.marginsList.${v}`) }}</SegmentedControlItem>
        </SegmentedControl>
      </Field>

      <Field>
        <FieldLabel class="eyebrow">{{ t('settingsReader.mode') }}</FieldLabel>
        <SegmentedControl :value="mode.value" class="mt-2" @value-change="(v: string | null) => v && readerMode.set(v as 'paged' | 'scroll')">
          <SegmentedControlIndicator />
          <SegmentedControlItem v-for="v in (['paged', 'scroll'] as const)" :key="v" :value="v">{{ t(`settingsReader.modes.${v}`) }}</SegmentedControlItem>
        </SegmentedControl>
      </Field>

      <div class="space-y-3">
        <Field class="flex items-center justify-between gap-3">
          <FieldLabel>{{ t('settingsReader.justify') }}</FieldLabel>
          <Switch :checked="justify.value === 'on'" @checked-change="(c: boolean) => readerJustify.set(c ? 'on' : 'off')"><SwitchThumb /></Switch>
        </Field>
        <Field class="flex items-center justify-between gap-3">
          <FieldLabel>{{ t('settingsReader.bold') }}</FieldLabel>
          <Switch :checked="bold.value === 'on'" @checked-change="(c: boolean) => readerBold.set(c ? 'on' : 'off')"><SwitchThumb /></Switch>
        </Field>
        <Field class="flex items-center justify-between gap-3">
          <div>
            <FieldLabel>{{ t('settingsReader.guide') }}</FieldLabel>
            <FieldDescription class="text-xs text-ink-2">{{ t('settingsReader.guideHint') }}</FieldDescription>
          </div>
          <Switch :checked="guide.value === 'on'" @checked-change="(c: boolean) => readerGuide.set(c ? 'on' : 'off')"><SwitchThumb /></Switch>
        </Field>
      </div>
      <PopoverClose class="btn w-full">{{ t('settingsReader.done') }}</PopoverClose>
    </PopoverContent>
  </Popover>
</template>
