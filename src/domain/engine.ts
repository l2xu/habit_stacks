import { addDays, dateOf, diffDays } from './dates'
import { newId } from './id'
import type { DomainState, FormationProgress, Habit, ID, ISODate, ISODateTime, RulesConfig, Tower, TowerEvent } from './types'

/**
 * Regel-Engine – Überblick: README.md, Abschnitt „Spielregeln in Kürze“.
 *
 * Wertet jeden abgeschlossenen Tag seit `lastEvaluatedOn` bis gestern aus; heute bleibt offen.
 * Reine Funktion und idempotent: Ein zweiter Aufruf mit demselben `today` gibt
 * dieselbe Referenz zurück. Mehrere Tage auf einmal nachzuholen ergibt dasselbe wie
 * Tag für Tag (siehe engine.test.ts).
 */
export function evaluateAll(state: DomainState, today: ISODate, nowMs = Date.now()): DomainState {
  const through = addDays(today, -1)
  // Neuer, leerer Zustand: nichts nachzuholen, Cursor auf gestern setzen.
  if (state.lastEvaluatedOn === null) return { ...state, lastEvaluatedOn: through }
  if (state.lastEvaluatedOn >= through) return state

  const ctx: Ctx = {
    towers: { ...state.towers },
    habits: { ...state.habits },
    events: [],
    rules: state.rules,
    dayStartsAtHour: state.settings.dayStartsAtHour,
    now: new Date(nowMs).toISOString(),
    isDone: (habitId, date) => `${habitId}|${date}` in state.logs,
  }

  for (let d = addDays(state.lastEvaluatedOn, 1); d <= through; d = addDays(d, 1)) {
    for (const towerId of state.towerOrder) evaluateTowerDay(ctx, towerId, d)
  }

  return {
    ...state,
    towers: ctx.towers,
    habits: ctx.habits,
    events: ctx.events.length ? [...state.events, ...ctx.events] : state.events,
    lastEvaluatedOn: through,
  }
}

/**
 * Der letzte fehlende Tag macht den Geist sofort fest – noch am selben Tag, nicht erst am nächsten Morgen.
 * Aufruf direkt nach dem Häkchen (Log für `date` liegt schon vor). Schreibt `block_solidified` als Neuigkeit;
 * die Engine wertet den Block am nächsten Morgen dann als festen Block aus (an `date` erledigt).
 * Gibt dieselbe Referenz zurück, wenn nichts zu tun ist.
 */
export function solidifyOnCompletion(state: DomainState, habitId: ID, date: ISODate, nowMs = Date.now()): DomainState {
  const habit = state.habits[habitId]
  const f = habit?.formation
  if (!habit || habit.lifecycle !== 'forming' || !f || date < f.startedOn) return state
  if (!(`${habitId}|${date}` in state.logs)) return state
  // `doneDays` stimmt nur, wenn die Engine bis gestern ausgewertet hat und `date` selbst noch offen ist.
  if (state.lastEvaluatedOn === null || state.lastEvaluatedOn < addDays(date, -1)) return state
  if (f.evaluatedThrough !== null && f.evaluatedThrough >= date) return state
  if (f.doneDays + 1 < state.rules.formationDays) return state

  const ctx: Ctx = {
    towers: state.towers,
    habits: { ...state.habits },
    events: [],
    rules: state.rules,
    dayStartsAtHour: state.settings.dayStartsAtHour,
    now: new Date(nowMs).toISOString(),
    isDone: () => true,
  }
  solidify(ctx, habit.towerId, habit, { ...f, doneDays: f.doneDays + 1, missedInRow: 0, evaluatedThrough: date }, date)
  return { ...state, habits: ctx.habits, events: [...state.events, ...ctx.events] }
}

/** Ab diesem Tag zählt ein neu gestapelter Block: morgen, wenn heute schon ein Block im Turm fest wurde, sonst heute. */
export function stackStartDay(s: Pick<DomainState, 'towers' | 'habits'>, towerId: ID, today: ISODate): ISODate {
  const solidifiedToday = (s.towers[towerId]?.blockIds ?? []).some((id) => s.habits[id]?.formation?.solidifiedOn === today)
  return solidifiedToday ? addDays(today, 1) : today
}

/** Verfestigte, gestapelte Blöcke von unten nach oben. */
export function solidBlockIds(tower: Pick<Tower, 'blockIds'>, habits: Record<ID, Habit>): ID[] {
  return tower.blockIds.filter((id) => {
    const h = habits[id]
    return h?.role === 'stacked' && h.lifecycle === 'solid'
  })
}

/** War der Turm an Tag d pausiert (laufende oder frühere Pause)? Dann zählt der Tag für ihn nicht. */
export function isPausedOn(tower: Pick<Tower, 'pausedSince' | 'pauses'>, d: ISODate): boolean {
  if (tower.pausedSince !== undefined && d >= tower.pausedSince) return true
  return tower.pauses?.some((r) => r.from <= d && d <= r.to) ?? false
}

// ───────────────────────────── Interna ─────────────────────────────

interface Ctx {
  /** Arbeitskopien (copy-on-write): einzelne Einträge werden ersetzt, nie verändert. */
  towers: Record<ID, Tower>
  habits: Record<ID, Habit>
  events: TowerEvent[]
  rules: RulesConfig
  dayStartsAtHour: number
  now: ISODateTime
  isDone: (habitId: ID, date: ISODate) => boolean
}

type NewEvent = TowerEvent extends infer E ? (E extends TowerEvent ? Omit<E, 'id' | 'createdAt'> : never) : never

function emit(ctx: Ctx, event: NewEvent) {
  ctx.events.push({ ...event, id: newId(), createdAt: ctx.now } as TowerEvent)
}

/** Ein abgefallener fester Block und die Ebene, auf der er stand (für die Animation). */
interface Fallen {
  id: ID
  level: number
}

function evaluateTowerDay(ctx: Ctx, towerId: ID, d: ISODate) {
  const tower = ctx.towers[towerId]
  if (!tower || isPausedOn(tower, d) || dateOf(tower.createdAt, ctx.dayStartsAtHour) > d) return
  // Zuerst die Blöcke, die zu Tagesbeginn schon fest waren – ein heute verfestigter Geist zählt noch nicht.
  const fallen = evaluateSolids(ctx, towerId, d)
  const forming = ctx.towers[towerId]!.blockIds.map((id) => ctx.habits[id]).find((h) => h?.lifecycle === 'forming')
  if (forming) evaluateFormation(ctx, towerId, forming, d)
  if (fallen.length > 0) reportFalls(ctx, towerId, fallen, d)
}

/** Ein Block verlässt den Turm (gebrochen oder abgefallen) und wandert in den Schutthaufen. */
function removeBlock(ctx: Ctx, towerId: ID, habitId: ID) {
  const t = ctx.towers[towerId]!
  ctx.towers[towerId] = {
    ...t,
    blockIds: t.blockIds.filter((id) => id !== habitId),
    lostBlockIds: [...t.lostBlockIds, habitId],
  }
}

/**
 * Feste Blöcke an Tag d, von oben nach unten. Erledigt → wieder sicher. Nicht erledigt → übersprungen, auch wenn
 * der ganze Turm nichts hatte: ab `skip.crumbleAfter` bröckelt der Block, ab `skip.fallAfter` fällt er ab –
 * egal, wo er im Turm steht. Gibt die abgefallenen Blöcke zurück (von oben nach unten).
 */
function evaluateSolids(ctx: Ctx, towerId: ID, d: ISODate): Fallen[] {
  const { crumbleAfter, fallAfter } = ctx.rules.skip
  const fallen: Fallen[] = []
  for (const id of solidBlockIds(ctx.towers[towerId]!, ctx.habits).toReversed()) {
    const h = ctx.habits[id]!
    const before = h.skippedInRow ?? 0
    if (ctx.isDone(id, d)) {
      if (before === 0) continue
      ctx.habits[id] = { ...h, skippedInRow: 0 }
      if (before >= crumbleAfter) emit(ctx, { type: 'block_recovered', towerId, habitId: id, date: d })
      continue
    }
    const skipped = before + 1
    if (skipped >= fallAfter) {
      fallen.push({ id, level: ctx.towers[towerId]!.blockIds.indexOf(id) })
      ctx.habits[id] = { ...h, skippedInRow: skipped, lifecycle: 'fallen', endedAt: ctx.now }
      removeBlock(ctx, towerId, id)
      continue
    }
    ctx.habits[id] = { ...h, skippedInRow: skipped }
    if (skipped === crumbleAfter) emit(ctx, { type: 'block_crumbling', towerId, habitId: id, date: d })
  }
  return fallen
}

/**
 * Meldet die abgefallenen Blöcke eines Tages. Steht danach über dem Anker nichts mehr und waren es mindestens zwei,
 * ist der Turm eingestürzt – ein Ereignis für alle. Sonst einzeln, von oben nach unten.
 */
function reportFalls(ctx: Ctx, towerId: ID, fallen: Fallen[], d: ISODate) {
  const standing = ctx.towers[towerId]!.blockIds.some((id) => ctx.habits[id]?.role === 'stacked')
  if (fallen.length >= 2 && !standing) {
    emit(ctx, { type: 'tower_collapsed', towerId, habitIds: fallen.map((f) => f.id).toReversed(), date: d })
    return
  }
  for (const f of fallen) emit(ctx, { type: 'block_fallen', towerId, habitId: f.id, level: f.level, date: d })
}

/**
 * Verfestigung des Geister-Blocks für Tag d nach „Nie zweimal verpassen“:
 * erledigt → ein Würfel mehr; einzelner Fehltag → wackelt; Fehltage über der Gnadenfrist → Bruch.
 */
function evaluateFormation(ctx: Ctx, towerId: ID, habit: Habit, d: ISODate) {
  const f = habit.formation
  if (!f || d < f.startedOn || (f.evaluatedThrough !== null && f.evaluatedThrough >= d)) return
  const { formationDays, formationGraceDays } = ctx.rules

  // Schon genug erledigte Tage (z. B. nach einer Regeländerung): sofort verfestigen.
  if (f.doneDays >= formationDays) {
    solidify(ctx, towerId, habit, { ...f, evaluatedThrough: d }, d)
    return
  }

  let { doneDays, missedInRow } = f
  if (ctx.isDone(habit.id, d)) {
    doneDays++
    missedInRow = 0
  } else if (missedInRow < formationGraceDays) {
    missedInRow++
    emit(ctx, { type: 'formation_wobbling', towerId, habitId: habit.id, date: d })
  } else {
    ctx.habits[habit.id] = {
      ...habit,
      lifecycle: 'broken',
      endedAt: ctx.now,
      formation: { ...f, missedInRow: missedInRow + 1, brokenOn: d, evaluatedThrough: d },
    }
    const level = ctx.towers[towerId]!.blockIds.indexOf(habit.id)
    removeBlock(ctx, towerId, habit.id)
    emit(ctx, { type: 'block_broken', towerId, habitId: habit.id, onDay: diffDays(d, f.startedOn) + 1, level, date: d })
    return
  }

  const next = { ...f, doneDays, missedInRow, evaluatedThrough: d }
  if (doneDays >= formationDays) solidify(ctx, towerId, habit, next, d)
  else ctx.habits[habit.id] = { ...habit, formation: next }
}

function solidify(ctx: Ctx, towerId: ID, habit: Habit, f: FormationProgress, d: ISODate) {
  ctx.habits[habit.id] = { ...habit, lifecycle: 'solid', wasSolid: true, formation: { ...f, solidifiedOn: d } }
  emit(ctx, { type: 'block_solidified', towerId, habitId: habit.id, date: d })
}
