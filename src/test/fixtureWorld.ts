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
 * Test-Welt (frühere Demo-Insel): reichhaltige Kulisse für die Tests – Bröckeln, Einsturz,
 * Geister, hohe Türme. Nicht in der App verwendet.
 * Alle Daten sind relativ zu `today` erzeugt und Engine-konsistent
 * (Verfestigung und Überspringen passen zu den Logs; siehe engine.test.ts).
 *
 * - Morgenroutine: 3 verfestigte Blöcke + "Meditation" als Geister-Block (17/28 Tage);
 *                  "10 Min. Dehnen" ist zwei Tage nicht erledigt und bröckelt mitten im Turm
 * - Abendroutine:  2 Tage ganz ohne Häkchen – beide Blöcke über dem Anker bröckeln, in 2 Tagen stürzt er ein
 * - Feierabend:    "10 Min. Lesen" (7/28) wackelt – gestern verpasst, heute retten
 * - Training:      7 Blöcke hoch – zeigt im Fokus-Modus die Höhenzonen bis in die Wolken
 */
export function createFixtureWorld(today: ISODate): DomainState {
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
      id: 'hb-aufstehen',
      towerId: 'tw-morgen',
      title: 'Aufstehen & Bett machen',
      role: 'anchor',
      action: { kind: 'check' },
      color: 'slate',
      lifecycle: 'solid',
      formation: null,
      createdAt: at(ago(90), 7),
    },
    {
      id: 'hb-wasser',
      towerId: 'tw-morgen',
      title: 'Glas Wasser trinken',
      role: 'stacked',
      action: { kind: 'check' },
      color: 'sky',
      lifecycle: 'solid',
      wasSolid: true,
      formation: {
        startedOn: ago(88),
        doneDays: 28,
        missedInRow: 0,
        solidifiedOn: ago(61),
        evaluatedThrough: ago(61),
      },
      createdAt: at(ago(88), 7),
    },
    {
      id: 'hb-dehnen',
      towerId: 'tw-morgen',
      title: '10 Min. Dehnen',
      role: 'stacked',
      action: { kind: 'timer', durationSec: 600 },
      color: 'mustard',
      lifecycle: 'solid',
      wasSolid: true,
      skippedInRow: 2,
      formation: {
        startedOn: ago(60),
        doneDays: 28,
        missedInRow: 0,
        solidifiedOn: ago(33),
        evaluatedThrough: ago(33),
      },
      createdAt: at(ago(60), 7),
    },
    {
      id: 'hb-meditation',
      towerId: 'tw-morgen',
      title: 'Medi\u00ADtation',
      role: 'stacked',
      action: { kind: 'timer', durationSec: 300 },
      color: 'teal',
      lifecycle: 'forming',
      formation: {
        startedOn: ago(17),
        doneDays: 17,
        missedInRow: 0,
        evaluatedThrough: ago(1),
      },
      createdAt: at(ago(17), 7),
    },
    // Abendroutine
    {
      id: 'hb-zaehne',
      towerId: 'tw-abend',
      title: 'Zähne\u00ADputzen',
      role: 'anchor',
      action: { kind: 'check' },
      color: 'cream',
      lifecycle: 'solid',
      formation: null,
      createdAt: at(ago(50), 21),
    },
    {
      id: 'hb-tagebuch',
      towerId: 'tw-abend',
      title: 'Tage\u00ADbuch',
      role: 'stacked',
      action: { kind: 'check' },
      color: 'terracotta',
      lifecycle: 'solid',
      skippedInRow: 2,
      wasSolid: true,
      formation: {
        startedOn: ago(45),
        doneDays: 28,
        missedInRow: 0,
        solidifiedOn: ago(18),
        evaluatedThrough: ago(18),
      },
      createdAt: at(ago(45), 21),
    },
    {
      id: 'hb-handy',
      towerId: 'tw-abend',
      title: 'Handy weg\u00ADlegen',
      role: 'stacked',
      action: { kind: 'check' },
      color: 'sky',
      lifecycle: 'solid',
      skippedInRow: 2,
      wasSolid: true,
      formation: {
        startedOn: ago(40),
        doneDays: 28,
        missedInRow: 0,
        solidifiedOn: ago(13),
        evaluatedThrough: ago(13),
      },
      createdAt: at(ago(40), 21),
    },
    // Feierabend
    {
      id: 'hb-laptop',
      towerId: 'tw-feierabend',
      title: 'Laptop zuklappen',
      role: 'anchor',
      action: { kind: 'check' },
      color: 'sage',
      lifecycle: 'solid',
      formation: null,
      createdAt: at(ago(20), 18),
    },
    {
      id: 'hb-lesen',
      towerId: 'tw-feierabend',
      title: '10 Min. Lesen',
      role: 'stacked',
      action: { kind: 'timer', durationSec: 600 },
      color: 'lavender',
      lifecycle: 'forming',
      formation: {
        startedOn: ago(8),
        doneDays: 7,
        missedInRow: 1,
        evaluatedThrough: ago(1),
      },
      createdAt: at(ago(8), 18),
    },
    // Training
    {
      id: 'hb-schuhe',
      towerId: 'tw-training',
      title: 'Sport\u00ADschuhe anziehen',
      role: 'anchor',
      action: { kind: 'check' },
      color: 'rose',
      lifecycle: 'solid',
      formation: null,
      createdAt: at(ago(200), 17),
    },
    ...(
      [
        ['hb-aufwaermen', '5 Min. Aufwärmen', 'mustard', 300],
        ['hb-liegestuetze', '20 Liege\u00ADstütze', 'terracotta', 0],
        ['hb-kniebeugen', '30 Knie\u00ADbeugen', 'sage', 0],
        ['hb-plank', '1 Min. Plank', 'teal', 60],
        ['hb-faszien', 'Faszien\u00ADrolle', 'lavender', 120],
      ] as const
    ).map(([id, title, color, sec], i): Habit => {
      const startedOn = ago(190 - i * 30)
      return {
        id,
        towerId: 'tw-training',
        title,
        role: 'stacked',
        action: sec ? { kind: 'timer', durationSec: sec } : { kind: 'check' },
        color,
        lifecycle: 'solid',
        wasSolid: true,
        formation: {
          startedOn,
          doneDays: 28,
          missedInRow: 0,
          solidifiedOn: addDays(startedOn, 27),
          evaluatedThrough: addDays(startedOn, 27),
        },
        createdAt: at(startedOn, 17),
      }
    }),
    {
      id: 'hb-kalt',
      towerId: 'tw-training',
      title: 'Kalt duschen',
      role: 'stacked',
      action: { kind: 'check' },
      color: 'sky',
      lifecycle: 'forming',
      formation: {
        startedOn: ago(22),
        doneDays: 21,
        missedInRow: 0,
        evaluatedThrough: ago(1),
      },
      createdAt: at(ago(22), 17),
    },
  ]

  const towers: Tower[] = [
    {
      id: 'tw-morgen',
      name: 'Morgenroutine',
      timeOfDay: 'morning',
      blockIds: ['hb-aufstehen', 'hb-wasser', 'hb-dehnen', 'hb-meditation'],
      lostBlockIds: [],
      createdAt: at(ago(90), 7),
    },
    {
      id: 'tw-abend',
      name: 'Abendroutine',
      timeOfDay: 'evening',
      blockIds: ['hb-zaehne', 'hb-tagebuch', 'hb-handy'],
      lostBlockIds: [],
      createdAt: at(ago(50), 21),
    },
    {
      id: 'tw-feierabend',
      name: 'Feierabend',
      timeOfDay: 'evening',
      blockIds: ['hb-laptop', 'hb-lesen'],
      lostBlockIds: [],
      createdAt: at(ago(20), 18),
    },
    {
      id: 'tw-training',
      name: 'Training',
      timeOfDay: 'evening',
      blockIds: ['hb-schuhe', 'hb-aufwaermen', 'hb-liegestuetze', 'hb-kniebeugen', 'hb-plank', 'hb-faszien', 'hb-kalt'],
      lostBlockIds: [],
      createdAt: at(ago(200), 17),
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

  logDays('hb-aufstehen', span(24, 0), 7)
  logDays('hb-wasser', span(24, 0), 7)
  logDays('hb-dehnen', span(24, 3), 7)
  logDays('hb-meditation', span(17, 1), 7)
  logDays('hb-zaehne', span(12, 3), 21)
  logDays('hb-tagebuch', span(12, 3), 21)
  logDays('hb-handy', span(12, 3), 21)
  logDays('hb-laptop', span(20, 1), 18)
  logDays('hb-lesen', span(8, 2), 18)
  for (const id of ['hb-schuhe', 'hb-aufwaermen', 'hb-liegestuetze', 'hb-kniebeugen', 'hb-plank', 'hb-faszien']) {
    logDays(id, span(30, 1), 17)
  }
  logDays('hb-kalt', span(22, 1).filter((d) => d !== ago(10)), 17)

  const events: TowerEvent[] = [
    {
      id: 'demo-ev-1',
      towerId: 'tw-abend',
      type: 'block_crumbling',
      habitId: 'hb-handy',
      date: ago(1),
      createdAt: at(today, 4),
    },
    {
      id: 'demo-ev-5',
      towerId: 'tw-abend',
      type: 'block_crumbling',
      habitId: 'hb-tagebuch',
      date: ago(1),
      createdAt: at(today, 4),
    },
    {
      id: 'demo-ev-4',
      towerId: 'tw-morgen',
      type: 'block_crumbling',
      habitId: 'hb-dehnen',
      date: ago(1),
      createdAt: at(today, 4),
    },
    {
      id: 'demo-ev-2',
      towerId: 'tw-feierabend',
      type: 'formation_wobbling',
      habitId: 'hb-lesen',
      date: ago(1),
      createdAt: at(today, 4),
    },
    {
      id: 'demo-ev-3',
      towerId: 'tw-training',
      type: 'formation_wobbling',
      habitId: 'hb-kalt',
      date: ago(10),
      createdAt: at(ago(9), 4),
      seenAt: at(ago(9), 8),
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
