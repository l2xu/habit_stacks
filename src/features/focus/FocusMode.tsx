import { motion, useMotionValue, useSpring } from 'framer-motion'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { timerElapsedSec, timerIsUp } from '@/domain/focus'
import type { FocusSession } from '@/domain/types'
import { HeightRuler } from '@/features/home/HeightRuler'
import { zoneForAlt } from '@/features/world/altitude'
import { layoutTower } from '@/features/world/towerLayout'
import { baseAltOf } from '@/features/world/worldLayout'
import { useElementSize } from '@/hooks/useElementSize'
import { useNow } from '@/hooks/useNow'
import { useToday } from '@/hooks/useToday'
import { playFeedback } from '@/lib/feedback'
import { useTowerVMs } from '@/store/selectors'
import { useAppStore } from '@/store/useAppStore'
import { PixelButton } from '@/ui/PixelButton'
import { PixelIcon } from '@/ui/PixelIcon'
import { CLOSE } from '@/ui/sprites'
import { FocusScene } from './FocusScene'
import { FocusSheet } from './FocusSheet'

const CAMERA = { stiffness: 70, damping: 17 }
/** Kamerahöhe ruht ab 0,2 Weltpixeln – sonst zeichnet sie für unsichtbare Reste noch lange jedes Frame neu (wie WorldStage). */
const CAMERA_Z = { ...CAMERA, restDelta: 0.2, restSpeed: 2 }

/**
 * Fokus-Modus als Overlay über dem Home-Screen. Oben dieselbe Insel samt Himmel, deren Kamera
 * am Turm zum aktiven Block hochfährt; unten das Sheet mit Checkbox bzw. Timer.
 */
export function FocusMode({ session }: { session: FocusSession }) {
  const today = useToday()
  const towers = useTowerVMs(today)
  const index = towers.findIndex((t) => t.id === session.towerId)
  const tower = towers[index]
  const settings = useAppStore((s) => s.settings)
  const actions = useAppStore(
    useShallow((s) => ({
      completeStep: s.completeStep,
      skipStep: s.skipStep,
      startTimer: s.startTimer,
      pauseTimer: s.pauseTimer,
      closeFocus: s.closeFocus,
      showToast: s.showToast,
    })),
  )

  const [rootRef, root] = useElementSize<HTMLDivElement>('border')
  const [barRef, bar] = useElementSize<HTMLDivElement>('border')
  const [sheetRef, sheet] = useElementSize<HTMLDivElement>('border')
  const layout = useMemo(() => (tower ? layoutTower(tower, 0, 0) : null), [tower])

  const completed = session.state === 'completed'
  const step = completed ? undefined : session.steps[session.activeIndex]
  const active = completed ? undefined : layout?.blocks[session.activeIndex]
  const now = useNow(step?.timer?.runningSince ? 250 : null)

  // ── Kamera ──
  const sceneTop = bar.height
  const sceneBottom = root.height - sheet.height
  const anchorY = sceneTop + (sceneBottom - sceneTop) * 0.55
  const focusZoom = Math.min(1.5, Math.max(1.15, root.width / 300))
  const fitZoom = layout ? Math.min(focusZoom, (sceneBottom - sceneTop - 70) / (layout.height + 180)) : 1
  const targetZ = completed ? (layout?.height ?? 0) / 2 : active ? active.z0 + active.geo.height / 2 : 0
  // Start etwa wie die Detailansicht (ganzer Turm), dann fährt die Kamera zum aktiven Block.
  const cameraZ = useSpring((layout?.height ?? 0) / 2, CAMERA_Z)
  const zoom = useSpring(1, CAMERA)
  const targetZoom = completed ? fitZoom : focusZoom
  useEffect(() => {
    cameraZ.set(targetZ)
    zoom.set(targetZoom)
  }, [cameraZ, zoom, targetZ, targetZoom])
  const target = useMemo(() => ({ z: targetZ, zoom: targetZoom }), [targetZ, targetZoom])

  // ── Timer: Licht im Block (ohne die Szene neu zu rendern), bei Ablauf anhalten und Signal geben ──
  const charge = useMotionValue(0)
  const chargeNow = step?.timer ? Math.min(1, timerElapsedSec(step.timer, now) / step.timer.durationSec) : 0
  // Vor dem Zeichnen: Der nächste Timer-Block soll nie kurz den Stand des vorigen zeigen.
  useLayoutEffect(() => {
    charge.set(chargeNow)
  }, [charge, chargeNow])
  const timeUp = !!step?.timer?.runningSince && timerIsUp(step.timer, now)
  useEffect(() => {
    if (!timeUp) return
    actions.pauseTimer()
    playFeedback('timeUp', settings)
  }, [timeUp, actions, settings])

  useEffect(() => {
    if (completed) playFeedback('routine', settings)
  }, [completed, settings])

  // ── Aktionen ──
  const isLastOpen = session.steps.every((s, i) => i === session.activeIndex || s.status !== 'pending')
  const complete = useCallback(() => {
    actions.completeStep()
    if (!isLastOpen) playFeedback('step', settings)
  }, [actions, isLastOpen, settings])
  const skip = useCallback(() => {
    actions.skipStep()
    playFeedback('skip', settings)
  }, [actions, settings])

  const wasAtRisk = useRef(tower?.atRisk ?? false)
  const close = () => {
    actions.closeFocus()
    if (wasAtRisk.current && tower && !tower.atRisk) actions.showToast(`${tower.name} ist gerettet!`)
  }

  if (!tower || !layout) return null
  // Am Ende zählt, wie hoch der ganze Turm reicht
  const baseAlt = baseAltOf(index)
  const zone = zoneForAlt((completed ? layout.height : targetZ) + baseAlt)

  return (
    <motion.div
      ref={rootRef}
      className="absolute inset-0 z-40 overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: 0.25, delay: 0.1 } }}
      transition={{ duration: 0.3 }}
    >
      {root.width > 0 && (
        <FocusScene
          towers={towers}
          session={session}
          charge={step?.timer ? charge : null}
          width={root.width}
          height={root.height}
          anchorY={anchorY}
          cameraZ={cameraZ}
          zoom={zoom}
          target={target}
        />
      )}

      <div
        ref={barRef}
        className="absolute inset-x-0 top-0 z-20 flex items-center justify-between gap-2 px-3 pt-[calc(var(--safe-top)+12px)] pb-2"
      >
        <h1 className="px-frame truncate px-3 py-1.5 text-[16px] font-semibold">{tower.name}</h1>
        <div className="flex shrink-0 items-center gap-2">
          <motion.span
            key={zone.id}
            initial={{ y: -6, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="px-frame px-2.5 py-1.5 text-[14px]"
          >
            Höhe: {zone.label}
          </motion.span>
          <PixelButton aria-label="Fokus-Modus schließen" onClick={close} className="size-10">
            <PixelIcon sprite={CLOSE} px={2} />
          </PixelButton>
        </div>
      </div>

      <HeightRuler
        level={completed ? tower.blocks.length : session.activeIndex + 1}
        baseAlt={baseAlt}
        className="right-2"
        style={{ top: bar.height + 6, bottom: sheet.height + 8 }}
      />

      <motion.div
        ref={sheetRef}
        className="absolute inset-x-0 bottom-0 z-30"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      >
        <FocusSheet
          tower={tower}
          session={session}
          now={now}
          onComplete={complete}
          onSkip={skip}
          onStartTimer={actions.startTimer}
          onPauseTimer={actions.pauseTimer}
          onClose={close}
        />
      </motion.div>
    </motion.div>
  )
}
