import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import type { BlockVM, FocusSession, TowerVM } from '@/domain/types'
import { plainTitle } from '@/features/editor/blockDraft'
import { streakLabel } from '@/features/home/StreakPanel'
import { BlockThumb } from '@/features/world/BlockThumb'
import { PixelButton } from '@/ui/PixelButton'
import { PixelIcon } from '@/ui/PixelIcon'
import { FLAME, SKIP, TROPHY } from '@/ui/sprites'
import { ChainStrip } from './ChainStrip'
import { CheckAction } from './CheckAction'
import { TimerAction } from './TimerAction'

/** Fällt morgen ab, wenn er heute übersprungen wird (letzter Tag vor dem Abfallen). */
const fallsIfSkipped = (b: BlockVM) => b.fallIn === 1

interface FocusSheetProps {
  tower: TowerVM
  session: FocusSession
  now: number
  onComplete: () => void
  onSkip: () => void
  onStartTimer: () => void
  onPauseTimer: () => void
  onClose: () => void
}

/** Unterer Bereich des Fokus-Modus: führt Schritt für Schritt durch die Kette. */
export function FocusSheet(props: FocusSheetProps) {
  const { session } = props
  const completed = session.state === 'completed'
  const step = session.steps[session.activeIndex]

  return (
    <section className="px-3 pb-[calc(var(--safe-bottom)+12px)]" aria-label="Fokus-Modus">
      <div className="px-frame px-tab relative z-0 -mb-[3px] inline-block px-3.5 pt-1.5 pb-2 text-[15px] leading-none font-semibold text-paper">
        Fokus-Modus
      </div>
      <div className="px-frame relative z-10 overflow-hidden p-4">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={completed ? 'summary' : (step?.habitId ?? 'none')}
            initial={{ opacity: 0, x: 28 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -28 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
          >
            {completed ? <Summary {...props} /> : <ActiveStep {...props} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}

function ActiveStep({ tower, session, now, onComplete, onSkip, onStartTimer, onPauseTimer }: FocusSheetProps) {
  const step = session.steps[session.activeIndex]
  const block = tower.blocks.find((b) => b.id === step?.habitId)
  if (!step || !block) return null

  return (
    <div className="flex min-h-[244px] flex-col">
      <div className="flex items-start gap-3">
        <BlockThumb color={block.color} size={52} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] leading-none font-bold tracking-wide text-ink-soft uppercase">Jetzt aktiv:</p>
          <h2 className="mt-1.5 text-[24px] leading-tight font-semibold">{plainTitle(block.title)}</h2>
          {block.visual === 'forming' &&
            (block.wobbling ? (
              <p className="mt-0.5 text-[14px] font-semibold text-brick">Gestern verpasst – heute retten!</p>
            ) : (
              <p className="mt-0.5 text-[14px] text-ink-soft">
                Verfestigung: Tag {block.stones} von {block.formationTarget}
              </p>
            ))}
          {fallsIfSkipped(block) ? (
            <p className="mt-0.5 text-[14px] font-semibold text-brick">Bröckelt – überspringen heißt: fällt morgen ab.</p>
          ) : (
            block.visual === 'crumbling' && <p className="mt-0.5 text-[14px] font-semibold text-brick">Bröckelt – heute retten!</p>
          )}
          {block.visual === 'solid' && (block.skips ?? 0) > 0 && (
            <p className="mt-0.5 text-[14px] text-ink-soft">Zuletzt nicht erledigt – fehlt er heute wieder, bröckelt er.</p>
          )}
        </div>
        <span className="font-micro text-[12px] leading-none text-ink-soft" aria-label={`Block ${session.activeIndex + 1} von ${session.steps.length}`}>
          {session.activeIndex + 1}/{session.steps.length}
        </span>
      </div>

      <div className="mt-4">
        {step.timer ? (
          <TimerAction timer={step.timer} now={now} onStart={onStartTimer} onPause={onPauseTimer} onDone={onComplete} />
        ) : (
          <CheckAction onDone={onComplete} />
        )}
      </div>

      <div className="mt-auto flex items-end justify-between gap-3 pt-4">
        <ChainStrip tower={tower} steps={session.steps} />
        <SkipButton confirm={fallsIfSkipped(block)} onSkip={onSkip} />
      </div>
    </div>
  )
}

/** Überspringen; zweistufig, wenn der Block dann morgen abfällt. */
function SkipButton({ confirm, onSkip }: { confirm: boolean; onSkip: () => void }) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!armed) return
    const id = window.setTimeout(() => setArmed(false), 3000)
    return () => window.clearTimeout(id)
  }, [armed])

  return (
    <button
      type="button"
      onClick={() => (confirm && !armed ? setArmed(true) : onSkip())}
      className={`flex shrink-0 cursor-pointer items-center gap-1.5 py-1 text-[14px] ${armed ? 'font-semibold text-brick' : 'text-ink-soft hover:text-ink'}`}
    >
      <PixelIcon sprite={SKIP} px={1.5} colors={{ X: 'currentColor' }} />
      {armed ? 'Fällt ab – trotzdem?' : 'Überspringen'}
    </button>
  )
}

function Summary({ tower, session, onClose }: FocusSheetProps) {
  const done = session.steps.filter((s) => s.status === 'done').length
  const total = session.steps.length
  const skippedBlocks = session.steps.filter((s) => s.status === 'skipped').flatMap((s) => tower.blocks.find((b) => b.id === s.habitId) ?? [])
  const skipped = skippedBlocks.map((b) => plainTitle(b.title))
  // Übersprungen und schon am Limit: fällt morgen ab.
  const falling = skippedBlocks.filter(fallsIfSkipped).map((b) => plainTitle(b.title))
  const title = done === total ? 'Routine gestapelt!' : done > 0 ? 'Teilweise gestapelt' : 'Heute ausgesetzt'

  return (
    <div className="flex min-h-[244px] flex-col items-center text-center">
      {done === total && <PixelIcon sprite={TROPHY} px={4} />}
      <h2 className="mt-3 text-[26px] leading-none font-bold">{title}</h2>
      <p className="mt-2 text-[15px] text-ink-soft">
        {done} von {total} Blöcken erledigt
      </p>
      {falling.length > 0 ? (
        <p className="text-[14px] font-semibold text-brick">
          {falling.length === 1 ? 'Fällt' : 'Fallen'} morgen ab: {falling.join(', ')}
        </p>
      ) : (
        skipped.length > 0 && <p className="text-[14px] text-ink-soft">Übersprungen: {skipped.join(', ')}</p>
      )}
      <div className="mt-3">
        <ChainStrip tower={tower} steps={session.steps} />
      </div>
      <p className="mt-2 flex items-center gap-2 text-[17px] font-semibold">
        {streakLabel(tower.streak)}
        {tower.streak > 0 && <PixelIcon sprite={FLAME} px={2} />}
      </p>
      <PixelButton variant="go" onClick={onClose} className="mt-auto h-12 w-full text-[17px] font-semibold text-paper">
        Zurück zur Insel
      </PixelButton>
    </div>
  )
}
