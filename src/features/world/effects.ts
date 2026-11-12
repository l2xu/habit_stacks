import type { BlockVM, ID } from '@/domain/types'
import { boxGeometry, type BoxGeometry } from './iso'
import { blockHalf, blockHeight, type TowerLayout } from './towerLayout'

/**
 * Einmalige Animation für ein Ereignis aus der Regel-Engine (Neuigkeiten-Queue).
 * level: Ebene, auf der der verlorene Block stand.
 */
export type TowerEffect =
  | { key: string; kind: 'fall' | 'break'; block: BlockVM; level: number }
  | { key: string; kind: 'solidify' | 'crumble'; habitId: ID }
  /** Einsturz: Alle Blöcke über dem Anker fallen gemeinsam (von unten nach oben, `level` ab 1). */
  | { key: string; kind: 'collapse'; blocks: BlockVM[] }

/** Sekunden, bis die Kamera den Turm ins Bild gefahren hat – dann beginnt die Animation. */
export const EFFECT_START = 0.5

/** Ein verlorener Block steht für die Animation noch einmal an seinem alten Platz. */
export interface LostSlot {
  level: number
  block: BlockVM
  geo: BoxGeometry
  /** Die Blöcke darüber stehen so viel höher (px) und rutschen bei `settleAt` (s) nach. */
  lift: number
  settleAt: number
}

/** Wo der verlorene Block eines Fall-/Bruch-Effekts stand; null bei anderen Effekten. */
export function lostSlot(effect: TowerEffect | null | undefined, layout: TowerLayout, ox: number, oy: number): LostSlot | null {
  if (!effect || !('block' in effect)) return null
  const level = Math.min(effect.level, layout.blocks.length)
  const block = { ...effect.block, level }
  const z0 = layout.blocks[level]?.z0 ?? layout.height
  const geo = boxGeometry(ox, oy, blockHalf(level), z0, blockHeight(block))
  return { level, block, geo, lift: geo.height, settleAt: EFFECT_START + (effect.kind === 'fall' ? 1.75 : 1.3) }
}

/** Einsturz: die eingestürzten Blöcke noch einmal an ihren alten Plätzen über dem heutigen Turm. */
export function collapseSlots(blocks: BlockVM[], layout: TowerLayout, ox: number, oy: number): { block: BlockVM; geo: BoxGeometry }[] {
  let z0 = layout.height
  return blocks.map((block) => {
    const geo = boxGeometry(ox, oy, blockHalf(block.level), z0, blockHeight(block))
    z0 += geo.height
    return { block, geo }
  })
}

/** Ids der Blöcke, die gerade als Neuigkeit verloren gehen – sie landen erst danach auf dem Schutthaufen. */
export function effectLostIds(effect: TowerEffect | null | undefined): ID[] {
  if (!effect) return []
  if (effect.kind === 'collapse') return effect.blocks.map((b) => b.id)
  return 'block' in effect ? [effect.block.id] : []
}

/** Zusätzliche Höhe (px) über dem Turm, die die Kamera während des Effekts im Bild halten muss. */
export function effectHeadroom(effect: TowerEffect | null | undefined): number {
  if (effect?.kind === 'collapse') return effect.blocks.reduce((sum, b) => sum + blockHeight(b), 0)
  return effect && 'block' in effect ? blockHeight(effect.block) : 0
}
