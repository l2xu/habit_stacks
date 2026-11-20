import { describe, expect, it } from 'vitest'
import { createFixtureWorld } from '@/test/fixtureWorld'
import { addDays } from './dates'
import { pauseTower, removeBlock, restackBlock, stackBlock } from './editor'
import { evaluateAll, solidifyOnCompletion } from './engine'
import { blocksOnDay, canEditDay, recomputeTower, setPastDone, towerChanges } from './retro'
import { createEmptyState } from './state'
import type { DomainState, Habit, ID, ISODate, TowerEvent } from './types'

const D0 = '2026-03-02'
const day = (n: number) => addDays(D0, n)
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => day(from + i))
const at = (date: ISODate) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d, 12).toISOString()
}

/**
 * Ein Turm, gebaut an Tag 0 und ausgewertet bis Tag −1: Anker `a`, feste Blöcke (seit Tag −1 fest) und optional
 * ein Geist, der an Tag `from` mit `doneDays` Würfeln startet.
 */
function world(solids: string[], ghost?: { id: string; from: number; doneDays?: number }): DomainState {
  const block = (id: string, h: Partial<Habit>): Habit => ({
    id,
    towerId: 't',
    title: id,
    role: 'stacked',
    action: { kind: 'check' },
    color: 'sky',
    lifecycle: 'solid',
    formation: null,
    createdAt: at(day(-40)),
    ...h,
  })
  const habits: Habit[] = [
    block('a', { role: 'anchor', createdAt: at(day(0)) }),
    ...solids.map((id) =>
      block(id, { wasSolid: true, formation: { startedOn: day(-40), doneDays: 28, missedInRow: 0, solidifiedOn: day(-1), evaluatedThrough: day(-1) } }),
    ),
    // Mit Vorsprung startet nur, wer schon einmal fest war (Gedächtnis-Bonus beim Neu-Stapeln).
    ...(ghost
      ? [
          block(ghost.id, {
            lifecycle: 'forming',
            ...(ghost.doneDays && { wasSolid: true }),
            formation: { startedOn: day(ghost.from), doneDays: ghost.doneDays ?? 0, missedInRow: 0, evaluatedThrough: null },
          }),
        ]
      : []),
  ]
  return {
    ...createEmptyState(),
    towers: {
      t: { id: 't', name: 'Turm', timeOfDay: 'anytime', blockIds: habits.map((h) => h.id), lostBlockIds: [], createdAt: at(day(0)) },
    },
    towerOrder: ['t'],
    habits: Object.fromEntries(habits.map((h) => [h.id, h])),
    lastEvaluatedOn: day(-1),
  }
}

function withLogs(s: DomainState, habitId: string, dates: ISODate[]): DomainState {
  const logs = { ...s.logs }
  for (const date of dates) logs[`${habitId}|${date}`] = { id: `${habitId}-${date}`, habitId, towerId: 't', date, completedAt: at(date), source: 'focus' }
  return { ...s, logs }
}
const withAll = (s: DomainState, ids: string[], dates: ISODate[]) => ids.reduce((acc, id) => withLogs(acc, id, dates), s)

/** Wie in der App: Engine bis gestern, dann macht der 28. Haken von heute einen Geist sofort fest. */
function settle(s: DomainState, today: ISODate): DomainState {
  const r = evaluateAll(s, today, Date.parse(at(today)))
  return Object.keys(r.habits).reduce((acc, id) => solidifyOnCompletion(acc, id, today, Date.parse(at(today))), r)
}

const ids = (e: TowerEvent) => (e.type === 'tower_collapsed' ? e.habitIds.join(',') : 'habitId' in e ? e.habitId : '')
const detail = (events: TowerEvent[]) => events.map((e) => `${e.type}:${ids(e)}@${e.date}`)
/** Turm, Blöcke und Ereignisse ohne Zeitstempel und Ids – zum Vergleich zweier Wege zum selben Ergebnis. */
const summary = (s: DomainState) => ({
  towers: s.towers,
  habits: Object.fromEntries(
    Object.entries(s.habits).map(([id, h]) => [id, { ...h, endedAt: h.endedAt ? 'set' : undefined, skippedInRow: h.skippedInRow ?? 0, wasSolid: !!h.wasSolid }]),
  ),
  events: detail(s.events).sort(),
})

const T12 = day(12)

describe('Nachtragen', () => {
  it('rettet einen bröckelnden Block: Das nachgetragene Häkchen setzt die Fehltage zurück', () => {
    // b fehlt an Tag 10 und 11 → bröckelt.
    let s = withAll(world(['b', 'c']), ['a', 'c'], range(0, 11))
    s = settle(withLogs(s, 'b', range(0, 9)), T12)
    expect(s.habits.b).toMatchObject({ lifecycle: 'solid', skippedInRow: 2 })

    const r = setPastDone(s, 't', day(11), { b: true }, T12)
    expect(r.habits.b).toMatchObject({ lifecycle: 'solid', skippedInRow: 0 })
    expect(r.logs[`b|${day(11)}`]).toMatchObject({ source: 'retro', date: day(11) })
    // Das Bröckeln vom Tag 11 ist nie passiert.
    expect(detail(r.events).filter((e) => e.startsWith('block_crumbling'))).toEqual([])
  })

  it('holt einen abgefallenen Block an seinen alten Platz zurück', () => {
    // b (Ebene 1) fehlt ab Tag 8 → bröckelt an Tag 9, fällt an Tag 11.
    let s = withAll(world(['b', 'c', 'd']), ['a', 'c', 'd'], range(0, 11))
    s = settle(withLogs(s, 'b', range(0, 7)), T12)
    expect(s.towers.t).toMatchObject({ blockIds: ['a', 'c', 'd'], lostBlockIds: ['b'] })

    const r = setPastDone(s, 't', day(10), { b: true }, T12)
    expect(r.towers.t).toMatchObject({ blockIds: ['a', 'b', 'c', 'd'], lostBlockIds: [] })
    expect(r.habits.b).toMatchObject({ lifecycle: 'solid', skippedInRow: 1 })
    expect(r.habits.b!.endedAt).toBeUndefined()
    expect(towerChanges(s, r, 't')).toEqual({ back: ['b'], lost: [], solid: [], ghost: [] })
  })

  it('holt einen weggebrochenen Geist mit seinen Würfeln zurück', () => {
    // g erledigt Tag 0–8, verpasst 9 und 10 → bricht an Tag 10.
    let s = withAll(world(['b'], { id: 'g', from: 0 }), ['a', 'b'], range(0, 11))
    s = settle(withLogs(s, 'g', [...range(0, 8), day(11)]), T12)
    expect(s.habits.g).toMatchObject({ lifecycle: 'broken' })
    expect(s.towers.t!.blockIds).toEqual(['a', 'b'])

    const r = setPastDone(s, 't', day(10), { g: true }, T12)
    expect(r.towers.t!.blockIds).toEqual(['a', 'b', 'g'])
    // Tag 0–8, 10 und 11 erledigt, Tag 9 verpasst (gewackelt).
    expect(r.habits.g).toMatchObject({ lifecycle: 'forming', formation: { doneDays: 11, missedInRow: 0, evaluatedThrough: day(11) } })
    expect(r.habits.g!.formation!.brokenOn).toBeUndefined()
    expect(detail(r.events).filter((e) => e.includes(':g@'))).toEqual([`formation_wobbling:g@${day(9)}`])
  })

  it('richtet einen eingestürzten Turm wieder auf', () => {
    // Ab Tag 8 nichts mehr → an Tag 11 stürzen b, c, d ein.
    const s = settle(withAll(world(['b', 'c', 'd']), ['a', 'b', 'c', 'd'], range(0, 7)), T12)
    expect(s.towers.t!.blockIds).toEqual(['a'])

    const r = setPastDone(s, 't', day(9), { a: true, b: true, c: true, d: true }, T12)
    expect(r.towers.t).toMatchObject({ blockIds: ['a', 'b', 'c', 'd'], lostBlockIds: [] })
    expect(['b', 'c', 'd'].map((id) => r.habits[id]!.skippedInRow)).toEqual([2, 2, 2])
    expect(detail(r.events).filter((e) => e.startsWith('tower_collapsed'))).toEqual([])
  })

  it('Häkchen entfernen wirkt genauso nachträglich: Der Block fällt', () => {
    let s = withAll(world(['b', 'c']), ['a', 'c'], range(0, 11))
    s = settle(withLogs(s, 'b', [...range(0, 7), day(9)]), T12)
    expect(s.habits.b).toMatchObject({ lifecycle: 'solid', skippedInRow: 2 })

    const r = setPastDone(s, 't', day(9), { b: false }, T12)
    expect(r.habits.b!.lifecycle).toBe('fallen')
    expect(r.towers.t).toMatchObject({ blockIds: ['a', 'c'], lostBlockIds: ['b'] })
    expect(towerChanges(s, r, 't').lost).toEqual(['b'])
  })

  it('hin und zurück ergibt wieder denselben Turm', () => {
    let s = withAll(world(['b', 'c'], { id: 'g', from: 2 }), ['a', 'c'], range(0, 11))
    s = settle(withLogs(withLogs(s, 'b', range(0, 7)), 'g', [...range(2, 6), ...range(8, 11)]), T12)

    const there = setPastDone(s, 't', day(8), { b: true, g: false }, T12)
    expect(there.habits.b!.lifecycle).toBe('solid')
    expect(there.habits.g!.lifecycle).toBe('broken')
    const back = setPastDone(there, 't', day(8), { b: false, g: true }, T12)
    expect(summary(back)).toEqual(summary(s))
  })

  it('macht einen Geist fest, wenn ihm dadurch nur noch der heutige Haken fehlte', () => {
    // 24 Würfel Vorsprung, Tag 10 vergessen: bis gestern 26, mit heute 27 – noch nicht fest.
    let s = withAll(world([], { id: 'g', from: 9, doneDays: 24 }), ['g'], [day(9), day(11), day(12)])
    s = settle(s, T12)
    expect(s.habits.g!.lifecycle).toBe('forming')

    const r = setPastDone(s, 't', day(10), { g: true }, T12)
    expect(r.habits.g!.lifecycle).toBe('solid')
    expect(r.habits.g!.formation!.solidifiedOn).toBe(T12)
    expect(detail(r.events)).toEqual([`block_solidified:g@${T12}`])
  })

  it('ein heute fest gewordener Geist bleibt fest, wenn davor etwas nachgetragen wird', () => {
    let s = withAll(world(['b'], { id: 'g', from: 0, doneDays: 15 }), ['g'], range(0, 12))
    s = settle(withAll(s, ['a', 'b'], range(0, 11)), T12)
    expect(s.habits.g!.formation!.solidifiedOn).toBe(T12)
    const solidified = s.events.find((e) => e.type === 'block_solidified')!

    const r = setPastDone(s, 't', day(6), { a: false }, T12)
    expect(r.habits.g).toMatchObject({ lifecycle: 'solid', formation: { solidifiedOn: T12 } })
    expect(r.events.find((e) => e.type === 'block_solidified')).toEqual(solidified)
  })

  it('neue Folgen gelten als gesehen, bekannte behalten ihren Status', () => {
    let s = withAll(world(['b', 'c']), ['a', 'c'], range(0, 11))
    s = settle(withLogs(s, 'b', range(0, 9)), T12)
    // Bröckeln von b an Tag 11 ist noch ungesehen.
    expect(s.events.filter((e) => !e.seenAt).map((e) => e.type)).toEqual(['block_crumbling'])

    // Tag 6 ohne c: c bröckelt nicht (nur 1 Tag) – das alte Bröckeln von b bleibt ungesehen, nichts Neues taucht auf.
    const r = setPastDone(s, 't', day(6), { c: false }, T12)
    expect(r.events.filter((e) => !e.seenAt).map((e) => e.type)).toEqual(['block_crumbling'])
    // Tag 6 und 7 ohne c: c bröckelt an Tag 7 – still, ohne Neuigkeit.
    const r2 = setPastDone(r, 't', day(7), { c: false }, T12)
    expect(detail(r2.events)).toContain(`block_crumbling:c@${day(7)}`)
    expect(r2.events.filter((e) => !e.seenAt).map((e) => e.type)).toEqual(['block_crumbling'])
  })

  it('lässt abgebaute und neu gestapelte Blöcke, wie sie sind', () => {
    // b fällt an Tag 7 (ab Tag 4 nichts) und wird an Tag 9 neu gestapelt; c wird an Tag 10 abgebaut.
    let s = withAll(world(['b', 'c']), ['c'], range(0, 8))
    s = withLogs(withLogs(s, 'a', range(0, 5)), 'b', range(0, 3))
    s = settle(s, day(9))
    expect(s.habits.b!.lifecycle).toBe('fallen')
    s = restackBlock(s, 'b', day(9), Date.parse(at(day(9))))
    s = settle(withLogs(s, 'b', range(9, 11)), day(10))
    s = removeBlock(s, 'c', day(10), Date.parse(at(day(10))))
    s = settle(s, T12)
    expect(s.habits.b!.lifecycle).toBe('forming')

    const r = setPastDone(s, 't', day(6), { a: true }, T12)
    expect(r).not.toBe(s)
    expect(r.habits.b).toEqual(s.habits.b)
    expect(r.habits.c).toEqual(s.habits.c)
    // Die Historie des alten Laufs (abgefallen an Tag 7) bleibt.
    expect(detail(r.events)).toContain(`block_fallen:b@${day(7)}`)
  })

  it('ein inzwischen gestapelter Geist darf neben dem geretteten stehen – beide zählen weiter', () => {
    // g verpasst Tag 7 und 8 → bricht an Tag 8; an Tag 10 kommt der neue Geist h.
    let s = withAll(world(['b'], { id: 'g', from: 0 }), ['a', 'b'], range(0, 11))
    s = settle(withLogs(s, 'g', [...range(0, 6), ...range(9, 11)]), day(10))
    expect(s.habits.g!.lifecycle).toBe('broken')
    s = stackBlock(s, 't', { title: 'h', color: 'rose', action: { kind: 'check' } }, day(10), Date.parse(at(day(10))), 'h')
    s = settle(withLogs(s, 'h', range(10, 11)), T12)

    const r = setPastDone(setPastDone(s, 't', day(7), { g: true }, T12), 't', day(8), { g: true }, T12)
    expect(r.towers.t!.blockIds).toEqual(['a', 'b', 'g', 'h'])
    expect(r.habits.g).toMatchObject({ lifecycle: 'forming', formation: { doneDays: 12, missedInRow: 0 } })
    expect(r.habits.h).toMatchObject({ lifecycle: 'forming', formation: { doneDays: 2 } })
  })
})

describe('Nachtragen – was erlaubt ist', () => {
  const s = settle(withAll(world(['b']), ['a', 'b'], range(0, 11)), T12)

  it('nur die letzten 7 Tage bis gestern', () => {
    expect(canEditDay(s, 't', day(11), T12)).toBe(true)
    expect(canEditDay(s, 't', day(5), T12)).toBe(true)
    expect(canEditDay(s, 't', day(4), T12)).toBe(false)
    expect(canEditDay(s, 't', T12, T12)).toBe(false)
    expect(setPastDone(s, 't', day(4), { b: false }, T12)).toBe(s)
    expect(setPastDone(s, 't', T12, { b: true }, T12)).toBe(s)
  })

  it('nicht vor dem Turmbau und nicht an pausierten Tagen', () => {
    expect(canEditDay(s, 't', day(-1), day(3))).toBe(false)
    const paused = pauseTower(s, 't', day(10))
    expect(canEditDay(paused, 't', day(10), T12)).toBe(false)
    expect(canEditDay(paused, 't', day(9), T12)).toBe(true)
  })

  it('nur Blöcke, die an dem Tag auf dem Turm standen', () => {
    expect(setPastDone(s, 't', day(8), { x: true }, T12)).toBe(s)
    expect(setPastDone(s, 't', day(8), { b: true }, T12)).toBe(s) // schon erledigt
    const later = stackBlock(s, 't', { title: 'n', color: 'rose', action: { kind: 'check' } }, T12, Date.parse(at(T12)), 'n')
    expect(blocksOnDay(later, 't')(day(11)).map((h) => h.id)).toEqual(['a', 'b'])
    expect(blocksOnDay(later, 't')(T12).map((h) => h.id)).toEqual(['a', 'b', 'n'])
  })

  it('verlorene Blöcke zählen bis einschließlich ihres Verlusttags', () => {
    // b nie erledigt → fällt an Tag 3.
    const fell = settle(withAll(world(['b', 'c']), ['a', 'c'], range(0, 11)), T12)
    const on = blocksOnDay(fell, 't')
    expect(fell.habits.b!.lifecycle).toBe('fallen')
    expect(on(day(3)).map((h) => h.id)).toEqual(['a', 'c', 'b'])
    expect(on(day(4)).map((h) => h.id)).toEqual(['a', 'c'])
  })
})

describe('Nachtragen ergibt dasselbe, als wäre der Tag damals so abgehakt worden', () => {
  /** Kleiner deterministischer Zufall (mulberry32). */
  const rng = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  for (let trial = 0; trial < 60; trial++) {
    it(`Verlauf ${trial + 1}`, () => {
      const rand = rng(trial + 1)
      const ghostStart = Math.floor(rand() * 6)
      const s0 = world(['b', 'c', 'd'], { id: 'g', from: ghostStart, doneDays: [0, 12, 22, 24][Math.floor(rand() * 4)]! })
      const blocks = ['a', 'b', 'c', 'd', 'g']
      const odds: Record<ID, number> = Object.fromEntries(blocks.map((id) => [id, 0.35 + rand() * 0.6]))
      // Mal eine Pause mitten im Zeitraum.
      const paused = rand() < 0.25 ? { from: day(6), to: day(7) } : null
      const base = paused ? { ...s0, towers: { t: { ...s0.towers.t!, pauses: [paused] } } } : s0

      const oldDone = new Set<string>()
      for (const id of blocks) for (const d of range(0, 12)) if (rand() < odds[id]!) oldDone.add(`${id}|${d}`)
      const newDone = new Set(oldDone)
      const edits = new Map<ISODate, Record<ID, boolean>>()
      for (const id of blocks)
        for (const d of range(5, 11)) {
          if (rand() > 0.3) continue
          const key = `${id}|${d}`
          const done = !oldDone.has(key)
          if (done) newDone.add(key)
          else newDone.delete(key)
          edits.set(d, { ...edits.get(d), [id]: done })
        }

      const logsOf = (done: Set<string>) =>
        [...done].reduce((acc, key) => {
          const [id, d] = key.split('|') as [string, string]
          return withLogs(acc, id, [d])
        }, base)

      const expected = settle(logsOf(newDone), T12)
      let actual = settle(logsOf(oldDone), T12)
      for (const d of [...edits.keys()].sort()) actual = setPastDone(actual, 't', d, edits.get(d)!, T12)

      expect(summary(actual)).toEqual(summary(expected))
    })
  }
})

describe('Test-Welt: Neuberechnen ohne Änderung lässt alles, wie es ist', () => {
  const s = createFixtureWorld(D0)
  for (const towerId of s.towerOrder) {
    it(towerId, () => {
      for (let n = 1; n <= s.rules.editableDays; n++) {
        const r = recomputeTower(s, s.logs, towerId, addDays(D0, -n), D0)
        expect(summary(r)).toEqual(summary(s))
        expect(r.events.map((e) => [e.id, e.seenAt])).toEqual(expect.arrayContaining(s.events.map((e) => [e.id, e.seenAt])))
      }
    })
  }
})
