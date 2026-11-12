import { memo, useMemo, type SVGProps } from 'react'
import { Loop, type LoopSpec } from '@/ui/Loop'
import { faceRect, leftFaceMatrix, project, rightFaceMatrix, toPoints, type Pt } from './iso'
import { SEA_DROP, WATER_DROP, type Island, type IslandTile } from './island'
import { hull, mergeShapes, polyOf, rectPath, shapeOf, type Poly, type Shape } from './paint'
import { WORLD } from './palette'
import { seededRandom } from './random'

/** Grasband an der Küste (px), darunter Erde bis zum Meer. */
const GRASS_EDGE = 6
/** Wasserfall: Streifen (x auf der Fläche) und ihr Phasenversatz als Anteil einer Runde. */
export const FALL_STREAKS = [3, 9, 15, 20].map((u, n) => ({ u, lag: (n * 0.17) / 0.7 }))
/** Gischt am Fuß des Wasserfalls: Anteile entlang der Unterkante. */
const SPRAY = [0.15, 0.45, 0.75]
/** Teich-Glitzern in drei Gruppen statt jeder Reflex für sich. */
export const SHIMMER_DELAYS = [0, 0.8, 1.6]

const topZ = (t: IslandTile | undefined) => (t ? (t.water ? -WATER_DROP : 0) : -SEA_DROP)

/** Wasserfall über eine Seitenfläche (Kante oben → Kante unten). */
export interface Fall {
  side: 'left' | 'right'
  top: [Pt, Pt]
  bottom: [Pt, Pt]
}

/** Ein Teil der Insel in Zeichenreihenfolge: eine Fläche (Oberseite, Seite, Grasbüschel) oder ein Wasserfall. */
export type IslandPiece = { kind: 'shape'; shape: Shape } | { kind: 'fall'; fall: Fall; poly: Poly }

/** Stil-Schlüssel der Inselflächen: Farbe + Art. */
type IslandStyle = `${string} ${'top' | 'side' | 'tuft'}`

/** Attribute je Stil. Rand in Flächenfarbe, damit zwischen Nachbarflächen keine hellen Nähte durchscheinen. */
function islandStyle(style: string): SVGProps<SVGPathElement> {
  const [fill, kind] = style.split(' ')
  if (kind === 'tuft') return { fill, shapeRendering: 'crispEdges' }
  if (kind === 'top') return { fill, stroke: fill, strokeWidth: 0.6, strokeLinejoin: 'round' }
  return { fill, stroke: fill, strokeWidth: 0.5 }
}

export const sprayRects = ({ bottom: [a, b] }: Fall) =>
  SPRAY.map((f) => ({ x: a.x + (b.x - a.x) * f - 3, y: a.y + (b.y - a.y) * f - 1, w: 6, h: 3 }))

const pieces = new WeakMap<Island, IslandPiece[]>()

/**
 * Voxel-Insel aus Kacheln: Rasenstreifen, Teich und Bach liegen etwas tiefer.
 * Sichtbare Seiten (zum Betrachter, +x und +y) zeigen Gras und Erde bis zum Meer bzw.
 * die Uferkante am Teich; wo der Bach die Küste erreicht, fällt ein Wasserfall ins Meer.
 * Zeichenreihenfolge pro Tiefe: erst Seiten, dann Oberflächen (Painter's Algorithm). Pro Insel gecacht.
 */
export function islandPieces(island: Island): IslandPiece[] {
  const hit = pieces.get(island)
  if (hit) return hit
  const rand = seededRandom('island-drips')
  const out: IslandPiece[] = []
  const add = (style: IslandStyle, pts: Pt[]) => out.push({ kind: 'shape', shape: shapeOf(style, pts) })

  for (const t of island.tiles) {
    const z = topZ(t)
    const { i, j } = t
    // +y-Seite (links vorne): Kante W → S; +x-Seite (rechts vorne): Kante S → E
    const sides = [
      { side: 'left' as const, a: [i, j + 1], b: [i + 1, j + 1], below: island.at(i, j + 1) },
      { side: 'right' as const, a: [i + 1, j + 1], b: [i + 1, j], below: island.at(i + 1, j) },
    ]
    for (const { side, a, b, below } of sides) {
      const zb = topZ(below)
      if (zb >= z) continue
      const A = (zz: number) => project(a[0]!, a[1]!, zz)
      const B = (zz: number) => project(b[0]!, b[1]!, zz)
      if (t.water) {
        const fall: Fall = { side, top: [A(z), B(z)], bottom: [A(zb), B(zb)] }
        const spray = sprayRects(fall).flatMap((r) => [
          { x: r.x, y: r.y },
          { x: r.x + r.w, y: r.y + r.h },
        ])
        out.push({ kind: 'fall', fall, poly: polyOf(hull([...fall.top, ...fall.bottom, ...spray])) })
        continue
      }
      const grass = side === 'left' ? WORLD.grassLeft : WORLD.grassRight
      const dirt = side === 'left' ? WORLD.dirtLeft : WORLD.dirtRight
      const mid = Math.max(zb, z - GRASS_EDGE)
      add(`${grass} side`, [A(z), B(z), B(mid), A(mid)])
      if (mid > zb) {
        add(`${dirt} side`, [A(mid), B(mid), B(zb), A(zb)])
        // Grasbüschel hängen über die Kante
        if (rand() < 0.45) {
          const u = 3 + rand() * 13
          const w = rand() < 0.5 ? 4 : 7
          add(`${grass} tuft`, faceRect(side, A(mid), u, 0, w, 2 + Math.round(rand() * 3)))
        }
      }
    }

    const fill = t.water ? WORLD.pond : j % 2 === 0 ? WORLD.grassTop : WORLD.grassTopAlt
    add(`${fill} top`, [project(i, j, z), project(i + 1, j, z), project(i + 1, j + 1, z), project(i, j + 1, z)])
  }
  pieces.set(island, out)
  return out
}

/** Inselflächen, zu wenigen Pfaden zusammengefasst (siehe `mergeShapes`). */
export const IslandPaths = memo(function IslandPaths({ shapes }: { shapes: Shape[] }) {
  const paths = useMemo(() => mergeShapes(shapes), [shapes])
  return (
    <g pointerEvents="none">
      {paths.map((p, n) => (
        <path key={n} d={p.d} {...islandStyle(p.style)} />
      ))}
    </g>
  )
})

/**
 * Streifen eines Wasserfalls in Flächenkoordinaten. Ein Streifen läuft von −6 bis h + 2. Alle Streifen stehen zweimal
 * übereinander und laufen als Ganzes eine Runde nach unten – der obere Satz rückt nahtlos nach, wenn der untere aus
 * dem Bild ist.
 */
export function fallStreaks({ top, bottom }: Fall) {
  const h = bottom[0].y - top[0].y
  const run = h + 8
  const d = FALL_STREAKS.map(({ u, lag }) => {
    const y = -6 - lag * run
    return rectPath(u, y, 2, 5) + rectPath(u, y + run, 2, 5)
  }).join('')
  return { h, d, loop: { values: { y: [0, run] }, duration: 0.7, ease: 'linear' } satisfies LoopSpec }
}

/** Gischt am Fuß des Wasserfalls und Glitzern auf dem Teich. */
export const SPRAY_PULSE: LoopSpec = { values: { opacity: [0.5, 1, 0.5] }, duration: 0.9 }
export const shimmerPulse = (delay: number): LoopSpec => ({ values: { opacity: [0, 0.75, 0] }, duration: 2.4, delay })

/** Wasserfall über eine Seitenfläche: helle Streifen laufen nach unten. */
export const Waterfall = memo(function Waterfall({ fall }: { fall: Fall }) {
  const { side, top, bottom } = fall
  const { h, d, loop } = fallStreaks(fall)
  const matrix = side === 'left' ? leftFaceMatrix(top[0]) : rightFaceMatrix(top[0])
  const clip = `fall-${side}-${Math.round(top[0].x)}`
  return (
    <g pointerEvents="none">
      <polygon points={toPoints([top[0], top[1], bottom[1], bottom[0]])} fill={WORLD.pond} />
      <g transform={matrix}>
        <clipPath id={clip}>
          <rect width={24} height={h} />
        </clipPath>
        <g clipPath={`url(#${clip})`} fill={WORLD.foam} shapeRendering="crispEdges">
          <Loop loop={loop}>
            <path d={d} />
          </Loop>
        </g>
      </g>
      {/* Gischt am Fuß */}
      <Loop fill={WORLD.foam} shapeRendering="crispEdges" loop={SPRAY_PULSE}>
        <path d={sprayRects(fall).map((r) => rectPath(r.x, r.y, r.w, r.h)).join('')} />
      </Loop>
    </g>
  )
})

/** Lichtreflexe auf Teich und Bach: je Gruppe die Rechtecke (Weltkoordinaten). */
export function shimmerRects(island: Island) {
  const groups = SHIMMER_DELAYS.map(() => [] as { x: number; y: number; w: number; h: number }[])
  island.tiles
    .filter((t) => t.water)
    .forEach((t, n) => {
      const c = project(t.i + 0.5, t.j + 0.5, -WATER_DROP)
      groups[n % SHIMMER_DELAYS.length]!.push({ x: c.x - 4 + (n % 3) * 3, y: c.y - 1 + (n % 2) * 2, w: 6, h: 1.5 })
    })
  return groups
}

/** Kleine Lichtreflexe auf Teich und Bach. */
export const PondShimmer = memo(function PondShimmer({ island }: { island: Island }) {
  const groups = useMemo(() => shimmerRects(island).map((rects) => rects.map((r) => rectPath(r.x, r.y, r.w, r.h)).join('')), [island])
  return (
    <g fill="#fff" shapeRendering="crispEdges" pointerEvents="none">
      {SHIMMER_DELAYS.map((delay, g) => (
        <Loop key={g} loop={shimmerPulse(delay)}>
          <path d={groups[g]} />
        </Loop>
      ))}
    </g>
  )
})
