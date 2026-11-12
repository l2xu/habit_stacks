import { AnimatePresence, motion } from 'framer-motion'
import type { TowerVM } from '@/domain/types'
import { PixelButton } from '@/ui/PixelButton'
import { PixelIcon } from '@/ui/PixelIcon'
import { ARROW, GEAR, PENCIL, PLUS } from '@/ui/sprites'

/**
 * Höhe der Kopfzeile (24 px Abstand + 44 px Knöpfe); die Kamera rechnet damit. Der Abstand hält die Knöpfe
 * aus dem Schatten unter der Statusleiste.
 */
export const TOP_BAR_H = 68

interface TopBarProps {
  /** Detailansicht: Zurück, Turmname, Bearbeiten. Ohne Turm: Übersicht mit Zahnrad und Plus. */
  tower: TowerVM | null
  onBack: () => void
  onEdit: () => void
  onSettings: () => void
  onAdd: () => void
}

const swap = {
  initial: { opacity: 0, y: -6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.2 },
}

export function TopBar({ tower, onBack, onEdit, onSettings, onAdd }: TopBarProps) {
  return (
    <header className="relative flex items-end px-4" style={{ height: TOP_BAR_H }}>
      <AnimatePresence mode="wait" initial={false}>
        {tower ? (
          <motion.div key="tower" className="pointer-events-auto flex min-w-0 flex-1 items-center gap-3" {...swap}>
            <PixelButton aria-label="Zur Übersicht" onClick={onBack} className="size-11 shrink-0">
              <PixelIcon sprite={ARROW} px={2} className="-rotate-90" />
            </PixelButton>
            <h1 className="min-w-0 flex-1 truncate text-[24px] leading-none font-bold">{tower.name}</h1>
            <PixelButton aria-label={`${tower.name} bearbeiten`} onClick={onEdit} className="size-11 shrink-0">
              <PixelIcon sprite={PENCIL} px={2} />
            </PixelButton>
          </motion.div>
        ) : (
          <motion.div key="overview" className="flex flex-1 gap-2" {...swap}>
            <h1 className="sr-only">Habit Stacks – deine Türme</h1>
            <PixelButton aria-label="Einstellungen" onClick={onSettings} className="pointer-events-auto ml-auto size-11">
              <PixelIcon sprite={GEAR} px={2} />
            </PixelButton>
            <PixelButton aria-label="Neuen Turm bauen" onClick={onAdd} className="pointer-events-auto size-11">
              <PixelIcon sprite={PLUS} px={2} />
            </PixelButton>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
