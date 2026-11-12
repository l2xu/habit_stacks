import type { MotionValue } from 'framer-motion'
import { useEffect } from 'react'

/** So lange nach der letzten Kamerabewegung gilt die Kamera als ruhig (ms). */
const SETTLE_MS = 150

let moving = 0

/** Fährt gerade eine Kamera? Für Arbeit, die eine Fahrt nicht stören soll (`StaticGround`). */
export const cameraMoving = () => moving > 0

/** Meldet, solange sich einer der Kamerawerte ändert (Fahrt, Wischen, bis 150 ms Ruhe), an `cameraMoving`. */
export function useCameraMoving(...values: MotionValue<number>[]) {
  useEffect(() => {
    let active = false
    let last = 0
    let timer = 0
    const stop = () => {
      if (!active) return
      active = false
      moving--
    }
    const settle = () => {
      const quiet = performance.now() - last
      if (quiet < SETTLE_MS) {
        timer = window.setTimeout(settle, SETTLE_MS - quiet)
        return
      }
      stop()
    }
    const onMove = () => {
      last = performance.now()
      if (active) return
      active = true
      moving++
      timer = window.setTimeout(settle, SETTLE_MS)
    }
    const offs = values.map((v) => v.on('change', onMove))
    return () => {
      offs.forEach((off) => off())
      window.clearTimeout(timer)
      stop()
    }
  }, values)
}
