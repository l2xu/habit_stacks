import { describe, expect, it } from 'vitest'
import { buildIsland, scatterDecor } from './island'
import { STEP } from './worldLayout'

const towersOf = (n: number) => Array.from({ length: n }, (_, i) => ({ ox: i * STEP.x, oy: i * STEP.y }))

describe('Insel', () => {
  for (const n of [1, 2, 4, 7]) {
    describe(`mit ${n} ${n === 1 ? 'Turm' : 'Türmen'}`, () => {
      const towers = towersOf(n)
      const island = buildIsland(towers)

      it('trägt jeden Turm samt Grundfläche auf festem Land', () => {
        for (const t of towers) {
          for (let i = Math.floor(t.ox - 1.5); i < Math.ceil(t.ox + 1.5); i++) {
            for (let j = Math.floor(t.oy - 1.5); j < Math.ceil(t.oy + 1.5); j++) {
              expect(island.at(i, j)?.water).toBe(false)
            }
          }
        }
      })

      it('hat einen Teich mit Bach, der als Wasserfall ins Meer fällt', () => {
        expect(island.tiles.filter((t) => t.water).length).toBeGreaterThanOrEqual(5)
        const fall = island.waterfall
        expect(fall?.water).toBe(true)
        expect(fall && island.at(fall.i, fall.j + 1)).toBeUndefined()
      })

      it('zeichnet von hinten nach vorne', () => {
        island.tiles.slice(1).forEach((t, k) => expect(t.i + t.j).toBeGreaterThanOrEqual(island.tiles[k]!.i + island.tiles[k]!.j))
      })

      it('stellt Bäume auf, aber nichts auf einen Turm', () => {
        const decor = scatterDecor(island, towers)
        expect(decor.filter((d) => d.kind === 'tree').length).toBeGreaterThanOrEqual(2)
        for (const d of decor) {
          if (d.kind === 'lily') continue
          expect(island.at(Math.floor(d.x), Math.floor(d.y))?.water).toBe(false)
          for (const t of towers) expect(Math.max(Math.abs(d.x - t.ox), Math.abs(d.y - t.oy))).toBeGreaterThan(1.5)
        }
      })
    })
  }

  it('ist deterministisch', () => {
    expect(scatterDecor(buildIsland(towersOf(3)), towersOf(3))).toEqual(scatterDecor(buildIsland(towersOf(3)), towersOf(3)))
  })
})
