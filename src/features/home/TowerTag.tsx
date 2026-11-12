import { AnimatePresence, motion, useTransform, type MotionValue } from 'framer-motion'
import { dropDelay, type PlacedTower } from '@/features/world/worldLayout'
import { useLoop } from '@/ui/Loop'
import { PixelIcon } from '@/ui/PixelIcon'
import { ARROW, CHECK, LOCK, PLUS, WARN } from '@/ui/sprites'

interface TowerTagProps {
  placed: PlacedTower
  cx: MotionValue<number>
  cy: MotionValue<number>
  cs: MotionValue<number>
  w: number
  h: number
  /** overview: Namensschild mit Höhe und Status; open: nur „Heute retten!“; hidden: nichts. */
  mode: 'overview' | 'open' | 'hidden'
  /** Platz bis zum Nachbarschild in Bühnen-Pixeln – längere Namen brechen um. */
  maxWidth: number
  /** open: Ein neuer Block passt drauf → schwebendes Plus über der Spitze, öffnet „Neuer Block“. */
  onStack?: () => void
}

const fade = { initial: { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 6 }, transition: { duration: 0.25 } }

/** Sanftes Auf und Ab des Plus über der Turmspitze. */
const BOB = { values: { y: [0, -5, 0] }, duration: 1.8 }

/**
 * Schild über einem Turm. Als HTML statt SVG, damit es bei jedem Zoom gleich groß und scharf
 * bleibt; die Position folgt der Kamera ohne React-Render pro Frame.
 * Status: ✓ + grün = heute erledigt, ⚠ + rötlich = bröckelt oder ein Geist wackelt, Schloss = pausiert.
 * In der Detailansicht schwebt stattdessen ein Plus über dem Turm, solange ein neuer Block draufpasst.
 */
export function TowerTag({ placed, cx, cy, cs, w, h, mode, maxWidth, onStack }: TowerTagProps) {
  const { tower, base, layout } = placed
  const x = useTransform([cx, cs], ([camX, s]: number[]) => (base.x - camX!) * s! + w / 2)
  const y = useTransform([cy, cs], ([camY, s]: number[]) => (layout.topY - camY!) * s! + h / 2 - 22)
  // Pausiert gibt es keinen nächsten Block – deshalb ist der Turm noch lange nicht erledigt.
  const done = !tower.pausedSince && tower.nextBlock === null
  const n = tower.blocks.length
  const frame = tower.atRisk ? 'px-blush' : done ? 'px-moss' : ''

  return (
    <motion.div
      className="pointer-events-none absolute top-0 left-0 z-10"
      style={{ x, y }}
      // Das Schild erscheint erst, wenn der Turm darunter gelandet ist.
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, delay: dropDelay(placed.index, n) + 0.15 }}
    >
      <div className="flex -translate-x-1/2 -translate-y-full flex-col items-center">
        <AnimatePresence initial={false} mode="popLayout">
          {mode === 'overview' && (
            <motion.span
              key="name"
              aria-hidden
              className={`px-frame ${frame} flex flex-col items-center gap-[3px] px-2 pt-1 pb-[5px] text-center [--px:2px]`}
              style={{ maxWidth }}
              {...fade}
            >
              <span className="flex items-center gap-1.5 text-[12px] leading-[1.1] font-semibold">
                {tower.pausedSince ? (
                  <PixelIcon sprite={LOCK} px={1} className="shrink-0" />
                ) : tower.atRisk ? (
                  <PixelIcon sprite={WARN} px={1} className="shrink-0" />
                ) : (
                  done && <PixelIcon sprite={CHECK} px={1} className="shrink-0" />
                )}
                <span className="break-words hyphens-auto" lang="de">
                  {tower.name}
                </span>
              </span>
              <span className="flex items-center gap-[3px] font-micro text-[9px] leading-none text-ink-soft">
                <PixelIcon sprite={ARROW} px={1} colors={{ X: '#5f695d' }} />
                {n} {n === 1 ? 'Block' : 'Blöcke'}
              </span>
            </motion.span>
          )}
          {mode === 'open' && tower.pausedSince && (
            <motion.span
              key="paused"
              aria-hidden
              className="px-frame flex items-center gap-1.5 px-2.5 pt-1 pb-[5px] text-[13px] leading-none font-semibold whitespace-nowrap [--px:2px]"
              {...fade}
            >
              <PixelIcon sprite={LOCK} px={1.5} />
              Pausiert
            </motion.span>
          )}
          {mode === 'open' && tower.atRisk && (
            <motion.span
              key="crumble"
              aria-hidden
              className="px-frame px-danger px-2.5 pt-1 pb-[5px] text-[13px] leading-none font-semibold whitespace-nowrap text-paper [--px:2px]"
              {...fade}
            >
              Heute retten!
            </motion.span>
          )}
          {mode === 'open' && onStack && (
            <motion.button
              key="stack"
              type="button"
              aria-label={`Neuen Block auf ${tower.name} stapeln`}
              onClick={onStack}
              className="pointer-events-auto -mb-3 grid size-11 place-items-center"
              {...fade}
            >
              <StackPlus />
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  )
}

function StackPlus() {
  const ref = useLoop<HTMLSpanElement>(BOB)
  return (
    <span ref={ref} className="px-frame px-button px-go grid size-7 place-items-center [--px:2px]">
      <PixelIcon sprite={PLUS} px={1} colors={{ X: '#f4f2e8' }} />
    </span>
  )
}
