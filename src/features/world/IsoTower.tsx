import { motion } from 'framer-motion'
import { Fragment, memo, type KeyboardEvent, type ReactNode } from 'react'
import type { ID } from '@/domain/types'
import { useLongPress } from '@/hooks/useLongPress'
import { PauseLoops } from '@/ui/Loop'
import { lostSlot, type TowerEffect } from './effects'
import { fadeAway } from './fadeAway'
import { project, toPoints } from './iso'
import { WORLD } from './palette'
import { LostBlockEffect, TowerEffectLayer } from './TowerEffects'
import { VoxelBlock } from './VoxelBlock'
import { dropDelay, type PlacedTower } from './worldLayout'

interface IsoTowerProps {
  placed: PlacedTower
  /** Detailansicht eines anderen Turms: ausgeblendet und nicht antippbar. */
  hidden: boolean
  onOpen: (id: ID) => void
  /** Gedrückt halten (oder Rechtsklick) → Turm bearbeiten. */
  onEdit: (id: ID) => void
  /** Ereignis-Animation (Neuigkeiten), z. B. Block fällt ab. */
  effect?: TowerEffect | null
  /** false: Blöcke stehen sofort, ohne Fall-Animation (Fokus-Modus). */
  dropIn?: boolean
  /** Fokus-Modus: ergänzt die Darstellung eines Blocks (Markierung, Haken, Timer-Licht). */
  renderBlock?: (index: number, block: ReactNode) => ReactNode
}

/** Grundfläche des Ankers, ringsum um `pad` Welteinheiten erweitert: Kontaktschatten (0,18) und Fokusrahmen (0,55). */
export const towerRing = (ox: number, oy: number, pad: number) => [
  project(ox - 1.5 - pad, oy - 1.5 - pad),
  project(ox + 1.5 + pad, oy - 1.5 - pad),
  project(ox + 1.5 + pad, oy + 1.5 + pad),
  project(ox - 1.5 - pad, oy + 1.5 + pad),
]

/** Bedienhinweis eines Turms für Screenreader. */
export function towerLabel(tower: PlacedTower['tower']) {
  const n = tower.blocks.length
  const status = tower.pausedSince ? ', pausiert' : tower.atRisk ? ', heute retten' : tower.nextBlock ? '' : ', heute erledigt'
  return `${tower.name}: ${n} ${n === 1 ? 'Block' : 'Blöcke'}${status}. Gedrückt halten zum Bearbeiten.`
}

/**
 * Ein Turm auf der Insel. Name und Status stehen als HTML-Schild darüber (`TowerTag`).
 * Ausgeblendet stehen seine Dauer-Animationen still.
 */
export const IsoTower = memo(function IsoTower({ placed, hidden, onOpen, onEdit, effect, dropIn = true, renderBlock }: IsoTowerProps) {
  const { tower, layout, ox, oy, index } = placed
  const press = useLongPress(() => onEdit(tower.id))
  const ring = (pad: number) => toPoints(towerRing(ox, oy, pad))

  const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen(tower.id)
    }
  }


  // Ein verlorener Block steht während seiner Animation noch einmal an seinem Platz; die Blöcke darüber
  // stehen so lange höher und rutschen danach nach. Variante = Effekt-Schlüssel, damit jeder Effekt neu startet.
  const slot = lostSlot(effect, layout, ox, oy)
  const variant = slot && effect ? effect.key : 'rest'
  const settle = slot
    ? {
        y: [-slot.lift, -slot.lift, 0],
        transition: { duration: slot.settleAt + 0.3, times: [0, slot.settleAt / (slot.settleAt + 0.3), 1], ease: 'easeIn' as const },
      }
    : { y: 0 }

  return (
    <motion.g
      role="button"
      tabIndex={hidden ? -1 : 0}
      aria-hidden={hidden || undefined}
      aria-label={towerLabel(tower)}
      className="tower-hit cursor-pointer outline-none"
      style={{ pointerEvents: hidden ? 'none' : undefined }}
      {...fadeAway(hidden)}
      onClick={() => {
        if (!press.fired()) onOpen(tower.id)
      }}
      onKeyDown={onKeyDown}
      {...press.handlers}
    >
      {/* Kontaktschatten + Fokusrahmen (nur bei Tastaturfokus sichtbar) */}
      <polygon points={ring(0.18)} fill="#000" opacity={0.09} />
      <polygon points={ring(0.55)} fill="none" stroke={WORLD.ink} strokeWidth={2} strokeDasharray="5 4" className="tower-ring" opacity={0} />

      {/* Pausiert: Der Turm steht still – auch Wackeln und Bröckeln ruhen. */}
      <PauseLoops paused={hidden || !!tower.pausedSince}>
        <motion.g whileTap={{ scaleY: 0.96 }} style={{ originY: 1 }}>
          {layout.blocks.map(({ block, geo }, i) => {
            const voxel = (
              <VoxelBlock block={block} geo={geo} delay={dropDelay(index, block.level)} dropIn={dropIn} carrying={i < layout.blocks.length - 1} />
            )
            return (
              <Fragment key={block.id}>
                {slot && effect && i === slot.level && <LostBlockEffect effect={effect} slot={slot} top={false} />}
                <motion.g variants={{ [variant]: slot && i >= slot.level ? settle : { y: 0 }, rest: { y: 0 } }} animate={variant}>
                  {renderBlock ? renderBlock(i, voxel) : voxel}
                </motion.g>
              </Fragment>
            )
          })}
          {slot && effect && slot.level >= layout.blocks.length && <LostBlockEffect effect={effect} slot={slot} top />}
          {effect && <TowerEffectLayer effect={effect} layout={layout} ox={ox} oy={oy} />}
        </motion.g>
      </PauseLoops>
    </motion.g>
  )
})
