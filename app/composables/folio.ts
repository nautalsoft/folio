import type { ActivityEvent } from '~~/shared/types/folio'

export interface InstanceInfo { demo: boolean, ai: boolean, ingestProtected: boolean, persistent: boolean, vercel: boolean, version: string }

export function useInstance() {
  return useFetch<InstanceInfo>('/api/instance', { key: 'instance', dedupe: 'defer' })
}

export interface ReadingContext {
  bookSlug: string | null
  bookTitle: string | null
  chapterId: string | null
  chapterTitle: string | null
  selection: string | null
}

export function useReadingContext() {
  const ctx = useState<ReadingContext>('reading-context', () => ({ bookSlug: null, bookTitle: null, chapterId: null, chapterTitle: null, selection: null }))
  if (import.meta.client && !useState('reading-context-restored').value) {
    useState('reading-context-restored').value = true
    try {
      const saved = sessionStorage.getItem('folio-reading-context')
      if (saved) ctx.value = { ...ctx.value, ...JSON.parse(saved) }
    }
    catch {}
    watch(ctx, (value) => {
      try {
        sessionStorage.setItem('folio-reading-context', JSON.stringify(value))
      }
      catch {}
    }, { deep: true })
  }
  return ctx
}

export function useChatOpen() {
  return useState('chat-open', () => false)
}

export function useRelativeTime() {
  const { t, locale } = useI18n()
  return (value: string | null | undefined) => {
    const date = parseTime(value)
    if (!date) return ''
    const minutes = Math.round((Date.now() - date.getTime()) / 60000)
    if (minutes < 1) return t('time.justNow')
    if (minutes < 60) return t('time.minutes', { n: minutes })
    if (minutes < 60 * 24) return t('time.hours', { n: Math.round(minutes / 60) })
    if (minutes < 60 * 24 * 7) return t('time.days', { n: Math.round(minutes / 1440) })
    return date.toLocaleDateString(locale.value)
  }
}

export function useFormatDate() {
  const { locale } = useI18n()
  return (value: string | null | undefined, options: Intl.DateTimeFormatOptions = { dateStyle: 'medium', timeStyle: 'short' }) => {
    const date = parseTime(value)
    return date ? new Intl.DateTimeFormat(locale.value, options).format(date) : ''
  }
}

export function formatDuration(seconds: number, locale: string) {
  const minutes = Math.max(0, Math.round(seconds / 60))
  if (minutes < 60) return new Intl.NumberFormat(locale, { style: 'unit', unit: 'minute', unitDisplay: 'short' }).format(minutes)
  return new Intl.NumberFormat(locale, { style: 'unit', unit: 'hour', unitDisplay: 'short', maximumFractionDigits: 1 }).format(minutes / 60)
}

export type { ActivityEvent }
