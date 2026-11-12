import type { BlockColor } from '@/domain/types'
import { IsoBox } from './IsoBox'
import { boxGeometry } from './iso'
import { BLOCK_PALETTE } from './palette'

const GEO = boxGeometry(0, 0, 0.62, 0, 22)

/** Mini-Voxelwürfel in Blockfarbe – für Dock, Fokus-Sheet und Ketten-Anzeige. */
export function BlockThumb({ color, size = 48, className = '' }: { color: BlockColor; size?: number; className?: string }) {
  return (
    <svg viewBox="-32 -42 64 64" width={size} height={size} aria-hidden className={`shrink-0 ${className}`}>
      <IsoBox geo={GEO} palette={BLOCK_PALETTE[color]} />
    </svg>
  )
}
