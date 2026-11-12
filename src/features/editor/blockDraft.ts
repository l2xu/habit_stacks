import type { BlockInput } from '@/domain/editor'
import type { BlockColor, Habit, HabitAction, ID } from '@/domain/types'
import { BLOCK_PALETTE } from '@/features/world/palette'

/** Ansichten im Editor-Sheet. `first`: direkt nach dem Bau eines Turms ("Später" schließt). */
export type EditorRoute =
  | { kind: 'new-tower' }
  | { kind: 'tower'; towerId: ID }
  | { kind: 'new-block'; towerId: ID; first?: boolean }
  | { kind: 'edit-block'; towerId: ID; habitId: ID }
  | { kind: 'rubble'; towerId: ID }

/** Formularzustand eines Blocks (Anker, neuer oder bestehender Block). */
export interface BlockDraft {
  title: string
  color: BlockColor
  kind: HabitAction['kind']
  minutes: number
}

export const TITLE_MAX = 40
/** Turmnamen stehen über dem Turm; länger würde in den Nachbarn ragen. */
export const TOWER_NAME_MAX = 24
/** Timer-Dauern für den Stepper in Minuten. */
export const TIMER_MINUTES = [1, 2, 3, 5, 10, 15, 20, 25, 30, 45, 60, 90, 120] as const

export const BLOCK_COLORS = Object.keys(BLOCK_PALETTE) as BlockColor[]

export const COLOR_NAMES: Record<BlockColor, string> = {
  slate: 'Schiefer',
  sky: 'Himmel',
  mustard: 'Senf',
  terracotta: 'Terrakotta',
  cream: 'Creme',
  sage: 'Salbei',
  lavender: 'Lavendel',
  rose: 'Rosé',
  teal: 'Petrol',
}

/** Titel ohne weiche Trennstellen – für Fließtext. */
export const plainTitle = (t: string) => t.replaceAll('\u00AD', '')

export const actionLabel = (a: HabitAction) => (a.kind === 'timer' ? `Timer ${Math.round(a.durationSec / 60)} Min.` : 'Abhaken')

/** Erste Farbe, die noch nicht vorkommt – so bleibt der Stapel bunt. */
export function nextColor(used: readonly BlockColor[]): BlockColor {
  return BLOCK_COLORS.find((c) => !used.includes(c)) ?? BLOCK_COLORS[used.length % BLOCK_COLORS.length]!
}

export const emptyDraft = (color: BlockColor): BlockDraft => ({ title: '', color, kind: 'check', minutes: 5 })

export function draftFrom(h: Pick<Habit, 'title' | 'color' | 'action'>): BlockDraft {
  return {
    title: h.title,
    color: h.color,
    kind: h.action.kind,
    minutes: h.action.kind === 'timer' ? Math.max(1, Math.round(h.action.durationSec / 60)) : 5,
  }
}

export function draftToInput(d: BlockDraft): BlockInput {
  return {
    title: d.title,
    color: d.color,
    action: d.kind === 'timer' ? { kind: 'timer', durationSec: d.minutes * 60 } : { kind: 'check' },
  }
}

export const draftValid = (d: BlockDraft) => d.title.trim().length > 0

/** Nächste Stufe aus TIMER_MINUTES; krumme Werte rasten auf die Liste ein. */
export function stepMinutes(current: number, dir: -1 | 1): number {
  return (dir > 0 ? TIMER_MINUTES.find((m) => m > current) : TIMER_MINUTES.findLast((m) => m < current)) ?? current
}
