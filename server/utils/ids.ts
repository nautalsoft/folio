import { createHash, randomUUID } from 'node:crypto'

export const newId = (prefix: string) => `${prefix}_${randomUUID().replace(/-/g, '').slice(0, 16)}`
export const hashId = (prefix: string, ...parts: string[]) => `${prefix}_${createHash('sha256').update(parts.join('\u0000')).digest('hex').slice(0, 16)}`
export const slugify = (value: string) => value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'agent'
