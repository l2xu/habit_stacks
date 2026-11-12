import { motion } from 'framer-motion'
import { useMemo } from 'react'
import type { BlockVM } from '@/domain/types'
import { collapseSlots, EFFECT_START as START, type LostSlot, type TowerEffect } from './effects'
import { toPoints, type BoxGeometry, type Pt } from './iso'
import { BLOCK_PALETTE } from './palette'
import { seededRandom } from './random'
import type { TowerLayout } from './towerLayout'
import { VoxelBlock } from './VoxelBlock'

/** Der verlorene Block an seinem Platz: fällt ab bzw. zerspringt. In IsoTower an der richtigen Stelle gezeichnet. */
export function LostBlockEffect({ effect, slot, top }: { effect: TowerEffect; slot: LostSlot; top: boolean }) {
  if (effect.kind === 'break') return <ShatteringBlock key={effect.key} block={slot.block} geo={slot.geo} />
  return top ? <FallingBlock key={effect.key} block={slot.block} geo={slot.geo} /> : <SlidingBlock key={effect.key} block={slot.block} geo={slot.geo} />
}

/** Effekte, die über dem ganzen Turm liegen (Verfestigen, Bröckeln, Einsturz). */
export function TowerEffectLayer({ effect, layout, ox, oy }: { effect: TowerEffect; layout: TowerLayout; ox: number; oy: number }) {
  if (effect.kind === 'collapse') return <CollapsingBlocks key={effect.key} slots={collapseSlots(effect.blocks, layout, ox, oy)} />
  if (effect.kind !== 'solidify' && effect.kind !== 'crumble') return null
  const target = layout.blocks.find((b) => b.block.id === effect.habitId)
  if (!target) return null
  return effect.kind === 'solidify' ? <SolidifyFlash key={effect.key} geo={target.geo} /> : <CrumbleBurst key={effect.key} block={target.block} geo={target.geo} />
}

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

/** Bröckeln: Brocken lösen sich an beiden sichtbaren Seiten vom Block und rieseln herab. */
function CrumbleBurst({ block, geo }: { block: BlockVM; geo: BoxGeometry }) {
  const chips = useMemo(() => crumbleChips(block, geo), [block, geo])

  return (
    <g pointerEvents="none">
      {chips.map((c, i) => (
        <g key={i} transform={`translate(${c.x} ${c.y})`}>
          <motion.rect
            width={c.size}
            height={c.size}
            fill={c.fill}
            stroke="#fff"
            strokeWidth={0.5}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0], x: [0, c.dx * 0.4, c.dx], y: [0, 4, c.dy] }}
            transition={{ duration: 1.2, delay: c.delay, ease: 'easeIn' }}
          />
        </g>
      ))}
    </g>
  )
}

/** Block aus der Mitte: zittert, rutscht nach vorne aus dem Turm und fällt. */
function SlidingBlock({ block, geo }: { block: BlockVM; geo: BoxGeometry }) {
  return (
    <motion.g
      initial={{ x: 0, y: 0, opacity: 1 }}
      animate={{ x: [0, -2, 2, -2, 0, 64, 96], y: [0, 0, 0, 0, 0, 32, 290], opacity: [1, 1, 1, 1, 1, 1, 0] }}
      transition={{ duration: 2.4, times: [0, 0.1, 0.2, 0.3, 0.4, 0.62, 1], ease: 'easeIn', delay: START }}
      pointerEvents="none"
    >
      <VoxelBlock block={{ ...block, visual: 'crumbling', crumbleProgress: 1 }} geo={geo} dropIn={false} />
    </motion.g>
  )
}

/** Bröckelnder Block wackelt kurz, kippt über die Kante und fällt. */
function FallingBlock({ block, geo }: { block: BlockVM; geo: BoxGeometry }) {
  return (
    <motion.g
      style={{ originX: 1, originY: 1 }}
      initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
      animate={{ x: [0, 0, 34, 100], y: [0, 0, 36, 280], rotate: [0, 0, 32, 95], opacity: [1, 1, 1, 0] }}
      transition={{ duration: 2.6, times: [0, 0.45, 0.68, 1], ease: 'easeIn', delay: START }}
      pointerEvents="none"
    >
      <VoxelBlock block={{ ...block, visual: 'crumbling', crumbleProgress: 1 }} geo={geo} dropIn={false} />
    </motion.g>
  )
}

/** Einsturz: Die Blöcke über dem Anker zittern gemeinsam und kippen dann einer nach dem anderen ab, der oberste zuerst. */
function CollapsingBlocks({ slots }: { slots: { block: BlockVM; geo: BoxGeometry }[] }) {
  return (
    <g pointerEvents="none">
      {slots.map(({ block, geo }, i) => {
        // Erst zittern alle (0,9 s), dann kippt alle 0,3 s der nächste ab – abwechselnd nach rechts und links.
        const order = slots.length - 1 - i
        const dir = order % 2 ? -1 : 1
        const fallAt = 0.9 + order * 0.3
        const total = fallAt + 1.5
        return (
          <motion.g
            key={block.id}
            style={{ originX: dir > 0 ? 1 : 0, originY: 1 }}
            initial={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
            animate={{
              x: [0, -2, 2, -2, 0, dir * 34, dir * 100],
              y: [0, 0, 0, 0, 0, 36, 300],
              rotate: [0, 0, 0, 0, 0, dir * 32, dir * 95],
              opacity: [1, 1, 1, 1, 1, 1, 0],
            }}
            transition={{ duration: total, times: [0, 0.1, 0.2, 0.3, fallAt, fallAt + 0.55, total].map((t) => t / total), ease: 'easeIn', delay: START }}
          >
            <VoxelBlock block={{ ...block, visual: 'crumbling', crumbleProgress: 1 }} geo={geo} dropIn={false} carrying={i < slots.length - 1} />
          </motion.g>
        )
      })}
    </g>
  )
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

/** Geister-Block zittert und zerspringt in Pixel-Splitter. */
function ShatteringBlock({ block, geo }: { block: BlockVM; geo: BoxGeometry }) {
  const shards = useMemo(() => shatterShards(block, geo), [block, geo])

  return (
    <g pointerEvents="none">
      <motion.g
        initial={{ opacity: 1, x: 0 }}
        animate={{ opacity: [1, 1, 0], x: [0, -2, 2, -2, 2, 0] }}
        transition={{ opacity: { duration: 1.3, times: [0, 0.75, 1], delay: START }, x: { duration: 0.9, delay: START } }}
      >
        <VoxelBlock block={{ ...block, visual: 'forming' }} geo={geo} dropIn={false} />
      </motion.g>
      {shards.map((s, i) => (
        <g key={i} transform={`translate(${s.x} ${s.y})`}>
          <motion.rect
            width={s.size}
            height={s.size}
            fill={s.fill}
            stroke="#fff"
            strokeWidth={0.6}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0], x: [0, s.dx * 0.35, s.dx], y: [0, -14, s.dy], rotate: [0, s.rotate] }}
            transition={{ duration: 1.7, delay: START + 1, ease: 'easeIn' }}
          />
        </g>
      ))}
    </g>
  )
}

/** Weißer Blitz über dem Block + Funken: Geist wird massiv. */
function SolidifyFlash({ geo }: { geo: BoxGeometry }) {
  return (
    <g pointerEvents="none">
      <motion.g fill="#fff" initial={{ opacity: 0 }} animate={{ opacity: [0, 0.95, 0] }} transition={{ duration: 1.4, delay: START }}>
        <polygon points={toPoints(geo.left)} />
        <polygon points={toPoints(geo.right)} />
        <polygon points={toPoints(geo.top)} />
      </motion.g>
      <Burst at={geo.N1} delay={START + 0.4} />
    </g>
  )
}

/** Richtungen der Pixel-Funken (Bogenmaß). */
export const BURST_RAYS = Array.from({ length: 10 }, (_, i) => (i / 10) * Math.PI * 2)

/** Pixel-Funken, die sich von einem Punkt ausbreiten. */
export function Burst({ at, delay = 0 }: { at: Pt; delay?: number }) {
  const rays = BURST_RAYS
  return (
    <g transform={`translate(${at.x} ${at.y - 10})`} pointerEvents="none">
      {rays.map((a, i) => (
        <motion.g
          key={i}
          initial={{ x: 0, y: 0, opacity: 0 }}
          animate={{ x: Math.cos(a) * 46, y: Math.sin(a) * 30 - 10, opacity: [0, 1, 0] }}
          transition={{ duration: 1.1, ease: 'easeOut', delay }}
        >
          <g fill={i % 2 ? '#ddb457' : '#fff'} shapeRendering="crispEdges">
            <rect x={-1} y={-4} width={2} height={8} />
            <rect x={-4} y={-1} width={8} height={2} />
          </g>
        </motion.g>
      ))}
    </g>
  )
}
