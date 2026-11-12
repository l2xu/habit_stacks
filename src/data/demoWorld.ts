import { addDays } from '@/domain/dates'
import { DEFAULT_RULES, DEFAULT_SETTINGS } from '@/domain/rules'
import {
  SCHEMA_VERSION,
  type DomainState,
  type Habit,
  type HabitLog,
  type ISODate,
  type ISODateTime,
  type LogKey,
  type Tower,
  type TowerEvent,
} from '@/domain/types'

/**
 * Demo-Insel: wird beim allerersten Start (leerer Speicher) angelegt und lebt danach
 * ganz normal weiter – die Regel-Engine wertet ab morgen echte Tage aus.
 * Alle Daten sind relativ zu `today` erzeugt und Engine-konsistent
 * (Formation passt zu den Logs; siehe engine.test.ts).
 *
 * - Morgenroutine: Anker "Kaffee machen" + "10 Min. Lesen" (27/28) – heute erledigt, morgen fest
 * - Abendroutine:  Anker "Zähneputzen" + "Abwaschen" (16/28)
 * - Haushalt:      Anker "Robbie rufen" + "Geschirr verräumen" (5/28) wackelt – gestern verpasst, heute retten
 */
export function createDemoWorld(today: ISODate): DomainState {
  const ago = (n: number) => addDays(today, -n)
  const span = (from: number, to: number) =>
    Array.from({ length: from - to + 1 }, (_, i) => ago(from - i))

  const at = (date: ISODate, hour: number): ISODateTime => {
    const [y, m, d] = date.split('-').map(Number) as [number, number, number]
    return new Date(y, m - 1, d, hour).toISOString()
  }

  const habits: Habit[] = [
    // Morgenroutine
    {
      id: 'hb-kaffee',
      towerId: 'tw-morgen',
      title: 'Kaffee machen',
      role: 'anchor',
      action: { kind: 'check' },
      color: 'terracotta',
      lifecycle: 'solid',
      formation: null,
      createdAt: at(ago(40), 7),
    },
    {
      id: 'hb-lesen',
      towerId: 'tw-morgen',
      title: '10 Min. Lesen',
      role: 'stacked',
      action: { kind: 'timer', durationSec: 600 },
      color: 'lavender',
      lifecycle: 'forming',
      formation: {
        startedOn: ago(27),
        doneDays: 27,
        missedInRow: 0,
        evaluatedThrough: ago(1),
      },
      createdAt: at(ago(27), 7),
    },
    // Abendroutine
    {
      id: 'hb-zaehne',
      towerId: 'tw-abend',
      title: 'Zähne­putzen',
      role: 'anchor',
      action: { kind: 'check' },
      color: 'cream',
      lifecycle: 'solid',
      formation: null,
      createdAt: at(ago(30), 21),
    },
    {
      id: 'hb-abwaschen',
      towerId: 'tw-abend',
      title: 'Ab­waschen',
      role: 'stacked',
      action: { kind: 'check' },
      color: 'sky',
      lifecycle: 'forming',
      formation: {
        startedOn: ago(16),
        doneDays: 16,
        missedInRow: 0,
        evaluatedThrough: ago(1),
      },
      createdAt: at(ago(16), 21),
    },
    // Haushalt
    {
      id: 'hb-robbie',
      towerId: 'tw-haushalt',
      title: 'Robbie rufen',
      role: 'anchor',
      action: { kind: 'check' },
      color: 'slate',
      lifecycle: 'solid',
      formation: null,
      createdAt: at(ago(6), 12),
    },
    {
      id: 'hb-geschirr',
      towerId: 'tw-haushalt',
      title: 'Geschirr verräumen',
      role: 'stacked',
      action: { kind: 'check' },
      color: 'sage',
      lifecycle: 'forming',
      formation: {
        startedOn: ago(6),
        doneDays: 5,
        missedInRow: 1,
        evaluatedThrough: ago(1),
      },
      createdAt: at(ago(6), 12),
    },
  ]

  const towers: Tower[] = [
    {
      id: 'tw-morgen',
      name: 'Morgenroutine',
      timeOfDay: 'morning',
      blockIds: ['hb-kaffee', 'hb-lesen'],
      lostBlockIds: [],
      createdAt: at(ago(40), 7),
    },
    {
      id: 'tw-abend',
      name: 'Abendroutine',
      timeOfDay: 'evening',
      blockIds: ['hb-zaehne', 'hb-abwaschen'],
      lostBlockIds: [],
      createdAt: at(ago(30), 21),
    },
    {
      id: 'tw-haushalt',
      name: 'Haushalt',
      timeOfDay: 'midday',
      blockIds: ['hb-robbie', 'hb-geschirr'],
      lostBlockIds: [],
      createdAt: at(ago(6), 12),
    },
  ]

  const byId = Object.fromEntries(habits.map((h) => [h.id, h])) as Record<string, Habit>
  const logs: Record<LogKey, HabitLog> = {}
  const logDays = (habitId: string, dates: ISODate[], hour: number) => {
    const habit = byId[habitId]!
    for (const date of dates) {
      logs[`${habitId}|${date}`] = {
        id: `log-${habitId}-${date}`,
        habitId,
        towerId: habit.towerId,
        date,
        completedAt: at(date, hour),
        durationSec: habit.action.kind === 'timer' ? habit.action.durationSec : undefined,
        source: 'focus',
      }
    }
  }

  logDays('hb-kaffee', span(40, 1), 7)
  logDays('hb-lesen', span(27, 1), 7)
  logDays('hb-zaehne', span(30, 1), 21)
  logDays('hb-abwaschen', span(16, 1), 21)
  logDays('hb-robbie', span(6, 1), 12)
  logDays('hb-geschirr', span(6, 2), 12)

  const events: TowerEvent[] = [
    {
      id: 'demo-ev-1',
      towerId: 'tw-haushalt',
      type: 'formation_wobbling',
      habitId: 'hb-geschirr',
      date: ago(1),
      createdAt: at(today, 4),
    },
  ]

  return {
    schemaVersion: SCHEMA_VERSION,
    towers: Object.fromEntries(towers.map((t) => [t.id, t])),
    towerOrder: towers.map((t) => t.id),
    habits: byId,
    logs,
    events,
    focus: null,
    settings: DEFAULT_SETTINGS,
    rules: DEFAULT_RULES,
    lastEvaluatedOn: ago(1),
  }
}
