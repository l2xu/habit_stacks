import type { LoopSpec } from '@/ui/Loop'
import { boxGeometry, project, type BoxGeometry } from './iso'
import { WATER_DROP, type DecorItem } from './island'
import { WORLD } from './palette'
import type { Rect } from './worldLayout'

type Item<K extends DecorItem['kind']> = Extract<DecorItem, { kind: K }>

/**
 * Teil eines Deko-Objekts: `still` darf ins Hintergrundbild (`groundPlan`), `moving` bewegt sich und wird jedes Frame gezeichnet.
 * Nur der Baum hat beides: Stamm und Schatten stehen, die Krone wiegt sich.
 */
export type DecorPart = 'still' | 'moving'

// ───────────────────────────── Geometrie (Zeichnen und Umriss) ─────────────────────────────

export const tuftBoxes = ({ x, y, tall }: Item<'tuft'>) => [
  boxGeometry(x, y, 0.11, 0, tall ? 9 : 6),
  ...(tall ? [boxGeometry(x + 0.28, y + 0.1, 0.09, 0, 5)] : []),
]

const REEDS = [
  [0, 0, 14],
  [0.2, 0.12, 11],
  [-0.12, 0.22, 9],
] as const

/** Halme und Kolben, in Zeichenreihenfolge. */
export const reedBoxes = ({ x, y }: Item<'reed'>) =>
  REEDS.flatMap(([dx, dy, h], n) => [
    { geo: boxGeometry(x + dx, y + dy, 0.04, 0, h), palette: WORLD.reed },
    ...(n < 2 ? [{ geo: boxGeometry(x + dx, y + dy, 0.07, h - 5, 5), palette: WORLD.cattail }] : []),
  ])

/** Laub- oder Nadelbaum. Der Stamm muss höher sein als die Krone breit, sonst verdeckt sie ihn. */
export function treeGeometry({ x, y, pine, size: s }: Item<'tree'>) {
  const trunkH = (pine ? 22 : 26) * s
  const crown = pine
    ? [
        boxGeometry(x, y, 0.72 * s, trunkH - 4, 15 * s),
        boxGeometry(x, y, 0.52 * s, trunkH + 11 * s, 14 * s),
        boxGeometry(x, y, 0.3 * s, trunkH + 25 * s, 13 * s),
      ]
    : [boxGeometry(x, y, 0.74 * s, trunkH - 4, 26 * s), boxGeometry(x + 0.05, y - 0.05, 0.46 * s, trunkH + 22 * s, 12 * s)]
  const base = project(x, y)
  return {
    shadow: { cx: base.x + 6, cy: base.y + 3, rx: 26 * s, ry: 11 * s },
    trunk: boxGeometry(x, y, 0.14 * s, 0, trunkH),
    crown,
  }
}

export const bushBoxes = ({ x, y, size: s }: Item<'bush'>) => ({
  body: boxGeometry(x, y, 0.36 * s, 0, 9 * s),
  top: boxGeometry(x + 0.08, y - 0.06, 0.22 * s, 9 * s, 5 * s),
})

export function frogBoxes({ x, y }: Item<'frog'>) {
  return {
    foot: boxGeometry(x - 0.18, y + 0.32, 0.09, 0, 3),
    body: boxGeometry(x, y, 0.3, 0, 12),
    eyeL: boxGeometry(x - 0.12, y + 0.17, 0.1, 12, 6),
    eyeR: boxGeometry(x + 0.17, y - 0.12, 0.1, 12, 6),
  }
}

const boxRect = (g: BoxGeometry): Rect => ({ x0: g.W0.x, y0: g.N1.y, x1: g.E0.x, y1: g.S0.y })

/** Umfassendes Rechteck, ringsum um `pad` px vergrößert (Kanten, Bewegung). */
function around(rects: Rect[], pad: number): Rect {
  return {
    x0: Math.min(...rects.map((r) => r.x0)) - pad,
    y0: Math.min(...rects.map((r) => r.y0)) - pad,
    x1: Math.max(...rects.map((r) => r.x1)) + pad,
    y1: Math.max(...rects.map((r) => r.y1)) + pad,
  }
}

/** Kanten (1,25 px) und Kantenglättung. */
const EDGE = 2

/**
 * Teile eines Deko-Objekts in Zeichenreihenfolge, mit Umriss inklusive Bewegung – großzügig, denn ein zu kleiner
 * Umriss könnte eine Überdeckung übersehen (siehe `liftAbove`).
 */
export function decorParts(item: DecorItem): { part: DecorPart; bounds: Rect }[] {
  switch (item.kind) {
    case 'tuft':
      return [{ part: 'still', bounds: around(tuftBoxes(item).map(boxRect), EDGE) }]
    case 'flower': {
      const head = project(item.x, item.y, 9)
      const stem = boxRect(boxGeometry(item.x, item.y, 0.05, 0, 7))
      return [{ part: 'still', bounds: around([stem, { x0: head.x - 3, y0: head.y - 3, x1: head.x + 3, y1: head.y + 1 }], EDGE) }]
    }
    case 'stone':
      return [{ part: 'still', bounds: around([boxRect(boxGeometry(item.x, item.y, item.half, 0, 3))], EDGE) }]
    case 'tree': {
      const { shadow, trunk, crown } = treeGeometry(item)
      const shade = { x0: shadow.cx - shadow.rx, y0: shadow.cy - shadow.ry, x1: shadow.cx + shadow.rx, y1: shadow.cy + shadow.ry }
      return [
        { part: 'still', bounds: around([shade, boxRect(trunk)], EDGE) },
        // Die Krone schert beim Wiegen oben um gut 1 px aus.
        { part: 'moving', bounds: around(crown.map(boxRect), EDGE + 2) },
      ]
    }
    case 'bush': {
      const { body, top } = bushBoxes(item)
      return [{ part: 'still', bounds: around([boxRect(body), boxRect(top)], EDGE) }]
    }
    case 'reed':
      return [{ part: 'still', bounds: around(reedBoxes(item).map((b) => boxRect(b.geo)), EDGE) }]
    case 'lily': {
      const c = project(item.x, item.y, -WATER_DROP + 1.5)
      const pad = project(item.x, item.y, -WATER_DROP + 0.5)
      // Seerose ±0,22 Einheiten (±10,6 × 5,3 px), schaukelt 0,8 px.
      return [{ part: 'moving', bounds: around([{ x0: pad.x - 11, y0: Math.min(pad.y - 6, c.y - 2), x1: pad.x + 11, y1: pad.y + 6 }], EDGE + 1) }]
    }
    case 'butterfly': {
      const p = project(item.x, item.y, 18)
      // Flugbahn x −8 … 18, y −8 … 8, Flügel ±4 × 3.
      return [{ part: 'moving', bounds: around([{ x0: p.x - 12, y0: p.y - 10.5, x1: p.x + 22, y1: p.y + 9.5 }], EDGE) }]
    }
    case 'frog': {
      const boxes = Object.values(frogBoxes(item)).map(boxRect)
      // Sprung 12 px nach oben.
      const r = around(boxes, EDGE)
      return [{ part: 'moving', bounds: { ...r, y0: r.y0 - 12 } }]
    }
  }
}

/** Blume: Stiel, Blüte und Mitte (Weltkoordinaten). */
export function flowerParts({ x, y }: Item<'flower'>) {
  const head = project(x, y, 9)
  return { stem: boxGeometry(x, y, 0.05, 0, 7), petals: { x: head.x - 3, y: head.y - 3, w: 6, h: 4 }, dot: { x: head.x - 1, y: head.y - 2, w: 2, h: 2 } }
}

/** Seerose: Blatt und Blüte. */
export function lilyParts({ x, y }: Item<'lily'>) {
  const pad = [
    project(x - 0.22, y - 0.22, -WATER_DROP + 0.5),
    project(x + 0.22, y - 0.22, -WATER_DROP + 0.5),
    project(x + 0.22, y + 0.22, -WATER_DROP + 0.5),
    project(x - 0.22, y + 0.22, -WATER_DROP + 0.5),
  ]
  const c = project(x, y, -WATER_DROP + 1.5)
  return { pad, bloom: { x: c.x - 1.5, y: c.y - 2, w: 3, h: 3 } }
}

/** Beeren auf der linken Fläche eines Buschs (Flächenkoordinaten). */
export const berryRects = (s: number) => [
  { x: 3 * s, y: 2 * s },
  { x: 9 * s, y: 5 * s },
  { x: 13 * s, y: 1.5 * s },
]

/** Dauer-Animationen der Deko. */
export const DECOR_LOOPS = {
  lily: { values: { y: [0, 0.8, 0] }, duration: 3 } satisfies LoopSpec,
  crown: (size: number): LoopSpec => ({ values: { skewX: [0, 1.5, 0, -1, 0] }, duration: 5 + size * 2 }),
  frog: { values: { y: [0, -12, 0, 0] }, duration: 0.55, times: [0, 0.45, 0.9, 1], repeatDelay: 4.5, ease: 'easeOut' } satisfies LoopSpec,
  flutter: (x: number, y: number): LoopSpec => ({ values: { x: [0, 12, 18, 6, -8, 0], y: [0, -8, 2, 8, -2, 0] }, duration: 8, delay: (x * 7 + y * 3) % 3 }),
  wings: { values: { scaleX: [1, 0.25, 1] }, duration: 0.35 } satisfies LoopSpec,
}

/** Schmetterling: zwei Flügel und Körper (relativ zur Flugbahn). */
export const BUTTERFLY = { wings: [{ x: -4, y: -2, w: 3, h: 3 }, { x: 1, y: -2, w: 3, h: 3 }], body: { x: -0.5, y: -2.5, w: 1, h: 4 } }
