import type { BlockVM } from '@/domain/types'
import { EFFECT_START as START } from './effects'
import type { BoxGeometry } from './iso'
import { BLOCK_PALETTE } from './palette'
import { seededRandom } from './random'

/** Brocken, die sich beim Bröckeln an beiden sichtbaren Seiten lösen (Start, Flugweg, Größe, Farbe, Verzögerung in s). */
export function crumbleChips(block: BlockVM, geo: BoxGeometry) {
  const rand = seededRandom(`crumble-${block.id}`)
  const pal = BLOCK_PALETTE[block.color]
  return Array.from({ length: 14 }, (_, i) => {
    // Abwechselnd linke (W→S) und rechte Fläche (S→E), aus der unteren Hälfte des Blocks.
    const [a, b] = i % 2 ? [geo.S0, geo.E0] : [geo.W0, geo.S0]
    const t = 0.1 + rand() * 0.8
    return {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t - rand() * geo.height * 0.6,
      dx: (i % 2 ? 1 : -1) * (6 + rand() * 26),
      dy: 70 + rand() * 90,
      size: 3 + Math.round(rand() * 3),
      fill: [pal.top, pal.left, pal.right][Math.floor(rand() * 3)]!,
      delay: START + 0.2 + rand() * 0.9,
    }
  })
}

/** Splitter eines zerspringenden Geists (Start, Flugweg, Drehung, Größe, Farbe). */
export function shatterShards(block: BlockVM, geo: BoxGeometry) {
  const rand = seededRandom(block.id)
  const pal = BLOCK_PALETTE[block.color]
  return Array.from({ length: 16 }, () => ({
    x: geo.W1.x + rand() * (geo.E1.x - geo.W1.x),
    y: geo.N1.y + rand() * (geo.S0.y - geo.N1.y),
    dx: (rand() - 0.5) * 110,
    dy: 140 + rand() * 140,
    rotate: (rand() - 0.5) * 540,
    size: 3 + Math.round(rand() * 4),
    fill: [pal.top, pal.left, pal.right, '#ffffff'][Math.floor(rand() * 4)]!,
  }))
}

/** Richtungen der Pixel-Funken (Bogenmaß). */
export const BURST_RAYS = Array.from({ length: 10 }, (_, i) => (i / 10) * Math.PI * 2)

