import { describe, expect, it } from 'vitest'
import { createFixtureWorld } from '@/test/fixtureWorld'
import { addDays } from '@/domain/dates'
import { pauseTower } from '@/domain/editor'
import { evaluateAll } from '@/domain/engine'
import { setDone, setSkips } from '@/features/dev/devTools'
import { layoutTower } from '@/features/world/towerLayout'
import { buildTowerVM, reuseUnchanged } from './selectors'

const D0 = '2026-03-02'

describe('Unveränderte Türme und Blöcke behalten ihr Objekt (memo)', () => {
  const demo = createFixtureWorld(D0)
  const abend = (s = demo) => buildTowerVM(s, s.towers['tw-abend']!, D0)
  const prev = abend()
  // Ein Häkchen bei „Tagebuch“: Der Turm ändert sich, Anker und „Handy weglegen“ nicht.
  const next = reuseUnchanged(prev, abend(setDone(demo, 'hb-tagebuch', D0, true)))
  const changed = (id: string) => id === 'hb-tagebuch'

  it('gleicher Inhalt → dasselbe View-Modell', () => {
    expect(reuseUnchanged(prev, abend())).toBe(prev)
  })

  it('ein Häkchen ersetzt nur den betroffenen Block', () => {
    expect(next).not.toBe(prev)
    expect(next.blocks.map((b, i) => b === prev.blocks[i])).toEqual(next.blocks.map((b) => !changed(b.id)))
  })

  it('die Lage behält Einträge samt Geometrie für unveränderte Blöcke', () => {
    const before = layoutTower(prev, 0, 0)
    const after = layoutTower(next, 0, 0, before)
    expect(after.blocks.map((e, i) => e === before.blocks[i])).toEqual(after.blocks.map((e) => !changed(e.block.id)))
  })
})

describe('Bröckeln & Pause im View-Modell', () => {
  // Demo: Die Abendroutine hatte 2 Tage gar nichts – beide Blöcke über dem Anker bröckeln.
  const abend = (s = createFixtureWorld(D0)) => buildTowerVM(s, s.towers['tw-abend']!, D0)

  it('warnt vor dem Einsturz, wenn alle Blöcke über dem Anker bröckeln', () => {
    const vm = abend()
    expect(vm).toMatchObject({ collapsing: true, fallIn: 2, atRisk: true, pausedSince: null })
    expect(vm.blocks.map((b) => [b.id, b.visual, b.fallIn ?? null])).toEqual([
      ['hb-zaehne', 'anchor', null],
      ['hb-tagebuch', 'crumbling', 2],
      ['hb-handy', 'crumbling', 2],
    ])
    expect(vm.blocks[2]).toMatchObject({ skips: 2, crumbleProgress: 0 })
  })

  it('jeder Block wird einzeln gerettet', () => {
    let s = setDone(createFixtureWorld(D0), 'hb-tagebuch', D0, true)
    let vm = abend(s)
    expect(vm).toMatchObject({ collapsing: false, fallIn: 2, atRisk: true })
    expect(vm.blocks.map((b) => b.visual)).toEqual(['anchor', 'solid', 'crumbling'])

    s = setDone(s, 'hb-handy', D0, true)
    vm = abend(s)
    expect(vm).toMatchObject({ collapsing: false, fallIn: null, atRisk: false })
  })

  it('zeigt einen Block am letzten Tag vor dem Abfallen', () => {
    const s = setSkips(createFixtureWorld(D0), 'hb-dehnen', 3)
    const vm = buildTowerVM(s, s.towers['tw-morgen']!, D0)
    expect(vm.blocks.find((b) => b.id === 'hb-dehnen')).toMatchObject({ visual: 'crumbling', skips: 3, crumbleProgress: 1, fallIn: 1 })
  })

  it('pausiert: nichts in Gefahr, kein Abhaken, Woche zeigt die Pause', () => {
    const s = pauseTower(createFixtureWorld(D0), 'tw-abend', D0)
    const vm = abend(s)
    expect(vm).toMatchObject({ pausedSince: D0, atRisk: false, collapsing: false, fallIn: null, nextBlock: null, stackable: false })
    expect(vm.week.at(-1)).toEqual({ date: D0, mark: 'paused' })
  })

  it('überspringt pausierte Tage im Streak und in der Wochenleiste', () => {
    // Demo: „Laptop zuklappen“ (Anker im Feierabend) ist 20 Tage am Stück erledigt, bis gestern.
    const demo = createFixtureWorld(D0)
    const before = buildTowerVM(demo, demo.towers['tw-feierabend']!, D0)
    const s = { ...demo, towers: { ...demo.towers, 'tw-feierabend': { ...demo.towers['tw-feierabend']!, pauses: [{ from: addDays(D0, -5), to: addDays(D0, -3) }] } } }
    const vm = buildTowerVM(s, s.towers['tw-feierabend']!, D0)

    expect(vm.streak).toBe(before.streak - 3)
    expect(vm.week.map((d) => d.mark).slice(1, 4)).toEqual(['paused', 'paused', 'paused'])
  })

  it('zeigt eingestürzte Blöcke im Schutthaufen als eingestürzt', () => {
    // Demo: Die Abendroutine hatte schon 2 Tage nichts – noch 2 leere Tage, dann stürzt sie ein.
    const today = addDays(D0, 2)
    const s = evaluateAll(createFixtureWorld(D0), today)
    const vm = buildTowerVM(s, s.towers['tw-abend']!, today)

    expect(vm.lost).toEqual([
      expect.objectContaining({ id: 'hb-tagebuch', reason: 'collapsed', lostOn: addDays(D0, 1), headStart: 18 }),
      expect.objectContaining({ id: 'hb-handy', reason: 'collapsed', lostOn: addDays(D0, 1), headStart: 18 }),
    ])
    expect(vm.blocks.map((b) => b.id)).toEqual(['hb-zaehne'])
  })
})
