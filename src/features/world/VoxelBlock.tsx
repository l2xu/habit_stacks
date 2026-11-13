import { motion } from 'framer-motion'
import { memo, useMemo, useState } from 'react'
import type { BlockVM } from '@/domain/types'
import { Loop, type LoopSpec } from '@/ui/Loop'
import { BoxPaths, IsoBox } from './IsoBox'
import { leftFaceMatrix, rightFaceMatrix, subBox, toPoints, type BoxGeometry, type Pt } from './iso'
import { crumbledPieces, MASONRY, MASONRY_LAYERS, type MasonryPiece } from './masonry'
import { rectPath } from './paint'
import { BLOCK_PALETTE, WORLD, type FacePalette } from './palette'
import { sfx } from '@/store/sfx'
import { wrapLabel } from './wrapLabel'

/** Durchschnittliche Zeichenbreite von Geist Pixel in em – für den Label-Umbruch. */
const CHAR_W = 0.56
const LINE_H = 1.15
/** Schrift der Blockbeschriftung (Canvas) bzw. des Zählers. */
export const LABEL_FONT = `'Geist Pixel', ui-sans-serif, system-ui, sans-serif`
export const MICRO_FONT = `'Silkscreen', ui-monospace, monospace`

/**
 * Ein Block als SVG – für die Vorschau im Editor: Geist oder fester Block (Anker, verfestigt; Bröckeln zeigt nur die
 * Insel). Auf der Insel zeichnet `canvas/towers.ts` die Blöcke mit den gemeinsamen Formen und Animationen von hier.
 */
export const VoxelBlock = memo(function VoxelBlock({ block, geo }: { block: BlockVM; geo: BoxGeometry }) {
  const pal = BLOCK_PALETTE[block.color]
  if (block.visual === 'forming') return <FormingBlock block={block} geo={geo} pal={pal} />
  return (
    <>
      <IsoBox geo={geo} palette={pal} textureSeed={block.id} />
      <BlockLabels block={block} geo={geo} color={pal.text} />
    </>
  )
})

// ───────────────────────────── Beschriftung ─────────────────────────────

interface FaceLabelProps {
  origin: Pt
  side: 'left' | 'right'
  faceW: number
  h: number
  text: string
  color: string
  fontSize: number
  weight?: number
  /** Heller Rand um die Schrift – lesbar über Mini-Würfeln jeder Farbe. */
  halo?: boolean
}

/** Zeilen und Grundlinien einer Flächenbeschriftung (Flächenkoordinaten, Mitte bei faceW / 2). */
export function labelLayout(faceW: number, h: number, text: string, fontSize: number) {
  const maxChars = Math.max(3, Math.floor((faceW - 8) / (fontSize * CHAR_W)))
  const maxLines = Math.max(1, Math.floor((h - 6) / (fontSize * LINE_H)))
  const lines = wrapLabel(text, maxChars, maxLines)
  const lh = fontSize * LINE_H
  const firstY = h / 2 - ((lines.length - 1) * lh) / 2 + fontSize * 0.36
  return { lines, lh, firstY }
}

/** Heller Rand um die Schrift. Breiter Rand schließt bei kleiner Schrift die Innenräume (eine 2 sähe aus wie eine 8). */
export const labelHalo = (fontSize: number) => ({ color: '#fbfcf8', width: fontSize > 10 ? 2 : 2.5 })

function FaceLabel({ origin, side, faceW, h, text, color, fontSize, weight = 500, halo = false }: FaceLabelProps) {
  const { lines, lh, firstY } = labelLayout(faceW, h, text, fontSize)
  const haloProps = halo ? { stroke: labelHalo(fontSize).color, strokeWidth: labelHalo(fontSize).width, strokeLinejoin: 'round' as const, paintOrder: 'stroke' } : {}

  return (
    <g transform={side === 'left' ? leftFaceMatrix(origin) : rightFaceMatrix(origin)} pointerEvents="none">
      <text className="font-pixel" fontSize={fontSize} fontWeight={weight} fill={color} textAnchor="middle" {...haloProps}>
        {lines.map((line, i) => (
          <tspan key={i} x={faceW / 2} y={firstY + i * lh}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  )
}

/** Beschriftung eines festen Blocks; der Anker trägt sie auf beiden Seiten. */
export const blockLabel = (block: BlockVM) =>
  block.visual === 'anchor' ? { text: `ANKER: ${block.title}`, fontSize: 10.5, both: true } : { text: block.title, fontSize: 10, both: false }

function BlockLabels({ block, geo, color }: { block: BlockVM; geo: BoxGeometry; color: string }) {
  const { text, fontSize, both: isAnchor } = blockLabel(block)
  const common = { faceW: geo.faceW, h: geo.height, text, color, fontSize }
  return (
    <>
      <FaceLabel {...common} origin={geo.W1} side="left" />
      {/* Der Anker trägt sein Label wie in der Referenz auf beiden Seiten */}
      {isAnchor && <FaceLabel {...common} origin={geo.S1} side="right" />}
    </>
  )
}

// ───────────────────────────── Geister-Block (Verfestigung läuft) ─────────────────────────────

/** Streifenmuster der Geister-Blöcke; gehört einmal in jedes SVG, das Geister zeigt. */
export function GhostStripes() {
  return (
    <defs>
      <pattern id="ghost-stripes" width={7} height={7} patternUnits="userSpaceOnUse" patternTransform="rotate(-35)">
        <rect width={3} height={7} fill="#fff" opacity={0.38} />
      </pattern>
    </defs>
  )
}

/** Geometrie eines Mini-Würfels im Block. */
export const stoneGeo = (geo: BoxGeometry, p: MasonryPiece) => {
  const layerH = geo.height / MASONRY_LAYERS
  return subBox(geo, p.u0, p.u1, p.v0, p.v1, p.layer * layerH, (p.layer + 1) * layerH)
}

/** Ein Mini-Würfel: flach schattiert, feine Kante. */
function Stone({ geo, pal }: { geo: BoxGeometry; pal: FacePalette }) {
  return (
    <>
      <polygon points={toPoints(geo.left)} fill={pal.left} />
      <polygon points={toPoints(geo.right)} fill={pal.right} />
      <polygon points={toPoints(geo.top)} fill={pal.top} />
      <polygon points={toPoints(geo.outline)} fill="none" stroke={pal.edge} strokeWidth={0.8} strokeLinejoin="round" />
    </>
  )
}

/** Viele Mini-Würfel als wenige Pfade – ein voller Geist hätte sonst über 100 Flächen. */
function Stones({ geo, pieces, pal }: { geo: BoxGeometry; pieces: readonly MasonryPiece[]; pal: FacePalette }) {
  const geos = useMemo(() => pieces.map((piece) => stoneGeo(geo, piece)), [geo, pieces])
  return <BoxPaths geos={geos} palette={pal} edge={0.8} />
}

function FormingBlock({ block, geo, pal }: { block: BlockVM; geo: BoxGeometry; pal: FacePalette }) {
  const faces = [
    { pts: geo.left, fill: pal.left },
    { pts: geo.right, fill: pal.right },
    { pts: geo.top, fill: pal.top },
  ]
  const stones = Math.min(MASONRY.length, block.stones ?? 0)
  const wobbling = block.wobbling ?? false
  // Der Würfel für heute: als pulsierende Lücke, solange der Block heute noch offen ist.
  const open = !block.doneToday && !block.upcoming
  const slot = open ? MASONRY[stones] : undefined
  // Alle Würfel da, der letzte Tag fehlt noch: Dann pulsiert der ganze Kasten.
  const lastDay = open && !slot
  // Würfel, die nach dem ersten Rendern dazukommen (gerade erledigt), fallen sichtbar ein.
  const [initialCount] = useState(stones)
  const settled = useMemo(() => MASONRY.slice(0, Math.min(stones, initialCount)), [stones, initialCount])
  // Drehpunkt: rechte untere Ecke – wie beim Bröckeln hebt der Geist links ab.
  const originY = (geo.E0.y - geo.N1.y) / (geo.S0.y - geo.N1.y)

  return (
    <>
      <Loop loop={GHOST.bob}>
        <Loop origin={`100% ${originY * 100}%`} loop={wobbling ? GHOST.wobble : null}>
          {/* Verdeckte Kanten scheinen durch */}
          <g stroke="#fff" strokeOpacity={0.75} strokeDasharray="3 3" fill="none">
            <polyline points={toPoints([geo.W0, geo.N0, geo.E0])} />
            <line x1={geo.N0.x} y1={geo.N0.y} x2={geo.N1.x} y2={geo.N1.y} />
          </g>
          {faces.map((f, i) => (
            <polygon key={i} points={toPoints(f.pts)} fill={f.fill} fillOpacity={0.3} />
          ))}
          {faces.map((f, i) => (
            <polygon key={`s${i}`} points={toPoints(f.pts)} fill="url(#ghost-stripes)" />
          ))}

          {/* Ein Mini-Würfel pro erledigtem Tag, Schicht für Schicht; die schon liegenden als wenige Pfade */}
          <Stones geo={geo} pieces={settled} pal={pal} />
          {/* Würfel, die nach dem ersten Rendern dazukommen, fallen einzeln ein */}
          {MASONRY.slice(initialCount, stones).map((piece, k) => (
            <motion.g
              key={initialCount + k}
              initial={{ y: -26, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ y: { type: 'spring', stiffness: 420, damping: 16, delay: 0.35 }, opacity: { duration: 0.1, delay: 0.35 } }}
              onAnimationComplete={() => sfx('stone')}
            >
              <Stone geo={stoneGeo(geo, piece)} pal={pal} />
            </motion.g>
          ))}
          {slot && (
            <Loop loop={GHOST.slotPulse(wobbling)}>
              <polygon
                points={toPoints(stoneGeo(geo, slot).outline)}
                fill="#fff"
                fillOpacity={0.45}
                stroke={wobbling ? WORLD.danger : WORLD.ink}
                strokeWidth={1.25}
                strokeDasharray="2.5 2"
              />
            </Loop>
          )}

          <polyline points={toPoints([geo.W1, geo.S1, geo.E1])} fill="none" stroke="#fff" strokeOpacity={0.9} strokeWidth={1.25} />
          <line x1={geo.S1.x} y1={geo.S1.y} x2={geo.S0.x} y2={geo.S0.y} stroke="#fff" strokeOpacity={0.8} />
          <polygon points={toPoints(geo.outline)} fill="none" stroke="#fff" strokeWidth={1.5} strokeLinejoin="round" />
          {lastDay && (
            <Loop loop={GHOST.lastDayPulse(wobbling)}>
              <polygon
                points={toPoints(geo.outline)}
                fill="none"
                stroke={wobbling ? WORLD.danger : WORLD.ink}
                strokeWidth={1.5}
                strokeDasharray="3 2.5"
                strokeLinejoin="round"
              />
            </Loop>
          )}
          <FaceLabel origin={geo.W1} side="left" faceW={geo.faceW} h={geo.height} text={block.title} color={WORLD.ink} fontSize={10} halo />
          <Counter geo={geo} text={`${block.stones ?? 0}/${block.formationTarget ?? MASONRY.length + 1}`} warn={wobbling} />
        </Loop>
      </Loop>
      {wobbling ? <WobbleMarks geo={geo} /> : <Sparkles around={geo} />}
    </>
  )
}

/** Dauer-Animationen des Geister-Blocks: Schweben, Wackeln, pulsierende Lücke bzw. Kontur. */
export const GHOST = {
  bob: { values: { y: [0, -3, 0] }, duration: 3.2 } satisfies LoopSpec,
  wobble: { values: { rotate: [0, 4, -1, 3, 0] }, duration: 1.4, repeatDelay: 0.8 } satisfies LoopSpec,
  slotPulse: (wobbling: boolean): LoopSpec => ({ values: { opacity: [0.35, 0.9, 0.35] }, duration: wobbling ? 0.9 : 1.6 }),
  lastDayPulse: (wobbling: boolean): LoopSpec => ({ values: { opacity: [0.35, 1, 0.35] }, duration: wobbling ? 0.9 : 1.6 }),
}

/** Funkeln in zwei abwechselnden Gruppen (Phase in s). */
const SPARKLE_DELAYS = [0.8, 1.9]

/** Pixel-Funkeln rund um einen Geister-Block: je Gruppe Pfad und Animation. */
export function sparkles(geo: BoxGeometry): { d: string; loop: LoopSpec }[] {
  const spots: Pt[] = [
    { x: geo.W1.x + 2, y: geo.N1.y - 12 },
    { x: geo.E1.x - 6, y: geo.N1.y - 20 },
    { x: geo.W1.x - 16, y: geo.W1.y - 6 },
    { x: geo.E1.x + 16, y: geo.E1.y - 10 },
  ]
  return SPARKLE_DELAYS.map((delay, g) => ({
    d: spots
      .filter((_, i) => i % SPARKLE_DELAYS.length === g)
      .map((p) => rectPath(p.x - 1, p.y - 4, 2, 8) + rectPath(p.x - 4, p.y - 1, 8, 2))
      .join(''),
    loop: { values: { opacity: [0, 0.9, 0] }, duration: 2.2, delay },
  }))
}

/** Pixel-Funkeln rund um den Geister-Block. */
function Sparkles({ around: geo }: { around: BoxGeometry }) {
  return (
    <g fill={WORLD.inkSoft} shapeRendering="crispEdges" pointerEvents="none">
      {sparkles(geo).map(({ d, loop }, g) => (
        <Loop key={g} loop={loop}>
          <path d={d} />
        </Loop>
      ))}
    </g>
  )
}

// ───────────────────────────── Bröckelnder Block ─────────────────────────────

/** Mini-Würfel, die ein bröckelnder Block noch hat (je näher der Absturz, desto weniger). */
export function crumblingStones(id: string, progress: number, carrying: boolean): readonly MasonryPiece[] {
  // Oben: 4 … 10 fehlen, unter Last: 2 … 5 von 27.
  const missing = carrying ? crumbledPieces(id, 2 + Math.round(progress * 3), true) : crumbledPieces(id, 4 + Math.round(progress * 6))
  return MASONRY.filter((_, i) => !missing.has(i))
}

/** Wackeln eines bröckelnden Blocks. Unter Last kippt er nicht, er zittert nur. */
export function crumbleWobble(progress: number, carrying: boolean): LoopSpec {
  const tilt = 3 + progress * 4
  return carrying
    ? { values: { x: [0, -1, 1, -1, 0] }, duration: 0.5, repeatDelay: 1.5 }
    : { values: { rotate: [tilt, tilt + 2.5, tilt - 0.5, tilt + 2, tilt] }, duration: 1.4, repeatDelay: 0.6 }
}

/** Bröckelnde Pixel an der Vorderkante: Startpunkt und Animation. */
export function crumbleBits(geo: BoxGeometry): { at: Pt; loop: LoopSpec }[] {
  return [0.25, 0.5, 0.8].map((t, i) => ({
    at: { x: geo.W0.x + (geo.S0.x - geo.W0.x) * t, y: geo.W0.y + (geo.S0.y - geo.W0.y) * t },
    loop: { values: { opacity: [0, 1, 0], y: [0, 8, 18] }, duration: 1.1, repeatDelay: 1.2, delay: i * 0.45, ease: 'easeIn' },
  }))
}

/** Breite des Zähler-Schildchens (Silkscreen 8 px). */
export const counterWidth = (text: string) => text.length * 6.4 + 8

/** Zähler „17/28“ (erledigte Tage) auf einem hellen Schildchen – über den Würfelkanten lesbar. */
function Counter({ geo, text, warn }: { geo: BoxGeometry; text: string; warn: boolean }) {
  const w = counterWidth(text)
  return (
    <g transform={rightFaceMatrix(geo.S1)} pointerEvents="none">
      <rect x={(geo.faceW - w) / 2} y={geo.height / 2 - 8} width={w} height={15} rx={2} fill="#fbfcf8" fillOpacity={0.92} stroke={warn ? WORLD.danger : WORLD.ink} strokeOpacity={0.5} />
      <text x={geo.faceW / 2} y={geo.height / 2 + 3.2} className="font-micro" fontSize={8} fill={warn ? WORLD.danger : WORLD.ink} textAnchor="middle">
        {text}
      </text>
    </g>
  )
}

/** Wackel-Striche blinken. */
export const WOBBLE_BLINK: LoopSpec = { values: { opacity: [1, 0.25, 1] }, duration: 0.7 }

/** Wackel-Striche links und rechts. */
function WobbleMarks({ geo }: { geo: BoxGeometry }) {
  return (
    <Loop stroke={WORLD.ink} strokeWidth={2.5} fill="none" strokeLinecap="square" pointerEvents="none" loop={WOBBLE_BLINK}>
      {wobbleMarks(geo).map((pts, i) => (
        <polyline key={i} points={toPoints(pts)} />
      ))}
    </Loop>
  )
}

/** Wackel-Striche als Klammern links und rechts neben dem Block. */
export function wobbleMarks(geo: BoxGeometry): Pt[][] {
  const bracket = (o: Pt, dir: 1 | -1) => [
    { x: o.x, y: o.y },
    { x: o.x + 3 * dir, y: o.y + 5 },
    { x: o.x + 3 * dir, y: o.y + 15 },
    { x: o.x, y: o.y + 20 },
  ]
  return [bracket({ x: geo.W1.x - 9, y: geo.W1.y + 2 }, -1), bracket({ x: geo.E1.x + 9, y: geo.E1.y + 4 }, 1)]
}
