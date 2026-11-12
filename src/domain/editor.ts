import { addDays } from './dates'
import { stackStartDay } from './engine'
import { newId } from './id'
import type { BlockColor, DomainState, FormationProgress, Habit, HabitAction, ID, ISODate, Tower, TowerEvent, TowerNotify } from './types'

/**
 * Turm- und Block-Editor als reine Funktionen – Regeln: README.md, Abschnitt „Spielregeln in Kürze“.
 * Ungültige Eingaben geben denselben Zustand (Referenz) zurück, der Store ändert dann nichts.
 */

export interface BlockInput {
  title: string
  color: BlockColor
  action: HabitAction
}

export type BlockPatch = Partial<Pick<BlockInput, 'color' | 'action'>>

export interface TowerInput {
  name: string
  anchor: BlockInput
}

export type Dir = -1 | 1

// ───────────────────────────── Abfragen ─────────────────────────────

type Slice<K extends keyof DomainState> = Pick<DomainState, K>

export function formingBlocks(s: Slice<'towers' | 'habits'>, towerId: ID): Habit[] {
  return (s.towers[towerId]?.blockIds ?? []).flatMap((id) => {
    const h = s.habits[id]
    return h?.lifecycle === 'forming' ? [h] : []
  })
}

/** Pausierte Türme sind gesperrt: Bearbeiten geht erst wieder nach dem Fortsetzen. */
export function isEditable(s: Slice<'towers'>, towerId: ID): boolean {
  const tower = s.towers[towerId]
  return !!tower && !tower.pausedSince
}

/** Neu stapeln geht erst, wenn der Geister-Block verfestigt oder weg ist (`maxFormingPerTower`). */
export function canStack(s: Slice<'towers' | 'habits' | 'rules'>, towerId: ID): boolean {
  return isEditable(s, towerId) && formingBlocks(s, towerId).length < s.rules.maxFormingPerTower
}

/** Heute neu gestapelt (startet heute oder morgen) und ohne Vorgeschichte → darf spurlos gelöscht werden (z. B. Tippfehler). */
export function canDiscard(s: Slice<'habits' | 'events'>, habitId: ID, today: ISODate): boolean {
  const h = s.habits[habitId]
  const startedOn = h?.formation?.startedOn
  if (!h || h.lifecycle !== 'forming' || !startedOn || startedOn < today) return false
  return !s.events.some((e) => 'habitId' in e && e.habitId === habitId && e.type !== 'block_stacked')
}

/**
 * Alle Blöcke außer dem Anker tauschen frei die Plätze, auch der Geist. Die Position bestimmt nur die
 * Reihenfolge der Routine (Fokus-Modus) – für die Regeln zählt jeder Block für sich.
 */
export function canMoveBlock(s: Slice<'towers' | 'habits'>, habitId: ID, dir: Dir): boolean {
  const h = s.habits[habitId]
  const ids = (h && s.towers[h.towerId]?.blockIds) ?? []
  const i = ids.indexOf(habitId)
  return h?.role === 'stacked' && isEditable(s, h.towerId) && i > 0 && i + dir > 0 && i + dir < ids.length
}

// ───────────────────────────── Türme ─────────────────────────────

export function createTower(
  s: DomainState,
  input: TowerInput,
  today: ISODate,
  nowMs: number,
  ids = { tower: newId(), anchor: newId() },
): DomainState {
  const name = cleanText(input.name)
  const title = cleanText(input.anchor.title)
  if (!name || !title || s.towers[ids.tower]) return s

  const now = new Date(nowMs).toISOString()
  const anchor: Habit = {
    id: ids.anchor,
    towerId: ids.tower,
    title,
    role: 'anchor',
    action: cleanAction(input.anchor.action),
    color: input.anchor.color,
    lifecycle: 'solid',
    formation: null,
    createdAt: now,
  }
  const tower: Tower = {
    id: ids.tower,
    name,
    timeOfDay: 'anytime',
    blockIds: [anchor.id],
    lostBlockIds: [],
    createdAt: now,
  }
  return {
    ...s,
    towers: { ...s.towers, [tower.id]: tower },
    towerOrder: [...s.towerOrder, tower.id],
    habits: { ...s.habits, [anchor.id]: anchor },
    events: [...s.events, userEvent(tower.id, today, nowMs, { type: 'tower_created' })],
  }
}

export function renameTower(s: DomainState, towerId: ID, name: string): DomainState {
  const tower = s.towers[towerId]
  const clean = cleanText(name)
  if (!tower || !clean || clean === tower.name || !isEditable(s, towerId)) return s
  return { ...s, towers: { ...s.towers, [towerId]: { ...tower, name: clean } } }
}

/** Verschiebt einen Turm auf der Insel um einen Platz nach links (-1) oder rechts (+1). */
export function moveTower(s: DomainState, towerId: ID, dir: Dir): DomainState {
  const i = s.towerOrder.indexOf(towerId)
  const j = i + dir
  if (i < 0 || j < 0 || j >= s.towerOrder.length || !isEditable(s, towerId)) return s
  const towerOrder = [...s.towerOrder]
  ;[towerOrder[i], towerOrder[j]] = [towerOrder[j]!, towerOrder[i]!]
  return { ...s, towerOrder }
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/

/** Push-Benachrichtigungen eines Turms einstellen (Uhrzeit 'HH:MM', Erinnerung, Warnung). */
export function setTowerNotify(s: DomainState, towerId: ID, notify: TowerNotify): DomainState {
  const tower = s.towers[towerId]
  if (!tower || !TIME.test(notify.time) || !isEditable(s, towerId)) return s
  const prev = tower.notify
  if (prev && prev.time === notify.time && prev.remind === notify.remind && prev.warn === notify.warn) return s
  return { ...s, towers: { ...s.towers, [towerId]: { ...tower, notify: { time: notify.time, remind: notify.remind, warn: notify.warn } } } }
}

/**
 * Pausiert einen Turm ab heute (z. B. Urlaub): Die Engine wertet ihn nicht aus, nichts bröckelt oder bricht weg.
 * Abhaken und Bearbeiten sind gesperrt (`isEditable`), eine laufende Fokus-Session endet.
 */
export function pauseTower(s: DomainState, towerId: ID, today: ISODate): DomainState {
  const tower = s.towers[towerId]
  if (!tower || tower.pausedSince) return s
  return {
    ...s,
    towers: { ...s.towers, [towerId]: { ...tower, pausedSince: today } },
    focus: s.focus?.towerId === towerId ? null : s.focus,
  }
}

/**
 * Setzt einen pausierten Turm fort: Ab heute zählt jeder Tag wieder. Die Pausentage (bis gestern) kommen in
 * `pauses` – für Engine, Streak und Wochenleiste. Wer am selben Tag fortsetzt, hinterlässt keine Pause.
 */
export function resumeTower(s: DomainState, towerId: ID, today: ISODate): DomainState {
  const tower = s.towers[towerId]
  if (!tower?.pausedSince) return s
  const { pausedSince, ...rest } = tower
  const resumed: Tower = pausedSince < today ? { ...rest, pauses: [...(tower.pauses ?? []), { from: pausedSince, to: addDays(today, -1) }] } : rest
  return { ...s, towers: { ...s.towers, [towerId]: resumed } }
}

/**
 * Löscht einen Turm endgültig – mit allen Blöcken, Logs und Ereignissen. Eine laufende Fokus-Session endet.
 * Pausiert geht das nicht: erst fortsetzen.
 */
export function deleteTower(s: DomainState, towerId: ID): DomainState {
  if (!isEditable(s, towerId)) return s
  const towers = { ...s.towers }
  delete towers[towerId]
  return {
    ...s,
    towers,
    towerOrder: s.towerOrder.filter((id) => id !== towerId),
    habits: Object.fromEntries(Object.entries(s.habits).filter(([, h]) => h.towerId !== towerId)),
    logs: Object.fromEntries(Object.entries(s.logs).filter(([, l]) => l.towerId !== towerId)),
    events: s.events.filter((e) => e.towerId !== towerId),
    focus: s.focus?.towerId === towerId ? null : s.focus,
  }
}

// ───────────────────────────── Blöcke ─────────────────────────────

/**
 * Stapelt einen neuen Geister-Block oben auf den Turm (0 Würfel). Die Verfestigung beginnt heute – oder morgen,
 * wenn heute schon ein Block im Turm fest geworden ist (`stackStartDay`).
 */
export function stackBlock(
  s: DomainState,
  towerId: ID,
  input: BlockInput,
  today: ISODate,
  nowMs: number,
  habitId = newId(),
): DomainState {
  const tower = s.towers[towerId]
  const title = cleanText(input.title)
  if (!tower || !title || s.habits[habitId] || !canStack(s, towerId)) return s

  const habit: Habit = {
    id: habitId,
    towerId,
    title,
    role: 'stacked',
    action: cleanAction(input.action),
    color: input.color,
    lifecycle: 'forming',
    formation: freshFormation(stackStartDay(s, towerId, today)),
    createdAt: new Date(nowMs).toISOString(),
  }
  return {
    ...s,
    towers: { ...s.towers, [towerId]: { ...tower, blockIds: [...tower.blockIds, habitId] } },
    habits: { ...s.habits, [habitId]: habit },
    events: [...s.events, userEvent(towerId, today, nowMs, { type: 'block_stacked', habitId })],
  }
}

/**
 * Farbe und Aktion lassen sich jederzeit ändern – Verfestigung und Logs bleiben unberührt.
 * Der Titel bleibt fest: Eine Gewohnheit wird nicht umbenannt, sondern abgebaut und neu gestapelt.
 */
export function updateBlock(s: DomainState, habitId: ID, patch: BlockPatch): DomainState {
  const h = s.habits[habitId]
  if (!h || !isEditable(s, h.towerId)) return s
  const color = patch.color ?? h.color
  const action = patch.action ? cleanAction(patch.action) : h.action
  if (color === h.color && sameAction(action, h.action)) return s
  return { ...s, habits: { ...s.habits, [habitId]: { ...h, color, action } } }
}

export function moveBlock(s: DomainState, habitId: ID, dir: Dir): DomainState {
  if (!canMoveBlock(s, habitId, dir)) return s
  const towerId = s.habits[habitId]!.towerId
  const tower = s.towers[towerId]!
  const blockIds = [...tower.blockIds]
  const i = blockIds.indexOf(habitId)
  ;[blockIds[i], blockIds[i + dir]] = [blockIds[i + dir]!, blockIds[i]!]
  return { ...s, towers: { ...s.towers, [towerId]: { ...tower, blockIds } } }
}

/** Baut einen Block ab: Er wandert in den Schutthaufen und kann später neu gestapelt werden. */
export function removeBlock(s: DomainState, habitId: ID, today: ISODate, nowMs: number): DomainState {
  const h = s.habits[habitId]
  const tower = h && s.towers[h.towerId]
  if (!h || !tower || h.role === 'anchor' || !tower.blockIds.includes(habitId) || !isEditable(s, tower.id)) return s

  return {
    ...s,
    towers: {
      ...s.towers,
      [tower.id]: {
        ...tower,
        blockIds: tower.blockIds.filter((id) => id !== habitId),
        lostBlockIds: [...tower.lostBlockIds, habitId],
      },
    },
    habits: { ...s.habits, [habitId]: { ...h, lifecycle: 'removed', endedAt: new Date(nowMs).toISOString() } },
    events: [...s.events, userEvent(tower.id, today, nowMs, { type: 'block_removed', habitId })],
  }
}

/** Löscht einen heute gestapelten Block spurlos, samt Logs und Ereignissen (siehe `canDiscard`). */
export function discardBlock(s: DomainState, habitId: ID, today: ISODate): DomainState {
  if (!canDiscard(s, habitId, today) || !isEditable(s, s.habits[habitId]!.towerId)) return s
  const towerId = s.habits[habitId]!.towerId
  const tower = s.towers[towerId]!
  const habits = { ...s.habits }
  delete habits[habitId]
  return {
    ...s,
    towers: { ...s.towers, [towerId]: { ...tower, blockIds: tower.blockIds.filter((id) => id !== habitId) } },
    habits,
    logs: Object.fromEntries(Object.entries(s.logs).filter(([, l]) => l.habitId !== habitId)),
    events: s.events.filter((e) => !('habitId' in e && e.habitId === habitId)),
  }
}

/**
 * Holt einen Block vom Schutthaufen zurück auf den Turm. Er beginnt als Geist bei 0 Würfeln – war er
 * schon einmal verfestigt, mit dem Gedächtnis-Bonus (`restackHeadStart`). Logs bleiben erhalten.
 */
export function restackBlock(s: DomainState, habitId: ID, today: ISODate, nowMs: number): DomainState {
  const h = s.habits[habitId]
  const tower = h && s.towers[h.towerId]
  if (!h || !tower || !tower.lostBlockIds.includes(habitId) || !canStack(s, tower.id)) return s

  const habit: Habit = { ...h, lifecycle: 'forming', formation: freshFormation(stackStartDay(s, tower.id, today), restackHeadStart(s, h)) }
  delete habit.endedAt
  delete habit.skippedInRow
  return {
    ...s,
    towers: {
      ...s.towers,
      [tower.id]: {
        ...tower,
        blockIds: [...tower.blockIds, habitId],
        lostBlockIds: tower.lostBlockIds.filter((id) => id !== habitId),
      },
    },
    habits: { ...s.habits, [habitId]: habit },
    events: [...s.events, userEvent(tower.id, today, nowMs, { type: 'block_stacked', habitId })],
  }
}

// ───────────────────────────── Interna ─────────────────────────────

const cleanText = (s: string) => s.replace(/\s+/g, ' ').trim()

const cleanAction = (a: HabitAction): HabitAction =>
  a.kind === 'timer' ? { kind: 'timer', durationSec: Math.max(60, Math.round(a.durationSec)) } : { kind: 'check' }

const sameAction = (a: HabitAction, b: HabitAction) =>
  a.kind === b.kind && (a.kind === 'check' || (b.kind === 'timer' && a.durationSec === b.durationSec))

const freshFormation = (startedOn: ISODate, doneDays = 0): FormationProgress => ({
  startedOn,
  doneDays,
  missedInRow: 0,
  evaluatedThrough: null,
})

/** Gedächtnis-Bonus beim Neu-Stapeln: nur für früher verfestigte Blöcke, und nie schon fertig. */
export const restackHeadStart = (s: Slice<'rules'>, h: Pick<Habit, 'wasSolid'>) =>
  h.wasSolid ? Math.min(s.rules.restackHeadStart, s.rules.formationDays - 1) : 0

type UserEvent =
  | { type: 'tower_created' }
  | { type: 'block_stacked'; habitId: ID }
  | { type: 'block_removed'; habitId: ID }

/** Ereignisse aus Nutzeraktionen sind Historie – sie gelten sofort als gesehen und erscheinen nicht als Neuigkeit. */
function userEvent(towerId: ID, date: ISODate, nowMs: number, body: UserEvent): TowerEvent {
  const now = new Date(nowMs).toISOString()
  return { id: newId(), towerId, date, createdAt: now, seenAt: now, ...body }
}
