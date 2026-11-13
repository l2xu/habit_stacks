import { describe, expect, it } from 'vitest'
import { boxGeometry, project, subBox } from './iso'
import { islandPieces } from './IsoIsland'
import { MASONRY, MASONRY_LAYERS } from './masonry'
import { groupShapes, hull, liftAbove, mergeShapes, overlaps, polyOf, rectPoly, shapeOf, type Shape } from './paint'
import { islandFor } from './worldLayout'

const tile = (i: number, j: number) => [project(i, j), project(i + 1, j), project(i + 1, j + 1), project(i, j + 1)]
const rect = (x0: number, y0: number, x1: number, y1: number) => rectPoly({ x0, y0, x1, y1 })

/** Jedes Paar, das sich überdeckt und verschiedene Stile hat, bleibt in Zeichenreihenfolge. */
function expectOrderKept(shapes: Shape[]) {
  const { groupOf } = groupShapes(shapes)
  shapes.forEach((a, i) => {
    for (let j = i + 1; j < shapes.length; j++) {
      const b = shapes[j]!
      if (a.style !== b.style && overlaps(a.poly, b.poly, a.pad + b.pad)) expect(groupOf[i]).toBeLessThan(groupOf[j]!)
    }
  })
}

describe('Überdeckung', () => {
  it('zählt gemeinsame Kanten und Ecken nicht', () => {
    expect(overlaps(polyOf(tile(0, 0)), polyOf(tile(1, 0)))).toBe(false)
    expect(overlaps(polyOf(tile(0, 0)), polyOf(tile(1, 1)))).toBe(false)
    expect(overlaps(rect(0, 0, 10, 10), rect(10, 0, 20, 10))).toBe(false)
  })

  it('erkennt echte Überschneidung, auch schräg', () => {
    expect(overlaps(rect(0, 0, 10, 10), rect(9, 9, 20, 20))).toBe(true)
    const shifted = tile(0, 0).map((p) => ({ x: p.x + 3, y: p.y }))
    expect(overlaps(polyOf(tile(0, 0)), polyOf(shifted))).toBe(true)
  })

  it('zählt mit Abstand auch knapp nebeneinanderliegende Flächen (Umrisslinien)', () => {
    expect(overlaps(rect(0, 0, 10, 10), rect(10, 0, 20, 10), 0.4)).toBe(true)
    expect(overlaps(rect(0, 0, 10, 10), rect(11, 0, 20, 10), 0.4)).toBe(false)
  })

  it('trennt Rauten, deren Hüllrechtecke sich schneiden', () => {
    // Hüllrechtecke überlappen, die Rauten selbst nicht
    expect(overlaps(polyOf(tile(0, 0)), polyOf(tile(2, 0)))).toBe(false)
  })

  it('bildet die konvexe Hülle', () => {
    const h = hull([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 5, y: 5 },
      { x: 10, y: 10 },
      { x: 0, y: 10 },
    ])
    expect(h).toHaveLength(4)
  })
})

describe('Pfade zusammenfassen', () => {
  it('fasst Flächen gleichen Stils zu einem Pfad zusammen', () => {
    const shapes = [shapeOf('a', tile(0, 0)), shapeOf('a', tile(1, 0)), shapeOf('a', tile(3, 3))]
    expect(mergeShapes(shapes)).toHaveLength(1)
  })

  it('lässt eine Fläche nicht unter eine spätere fallen, die sie überdeckt', () => {
    const shapes = [shapeOf('rot', tile(0, 0)), shapeOf('blau', rect(10, 10, 40, 30).pts), shapeOf('rot', rect(20, 20, 30, 40).pts)]
    expect(mergeShapes(shapes).map((p) => p.style)).toEqual(['rot', 'blau', 'rot'])
  })

  it('zieht eine Fläche nach vorne, wenn sie nichts Späteres überdeckt', () => {
    const shapes = [shapeOf('rot', tile(0, 0)), shapeOf('blau', rect(10, 10, 40, 30).pts), shapeOf('rot', tile(8, 0))]
    expect(mergeShapes(shapes).map((p) => p.style)).toEqual(['rot', 'blau'])
  })

  it('dreht alle Teilpfade in dieselbe Richtung (keine Löcher bei Überlappung)', () => {
    const area = (s: Shape) => s.poly.pts.reduce((sum, p, i, pts) => sum + p.x * pts[(i + 1) % pts.length]!.y - pts[(i + 1) % pts.length]!.x * p.y, 0)
    expect(Math.sign(area(shapeOf('a', tile(0, 0))))).toBe(Math.sign(area(shapeOf('a', [...tile(0, 0)].reverse()))))
  })

  for (const n of [1, 4, 9]) {
    it(`hält die Reihenfolge auf einer Insel mit ${n} ${n === 1 ? 'Turm' : 'Türmen'} und spart dabei fast alle Elemente`, () => {
      const shapes = islandPieces(islandFor(n)).flatMap((p) => (p.kind === 'shape' ? [p.shape] : []))
      expectOrderKept(shapes)
      const paths = mergeShapes(shapes)
      expect(paths.length).toBeLessThan(shapes.length / 10)
    })
  }

  it('hält die Reihenfolge der Mini-Würfel eines vollen Geist-Blocks', () => {
    const geo = boxGeometry(0, 0, 1.38, 68, 56)
    const layerH = geo.height / MASONRY_LAYERS
    const shapes = MASONRY.flatMap((p) => {
      const g = subBox(geo, p.u0, p.u1, p.v0, p.v1, p.layer * layerH, (p.layer + 1) * layerH)
      return [shapeOf('left', g.left), shapeOf('right', g.right), shapeOf('top', g.top), shapeOf('edge', g.outline, 0.4)]
    })
    expectOrderKept(shapes)
    // Vorher je Würfel eine Gruppe mit 4 Flächen (135 Elemente). Die Umrisse berühren sich überall, daher nicht weniger.
    expect(mergeShapes(shapes).length).toBeLessThan(70)
  })
})

describe('Stilles Bild und Bewegtes trennen', () => {
  const still = (poly = rect(0, 0, 10, 10)) => ({ moving: false, polys: [poly] })
  const moving = (poly = rect(0, 0, 10, 10)) => ({ moving: true, polys: [poly] })

  it('legt Stilles unter Bewegtes, wenn es davor gezeichnet wird', () => {
    expect(liftAbove([still(), moving()])).toEqual([false, true])
  })

  it('hebt Stilles an, das Bewegtes danach überdeckt – und was darauf liegt', () => {
    const items = [moving(rect(0, 0, 10, 10)), still(rect(5, 5, 15, 15)), still(rect(12, 12, 20, 20)), still(rect(30, 30, 40, 40))]
    expect(liftAbove(items)).toEqual([true, true, true, false])
  })

  it('lässt Stilles unten, das Bewegtes nur berührt', () => {
    expect(liftAbove([moving(rect(0, 0, 10, 10)), still(rect(10, 0, 20, 10))])).toEqual([true, false])
  })
})
