import { cubicBezier, keyframes, spring, type Easing } from 'framer-motion'
import type { LoopSpec } from '@/ui/Loop'
import type { Pt } from '../iso'
import type { Rect } from '../worldLayout'

/**
 * Laufzeit der Canvas-Welt: was ein Frame weiß, Dauer-Animationen (`LoopSpec` wie bei den SVG-Loops) und einmalige
 * Bewegungen (Federn und Keyframes von Framer Motion, ausgewertet als reine Zeitfunktion – gleiche Kurven wie bisher).
 */

export type Ctx = CanvasRenderingContext2D

export interface Frame {
  ctx: Ctx
  /** Zeit in ms (Zeitachse des Dokuments, wie Web Animations und Framer Motion). */
  t: number
  /** Bewegung reduzieren: Dauer-Animationen stehen, Bewegungen springen ans Ziel, Ein- und Ausblenden bleibt. */
  still: boolean
  /** Die Kamera steht seit einem Moment – zwischengespeicherte Bilder dürfen pixelgenau nachgezeichnet werden. */
  settled: boolean
  /** > 0: Wir zeichnen gerade in einer bewegten Transformation (dann nicht pixelgenau nachzeichnen). */
  motion: number
  /** Restzeit (ms) in diesem Frame fürs Nachzeichnen zwischengespeicherter Bilder. */
  budget: number
  /** Sichtbarer Weltausschnitt. */
  view: Rect
  /** Zwischenebenen für Gruppen-Deckkraft (gleich groß wie die Zeichenfläche). */
  layers: LayerPool
}

// ───────────────────────────── Dauer-Animationen ─────────────────────────────

type Prop = keyof LoopSpec['values']
export type LoopValues = Partial<Record<Prop, number>>

/** CSS-Schlüsselwörter, wie die SVG-Loops sie an Web Animations geben. */
const CSS_EASE = {
  linear: (p: number) => p,
  easeIn: cubicBezier(0.42, 0, 1, 1),
  easeOut: cubicBezier(0, 0, 0.58, 1),
  easeInOut: cubicBezier(0.42, 0, 0.58, 1),
}

/** Ausgewertete Dauer-Animation: `at(t)` liefert die Werte zur Zeit t (ms). */
export interface Loop {
  at: (t: number) => LoopValues
}

/**
 * Dauer-Animation wie `useLoop`: gleiche Keyframes, Abstände, Pause nach jedem Durchlauf und Phase auf der
 * Zeitachse des Dokuments – ein Loop läuft im Canvas genau so wie vorher als Web Animation.
 */
export function loop(spec: LoopSpec): Loop {
  const { values, duration, times, ease = 'easeInOut', repeatDelay = 0, delay = 0 } = spec
  const entries = Object.entries(values) as [Prop, number[]][]
  const n = entries[0]![1].length
  const total = (duration + repeatDelay) * 1000
  const span = duration / (duration + repeatDelay)
  const offsets = Array.from({ length: n }, (_, i) => (times?.[i] ?? i / (n - 1)) * span)
  // Pause nach dem Durchlauf: der letzte Wert bleibt bis zum Ende stehen.
  if (repeatDelay > 0) offsets.push(1)
  const curve = CSS_EASE[ease]
  const out: LoopValues = {}
  const start = delay * 1000
  return {
    at(t) {
      const p = ((((t - start) % total) + total) % total) / total
      let i = 0
      while (i < offsets.length - 2 && p >= offsets[i + 1]!) i++
      const a = offsets[i]!
      const b = offsets[i + 1] ?? 1
      const e = b > a ? curve(Math.min(1, (p - a) / (b - a))) : 1
      for (const [prop, list] of entries) {
        const from = list[Math.min(i, n - 1)]!
        const to = list[Math.min(i + 1, n - 1)]!
        out[prop] = from + (to - from) * e
      }
      return out
    },
  }
}

/** Uhr für Loops: still = Bewegung reduzieren (Phase wie bei angehaltener Web Animation), `frozenAt` = angehalten. */
export const loopClock = (f: Frame, frozenAt: number | null = null) => (f.still ? 0 : (frozenAt ?? f.t))

// ───────────────────────────── Einmalige Bewegungen ─────────────────────────────

/** Wert über der Zeit seit dem Start (ms, inklusive Verzögerung); `end` = ab hier steht er (ms). */
export interface Track {
  at: (elapsed: number) => number
  end: number
  /** Endwert – bei „Bewegung reduzieren“ springen Transformationen sofort dorthin. */
  final: number
}

interface SpringOptions {
  stiffness: number
  damping: number
  mass?: number
  restDelta?: number
  restSpeed?: number
  /** Verzögerung (s). */
  delay?: number
}

/** Feder von `from` nach `to` wie Framer Motion (`type: 'spring'`). */
export function springTrack(from: number, to: number, { delay = 0, ...physics }: SpringOptions): Track {
  const gen = spring({ keyframes: [from, to], ...physics })
  const wait = delay * 1000
  // Wie lange die Feder schwingt: vorwärts suchen, bis sie ruht (höchstens 10 s, wie Framer Motion).
  let duration = 0
  while (duration < 10_000 && !gen.next(duration).done) duration += 20
  return {
    at: (elapsed) => (elapsed <= wait ? from : elapsed - wait >= duration ? to : gen.next(elapsed - wait).value),
    end: wait + duration,
    final: to,
  }
}

interface KeyOptions {
  /** Dauer (s). */
  duration: number
  /** Zeitpunkte 0–1 je Wert. */
  times?: number[]
  /** Wie bei Framer Motion; ohne Angabe 'easeOut' (Standard, sobald eine Dauer angegeben ist). */
  ease?: Easing | Easing[]
  /** Verzögerung (s). */
  delay?: number
}

/** Keyframes wie Framer Motion (`animate={{ x: [...] }}` mit `duration`, `times`, `ease`). */
export function keyTrack(values: number[], { duration, times, ease = 'easeOut', delay = 0 }: KeyOptions): Track {
  const ms = duration * 1000
  const gen = keyframes({ keyframes: values, times, ease, duration: ms })
  const wait = delay * 1000
  const last = values.at(-1)!
  return {
    at: (elapsed) => (elapsed <= wait ? values[0]! : elapsed - wait >= ms ? last : gen.next(elapsed - wait).value),
    end: wait + ms,
    final: last,
  }
}

/** Wert einer Bewegung; Transformationen springen bei „Bewegung reduzieren“ ans Ziel (wie `MotionConfig reducedMotion`). */
export const tv = (f: Frame, track: Track, start: number, transform = true) => (f.still && transform ? track.final : track.at(f.t - start))

// ───────────────────────────── Transformationen ─────────────────────────────

/** Transformation einer Gruppe wie bei SVG/CSS: translate → rotate → skewX → scale, um `origin`. */
export interface Xform {
  x?: number
  y?: number
  /** Grad. */
  rotate?: number
  /** Grad. */
  skewX?: number
  scaleX?: number
  scaleY?: number
  origin?: Pt
}

const isIdentity = (xf: Xform) =>
  !xf.x && !xf.y && !xf.rotate && !xf.skewX && (xf.scaleX ?? 1) === 1 && (xf.scaleY ?? 1) === 1

/** Zeichnet `draw` mit der Transformation; bewegte Transformationen zählen als `motion` (Bilder dann nicht pixelgenau). */
export function withXform(f: Frame, xf: Xform, draw: () => void) {
  if (isIdentity(xf)) return draw()
  const { ctx } = f
  const o = xf.origin ?? { x: 0, y: 0 }
  ctx.save()
  ctx.translate(o.x + (xf.x ?? 0), o.y + (xf.y ?? 0))
  if (xf.rotate) ctx.rotate((xf.rotate * Math.PI) / 180)
  if (xf.skewX) ctx.transform(1, 0, Math.tan((xf.skewX * Math.PI) / 180), 1, 0, 0)
  if ((xf.scaleX ?? 1) !== 1 || (xf.scaleY ?? 1) !== 1) ctx.scale(xf.scaleX ?? 1, xf.scaleY ?? 1)
  ctx.translate(-o.x, -o.y)
  f.motion++
  try {
    draw()
  } finally {
    f.motion--
    ctx.restore()
  }
}

/** Dauer-Animation auf eine Gruppe anwenden: Transformation und Deckkraft. */
export function withLoop(f: Frame, values: LoopValues, origin: Pt | undefined, draw: () => void) {
  const { opacity, strokeDashoffset: _, ...xf } = values
  withOpacity(f, opacity ?? 1, () => withXform(f, { ...xf, origin }, draw))
}

/** Deckkraft für einzelne Flächen (multipliziert, wie verschachtelte SVG-Gruppen bei nicht überlappenden Kindern). */
export function withOpacity(f: Frame, alpha: number, draw: () => void) {
  if (alpha >= 0.999) return draw()
  if (alpha <= 0.001) return
  const { ctx } = f
  const before = ctx.globalAlpha
  ctx.globalAlpha = before * alpha
  try {
    draw()
  } finally {
    ctx.globalAlpha = before
  }
}

// ───────────────────────────── Gruppen-Deckkraft ─────────────────────────────

/** Zwischenebenen in Größe der Zeichenfläche: Eine Gruppe wird erst ganz gezeichnet, dann mit Deckkraft übertragen. */
export class LayerPool {
  private free: { canvas: HTMLCanvasElement; ctx: Ctx }[] = []
  private w = 0
  private h = 0

  resize(w: number, h: number) {
    if (w === this.w && h === this.h) return
    this.w = w
    this.h = h
    for (const l of this.free) {
      l.canvas.width = 0
      l.canvas.height = 0
    }
    this.free = []
  }

  /** Ebene ausleihen; `r` = Bereich (Bildpunkte), der leer sein muss. */
  acquire(r: { x: number; y: number; w: number; h: number }) {
    const layer = this.free.pop() ?? this.create()
    layer.ctx.setTransform(1, 0, 0, 1, 0, 0)
    layer.ctx.globalAlpha = 1
    layer.ctx.clearRect(r.x, r.y, r.w, r.h)
    return layer
  }

  release(layer: { canvas: HTMLCanvasElement; ctx: Ctx }) {
    if (layer.canvas.width === this.w && layer.canvas.height === this.h) this.free.push(layer)
  }

  private create() {
    const canvas = document.createElement('canvas')
    canvas.width = this.w
    canvas.height = this.h
    return { canvas, ctx: canvas.getContext('2d')! }
  }
}

/**
 * Deckkraft für eine ganze Gruppe wie SVG `<g opacity>`: Überlappende Teile scheinen nicht durcheinander durch.
 * Dafür wird die Gruppe in eine Zwischenebene gezeichnet – nur nötig, solange sie halb durchsichtig ist.
 * `bounds` (Weltkoordinaten, aktuelle Transformation): Nur dieser Bereich wird geleert und übertragen.
 */
export function withGroupOpacity(f: Frame, alpha: number, draw: () => void, bounds?: Rect) {
  if (alpha >= 0.999) return draw()
  if (alpha <= 0.001) return
  const main = f.ctx
  const { width, height } = main.canvas
  const r = bounds ? deviceRect(main.getTransform(), bounds, width, height) : { x: 0, y: 0, w: width, h: height }
  if (r.w <= 0 || r.h <= 0) return
  const layer = f.layers.acquire(r)
  layer.ctx.setTransform(main.getTransform())
  f.ctx = layer.ctx
  try {
    draw()
  } finally {
    f.ctx = main
  }
  main.save()
  main.setTransform(1, 0, 0, 1, 0, 0)
  main.globalAlpha *= alpha
  main.drawImage(layer.canvas, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h)
  main.restore()
  f.layers.release(layer)
}

/** Weltrechteck → umschließendes Bildpunkt-Rechteck auf der Zeichenfläche (beschnitten). */
function deviceRect(m: DOMMatrix, b: Rect, width: number, height: number) {
  const corners = [
    [b.x0, b.y0],
    [b.x1, b.y0],
    [b.x1, b.y1],
    [b.x0, b.y1],
  ].map(([x, y]) => ({ x: m.a * x! + m.c * y! + m.e, y: m.b * x! + m.d * y! + m.f }))
  const x0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.x))))
  const y0 = Math.max(0, Math.floor(Math.min(...corners.map((p) => p.y))))
  const x1 = Math.min(width, Math.ceil(Math.max(...corners.map((p) => p.x))))
  const y1 = Math.min(height, Math.ceil(Math.max(...corners.map((p) => p.y))))
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
