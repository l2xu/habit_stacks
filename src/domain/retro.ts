import { addDays, dateOf } from './dates'
import { evaluateTowerRange, isPausedOn, solidifyOnCompletion } from './engine'
import { newId } from './id'
import type { DomainState, FormationProgress, Habit, ID, ISODate, LogKey, Tower, TowerEvent, TowerEventType } from './types'

/**
 * Nachtragen: vergessene Häkchen der letzten Tage nachholen (oder falsche wieder entfernen).
 *
 * Die Engine wertet nur vorwärts aus. Ändert sich ein Log an einem vergangenen Tag d, wird der Turm deshalb
 * auf den Stand vor d zurückgerechnet (aus dem heutigen Stand und den bisherigen Logs) und ab d mit den neuen Logs
 * neu ausgewertet. Ergebnis: derselbe Turm, als wäre der Tag damals so abgehakt worden. Blöcke, die dann nicht
 * gefallen oder gebrochen wären, kehren an ihren alten Platz zurück, und umgekehrt.
 *
 * Grenze: Nur der aktuelle Lauf eines Blocks (seit dem letzten Stapeln) wird neu berechnet. Wer einen Block
 * inzwischen abgebaut oder neu gestapelt hat, behält ihn so.
 */

type Logs = DomainState['logs']

/** Ab diesem Tag zählt ein Block: Stapeltag (auch nach dem Neu-Stapeln), beim Anker der Bautag. */
export const blockStart = (h: Pick<Habit, 'formation' | 'createdAt'>, dayStartsAtHour: number): ISODate =>
  h.formation?.startedOn ?? dateOf(h.createdAt, dayStartsAtHour)

/** Lässt sich der Tag nachtragen? Nur die letzten `editableDays` Tage bis gestern, ab dem Turmbau und nicht pausiert. */
export function canEditDay(s: Pick<DomainState, 'towers' | 'rules' | 'settings'>, towerId: ID, date: ISODate, today: ISODate): boolean {
  const tower = s.towers[towerId]
  if (!tower || date >= today || date < addDays(today, -s.rules.editableDays)) return false
  return date >= dateOf(tower.createdAt, s.settings.dayStartsAtHour) && !isPausedOn(tower, date)
}

/**
 * Blöcke, die an einem Tag auf dem Turm standen, von unten nach oben: was heute steht und da schon gestapelt war,
 * danach gebrochene und abgefallene Blöcke bis einschließlich ihres Verlusttags. Abgebaute Blöcke zählen nicht.
 */
export function blocksOnDay(s: Pick<DomainState, 'towers' | 'habits' | 'events' | 'settings'>, towerId: ID): (date: ISODate) => Habit[] {
  const tower = s.towers[towerId]
  if (!tower) return () => []
  const hour = s.settings.dayStartsAtHour
  const created = dateOf(tower.createdAt, hour)
  const losses = lossesOf(s.events, towerId)
  const standing = tower.blockIds.flatMap((id) => s.habits[id] ?? [])
  const lost = tower.lostBlockIds.flatMap((id) => {
    const h = s.habits[id]
    const lostOn = h && lossDay(h, losses)
    return h && lostOn ? [{ h, lostOn }] : []
  })
  return (date) =>
    date < created
      ? []
      : [
          ...standing.filter((h) => blockStart(h, hour) <= date),
          ...lost.filter(({ h, lostOn }) => blockStart(h, hour) <= date && date <= lostOn).map(({ h }) => h),
        ]
}

/**
 * Hakt Blöcke an einem vergangenen Tag nachträglich ab (true) oder entfernt das Häkchen (false) und rechnet den
 * Turm neu. Erlaubt sind nur Blöcke, die an dem Tag auf dem Turm standen (`blocksOnDay`), und nur Tage, die
 * `canEditDay` zulässt. Gibt dieselbe Referenz zurück, wenn sich nichts ändert.
 */
export function setPastDone(
  s: DomainState,
  towerId: ID,
  date: ISODate,
  changes: Record<ID, boolean>,
  today: ISODate,
  nowMs = Date.now(),
): DomainState {
  if (!canEditDay(s, towerId, date, today)) return s
  const allowed = new Set(blocksOnDay(s, towerId)(date).map((h) => h.id))
  let logs: Logs | null = null
  for (const [habitId, done] of Object.entries(changes)) {
    const key: LogKey = `${habitId}|${date}`
    if (!allowed.has(habitId) || done === key in (logs ?? s.logs)) continue
    logs ??= { ...s.logs }
    if (done) logs[key] = { id: newId(), habitId, towerId, date, completedAt: new Date(nowMs).toISOString(), source: 'retro' }
    else delete logs[key]
  }
  return logs ? recomputeTower(s, logs, towerId, date, today, nowMs) : s
}

/** Ereignisse der Engine – sie entstehen beim Neuberechnen neu. Nutzer-Ereignisse (Bau, Stapeln, Abbauen) bleiben. */
const ENGINE_EVENTS: ReadonlySet<TowerEventType> = new Set<TowerEventType>([
  'formation_wobbling',
  'block_solidified',
  'block_broken',
  'block_crumbling',
  'block_recovered',
  'block_fallen',
  'tower_collapsed',
])

/**
 * Rechnet einen Turm mit geänderten Logs neu: zurück auf den Stand vor `from` (mit den alten Logs aus `prev`), dann
 * von `from` bis zum zuletzt ausgewerteten Tag mit `logs` neu auswerten – und heute fest gewordene Geister wieder
 * festmachen. Ereignisse ab `from` entstehen neu. Was schon vorher genauso passiert war, behält Id und
 * Gesehen-Status. Neue Folgen gelten als gesehen: Nachtragen erzeugt keine Neuigkeiten, der Turm ändert sich direkt.
 */
export function recomputeTower(prev: DomainState, logs: Logs, towerId: ID, from: ISODate, today: ISODate, nowMs = Date.now()): DomainState {
  const tower = prev.towers[towerId]
  const through = prev.lastEvaluatedOn
  // Noch nicht ausgewertete Tage erledigt die Engine später von selbst.
  if (!tower || through === null || from > through) return { ...prev, logs }

  const losses = lossesOf(prev.events, towerId)
  const r = rewinder(prev, tower, from)
  const habits = { ...prev.habits }
  /** Zurückgerechnete Blöcke → Beginn ihres aktuellen Laufs. */
  const rewound = new Map<ID, ISODate>()
  const restore: { id: ID; order: number; level: number }[] = []

  for (const id of [...tower.blockIds, ...tower.lostBlockIds]) {
    const h = prev.habits[id]
    const lostOn = h ? lossDay(h, losses) : null
    if (!h || h.role !== 'stacked' || h.lifecycle === 'removed') continue
    // Schon vor `from` verloren: daran ändert sich nichts.
    if ((h.lifecycle === 'broken' || h.lifecycle === 'fallen') && (!lostOn || lostOn < from)) continue
    const back = r.rewind(h)
    if (!back) continue
    habits[id] = back
    rewound.set(id, blockStart(h, prev.settings.dayStartsAtHour))
    if (lostOn) {
      const loss = losses.get(id)
      restore.push({ id, order: loss?.order ?? Infinity, level: loss?.level ?? Infinity })
    }
  }

  // Zurück auf den Turm, an die alte Stelle: den zuletzt verlorenen zuerst, bei einem Einsturz von unten nach oben.
  let { blockIds, lostBlockIds } = tower
  if (restore.length > 0) {
    const back = new Set(restore.map((x) => x.id))
    blockIds = [...blockIds]
    lostBlockIds = lostBlockIds.filter((id) => !back.has(id))
    for (const x of restore.sort((a, b) => b.order - a.order || a.level - b.level)) {
      blockIds.splice(Math.max(1, Math.min(x.level, blockIds.length)), 0, x.id)
    }
  }

  const replayed = (e: TowerEvent) => {
    if (e.towerId !== towerId || !ENGINE_EVENTS.has(e.type) || e.date < from) return false
    const ids = e.type === 'tower_collapsed' ? e.habitIds : 'habitId' in e ? [e.habitId] : []
    // Ereignisse aus einem früheren Lauf (vor dem Neu-Stapeln) bleiben Historie.
    return ids.some((id) => {
      const start = rewound.get(id)
      return start !== undefined && e.date >= start
    })
  }
  const kept = prev.events.filter((e) => !replayed(e))
  const dropped = prev.events.filter(replayed)

  const base: DomainState = { ...prev, logs, habits, towers: { ...prev.towers, [towerId]: { ...tower, blockIds, lostBlockIds } }, events: kept }
  const { state, events } = evaluateTowerRange(base, towerId, from, through, nowMs)
  let next: DomainState = { ...state, events: [...kept, ...events] }
  // Der 28. Haken heute macht einen Geist sofort fest – auch wenn er erst durchs Nachtragen der 28. ist.
  for (const id of next.towers[towerId]!.blockIds) next = solidifyOnCompletion(next, id, today, nowMs)

  return { ...next, events: [...kept, ...keepIdentity(next.events.slice(kept.length), dropped, nowMs)] }
}

/** Was sich durchs Nachtragen am Turm geändert hat – für die Rückmeldung in der Oberfläche. */
export interface TowerChange {
  /** Vom Schutthaufen zurück auf den Turm. */
  back: ID[]
  /** Nachträglich gefallen oder gebrochen. */
  lost: ID[]
  /** Geist → fest. */
  solid: ID[]
  /** Fest → wieder Geist. */
  ghost: ID[]
}

export function towerChanges(before: Pick<DomainState, 'towers' | 'habits'>, after: Pick<DomainState, 'towers' | 'habits'>, towerId: ID): TowerChange {
  const a = before.towers[towerId]
  const b = after.towers[towerId]
  if (!a || !b) return { back: [], lost: [], solid: [], ghost: [] }
  const both = b.blockIds.filter((id) => a.blockIds.includes(id))
  const was = (id: ID) => before.habits[id]?.lifecycle
  const is = (id: ID) => after.habits[id]?.lifecycle
  return {
    back: b.blockIds.filter((id) => a.lostBlockIds.includes(id)),
    lost: b.lostBlockIds.filter((id) => a.blockIds.includes(id)),
    solid: both.filter((id) => was(id) === 'forming' && is(id) === 'solid'),
    ghost: both.filter((id) => was(id) === 'solid' && is(id) === 'forming'),
  }
}

// ───────────────────────────── Interna ─────────────────────────────

/** Letztes Verlust-Ereignis je Block: Tag, Ebene, auf der er stand, und Position im Ereignisprotokoll. */
interface Loss {
  date: ISODate
  level: number
  order: number
}

function lossesOf(events: TowerEvent[], towerId: ID): Map<ID, Loss> {
  const losses = new Map<ID, Loss>()
  events.forEach((e, order) => {
    if (e.towerId !== towerId) return
    if (e.type === 'block_broken' || e.type === 'block_fallen') losses.set(e.habitId, { date: e.date, level: e.level, order })
    // Eingestürzt: habitIds von unten nach oben, Ebene 1, 2, …
    if (e.type === 'tower_collapsed') e.habitIds.forEach((id, i) => losses.set(id, { date: e.date, level: i + 1, order }))
  })
  return losses
}

/** Tag, an dem ein gebrochener oder abgefallener Block den Turm verlassen hat (null: steht noch oder unbekannt). */
function lossDay(h: Habit, losses: Map<ID, Loss>): ISODate | null {
  if (h.lifecycle === 'broken') return h.formation?.brokenOn ?? losses.get(h.id)?.date ?? null
  if (h.lifecycle === 'fallen') return losses.get(h.id)?.date ?? null
  return null
}

/**
 * Rechnet einen Block auf den Stand vor `from` zurück – so, wie ihn die Engine nach dem Vortag hinterlassen hatte.
 * Dafür zählt sie mit den alten Logs nach, was die Engine ab `from` daraus gemacht hat (Pausentage zählen nicht).
 */
function rewinder(prev: DomainState, tower: Tower, from: ISODate) {
  const created = dateOf(tower.createdAt, prev.settings.dayStartsAtHour)
  const counts = (d: ISODate) => d >= created && !isPausedOn(tower, d)
  const done = (id: ID, d: ISODate) => `${id}|${d}` in prev.logs
  const { skip, formationGraceDays } = prev.rules

  /** Tage ohne Häkchen direkt vor `from`, zurück bis nach `after`; höchstens `cap`. */
  const missesBefore = (id: ID, after: ISODate, cap: number) => {
    let n = 0
    for (let d = addDays(from, -1); d > after && n < cap; d = addDays(d, -1)) {
      if (!counts(d)) continue
      if (done(id, d)) break
      n++
    }
    return n
  }
  /** Erledigte Tage von `a` bis `b`. */
  const doneIn = (id: ID, a: ISODate, b: ISODate) => {
    let n = 0
    for (let d = a; d <= b; d = addDays(d, 1)) if (counts(d) && done(id, d)) n++
    return n
  }

  return {
    rewind(h: Habit): Habit | null {
      const f = h.formation
      const start = f?.startedOn ?? created
      const solidOn = f?.solidifiedOn
      const solidNow = h.lifecycle === 'solid' || h.lifecycle === 'fallen'
      const back: Habit = { ...h }
      delete back.endedAt

      // Vor `from` schon fest: Nur die Fehltage seit dem letzten Häkchen zählen.
      if (solidNow && (solidOn === undefined || solidOn < from)) {
        const skipped = missesBefore(h.id, solidOn ?? addDays(start, -1), skip.fallAfter - 1)
        back.lifecycle = 'solid'
        if (skipped > 0 || h.skippedInRow !== undefined) back.skippedInRow = skipped
        return back
      }
      if (!f) return null

      // Vor `from` noch ein Geist: Würfel ab `from` wieder abziehen, Fehltage davor neu zählen.
      const end = h.lifecycle === 'forming' ? f.evaluatedThrough : h.lifecycle === 'broken' ? (f.brokenOn ?? null) : (solidOn ?? null)
      const doneSince = (a: ISODate) => (end === null ? 0 : doneIn(h.id, a, end))
      const formation: FormationProgress = {
        startedOn: start,
        doneDays: Math.max(0, f.doneDays - doneSince(from > start ? from : start)),
        missedInRow: missesBefore(h.id, addDays(start, -1), formationGraceDays),
        evaluatedThrough: from > start ? addDays(from, -1) : null,
      }
      back.lifecycle = 'forming'
      back.formation = formation
      delete back.skippedInRow
      // Erst in diesem Lauf fest geworden: Startete der Geist mit Gedächtnis-Bonus, war er schon früher einmal fest.
      if (solidNow) {
        if (f.doneDays - doneSince(start) > 0) back.wasSolid = true
        else delete back.wasSolid
      }
      return back
    },
  }
}

const eventKey = (e: TowerEvent) =>
  `${e.type}|${e.type === 'tower_collapsed' ? e.habitIds.join(',') : 'habitId' in e ? e.habitId : ''}|${e.date}`

/** Neu entstandene Ereignisse übernehmen Id und Gesehen-Status ihres Vorgängers; alles Neue gilt als gesehen. */
function keepIdentity(fresh: TowerEvent[], dropped: TowerEvent[], nowMs: number): TowerEvent[] {
  const pool = new Map<string, TowerEvent[]>()
  for (const e of dropped) pool.set(eventKey(e), [...(pool.get(eventKey(e)) ?? []), e])
  const now = new Date(nowMs).toISOString()
  return fresh.map((e) => {
    const old = pool.get(eventKey(e))?.shift()
    const next: TowerEvent = { ...e, id: old?.id ?? e.id, createdAt: old?.createdAt ?? e.createdAt }
    const seenAt = old ? old.seenAt : now
    if (seenAt) next.seenAt = seenAt
    return next
  })
}
