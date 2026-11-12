import type { ID, TowerVM } from '@/domain/types'
import { project, type Pt } from './iso'
import { buildIsland, SEA_DROP, type Island } from './island'
import { layoutTower, type TowerLayout } from './towerLayout'

/** Versatz zwischen Türmen in Welteinheiten: ~200 px nach rechts, leicht nach hinten. */
export const STEP = { x: 2.9, y: -5.4 }
/** Schutthaufen rechts neben dem Anker, relativ zur Turmmitte. */
export const RUBBLE = { x: 2.25, y: -1.05 }
/** Fall-Animation beim Öffnen: erst wenn sich der Wolkennebel lichtet, dann Turm für Turm, Block für Block (s). */
export const dropDelay = (index: number, level: number) => 0.45 + index * 0.18 + level * 0.12
/** Bis hierhin sind alle Blöcke gelandet (s, ab dem Aufbau der Insel). */
export const dropEnd = (towers: { blocks: unknown[] }[]) =>
  Math.max(0, ...towers.map((t, i) => dropDelay(i, t.blocks.length))) + 0.45

/** Höhe des Turmfußes über der Grundlinie (Weltpixel) – Türme weiter hinten stehen höher im Himmel. */
export const baseAltOf = (index: number) => -project(index * STEP.x, index * STEP.y).y

/** Unter der Insel bleibt in der Übersicht etwas Meer im Bild. */
const SEA_BELOW = 34

export interface PlacedTower {
  tower: TowerVM
  index: number
  /** Weltursprung = Mitte der Anker-Grundfläche. */
  ox: number
  oy: number
  /** Projizierter Ursprung (Bildschirm-Weltkoordinaten bei Zoom 1). */
  base: Pt
  layout: TowerLayout
}

/** Rechteck in Bildschirm-Weltkoordinaten (Zoom 1). */
export interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}

/** Letzter Platz je Turm – Startseite und Fokus-Modus teilen ihn, unveränderte Türme behalten ihr Objekt. */
const lastPlaced = new Map<ID, PlacedTower>()

export function placeTowers(towers: TowerVM[]): PlacedTower[] {
  return towers.map((tower, index) => {
    const prev = lastPlaced.get(tower.id)
    if (prev?.tower === tower && prev.index === index) return prev
    const ox = index * STEP.x
    const oy = index * STEP.y
    const layout = layoutTower(tower, ox, oy, prev?.index === index ? prev.layout : undefined)
    const placed = { tower, index, ox, oy, base: project(ox, oy), layout }
    lastPlaced.set(tower.id, placed)
    return placed
  })
}

/** Die Insel hängt nur von der Zahl der Türme ab (die Positionen folgen aus `STEP`). */
export const islandFor = (count: number): Island =>
  buildIsland(Array.from({ length: Math.max(1, count) }, (_, i) => ({ ox: i * STEP.x, oy: i * STEP.y })))

/** Bildausschnitt eines Turms: Spitze samt Schild bis zur Vorderkante des Ankers; `headroom` = Platz für Effekte darüber. */
export function towerFrame({ base, layout }: PlacedTower, headroom = 0): Rect {
  return { x0: base.x - 120, x1: base.x + 120, y0: layout.topY - 44 - headroom, y1: base.y + 46 }
}

/** Übersicht: alle Türme samt Namensschildern, unten bis knapp unter die Küste. */
export function overviewFrame(placed: PlacedTower[]): Rect {
  return {
    x0: Math.min(...placed.map((p) => p.base.x)) - 96,
    x1: Math.max(...placed.map((p) => p.base.x)) + 96,
    y0: Math.min(...placed.map((p) => p.layout.topY)) - 80,
    y1: islandFor(placed.length).frontY + SEA_DROP + SEA_BELOW,
  }
}
