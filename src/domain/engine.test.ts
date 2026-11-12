import { describe, expect, it } from 'vitest'
import { createFixtureWorld } from '@/test/fixtureWorld'
import { addDays } from './dates'
import { canDiscard, canStack, pauseTower, restackBlock, resumeTower, stackBlock } from './editor'
import { createFocusSession } from './focus'
import { evaluateAll, solidifyOnCompletion } from './engine'
import { createEmptyState } from './state'
import type { DomainState, Habit, ISODate, TowerEvent } from './types'

const D0 = '2026-03-02'
const day = (n: number) => addDays(D0, n)
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => day(from + i))
const at = (date: ISODate) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d, 12).toISOString()
}

interface BlockSpec {
  id: string
  anchor?: boolean
  /** Geister-Block ab diesem Tag; ohne Angabe: verfestigt. */
  formingFrom?: ISODate
  doneDays?: number
  /** Verfestigt: so oft schon in Folge übersprungen. */
  skips?: number
}

/** Ein Turm, ausgewertet bis zum Vortag von `evaluatedFrom`. */
function world(blocks: BlockSpec[], opts: { evaluatedFrom?: ISODate } = {}): DomainState {
  const evaluatedFrom = opts.evaluatedFrom ?? D0
  const habits: Habit[] = blocks.map((b) => ({
    id: b.id,
    towerId: 't',
    title: b.id,
    role: b.anchor ? 'anchor' : 'stacked',
    action: { kind: 'check' },
    color: 'sky',
    lifecycle: b.formingFrom ? 'forming' : 'solid',
    formation: b.anchor
      ? null
      : {
          startedOn: b.formingFrom ?? day(-100),
          doneDays: b.doneDays ?? (b.formingFrom ? 0 : 28),
          missedInRow: 0,
          evaluatedThrough: b.formingFrom ? null : day(-74),
        },
    ...(b.skips !== undefined && { skippedInRow: b.skips }),
    createdAt: at(day(-120)),
  }))
  return {
    ...createEmptyState(),
    towers: {
      t: {
        id: 't',
        name: 'Turm',
        timeOfDay: 'morning',
        blockIds: blocks.map((b) => b.id),
        lostBlockIds: [],
        createdAt: at(day(-120)),
      },
    },
    towerOrder: ['t'],
    habits: Object.fromEntries(habits.map((h) => [h.id, h])),
    lastEvaluatedOn: addDays(evaluatedFrom, -1),
  }
}

/** Alle genannten Blöcke an allen Tagen erledigt. */
const withAll = (s: DomainState, habitIds: string[], dates: ISODate[]) => habitIds.reduce((acc, id) => withLogs(acc, id, dates), s)

function withLogs(s: DomainState, habitId: string, dates: ISODate[]): DomainState {
  const logs = { ...s.logs }
  for (const date of dates) {
    logs[`${habitId}|${date}`] = { id: `${habitId}-${date}`, habitId, towerId: 't', date, completedAt: at(date), source: 'focus' }
  }
  return { ...s, logs }
}

const types = (events: TowerEvent[]) => events.map((e) => `${e.type}@${e.date}`)
/** Mit Block, z. B. 'block_fallen:e@2026-03-05'. */
const detail = (events: TowerEvent[]) => events.map((e) => [e.type, 'habitId' in e && e.habitId].filter(Boolean).join(':') + `@${e.date}`)
const summary = (s: DomainState) => ({
  towers: s.towers,
  habits: Object.fromEntries(Object.entries(s.habits).map(([id, h]) => [id, { ...h, endedAt: h.endedAt ? 'set' : undefined }])),
  events: types(s.events),
})

describe('Verfestigung', () => {
  it('wird nach 28 erledigten Tagen massiv', () => {
    let s = world([{ id: 'a', anchor: true }, { id: 'b', formingFrom: D0 }])
    s = withLogs(s, 'b', range(0, 27))
    const r = evaluateAll(s, day(28))
    const f = r.habits.b!.formation!

    expect(r.habits.b!.lifecycle).toBe('solid')
    expect(f.solidifiedOn).toBe(day(27))
    expect(f.doneDays).toBe(28)
    expect(types(r.events)).toEqual([`block_solidified@${day(27)}`])
  })

  it('bleibt mit 27 Würfeln ein Geist, bis auch der 28. Tag erledigt ist', () => {
    let s = world([{ id: 'a', anchor: true }, { id: 'b', formingFrom: D0 }])
    s = withLogs(s, 'b', range(0, 26))
    const r = evaluateAll(s, day(28))

    expect(r.habits.b!.lifecycle).toBe('forming')
    expect(r.habits.b!.formation).toMatchObject({ doneDays: 27, missedInRow: 1 })
    expect(types(r.events)).toEqual([`formation_wobbling@${day(27)}`])
  })

  it('übersteht einen einzelnen Fehltag – der Geist wackelt und bekommt keinen Würfel', () => {
    let s = world([{ id: 'a', anchor: true }, { id: 'b', formingFrom: D0 }])
    s = withLogs(s, 'b', [...range(0, 6), ...range(8, 9)])
    const r = evaluateAll(s, day(10))
    const f = r.habits.b!.formation!

    expect(r.habits.b!.lifecycle).toBe('forming')
    expect(f.doneDays).toBe(9)
    expect(f.missedInRow).toBe(0)
    expect(types(r.events)).toEqual([`formation_wobbling@${day(7)}`])
  })

  it('bricht weg, wenn zwei Tage hintereinander fehlen', () => {
    let s = world([{ id: 'a', anchor: true }, { id: 'b', formingFrom: D0 }])
    s = withLogs(s, 'b', range(0, 3))
    const r = evaluateAll(s, day(7))

    expect(r.habits.b!.lifecycle).toBe('broken')
    expect(r.habits.b!.formation!.brokenOn).toBe(day(5))
    expect(r.towers.t!.blockIds).toEqual(['a'])
    expect(r.towers.t!.lostBlockIds).toEqual(['b'])
    expect(types(r.events)).toEqual([`formation_wobbling@${day(4)}`, `block_broken@${day(5)}`])
    const broken = r.events.find((e) => e.type === 'block_broken')
    expect(broken && 'onDay' in broken && broken.onDay).toBe(6)
  })

  it('verzeiht einzelne Fehltage immer wieder, solange dazwischen erledigt wird', () => {
    let s = world([{ id: 'a', anchor: true }, { id: 'b', formingFrom: D0 }])
    s = withLogs(s, 'b', [day(0), day(2), day(4), day(6)])
    const r = evaluateAll(s, day(8))

    expect(r.habits.b!.lifecycle).toBe('forming')
    expect(r.habits.b!.formation).toMatchObject({ doneDays: 4, missedInRow: 1 })
    expect(types(r.events)).toEqual([1, 3, 5, 7].map((n) => `formation_wobbling@${day(n)}`))
  })

  it('verfestigt einen Geist sofort, der schon genug erledigte Tage hat (z. B. nach einer Regeländerung)', () => {
    const s = world([{ id: 'a', anchor: true }, { id: 'b', formingFrom: day(-30), doneDays: 28 }])
    const r = evaluateAll(s, day(1))

    expect(r.habits.b!.lifecycle).toBe('solid')
    expect(types(r.events)).toEqual([`block_solidified@${day(0)}`])
  })
})

describe('Verfestigung am selben Tag', () => {
  /** Geist mit 27 Würfeln, ausgewertet bis gestern; heute (Tag 27) das 28. Häkchen. */
  const ready = () => {
    let s = world([{ id: 'a', anchor: true }, { id: 'b', formingFrom: D0 }])
    s = evaluateAll(withLogs(s, 'b', range(0, 26)), day(27))
    return withLogs(s, 'b', [day(27)])
  }
  const input = { title: 'Neu', color: 'sage', action: { kind: 'check' } } as const

  it('macht den Geist mit dem 28. Häkchen sofort fest – mit Neuigkeit von heute', () => {
    const r = solidifyOnCompletion(ready(), 'b', day(27))

    expect(r.habits.b!.lifecycle).toBe('solid')
    expect(r.habits.b!.formation).toMatchObject({ doneDays: 28, solidifiedOn: day(27), evaluatedThrough: day(27) })
    expect(types(r.events.slice(-1))).toEqual([`block_solidified@${day(27)}`])
    expect(r.events.at(-1)!.seenAt).toBeUndefined()
  })

  it('tut nichts, solange noch Tage fehlen oder heute nicht abgehakt ist', () => {
    let s = world([{ id: 'a', anchor: true }, { id: 'b', formingFrom: D0 }])
    s = evaluateAll(withLogs(s, 'b', range(0, 25)), day(26))
    const notYet = withLogs(s, 'b', [day(26)])
    expect(solidifyOnCompletion(notYet, 'b', day(26))).toBe(notYet)

    const unchecked = evaluateAll(withLogs(world([{ id: 'a', anchor: true }, { id: 'b', formingFrom: D0 }]), 'b', range(0, 26)), day(27))
    expect(solidifyOnCompletion(unchecked, 'b', day(27))).toBe(unchecked)
  })

  it('der nächste Morgen ändert nichts mehr und meldet die Verfestigung nicht doppelt', () => {
    const s = solidifyOnCompletion(ready(), 'b', day(27))
    const r = evaluateAll(s, day(28))

    expect(r.habits.b!.lifecycle).toBe('solid')
    expect(r.habits.b!.skippedInRow ?? 0).toBe(0)
    expect(r.events.filter((e) => e.type === 'block_solidified')).toHaveLength(1)
  })

  it('erlaubt sofort den nächsten Block – er startet erst morgen', () => {
    const s = solidifyOnCompletion(ready(), 'b', day(27))
    expect(canStack(s, 't')).toBe(true)

    const r = stackBlock(s, 't', input, day(27), Date.parse(at(day(27))), 'c')
    expect(r.habits.c!.formation!.startedOn).toBe(day(28))
    expect(canDiscard(r, 'c', day(27))).toBe(true)
    // Heute ist er noch nicht dran: Der Fokus-Modus lässt ihn aus.
    expect(createFocusSession('t', r.towers.t!.blockIds, r.habits, r.logs, day(27), 0)?.steps.map((x) => x.habitId)).toEqual(['a', 'b'])
  })

  it('heute ohne Häkchen passiert dem neuen Block nichts – ab morgen zählt jeder Tag', () => {
    const s = stackBlock(solidifyOnCompletion(ready(), 'b', day(27)), 't', input, day(27), Date.parse(at(day(27))), 'c')

    const morning = evaluateAll(s, day(28))
    expect(morning.habits.c!.formation).toMatchObject({ doneDays: 0, missedInRow: 0, evaluatedThrough: null })
    expect(types(morning.events.slice(s.events.length))).toEqual([])

    const later = evaluateAll(withAll(morning, ['a', 'b', 'c'], [day(28)]), day(29))
    expect(later.habits.c!.formation).toMatchObject({ doneDays: 1, missedInRow: 0 })
  })

  it('auch Neu-Stapeln aus dem Schutthaufen startet dann erst morgen', () => {
    let s = solidifyOnCompletion(ready(), 'b', day(27))
    s = { ...s, towers: { t: { ...s.towers.t!, lostBlockIds: ['x'] } }, habits: { ...s.habits, x: { ...s.habits.b!, id: 'x', lifecycle: 'broken', formation: null } } }
    const r = restackBlock(s, 'x', day(27), 0)
    expect(r.habits.x!.formation!.startedOn).toBe(day(28))
  })

  it('an einem normalen Tag beginnt ein neuer Block wie bisher sofort', () => {
    const s = world([{ id: 'a', anchor: true }])
    expect(stackBlock(s, 't', input, day(3), 0, 'c').habits.c!.formation!.startedOn).toBe(day(3))
  })
})

describe('Überspringen – jeder Tag ohne Häkchen zählt', () => {
  const tower = () => world([{ id: 'a', anchor: true }, { id: 'b' }, { id: 'c' }, { id: 'd' }])

  it('lässt einen Block nach 2 Tagen bröckeln und nach 4 abfallen – egal wo er steht, auch wenn der Rest erledigt ist', () => {
    const s = withAll(tower(), ['a', 'c', 'd'], range(0, 5))
    const r = evaluateAll(s, day(6))

    expect(types(r.events)).toEqual([`block_crumbling@${day(1)}`, `block_fallen@${day(3)}`])
    const fallen = r.events.find((e) => e.type === 'block_fallen')
    expect(fallen && 'level' in fallen && fallen.level).toBe(1)
    expect(r.habits.b).toMatchObject({ lifecycle: 'fallen', skippedInRow: 4 })
    expect(r.towers.t!.blockIds).toEqual(['a', 'c', 'd'])
    expect(r.towers.t!.lostBlockIds).toEqual(['b'])
  })

  it('steht wieder sicher, sobald der Block erledigt wird', () => {
    let s = withAll(tower(), ['a', 'c', 'd'], range(0, 3))
    s = withLogs(s, 'b', [day(2)])
    const r = evaluateAll(s, day(4))

    expect(types(r.events)).toEqual([`block_crumbling@${day(1)}`, `block_recovered@${day(2)}`])
    expect(r.habits.b).toMatchObject({ lifecycle: 'solid', skippedInRow: 1 })
  })

  it('zählt auch Tage, an denen der ganze Turm nichts hatte', () => {
    const s = withAll(tower(), ['a', 'c', 'd'], [day(0), day(2)])
    const r = evaluateAll(s, day(3))

    expect(r.habits.b!.skippedInRow).toBe(3)
    expect(['c', 'd'].map((id) => r.habits[id]!.skippedInRow)).toEqual([0, 0])
    expect(detail(r.events)).toEqual([`block_crumbling:b@${day(1)}`])
  })

  it('verschont den Anker und Geister-Blöcke (die haben eigene Regeln)', () => {
    let s = world([{ id: 'a', anchor: true }, { id: 'b' }, { id: 'g', formingFrom: day(-3), doneDays: 3 }])
    s = withAll(s, ['b', 'g'], range(0, 4))
    const r = evaluateAll(s, day(5))

    expect(r.events).toEqual([])
    expect(r.habits.a!.skippedInRow).toBeUndefined()
  })
})

describe('Einsturz', () => {
  it('4 Tage ganz ohne Häkchen: alle Blöcke über dem Anker stürzen gemeinsam ein, der Anker bleibt', () => {
    const r = evaluateAll(world([{ id: 'a', anchor: true }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'e' }]), day(30))

    expect(detail(r.events)).toEqual([
      `block_crumbling:e@${day(1)}`,
      `block_crumbling:d@${day(1)}`,
      `block_crumbling:c@${day(1)}`,
      `block_crumbling:b@${day(1)}`,
      `tower_collapsed@${day(3)}`,
    ])
    const collapsed = r.events.at(-1)
    expect(collapsed && 'habitIds' in collapsed && collapsed.habitIds).toEqual(['b', 'c', 'd', 'e'])
    expect(r.towers.t!.blockIds).toEqual(['a'])
    expect(['b', 'c', 'd', 'e'].map((id) => r.habits[id]!.lifecycle)).toEqual(['fallen', 'fallen', 'fallen', 'fallen'])
    expect(r.habits.a!.lifecycle).toBe('solid')
  })

  it('wer schon vorher Tage verpasst hat, fällt früher einzeln – der Rest stürzt danach ein', () => {
    const r = evaluateAll(world([{ id: 'a', anchor: true }, { id: 'b', skips: 2 }, { id: 'c' }, { id: 'd' }]), day(4))

    expect(detail(r.events)).toEqual([
      `block_crumbling:d@${day(1)}`,
      `block_crumbling:c@${day(1)}`,
      `block_fallen:b@${day(1)}`,
      `tower_collapsed@${day(3)}`,
    ])
    expect(r.towers.t!.blockIds).toEqual(['a'])
  })

  it('ein einzelner Block über dem Anker fällt einfach ab', () => {
    const r = evaluateAll(world([{ id: 'a', anchor: true }, { id: 'b' }]), day(4))
    expect(types(r.events)).toEqual([`block_crumbling@${day(1)}`, `block_fallen@${day(3)}`])
  })

  it('kein Einsturz, solange über dem Anker noch ein Block steht', () => {
    let s = world([{ id: 'a', anchor: true }, { id: 'b' }, { id: 'c' }, { id: 'g', formingFrom: day(-3), doneDays: 3 }])
    s = withLogs(s, 'g', range(0, 3))
    const r = evaluateAll(s, day(4))

    expect(types(r.events.filter((e) => e.type !== 'block_crumbling'))).toEqual([`block_fallen@${day(3)}`, `block_fallen@${day(3)}`])
    expect(r.towers.t!.blockIds).toEqual(['a', 'g'])
  })

  it('der Geist bricht schon nach 2 Tagen – nie zweimal verpassen', () => {
    const r = evaluateAll(world([{ id: 'a', anchor: true }, { id: 'b' }, { id: 'g', formingFrom: day(-14), doneDays: 14 }]), day(4))

    expect(detail(r.events)).toEqual([
      `formation_wobbling:g@${day(0)}`,
      `block_crumbling:b@${day(1)}`,
      `block_broken:g@${day(1)}`,
      `block_fallen:b@${day(3)}`,
    ])
  })

  it('lässt einen Turm ohne feste Blöcke in Ruhe – nur der Geist folgt seiner Regel', () => {
    expect(evaluateAll(world([{ id: 'a', anchor: true }]), day(30)).events).toEqual([])

    const r = evaluateAll(world([{ id: 'a', anchor: true }, { id: 'g', formingFrom: day(-3), doneDays: 3 }]), day(30))
    expect(types(r.events)).toEqual([`formation_wobbling@${day(0)}`, `block_broken@${day(1)}`])
  })
})

describe('Pausieren', () => {
  const tower = () => world([{ id: 'a', anchor: true }, { id: 'b' }, { id: 'g', formingFrom: day(-5), doneDays: 5 }])

  it('wertet einen pausierten Turm nicht aus – nichts wackelt, bröckelt oder bricht', () => {
    const r = evaluateAll(pauseTower(tower(), 't', D0), day(30))

    expect(r.events).toEqual([])
    expect(r.habits.b!.skippedInRow).toBeUndefined()
    expect(r.habits.g!.formation).toMatchObject({ doneDays: 5, missedInRow: 0 })
  })

  it('zählt nach dem Fortsetzen ab dem Fortsetzungstag weiter', () => {
    const paused = evaluateAll(pauseTower(tower(), 't', D0), day(10))
    const resumed = resumeTower(paused, 't', day(10))
    expect(resumed.towers.t).toMatchObject({ pauses: [{ from: D0, to: day(9) }] })
    expect(resumed.towers.t!.pausedSince).toBeUndefined()

    const r = evaluateAll(resumed, day(12))
    expect(detail(r.events)).toEqual([`formation_wobbling:g@${day(10)}`, `block_crumbling:b@${day(11)}`, `block_broken:g@${day(11)}`])
  })

  it('Fortsetzen am selben Tag hinterlässt keine Pause', () => {
    const r = resumeTower(pauseTower(tower(), 't', D0), 't', D0)
    expect(r.towers.t!.pausedSince).toBeUndefined()
    expect(r.towers.t!.pauses).toBeUndefined()
  })

  it('frühere Pausen bleiben ausgenommen, auch wenn die Tage erst später ausgewertet werden', () => {
    const s = tower()
    const withPause = { ...s, towers: { t: { ...s.towers.t!, pauses: [{ from: D0, to: day(4) }] } } }
    const r = evaluateAll(withAll(withPause, ['g'], range(5, 6)), day(7))

    expect(detail(r.events)).toEqual([`block_crumbling:b@${day(6)}`])
    expect(r.habits.g!.formation!.doneDays).toBe(7)
  })
})

describe('Auswertung', () => {
  it('ist idempotent', () => {
    const s = withLogs(world([{ id: 'a', anchor: true }, { id: 'b', formingFrom: D0 }]), 'b', range(0, 5))
    const once = evaluateAll(s, day(8))
    expect(evaluateAll(once, day(8))).toBe(once)
  })

  it('liefert beim Nachholen dasselbe wie Tag für Tag', () => {
    let s = world([{ id: 'a', anchor: true }, { id: 'b' }, { id: 'g', formingFrom: D0 }])
    s = withLogs(s, 'g', [...range(0, 8), ...range(10, 11)])
    s = withLogs(s, 'a', range(0, 11))

    const batch = evaluateAll(s, day(25))
    let stepwise = s
    for (let i = 1; i <= 25; i++) stepwise = evaluateAll(stepwise, day(i))

    expect(summary(stepwise)).toEqual(summary(batch))
  })

  it('liefert auch bei Einsturz und Pausen dasselbe wie Tag für Tag', () => {
    let s = world([{ id: 'a', anchor: true }, { id: 'b' }, { id: 'c' }, { id: 'd' }, { id: 'g', formingFrom: D0 }])
    // b wird zwischendurch erledigt, c und d nie; Pause von Tag 12 bis 14.
    s = withAll(s, ['a', 'b'], [day(5), ...range(7, 9)])
    s = { ...s, towers: { t: { ...s.towers.t!, pauses: [{ from: day(12), to: day(14) }] } } }

    const batch = evaluateAll(s, day(20))
    let stepwise = s
    for (let i = 1; i <= 20; i++) stepwise = evaluateAll(stepwise, day(i))

    expect(summary(stepwise)).toEqual(summary(batch))
  })

  it('setzt bei leerem Zustand nur den Cursor', () => {
    const r = evaluateAll(createEmptyState(), day(5))
    expect(r.lastEvaluatedOn).toBe(day(4))
    expect(r.events).toEqual([])
  })
})

describe('Test-Welt', () => {
  it('ist am Erstellungstag bereits vollständig ausgewertet', () => {
    const demo = createFixtureWorld(D0)
    expect(evaluateAll(demo, D0)).toBe(demo)
  })

  it('wertet den ersten echten Tag nach den Regeln aus', () => {
    const r = evaluateAll(createFixtureWorld(D0), day(1))
    const fresh = r.events.slice(createFixtureWorld(D0).events.length)

    expect(fresh.map((e) => `${e.type}:${'habitId' in e ? e.habitId : ''}`).sort()).toEqual(
      [
        'block_broken:hb-lesen', // Feierabend: zweiter Fehltag in Folge
        'formation_wobbling:hb-kalt', // Training: einmal verpasst
        'formation_wobbling:hb-meditation', // Morgenroutine: einmal verpasst
      ].sort(),
    )
    // Dehnen und die Abendroutine: dritter Tag ohne Häkchen – sie bröckeln weiter.
    expect(r.habits['hb-dehnen']).toMatchObject({ lifecycle: 'solid', skippedInRow: 3 })
    expect(['hb-tagebuch', 'hb-handy'].map((id) => r.habits[id]!.skippedInRow)).toEqual([3, 3])
    expect(r.habits['hb-meditation']!.formation).toMatchObject({ doneDays: 17, missedInRow: 1 })
  })

  it('lässt die Abendroutine nach 4 Tagen ohne Häkchen einstürzen', () => {
    const demo = createFixtureWorld(D0)
    const r = evaluateAll(demo, day(2))
    const abend = r.events.slice(demo.events.length).filter((e) => e.towerId === 'tw-abend')

    expect(detail(abend)).toEqual([`tower_collapsed@${day(1)}`])
    expect(r.towers['tw-abend']).toMatchObject({ blockIds: ['hb-zaehne'] })
  })
})
