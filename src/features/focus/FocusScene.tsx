import { motion, useTransform, type MotionValue } from 'framer-motion'
import { memo, useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import type { FocusSession, FocusStepStatus, TowerVM } from '@/domain/types'
import { useCameraMoving } from '@/features/world/cameraMoving'
import { leftFaceMatrix, rightFaceMatrix, toPoints, type BoxGeometry } from '@/features/world/iso'
import { IsoWorld } from '@/features/world/IsoWorld'
import { WORLD } from '@/features/world/palette'
import { Burst } from '@/features/world/TowerEffects'
import { useCameraView } from '@/features/world/useCameraView'
import { useWorldCanvas, WorldCanvas } from '@/features/world/canvas/WorldCanvas'
import { placeTowers } from '@/features/world/worldLayout'
import { Loop } from '@/ui/Loop'
import { ACTIVE, DONE_BADGE, dustOrigins } from './focusMarks'

const noop = () => {}

interface FocusSceneProps {
  /** Alle Türme der Insel – die anderen sind ausgeblendet, die Welt bleibt dieselbe wie auf der Startseite. */
  towers: TowerVM[]
  session: FocusSession
  /** Timer-Fortschritt des aktiven Blocks (0–1), null bei Checkbox-Habits. Als Motion-Wert: Der Timer tickt, ohne die Szene neu zu rendern. */
  charge: MotionValue<number> | null
  width: number
  height: number
  /** Bildschirm-y, auf der die Kamerahöhe liegt. */
  anchorY: number
  /** Kamerahöhe in Weltpixeln über dem Fuß des Turms. */
  cameraZ: MotionValue<number>
  zoom: MotionValue<number>
  /** Wohin `cameraZ` und `zoom` gerade fahren. */
  target: { z: number; zoom: number }
}

/**
 * Fokus-Modus: dieselbe Insel samt Himmel wie auf der Startseite – nur die Kamera fährt am Turm hoch.
 * Der aktive Block ist markiert, erledigte rasten mit Squash & Stretch ein. Kamera und Timer-Licht schreiben direkt
 * ins DOM (`useCameraView`, Motion-Werte) – kein React-Render pro Frame oder Timer-Tick.
 */
export const FocusScene = memo(function FocusScene({ towers, session, charge, width, height, anchorY, cameraZ, zoom, target }: FocusSceneProps) {
  const placed = useMemo(() => placeTowers(towers), [towers])
  const me = placed.find((p) => p.tower.id === session.towerId)
  const canvasOn = useWorldCanvas((s) => s.on)
  const svgRef = useRef<SVGSVGElement>(null)
  const completed = session.state === 'completed'
  useCameraMoving(cameraZ, zoom)

  // Kamerahöhe z liegt auf Bildschirm-y = anchorY.
  const cam = (z: number, s: number) => ({ x: me?.base.x ?? 0, y: (me?.base.y ?? 0) - z + (height / 2 - anchorY) / s, s })
  useCameraView(
    svgRef,
    { values: [cameraZ, zoom], read: () => cam(cameraZ.get(), zoom.get()), cover: () => [cam(target.z, target.zoom)], w: width, h: height },
    [me, anchorY, canvasOn],
  )
  const focus = useMemo(() => ({ session, charge }), [session, charge])

  const renderBlock = useCallback(
    (i: number, node: ReactNode) => {
      const geo = me?.layout.blocks[i]?.geo
      if (!geo) return node
      const active = !completed && i === session.activeIndex
      return (
        <FocusBlock geo={geo} status={session.steps[i]?.status ?? 'pending'} active={active} charge={active ? charge : null}>
          {node}
        </FocusBlock>
      )
    },
    [me, completed, session, charge],
  )

  if (!me) return null
  const top = me.layout.blocks.at(-1)

  if (canvasOn) {
    return (
      <WorldCanvas
        placed={placed}
        openId={me.tower.id}
        dropIn={false}
        focus={focus}
        camera={() => cam(cameraZ.get(), zoom.get())}
        width={width}
        height={height}
        label={me.tower.name}
      />
    )
  }

  return (
    <svg ref={svgRef} width={width} height={height} className="absolute inset-0 block" aria-label={me.tower.name}>
      <IsoWorld placed={placed} openId={me.tower.id} onOpen={noop} onEdit={noop} onRubble={noop} dropIn={false} renderBlock={renderBlock} />
      {completed && top && <Burst at={top.geo.N1} delay={0.2} />}
    </svg>
  )
})

interface FocusBlockProps {
  geo: BoxGeometry
  status: FocusStepStatus
  active: boolean
  charge: MotionValue<number> | null
  children: ReactNode
}

function FocusBlock({ geo, status, active, charge, children }: FocusBlockProps) {
  // Nur Blöcke, die in dieser Sitzung erledigt werden, bekommen Einrast-Animation und Staubwolke.
  const [initialStatus] = useState(status)
  const done = status === 'done'
  const justDone = done && initialStatus !== 'done'

  return (
    <motion.g
      style={{ originX: 0.5, originY: 1 }}
      initial={false}
      animate={done ? { scaleY: [1, 0.84, 1.07, 1], scaleX: [1, 1.06, 0.98, 1] } : { scaleY: 1, scaleX: 1 }}
      transition={{ duration: 0.45, ease: 'easeOut' }}
    >
      {children}
      {status === 'skipped' && <SkippedCover geo={geo} />}
      {charge && <ChargeOverlay geo={geo} charge={charge} />}
      {active && <ActiveMarker geo={geo} />}
      {done && <DoneBadge geo={geo} pop={justDone} />}
      {justDone && <DustPuff geo={geo} />}
    </motion.g>
  )
}

/** Übersprungen: deckender Dunst über dem Block – bleibt massiv, wirkt aber blass (nicht wie ein Geist). */
function SkippedCover({ geo }: { geo: BoxGeometry }) {
  return (
    <g fill="#e6ebda" opacity={0.62} pointerEvents="none">
      <polygon points={toPoints(geo.left)} />
      <polygon points={toPoints(geo.right)} />
      <polygon points={toPoints(geo.top)} />
    </g>
  )
}

/** Timer füllt den Block von unten nach oben mit Licht; die helle Kante steht auf der Füllhöhe. */
function ChargeOverlay({ geo, charge }: { geo: BoxGeometry; charge: MotionValue<number> }) {
  const fill = useTransform(charge, (v) => Math.min(1, Math.max(0, v)))
  const edgeY = useTransform(fill, (v) => -geo.height * v)
  const edgeOpacity = useTransform(fill, (v) => (v > 0 && v < 1 ? 0.8 : 0))
  return (
    <g pointerEvents="none">
      {[leftFaceMatrix(geo.W1), rightFaceMatrix(geo.S1)].map((m, i) => (
        <g key={i} transform={m}>
          <motion.rect x={0} y={0} width={geo.faceW} height={geo.height} fill="#fff" opacity={0.3} style={{ scaleY: fill, originY: 1 }} />
          <motion.rect x={0} y={geo.height} width={geo.faceW} height={2} fill="#fff" style={{ y: edgeY, opacity: edgeOpacity }} />
        </g>
      ))}
    </g>
  )
}

/** Umlaufende Laufschrift-Kontur + Pfeil links unten am aktiven Block. */
function ActiveMarker({ geo }: { geo: BoxGeometry }) {
  const arrow = ACTIVE.arrowAt(geo)
  return (
    <g pointerEvents="none">
      <polygon points={toPoints(geo.outline)} fill="none" stroke="#fff" strokeWidth={4} strokeLinejoin="round" opacity={0.9} />
      {/* Laufende Kontur: Die Strichlücke wandert einmal um 6 + 5 px weiter */}
      <Loop loop={ACTIVE.march}>
        <polygon points={toPoints(geo.outline)} fill="none" stroke={WORLD.ink} strokeWidth={2} strokeDasharray="6 5" strokeLinejoin="round" />
      </Loop>
      <g transform={`translate(${arrow.x} ${arrow.y})`}>
        <Loop loop={ACTIVE.nudge}>
          <g fill={WORLD.ink} shapeRendering="crispEdges">
            {ACTIVE.arrow.map((r, i) => (
              <rect key={i} x={r.x} y={r.y} width={r.w} height={r.h} />
            ))}
          </g>
        </Loop>
      </g>
    </g>
  )
}

function DoneBadge({ geo, pop }: { geo: BoxGeometry; pop: boolean }) {
  const at = DONE_BADGE.at(geo)
  return (
    <g transform={`translate(${at.x} ${at.y})`} pointerEvents="none">
      <motion.g
        initial={pop ? { scale: 0 } : false}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 600, damping: 14, delay: 0.15 }}
      >
        <rect x={0} y={0} width={15} height={15} fill="#cfdcae" stroke="#3f5a33" strokeWidth={1.5} />
        <g fill="#3f5a33" shapeRendering="crispEdges">
          {DONE_BADGE.check.map((r, i) => (
            <rect key={i} x={r.x} y={r.y} width={2} height={2} />
          ))}
        </g>
      </motion.g>
    </g>
  )
}

/** Kleine Staubwolke an der Unterkante beim Einrasten. */
function DustPuff({ geo }: { geo: BoxGeometry }) {
  return (
    <g pointerEvents="none">
      {dustOrigins(geo).map(({ p, dx }, i) => (
        <g key={i} transform={`translate(${p.x} ${p.y})`}>
          <motion.rect
            width={4}
            height={4}
            fill="#f1f2ea"
            initial={{ x: 0, y: 0, opacity: 0.9 }}
            animate={{ x: dx * 18, y: -10, opacity: 0 }}
            transition={{ duration: 0.55, ease: 'easeOut' }}
          />
        </g>
      ))}
    </g>
  )
}
