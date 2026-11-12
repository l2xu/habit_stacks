import { useSpring } from 'framer-motion'
import { useCallback, useEffect, useMemo, useRef, type MouseEvent, type PointerEvent } from 'react'
import type { ID, TowerVM } from '@/domain/types'
import { clamp, fitFrame, MAX_ZOOM, rubberBand, type Camera, type CameraFit, type Stage } from '@/features/world/camera'
import { useCameraMoving } from '@/features/world/cameraMoving'
import { useCameraView } from '@/features/world/useCameraView'
import { IsoWorld } from '@/features/world/IsoWorld'
import { useWorldCanvas, WorldCanvas, type WorldCanvasHandle, type WorldHit } from '@/features/world/canvas/WorldCanvas'
import { useLongPress } from '@/hooks/useLongPress'
import { effectHeadroom, type TowerEffect } from '@/features/world/effects'
import { overviewFrame, placeTowers, STEP, towerFrame, type PlacedTower } from '@/features/world/worldLayout'
import { project } from '@/features/world/iso'
import { useElementSize } from '@/hooks/useElementSize'
import { TowerTag } from './TowerTag'

const CAMERA = { stiffness: 110, damping: 22 }
/**
 * x/y ruhen ab 0,2 Weltpixeln (bei Zoom 1,6 gut 0,3 px). useSpring rechnet sonst bis auf 0,001 genau und
 * zeichnet dafür fast eine Sekunde lang jedes Frame die ganze Welt neu. Der Zoom behält seine feinere Schwelle.
 */
const CAMERA_POS = { ...CAMERA, restDelta: 0.2, restSpeed: 2 }
const OVERVIEW_ZOOM = { min: 0.46, max: 1.1 }
const DETAIL_ZOOM = { min: 0.4, max: MAX_ZOOM }
/** Bildschirm-px über der Turmspitze für das schwebende Plus (HTML, wächst nicht mit dem Zoom). */
const PLUS_ROOM = 40
/** Ab hier gilt eine Bewegung als Wischen (px) bzw. als Schnippen (px/ms). */
const DRAG_START = 10
const SWIPE = 56
const FLICK = 0.5
/** Abstand benachbarter Türme in Bildschirm-Weltpixeln. */
const TOWER_GAP = project(STEP.x, STEP.y).x

interface WorldStageProps {
  towers: TowerVM[]
  /** Detailansicht dieses Turms; null = Übersicht. */
  openId: ID | null
  /** Turm, den die Übersicht zeigt, falls nicht alle hineinpassen (zuletzt geöffnet). */
  homeId: ID | null
  /** Von Kopfzeile bzw. Dock überdeckte Bereiche (px). */
  insets: { top: number; bottom: number }
  effect: { towerId: ID; effect: TowerEffect } | null
  onOpen: (id: ID) => void
  onEdit: (id: ID) => void
  onRubble: (id: ID) => void
  /** Plus über dem geöffneten Turm: neuen Block stapeln (fehlt, solange eine Neuigkeit offen ist). */
  onStack?: (id: ID) => void
  /** Wischen in der Detailansicht: 1 = zum Turm rechts, −1 = links. */
  onSwipe: (dir: 1 | -1) => void
}

const overviewFit = (placed: PlacedTower[], stage: Stage) =>
  fitFrame(overviewFrame(placed), stage, OVERVIEW_ZOOM.min, OVERVIEW_ZOOM.max, 0.5)

const overviewZoom = (placed: PlacedTower[], size: { width: number; height: number }, insets: WorldStageProps['insets']) =>
  placed.length && size.width ? overviewFit(placed, { w: size.width, h: size.height, ...insets }).cam.s : 1

/** Geschätzte Maße der Namensschilder in px (Geist Pixel 12 px + Rahmen), siehe TowerTag. */
const TAG = { lineH: 13, oneLineH: 38, maxW: 170 }
const nameWidth = (p: PlacedTower) => p.tower.name.length * 5.8 + (p.tower.atRisk || !p.tower.nextBlock ? 34 : 20)

/**
 * Namensschilder dürfen so breit wie ihr Name sein. Nur wenn sie das Schild eines Nachbarturms
 * berühren würden, werden sie auf den Turmabstand begrenzt und brechen um (und werden dabei höher).
 */
function fitTagWidths(placed: PlacedTower[], s: number): number[] {
  const d = TOWER_GAP * s
  const limit = Math.max(80, d - 6)
  const widths = placed.map(() => TAG.maxW)
  // Zwei Durchgänge: Ein umbrechender Name macht sein Schild höher und kann so neu anstoßen.
  for (let pass = 0; pass < 2; pass++) {
    const boxes = placed.map((p, i) => {
      const w = Math.min(nameWidth(p), widths[i]!)
      const h = TAG.oneLineH + (nameWidth(p) > w ? TAG.lineH : 0)
      const bottom = p.layout.topY * s
      return { w, y0: bottom - h, y1: bottom }
    })
    boxes.forEach((me, i) => {
      const crowded = [boxes[i - 1], boxes[i + 1]].some((q) => q && me.y0 < q.y1 && q.y0 < me.y1 && (me.w + q.w) / 2 > d - 4)
      if (crowded) widths[i] = limit
    })
  }
  return widths
}

interface Drag {
  x0: number
  y0: number
  cam0: number
  active: boolean
  lastX: number
  lastT: number
  /** Geschwindigkeit in px/ms (geglättet). */
  v: number
}

/**
 * Die Insel als Bühne mit Kamera. Übersicht: alle Türme mit Namensschild, seitlich wischbar,
 * wenn sie nicht hineinpassen. Detail: die Kamera fährt per Feder auf einen Turm, die anderen
 * blenden aus; Wischen wechselt zum Nachbarn. Gezeichnet wird die Welt als Canvas (`WorldCanvas`, liest die Kamera
 * jedes Frame); zum Vergleich per DevTools als SVG (die Kamera schreibt dann direkt ins DOM, `useCameraView`).
 */
export function WorldStage({ towers, openId, homeId, insets, effect, onOpen, onEdit, onRubble, onStack, onSwipe }: WorldStageProps) {
  const [ref, size] = useElementSize<HTMLDivElement>()
  const canvasOn = useWorldCanvas((s) => s.on)
  const svgRef = useRef<SVGSVGElement>(null)
  const worldRef = useRef<WorldCanvasHandle>(null)
  /** Canvas: was beim Drücken getroffen wurde – für Halten (Bearbeiten). */
  const pressHit = useRef<WorldHit | null>(null)
  const longPress = useLongPress(() => {
    const hit = pressHit.current
    if (hit?.kind === 'tower') onEdit(hit.id)
  })
  const placed = useMemo(() => placeTowers(towers), [towers])
  const open = placed.find((p) => p.tower.id === openId) ?? null

  // Während einer Neuigkeit stehen verlorene Blöcke noch einmal über dem Turm – die müssen ins Bild.
  const headroom = open && effect?.towerId === open.tower.id ? effectHeadroom(effect.effect) : 0
  // Ein neuer Block passt drauf → Plus über der Spitze; nicht bei Warnung, Pause oder laufendem Effekt.
  const plus = !!open && !!onStack && open.tower.stackable && !open.tower.atRisk && !open.tower.pausedSince && effect?.towerId !== open.tower.id
  const fit: CameraFit | null = useMemo(() => {
    if (!size.width || !placed.length) return null
    const stage = { w: size.width, h: size.height, ...insets, top: insets.top + (plus ? PLUS_ROOM : 0) }
    return open ? fitFrame(towerFrame(open, headroom), stage, DETAIL_ZOOM.min, DETAIL_ZOOM.max) : overviewFit(placed, stage)
  }, [size.width, size.height, insets, open, placed, headroom, plus])

  const cx = useSpring(0, CAMERA_POS)
  const cy = useSpring(0, CAMERA_POS)
  const cs = useSpring(1, CAMERA)
  useCameraMoving(cx, cy, cs)
  const placedCamera = useRef(false)
  /** Wohin die Kamerafedern gerade fahren. */
  const target = useRef<Camera | null>(null)
  /** Übersicht: vom Nutzer verschobene Kamera; null = auf den zuletzt geöffneten Turm. */
  const pan = useRef<number | null>(null)
  const drag = useRef<Drag | null>(null)
  const swallowClick = useRef(false)

  // ── Zielkamera ──
  const home = placed.find((p) => p.tower.id === homeId)?.base.x
  useEffect(() => {
    if (!fit) return
    if (open) pan.current = null
    const x = open ? fit.cam.x : clamp(pan.current ?? home ?? fit.cam.x, fit.minX, fit.maxX)
    target.current = { ...fit.cam, x }
    if (!placedCamera.current) {
      placedCamera.current = true
      cx.jump(x)
      cy.jump(fit.cam.y)
      cs.jump(fit.cam.s)
      return
    }
    cx.set(x)
    cy.set(fit.cam.y)
    cs.set(fit.cam.s)
  }, [fit, open, home, cx, cy, cs])

  const readCamera = useCallback(() => ({ x: cx.get(), y: cy.get(), s: cs.get() }), [cx, cy, cs])

  // ── Kamera → SVG, einmal pro Frame, auch wenn sich x, y und Zoom ändern (nur SVG-Welt) ──
  useCameraView(
    svgRef,
    {
      values: [cx, cy, cs],
      read: () => ({ x: cx.get(), y: cy.get(), s: cs.get() }),
      // Ziel der Fahrt; in der Übersicht der ganze Wischbereich.
      cover: () => {
        const t = target.current
        if (!t || !fit) return []
        return open ? [t] : [t, { ...t, x: fit.minX }, { ...t, x: fit.maxX }]
      },
      w: size.width,
      h: size.height,
    },
    [fit, canvasOn],
  )

  // ── Wischen: Übersicht verschieben bzw. in der Detailansicht zum Nachbarn ──
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    swallowClick.current = false
    if (canvasOn) {
      // Canvas: Turm unter dem Finger staucht sich und lässt sich gedrückt halten.
      const hit = worldRef.current?.hit(e.clientX, e.clientY) ?? null
      pressHit.current = hit
      if (hit?.kind === 'tower') {
        if (e.button === 0) worldRef.current?.press(hit.id)
        longPress.handlers.onPointerDown(e)
      }
    }
    if (e.button !== 0 || !fit) return
    drag.current = { x0: e.clientX, y0: e.clientY, cam0: cx.get(), active: false, lastX: e.clientX, lastT: e.timeStamp, v: 0 }
  }
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current
    // Maus über einem Turm (Canvas): Zeiger wie über einem Knopf.
    if (canvasOn && !d && e.pointerType === 'mouse') e.currentTarget.style.cursor = worldRef.current?.hit(e.clientX, e.clientY) ? 'pointer' : ''
    if (!d || !fit) return
    const dx = e.clientX - d.x0
    if (!d.active) {
      if (Math.abs(dx) < DRAG_START || Math.abs(dx) < Math.abs(e.clientY - d.y0)) return
      d.active = true
      e.currentTarget.setPointerCapture(e.pointerId)
      worldRef.current?.press(null)
    }
    const dt = e.timeStamp - d.lastT
    if (dt > 0) d.v = 0.7 * ((e.clientX - d.lastX) / dt) + 0.3 * d.v
    d.lastX = e.clientX
    d.lastT = e.timeStamp
    const lo = open ? fit.cam.x : fit.minX
    const hi = open ? fit.cam.x : fit.maxX
    cx.jump(rubberBand(d.cam0 - dx / cs.get(), lo, hi))
  }
  const endDrag = (e: PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = drag.current
    drag.current = null
    worldRef.current?.press(null)
    if (!d?.active || !fit) return
    swallowClick.current = true
    const dx = e.clientX - d.x0
    if (open) {
      if (!cancelled && (Math.abs(dx) > SWIPE || Math.abs(d.v) > FLICK)) onSwipe(dx < 0 ? 1 : -1)
      // Gibt es keinen Nachbarn, federt die Kamera zurück; sonst überschreibt ihn das neue Ziel.
      cx.set(fit.cam.x)
    } else {
      const x = clamp(cx.get() - (cancelled ? 0 : (d.v * 260) / cs.get()), fit.minX, fit.maxX)
      pan.current = x
      if (target.current) target.current = { ...target.current, x }
      cx.set(x)
    }
  }

  const tagWidths = useMemo(() => fitTagWidths(placed, overviewZoom(placed, size, insets)), [placed, size, insets])

  // ── Canvas: Antippen öffnet Turm bzw. Schutthaufen, Rechtsklick bearbeitet ──
  const onClick = (e: MouseEvent<HTMLDivElement>) => {
    // Nur Klicks auf die Welt selbst – nicht auf Schilder, Plus oder die unsichtbaren Knöpfe.
    if (!canvasOn || !(e.target instanceof HTMLCanvasElement)) return
    const hit = worldRef.current?.hit(e.clientX, e.clientY)
    if (!hit || longPress.fired()) return
    if (hit.kind === 'tower') onOpen(hit.id)
    else onRubble(hit.id)
  }
  const onContextMenu = (e: MouseEvent<HTMLDivElement>) => {
    if (!canvasOn) return
    const hit = worldRef.current?.hit(e.clientX, e.clientY) ?? null
    if (hit?.kind !== 'tower') return
    pressHit.current = hit
    longPress.handlers.onContextMenu(e)
  }

  return (
    <div
      ref={ref}
      className="absolute inset-0 touch-none overflow-hidden [-webkit-touch-callout:none]"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endDrag(e, false)}
      onPointerCancel={(e) => endDrag(e, true)}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onClickCapture={(e) => {
        // Nach dem Wischen keinen Turm "antippen".
        if (!swallowClick.current) return
        swallowClick.current = false
        e.stopPropagation()
      }}
    >
      {fit && (
        <>
          {canvasOn ? (
            <WorldCanvas
              ref={worldRef}
              placed={placed}
              openId={openId}
              effect={effect}
              camera={readCamera}
              width={size.width}
              height={size.height}
              onOpen={onOpen}
              onRubble={onRubble}
            />
          ) : (
            <svg ref={svgRef} width={size.width} height={size.height} className="absolute inset-0 block">
              <IsoWorld placed={placed} openId={openId} onOpen={onOpen} onEdit={onEdit} effect={effect} onRubble={onRubble} />
            </svg>
          )}
          {placed.map((p) => (
            <TowerTag
              key={p.tower.id}
              placed={p}
              cx={cx}
              cy={cy}
              cs={cs}
              w={size.width}
              h={size.height}
              mode={!open ? 'overview' : open === p ? 'open' : 'hidden'}
              maxWidth={tagWidths[p.index]!}
              onStack={plus && open === p ? () => onStack?.(p.tower.id) : undefined}
            />
          ))}
        </>
      )}
    </div>
  )
}
