import { memo } from 'react'
import { Loop, type LoopSpec } from '@/ui/Loop'
import { SKY_LAYERS, SKY_STOPS } from './altitude'
import { BoxPaths } from './IsoBox'
import { boxGeometry, project, toPoints } from './iso'
import { horizonOf, perIsland, type Island } from './island'
import { rectPath } from './paint'
import { WORLD } from './palette'
import { seededRandom } from './random'

/** Wie weit Himmel, Wolken und Vögel links und rechts über die Insel hinausreichen (px). */
const MARGIN = 1100
/** Ab hier ist der Himmel Nacht; darüber bleibt die letzte Farbe. */
const NIGHT_ALT = SKY_STOPS.at(-1)!.alt
/** Funkelnde Sterne funkeln in drei Gruppen statt jeder für sich. */
export const TWINKLE_DELAYS = [0, 0.9, 1.8]
/** Funkeln einer Sterngruppe. */
export const twinkle = (delay: number): LoopSpec => ({ values: { opacity: [0.3, 1, 0.3] }, duration: 2.6, delay })

/** Horizontale Ausdehnung der Insel in Bildschirm-Weltpixeln. */
function spanOf(island: Island) {
  const left = Math.min(...island.tiles.map((t) => project(t.i, t.j + 1).x)) - MARGIN
  const right = Math.max(...island.tiles.map((t) => project(t.i + 1, t.j).x)) + MARGIN
  return { left, right, width: right - left }
}

/** Himmelsverlauf: von der Horizont-y nach oben bis zur Nacht (Weltkoordinaten), Farbstopps 0–1. */
export const skyFade = perIsland((island) => {
  const horizon = horizonOf(island)
  const horizonAlt = -horizon
  const stops = [
    { offset: 0, color: SKY_STOPS[0]!.color },
    ...SKY_STOPS.filter((s) => s.alt > horizonAlt).map((s) => ({ offset: (s.alt - horizonAlt) / (NIGHT_ALT - horizonAlt), color: s.color })),
  ]
  return { y0: horizon, y1: -NIGHT_ALT, stops }
})

/** Sterne (je Helligkeit und Funkelgruppe ein Pfad) und Mond. */
export const skyStars = perIsland((island) => {
  const { left, width } = spanOf(island)
  const rand = seededRandom(`stars-${island.tiles.length}`)
  const { from, to } = SKY_LAYERS.stars
  const stars = Array.from({ length: Math.round(width / 14) }, () => {
    // Nach oben hin dichter: Wurzel verschiebt die Verteilung in die Höhe.
    const alt = from + Math.sqrt(rand()) * (to - from)
    return {
      x: left + rand() * width,
      y: -alt,
      size: rand() < 0.15 ? 3 : 2,
      // Blenden über 400 px sanft ein – in der Dämmerung nur ein Hauch.
      opacity: Math.min(0.9, (alt - from) / 400),
      twinkle: rand() < 0.08,
      group: Math.floor(rand() * TWINKLE_DELAYS.length),
    }
  })
  // Sterne gleicher Helligkeit (auf 0,05 gerundet) teilen sich einen Pfad: ~20 statt ~250 Elemente.
  const paths = new Map<string, { group: number | null; opacity: number; d: string[] }>()
  for (const s of stars) {
    const opacity = Math.round(s.opacity * 20) / 20
    if (opacity <= 0) continue
    const group = s.twinkle ? s.group : null
    const key = `${group}|${opacity}`
    const path = paths.get(key) ?? { group, opacity, d: [] }
    path.d.push(rectPath(s.x, s.y, s.size, s.size))
    paths.set(key, path)
  }
  return { stars: [...paths.values()].map((p) => ({ ...p, d: p.d.join('') })), moon: { x: left + width / 2 - 260, y: -SKY_LAYERS.moon } }
})

/** Mond: Scheibe, Rand und drei Krater (relativ zur Mondmitte). */
export const MOON = { r: 30, fill: '#f1ecd8', rim: '#d6cfb4', crater: '#dcd5bb', craters: [{ x: -9, y: -7, r: 6 }, { x: 10, y: 8, r: 4 }, { x: 6, y: -14, r: 2.5 }] }

/**
 * Hinterster Teil der Welt: Himmelsverlauf nach Höhe (Dunst am Horizont → Nachtblau), Sterne und Mond.
 * Liegt fest in Weltkoordinaten – Startseite und Fokus-Modus sehen denselben Himmel.
 */
export const SkyBackdrop = memo(function SkyBackdrop({ island }: { island: Island }) {
  const horizon = horizonOf(island)
  const { stars, moon } = skyStars(island)
  const fade = skyFade(island)

  return (
    <g pointerEvents="none" aria-hidden>
      <defs>
        <linearGradient id="sky-fade" gradientUnits="userSpaceOnUse" x1={0} y1={fade.y0} x2={0} y2={fade.y1}>
          {fade.stops.map((s) => (
            <stop key={s.offset} offset={s.offset} stopColor={s.color} />
          ))}
        </linearGradient>
      </defs>
      <rect x={-20000} y={-20000} width={40000} height={20000 + horizon + 1} fill="url(#sky-fade)" />
      <g fill="#f5f1dc" shapeRendering="crispEdges">
        {stars.map((s) => s.group === null && <path key={s.opacity} d={s.d} fillOpacity={s.opacity} />)}
        {TWINKLE_DELAYS.map((delay, g) => (
          <Loop key={`t${g}`} loop={twinkle(delay)}>
            {stars.map((s) => s.group === g && <path key={s.opacity} d={s.d} fillOpacity={s.opacity} />)}
          </Loop>
        ))}
      </g>
      <g transform={`translate(${moon.x} ${moon.y})`}>
        <circle r={MOON.r} fill={MOON.fill} />
        <circle r={MOON.r} fill="none" stroke={MOON.rim} strokeWidth={3} />
        {MOON.craters.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={c.r} fill={MOON.crater} />
        ))}
      </g>
    </g>
  )
})

/** Endlose Drift von links nach rechts über `span` px: Phase 0–1, eine Runde in `duration` s. */
export const drift = (span: number, duration: number, phase: number): LoopSpec => ({
  values: { x: [0, span] },
  duration,
  ease: 'linear',
  delay: -phase * duration,
})

/** Flügelschlag eines Vogels: aus dem V wird kurz ein Λ. */
export const flap = (duration: number, k: number): LoopSpec => ({ values: { scaleY: [1, -0.6, 1] }, duration, delay: -k * 0.17 })
/** Ein Vogel als V (Drehpunkt für den Flügelschlag: unten Mitte = Ursprung). */
export const BIRD = [
  { x: -6, y: 0 },
  { x: -3, y: -3 },
  { x: 0, y: 0 },
  { x: 3, y: -3 },
  { x: 6, y: 0 },
]

/** Wolkenschicht und Vogelschwärme: Startpunkt links, Strecke und Bewegung. */
export const skyLife = perIsland((island) => {
  const { left, width } = spanOf(island)
  const rand = seededRandom(`sky-${island.tiles.length}`)
  const count = Math.max(8, Math.round(width / 260))
  const clouds = Array.from({ length: count }, (_, i) => {
    const scale = 0.8 + rand() * 0.9
    return {
      // Gleichmäßig verteilt, leicht verwürfelt – sonst klumpen sie.
      phase: (i + rand() * 0.6) / count,
      alt: SKY_LAYERS.clouds.from + rand() * (SKY_LAYERS.clouds.to - SKY_LAYERS.clouds.from),
      scale,
      // Große Wolken ziehen langsamer (wirken ferner): 4–8 px/s.
      speed: 8 - scale * 2.4 + rand(),
      opacity: 0.85 + rand() * 0.15,
      parts: [boxGeometry(-0.9 * scale, 0.7 * scale, 0.6 * scale, 0, 9 * scale), boxGeometry(0, 0, 0.95 * scale, 0, 13 * scale), boxGeometry(0.9 * scale, -0.4 * scale, 0.75 * scale, 0, 18 * scale)],
    }
  }).sort((a, b) => a.scale - b.scale)
  const flocks = Array.from({ length: 3 }, (_, i) => ({
    phase: i / 3 + rand() * 0.2,
    alt: SKY_LAYERS.birds.from + rand() * (SKY_LAYERS.birds.to - SKY_LAYERS.birds.from),
    speed: 26 + rand() * 12,
    birds: Array.from({ length: 2 + Math.floor(rand() * 3) }, (_, k) => ({ dx: -k * 15 - rand() * 6, dy: (k % 2 ? 1 : -1) * k * 5, flap: 0.5 + rand() * 0.25 })),
  }))
  return { left, width, clouds, flocks }
})

/**
 * Leben im Himmel: eine Wolkenschicht, die auf fester Höhe langsam von links nach rechts zieht,
 * und darunter Vogelschwärme. Liegt hinter Insel und Türmen.
 */
export const SkyLife = memo(function SkyLife({ island }: { island: Island }) {
  const { left, width, clouds, flocks } = skyLife(island)

  return (
    <g pointerEvents="none" aria-hidden>
      {clouds.map((c, i) => (
        <g key={`c${i}`} transform={`translate(${left} ${-c.alt})`} opacity={c.opacity}>
          <Loop loop={drift(width, width / c.speed, c.phase)}>
            <BoxPaths geos={c.parts} palette={WORLD.cloud} />
          </Loop>
        </g>
      ))}
      {flocks.map((f, i) => (
        <g key={`f${i}`} transform={`translate(${left} ${-f.alt})`}>
          <Loop loop={drift(width, width / f.speed, f.phase)}>
            {f.birds.map((b, k) => (
              <g key={k} transform={`translate(${b.dx} ${b.dy})`}>
                {/* Flügelschlag: aus dem V wird kurz ein Λ */}
                <Loop loop={flap(b.flap, k)} origin="50% 100%">
                  <polyline points={toPoints(BIRD)} fill="none" stroke={WORLD.ink} strokeOpacity={0.75} strokeWidth={1.8} strokeLinejoin="round" />
                </Loop>
              </g>
            ))}
          </Loop>
        </g>
      ))}
    </g>
  )
})
