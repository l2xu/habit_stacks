import type { Rect } from '../worldLayout'
import type { Ctx, Frame } from './runtime'

/**
 * Zwischengespeicherte Bilder: Alles, was sich selbst nicht verändert (Insel, Blöcke, Wolken, Deko …), wird einmal in
 * Kacheln gezeichnet und danach nur noch kopiert – egal wie viele Flächen und Beschriftungen darin stecken.
 *
 * Schärfe: In Ruhe (Kamera steht, keine Bewegung) wird ein Bild genau im aktuellen Maßstab und auf das Pixelraster
 * gezeichnet und 1:1 kopiert – so scharf wie direkt gezeichnet. Während einer Kamerafahrt oder in Bewegung reicht ein
 * ähnlicher Maßstab; skaliert wird es dabei kurz weich (wie zuvor beim SVG mit „Kamera als Transform“).
 * Nachgezeichnet wird nur mit dem Zeitbudget des Frames; ohne Budget zeichnet ein Bild direkt (immer korrekt).
 */

export interface Picture {
  /** Umriss in Weltkoordinaten, inklusive Kanten. */
  bounds: Rect
  /** Zeichnet in Weltkoordinaten; `s` = Bildpunkte je Weltpixel (z. B. für Muster). */
  draw: (ctx: Ctx, s: number) => void
  /** Enthält Schrift: nach dem Laden der Schriften neu zeichnen. */
  text?: boolean
}

/** Kantenlänge einer Kachel (Bildpunkte). */
const TILE = 1024
/** Höchstens so viele Bildpunkte bleiben gespeichert (~80 MB), ältere zuerst raus. */
const MAX_PIXELS = 20e6
/** Was so lange nicht gezeichnet wurde, fliegt raus (ms). */
const KEEP_MS = 8000
/** Zeitbudget je Frame fürs Nachzeichnen (ms). */
export const FRAME_BUDGET = 4

interface Entry {
  pic: Picture
  /** Bildpunkte je Weltpixel. */
  s: number
  /** Lage des Bildursprungs innerhalb des ersten Bildpunkts (pixelgenaues Kopieren). */
  fx: number
  fy: number
  cols: number
  rows: number
  w: number
  h: number
  tiles: (HTMLCanvasElement | null)[]
  gen: number
  used: number
}

const byPicture = new WeakMap<Picture, Entry[]>()
const all = new Set<Entry>()
let pixels = 0
/** Steigt, sobald die Schriften geladen sind – Bilder mit Schrift sind dann veraltet. */
let fontGen = 0
let lastSweep = 0

let fontsReady: Promise<void> | null = null

/** Schriften einmal laden; danach Bilder mit Schrift neu zeichnen (`onReady` auch, wenn sie schon da sind). */
export function watchFonts(onReady: () => void) {
  if (!('fonts' in document)) return
  fontsReady ??= Promise.all([document.fonts.load(`500 10px 'Geist Pixel'`), document.fonts.load(`8px 'Silkscreen'`)]).then(
    () => void fontGen++,
    () => {},
  )
  void fontsReady.then(onReady)
}

/** Stufen für Maßstäbe in Bewegung (je ~19 %): Bilder werden nicht bei jeder Zoomstufe neu gezeichnet. */
const bucket = (s: number) => 2 ** (Math.ceil(Math.log2(s) * 4 - 1e-6) / 4)
const frac = (v: number) => v - Math.floor(v)

/** Bild an der aktuellen Transformation zeichnen (`alpha` = Deckkraft des ganzen Bilds). */
export function drawPicture(f: Frame, pic: Picture, alpha = 1) {
  if (alpha <= 0.001) return
  const { ctx } = f
  const m = ctx.getTransform()
  const b = pic.bounds
  const axis = Math.abs(m.b) < 1e-9 && Math.abs(m.c) < 1e-9 && m.a > 0 && Math.abs(m.a - m.d) < 1e-9
  const s = axis ? m.a : Math.sqrt(Math.abs(m.a * m.d - m.b * m.c))
  if (!(s > 0)) return
  const X = m.a * b.x0 + m.c * b.y0 + m.e
  const Y = m.b * b.x0 + m.d * b.y0 + m.f
  // Ganz außerhalb der Zeichenfläche: nichts zu tun.
  if (axis && (X > ctx.canvas.width || Y > ctx.canvas.height || X + (b.x1 - b.x0) * s < 0 || Y + (b.y1 - b.y0) * s < 0)) return

  const crisp = axis && f.settled && f.motion === 0
  const want = crisp ? { s, fx: frac(X), fy: frac(Y) } : { s: bucket(s), fx: 0, fy: 0 }
  const list = (byPicture.get(pic) ?? []).filter((e) => !pic.text || e.gen === fontGen)
  // Schrift soll aufs Pixelraster; Flächen ohne Schrift nicht neu zeichnen, nur weil die Kamera ein Stück verschoben
  // wurde (Wischen in der Übersicht) – ein halber Bildpunkt Versatz ist dort nicht zu sehen.
  const sameScale = (e: Entry) => Math.abs(e.s - s) < s * 1e-4
  const onGrid = (e: Entry) => Math.abs(e.fx - want.fx) < 0.02 && Math.abs(e.fy - want.fy) < 0.02
  const exact = list.find((e) => (crisp ? sameScale(e) && (onGrid(e) || !pic.text) : e.s === want.s))
  // Ersatz, solange das gewünschte Bild fehlt: ähnlicher Maßstab (nicht viel gröber, nicht viel feiner).
  const near = list
    .filter((e) => e !== exact && e.s >= s / 1.3 && e.s <= s * 2.5)
    .sort((p, q) => Math.abs(Math.log(p.s / s)) - Math.abs(Math.log(q.s / s)))[0]
  // In Bewegung genügt der Ersatz; in Ruhe wird mit Budget scharf nachgezeichnet.
  let main = exact ?? (crisp ? undefined : near)
  const fallback = main === near ? undefined : near

  const before = ctx.globalAlpha
  ctx.globalAlpha = before * alpha
  try {
    if (!main) {
      if (f.budget <= 0) {
        if (fallback) blit(f, fallback, m, X, Y, false)
        // Nichts gespeichert und kein Budget: direkt zeichnen – kostet nur diesen Frame, sieht genauso aus.
        else pic.draw(ctx, s)
        return
      }
      main = createEntry(pic, want.s, want.fx, want.fy, fallback)
    }
    // Fehlende Kacheln: mit Budget nachzeichnen; ohne Ersatz sofort alle, damit nie eine Lücke bleibt.
    renderVisible(f, main, m, X, Y, !fallback)
    if (fallback && !complete(f, main, m, X, Y)) blit(f, fallback, m, X, Y, false)
    blit(f, main, m, X, Y, crisp && main === exact && onGrid(main))
  } finally {
    ctx.globalAlpha = before
  }
}

function createEntry(pic: Picture, s: number, fx: number, fy: number, keep?: Entry): Entry {
  const b = pic.bounds
  const w = Math.max(1, Math.ceil((b.x1 - b.x0) * s + fx))
  const h = Math.max(1, Math.ceil((b.y1 - b.y0) * s + fy))
  const cols = Math.ceil(w / TILE)
  const rows = Math.ceil(h / TILE)
  const entry: Entry = { pic, s, fx, fy, cols, rows, w, h, tiles: Array.from({ length: cols * rows }, () => null), gen: fontGen, used: 0 }
  const list = byPicture.get(pic) ?? []
  // Pro Bild höchstens zwei Maßstäbe (z. B. Übersicht und Detail); der Ersatz für dieses Frame bleibt.
  for (const old of list.filter((e) => e !== keep).sort((a, c) => a.used - c.used)) {
    if (list.length < 2) break
    drop(old)
  }
  list.push(entry)
  byPicture.set(pic, list)
  all.add(entry)
  return entry
}

/** Bildpunkt-Rechteck einer Kachel relativ zum Bildursprung. */
const tileRect = (e: Entry, i: number) => {
  const col = i % e.cols
  const row = Math.floor(i / e.cols)
  return { x: col * TILE, y: row * TILE, w: Math.min(TILE, e.w - col * TILE), h: Math.min(TILE, e.h - row * TILE) }
}

/** Liegt die Kachel (ungefähr) auf der Zeichenfläche? Nur bei achsparalleler Transformation prüfbar. */
function visible(ctx: Ctx, e: Entry, i: number, m: DOMMatrix, X: number, Y: number) {
  const axis = Math.abs(m.b) < 1e-9 && Math.abs(m.c) < 1e-9
  if (!axis) return true
  const r = tileRect(e, i)
  const k = m.a / e.s
  const x0 = X - e.fx * k + r.x * k
  const y0 = Y - e.fy * k + r.y * k
  const pad = 64
  return x0 < ctx.canvas.width + pad && y0 < ctx.canvas.height + pad && x0 + r.w * k > -pad && y0 + r.h * k > -pad
}

function complete(f: Frame, e: Entry, m: DOMMatrix, X: number, Y: number) {
  return e.tiles.every((t, i) => t || !visible(f.ctx, e, i, m, X, Y))
}

/** Sichtbare Kacheln zeichnen: mit Budget, `force` = alle (es gibt nichts, was die Lücke deckt). */
function renderVisible(f: Frame, e: Entry, m: DOMMatrix, X: number, Y: number, force: boolean) {
  for (let i = 0; i < e.tiles.length; i++) {
    if (e.tiles[i] || !visible(f.ctx, e, i, m, X, Y)) continue
    if (f.budget <= 0 && !force) return
    const t0 = performance.now()
    e.tiles[i] = renderTile(e, i)
    f.budget -= performance.now() - t0
  }
}

function renderTile(e: Entry, i: number): HTMLCanvasElement {
  const r = tileRect(e, i)
  const canvas = document.createElement('canvas')
  canvas.width = r.w
  canvas.height = r.h
  const g = canvas.getContext('2d')!
  const b = e.pic.bounds
  g.setTransform(e.s, 0, 0, e.s, e.fx - r.x - b.x0 * e.s, e.fy - r.y - b.y0 * e.s)
  g.miterLimit = 4
  e.pic.draw(g, e.s)
  pixels += r.w * r.h
  return canvas
}

/** Kacheln kopieren: pixelgenau (in Ruhe, gleicher Maßstab) oder transformiert. */
function blit(f: Frame, e: Entry, m: DOMMatrix, X: number, Y: number, crisp: boolean) {
  const { ctx } = f
  e.used = f.t
  ctx.save()
  if (crisp) {
    ctx.setTransform(1, 0, 0, 1, Math.floor(X), Math.floor(Y))
  } else {
    const b = e.pic.bounds
    ctx.transform(1 / e.s, 0, 0, 1 / e.s, b.x0 - e.fx / e.s, b.y0 - e.fy / e.s)
  }
  e.tiles.forEach((tile, i) => {
    if (!tile || !visible(ctx, e, i, m, X, Y)) return
    const r = tileRect(e, i)
    ctx.drawImage(tile, r.x, r.y)
  })
  ctx.restore()
}

function drop(e: Entry) {
  for (const t of e.tiles) {
    if (!t) continue
    pixels -= t.width * t.height
    // Speicher sofort freigeben (Safari begrenzt Canvas-Speicher).
    t.width = 0
    t.height = 0
  }
  e.tiles = []
  all.delete(e)
  const list = byPicture.get(e.pic)
  if (list) {
    const k = list.indexOf(e)
    if (k >= 0) list.splice(k, 1)
  }
}

/** Aufräumen: Lange Ungenutztes und, über der Obergrenze, das am längsten Ungenutzte zuerst. */
export function sweepPictures(now: number) {
  // Zeitstempel der Kacheln sind Frame-Zeiten (wie `now`).
  if (now - lastSweep < 1000) return
  lastSweep = now
  for (const e of all) if (now - e.used > KEEP_MS || (e.pic.text && e.gen !== fontGen)) drop(e)
  if (pixels <= MAX_PIXELS) return
  const old = [...all].filter((e) => e.used < now).sort((a, b) => a.used - b.used)
  for (const e of old) {
    if (pixels <= MAX_PIXELS) break
    drop(e)
  }
}

/** Bilder je Schlüssel – z. B. ein Block je Zustand. Ungenutzte verschwinden beim Aufräumen der Kacheln mit. */
export function pictureCache<K>() {
  const map = new Map<K, { pic: Picture; used: number }>()
  return (key: K, make: () => Picture): Picture => {
    const now = performance.now()
    let hit = map.get(key)
    if (!hit) {
      hit = { pic: make(), used: now }
      map.set(key, hit)
      if (map.size > 400) for (const [k, v] of map) if (now - v.used > KEEP_MS) map.delete(k)
    }
    hit.used = now
    return hit.pic
  }
}
