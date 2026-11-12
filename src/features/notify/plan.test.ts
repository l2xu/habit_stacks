import { describe, expect, it } from 'vitest'
import { createFixtureWorld } from '@/test/fixtureWorld'
import { addDays } from '@/domain/dates'
import { pauseTower, setTowerNotify } from '@/domain/editor'
import type { DomainState, ID, ISODate, TowerNotify } from '@/domain/types'
import { setDone, setTowerDone } from '@/features/dev/devTools'
import { PLAN_DAYS, planPushes, pushTime } from './plan'

const D0 = '2026-03-02'
const day = (n: number) => addDays(D0, n)
const at = (date: ISODate, hour: number, minute = 0) => {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number]
  return new Date(y, m - 1, d, hour, minute).getTime()
}
const NOW = at(D0, 8)

function demo(towerId: ID, notify: Partial<TowerNotify>, s: DomainState = createFixtureWorld(D0)): DomainState {
  return setTowerNotify(s, towerId, { time: '20:00', remind: false, warn: false, ...notify })
}
const plan = (s: DomainState, now = NOW) => planPushes(s, D0, now)
const bodies = (s: DomainState, towerId: ID, now = NOW) => planPushes(s, D0, now).filter((p) => p.towerId === towerId).map((p) => p.body)

describe('Push-Zeitpunkte', () => {
  it('rechnet Ortszeit inklusive Tagesgrenze und Dev-Versatz', () => {
    expect(pushTime(D0, '07:30', 4)).toBe(at(D0, 7, 30))
    // 02:00 liegt vor der Tagesgrenze 4 Uhr – gehört noch zum Kalendertag D0, also die Nacht danach.
    expect(pushTime(D0, '02:00', 4)).toBe(at(day(1), 2))
    expect(pushTime(D0, '02:00', 0)).toBe(at(D0, 2))
    // Zeitreise: „heute“ der App liegt 3 Tage nach dem echten Heute.
    expect(pushTime(D0, '07:30', 4, 3)).toBe(at(day(-3), 7, 30))
  })
})

describe('Push-Plan', () => {
  it('plant nichts ohne eingeschaltete Benachrichtigungen', () => {
    expect(planPushes(createFixtureWorld(D0), D0, NOW)).toEqual([])
    expect(planPushes(demo('tw-abend', {}), D0, NOW)).toEqual([])
  })

  it('warnt die Abendroutine vor dem Einsturz – heute und am letzten Rettungstag', () => {
    // Demo: 2 Tage ohne Häkchen, beide Blöcke über dem Anker bröckeln.
    const items = plan(demo('tw-abend', { warn: true }))
    expect(items.map((p) => [p.at, p.title, p.body])).toEqual([
      [at(D0, 20), 'Abendroutine', 'Der Turm bröckelt! Erledige heute alles, sonst stürzt er in 2 Tagen ein.'],
      [at(day(1), 20), 'Abendroutine', 'Einsturz droht! Erledige heute alles, sonst stürzt der Turm morgen früh ein.'],
    ])
  })

  it('erinnert jeden Tag, solange noch etwas offen ist – Warnung geht vor', () => {
    const items = plan(demo('tw-abend', { warn: true, remind: true }))
    expect(items).toHaveLength(PLAN_DAYS)
    expect(items[0]!.body).toMatch(/^Der Turm bröckelt/)
    // Nach dem Einsturz steht nur noch der Anker – ab dann die normale Erinnerung (ohne weiche Trennstellen).
    expect(items[2]!.body).toBe('Zeit zum Stapeln! Los geht\'s mit „Zähneputzen“.')
    expect(items.at(-1)!.at).toBe(at(day(PLAN_DAYS - 1), 20))
  })

  it('heute schon alles erledigt → heute keine Nachricht, ab morgen wieder', () => {
    const s = setTowerDone(demo('tw-abend', { warn: true, remind: true }), 'tw-abend', D0, true)
    const items = plan(s)
    expect(items[0]!.at).toBe(at(day(1), 20))
    // Gestern alles erledigt → nichts bröckelt mehr.
    expect(items[0]!.body).toBe('Zeit zum Stapeln! Los geht\'s mit „Zähneputzen“.')
  })

  it('zählt bei der Erinnerung die offenen Blöcke', () => {
    const s = setDone(demo('tw-abend', { remind: true }), 'hb-zaehne', D0, true)
    expect(bodies(s, 'tw-abend')[0]).toBe('Noch 2 von 3 Blöcken offen – weiter mit „Tagebuch“.')
  })

  it('warnt vor dem wackelnden Geist – nach dem Bruch nicht mehr', () => {
    // Demo: „10 Min. Lesen“ gestern verpasst.
    expect(bodies(demo('tw-feierabend', { warn: true }), 'tw-feierabend')).toEqual([
      '„10 Min. Lesen“ wackelt – gestern verpasst. Heute erledigen, sonst bricht der Geist weg.',
    ])
  })

  it('kündigt das Abfallen an und nennt mehrere Gefahren in zwei Zeilen', () => {
    // Demo: „10 Min. Dehnen“ bröckelt (2 Tage), der Geist „Meditation“ ist sicher.
    expect(bodies(demo('tw-morgen', { warn: true }), 'tw-morgen').slice(0, 2)).toEqual([
      '„10 Min. Dehnen“ bröckelt – heute erledigen, sonst fällt der Block in 2 Tagen ab.',
      // Ohne Häkchen heute: Dehnen fällt übermorgen früh, und der Geist hat einen Fehltag.
      '„10 Min. Dehnen“ fällt morgen früh ab – heute erledigen!\n„Meditation“ wackelt – gestern verpasst. Heute erledigen, sonst bricht der Geist weg.',
    ])
  })

  it('lässt vergangene Zeitpunkte und pausierte Türme aus', () => {
    const s = demo('tw-abend', { remind: true })
    expect(plan(s, at(D0, 21))[0]!.at).toBe(at(day(1), 20))
    expect(planPushes(pauseTower(s, 'tw-abend', D0), D0, NOW)).toEqual([])
  })

  it('Uhrzeiten vor der Tagesgrenze sind die letzte Chance des Vortags', () => {
    const items = plan(demo('tw-abend', { warn: true, time: '02:00' }))
    expect(items[0]).toMatchObject({ at: at(day(1), 2), body: 'Der Turm bröckelt! Erledige heute alles, sonst stürzt er in 2 Tagen ein.' })
  })
})
