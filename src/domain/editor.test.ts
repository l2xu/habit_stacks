import { describe, expect, it } from 'vitest'
import { addDays } from './dates'
import {
  canDiscard,
  canStack,
  canMoveBlock,
  createTower,
  deleteTower,
  discardBlock,
  moveBlock,
  moveTower,
  pauseTower,
  removeBlock,
  renameTower,
  restackBlock,
  resumeTower,
  setTowerNotify,
  stackBlock,
  updateBlock,
  type BlockInput,
} from './editor'
import { evaluateAll } from './engine'
import { createEmptyState } from './state'
import type { DomainState, Habit, ISODate, Tower } from './types'

const D0 = '2026-03-02'
const day = (n: number) => addDays(D0, n)
const ms = (date: ISODate, hour = 12) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d, hour).getTime()
}
const block = (title: string): BlockInput => ({ title, color: 'sky', action: { kind: 'check' } })

function withLogs(s: DomainState, habitId: string, dates: ISODate[]): DomainState {
  const logs = { ...s.logs }
  for (const date of dates) {
    logs[`${habitId}|${date}`] = { id: `${habitId}-${date}`, habitId, towerId: s.habits[habitId]!.towerId, date, completedAt: new Date(ms(date)).toISOString(), source: 'quick' }
  }
  return { ...s, logs }
}

/** Neuer Turm "t" mit Anker "a", angelegt an D0; ausgewertet bis zum Vortag. */
function fresh(): DomainState {
  const empty = { ...createEmptyState(), lastEvaluatedOn: day(-1) }
  return createTower(empty, { name: 'Abend', anchor: block('Zähne putzen') }, D0, ms(D0), { tower: 't', anchor: 'a' })
}

/** Turm mit Anker a und verfestigten Blöcken. */
function solidTower(ids: string[]): DomainState {
  const s = fresh()
  const habits: Record<string, Habit> = { ...s.habits }
  for (const id of ids) {
    habits[id] = {
      ...s.habits.a!,
      id,
      title: id,
      role: 'stacked',
      wasSolid: true,
      formation: { startedOn: day(-60), doneDays: 28, missedInRow: 0, solidifiedOn: day(-33), evaluatedThrough: day(-33) },
    }
  }
  const tower: Tower = {
    ...s.towers.t!,
    createdAt: new Date(ms(day(-100))).toISOString(),
    blockIds: ['a', ...ids],
  }
  return { ...s, habits, towers: { t: tower } }
}

describe('Türme anlegen', () => {
  it('legt einen Turm mit Anker an und lehnt leere Namen ab', () => {
    const s = fresh()
    expect(s.towerOrder).toEqual(['t'])
    expect(s.towers.t!.name).toBe('Abend')
    expect(s.habits.a).toMatchObject({ role: 'anchor', lifecycle: 'solid', formation: null, title: 'Zähne putzen' })
    expect(s.events.map((e) => [e.type, Boolean(e.seenAt)])).toEqual([['tower_created', true]])

    const empty = createEmptyState()
    expect(createTower(empty, { name: '  ', anchor: block('x') }, D0, ms(D0))).toBe(empty)
  })

  it('verschiebt Türme auf der Insel', () => {
    let s = fresh()
    s = createTower(s, { name: 'Morgen', anchor: block('Kaffee') }, D0, ms(D0), { tower: 'm', anchor: 'k' })
    expect(moveTower(s, 'm', -1).towerOrder).toEqual(['m', 't'])
    expect(moveTower(s, 'm', 1)).toBe(s)
  })
})

describe('Stapeln', () => {
  it('erlaubt nur einen Geister-Block gleichzeitig', () => {
    const s = stackBlock(fresh(), 't', block('Lesen'), D0, ms(D0), 'g')
    expect(s.towers.t!.blockIds).toEqual(['a', 'g'])
    expect(s.habits.g).toMatchObject({ lifecycle: 'forming', formation: { startedOn: D0, doneDays: 0 } })
    expect(stackBlock(s, 't', block('Noch einer'), D0, ms(D0), 'h')).toBe(s)
  })

  it('zählt den Stapeltag als Tag 1 – auch nachts vor der Tagesgrenze', () => {
    // 01:00 Uhr am Folgetag gehört bei Tagesgrenze 4 Uhr noch zu D0.
    const empty = { ...createEmptyState(), lastEvaluatedOn: day(-1) }
    const night = ms(day(1), 1)
    let s = createTower(empty, { name: 'Nacht', anchor: block('Licht aus') }, D0, night, { tower: 't', anchor: 'a' })
    s = stackBlock(s, 't', block('Lesen'), D0, night, 'g')
    s = withLogs(s, 'g', [D0])

    const r = evaluateAll(s, day(1))
    expect(r.habits.g!.formation).toMatchObject({ doneDays: 1, evaluatedThrough: D0 })
  })

  it('verfestigt einen gestapelten Block nach 28 Tagen', () => {
    let s = stackBlock(fresh(), 't', block('Lesen'), D0, ms(D0), 'g')
    s = withLogs(s, 'g', Array.from({ length: 28 }, (_, i) => day(i)))
    expect(evaluateAll(s, day(27)).habits.g!.lifecycle).toBe('forming')
    expect(evaluateAll(s, day(28)).habits.g!.lifecycle).toBe('solid')
  })
})

describe('Bearbeiten', () => {
  it('ändert Farbe und Aktion, der Titel bleibt fest', () => {
    const s = fresh()
    const r = updateBlock(s, 'a', { color: 'rose', action: { kind: 'timer', durationSec: 119.6 } })
    expect(r.habits.a).toMatchObject({ title: 'Zähne putzen', color: 'rose', action: { kind: 'timer', durationSec: 120 } })
    expect(updateBlock(r, 'a', { color: 'rose' })).toBe(r)
  })

  it('sortiert alle Blöcke außer dem Anker frei – auch den Geist', () => {
    const s = stackBlock(solidTower(['b', 'c']), 't', block('Geist'), D0, ms(D0), 'g')
    expect(canMoveBlock(s, 'b', -1)).toBe(false) // Anker bleibt unten
    expect(canMoveBlock(s, 'a', 1)).toBe(false)
    expect(moveBlock(s, 'g', 1)).toBe(s) // schon oben

    const r = moveBlock(moveBlock(s, 'g', -1), 'g', -1)
    expect(r.towers.t!.blockIds).toEqual(['a', 'g', 'b', 'c'])
    expect(r.habits.g!.lifecycle).toBe('forming')
  })
})

describe('Abbauen & Schutthaufen', () => {
  it('baut Blöcke in den Schutthaufen ab – der Anker bleibt immer stehen', () => {
    const s = solidTower(['b', 'c'])
    const r = removeBlock(s, 'b', D0, ms(D0))
    expect(r.towers.t!.blockIds).toEqual(['a', 'c'])
    expect(r.towers.t!.lostBlockIds).toEqual(['b'])
    expect(r.habits.b!.lifecycle).toBe('removed')
    expect(removeBlock(s, 'a', D0, ms(D0))).toBe(s)
  })

  it('löscht nur heute neu gestapelte Blöcke spurlos', () => {
    let s = stackBlock(fresh(), 't', block('Tippfehler'), D0, ms(D0), 'g')
    s = withLogs(s, 'g', [D0])
    expect(canDiscard(s, 'g', day(1))).toBe(false)

    const r = discardBlock(s, 'g', D0)
    expect(r.habits.g).toBeUndefined()
    expect(r.towers.t!.blockIds).toEqual(['a'])
    expect(Object.keys(r.logs)).toEqual([])
    expect(r.events.map((e) => e.type)).toEqual(['tower_created'])

    // Vom Schutthaufen zurückgeholt: hat eine Vorgeschichte, also nur noch abbauen.
    const back = restackBlock(removeBlock(s, 'g', D0, ms(D0)), 'g', D0, ms(D0))
    expect(canDiscard(back, 'g', D0)).toBe(false)
  })

  it('stapelt verlorene Blöcke neu – als Geist ab Tag 1, früher verfestigte mit Gedächtnis-Bonus, Logs bleiben', () => {
    let s = withLogs(solidTower(['b', 'c']), 'c', [day(-2)])
    s = { ...s, habits: { ...s.habits, b: { ...s.habits.b!, skippedInRow: 3 } } }
    s = removeBlock(s, 'b', day(-1), ms(day(-1)))

    const r = restackBlock(s, 'b', D0, ms(D0))
    expect(r.towers.t!.blockIds).toEqual(['a', 'c', 'b'])
    expect(r.towers.t!.lostBlockIds).toEqual([])
    expect(r.habits.b).toMatchObject({ lifecycle: 'forming', formation: { startedOn: D0, doneDays: 18, missedInRow: 0 } })
    expect(r.habits.b!.endedAt).toBeUndefined()
    expect(r.habits.b!.skippedInRow).toBeUndefined()
    expect(r.logs[`c|${day(-2)}`]).toBeDefined()

    // Nie verfestigt (z. B. weggebrochener Geist): wieder bei 0.
    const ghost = removeBlock(stackBlock(fresh(), 't', block('Neu'), D0, ms(D0), 'g'), 'g', D0, ms(D0))
    expect(restackBlock(ghost, 'g', D0, ms(D0)).habits.g!.formation!.doneDays).toBe(0)

    // Mit Geister-Block geht kein zweiter drauf.
    const busy = stackBlock(s, 't', block('Geist'), D0, ms(D0), 'g')
    expect(restackBlock(busy, 'b', D0, ms(D0))).toBe(busy)
  })
})

describe('Nach einem Einsturz', () => {
  it('lässt sofort neu stapeln – die Blöcke kommen einzeln aus dem Schutthaufen zurück', () => {
    // 10 Tage ohne Häkchen: Beide festen Blöcke sind eingestürzt, nur der Anker steht.
    const gone = evaluateAll(solidTower(['b', 'c']), day(10))
    expect(gone.towers.t).toMatchObject({ blockIds: ['a'], lostBlockIds: ['c', 'b'] })

    let s = restackBlock(gone, 'c', day(10), ms(day(10)))
    expect(s.towers.t!.blockIds).toEqual(['a', 'c'])
    // Nur ein Geist gleichzeitig.
    expect(restackBlock(s, 'b', day(10), ms(day(10)))).toBe(s)

    // Gedächtnis-Bonus: 18 + heute = 19 Würfel.
    s = withLogs(s, 'c', [day(10)])
    expect(evaluateAll(s, day(11)).habits.c!.formation!.doneDays).toBe(19)
  })
})

describe('Pausieren', () => {
  it('beendet eine laufende Fokus-Session und lässt sich nicht doppelt pausieren', () => {
    const s = { ...fresh(), focus: { id: 'f', towerId: 't', date: D0, startedAt: '', steps: [], activeIndex: 0, state: 'running' as const } }
    const r = pauseTower(s, 't', D0)
    expect(r.towers.t!.pausedSince).toBe(D0)
    expect(r.focus).toBeNull()
    expect(pauseTower(r, 't', day(1))).toBe(r)
  })

  it('sperrt jedes Bearbeiten, bis der Turm fortgesetzt wird', () => {
    // Turm t mit festen Blöcken b, c und x im Schutthaufen; daneben Turm m.
    let base = solidTower(['b', 'c'])
    base = { ...base, towers: { t: { ...base.towers.t!, lostBlockIds: ['x'] } }, habits: { ...base.habits, x: { ...base.habits.b!, id: 'x', lifecycle: 'fallen' } } }
    base = createTower(base, { name: 'Morgen', anchor: block('Kaffee') }, D0, ms(D0), { tower: 'm', anchor: 'k' })
    const withGhost = stackBlock(base, 't', block('Geist'), D0, ms(D0), 'g')
    const paused = pauseTower(base, 't', D0)

    expect(canStack(paused, 't')).toBe(false)
    expect(canMoveBlock(paused, 'c', -1)).toBe(false)
    const changes: [DomainState, (d: DomainState) => DomainState][] = [
      [base, (d) => renameTower(d, 't', 'Neu')],
      [base, (d) => moveTower(d, 't', 1)],
      [base, (d) => stackBlock(d, 't', block('Neu'), D0, ms(D0), 'n')],
      [base, (d) => updateBlock(d, 'b', { color: 'rose' })],
      [base, (d) => moveBlock(d, 'c', -1)],
      [base, (d) => removeBlock(d, 'b', D0, ms(D0))],
      [base, (d) => restackBlock(d, 'x', D0, ms(D0))],
      [base, (d) => deleteTower(d, 't')],
      [withGhost, (d) => discardBlock(d, 'g', D0)],
    ]
    for (const [state, change] of changes) {
      expect(change(state)).not.toBe(state)
      const locked = pauseTower(state, 't', D0)
      expect(change(locked)).toBe(locked)
    }
    // Ein anderer Turm darf am pausierten vorbeiziehen.
    expect(moveTower(paused, 'm', -1).towerOrder).toEqual(['m', 't'])
    // Fortsetzen geht immer.
    expect(resumeTower(paused, 't', D0).towers.t!.pausedSince).toBeUndefined()
  })
})

describe('Turm löschen', () => {
  it('löscht einen Turm endgültig – mit Logs, Ereignissen und laufender Fokus-Session', () => {
    let s = withLogs(fresh(), 'a', [D0])
    s = createTower(s, { name: 'Morgen', anchor: block('Kaffee') }, D0, ms(D0), { tower: 'm', anchor: 'k' })
    s = withLogs(s, 'k', [D0])
    s = { ...s, focus: { id: 'f', towerId: 't', date: D0, startedAt: '', steps: [], activeIndex: 0, state: 'running' } }

    const r = deleteTower(s, 't')
    expect(Object.keys(r.towers)).toEqual(['m'])
    expect(r.towerOrder).toEqual(['m'])
    expect(Object.keys(r.habits)).toEqual(['k'])
    expect(Object.keys(r.logs)).toEqual([`k|${D0}`])
    expect(r.events.every((e) => e.towerId === 'm')).toBe(true)
    expect(r.focus).toBeNull()

    expect(deleteTower(r, 't')).toBe(r)
  })
})

describe('Benachrichtigungen', () => {
  it('speichert Uhrzeit und Schalter, lehnt ungültige Uhrzeiten und pausierte Türme ab', () => {
    const s = fresh()
    const r = setTowerNotify(s, 't', { time: '07:30', remind: true, warn: false })
    expect(r.towers.t!.notify).toEqual({ time: '07:30', remind: true, warn: false })
    // Unverändert → dieselbe Referenz, der Store ändert nichts.
    expect(setTowerNotify(r, 't', { time: '07:30', remind: true, warn: false })).toBe(r)

    expect(setTowerNotify(s, 't', { time: '7:30', remind: true, warn: false })).toBe(s)
    expect(setTowerNotify(s, 't', { time: '24:00', remind: true, warn: false })).toBe(s)
    expect(setTowerNotify(s, 'fehlt', { time: '07:30', remind: true, warn: false })).toBe(s)

    const paused = pauseTower(r, 't', D0)
    expect(setTowerNotify(paused, 't', { time: '08:00', remind: true, warn: true })).toBe(paused)
  })
})
