import { useEffect, useRef, useState, type ReactNode } from 'react'
import { create } from 'zustand'
import { cameraMoving } from './cameraMoving'
import { MAX_ZOOM } from './camera'

/**
 * Stiller Teil der Welt (Insel, unbewegte Deko) als Bild: einmal im Leerlauf gerastert, danach ein paar `<image>`-Kacheln
 * statt hunderter SVG-Flächen. Eine Kamerafahrt skaliert dann nur noch ein Bild. Bis das Bild fertig ist – und falls
 * das Rastern scheitert –, steht der Inhalt wie bisher als SVG da. Was in den Inhalt darf, entscheidet `IsoWorld`
 * (`liftAbove`): nichts, was sich bewegt oder Bewegtes überdeckt.
 */

/** Höchstens so viele Bildpunkte insgesamt (~32 MB entpackt). Große Inseln werden dafür etwas gröber als nötig. */
const MAX_PIXELS = 8e6
/** Je Kachel höchstens so viele Bildpunkte bzw. Pixel Kantenlänge: kurze Rechenpausen, sicher für jede Grafikkarte. */
const TILE_PIXELS = 4e6
const MAX_SIDE = 4096
/** Nachbarkacheln überlappen um 2 Weltpixel – sonst bleibt bei krummen Zoomstufen eine helle Naht. */
const OVERLAP = 2
/** Erst nach dem Intro (fallende Blöcke) rastern (ms). */
const START_DELAY = 2500

/** Dev-Schalter zum Vergleichen auf dem Gerät: aus = alles bleibt SVG. Nur im Speicher. */
export const useGroundImage = create<{ on: boolean }>(() => ({ on: true }))

interface GroundTile {
  url: string
  x: number
  y: number
  w: number
  h: number
}

interface Baked {
  key: string
  tiles: GroundTile[]
}

const done = new Map<string, Baked>()
const jobs = new Map<string, Promise<Baked | null>>()
const failed = new Set<string>()
/** Eingehängte StaticGrounds je Schlüssel – deren Bilder bleiben beim Aufräumen. */
const users = new Map<string, number>()

/**
 * Inhalt, der sich nie bewegt; `bakeKey` muss ihn eindeutig beschreiben (gleicher Schlüssel = gleiches Bild).
 * Startseite und Fokus-Modus teilen sich so dasselbe Bild.
 */
export function StaticGround({ bakeKey, children }: { bakeKey: string; children: ReactNode }) {
  const ref = useRef<SVGGElement>(null)
  const enabled = useGroundImage((s) => s.on)
  const [ready, setReady] = useState<Baked | null>(null)
  const [loaded, setLoaded] = useState<ReadonlySet<string>>(() => new Set())
  const [broken, setBroken] = useState<string | null>(null)
  const baked = enabled && broken !== bakeKey ? (ready?.key === bakeKey ? ready : (done.get(bakeKey) ?? null)) : null
  // Schon einmal gezeigt (z. B. auf der Startseite, jetzt im Fokus-Modus): gleich als Bild.
  const [settled, setSettled] = useState<string | null>(() => (baked ? bakeKey : null))

  useEffect(() => {
    if (!enabled) return
    users.set(bakeKey, (users.get(bakeKey) ?? 0) + 1)
    let alive = true
    void bake(bakeKey, () => ref.current).then((b) => {
      if (alive && b) setReady(b)
    })
    return () => {
      alive = false
      users.set(bakeKey, (users.get(bakeKey) ?? 1) - 1)
    }
  }, [bakeKey, enabled])

  // Das SVG verschwindet erst, wenn alle Kacheln geladen und ein paar Frames gezeichnet sind – sonst blitzt der Boden leer.
  const allLoaded = !!baked && baked.tiles.every((t) => loaded.has(t.url))
  useEffect(() => {
    if (!baked || !allLoaded || settled === baked.key) return
    let raf = 0
    const timer = window.setTimeout(() => {
      raf = requestAnimationFrame(() => {
        raf = requestAnimationFrame(() => setSettled(baked.key))
      })
    }, 250)
    return () => {
      window.clearTimeout(timer)
      cancelAnimationFrame(raf)
    }
  }, [baked, allLoaded, settled])

  const vector = !baked || settled !== baked.key
  return (
    <g pointerEvents="none">
      {baked?.tiles.map((t) => (
        <image
          key={t.url}
          href={t.url}
          x={t.x}
          y={t.y}
          width={t.w}
          height={t.h}
          preserveAspectRatio="none"
          onLoad={() => setLoaded((s) => new Set(s).add(t.url))}
          onError={() => setBroken(bakeKey)}
        />
      ))}
      {vector && <g ref={ref}>{children}</g>}
    </g>
  )
}

// ───────────────────────────── Rastern ─────────────────────────────

function bake(key: string, source: () => SVGGElement | null): Promise<Baked | null> {
  const hit = done.get(key)
  if (hit) return Promise.resolve(hit)
  if (failed.has(key)) return Promise.resolve(null)
  let job = jobs.get(key)
  if (!job) {
    job = render(key, source)
      .then((b) => {
        if (b) {
          done.set(key, b)
          prune()
        }
        return b
      })
      .catch((err: unknown) => {
        failed.add(key)
        console.warn('Hintergrundbild nicht möglich, die Insel bleibt SVG:', err)
        return null
      })
      .finally(() => jobs.delete(key))
    jobs.set(key, job)
  }
  return job
}

/** Höchstens drei Bilder behalten (z. B. vor und nach einem neuen Turm); was gerade zu sehen ist, bleibt. */
function prune() {
  for (const [key, b] of done) {
    if (done.size <= 3) return
    if (users.get(key)) continue
    b.tiles.forEach((t) => URL.revokeObjectURL(t.url))
    done.delete(key)
  }
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))
/** Safari kennt kein requestIdleCallback. */
const idle = () =>
  new Promise<void>((resolve) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(() => resolve(), { timeout: 1000 }) : setTimeout(resolve, 50)))

/** Wartet auf eine ruhige Pause: Hauptthread frei, keine Kamerafahrt. */
async function calm(ms = 0) {
  await sleep(ms)
  await idle()
  while (cameraMoving()) {
    await sleep(200)
    await idle()
  }
}

/**
 * Rastert den Inhalt von `source` in Kacheln. Auflösung: so scharf, wie der stärkste Zoom auf diesem Gerät braucht,
 * höchstens `MAX_PIXELS`. Alle Kacheln liegen auf demselben Pixelraster, damit die Überlappung nahtlos ist.
 */
async function render(key: string, source: () => SVGGElement | null): Promise<Baked | null> {
  await calm(START_DELAY)
  const el = source()
  if (!el?.isConnected) return null
  const box = el.getBBox()
  if (!box.width || !box.height) return null
  // Kanten und Kantenglättung ragen über die Füllflächen hinaus.
  const x0 = Math.floor(box.x) - 4
  const y0 = Math.floor(box.y) - 4
  const w = Math.ceil(box.width) + 8
  const h = Math.ceil(box.height) + 8
  const dpr = Math.min(3, window.devicePixelRatio || 1)
  const s = Math.min(dpr * MAX_ZOOM, Math.sqrt(MAX_PIXELS / (w * h)), MAX_SIDE / h)
  const pw = Math.ceil(w * s)
  const ph = Math.ceil(h * s)
  const overlap = Math.ceil(OVERLAP * s)
  const step = Math.max(256, Math.min(MAX_SIDE - overlap, Math.floor(TILE_PIXELS / ph)))
  const markup = new XMLSerializer().serializeToString(el)

  const tiles: GroundTile[] = []
  try {
    for (let c = 0; c < pw; c += step) {
      if (c > 0) await calm()
      tiles.push(await rasterize(markup, x0 + c / s, y0, Math.min(pw - c, step + overlap), ph, s))
    }
    // Vorab dekodieren, damit das erste Zeichnen nicht auf das Bild warten muss.
    await Promise.all(tiles.map((t) => loadImage(t.url).then((img) => img.decode?.().catch(() => {}))))
  } catch (err) {
    tiles.forEach((t) => URL.revokeObjectURL(t.url))
    throw err
  }
  return { key, tiles }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`Bild lädt nicht: ${src}`))
    img.src = src
  })
}

/** Eine Kachel: Weltausschnitt ab (x, y), pw × ph Bildpunkte bei `s` Bildpunkten je Weltpixel → PNG. */
async function rasterize(markup: string, x: number, y: number, pw: number, ph: number, s: number): Promise<GroundTile> {
  const w = pw / s
  const h = ph / s
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pw}" height="${ph}" viewBox="${x} ${y} ${w} ${h}">${markup}</svg>`
  const src = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
  const canvas = document.createElement('canvas')
  try {
    const img = await loadImage(src)
    canvas.width = pw
    canvas.height = ph
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Kein Canvas')
    ctx.drawImage(img, 0, 0, pw, ph)
    // Safari zeichnet ein frisch geladenes SVG manchmal erst beim zweiten Versuch.
    if (blank(canvas)) {
      await sleep(150)
      ctx.drawImage(img, 0, 0, pw, ph)
      if (blank(canvas)) throw new Error('Kachel bleibt leer')
    }
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!png) throw new Error('Kein PNG')
    return { url: URL.createObjectURL(png), x, y, w, h }
  } finally {
    URL.revokeObjectURL(src)
    // Speicher sofort freigeben (Safari begrenzt Canvas-Speicher).
    canvas.width = 0
    canvas.height = 0
  }
}

/** Ganz durchsichtig? Jede Kachel enthält ein Stück Insel, leer heißt: nicht gezeichnet. */
function blank(canvas: HTMLCanvasElement) {
  const probe = document.createElement('canvas')
  probe.width = 32
  probe.height = 32
  const ctx = probe.getContext('2d')
  if (!ctx) return true
  ctx.drawImage(canvas, 0, 0, 32, 32)
  const { data } = ctx.getImageData(0, 0, 32, 32)
  for (let i = 3; i < data.length; i += 4) if (data[i]) return false
  return true
}
