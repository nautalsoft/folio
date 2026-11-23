import type { CollectorKind } from '../../shared/types/folio'
import { board } from './board'
import { clickup } from './clickup'
import { github } from './github'
import { notion } from './notion'
import { slack } from './slack'
import type { Collector } from './types'
import { vercel } from './vercel'

export const collectors: Record<CollectorKind, Collector> = { board, github, vercel, slack, clickup, notion }
