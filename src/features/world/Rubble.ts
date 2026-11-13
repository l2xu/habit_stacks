import type { ID, LostBlockVM } from '@/domain/types'
import { boxGeometry, project, type BoxGeometry } from './iso'
import { seededRandom } from './random'

/** Plätze für die Brocken, neuester Verlust zuerst. Platz 3 liegt auf Platz 0. */
const SLOTS = [
  { dx: 0, dy: 0, z: 0, half: 0.34, h: 15 },
  { dx: 0.64, dy: 0.08, z: 0, half: 0.27, h: 11 },
  { dx: -0.06, dy: 0.64, z: 0, half: 0.26, h: 10 },
  { dx: 0.1, dy: 0.08, z: 15, half: 0.22, h: 11 },
  { dx: 0.66, dy: 0.66, z: 0, half: 0.19, h: 7 },
  { dx: -0.56, dy: -0.18, z: 0, half: 0.21, h: 8 },
] as const

/** Brocken des Haufens in Zeichenreihenfolge (die neuesten Verluste liegen oben); `hiddenIds` fehlen noch. */
export function rubblePieces(towerId: ID, lost: LostBlockVM[], x: number, y: number, hiddenIds?: ID[]) {
  const rand = seededRandom(`rubble-${towerId}`)
  return lost
    .filter((l) => !hiddenIds?.includes(l.id))
    .slice(0, SLOTS.length)
    .map((l, i) => {
      const slot = SLOTS[i]!
      // Leichte Unordnung, damit der Haufen nicht gestapelt wirkt.
      const jx = slot.z ? 0 : (rand() - 0.5) * 0.14
      const jy = slot.z ? 0 : (rand() - 0.5) * 0.14
      return { id: l.id, color: l.color, slot, geo: boxGeometry(x + slot.dx + jx, y + slot.dy + jy, slot.half, slot.z, slot.h) }
    })
    .sort((a, b) => a.slot.dx + a.slot.dy + a.slot.z / 100 - (b.slot.dx + b.slot.dy + b.slot.z / 100))
}

/** Riss über die Vorderkante eines Brockens. */
export const rubbleCrack = (geo: BoxGeometry, h: number) => [
  { x: geo.S1.x - 3, y: geo.S1.y + 2 },
  { x: geo.S1.x + 1, y: geo.S1.y + h * 0.45 },
  { x: geo.S1.x - 2, y: geo.S1.y + h * 0.8 },
]

/** Kontaktschatten und Trefferfläche des Haufens. */
export const rubbleRing = (x: number, y: number) => [project(x - 0.75, y - 0.55), project(x + 1.05, y - 0.55), project(x + 1.05, y + 1.05), project(x - 0.75, y + 1.05)]

export const rubbleLabel = (towerName: string, count: number) =>
  `Schutthaufen von ${towerName}: ${count} ${count === 1 ? 'verlorener Block' : 'verlorene Blöcke'}`
