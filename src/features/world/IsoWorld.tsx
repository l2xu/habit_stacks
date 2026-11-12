import { memo, useMemo, type ReactNode } from 'react'
import type { ID } from '@/domain/types'
import { Decor, decorParts, type DecorPart } from './Decor'
import { project, type Pt } from './iso'
import { scatterDecor, type DecorItem, type Island } from './island'
import { IslandPaths, islandPieces, PondShimmer, shimmerRects, Waterfall, type Fall } from './IsoIsland'
import { Boat, IsoSea } from './IsoSea'
import { IsoTower } from './IsoTower'
import { hull, liftAbove, polyOf, rectPoly, type Poly, type Shape } from './paint'
import { Rubble } from './Rubble'
import { SkyBackdrop, SkyLife } from './Sky'
import { StaticGround } from './StaticGround'
import { GhostStripes } from './VoxelBlock'
import { effectLostIds, type TowerEffect } from './effects'
import { dropDelay, islandFor, RUBBLE, STEP, type PlacedTower } from './worldLayout'

interface IsoWorldProps {
  placed: PlacedTower[]
  /** Detailansicht: nur dieser Turm (und sein Schutthaufen) bleibt sichtbar. */
  openId: ID | null
  onOpen: (id: ID) => void
  onEdit: (id: ID) => void
  effect?: { towerId: ID; effect: TowerEffect } | null
  /** Antippen eines Schutthaufens. */
  onRubble: (towerId: ID) => void
  /** false: alles steht sofort, ohne Fall-Animation (Fokus-Modus). */
  dropIn?: boolean
  /** Fokus-Modus: eigene Darstellung der Blöcke des geöffneten Turms. */
  renderBlock?: (index: number, block: ReactNode) => ReactNode
}

/**
 * Inhalt der Welt (Himmel, Meer, Insel, Deko, Türme, Schutthaufen) in Bildschirm-Weltkoordinaten.
 * Zeichenreihenfolge: hinten → vorne (Painter's Algorithm). Den Ausschnitt setzt die Kamera
 * (`WorldStage` bzw. im Fokus-Modus `FocusScene`) – beide zeigen dieselbe Welt.
 * Insel und stille Deko liegen als Bild darunter (`StaticGround`), alles Bewegte als SVG darüber (`planGround`).
 */
export const IsoWorld = memo(function IsoWorld({ placed, openId, onOpen, onEdit, effect, onRubble, dropIn = true, renderBlock }: IsoWorldProps) {
  const count = placed.length
  const island = useMemo(() => islandFor(count), [count])
  // Der Plan hängt nur von den Plätzen ab (Turmanzahl, welche Türme einen Schutthaufen haben), nicht von den Blöcken.
  const pileKey = pileKeyOf(placed)
  const plan = useMemo(() => groundPlanFor(count, pileKey), [count, pileKey])
  // Steht still, bis sich der Plan ändert – rendert also nicht mit, wenn ein Turm geöffnet wird oder sich ändert.
  const ground = useMemo(
    () => (
      <StaticGround bakeKey={plan.key}>
        <IslandPaths shapes={plan.still.shapes} />
        {plan.still.decor.map((d) => (
          <Decor key={d.key} item={d.item} part={d.part} />
        ))}
      </StaticGround>
    ),
    [plan],
  )
  // Blöcke, die gerade als Neuigkeit abfallen oder zerspringen, landen erst danach auf dem Haufen.
  const lostKey = effectLostIds(effect?.effect).join(' ')
  const hiddenIds = useMemo(() => (lostKey ? lostKey.split(' ') : undefined), [lostKey])
  const isHidden = (id: ID) => openId !== null && openId !== id

  const renderAbove = (a: Above): ReactNode => {
    switch (a.kind) {
      case 'shapes':
        return <IslandPaths key={a.key} shapes={a.shapes} />
      case 'fall':
        return <Waterfall key={a.key} fall={a.fall} />
      case 'shimmer':
        return <PondShimmer key="shimmer" island={island} />
      case 'decor':
        return <Decor key={a.key} item={a.item} part={a.part} />
      case 'tower': {
        const p = placed[a.index]
        return (
          p && (
            <IsoTower
              key={p.tower.id}
              placed={p}
              hidden={isHidden(p.tower.id)}
              onOpen={onOpen}
              onEdit={onEdit}
              effect={effect?.towerId === p.tower.id ? effect.effect : null}
              dropIn={dropIn}
              renderBlock={p.tower.id === openId ? renderBlock : undefined}
            />
          )
        )
      }
      case 'rubble': {
        const p = placed[a.index]
        if (!p?.tower.lost.length) return null
        return (
          <Rubble
            key={`r-${p.tower.id}`}
            towerId={p.tower.id}
            towerName={p.tower.name}
            lost={p.tower.lost}
            x={p.ox + RUBBLE.x}
            y={p.oy + RUBBLE.y}
            hidden={isHidden(p.tower.id)}
            hiddenIds={effect?.towerId === p.tower.id ? hiddenIds : undefined}
            delay={dropIn ? dropDelay(p.index, p.tower.blocks.length) : null}
            onOpen={onRubble}
          />
        )
      }
    }
  }

  // geometricPrecision (erbt auf alle Beschriftungen): Chrome setzt SVG-Text sonst bei jeder Zoomstufe der
  // Kamera neu – auf schwachen Geräten der größte Einzelposten einer Kamerafahrt.
  return (
    <g role="group" aria-label="Deine Habit-Türme" textRendering="geometricPrecision">
      <GhostStripes />
      <SkyBackdrop island={island} />
      <IsoSea island={island} />
      <SkyLife island={island} />
      {ground}
      {plan.above.map(renderAbove)}
      <Boat island={island} />
    </g>
  )
})

// ───────────────────────────── Bild und SVG trennen ─────────────────────────────

/** Welche Türme einen Schutthaufen haben – zusammen mit der Turmanzahl der Schlüssel des Plans. */
export const pileKeyOf = (placed: PlacedTower[]) => placed.flatMap((p) => (p.tower.lost.length > 0 ? [p.index] : [])).join(',')

const plans = new Map<string, GroundPlan>()

/** Plan je Turmanzahl und Schutthaufen; Startseite und Fokus-Modus (SVG wie Canvas) teilen ihn. */
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
 * Teilt die Welt in Bild und SVG. Ins Bild darf nur, was still steht und nichts Bewegtem in der Zeichenreihenfolge
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
