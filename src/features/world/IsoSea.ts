import type { LoopSpec } from '@/ui/Loop'
import { boxGeometry, K, project } from './iso'
import { horizonOf, perIsland, SEA_DROP } from './island'
import { pathOf, rectPath } from './paint'
import { WORLD } from './palette'
import { seededRandom } from './random'

/** Unterwasser-Teil der Küste (px). */
const SKIRT = 12
/** Wellen glitzern in wenigen Gruppen statt jede für sich: Phase und Dauer je Gruppe (s). */
export const WAVE_GROUPS = [
  { delay: 0, duration: 4.2 },
  { delay: 1.4, duration: 5 },
  { delay: 2.8, duration: 4.6 },
  { delay: 0.7, duration: 5.6 },
]

/** Übergang vom Dunst am Horizont ins Meerblau (px). */
export const HAZE = 180

/** Gischt an der Küste pulsiert. */
export const FOAM_PULSE: LoopSpec = { values: { opacity: [0.55, 1, 0.55] }, duration: 3.2 }
/** Wellen: tauchen auf, wandern ein Stück und verschwinden. */
export const wavePulse = ({ delay, duration }: (typeof WAVE_GROUPS)[number]): LoopSpec => ({ values: { opacity: [0, 0.9, 0], x: [0, 6, 10] }, duration, delay })
/** Ferne Inselchen: Sockel und Kuppe (vor dem Verschieben und Skalieren). */
export const ISLET_BOXES = [
  { geo: boxGeometry(0, 0, 1.6, 0, 7), palette: { ...WORLD.leaf, edge: WORLD.leaf.left } },
  { geo: boxGeometry(0.3, -0.4, 0.4, 7, 14), palette: { ...WORLD.leafDark, edge: WORLD.leafDark.left } },
]

/** Küstensaum, Gischt (je ein Pfad), Wellen (ein Pfad je Gruppe) und ferne Inselchen. */
export const seaShapes = perIsland((island) => {
  const horizon = horizonOf(island)
  const coast: { a: [number, number]; b: [number, number] }[] = []
  for (const t of island.tiles) {
    if (!island.at(t.i, t.j + 1)) coast.push({ a: [t.i, t.j + 1], b: [t.i + 1, t.j + 1] })
    if (!island.at(t.i + 1, t.j)) coast.push({ a: [t.i + 1, t.j + 1], b: [t.i + 1, t.j] })
  }

  const rand = seededRandom(`sea-${island.tiles.length}`)
  const left = Math.min(...island.tiles.map((t) => project(t.i, t.j + 1).x))
  const right = Math.max(...island.tiles.map((t) => project(t.i + 1, t.j).x))
  // Wellen nur aufs offene Wasser, nicht unter die Insel.
  const onIsland = (X: number, Y: number) => {
    const sum = (2 * (Y - SEA_DROP)) / K
    const diff = X / K
    const x = (sum + diff) / 2
    const y = (sum - diff) / 2
    return [0, 1, -1].some((d) => island.at(Math.floor(x + d), Math.floor(y)) || island.at(Math.floor(x), Math.floor(y + d)))
  }
  // Je Wellengruppe ein Pfad.
  const waves = WAVE_GROUPS.map(() => '')
  for (let k = 0, count = 0; k < 140 && count < 44; k++) {
    const x = left - 520 + rand() * (right - left + 1040)
    const y = horizon + 24 + Math.pow(rand(), 0.8) * (island.frontY - horizon + 560)
    if (onIsland(x, y)) continue
    // Weiter hinten (näher am Horizont) kürzer.
    const depth = Math.min(1, (y - horizon) / 300)
    waves[count++ % WAVE_GROUPS.length] += rectPath(x, y, Math.round(4 + depth * 8), 2)
  }
  const islets = [
    { x: left - 220, y: horizon + 14, s: 0.55 },
    { x: right + 160, y: horizon + 22, s: 0.7 },
  ]
  // Saum und Gischt entlang der ganzen Küste als je ein Pfad.
  const skirt = coast
    .map(({ a, b }) =>
      pathOf([project(a[0], a[1], -SEA_DROP), project(b[0], b[1], -SEA_DROP), project(b[0], b[1], -SEA_DROP - SKIRT), project(a[0], a[1], -SEA_DROP - SKIRT)]),
    )
    .join('')
  const foam = coast
    .map(({ a, b }) => {
      const A = project(a[0], a[1], -SEA_DROP - 1.5)
      const B = project(b[0], b[1], -SEA_DROP - 1.5)
      return `M${A.x},${A.y}L${B.x},${B.y}`
    })
    .join('')
  return { horizon, skirt, foam, waves, islets }
})
/** Wo das Boot vor der Insel treibt. */
export const boatSpot = perIsland((island) => {
  const xs = island.tiles.map((t) => project(t.i + 0.5, t.j + 0.5).x)
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2 + 40, y: island.frontY + SEA_DROP + 70 }
})

const HULL = boxGeometry(0, 0, 0.42, 0, 6)
/** Boot (Rumpf, Kajüte, Mast, Segel) relativ zu seiner Mitte; Drift und Schaukeln dazu. */
export const BOAT = {
  shadow: [HULL.W0, HULL.S0, HULL.E0].map((p) => ({ x: p.x, y: p.y + 3 })),
  boxes: [HULL, boxGeometry(0.33, -0.13, 0.05, 6, 3), boxGeometry(0, 0, 0.04, 6, 30)],
  sails: [
    { pts: [{ x: 1, y: -34 }, { x: 1, y: -10 }, { x: 17, y: -10 }], fill: WORLD.foam, stroke: '#c9cfc6' },
    { pts: [{ x: -1, y: -30 }, { x: -1, y: -12 }, { x: -11, y: -12 }], fill: '#f2dfc4', stroke: '#c9b89d' },
  ],
  drift: { values: { x: [-90, 90, -90] }, duration: 70 } satisfies LoopSpec,
  rock: { values: { y: [0, -2, 0], rotate: [-2, 2, -2] }, duration: 3.4 } satisfies LoopSpec,
}
