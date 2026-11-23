import { describe, expect, it } from 'vitest'
import { redactSecrets } from '../shared/utils/redact'

describe('redactSecrets', () => {
  it('masks a web push subscription', () => {
    const text = '{"endpoint":"https://fcm.googleapis.com/fcm/send/fake-device:FAKEFAKEFAKE000","keys":{"p256dh":"FAKEp256dhFAKEp256dhFAKE0000000","auth":"FAKEauthFAKEauth000000"}}'
    const out = redactSecrets(text)
    expect(out).not.toContain('FAKEFAKEFAKE000')
    expect(out).not.toContain('FAKEp256dh')
    expect(out).not.toContain('FAKEauth')
    expect(out).toContain('"p256dh":"[secret masqué]"')
  })
  it('masks common tokens and keeps ordinary text', () => {
    const fake = ['ghp_', 'a'.repeat(36)].join('')
    const out = redactSecrets(`token ${fake} and xoxb-${'1'.repeat(12)}-abc, Bearer ${'z'.repeat(30)}; PR #42 merged`)
    expect(out).not.toContain(fake)
    expect(out).not.toContain('xoxb-1111')
    expect(out).toContain('Bearer [secret masqué]')
    expect(out).toContain('PR #42 merged')
  })
})
