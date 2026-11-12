import { useEffect, useState } from 'react'

/** Aktuelle Zeit in ms, tickt im Intervall solange `intervalMs` gesetzt ist (null = angehalten). */
export function useNow(intervalMs: number | null): number {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (intervalMs === null) return
    const tick = () => setNow(Date.now())
    tick()
    const id = window.setInterval(tick, intervalMs)
    document.addEventListener('visibilitychange', tick)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [intervalMs])

  return now
}
