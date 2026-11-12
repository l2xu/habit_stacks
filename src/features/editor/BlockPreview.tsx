import type { BlockVM } from '@/domain/types'
import { boxGeometry, project, toPoints } from '@/features/world/iso'
import { blockHalf, blockHeight } from '@/features/world/towerLayout'
import { GhostStripes, VoxelBlock } from '@/features/world/VoxelBlock'

/**
 * Live-Vorschau eines Blocks, wie er auf dem Turm stehen wird (Anker, Geist oder verfestigt).
 * Fester Bildausschnitt, damit die Vorschau beim Tippen und Umschalten nicht springt.
 */
export function BlockPreview({ block }: { block: BlockVM }) {
  const half = blockHalf(block.level)
  const geo = boxGeometry(0, 0, half, 0, blockHeight(block))
  const r = half + 0.18

  return (
    <div className="flex justify-center bg-haze py-2" aria-hidden>
      <svg viewBox="-92 -122 184 172" width={150} height={140} className="overflow-visible">
        <GhostStripes />
        {/* Kontaktschatten */}
        <polygon points={toPoints([project(-r, -r), project(r, -r), project(r, r), project(-r, r)])} fill="#000" opacity={0.08} />
        <VoxelBlock block={block} geo={geo} dropIn={false} />
      </svg>
    </div>
  )
}
