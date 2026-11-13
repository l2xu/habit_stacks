import type { BlockVM, ID } from '@/domain/types'
import { sfx } from '@/store/sfx'
import { collapseSlots, EFFECT_START, lostSlot, type LostSlot, type TowerEffect } from '../effects'
import { type BoxGeometry, type Pt } from '../iso'
import { towerRing } from '../IsoTower'
import { MASONRY, MASONRY_LAYERS } from '../masonry'
import { BLOCK_PALETTE, WORLD, type FacePalette } from '../palette'
import { rubbleCrack, rubblePieces, rubbleRing } from '../Rubble'
import { BURST_RAYS, crumbleChips, shatterShards } from '../TowerEffects'
import { blockLabel, counterWidth, crumbleBits, crumbleWobble, crumblingStones, GHOST, MICRO_FONT, sparkles, stoneGeo, WOBBLE_BLINK, wobbleMarks } from '../VoxelBlock'
import { dropDelay, RUBBLE, type PlacedTower } from '../worldLayout'
import { boundsOf, boxBounds, drawBox, drawBoxPaths, drawFaceText, faceTransform, fillPoly, ghostStripes, strokePoly, unite, withAlpha } from './paint2d'
import { drawPicture, pictureCache, type Picture } from './picture'
import {
  keyTrack,
  loop,
  loopClock,
  springTrack,
  tv,
  withGroupOpacity,
  withLoop,
  withOpacity,
  withXform,
  type Ctx,
  type Frame,
  type Loop,
  type Track,
} from './runtime'

/**
 * Türme und Schutthaufen im Canvas. Was sonst React und Framer Motion übernähmen (wann ein Block erschien, welche
 * Würfel neu sind, wann ein Effekt begann), merkt sich hier ein Zustand je Turm. Bewegungen sind Zeitfunktionen mit denselben Federn und Keyframes.
 */

/** Fokus-Modus: ergänzt die Darstellung eines Blocks (Markierung, Haken, Timer-Licht). */
export interface BlockOverlay {
  draw: (f: Frame, i: number, geo: BoxGeometry, voxel: () => void) => void
}

const geoKey = (g: BoxGeometry) => `${g.N1.x.toFixed(2)},${g.N1.y.toFixed(2)},${g.faceW},${g.height}`
const blockPictures = pictureCache<string>()

// ───────────────────────────── Blöcke ─────────────────────────────

function solidPicture(block: BlockVM, geo: BoxGeometry): Picture {
  const pal = BLOCK_PALETTE[block.color]
  return blockPictures(`solid|${block.id}|${block.visual}|${block.title}|${block.color}|${geoKey(geo)}`, () => ({
    bounds: boxBounds(geo, 2),
    text: true,
    draw(ctx) {
      drawBox(ctx, geo, pal, { texture: block.id })
      const { text, fontSize, both } = blockLabel(block)
      const common = { faceW: geo.faceW, h: geo.height, text, color: pal.text, fontSize }
      drawFaceText(ctx, { ...common, origin: geo.W1, side: 'left' })
      if (both) drawFaceText(ctx, { ...common, origin: geo.S1, side: 'right' })
    },
  }))
}

/** Mini-Würfel einzeln (fallen gerade ein): Flächen und feine Kante. */
function drawStone(ctx: Ctx, geo: BoxGeometry, pal: FacePalette) {
  fillPoly(ctx, geo.left, pal.left)
  fillPoly(ctx, geo.right, pal.right)
  fillPoly(ctx, geo.top, pal.top)
  strokePoly(ctx, geo.outline, pal.edge, { width: 0.8, join: 'round' })
}

const stoneGeosOf = (geo: BoxGeometry, pieces: readonly (typeof MASONRY)[number][]) => pieces.map((p) => stoneGeo(geo, p))

/** Geister-Block in zwei Bildern: darunter (Kanten, Flächen, Streifen, liegende Würfel), darüber (Kanten, Schrift, Zähler). */
function ghostPictures(block: BlockVM, geo: BoxGeometry, settled: number): { under: Picture; over: Picture } {
  const pal = BLOCK_PALETTE[block.color]
  const wobbling = block.wobbling ?? false
  const key = `${block.id}|${block.color}|${geoKey(geo)}`
  const under = blockPictures(`ghost-under|${key}|${settled}`, () => {
    const stones = stoneGeosOf(geo, MASONRY.slice(0, settled))
    const faces = [
      { pts: geo.left, fill: pal.left },
      { pts: geo.right, fill: pal.right },
      { pts: geo.top, fill: pal.top },
    ]
    return {
      bounds: boxBounds(geo, 2),
      draw(ctx, s) {
        // Verdeckte Kanten scheinen durch
        strokePoly(ctx, [geo.W0, geo.N0, geo.E0], '#fff', { alpha: 0.75, dash: [3, 3], closed: false })
        strokePoly(ctx, [geo.N0, geo.N1], '#fff', { alpha: 0.75, dash: [3, 3], closed: false })
        for (const fc of faces) fillPoly(ctx, fc.pts, fc.fill, 0.3)
        const stripes = ghostStripes(ctx, s)
        if (stripes) for (const fc of faces) fillPoly(ctx, fc.pts, stripes)
        if (stones.length) drawBoxPaths(ctx, stones, pal, 0.8)
      },
    }
  })
  const counter = `${block.stones ?? 0}/${block.formationTarget ?? MASONRY.length + 1}`
  const over = blockPictures(`ghost-over|${key}|${block.title}|${counter}|${wobbling}`, () => ({
    bounds: boxBounds(geo, 2),
    text: true,
    draw(ctx) {
      strokePoly(ctx, [geo.W1, geo.S1, geo.E1], '#fff', { width: 1.25, alpha: 0.9, closed: false })
      strokePoly(ctx, [geo.S1, geo.S0], '#fff', { alpha: 0.8, closed: false })
      strokePoly(ctx, geo.outline, '#fff', { width: 1.5, join: 'round' })
      drawFaceText(ctx, { origin: geo.W1, side: 'left', faceW: geo.faceW, h: geo.height, text: block.title, color: WORLD.ink, fontSize: 10, halo: true })
      drawCounter(ctx, geo, counter, wobbling)
    },
  }))
  return { under, over }
}

/** Wie `Counter`: Zähler „17/28“ auf einem hellen Schildchen auf der rechten Fläche. */
function drawCounter(ctx: Ctx, geo: BoxGeometry, text: string, warn: boolean) {
  const w = counterWidth(text)
  const color = warn ? WORLD.danger : WORLD.ink
  ctx.save()
  faceTransform(ctx, 'right', geo.S1)
  ctx.beginPath()
  // Ältere Safari-Versionen (vor iOS 16) kennen kein roundRect – dann eckig.
  if (ctx.roundRect) ctx.roundRect((geo.faceW - w) / 2, geo.height / 2 - 8, w, 15, 2)
  else ctx.rect((geo.faceW - w) / 2, geo.height / 2 - 8, w, 15)
  ctx.fillStyle = '#fbfcf8'
  withAlpha(ctx, 0.92, () => ctx.fill())
  ctx.strokeStyle = color
  ctx.lineWidth = 1
  withAlpha(ctx, 0.5, () => ctx.stroke())
  ctx.font = `8px ${MICRO_FONT}`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = color
  ctx.fillText(text, geo.faceW / 2, geo.height / 2 + 3.2)
  ctx.restore()
}

function crumblingPicture(block: BlockVM, geo: BoxGeometry, carrying: boolean): Picture {
  const pal = BLOCK_PALETTE[block.color]
  const p = block.crumbleProgress ?? 0
  return blockPictures(`crumble|${block.id}|${block.title}|${block.color}|${p}|${carrying}|${geoKey(geo)}`, () => {
    const stones = stoneGeosOf(geo, crumblingStones(block.id, p, carrying))
    const layerH = geo.height / MASONRY_LAYERS
    return {
      bounds: boxBounds(geo, 2),
      text: true,
      draw(ctx) {
        drawBoxPaths(ctx, stones, pal, 0.8)
        // Beschriftung auf den unteren Schichten, die (fast) heil bleiben
        drawFaceText(ctx, { origin: { x: geo.W1.x, y: geo.W1.y + layerH }, side: 'left', faceW: geo.faceW, h: geo.height - layerH, text: block.title, color: pal.text, fontSize: 10 })
      },
    }
  })
}

/** Zustand eines Geists: Würfel beim ersten Zeichnen als Geist und wann spätere dazukamen (fallen ein). */
interface GhostState {
  initial: number
  born: Map<number, number>
  landed: Set<number>
}

/** Dauer-Animationen je Block (einmal angelegt, Werte je Frame). */
const loops = new Map<string, Loop>()
const loopOf = (key: string, make: () => Parameters<typeof loop>[0]) => {
  let l = loops.get(key)
  if (!l) loops.set(key, (l = loop(make())))
  return l
}

const NEW_STONE_Y = springTrack(-26, 0, { stiffness: 420, damping: 16, delay: 0.35 })
const NEW_STONE_OPACITY = keyTrack([0, 1], { duration: 0.1, delay: 0.35 })

/** Wie `VoxelBlock` ohne Fall-Animation: fester Block, Geist oder bröckelnder Block samt Dauer-Animationen. */
export function drawVoxel(f: Frame, block: BlockVM, geo: BoxGeometry, carrying: boolean, clock: number, ghost?: GhostState) {
  if (block.visual === 'solid' || block.visual === 'anchor') return drawPicture(f, solidPicture(block, geo))
  if (block.visual === 'forming') return drawGhost(f, block, geo, clock, ghost)
  drawCrumbling(f, block, geo, carrying, clock)
}

function drawGhost(f: Frame, block: BlockVM, geo: BoxGeometry, clock: number, ghost?: GhostState) {
  const { ctx } = f
  const pal = BLOCK_PALETTE[block.color]
  const stones = Math.min(MASONRY.length, block.stones ?? 0)
  const wobbling = block.wobbling ?? false
  const settled = Math.min(stones, ghost?.initial ?? stones)
  const { under, over } = ghostPictures(block, geo, settled)
  // Der Würfel für heute: als pulsierende Lücke, solange der Block heute noch offen ist (nicht, wenn er erst morgen startet).
  const open = !block.doneToday && !block.upcoming
  const slot = open ? MASONRY[stones] : undefined
  // Alle Würfel da, der letzte Tag fehlt noch: Dann pulsiert der ganze Kasten.
  const lastDay = open && !slot
  const accent = wobbling ? WORLD.danger : WORLD.ink

  withLoop(f, loopOf('ghost-bob', () => GHOST.bob).at(clock), undefined, () =>
    // Drehpunkt: rechte untere Ecke – wie beim Bröckeln hebt der Geist links ab.
    withLoop(f, wobbling ? loopOf('ghost-wobble', () => GHOST.wobble).at(clock) : {}, geo.E0, () => {
      drawPicture(f, under)
      // Würfel, die nach dem ersten Zeichnen dazukommen, fallen einzeln ein.
      for (let k = settled; k < stones; k++) {
        const born = ghost?.born.get(k) ?? -Infinity
        const piece = stoneGeo(geo, MASONRY[k]!)
        withOpacity(f, tv(f, NEW_STONE_OPACITY, born, false), () => withXform(f, { y: tv(f, NEW_STONE_Y, born) }, () => drawStone(ctx, piece, pal)))
      }
      if (slot) {
        const pulse = loopOf(`slot-${wobbling}`, () => GHOST.slotPulse(wobbling)).at(clock).opacity ?? 1
        withOpacity(f, pulse, () => {
          const outline = stoneGeo(geo, slot).outline
          fillPoly(ctx, outline, '#fff', 0.45)
          strokePoly(ctx, outline, accent, { width: 1.25, dash: [2.5, 2] })
        })
      }
      drawPicture(f, over)
      if (lastDay) {
        const pulse = loopOf(`last-${wobbling}`, () => GHOST.lastDayPulse(wobbling)).at(clock).opacity ?? 1
        withOpacity(f, pulse, () => strokePoly(ctx, geo.outline, accent, { width: 1.5, dash: [3, 2.5], join: 'round' }))
      }
    }),
  )
  if (wobbling) drawWobbleMarks(f, geo, clock)
  else drawSparkles(f, geo, clock)
}

const sparklePaths = new WeakMap<BoxGeometry, { path: Path2D; loop: Loop }[]>()

function drawSparkles(f: Frame, geo: BoxGeometry, clock: number) {
  const { ctx } = f
  let groups = sparklePaths.get(geo)
  if (!groups) sparklePaths.set(geo, (groups = sparkles(geo).map(({ d, loop: spec }, g) => ({ path: new Path2D(d), loop: loopOf(`sparkle-${g}`, () => spec) }))))
  ctx.fillStyle = WORLD.inkSoft
  for (const g of groups) withAlpha(ctx, g.loop.at(clock).opacity ?? 1, () => ctx.fill(g.path))
}

function drawWobbleMarks(f: Frame, geo: BoxGeometry, clock: number) {
  const a = loopOf('wobble-blink', () => WOBBLE_BLINK).at(clock).opacity ?? 1
  withOpacity(f, a, () => {
    for (const pts of wobbleMarks(geo)) strokePoly(f.ctx, pts, WORLD.ink, { width: 2.5, cap: 'square', closed: false })
  })
}

function drawCrumbling(f: Frame, block: BlockVM, geo: BoxGeometry, carrying: boolean, clock: number) {
  const p = block.crumbleProgress ?? 0
  const pal = BLOCK_PALETTE[block.color]
  const wobble = loopOf(`crumble-${p}-${carrying}`, () => crumbleWobble(p, carrying)).at(clock)
  // Drehpunkt: rechte untere Ecke – der Block hebt links ab.
  withLoop(f, wobble, geo.E0, () => drawPicture(f, crumblingPicture(block, geo, carrying)))
  drawWobbleMarks(f, geo, clock)
  // Bröckelnde Pixel
  crumbleBits(geo).forEach(({ at, loop: spec }, i) => {
    const v = loopOf(`bit-${i}`, () => spec).at(clock)
    f.ctx.save()
    f.ctx.translate(at.x, at.y)
    withLoop(f, v, undefined, () => {
      f.ctx.fillStyle = pal.right
      f.ctx.fillRect(0, 0, 3, 3)
    })
    f.ctx.restore()
  })
}

// ───────────────────────────── Turm ─────────────────────────────

interface BlockState {
  born: number
  /** Fällt beim Erscheinen ein (Startseite). */
  drop: boolean
  y: Track
  opacity: Track
  landed: boolean
  ghost: GhostState | null
}

/** Ausblenden in der Detailansicht eines anderen Turms (wie `fadeAway`): 0,4 s, danach gar nicht mehr zeichnen. */
class Fade {
  private from = 1
  private to = 1
  private start = -Infinity
  private track: Track | null = null

  constructor(hidden: boolean) {
    this.from = this.to = hidden ? 0 : 1
  }

  set(hidden: boolean, now: number) {
    const to = hidden ? 0 : 1
    if (to === this.to) return
    this.from = this.at(now)
    this.to = to
    this.start = now
    this.track = keyTrack([this.from, to], { duration: 0.4, ease: [0.25, 0.1, 0.25, 1] })
  }

  at(t: number) {
    return this.track ? this.track.at(t - this.start) : this.to
  }
}

/** Gedrückt: Der Turm staucht sich leicht (wie `whileTap={{ scaleY: 0.96 }}`). */
class Press {
  private start = -Infinity
  private track: Track | null = null
  down = false

  set(down: boolean, now: number) {
    if (down === this.down) return
    const from = this.at(now)
    this.down = down
    this.start = now
    const to = down ? 0.96 : 1
    this.track = springTrack(from, to, { stiffness: 550, damping: 30, restSpeed: 10 })
  }

  at(t: number) {
    return this.track ? this.track.at(t - this.start) : 1
  }
}

interface ActiveEffect {
  effect: TowerEffect
  start: number
  slot: LostSlot | null
  settle: Track | null
  layer: EffectLayer | null
  lost: EffectLayer | null
}

/** Ein Turm über die Zeit: Blöcke, Ausblenden, Drücken, Neuigkeiten-Effekt. */
export class TowerSprite {
  placed: PlacedTower
  private fade: Fade
  private press = new Press()
  private pausedAt: number | null
  private blocks = new Map<ID, BlockState>()
  private effect: ActiveEffect | null = null
  hidden: boolean
  focused = false

  constructor(placed: PlacedTower, hidden: boolean, dropIn: boolean, now: number) {
    this.placed = placed
    this.hidden = hidden
    this.fade = new Fade(hidden)
    this.pausedAt = hidden || placed.tower.pausedSince ? now : null
    this.syncBlocks(dropIn, now)
  }

  update(placed: PlacedTower, hidden: boolean, effect: TowerEffect | null, dropIn: boolean, now: number) {
    this.placed = placed
    this.hidden = hidden
    this.fade.set(hidden, now)
    // Pausiert oder ausgeblendet: Wackeln, Bröckeln und Schweben stehen still.
    const paused = hidden || !!placed.tower.pausedSince
    if (paused && this.pausedAt === null) this.pausedAt = now
    if (!paused) this.pausedAt = null
    this.syncBlocks(dropIn, now)
    this.syncEffect(effect, now)
  }

  setPressed(down: boolean, now: number) {
    this.press.set(down, now)
  }

  private syncBlocks(dropIn: boolean, now: number) {
    const { tower, index } = this.placed
    const seen = new Set<ID>()
    for (const block of tower.blocks) {
      seen.add(block.id)
      let st = this.blocks.get(block.id)
      if (!st) {
        const delay = dropDelay(index, block.level)
        st = {
          born: now,
          drop: dropIn,
          y: springTrack(-90, 0, { stiffness: 380, damping: 22, delay }),
          opacity: keyTrack([0, 1], { duration: 0.15, delay }),
          landed: !dropIn,
          ghost: null,
        }
        this.blocks.set(block.id, st)
      }
      // Geist: Würfel beim ersten Zeichnen merken (wie `useState(stones)`), neue fallen ab jetzt ein.
      if (block.visual === 'forming') {
        const stones = Math.min(MASONRY.length, block.stones ?? 0)
        if (!st.ghost) st.ghost = { initial: stones, born: new Map(), landed: new Set() }
        for (let k = st.ghost.initial; k < stones; k++) if (!st.ghost.born.has(k)) st.ghost.born.set(k, now)
        for (const k of st.ghost.born.keys()) if (k >= stones) st.ghost.born.delete(k)
      } else {
        st.ghost = null
      }
    }
    for (const id of this.blocks.keys()) if (!seen.has(id)) this.blocks.delete(id)
  }

  private syncEffect(effect: TowerEffect | null, now: number) {
    if (!effect) {
      this.effect = null
      return
    }
    const { layout, ox, oy } = this.placed
    if (this.effect?.effect.key !== effect.key) {
      const slot = lostSlot(effect, layout, ox, oy)
      this.effect = {
        effect,
        start: now,
        slot,
        settle: slot
          ? keyTrack([-slot.lift, -slot.lift, 0], { duration: slot.settleAt + 0.3, times: [0, slot.settleAt / (slot.settleAt + 0.3), 1], ease: 'easeIn' })
          : null,
        layer: effectLayer(effect, this.placed),
        lost: slot ? lostEffect(effect, slot) : null,
      }
    }
  }

  /** Töne, die nicht am Zeichnen hängen dürfen (auch ausgeblendet oder außerhalb des Bilds). */
  tick(t: number) {
    for (const [, st] of this.blocks) {
      if (!st.landed && t - st.born >= Math.max(st.y.end, st.opacity.end)) {
        st.landed = true
        // Aufsetzen hörbar machen – höhere Blöcke klingen etwas heller.
        const block = this.placed.tower.blocks.find((b) => this.blocks.get(b.id) === st)
        if (st.drop && block) sfx('land', 0.85 + block.level * 0.07)
      }
      for (const [k, born] of st.ghost?.born ?? []) {
        if (st.ghost!.landed.has(k) || t - born < Math.max(NEW_STONE_Y.end, NEW_STONE_OPACITY.end)) continue
        st.ghost!.landed.add(k)
        sfx('stone')
      }
    }
  }

  /** Sichtbar (nicht ganz ausgeblendet)? */
  visibleAt(t: number) {
    return this.fade.at(t) > 0.001
  }

  draw(f: Frame, overlay?: BlockOverlay | null) {
    const alpha = this.fade.at(f.t)
    if (alpha <= 0.001) return
    // Halb ausgeblendet: wie SVG `<g opacity>` als Ganzes (Blöcke scheinen nicht durcheinander durch). Ohne Effekt
    // reicht der Bereich des Turms; ein Effekt kann weit darüber hinaus fliegen.
    const { base, layout } = this.placed
    const bounds = this.effect ? undefined : { x0: base.x - 100, y0: layout.topY - 60, x1: base.x + 100, y1: base.y + 60 }
    withGroupOpacity(f, alpha, () => this.drawContent(f, overlay), bounds)
  }

  private drawContent(f: Frame, overlay?: BlockOverlay | null) {
    const { ctx } = f
    const { layout, ox, oy } = this.placed
    // Kontaktschatten + Fokusrahmen (nur bei Tastaturfokus sichtbar)
    fillPoly(ctx, towerRing(ox, oy, 0.18), '#000', 0.09)
    if (this.focused) strokePoly(ctx, towerRing(ox, oy, 0.55), '#2d5f8a', { width: 2, dash: [5, 4] })

    const clock = loopClock(f, this.pausedAt)
    const fx = this.effect
    const slot = fx?.slot ?? null
    const anchor = layout.blocks[0]?.geo
    const origin = anchor ? { x: anchor.S0.x, y: anchor.S0.y } : this.placed.base
    const scaleY = f.still ? (this.press.down ? 0.96 : 1) : this.press.at(f.t)
    withXform(f, { scaleY, origin }, () => {
      layout.blocks.forEach(({ block, geo }, i) => {
        if (fx && slot && i === slot.level) fx.lost?.draw(f, f.t - fx.start, clock, false)
        const st = this.blocks.get(block.id)
        const settleY = fx?.settle && slot && i >= slot.level ? tv(f, fx.settle, fx.start) : 0
        const voxel = () => this.drawBlock(f, block, geo, i < layout.blocks.length - 1, clock, st)
        withXform(f, { y: settleY }, () => (overlay ? overlay.draw(f, i, geo, voxel) : voxel()))
      })
      if (fx && slot && slot.level >= layout.blocks.length) fx.lost?.draw(f, f.t - fx.start, clock, true)
      fx?.layer?.draw(f, f.t - fx.start, clock, false)
    })
  }

  private drawBlock(f: Frame, block: BlockVM, geo: BoxGeometry, carrying: boolean, clock: number, st: BlockState | undefined) {
    if (!st?.drop) return drawVoxel(f, block, geo, carrying, clock, st?.ghost ?? undefined)
    withOpacity(f, tv(f, st.opacity, st.born, false), () =>
      withXform(f, { y: tv(f, st.y, st.born) }, () => drawVoxel(f, block, geo, carrying, clock, st.ghost ?? undefined)),
    )
  }

  /** Trifft der Weltpunkt den Turm (Blöcke oder Fokusrahmen)? */
  hit(p: Pt) {
    const { layout, ox, oy } = this.placed
    return inPoly(p, towerRing(ox, oy, 0.55)) || layout.blocks.some(({ geo }) => inPoly(p, geo.outline))
  }
}

/** Liegt der Punkt im Polygon (gerade/ungerade Regel)? */
function inPoly(p: Pt, pts: Pt[]) {
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i]!
    const b = pts[j]!
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

// ───────────────────────────── Schutthaufen ─────────────────────────────

const rubblePictures = pictureCache<string>()

/** Wie `Rubble`: Brocken verlorener Blöcke neben dem Turm; neue fallen ein. */
export class RubbleSprite {
  placed: PlacedTower
  private fade: Fade
  private born = new Map<ID, { t: number; drop: boolean }>()
  private list: ReturnType<typeof rubblePieces> = []
  hiddenIds: ID[] | undefined
  focused = false

  constructor(placed: PlacedTower, hidden: boolean, hiddenIds: ID[] | undefined, dropIn: boolean, now: number) {
    this.placed = placed
    this.fade = new Fade(hidden)
    this.hiddenIds = hiddenIds
    this.sync(dropIn, now)
  }

  update(placed: PlacedTower, hidden: boolean, hiddenIds: ID[] | undefined, dropIn: boolean, now: number) {
    this.placed = placed
    this.fade.set(hidden, now)
    this.hiddenIds = hiddenIds
    this.sync(dropIn, now)
  }

  get at() {
    return { x: this.placed.ox + RUBBLE.x, y: this.placed.oy + RUBBLE.y }
  }

  private sync(dropIn: boolean, now: number) {
    const { tower } = this.placed
    this.list = rubblePieces(tower.id, tower.lost, this.at.x, this.at.y, this.hiddenIds)
    const ids = new Set(this.list.map((p) => p.id))
    for (const id of ids) if (!this.born.has(id)) this.born.set(id, { t: now, drop: dropIn })
    for (const id of this.born.keys()) if (!ids.has(id)) this.born.delete(id)
  }

  visibleAt(t: number) {
    return this.fade.at(t) > 0.001 && this.list.length > 0
  }

  draw(f: Frame) {
    const pieces = this.list
    if (!pieces.length) return
    const ring = rubbleRing(this.at.x, this.at.y)
    const area = unite(boundsOf(ring, 4), ...pieces.map((p) => boxBounds(p.geo, 4)))
    // Brocken fallen beim Erscheinen aus 40 px Höhe ein.
    withGroupOpacity(f, this.fade.at(f.t), () => {
      const { ctx } = f
      // Kontaktschatten = Trefferfläche, dazu der Fokusrahmen
      fillPoly(ctx, ring, '#000', 0.07)
      if (this.focused) strokePoly(ctx, ring, '#2d5f8a', { width: 2, dash: [4, 3] })
      const delay = dropDelay(this.placed.index, this.placed.tower.blocks.length)
      pieces.forEach((p, i) => {
        const pal = BLOCK_PALETTE[p.color]
        const pic = rubblePictures(`${p.id}|${p.color}|${geoKey(p.geo)}|${p.slot.h}`, () => ({
          bounds: boxBounds(p.geo, 2),
          draw(c) {
            drawBox(c, p.geo, pal, { texture: p.id, bevel: false })
            // Riss über die Vorderkante
            strokePoly(c, rubbleCrack(p.geo, p.slot.h), pal.edge, { width: 1.25, closed: false })
          },
        }))
        const born = this.born.get(p.id)
        if (!born?.drop) return drawPicture(f, pic)
        const y = pieceDrop(delay + i * 0.06)
        withOpacity(f, tv(f, y.opacity, born.t, false), () => withXform(f, { y: tv(f, y.y, born.t) }, () => drawPicture(f, pic)))
      })
    }, { ...area, y0: area.y0 - 40 })
  }

  hit(p: Pt) {
    return this.list.length > 0 && (inPoly(p, rubbleRing(this.at.x, this.at.y)) || this.list.some(({ geo }) => inPoly(p, geo.outline)))
  }
}

const drops = new Map<number, { y: Track; opacity: Track }>()
function pieceDrop(delay: number) {
  const key = Math.round(delay * 1000)
  let d = drops.get(key)
  if (!d) drops.set(key, (d = { y: springTrack(-40, 0, { stiffness: 420, damping: 18, delay }), opacity: keyTrack([0, 1], { duration: 0.12, delay }) }))
  return d
}

// ───────────────────────────── Effekte ─────────────────────────────

/** Was ein Block samt Wackel-Strichen, Funkeln und bröckelnden Pixeln belegt (Weltkoordinaten). */
const voxelArea = (geo: BoxGeometry) => ({ x0: geo.W1.x - 24, y0: geo.N1.y - 28, x1: geo.E1.x + 24, y1: geo.S0.y + 28 })

/** Ein laufender Effekt: zeichnet sich anhand der Zeit seit seinem Start (ms). */
interface EffectLayer {
  draw: (f: Frame, elapsed: number, clock: number, top: boolean) => void
}

const ease = { easeIn: 'easeIn' as const }

/** Der verlorene Block an seinem Platz: fällt ab bzw. zerspringt (wie `LostBlockEffect`). */
function lostEffect(effect: TowerEffect, slot: LostSlot): EffectLayer {
  const { block, geo } = slot
  const falling = { ...block, visual: 'crumbling' as const, crumbleProgress: 1 }
  if (effect.kind === 'break') return shattering(block, geo)
  // Bröckelnder Block oben: wackelt kurz, kippt über die Kante und fällt. In der Mitte: rutscht nach vorne heraus.
  const top = {
    x: keyTrack([0, 0, 34, 100], { duration: 2.6, times: [0, 0.45, 0.68, 1], ease: ease.easeIn, delay: EFFECT_START }),
    y: keyTrack([0, 0, 36, 280], { duration: 2.6, times: [0, 0.45, 0.68, 1], ease: ease.easeIn, delay: EFFECT_START }),
    rotate: keyTrack([0, 0, 32, 95], { duration: 2.6, times: [0, 0.45, 0.68, 1], ease: ease.easeIn, delay: EFFECT_START }),
    opacity: keyTrack([1, 1, 1, 0], { duration: 2.6, times: [0, 0.45, 0.68, 1], ease: ease.easeIn, delay: EFFECT_START }),
  }
  const slideTimes = [0, 0.1, 0.2, 0.3, 0.4, 0.62, 1]
  const mid = {
    x: keyTrack([0, -2, 2, -2, 0, 64, 96], { duration: 2.4, times: slideTimes, ease: ease.easeIn, delay: EFFECT_START }),
    y: keyTrack([0, 0, 0, 0, 0, 32, 290], { duration: 2.4, times: slideTimes, ease: ease.easeIn, delay: EFFECT_START }),
    opacity: keyTrack([1, 1, 1, 1, 1, 1, 0], { duration: 2.4, times: slideTimes, ease: ease.easeIn, delay: EFFECT_START }),
  }
  // Drehpunkt rechts unten am Umriss des Blocks samt Wackel-Strichen.
  const corner = { x: geo.E1.x + 12, y: geo.S0.y }
  return {
    draw(f, e, clock, isTop) {
      const v = (t: Track, transform = true) => (f.still && transform ? t.final : t.at(e))
      const motion = isTop ? top : mid
      withXform(f, { x: v(motion.x), y: v(motion.y), rotate: isTop ? v(top.rotate) : 0, origin: corner }, () =>
        withGroupOpacity(f, v(motion.opacity, false), () => drawVoxel(f, falling, geo, false, clock), voxelArea(geo)),
      )
    },
  }
}

/** Geister-Block zittert und zerspringt in Pixel-Splitter (wie `ShatteringBlock`). */
function shattering(block: BlockVM, geo: BoxGeometry): EffectLayer {
  const ghost = { ...block, visual: 'forming' as const }
  const fadeOut = keyTrack([1, 1, 0], { duration: 1.3, times: [0, 0.75, 1], delay: EFFECT_START })
  const shake = keyTrack([0, -2, 2, -2, 2, 0], { duration: 0.9, delay: EFFECT_START })
  const shards = shatterShards(block, geo).map((s) => {
    const o = { duration: 1.7, delay: EFFECT_START + 1, ease: ease.easeIn }
    return {
      ...s,
      opacity: keyTrack([0, 1, 1, 0], o),
      mx: keyTrack([0, s.dx * 0.35, s.dx], o),
      my: keyTrack([0, -14, s.dy], o),
      turn: keyTrack([0, s.rotate], o),
    }
  })
  return {
    draw(f, e, clock) {
      const { ctx } = f
      const v = (t: Track, transform = true) => (f.still && transform ? t.final : t.at(e))
      withXform(f, { x: v(shake) }, () => withGroupOpacity(f, v(fadeOut, false), () => drawVoxel(f, ghost, geo, false, clock), voxelArea(geo)))
      for (const s of shards) {
        if (e < (EFFECT_START + 1) * 1000) continue
        ctx.save()
        ctx.translate(s.x, s.y)
        withOpacity(f, v(s.opacity, false), () =>
          withXform(f, { x: v(s.mx), y: v(s.my), rotate: v(s.turn), origin: { x: s.size / 2, y: s.size / 2 } }, () => {
            ctx.fillStyle = s.fill
            ctx.fillRect(0, 0, s.size, s.size)
            ctx.strokeStyle = '#fff'
            ctx.lineWidth = 0.6
            ctx.strokeRect(0, 0, s.size, s.size)
          }),
        )
        ctx.restore()
      }
    },
  }
}

/** Effekte über dem ganzen Turm (wie `TowerEffectLayer`): Einsturz, Verfestigen, Bröckeln. */
function effectLayer(effect: TowerEffect, placed: PlacedTower): EffectLayer | null {
  const { layout, ox, oy } = placed
  if (effect.kind === 'collapse') return collapsing(collapseSlots(effect.blocks, layout, ox, oy))
  if (effect.kind !== 'solidify' && effect.kind !== 'crumble') return null
  const target = layout.blocks.find((b) => b.block.id === effect.habitId)
  if (!target) return null
  return effect.kind === 'solidify' ? solidifyFlash(target.geo) : crumbleBurst(target.block, target.geo)
}

/** Einsturz: Die Blöcke über dem Anker zittern gemeinsam und kippen dann einer nach dem anderen ab, der oberste zuerst. */
function collapsing(slots: { block: BlockVM; geo: BoxGeometry }[]): EffectLayer {
  const parts = slots.map(({ block, geo }, i) => {
    // Erst zittern alle (0,9 s), dann kippt alle 0,3 s der nächste ab – abwechselnd nach rechts und links.
    const order = slots.length - 1 - i
    const dir = order % 2 ? -1 : 1
    const fallAt = 0.9 + order * 0.3
    const total = fallAt + 1.5
    const o = { duration: total, times: [0, 0.1, 0.2, 0.3, fallAt, fallAt + 0.55, total].map((t) => t / total), ease: ease.easeIn, delay: EFFECT_START }
    return {
      block: { ...block, visual: 'crumbling' as const, crumbleProgress: 1 },
      geo,
      carrying: i < slots.length - 1,
      origin: { x: dir > 0 ? geo.E1.x + 12 : geo.W1.x - 12, y: geo.S0.y },
      x: keyTrack([0, -2, 2, -2, 0, dir * 34, dir * 100], o),
      y: keyTrack([0, 0, 0, 0, 0, 36, 300], o),
      rotate: keyTrack([0, 0, 0, 0, 0, dir * 32, dir * 95], o),
      opacity: keyTrack([1, 1, 1, 1, 1, 1, 0], o),
    }
  })
  return {
    draw(f, e, clock) {
      const v = (t: Track, transform = true) => (f.still && transform ? t.final : t.at(e))
      for (const p of parts) {
        withXform(f, { x: v(p.x), y: v(p.y), rotate: v(p.rotate), origin: p.origin }, () =>
          withGroupOpacity(f, v(p.opacity, false), () => drawVoxel(f, p.block, p.geo, p.carrying, clock), voxelArea(p.geo)),
        )
      }
    },
  }
}

/** Weißer Blitz über dem Block + Funken: Geist wird massiv. */
function solidifyFlash(geo: BoxGeometry): EffectLayer {
  const flash = keyTrack([0, 0.95, 0], { duration: 1.4, delay: EFFECT_START })
  const burst = burstLayer(geo.N1, EFFECT_START + 0.4)
  return {
    draw(f, e, clock, top) {
      const a = flash.at(e)
      withOpacity(f, a, () => {
        for (const pts of [geo.left, geo.right, geo.top]) fillPoly(f.ctx, pts, '#fff')
      })
      burst.draw(f, e, clock, top)
    },
  }
}

/** Bröckeln: Brocken lösen sich an beiden sichtbaren Seiten vom Block und rieseln herab. */
function crumbleBurst(block: BlockVM, geo: BoxGeometry): EffectLayer {
  const chips = crumbleChips(block, geo).map((c) => {
    const o = { duration: 1.2, delay: c.delay, ease: ease.easeIn }
    return { ...c, opacity: keyTrack([0, 1, 1, 0], o), mx: keyTrack([0, c.dx * 0.4, c.dx], o), my: keyTrack([0, 4, c.dy], o) }
  })
  return {
    draw(f, e) {
      const { ctx } = f
      for (const c of chips) {
        const a = c.opacity.at(e)
        if (a <= 0.001) continue
        ctx.save()
        ctx.translate(c.x + (f.still ? c.mx.final : c.mx.at(e)), c.y + (f.still ? c.my.final : c.my.at(e)))
        withAlpha(ctx, a, () => {
          ctx.fillStyle = c.fill
          ctx.fillRect(0, 0, c.size, c.size)
          ctx.strokeStyle = '#fff'
          ctx.lineWidth = 0.5
          ctx.strokeRect(0, 0, c.size, c.size)
        })
        ctx.restore()
      }
    },
  }
}

/** Pixel-Funken, die sich von einem Punkt ausbreiten (wie `Burst`). */
export function burstLayer(at: Pt, delay: number): EffectLayer {
  const rays = BURST_RAYS.map((a, i) => {
    const o = { duration: 1.1, ease: 'easeOut' as const, delay }
    return { fill: i % 2 ? '#ddb457' : '#fff', x: keyTrack([0, Math.cos(a) * 46], o), y: keyTrack([0, Math.sin(a) * 30 - 10], o), opacity: keyTrack([0, 1, 0], o) }
  })
  return {
    draw(f, e) {
      const { ctx } = f
      if (e < delay * 1000) return
      for (const r of rays) {
        const a = r.opacity.at(e)
        if (a <= 0.001) continue
        const x = f.still ? r.x.final : r.x.at(e)
        const y = f.still ? r.y.final : r.y.at(e)
        ctx.save()
        ctx.translate(at.x + x, at.y - 10 + y)
        withAlpha(ctx, a, () => {
          ctx.fillStyle = r.fill
          ctx.fillRect(-1, -4, 2, 8)
          ctx.fillRect(-4, -1, 8, 2)
        })
        ctx.restore()
      }
    },
  }
}
