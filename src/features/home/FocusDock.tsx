import type { TowerVM } from '@/domain/types'
import { pausedLabel } from '@/features/news/news'
import { streakTitle } from '@/features/streak/streak'
import { useToday } from '@/hooks/useToday'
import { PixelButton } from '@/ui/PixelButton'
import { PixelIcon } from '@/ui/PixelIcon'
import { ARROW, CHECK, FLAME, LOCK, PLAY } from '@/ui/sprites'

interface FocusDockProps {
  tower: TowerVM
  onStart: () => void
  /** Pausierter Turm: „Fortsetzen“ statt „Start“. */
  onResume: () => void
  /** Streak antippen: Overlay mit dem ganzen Verlauf, dort lassen sich Tage nachtragen. */
  onStreak: () => void
}

/**
 * Leiste am unteren Rand der Detailansicht: links der Streak (öffnet den Verlauf), rechts „Start“ für den
 * Fokus-Modus. Pausiert steht dort „Fortsetzen“, ist heute schon alles erledigt, ein Häkchen.
 */
export function FocusDock({ tower, onStart, onResume, onStreak }: FocusDockProps) {
  const today = useToday()
  const title = streakTitle(tower.streak)

  return (
    <section className="flex h-(--dock-h) flex-col justify-end px-3 pb-[calc(var(--safe-bottom)+12px)]" aria-label={tower.name}>
      <div className="px-frame pointer-events-auto flex items-center gap-2 py-2 pr-2 pl-1">
        <button
          type="button"
          onClick={onStreak}
          aria-haspopup="dialog"
          aria-label={`${title} – Verlauf ansehen und Tage nachtragen`}
          className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-2.5 px-2.5 text-left outline-none focus-visible:outline-3 focus-visible:outline-focus active:translate-y-px"
        >
          {tower.pausedSince ? (
            // Pausiert: Neben „Fortsetzen“ ist wenig Platz – oben das Schloss, der Streak klein darunter.
            <>
              <PixelIcon sprite={LOCK} px={2.5} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[19px] leading-tight font-semibold">Pausiert</span>
                <span className="block truncate text-[13px] leading-tight text-ink-soft" title={pausedLabel(tower.pausedSince, today)}>
                  {title}
                </span>
              </span>
            </>
          ) : (
            <>
              <PixelIcon sprite={FLAME} px={2.5} className={`shrink-0 ${tower.streak === 0 ? 'opacity-35 grayscale' : ''}`} />
              <span className="min-w-0 flex-1 truncate text-[19px] leading-tight font-semibold">{title}</span>
              <PixelIcon sprite={ARROW} px={1.5} className="shrink-0 opacity-60" />
            </>
          )}
        </button>

        {tower.pausedSince ? (
          <PixelButton variant="go" onClick={onResume} className="h-12 shrink-0 gap-2 px-3.5 text-[17px] font-semibold text-paper">
            <PixelIcon sprite={PLAY} px={2} />
            Fortsetzen
          </PixelButton>
        ) : tower.nextBlock ? (
          <PixelButton variant="go" onClick={onStart} className="h-12 shrink-0 gap-2 px-4 text-[17px] font-semibold text-paper">
            <PixelIcon sprite={PLAY} px={2} />
            Start
          </PixelButton>
        ) : (
          <span className="px-frame px-moss flex h-12 shrink-0 items-center gap-2 px-4 text-[16px] font-semibold">
            <PixelIcon sprite={CHECK} px={2} />
            Erledigt
          </span>
        )}
      </div>
    </section>
  )
}
