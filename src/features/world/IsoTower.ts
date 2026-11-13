import { project } from './iso'
import type { PlacedTower } from './worldLayout'

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
