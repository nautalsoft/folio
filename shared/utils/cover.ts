import type { CoverSpec } from '../types/folio'

// One collection, eight cloths. Ordered so that consecutive days never look alike on a shelf.
const PALETTES = [
  { bg: '#22349f', fg: '#f6f3ea', accent: '#4f63d6' },
  { bg: '#ece8dc', fg: '#1a1b22', accent: '#c8412b' },
  { bg: '#1e4a3b', fg: '#f3efe2', accent: '#3b7a62' },
  { bg: '#d9a531', fg: '#1a1b22', accent: '#b98718' },
  { bg: '#6a1d2b', fg: '#f6ece4', accent: '#9b3b4d' },
  { bg: '#c9d3d6', fg: '#16202a', accent: '#a3b3b8' },
  { bg: '#1a1b22', fg: '#f1eee6', accent: '#3d4050' },
  { bg: '#b83a25', fg: '#fff6ec', accent: '#d85f49' },
]

const SERIF = `'Iowan Old Style', 'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, 'Times New Roman', serif`
const SANS = `'Helvetica Neue', Helvetica, Arial, system-ui, sans-serif`

function hash(value: string) {
  let h = 2166136261
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const escape = (value: string) => value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' })[c]!)

function wrap(text: string, max: number, maxLines = 4): string[] {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/)) {
    if ((line + ' ' + word).trim().length > max && line) {
      lines.push(line)
      line = word
    }
    else line = (line + ' ' + word).trim()
  }
  if (line) lines.push(line)
  return lines.slice(0, maxLines)
}

export function coverPalette(seed: string) {
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(seed)
  const index = date ? Math.floor(Date.UTC(+date[1]!, +date[2]! - 1, +date[3]!) / 86_400_000) : hash(seed)
  return PALETTES[index % PALETTES.length]!
}

export function renderCoverSvg(spec: CoverSpec, labels: { incomplete: string } = { incomplete: 'incomplet' }): string {
  const p = coverPalette(spec.seed)
  const W = 600
  const H = 900
  const month = spec.kind === 'month'
  const x = month ? W / 2 : 48
  const anchor = month ? ' text-anchor="middle"' : ''
  const text = (y: number, size: number, family: string, value: string, extra = '') =>
    `<text x="${x}" y="${y}"${anchor} font-family="${family}" font-size="${size}" fill="${p.fg}"${extra}>${escape(value)}</text>`

  const titleLines = wrap(spec.title, month ? 16 : 14)
  const titleY = month ? 268 : 196
  const title = titleLines.map((line, i) => text(titleY + i * 72, 66, SERIF, line, ' letter-spacing="-1"')).join('')
  const subtitle = text(titleY + titleLines.length * 72 - 18, 23, SANS, spec.subtitle)

  // The figure of the collection: the day's number, or the month's initial.
  const figure = month ? spec.title.trim().charAt(0).toLocaleUpperCase() : (/\d{1,2}/.exec(spec.title)?.[0] ?? spec.title.trim().charAt(0).toLocaleUpperCase())
  const figureSvg = month
    ? `<text x="${W / 2}" y="716" text-anchor="middle" font-family="${SERIF}" font-size="250" font-style="italic" fill="${p.accent}">${escape(figure)}</text>`
    : `<text x="${W - 44}" y="792" text-anchor="end" font-family="${SERIF}" font-size="360" letter-spacing="-12" fill="${p.accent}">${escape(figure)}</text>`

  const frame = month
    ? `<rect x="26" y="26" width="${W - 52}" height="${H - 52}" fill="none" stroke="${p.fg}" stroke-width="2.5"/><rect x="37" y="37" width="${W - 74}" height="${H - 74}" fill="none" stroke="${p.fg}" stroke-width="1"/>`
    : `<rect x="48" y="96" width="${W - 96}" height="3" fill="${p.fg}"/><rect x="48" y="812" width="${W - 96}" height="1" fill="${p.fg}"/>`

  const nameLines = wrap(spec.agents.slice(0, 6).map(a => a.name.toLocaleUpperCase()).join(' · '), 36, 2)
  const names = nameLines.map((line, i) => text((month ? 798 : 846) + i * 26, 16, SANS, line, ' font-weight="600" letter-spacing="2.4"')).join('')

  const ribbonWidth = labels.incomplete.length * 12.5 + 30
  const ribbonX = month ? (W - ribbonWidth) / 2 : W - 48 - ribbonWidth
  const ribbonY = month ? 128 : 46
  const ribbon = spec.incomplete
    ? `<g><rect x="${ribbonX}" y="${ribbonY}" width="${ribbonWidth}" height="34" fill="${p.fg}"/><text x="${ribbonX + ribbonWidth / 2}" y="${ribbonY + 23}" text-anchor="middle" font-family="${SANS}" font-size="16" font-weight="700" letter-spacing="2" fill="${p.bg}">${escape(labels.incomplete.toLocaleUpperCase())}</text></g>`
    : ''

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${escape(spec.title)}"><title>${escape(spec.title)}</title>`
    + `<rect width="${W}" height="${H}" fill="${p.bg}"/>`
    + figureSvg
    + frame
    + text(month ? 104 : 72, 17, SANS, 'FOLIO', ' font-weight="700" letter-spacing="6"')
    + title
    + subtitle
    + names
    + ribbon
    + `</svg>`
}
