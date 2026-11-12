import { useMemo } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { ID, ISODate, TowerEvent } from '@/domain/types'
import { useAppStore } from '@/store/useAppStore'
import { describeEvent, NEWS_EVENTS, type NewsItem } from './news'

/** Ungesehene Ereignisse: das aktuelle als Neuigkeit, der Rest wartet; stille Ereignisse separat. */
export function useNews(today: ISODate): { current: NewsItem | null; pendingIds: ID[]; silentIds: ID[] } {
  const s = useAppStore(useShallow((st) => ({ events: st.events, towers: st.towers, habits: st.habits, rules: st.rules })))

  return useMemo(() => {
    const unseen = s.events.filter((e) => !e.seenAt)
    // Warnungen sind nur eine Neuigkeit, solange sie noch stimmen – nach Tagen ohne App ist der Block
    // vielleicht schon weg oder wieder sicher.
    const stillTrue = (e: TowerEvent) => {
      switch (e.type) {
        case 'formation_wobbling':
          return (s.habits[e.habitId]?.formation?.missedInRow ?? 0) > 0
        case 'block_crumbling': {
          const h = s.habits[e.habitId]
          return h?.lifecycle === 'solid' && (h.skippedInRow ?? 0) >= s.rules.skip.crumbleAfter
        }
        default:
          return true
      }
    }
    const isNews = (e: TowerEvent) => NEWS_EVENTS.has(e.type) && stillTrue(e)
    const pending = unseen.filter(isNews).sort((a, b) => a.date.localeCompare(b.date))
    const first = pending[0]
    return {
      current: first ? describeEvent(first, s, today) : null,
      pendingIds: pending.map((e) => e.id),
      silentIds: unseen.filter((e) => !isNews(e)).map((e) => e.id),
    }
  }, [s, today])
}
