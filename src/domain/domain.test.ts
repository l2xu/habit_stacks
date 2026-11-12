import { describe, expect, it } from 'vitest'
import { createFixtureWorld } from '@/test/fixtureWorld'
import { addDays, currentDay, diffDays, todayISO } from './dates'
import { completeActiveStep, createFocusSession, resumableFocus, skipActiveStep, timerElapsedSec, timerPause, timerStart } from './focus'
import { DEFAULT_RULES } from './rules'
import { createEmptyState, domainChanged, pickDomain } from './state'
import { SCHEMA_VERSION } from './types'
import { createBackup, parseBackup, validateState } from './validate'

describe('Datum', () => {
  it('rechnet über die Sommerzeit-Umstellung ohne Tage zu verlieren', () => {
    expect(addDays('2026-03-28', 1)).toBe('2026-03-29')
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30')
    expect(addDays('2026-10-24', 2)).toBe('2026-10-26')
    expect(diffDays('2026-03-30', '2026-03-28')).toBe(2)
    expect(diffDays('2026-01-01', '2025-12-31')).toBe(1)
  })

  it('zählt Nachtstunden vor der Tagesgrenze zum Vortag', () => {
    expect(todayISO(4, new Date(2026, 9, 31, 3, 30))).toBe('2026-10-30')
    expect(todayISO(4, new Date(2026, 9, 31, 4, 0))).toBe('2026-10-31')
    expect(currentDay(4, 2, new Date(2026, 9, 31, 12))).toBe('2026-11-02')
  })
})

describe('Fokus-Session', () => {
  const today = '2026-03-10'
  const demo = createFixtureWorld(today)
  const morning = demo.towers['tw-morgen']!

  it('startet beim ersten offenen Block und übernimmt heute Erledigtes', () => {
    const s = createFocusSession(morning.id, morning.blockIds, demo.habits, demo.logs, today, 0)!
    expect(s.steps.map((st) => st.status)).toEqual(['done', 'done', 'active', 'pending'])
    expect(s.activeIndex).toBe(2)
  })

  it('schreibt Logs, überspringt und schließt ab', () => {
    const start = createFocusSession(morning.id, morning.blockIds, demo.habits, demo.logs, today, 0)!
    const { session, log } = completeActiveStep(start, demo.habits['hb-dehnen']!, 1000)
    expect(log).toMatchObject({ habitId: 'hb-dehnen', date: today, durationSec: 0, sessionId: start.id })
    expect(session.activeIndex).toBe(3)

    const done = skipActiveStep(session, 2000)
    expect(done.state).toBe('completed')
    expect(done.steps.map((st) => st.status)).toEqual(['done', 'done', 'done', 'skipped'])
  })

  it('misst Timerzeit aus Zeitstempeln und kappt den Log bei der Zieldauer', () => {
    const t0 = { durationSec: 60, accumulatedSec: 0, runningSince: null }
    const running = timerStart(t0, 0)
    expect(timerElapsedSec(running, 30_000)).toBe(30)
    const paused = timerPause(running, 45_000)
    expect(timerElapsedSec(paused, 999_000)).toBe(45)

    const plank = demo.towers['tw-training']!
    const s = createFocusSession(plank.id, plank.blockIds, demo.habits, demo.logs, today, 0)!
    const atPlank = { ...s, activeIndex: 4, steps: s.steps.map((st, i) => (i === 4 ? { ...st, status: 'active' as const, timer: running } : st)) }
    expect(completeActiveStep(atPlank, demo.habits['hb-plank']!, 500_000).log.durationSec).toBe(60)
  })

  it('setzt nur laufende Sessions von heute fort', () => {
    const s = createFocusSession(morning.id, morning.blockIds, demo.habits, demo.logs, today, 0)!
    expect(resumableFocus(s, today)).toBe(s)
    expect(resumableFocus(s, addDays(today, 1))).toBeNull()
    expect(resumableFocus({ ...s, state: 'completed' }, today)).toBeNull()
  })
})

describe('Persistenz-Format', () => {
  it('akzeptiert gültige Zustände und füllt neue Einstellungen auf', () => {
    const demo = createFixtureWorld('2026-03-10')
    const r = validateState({ ...demo, settings: { sound: false } })
    expect(r.ok && r.state.settings).toMatchObject({ sound: false, dayStartsAtHour: 4 })
  })

  it('lehnt Unsinn und ältere Versionen ab und überschreibt nie neuere', () => {
    expect(validateState(null)).toEqual({ ok: false, reason: 'invalid' })
    expect(validateState({ ...createEmptyState(), towers: [] })).toEqual({ ok: false, reason: 'invalid' })
    expect(validateState({ ...createEmptyState(), schemaVersion: SCHEMA_VERSION - 1 })).toEqual({ ok: false, reason: 'invalid' })
    expect(validateState({ ...createEmptyState(), schemaVersion: SCHEMA_VERSION + 1 })).toEqual({ ok: false, reason: 'newer' })
  })

  it('nimmt die Regeln immer aus dem Code, nie aus dem Speicher', () => {
    const r = validateState({ ...createEmptyState(), rules: { ...DEFAULT_RULES, formationDays: 27 } })
    expect(r.ok && r.state.rules).toBe(DEFAULT_RULES)
  })

  it('übersteht einen Backup-Roundtrip', () => {
    const demo = createFixtureWorld('2026-03-10')
    const r = parseBackup(JSON.stringify(createBackup(demo)))
    expect(r.ok && r.state).toEqual(demo)
    expect(parseBackup('{"app":"andere-app"}').ok).toBe(false)
  })

  it('erkennt Änderungen nur an persistierten Feldern', () => {
    const demo = createFixtureWorld('2026-03-10')
    expect(domainChanged(demo, pickDomain(demo))).toBe(false)
    expect(domainChanged(demo, { ...demo, events: [] })).toBe(true)
  })
})
