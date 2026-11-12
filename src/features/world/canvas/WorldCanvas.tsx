import { cancelFrame, frame, type MotionValue } from 'framer-motion'
import { useImperativeHandle, useLayoutEffect, useMemo, useRef, useState, type Ref } from 'react'
import type { FocusSession, ID } from '@/domain/types'
import { useLoopsPaused } from '@/ui/Loop'
import type { Camera } from '../camera'
import { effectLostIds, type TowerEffect } from '../effects'
import type { Pt } from '../iso'
import { groundPlanFor, pileKeyOf, type Above } from '../groundPlan'
import { towerLabel } from '../IsoTower'
import { rubbleLabel } from '../Rubble'
import { islandFor, type PlacedTower } from '../worldLayout'
import { FocusOverlay } from './focus'
import { drawPicture, FRAME_BUDGET, sweepPictures, watchFonts } from './picture'
import { LayerPool, type Frame } from './runtime'
import { boatDrawer, decorDrawer, groundPicture, seaDrawer, shapesPicture, shimmerDrawer, skyBackdrop, skyLifeDrawer, waterfallDrawer, type Drawer } from './scenery'
import { RubbleSprite, TowerSprite } from './towers'

/** So lange nach der letzten Kamerabewegung gilt die Kamera als ruhig – dann wird pixelgenau nachgezeichnet (ms). */
const SETTLE_MS = 120

export type WorldHit = { kind: 'tower' | 'rubble'; id: ID }

export interface WorldCanvasHandle {
  /** Was liegt unter dem Bildschirmpunkt (vorderstes zuerst)? */
  hit: (clientX: number, clientY: number) => WorldHit | null
  /** Gedrückter Turm staucht sich leicht; null = losgelassen. */
  press: (id: ID | null) => void
}

interface WorldCanvasProps {
  placed: PlacedTower[]
  /** Detailansicht: nur dieser Turm (und sein Schutthaufen) bleibt sichtbar. */
  openId: ID | null
  effect?: { towerId: ID; effect: TowerEffect } | null
  /** false: alles steht sofort, ohne Fall-Animation (Fokus-Modus). */
  dropIn?: boolean
  /** Fokus-Modus: Markierungen am geöffneten Turm. */
  focus?: { session: FocusSession; charge: MotionValue<number> | null } | null
  /** Kamera in diesem Frame (Feder-Werte). */
  camera: () => Camera
  width: number
  height: number
  /** Tastatur und Screenreader: ein unsichtbarer Knopf je Turm bzw. Schutthaufen. Ohne = keine Knöpfe. */
  onOpen?: (id: ID) => void
  onRubble?: (towerId: ID) => void
  /** Name der Welt für Screenreader (ohne Knöpfe). */
  label?: string
  ref?: Ref<WorldCanvasHandle>
}

/**
 * Die Insel als Canvas: Himmel, Meer, Insel, Deko, Türme, Schutthaufen und Effekte zeichnet eine eigene Schleife
 * (einmal pro Frame, im Takt von Framer Motion – Kamerafedern sind dann schon aktualisiert). Was still steht, liegt
 * als fertiges Bild bereit (`picture.ts`), deshalb kostet ein Frame kaum mehr, wenn die Türme wachsen.
 */
export function WorldCanvas({ placed, openId, effect = null, dropIn = true, focus = null, camera, width, height, onOpen, onRubble, label, ref }: WorldCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const paused = useLoopsPaused()
  const [renderer] = useState(() => new WorldRenderer())
  const cameraRef = useRef(camera)
  cameraRef.current = camera

  // Szene, Türme und Effekte nachziehen – vor dem Zeichnen, damit Erscheinen und Effekte im richtigen Frame beginnen.
  useLayoutEffect(() => {
    renderer.update({ placed, openId, effect, dropIn, focus }, performance.now())
  }, [renderer, placed, openId, effect, dropIn, focus])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !width || !height) return
    renderer.attach(canvas, width, height, () => cameraRef.current())
    renderer.draw(performance.now())
    if (paused) return
    const tick = ({ timestamp }: { timestamp: number }) => renderer.draw(timestamp)
    frame.render(tick, true)
    return () => cancelFrame(tick)
  }, [renderer, width, height, paused])

  useLayoutEffect(() => {
    watchFonts(() => renderer.draw(performance.now()))
  }, [renderer])

  useImperativeHandle(ref, () => ({ hit: (x, y) => renderer.hit(x, y), press: (id) => renderer.press(id, performance.now()) }), [renderer])

  const buttons = useMemo(
    () =>
      onOpen || onRubble
        ? placed.flatMap((p) => {
            const hidden = openId !== null && openId !== p.tower.id
            if (hidden) return []
            const list: { key: string; kind: WorldHit['kind']; id: ID; label: string }[] = [{ key: p.tower.id, kind: 'tower', id: p.tower.id, label: towerLabel(p.tower) }]
            if (p.tower.lost.length) list.push({ key: `r-${p.tower.id}`, kind: 'rubble', id: p.tower.id, label: rubbleLabel(p.tower.name, p.tower.lost.length) })
            return list
          })
        : [],
    [placed, openId, onOpen, onRubble],
  )

  return (
    <>
      <canvas ref={canvasRef} className="absolute inset-0 block" style={{ width, height }} role="img" aria-label={label} aria-hidden={label ? undefined : true} />
      {buttons.length > 0 && (
        <div role="group" aria-label="Deine Habit-Türme" className="sr-only">
          {buttons.map((b) => (
            <button
              key={b.key}
              type="button"
              aria-label={b.label}
              onClick={() => (b.kind === 'tower' ? onOpen?.(b.id) : onRubble?.(b.id))}
              onFocus={(e) => renderer.focus({ kind: b.kind, id: b.id }, e.currentTarget.matches(':focus-visible'))}
              onBlur={() => renderer.focus(null, false)}
            />
          ))}
        </div>
      )}
    </>
  )
}

interface SceneInput {
  placed: PlacedTower[]
  openId: ID | null
  effect: { towerId: ID; effect: TowerEffect } | null
  dropIn: boolean
  focus: { session: FocusSession; charge: MotionValue<number> | null } | null
}

/** Stiller Rahmen der Welt (hängt nur an Turmanzahl und Schutthaufen) – geteilt von Startseite und Fokus-Modus. */
interface Scenery {
  key: string
  back: Drawer[]
  ground: ReturnType<typeof groundPicture>
  above: { piece: Above; draw: Drawer }[]
  boat: Drawer
}

const sceneries = new Map<string, Scenery>()

function sceneryFor(count: number, pileKey: string): Scenery {
  const key = `${count}|${pileKey}`
  const hit = sceneries.get(key)
  if (hit) return hit
  const island = islandFor(count)
  const plan = groundPlanFor(count, pileKey)
  const shimmer = shimmerDrawer(island)
  const above = plan.above.map((piece): { piece: Above; draw: Drawer } => {
    switch (piece.kind) {
      case 'shapes': {
        const pic = shapesPicture(piece.shapes)
        return { piece, draw: (f) => drawPicture(f, pic) }
      }
      case 'fall':
        return { piece, draw: waterfallDrawer(piece.fall) }
      case 'shimmer':
        return { piece, draw: shimmer }
      case 'decor':
        return { piece, draw: decorDrawer(piece.item, piece.part) }
      default:
        // Türme und Schutthaufen zeichnet der Renderer selbst (sie haben Zustand).
        return { piece, draw: () => {} }
    }
  })
  const scenery: Scenery = {
    key,
    back: [skyBackdrop(island), seaDrawer(island), skyLifeDrawer(island)],
    ground: groundPicture(plan.still.shapes, plan.still.decor),
    above,
    boat: boatDrawer(island),
  }
  if (sceneries.size > 4) sceneries.clear()
  sceneries.set(key, scenery)
  return scenery
}

const reducedMotion = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null

class WorldRenderer {
  private canvas: HTMLCanvasElement | null = null
  private ctx: CanvasRenderingContext2D | null = null
  private w = 0
  private h = 0
  private dpr = 1
  private camera: () => Camera = () => ({ x: 0, y: 0, s: 1 })
  private input: SceneInput = { placed: [], openId: null, effect: null, dropIn: true, focus: null }
  private scenery: Scenery | null = null
  private towers = new Map<ID, TowerSprite>()
  private rubble = new Map<ID, RubbleSprite>()
  private overlay: FocusOverlay | null = null
  private layers = new LayerPool()
  private lastCam: Camera | null = null
  private lastMove = -Infinity

  attach(canvas: HTMLCanvasElement, w: number, h: number, camera: () => Camera) {
    this.canvas = canvas
    this.ctx = canvas.getContext('2d')
    this.camera = camera
    this.w = w
    this.h = h
    this.dpr = Math.min(3, window.devicePixelRatio || 1)
    const W = Math.round(w * this.dpr)
    const H = Math.round(h * this.dpr)
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W
      canvas.height = H
    }
    this.layers.resize(W, H)
  }

  update(input: SceneInput, now: number) {
    this.input = input
    const { placed, openId, effect, dropIn, focus } = input
    this.scenery = sceneryFor(placed.length, pileKeyOf(placed))
    const seen = new Set<ID>()
    for (const p of placed) {
      const id = p.tower.id
      seen.add(id)
      const hidden = openId !== null && openId !== id
      const fx = effect?.towerId === id ? effect.effect : null
      const tower = this.towers.get(id)
      if (tower) tower.update(p, hidden, fx, dropIn, now)
      else this.towers.set(id, new TowerSprite(p, hidden, dropIn, now))
      // Blöcke, die gerade als Neuigkeit abfallen oder zerspringen, landen erst danach auf dem Haufen.
      const hiddenIds = fx ? effectLostIds(fx) : undefined
      const pile = this.rubble.get(id)
      if (pile) pile.update(p, hidden, hiddenIds?.length ? hiddenIds : undefined, dropIn, now)
      else if (p.tower.lost.length) this.rubble.set(id, new RubbleSprite(p, hidden, hiddenIds?.length ? hiddenIds : undefined, dropIn, now))
    }
    for (const id of this.towers.keys()) if (!seen.has(id)) this.towers.delete(id)
    for (const id of this.rubble.keys()) if (!seen.has(id)) this.rubble.delete(id)
    if (focus) {
      if (this.overlay) this.overlay.update(focus.session, focus.charge, now)
      else this.overlay = new FocusOverlay(focus.session, focus.charge, now)
    } else {
      this.overlay = null
    }
  }

  draw(t: number) {
    const { ctx, canvas, scenery } = this
    if (!ctx || !canvas || !scenery || !this.w) return
    const cam = this.camera()
    const last = this.lastCam
    if (!last || last.x !== cam.x || last.y !== cam.y || last.s !== cam.s) this.lastMove = t
    this.lastCam = cam

    const s = cam.s * this.dpr
    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.globalAlpha = 1
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.setTransform(s, 0, 0, s, canvas.width / 2 - cam.x * s, canvas.height / 2 - cam.y * s)
    const halfW = this.w / 2 / cam.s
    const halfH = this.h / 2 / cam.s
    const f: Frame = {
      ctx,
      t,
      still: reducedMotion?.matches ?? false,
      settled: t - this.lastMove > SETTLE_MS,
      motion: 0,
      budget: FRAME_BUDGET,
      view: { x0: cam.x - halfW, y0: cam.y - halfH, x1: cam.x + halfW, y1: cam.y + halfH },
      layers: this.layers,
    }

    for (const draw of scenery.back) draw(f)
    drawPicture(f, scenery.ground)
    const { placed, openId } = this.input
    for (const { piece, draw } of scenery.above) {
      if (piece.kind === 'tower') {
        const p = placed[piece.index]
        if (p) this.towers.get(p.tower.id)?.draw(f, p.tower.id === openId ? this.overlay : null)
      } else if (piece.kind === 'rubble') {
        const p = placed[piece.index]
        if (p) this.rubble.get(p.tower.id)?.draw(f)
      } else {
        draw(f)
      }
    }
    scenery.boat(f)
    this.overlay?.drawAfter(f, placed.find((p) => p.tower.id === openId))

    for (const tower of this.towers.values()) tower.tick(t)
    sweepPictures(t)
  }

  /** Bildschirmpunkt → Weltpunkt der aktuellen Kamera. */
  private toWorld(clientX: number, clientY: number): Pt | null {
    if (!this.canvas) return null
    const r = this.canvas.getBoundingClientRect()
    const cam = this.camera()
    return { x: cam.x + (clientX - r.left - this.w / 2) / cam.s, y: cam.y + (clientY - r.top - this.h / 2) / cam.s }
  }

  hit(clientX: number, clientY: number): WorldHit | null {
    const p = this.toWorld(clientX, clientY)
    if (!p || !this.scenery) return null
    const t = performance.now()
    const { placed } = this.input
    // Vorderstes zuerst – wie bei übereinander gezeichneten SVG-Elementen.
    for (const { piece } of [...this.scenery.above].reverse()) {
      if (piece.kind !== 'tower' && piece.kind !== 'rubble') continue
      const id = placed[piece.index]?.tower.id
      // Ausgeblendet (Detailansicht eines anderen Turms): nicht antippbar.
      if (!id || (this.input.openId !== null && this.input.openId !== id)) continue
      const sprite = piece.kind === 'tower' ? this.towers.get(id) : this.rubble.get(id)
      if (sprite?.visibleAt(t) && sprite.hit(p)) return { kind: piece.kind, id }
    }
    return null
  }

  press(id: ID | null, now: number) {
    for (const [key, tower] of this.towers) tower.setPressed(key === id, now)
  }

  /** Tastaturfokus auf einem Turm oder Schutthaufen: Fokusrahmen zeichnen (nur bei sichtbarem Fokus). */
  focus(target: WorldHit | null, visible: boolean) {
    const on = visible ? target : null
    for (const [id, tower] of this.towers) tower.focused = on?.kind === 'tower' && on.id === id
    for (const [id, pile] of this.rubble) pile.focused = on?.kind === 'rubble' && on.id === id
  }
}
