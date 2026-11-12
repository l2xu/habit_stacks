import { timerElapsedSec } from '@/domain/focus'
import type { TimerState } from '@/domain/types'
import { useLoop } from '@/ui/Loop'
import { PixelButton } from '@/ui/PixelButton'
import { PixelIcon } from '@/ui/PixelIcon'
import { CHECK, PAUSE, PLAY } from '@/ui/sprites'

const SEGMENTS = 20

const fmt = (sec: number) => {
  const s = Math.ceil(sec)
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

interface TimerActionProps {
  timer: TimerState
  now: number
  onStart: () => void
  onPause: () => void
  onDone: () => void
}

/** Pixel-Timer: Restzeit, segmentierter Balken, Start/Pause und Abschließen. */
export function TimerAction({ timer, now, onStart, onPause, onDone }: TimerActionProps) {
  const elapsed = timerElapsedSec(timer, now)
  const remaining = Math.max(0, timer.durationSec - elapsed)
  const progress = Math.min(1, elapsed / timer.durationSec)
  const running = timer.runningSince !== null
  const up = elapsed >= timer.durationSec
  const filled = Math.floor(progress * SEGMENTS)

  return (
    <div>
      <div className="flex items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="font-micro text-[40px] leading-none tracking-tight" role="timer" aria-live="off">
            {fmt(remaining)}
          </div>
          <div
            className="mt-2.5 flex gap-[3px]"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress * 100)}
            aria-label="Timer-Fortschritt"
          >
            {Array.from({ length: SEGMENTS }, (_, i) => (
              <Segment key={i} state={i < filled ? 'filled' : i === filled && running ? 'filling' : 'empty'} />
            ))}
          </div>
        </div>
        {up ? (
          <PixelButton variant="go" onClick={onDone} className="h-14 w-38 shrink-0 gap-2 text-[17px] font-semibold text-paper">
            <PixelIcon sprite={CHECK} px={2} colors={{ X: '#f4f2e8' }} />
            Abschließen
          </PixelButton>
        ) : running ? (
          <PixelButton onClick={onPause} className="h-14 w-38 shrink-0 gap-2 text-[17px] font-semibold">
            <PixelIcon sprite={PAUSE} px={2} />
            Pause
          </PixelButton>
        ) : (
          <PixelButton variant="go" onClick={onStart} className="h-14 w-38 shrink-0 gap-2 text-[17px] font-semibold text-paper">
            <PixelIcon sprite={PLAY} px={2} />
            {elapsed > 0 ? 'Weiter' : 'Start'}
          </PixelButton>
        )}
      </div>
      <div className="mt-3 min-h-5 text-[14px] text-ink-soft">
        {up ? (
          'Zeit um – stark gemacht!'
        ) : (
          <button type="button" onClick={onDone} className="cursor-pointer underline decoration-2 underline-offset-4 hover:text-ink">
            {elapsed > 0 ? 'Jetzt abschließen' : 'Ohne Timer abhaken'}
          </button>
        )}
      </div>
    </div>
  )
}

const SEGMENT_BG = { filled: 'bg-moss', filling: 'bg-moss/50', empty: 'bg-haze' } as const
const PULSE = { values: { opacity: [1, 0.5, 1] }, duration: 2 }

/** Ein Balken-Segment; das gerade laufende pulsiert. */
function Segment({ state }: { state: keyof typeof SEGMENT_BG }) {
  const ref = useLoop<HTMLSpanElement>(state === 'filling' ? PULSE : null)
  return <span ref={ref} className={`h-3 flex-1 border-[1.5px] border-ink/60 ${SEGMENT_BG[state]}`} />
}
