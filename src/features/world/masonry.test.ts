import { describe, expect, it } from 'vitest'
import { createFixtureWorld } from '@/test/fixtureWorld'
import { buildTowerVM } from '@/store/selectors'
import { crumbledPieces, MASONRY, MASONRY_LAYERS, type MasonryPiece } from './masonry'

const area = (p: MasonryPiece) => (p.u1 - p.u0) * (p.v1 - p.v0)
const overlaps = (a: MasonryPiece, b: MasonryPiece) => a.u0 < b.u1 && b.u0 < a.u1 && a.v0 < b.v1 && b.v0 < a.v1

describe('Mauerwerk', () => {
  it('besteht aus 3 Schichten à 9 Würfeln, die den Block lückenlos füllen', () => {
    expect(MASONRY).toHaveLength(27)
    for (let layer = 0; layer < MASONRY_LAYERS; layer++) {
      const pieces = MASONRY.filter((p) => p.layer === layer)
      expect(pieces).toHaveLength(9)
      pieces.forEach((p) => expect(area(p)).toBeCloseTo(1 / 9))
      pieces.forEach((a, i) => pieces.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)))
    }
  })

  it('füllt Schicht für Schicht, in jeder Schicht von hinten nach vorne', () => {
    MASONRY.forEach((p, i) => expect(p.layer).toBe(Math.floor(i / 9)))
    const depth = (p: MasonryPiece) => p.u0 + p.v0
    MASONRY.slice(1).forEach((p, i) => {
      const prev = MASONRY[i]!
      if (prev.layer === p.layer) expect(depth(p)).toBeGreaterThanOrEqual(depth(prev))
    })
  })

  it('lässt beim Bröckeln keinen Würfel in der Luft hängen', () => {
    for (let count = 0; count <= 27; count++) {
      const missing = crumbledPieces('hb-tagebuch', count)
      expect(missing.size).toBe(count)
      MASONRY.forEach((p, i) => {
        if (missing.has(i) || p.layer === 0) return
        const below = MASONRY.flatMap((q, j) => (q.layer === p.layer - 1 && overlaps(p, q) ? [j] : []))
        expect(below.every((j) => !missing.has(j))).toBe(true)
      })
    }
  })

  it('bröckelt deterministisch pro Block', () => {
    expect([...crumbledPieces('a', 8)]).toEqual([...crumbledPieces('a', 8)])
  })
})

describe('Mini-Würfel im View-Modell', () => {
  const D0 = '2026-03-02'

  it('legt einen Würfel pro erledigtem Tag', () => {
    const demo = createFixtureWorld(D0)
    const ghost = buildTowerVM(demo, demo.towers['tw-morgen']!, D0).blocks.find((b) => b.id === 'hb-meditation')
    expect(ghost).toMatchObject({ visual: 'forming', stones: 17, formationTarget: 28, wobbling: false })
  })

  it('wackelt nach einem Fehltag, bis der Block heute erledigt ist – dann kommt der Würfel dazu', () => {
    const demo = createFixtureWorld(D0)
    const before = buildTowerVM(demo, demo.towers['tw-feierabend']!, D0)
    expect(before.blocks.find((b) => b.id === 'hb-lesen')).toMatchObject({ stones: 7, wobbling: true })
    expect(before.atRisk).toBe(true)

    const log = { id: 'l', habitId: 'hb-lesen', towerId: 'tw-feierabend', date: D0, completedAt: `${D0}T18:00:00.000Z`, source: 'focus' as const }
    const state = { ...demo, logs: { ...demo.logs, [`hb-lesen|${D0}`]: log } }
    const after = buildTowerVM(state, state.towers['tw-feierabend']!, D0)
    expect(after.blocks.find((b) => b.id === 'hb-lesen')).toMatchObject({ stones: 8, wobbling: false })
    expect(after.atRisk).toBe(false)
  })
})
