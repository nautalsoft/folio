export function dayIn(timeZone: string, date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date)
  const get = (type: string) => parts.find(p => p.type === type)!.value
  return `${get('year')}-${get('month')}-${get('day')}`
}

export function timeIn(timeZone: string, date: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date)
}

function offsetMinutes(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(date)
  const get = (type: string) => Number(parts.find(p => p.type === type)!.value)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return Math.round((asUtc - date.getTime()) / 60000)
}

export function zonedToUtc(day: string, time: string, timeZone: string): Date {
  const [y, m, d] = day.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const guess = new Date(Date.UTC(y!, m! - 1, d!, hh!, mm!))
  const first = new Date(guess.getTime() - offsetMinutes(timeZone, guess) * 60000)
  return new Date(guess.getTime() - offsetMinutes(timeZone, first) * 60000)
}

export function dayBounds(day: string, timeZone: string): { start: Date, end: Date } {
  const start = zonedToUtc(day, '00:00', timeZone)
  const next = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) + 1))
  const end = zonedToUtc(next.toISOString().slice(0, 10), '00:00', timeZone)
  return { start, end }
}

export function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

export const isDay = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
export const isMonth = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}$/.test(value)

export function parseTime(value: string | null | undefined): Date | null {
  if (!value) return null
  const normalized = /^\d{4}-\d{2}-\d{2} /.test(value) ? value.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00') : value
  const date = new Date(normalized)
  return Number.isNaN(date.getTime()) ? null : date
}
