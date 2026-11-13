import { faceTexture } from '../IsoBox'
import type { BoxGeometry, Pt } from '../iso'
import { mergeShapes, shapeOf } from '../paint'
import type { FacePalette } from '../palette'
import { labelHalo, labelLayout, LABEL_FONT } from '../VoxelBlock'
import type { Rect } from '../worldLayout'
import type { Ctx } from './runtime'

/**
 * Zeichen-Bausteine der Canvas-Welt – dieselben Formen, Farben und Linien wie die SVG-Bausteine (`IsoBox`, `VoxelBlock`)
 * (Polygone, Quader, zusammengefasste Pfade, Schrift auf Blockflächen, Geister-Streifen).
 */

/** Wie SVG: Gehrung bis 4, sonst ragen spitze Ecken weiter heraus. */
export const MITER = 4

export function tracePoly(ctx: Ctx, pts: Pt[], close = true) {
  ctx.beginPath()
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)))
  if (close) ctx.closePath()
}

export function fillPoly(ctx: Ctx, pts: Pt[], fill: string | CanvasPattern, alpha = 1) {
  tracePoly(ctx, pts)
  ctx.fillStyle = fill
  withAlpha(ctx, alpha, () => ctx.fill())
}

interface StrokeStyle {
  width?: number
  alpha?: number
  join?: CanvasLineJoin
  cap?: CanvasLineCap
  dash?: number[]
  dashOffset?: number
}

export function stroke(ctx: Ctx, color: string, { width = 1, alpha = 1, join = 'miter', cap = 'butt', dash, dashOffset = 0 }: StrokeStyle = {}) {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.lineJoin = join
  ctx.lineCap = cap
  ctx.miterLimit = MITER
  if (dash) {
    ctx.setLineDash(dash)
    ctx.lineDashOffset = dashOffset
  }
  withAlpha(ctx, alpha, () => ctx.stroke())
  if (dash) ctx.setLineDash([])
}

export function strokePoly(ctx: Ctx, pts: Pt[], color: string, style: StrokeStyle & { closed?: boolean } = {}) {
  tracePoly(ctx, pts, style.closed ?? true)
  stroke(ctx, color, style)
}

export function withAlpha(ctx: Ctx, alpha: number, draw: () => void) {
  if (alpha >= 1) return draw()
  const before = ctx.globalAlpha
  ctx.globalAlpha = before * alpha
  draw()
  ctx.globalAlpha = before
}

export function fillRects(ctx: Ctx, rects: { x: number; y: number; w: number; h: number }[], fill: string) {
  ctx.fillStyle = fill
  ctx.beginPath()
  for (const r of rects) ctx.rect(r.x, r.y, r.w, r.h)
  ctx.fill()
}

/** Umschließendes Rechteck von Punkten, ringsum um `pad` erweitert. */
export function boundsOf(pts: Pt[], pad = 0): Rect {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (const p of pts) {
    x0 = Math.min(x0, p.x)
    y0 = Math.min(y0, p.y)
    x1 = Math.max(x1, p.x)
    y1 = Math.max(y1, p.y)
  }
  return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad }
}

export const unite = (...rects: Rect[]): Rect => ({
  x0: Math.min(...rects.map((r) => r.x0)),
  y0: Math.min(...rects.map((r) => r.y0)),
  x1: Math.max(...rects.map((r) => r.x1)),
  y1: Math.max(...rects.map((r) => r.y1)),
})

/** Umriss eines Quaders (ohne Kanten). */
export const boxBounds = (geo: BoxGeometry, pad = 2): Rect => ({ x0: geo.W0.x - pad, y0: geo.N1.y - pad, x1: geo.E0.x + pad, y1: geo.S0.y + pad })

// ───────────────────────────── Quader ─────────────────────────────

const textures = new WeakMap<BoxGeometry, Map<string, { light: Path2D | null; dark: Path2D | null }>>()

function textureOf(geo: BoxGeometry, seed: string) {
  let bySeed = textures.get(geo)
  if (!bySeed) textures.set(geo, (bySeed = new Map()))
  let t = bySeed.get(seed)
  if (!t) {
    const { light, dark } = faceTexture(geo, seed)
    t = { light: light ? new Path2D(light) : null, dark: dark ? new Path2D(dark) : null }
    bySeed.set(seed, t)
  }
  return t
}

/** Wie `IsoBox`: drei Flächen, optional Textur und Lichtkante, dann die Kontur. */
export function drawBox(ctx: Ctx, geo: BoxGeometry, palette: FacePalette, { texture, bevel = true }: { texture?: string; bevel?: boolean } = {}) {
  fillPoly(ctx, geo.left, palette.left)
  fillPoly(ctx, geo.right, palette.right)
  fillPoly(ctx, geo.top, palette.top)
  if (texture) {
    const { light, dark } = textureOf(geo, texture)
    if (dark) {
      ctx.fillStyle = '#000'
      withAlpha(ctx, 0.07, () => ctx.fill(dark))
    }
    if (light) {
      ctx.fillStyle = '#fff'
      withAlpha(ctx, 0.12, () => ctx.fill(light))
    }
  }
  if (bevel) {
    strokePoly(ctx, [geo.W1, geo.S1, geo.E1], '#fff', { width: 1.5, alpha: 0.4, closed: false })
    strokePoly(ctx, [geo.S1, geo.S0], palette.edge, { width: 1, alpha: 0.35, closed: false })
  }
  strokePoly(ctx, geo.outline, palette.edge, { width: 1.25, join: 'round' })
}

/** Wie `BoxPaths`: viele glatte Quader als wenige Pfade (gleiches Bild). Ergebnis einmal je Liste merken. */
const merged = new WeakMap<BoxGeometry[], { style: string; path: Path2D }[]>()

export function drawBoxPaths(ctx: Ctx, geos: BoxGeometry[], palette: FacePalette, edge = 1.25) {
  let paths = merged.get(geos)
  if (!paths) {
    paths = mergeShapes(geos.flatMap((g) => [shapeOf('left', g.left), shapeOf('right', g.right), shapeOf('top', g.top), shapeOf('edge', g.outline, edge / 2)])).map(
      ({ style, d }) => ({ style, path: new Path2D(d) }),
    )
    merged.set(geos, paths)
  }
  for (const { style, path } of paths) {
    if (style === 'edge') {
      ctx.strokeStyle = palette.edge
      ctx.lineWidth = edge
      ctx.lineJoin = 'round'
      ctx.stroke(path)
    } else {
      ctx.fillStyle = palette[style as 'left' | 'right' | 'top']
      ctx.fill(path)
    }
  }
}

// ───────────────────────────── Schrift ─────────────────────────────

/** SVG-Matrix der Seitenflächen (siehe `leftFaceMatrix`/`rightFaceMatrix`) auf den Kontext anwenden. */
export const faceTransform = (ctx: Ctx, side: 'left' | 'right', o: Pt) => ctx.transform(1, side === 'left' ? 0.5 : -0.5, 0, 1, o.x, o.y)

interface FaceTextOptions {
  origin: Pt
  side: 'left' | 'right'
  faceW: number
  h: number
  text: string
  color: string
  fontSize: number
  weight?: number
  halo?: boolean
}

/** Wie `FaceLabel`: umbrochene, mittige Schrift auf einer Seitenfläche, optional mit hellem Rand. */
export function drawFaceText(ctx: Ctx, { origin, side, faceW, h, text, color, fontSize, weight = 500, halo = false }: FaceTextOptions) {
  const { lines, lh, firstY } = labelLayout(faceW, h, text, fontSize)
  ctx.save()
  faceTransform(ctx, side, origin)
  ctx.font = `${weight} ${fontSize}px ${LABEL_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  if (halo) {
    const { color: haloColor, width } = labelHalo(fontSize)
    ctx.strokeStyle = haloColor
    ctx.lineWidth = width
    ctx.lineJoin = 'round'
    lines.forEach((line, i) => ctx.strokeText(line, faceW / 2, firstY + i * lh))
  }
  ctx.fillStyle = color
  lines.forEach((line, i) => ctx.fillText(line, faceW / 2, firstY + i * lh))
  ctx.restore()
}

// ───────────────────────────── Geister-Streifen ─────────────────────────────

const stripeTiles = new Map<number, HTMLCanvasElement>()

/** Wie das SVG-Muster `ghost-stripes`: 3 von 7 px weiß (38 %), um −35° gedreht, in Weltkoordinaten verankert. */
export function ghostStripes(ctx: Ctx, s: number): CanvasPattern | null {
  const px = Math.max(2, Math.round(7 * s))
  let tile = stripeTiles.get(px)
  if (!tile) {
    tile = document.createElement('canvas')
    tile.width = px
    tile.height = px
    const g = tile.getContext('2d')!
    g.fillStyle = 'rgba(255, 255, 255, 0.38)'
    g.fillRect(0, 0, (3 / 7) * px, px)
    stripeTiles.set(px, tile)
  }
  const pattern = ctx.createPattern(tile, 'repeat')
  pattern?.setTransform(new DOMMatrix().rotate(-35).scale(7 / px))
  return pattern
}
