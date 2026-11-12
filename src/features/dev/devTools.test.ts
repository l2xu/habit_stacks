import { describe, expect, it } from 'vitest'
import { createFixtureWorld } from '@/test/fixtureWorld'
import { addDays } from '@/domain/dates'
import { evaluateAll } from '@/domain/engine'
import { previewNextDay, setDone, setLifecycle, setSkips, setStones, simulateDays } from './devTools'

const D0 = '2026-03-02'
const habitsOf = (s: ReturnType<typeof createFixtureWorld>) => Object.fromEntries(Object.entries(s.habits).map(([id, h]) => [id, h.lifecycle]))

describe('DevTools', () => {
  it('spult vor: Offset und Auswertung bis zum neuen Gestern', () => {
    const r = simulateDays(createFixtureWorld(D0), D0, 3, 'all')
    expect(r.settings.devDayOffset).toBe(3)
    expect(r.lastEvaluatedOn).toBe(addDays(D0, 2))
    // Alles erledigt: Ein Geist wächst um drei Würfel, nichts bricht oder fällt.
    expect(r.habits['hb-meditation']?.formation?.doneDays).toBe(17 + 3)
    expect(r.events.some((e) => e.type === 'block_broken' || e.type === 'block_fallen')).toBe(false)
  })

  it('mehrere Tage auf einmal = Tag für Tag', () => {
    const demo = createFixtureWorld(D0)
    let stepwise = demo
    for (let i = 0; i < 6; i++) stepwise = simulateDays(stepwise, addDays(D0, i), 1, 'none')
    expect(habitsOf(simulateDays(demo, D0, 6, 'none'))).toEqual(habitsOf(stepwise))
  })

  it('„nichts“ löscht auch die heutigen Häkchen', () => {
    const demo = setDone(createFixtureWorld(D0), 'hb-aufstehen', D0, true)
    const r = simulateDays(demo, D0, 1, 'none')
    expect(Object.values(r.logs).some((l) => l.date === D0)).toBe(false)
  })

  it('Vorschau = Ereignisse von „+1 Tag wie heute“', () => {
    const demo = createFixtureWorld(D0)
    const fresh = evaluateAll(demo, addDays(D0, 1)).events.slice(demo.events.length)
    expect(previewNextDay(demo, D0).map((n) => n.event.type)).toEqual(
      fresh.filter((e) => e.type !== 'block_recovered').map((e) => e.type),
    )
  })

  it('Status setzen: Geist mit 28 erledigten Tagen verfestigt sich am nächsten Tag', () => {
    const s = setStones(createFixtureWorld(D0), 'hb-meditation', 28)
    const r = simulateDays(s, D0, 1, 'none')
    expect(r.habits['hb-meditation']?.lifecycle).toBe('solid')
  })

  it('Status setzen: fest → Geist nur, wenn im Turm kein anderer Geist ist', () => {
    const demo = createFixtureWorld(D0)
    expect(setLifecycle(demo, 'hb-wasser', 'forming', D0)).toBe(demo)
    const solid = setLifecycle(demo, 'hb-meditation', 'solid', D0)
    expect(solid.habits['hb-meditation']?.lifecycle).toBe('solid')
    expect(setLifecycle(solid, 'hb-wasser', 'forming', D0).habits['hb-wasser']?.lifecycle).toBe('forming')
  })

  it('Status setzen: dreimal übersprungen + heute wieder → fällt ab', () => {
    // Demo: Aufstehen (Anker) ist heute erledigt, Wasser auch – also abwählen.
    const s = setDone(setSkips(createFixtureWorld(D0), 'hb-wasser', 3), 'hb-wasser', D0, false)
    const r = simulateDays(s, D0, 1, 'today')
    expect(r.habits['hb-wasser']?.lifecycle).toBe('fallen')
  })

  it('Rezept „Einsturz“: Nichts mit 4 Tagen – alle Blöcke über dem Anker fallen gemeinsam', () => {
    const demo = createFixtureWorld(D0)
    const r = simulateDays(demo, D0, 4, 'none')
    // Training: Der Geist bricht nach 2 Tagen, die 5 festen Blöcke stürzen nach 4 Tagen gemeinsam ein.
    expect(r.towers['tw-training']?.blockIds).toEqual(['hb-schuhe'])
    const collapse = r.events.find((e) => e.type === 'tower_collapsed' && e.towerId === 'tw-training')
    expect(collapse && 'habitIds' in collapse && collapse.habitIds).toEqual(['hb-aufwaermen', 'hb-liegestuetze', 'hb-kniebeugen', 'hb-plank', 'hb-faszien'])
  })
})
