import type { MotionValue } from 'framer-motion'
import { memo, useMemo } from 'react'
import type { FocusSession, TowerVM } from '@/domain/types'
import { useCameraMoving } from '@/features/world/cameraMoving'
import { WorldCanvas } from '@/features/world/canvas/WorldCanvas'
import { placeTowers } from '@/features/world/worldLayout'

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
}

/**
 * Fokus-Modus: dieselbe Insel samt Himmel wie auf der Startseite – nur die Kamera fährt am Turm hoch.
 * Der aktive Block ist markiert, erledigte rasten mit Squash & Stretch ein (`canvas/focus.ts`). Kamera und Timer-Licht
 * liest die Canvas-Schleife jedes Frame aus den Motion-Werten – kein React-Render pro Frame oder Timer-Tick.
 */
export const FocusScene = memo(function FocusScene({ towers, session, charge, width, height, anchorY, cameraZ, zoom }: FocusSceneProps) {
  const placed = useMemo(() => placeTowers(towers), [towers])
  const me = placed.find((p) => p.tower.id === session.towerId)
  useCameraMoving(cameraZ, zoom)
  const focus = useMemo(() => ({ session, charge }), [session, charge])

  if (!me) return null
  // Kamerahöhe z liegt auf Bildschirm-y = anchorY.
  const cam = (z: number, s: number) => ({ x: me.base.x, y: me.base.y - z + (height / 2 - anchorY) / s, s })

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
})
