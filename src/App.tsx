import { AnimatePresence, MotionConfig } from 'framer-motion'
import { useCallback, useEffect, useState } from 'react'
import { FocusMode } from '@/features/focus/FocusMode'
import { HomeScreen } from '@/features/home/HomeScreen'
import { Splash } from '@/features/splash/Splash'
import { useAmbience, useAudioWake } from '@/hooks/useAmbience'
import { useToday } from '@/hooks/useToday'
import { useAppStore } from '@/store/useAppStore'
import { AppShell } from '@/ui/AppShell'
import { PauseLoops } from '@/ui/Loop'

/** splash: nur das Startbild · reveal: Insel baut sich hinter den Wolken auf · done: Startbild weg. */
type Intro = 'splash' | 'reveal' | 'done'

export default function App() {
  const focus = useAppStore((s) => s.focus)
  const hydrated = useAppStore((s) => s.ui.hydrated)
  const evaluate = useAppStore((s) => s.evaluate)
  const sound = useAppStore((s) => s.settings.sound)
  const ambience = useAppStore((s) => s.settings.ambience)
  const today = useToday()
  const [intro, setIntro] = useState<Intro>('splash')
  const reveal = useCallback(() => setIntro('reveal'), [])
  const finishIntro = useCallback(() => setIntro('done'), [])

  useAudioWake(hydrated && (sound || ambience))
  useAmbience(hydrated && ambience)

  // Tageswechsel bei offener App (oder Zeitreise im Dev-Build) → abgeschlossene Tage auswerten.
  useEffect(() => {
    if (hydrated) evaluate(today)
  }, [hydrated, today, evaluate])

  return (
    // Bewegung folgt immer „Bewegung reduzieren“ des Geräts.
    <MotionConfig reducedMotion="user">
      <AppShell>
        {/* Die Insel entsteht erst, wenn die Wolken zu sind – so fallen die Türme sichtbar beim Aufreißen. */}
        {hydrated && intro !== 'splash' && (
          <>
            {/* Unter dem Fokus-Modus ist die Startseite verdeckt – ihre Dauer-Animationen stehen so lange still. */}
            <PauseLoops paused={focus !== null}>
              <HomeScreen introDone={intro === 'done'} />
            </PauseLoops>
            {/* Fokus-Modus liegt als Overlay über dem Home-Screen; die Session kommt als Prop,
                damit die Ausblend-Animation nach closeFocus() noch Daten hat. */}
            <AnimatePresence>{focus && <FocusMode key={focus.id} session={focus} />}</AnimatePresence>
          </>
        )}
        {intro !== 'done' && <Splash ready={hydrated} onReveal={reveal} onDone={finishIntro} />}
      </AppShell>
    </MotionConfig>
  )
}
