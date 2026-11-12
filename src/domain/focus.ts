import { newId } from './id'
import type { FocusSession, FocusStep, Habit, HabitLog, ID, ISODate, LogKey, TimerState } from './types'

/** Reine Funktionen für den Fokus-Modus. Der Store verbindet sie nur mit dem Zustand. */

// ───────────────────────────── Timer ─────────────────────────────

/** Gelaufene Sekunden – aus Zeitstempeln berechnet, daher robust gegen Hintergrund und Reload. */
export function timerElapsedSec(t: TimerState, nowMs: number): number {
  const running = t.runningSince ? (nowMs - Date.parse(t.runningSince)) / 1000 : 0
  return t.accumulatedSec + Math.max(0, running)
}

export const timerStart = (t: TimerState, nowMs: number): TimerState =>
  t.runningSince ? t : { ...t, runningSince: new Date(nowMs).toISOString() }

export const timerPause = (t: TimerState, nowMs: number): TimerState =>
  t.runningSince ? { ...t, accumulatedSec: timerElapsedSec(t, nowMs), runningSince: null } : t

export const timerIsUp = (t: TimerState, nowMs: number) => timerElapsedSec(t, nowMs) >= t.durationSec

// ───────────────────────────── Session ─────────────────────────────

/**
 * Neue Abarbeitung eines Turms von unten nach oben. Heute schon erledigte Blöcke
 * starten als 'done', ein Geist, der erst morgen startet, fehlt. Gibt null zurück, wenn nichts mehr offen ist.
 */
export function createFocusSession(
  towerId: ID,
  blockIds: ID[],
  habits: Record<ID, Habit>,
  logs: Record<LogKey, HabitLog>,
  date: ISODate,
  nowMs: number,
): FocusSession | null {
  const steps: FocusStep[] = blockIds.flatMap((id) => {
    const habit = habits[id]
    // Ein Geist, der erst morgen startet (heute wurde der Block darunter fest), ist heute noch nicht dran.
    if (!habit || (habit.formation && habit.lifecycle === 'forming' && habit.formation.startedOn > date)) return []
    return [
      {
        habitId: id,
        status: `${id}|${date}` in logs ? 'done' : 'pending',
        timer: habit.action.kind === 'timer' ? { durationSec: habit.action.durationSec, accumulatedSec: 0, runningSince: null } : null,
      },
    ]
  })
  const first = steps.findIndex((s) => s.status === 'pending')
  if (first === -1) return null
  steps[first] = { ...steps[first]!, status: 'active' }
  return {
    id: newId(),
    towerId,
    date,
    startedAt: new Date(nowMs).toISOString(),
    steps,
    activeIndex: first,
    state: 'running',
  }
}

/** Aktiven Schritt mit neuem Status abschließen und zum nächsten offenen springen. */
function advance(session: FocusSession, status: 'done' | 'skipped', nowMs: number): FocusSession {
  const steps = session.steps.map((s, i) =>
    i === session.activeIndex ? { ...s, status, timer: s.timer && timerPause(s.timer, nowMs) } : s,
  )
  const next = steps.findIndex((s, i) => i > session.activeIndex && s.status === 'pending')
  if (next === -1) {
    return { ...session, steps, state: 'completed', finishedAt: new Date(nowMs).toISOString() }
  }
  steps[next] = { ...steps[next]!, status: 'active' }
  return { ...session, steps, activeIndex: next }
}

/** Erledigt den aktiven Schritt und erzeugt den zugehörigen Log. */
export function completeActiveStep(session: FocusSession, habit: Habit, nowMs: number): { session: FocusSession; log: HabitLog } {
  const step = session.steps[session.activeIndex]
  const durationSec = step?.timer
    ? Math.round(Math.min(step.timer.durationSec, timerElapsedSec(step.timer, nowMs)))
    : undefined
  const log: HabitLog = {
    id: newId(),
    habitId: habit.id,
    towerId: habit.towerId,
    date: session.date,
    completedAt: new Date(nowMs).toISOString(),
    durationSec,
    source: 'focus',
    sessionId: session.id,
  }
  return { session: advance(session, 'done', nowMs), log }
}

export const skipActiveStep = (session: FocusSession, nowMs: number) => advance(session, 'skipped', nowMs)

export function updateActiveTimer(session: FocusSession, fn: (t: TimerState) => TimerState): FocusSession {
  return {
    ...session,
    steps: session.steps.map((s, i) => (i === session.activeIndex && s.timer ? { ...s, timer: fn(s.timer) } : s)),
  }
}

/** Gespeicherte Session nur fortsetzen, wenn sie von heute ist und noch läuft. */
export function resumableFocus(focus: FocusSession | null, today: ISODate): FocusSession | null {
  return focus && focus.date === today && focus.state === 'running' ? focus : null
}
