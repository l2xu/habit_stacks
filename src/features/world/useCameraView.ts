import { cancelFrame, frame, type MotionValue } from 'framer-motion'
import { useLayoutEffect, useRef, type RefObject } from 'react'
import { create } from 'zustand'
import { viewBoxOf, type Camera } from './camera'
import type { Rect } from './worldLayout'

/** Dev-Schalter zum Vergleichen auf dem Gerät: aus = die Kamera setzt jedes Frame die viewBox. Nur im Speicher. */
export const useCameraTransform = create<{ on: boolean }>(() => ({ on: true }))

/** So lange nach der letzten Kamerabewegung wird wieder scharf gezeichnet (ms). */
const SETTLE_MS = 100
/** Rand um den eingefrorenen Ausschnitt (Anteil der Bühne) – Gummiband und Abweichungen vom Ziel. */
const PAD = 0.15
/** Höchstens so viel Fläche (Vielfaches der Bühne) hat die eingefrorene Welt; größere Ausschnitte werden gröber. */
const MAX_AREA = 4

const viewOf = (cam: Camera, w: number, h: number): Rect => ({
  x0: cam.x - w / 2 / cam.s,
  y0: cam.y - h / 2 / cam.s,
  x1: cam.x + w / 2 / cam.s,
  y1: cam.y + h / 2 / cam.s,
})

const inside = (a: Rect, b: Rect) => a.x0 >= b.x0 && a.y0 >= b.y0 && a.x1 <= b.x1 && a.y1 <= b.y1

interface CameraView {
  /** Kamerawerte; jede Änderung zeichnet neu. */
  values: MotionValue<number>[]
  /** Aktuelle Kamera aus den Werten. */
  read: () => Camera
  /** Kameras, die die laufende Fahrt noch erreichen kann (Ziel, Wischbereich) – kommen mit ins eingefrorene Bild. */
  cover: () => Camera[]
  w: number
  h: number
}

/**
 * Kamera → SVG, ohne React-Render pro Frame. In Ruhe zeigt die viewBox genau die Bühne. Während einer Fahrt
 * bleibt die viewBox stehen (Ausschnitt um Start und Ziel) und die Kamera bewegt das SVG per CSS-Transform –
 * der Browser rechnet die Welt dann nicht jedes Frame neu, sondern schiebt und skaliert das fertige Bild.
 * Beim Zoomen kann es dabei kurz unscharf werden; 100 ms nach der Fahrt wird wieder scharf gezeichnet.
 * `deps`: zusätzliche Auslöser zum Neusetzen (z. B. wenn das SVG erst später montiert wird).
 */
export function useCameraView(svgRef: RefObject<SVGSVGElement | null>, view: CameraView, deps: unknown[]) {
  const enabled = useCameraTransform((s) => s.on)
  const latest = useRef(view)
  latest.current = view
  const { values, w, h } = view

  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    let frozen: { view: Rect; r: number } | null = null
    let timer = 0

    const show = (cam: Camera) => {
      frozen = null
      svg.setAttribute('viewBox', viewBoxOf(cam, w, h))
      svg.style.width = svg.style.height = svg.style.transform = svg.style.willChange = ''
    }
    const freeze = (cam: Camera) => {
      const cams = [cam, ...latest.current.cover()]
      const views = cams.map((c) => viewOf(c, w, h))
      const padX = (PAD * w) / cam.s
      const padY = (PAD * h) / cam.s
      const v: Rect = {
        x0: Math.min(...views.map((r) => r.x0)) - padX,
        y0: Math.min(...views.map((r) => r.y0)) - padY,
        x1: Math.max(...views.map((r) => r.x1)) + padX,
        y1: Math.max(...views.map((r) => r.y1)) + padY,
      }
      const vw = v.x1 - v.x0
      const vh = v.y1 - v.y0
      // Gezeichnet im stärksten Zoom der Fahrt, aber nie größer als MAX_AREA Bühnen.
      const r = Math.min(Math.max(...cams.map((c) => c.s)), Math.sqrt((MAX_AREA * w * h) / (vw * vh)))
      frozen = { view: v, r }
      svg.setAttribute('viewBox', `${v.x0} ${v.y0} ${vw} ${vh}`)
      svg.style.width = `${vw * r}px`
      svg.style.height = `${vh * r}px`
      svg.style.willChange = 'transform'
    }
    const apply = () => {
      const cam = latest.current.read()
      if (!enabled) return show(cam)
      if (!frozen || !inside(viewOf(cam, w, h), frozen.view)) freeze(cam)
      const { view: v, r } = frozen!
      svg.style.transform = `translate(${(v.x0 - cam.x) * cam.s + w / 2}px, ${(v.y0 - cam.y) * cam.s + h / 2}px) scale(${cam.s / r})`
      window.clearTimeout(timer)
      timer = window.setTimeout(() => show(latest.current.read()), SETTLE_MS)
    }

    svg.style.transformOrigin = '0 0'
    show(latest.current.read())
    const schedule = () => frame.render(apply)
    const offs = values.map((v) => v.on('change', schedule))
    return () => {
      offs.forEach((off) => off())
      cancelFrame(apply)
      window.clearTimeout(timer)
    }
  }, [svgRef, ...values, w, h, enabled, ...deps])
}
