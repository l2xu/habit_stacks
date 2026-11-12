import type { BlockVM, TowerVM } from '@/domain/types'
import { boxGeometry, project, type BoxGeometry } from './iso'

export const blockHalf = (level: number) => (level === 0 ? 1.5 : Math.max(1.1, 1.5 - level * 0.12))
export const blockHeight = (b: BlockVM) => (b.level === 0 ? 68 : b.visual === 'forming' ? 56 : 50)

export interface TowerLayout {
  /** z0 = Unterkante des Blocks in Weltpixeln (für die Kamera im Fokus-Modus). */
  blocks: { block: BlockVM; geo: BoxGeometry; z0: number }[]
  /** Oberste Bildschirm-y-Koordinate des Turms (Spitze des obersten Blocks). */
  topY: number
  /** Gesamthöhe in Weltpixeln. */
  height: number
}

/**
 * Stapelt die Blöcke eines Turms; Weltursprung (ox, oy) ist die Mitte der Anker-Grundfläche.
 * `prev`: frühere Lage desselben Turms am selben Ursprung – unveränderte Blöcke auf gleicher Höhe behalten ihren
 * Eintrag (samt Geometrie), damit `VoxelBlock` (memo) nicht neu rendert.
 */
export function layoutTower(tower: TowerVM, ox: number, oy: number, prev?: TowerLayout): TowerLayout {
  let z = 0
  const blocks = tower.blocks.map((block, i) => {
    const z0 = z
    const old = prev?.blocks[i]
    const entry = old?.block === block && old.z0 === z0 ? old : { block, geo: boxGeometry(ox, oy, blockHalf(block.level), z0, blockHeight(block)), z0 }
    z += entry.geo.height
    return entry
  })
  const top = blocks.at(-1)?.geo.N1 ?? project(ox, oy)
  return { blocks, topY: top.y, height: z }
}
