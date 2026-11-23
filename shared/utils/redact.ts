const MASK = '[secret masqué]'

// Patterns for credentials that sources sometimes carry in plain text. Masked before anything is stored.
const PATTERNS: RegExp[] = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /("(?:p256dh|auth|secret|token|password|api_?key|access_?token|refresh_?token|client_?secret)"\s*:\s*")[^"]{6,}(")/gi,
  /\bhttps:\/\/[a-z0-9.-]*(?:fcm\.googleapis\.com|google\.com\/fcm|push\.services\.mozilla\.com|notify\.windows\.com|push\.apple\.com|web\.push\.apple\.com)\/[^\s"']+/gi,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{20,}\b/g,
  /\bpk_[0-9]{5,}_[A-Za-z0-9]{10,}\b/g,
  /\b(?:ntn|secret)_[A-Za-z0-9]{30,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
  /\b(Bearer\s+)[A-Za-z0-9._~+/-]{20,}=*/gi,
]

export function redactSecrets(text: string): string {
  let out = text
  for (const pattern of PATTERNS) {
    out = out.replace(pattern, (match, ...groups) => {
      const captured = groups.filter(g => typeof g === 'string') as string[]
      if (pattern.source.startsWith('("(?:p256dh') && captured.length >= 2) return `${captured[0]}${MASK}${captured[1]}`
      if (pattern.source.startsWith('\\b(Bearer') && captured.length >= 1) return `${captured[0]}${MASK}`
      return MASK
    })
  }
  return out
}
