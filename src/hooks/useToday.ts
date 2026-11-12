import { useEffect, useState } from 'react'
import { currentDay } from '@/domain/dates'
import type { ISODate } from '@/domain/types'
import { useAppStore } from '@/store/useAppStore'

/** Aktueller Kalendertag; springt um, wenn die App über die Tagesgrenze offen bleibt oder zurückkehrt. */
export function useToday(): ISODate {
  const hour = useAppStore((s) => s.settings.dayStartsAtHour)
  const offset = useAppStore((s) => s.settings.devDayOffset ?? 0)
  const [today, setToday] = useState(() => currentDay(hour, offset))

  useEffect(() => {
    const update = () => setToday(currentDay(hour, offset))
    update()
    const id = window.setInterval(update, 60_000)
    document.addEventListener('visibilitychange', update)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', update)
    }
  }, [hour, offset])

  return today
}
