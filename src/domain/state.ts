import { DEFAULT_RULES, DEFAULT_SETTINGS } from './rules'
import { SCHEMA_VERSION, type DomainState } from './types'

/** Alle Felder, die persistiert werden – der Rest des Stores ist UI und Actions. */
export const DOMAIN_KEYS = [
  'schemaVersion',
  'towers',
  'towerOrder',
  'habits',
  'logs',
  'events',
  'focus',
  'settings',
  'rules',
  'lastEvaluatedOn',
] as const satisfies readonly (keyof DomainState)[]

export function createEmptyState(settings = DEFAULT_SETTINGS): DomainState {
  return {
    schemaVersion: SCHEMA_VERSION,
    towers: {},
    towerOrder: [],
    habits: {},
    logs: {},
    events: [],
    focus: null,
    settings,
    rules: DEFAULT_RULES,
    lastEvaluatedOn: null,
  }
}

export function pickDomain(s: DomainState): DomainState {
  return Object.fromEntries(DOMAIN_KEYS.map((k) => [k, s[k]])) as unknown as DomainState
}

/** Hat sich ein persistiertes Feld geändert? (Referenzvergleich – der Store ist immutabel.) */
export const domainChanged = (a: DomainState, b: DomainState) => DOMAIN_KEYS.some((k) => a[k] !== b[k])
