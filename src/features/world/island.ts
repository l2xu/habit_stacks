import { project } from './iso'
import { seededRandom } from './random'

/**
 * Insel aus Voxel-Kacheln (1 × 1 Welteinheit): eine runde, gestufte Küste um die Türme,
 * links vorne ein Garten mit Teich, aus dem ein Bach über die Kante ins Meer fällt.
 * Rein und deterministisch pro Turmanzahl – Rendering: IsoIsland und IsoSea.
 */

/** Höhe der Inselkante über dem Meer (px). */
export const SEA_DROP = 16
/** Wasser im Teich und im Bach liegt so viel tiefer als das Gras (px). */
export const WATER_DROP = 4
/** Wie weit hinter der Insel der Horizont liegt (px, Zoom 1). */
const HORIZON_GAP = 46

export interface IslandTile {
  i: number
  j: number
  water: boolean
}

export interface Island {
  /** In Zeichenreihenfolge: hinten → vorne (i + j), dann links → rechts. */
  tiles: IslandTile[]
  at: (i: number, j: number) => IslandTile | undefined
  /** Ausdehnung in Welteinheiten. */
  bounds: { x0: number; x1: number; y0: number; y1: number }
  /** Hinterste und vorderste Bildschirm-y der Inseloberfläche (Zoom 1). */
  backY: number
  frontY: number
  /** Teichmitte (Weltkoordinaten), für Frosch, Schilf und Seerosen. */
  pond: { x: number; y: number }
  /** Wasser-Kachel an der Küste: Ihre Vorderkante (+y) ist der Wasserfall. */
  waterfall: IslandTile | null
}

interface Origin {
  ox: number
  oy: number
}

/** Horizont-y für eine Insel: dahinter beginnt der Himmel. */
export const horizonOf = (island: Island) => island.backY - HORIZON_GAP

/** Einmal je Insel rechnen (Inseln sind je Turmanzahl gecacht) – Startseite und Fokus-Modus teilen sich das Ergebnis. */
export function perIsland<T>(build: (island: Island) => T): (island: Island) => T {
  const memo = new WeakMap<Island, T>()
  return (island) => {
    if (!memo.has(island)) memo.set(island, build(island))
    return memo.get(island) as T
  }
}

const cache = new Map<string, Island>()

/** Insel für Türme an diesen Ursprüngen (Mitte der Anker-Grundfläche). */
export function buildIsland(towers: Origin[]): Island {
  const origins = towers.length ? towers : [{ ox: 0, oy: 0 }]
  const cacheKey = origins.map((t) => `${t.ox},${t.oy}`).join(';')
  const hit = cache.get(cacheKey)
  if (hit) return hit

  const first = origins[0]!
  const last = origins.at(-1)!
  // Teich auf einer Landzunge vor dem ersten Turm – in der Übersicht sichtbar, verdeckt keinen Turm.
  const pond = { x: first.ox + 3.4, y: first.oy + 3.8 }

  // Runde Kleckse: einer pro Turm, einer zwischen zwei Türmen, dazu die Teich-Landzunge
  // und zwei Enden mit Platz für Bäume.
  const blobs: { x: number; y: number; r: number }[] = []
  origins.forEach((t, k) => {
    blobs.push({ x: t.ox + 0.8, y: t.oy + 0.8, r: 4.6 })
    const next = origins[k + 1]
    if (next) blobs.push({ x: (t.ox + next.ox) / 2 + 0.6, y: (t.oy + next.oy) / 2 + 0.6, r: 4.4 })
  })
  blobs.push({ x: pond.x + 0.2, y: pond.y + 0.4, r: 3.2 })
  blobs.push({ x: first.ox - 3.2, y: first.oy + 1.6, r: 2.8 })
  blobs.push({ x: last.ox + 3.8, y: last.oy - 0.4, r: 3.0 })

  const rand = seededRandom(`island-${cacheKey}`)
  const lo = { x: Math.floor(Math.min(...blobs.map((b) => b.x - b.r))) - 1, y: Math.floor(Math.min(...blobs.map((b) => b.y - b.r))) - 1 }
  const hi = { x: Math.ceil(Math.max(...blobs.map((b) => b.x + b.r))) + 1, y: Math.ceil(Math.max(...blobs.map((b) => b.y + b.r))) + 1 }

  const land = new Set<string>()
  const key = (i: number, j: number) => `${i},${j}`
  for (let j = lo.y; j <= hi.y; j++) {
    for (let i = lo.x; i <= hi.x; i++) {
      const cx = i + 0.5
      const cy = j + 0.5
      // Etwas Rauschen macht die gestufte Küste unregelmäßig.
      const edge = Math.min(...blobs.map((b) => Math.hypot(cx - b.x, cy - b.y) - b.r))
      if (edge < (rand() - 0.5) * 0.7) land.add(key(i, j))
    }
  }
  // Einzelne Zacken (weniger als zwei Nachbarn) glätten.
  for (const k of [...land]) {
    const [i, j] = k.split(',').map(Number) as [number, number]
    const n = [key(i + 1, j), key(i - 1, j), key(i, j + 1), key(i, j - 1)].filter((q) => land.has(q)).length
    if (n < 2) land.delete(k)
  }

  // Teich: nur Kacheln, die rundum Land haben – das Wasser berührt die Küste nur über den Bach.
  const water = new Set<string>()
  for (const k of land) {
    const [i, j] = k.split(',').map(Number) as [number, number]
    const inland = [key(i + 1, j), key(i - 1, j), key(i, j + 1), key(i, j - 1)].every((q) => land.has(q))
    if (inland && Math.hypot(i + 0.5 - pond.x, j + 0.5 - pond.y) <= 1.6) water.add(k)
  }
  // Bach: von der vordersten Teich-Kachel in +y-Richtung bis an die Küste.
  const col = Math.floor(pond.x)
  const pondRows = [...water].map((k) => k.split(',').map(Number) as [number, number]).filter(([i]) => i === col)
  let row = Math.max(...pondRows.map(([, y]) => y))
  let fall: string | null = null
  while (pondRows.length && land.has(key(col, row + 1))) {
    row++
    water.add(key(col, row))
    if (!land.has(key(col, row + 1))) fall = key(col, row)
  }

  const tiles = [...land]
    .map((k) => {
      const [i, j] = k.split(',').map(Number) as [number, number]
      return { i, j, water: water.has(k) }
    })
    .sort((a, b) => a.i + a.j - (b.i + b.j) || a.i - b.i)
  const byKey = new Map(tiles.map((t) => [key(t.i, t.j), t]))

  const island: Island = {
    tiles,
    at: (i, j) => byKey.get(key(i, j)),
    bounds: {
      x0: Math.min(...tiles.map((t) => t.i)),
      x1: Math.max(...tiles.map((t) => t.i)) + 1,
      y0: Math.min(...tiles.map((t) => t.j)),
      y1: Math.max(...tiles.map((t) => t.j)) + 1,
    },
    backY: Math.min(...tiles.map((t) => project(t.i, t.j).y)),
    frontY: Math.max(...tiles.map((t) => project(t.i + 1, t.j + 1).y)),
    pond,
    waterfall: fall ? (byKey.get(fall) ?? null) : null,
  }
  cache.set(cacheKey, island)
  return island
}

// ───────────────────────────── Deko ─────────────────────────────

export type DecorItem =
  | { kind: 'tuft'; x: number; y: number; tall: boolean }
  | { kind: 'flower'; x: number; y: number; color: string }
  | { kind: 'stone'; x: number; y: number; half: number }
  | { kind: 'tree'; x: number; y: number; pine: boolean; size: number }
  | { kind: 'bush'; x: number; y: number; size: number; berries: boolean }
  | { kind: 'reed'; x: number; y: number }
  | { kind: 'lily'; x: number; y: number }
  | { kind: 'butterfly'; x: number; y: number; color: string }
  | { kind: 'frog'; x: number; y: number }

const FLOWERS = ['#f3d4cd', '#f2df9e', '#fbfaf3', '#d9d2ea']
const WINGS = ['#fbfaf3', '#f2df9e', '#f3d4cd']

/**
 * Verteilt Bäume, Büsche, Blumen, Steine und Teich-Deko auf der Insel – deterministisch.
 * Türme, Schutthaufen und der Platz vor den Türmen bleiben frei, damit nichts einen Turm verdeckt.
 */
export function scatterDecor(island: Island, towers: Origin[], piles: { x: number; y: number }[] = []): DecorItem[] {
  const rand = seededRandom(`decor-${towers.length}`)
  const items: DecorItem[] = []
  const taken: { x: number; y: number; r: number }[] = piles.map((p) => ({ x: p.x + 0.15, y: p.y + 0.25, r: 1.1 }))

  const tileAt = (x: number, y: number) => island.at(Math.floor(x), Math.floor(y))
  const isLand = (x: number, y: number) => tileAt(x, y)?.water === false
  const inland = (x: number, y: number) =>
    [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ].every(([dx, dy]) => isLand(x + dx!, y + dy!))
  const towerGap = (x: number, y: number) => Math.min(...towers.map((t) => Math.max(Math.abs(x - t.ox), Math.abs(y - t.oy))))
  const free = (x: number, y: number, r: number) => taken.every((q) => Math.hypot(x - q.x, y - q.y) > r + q.r)
  // Steht etwas Hohes knapp vor einem Turm (näher am Betrachter und seitlich überlappend), verdeckt es ihn.
  // 120 px = halbe Ankerbreite (72) + halbe Baumkrone (~36) + Luft.
  const blocksView = (x: number, y: number) =>
    towers.some((t) => x + y > t.ox + t.oy - 1 && x + y - (t.ox + t.oy) < 9 && Math.abs(x - y - (t.ox - t.oy)) * 24 < 120)
  const place = (item: DecorItem, r: number) => {
    items.push(item)
    taken.push({ x: item.x, y: item.y, r })
  }
  const randomPoint = () => {
    const { x0, x1, y0, y1 } = island.bounds
    return { x: x0 + rand() * (x1 - x0), y: y0 + rand() * (y1 - y0) }
  }

  // Trittsteine vor jedem Turm
  for (const t of towers) {
    for (const [dx, dy, half] of [
      [2.15, 1.05, 0.36],
      [1.35, 2.15, 0.3],
    ] as const) {
      if (isLand(t.ox + dx, t.oy + dy)) place({ kind: 'stone', x: t.ox + dx, y: t.oy + dy, half }, 0.4)
    }
  }

  // Teich: Frosch am Ufer, Schilf und Seerosen
  const { x: px, y: py } = island.pond
  for (const [dx, dy] of [
    [-2.0, 0.4],
    [1.9, -0.6],
    [-0.4, -2.0],
  ] as const) {
    if (isLand(px + dx, py + dy) && free(px + dx, py + dy, 0.3)) {
      place({ kind: 'frog', x: px + dx, y: py + dy }, 0.5)
      break
    }
  }
  for (const [dx, dy] of [
    [-1.6, -1.2],
    [-2.0, 0.3],
    [0.6, -2.0],
    [-1.3, 1.6],
  ] as const) {
    if (isLand(px + dx, py + dy) && !blocksView(px + dx, py + dy) && free(px + dx, py + dy, 0.2)) place({ kind: 'reed', x: px + dx, y: py + dy }, 0.35)
  }
  const pondTiles = island.tiles.filter((t) => t.water && Math.hypot(t.i + 0.5 - px, t.j + 0.5 - py) <= 1.6)
  for (const t of pondTiles.slice(1, 3)) items.push({ kind: 'lily', x: t.i + 0.35 + rand() * 0.3, y: t.j + 0.35 + rand() * 0.3 })

  // Bäume: hinter den Lücken zwischen den Türmen und an beiden Enden, dazu ein paar verstreute.
  const first = towers[0]
  const last = towers.at(-1)
  const spots: [number, number][] = towers.slice(1).map((t, k) => [(t.ox + towers[k]!.ox) / 2 - 1.1, (t.oy + towers[k]!.oy) / 2 - 1.1])
  if (first) spots.push([first.ox - 3.0, first.oy + 0.6], [first.ox - 3.4, first.oy + 2.8], [first.ox - 1.6, first.oy - 2.6])
  if (last) spots.push([last.ox + 3.4, last.oy - 1.6], [last.ox + 4.4, last.oy + 0.6], [last.ox + 1.2, last.oy - 3.0])
  for (let k = 0; k < 60; k++) spots.push([randomPoint().x, randomPoint().y])
  let trees = 0
  for (const [x, y] of spots) {
    if (trees >= 4 + towers.length) break
    if (!inland(x, y) || towerGap(x, y) < 2.5 || blocksView(x, y) || !free(x, y, 0.9)) continue
    place({ kind: 'tree', x, y, pine: rand() < 0.4, size: 0.85 + rand() * 0.3 }, 0.9)
    trees++
  }
  // Büsche: niedrig, dürfen auch vorne stehen
  for (let k = 0, bushes = 0; k < 160 && bushes < 3 + towers.length; k++) {
    const { x, y } = randomPoint()
    if (!isLand(x, y) || towerGap(x, y) < 2.3 || !free(x, y, 0.55)) continue
    place({ kind: 'bush', x, y, size: 0.8 + rand() * 0.4, berries: rand() < 0.4 }, 0.55)
    bushes++
  }
  // Gras und Blumen
  for (let k = 0, small = 0; k < 200 && small < 16 + 3 * towers.length; k++) {
    const { x, y } = randomPoint()
    if (!isLand(x, y) || towerGap(x, y) < 2.0 || !free(x, y, 0.25)) continue
    const flower = rand() < 0.35
    place(
      flower ? { kind: 'flower', x, y, color: FLOWERS[Math.floor(rand() * FLOWERS.length)]! } : { kind: 'tuft', x, y, tall: rand() < 0.4 },
      0.25,
    )
    small++
  }
  // Ein paar Schmetterlinge über den Blumen
  const flowers = items.filter((d) => d.kind === 'flower')
  for (const f of flowers.slice(0, Math.min(2 + Math.floor(towers.length / 2), flowers.length))) {
    items.push({ kind: 'butterfly', x: f.x, y: f.y, color: WINGS[Math.floor(rand() * WINGS.length)]! })
  }
  return items
}
