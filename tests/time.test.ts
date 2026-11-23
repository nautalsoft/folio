import { describe, expect, it } from 'vitest'
import { dayBounds, dayIn, parseTime, shiftDay, zonedToUtc } from '../shared/utils/time'

describe('time helpers', () => {
  it('computes local day bounds across a DST change', () => {
    const { start, end } = dayBounds('2026-10-25', 'Europe/Paris')
    expect(start.toISOString()).toBe('2026-10-24T22:00:00.000Z')
    expect(end.toISOString()).toBe('2026-10-25T23:00:00.000Z')
  })
  it('converts a local time to UTC', () => {
    expect(zonedToUtc('2026-11-23', '18:00', 'Europe/Paris').toISOString()).toBe('2026-11-23T17:00:00.000Z')
  })
  it('reads the local day', () => {
    expect(dayIn('Asia/Tokyo', new Date('2026-11-23T20:00:00Z'))).toBe('2026-11-24')
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28')
  })
  it('parses Postgres timestamps', () => {
    expect(parseTime('2026-11-23 01:42:27.643+00')?.toISOString()).toBe('2026-11-23T01:42:27.643Z')
  })
})
