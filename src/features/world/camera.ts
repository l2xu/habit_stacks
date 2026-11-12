import type { Rect } from './worldLayout'

/** Kamera der Insel: Weltpunkt (x, y), der in der Bühnenmitte liegt, und Zoom s. */
export interface Camera {
  x: number
  y: number
  s: number
}

/** Bühnengröße; top/bottom = Bereiche, die Kopfzeile bzw. Dock überdecken. */
export interface Stage {
  w: number
  h: number
  top: number
  bottom: number
}

/** Kamera für einen Ausschnitt; minX/maxX = wie weit sie sich seitlich verschieben lässt. */
export interface CameraFit {
  cam: Camera
  minX: number
  maxX: number
}

const SIDE = 12

/** Stärkster Zoom der Welt (Detailansicht eines kleinen Turms) – bestimmt auch die Schärfe von `StaticGround`. */
export const MAX_ZOOM = 1.6

export const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n))

/**
 * Passt einen Ausschnitt in die freie Fläche der Bühne. Die Höhe passt immer; wird der Zoom wegen
 * der Breite kleiner als `minZoom`, bleibt er dort stehen und der Rest lässt sich seitlich wischen.
 * `spareAbove`: Anteil der übrigen Höhe über dem Ausschnitt (0,5 = mittig, 1 = ganz unten).
 */
export function fitFrame(f: Rect, st: Stage, minZoom: number, maxZoom: number, spareAbove = 0.5): CameraFit {
  const availW = Math.max(1, st.w - 2 * SIDE)
  const availH = Math.max(1, st.h - st.top - st.bottom)
  const fw = f.x1 - f.x0
  const fh = f.y1 - f.y0
  const s = Math.min(maxZoom, availH / fh, Math.max(minZoom, availW / fw))
  const cx = (f.x0 + f.x1) / 2
  // Die freie Fläche ist gegenüber der Bühnenmitte um (top − bottom) / 2 nach unten verschoben.
  const lift = ((availH - fh * s) * (spareAbove - 0.5)) / s
  const y = (f.y0 + f.y1) / 2 - (st.top - st.bottom) / 2 / s - lift
  const slack = Math.max(0, fw / 2 - availW / 2 / s)
  return { cam: { x: cx, y, s }, minX: cx - slack, maxX: cx + slack }
}

/** Über den Rand hinaus gezogen: nur noch ein Drittel der Bewegung (Gummiband). */
export function rubberBand(x: number, lo: number, hi: number) {
  if (x < lo) return lo - (lo - x) * 0.35
  if (x > hi) return hi + (x - hi) * 0.35
  return x
}
