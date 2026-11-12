import { useReducedMotionConfig } from 'framer-motion'
import { createContext, useContext, useLayoutEffect, useMemo, useRef, type ReactNode, type SVGProps } from 'react'

/**
 * Dauer-Animationen (Wellen, Bäume, Geister, Wolken …) als Web Animation: dieselbe Maschine wie CSS, kein
 * JavaScript pro Frame (Framer Motion schreibt SVG-Transforms in jedem Frame per JavaScript).
 * Bei reduzierter Bewegung steht alles still, unter `PauseLoops` friert es ein.
 */

type Prop = 'x' | 'y' | 'rotate' | 'skewX' | 'scaleX' | 'scaleY' | 'opacity' | 'strokeDashoffset'

export interface LoopSpec {
  /** Werte je Eigenschaft wie bei Framer Motion, z. B. `{ opacity: [0, 1, 0] }` – alle Listen gleich lang. */
  values: Partial<Record<Prop, number[]>>
  /** Dauer eines Durchlaufs (s). */
  duration: number
  /** Zeitpunkte der Werte (0–1); ohne = gleichmäßig verteilt. */
  times?: number[]
  /** Pro Abschnitt zwischen zwei Werten, wie bei Framer Motion (Standard: easeInOut). */
  ease?: 'linear' | 'easeIn' | 'easeOut' | 'easeInOut'
  /** Pause nach jedem Durchlauf (s); der letzte Wert bleibt so lange stehen. */
  repeatDelay?: number
  /** Phasenversatz (s); negativ = schon unterwegs. */
  delay?: number
}

const CSS_EASE = { linear: 'linear', easeIn: 'ease-in', easeOut: 'ease-out', easeInOut: 'ease-in-out' } as const

function keyframesOf({ values, duration, times, ease = 'easeInOut', repeatDelay = 0 }: LoopSpec): Keyframe[] {
  const n = Object.values(values)[0]!.length
  const span = duration / (duration + repeatDelay)
  const frames = Array.from({ length: n }, (_, i): Keyframe => {
    const at = (p: Prop) => values[p]?.[i]
    const transform = [
      values.x || values.y ? `translate(${at('x') ?? 0}px, ${at('y') ?? 0}px)` : '',
      values.rotate ? `rotate(${at('rotate')}deg)` : '',
      values.skewX ? `skewX(${at('skewX')}deg)` : '',
      values.scaleX || values.scaleY ? `scale(${at('scaleX') ?? 1}, ${at('scaleY') ?? 1})` : '',
    ].join(' ')
    const frame: Keyframe = { offset: (times?.[i] ?? i / (n - 1)) * span, easing: CSS_EASE[ease] }
    if (transform.trim()) frame.transform = transform.trim()
    if (values.opacity) frame.opacity = at('opacity')
    if (values.strokeDashoffset) frame.strokeDashoffset = `${at('strokeDashoffset')}`
    return frame
  })
  return repeatDelay > 0 ? [...frames, { ...frames.at(-1)!, offset: 1 }] : frames
}

/** Startzeit auf der Dokument-Zeitachse (ms) – der Phasenversatz. */
const startOf = (spec: LoopSpec) => (spec.delay ?? 0) * 1000

const Paused = createContext(false)

/** Stehen die Loops hier still (`PauseLoops`)? Die Canvas-Welt hält dann ihre ganze Zeichenschleife an. */
export const useLoopsPaused = () => useContext(Paused)

/** Friert alle Loops darunter ein, z. B. solange ein Turm ausgeblendet oder die Welt verdeckt ist. */
export function PauseLoops({ paused, children }: { paused: boolean; children: ReactNode }) {
  const outer = useContext(Paused)
  return <Paused.Provider value={outer || paused}>{children}</Paused.Provider>
}

/** Dauer-Animation an einem Element; `null` = keine. Das Element muss beim ersten Rendern schon da sein. */
export function useLoop<T extends Element>(spec: LoopSpec | null) {
  const ref = useRef<T>(null)
  const anim = useRef<Animation | null>(null)
  const paused = useContext(Paused)
  const still = useReducedMotionConfig() ?? false
  // Specs entstehen meist inline – nach Inhalt vergleichen, nicht nach Identität.
  const key = spec && JSON.stringify(spec)
  const stable = useMemo(() => spec, [key])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || !stable) return
    const duration = (stable.duration + (stable.repeatDelay ?? 0)) * 1000
    const a = el.animate(keyframesOf(stable), { duration, iterations: Infinity })
    if (still) {
      a.pause()
      a.currentTime = ((-startOf(stable) % duration) + duration) % duration
    }
    anim.current = a
    return () => {
      a.cancel()
      anim.current = null
    }
  }, [stable, still])

  // Pausieren hält nur an, statt die Animation neu zu bauen (passiert oft mitten in einer Kamerafahrt).
  useLayoutEffect(() => {
    const a = anim.current
    if (!a || !stable || still) return
    // Phase auf der Dokument-Zeitachse: Nach einer Pause läuft der Loop dort weiter, wo er ohne Pause wäre.
    a.startTime = startOf(stable)
    if (paused) a.pause()
  }, [stable, paused, still])

  return ref
}

interface LoopProps extends SVGProps<SVGGElement> {
  loop: LoopSpec | null
  /** Drehpunkt für rotate/skew/scale relativ zum eigenen Umriss (Standard: Mitte, wie Framer Motion). */
  origin?: string
}

/**
 * `<g>` mit Dauer-Animation. Kein `transform`-Attribut daraufsetzen – die Animation überschreibt es;
 * stattdessen verschachteln: `<g transform=…><Loop …>`.
 */
export function Loop({ loop, origin = '50% 50%', style, ...rest }: LoopProps) {
  const ref = useLoop<SVGGElement>(loop)
  return <g {...rest} ref={ref} style={{ transformBox: 'fill-box', transformOrigin: origin, ...style }} />
}
