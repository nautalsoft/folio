import { createColorScheme, createLocalStorage, createPreference } from '@ui-sdk/core'

const pref = <V extends string>(name: string, values: readonly V[], defaultValue: V) => createPreference({
  values: values as V[],
  defaultValue,
  attribute: `data-${name}`,
  global: true,
  storage: createLocalStorage(`folio-${name}`),
})

export const colorScheme = createColorScheme({ global: true, storage: createLocalStorage('folio-color-scheme') })

export const READER_THEMES = ['original', 'sepia', 'night', 'quiet'] as const
export const READER_FONTS = ['serif', 'system', 'sans', 'mono'] as const
export const READER_SIZES = ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as const

export const readerTheme = pref('reader-theme', READER_THEMES, 'original')
export const readerFont = pref('reader-font', READER_FONTS, 'serif')
export const readerSize = pref('reader-size', READER_SIZES, '4')
export const readerLeading = pref('reader-leading', ['tight', 'normal', 'loose'] as const, 'normal')
export const readerMargins = pref('reader-margins', ['narrow', 'normal', 'wide'] as const, 'normal')
export const readerJustify = pref('reader-justify', ['off', 'on'] as const, 'off')
export const readerBold = pref('reader-bold', ['off', 'on'] as const, 'off')
export const readerMode = pref('reader-mode', ['paged', 'scroll'] as const, 'paged')
export const readerGuide = pref('reader-guide', ['off', 'on'] as const, 'off')
export const webmcpMode = pref('webmcp', ['ask', 'marked', 'off'] as const, 'ask')

export const readerPreferences = [readerTheme, readerFont, readerSize, readerLeading, readerMargins, readerJustify, readerBold, readerMode, readerGuide]
export const allPreferences = [colorScheme, ...readerPreferences, webmcpMode]

export function resetReaderPreferences() {
  readerTheme.set('original')
  readerFont.set('serif')
  readerSize.set('4')
  readerLeading.set('normal')
  readerMargins.set('normal')
  readerJustify.set('off')
  readerBold.set('off')
  readerMode.set('paged')
  readerGuide.set('off')
}
