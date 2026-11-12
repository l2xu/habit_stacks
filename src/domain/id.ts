import type { ID } from './types'

export function newId(): ID {
  return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
