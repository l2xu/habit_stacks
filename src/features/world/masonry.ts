import { seededRandom } from './random'

/**
 * Ein Block besteht aus 27 Mini-Würfeln: 3 Schichten à 3×3. Ein Würfel = ein erledigter Tag.
 * Geister-Blöcke zeigen die Würfel einzeln (einer pro erledigtem Tag), bröckelnde Blöcke
 * zeigen sie mit Lücken. Verfestigte Blöcke bleiben eine glatte Fläche.
 */
export interface MasonryPiece {
  layer: number
  /** Grundfläche als Anteil der Blockkante (0–1); u: N→E, v: N→W. */
  u0: number
  u1: number
  v0: number
  v1: number
}

export const MASONRY_LAYERS = 3
const GRID = 3

const depth = (p: MasonryPiece) => p.u0 + p.u1 + p.v0 + p.v1

const LAYER: MasonryPiece[] = Array.from({ length: GRID * GRID }, (_, i) => {
  const u = i % GRID
  const v = Math.floor(i / GRID)
  return { layer: 0, u0: u / GRID, u1: (u + 1) / GRID, v0: v / GRID, v1: (v + 1) / GRID }
})

/**
 * Alle 27 Würfel in Füllreihenfolge: Schicht für Schicht, in jeder Schicht von hinten nach vorne.
 * Das ist zugleich die richtige Zeichenreihenfolge (Painter's Algorithm).
 */
export const MASONRY: readonly MasonryPiece[] = Array.from({ length: MASONRY_LAYERS }, (_, layer) =>
  LAYER.map((p) => ({ ...p, layer })).sort((a, b) => depth(a) - depth(b) || a.u0 - b.u0),
).flat()

const overlaps = (a: MasonryPiece, b: MasonryPiece) => a.u0 < b.u1 && b.u0 < a.u1 && a.v0 < b.v1 && b.v0 < a.v1

const frontEdge = (p: MasonryPiece) => p.u1 === 1 || p.v1 === 1

/**
 * Welche Steine einem bröckelnden Block fehlen: bevorzugt oben und an den sichtbaren Vorderseiten,
 * aber nie so, dass ein Stein in der Luft hängt. Trägt der Block noch Blöcke (`carrying`), bleibt die
 * oberste Schicht heil und es fehlen Steine unten an den Vorderkanten. Deterministisch pro Block.
 */
export function crumbledPieces(seed: string, count: number, carrying = false): Set<number> {
  const rand = seededRandom(`crumble-${seed}`)
  if (carrying) {
    const candidates = MASONRY.flatMap((p, i) => (p.layer < MASONRY_LAYERS - 1 && frontEdge(p) ? [{ i, score: rand() - p.layer * 0.3 }] : []))
    return new Set(candidates.sort((a, b) => b.score - a.score).slice(0, count).map((c) => c.i))
  }
  const score = MASONRY.map((p) => p.layer + (frontEdge(p) ? 0.6 : 0) + rand() * 1.3)
  const removed = new Set<number>()
  while (removed.size < Math.min(count, MASONRY.length)) {
    let best = -1
    MASONRY.forEach((p, i) => {
      if (removed.has(i)) return
      const covered = MASONRY.some((q, j) => q.layer === p.layer + 1 && !removed.has(j) && overlaps(p, q))
      if (!covered && (best < 0 || score[i]! > score[best]!)) best = i
    })
    removed.add(best)
  }
  return removed
}
