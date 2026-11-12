import { DEFAULT_RULES, DEFAULT_SETTINGS } from './rules'
import { SCHEMA_VERSION, type BackupFile, type DomainState } from './types'

export type ValidateResult = { ok: true; state: DomainState } | { ok: false; reason: 'invalid' | 'newer' }

type Raw = Record<string, unknown>

const isObject = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v)

function looksLikeDomainState(s: Raw): boolean {
  return (
    isObject(s.towers) &&
    Array.isArray(s.towerOrder) &&
    isObject(s.habits) &&
    isObject(s.logs) &&
    Array.isArray(s.events) &&
    (s.focus === null || isObject(s.focus)) &&
    (s.lastEvaluatedOn === null || typeof s.lastEvaluatedOn === 'string')
  )
}

/**
 * Prüft gespeicherte Rohdaten. Es gibt keine Migrationen: Nur die aktuelle `SCHEMA_VERSION` wird gelesen,
 * neuere Versionen werden nie überschrieben.
 */
export function validateState(raw: unknown): ValidateResult {
  if (!isObject(raw) || typeof raw.schemaVersion !== 'number') return { ok: false, reason: 'invalid' }
  if (raw.schemaVersion > SCHEMA_VERSION) return { ok: false, reason: 'newer' }
  if (raw.schemaVersion < SCHEMA_VERSION || !looksLikeDomainState(raw)) return { ok: false, reason: 'invalid' }

  const state = raw as unknown as DomainState
  return {
    ok: true,
    state: {
      ...state,
      // Neu hinzugekommene Einstellungen mit Standardwerten auffüllen.
      settings: { ...DEFAULT_SETTINGS, ...state.settings },
      // Regeln kommen immer aus dem Code – eine Regeländerung braucht so keine neue Schema-Version.
      rules: DEFAULT_RULES,
    },
  }
}

export function createBackup(state: DomainState, nowMs = Date.now()): BackupFile {
  return { app: 'habit-stacks', exportedAt: new Date(nowMs).toISOString(), state }
}

export function parseBackup(text: string): ValidateResult {
  try {
    const file: unknown = JSON.parse(text)
    if (!isObject(file) || file.app !== 'habit-stacks') return { ok: false, reason: 'invalid' }
    return validateState(file.state)
  } catch {
    return { ok: false, reason: 'invalid' }
  }
}
