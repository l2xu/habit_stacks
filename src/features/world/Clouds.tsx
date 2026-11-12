import { IsoBox } from './IsoBox'
import { boxGeometry } from './iso'
import { WORLD } from './palette'

/** Voxel-Wolke aus drei Quadern. */
export function Cloud({ scale = 1 }: { scale?: number }) {
  // Nach Tiefe (x + y) sortiert: hinten zuerst
  const parts = [
    boxGeometry(-0.9, 0.7, 0.6, 0, 9),
    boxGeometry(0, 0, 0.95, 0, 13),
    boxGeometry(0.9, -0.4, 0.75, 0, 18),
  ]
  return (
    <svg viewBox="-70 -40 140 68" width={140 * scale} height={68 * scale} aria-hidden>
      {parts.map((geo, i) => (
        <IsoBox key={i} geo={geo} palette={WORLD.cloud} bevel={false} />
      ))}
    </svg>
  )
}
