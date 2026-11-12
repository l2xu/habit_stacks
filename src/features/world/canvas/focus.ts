import type { MotionValue } from 'framer-motion'
import type { FocusSession, FocusStepStatus } from '@/domain/types'
import { ACTIVE, DONE_BADGE, dustOrigins } from '@/features/focus/focusMarks'
import type { BoxGeometry } from '../iso'
import { WORLD } from '../palette'
import type { PlacedTower } from '../worldLayout'
import { faceTransform, fillPoly, strokePoly, withAlpha } from './paint2d'
import { keyTrack, loop, loopClock, springTrack, tv, withLoop, withOpacity, withXform, type Frame } from './runtime'
import { burstLayer, type BlockOverlay } from './towers'

/**
 * Fokus-Modus im Canvas (wie `FocusBlock` in `FocusScene`): Der aktive Block ist markiert, der Timer füllt ihn mit
 * Licht, erledigte rasten mit Squash & Stretch ein (Haken, Staubwolke), am Ende sprühen Funken über der Spitze.
 */

const SQUASH = {
  y: keyTrack([1, 0.84, 1.07, 1], { duration: 0.45, ease: 'easeOut' }),
  x: keyTrack([1, 1.06, 0.98, 1], { duration: 0.45, ease: 'easeOut' }),
}
const BADGE_POP = springTrack(0, 1, { stiffness: 600, damping: 14, delay: 0.15 })
const DUST = {
  y: keyTrack([0, -10], { duration: 0.55, ease: 'easeOut' }),
  opacity: keyTrack([0.9, 0], { duration: 0.55, ease: 'easeOut' }),
  x: new Map<number, ReturnType<typeof keyTrack>>(),
}
const dustX = (dx: number) => {
  let t = DUST.x.get(dx)
  if (!t) DUST.x.set(dx, (t = keyTrack([0, dx * 18], { duration: 0.55, ease: 'easeOut' })))
  return t
}
const MARCH = loop(ACTIVE.march)
const NUDGE = loop(ACTIVE.nudge)

interface StepState {
  /** Stand beim ersten Zeichnen – nur Blöcke, die in dieser Sitzung erledigt werden, rasten sichtbar ein. */
  initial: FocusStepStatus
  status: FocusStepStatus
  /** Wann der Block erledigt wurde (null = schon vorher oder gar nicht). */
  doneAt: number | null
}

export class FocusOverlay implements BlockOverlay {
  private steps: StepState[] = []
  private session: FocusSession
  private charge: MotionValue<number> | null
  private completedAt: number | null = null
  private burst: ReturnType<typeof burstLayer> | null = null

  constructor(session: FocusSession, charge: MotionValue<number> | null, now: number) {
    this.session = session
    this.charge = charge
    this.update(session, charge, now)
  }

  update(session: FocusSession, charge: MotionValue<number> | null, now: number) {
    this.session = session
    this.charge = charge
    session.steps.forEach((step, i) => {
      const st = this.steps[i]
      if (!st) {
        this.steps[i] = { initial: step.status, status: step.status, doneAt: null }
        return
      }
      if (step.status === 'done' && st.status !== 'done') st.doneAt = now
      if (step.status !== 'done') st.doneAt = null
      st.status = step.status
    })
    const completed = session.state === 'completed'
    if (completed && this.completedAt === null) this.completedAt = now
    if (!completed) this.completedAt = null
  }

  draw(f: Frame, i: number, geo: BoxGeometry, voxel: () => void) {
    const st = this.steps[i]
    const status = st?.status ?? 'pending'
    const completed = this.session.state === 'completed'
    const active = !completed && i === this.session.activeIndex
    const done = status === 'done'
    const justDone = done && st?.initial !== 'done'
    const doneAt = st?.doneAt ?? null
    const scale = doneAt !== null && !f.still ? { scaleX: SQUASH.x.at(f.t - doneAt), scaleY: SQUASH.y.at(f.t - doneAt) } : {}
    // Gestaucht um die Unterkante des Blocks.
    withXform(f, { ...scale, origin: { x: geo.S0.x, y: geo.S0.y } }, () => {
      voxel()
      if (status === 'skipped') skippedCover(f, geo)
      if (active && this.charge) chargeOverlay(f, geo, this.charge.get())
      if (active) activeMarker(f, geo)
      if (done) doneBadge(f, geo, justDone ? doneAt : null)
      if (justDone && doneAt !== null) dustPuff(f, geo, doneAt)
    })
  }

  /** Nach der Welt: Funken über der Turmspitze, sobald die Routine geschafft ist. */
  drawAfter(f: Frame, me: PlacedTower | undefined) {
    const top = me?.layout.blocks.at(-1)
    if (this.completedAt === null || !top) {
      this.burst = null
      return
    }
    this.burst ??= burstLayer(top.geo.N1, 0.2)
    this.burst.draw(f, f.t - this.completedAt, 0, false)
  }
}

/** Übersprungen: deckender Dunst über dem Block – bleibt massiv, wirkt aber blass (nicht wie ein Geist). */
function skippedCover(f: Frame, geo: BoxGeometry) {
  for (const pts of [geo.left, geo.right, geo.top]) fillPoly(f.ctx, pts, '#e6ebda', 0.62)
}

/** Timer füllt den Block von unten nach oben mit Licht; die helle Kante steht auf der Füllhöhe. */
function chargeOverlay(f: Frame, geo: BoxGeometry, value: number) {
  const { ctx } = f
  const fill = Math.min(1, Math.max(0, value))
  const h = geo.height
  for (const [side, o] of [
    ['left', geo.W1],
    ['right', geo.S1],
  ] as const) {
    ctx.save()
    faceTransform(ctx, side, o)
    ctx.fillStyle = '#fff'
    withAlpha(ctx, 0.3, () => ctx.fillRect(0, h * (1 - fill), geo.faceW, h * fill))
    if (fill > 0 && fill < 1) withAlpha(ctx, 0.8, () => ctx.fillRect(0, h - h * fill, geo.faceW, 2))
    ctx.restore()
  }
}

/** Umlaufende Laufschrift-Kontur + Pfeil links unten am aktiven Block. */
function activeMarker(f: Frame, geo: BoxGeometry) {
  const { ctx } = f
  const clock = loopClock(f)
  strokePoly(ctx, geo.outline, '#fff', { width: 4, join: 'round', alpha: 0.9 })
  // Laufende Kontur: Die Strichlücke wandert einmal um 6 + 5 px weiter
  strokePoly(ctx, geo.outline, WORLD.ink, { width: 2, join: 'round', dash: [6, 5], dashOffset: MARCH.at(clock).strokeDashoffset ?? 0 })
  const at = ACTIVE.arrowAt(geo)
  ctx.save()
  ctx.translate(at.x, at.y)
  withLoop(f, NUDGE.at(clock), undefined, () => {
    ctx.fillStyle = WORLD.ink
    for (const r of ACTIVE.arrow) ctx.fillRect(r.x, r.y, r.w, r.h)
  })
  ctx.restore()
}

/** Haken-Schild; springt auf, wenn der Block gerade erledigt wurde (`popAt`). */
function doneBadge(f: Frame, geo: BoxGeometry, popAt: number | null) {
  const { ctx } = f
  const at = DONE_BADGE.at(geo)
  const s = popAt === null ? 1 : tv(f, BADGE_POP, popAt)
  if (s <= 0.001) return
  ctx.save()
  ctx.translate(at.x, at.y)
  withXform(f, { scaleX: s, scaleY: s, origin: { x: 7.5, y: 7.5 } }, () => {
    ctx.fillStyle = '#cfdcae'
    ctx.fillRect(0, 0, 15, 15)
    ctx.strokeStyle = '#3f5a33'
    ctx.lineWidth = 1.5
    ctx.strokeRect(0, 0, 15, 15)
    ctx.fillStyle = '#3f5a33'
    for (const r of DONE_BADGE.check) ctx.fillRect(r.x, r.y, 2, 2)
  })
  ctx.restore()
}

/** Kleine Staubwolke an der Unterkante beim Einrasten. */
function dustPuff(f: Frame, geo: BoxGeometry, start: number) {
  const { ctx } = f
  const e = f.t - start
  const a = DUST.opacity.at(e)
  if (a <= 0.001) return
  for (const { p, dx } of dustOrigins(geo)) {
    const x = f.still ? dx * 18 : dustX(dx).at(e)
    const y = f.still ? -10 : DUST.y.at(e)
    ctx.save()
    ctx.translate(p.x + x, p.y + y)
    withOpacity(f, a, () => {
      ctx.fillStyle = '#f1f2ea'
      ctx.fillRect(0, 0, 4, 4)
    })
    ctx.restore()
  }
}
