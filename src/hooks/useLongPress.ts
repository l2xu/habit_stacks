import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent } from 'react'

const HOLD_MS = 450
/** Ab dieser Bewegung gilt es als Wischen, nicht als Halten. */
const SLOP = 8

/**
 * Gedrückt halten (Touch, Maus, Stift); auf dem Desktop zusätzlich Rechtsklick.
 * Bewegung, Loslassen und Abbruch werden am window verfolgt – auch wenn ein Elternelement
 * den Zeiger zum Wischen übernimmt. `fired()` sagt dem folgenden Klick, dass er schon verbraucht ist.
 */
export function useLongPress(onLongPress: () => void) {
  const callback = useRef(onLongPress)
  const timer = useRef<number | undefined>(undefined)
  const detach = useRef<(() => void) | null>(null)
  const fired = useRef(false)

  useEffect(() => {
    callback.current = onLongPress
  }, [onLongPress])

  const cancel = useCallback(() => {
    window.clearTimeout(timer.current)
    detach.current?.()
    detach.current = null
  }, [])
  useEffect(() => cancel, [cancel])

  const trigger = useCallback(() => {
    fired.current = true
    cancel()
    callback.current()
  }, [cancel])

  const onPointerDown = useCallback(
    (e: PointerEvent) => {
      fired.current = false
      cancel()
      if (e.button !== 0) return
      const { clientX: x0, clientY: y0 } = e
      const move = (ev: globalThis.PointerEvent) => {
        if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > SLOP) cancel()
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', cancel)
      window.addEventListener('pointercancel', cancel)
      detach.current = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', cancel)
        window.removeEventListener('pointercancel', cancel)
      }
      timer.current = window.setTimeout(trigger, HOLD_MS)
    },
    [cancel, trigger],
  )

  // Android meldet langes Drücken zusätzlich als Kontextmenü – dann nur einmal auslösen.
  const onContextMenu = useCallback(
    (e: MouseEvent) => {
      e.preventDefault()
      if (!fired.current) trigger()
    },
    [trigger],
  )

  const wasFired = useCallback(() => fired.current, [])
  return { handlers: { onPointerDown, onContextMenu }, fired: wasFired }
}
