import { SKY_LAYERS } from '../altitude'
import { berryRects, BUTTERFLY, bushBoxes, DECOR_LOOPS, decorParts, flowerParts, frogBoxes, lilyParts, reedBoxes, treeGeometry, tuftBoxes, type DecorPart } from '../Decor'
import { boxGeometry, project, type BoxGeometry, type Pt } from '../iso'
import type { DecorItem, Island } from '../island'
import { fallStreaks, shimmerPulse, shimmerRects, SHIMMER_DELAYS, sprayRects, SPRAY_PULSE, type Fall } from '../IsoIsland'
import { BOAT, boatSpot, FOAM_PULSE, HAZE, ISLET_BOXES, seaShapes, WAVE_GROUPS, wavePulse } from '../IsoSea'
import { mergeShapes, rectPath, type Shape } from '../paint'
import { WORLD } from '../palette'
import { BIRD, drift, flap, MOON, skyFade, skyLife, skyStars, TWINKLE_DELAYS, twinkle } from '../Sky'
import type { Rect } from '../worldLayout'
import { boundsOf, boxBounds, drawBox, drawBoxPaths, faceTransform, fillPoly, fillRects, strokePoly, unite, withAlpha } from './paint2d'
import { drawPicture, type Picture } from './picture'
import { loop, loopClock, withLoop, type Ctx, type Frame } from './runtime'

/** Zeichnet einen Teil der Welt in einem Frame. */
export type Drawer = (f: Frame) => void

/** Farbverläufe gehören zu einem Kontext – je Kontext einmal anlegen. */
function gradientFor(make: (ctx: Ctx) => CanvasGradient) {
  const memo = new WeakMap<Ctx, CanvasGradient>()
  return (ctx: Ctx) => {
    let g = memo.get(ctx)
    if (!g) memo.set(ctx, (g = make(ctx)))
    return g
  }
}

/** Rechteck, auf den sichtbaren Ausschnitt beschnitten (riesige Flächen wie Himmel und Meer). */
function fillClipped(f: Frame, r: Rect) {
  const { view } = f
  const x0 = Math.max(r.x0, view.x0)
  const y0 = Math.max(r.y0, view.y0)
  const x1 = Math.min(r.x1, view.x1)
  const y1 = Math.min(r.y1, view.y1)
  if (x1 > x0 && y1 > y0) f.ctx.fillRect(x0, y0, x1 - x0, y1 - y0)
}

const crossesView = (f: Frame, r: Rect) => r.x0 < f.view.x1 && r.x1 > f.view.x0 && r.y0 < f.view.y1 && r.y1 > f.view.y0

// ───────────────────────────── Himmel ─────────────────────────────

/** Wie `SkyBackdrop`: Verlauf, Sterne (drei Gruppen funkeln), Mond. */
export function skyBackdrop(island: Island): Drawer {
  const fade = skyFade(island)
  const { stars, moon } = skyStars(island)
  const gradient = gradientFor((ctx) => {
    const g = ctx.createLinearGradient(0, fade.y0, 0, fade.y1)
    for (const s of fade.stops) g.addColorStop(s.offset, s.color)
    return g
  })
  const still = stars.filter((s) => s.group === null).map((s) => ({ opacity: s.opacity, path: new Path2D(s.d) }))
  const groups = TWINKLE_DELAYS.map((delay, g) => ({
    loop: loop(twinkle(delay)),
    paths: stars.filter((s) => s.group === g).map((s) => ({ opacity: s.opacity, path: new Path2D(s.d) })),
  }))
  const moonPic: Picture = {
    bounds: { x0: moon.x - 33, y0: moon.y - 33, x1: moon.x + 33, y1: moon.y + 33 },
    draw(ctx) {
      ctx.save()
      ctx.translate(moon.x, moon.y)
      circle(ctx, 0, 0, MOON.r)
      ctx.fillStyle = MOON.fill
      ctx.fill()
      ctx.strokeStyle = MOON.rim
      ctx.lineWidth = 3
      ctx.stroke()
      ctx.fillStyle = MOON.crater
      for (const c of MOON.craters) {
        circle(ctx, c.x, c.y, c.r)
        ctx.fill()
      }
      ctx.restore()
    },
  }
  // Sterne gibt es erst weit oben – liegt der Ausschnitt ganz darunter, sparen wir uns die Pfade.
  const starsBelow = -SKY_LAYERS.stars.from + 3

  return (f) => {
    const { ctx } = f
    ctx.fillStyle = gradient(ctx)
    fillClipped(f, { x0: -20000, y0: -20000, x1: 20000, y1: fade.y0 + 1 })
    if (f.view.y0 > starsBelow) return
    ctx.fillStyle = '#f5f1dc'
    for (const s of still) withAlpha(ctx, s.opacity, () => ctx.fill(s.path))
    const t = loopClock(f)
    for (const g of groups) {
      const a = g.loop.at(t).opacity ?? 1
      for (const s of g.paths) withAlpha(ctx, s.opacity * a, () => ctx.fill(s.path))
    }
    drawPicture(f, moonPic)
  }
}

function circle(ctx: Ctx, x: number, y: number, r: number) {
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
}

/** Wie `SkyLife`: ziehende Wolken und Vogelschwärme. */
export function skyLifeDrawer(island: Island): Drawer {
  const { left, width, clouds, flocks } = skyLife(island)
  const cloudPics = clouds.map((c) => {
    const pic: Picture = { bounds: unite(...c.parts.map((g) => boxBounds(g))), draw: (ctx) => drawBoxPaths(ctx, c.parts, WORLD.cloud) }
    return { ...c, pic, loop: loop(drift(width, width / c.speed, c.phase)), bounds: pic.bounds }
  })
  const flockLoops = flocks.map((fl) => ({
    ...fl,
    loop: loop(drift(width, width / fl.speed, fl.phase)),
    flaps: fl.birds.map((b, k) => loop(flap(b.flap, k))),
  }))
  const bird = new Path2D()
  BIRD.forEach((p, i) => (i ? bird.lineTo(p.x, p.y) : bird.moveTo(p.x, p.y)))

  return (f) => {
    const { ctx } = f
    const t = loopClock(f)
    for (const c of cloudPics) {
      const x = left + (c.loop.at(t).x ?? 0)
      const y = -c.alt
      if (!crossesView(f, { x0: c.bounds.x0 + x, y0: c.bounds.y0 + y, x1: c.bounds.x1 + x, y1: c.bounds.y1 + y })) continue
      ctx.save()
      ctx.translate(x, y)
      f.motion++
      drawPicture(f, c.pic, c.opacity)
      f.motion--
      ctx.restore()
    }
    ctx.strokeStyle = WORLD.ink
    ctx.lineWidth = 1.8
    ctx.lineJoin = 'round'
    ctx.lineCap = 'butt'
    for (const fl of flockLoops) {
      const x = left + (fl.loop.at(t).x ?? 0)
      const y = -fl.alt
      if (!crossesView(f, { x0: x - 80, y0: y - 30, x1: x + 20, y1: y + 30 })) continue
      fl.birds.forEach((b, k) => {
        const scaleY = fl.flaps[k]!.at(t).scaleY ?? 1
        ctx.save()
        // Flügelschlag um die Unterkante des V (unten Mitte).
        ctx.translate(x + b.dx, y + b.dy)
        ctx.scale(1, scaleY)
        withAlpha(ctx, 0.75, () => ctx.stroke(bird))
        ctx.restore()
      })
    }
  }
}

// ───────────────────────────── Meer ─────────────────────────────

/** Wie `IsoSea`: Verlauf vom Dunst ins Meerblau, Horizontlinie, Inselchen, Saum, Gischt, Wellen. */
export function seaDrawer(island: Island): Drawer {
  const { horizon, skirt, foam, waves, islets } = seaShapes(island)
  const gradient = gradientFor((ctx) => {
    const g = ctx.createLinearGradient(0, horizon, 0, horizon + HAZE)
    g.addColorStop(0, WORLD.seaHaze)
    g.addColorStop(0.55, WORLD.sea)
    g.addColorStop(1, WORLD.sea)
    return g
  })
  const isletPics = islets.map((it): Picture => {
    const box = (g: BoxGeometry) => boxBounds(g)
    const local = unite(...ISLET_BOXES.map((b) => box(b.geo)))
    return {
      bounds: { x0: it.x + local.x0 * it.s, y0: it.y + local.y0 * it.s, x1: it.x + local.x1 * it.s, y1: it.y + local.y1 * it.s },
      draw(ctx) {
        ctx.save()
        ctx.translate(it.x, it.y)
        ctx.scale(it.s, it.s)
        for (const b of ISLET_BOXES) drawBox(ctx, b.geo, b.palette, { bevel: false })
        ctx.restore()
      },
    }
  })
  const skirtPath = new Path2D(skirt)
  const foamPath = new Path2D(foam)
  const foamLoop = loop(FOAM_PULSE)
  const wavePaths = waves.map((d, g) => ({ path: new Path2D(d), loop: loop(wavePulse(WAVE_GROUPS[g]!)) }))

  return (f) => {
    const { ctx } = f
    ctx.fillStyle = gradient(ctx)
    fillClipped(f, { x0: -8000, y0: horizon, x1: 8000, y1: horizon + 12000 })
    ctx.beginPath()
    ctx.moveTo(Math.max(-8000, f.view.x0), horizon + 0.5)
    ctx.lineTo(Math.min(8000, f.view.x1), horizon + 0.5)
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1
    withAlpha(ctx, 0.6, () => ctx.stroke())
    // Wie SVG `<g opacity>`: zwei Quader eines Inselchens scheinen nicht durcheinander durch.
    for (const pic of isletPics) drawPicture(f, pic, 0.45)
    ctx.fillStyle = WORLD.seaDeep
    ctx.fill(skirtPath)
    const t = loopClock(f)
    ctx.strokeStyle = WORLD.foam
    ctx.lineWidth = 2.5
    ctx.lineCap = 'square'
    withAlpha(ctx, foamLoop.at(t).opacity ?? 1, () => ctx.stroke(foamPath))
    ctx.lineCap = 'butt'
    ctx.fillStyle = WORLD.wave
    for (const w of wavePaths) {
      const v = w.loop.at(t)
      ctx.save()
      ctx.translate(v.x ?? 0, 0)
      withAlpha(ctx, v.opacity ?? 1, () => ctx.fill(w.path))
      ctx.restore()
    }
  }
}

/** Wie `Boat`: treibt hin und her und schaukelt. */
export function boatDrawer(island: Island): Drawer {
  const at = boatSpot(island)
  const box = unite(boundsOf(BOAT.shadow), ...BOAT.boxes.map((g) => boxBounds(g, 0)), ...BOAT.sails.map((s) => boundsOf(s.pts)))
  // Drehpunkt wie SVG (`transform-box: fill-box`): Mitte des Umrisses ohne Kanten.
  const origin = { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 }
  const pic: Picture = {
    bounds: { x0: box.x0 - 3, y0: box.y0 - 3, x1: box.x1 + 3, y1: box.y1 + 3 },
    draw(ctx) {
      fillPoly(ctx, BOAT.shadow, WORLD.seaDeep)
      for (const g of BOAT.boxes) drawBox(ctx, g, WORLD.trunk, { bevel: false })
      for (const s of BOAT.sails) {
        fillPoly(ctx, s.pts, s.fill)
        strokePoly(ctx, s.pts, s.stroke, { width: 1, join: 'round' })
      }
    },
  }
  const driftLoop = loop(BOAT.drift)
  const rock = loop(BOAT.rock)
  return (f) => {
    const t = loopClock(f)
    f.ctx.save()
    f.ctx.translate(at.x, at.y)
    withLoop(f, driftLoop.at(t), undefined, () => withLoop(f, rock.at(t), origin, () => drawPicture(f, pic)))
    f.ctx.restore()
  }
}

// ───────────────────────────── Insel ─────────────────────────────

/** Inselflächen (wie `IslandPaths`): Füllung, Rand in Flächenfarbe gegen Nähte. */
export function drawIslandShapes(ctx: Ctx, paths: { style: string; path: Path2D }[]) {
  for (const { style, path } of paths) {
    const [fill, kind] = style.split(' ')
    ctx.fillStyle = fill!
    ctx.fill(path)
    if (kind === 'tuft') continue
    ctx.strokeStyle = fill!
    ctx.lineWidth = kind === 'top' ? 0.6 : 0.5
    ctx.lineJoin = kind === 'top' ? 'round' : 'miter'
    ctx.stroke(path)
  }
}

const mergedIsland = (shapes: Shape[]) => mergeShapes(shapes).map(({ style, d }) => ({ style, path: new Path2D(d) }))

/** Inselflächen als Bild (z. B. Uferstücke vor einem Turm). */
export function shapesPicture(shapes: Shape[]): Picture {
  const paths = mergedIsland(shapes)
  return { bounds: unite(...shapes.map((s) => boundsOf(s.poly.pts, 1))), draw: (ctx) => drawIslandShapes(ctx, paths) }
}

/** Boden unter allem Bewegten: Inselflächen und stille Deko in Zeichenreihenfolge (wie `StaticGround`). */
export function groundPicture(shapes: Shape[], decor: { item: DecorItem; part: DecorPart }[]): Picture {
  const paths = mergedIsland(shapes)
  const bounds = unite(...shapes.map((s) => boundsOf(s.poly.pts, 2)), ...decor.flatMap((d) => decorParts(d.item).filter((p) => p.part === d.part).map((p) => p.bounds)))
  return {
    bounds,
    draw(ctx) {
      drawIslandShapes(ctx, paths)
      for (const d of decor) drawStillDecor(ctx, d.item)
    },
  }
}

/** Wie `Waterfall`: Fläche, nach unten laufende Streifen (beschnitten), pulsierende Gischt am Fuß. */
export function waterfallDrawer(fall: Fall): Drawer {
  const { side, top, bottom } = fall
  const { h, d, loop: spec } = fallStreaks(fall)
  const streaks = new Path2D(d)
  const run = loop(spec)
  const spray = new Path2D(sprayRects(fall).map((r) => rectPath(r.x, r.y, r.w, r.h)).join(''))
  const pulse = loop(SPRAY_PULSE)
  const face = [top[0], top[1], bottom[1], bottom[0]]
  return (f) => {
    const { ctx } = f
    const t = loopClock(f)
    fillPoly(ctx, face, WORLD.pond)
    ctx.save()
    faceTransform(ctx, side, top[0])
    ctx.beginPath()
    ctx.rect(0, 0, 24, h)
    ctx.clip()
    ctx.translate(0, run.at(t).y ?? 0)
    ctx.fillStyle = WORLD.foam
    ctx.fill(streaks)
    ctx.restore()
    ctx.fillStyle = WORLD.foam
    withAlpha(ctx, pulse.at(t).opacity ?? 1, () => ctx.fill(spray))
  }
}

/** Wie `PondShimmer`: Lichtreflexe auf Teich und Bach in drei Gruppen. */
export function shimmerDrawer(island: Island): Drawer {
  const groups = shimmerRects(island).map((rects, g) => ({
    path: new Path2D(rects.map((r) => rectPath(r.x, r.y, r.w, r.h)).join('')),
    loop: loop(shimmerPulse(SHIMMER_DELAYS[g]!)),
  }))
  return (f) => {
    const t = loopClock(f)
    f.ctx.fillStyle = '#fff'
    for (const g of groups) withAlpha(f.ctx, g.loop.at(t).opacity ?? 1, () => f.ctx.fill(g.path))
  }
}

// ───────────────────────────── Deko ─────────────────────────────

/** Stille Deko bzw. stiller Teil (Baum: Schatten und Stamm), wie `Decor` mit `part = 'still'`. */
function drawStillDecor(ctx: Ctx, item: DecorItem) {
  switch (item.kind) {
    case 'tuft':
      for (const g of tuftBoxes(item)) drawBox(ctx, g, WORLD.tuft, { bevel: false })
      return
    case 'flower': {
      const { stem, petals, dot } = flowerParts(item)
      drawBox(ctx, stem, WORLD.tuft, { bevel: false })
      ctx.fillStyle = item.color
      ctx.fillRect(petals.x, petals.y, petals.w, petals.h)
      ctx.strokeStyle = '#00000022'
      ctx.lineWidth = 0.6
      ctx.strokeRect(petals.x, petals.y, petals.w, petals.h)
      ctx.fillStyle = WORLD.mustardDot
      ctx.fillRect(dot.x, dot.y, dot.w, dot.h)
      return
    }
    case 'stone':
      drawBox(ctx, boxGeometry(item.x, item.y, item.half, 0, 3), WORLD.stone, { bevel: false })
      return
    case 'tree': {
      const { shadow, trunk } = treeGeometry(item)
      ctx.beginPath()
      ctx.ellipse(shadow.cx, shadow.cy, shadow.rx, shadow.ry, 0, 0, Math.PI * 2)
      ctx.fillStyle = '#000'
      withAlpha(ctx, 0.08, () => ctx.fill())
      drawBox(ctx, trunk, WORLD.trunk, { bevel: false })
      return
    }
    case 'bush': {
      const { body, top } = bushBoxes(item)
      drawBox(ctx, body, WORLD.bush, { bevel: false })
      drawBox(ctx, top, WORLD.bush, { bevel: false })
      if (item.berries) {
        ctx.save()
        faceTransform(ctx, 'left', body.W1)
        fillRects(ctx, berryRects(item.size).map((r) => ({ ...r, w: 2, h: 2 })), '#c9633a')
        ctx.restore()
      }
      return
    }
    case 'reed':
      for (const b of reedBoxes(item)) drawBox(ctx, b.geo, b.palette, { bevel: false })
      return
    default:
      return
  }
}

/** Ein Deko-Teil über dem Boden: still als Bild, bewegt mit seiner Dauer-Animation. */
export function decorDrawer(item: DecorItem, part: DecorPart): Drawer {
  const bounds = decorParts(item).find((p) => p.part === part)!.bounds
  if (part === 'still') {
    const pic: Picture = { bounds, draw: (ctx) => drawStillDecor(ctx, item) }
    return (f) => drawPicture(f, pic)
  }
  switch (item.kind) {
    case 'tree': {
      const { crown } = treeGeometry(item)
      const pic: Picture = {
        bounds,
        draw: (ctx) => crown.forEach((g, n) => drawBox(ctx, g, item.pine ? WORLD.leafDark : WORLD.leaf, { texture: `tree-${item.x.toFixed(2)}-${n}`, bevel: false })),
      }
      // Wiegen um die Unterkante der Krone (wie `origin="50% 100%"`).
      const box = unite(...crown.map((g) => boxBounds(g, 0)))
      const origin = { x: (box.x0 + box.x1) / 2, y: box.y1 }
      const sway = loop(DECOR_LOOPS.crown(item.size))
      return (f) => withLoop(f, sway.at(loopClock(f)), origin, () => drawPicture(f, pic))
    }
    case 'lily': {
      const { pad, bloom } = lilyParts(item)
      const pic: Picture = {
        bounds,
        draw(ctx) {
          fillPoly(ctx, pad, WORLD.lily)
          ctx.fillStyle = '#f3d4cd'
          ctx.fillRect(bloom.x, bloom.y, bloom.w, bloom.h)
        },
      }
      const bob = loop(DECOR_LOOPS.lily)
      return (f) => withLoop(f, bob.at(loopClock(f)), undefined, () => drawPicture(f, pic))
    }
    case 'butterfly': {
      const p = project(item.x, item.y, 18)
      const flutter = loop(DECOR_LOOPS.flutter(item.x, item.y))
      const wings = loop(DECOR_LOOPS.wings)
      // Flügelschlag um die Mitte von Flügeln und Körper.
      const origin = { x: 0, y: -0.5 }
      return (f) => {
        const { ctx } = f
        const t = loopClock(f)
        ctx.save()
        ctx.translate(p.x, p.y)
        withLoop(f, flutter.at(t), undefined, () =>
          withLoop(f, wings.at(t), origin, () => {
            ctx.lineWidth = 0.5
            for (const w of BUTTERFLY.wings) {
              ctx.fillStyle = item.color
              ctx.fillRect(w.x, w.y, w.w, w.h)
              ctx.strokeStyle = '#00000030'
              ctx.strokeRect(w.x, w.y, w.w, w.h)
            }
            const b = BUTTERFLY.body
            ctx.fillStyle = WORLD.ink
            ctx.fillRect(b.x, b.y, b.w, b.h)
          }),
        )
        ctx.restore()
      }
    }
    case 'frog': {
      const { foot, body, eyeL, eyeR } = frogBoxes(item)
      const pic: Picture = {
        bounds,
        draw(ctx) {
          for (const g of [foot, body]) drawBox(ctx, g, WORLD.frog, { bevel: false })
          for (const g of [eyeR, eyeL]) drawBox(ctx, g, WORLD.eye, { bevel: false })
          ctx.fillStyle = WORLD.ink
          const onFace = (o: Pt, r: { x: number; y: number; w: number; h: number }, alpha = 1) => {
            ctx.save()
            faceTransform(ctx, 'left', o)
            withAlpha(ctx, alpha, () => ctx.fillRect(r.x, r.y, r.w, r.h))
            ctx.restore()
          }
          onFace(eyeL.W1, { x: 1.5, y: 1.5, w: 3, h: 3 })
          onFace(eyeR.W1, { x: 1.5, y: 1.5, w: 3, h: 3 })
          // Mund auf der Vorderseite
          onFace(body.W1, { x: 4, y: 7, w: 9, h: 1.5 }, 0.6)
        },
      }
      const hop = loop(DECOR_LOOPS.frog)
      return (f) => withLoop(f, hop.at(loopClock(f)), undefined, () => drawPicture(f, pic))
    }
    default:
      return () => {}
  }
}
