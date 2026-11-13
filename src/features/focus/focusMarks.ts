import type { BoxGeometry, Pt } from '@/features/world/iso'
import type { LoopSpec } from '@/ui/Loop'

/** Markierungen im Fokus-Modus, gezeichnet in `canvas/focus.ts`. */

/** Markierung des aktiven Blocks: laufende Kontur, Pfeil (Treppe aus Rechtecken) links unten. */
export const ACTIVE = {
  march: { values: { strokeDashoffset: [0, -11] }, duration: 0.8, ease: 'linear' } satisfies LoopSpec,
  nudge: { values: { x: [0, 5, 0] }, duration: 0.9 } satisfies LoopSpec,
  arrowAt: (geo: BoxGeometry): Pt => ({ x: geo.W1.x - 26, y: geo.W0.y - 6 }),
  arrow: [
    { x: 0, y: -6, w: 3, h: 12 },
    { x: 3, y: -4.5, w: 3, h: 9 },
    { x: 6, y: -3, w: 3, h: 6 },
    { x: 9, y: -1.5, w: 3, h: 3 },
  ],
}

/** Haken-Schild rechts am erledigten Block: Lage und Pixel des Hakens. */
export const DONE_BADGE = {
  at: (geo: BoxGeometry): Pt => ({ x: geo.E1.x + 4, y: (geo.E1.y + geo.E0.y) / 2 - 7 }),
  check: [
    { x: 3, y: 7 },
    { x: 5, y: 9 },
    { x: 7, y: 7 },
    { x: 9, y: 5 },
    { x: 11, y: 3 },
  ],
}

/** Staubwolke beim Einrasten: Startpunkte an der Unterkante und Richtung. */
export const dustOrigins = (geo: BoxGeometry): { p: Pt; dx: number }[] => [
  { p: geo.W0, dx: -1 },
  { p: { x: (geo.W0.x + geo.S0.x) / 2, y: (geo.W0.y + geo.S0.y) / 2 }, dx: -0.4 },
  { p: { x: (geo.S0.x + geo.E0.x) / 2, y: (geo.S0.y + geo.E0.y) / 2 }, dx: 0.4 },
  { p: geo.E0, dx: 1 },
]

