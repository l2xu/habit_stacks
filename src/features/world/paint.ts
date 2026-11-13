import type { Pt } from './iso'
import type { Rect } from './worldLayout'

/**
 * Weniger Zeichenaufrufe bei gleichem Bild: Flächen gleichen Stils werden zu einem Pfad zusammengefasst und stille
 * Teile vom Bewegten getrennt – beides nur so weit, wie die Zeichenreihenfolge (Painter's Algorithm) es erlaubt.
 * Zwei Flächen dürfen nur dann die Reihenfolge tauschen, wenn sie sich nicht überdecken.
 */

/** Konvexes Polygon samt Hüllrechteck. */
export interface Poly extends Rect {
  pts: Pt[]
}

export function polyOf(pts: Pt[]): Poly {
  const xs = pts.map((p) => p.x)
  const ys = pts.map((p) => p.y)
  return { pts, x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) }
}

export const rectPoly = ({ x0, y0, x1, y1 }: Rect): Poly => polyOf([
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
])

/** Konvexe Hülle (Andrew's Monotone Chain). */
export function hull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a.x - b.x || a.y - b.y)
  if (pts.length < 3) return pts
  const cross = (o: Pt, a: Pt, b: Pt) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const half = (list: Pt[]) => {
    const out: Pt[] = []
    for (const p of list) {
      while (out.length >= 2 && cross(out.at(-2)!, out.at(-1)!, p) <= 0) out.pop()
      out.push(p)
    }
    out.pop()
    return out
  }
  return [...half(pts), ...half(pts.reverse())]
}

/** Unter dieser Tiefe (px) gilt eine Überschneidung als Berührung – gemeinsame Kanten zählen nicht. */
const EPS = 0.05

/** Trennt eine Kante von `a` die beiden Polygone (Satz von der trennenden Achse)? */
function separated(a: Pt[], b: Pt[], e: number) {
  for (let i = 0; i < a.length; i++) {
    const p = a[i]!
    const q = a[(i + 1) % a.length]!
    const len = Math.hypot(q.x - p.x, q.y - p.y)
    if (len < 1e-9) continue
    const nx = (q.y - p.y) / len
    const ny = (p.x - q.x) / len
    let aMin = Infinity
    let aMax = -Infinity
    let bMin = Infinity
    let bMax = -Infinity
    for (const r of a) {
      const d = r.x * nx + r.y * ny
      aMin = Math.min(aMin, d)
      aMax = Math.max(aMax, d)
    }
    for (const r of b) {
      const d = r.x * nx + r.y * ny
      bMin = Math.min(bMin, d)
      bMax = Math.max(bMax, d)
    }
    if (aMax <= bMin + e || bMax <= aMin + e) return true
  }
  return false
}

/** Überdecken sich zwei konvexe Polygone mit echter Fläche? `gap`: schon, wenn sie näher als so viele px liegen. */
export function overlaps(a: Poly, b: Poly, gap = 0): boolean {
  const e = EPS - gap
  if (a.x1 <= b.x0 + e || b.x1 <= a.x0 + e || a.y1 <= b.y0 + e || b.y1 <= a.y0 + e) return false
  return !separated(a.pts, b.pts, e) && !separated(b.pts, a.pts, e)
}

// ───────────────────────────── Pfade ─────────────────────────────

const n = (v: number) => +v.toFixed(1)

/** Geschlossener Teilpfad durch die Punkte. */
export const pathOf = (pts: Pt[]) => `M${pts.map((p) => `${n(p.x)},${n(p.y)}`).join('L')}Z`

/** Achsenparalleles Rechteck als Teilpfad. */
export const rectPath = (x: number, y: number, w: number, h: number) => `M${n(x)},${n(y)}h${n(w)}v${n(h)}h${n(-w)}Z`

/** Eine Fläche mit Stil-Schlüssel (gleicher Schlüssel = gleiche Attribute) – Baustein für `mergeShapes`. */
export interface Shape {
  style: string
  poly: Poly
  d: string
  /** Wie weit ein andersfarbiger Umriss über das Polygon ragt (halbe Linienbreite). */
  pad: number
}

/**
 * Fläche aus einem konvexen Polygon; immer im selben Drehsinn, damit sich überlappende Teilpfade nicht auslöschen.
 * `pad` nur für Umrisse in anderer Farbe – Ränder in Flächenfarbe (gegen Nähte) dürfen die Nachbarn überlappen.
 */
export function shapeOf(style: string, pts: Pt[], pad = 0): Shape {
  let area = 0
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length]!
    area += p.x * q.y - q.x * p.y
  })
  const ordered = area < 0 ? [...pts].reverse() : pts
  return { style, poly: polyOf(ordered), d: pathOf(ordered), pad }
}

/** Rasterweite für die Suche nach Nachbarn (px). */
const CELL = 48

/**
 * Fasst Flächen (in Zeichenreihenfolge) zu möglichst wenigen Pfaden zusammen. Eine Fläche wandert in einen früheren
 * Pfad ihres Stils, solange sie keine Fläche überdeckt, die erst danach gezeichnet wird. Ergebnis: Pfade in
 * Zeichenreihenfolge, das Bild bleibt gleich (bis auf Kantenglättung an gemeinsamen Kanten).
 */
export function mergeShapes(shapes: Shape[]): { style: string; d: string }[] {
  const { styles, groupOf } = groupShapes(shapes)
  const d = styles.map(() => [] as string[])
  shapes.forEach((s, i) => d[groupOf[i]!]!.push(s.d))
  return styles.map((style, g) => ({ style, d: d[g]!.join('') }))
}

/** Pfad-Gruppe je Fläche (siehe `mergeShapes`); `styles` = Stil je Gruppe in Zeichenreihenfolge. */
export function groupShapes(shapes: Shape[]): { styles: string[]; groupOf: number[] } {
  const styles: string[] = []
  const groupOf: number[] = []
  const grid = new Map<string, { poly: Poly; pad: number; group: number }[]>()
  // Höchstens so weit ragen Umrisse über ihr Polygon: so weit reicht die Suche in Nachbarzellen.
  const reach = 2 * Math.max(0, ...shapes.map((s) => s.pad))
  const cells = (p: Poly) => {
    const keys: string[] = []
    for (let cx = Math.floor((p.x0 - reach) / CELL); cx <= Math.floor((p.x1 + reach) / CELL); cx++) {
      for (let cy = Math.floor((p.y0 - reach) / CELL); cy <= Math.floor((p.y1 + reach) / CELL); cy++) keys.push(`${cx},${cy}`)
    }
    return keys
  }

  for (const s of shapes) {
    const keys = cells(s.poly)
    // Späteste Gruppe, deren Fläche diese überdeckt: Darüber muss sie landen – oder in ihr, wenn der Stil gleich ist
    // (gleiche Farbe übereinander sieht aus wie eine Fläche).
    let last = -1
    for (const key of keys) {
      for (const e of grid.get(key) ?? []) {
        if (e.group > last && overlaps(s.poly, e.poly, s.pad + e.pad)) last = e.group
      }
    }
    let target = styles.findIndex((style, i) => i >= last && style === s.style)
    if (target < 0) {
      target = styles.length
      styles.push(s.style)
    }
    groupOf.push(target)
    const entry = { poly: s.poly, pad: s.pad, group: target }
    for (const key of keys) {
      const list = grid.get(key)
      if (list) list.push(entry)
      else grid.set(key, [entry])
    }
  }
  return { styles, groupOf }
}

/**
 * Trennt Stilles von Bewegtem (Liste in Zeichenreihenfolge). Stilles darf ins Hintergrundbild unter allem Bewegten –
 * außer es überdeckt etwas Bewegtes, das vor ihm gezeichnet wird. Dann muss es mit nach oben, und mit ihm alles
 * Stille, das es seinerseits überdeckt. Ergebnis: true = oben (wird über dem Bild gezeichnet).
 */
export function liftAbove(items: { moving: boolean; polys: Poly[] }[]): boolean[] {
  const above: Poly[] = []
  return items.map((it) => {
    const up = it.moving || it.polys.some((p) => above.some((q) => overlaps(p, q)))
    if (up) above.push(...it.polys)
    return up
  })
}
