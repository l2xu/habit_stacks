import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { PixelIcon } from '@/ui/PixelIcon'
import { CHECK_BIG } from '@/ui/sprites'

/** Große Pixel-Checkbox. Nach dem Abhaken bleibt der Haken kurz stehen, dann geht es weiter. */
export function CheckAction({ onDone }: { onDone: () => void }) {
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    if (!checked) return
    const id = window.setTimeout(onDone, 450)
    return () => window.clearTimeout(id)
  }, [checked, onDone])

  return (
    <button
      type="button"
      onClick={() => setChecked(true)}
      disabled={checked}
      aria-pressed={checked}
      className={`px-frame px-button flex w-full items-center gap-4 p-3 text-left ${checked ? 'px-moss' : ''}`}
    >
      <span className="px-frame px-white grid size-16 shrink-0 place-items-center">
        <AnimatePresence>
          {checked && (
            <motion.span initial={{ scale: 0, rotate: -12 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 700, damping: 16 }}>
              <PixelIcon sprite={CHECK_BIG} px={3.5} />
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <span>
        <span className="block text-[21px] leading-tight font-semibold">{checked ? 'Erledigt!' : 'Abhaken'}</span>
        <span className="block text-[14px] text-ink-soft">{checked ? 'Nächster Block kommt …' : 'Tippen, wenn du es gemacht hast'}</span>
      </span>
    </button>
  )
}
