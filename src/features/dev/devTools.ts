import { create } from 'zustand'
import { addDays, currentDay, dateOf } from '@/domain/dates'
import { formingBlocks } from '@/domain/editor'
import { evaluateAll, isPausedOn, solidBlockIds } from '@/domain/engine'
import { newId } from '@/domain/id'
import { pickDomain } from '@/domain/state'
import type { DomainState, Habit, HabitLog, ID, ISODate, LogKey, Tower } from '@/domain/types'
import { plainTitle } from '@/features/editor/blockDraft'
import { describeEvent, NEWS_EVENTS, type NewsItem } from '@/features/news/news'
import { useAppStore } from '@/store/useAppStore'

/**
 * DevTools zum Ausprobieren der Tagesregeln – vorübergehend, auch im Build.
 * Vorspulen, Blöcke abhaken und in Zustände versetzen; jedes Vorspulen lässt sich zurückdrehen.
 * Entfernen: Ordner `features/dev` löschen, dazu `onDev` im SettingsPanel (5× auf die Versionszeile tippen) und die Route 'dev' in HomeScreen.
 */

/** Wie die Tage beim Vorspulen gefüllt werden: heutige Häkchen wiederholen, alles erledigen oder Pause. */
export type DayPlan = 'today' | 'all' | 'none'

export const PLAN_LABEL: Record<DayPlan, string> = { today: 'wie heute', all: 'alles erledigt', none: 'nichts getan' }

const logKey = (habitId: ID, date: ISODate): LogKey => `${habitId}|${date}`

const devToday = (s: DomainState) => currentDay(s.settings.dayStartsAtHour, s.settings.devDayOffset)

/** Türme auf der Insel. */
const liveTowers = (s: DomainState): Tower[] =>
  s.towerOrder.flatMap((id) => {
    const t = s.towers[id]
    return t ? [t] : []
  })

function makeLog(h: Habit, date: ISODate): HabitLog {
  return {
    id: newId(),
    habitId: h.id,
    towerId: h.towerId,
    date,
    completedAt: new Date(`${date}T12:00`).toISOString(),
    durationSec: h.action.kind === 'timer' ? h.action.durationSec : undefined,
    source: 'quick',
  }
}

const withHabit = (s: DomainState, h: Habit): DomainState => ({ ...s, habits: { ...s.habits, [h.id]: h } })

// ───────────────────────────── Reine Funktionen ─────────────────────────────

/** Block an einem Tag erledigt oder nicht (Log anlegen bzw. löschen). */
export function setDone(s: DomainState, habitId: ID, date: ISODate, done: boolean): DomainState {
  const key = logKey(habitId, date)
  const h = s.habits[habitId]
  if (!h || done === key in s.logs) return s
  const logs = { ...s.logs }
  if (done) logs[key] = makeLog(h, date)
  else delete logs[key]
  return { ...s, logs }
}

export function setTowerDone(s: DomainState, towerId: ID, date: ISODate, done: boolean): DomainState {
  return (s.towers[towerId]?.blockIds ?? []).reduce((next, id) => setDone(next, id, date, done), s)
}

function fillDay(s: DomainState, date: ISODate, plan: DayPlan, pattern: ReadonlySet<ID>): DomainState {
  if (plan === 'none') return s.towerOrder.reduce((next, id) => setTowerDone(next, id, date, false), s)
  let next = s
  for (const t of liveTowers(s)) for (const id of t.blockIds) if (plan === 'all' || pattern.has(id)) next = setDone(next, id, date, true)
  return next
}

/**
 * Spult `days` Tage vor: Jeder Tag ab heute wird nach `plan` gefüllt und von der Engine ausgewertet,
 * danach ist „heute“ `days` Tage später. Bei 'today' gelten die heutigen Häkchen für jeden Tag
 * (für Blöcke, die dann noch stehen).
 */
export function simulateDays(s: DomainState, today: ISODate, days: number, plan: DayPlan): DomainState {
  const pattern = new Set(Object.values(s.logs).flatMap((l) => (l.date === today ? [l.habitId] : [])))
  let next = s
  for (let i = 0; i < days; i++) {
    const d = addDays(today, i)
    next = evaluateAll(fillDay(next, d, plan, pattern), addDays(d, 1))
  }
  return { ...next, settings: { ...next.settings, devDayOffset: (next.settings.devDayOffset ?? 0) + days } }
}

/** Was „+1 Tag wie heute“ auslösen würde – als Neuigkeiten. */
export function previewNextDay(s: DomainState, today: ISODate): NewsItem[] {
  const next = simulateDays(s, today, 1, 'today')
  return next.events
    .slice(s.events.length)
    .filter((e) => NEWS_EVENTS.has(e.type))
    .map((e) => describeEvent(e, next, addDays(today, 1)))
}

/** Geist: erledigte Tage bis gestern (0 … formationDays; heute erledigt zählt in der Anzeige noch dazu). */
export function setStones(s: DomainState, habitId: ID, n: number): DomainState {
  const h = s.habits[habitId]
  if (h?.lifecycle !== 'forming' || !h.formation) return s
  const doneDays = Math.max(0, Math.min(s.rules.formationDays, n))
  return withHabit(s, { ...h, formation: { ...h.formation, doneDays } })
}

/** Geist wackelt = gestern verpasst; noch ein Fehltag, dann bricht er. */
export function setWobbling(s: DomainState, habitId: ID, wobbling: boolean): DomainState {
  const h = s.habits[habitId]
  if (h?.lifecycle !== 'forming' || !h.formation) return s
  return withHabit(s, { ...h, formation: { ...h.formation, missedInRow: wobbling ? s.rules.formationGraceDays : 0 } })
}

/** Fester Block: an aktiven Tagen in Folge übersprungen (0 … fallAfter − 1). */
export function setSkips(s: DomainState, habitId: ID, n: number): DomainState {
  const h = s.habits[habitId]
  if (h?.role !== 'stacked' || h.lifecycle !== 'solid') return s
  return withHabit(s, { ...h, skippedInRow: Math.max(0, Math.min(s.rules.skip.fallAfter - 1, n)) })
}

/** Geist ↔ fest. Ein Geist geht nur, wenn im Turm noch Platz ist (`maxFormingPerTower`). */
export function setLifecycle(s: DomainState, habitId: ID, to: 'forming' | 'solid', today: ISODate): DomainState {
  const h = s.habits[habitId]
  if (h?.role !== 'stacked' || h.lifecycle === to || (h.lifecycle !== 'forming' && h.lifecycle !== 'solid')) return s
  const yesterday = addDays(today, -1)
  if (to === 'solid') {
    const f = h.formation ?? { startedOn: yesterday, doneDays: 0, missedInRow: 0, evaluatedThrough: null }
    return withHabit(s, {
      ...h,
      lifecycle: 'solid',
      wasSolid: true,
      skippedInRow: 0,
      formation: { ...f, doneDays: Math.max(f.doneDays, s.rules.formationDays), missedInRow: 0, solidifiedOn: yesterday, evaluatedThrough: yesterday },
    })
  }
  if (formingBlocks(s, h.towerId).length >= s.rules.maxFormingPerTower) return s
  return withHabit(s, {
    ...h,
    lifecycle: 'forming',
    skippedInRow: 0,
    formation: { startedOn: h.formation?.startedOn ?? today, doneDays: 0, missedInRow: 0, evaluatedThrough: s.lastEvaluatedOn },
  })
}

// ───────────────────────────── Turm-Diagnose ─────────────────────────────

export interface TowerDebug {
  /** Aktive Tage am Stück, heute zählt, sobald ein Block erledigt ist (pausierte Tage übersprungen). */
  streak: number
  /** Tage ganz ohne Häkchen bis gestern (bis zum letzten aktiven oder pausierten Tag). */
  missed: number
  activeToday: boolean
  status: string
}

const quoted = (h: Habit) => `„${plainTitle(h.title)}“`

/** Rohwerte zum Turm – rechnet wie Engine und Selektor. */
export function towerDebug(s: DomainState, tower: Tower, today: ISODate): TowerDebug {
  const activeOn = new Set<ISODate>()
  for (const l of Object.values(s.logs)) if (l.towerId === tower.id) activeOn.add(l.date)
  const paused = (d: ISODate) => isPausedOn(tower, d)
  const activeToday = activeOn.has(today)
  let streak = activeToday && !paused(today) ? 1 : 0
  for (let d = addDays(today, -1); paused(d) || activeOn.has(d); d = addDays(d, -1)) if (!paused(d)) streak++
  const created = dateOf(tower.createdAt, s.settings.dayStartsAtHour)
  let missed = 0
  for (let d = addDays(today, -1); d >= created && !paused(d) && !activeOn.has(d); d = addDays(d, -1)) missed++

  const { crumbleAfter, fallAfter } = s.rules.skip
  const solids = solidBlockIds(tower, s.habits).map((id) => s.habits[id]!)
  const crumbling = solids.filter((h) => (h.skippedInRow ?? 0) >= crumbleAfter)
  const status = tower.pausedSince
    ? `Pausiert seit ${tower.pausedSince} – die Engine wertet den Turm nicht aus.`
    : solids.length === 0
      ? 'Keine festen Blöcke – nur der Geist folgt seiner Regel (bricht nach 2 Fehltagen).'
      : crumbling.length > 0
        ? `Bröckelt: ${crumbling.map((h) => `${quoted(h)} ${h.skippedInRow}/${fallAfter}`).join(', ')}.${
            crumbling.length === solids.length && solids.length >= 2 ? ' Alle über dem Anker – ohne Häkchen stürzt der Turm ein.' : ''
          }`
        : `Stabil – jeder feste Block bröckelt nach ${crumbleAfter} Tagen ohne Häkchen und fällt nach ${fallAfter}.`

  return { streak, missed, activeToday, status }
}

// ───────────────────────────── Store-Anbindung & Verlauf ─────────────────────────────

interface DevState {
  /** Zustand vor jedem Vorspulen, ältester zuerst. Nur im Speicher – nach dem Neuladen leer. */
  history: { label: string; state: DomainState }[]
  /** Ereignisse des letzten Vorspulens – zum erneuten Abspielen. */
  lastJumpEventIds: ID[]
}

export const useDevStore = create<DevState>()(() => ({ history: [], lastJumpEventIds: [] }))

const HISTORY_MAX = 50

/** Wendet eine Dev-Änderung auf den aktuellen Zustand an (ohne Verlaufseintrag). */
export function devEdit(fn: (s: DomainState, today: ISODate) => DomainState): boolean {
  const domain = pickDomain(useAppStore.getState())
  const next = fn(domain, devToday(domain))
  if (next === domain) return false
  useAppStore.setState(next)
  return true
}

/** Spult vor; gibt die neuen Neuigkeiten zurück. Der vorherige Stand landet im Verlauf. */
export function advance(days: number, plan: DayPlan): { today: ISODate; news: number } {
  const domain = pickDomain(useAppStore.getState())
  const next = simulateDays(domain, devToday(domain), days, plan)
  const added = next.events.slice(domain.events.length)
  useDevStore.setState((d) => ({
    history: [...d.history, { label: `+${days} ${days === 1 ? 'Tag' : 'Tage'} ${PLAN_LABEL[plan]}`, state: domain }].slice(-HISTORY_MAX),
    lastJumpEventIds: added.map((e) => e.id),
  }))
  useAppStore.setState(next)
  const today = devToday(next)
  // Wie beim echten Tageswechsel: eine Fokus-Session von gestern verwerfen.
  useAppStore.getState().evaluate(today)
  return { today, news: added.filter((e) => NEWS_EVENTS.has(e.type)).length }
}

/** Letztes Vorspulen zurückdrehen (bzw. alle mit `all`); gibt das Label zurück. */
export function rewind(all = false): string | null {
  const { history } = useDevStore.getState()
  const target = all ? history[0] : history.at(-1)
  if (!target) return null
  useDevStore.setState({ history: all ? [] : history.slice(0, -1), lastJumpEventIds: [] })
  useAppStore.setState(target.state)
  return target.label
}

/** Neuigkeiten des letzten Vorspulens noch einmal abspielen. */
export function replayNews(): boolean {
  const ids = new Set(useDevStore.getState().lastJumpEventIds)
  if (ids.size === 0) return false
  useAppStore.setState((s) => ({
    events: s.events.map((e) => {
      if (!ids.has(e.id) || !e.seenAt) return e
      const copy = { ...e }
      delete copy.seenAt
      return copy
    }),
  }))
  return true
}
