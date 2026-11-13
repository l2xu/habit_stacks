import { decorParts, type DecorPart } from './Decor'
import { project, type Pt } from './iso'
import { scatterDecor, type DecorItem, type Island } from './island'
import { islandPieces, shimmerRects, type Fall } from './IsoIsland'
import { hull, liftAbove, polyOf, rectPoly, type Poly, type Shape } from './paint'
import { islandFor, RUBBLE, STEP, type PlacedTower } from './worldLayout'

// ───────────────────────────── Stilles Bild und Bewegtes trennen ─────────────────────────────

/** Welche Türme einen Schutthaufen haben – zusammen mit der Turmanzahl der Schlüssel des Plans. */
export const pileKeyOf = (placed: PlacedTower[]) => placed.flatMap((p) => (p.tower.lost.length > 0 ? [p.index] : [])).join(',')

const plans = new Map<string, GroundPlan>()

/** Plan je Turmanzahl und Schutthaufen; Startseite und Fokus-Modus teilen ihn. */
export function groundPlanFor(count: number, pileKey: string): GroundPlan {
  const key = `${count}|${pileKey}`
  let plan = plans.get(key)
  if (!plan) {
    plan = planGround(islandFor(count), count, pileKey ? pileKey.split(',').map(Number) : [])
    if (plans.size > 8) plans.clear()
    plans.set(key, plan)
  }
  return plan
}

export type DecorPiece = { kind: 'decor'; key: string; item: DecorItem; part: DecorPart }

/** Teil der Welt zwischen Himmel/Meer und Boot, in Zeichenreihenfolge. Türme und Schutthaufen über ihren Index. */
type Piece =
  | { kind: 'shape'; shape: Shape }
  | { kind: 'fall'; key: string; fall: Fall }
  | { kind: 'shimmer' }
  | DecorPiece
  | { kind: 'tower'; index: number }
  | { kind: 'rubble'; index: number }

/** Über dem Bild: wie `Piece`, aufeinanderfolgende Inselflächen als ein Block. */
export type Above = Exclude<Piece, { kind: 'shape' }> | { kind: 'shapes'; key: string; shapes: Shape[] }

export interface GroundPlan {
  /** Ins Bild: Inselflächen, dann stille Deko. */
  still: { shapes: Shape[]; decor: DecorPiece[] }
  above: Above[]
  /** Beschreibt den Bildinhalt eindeutig (alles Übrige folgt deterministisch daraus). */
  key: string
}

/**
 * Bereich, den ein Turm belegen kann: eine Säule über Kontaktschatten und Fokusrahmen, breit genug für Funkeln,
 * Wackel-Striche, Pfeil und Haken im Fokus-Modus. Unabhängig von der Turmhöhe – ein neuer Block braucht kein neues Bild.
 */
const towerColumn = (b: Pt) =>
  polyOf([
    { x: b.x - 100, y: -1e5 },
    { x: b.x + 100, y: -1e5 },
    { x: b.x + 100, y: b.y },
    { x: b.x, y: b.y + 50 },
    { x: b.x - 100, y: b.y },
  ])

/** Schutthaufen samt Rahmen; Brocken fallen beim Öffnen aus 40 px Höhe ein. */
function rubbleArea(x: number, y: number): Poly {
  const ring = [project(x - 1, y - 0.8), project(x + 1.3, y - 0.8), project(x + 1.3, y + 1.3), project(x - 1, y + 1.3)]
  return polyOf(hull([...ring, ...ring.map((p) => ({ x: p.x, y: p.y - 80 }))]))
}

/**
 * Teilt die Welt in stilles Bild und Bewegtes. Ins Bild darf nur, was still steht und nichts Bewegtem in der Zeichenreihenfolge
 * folgt, das es überdeckt (`liftAbove`) – so bleibt z. B. ein Busch vor einem Turm über dem Turm.
 */
export function planGround(island: Island, count: number, pileIndices: number[]): GroundPlan {
  const origins = Array.from({ length: count }, (_, i) => ({ ox: i * STEP.x, oy: i * STEP.y }))
  const piles = pileIndices.map((index) => ({ index, x: index * STEP.x + RUBBLE.x, y: index * STEP.y + RUBBLE.y }))
  const decor = scatterDecor(island, origins, piles)

  const list: { piece: Piece; moving: boolean; polys: Poly[] }[] = []
  islandPieces(island).forEach((p, n) => {
    if (p.kind === 'shape') list.push({ piece: p, moving: false, polys: [p.shape.poly] })
    else list.push({ piece: { kind: 'fall', key: `f${n}`, fall: p.fall }, moving: true, polys: [p.poly] })
  })
  const glints = shimmerRects(island).flat()
  list.push({ piece: { kind: 'shimmer' }, moving: true, polys: glints.map((r) => rectPoly({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h })) })

  // Türme, Deko und Schutthaufen nach Tiefe (bei Gleichstand in dieser Reihenfolge – die Sortierung ist stabil).
  const items = [
    ...decor.flatMap((item, i) =>
      decorParts(item).map(({ part, bounds }) => ({
        depth: item.x + item.y,
        piece: { kind: 'decor' as const, key: `d${i}${part === 'moving' ? 'm' : ''}`, item, part },
        moving: part === 'moving',
        polys: [rectPoly(bounds)],
      })),
    ),
    ...origins.map((o, index) => ({ depth: o.ox + o.oy, piece: { kind: 'tower' as const, index }, moving: true, polys: [towerColumn(project(o.ox, o.oy))] })),
    ...piles.map((p) => ({ depth: p.x + p.y, piece: { kind: 'rubble' as const, index: p.index }, moving: true, polys: [rubbleArea(p.x, p.y)] })),
  ].sort((a, b) => a.depth - b.depth)
  list.push(...items)

  const up = liftAbove(list)
  const still: GroundPlan['still'] = { shapes: [], decor: [] }
  const above: Above[] = []
  list.forEach(({ piece }, n) => {
    if (!up[n]) {
      if (piece.kind === 'shape') still.shapes.push(piece.shape)
      else if (piece.kind === 'decor') still.decor.push(piece)
      return
    }
    const last = above.at(-1)
    if (piece.kind !== 'shape') above.push(piece)
    else if (last?.kind === 'shapes') last.shapes.push(piece.shape)
    else above.push({ kind: 'shapes', key: `s${n}`, shapes: [piece.shape] })
  })
  return { still, above, key: `${count}|${pileIndices.join(',')}` }
}
