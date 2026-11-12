import { motion, useReducedMotionConfig, type TargetAndTransition } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Cloud } from '@/features/world/Clouds'
import { IsoBox } from '@/features/world/IsoBox'
import { boxGeometry } from '@/features/world/iso'
import { BLOCK_PALETTE } from '@/features/world/palette'
import { sfx } from '@/store/sfx'

/** title: Name im Himmel · gather: Wolken ziehen auf · part: Wolken reißen auf, die Insel erscheint. */
type Phase = 'title' | 'gather' | 'part'

/** Wolken um die Bildmitte (px) mit Richtung, in die sie beim Aufreißen davonfliegen. */
const CLOUDS = [
  { x: 10, y: -300, s: 1.6, dx: 0.2, dy: -1 },
  { x: -150, y: -200, s: 1.9, dx: -1, dy: -0.7 },
  { x: 140, y: -160, s: 2.2, dx: 1, dy: -0.5 },
  { x: -120, y: -30, s: 2.5, dx: -1, dy: 0 },
  { x: 130, y: 40, s: 2.1, dx: 1, dy: 0.15 },
  { x: -40, y: 150, s: 2.4, dx: -0.3, dy: 1 },
  { x: 150, y: 210, s: 1.8, dx: 1, dy: 0.8 },
  { x: -165, y: 260, s: 1.7, dx: -1, dy: 0.9 },
]

const GATHER_AT = 1000
const COVERED_AT = 1700
const PART_MS = 1150

function cloudTarget(c: (typeof CLOUDS)[number], phase: Phase): TargetAndTransition {
  switch (phase) {
    case 'title':
      return { x: c.x + c.dx * 130, y: c.y + c.dy * 110, scale: 1, opacity: 1, transition: { duration: 0.9, ease: 'easeOut' } }
    case 'gather':
      return { x: c.x, y: c.y, scale: 1.05, opacity: 1, transition: { duration: 0.7, ease: 'easeInOut' } }
    case 'part':
      return {
        x: c.x + c.dx * 560,
        y: c.y + c.dy * 560,
        scale: 2.3,
        opacity: [1, 1, 0],
        transition: { duration: 1, ease: 'easeIn', opacity: { duration: 1, times: [0, 0.7, 1] } },
      }
  }
}

// Der Name verschwindet hinter den Wolken, bevor sie ganz zu sind – nie über der Insel.
const TITLE: Record<Phase, TargetAndTransition> = {
  title: { scale: 1, opacity: 1, transition: { type: 'spring', stiffness: 260, damping: 18 } },
  gather: { scale: 1.1, opacity: 0, transition: { duration: 0.55, delay: 0.1, ease: 'easeIn' } },
  part: { scale: 1.1, opacity: 0, transition: { duration: 0.3 } },
}

/** Wolkennebel zwischen den Wolken: deckt beim Zuziehen alles ab und lichtet sich beim Aufreißen. */
const FOG: Record<Phase, TargetAndTransition> = {
  title: { opacity: 0 },
  gather: { opacity: 1, transition: { duration: 0.55, delay: 0.15, ease: 'easeIn' } },
  part: { opacity: 0, transition: { duration: 0.8, delay: 0.1, ease: 'easeOut' } },
}

interface SplashProps {
  /** Daten geladen – vorher bleiben die Wolken zu. */
  ready: boolean
  /** Wolken sind zu: jetzt darf die Insel darunter aufgebaut werden. */
  onReveal: () => void
  onDone: () => void
}

/**
 * Startbild bei jedem App-Start: Name im Himmel, Wolken ziehen auf und reißen wieder auf –
 * darunter fallen die Türme auf die Insel. Antippen überspringt. Dient zugleich als Ladebildschirm.
 */
export function Splash({ ready, onReveal, onDone }: SplashProps) {
  // Folgt „Bewegung reduzieren“ des Geräts (über MotionConfig).
  const reduce = useReducedMotionConfig()
  const [phase, setPhase] = useState<Phase>('title')
  const [covered, setCovered] = useState(false)

  useEffect(() => {
    if (reduce) {
      const t = window.setTimeout(() => setCovered(true), 900)
      return () => window.clearTimeout(t)
    }
    const t1 = window.setTimeout(() => setPhase('gather'), GATHER_AT)
    const t2 = window.setTimeout(() => setCovered(true), COVERED_AT)
    return () => {
      window.clearTimeout(t1)
      window.clearTimeout(t2)
    }
  }, [reduce])

  useEffect(() => {
    if (!covered || !ready) return
    setPhase('part')
    if (!reduce) sfx('whoosh')
    onReveal()
    const t = window.setTimeout(onDone, reduce ? 450 : PART_MS)
    return () => window.clearTimeout(t)
  }, [covered, ready, reduce, onReveal, onDone])

  const parting = phase === 'part'

  return (
    <div className={`absolute inset-0 z-50 overflow-hidden ${parting ? 'pointer-events-none' : 'cursor-pointer'}`} onClick={() => setCovered(true)}>
      {/* Himmel: blendet unter dem Nebel aus (sichtbar nur beim Überspringen oder mit wenig Bewegung). */}
      <motion.div
        className="absolute inset-0 bg-[linear-gradient(to_bottom,#c3d6dd,#dfe8dc_70%,var(--color-haze))]"
        initial={false}
        animate={{ opacity: parting ? 0 : 1 }}
        transition={{ duration: 0.4 }}
      />

      <motion.div className="absolute inset-0 flex flex-col items-center justify-center gap-4" initial={{ scale: 0.85, opacity: 0 }} animate={reduce && parting ? { opacity: 0 } : TITLE[phase]}>
        <Logo />
        <h1 className="text-center text-[clamp(44px,15vw,62px)] leading-[0.95] font-bold tracking-[0.02em] uppercase drop-shadow-[3px_3px_0_rgba(47,56,51,0.18)]">
          Habit
          <br />
          Stacks
        </h1>
      </motion.div>

      {!reduce && <motion.div className="absolute inset-0 bg-[#f4f6f0]" initial={FOG.title} animate={FOG[phase]} />}

      {!reduce &&
        CLOUDS.map((c, i) => (
          <motion.div
            key={i}
            className="absolute top-1/2 left-1/2"
            initial={{ x: c.x + c.dx * 260, y: c.y + c.dy * 220, opacity: 0 }}
            animate={cloudTarget(c, phase)}
          >
            <div className="-translate-x-1/2 -translate-y-1/2">
              <Cloud scale={c.s} />
            </div>
          </motion.div>
        ))}

      <p className="sr-only" role="status">
        {ready ? 'Habit Stacks' : 'Insel wird geladen …'}
      </p>
    </div>
  )
}

/** Mini-Turm als Logo: Anker, ein verfestigter Block, ein Geist obendrauf. */
function Logo() {
  const blocks = [
    { half: 1.5, z: 0, h: 54, color: 'slate' as const },
    { half: 1.36, z: 54, h: 40, color: 'sky' as const },
    { half: 1.22, z: 94, h: 40, color: 'mustard' as const },
  ]
  return (
    <svg viewBox="-80 -172 160 214" width={96} height={128} aria-hidden>
      {blocks.map((b, i) => (
        <IsoBox key={i} geo={boxGeometry(0, 0, b.half, b.z, b.h)} palette={BLOCK_PALETTE[b.color]} textureSeed={`logo-${i}`} />
      ))}
    </svg>
  )
}
