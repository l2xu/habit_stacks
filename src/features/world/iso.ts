/**
 * Isometrische Projektion (2:1-Dimetrie, wie klassische Pixel-Art).
 * Weltkoordinaten: x nach rechts-unten, y nach links-unten, z in Pixeln nach oben.
 */
export const K = 24 // Bildschirm-Pixel pro Welteinheit (horizontal); vertikal K/2

export interface Pt {
  x: number
  y: number
}

export const project = (x: number, y: number, z = 0): Pt => ({
  x: (x - y) * K,
  y: ((x + y) * K) / 2 - z,
})

export const toPoints = (pts: Pt[]) => pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')

export interface BoxGeometry {
  top: Pt[]
  left: Pt[]
  right: Pt[]
  /** Äußere Silhouette (für Kontur). */
  outline: Pt[]
  /** Ecken: N/E/S/W, Suffix 1 = oben, 0 = unten. */
  N0: Pt
  N1: Pt
  E0: Pt
  E1: Pt
  S0: Pt
  S1: Pt
  W0: Pt
  W1: Pt
  /** Horizontale Ausdehnung einer Seitenfläche in Bildschirm-Pixeln. */
  faceW: number
  height: number
}

type Corners = Pick<BoxGeometry, 'N0' | 'N1' | 'E0' | 'E1' | 'S0' | 'S1' | 'W0' | 'W1'>

/** Sichtbare Flächen und Umriss aus den acht Ecken. */
function fromCorners(c: Corners, faceW: number, height: number): BoxGeometry {
  const { N1, E0, E1, S0, S1, W0, W1 } = c
  return {
    top: [N1, E1, S1, W1],
    left: [W1, S1, S0, W0],
    right: [S1, E1, E0, S0],
    outline: [N1, E1, E0, S0, W0, W1],
    ...c,
    faceW,
    height,
  }
}

/** Quader mit Grundfläche-Mitte (cx, cy), halber Kantenlänge `half`, Boden z0 und Höhe h. */
export function boxGeometry(cx: number, cy: number, half: number, z0: number, h: number): BoxGeometry {
  const z1 = z0 + h
  const N = (z: number) => project(cx - half, cy - half, z)
  const E = (z: number) => project(cx + half, cy - half, z)
  const S = (z: number) => project(cx + half, cy + half, z)
  const W = (z: number) => project(cx - half, cy + half, z)
  return fromCorners({ N0: N(z0), N1: N(z1), E0: E(z0), E1: E(z1), S0: S(z0), S1: S(z1), W0: W(z0), W1: W(z1) }, 2 * half * K, h)
}

/**
 * Teilquader innerhalb eines Quaders, z. B. ein Mini-Stein im Block.
 * u läuft von N nach E (Welt-x), v von N nach W (Welt-y), beide 0–1; z0/z1 in Pixeln ab Blockboden.
 * Die Projektion ist linear, deshalb reicht die Geometrie des äußeren Quaders.
 */
export function subBox(geo: BoxGeometry, u0: number, u1: number, v0: number, v1: number, z0: number, z1: number): BoxGeometry {
  const ex = geo.E0.x - geo.N0.x
  const ey = geo.E0.y - geo.N0.y
  const wx = geo.W0.x - geo.N0.x
  const wy = geo.W0.y - geo.N0.y
  const at = (u: number, v: number, z: number): Pt => ({ x: geo.N0.x + u * ex + v * wx, y: geo.N0.y + u * ey + v * wy - z })
  return fromCorners(
    {
      N0: at(u0, v0, z0),
      N1: at(u0, v0, z1),
      E0: at(u1, v0, z0),
      E1: at(u1, v0, z1),
      S0: at(u1, v1, z0),
      S1: at(u1, v1, z1),
      W0: at(u0, v1, z0),
      W1: at(u0, v1, z1),
    },
    (u1 - u0) * geo.faceW,
    z1 - z0,
  )
}

/**
 * SVG-Matrizen, die lokale Flächenkoordinaten (u nach rechts, v nach unten, in Pixeln)
 * auf die linke bzw. rechte Seitenfläche abbilden. Ursprung: obere linke Ecke der Fläche.
 */
export const leftFaceMatrix = (o: Pt) => `matrix(1 0.5 0 1 ${o.x} ${o.y})`
export const rightFaceMatrix = (o: Pt) => `matrix(1 -0.5 0 1 ${o.x} ${o.y})`

/** Rechteck in Flächenkoordinaten (wie unter `leftFaceMatrix`/`rightFaceMatrix`) als Eckpunkte in Weltkoordinaten. */
export function faceRect(side: 'left' | 'right', o: Pt, x: number, y: number, w: number, h: number): Pt[] {
  const k = side === 'left' ? 0.5 : -0.5
  const at = (u: number, v: number): Pt => ({ x: o.x + u, y: o.y + k * u + v })
  return [at(x, y), at(x + w, y), at(x + w, y + h), at(x, y + h)]
}
