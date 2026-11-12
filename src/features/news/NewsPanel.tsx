import { motion } from 'framer-motion'
import { useEffect, type ReactNode } from 'react'
import type { TowerEffect } from '@/features/world/effects'
import type { Sfx } from '@/lib/feedback'
import { sfx } from '@/store/sfx'
import { PixelButton } from '@/ui/PixelButton'
import { PixelIcon } from '@/ui/PixelIcon'
import { TROPHY, WARN } from '@/ui/sprites'
import type { NewsItem, NewsTone } from './news'

const TONE: Record<NewsTone, { frame: string; icon: ReactNode }> = {
  good: { frame: 'px-moss', icon: <PixelIcon sprite={TROPHY} px={3} /> },
  warn: { frame: 'px-gold', icon: <PixelIcon sprite={WARN} px={3} /> },
  bad: { frame: 'px-blush', icon: <PixelIcon sprite={WARN} px={3} colors={{ y: '#d48a6c' }} /> },
}

interface NewsPanelProps {
  item: NewsItem
  index: number
  total: number
  onNext: () => void
  onSkipAll: () => void
}

/** Ton zur Animation am Turm, zeitlich passend (ms nach dem Einblenden). */
const EFFECT_SOUND: Record<TowerEffect['kind'], [Sfx, number]> = {
  fall: ['fall', 1650],
  collapse: ['fall', 1400],
  break: ['break', 1500],
  solidify: ['solidify', 500],
  crumble: ['warn', 700],
}

/** Was seit dem letzten Öffnen passiert ist – eins nach dem anderen, passend animiert am Turm. */
export function NewsPanel({ item, index, total, onNext, onSkipAll }: NewsPanelProps) {
  const tone = TONE[item.tone]
  const kind = item.effect?.kind
  useEffect(() => {
    const [name, ms] = kind ? EFFECT_SOUND[kind] : (['warn', 250] as const)
    const t = window.setTimeout(() => sfx(name), ms)
    return () => window.clearTimeout(t)
  }, [kind])
  return (
    <motion.section
      key={item.event.id}
      initial={{ y: 18, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 30 }}
      className="px-frame absolute inset-x-3 bottom-[calc(var(--dock-h)+6px)] z-30 p-3"
      role="status"
      aria-live="polite"
    >
      <div className="flex gap-3">
        <div className={`px-frame ${tone.frame} grid size-12 shrink-0 place-items-center`}>{tone.icon}</div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] leading-none font-bold tracking-wide text-ink-soft uppercase">
            Neuigkeit {index} von {total}
          </p>
          <h2 className="mt-1 text-[18px] leading-tight font-semibold">{item.title}</h2>
          <p className="mt-1 text-[14px] leading-snug text-ink-soft">{item.body}</p>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        {index < total ? (
          <button type="button" onClick={onSkipAll} className="cursor-pointer py-1 text-[14px] text-ink-soft underline decoration-2 underline-offset-4 hover:text-ink">
            Alle als gelesen markieren
          </button>
        ) : (
          <span />
        )}
        <PixelButton variant="go" onClick={onNext} className="h-10 shrink-0 px-5 text-[16px] font-semibold text-paper">
          {index < total ? 'Weiter' : 'Verstanden'}
        </PixelButton>
      </div>
    </motion.section>
  )
}
